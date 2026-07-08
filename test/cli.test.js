'use strict';

const test = require('node:test');
const assert = require('node:assert');

// We will temporarily define the parser here to test it, or we can load it from bin/cli.js if exported.
// Since cli.js is run as an executable, we can extract/export parseArgs or test it via child process,
// or we can export parseArgs from cli.js by adding module.exports at the end when running in test env.
// Let's modify cli.js to export parseArgs if module.parent or require.main !== module.
// In Node >= 18, we can check if require.main === module.

const { parseArgs } = require('../bin/cli.js');

test('parseArgs: parses simple options', () => {
  const result = parseArgs(['--yes', '--git', '--force']);
  assert.strictEqual(result.yes, true);
  assert.strictEqual(result.git, true);
  assert.strictEqual(result.force, true);
});

test('parseArgs: parses tools and name options', () => {
  const result = parseArgs(['--tools', 'claude,cursor', '--name', 'MyProj']);
  assert.strictEqual(result.tools, 'claude,cursor');
  assert.strictEqual(result.name, 'MyProj');
});

test('parseArgs: parses tools and name options with equals', () => {
  const result = parseArgs(['--tools=claude', '--name=Test']);
  assert.strictEqual(result.tools, 'claude');
  assert.strictEqual(result.name, 'Test');
});

test('parseArgs: throws error on missing arguments', () => {
  assert.throws(() => parseArgs(['--tools']), /Error: --tools option requires/);
  assert.throws(() => parseArgs(['--name']), /Error: --name option requires/);
});

test('parseArgs: throws error on unknown options', () => {
  assert.throws(() => parseArgs(['--unknown-flag']), /Error: Unknown option/);
});
