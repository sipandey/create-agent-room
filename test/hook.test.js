'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('child_process');
const {
  SUPPORTED_HOOKS,
  resolveHooksDir,
  getHookTemplate,
  buildHookBlock,
  getStartMarker,
  getEndMarker,
  installHooks,
  getHookStatus,
  uninstallHooks,
  detectUpstreamBranch,
  resolvePrePushConfig,
  runPrePush,
  runHookCli,
} = require('../lib/hook');

function createTempGitRepo(prefix) {
  const tmpDir = path.join(__dirname, `tmp-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  execFileSync('git', ['init', tmpDir], { stdio: 'ignore' });
  return tmpDir;
}

function cleanupTempDir(tmpDir) {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (e) {
    // ignore cleanup errors
  }
}

test('SUPPORTED_HOOKS: includes all 5 lifecycle hooks', () => {
  assert.deepStrictEqual(SUPPORTED_HOOKS, [
    'pre-commit',
    'pre-push',
    'post-commit',
    'post-checkout',
    'post-merge',
  ]);
});

test('resolveHooksDir: resolves default .git/hooks directory', (t) => {
  const repo = createTempGitRepo('hooks-resolve');
  t.after(() => cleanupTempDir(repo));

  const resolved = resolveHooksDir(repo);
  assert.strictEqual(resolved, path.join(repo, '.git', 'hooks'));
});

test('resolveHooksDir: respects git config core.hooksPath', (t) => {
  const repo = createTempGitRepo('hooks-custom-path');
  t.after(() => cleanupTempDir(repo));

  const customDir = path.join(repo, '.husky');
  fs.mkdirSync(customDir, { recursive: true });
  execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: repo, stdio: 'ignore' });

  const resolved = resolveHooksDir(repo);
  assert.strictEqual(resolved, customDir);
});

test('resolveHooksDir: handles gitdir file (worktree or submodule)', (t) => {
  const tmpDir = path.join(__dirname, `tmp-gitdir-${Date.now()}`);
  t.after(() => cleanupTempDir(tmpDir));

  const worktreeDir = path.join(tmpDir, 'worktree');
  const actualGitDir = path.join(tmpDir, 'main-repo', '.git', 'worktrees', 'wt1');
  fs.mkdirSync(worktreeDir, { recursive: true });
  fs.mkdirSync(actualGitDir, { recursive: true });

  fs.writeFileSync(path.join(worktreeDir, '.git'), `gitdir: ${actualGitDir}\n`, 'utf8');

  const resolved = resolveHooksDir(worktreeDir);
  assert.strictEqual(resolved, path.join(actualGitDir, 'hooks'));
});

test('getHookTemplate: retrieves template without shebang', () => {
  for (const hook of SUPPORTED_HOOKS) {
    const template = getHookTemplate(hook);
    assert(template.length > 0, `Template for ${hook} should not be empty`);
    assert(!template.startsWith('#!'), `Template for ${hook} should have shebang stripped`);
    assert(template.includes('.agent-room'), `Template for ${hook} should reference .agent-room`);
  }
});

test('buildHookBlock: wraps content in standard delimiters', () => {
  const block = buildHookBlock('pre-push', 'echo "Checking CI"');
  assert(block.startsWith(getStartMarker('pre-push')));
  assert(block.includes('echo "Checking CI"'));
  assert(block.endsWith(getEndMarker('pre-push')));
});

test('installHooks: fails if target is not a git repo without force', (t) => {
  const tmpDir = path.join(__dirname, `tmp-non-git-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => cleanupTempDir(tmpDir));

  const res = installHooks(tmpDir);
  assert.strictEqual(res.ok, false);
  assert(res.error.includes('not a git repository'));

  const resForced = installHooks(tmpDir, { force: true });
  assert.strictEqual(resForced.ok, true);
});

