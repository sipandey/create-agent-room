'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const {
  isPathProtected,
  normalizeForbiddenEntry,
  detectRuleWeakening,
  resolveBaseRef,
  auditPullRequest,
} = require('../lib/pr-audit');

test('isPathProtected: checks exact matches and glob wildcards', () => {
  assert.strictEqual(isPathProtected('.agent-room/guardrails.json', '.agent-room/guardrails.json'), true);
  assert.strictEqual(isPathProtected('.agent-room/skills/foo.md', '.agent-room/skills/*'), true);
  assert.strictEqual(isPathProtected('src/lib/index.js', '.agent-room/guardrails.json'), false);
  assert.strictEqual(isPathProtected('.agent-room/sub/file.js', '.agent-room'), true);
});

test('normalizeForbiddenEntry: normalizes string and object entries', () => {
  const normStr = normalizeForbiddenEntry('rm -rf');
  assert.strictEqual(normStr.pattern, 'rm -rf');
  assert.strictEqual(normStr.type, 'literal');

  const normRegex = normalizeForbiddenEntry('/(eval|Function)/');
  assert.strictEqual(normRegex.type, 'regex');

  const normObj = normalizeForbiddenEntry({ pattern: 'sudo', type: 'regex', description: 'No sudo' });
  assert.strictEqual(normObj.pattern, 'sudo');
  assert.strictEqual(normObj.type, 'regex');
  assert.strictEqual(normObj.label, 'No sudo');

  const normNull = normalizeForbiddenEntry(null);
  assert.strictEqual(normNull.pattern, null);
});

test('resolveBaseRef: resolves candidate or environment ref', () => {
  const ref = resolveBaseRef(process.cwd(), { base: 'HEAD' });
  assert.strictEqual(ref, 'HEAD');

  const origEnv = process.env.GITHUB_BASE_REF;
  delete process.env.GITHUB_BASE_REF;
  try {
    const noRef = resolveBaseRef(process.cwd(), {});
    assert.strictEqual(noRef, null);
  } finally {
    if (origEnv !== undefined) process.env.GITHUB_BASE_REF = origEnv;
  }
});

test('detectRuleWeakening: returns empty array when rules are unchanged or strengthened', () => {
  const head = {
    protectedPaths: ['.agent-room/guardrails.json', 'package.json'],
    forbiddenActions: ['eval(', { pattern: 'execSync(', type: 'regex' }],
    scopeGuidance: { maxFilesPerChange: 10, maxLinesPerChange: 500 },
    importBoundaries: [{ source: 'src/lib', disallowed: ['src/cli'] }],
    scopeBoundaries: {
      allowedPaths: ['src/**'],
      disallowedCrossBoundaries: [['src/frontend', 'src/backend']],
    },
    verifyOnCommit: true,
    strictWaivers: true,
  };

  const current = {
    protectedPaths: ['.agent-room/guardrails.json', 'package.json', 'SECURITY.md'],
    forbiddenActions: ['eval(', { pattern: 'execSync(', type: 'regex' }, 'Function('],
    scopeGuidance: { maxFilesPerChange: 5, maxLinesPerChange: 250 },
    importBoundaries: [
      { source: 'src/lib', disallowed: ['src/cli', 'src/admin'] },
    ],
    scopeBoundaries: {
      allowedPaths: ['src/**'],
      disallowedCrossBoundaries: [['src/frontend', 'src/backend']],
    },
    verifyOnCommit: true,
    strictWaivers: true,
  };

  const violations = detectRuleWeakening(head, current);
  assert.strictEqual(violations.length, 0, 'Strengthening rules should have 0 violations');
});

test('detectRuleWeakening: catches protectedPaths removals', () => {
  const head = {
    protectedPaths: ['.agent-room/guardrails.json', 'package.json'],
  };
  const current = {
    protectedPaths: ['package.json'],
  };

  const violations = detectRuleWeakening(head, current, '.agent-room/guardrails.json');
  assert(violations.length >= 1, 'Should detect protectedPath removal');
  assert(
    violations.some((v) => v.includes('Protected path violation: .agent-room/guardrails.json')),
    'Should highlight guardrails.json unprotection'
  );
});

test('detectRuleWeakening: catches forbiddenActions removals and downgrades', () => {
  const head = {
    forbiddenActions: ['dangerCall()', { pattern: 'execFileSync', type: 'regex' }],
  };
  const current = {
    forbiddenActions: [{ pattern: 'execFileSync', type: 'literal' }],
  };

  const violations = detectRuleWeakening(head, current);
  assert(
    violations.some((v) => v.includes('dangerCall()') && v.includes('was removed')),
    'Should detect pattern removal'
  );
  assert(
    violations.some((v) => v.includes('downgraded from regex to literal')),
    'Should detect regex downgrade'
  );
});

