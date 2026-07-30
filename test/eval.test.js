'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const {
  loadBuiltinCases,
  runEvalCase,
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