test('installHooks: fails on unknown hook name', (t) => {
  const repo = createTempGitRepo('hooks-unknown');
  t.after(() => cleanupTempDir(repo));

  const res = installHooks(repo, { hooks: ['invalid-hook'] });
  assert.strictEqual(res.ok, false);
  assert(res.error.includes('Unknown hook: "invalid-hook"'));
});

test('installHooks: installs default pre-commit hook with executable permissions', (t) => {
  const repo = createTempGitRepo('hooks-install-default');
  t.after(() => cleanupTempDir(repo));

  const res = installHooks(repo);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.results.length, 1);
  assert.strictEqual(res.results[0].hook, 'pre-commit');
  assert.strictEqual(res.results[0].action, 'created');

  const hookFile = path.join(repo, '.git', 'hooks', 'pre-commit');
  assert(fs.existsSync(hookFile));
  const content = fs.readFileSync(hookFile, 'utf8');
  assert(content.startsWith('#!/bin/sh'));
  assert(content.includes(getStartMarker('pre-commit')));
  assert(content.includes(getEndMarker('pre-commit')));

  if (process.platform !== 'win32') {
    const stat = fs.statSync(hookFile);
    assert((stat.mode & 0o111) !== 0, 'Hook file must be executable');
  }
});

test('installHooks: installs all supported hooks when --all is set', (t) => {
  const repo = createTempGitRepo('hooks-install-all');
  t.after(() => cleanupTempDir(repo));

  const res = installHooks(repo, { all: true });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.results.length, 5);

  for (const hook of SUPPORTED_HOOKS) {
    const hookFile = path.join(repo, '.git', 'hooks', hook);
    assert(fs.existsSync(hookFile), `Hook file ${hook} should exist`);
    const content = fs.readFileSync(hookFile, 'utf8');
    assert(content.includes(getStartMarker(hook)));
  }
});

test('installHooks: chains non-destructively with existing user scripts', (t) => {
  const repo = createTempGitRepo('hooks-chaining');
  t.after(() => cleanupTempDir(repo));

  const hooksDir = path.join(repo, '.git', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const preCommitFile = path.join(hooksDir, 'pre-commit');

  // Existing custom user script (e.g. Husky or manual script)
  const userScript = '#!/usr/bin/env bash\necho "Running existing custom linter..."\nnpm run lint:custom\n';
  fs.writeFileSync(preCommitFile, userScript, 'utf8');

  const res = installHooks(repo, { hooks: ['pre-commit'] });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.results[0].action, 'chained');
  assert.strictEqual(res.results[0].chained, true);

  const updatedContent = fs.readFileSync(preCommitFile, 'utf8');
  // Check user script is intact at the beginning
  assert(updatedContent.includes('echo "Running existing custom linter..."'));
  assert(updatedContent.includes('npm run lint:custom'));
  // Check CAR block was appended
  assert(updatedContent.includes(getStartMarker('pre-commit')));
  assert(updatedContent.includes(getEndMarker('pre-commit')));
});

test('installHooks: updates existing CAR block idempotently without duplicates', (t) => {
  const repo = createTempGitRepo('hooks-idempotent');
  t.after(() => cleanupTempDir(repo));

  const prePushFile = path.join(repo, '.git', 'hooks', 'pre-push');
  fs.mkdirSync(path.dirname(prePushFile), { recursive: true });
  const initialContent = `#!/bin/sh\n# Existing user hook\nexit_code=0\n\n${buildHookBlock('pre-push', '# Old hook body')}\n`;
  fs.writeFileSync(prePushFile, initialContent, 'utf8');

  const res = installHooks(repo, { hooks: ['pre-push'] });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.results[0].action, 'updated');

  const updatedContent = fs.readFileSync(prePushFile, 'utf8');
  assert(updatedContent.includes('# Existing user hook'));
  // Should only have 1 instance of the start marker
  const matches = updatedContent.match(new RegExp(getStartMarker('pre-push'), 'g'));
  assert.strictEqual(matches.length, 1);
  assert(!updatedContent.includes('# Old hook body'));
});

