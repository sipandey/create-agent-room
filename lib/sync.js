'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderTemplate } = require('./fsutil');
const { listSkillNamesFromDir, formatSkillList } = require('./init');

const CURSOR_RULES_REL = path.join('.cursor', 'rules', 'agent-room.mdc');
const CURSOR_RULES_TEMPLATE = path.join(
  __dirname,
  '..',
  'templates',
  'adapters',
  'cursorrules.tmpl'
);

function isGitDirty(target, relativePath) {
  try {
    const res = execFileSync('git', ['status', '--porcelain', '--', relativePath], {
      cwd: target,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
    if (!res) return false;
    // Untracked (??) is not "user edited a synced mirror" — allow overwrite.
    // Only treat modified/staged tracked files as dirty.
    return res.split('\n').some((line) => line && !line.startsWith('??'));
  } catch (err) {
    return false;
  }
}

function readProjectConfig(target) {
  const configPath = path.join(target, '.agent-room.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) || {};
  } catch (err) {
    console.warn(`Warning: Failed to parse .agent-room.json: ${err.message}`);
    return {};
  }
}

function resolveSyncTools(target, config) {
  let tools = Array.isArray(config.tools) ? config.tools.slice() : [];
  if (tools.length === 0) {
    if (fs.existsSync(path.join(target, 'CLAUDE.md')) || fs.existsSync(path.join(target, '.claude'))) {
      tools.push('claude');
    }
  }
  return tools;
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

function expectedCursorRulesContent(target, config) {
  const name = (config && config.name) || path.basename(target);
  const skillNames = listSkillNamesFromDir(path.join(target, '.agent-room', 'skills'));
  const template = fs.readFileSync(CURSOR_RULES_TEMPLATE, 'utf8');
  return renderTemplate(template, {
    PROJECT_NAME: name,
    SKILL_LIST: formatSkillList(skillNames)
  });
}

function checkCursorRulesSync(target, config) {
  const dest = path.join(target, CURSOR_RULES_REL);
  const relativeDest = CURSOR_RULES_REL.replace(/\\/g, '/');
  if (!fs.existsSync(dest)) {
    return [{ path: relativeDest, reason: 'missing' }];
  }
  const expected = expectedCursorRulesContent(target, config);
  const actual = fs.readFileSync(dest, 'utf8');
  if (actual !== expected) {
    return [{ path: relativeDest, reason: 'different' }];
  }
  return [];
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

function syncCursorRules(target, config, force) {
  const relativeDest = CURSOR_RULES_REL.replace(/\\/g, '/');
  const dest = path.join(target, CURSOR_RULES_REL);

  if (fs.existsSync(dest) && !force) {
    if (isGitDirty(target, relativeDest)) {
      console.log(`  skipped  ${relativeDest} (has unsaved modifications, use --force to overwrite)`);
      return { path: relativeDest, written: false, reason: 'dirty' };
    }
  }

  const content = expectedCursorRulesContent(target, config);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  console.log(`  synced  ${relativeDest}`);
  return { path: relativeDest, written: true };
}

function runSync(target, args) {
  const checkOnly = !!(args && args.check);
  const force = !!(args && args.force);

  const config = readProjectConfig(target);
  const tools = resolveSyncTools(target, config);

  const agentRoomDir = path.join(target, '.agent-room', 'skills');
  if (!fs.existsSync(agentRoomDir)) {
    throw new Error(`No .agent-room/skills/ found in ${target} - run "create-agent-room init" first.`);
  }

  const wantClaude = tools.includes('claude');
  const wantCursor = tools.includes('cursor');

  if (!wantClaude && !wantCursor) {
    console.log('No tools requiring sync found in project configuration - nothing to sync.');
    return;
  }

  if (checkOnly) {
    console.log('Checking if mirrored files are out of sync...');
    const outOfSync = [];
    if (wantClaude) outOfSync.push(...checkSkillsSync(target));
    if (wantCursor) outOfSync.push(...checkCursorRulesSync(target, config));
    if (outOfSync.length > 0) {
      for (const item of outOfSync) {
        console.log(`  out-of-sync  ${item.path} (${item.reason})`);
      }
      console.error('\nError: Mirrored files are out of sync. Run "create-agent-room sync" to update them.');
      process.exitCode = 1;
    } else {
      console.log('All mirrored files are up to date.');
    }
    return;
  }

  const results = [];

  if (wantClaude) {
    const srcDir = path.join(target, '.agent-room', 'skills');
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
  }

  if (wantCursor) {
    results.push(syncCursorRules(target, config, force));
  }

  const skipped = results.filter((r) => !r.written && r.reason === 'dirty');
  if (skipped.length > 0) {
    console.warn(
      `\nWarning: ${skipped.length} mirrored file(s) had unsaved modifications and were skipped to prevent overwriting your edits. Use --force to discard modifications.`
    );
  } else {
    const parts = [];
    if (wantClaude) parts.push('.claude/skills/*');
    if (wantCursor) parts.push('.cursor/rules/agent-room.mdc');
    console.log(
      `\nSynced from .agent-room/skills/ into ${parts.join(' and ')} (source of truth is .agent-room/skills/).`
    );
  }
}

module.exports = {
  runSync,
  syncSkillsToClaude,
  checkSkillsSync,
  checkCursorRulesSync,
  syncCursorRules,
  expectedCursorRulesContent,
  isGitDirty
};
