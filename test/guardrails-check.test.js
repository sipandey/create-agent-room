'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const HOOK_SRC = path.join(__dirname, '..', 'templates', 'adapters', 'git-hooks', 'guardrails-check.js');
const DEFAULT_GUARDRAILS_SRC = path.join(__dirname, '..', 'templates', '.agent-room', 'guardrails.json');

function makeRepo(prefix) {
  const dir = path.join(__dirname, `tmp-${prefix}-` + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });

  fs.mkdirSync(path.join(dir, '.agent-room', 'hooks'), { recursive: true });
  fs.copyFileSync(HOOK_SRC, path.join(dir, '.agent-room', 'hooks', 'guardrails-check.js'));

  return dir;
}

function writeGuardrails(dir, content) {
  fs.writeFileSync(
    path.join(dir, '.agent-room', 'guardrails.json'),
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  );
}

function stageAll(dir) {
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
}

function runHook(dir, env) {
  try {
    execFileSync('node', [path.join(dir, '.agent-room', 'hooks', 'guardrails-check.js')], {
      cwd: dir,
      encoding: 'utf8',
      env: Object.assign({}, process.env, env)
    });
    return { code: 0 };
  } catch (err) {
    return { code: err.status, stderr: (err.stderr || '').toString(), stdout: (err.stdout || '').toString() };
  }
}

test('guardrails-check: allows protected-path files on the repository\'s initial commit (regression: create-agent-room genesis commit)', (t) => {
  const dir = makeRepo('guardrails-initial-commit');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, {
    protectedPaths: ['.github/workflows/**'],
    forbiddenActions: []
  });
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: ci\n');

  stageAll(dir);
  const result = runHook(dir);

  assert.strictEqual(result.code, 0, 'genesis commit touching a protected path should be allowed');
});

test('guardrails-check: blocks a later commit that touches an already-established protected path', (t) => {
  const dir = makeRepo('guardrails-later-commit');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, {
    protectedPaths: ['.github/workflows/**'],
    forbiddenActions: []
  });
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: ci\n');
  stageAll(dir);
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir, stdio: 'ignore' });

  // Now make a second commit that edits the protected path.
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: ci\non: push\n');
  stageAll(dir);
  const result = runHook(dir);

  assert.strictEqual(result.code, 1, 'a second commit touching a protected path should be blocked');
  assert.match(result.stderr, /Protected path violation/);
});

// Regression: the rules governing an agent must not be editable in the same
// diff as an unrelated change with nothing blocking it. guardrails.json,
// guardrails.md, the hook scripts, and .claude/settings.json are all in the
// default protectedPaths list precisely so a later commit that touches them
// gets flagged for review, same as any other protected path — this is not a
// new mechanism, just confirming the self-governance files are covered by
// the existing one. Uses the real shipped default config, not a hand-rolled
// stand-in, so this stays true to what `init` actually scaffolds.
test('guardrails-check: blocks a later commit that edits guardrails.json itself (self-protection)', (t) => {
  const dir = makeRepo('guardrails-self-protect');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const defaultGuardrails = JSON.parse(fs.readFileSync(DEFAULT_GUARDRAILS_SRC, 'utf8'));
  writeGuardrails(dir, defaultGuardrails);
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'unrelated file\n');
  stageAll(dir);
  execFileSync('git', ['commit', '-m', 'initial (genesis commit, guardrails.json creation allowed)'], {
    cwd: dir,
    stdio: 'ignore'
  });

  // A later commit that edits guardrails.json alongside an unrelated change
  // must be blocked as a protected-path violation, not silently allowed
  // through because the edit is "just config". (protectedPaths itself is
  // left untouched here — a commit that edits guardrails.json *and* removes
  // its own path from protectedPaths in the same diff is a separate,
  // sharper attack: this hook evaluates against the live/staged config, so
  // that specific self-weakening edit is not caught by this test. Tracked
  // as a follow-up, not solved by this change.)
  const edited = JSON.parse(JSON.stringify(defaultGuardrails));
  edited.forbiddenActions = [];
  writeGuardrails(dir, edited);
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'unrelated file, changed\n');
  stageAll(dir);

  const result = runHook(dir);

  assert.strictEqual(result.code, 1, 'editing guardrails.json in a non-genesis commit must be blocked');
  assert.match(result.stderr, /Protected path violation: \.agent-room\/guardrails\.json/);
});

test('guardrails-check: fails closed (blocks commit) when guardrails.json is corrupted', (t) => {
  const dir = makeRepo('guardrails-corrupted');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, 'not valid json {{{');
  fs.writeFileSync(path.join(dir, 'file.txt'), 'hello');
  stageAll(dir);

  const result = runHook(dir);

  assert.strictEqual(result.code, 1, 'a corrupted guardrails.json must block the commit, not silently allow it');
  assert.match(result.stderr, /guardrails\.json is broken/);
});

