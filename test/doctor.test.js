'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { runInit } = require('../lib/init');
const { runDoctor, getFindings, fixFindings } = require('../lib/doctor');

async function captureConsoleLog(asyncFn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await asyncFn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

// Snapshots every file under dir (relative paths + contents) so a test can
// assert doctor changed nothing - the core trust claim of a "doctor" command
// is that it never writes.
function snapshotDir(dir) {
  const files = {};
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        files[path.relative(dir, full)] = fs.readFileSync(full, 'utf8');
      }
    }
  }
  walk(dir);
  return files;
}

test('runDoctor: reports "not set up yet" for a directory with no .agent-room/, and writes nothing', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-doctor-unscaffolded-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'x' }));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const before = snapshotDir(tmpDir);
  const output = await captureConsoleLog(() => runDoctor(tmpDir));
  const after = snapshotDir(tmpDir);

  assert.match(output, /Not set up yet/);
  assert.match(output, /create-agent-room init \. --tools/);
  assert.match(output, /create-agent-room init \. --dry-run --tools/);
  assert.deepStrictEqual(after, before, 'doctor must not write anything to disk');
});

test('runDoctor: reports "Looks good" for a clean default (--profile minimal) room, and writes nothing', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-doctor-clean-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'claude,git', git: true, name: 'DoctorCleanTest', force: true });

  const before = snapshotDir(tmpDir);
  const output = await captureConsoleLog(() => runDoctor(tmpDir));
  const after = snapshotDir(tmpDir);

  assert.match(output, /Scaffolded with --profile minimal/);
  assert.match(output, /Looks good/);
  assert.doesNotMatch(output, /Needs attention/);
  assert.doesNotMatch(output, /Recommended file not found: \.agent-room\/principles\.md/);
  assert.deepStrictEqual(after, before, 'doctor must not write anything to disk');
});

test('runDoctor: flags a drifted hook file against the currently installed template', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-doctor-drift-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'git', git: true, name: 'DoctorDriftTest', force: true });

  const hookPath = path.join(tmpDir, '.agent-room', 'hooks', 'guardrails-check.js');
  fs.appendFileSync(hookPath, '\n// hand-edited, now stale\n');

  const before = snapshotDir(tmpDir);
  const output = await captureConsoleLog(() => runDoctor(tmpDir));
  const after = snapshotDir(tmpDir);

  assert.match(output, /guardrails-check\.js doesn't match the currently installed CLI's template/);
  assert.match(output, /create-agent-room init \. --force/);
  assert.deepStrictEqual(after, before, 'doctor must not write anything to disk, even when it finds issues');
});

test('runDoctor: does not flag hooks that match the current template exactly', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-doctor-nodrift-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'git', git: true, name: 'DoctorNoDriftTest', force: true });

  const output = await captureConsoleLog(() => runDoctor(tmpDir));

  assert.doesNotMatch(output, /doesn't match the currently installed CLI's template/);
});

test('runDoctor: flags a tools/reality mismatch (claude listed but Stop hook not wired)', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-doctor-mismatch-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'claude', name: 'DoctorMismatchTest', force: true });
  fs.rmSync(path.join(tmpDir, '.claude', 'settings.json'), { force: true });

  const output = await captureConsoleLog(() => runDoctor(tmpDir));

  assert.match(output, /lists "claude" as a tool, but the Stop hook is not wired/);
});

test('runDoctor: flags cursor listed but .cursor/hooks.json not wired', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-doctor-cursor-mismatch-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'cursor', name: 'DoctorCursorMismatch', force: true });
  fs.rmSync(path.join(tmpDir, '.cursor', 'hooks.json'), { force: true });

  const output = await captureConsoleLog(() => runDoctor(tmpDir));

  assert.match(output, /lists "cursor" as a tool, but the stop hook is not wired in \.cursor\/hooks\.json/);
});

test('runDoctor: flags a git tool/reality mismatch (git listed but pre-commit hook missing)', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-doctor-gitmismatch-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'git', git: true, name: 'DoctorGitMismatchTest', force: true });
  fs.rmSync(path.join(tmpDir, '.git', 'hooks', 'pre-commit'), { force: true });

  const output = await captureConsoleLog(() => runDoctor(tmpDir));

  assert.match(output, /lists "git" as a tool, but \.git\/hooks\/pre-commit does not exist/);
});

