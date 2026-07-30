'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderTemplate } = require('./fsutil');
const { listSkillNamesFromDir, formatSkillList } = require('./init');

const ADAPTERS_TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'adapters');

const RULES_SYNC_ADAPTERS = [
  {
    tool: 'cursor',
    relDest: path.join('.cursor', 'rules', 'agent-room.mdc'),
    template: 'cursorrules.tmpl',
    summaryLabel: '.cursor/rules/agent-room.mdc',
  },
  {
    tool: 'windsurf',
    relDest: '.windsurfrules',
    template: 'windsurfrules.tmpl',
    summaryLabel: '.windsurfrules',
  },
  {
    tool: 'cline',
    relDest: '.clinerules',
    template: 'clinerules.tmpl',
    summaryLabel: '.clinerules',
  },
  {
    tool: 'codex',
    relDest: '.codexrules',
    template: 'codexrules.tmpl',
    summaryLabel: '.codexrules',
  },
];

function isGitDirty(target, relativePath) {
  try {
    const res = execFileSync('git', ['status', '--porcelain', '--', relativePath], {
      cwd: target,
      stdio: ['ignore', 'pipe', 'ignore'],
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

function activeRulesAdapters(tools) {
  return RULES_SYNC_ADAPTERS.filter((adapter) => tools.includes(adapter.tool));
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

function expectedRulesContent(target, config, templateFile) {
  const name = (config && config.name) || path.basename(target);
  const skillNames = listSkillNamesFromDir(path.join(target, '.agent-room', 'skills'));
  const template = fs.readFileSync(path.join(ADAPTERS_TEMPLATE_DIR, templateFile), 'utf8');
  return renderTemplate(template, {
    PROJECT_NAME: name,
    SKILL_LIST: formatSkillList(skillNames),
  });
}

function checkRulesFileSync(target, config, adapter) {
  const dest = path.join(target, adapter.relDest);
  const relativeDest = adapter.relDest.replace(/\\/g, '/');
  if (!fs.existsSync(dest)) {
    return [{ path: relativeDest, reason: 'missing' }];
  }
  const expected = expectedRulesContent(target, config, adapter.template);
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

function syncRulesFile(target, config, adapter, force) {
  const relativeDest = adapter.relDest.replace(/\\/g, '/');
  const dest = path.join(target, adapter.relDest);

  if (fs.existsSync(dest) && !force) {
    if (isGitDirty(target, relativeDest)) {
      console.log(`  skipped  ${relativeDest} (has unsaved modifications, use --force to overwrite)`);
      return { path: relativeDest, written: false, reason: 'dirty' };
    }
  }

  const content = expectedRulesContent(target, config, adapter.template);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  console.log(`  synced  ${relativeDest}`);
  return { path: relativeDest, written: true };
}

function expectedCursorRulesContent(target, config) {
  return expectedRulesContent(target, config, 'cursorrules.tmpl');
}

function checkCursorRulesSync(target, config) {
  const cursorAdapter = RULES_SYNC_ADAPTERS.find((adapter) => adapter.tool === 'cursor');
  return checkRulesFileSync(target, config, cursorAdapter);
}

function syncCursorRules(target, config, force) {
  const cursorAdapter = RULES_SYNC_ADAPTERS.find((adapter) => adapter.tool === 'cursor');
  return syncRulesFile(target, config, cursorAdapter, force);
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
  const rulesAdapters = activeRulesAdapters(tools);

  if (!wantClaude && rulesAdapters.length === 0) {
    console.log('No tools requiring sync found in project configuration - nothing to sync.');
    return;
  }

  if (checkOnly) {
    console.log('Checking if mirrored files are out of sync...');
    const outOfSync = [];
    if (wantClaude) outOfSync.push(...checkSkillsSync(target));
    for (const adapter of rulesAdapters) {
      outOfSync.push(...checkRulesFileSync(target, config, adapter));
    }
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

  for (const adapter of rulesAdapters) {
    results.push(syncRulesFile(target, config, adapter, force));
  }

  const skipped = results.filter((r) => !r.written && r.reason === 'dirty');
  if (skipped.length > 0) {
    console.warn(
      `\nWarning: ${skipped.length} mirrored file(s) had unsaved modifications and were skipped to prevent overwriting your edits. Use --force to discard modifications.`
    );
  } else {
    const parts = [];
    if (wantClaude) parts.push('.claude/skills/*');
    for (const adapter of rulesAdapters) {
      parts.push(adapter.summaryLabel);
    }
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
  expectedRulesContent,
  checkRulesFileSync,
  syncRulesFile,
  RULES_SYNC_ADAPTERS,
  isGitDirty,
};
