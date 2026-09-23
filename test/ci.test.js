'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { runInit } = require('../lib/init');
const {
  runCi,
  formatCiReport,
  resolveChecksToRun,
  runCiCli,
} = require('../lib/ci');

test('resolveChecksToRun: defaults to all checks', () => {
  const checks = resolveChecksToRun({});
  assert.deepStrictEqual(checks, ['validate', 'doctor', 'sessions', 'verify', 'eval']);
});

test('resolveChecksToRun: skips specified checks', () => {
  const checks = resolveChecksToRun({ skipVerify: true, skipDoctor: true });
  assert.deepStrictEqual(checks, ['validate', 'sessions', 'eval']);
});

test('resolveChecksToRun: supports dashed skip flags', () => {
  const checks = resolveChecksToRun({ 'skip-eval': true, 'skip-sessions': true });
  assert.deepStrictEqual(checks, ['validate', 'doctor', 'verify']);
});

test('resolveChecksToRun: supports only list or flags', () => {
  const checks1 = resolveChecksToRun({ onlyValidate: true });
  assert.deepStrictEqual(checks1, ['validate']);

  const checks2 = resolveChecksToRun({ only: 'validate,verify' });
  assert.deepStrictEqual(checks2, ['validate', 'verify']);

  const checks3 = resolveChecksToRun({ onlySessions: true });
  assert.deepStrictEqual(checks3, ['sessions']);
});

test('runCi: passes on a freshly scaffolded clean room', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-ci-clean-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, {
    yes: true,
    tools: 'none',
    name: 'CiCleanRoom',
    force: true,
    noTestCommand: true,
  });

  const report = runCi(tmpDir, { skipVerify: true });
  assert.strictEqual(report.ok, true, 'Report should be ok');
  assert.strictEqual(report.summary.failed, 0, 'Failed checks should be 0');
  assert.strictEqual(report.checks.validate.ok, true, 'Validate check should pass');
  assert.strictEqual(report.checks.doctor.ok, true, 'Doctor check should pass');
  assert.strictEqual(report.checks.sessions.ok, true, 'Sessions check should pass');
  assert.strictEqual(report.checks.eval.ok, true, 'Eval check should pass');
  assert.strictEqual(report.checks.verify.skipped, true, 'Verify check should be skipped');
});

test('runCi: fails when validate detects invalid guardrails schema', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-ci-val-fail-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, {
    yes: true,
    tools: 'none',
    name: 'CiValFailRoom',
    force: true,
    noTestCommand: true,
  });

  // Corrupt guardrails.json
  const guardrailsPath = path.join(tmpDir, '.agent-room', 'guardrails.json');
  fs.writeFileSync(guardrailsPath, '{"protectedPaths": "not-an-array"}');

  const report = runCi(tmpDir, { onlyValidate: true });
  assert.strictEqual(report.ok, false, 'Report should be failed');
  assert.strictEqual(report.checks.validate.ok, false, 'Validate should fail');
  assert(report.checks.validate.errors.length > 0, 'Should have validate errors');
  assert.strictEqual(report.summary.failed, 1, 'Should record 1 failure');
});

test('runCi: fails when lint-sessions detects invalid session log', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-ci-sess-fail-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, {
    yes: true,
    tools: 'none',
    name: 'CiSessFailRoom',
    force: true,
    noTestCommand: true,
  });

  // Write an invalid session file (missing required sections)
  const sessionPath = path.join(tmpDir, '.agent-room', 'sessions', '2026-09-23-invalid.md');
  fs.writeFileSync(sessionPath, '# Session Log: Bad\n\nNo required sections here.');

  const report = runCi(tmpDir, { skipVerify: true, skipEval: true });
  assert.strictEqual(report.ok, false, 'Report should be failed');
  assert.strictEqual(report.checks.sessions.ok, false, 'Sessions check should fail');
  assert(report.checks.sessions.errors.length > 0, 'Should have session errors');
});

test('runCi: executes verify check and reports failure on non-zero exit', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-ci-ver-fail-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, {
    yes: true,
    tools: 'none',
    name: 'CiVerFailRoom',
    force: true,
    noTestCommand: true,
  });

  const report = runCi(tmpDir, {
    onlyVerify: true,
    testCommand: 'node -e "process.exit(1)"',
  });

  assert.strictEqual(report.ok, false, 'Report should fail on verify failure');
  assert.strictEqual(report.checks.verify.ok, false, 'Verify check should fail');
  assert.strictEqual(report.checks.verify.exitCode, 1, 'Exit code should be 1');
});