test('runDoctor: flags a stale CI version pin', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-doctor-cipin-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'git', git: true, name: 'DoctorCiPinTest', force: true });

  const ciPath = path.join(tmpDir, '.github', 'workflows', 'agent-room-validate.yml');
  const content = fs.readFileSync(ciPath, 'utf8').replace(/create-agent-room@[\w.]+/g, 'create-agent-room@0.1.0');
  fs.writeFileSync(ciPath, content);

  const output = await captureConsoleLog(() => runDoctor(tmpDir));

  assert.match(output, /pins create-agent-room@0\.1\.0; the installed CLI is/);
});

test('runDoctor: reports real structural errors (e.g. missing AGENTS.md) under "Needs attention"', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-doctor-broken-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'none', name: 'DoctorBrokenTest', force: true });
  fs.rmSync(path.join(tmpDir, 'AGENTS.md'), { force: true });

  const output = await captureConsoleLog(() => runDoctor(tmpDir));

  assert.match(output, /Needs attention/);
  assert.match(output, /Missing required file: AGENTS\.md/);
});

// --- getFindings(): the pure function runDoctor prints, and the CI gate
// (scripts/check-doctor-clean.js) consumes directly, without parsing any
// printed/colored text. These mirror the runDoctor-level scenarios above,
// but assert on the returned data shape instead of console output.

test('getFindings: returns notSetUp true, with empty arrays, for a directory with no .agent-room/', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-findings-unscaffolded-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const findings = getFindings(tmpDir);

  assert.strictEqual(findings.notSetUp, true);
  assert.deepStrictEqual(findings.critical, []);
  assert.deepStrictEqual(findings.advisory, []);
});

test('getFindings: returns empty critical/advisory for a clean minimal-profile room', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-findings-clean-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'claude,git', git: true, name: 'FindingsCleanTest', force: true });

  const findings = getFindings(tmpDir);

  assert.strictEqual(findings.notSetUp, false);
  assert.deepStrictEqual(findings.critical, []);
  assert.deepStrictEqual(findings.advisory, []);
  assert.strictEqual(findings.isMinimalProfile, true);
});

test('getFindings: surfaces hook drift in advisory, matching what runDoctor prints', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-findings-drift-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'git', git: true, name: 'FindingsDriftTest', force: true });
  fs.appendFileSync(path.join(tmpDir, '.agent-room', 'hooks', 'guardrails-check.js'), '\n// stale\n');

  const findings = getFindings(tmpDir);

  assert.ok(findings.advisory.some((a) => a.includes("doesn't match the currently installed CLI's template")));
});

test('getFindings: surfaces real structural errors as critical', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-findings-broken-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'none', name: 'FindingsBrokenTest', force: true });
  fs.rmSync(path.join(tmpDir, 'AGENTS.md'), { force: true });

  const findings = getFindings(tmpDir);

  assert.ok(findings.critical.includes('Missing required file: AGENTS.md'));
});

test('fixFindings: re-synchronizes drifted static hooks with packaged templates', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-fix-drift-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'git', git: true, name: 'FixDriftTest', force: true });
  const hookPath = path.join(tmpDir, '.agent-room', 'hooks', 'guardrails-check.js');
  fs.appendFileSync(hookPath, '\n// modified\n');

  const beforeFindings = getFindings(tmpDir);
  assert.ok(beforeFindings.advisory.some((a) => a.includes('guardrails-check.js')));

  const fixed = fixFindings(tmpDir);
  assert.ok(fixed.some((f) => f.includes('guardrails-check.js')));

  const afterFindings = getFindings(tmpDir);
  assert.strictEqual(afterFindings.advisory.length, 0);
});