test('guardrails-check: GUARDRAILS_BYPASS overrides the fail-closed behavior for corrupted config', (t) => {
  const dir = makeRepo('guardrails-corrupted-bypass');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, 'not valid json {{{');
  fs.writeFileSync(path.join(dir, 'file.txt'), 'hello');
  stageAll(dir);

  const result = runHook(dir, { GUARDRAILS_BYPASS: '1' });

  assert.strictEqual(result.code, 0, 'GUARDRAILS_BYPASS should allow the commit through despite corrupted config');
});

// This is the single most important test in the suite: it proves the core
// trust claim of the guardrails feature — that a real secret committed by
// an agent (or a human) actually gets blocked, not just described in prose
// nobody enforces. Uses the shipped default guardrails.json exactly as
// `init` scaffolds it, and AWS's own published fake test key
// (AKIAIOSFODNN7EXAMPLE, documented at
// https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)
// — never a real credential.
test('guardrails-check: blocks a commit containing a fake AWS access key (default forbiddenActions rules)', (t) => {
  const dir = makeRepo('guardrails-aws-key');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const defaultGuardrails = JSON.parse(fs.readFileSync(DEFAULT_GUARDRAILS_SRC, 'utf8'));
  writeGuardrails(dir, defaultGuardrails);

  fs.writeFileSync(
    path.join(dir, 'config.js'),
    "module.exports = { awsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE' };\n"
  );
  stageAll(dir);

  const result = runHook(dir);

  assert.strictEqual(result.code, 1, 'a staged fake AWS access key must block the commit');
  assert.match(result.stderr, /Forbidden pattern found in config\.js/);
  assert.match(result.stderr, /AWS access key ID/);
});

test('guardrails-check: blocks a commit containing a fake private key header (default forbiddenActions rules)', (t) => {
  const dir = makeRepo('guardrails-private-key');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const defaultGuardrails = JSON.parse(fs.readFileSync(DEFAULT_GUARDRAILS_SRC, 'utf8'));
  writeGuardrails(dir, defaultGuardrails);

  fs.writeFileSync(
    path.join(dir, 'id_rsa'),
    '-----BEGIN RSA PRIVATE KEY-----\nMIIFAKEFAKEFAKEFAKEFAKEFAKE\n-----END RSA PRIVATE KEY-----\n'
  );
  stageAll(dir);

  const result = runHook(dir);

  assert.strictEqual(result.code, 1, 'a staged private key header must block the commit');
  assert.match(result.stderr, /Forbidden pattern found in id_rsa/);
});

test('guardrails-check: does not block ordinary source content (no false positive on the default rules)', (t) => {
  const dir = makeRepo('guardrails-no-false-positive');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const defaultGuardrails = JSON.parse(fs.readFileSync(DEFAULT_GUARDRAILS_SRC, 'utf8'));
  writeGuardrails(dir, defaultGuardrails);

  fs.writeFileSync(
    path.join(dir, 'app.js'),
    "function add(a, b) { return a + b; }\nmodule.exports = { add };\n"
  );
  stageAll(dir);

  const result = runHook(dir);

  assert.strictEqual(result.code, 0, 'ordinary source content must not trip the default forbidden-pattern rules');
});

// Regression for the self-weakening gap found while writing the
// self-protection test above: a single commit that both edits
// guardrails.json and removes its own path from protectedPaths in that
// same edit must still be blocked, by comparing against HEAD's prior
// protectedPaths rather than evaluating the newly-staged rules against
// themselves.
test('guardrails-check: blocks a commit that removes guardrails.json from its own protectedPaths in the same edit', (t) => {
  const dir = makeRepo('guardrails-self-weaken');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // HEAD version protects guardrails.json itself.
  writeGuardrails(dir, {
    protectedPaths: ['.agent-room/guardrails.json', 'infrastructure/**'],
    requireApprovalFor: [],
    scopeGuidance: {},
    forbiddenActions: []
  });
  stageAll(dir);
  execFileSync('git', ['commit', '-m', 'initial guardrails'], { cwd: dir, stdio: 'ignore' });

  // A single edit both changes guardrails.json AND removes its own path
  // from protectedPaths, so the newly-staged rules no longer flag it.
  writeGuardrails(dir, {
    protectedPaths: ['infrastructure/**'],
    requireApprovalFor: [],
    scopeGuidance: {},
    forbiddenActions: []
  });
  stageAll(dir);

  const result = runHook(dir);

  assert.strictEqual(result.code, 1, 'a commit that strips guardrails.json from its own protectedPaths must still be blocked');
  assert.match(result.stderr, /guardrails\.json/);
  assert.match(result.stderr, /removed from protectedPaths/);
});

