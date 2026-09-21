'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const CLI_PATH = path.join(__dirname, '..', 'bin', 'cli.js');
const { verifyProject } = require('../lib/verify');

function makeTmpDir(prefix) {
  const dir = path.join(__dirname, `tmp-verify-${prefix}-` + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('verifyProject: passes when testCommand succeeds', () => {
  const tmpDir = makeTmpDir('pass');
  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ verification: { testCommand: 'npm test' } })
  );

  let ranCmd = null;
  const result = verifyProject(tmpDir, {
    runCommand: (cmd) => {
      ranCmd = cmd;
      return { status: 0, stdout: '10 passed\n', stderr: '' };
    }
  });

  assert.strictEqual(ranCmd, 'npm test');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.exitCode, 0);
  assert.strictEqual(result.command, 'npm test');
  assert.match(result.output, /10 passed/);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('verifyProject: fails when testCommand exits non-zero', () => {
  const tmpDir = makeTmpDir('fail');
  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ verification: { testCommand: 'npm test' } })
  );

  const result = verifyProject(tmpDir, {
    runCommand: () => ({ status: 1, stdout: '', stderr: 'AssertionError: test failed\n' })
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.exitCode, 1);
  assert.match(result.output, /AssertionError: test failed/);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('verifyProject: handles timeout when command exceeds timeoutMs', () => {
  const tmpDir = makeTmpDir('timeout');
  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ verification: { testCommand: 'npm test' } })
  );

  const result = verifyProject(tmpDir, {
    timeout: 5000,
    runCommand: (cmd, opts) => {
      assert.strictEqual(opts.timeout, 5000);
      return { status: null, error: { code: 'ETIMEDOUT' }, stdout: '', stderr: '' };
    }
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.timedOut, true);
  assert.strictEqual(result.exitCode, 124);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('verifyProject: reports skipped when no verification command configured (non-strict)', () => {
  const tmpDir = makeTmpDir('no-cmd');
  fs.writeFileSync(path.join(tmpDir, '.agent-room.json'), JSON.stringify({}));

  const result = verifyProject(tmpDir);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.skipped, true);
  assert.strictEqual(result.reason, 'no-verification-configured');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('verifyProject: fails when no verification command configured under --strict', () => {
  const tmpDir = makeTmpDir('no-cmd-strict');
  fs.writeFileSync(path.join(tmpDir, '.agent-room.json'), JSON.stringify({}));

  const result = verifyProject(tmpDir, { strict: true });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'no-verification-configured');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('verifyProject: falls back to auto-detected testCommand if not in .agent-room.json', () => {
  const tmpDir = makeTmpDir('auto-detect');
  fs.writeFileSync(path.join(tmpDir, '.agent-room.json'), JSON.stringify({ language: 'rust' }));
  fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[package]');

  let ranCmd = null;
  const result = verifyProject(tmpDir, {
    runCommand: (cmd) => {
      ranCmd = cmd;
      return { status: 0, stdout: 'cargo ok', stderr: '' };
    }
  });

  assert.strictEqual(ranCmd, 'cargo test');
  assert.strictEqual(result.ok, true);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('verify CLI: executes verify and returns 0 on pass', (t) => {
  const tmpDir = makeTmpDir('cli-pass');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ verification: { testCommand: 'node -e "process.exit(0)"' } })
  );

  const res = spawnSync('node', [CLI_PATH, 'verify', tmpDir], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0);
  assert.match(res.stdout, /Verification PASSED/);
});

test('verify CLI: executes verify and returns 1 on fail', (t) => {
  const tmpDir = makeTmpDir('cli-fail');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ verification: { testCommand: 'node -e "process.exit(1)"' } })
  );

  const res = spawnSync('node', [CLI_PATH, 'verify', tmpDir], { encoding: 'utf8' });
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /Verification FAILED/);
});

test('verify CLI: supports --format json and writes output', (t) => {
  const tmpDir = makeTmpDir('cli-json');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ verification: { testCommand: 'node -e "console.log(123)"' } })
  );

  const res = spawnSync('node', [CLI_PATH, 'verify', tmpDir, '--format=json'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0);
  const payload = JSON.parse(res.stdout.trim());
  assert.strictEqual(payload.ok, true);
  assert.strictEqual(payload.exitCode, 0);
  assert.match(payload.output, /123/);
});
