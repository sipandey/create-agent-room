'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const {
  parseMarkdownSession,
  parseJSONSession,
  generatePrDescription,
  generateAttestationBlock,
  generateComplianceChecklist,
  runPrDesc
} = require('../lib/pr');

test('parseMarkdownSession (PR): correctly extracts markdown log sections', () => {
  const tmpDir = path.join(__dirname, 'tmp-pr-md-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, '2025-03-15-10-30-session.md');

  const logContent = `
# Session Log: Fix Database Connection

**Date:** 2025-03-15 10:30
**Agent:** Claude 3.5 Sonnet
**Classification:** Bug

## Goal
Resolve transient database disconnects by implementing retries.

## Files touched
- Read: lib/db.js
- Modified: lib/db.js

## Actions taken
1. Inspected connection logs
2. Added retry logic inside db connector wrapper

## Tests run
Command: npm test
Result: Pass

## Decisions made
- Implement exponential backoff for DB reconnection.

## Outcome
Completed

**Handoff note (if applicable):**
None needed, fully resolved.
  `;

  fs.writeFileSync(filePath, logContent);

  const result = parseMarkdownSession(filePath);

  assert.strictEqual(result.date, '2025-03-15 10:30');
  assert.strictEqual(result.agent, 'Claude 3.5 Sonnet');
  assert.strictEqual(result.classification, 'Bug');
  assert.strictEqual(result.goal, 'Resolve transient database disconnects by implementing retries.');
  assert.strictEqual(result.filesTouched, '- Read: lib/db.js\n- Modified: lib/db.js');
  assert.strictEqual(result.actions, '1. Inspected connection logs\n2. Added retry logic inside db connector wrapper');
  assert.strictEqual(result.tests, 'Command: npm test\nResult: Pass');
  assert.strictEqual(result.decisions, '- Implement exponential backoff for DB reconnection.');
  assert.strictEqual(result.outcome, 'Completed');
  assert.strictEqual(result.handoffNote, 'None needed, fully resolved.');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('parseJSONSession (PR): correctly formats JSON log details', () => {
  const tmpDir = path.join(__dirname, 'tmp-pr-json-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, '2025-03-16-11-15-session.json');

  const jsonData = {
    date: '2025-03-16 11:15',
    agent: 'Windsurf',
    classification: 'Feature',
    outcome: 'Handed Off',
    goal: 'Create API user profiles',
    filesTouched: {
      read: ['lib/profile.js'],
      modified: ['lib/profile.js']
    },
    actions: [
      'Created routing wrapper',
      'Configured schema middleware'
    ],
    testsRun: {
      command: 'npm run test:api',
      result: 'Success (4 pass)'
    },
    decisions: [
      'Use profiles table instead of storing inside users metadata'
    ],
    handoffNote: 'Needs review on indexes.'
  };

  fs.writeFileSync(filePath, JSON.stringify(jsonData));

  const result = parseJSONSession(filePath);

  assert.strictEqual(result.date, '2025-03-16 11:15');
  assert.strictEqual(result.agent, 'Windsurf');
  assert.strictEqual(result.classification, 'Feature');
  assert.strictEqual(result.goal, 'Create API user profiles');
  assert.match(result.filesTouched, /- Read: lib\/profile\.js/);
  assert.match(result.filesTouched, /- Modified: lib\/profile\.js/);
  assert.strictEqual(result.actions, '1. Created routing wrapper\n2. Configured schema middleware');
  assert.strictEqual(result.tests, 'Command: npm run test:api\nResult: Success (4 pass)');
  assert.strictEqual(result.decisions, '- Use profiles table instead of storing inside users metadata');
  assert.strictEqual(result.outcome, 'Handed Off');
  assert.strictEqual(result.handoffNote, 'Needs review on indexes.');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('runPrDesc: selects the latest log file and generates pr description', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-run-' + Date.now());
  const sessionsDir = path.join(tmpDir, '.agent-room', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Write two session logs
  fs.writeFileSync(path.join(sessionsDir, '2025-03-15-10-30-bug.md'), `
# Session Log: Bug
**Date:** 2025-03-15 10:30
**Agent:** Sonnet
**Classification:** Bug
## Goal
Goal 1
## Outcome
Completed
  `);

  fs.writeFileSync(path.join(sessionsDir, '2025-03-16-14-00-feat.md'), `
# Session Log: Feat
**Date:** 2025-03-16 14:00
**Agent:** Claude Code
**Classification:** Feature
## Goal
Goal 2
## Outcome
Handed Off
**Handoff note (if applicable):**
Requires database credentials.
  `);

  // Intercept console.log
  const originalLog = console.log;
  let logOutput = '';
  console.log = (msg) => {
    logOutput += msg + '\n';
  };

  try {
    runPrDesc(tmpDir, { write: true });

    // Assert that the latest log was chosen (2025-03-16 version)
    assert.match(logOutput, /Goal 2/);
    assert.match(logOutput, /Claude Code/);
    assert.match(logOutput, /Feature/);
    assert.match(logOutput, /Requires database credentials/);

    // Assert that output description file was saved
    assert.ok(fs.existsSync(path.join(tmpDir, '.agent-room', 'pr-description.md')));
    const savedContent = fs.readFileSync(path.join(tmpDir, '.agent-room', 'pr-description.md'), 'utf8');
    assert.match(savedContent, /Goal 2/);
    assert.match(savedContent, /Requires database credentials/);
  } finally {
    console.log = originalLog;
  }
});

test('generateAttestationBlock: formats passing, failing, and skipped verification results', () => {
  // 1. Passing
  const passResult = {
    ok: true,
    command: 'npm test',
    exitCode: 0,
    durationMs: 120,
    output: '✔ 10 tests passed'
  };
  const passBlock = generateAttestationBlock(passResult);
  assert.match(passBlock, /### Verification Attestation Proof/);
  assert.match(passBlock, /\* \*\*Verification Command:\*\* `npm test`/);
  assert.match(passBlock, /\* \*\*Result:\*\* Passed ✅/);
  assert.match(passBlock, /\* \*\*Exit Code:\*\* `0`/);
  assert.match(passBlock, /\* \*\*Duration:\*\* `120ms`/);
  assert.match(passBlock, /<details open>/);
  assert.match(passBlock, /✔ 10 tests passed/);

  // 2. Failing
  const failResult = {
    ok: false,
    command: 'npm test',
    exitCode: 1,
    durationMs: 80,
    output: '✖ 2 tests failed'
  };
  const failBlock = generateAttestationBlock(failResult);
  assert.match(failBlock, /\* \*\*Result:\*\* FAILED ❌/);
  assert.match(failBlock, /\* \*\*Exit Code:\*\* `1`/);
  assert.match(failBlock, /<summary>Failure Output<\/summary>/);

  // 3. Skipped
  const skipResult = {
    ok: true,
    skipped: true,
    reason: 'no-verification-configured'
  };
  const skipBlock = generateAttestationBlock(skipResult);
  assert.match(skipBlock, /Skipped ⚠️ \(No verification test command configured/);

  // 4. Null / empty
  assert.strictEqual(generateAttestationBlock(null), '');
});

test('generateComplianceChecklist: generates correct checkbox states based on verification and guardrails', () => {
  // Fully compliant
  const compliantChecklist = generateComplianceChecklist({
    verifyResult: { ok: true, command: 'npm test' },
    bypassStats: { total: 0 },
    session: { decisions: 'Adopted sqlite database' },
    decisionsStats: { total: 1 }
  });

  assert.match(compliantChecklist, /## Reviewer Compliance Checklist/);
  assert.match(compliantChecklist, /- \[x\] Automated verification test suite passing \(`npm test`\)/);
  assert.match(compliantChecklist, /- \[x\] Architectural decisions documented/);
  assert.match(compliantChecklist, /- \[x\] Guardrail policies satisfied \(zero bypasses\)/);
  assert.match(compliantChecklist, /- \[x\] Session log recorded/);

  // Non-compliant / with bypass
  const bypassChecklist = generateComplianceChecklist({
    verifyResult: { ok: false, command: 'npm test' },
    bypassStats: { total: 2 },
    session: { decisions: '' },
    decisionsStats: { total: 0 }
  });

  assert.match(bypassChecklist, /- \[ \] Automated verification test suite passing/);
  assert.match(bypassChecklist, /- \[ \] Architectural decisions documented/);
  assert.match(bypassChecklist, /- \[ \] Guardrail policies satisfied \(2 auditable bypass\(es\) logged\)/);
});

test('generatePrDescription: handles both standard PR descriptions and verified/attested PR descriptions', () => {
  const session = {
    date: '2026-03-20',
    agent: 'Claude Code',
    classification: 'Feature',
    goal: 'Add payments API',
    filesTouched: '- Read: api.js',
    actions: '1. Implemented stripe routes',
    tests: 'Command: npm test',
    decisions: 'Use Stripe webhooks',
    outcome: 'Completed'
  };

  // Standard (no --verify)
  const standardPr = generatePrDescription(session, 'session1.md', { verify: false });
  assert.match(standardPr, /# Pull Request Description/);
  assert.match(standardPr, /Add payments API/);
  assert.strictEqual(standardPr.includes('Reviewer Compliance Checklist'), false);
  assert.strictEqual(standardPr.includes('Guardrails Compliance Attestation'), false);

  // With verify
  const verifiedPr = generatePrDescription(session, 'session1.md', {
    verify: true,
    verifyResult: { ok: true, command: 'npm test', exitCode: 0, durationMs: 90, output: '10 passed' },
    bypassStats: { total: 0, withReason: 0, withoutReason: 0 },
    decisionsStats: { total: 1, recent: [{ date: '2026-03-20', title: 'Adopt Webhooks' }] }
  });

  assert.match(verifiedPr, /Verification Attestation Proof/);
  assert.match(verifiedPr, /Recent Architectural Decisions/);
  assert.match(verifiedPr, /Adopt Webhooks/);
  assert.match(verifiedPr, /Guardrails Compliance Attestation/);
  assert.match(verifiedPr, /Compliant ✅ \(Zero guardrail bypasses recorded\)/);
  assert.match(verifiedPr, /Reviewer Compliance Checklist/);
  assert.match(verifiedPr, /- \[x\] Automated verification test suite passing/);
});

test('runPrDesc: executes verification with --verify and attaches attestation and checklist', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-verify-' + Date.now());
  const sessionsDir = path.join(tmpDir, '.agent-room', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({
      verification: {
        testCommand: 'node -e "console.log(\\"Tests PASSED!\\"); process.exit(0)"'
      }
    })
  );

  fs.writeFileSync(
    path.join(sessionsDir, '2026-03-20-session.md'),
    `# Session Log
**Date:** 2026-03-20
**Agent:** Cursor
**Classification:** Feature
## Goal
Implement auth token refresh
## Outcome
Completed
`
  );

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const originalLog = console.log;
  let logOutput = '';
  console.log = (msg) => {
    logOutput += msg + '\n';
  };

  try {
    const result = runPrDesc(tmpDir, { verify: true });

    assert.ok(result.verifyResult);
    assert.strictEqual(result.verifyResult.ok, true);
    assert.match(logOutput, /Verification Attestation Proof/);
    assert.match(logOutput, /Tests PASSED!/);
    assert.match(logOutput, /Reviewer Compliance Checklist/);
    assert.match(logOutput, /- \[x\] Automated verification test suite passing/);
  } finally {
    console.log = originalLog;
  }
});

test('runPrDesc: writes output to custom path via --output', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-output-' + Date.now());
  const sessionsDir = path.join(tmpDir, '.agent-room', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  fs.writeFileSync(
    path.join(sessionsDir, '2026-03-20-session.md'),
    `# Session Log
**Date:** 2026-03-20
**Agent:** Windsurf
**Classification:** Bug
## Goal
Fix null pointer
## Outcome
Completed
`
  );

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const customOut = path.join(tmpDir, 'docs', 'pr-output.md');

  const originalLog = console.log;
  let logOutput = '';
  console.log = (msg) => {
    logOutput += msg + '\n';
  };

  try {
    runPrDesc(tmpDir, { output: customOut });

    assert.ok(fs.existsSync(customOut));
    const saved = fs.readFileSync(customOut, 'utf8');
    assert.match(saved, /Fix null pointer/);
    assert.match(logOutput, /Success: PR description written to/);
  } finally {
    console.log = originalLog;
  }
});

test('runPrDesc: sets process.exitCode = 1 when --verify --strict fails', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-strict-' + Date.now());
  const sessionsDir = path.join(tmpDir, '.agent-room', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  // No verification command configured, with strict mode
  fs.writeFileSync(
    path.join(sessionsDir, '2026-03-20-session.md'),
    `# Session Log
**Date:** 2026-03-20
**Agent:** Windsurf
**Classification:** Bug
## Goal
Fix memory leak
## Outcome
Completed
`
  );

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = 0;
  });

  const originalLog = console.log;
  console.log = () => {};

  try {
    process.exitCode = 0;
    runPrDesc(tmpDir, { verify: true, strict: true });
    assert.strictEqual(process.exitCode, 1);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }
});
