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
  fs.writeFileSync(path.join(agentRoomDir, 'writing-plans.md'), '# Writing Plans');
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
  assert.match(rules, /writing-plans/);
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

test('runSync: refreshes windsurf, cline, and codex rules when listed in config', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-sync-other-rules-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'writing-plans.md'), '# Writing Plans');
  fs.writeFileSync(path.join(agentRoomDir, 'my-skill.md'), '# My Skill');
  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ name: 'OtherRulesSync', tools: ['windsurf', 'cline', 'codex'] })
  );
  fs.writeFileSync(path.join(tmpDir, '.windsurfrules'), '# stale windsurf\n');
  fs.writeFileSync(path.join(tmpDir, '.clinerules'), '# stale cline\n');
  fs.writeFileSync(path.join(tmpDir, '.codexrules'), '# stale codex\n');

  runSync(tmpDir);

  const windsurf = fs.readFileSync(path.join(tmpDir, '.windsurfrules'), 'utf8');
  const cline = fs.readFileSync(path.join(tmpDir, '.clinerules'), 'utf8');
  const codex = fs.readFileSync(path.join(tmpDir, '.codexrules'), 'utf8');

  for (const content of [windsurf, cline, codex]) {
    assert.match(content, /OtherRulesSync/);
    assert.match(content, /writing-plans/);
    assert.match(content, /my-skill/);
  }
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

test('runSync --all: syncs Claude skills mirror, Cursor, Windsurf, Cline, Codex, and Copilot simultaneously', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-sync-all-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'alpha-skill.md'), '# Alpha Skill\n');
  fs.writeFileSync(path.join(agentRoomDir, 'beta-skill.md'), '# Beta Skill\n');

  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ name: 'SyncAllProject' })
  );

  runSync(tmpDir, { all: true });

  // 1. Claude skills mirror
  assert.strictEqual(
    fs.readFileSync(path.join(tmpDir, '.claude', 'skills', 'alpha-skill', 'SKILL.md'), 'utf8'),
    '# Alpha Skill\n'
  );
  assert.strictEqual(
    fs.readFileSync(path.join(tmpDir, '.claude', 'skills', 'beta-skill', 'SKILL.md'), 'utf8'),
    '# Beta Skill\n'
  );

  // 2. Cursor rules
  const cursorRules = fs.readFileSync(path.join(tmpDir, '.cursor', 'rules', 'agent-room.mdc'), 'utf8');
  assert.match(cursorRules, /SyncAllProject/);
  assert.match(cursorRules, /alpha-skill/);
  assert.match(cursorRules, /beta-skill/);

  // 3. Windsurf rules
  const windsurfRules = fs.readFileSync(path.join(tmpDir, '.windsurfrules'), 'utf8');
  assert.match(windsurfRules, /Windsurf rules — SyncAllProject/);
  assert.match(windsurfRules, /alpha-skill/);

  // 4. Cline rules
  const clineRules = fs.readFileSync(path.join(tmpDir, '.clinerules'), 'utf8');
  assert.match(clineRules, /Cline rules — SyncAllProject/);
  assert.match(clineRules, /beta-skill/);

  // 5. Codex rules
  const codexRules = fs.readFileSync(path.join(tmpDir, '.codexrules'), 'utf8');
  assert.match(codexRules, /Codex rules — SyncAllProject/);
  assert.match(codexRules, /alpha-skill/);

  // 6. Copilot instructions
  const copilotRules = fs.readFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), 'utf8');
  assert.match(copilotRules, /GitHub Copilot instructions — SyncAllProject/);
  assert.match(copilotRules, /alpha-skill/);
  assert.match(copilotRules, /beta-skill/);
});

