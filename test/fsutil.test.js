'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { renderTemplate, stripTmplExt, copyFile } = require('../lib/fsutil');

test('renderTemplate', () => {
  const template = 'Hello {{PROJECT_NAME}}!';
  const result = renderTemplate(template, { PROJECT_NAME: 'Antigravity' });
  assert.strictEqual(result, 'Hello Antigravity!');
});

test('stripTmplExt', () => {
  assert.strictEqual(stripTmplExt('test.tmpl'), 'test');
  assert.strictEqual(stripTmplExt('test.js'), 'test.js');
});

test('copyFile rendering', () => {
  const tmpDir = path.join(__dirname, 'tmp-test-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const src = path.join(tmpDir, 'source.tmpl');
  const dest = path.join(tmpDir, 'dest.txt');

  fs.writeFileSync(src, 'Project: {{PROJECT_NAME}}');

  try {
    const res = copyFile(src, dest, { PROJECT_NAME: 'CreateAgentRoom' });
    assert.strictEqual(res.written, true);
    assert.strictEqual(fs.existsSync(dest), true);
    assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'Project: CreateAgentRoom');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