test('guardrails-check: allows editing guardrails.json when it was not previously self-protected', (t) => {
  const dir = makeRepo('guardrails-no-prior-protection');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // HEAD version never protected guardrails.json itself.
  writeGuardrails(dir, {
    protectedPaths: ['infrastructure/**'],
    requireApprovalFor: [],
    scopeGuidance: {},
    forbiddenActions: []
  });
  stageAll(dir);
  execFileSync('git', ['commit', '-m', 'initial guardrails'], { cwd: dir, stdio: 'ignore' });

  writeGuardrails(dir, {
    protectedPaths: ['infrastructure/**', 'other/**'],
    requireApprovalFor: [],
    scopeGuidance: {},
    forbiddenActions: []
  });
  stageAll(dir);

  const result = runHook(dir);

  assert.strictEqual(result.code, 0, 'editing guardrails.json should be allowed when it was never self-protected at HEAD');
});

test('guardrails-check: does not crash when guardrails.json is added in the genesis commit (no HEAD yet)', (t) => {
  const dir = makeRepo('guardrails-self-weaken-genesis');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, {
    protectedPaths: ['infrastructure/**'],
    requireApprovalFor: [],
    scopeGuidance: {},
    forbiddenActions: []
  });
  stageAll(dir);

  const result = runHook(dir);

  // No HEAD exists yet, so there is nothing to compare against - the
  // self-weakening check should be a no-op rather than crashing the hook.
  assert.strictEqual(result.code, 0, 'the self-weakening check must not crash on a genesis commit with no HEAD');
});

test('guardrails-check: still blocks editing guardrails.json while it remains self-protected', (t) => {
  const dir = makeRepo('guardrails-still-protected');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, {
    protectedPaths: ['.agent-room/guardrails.json'],
    requireApprovalFor: [],
    scopeGuidance: {},
    forbiddenActions: []
  });
  stageAll(dir);
  execFileSync('git', ['commit', '-m', 'initial guardrails'], { cwd: dir, stdio: 'ignore' });

  // Edit guardrails.json but leave its own path in protectedPaths.
  writeGuardrails(dir, {
    protectedPaths: ['.agent-room/guardrails.json'],
    requireApprovalFor: ['something new'],
    scopeGuidance: {},
    forbiddenActions: []
  });
  stageAll(dir);

  const result = runHook(dir);

  assert.strictEqual(result.code, 1, 'editing guardrails.json while it remains self-protected must still be blocked');
  assert.match(result.stderr, /Protected path violation: \.agent-room\/guardrails\.json/);
});

// --- scopeGuidance enforcement ---

function writeNFiles(dir, n, subdir) {
  const target = subdir ? path.join(dir, subdir) : dir;
  fs.mkdirSync(target, { recursive: true });
  for (let i = 0; i < n; i++) {
    fs.writeFileSync(path.join(target, `file-${i}.txt`), `content ${i}\n`);
  }
}

test('guardrails-check: scopeGuidance absent from guardrails.json means no scope enforcement (backward compat)', (t) => {
  const dir = makeRepo('scope-absent');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, { protectedPaths: [], forbiddenActions: [] });
  stageAll(dir);
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir, stdio: 'ignore' });

  writeNFiles(dir, 50, 'many-files');
  stageAll(dir);
  const result = runHook(dir);

  assert.strictEqual(result.code, 0, 'no scopeGuidance declared should mean no scope enforcement at all');
});

test('guardrails-check: blocks a non-initial commit that exceeds maxFilesPerChange', (t) => {
  const dir = makeRepo('scope-too-many-files');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, {
    protectedPaths: [],
    forbiddenActions: [],
    scopeGuidance: { maxFilesPerChange: 3, maxLinesPerChange: 10000 }
  });
  stageAll(dir);
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir, stdio: 'ignore' });

  writeNFiles(dir, 5, 'too-many');
  stageAll(dir);
  const result = runHook(dir);

  assert.strictEqual(result.code, 1, 'exceeding maxFilesPerChange on a non-initial commit should block');
  assert.match(result.stderr, /Change scope exceeds guidance.*files/i);
});

test('guardrails-check: blocks a non-initial commit that exceeds maxLinesPerChange', (t) => {
  const dir = makeRepo('scope-too-many-lines');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, {
    protectedPaths: [],
    forbiddenActions: [],
    scopeGuidance: { maxFilesPerChange: 100, maxLinesPerChange: 20 }
  });
  stageAll(dir);
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir, stdio: 'ignore' });

  fs.writeFileSync(path.join(dir, 'big.txt'), Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n') + '\n');
  stageAll(dir);
  const result = runHook(dir);

  assert.strictEqual(result.code, 1, 'exceeding maxLinesPerChange on a non-initial commit should block');
  assert.match(result.stderr, /Change scope exceeds guidance.*lines/i);
});