test('runSync --tools: syncs only specified tools', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-sync-tools-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'scoped-skill.md'), '# Scoped Skill\n');

  runSync(tmpDir, { tools: 'cursor,copilot' });

  assert.ok(fs.existsSync(path.join(tmpDir, '.cursor', 'rules', 'agent-room.mdc')));
  assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'copilot-instructions.md')));
  assert.ok(!fs.existsSync(path.join(tmpDir, '.windsurfrules')));
  assert.ok(!fs.existsSync(path.join(tmpDir, '.clinerules')));
  assert.ok(!fs.existsSync(path.join(tmpDir, '.codexrules')));
  assert.ok(!fs.existsSync(path.join(tmpDir, '.claude')));
});

test('runSync: auto-detects tools present in workspace without config.tools', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-sync-autodetect-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'auto-skill.md'), '# Auto Skill\n');

  // Pre-create windsurf and copilot adapter files in workspace
  fs.writeFileSync(path.join(tmpDir, '.windsurfrules'), '# stale windsurf\n');
  fs.mkdirSync(path.join(tmpDir, '.github'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), '# stale copilot\n');

  // No .agent-room.json
  runSync(tmpDir);

  const windsurf = fs.readFileSync(path.join(tmpDir, '.windsurfrules'), 'utf8');
  assert.match(windsurf, /auto-skill/);

  const copilot = fs.readFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), 'utf8');
  assert.match(copilot, /auto-skill/);

  assert.ok(!fs.existsSync(path.join(tmpDir, '.clinerules')));
  assert.ok(!fs.existsSync(path.join(tmpDir, '.codexrules')));
});

test('runSync: preserves user customizations in marker blocks and stays idempotent', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-sync-idempotent-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'base-skill.md'), '# Base Skill\n');

  // Initial sync with --all
  runSync(tmpDir, { all: true });

  // User adds custom rules to .windsurfrules and .github/copilot-instructions.md
  const customBlock = [
    '<!-- user-customizations-start -->',
    '## Team Custom Rules',
    '- Enforce semantic commit titles',
    '- Never commit secret files',
    '<!-- user-customizations-end -->'
  ].join('\n');

  const windsurfFile = path.join(tmpDir, '.windsurfrules');
  fs.appendFileSync(windsurfFile, '\n\n' + customBlock + '\n');

  const copilotFile = path.join(tmpDir, '.github', 'copilot-instructions.md');
  fs.appendFileSync(copilotFile, '\n\n' + customBlock + '\n');

  // Add a second skill to trigger regeneration
  fs.writeFileSync(path.join(agentRoomDir, 'second-skill.md'), '# Second Skill\n');

  // Re-sync with --all
  runSync(tmpDir, { all: true });

  const updatedWindsurf = fs.readFileSync(windsurfFile, 'utf8');
  assert.match(updatedWindsurf, /base-skill/);
  assert.match(updatedWindsurf, /second-skill/);
  assert.match(updatedWindsurf, /## Team Custom Rules/);
  assert.match(updatedWindsurf, /Never commit secret files/);

  const updatedCopilot = fs.readFileSync(copilotFile, 'utf8');
  assert.match(updatedCopilot, /base-skill/);
  assert.match(updatedCopilot, /second-skill/);
  assert.match(updatedCopilot, /## Team Custom Rules/);
  assert.match(updatedCopilot, /Never commit secret files/);

  // Verify idempotency: running again should leave content identical
  runSync(tmpDir, { all: true });
  assert.strictEqual(fs.readFileSync(windsurfFile, 'utf8'), updatedWindsurf);
  assert.strictEqual(fs.readFileSync(copilotFile, 'utf8'), updatedCopilot);
});

test('runSync --all --check: verifies drift detection across all 6 tools', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-sync-check-all-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'check-skill.md'), '# Check Skill\n');

  // Missing files should fail --check
  process.exitCode = undefined;
  runSync(tmpDir, { all: true, check: true });
  assert.strictEqual(process.exitCode, 1, 'missing adapters should fail --check');

  // Sync everything
  process.exitCode = undefined;
  runSync(tmpDir, { all: true });

  // Check should now pass
  process.exitCode = undefined;
  runSync(tmpDir, { all: true, check: true });
  assert.strictEqual(process.exitCode, undefined, 'in-sync adapters should pass --check');

  // Modify copilot instructions to introduce drift
  fs.writeFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), '# drifted copilot\n');
  process.exitCode = undefined;
  runSync(tmpDir, { all: true, check: true });
  assert.strictEqual(process.exitCode, 1, 'drifted adapter should fail --check');
  process.exitCode = undefined;
});