test('installHooks: upgrades legacy un-delimited CAR pre-commit hook', (t) => {
  const repo = createTempGitRepo('hooks-upgrade-legacy');
  t.after(() => cleanupTempDir(repo));

  const preCommitFile = path.join(repo, '.git', 'hooks', 'pre-commit');
  fs.mkdirSync(path.dirname(preCommitFile), { recursive: true });
  const legacyContent = '#!/bin/sh\nif [ -f ".agent-room/hooks/guardrails-check.js" ]; then node ".agent-room/hooks/guardrails-check.js"; fi\n';
  fs.writeFileSync(preCommitFile, legacyContent, 'utf8');

  const res = installHooks(repo, { hooks: ['pre-commit'] });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.results[0].action, 'upgraded');

  const updatedContent = fs.readFileSync(preCommitFile, 'utf8');
  assert(updatedContent.includes(getStartMarker('pre-commit')));
  assert(updatedContent.includes(getEndMarker('pre-commit')));
});

test('getHookStatus: returns accurate status for installed, chained, drifted, and missing hooks', (t) => {
  const repo = createTempGitRepo('hooks-status');
  t.after(() => cleanupTempDir(repo));

  // Install pre-commit (standalone)
  installHooks(repo, { hooks: ['pre-commit'] });

  // Install pre-push (chained with user script)
  const prePushFile = path.join(repo, '.git', 'hooks', 'pre-push');
  fs.writeFileSync(prePushFile, `#!/bin/sh\necho "user script"\n${buildHookBlock('pre-push', getHookTemplate('pre-push'))}\n`, 'utf8');
  if (process.platform !== 'win32') fs.chmodSync(prePushFile, 0o755);

  // Install post-commit with modified/drifted body
  const postCommitFile = path.join(repo, '.git', 'hooks', 'post-commit');
  fs.writeFileSync(postCommitFile, `#!/bin/sh\n${buildHookBlock('post-commit', 'echo "custom drifted code"')}\n`, 'utf8');
  if (process.platform !== 'win32') fs.chmodSync(postCommitFile, 0o755);

  const status = getHookStatus(repo);
  assert.strictEqual(status.ok, true);
  assert.strictEqual(status.summary.total, 5);
  assert.strictEqual(status.summary.installed, 3);
  assert.strictEqual(status.summary.active, 3);
  assert.strictEqual(status.summary.drifted, 1);

  const preCommit = status.hooks.find((h) => h.hook === 'pre-commit');
  assert.strictEqual(preCommit.installed, true);
  assert.strictEqual(preCommit.active, true);
  assert.strictEqual(preCommit.chained, false);
  assert.strictEqual(preCommit.drifted, false);

  const prePush = status.hooks.find((h) => h.hook === 'pre-push');
  assert.strictEqual(prePush.installed, true);
  assert.strictEqual(prePush.active, true);
  assert.strictEqual(prePush.chained, true);
  assert.strictEqual(prePush.drifted, false);

  const postCommit = status.hooks.find((h) => h.hook === 'post-commit');
  assert.strictEqual(postCommit.installed, true);
  assert.strictEqual(postCommit.drifted, true);

  const postMerge = status.hooks.find((h) => h.hook === 'post-merge');
  assert.strictEqual(postMerge.installed, false);
  assert.strictEqual(postMerge.active, false);
});

test('uninstallHooks: unhooks CAR block while preserving user code', (t) => {
  const repo = createTempGitRepo('hooks-uninstall-chained');
  t.after(() => cleanupTempDir(repo));

  const preCommitFile = path.join(repo, '.git', 'hooks', 'pre-commit');
  fs.mkdirSync(path.dirname(preCommitFile), { recursive: true });
  const chainedContent = `#!/bin/sh\n# Custom developer check\nnpm test\n\n${buildHookBlock('pre-commit', getHookTemplate('pre-commit'))}\n`;
  fs.writeFileSync(preCommitFile, chainedContent, 'utf8');

  const res = uninstallHooks(repo, { hooks: ['pre-commit'] });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.results[0].action, 'unhooked');

  assert(fs.existsSync(preCommitFile), 'Hook file should still exist because it contains user code');
  const remaining = fs.readFileSync(preCommitFile, 'utf8');
  assert(remaining.includes('npm test'));
  assert(!remaining.includes(getStartMarker('pre-commit')));
});