test('fixFindings: re-pins outdated or latest CI action versions to installed version', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-fix-ci-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'git', git: true, name: 'FixCiTest', force: true });
  const ciPath = path.join(tmpDir, '.github', 'workflows', 'agent-room-validate.yml');
  fs.writeFileSync(
    ciPath,
    'name: ci\njobs:\n  run:\n    steps:\n      - run: npx create-agent-room@1.0.0 eval\n'
  );

  const beforeFindings = getFindings(tmpDir);
  assert.ok(beforeFindings.advisory.some((a) => a.includes('create-agent-room@1.0.0')));

  const fixed = fixFindings(tmpDir);
  assert.ok(fixed.some((f) => f.includes('Re-pinned CI action version')));

  const updatedContent = fs.readFileSync(ciPath, 'utf8');
  assert.match(updatedContent, new RegExp(`create-agent-room@${require('../package.json').version}`));
});

test('fixFindings: re-wires missing Claude Stop hook when claude is in .agent-room.json', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-fix-claude-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'claude', name: 'FixClaudeTest', force: true });
  const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({ hooks: {} }));

  const beforeFindings = getFindings(tmpDir);
  assert.ok(beforeFindings.advisory.some((a) => a.includes('.claude/settings.json')));

  const fixed = fixFindings(tmpDir);
  assert.ok(fixed.some((f) => f.includes('Claude Code Stop hook')));

  const afterFindings = getFindings(tmpDir);
  assert.strictEqual(afterFindings.advisory.length, 0);
});

test('fixFindings: re-wires missing Cursor stop hook when cursor is in .agent-room.json', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-fix-cursor-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'cursor', name: 'FixCursorTest', force: true });
  const hooksPath = path.join(tmpDir, '.cursor', 'hooks.json');
  fs.writeFileSync(hooksPath, JSON.stringify({ version: 1, hooks: {} }));

  const beforeFindings = getFindings(tmpDir);
  assert.ok(beforeFindings.advisory.some((a) => a.includes('.cursor/hooks.json')));

  const fixed = fixFindings(tmpDir);
  assert.ok(fixed.some((f) => f.includes('Cursor stop hook')));

  const afterFindings = getFindings(tmpDir);
  assert.strictEqual(afterFindings.advisory.length, 0);
});

test('runDoctor: with { fix: true } auto-remediates drifted hooks and reports Looks good afterwards', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-doctor-fix-run-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'git', git: true, name: 'DoctorFixRunTest', force: true });
  const hookPath = path.join(tmpDir, '.agent-room', 'hooks', 'guardrails-check.js');
  fs.appendFileSync(hookPath, '\n// drifted\n');

  const output = await captureConsoleLog(() => runDoctor(tmpDir, { fix: true }));

  assert.match(output, /create-agent-room doctor --fix/);
  assert.match(output, /Applied auto-remediations/);
  assert.match(output, /Synchronized drifted hook: \.agent-room\/hooks\/guardrails-check\.js/);
  assert.match(output, /Looks good/);
});

test('doctor: detects deprecated core skills and doctor --fix purges them', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-doctor-deprecated-skills-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'claude', name: 'DoctorDeprecatedTest', force: true });

  // Introduce lingering legacy skills
  const legacySkill = path.join(tmpDir, '.agent-room', 'skills', 'brainstorming.md');
  fs.writeFileSync(legacySkill, '# Legacy');
  const legacyClaude = path.join(tmpDir, '.claude', 'skills', 'brainstorming');
  fs.mkdirSync(legacyClaude, { recursive: true });
  fs.writeFileSync(path.join(legacyClaude, 'SKILL.md'), '# Legacy');

  const beforeFindings = getFindings(tmpDir);
  assert.ok(beforeFindings.advisory.some((a) => a.includes('Deprecated legacy skill found: .agent-room/skills/brainstorming.md')));
  assert.ok(beforeFindings.advisory.some((a) => a.includes('Deprecated mirrored skill found: .claude/skills/brainstorming')));

  const fixed = fixFindings(tmpDir);
  assert.ok(fixed.some((f) => f.includes('Removed deprecated legacy skill: .agent-room/skills/brainstorming.md')));
  assert.ok(fixed.some((f) => f.includes('Removed deprecated mirrored skill: .claude/skills/brainstorming')));

  assert.strictEqual(fs.existsSync(legacySkill), false);
  assert.strictEqual(fs.existsSync(legacyClaude), false);

  const afterFindings = getFindings(tmpDir);
  assert.ok(!afterFindings.advisory.some((a) => a.includes('Deprecated')));
});