test('guardrails-check: passes when a non-initial commit stays within scopeGuidance limits', (t) => {
  const dir = makeRepo('scope-within-limits');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, {
    protectedPaths: [],
    forbiddenActions: [],
    scopeGuidance: { maxFilesPerChange: 20, maxLinesPerChange: 500 }
  });
  stageAll(dir);
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir, stdio: 'ignore' });

  fs.writeFileSync(path.join(dir, 'small.txt'), 'a small change\n');
  stageAll(dir);
  const result = runHook(dir);

  assert.strictEqual(result.code, 0, 'a small, well-scoped change should not be blocked');
});

// Regression: a normal `init --tools git --git` genesis commit is 25 files /
// 1569 insertions (measured directly against this repo's own default
// scopeGuidance of 20 files / 500 lines) - without this exemption the tool
// would block its own onboarding flow, the same class of self-inflicted bug
// already fixed once for protectedPaths.
test('guardrails-check: does not block the genesis commit even when it exceeds scopeGuidance limits', (t) => {
  const dir = makeRepo('scope-genesis-exempt');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, {
    protectedPaths: [],
    forbiddenActions: [],
    scopeGuidance: { maxFilesPerChange: 2, maxLinesPerChange: 5 }
  });
  writeNFiles(dir, 10, 'lots-of-files');
  stageAll(dir);
  const result = runHook(dir);

  assert.strictEqual(result.code, 0, 'the genesis commit must be exempt from scopeGuidance, same as protectedPaths');
});

// --- durable bypass log ---

const BYPASS_LOG_REL = path.join('.agent-room', 'guardrails-bypass-log.md');

function stagedPaths(dir) {
  const out = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: dir, encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean);
}

test('guardrails-check: a bypassed protected-path violation writes a durable, staged bypass-log entry', (t) => {
  const dir = makeRepo('bypass-log-protected-path');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, { protectedPaths: ['secrets/**'], forbiddenActions: [] });
  stageAll(dir);
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir, stdio: 'ignore' });

  fs.mkdirSync(path.join(dir, 'secrets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'secrets', 'x.txt'), 'x\n');
  stageAll(dir);

  const result = runHook(dir, { GUARDRAILS_BYPASS: '1' });
  assert.strictEqual(result.code, 0, 'bypass should still allow the commit through');

  const logPath = path.join(dir, BYPASS_LOG_REL);
  assert.ok(fs.existsSync(logPath), 'bypass log file should have been created');
  const logContent = fs.readFileSync(logPath, 'utf8');
  assert.match(logContent, /Protected path violation: secrets\/x\.txt/);
  assert.match(logContent, /author:/i);
  assert.match(logContent, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'entry should include an ISO timestamp');

  assert.ok(
    stagedPaths(dir).includes(BYPASS_LOG_REL.replace(/\\/g, '/')),
    'the bypass log entry must be staged so it becomes part of the commit it records, not left as an unstaged working-tree change'
  );
});

test('guardrails-check: a bypassed scopeGuidance violation is also written to the bypass log', (t) => {
  const dir = makeRepo('bypass-log-scope');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, {
    protectedPaths: [],
    forbiddenActions: [],
    scopeGuidance: { maxFilesPerChange: 1, maxLinesPerChange: 10000 }
  });
  stageAll(dir);
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir, stdio: 'ignore' });

  writeNFiles(dir, 3, 'oversized');
  stageAll(dir);

  const result = runHook(dir, { GUARDRAILS_BYPASS: '1' });
  assert.strictEqual(result.code, 0);

  const logContent = fs.readFileSync(path.join(dir, BYPASS_LOG_REL), 'utf8');
  assert.match(logContent, /Change scope exceeds guidance/);
});

test('guardrails-check: a clean commit with no violations never touches the bypass log', (t) => {
  const dir = makeRepo('bypass-log-clean');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeGuardrails(dir, { protectedPaths: [], forbiddenActions: [] });
  stageAll(dir);
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir, stdio: 'ignore' });

  fs.writeFileSync(path.join(dir, 'ordinary.txt'), 'nothing wrong here\n');
  stageAll(dir);

  const result = runHook(dir);
  assert.strictEqual(result.code, 0);
  assert.ok(!fs.existsSync(path.join(dir, BYPASS_LOG_REL)), 'a clean commit must not create a bypass log entry');
});
