'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function renderTemplate(content, vars) {
  return content.replace(/\{\{([\w-]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

function resolveTemplateSource(customPath) {
  if (customPath) {
    const resolved = path.resolve(customPath);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
    throw new Error(`Error: Specified template source directory does not exist or is not a directory: ${customPath}`);
  }

  // 1. Check local directory .agent-room-templates/
  const localTemplates = path.resolve('.agent-room-templates');
  if (fs.existsSync(localTemplates) && fs.statSync(localTemplates).isDirectory()) {
    return localTemplates;
  }

  // 2. Check home directory ~/.agent-room-templates/
  const homeTemplates = path.join(os.homedir(), '.agent-room-templates');
  if (fs.existsSync(homeTemplates) && fs.statSync(homeTemplates).isDirectory()) {
    return homeTemplates;
  }

  // 3. Fallback to default internal package templates directory
  return path.join(__dirname, '..', 'templates');
}

function stripTmplExt(name) {
  return name.endsWith('.tmpl') ? name.slice(0, -'.tmpl'.length) : name;
}

function copyFile(src, dest, vars, opts) {
  const force = !!(opts && opts.force);
  const dryRun = !!(opts && opts.dryRun);
  if (fs.existsSync(dest) && !force) {
    return { written: false, reason: 'exists' };
  }
  const content = renderTemplate(fs.readFileSync(src, 'utf8'), vars);
  const exists = fs.existsSync(dest);
  if (!dryRun) {
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, content);
  }
  if (!exists && opts && typeof opts.onWrite === 'function') {
    opts.onWrite(dest);
  }
  return { written: true, size: Buffer.byteLength(content, 'utf8') };
}

function copyDir(srcDir, destDir, vars, opts) {
  const root = (opts && opts.root) || destDir;
  const results = [];
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, stripTmplExt(entry.name));
    if (entry.isDirectory()) {
      results.push(...copyDir(srcPath, destPath, vars, opts));
    } else {
      const res = copyFile(srcPath, destPath, vars, opts);
      results.push(Object.assign({ path: path.relative(root, destPath) }, res));
    }
  }
  return results;
}

function getLayers(R, language, pm, org) {
  if (!fs.existsSync(R) || !fs.statSync(R).isDirectory()) return [];

  // A directory is considered structured if it has a 'base' subdirectory,
  // or a 'stacks'/'org' subdirectory alongside root-level template files
  // (the packaged templates/ layout: files live at R itself, with
  // stacks/<lang> and org/<name> providing overrides).
  const baseDir = path.join(R, 'base');
  const hasBaseDir = fs.existsSync(baseDir) && fs.statSync(baseDir).isDirectory();
  const stacksDir = path.join(R, 'stacks');
  const hasStacksDir = fs.existsSync(stacksDir) && fs.statSync(stacksDir).isDirectory();
  const orgDir = path.join(R, 'org');
  const hasOrgDir = fs.existsSync(orgDir) && fs.statSync(orgDir).isDirectory();
  const isStructured = hasBaseDir || hasStacksDir || hasOrgDir;

  if (!isStructured) {
    return [R];
  }

  const layers = [];
  layers.push(hasBaseDir ? baseDir : R);

  if (language) {
    const langLower = language.toLowerCase();
    if (pm) {
      const pmLower = pm.toLowerCase();
      const langPmPath = path.join(R, 'stacks', `${langLower}-${pmLower}`);
      if (fs.existsSync(langPmPath) && fs.statSync(langPmPath).isDirectory()) {
        layers.push(langPmPath);
      }
    }
    const langPath = path.join(R, 'stacks', langLower);
    if (fs.existsSync(langPath) && fs.statSync(langPath).isDirectory()) {
      layers.push(langPath);
    }
  }

  if (org) {
    const orgSpecificPath = path.join(R, 'org', org);
    if (fs.existsSync(orgSpecificPath) && fs.statSync(orgSpecificPath).isDirectory()) {
      layers.push(orgSpecificPath);
    }
  } else {
    const orgPath = path.join(R, 'org');
    if (fs.existsSync(orgPath) && fs.statSync(orgPath).isDirectory()) {
      layers.push(orgPath);
    }
  }

  return layers;
}

function resolveTemplateSources(target, args, language, pm) {
  const srcDirs = [];
  const org = args.org || null;

  // 1. Package templates (lowest priority)
  const pkgTemplates = path.join(__dirname, '..', 'templates');
  srcDirs.push(...getLayers(pkgTemplates, language, pm, org));

  // 2. Global templates (~/.agent-room-templates)
  const homeTemplates = path.join(os.homedir(), '.agent-room-templates');
  srcDirs.push(...getLayers(homeTemplates, language, pm, org));

  // 3. Local/Custom templates (highest priority)
  const localTemplates = args['template-source']
    ? path.resolve(args['template-source'])
    : path.resolve(target, '.agent-room-templates');
  srcDirs.push(...getLayers(localTemplates, language, pm, org));

  // De-duplicate directories to avoid redundant reads/scans
  const uniqueDirs = [];
  for (const d of srcDirs) {
    if (!uniqueDirs.includes(d) && fs.existsSync(d) && fs.statSync(d).isDirectory()) {
      uniqueDirs.push(d);
    }
  }
  return uniqueDirs;
}

function copyFileInherited(srcDirs, relativePath, dest, vars, opts) {
  for (let i = srcDirs.length - 1; i >= 0; i--) {
    const srcPath = path.join(srcDirs[i], relativePath);
    if (fs.existsSync(srcPath) && !fs.statSync(srcPath).isDirectory()) {
      return copyFile(srcPath, dest, vars, opts);
    }
  }
  throw new Error(`Error: Template file not found in any source: ${relativePath}`);
}

function getRelativeFiles(dir, baseDir = dir) {
  const files = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getRelativeFiles(fullPath, baseDir));
    } else {
      files.push(path.relative(baseDir, fullPath));
    }
  }
  return files;
}

