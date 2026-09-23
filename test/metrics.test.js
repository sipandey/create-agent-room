'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const {
  parseMarkdownSession,
  parseJSONSession,
  parseGuardrailsBypassLog,
  parseDecisionsLog,
  collectMetrics,
  formatJSON,
  formatCSV,
  formatMarkdown,
  formatText,
  runMetrics
} = require('../lib/metrics');

test('parseMarkdownSession: correctly parses markdown session log details', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-test-md-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const filePath = path.join(tmpDir, 'session1.md');

  const logContent = `
# Session Log: Fix OAuth Timeout

**Date:** 2025-03-15 10:30
**Agent:** Claude Code v1.0
**Classification:** Bug

## Goal
Fix oauth timeouts when calling auth service.

## Files touched
- Read: lib/auth.js, test/auth.test.js
- Created: none
- Modified: lib/auth.js

## Tests run
node --test
✔ 5 tests passed

## Outcome
Completed
  `;

  fs.writeFileSync(filePath, logContent);

  const stats = {
    total: 0,
    classifications: { Bug: 0, Enhancement: 0, Feature: 0, Product: 0 },
    outcomes: { Completed: 0, Blocked: 0, 'Handed Off': 0 },
    agents: {},
    filesRead: 0,
    filesCreated: 0,
    filesModified: 0
  };

  parseMarkdownSession(filePath, stats);

  assert.strictEqual(stats.total, 1);
  assert.strictEqual(stats.classifications.Bug, 1);
  assert.strictEqual(stats.outcomes.Completed, 1);
  assert.strictEqual(stats.agents['Claude Code v1.0'], 1);
  assert.strictEqual(stats.filesRead, 2);
  assert.strictEqual(stats.filesCreated, 0);
  assert.strictEqual(stats.filesModified, 1);
  assert.strictEqual(stats.verification.run, 1);
  assert.strictEqual(stats.verification.passed, 1);
  assert.strictEqual(stats.verification.failed, 0);
});

test('parseMarkdownSession: parses failing test verification and unrun tests', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-test-md-fail-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const file1 = path.join(tmpDir, 'session-fail.md');
  const file2 = path.join(tmpDir, 'session-none.md');

  fs.writeFileSync(
    file1,
    '# Session\n**Agent:** Test\n## Tests run\nnode --test\n✖ 2 tests failed\n## Outcome\nBlocked\n'
  );
  fs.writeFileSync(
    file2,
    '# Session\n**Agent:** Test\n## Tests run\nNone\n## Outcome\nCompleted\n'
  );

  const stats = {
    total: 0,
    classifications: { Bug: 0, Enhancement: 0, Feature: 0, Product: 0 },
    outcomes: { Completed: 0, Blocked: 0, 'Handed Off': 0 },
    agents: {},
    filesRead: 0,
    filesCreated: 0,
    filesModified: 0
  };

  parseMarkdownSession(file1, stats);
  assert.strictEqual(stats.verification.run, 1);
  assert.strictEqual(stats.verification.failed, 1);

  parseMarkdownSession(file2, stats);
  // Unrun/none should not increment run count
  assert.strictEqual(stats.verification.run, 1);
});

test('parseJSONSession: correctly parses JSON session log details and verification', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-test-json-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const filePath = path.join(tmpDir, 'session1.json');

  const jsonData = {
    date: '2025-03-16 11:15',
    agent: 'Cursor Composer',
    classification: 'Feature',
    outcome: 'Blocked',
    filesTouched: {
      read: ['lib/users.js', 'lib/billing.js'],
      created: 1,
      modified: 'lib/users.js'
    },
    testsRun: {
      passed: true,
      command: 'npm test'
    }
  };

  fs.writeFileSync(filePath, JSON.stringify(jsonData));

  const stats = {
    total: 0,
    classifications: { Bug: 0, Enhancement: 0, Feature: 0, Product: 0 },
    outcomes: { Completed: 0, Blocked: 0, 'Handed Off': 0 },
    agents: {},
    filesRead: 0,
    filesCreated: 0,
    filesModified: 0
  };

  parseJSONSession(filePath, stats);

  assert.strictEqual(stats.total, 1);
  assert.strictEqual(stats.classifications.Feature, 1);
  assert.strictEqual(stats.outcomes.Blocked, 1);
  assert.strictEqual(stats.agents['Cursor Composer'], 1);
  assert.strictEqual(stats.filesRead, 2);
  assert.strictEqual(stats.filesCreated, 1);
  assert.strictEqual(stats.filesModified, 1);
  assert.strictEqual(stats.verification.run, 1);
  assert.strictEqual(stats.verification.passed, 1);
  assert.strictEqual(stats.verification.failed, 0);
});

