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

test('checkClosingTheLoop: passes when a log file is also touched with valid evidence', () => {
  const { checkClosingTheLoop } = loadHook();
  const logDiff = [
    '--- a/.agent-room/decisions.md',
    '+++ b/.agent-room/decisions.md',
    '@@ -1,1 +1,2 @@',
    '+<!-- no-log: routine validation run for hook -->',
  ].join('\n');
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain: ' M src/index.js\n M .agent-room/decisions.md\n',
    logDiff,
  });
  assert.strictEqual(result.ok, true);
});

test('checkClosingTheLoop: fails when log touched but diff has no valid evidence', () => {
  const { checkClosingTheLoop } = loadHook();
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain: ' M src/index.js\n M .agent-room/decisions.md\n',
    logDiff: '--- a/x\n+++ b/x\n@@\n+\n',
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'insufficient-evidence');
  assert.match(result.message, /does not contain valid evidence/);
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

test('checkClosingTheLoop: runs testCommand when non-scaffold files changed and fails if testCommand exits non-zero', () => {
  const { checkClosingTheLoop } = loadHook();
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain: ' M src/index.js\n',
    testCommand: 'npm test',
    runCommand: (cmd) => {
      assert.strictEqual(cmd, 'npm test');
      return { status: 1, stdout: '', stderr: 'AssertionError: test failed\n' };
    }
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'test-verification-failed');
  assert.match(result.message, /Pre-stop test verification failed/);
  assert.match(result.message, /AssertionError: test failed/);
});

test('checkClosingTheLoop: test failure message contains test command, exit code, and trimmed output', () => {
  const { checkClosingTheLoop } = loadHook();
  const longOutput = 'x'.repeat(2000) + '\nFINAL_FAILURE_LINE';
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain: ' M src/index.js\n',
    testCommand: 'npm test',
    runCommand: () => ({ status: 2, stdout: longOutput, stderr: '' })
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'test-verification-failed');
  assert.match(result.message, /exited with code 2/);
  assert.match(result.message, /FINAL_FAILURE_LINE/);
  assert.match(result.message, /output truncated/);
  assert.ok(result.message.length < 2500, 'message should be trimmed to reasonable size');
});

test('checkClosingTheLoop: handles timeout when testCommand times out', () => {
  const { checkClosingTheLoop } = loadHook();
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain: ' M src/index.js\n',
    testCommand: 'npm test',
    timeoutMs: 5000,
    runCommand: (cmd, opts) => {
      assert.strictEqual(opts.timeout, 5000);
      return { status: null, error: { code: 'ETIMEDOUT' }, stdout: '', stderr: '' };
    }
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'test-verification-failed');
  assert.match(result.message, /timed out after 5000ms/);
});

test('checkClosingTheLoop: skips test verification when only scaffold files changed', () => {
  let commandRan = false;
  const { checkClosingTheLoop } = loadHook();
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain: ' M .agent-room/skills/foo.md\n',
    testCommand: 'npm test',
    runCommand: () => {
      commandRan = true;
      return { status: 1, stdout: '', stderr: 'fail' };
    }
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(commandRan, false);
});

test('checkClosingTheLoop: skips test verification when skipTestVerification is true', () => {
  let commandRan = false;
  const { checkClosingTheLoop } = loadHook();
  const logDiff = '+<!-- no-log: routine validation test pass -->\n';
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain: ' M src/index.js\n M .agent-room/decisions.md\n',
    logDiff,
    testCommand: 'npm test',
    skipTestVerification: true,
    runCommand: () => {
      commandRan = true;
      return { status: 1, stdout: '', stderr: 'fail' };
    }
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(commandRan, false);
});

test('checkClosingTheLoop: passes when testCommand succeeds and log evidence is valid', () => {
  let commandRan = false;
  const { checkClosingTheLoop } = loadHook();
  const logDiff = '+<!-- no-log: routine validation run -->\n';
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain: ' M src/index.js\n M .agent-room/decisions.md\n',
    logDiff,
    testCommand: 'npm test',
    runCommand: () => {
      commandRan = true;
      return { status: 0, stdout: 'All 10 tests passed\n', stderr: '' };
    }
  });
  assert.strictEqual(commandRan, true);
  assert.strictEqual(result.ok, true);
});