// opts.exclude: array of exact relative-path strings or RegExps, matched
// against each file's path relative to relativeSubdir (with backslashes
// normalized to /). Matching files are skipped entirely — not copied, and
// no result entry is produced for them, as if they were never scaffolded.
function isExcluded(relFile, exclude) {
  if (!exclude || exclude.length === 0) return false;
  const normalized = relFile.replace(/\\/g, '/');
  return exclude.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(normalized) : pattern === normalized
  );
}

function copyDirInherited(srcDirs, relativeSubdir, destDir, vars, opts) {
  const uniqueRelativeFiles = new Set();
  for (const srcDir of srcDirs) {
    const targetDir = path.join(srcDir, relativeSubdir);
    const files = getRelativeFiles(targetDir);
    for (const f of files) {
      uniqueRelativeFiles.add(f);
    }
  }

  const results = [];
  const root = (opts && opts.root) || destDir;
  const exclude = opts && opts.exclude;

  for (const relFile of uniqueRelativeFiles) {
    if (isExcluded(relFile, exclude)) continue;

    let foundSrcPath = null;
    for (let i = srcDirs.length - 1; i >= 0; i--) {
      const p = path.join(srcDirs[i], relativeSubdir, relFile);
      if (fs.existsSync(p) && !fs.statSync(p).isDirectory()) {
        foundSrcPath = p;
        break;
      }
    }

    if (foundSrcPath) {
      const destRelPath = stripTmplExt(relFile);
      const destPath = path.join(destDir, destRelPath);
      const res = copyFile(foundSrcPath, destPath, vars, opts);
      results.push(Object.assign({ path: path.relative(root, destPath) }, res));
    }
  }

  return results;
}

module.exports = {
  ensureDir,
  renderTemplate,
  stripTmplExt,
  copyFile,
  copyDir,
  resolveTemplateSource,
  getLayers,
  resolveTemplateSources,
  copyFileInherited,
  copyDirInherited
};