test('parseGuardrailsBypassLog: parses bypass categories and reason audits', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-test-bypass-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const filePath = path.join(tmpDir, 'guardrails-bypass-log.md');

  // Test missing file
  const emptyResult = parseGuardrailsBypassLog(path.join(tmpDir, 'nonexistent.md'));
  assert.strictEqual(emptyResult.total, 0);
  assert.strictEqual(emptyResult.withReason, 0);

  const logContent = `# Guardrails Bypass Log

- 2026-03-20 14:10:22 UTC | agent: Claude Code | reason: urgent hotfix for ticket #402 | bypassed: scope exceeded 5 files
- 2026-03-20 14:15:00 UTC | agent: Cursor | bypassed: protected path .agent-room/guardrails.json
- 2026-03-20 14:20:00 UTC | agent: Copilot | reason: test fixture update | bypassed: forbidden pattern API_KEY in test/fixture.js
- 2026-03-20 14:25:00 UTC | agent: Claude Code | reason: skipping pre-commit verification tests | bypassed: pre-commit verification failed
- 2026-03-20 14:30:00 UTC | agent: Human | reason: manual operational migration | bypassed: unclassified constraint
`;

  fs.writeFileSync(filePath, logContent);
  const result = parseGuardrailsBypassLog(filePath);

  assert.strictEqual(result.total, 5);
  assert.strictEqual(result.withReason, 4);
  assert.strictEqual(result.withoutReason, 1);
  assert.strictEqual(result.categories.scope, 1);
  assert.strictEqual(result.categories.protectedPath, 1);
  assert.strictEqual(result.categories.forbiddenPattern, 1);
  assert.strictEqual(result.categories.verification, 1);
  assert.strictEqual(result.categories.other, 1);
});

test('parseDecisionsLog: parses decisions from markdown', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-test-decisions-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const filePath = path.join(tmpDir, 'decisions.md');

  // Test missing file
  const emptyResult = parseDecisionsLog(path.join(tmpDir, 'nonexistent.md'));
  assert.strictEqual(emptyResult.total, 0);
  assert.deepStrictEqual(emptyResult.decisions, []);

  const mdContent = `# Architectural Decisions Log

### 2026-03-10 — Adopt Native Node Test Runner
We chose node:test over external frameworks.

### 2026-03-15 — Implement Pre-Stop Verification Gate
Enforce verification check on agent stop hook.
`;

  fs.writeFileSync(filePath, mdContent);
  const result = parseDecisionsLog(filePath);

  assert.strictEqual(result.total, 2);
  assert.strictEqual(result.decisions[0].date, '2026-03-10');
  assert.strictEqual(result.decisions[0].title, 'Adopt Native Node Test Runner');
  assert.strictEqual(result.decisions[1].date, '2026-03-15');
  assert.strictEqual(result.decisions[1].title, 'Implement Pre-Stop Verification Gate');
});

test('collectMetrics: aggregates telemetry across sessions, decisions, and bypasses', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-test-collect-' + Date.now());
  const agentRoomDir = path.join(tmpDir, '.agent-room');
  const sessionsDir = path.join(agentRoomDir, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ name: 'MyTelemetryApp' })
  );

  fs.writeFileSync(
    path.join(sessionsDir, 's1.md'),
    `# Session Log
**Date:** 2026-03-20
**Agent:** Claude Code
**Classification:** Bug
## Outcome
Completed
## Tests run
node --test
✔ 10 passed
`
  );

  fs.writeFileSync(
    path.join(sessionsDir, 's2.json'),
    JSON.stringify({
      agent: 'Cursor',
      classification: 'Feature',
      outcome: 'Completed',
      testsRun: { passed: true }
    })
  );

  fs.writeFileSync(
    path.join(agentRoomDir, 'decisions.md'),
    `### 2026-03-20 — First Decision\nDecision details.`
  );

  fs.writeFileSync(
    path.join(agentRoomDir, 'guardrails-bypass-log.md'),
    `- 2026-03-20 | reason: urgent | bypassed: scope limit\n`
  );

  const telemetry = collectMetrics(tmpDir);

  assert.strictEqual(telemetry.projectName, 'MyTelemetryApp');
  assert.strictEqual(telemetry.sessions.total, 2);
  assert.strictEqual(telemetry.sessions.outcomes.Completed, 2);
  assert.strictEqual(telemetry.verification.totalRun, 2);
  assert.strictEqual(telemetry.verification.passRate, 100);
  assert.strictEqual(telemetry.decisions.total, 1);
  assert.strictEqual(telemetry.decisions.ratePerSession, 0.5);
  assert.strictEqual(telemetry.guardrails.totalBypasses, 1);
  assert.strictEqual(telemetry.guardrails.bypassesWithReason, 1);
});

