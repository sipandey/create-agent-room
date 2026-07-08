'use strict';

const fs = require('fs');
const path = require('path');

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

function runSync(target) {
  const agentRoomDir = path.join(target, '.agent-room', 'skills');
  if (!fs.existsSync(agentRoomDir)) {
    throw new Error(`No .agent-room/skills/ found in ${target} - run "create-agent-room init" first.`);
  }

  const hasClaudeAdapter =
    fs.existsSync(path.join(target, 'CLAUDE.md')) || fs.existsSync(path.join(target, '.claude'));

  if (!hasClaudeAdapter) {
    console.log('No Claude Code adapter found (no CLAUDE.md / .claude/) - nothing to sync.');
    return;
  }

  const results = syncSkillsToClaude(target);
  for (const r of results) {
    console.log(`  synced  ${r.path}`);
  }
  console.log('\nSynced .agent-room/skills/* into .claude/skills/* (source of truth is .agent-room/skills/).');
}

module.exports = { runSync, syncSkillsToClaude };
