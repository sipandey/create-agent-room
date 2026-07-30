'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');

const HOOK_SRC = path.join(
  __dirname,
  '..',
  'templates',
  'adapters',
  'claude-hooks',
  'close-the-loop-check.js'
);

function loadHook() {
  // Fresh require each time so tests see the current file contents.
  delete require.cache[require.resolve(HOOK_SRC)];
  return require(HOOK_SRC);
}

function makeRepo(prefix) {
  const dir = path.join(__dirname, `tmp-ctl-${prefix}-` + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  fs.mkdirSync(path.join(dir, '.agent-room'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.agent-room', 'decisions.md'), '# Decisions\n');
  fs.writeFileSync(path.join(dir, '.agent-room', 'anti-patterns.md'), '# Anti-patterns\n');
  return dir;
}

function runHookCli(dir, args, stdin) {
  return spawnSync('node', [HOOK_SRC, ...args], {
    cwd: dir,
    encoding: 'utf8',
    input: stdin != null ? stdin : undefined,
    env: process.env
  });
}

test('checkClosingTheLoop: fails when source files are dirty and logs untouched', () => {
  const { checkClosingTheLoop } = loadHook();
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain: ' M src/index.js\n'
  });
  assert.strictEqual(result.ok, false);
  assert.deepStrictEqual(result.sourceChanges, ['src/index.js']);
  assert.match(result.message, /Closing-the-loop check failed/);
  assert.match(result.message, /decisions\.md/);
});

test('checkClosingTheLoop: passes when a log file is also touched', () => {
  const { checkClosingTheLoop } = loadHook();
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain: ' M src/index.js\n M .agent-room/decisions.md\n'
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.sourceChanges, []);
});

test('checkClosingTheLoop: passes when only scaffold paths changed', () => {
  const { checkClosingTheLoop } = loadHook();
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain:
      ' M .agent-room/skills/foo.md\n M docs/plans/x.md\n M .cursor/hooks.json\n M .cursor/rules/agent-room.mdc\n'
  });
  assert.strictEqual(result.ok, true);
});

test('checkClosingTheLoop: passes with no .agent-room or no git', () => {
  const { checkClosingTheLoop } = loadHook();
  assert.strictEqual(
    checkClosingTheLoop('/tmp/unused', { hasAgentRoom: false, isGitRepo: true, statusPorcelain: ' M a.js\n' }).ok,
    true
  );
  assert.strictEqual(
    checkClosingTheLoop('/tmp/unused', { hasAgentRoom: true, isGitRepo: false, statusPorcelain: ' M a.js\n' }).ok,
    true
  );
});

test('adapter claude (default): fail exits 2 with stderr, no stdout JSON', (t) => {
  const dir = makeRepo('claude-fail');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'src.js'), 'x\n');

  const result = runHookCli(dir, []);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /Closing-the-loop check failed/);
  assert.strictEqual((result.stdout || '').trim(), '');
});

test('adapter cursor: fail exits 0 with followup_message JSON on stdout', (t) => {
  const dir = makeRepo('cursor-fail');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'src.js'), 'x\n');

  const result = runHookCli(dir, ['--adapter=cursor'], JSON.stringify({ status: 'completed', loop_count: 0 }));
  assert.strictEqual(result.status, 0);
  const payload = JSON.parse(result.stdout.trim());
  assert.match(payload.followup_message, /Closing-the-loop check failed/);
});

test('adapter cursor: pass exits 0 with empty object', (t) => {
  const dir = makeRepo('cursor-pass');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const result = runHookCli(dir, ['--adapter=cursor'], JSON.stringify({ status: 'completed', loop_count: 0 }));
  assert.strictEqual(result.status, 0);
  const out = (result.stdout || '').trim();
  if (out) {
    assert.deepStrictEqual(JSON.parse(out), {});
  }
});

test('adapter cursor: aborted/error status skips the check', (t) => {
  const dir = makeRepo('cursor-abort');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'src.js'), 'x\n');

  for (const status of ['aborted', 'error']) {
    const result = runHookCli(dir, ['--adapter=cursor'], JSON.stringify({ status, loop_count: 0 }));
    assert.strictEqual(result.status, 0, status);
    const out = (result.stdout || '').trim();
    if (out) assert.deepStrictEqual(JSON.parse(out), {});
  }
});

test('adapter unknown: exits 1', () => {
  const result = spawnSync('node', [HOOK_SRC, '--adapter=nope'], {
    cwd: __dirname,
    encoding: 'utf8'
  });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Unknown adapter/);
});
