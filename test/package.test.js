'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');

function getPackedFiles() {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  const [pkg] = JSON.parse(output);
  return pkg.files.map((f) => f.path);
}

test('npm package excludes this repo\'s own dogfooded agent-room scaffold', () => {
  const files = getPackedFiles();

  // This repo runs create-agent-room on itself (dogfooding) to test and
  // improve the tool - those root-level files are dev-only and must never
  // ship to consumers of the published package.
  const devOnlyPrefixes = ['.agent-room/', '.claude/', '.github/'];
  const devOnlyFiles = ['AGENTS.md', 'CLAUDE.md'];

  const leaked = files.filter(
    (f) => devOnlyPrefixes.some((prefix) => f.startsWith(prefix)) || devOnlyFiles.includes(f)
  );

  assert.deepStrictEqual(
    leaked,
    [],
    `Dev-only dogfooding files leaked into the npm package: ${leaked.join(', ')}`
  );
});

test('npm package still includes the packaged templates and examples', () => {
  const files = getPackedFiles();

  // Sanity check the exclusion above isn't accidentally over-broad - the
  // packaged template source (which ships .agent-room/* content on purpose)
  // and the example fixtures must still be present.
  assert(
    files.some((f) => f.startsWith('templates/.agent-room/')),
    'templates/.agent-room/* should still be packaged (it is the scaffold source, not this repo\'s own instance)'
  );
  assert(
    files.some((f) => f === 'examples/python-project/AGENTS.md'),
    'examples/*/AGENTS.md fixtures should still be packaged'
  );
  assert(
    files.some((f) => f.startsWith('evals/builtin/')),
    'evals/builtin compliance fixtures should be packaged'
  );
});