test('uninstallHooks: deletes hook file if it only contained CAR block', (t) => {
  const repo = createTempGitRepo('hooks-uninstall-pure');
  t.after(() => cleanupTempDir(repo));

  installHooks(repo, { hooks: ['pre-push'] });
  const prePushFile = path.join(repo, '.git', 'hooks', 'pre-push');
  assert(fs.existsSync(prePushFile));

  const res = uninstallHooks(repo, { hooks: ['pre-push'] });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.results[0].action, 'deleted');
  assert(!fs.existsSync(prePushFile), 'File should be deleted when only CAR block existed');
});

test('uninstallHooks: skips missing or non-CAR hooks gracefully', (t) => {
  const repo = createTempGitRepo('hooks-uninstall-skip');
  t.after(() => cleanupTempDir(repo));

  // Non-existent hook
  const resMissing = uninstallHooks(repo, { hooks: ['post-checkout'] });
  assert.strictEqual(resMissing.results[0].action, 'skipped');
  assert.strictEqual(resMissing.results[0].reason, 'not_found');

  // Pure third-party hook without CAR
  const customFile = path.join(repo, '.git', 'hooks', 'post-merge');
  fs.mkdirSync(path.dirname(customFile), { recursive: true });
  fs.writeFileSync(customFile, '#!/bin/sh\necho "Custom only"\n', 'utf8');

  const resCustom = uninstallHooks(repo, { hooks: ['post-merge'] });
  assert.strictEqual(resCustom.results[0].action, 'skipped');
  assert.strictEqual(resCustom.results[0].reason, 'not_car_hook');
  assert(fs.existsSync(customFile));
});

test('runHookCli: status, install, and uninstall commands work and support --json', (t) => {
  const repo = createTempGitRepo('hooks-cli');
  t.after(() => cleanupTempDir(repo));

  // 1. Install all hooks via CLI
  let logged = '';
  const origLog = console.log;
  console.log = (msg) => {
    logged += msg + '\n';
  };

  try {
    const installCode = runHookCli(repo, 'install', [], { all: true, json: true });
    assert.strictEqual(installCode, 0);
    const parsedInstall = JSON.parse(logged);
    assert.strictEqual(parsedInstall.ok, true);
    assert.strictEqual(parsedInstall.results.length, 5);

    // 2. Status via CLI (json)
    logged = '';
    const statusCode = runHookCli(repo, 'status', [], { json: true });
    assert.strictEqual(statusCode, 0);
    const parsedStatus = JSON.parse(logged);
    assert.strictEqual(parsedStatus.summary.active, 5);

    // 3. Status via CLI (pretty text table)
    logged = '';
    const statusTextCode = runHookCli(repo, 'status', [], {});
    assert.strictEqual(statusTextCode, 0);
    assert(logged.includes('create-agent-room Git Hooks Status'));
    assert(logged.includes('pre-commit'));
    assert(logged.includes('pre-push'));

    // 4. Uninstall all hooks via CLI
    logged = '';
    const uninstallCode = runHookCli(repo, 'uninstall', [], { all: true });
    assert.strictEqual(uninstallCode, 0);
    assert(logged.includes('Git Hooks Uninstalled'));

    // 5. Status should now show 0 installed
    logged = '';
    runHookCli(repo, 'status', [], { json: true });
    const finalStatus = JSON.parse(logged);
    assert.strictEqual(finalStatus.summary.installed, 0);

    // 6. Unknown action returns error code 1
    const errorCode = runHookCli(repo, 'bad-action', [], {});
    assert.strictEqual(errorCode, 1);
  } finally {
    console.log = origLog;
  }
});

