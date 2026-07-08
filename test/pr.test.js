'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { parseMarkdownSession, parseJSONSession, runPrDesc } = require('../lib/pr');

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
