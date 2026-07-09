'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function isGitDirty(target, relativePath) {
  try {
    const res = execFileSync('git', ['status', '--porcelain', relativePath], {
      cwd: target,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString();
    return res.trim().length > 0;
  } catch (err) {
    return false;
  }
}

function checkSkillsSync(target) {
  const srcDir = path.join(target, '.agent-room', 'skills');
  const outOfSync = [];
  if (!fs.existsSync(srcDir)) {
    return outOfSync;
  }

  for (const file of fs.readdirSync(srcDir)) {
    if (!file.endsWith('.md')) continue;
    const skillName = file.replace(/\.md$/, '');
    const dest = path.join(target, '.claude', 'skills', skillName, 'SKILL.md');
    const relativeDest = path.relative(target, dest);

    if (!fs.existsSync(dest)) {
      outOfSync.push({ path: relativeDest, reason: 'missing' });
      continue;
    }

    const srcContent = fs.readFileSync(path.join(srcDir, file), 'utf8');
    const destContent = fs.readFileSync(dest, 'utf8');
    if (srcContent !== destContent) {
      outOfSync.push({ path: relativeDest, reason: 'different' });
    }
  }
  return outOfSync;
}

function syncSkillsToClaude(target) {
  const srcDir = path.join(target, '.agent-room', 'skills');
  const results = [];
  for (const file of fs.readdirSync(srcDir)) {
    if (!file.endsWith('.md')) continue;
    const skillName = file.replace(/\.md$/, '');
    const dest = path.join(target, '.claude', 'skills', skillName, 'SKILL.md');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, fs.readFileSync(path.join(srcDir, file), 'utf8'));
    results.push({ path: path.relative(target, dest) });
  }
  return results;
}

function runSync(target, args) {
  const checkOnly = !!(args && args.check);
  const force = !!(args && args.force);

  const configPath = path.join(target, '.agent-room.json');
  let tools = [];
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config && Array.isArray(config.tools)) {
        tools = config.tools;
      }
    } catch (err) {
      console.warn(`Warning: Failed to parse .agent-room.json: ${err.message}`);
    }
  }

  const agentRoomDir = path.join(target, '.agent-room', 'skills');
  if (!fs.existsSync(agentRoomDir)) {
    throw new Error(`No .agent-room/skills/ found in ${target} - run "create-agent-room init" first.`);
  }

  if (tools.length === 0) {
    if (fs.existsSync(path.join(target, 'CLAUDE.md')) || fs.existsSync(path.join(target, '.claude'))) {
      tools.push('claude');
    }
  }

  if (!tools.includes('claude')) {
    console.log('No tools requiring sync found in project configuration - nothing to sync.');
    return;
  }

  if (checkOnly) {
    console.log('Checking if mirrored skills are out of sync...');
    const outOfSync = checkSkillsSync(target);
    if (outOfSync.length > 0) {
      for (const item of outOfSync) {
        console.log(`  out-of-sync  ${item.path} (${item.reason})`);
      }
      console.error('\nError: Mirrored skills are out of sync. Run "create-agent-room sync" to update them.');
      process.exitCode = 1;
    } else {
      console.log('All mirrored skills are up to date.');
    }
    return;
  }

  const srcDir = path.join(target, '.agent-room', 'skills');
  const results = [];
  for (const file of fs.readdirSync(srcDir)) {
    if (!file.endsWith('.md')) continue;
    const skillName = file.replace(/\.md$/, '');
    const dest = path.join(target, '.claude', 'skills', skillName, 'SKILL.md');
    const relativeDest = path.relative(target, dest);

    if (fs.existsSync(dest) && !force) {
      if (isGitDirty(target, relativeDest)) {
        console.log(`  skipped  ${relativeDest} (has unsaved modifications, use --force to overwrite)`);
        results.push({ path: relativeDest, written: false, reason: 'dirty' });
        continue;
      }
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, fs.readFileSync(path.join(srcDir, file), 'utf8'));
    console.log(`  synced  ${relativeDest}`);
    results.push({ path: relativeDest, written: true });
  }

  const skipped = results.filter((r) => !r.written && r.reason === 'dirty');
  if (skipped.length > 0) {
    console.warn(`\nWarning: ${skipped.length} mirrored file(s) had unsaved modifications and were skipped to prevent overwriting your edits. Use --force to discard modifications.`);
  } else {
    console.log('\nSynced .agent-room/skills/* into .claude/skills/* (source of truth is .agent-room/skills/).');
  }
}

module.exports = { runSync, syncSkillsToClaude, checkSkillsSync, isGitDirty };
