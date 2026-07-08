'use strict';

const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function renderTemplate(content, vars) {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
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
  fs.writeFileSync(dest, content);
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

module.exports = { ensureDir, renderTemplate, stripTmplExt, copyFile, copyDir };
