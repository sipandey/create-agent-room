'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { runInit } = require('../lib/init');
const { collectFindings } = require('../lib/checks');

// lib/validate.js and lib/doctor.js both build on collectFindings() - these
// tests cover it directly as a pure function (no console output, no
// process.exitCode) so both callers can trust its return shape without
// re-testing the underlying checks themselves. test/validate.test.js still
// covers runValidate()'s printing/exit-code behavior end to end.

test('collectFindings: returns no errors or warnings for a cleanly scaffolded full-profile room', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-checks-clean-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'none', name: 'ChecksCleanTest', profile: 'full', force: true });

  const { errors, warnings } = collectFindings(tmpDir);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(warnings, []);
});

test('collectFindings: reports principles/workflow-classifier/coordination as warnings (not errors) for a minimal-profile room', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-checks-minimal-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'none', name: 'ChecksMinimalTest', force: true });

  const { errors, warnings } = collectFindings(tmpDir);
  assert.deepStrictEqual(errors, []);
  assert.ok(warnings.includes('Recommended file not found: .agent-room/principles.md'));
  assert.ok(warnings.includes('Recommended file not found: .agent-room/workflow-classifier.md'));
  assert.ok(warnings.includes('Recommended directory not found: .agent-room/coordination'));
});

test('collectFindings: reports missing required files as errors', () => {
  const tmpDir = path.join(__dirname, 'tmp-checks-empty-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const { errors } = collectFindings(tmpDir);
    assert.ok(errors.includes('Missing required file: AGENTS.md'));
    assert.ok(errors.includes('Missing required file: .agent-room.json'));
    assert.ok(errors.includes('Missing required directory: .agent-room'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('collectFindings: flags an invalid guardrails.json forbiddenActions entry', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-checks-badguardrails-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await runInit(tmpDir, { yes: true, tools: 'none', name: 'ChecksBadGuardrailsTest', force: true });

  const guardrailsPath = path.join(tmpDir, '.agent-room', 'guardrails.json');
  const guardrails = JSON.parse(fs.readFileSync(guardrailsPath, 'utf8'));
  guardrails.forbiddenActions.push({ pattern: '(', type: 'regex', description: 'broken regex' });
  fs.writeFileSync(guardrailsPath, JSON.stringify(guardrails, null, 2));

  const { errors } = collectFindings(tmpDir);
  assert.ok(errors.some((e) => e.includes('is not a valid regex')));
});
