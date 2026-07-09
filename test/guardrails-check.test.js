'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const hookPath = path.join(__dirname, '..', 'templates', 'adapters', 'git-hooks', 'guardrails-check.js');

function runHook(cwd) {
  const env = { ...process.env };
  delete env.GUARDRAILS_BYPASS;
  delete env.SKIP_GUARDRAILS_CHECK;
  return spawnSync(process.execPath, [hookPath], { cwd, encoding: 'utf8', env });
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function writeGuardrails(cwd, guardrails) {
  fs.writeFileSync(
    path.join(cwd, '.agent-room', 'guardrails.json'),
    JSON.stringify(guardrails, null, 2)
  );
}

function initRepo(prefix) {
  const tmpDir = path.join(__dirname, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(path.join(tmpDir, '.agent-room'), { recursive: true });
  git(tmpDir, ['init', '-q']);
  git(tmpDir, ['config', 'user.email', 'test@example.com']);
  git(tmpDir, ['config', 'user.name', 'Test User']);
  return tmpDir;
}

test('guardrails-check: blocks a commit that removes guardrails.json from its own protectedPaths in the same edit', (t) => {
  const tmpDir = initRepo('tmp-guardrails-self-weaken');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // HEAD version protects guardrails.json itself.
  writeGuardrails(tmpDir, {
    protectedPaths: ['.agent-room/guardrails.json', 'infrastructure/**'],
    requireApprovalFor: [],
    scopeGuidance: {},
    forbiddenActions: [],
  });
  git(tmpDir, ['add', '.agent-room/guardrails.json']);
  git(tmpDir, ['commit', '-q', '-m', 'initial guardrails']);

  // A single edit both changes guardrails.json AND removes its own path
  // from protectedPaths, so the newly-staged rules no longer flag it.
  writeGuardrails(tmpDir, {
    protectedPaths: ['infrastructure/**'],
    requireApprovalFor: [],
    scopeGuidance: {},
    forbiddenActions: [],
  });
  git(tmpDir, ['add', '.agent-room/guardrails.json']);

  const result = runHook(tmpDir);

  assert.strictEqual(result.status, 1, `expected hook to block the commit, got: ${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /guardrails\.json/);
  assert.match(result.stderr, /removed from protectedPaths/);
});

test('guardrails-check: allows editing guardrails.json when it was not previously self-protected', (t) => {
  const tmpDir = initRepo('tmp-guardrails-no-prior-protection');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // HEAD version never protected guardrails.json itself.
  writeGuardrails(tmpDir, {
    protectedPaths: ['infrastructure/**'],
    requireApprovalFor: [],
    scopeGuidance: {},
    forbiddenActions: [],
  });
  git(tmpDir, ['add', '.agent-room/guardrails.json']);
  git(tmpDir, ['commit', '-q', '-m', 'initial guardrails']);

  writeGuardrails(tmpDir, {
    protectedPaths: ['infrastructure/**', 'other/**'],
    requireApprovalFor: [],
    scopeGuidance: {},
    forbiddenActions: [],
  });
  git(tmpDir, ['add', '.agent-room/guardrails.json']);

  const result = runHook(tmpDir);

  assert.strictEqual(result.status, 0, `expected hook to allow the commit, got: ${result.stdout}${result.stderr}`);
});

test('guardrails-check: does not crash when guardrails.json is added in the genesis commit (no HEAD yet)', (t) => {
  const tmpDir = initRepo('tmp-guardrails-genesis');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  writeGuardrails(tmpDir, {
    protectedPaths: ['infrastructure/**'],
    requireApprovalFor: [],
    scopeGuidance: {},
    forbiddenActions: [],
  });
  git(tmpDir, ['add', '.agent-room/guardrails.json']);

  const result = runHook(tmpDir);

  // No HEAD exists yet, so there is nothing to compare against - the
  // self-weakening check should be a no-op rather than crashing the hook.
  assert.strictEqual(result.status, 0, `expected hook not to crash on genesis commit, got: ${result.stdout}${result.stderr}`);
});

test('guardrails-check: still blocks editing guardrails.json while it remains self-protected', (t) => {
  const tmpDir = initRepo('tmp-guardrails-still-protected');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  writeGuardrails(tmpDir, {
    protectedPaths: ['.agent-room/guardrails.json'],
    requireApprovalFor: [],
    scopeGuidance: {},
    forbiddenActions: [],
  });
  git(tmpDir, ['add', '.agent-room/guardrails.json']);
  git(tmpDir, ['commit', '-q', '-m', 'initial guardrails']);

  // Edit guardrails.json but leave its own path in protectedPaths.
  writeGuardrails(tmpDir, {
    protectedPaths: ['.agent-room/guardrails.json'],
    requireApprovalFor: ['something new'],
    scopeGuidance: {},
    forbiddenActions: [],
  });
  git(tmpDir, ['add', '.agent-room/guardrails.json']);

  const result = runHook(tmpDir);

  assert.strictEqual(result.status, 1, `expected hook to block the commit, got: ${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /Protected path violation: \.agent-room\/guardrails\.json/);
});
