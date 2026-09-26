'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { runInit } = require('../lib/init');
const { listSkillPacks, addSkillPacks, removeSkillPacks, runSkillCli, CORE_SKILL_FILES, RETIRED_CORE_SKILL_FILES } = require('../lib/skill');

const CLI_PATH = path.join(__dirname, '..', 'bin', 'cli.js');

async function createTestProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-skill-test-'));
  await runInit(tmpDir, {
    yes: true,
    tools: 'claude',
    'skill-packs': 'testing,release',
    'test-command': 'npm test'
  });
  return tmpDir;
}

test('listSkillPacks: correctly reports installed, available, and custom skill packs', async () => {
  const tmpDir = await createTestProject();
  try {
    const res = listSkillPacks(tmpDir);
    assert.strictEqual(typeof res, 'object');
    assert.ok(Array.isArray(res.installed));
    assert.ok(Array.isArray(res.available));
    assert.ok(Array.isArray(res.custom));

    const installedNames = res.installed.map((p) => p.name);
    assert.ok(installedNames.includes('testing'));
    assert.ok(installedNames.includes('release'));

    const availableNames = res.available.map((p) => p.name);
    assert.ok(availableNames.includes('database'));
    assert.ok(availableNames.includes('security'));
    assert.ok(!availableNames.includes('testing'));

    // Add a custom skill file
    const customSkillPath = path.join(tmpDir, '.agent-room', 'skills', 'custom-workflow.md');
    fs.writeFileSync(customSkillPath, '---\nname: custom-workflow\ndescription: Custom workflow\n---\n# Custom\n', 'utf8');

    const res2 = listSkillPacks(tmpDir);
    const customNames = res2.custom.map((s) => s.name);
    assert.ok(customNames.includes('custom-workflow'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('addSkillPacks: adds built-in skill pack, updates config, and syncs to Claude', async () => {
  const tmpDir = await createTestProject();
  try {
    const res = addSkillPacks(tmpDir, 'database');
    assert.strictEqual(res.success, true);
    assert.ok(res.addedPacks.includes('database'));

    // Check file in .agent-room/skills
    const dbSkill = path.join(tmpDir, '.agent-room', 'skills', 'database-migrations.md');
    assert.ok(fs.existsSync(dbSkill));

    // Check .agent-room.json
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.agent-room.json'), 'utf8'));
    assert.ok(config.skillPacks.includes('database'));

    // Check synced to .claude/skills
    const claudeSkill = path.join(tmpDir, '.claude', 'skills', 'database-migrations', 'SKILL.md');
    assert.ok(fs.existsSync(claudeSkill));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('addSkillPacks: supports multiple packs and --no-sync option', async () => {
  const tmpDir = await createTestProject();
  try {
    const res = addSkillPacks(tmpDir, ['security', 'observability'], { noSync: true });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.synced, false);

    assert.ok(fs.existsSync(path.join(tmpDir, '.agent-room', 'skills', 'security-principles.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.agent-room', 'skills', 'observability.md')));

    // Claude skills should not exist because noSync was true
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'security-principles', 'SKILL.md')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('addSkillPacks: supports --dry-run without modifying files or config', async () => {
  const tmpDir = await createTestProject();
  try {
    const res = addSkillPacks(tmpDir, 'database', { dryRun: true });
    assert.strictEqual(res.dryRun, true);

    assert.ok(!fs.existsSync(path.join(tmpDir, '.agent-room', 'skills', 'database-migrations.md')));
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.agent-room.json'), 'utf8'));
    assert.ok(!config.skillPacks.includes('database'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('addSkillPacks: installs from local directory', async () => {
  const tmpDir = await createTestProject();
  const localPackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'car-local-pack-'));
  try {
    fs.writeFileSync(
      path.join(localPackDir, 'graphql-schema.md'),
      '---\nname: graphql-schema\ndescription: GraphQL schemas\n---\n# GraphQL\n',
      'utf8'
    );

    const res = addSkillPacks(tmpDir, localPackDir, { noSync: true });
    assert.strictEqual(res.success, true);
    assert.ok(fs.existsSync(path.join(tmpDir, '.agent-room', 'skills', 'graphql-schema.md')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(localPackDir, { recursive: true, force: true });
  }
});

test('addSkillPacks: throws error on unknown skill pack', async () => {
  const tmpDir = await createTestProject();
  try {
    assert.throws(() => addSkillPacks(tmpDir, 'non-existent-pack-xyz'), /Unknown skill pack/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('removeSkillPacks: deletes skill files, updates config, and removes orphaned Claude skills', async () => {
  const tmpDir = await createTestProject();
  try {
    // Add database pack first with sync
    addSkillPacks(tmpDir, 'database');
    assert.ok(fs.existsSync(path.join(tmpDir, '.agent-room', 'skills', 'database-migrations.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'database-migrations', 'SKILL.md')));

    // Now remove it
    const res = removeSkillPacks(tmpDir, 'database');
    assert.strictEqual(res.success, true);
    assert.ok(res.removedPacks.includes('database'));

    // Check file deleted from .agent-room/skills
    assert.ok(!fs.existsSync(path.join(tmpDir, '.agent-room', 'skills', 'database-migrations.md')));

    // Check config updated
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.agent-room.json'), 'utf8'));
    assert.ok(!config.skillPacks.includes('database'));

    // Check orphaned Claude skill was removed by sync
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'database-migrations')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('removeSkillPacks: supports --dry-run without deleting files', async () => {
  const tmpDir = await createTestProject();
  try {
    const res = removeSkillPacks(tmpDir, 'testing', { dryRun: true });
    assert.strictEqual(res.dryRun, true);

    // File should still exist
    assert.ok(fs.existsSync(path.join(tmpDir, '.agent-room', 'skills', 'integration-testing.md')));
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.agent-room.json'), 'utf8'));
    assert.ok(config.skillPacks.includes('testing'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runSkillCli: executes list, add, and remove cleanly', async () => {
  const tmpDir = await createTestProject();
  try {
    let output = '';
    const origLog = console.log;
    console.log = (msg) => { output += (msg || '') + '\n'; };
    try {
      const exitList = runSkillCli(tmpDir, 'list', {});
      assert.strictEqual(exitList, 0);
      assert.ok(output.includes('Installed Skill Packs:'));
      assert.ok(output.includes('Available Built-in Skill Packs:'));

      const exitAdd = runSkillCli(tmpDir, 'add', { packs: ['database'], dryRun: true });
      assert.strictEqual(exitAdd, 0);
      assert.ok(output.includes('[Dry Run] Would add skill packs: database'));

      const exitRemove = runSkillCli(tmpDir, 'remove', { packs: ['testing'], dryRun: true });
      assert.strictEqual(exitRemove, 0);
      assert.ok(output.includes('[Dry Run] Would remove skill packs: testing'));
    } finally {
      console.log = origLog;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI: node bin/cli.js skill list returns 0 and lists skill packs', async () => {
  const tmpDir = await createTestProject();
  try {
    const output = execFileSync('node', [CLI_PATH, 'skill', 'list', tmpDir], { encoding: 'utf8' });
    assert.ok(output.includes('Installed Skill Packs:'));
    assert.ok(output.includes('testing'));

    const jsonOutput = execFileSync('node', [CLI_PATH, 'skill', 'list', tmpDir, '--json'], { encoding: 'utf8' });
    const parsed = JSON.parse(jsonOutput);
    assert.ok(Array.isArray(parsed.installed));
    assert.ok(Array.isArray(parsed.available));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI: node bin/cli.js skill add and remove work end-to-end', async () => {
  const tmpDir = await createTestProject();
  try {
    execFileSync('node', [CLI_PATH, 'skill', 'add', 'database', tmpDir, '--no-sync'], { encoding: 'utf8' });
    assert.ok(fs.existsSync(path.join(tmpDir, '.agent-room', 'skills', 'database-migrations.md')));

    execFileSync('node', [CLI_PATH, 'skill', 'remove', 'database', tmpDir, '--no-sync'], { encoding: 'utf8' });
    assert.ok(!fs.existsSync(path.join(tmpDir, '.agent-room', 'skills', 'database-migrations.md')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CORE_SKILL_FILES: registers commit-changes.md with valid metadata', () => {
  assert.ok(CORE_SKILL_FILES.includes('commit-changes.md'));
  const templatePath = path.join(__dirname, '..', 'templates', '.agent-room', 'skills', 'commit-changes.md');
  assert.ok(fs.existsSync(templatePath));
  const content = fs.readFileSync(templatePath, 'utf8');
  assert.ok(content.startsWith('---\n'));
  assert.ok(content.includes('name: commit-changes'));
  assert.ok(content.includes('description:'));
});

test('CORE_SKILL_FILES: registers validate-plan.md with valid metadata', () => {
  assert.ok(CORE_SKILL_FILES.includes('validate-plan.md'));
  const templatePath = path.join(__dirname, '..', 'templates', '.agent-room', 'skills', 'validate-plan.md');
  assert.ok(fs.existsSync(templatePath));
  const content = fs.readFileSync(templatePath, 'utf8');
  assert.ok(content.startsWith('---\n'));
  assert.ok(content.includes('name: validate-plan'));
  assert.ok(content.includes('description:'));
});

test('CORE_SKILL_FILES: registers describe-pr.md with valid metadata', () => {
  assert.ok(CORE_SKILL_FILES.includes('describe-pr.md'));
  const templatePath = path.join(__dirname, '..', 'templates', '.agent-room', 'skills', 'describe-pr.md');
  assert.ok(fs.existsSync(templatePath));
  const content = fs.readFileSync(templatePath, 'utf8');
  assert.ok(content.startsWith('---\n'));
  assert.ok(content.includes('name: describe-pr'));
  assert.ok(content.includes('description:'));
});

test('CORE_SKILL_FILES and RETIRED_CORE_SKILL_FILES: accurately register canonical vs retired skills', () => {
  assert.ok(!CORE_SKILL_FILES.includes('brainstorming.md'));
  assert.ok(!CORE_SKILL_FILES.includes('verification-before-completion.md'));
  assert.ok(RETIRED_CORE_SKILL_FILES.includes('brainstorming.md'));
  assert.ok(RETIRED_CORE_SKILL_FILES.includes('verification-before-completion.md'));
  assert.strictEqual(CORE_SKILL_FILES.length, 10);
  assert.ok(CORE_SKILL_FILES.includes('research-codebase.md'));
  assert.ok(CORE_SKILL_FILES.includes('writing-plans.md'));
  assert.ok(CORE_SKILL_FILES.includes('implement-plan.md'));
  assert.ok(CORE_SKILL_FILES.includes('iterate-plan.md'));
  assert.ok(CORE_SKILL_FILES.includes('commit-changes.md'));
  assert.ok(CORE_SKILL_FILES.includes('validate-plan.md'));
  assert.ok(CORE_SKILL_FILES.includes('describe-pr.md'));
});

test('listSkillPacks: handles lingering retired skills without misclassifying as custom', async () => {
  const tmpDir = await createTestProject();
  try {
    const legacyPath = path.join(tmpDir, '.agent-room', 'skills', 'brainstorming.md');
    fs.writeFileSync(legacyPath, '---\nname: brainstorming\ndescription: Legacy\n---\n# Brainstorming\n', 'utf8');

    const res = listSkillPacks(tmpDir);
    const customNames = res.custom.map((s) => s.name);
    assert.ok(!customNames.includes('brainstorming'), 'brainstorming should not be classified as custom skill');
    assert.ok(Array.isArray(res.deprecated));
    const deprecatedNames = res.deprecated.map((s) => s.name);
    assert.ok(deprecatedNames.includes('brainstorming'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

