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

test('parseArgs: parses custom scaffolding options', () => {
  const result = parseArgs([
    '--template-source', '/path/to/tmpl',
    '--package-manager', 'pnpm',
    '--language', 'typescript',
    '--branch', 'main',
    '--skill-packs', 'testing,security'
  ]);
  assert.strictEqual(result['template-source'], '/path/to/tmpl');
  assert.strictEqual(result['package-manager'], 'pnpm');
  assert.strictEqual(result.language, 'typescript');
  assert.strictEqual(result.branch, 'main');
  assert.strictEqual(result['skill-packs'], 'testing,security');
});

test('parseArgs: parses custom options with equals', () => {
  const result = parseArgs([
    '--template-source=/path/to/tmpl2',
    '--package-manager=yarn',
    '--language=python',
    '--branch=master',
    '--skill-packs=release'
  ]);
  assert.strictEqual(result['template-source'], '/path/to/tmpl2');
  assert.strictEqual(result['package-manager'], 'yarn');
  assert.strictEqual(result.language, 'python');
  assert.strictEqual(result.branch, 'master');
  assert.strictEqual(result['skill-packs'], 'release');
});

test('parseArgs: throws error on missing custom arguments', () => {
  assert.throws(() => parseArgs(['--template-source']), /Error: --template-source option requires/);
  assert.throws(() => parseArgs(['--package-manager']), /Error: --package-manager option requires/);
  assert.throws(() => parseArgs(['--language']), /Error: --language option requires/);
  assert.throws(() => parseArgs(['--branch']), /Error: --branch option requires/);
  assert.throws(() => parseArgs(['--skill-packs']), /Error: --skill-packs option requires/);
});

test('parseArgs: parses check flag', () => {
  const result1 = parseArgs(['--check']);
  assert.strictEqual(result1.check, true);

  const result2 = parseArgs(['-c']);
  assert.strictEqual(result2.check, true);
});

test('parseArgs: parses verbose flag', () => {
  const result = parseArgs(['--verbose']);
  assert.strictEqual(result.verbose, true);
});

test('parseArgs: parses --dry-run flag', () => {
  const result = parseArgs(['--dry-run']);
  assert.strictEqual(result['dry-run'], true);
});

test('parseArgs: parses --profile option (space and equals forms)', () => {
  const result1 = parseArgs(['--profile', 'full']);
  assert.strictEqual(result1.profile, 'full');

  const result2 = parseArgs(['--profile=minimal']);
  assert.strictEqual(result2.profile, 'minimal');
});

test('parseArgs: throws error on missing --profile value', () => {
  assert.throws(() => parseArgs(['--profile']), /Error: --profile option requires/);
});

test('parseArgs: --dry-run and --profile combine with other init options', () => {
  const result = parseArgs(['--tools', 'git,claude', '--profile', 'full', '--dry-run', '--yes']);
  assert.strictEqual(result.tools, 'git,claude');
  assert.strictEqual(result.profile, 'full');
  assert.strictEqual(result['dry-run'], true);
  assert.strictEqual(result.yes, true);
});