test('detectUpstreamBranch: detects upstream tracking branch or defaults to origin/main', (t) => {
  const repo = createTempGitRepo('upstream-detect');
  t.after(() => cleanupTempDir(repo));

  // Default when no tracking branch or remote
  const base = detectUpstreamBranch(repo);
  assert.strictEqual(base, 'origin/main');

  // When remote is named 'upstream'
  const upstreamBase = detectUpstreamBranch(repo, 'upstream');
  assert.strictEqual(upstreamBase, 'upstream/main');
});

test('detectUpstreamBranch: respects CAR_BASE_REF and .agent-room.json prePush.base', (t) => {
  const repo = createTempGitRepo('upstream-env-cfg');
  t.after(() => cleanupTempDir(repo));

  // 1. .agent-room.json base
  const configPath = path.join(repo, '.agent-room.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      hooks: {
        prePush: {
          base: 'upstream/staging',
        },
      },
    })
  );

  const baseFromCfg = detectUpstreamBranch(repo);
  assert.strictEqual(baseFromCfg, 'upstream/staging');

  // 2. CAR_BASE_REF environment variable takes highest precedence
  const origEnv = process.env.CAR_BASE_REF;
  process.env.CAR_BASE_REF = 'origin/production';
  try {
    const baseFromEnv = detectUpstreamBranch(repo);
    assert.strictEqual(baseFromEnv, 'origin/production');
  } finally {
    if (origEnv !== undefined) {
      process.env.CAR_BASE_REF = origEnv;
    } else {
      delete process.env.CAR_BASE_REF;
    }
  }
});

test('resolvePrePushConfig: extracts enabled, strict, skip, only, and base from .agent-room.json', (t) => {
  const repo = createTempGitRepo('cfg-extract');
  t.after(() => cleanupTempDir(repo));

  // Default without config
  const def = resolvePrePushConfig(repo);
  assert.strictEqual(def.enabled, true);
  assert.strictEqual(def.strict, false);
  assert.deepStrictEqual(def.skip, []);
  assert.deepStrictEqual(def.only, []);
  assert.strictEqual(def.base, 'origin/main');

  // Configured prePush
  const configPath = path.join(repo, '.agent-room.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      hooks: {
        prePush: {
          enabled: false,
          strict: true,
          skip: ['eval'],
          only: ['verify'],
          base: 'origin/master',
        },
      },
    })
  );

  const cfg = resolvePrePushConfig(repo);
  assert.strictEqual(cfg.enabled, false);
  assert.strictEqual(cfg.strict, true);
  assert.deepStrictEqual(cfg.skip, ['eval']);
  assert.deepStrictEqual(cfg.only, ['verify']);
  assert.strictEqual(cfg.base, 'origin/master');
});

test('runPrePush: fast bypass via CAR_SKIP_PRE_PUSH or CAR_SKIP_HOOK', (t) => {
  const repo = createTempGitRepo('pre-push-bypass');
  t.after(() => cleanupTempDir(repo));

  const origSkip = process.env.CAR_SKIP_PRE_PUSH;
  process.env.CAR_SKIP_PRE_PUSH = '1';
  try {
    const res = runPrePush(repo);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.skipped, true);
    assert.strictEqual(res.reason, 'bypassed via environment variable');
  } finally {
    if (origSkip !== undefined) {
      process.env.CAR_SKIP_PRE_PUSH = origSkip;
    } else {
      delete process.env.CAR_SKIP_PRE_PUSH;
    }
  }

  const res2 = runPrePush(repo, { skipHook: true });
  assert.strictEqual(res2.ok, true);
  assert.strictEqual(res2.skipped, true);
});

test('runPrePush: bypasses when push contains only branch deletions (all zeros)', (t) => {
  const repo = createTempGitRepo('pre-push-del');
  t.after(() => cleanupTempDir(repo));

  const z40 = '0000000000000000000000000000000000000000';
  const stdin = `refs/heads/feature-old ${z40} refs/heads/feature-old ${z40}\n`;

  const res = runPrePush(repo, { stdin });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.skipped, true);
  assert.strictEqual(res.reason, 'branch-deletion');
});

