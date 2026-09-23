'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync, execSync } = require('node:child_process');
const { createSession, runSessionCli } = require('../lib/session');
const { validateMarkdownSession, validateJSONSession } = require('../lib/lint-sessions');

const CLI_PATH = path.join(__dirname, '..', 'bin', 'cli.js');

test('createSession: creates a lint-compliant markdown session by default', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-session-test-'));
  try {
    const res = createSession(tmpDir, 'feature-auth', { dryRun: true });
    assert.strictEqual(res.dryRun, true);
    assert.ok(res.content.includes('# Session Log: feature-auth'));
    assert.ok(res.content.includes('## Goal'));
    assert.ok(res.content.includes('## Files touched'));
    assert.ok(res.content.includes('## Actions taken'));
    assert.ok(res.content.includes('## Tests run'));
    assert.ok(res.content.includes('## Decisions made'));
    assert.ok(res.content.includes('## Outcome'));

    const testFile = path.join(tmpDir, 'test-session.md');
    fs.writeFileSync(testFile, res.content, 'utf8');
    const validation = validateMarkdownSession(testFile, 'test-session.md');
    assert.strictEqual(validation.errors.length, 0, `Errors: ${validation.errors.join(', ')}`);
    assert.strictEqual(validation.warnings.length, 0, `Warnings: ${validation.warnings.join(', ')}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createSession: creates a lint-compliant JSON session when json option is enabled', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-session-json-test-'));
  try {
    const res = createSession(tmpDir, 'api-refactor', { dryRun: true, json: true });
    assert.strictEqual(res.dryRun, true);
    const parsed = JSON.parse(res.content);
    assert.strictEqual(parsed.classification, 'Enhancement');
    assert.ok(Array.isArray(parsed.actions) && parsed.actions.length > 0);

    const testFile = path.join(tmpDir, 'test-session.json');
    fs.writeFileSync(testFile, res.content, 'utf8');
    const validation = validateJSONSession(testFile, 'test-session.json');
    assert.strictEqual(validation.errors.length, 0, `Errors: ${validation.errors.join(', ')}`);
    assert.strictEqual(validation.warnings.length, 0, `Warnings: ${validation.warnings.join(', ')}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createSession: respects custom metadata (goal, classification, status, agent, handoff)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-session-meta-test-'));
  try {
    const res = createSession(tmpDir, {
      name: 'fix-memory-leak',
      goal: 'Resolve memory leak in event listener registry',
      classification: 'Bug',
      status: 'Handed Off',
      agent: 'Agent Alpha',
      handoff: 'Continue profiling node heap with memlab',
      dryRun: true
    });

    assert.ok(res.content.includes('**Agent:** Agent Alpha'));
    assert.ok(res.content.includes('**Classification:** Bug'));
    assert.ok(res.content.includes('Resolve memory leak in event listener registry'));
    assert.ok(res.content.includes('**Status:** Handed Off'));
    assert.ok(res.content.includes('Continue profiling node heap with memlab'));

    const testFile = path.join(tmpDir, 'test-session.md');
    fs.writeFileSync(testFile, res.content, 'utf8');
    const validation = validateMarkdownSession(testFile, 'test-session.md');
    assert.strictEqual(validation.errors.length, 0, `Errors: ${validation.errors.join(', ')}`);
    assert.strictEqual(validation.warnings.length, 0, `Warnings: ${validation.warnings.join(', ')}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createSession: writes session file to .agent-room/sessions/ when dryRun is false', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-session-write-test-'));
  try {
    const res = createSession(tmpDir, 'write-test');
    assert.ok(res.path);
    assert.ok(fs.existsSync(res.path));
    assert.ok(res.path.includes('.agent-room/sessions/'));
    assert.ok(res.path.endsWith('-write-test.md'));

    const content = fs.readFileSync(res.path, 'utf8');
    assert.ok(content.includes('# Session Log: write-test'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createSession: writes session file to custom --output path', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-session-custom-out-'));
  try {
    const customPath = path.join(tmpDir, 'custom', 'my-log.md');
    const res = createSession(tmpDir, 'custom-test', { output: customPath });
    assert.strictEqual(res.path, customPath);
    assert.ok(fs.existsSync(customPath));

    const content = fs.readFileSync(customPath, 'utf8');
    assert.ok(content.includes('# Session Log: custom-test'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createSession: --record captures git status, recent commits, and decisions.md', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-session-record-test-'));
  try {
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test Bot"', { cwd: tmpDir, stdio: 'ignore' });

    // Initial commit
    const docFile = path.join(tmpDir, 'README.md');
    fs.writeFileSync(docFile, '# Test Project\n', 'utf8');
    execSync('git add README.md && git commit -m "feat: initial commit for project"', { cwd: tmpDir, stdio: 'ignore' });

    // Create .agent-room/decisions.md
    const agentRoomDir = path.join(tmpDir, '.agent-room');
    fs.mkdirSync(agentRoomDir, { recursive: true });
    const decisionsContent = '# Architectural Decisions\n\n## 2026-09-23: use sqlite for session indexing\nWe chose sqlite for fast structured queries.\n';
    fs.writeFileSync(path.join(agentRoomDir, 'decisions.md'), decisionsContent, 'utf8');

    // Create a modified file and a new file in working directory
    fs.appendFileSync(docFile, 'Updated content\n', 'utf8');
    const newFile = path.join(tmpDir, 'service.js');
    fs.writeFileSync(newFile, 'module.exports = {};\n', 'utf8');

    const res = createSession(tmpDir, { record: true, dryRun: true });
    assert.ok(res.content.includes('README.md'));
    assert.ok(res.content.includes('service.js'));
    assert.ok(res.content.includes('initial commit for project'));
    assert.ok(res.content.includes('use sqlite for session indexing'));

    const testFile = path.join(tmpDir, 'recorded.md');
    fs.writeFileSync(testFile, res.content, 'utf8');
    const validation = validateMarkdownSession(testFile, 'recorded.md');
    assert.strictEqual(validation.errors.length, 0, `Errors: ${validation.errors.join(', ')}`);
    assert.strictEqual(validation.warnings.length, 0, `Warnings: ${validation.warnings.join(', ')}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runSessionCli: prints dry-run output cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-session-cli-test-'));
  try {
    let captured = '';
    const origLog = console.log;
    console.log = (msg) => { captured += (msg || '') + '\n'; };
    try {
      const exitCode = runSessionCli(tmpDir, { name: 'cli-run', dryRun: true });
      assert.strictEqual(exitCode, 0);
      assert.ok(captured.includes('# Session Log: cli-run'));
    } finally {
      console.log = origLog;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI: node bin/cli.js session <name> --dry-run prints compliant markdown', () => {
  const output = execFileSync('node', [CLI_PATH, 'session', 'my-test-feature', '--dry-run'], {
    encoding: 'utf8'
  });
  assert.ok(output.includes('# Session Log: my-test-feature'));
  assert.ok(output.includes('## Goal'));
  assert.ok(output.includes('## Outcome'));
});

test('CLI: node bin/cli.js session <name> --json --dry-run prints valid JSON', () => {
  const output = execFileSync('node', [CLI_PATH, 'session', 'json-feature', '--json', '--dry-run'], {
    encoding: 'utf8'
  });
  const parsed = JSON.parse(output);
  assert.strictEqual(parsed.classification, 'Feature');
  assert.ok(Array.isArray(parsed.actions));
});
