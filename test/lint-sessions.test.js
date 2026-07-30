'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { runInit } = require('../lib/init');
const { runLintSessions, validateMarkdownSession, validateJSONSession } = require('../lib/lint-sessions');

test('validateMarkdownSession: passes valid markdown session', () => {
  const tmpDir = path.join(__dirname, 'tmp-lint-valid-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const sessionContent = `# Session Log: Add User API

**Date:** 2025-03-15 10:30
**Agent:** Claude 3.5 Sonnet
**Classification:** Feature

## Goal
Add user registration endpoint and database schema

## Files touched
- Read: lib/db.js
- Created: lib/auth.js
- Modified: routes/api.js

## Actions taken
1. Designed user schema with email uniqueness constraint
2. Implemented POST /register endpoint with validation
3. Added password hashing with bcrypt

## Tests run
Command: npm test
Result: 12 passed, 0 failed

## Decisions made
- Use bcrypt for password hashing (not plaintext)
- Store email in lowercase for case-insensitive lookup

## Outcome
**Status:** Completed
Ready to merge after code review.
`;

  const sessionPath = path.join(tmpDir, 'test-session.md');
  fs.writeFileSync(sessionPath, sessionContent);

  const result = validateMarkdownSession(sessionPath, 'test-session.md');
  assert.strictEqual(result.errors.length, 0, `Should have no errors, got: ${result.errors.join(', ')}`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('validateMarkdownSession: fails when Completed but Decisions made is only a placeholder', () => {
  const tmpDir = path.join(__dirname, 'tmp-lint-placeholder-decisions-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const sessionContent = `# Session Log: Test

**Date:** 2025-03-15 10:30
**Agent:** Claude
**Classification:** Bug

## Goal
Fix login bug

## Files touched
- Modified: auth.js

## Actions taken
1. Fixed timeout

## Tests run
npm test - passed

## Decisions made
None

## Outcome
**Status:** Completed
`;

  const sessionPath = path.join(tmpDir, 'test-session.md');
  fs.writeFileSync(sessionPath, sessionContent);

  const result = validateMarkdownSession(sessionPath, 'test-session.md');
  assert(
    result.errors.some((e) => e.includes('Decisions made cannot be a placeholder')),
    `expected placeholder error, got: ${result.errors.join(', ')}`
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('validateMarkdownSession: fails when required section is missing', () => {
  const tmpDir = path.join(__dirname, 'tmp-lint-missing-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const sessionContent = `# Session Log: Test

**Date:** 2025-03-15 10:30
**Agent:** Claude
**Classification:** Bug

## Goal
Fix login bug

## Files touched
- Modified: auth.js

## Actions taken
1. Fixed timeout

## Tests run
npm test - passed

## Outcome
**Status:** Completed
`;

  const sessionPath = path.join(tmpDir, 'test-session.md');
  fs.writeFileSync(sessionPath, sessionContent);

  const result = validateMarkdownSession(sessionPath, 'test-session.md');
  assert(result.errors.length > 0, 'Should have errors for missing "Decisions made"');
  assert(result.errors.some((e) => e.includes('Decisions made')));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('validateMarkdownSession: warns on invalid classification', () => {
  const tmpDir = path.join(__dirname, 'tmp-lint-badclass-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const sessionContent = `# Session Log: Test

**Date:** 2025-03-15 10:30
**Agent:** Claude
**Classification:** InvalidType

## Goal
Test session

## Files touched
- Modified: file.js

## Actions taken
1. Did something

## Tests run
Passed

## Decisions made
None

## Outcome
**Status:** Completed
`;

  const sessionPath = path.join(tmpDir, 'test-session.md');
  fs.writeFileSync(sessionPath, sessionContent);

  const result = validateMarkdownSession(sessionPath, 'test-session.md');
  assert(result.errors.some((e) => e.includes('Invalid Classification')));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('validateMarkdownSession: warns on missing files touched', () => {
  const tmpDir = path.join(__dirname, 'tmp-lint-nofiles-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const sessionContent = `# Session Log: Test

**Date:** 2025-03-15 10:30
**Agent:** Claude
**Classification:** Feature

## Goal
Add feature

## Files touched

## Actions taken
1. Did something

## Tests run
Passed

## Decisions made
- Decision 1

## Outcome
**Status:** Completed
`;

  const sessionPath = path.join(tmpDir, 'test-session.md');
  fs.writeFileSync(sessionPath, sessionContent);

  const result = validateMarkdownSession(sessionPath, 'test-session.md');
  assert(result.warnings.some((w) => w.includes('Files touched section is empty')));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('validateJSONSession: passes valid JSON session', () => {
  const tmpDir = path.join(__dirname, 'tmp-lint-json-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const sessionData = {
    date: '2025-03-15 10:30',
    agent: 'Claude',
    classification: 'Feature',
    goal: 'Add API',
    actions: ['Step 1', 'Step 2'],
    outcome: 'Completed'
  };

  const sessionPath = path.join(tmpDir, 'test-session.json');
  fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));

  const result = validateJSONSession(sessionPath, 'test-session.json');
  assert.strictEqual(result.errors.length, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('validateJSONSession: fails on missing required fields', () => {
  const tmpDir = path.join(__dirname, 'tmp-lint-json-missing-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const sessionData = {
    date: '2025-03-15 10:30',
    agent: 'Claude'
    // missing classification, goal, outcome
  };

  const sessionPath = path.join(tmpDir, 'test-session.json');
  fs.writeFileSync(sessionPath, JSON.stringify(sessionData));

  const result = validateJSONSession(sessionPath, 'test-session.json');
  assert(result.errors.length > 0);
  assert(result.errors.some((e) => e.includes('classification')));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('runLintSessions: scans sessions directory', async (t) => {
  const tmpDir = path.join(__dirname, 'tmp-lint-run-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scaffold the room
  await runInit(tmpDir, {
    yes: true,
    tools: 'none',
    name: 'LintTest',
    force: true
  });

  // Add a valid session
  const sessionsDir = path.join(tmpDir, '.agent-room', 'sessions');
  const validSession = `# Session Log: Test
**Date:** 2025-03-15 10:30
**Agent:** Claude
**Classification:** Bug

## Goal
Test goal

## Files touched
- Modified: test.js

## Actions taken
1. Tested

## Tests run
Passed

## Decisions made
- Used bcrypt for password hashing (also logged in decisions.md)

## Outcome
**Status:** Completed`;

  fs.writeFileSync(path.join(sessionsDir, '2025-03-15-10-30-test.md'), validSession);

  // Capture process.exitCode
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    runLintSessions(tmpDir);
    assert.strictEqual(process.exitCode, undefined, 'Should exit with success for valid sessions');
  } finally {
    process.exitCode = originalExitCode;
  }
});