test('checkClosingTheLoop: proceeds to log check if testCommand succeeds but log is untouched', () => {
  let commandRan = false;
  const { checkClosingTheLoop } = loadHook();
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain: ' M src/index.js\n',
    testCommand: 'npm test',
    runCommand: () => {
      commandRan = true;
      return { status: 0, stdout: 'ok', stderr: '' };
    }
  });
  assert.strictEqual(commandRan, true);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'no-log-touch');
  assert.match(result.message, /Closing-the-loop check failed/);
});

test('checkClosingTheLoop: reads testCommand from .agent-room.json in cwd', (t) => {
  const dir = makeRepo('test-cmd-config');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, '.agent-room.json'),
    JSON.stringify({ verification: { testCommand: 'npm test' } })
  );
  let ranCommand = null;
  const { checkClosingTheLoop } = loadHook();
  const result = checkClosingTheLoop(dir, {
    statusPorcelain: ' M src/index.js\n',
    runCommand: (cmd) => {
      ranCommand = cmd;
      return { status: 1, stdout: '', stderr: 'Test suite failed' };
    }
  });
  assert.strictEqual(ranCommand, 'npm test');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'test-verification-failed');
});

test('adapter claude: fail on test verification exits 2 with stderr', (t) => {
  const dir = makeRepo('claude-test-fail');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'src.js'), 'x\n');
  fs.writeFileSync(
    path.join(dir, '.agent-room.json'),
    JSON.stringify({ verification: { testCommand: 'exit 1' } })
  );

  const result = runHookCli(dir, []);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /Pre-stop test verification failed/);
  assert.strictEqual((result.stdout || '').trim(), '');
});

test('adapter cursor: fail on test verification exits 0 with followup_message JSON', (t) => {
  const dir = makeRepo('cursor-test-fail');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'src.js'), 'x\n');
  fs.writeFileSync(
    path.join(dir, '.agent-room.json'),
    JSON.stringify({ verification: { testCommand: 'exit 1' } })
  );

  const result = runHookCli(dir, ['--adapter=cursor'], JSON.stringify({ status: 'completed', loop_count: 0 }));
  assert.strictEqual(result.status, 0);
  const payload = JSON.parse(result.stdout.trim());
  assert.match(payload.followup_message, /Pre-stop test verification failed/);
});

test('adapter claude: respects --skip-tests flag on test verification', (t) => {
  const dir = makeRepo('claude-skip-tests');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'src.js'), 'x\n');
  fs.writeFileSync(
    path.join(dir, '.agent-room.json'),
    JSON.stringify({ verification: { testCommand: 'exit 1' } })
  );

  const result = runHookCli(dir, ['--skip-tests']);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /Closing-the-loop check failed/);
  assert.doesNotMatch(result.stderr, /Pre-stop test verification failed/);
});

test('checkScopeBoundaries: allows changes when within allowedPaths', () => {
  const { checkScopeBoundaries } = loadHook();
  const result = checkScopeBoundaries(['packages/frontend/src/App.js', 'docs/readme.md'], '/tmp/unused', {
    scopeBoundaries: { allowedPaths: ['packages/frontend/**', 'docs/**'] }
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.violations.length, 0);
});

test('checkScopeBoundaries: blocks changes when a file is outside allowedPaths', () => {
  const { checkScopeBoundaries } = loadHook();
  const result = checkScopeBoundaries(['packages/frontend/src/App.js', 'packages/backend/api.js'], '/tmp/unused', {
    scopeBoundaries: { allowedPaths: ['packages/frontend/**'] }
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.violations.length, 1);
  assert.match(result.violations[0], /packages\/backend\/api\.js.*outside allowed scope/);
});

test('checkScopeBoundaries: blocks changes spanning across disallowedCrossBoundaries', () => {
  const { checkScopeBoundaries } = loadHook();
  const result = checkScopeBoundaries(
    ['packages/frontend/src/App.js', 'packages/backend/src/server.js'],
    '/tmp/unused',
    {
      scopeBoundaries: {
        disallowedCrossBoundaries: [['packages/frontend/**', 'packages/backend/**']]
      }
    }
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.violations.length, 1);
  assert.match(result.violations[0], /Cross-boundary conflict/);
});

test('checkScopeBoundaries: allows changes touching only one side of disallowedCrossBoundaries', () => {
  const { checkScopeBoundaries } = loadHook();
  const result = checkScopeBoundaries(
    ['packages/frontend/src/App.js', 'packages/frontend/src/Button.js'],
    '/tmp/unused',
    {
      scopeBoundaries: {
        disallowedCrossBoundaries: [['packages/frontend/**', 'packages/backend/**']]
      }
    }
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.violations.length, 0);
});

test('checkClosingTheLoop: returns scope-boundary-violation when scope boundaries are exceeded', () => {
  const { checkClosingTheLoop } = loadHook();
  const result = checkClosingTheLoop('/tmp/unused', {
    hasAgentRoom: true,
    isGitRepo: true,
    statusPorcelain: ' M packages/frontend/App.js\n M packages/backend/api.js\n',
    scopeBoundaries: {
      disallowedCrossBoundaries: [['packages/frontend/**', 'packages/backend/**']]
    }
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'scope-boundary-violation');
  assert.match(result.message, /Scope Boundary check failed/);
  assert.match(result.message, /scope-boundaries\.md/);
});

test('adapter claude: scope violation exits 2 with stderr remediation', (t) => {
  const dir = makeRepo('claude-scope-fail');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'app.js'), 'app\n');
  fs.writeFileSync(
    path.join(dir, '.agent-room', 'guardrails.json'),
    JSON.stringify({
      protectedPaths: [],
      forbiddenActions: [],
      scopeBoundaries: { allowedPaths: ['docs/**'] }
    })
  );

  const result = runHookCli(dir, []);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /Agent Scope Boundary check failed/);
  assert.match(result.stderr, /app\.js/);
  assert.match(result.stderr, /scope-boundaries\.md/);
});