test('runPrePush: respects hooks.prePush.enabled: false in .agent-room.json', (t) => {
  const repo = createTempGitRepo('pre-push-disabled');
  t.after(() => cleanupTempDir(repo));

  const configPath = path.join(repo, '.agent-room.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      hooks: {
        prePush: {
          enabled: false,
        },
      },
    })
  );

  const res = runPrePush(repo);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.skipped, true);
  assert.strictEqual(res.reason, 'prePush hook disabled in .agent-room.json');
});

test('runPrePush: executes CI and returns ok on a clean room', async (t) => {
  const repo = createTempGitRepo('pre-push-clean');
  t.after(() => cleanupTempDir(repo));

  const { runInit } = require('../lib/init');
  await runInit(repo, {
    yes: true,
    tools: 'git',
    name: 'PrePushCleanRoom',
    force: true,
    noTestCommand: true,
  });

  const res = runPrePush(repo, { skip: ['verify'] });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.skipped, false);
  assert(res.report);
  assert.strictEqual(res.report.ok, true);
});

test('runPrePush: reports failure when guardrails are broken', async (t) => {
  const repo = createTempGitRepo('pre-push-fail');
  t.after(() => cleanupTempDir(repo));

  const { runInit } = require('../lib/init');
  await runInit(repo, {
    yes: true,
    tools: 'git',
    name: 'PrePushFailRoom',
    force: true,
    noTestCommand: true,
  });

  // Corrupt guardrails.json
  const guardrailsPath = path.join(repo, '.agent-room', 'guardrails.json');
  fs.writeFileSync(guardrailsPath, '{"protectedPaths": "not-an-array"}');

  const res = runPrePush(repo, { skip: ['verify'] });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.skipped, false);
  assert(res.report);
  assert.strictEqual(res.report.ok, false);
});

test('runHookCli: pre-push action dispatches cleanly in json mode', (t) => {
  const repo = createTempGitRepo('cli-prepush-dispatch');
  t.after(() => cleanupTempDir(repo));

  let logged = '';
  const origLog = console.log;
  console.log = (msg) => {
    logged += msg + '\n';
  };

  try {
    const code = runHookCli(repo, 'pre-push', [], {
      skipPrePush: true,
      json: true,
    });
    assert.strictEqual(code, 0);
    const parsed = JSON.parse(logged);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.skipped, true);
  } finally {
    console.log = origLog;
  }
});

test('pre-push template script: executes cleanly from git hook and respects bypasses', (t) => {
  const repo = createTempGitRepo('pre-push-script-exec');
  t.after(() => cleanupTempDir(repo));

  // Install pre-push hook
  installHooks(repo, { hooks: ['pre-push'] });
  const hookFile = path.join(repo, '.git', 'hooks', 'pre-push');
  assert(fs.existsSync(hookFile));

  // 1. CAR_SKIP_PRE_PUSH=1 exits 0
  const outputBypass = execFileSync('/bin/sh', [hookFile, 'origin', 'git@github.com:foo/bar.git'], {
    cwd: repo,
    env: Object.assign({}, process.env, { CAR_SKIP_PRE_PUSH: '1' }),
    input: '',
    stdio: 'pipe',
    encoding: 'utf8',
  });
  assert.strictEqual(outputBypass, '');

  // 2. Branch deletion on stdin exits 0
  const z40 = '0000000000000000000000000000000000000000';
  const deletionStdin = `refs/heads/delete-me ${z40} refs/heads/delete-me ${z40}\n`;
  const outputDel = execFileSync('/bin/sh', [hookFile, 'origin', 'git@github.com:foo/bar.git'], {
    cwd: repo,
    input: deletionStdin,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  assert.strictEqual(outputDel, '');
});