test('detectRuleWeakening: catches scopeGuidance loosening', () => {
  const head = {
    scopeGuidance: { maxFilesPerChange: 10, maxLinesPerChange: 500 },
  };

  const currentLoosened = {
    scopeGuidance: { maxFilesPerChange: 50, maxLinesPerChange: 5000 },
  };
  const violationsLoosened = detectRuleWeakening(head, currentLoosened);
  assert.strictEqual(violationsLoosened.length, 2);
  assert(violationsLoosened[0].includes('increased from 10 to 50'));
  assert(violationsLoosened[1].includes('increased from 500 to 5000'));

  const currentRemoved = { scopeGuidance: {} };
  const violationsRemoved = detectRuleWeakening(head, currentRemoved);
  assert.strictEqual(violationsRemoved.length, 2);
  assert(violationsRemoved[0].includes('maxFilesPerChange was removed'));
  assert(violationsRemoved[1].includes('maxLinesPerChange was removed'));
});

test('detectRuleWeakening: catches importBoundaries and scopeBoundaries loosening', () => {
  const head = {
    importBoundaries: [{ source: 'src/lib', disallowed: ['src/cli', 'src/db'] }],
    scopeBoundaries: {
      allowedPaths: ['src/**', 'tests/**'],
      disallowedCrossBoundaries: [['moduleA', 'moduleB']],
    },
  };
  const current = {
    importBoundaries: [{ source: 'src/lib', disallowed: ['src/cli'] }], // dropped src/db
    scopeBoundaries: {
      allowedPaths: ['src/**'], // dropped tests/**
      disallowedCrossBoundaries: [], // dropped cross boundaries
    },
  };

  const violations = detectRuleWeakening(head, current);
  assert(violations.some((v) => v.includes('dropped disallowed import "src/db"')));
  assert(violations.some((v) => v.includes('scopeBoundaries.allowedPaths dropped "tests/**"')));
  assert(violations.some((v) => v.includes('scopeBoundaries.disallowedCrossBoundaries group [moduleA, moduleB] was removed')));
});

test('detectRuleWeakening: catches verifyOnCommit and strictWaivers disabling', () => {
  const head = {
    verifyOnCommit: true,
    strictWaivers: true,
  };
  const current = {
    verifyOnCommit: false,
    strictWaivers: false,
  };

  const violations = detectRuleWeakening(head, current);
  assert(violations.some((v) => v.includes('verifyOnCommit was disabled or removed')));
  assert(violations.some((v) => v.includes('strict waiver auditing was disabled or removed')));
});

// Git-based Integration Tests
function initGitRepo(dir) {
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Tester'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir, stdio: 'ignore' });
}

function commitAll(dir, message) {
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', message], { cwd: dir, stdio: 'ignore' });
}

test('auditPullRequest: returns skipped when no baseRef is found or not a git repo', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-nobase-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // Non-git directory skips
  const resNonGit = auditPullRequest(tmpDir);
  assert.strictEqual(resNonGit.ok, true);
  assert.strictEqual(resNonGit.skipped, true);

  // Git repo without baseRef skips
  initGitRepo(tmpDir);
  const origEnv = process.env.GITHUB_BASE_REF;
  delete process.env.GITHUB_BASE_REF;
  try {
    const res = auditPullRequest(tmpDir);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.skipped, true);
    assert.strictEqual(res.reason, 'no-base-ref');
  } finally {
    if (origEnv !== undefined) process.env.GITHUB_BASE_REF = origEnv;
  }
});

test('auditPullRequest: fails cleanly if merge-base calculation fails', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-mergebase-fail-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  initGitRepo(tmpDir);
  fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'hello');
  commitAll(tmpDir, 'init');

  const res = auditPullRequest(tmpDir, { base: 'nonexistent-ref-xyz' });
  assert.strictEqual(res.ok, false);
  assert(res.errors.length > 0);
  assert(res.errors[0].includes('Failed to compute git merge-base'));
});