test('runSync: syncs and detects drift in Claude Code custom slash commands (.claude/commands/)', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-sync-claude-cmds-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'my-skill.md'), '# My Skill\n');

  // Configure claude tool in .agent-room.json
  fs.writeFileSync(
    path.join(tmpDir, '.agent-room.json'),
    JSON.stringify({ name: 'ClaudeCmdsSyncTest', tools: ['claude'] })
  );

  // Initial sync: creates .claude/skills and .claude/commands
  runSync(tmpDir, { tools: 'claude' });

  const commandsDir = path.join(tmpDir, '.claude', 'commands');
  for (const cmd of ['research.md', 'plan.md', 'implement.md', 'iterate.md']) {
    assert.ok(fs.existsSync(path.join(commandsDir, cmd)), `${cmd} should be created by sync`);
  }

  // Check passes when up-to-date
  process.exitCode = undefined;
  runSync(tmpDir, { tools: 'claude', check: true });
  assert.strictEqual(process.exitCode, undefined, 'check should pass when commands are up-to-date');

  // Drift one command file
  fs.writeFileSync(path.join(commandsDir, 'research.md'), '# drifted research command\n');
  process.exitCode = undefined;
  runSync(tmpDir, { tools: 'claude', check: true });
  assert.strictEqual(process.exitCode, 1, 'check should fail when command is drifted');
  process.exitCode = undefined;

  // Re-sync restores the canonical template
  runSync(tmpDir, { tools: 'claude', force: true });
  assert.match(
    fs.readFileSync(path.join(commandsDir, 'research.md'), 'utf8'),
    /research-codebase\.md/,
    're-sync should restore canonical command template'
  );
});

test('runSync: purges deprecated legacy skills from .agent-room/skills and removes orphaned Claude skills', (t) => {
  const tmpDir = path.join(__dirname, 'tmp-sync-deprecated-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const agentRoomDir = path.join(tmpDir, '.agent-room', 'skills');
  fs.mkdirSync(agentRoomDir, { recursive: true });
  fs.writeFileSync(path.join(agentRoomDir, 'brainstorming.md'), '# Brainstorming');
  fs.writeFileSync(path.join(agentRoomDir, 'verification-before-completion.md'), '# Verification');
  fs.writeFileSync(path.join(agentRoomDir, 'writing-plans.md'), '# Writing Plans');

  const claudeDir = path.join(tmpDir, '.claude', 'skills');
  fs.mkdirSync(path.join(claudeDir, 'brainstorming'), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'brainstorming', 'SKILL.md'), '# Brainstorming');
  fs.mkdirSync(path.join(claudeDir, 'verification-before-completion'), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'verification-before-completion', 'SKILL.md'), '# Verification');

  const configPath = path.join(tmpDir, '.agent-room.json');
  fs.writeFileSync(configPath, JSON.stringify({ tools: ['claude', 'cursor'] }));

  // Run sync
  runSync(tmpDir);

  // Assert deprecated files are removed from .agent-room/skills/
  assert.strictEqual(fs.existsSync(path.join(agentRoomDir, 'brainstorming.md')), false);
  assert.strictEqual(fs.existsSync(path.join(agentRoomDir, 'verification-before-completion.md')), false);
  assert.strictEqual(fs.existsSync(path.join(agentRoomDir, 'writing-plans.md')), true);

  // Assert mirrored skills are deleted
  assert.strictEqual(fs.existsSync(path.join(claudeDir, 'brainstorming')), false);
  assert.strictEqual(fs.existsSync(path.join(claudeDir, 'verification-before-completion')), false);
  assert.strictEqual(fs.existsSync(path.join(claudeDir, 'writing-plans', 'SKILL.md')), true);
});