test('adapter cursor: scope violation exits 0 with followup_message JSON', (t) => {
  const dir = makeRepo('cursor-scope-fail');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'app.js'), 'app\n');
  fs.writeFileSync(
    path.join(dir, '.agent-room', 'guardrails.json'),
    JSON.stringify({
      protectedPaths: [],
      forbiddenActions: [],
      scopeBoundaries: { allowedPaths: ['docs/**'] }
    })
  );

  const result = runHookCli(dir, ['--adapter=cursor'], JSON.stringify({ status: 'completed', loop_count: 0 }));
  assert.strictEqual(result.status, 0);
  const payload = JSON.parse(result.stdout.trim());
  assert.match(payload.followup_message, /Agent Scope Boundary check failed/);
});

test('adapter claude: respects --skip-scope flag', (t) => {
  const dir = makeRepo('claude-skip-scope');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'app.js'), 'app\n');
  fs.writeFileSync(
    path.join(dir, '.agent-room', 'guardrails.json'),
    JSON.stringify({
      protectedPaths: [],
      forbiddenActions: [],
      scopeBoundaries: { allowedPaths: ['docs/**'] }
    })
  );

  const result = runHookCli(dir, ['--skip-scope']);
  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /Closing-the-loop check failed/);
  assert.doesNotMatch(result.stderr, /Agent Scope Boundary check failed/);
});

test('checkClosingTheLoop: in strict mode, rejects un-audited waiver', (t) => {
  const { checkClosingTheLoop } = loadHook();
  const dir = makeRepo('strict-mode-nolog-reject');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.writeFileSync(
    path.join(dir, '.agent-room.json'),
    JSON.stringify({ name: 'StrictRoom', preset: 'strict' })
  );
  fs.writeFileSync(path.join(dir, 'src.js'), 'change\n');

  const result = checkClosingTheLoop(dir, {
    statusPorcelain: ' M src.js\n M .agent-room/decisions.md',
    logDiff: 'diff\n+<!-- no-log: routine change, no decision or anti-pattern worth recording -->\n'
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'insufficient-evidence');
  assert.match(result.message, /Strict governance mode is active/);
});

test('checkClosingTheLoop: in strict mode, accepts audited waiver with audit ref', (t) => {
  const { checkClosingTheLoop } = loadHook();
  const dir = makeRepo('strict-mode-nolog-accept');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.writeFileSync(
    path.join(dir, '.agent-room.json'),
    JSON.stringify({ name: 'StrictRoom', preset: 'strict' })
  );
  fs.writeFileSync(path.join(dir, 'src.js'), 'change\n');

  const result = checkClosingTheLoop(dir, {
    statusPorcelain: ' M src.js\n M .agent-room/decisions.md',
    logDiff: 'diff\n+<!-- no-log: ticket: #123 approved-by: lead - routine bump without architecture impact -->\n'
  });

  assert.strictEqual(result.ok, true);
});


