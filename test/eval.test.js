'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadBuiltinCases,
  loadCustomCases,
  runEvalCase,
  runVerifyCase,
  runCommandCase,
  runEval,
  formatEvalReport,
  BUILTIN_EVALS_ROOT,
} = require('../lib/eval');

test('loadBuiltinCases: discovers close-the-loop and fixture-based cases', () => {
  const cases = loadBuiltinCases();
  assert.ok(cases.length >= 6, `expected at least 6 builtin cases, got ${cases.length}`);
  const suites = new Set(cases.map((c) => c.suite));
  assert.ok(suites.has('close-the-loop'));
  assert.ok(suites.has('lint-sessions'));
  assert.ok(suites.has('validate'));
});

test('loadBuiltinCases: --suite filter limits results', () => {
  const cases = loadBuiltinCases('close-the-loop');
  assert.ok(cases.length >= 3);
  assert.ok(cases.every((c) => c.suite === 'close-the-loop'));
});

test('runEval: all builtin cases pass', () => {
  const report = runEval({});
  assert.strictEqual(report.summary.failed, 0, report.cases.filter((c) => !c.passed).map((c) => c.id).join(', '));
  assert.ok(report.summary.total >= 6);
  assert.match(report.toolVersion, /^\d+\.\d+\.\d+$/);
});

test('formatEvalReport: json output is parseable', () => {
  const report = runEval({ suite: 'close-the-loop' });
  const text = formatEvalReport(report, 'json');
  const parsed = JSON.parse(text);
  assert.strictEqual(parsed.summary.total, report.summary.total);
  assert.ok(Array.isArray(parsed.cases));
});

test('formatEvalReport: csv has header and one row per case', () => {
  const report = runEval({ suite: 'close-the-loop' });
  const csv = formatEvalReport(report, 'csv');
  const lines = csv.trim().split('\n');
  assert.ok(lines[0].includes('suite,id,description'));
  assert.strictEqual(lines.length, report.cases.length + 1);
});

test('runEvalCase: detects a deliberately broken expectation', () => {
  const cases = loadBuiltinCases('close-the-loop');
  const sample = cases.find((c) => c.id === 'source-change-no-log');
  assert.ok(sample);
  const broken = { ...sample, expect: 'pass' };
  const result = runEvalCase(broken);
  assert.strictEqual(result.passed, false);
});

test('BUILTIN_EVALS_ROOT exists in the package', () => {
  assert.ok(fs.existsSync(BUILTIN_EVALS_ROOT));
  assert.ok(fs.statSync(BUILTIN_EVALS_ROOT).isDirectory());
});