test('formatCiReport: supports json format', () => {
  const sampleReport = {
    ok: true,
    version: '2.5.0',
    target: '/test/dir',
    durationMs: 42,
    checks: {
      validate: { ok: true, skipped: false, durationMs: 10, errors: [], warnings: [] },
      doctor: { ok: true, skipped: false, durationMs: 8, critical: [], advisory: [] },
      sessions: { ok: true, skipped: false, durationMs: 5, filesScanned: 1, errors: [], warnings: [] },
      verify: { ok: true, skipped: true, durationMs: 0, command: null, exitCode: 0, output: '' },
      eval: { ok: true, skipped: true, durationMs: 0, passedCount: 0, failedCount: 0, total: 0, cases: [] },
    },
    summary: { total: 5, executed: 3, passed: 3, failed: 0, skipped: 2 },
  };

  const jsonStr = formatCiReport(sampleReport, 'json');
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.durationMs, 42);
});

test('formatCiReport: supports markdown format with failure diagnostics', () => {
  const failedReport = {
    ok: false,
    version: '2.5.0',
    target: '/test/dir',
    durationMs: 95,
    strict: true,
    checks: {
      validate: { ok: false, skipped: false, durationMs: 15, errors: ['guardrails.json invalid'], warnings: [] },
      doctor: { ok: true, skipped: false, durationMs: 10, critical: [], advisory: [] },
      sessions: { ok: false, skipped: false, durationMs: 5, filesScanned: 1, errors: ['Missing Goal section'], warnings: [] },
      verify: { ok: false, skipped: false, durationMs: 35, command: 'npm test', exitCode: 1, output: 'AssertionError' },
      eval: { ok: false, skipped: false, durationMs: 30, passedCount: 7, failedCount: 1, total: 8, cases: [{ id: 'case-1', error: 'Timed out' }] },
    },
    summary: { total: 5, executed: 5, passed: 1, failed: 4, skipped: 0 },
  };

  const md = formatCiReport(failedReport, 'markdown');
  assert(md.includes('## 🛡️ Agent-Room CI Status: FAILED ❌'), 'Header should be FAILED');
  assert(md.includes('### ⚠️ Failure Diagnostics'), 'Should include diagnostics section');
  assert(md.includes('guardrails.json invalid'), 'Should include validate error');
  assert(md.includes('Missing Goal section'), 'Should include session error');
  assert(md.includes('AssertionError'), 'Should include verify error output');
  assert(md.includes('case-1'), 'Should include eval error');
});

test('formatCiReport: supports text format with ANSI badges', () => {
  const cleanReport = {
    ok: true,
    version: '2.5.0',
    target: '/test/dir',
    durationMs: 50,
    strict: false,
    checks: {
      validate: { ok: true, skipped: false, durationMs: 10, errors: [], warnings: [] },
      doctor: { ok: true, skipped: false, durationMs: 10, critical: [], advisory: [] },
      sessions: { ok: true, skipped: false, durationMs: 10, filesScanned: 2, errors: [], warnings: [] },
      verify: { ok: true, skipped: false, durationMs: 10, command: 'npm test', exitCode: 0, output: '' },
      eval: { ok: true, skipped: false, durationMs: 10, passedCount: 5, failedCount: 0, total: 5, cases: [] },
    },
    summary: { total: 5, executed: 5, passed: 5, failed: 0, skipped: 0 },
  };

  const text = formatCiReport(cleanReport, 'text');
  assert(text.includes('create-agent-room CI Runner'), 'Should include banner');
  assert(text.includes('Result: PASSED'), 'Should include passed footer');
});

test('runCiCli: writes output to file and step summary when requested', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-ci-cli-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, {
    yes: true,
    tools: 'none',
    name: 'CiCliRoom',
    force: true,
    noTestCommand: true,
  });

  const outputFile = path.join(tmpDir, 'ci-report.json');
  const summaryFile = path.join(tmpDir, 'step-summary.md');

  const exitCode = runCiCli(tmpDir, {
    format: 'json',
    output: outputFile,
    summary: summaryFile,
    skipVerify: true,
  });

  assert.strictEqual(exitCode, 0, 'Exit code should be 0');
  assert(fs.existsSync(outputFile), 'Output file should be created');
  assert(fs.existsSync(summaryFile), 'Summary file should be created');

  const parsedJson = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  assert.strictEqual(parsedJson.ok, true);

  const summaryContent = fs.readFileSync(summaryFile, 'utf8');
  assert(summaryContent.includes('## 🛡️ Agent-Room CI Status: PASSED ✅'));
});

test('CLI: node bin/cli.js ci executes via command line and returns 0', () => {
  const cliPath = path.join(__dirname, '..', 'bin', 'cli.js');
  const repoRoot = path.join(__dirname, '..');

  const result = spawnSync('node', [cliPath, 'ci', repoRoot, '--skip-verify'], {
    encoding: 'utf8',
  });

  assert.strictEqual(result.status, 0, `Expected 0 exit, stderr: ${result.stderr}`);
  assert(result.stdout.includes('create-agent-room CI Runner'), 'Should show CI runner banner');
  assert(result.stdout.includes('Result: PASSED'), 'Should report PASSED');
});
