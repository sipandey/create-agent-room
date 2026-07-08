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
  if (fs.existsSync(dest) && !force) {
    return { written: false, reason: 'exists' };
  }
  ensureDir(path.dirname(dest));
  const content = renderTemplate(fs.readFileSync(src, 'utf8'), vars);
  const exists = fs.existsSync(dest);
  fs.writeFileSync(dest, content);
  if (!exists && opts && typeof opts.onWrite === 'function') {
    opts.onWrite(dest);
  }
  return { written: true };
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

module.exports = { ensureDir, renderTemplate, stripTmplExt, copyFile, copyDir, resolveTemplateSource };