test('loadCustomCases: discovers standalone *.eval.json and fixture folders in .agent-room/evals and evals/custom', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-eval-custom-'));
  try {
    const arEvals = path.join(tmpDir, '.agent-room', 'evals');
    const evalsCustom = path.join(tmpDir, 'evals', 'custom');
    fs.mkdirSync(arEvals, { recursive: true });
    fs.mkdirSync(evalsCustom, { recursive: true });

    // Standalone eval spec in .agent-room/evals
    fs.writeFileSync(
      path.join(arEvals, 'security-gate.eval.json'),
      JSON.stringify({
        id: 'security-no-eval',
        suite: 'security',
        type: 'command',
        command: "node -e 'process.exit(0)'",
        expect: 'pass',
      })
    );

    // Subdirectory with eval.json in evals/custom
    const subFixture = path.join(evalsCustom, 'schema-compliance');
    fs.mkdirSync(subFixture, { recursive: true });
    fs.writeFileSync(
      path.join(subFixture, 'eval.json'),
      JSON.stringify({
        id: 'schema-conformance',
        type: 'command',
        command: "node -e 'process.exit(0)'",
        expect: 'pass',
      })
    );

    const cases = loadCustomCases(tmpDir);
    assert.strictEqual(cases.length, 2);
    assert.ok(cases.every((c) => c.source === 'custom'));
    assert.ok(cases.find((c) => c.id === 'security-no-eval'));
    assert.ok(cases.find((c) => c.id === 'schema-conformance'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('loadCustomCases: supports explicit evalsDir and handles non-existent or empty dirs gracefully', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-eval-explicit-'));
  try {
    const explicitDir = path.join(tmpDir, 'my-org-evals');
    fs.mkdirSync(explicitDir, { recursive: true });
    fs.writeFileSync(
      path.join(explicitDir, 'check.eval.json'),
      JSON.stringify({
        id: 'org-check-1',
        type: 'command',
        command: "node -e 'process.exit(0)'",
        expect: 'pass',
      })
    );

    const cases = loadCustomCases(tmpDir, { evalsDir: explicitDir });
    assert.strictEqual(cases.length, 1);
    assert.strictEqual(cases[0].id, 'org-check-1');

    // Non-existent directory returns [] without throwing
    const emptyCases = loadCustomCases(path.join(tmpDir, 'does-not-exist'));
    assert.deepStrictEqual(emptyCases, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runEvalCase: evaluates verify and command cases (pass and fail expectations)', () => {
  // Command passing
  const passCmd = {
    id: 'cmd-pass',
    suite: 'smoke',
    type: 'command',
    command: "node -e 'process.exit(0)'",
    expect: 'pass',
  };
  const passRes = runEvalCase(passCmd);
  assert.strictEqual(passRes.passed, true);
  assert.strictEqual(passRes.error, null);

  // Command failing when expected pass
  const failCmd = {
    id: 'cmd-fail',
    suite: 'smoke',
    type: 'command',
    command: "node -e 'process.exit(1)'",
    expect: 'pass',
  };
  const failRes = runEvalCase(failCmd);
  assert.strictEqual(failRes.passed, false);
  assert.ok(failRes.error.includes('exit code 1'));

  // Command failing when expected fail
  const expectFailCmd = {
    id: 'cmd-expect-fail',
    suite: 'smoke',
    type: 'command',
    command: "node -e 'process.exit(1)'",
    expect: 'fail',
  };
  const expectFailRes = runEvalCase(expectFailCmd);
  assert.strictEqual(expectFailRes.passed, true);

  // Directly test runCommandCase
  const directCmdRes = runCommandCase(passCmd);
  assert.strictEqual(directCmdRes.passed, true);

  // Verify case (mock / non-existent targetDir with testCommand)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-eval-verify-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, '.agent-room.json'),
      JSON.stringify({ verification: { testCommand: "node -e 'process.exit(0)'" } })
    );
    const verifySpec = {
      id: 'verify-pass',
      suite: 'quality',
      type: 'verify',
      fixtureDir: tmpDir,
      expect: 'pass',
    };
    const verifyRes = runEvalCase(verifySpec);
    assert.strictEqual(verifyRes.passed, true);

    // Directly test runVerifyCase
    const directVerifyRes = runVerifyCase(verifySpec);
    assert.strictEqual(directVerifyRes.passed, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runEval: combines builtin and custom evals, and respects --custom-only and --builtin-only', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-eval-combined-'));
  try {
    const customDir = path.join(tmpDir, '.agent-room', 'evals');
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(
      path.join(customDir, 'sample.eval.json'),
      JSON.stringify({
        id: 'sample-custom-case',
        suite: 'custom-suite',
        type: 'command',
        command: "node -e 'process.exit(0)'",
        expect: 'pass',
      })
    );

    // Combined default
    const combined = runEval({ target: tmpDir });
    assert.ok(combined.summary.builtin.total > 0);
    assert.strictEqual(combined.summary.custom.total, 1);
    assert.strictEqual(combined.summary.total, combined.summary.builtin.total + 1);
    assert.strictEqual(combined.summary.failed, 0);

    // Custom only
    const customOnly = runEval({ target: tmpDir, customOnly: true });
    assert.strictEqual(customOnly.summary.builtin.total, 0);
    assert.strictEqual(customOnly.summary.custom.total, 1);
    assert.strictEqual(customOnly.cases.length, 1);
    assert.strictEqual(customOnly.cases[0].id, 'sample-custom-case');

    // Builtin only
    const builtinOnly = runEval({ target: tmpDir, builtinOnly: true });
    assert.ok(builtinOnly.summary.builtin.total > 0);
    assert.strictEqual(builtinOnly.summary.custom.total, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('formatEvalReport: formats custom evals with breakdown in text and csv', () => {
  const report = {
    toolVersion: '2.4.0',
    ranAt: new Date().toISOString(),
    summary: {
      total: 2,
      passed: 2,
      failed: 0,
      builtin: { total: 1, passed: 1, failed: 0 },
      custom: { total: 1, passed: 1, failed: 0 },
    },
    cases: [
      {
        suite: 'close-the-loop',
        id: 'builtin-1',
        description: 'builtin case',
        source: 'builtin',
        passed: true,
        expected: 'pass',
        durationMs: 5,
        error: null,
      },
      {
        suite: 'org-audit',
        id: 'custom-1',
        description: 'custom audit',
        source: 'custom',
        passed: true,
        expected: 'pass',
        durationMs: 8,
        error: null,
      },
    ],
  };

  const text = formatEvalReport(report, 'text');
  assert.ok(text.includes('1/1 builtin, 1/1 custom'));
  assert.ok(text.includes('org-audit (custom)'));

  const csv = formatEvalReport(report, 'csv');
  assert.ok(csv.includes('suite,id,description,source,passed'));
  assert.ok(csv.includes('builtin-1'));
  assert.ok(csv.includes('custom-1'));
  assert.ok(csv.includes(',builtin,'));
  assert.ok(csv.includes(',custom,'));
});

test('CLI: eval command runs successfully and produces json output', () => {
  const { execFileSync } = require('node:child_process');
  const cliPath = path.join(__dirname, '..', 'bin', 'cli.js');
  const output = execFileSync('node', [cliPath, 'eval', '--format', 'json', '--suite', 'close-the-loop'], {
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output);
  assert.strictEqual(parsed.summary.failed, 0);
  assert.ok(parsed.summary.total > 0);
  assert.ok(parsed.summary.builtin.total > 0);
});