test('auditPullRequest: passes on clean PR branch with code change and valid session log', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-clean-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  initGitRepo(tmpDir);
  const guardrails = {
    protectedPaths: ['.agent-room/guardrails.json'],
    forbiddenActions: ['eval('],
  };
  fs.mkdirSync(path.join(tmpDir, '.agent-room', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails.json'), JSON.stringify(guardrails, null, 2));
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails-bypass-log.md'), '# Guardrails Bypass Log\n');
  commitAll(tmpDir, 'Initial main commit');

  // Checkout feature branch
  execFileSync('git', ['checkout', '-b', 'feature/new-api'], { cwd: tmpDir, stdio: 'ignore' });
  fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log("new api");');
  fs.writeFileSync(
    path.join(tmpDir, '.agent-room', 'sessions', '2026-09-23-new-api.md'),
    '# Session: New API\n\n## Goal\nImplement new API endpoint\n'
  );
  commitAll(tmpDir, 'feat: add new api and session log');

  const res = auditPullRequest(tmpDir, { base: 'main' });
  assert.strictEqual(res.ok, true, `Expected pass, errors: ${res.errors.join(', ')}`);
  assert.strictEqual(res.antiTamper.ok, true);
  assert.strictEqual(res.sessionAudit.ok, true);
  assert.strictEqual(res.sessionAudit.sessionsFound.length, 1);
});

test('auditPullRequest: fails when code files are modified without a session log', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-no-session-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  initGitRepo(tmpDir);
  const guardrails = {
    protectedPaths: ['.agent-room/guardrails.json'],
  };
  fs.mkdirSync(path.join(tmpDir, '.agent-room', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails.json'), JSON.stringify(guardrails, null, 2));
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails-bypass-log.md'), '# Guardrails Bypass Log\n');
  commitAll(tmpDir, 'Initial main commit');

  // Feature branch with code changes but NO session log
  execFileSync('git', ['checkout', '-b', 'feature/missing-session'], { cwd: tmpDir, stdio: 'ignore' });
  fs.writeFileSync(path.join(tmpDir, 'service.js'), 'export function run() {}');
  commitAll(tmpDir, 'feat: add service');

  const res = auditPullRequest(tmpDir, { base: 'main' });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.sessionAudit.ok, false);
  assert(res.errors.some((e) => e.includes('PR Session Log Missing')));

  // Passes if --skip-pr-sessions is provided
  const resSkipped = auditPullRequest(tmpDir, { base: 'main', skipPrSessions: true });
  assert.strictEqual(resSkipped.ok, true);
  assert.strictEqual(resSkipped.sessionAudit.ok, true);
});

test('auditPullRequest: docs-only changes do not require a session log', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-docs-only-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  initGitRepo(tmpDir);
  fs.mkdirSync(path.join(tmpDir, '.agent-room'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails.json'), '{}');
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# My Project\n');
  commitAll(tmpDir, 'Initial commit');

  execFileSync('git', ['checkout', '-b', 'docs/update-readme'], { cwd: tmpDir, stdio: 'ignore' });
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# My Project\nUpdated docs.');
  commitAll(tmpDir, 'docs: update readme');

  const res = auditPullRequest(tmpDir, { base: 'main' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.sessionAudit.required, false);
});

test('auditPullRequest: detects deletion of .agent-room/guardrails.json', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-delete-guardrails-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  initGitRepo(tmpDir);
  fs.mkdirSync(path.join(tmpDir, '.agent-room', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails.json'), '{"protectedPaths":["foo"]}');
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails-bypass-log.md'), '# Bypass Log\n');
  commitAll(tmpDir, 'Initial commit');

  execFileSync('git', ['checkout', '-b', 'tamper/delete-guardrails'], { cwd: tmpDir, stdio: 'ignore' });
  fs.rmSync(path.join(tmpDir, '.agent-room', 'guardrails.json'));
  commitAll(tmpDir, 'tamper: delete guardrails');

  const res = auditPullRequest(tmpDir, { base: 'main', skipPrSessions: true });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.antiTamper.deleted, true);
  assert(res.errors.some((e) => e.includes('Anti-tamper violation')));
});

test('auditPullRequest: blocks rule weakening without bypass log entry', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-weakening-fail-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  initGitRepo(tmpDir);
  const headGuardrails = {
    protectedPaths: ['.agent-room/guardrails.json', 'critical-config.json'],
    forbiddenActions: ['eval('],
  };
  fs.mkdirSync(path.join(tmpDir, '.agent-room', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails.json'), JSON.stringify(headGuardrails, null, 2));
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails-bypass-log.md'), '# Bypass Log\n');
  commitAll(tmpDir, 'Initial commit');

  execFileSync('git', ['checkout', '-b', 'tamper/weaken-rules'], { cwd: tmpDir, stdio: 'ignore' });
  // Weaken rules: remove critical-config.json and eval(
  const weakenedGuardrails = {
    protectedPaths: ['.agent-room/guardrails.json'],
    forbiddenActions: [],
  };
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails.json'), JSON.stringify(weakenedGuardrails, null, 2));
  commitAll(tmpDir, 'tamper: drop critical protected paths and forbidden actions');

  const res = auditPullRequest(tmpDir, { base: 'main', skipPrSessions: true });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.antiTamper.weakened, true);
  assert.strictEqual(res.antiTamper.authorized, false);
  assert(res.errors.some((e) => e.includes('Rule weakening violation')));
});

test('auditPullRequest: allows rule weakening when valid bypass entry is present in PR diff', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-weakening-authorized-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  initGitRepo(tmpDir);
  const headGuardrails = {
    protectedPaths: ['.agent-room/guardrails.json', 'config.json'],
    scopeGuidance: { maxFilesPerChange: 10, maxLinesPerChange: 500 },
  };
  fs.mkdirSync(path.join(tmpDir, '.agent-room', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails.json'), JSON.stringify(headGuardrails, null, 2));
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails-bypass-log.md'), '# Bypass Log\n');
  commitAll(tmpDir, 'Initial commit');

  execFileSync('git', ['checkout', '-b', 'authorized/expand-limits'], { cwd: tmpDir, stdio: 'ignore' });
  const newGuardrails = {
    protectedPaths: ['.agent-room/guardrails.json', 'config.json'],
    scopeGuidance: { maxFilesPerChange: 25, maxLinesPerChange: 1000 },
  };
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails.json'), JSON.stringify(newGuardrails, null, 2));

  // Add bypass entry in diff
  const bypassEntry = '- 2026-09-23T14:00:00Z | author: Siddharth Pandey | reason: Migration of mono-repo requires temporarily increasing file boundaries (ticket: #456)';
  fs.appendFileSync(path.join(tmpDir, '.agent-room', 'guardrails-bypass-log.md'), `${bypassEntry}\n`);
  commitAll(tmpDir, 'feat: adjust scope boundaries with authorized bypass log entry');

  const res = auditPullRequest(tmpDir, { base: 'main', skipPrSessions: true });
  assert.strictEqual(res.ok, true, `Expected pass, errors: ${res.errors.join(', ')}`);
  assert.strictEqual(res.antiTamper.weakened, true);
  assert.strictEqual(res.antiTamper.authorized, true);
  assert(res.warnings.some((w) => w.includes('Guardrails rule modification authorized via PR bypass log entry')));
});

test('auditPullRequest: strict mode enforces >= 20 char reason and ticket/ref in bypass entry', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-pr-strict-bypass-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  initGitRepo(tmpDir);
  const headGuardrails = {
    protectedPaths: ['.agent-room/guardrails.json', 'config.json'],
  };
  fs.mkdirSync(path.join(tmpDir, '.agent-room', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails.json'), JSON.stringify(headGuardrails, null, 2));
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails-bypass-log.md'), '# Bypass Log\n');
  commitAll(tmpDir, 'Initial commit');

  execFileSync('git', ['checkout', '-b', 'strict/bypass-test'], { cwd: tmpDir, stdio: 'ignore' });
  const newGuardrails = {
    protectedPaths: ['.agent-room/guardrails.json'],
  };
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails.json'), JSON.stringify(newGuardrails, null, 2));

  // Add bypass entry with short reason (< 20 chars) and no ticket ref
  const weakBypassEntry = '- 2026-09-23T14:00:00Z | author: Dev | reason: Needed it';
  fs.appendFileSync(path.join(tmpDir, '.agent-room', 'guardrails-bypass-log.md'), `${weakBypassEntry}\n`);
  commitAll(tmpDir, 'feat: drop config.json with weak bypass');

  const resStrict = auditPullRequest(tmpDir, { base: 'main', strict: true, skipPrSessions: true });
  assert.strictEqual(resStrict.ok, false);
  assert(resStrict.errors.some((e) => e.includes('Bypass entry missing required explanation (>= 20 chars)')));

  // Now update bypass entry with length >= 20 but no ticket/ref
  const noTicketEntry = '- 2026-09-23T14:00:00Z | author: Dev | reason: We are refactoring config out of this repo permanently';
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails-bypass-log.md'), `# Bypass Log\n${noTicketEntry}\n`);
  commitAll(tmpDir, 'feat: update bypass with long reason');

  const resNoTicket = auditPullRequest(tmpDir, { base: 'main', strict: true, skipPrSessions: true });
  assert.strictEqual(resNoTicket.ok, false);
  assert(resNoTicket.errors.some((e) => e.includes('Strict bypass audit failed: reason')));

  // Now update bypass entry with ticket reference
  const validStrictEntry = '- 2026-09-23T14:00:00Z | author: Dev | reason: We are refactoring config permanently (ref: JIRA-1234)';
  fs.writeFileSync(path.join(tmpDir, '.agent-room', 'guardrails-bypass-log.md'), `# Bypass Log\n${validStrictEntry}\n`);
  commitAll(tmpDir, 'feat: update bypass with valid ticket ref');

  const resValid = auditPullRequest(tmpDir, { base: 'main', strict: true, skipPrSessions: true });
  assert.strictEqual(resValid.ok, true, `Expected pass with valid ticket ref, errors: ${resValid.errors.join(', ')}`);
});