test('formatters: formatJSON, formatCSV, formatMarkdown, formatText output properly structured data', () => {
  const mockTelemetry = {
    projectName: 'DemoApp',
    target: '/path/to/DemoApp',
    sessions: {
      total: 2,
      classifications: { Bug: 1, Enhancement: 0, Feature: 1, Product: 0 },
      outcomes: { Completed: 2, Blocked: 0, 'Handed Off': 0 },
      agents: { 'Claude Code': 1, Cursor: 1 },
      filesRead: 5,
      filesCreated: 2,
      filesModified: 3,
      verification: { run: 2, passed: 2, failed: 0 }
    },
    verification: {
      totalRun: 2,
      passed: 2,
      failed: 0,
      passRate: 100
    },
    decisions: {
      total: 2,
      ratePerSession: 1.0,
      recent: [{ date: '2026-03-20', title: 'Test Decision' }]
    },
    guardrails: {
      totalBypasses: 1,
      bypassesWithReason: 1,
      bypassesWithoutReason: 0,
      categories: {
        scope: 1,
        protectedPath: 0,
        forbiddenPattern: 0,
        verification: 0,
        other: 0
      }
    }
  };

  // JSON
  const jsonStr = formatJSON(mockTelemetry);
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.projectName, 'DemoApp');
  assert.strictEqual(parsed.sessions.total, 2);

  // CSV
  const csvStr = formatCSV(mockTelemetry);
  assert.match(csvStr, /"category","metric","count","rate_or_percentage"/);
  assert.match(csvStr, /"session","total_sessions","2","100\.0%"/);
  assert.match(csvStr, /"outcome","completed","2","100\.0%"/);
  assert.match(csvStr, /"guardrails_category","scope","1"/);

  // Markdown
  const mdStr = formatMarkdown(mockTelemetry);
  assert.match(mdStr, /# Agent Room Telemetry & Governance Report — DemoApp/);
  assert.match(mdStr, /## Executive KPI Overview/);
  assert.match(mdStr, /## Outcomes & Success Rate/);
  assert.match(mdStr, /## Governance & Guardrails Compliance/);

  // Text
  const textStr = formatText(mockTelemetry);
  assert.match(textStr, /Agent Session Dashboard/);
  assert.match(textStr, /Total Sessions Logged: 2/);
  assert.match(textStr, /Test Verification & Quality/);
  assert.match(textStr, /Governance & Guardrails/);
});

test('runMetrics: handles missing and empty session directory gracefully', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-metrics-run-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Intercept console.log
  const originalLog = console.log;
  let logOutput = '';
  console.log = (msg) => {
    logOutput += msg + '\n';
  };

  try {
    // 1. Missing .agent-room/sessions/
    runMetrics(tmpDir);
    assert.match(logOutput, /No sessions directory found/);

    // Reset log output
    logOutput = '';

    // Create empty sessions directory
    fs.mkdirSync(path.join(tmpDir, '.agent-room', 'sessions'), { recursive: true });
    runMetrics(tmpDir);
    assert.match(logOutput, /No session logs found/);
  } finally {
    console.log = originalLog;
  }
});

test('runMetrics: formats output as json, csv, markdown, and writes to file when requested', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-metrics-export-' + Date.now());
  const sessionsDir = path.join(tmpDir, '.agent-room', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  fs.writeFileSync(
    path.join(sessionsDir, 'session1.json'),
    JSON.stringify({
      agent: 'Claude Code',
      classification: 'Bug',
      outcome: 'Completed',
      testsRun: { passed: true }
    })
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
    // JSON format to stdout
    logOutput = '';
    runMetrics(tmpDir, { format: 'json' });
    const jsonParsed = JSON.parse(logOutput.trim());
    assert.strictEqual(jsonParsed.sessions.total, 1);

    // CSV format to stdout
    logOutput = '';
    runMetrics(tmpDir, { format: 'csv' });
    assert.match(logOutput, /"category","metric","count","rate_or_percentage"/);

    // Markdown format to stdout
    logOutput = '';
    runMetrics(tmpDir, { format: 'markdown' });
    assert.match(logOutput, /# Agent Room Telemetry & Governance Report/);

    // Output to file
    const outFile = path.join(tmpDir, 'reports', 'metrics.json');
    logOutput = '';
    runMetrics(tmpDir, { format: 'json', output: outFile });
    assert.strictEqual(fs.existsSync(outFile), true);
    const saved = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    assert.strictEqual(saved.sessions.total, 1);
    assert.match(logOutput, /Metrics report \(json\) written to/);

    // Invalid format throws
    assert.throws(() => {
      runMetrics(tmpDir, { format: 'xml' });
    }, /Invalid format "xml"/);
  } finally {
    console.log = originalLog;
  }
});
