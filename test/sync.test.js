'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { runSync } = require('../lib/sync');

test('runSync: syncs skills from agent-room to claude using .agent-room.json', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-sync-project-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Setup agent-room skills and config
  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'my-skill.md'), '# My Skill');

  const configPath = path.join(tmpDir, '.agent-room.json');
  fs.writeFileSync(configPath, JSON.stringify({ tools: ['claude'] }));

  // Run sync
  runSync(tmpDir);

  // Assert mirrored skill is updated
  const mirroredSkill = path.join(tmpDir, '.claude', 'skills', 'my-skill', 'SKILL.md');
  assert.strictEqual(fs.existsSync(mirroredSkill), true, 'Claude mirrored skill should exist');
  assert.strictEqual(fs.readFileSync(mirroredSkill, 'utf8'), '# My Skill');
});

test('runSync --check mode exit codes', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-check-project-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Setup agent-room skills and config
  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'my-skill.md'), '# Source Content');

  const configPath = path.join(tmpDir, '.agent-room.json');
  fs.writeFileSync(configPath, JSON.stringify({ tools: ['claude'] }));

  // Check when mirrored is missing
  process.exitCode = undefined;
  runSync(tmpDir, { check: true });
  assert.strictEqual(process.exitCode, 1, 'Should set exit code to 1 when mirrored file is missing');

  // Sync it
  runSync(tmpDir);

  // Check when mirroring is in sync
  process.exitCode = undefined;
  runSync(tmpDir, { check: true });
  assert.strictEqual(process.exitCode, undefined, 'Should not set exit code when in sync');

  // Change source (so it becomes out of sync)
  fs.writeFileSync(path.join(agentRoomDir, 'my-skill.md'), '# Changed Source');
  process.exitCode = undefined;
  runSync(tmpDir, { check: true });
  assert.strictEqual(process.exitCode, 1, 'Should set exit code to 1 when mirrored file content is different');

  // Reset exit code for test runner safety
  process.exitCode = undefined;
});

test('runSync: refreshes Cursor rules when tools include cursor', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-sync-cursor-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'brainstorming.md'), '# Brainstorming');
  fs.writeFileSync(path.join(agentRoomDir, 'closing-the-loop.md'), '# Closing');
  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ name: 'SyncCursorProj', tools: ['cursor'] })
  );
  fs.mkdirSync(path.join(tmpDir, '.cursor', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.cursor', 'rules', 'agent-room.mdc'), '# stale\n');

  runSync(tmpDir);

  const rules = fs.readFileSync(path.join(tmpDir, '.cursor', 'rules', 'agent-room.mdc'), 'utf8');
  assert.match(rules, /SyncCursorProj/);
  assert.match(rules, /brainstorming/);
  assert.match(rules, /closing-the-loop/);
  assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'skills')));
});

test('runSync: claude+cursor syncs both destinations', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-sync-both-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'my-skill.md'), '# My Skill');
  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ name: 'BothSync', tools: ['claude', 'cursor'] })
  );

  runSync(tmpDir);

  assert.strictEqual(
    fs.readFileSync(path.join(tmpDir, '.claude', 'skills', 'my-skill', 'SKILL.md'), 'utf8'),
    '# My Skill'
  );
  assert.match(
    fs.readFileSync(path.join(tmpDir, '.cursor', 'rules', 'agent-room.mdc'), 'utf8'),
    /my-skill/
  );
});

test('runSync --check: reports Cursor rules drift', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-sync-cursor-check-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'my-skill.md'), '# My Skill');
  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ name: 'CheckCursor', tools: ['cursor'] })
  );

  process.exitCode = undefined;
  runSync(tmpDir, { check: true });
  assert.strictEqual(process.exitCode, 1, 'missing Cursor rules should fail --check');

  runSync(tmpDir);
  process.exitCode = undefined;
  runSync(tmpDir, { check: true });
  assert.strictEqual(process.exitCode, undefined, 'in-sync Cursor rules should pass --check');

  fs.writeFileSync(path.join(tmpDir, '.cursor', 'rules', 'agent-room.mdc'), '# drifted\n');
  process.exitCode = undefined;
  runSync(tmpDir, { check: true });
  assert.strictEqual(process.exitCode, 1, 'drifted Cursor rules should fail --check');
  process.exitCode = undefined;
});

test('runSync: skips dirty files and overwrites with --force', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-dirty-project-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Setup git repo
  const { execSync } = require('child_process');
  try {
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
  } catch (err) {
    // If Git is unavailable in this environment, skip this test gracefully
    return;
  }

  // Setup agent-room skills and config
  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'my-skill.md'), '# Source Content');

  const configPath = path.join(tmpDir, '.agent-room.json');
  fs.writeFileSync(configPath, JSON.stringify({ tools: ['claude'] }));

  // First sync to establish the file and commit it
  runSync(tmpDir);
  execSync('git add . && git commit -m "initial"', { cwd: tmpDir, stdio: 'ignore' });

  // Now, modify the mirrored file directly (make it dirty)
  const mirroredSkill = path.join(tmpDir, '.claude', 'skills', 'my-skill', 'SKILL.md');
  fs.writeFileSync(mirroredSkill, '# User Edited Mirror');

  // Change source file as well (so sync wants to write)
  fs.writeFileSync(path.join(agentRoomDir, 'my-skill.md'), '# New Source Content');

  // Sync without --force (should skip)
  runSync(tmpDir);
  assert.strictEqual(fs.readFileSync(mirroredSkill, 'utf8'), '# User Edited Mirror', 'Should NOT overwrite user edits');

  // Sync with --force (should overwrite)
  runSync(tmpDir, { force: true });
  assert.strictEqual(fs.readFileSync(mirroredSkill, 'utf8'), '# New Source Content', 'Should overwrite user edits with --force');
});
