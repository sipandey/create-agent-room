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
  {
    tool: 'copilot',
    relDest: path.join('.github', 'copilot-instructions.md'),
    template: 'copilot-instructions.tmpl',
    summaryLabel: '.github/copilot-instructions.md',
  },
];

const ALL_SYNC_TOOLS = ['claude', 'cursor', 'windsurf', 'cline', 'codex', 'copilot'];

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

function detectWorkspaceTools(target) {
  const tools = [];
  if (fs.existsSync(path.join(target, '.claude')) || fs.existsSync(path.join(target, 'CLAUDE.md'))) {
    tools.push('claude');
  }
  if (
    fs.existsSync(path.join(target, '.cursor')) ||
    fs.existsSync(path.join(target, '.cursorrules')) ||
    fs.existsSync(path.join(target, '.cursor', 'rules'))
  ) {
    tools.push('cursor');
  }
  if (fs.existsSync(path.join(target, '.windsurfrules'))) {
    tools.push('windsurf');
  }
  if (fs.existsSync(path.join(target, '.clinerules'))) {
    tools.push('cline');
  }
  if (fs.existsSync(path.join(target, '.codexrules'))) {
    tools.push('codex');
  }
  if (
    fs.existsSync(path.join(target, '.github', 'copilot-instructions.md')) ||
    fs.existsSync(path.join(target, '.copilot-instructions.md'))
  ) {
    tools.push('copilot');
  }
  return tools;
}

function resolveSyncTools(target, config, args = {}) {
  if (args.all) {
    return ALL_SYNC_TOOLS.slice();
  }
  if (args.tools) {
    const raw = Array.isArray(args.tools) ? args.tools : String(args.tools).split(',');
    const parsed = raw.map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (parsed.includes('all')) {
      return ALL_SYNC_TOOLS.slice();
    }
    return parsed.filter((t) => ALL_SYNC_TOOLS.includes(t));
  }
  const configTools = Array.isArray(config && config.tools) ? config.tools : [];
  const detectedTools = detectWorkspaceTools(target);
  const combined = Array.from(new Set([...configTools, ...detectedTools])).filter((t) =>
    ALL_SYNC_TOOLS.includes(t)
  );
  return combined;
}

function activeRulesAdapters(tools) {
  return RULES_SYNC_ADAPTERS.filter((adapter) => tools.includes(adapter.tool));
}

function extractUserCustomizations(existingContent) {
  if (!existingContent || typeof existingContent !== 'string') return null;

  // 1. Paired markers:
  // <!-- user-customizations-start --> ... <!-- user-customizations-end -->
  // <!-- custom-rules-start --> ... <!-- custom-rules-end -->
  // <!-- custom-start --> ... <!-- custom-end -->
  // <!-- user-content-start --> ... <!-- user-content-end -->
  const pairedRegex =
    /<!--\s*(?:user-customizations-start|custom-rules-start|custom-start|user-content-start)\s*-->([\s\S]*?)<!--\s*(?:user-customizations-end|custom-rules-end|custom-end|user-content-end)\s*-->/i;
  const pairedMatch = existingContent.match(pairedRegex);
  if (pairedMatch) {
    const inner = pairedMatch[1].trim();
    if (inner && !inner.startsWith('<!-- Add custom rules here')) {
      return inner;
    }
    return null;
  }

  // 2. Trailing single marker:
  // <!-- user-customizations --> ...
  // <!-- custom-rules --> ...
  // <!-- user-content --> ...
  const trailingRegex = /<!--\s*(?:user-customizations|custom-rules|user-content)\s*-->([\s\S]*)$/i;
  const trailingMatch = existingContent.match(trailingRegex);
  if (trailingMatch) {
    const inner = trailingMatch[1].trim();
    if (inner && !inner.startsWith('<!-- Add custom rules here')) {
      return inner;
    }
    return null;
  }

  return null;
}

function appendUserCustomizations(baseContent, custom) {
  if (!custom || !custom.trim()) return baseContent;
  const trimmed = baseContent.trimEnd();
  return `${trimmed}\n\n<!-- user-customizations-start -->\n${custom.trim()}\n<!-- user-customizations-end -->\n`;
}

function expectedRulesContent(target, config, templateFile, existingContent) {
  const name = (config && config.name) || path.basename(target);
  const skillNames = listSkillNamesFromDir(path.join(target, '.agent-room', 'skills'));
  const template = fs.readFileSync(path.join(ADAPTERS_TEMPLATE_DIR, templateFile), 'utf8');
  let content = renderTemplate(template, {
    PROJECT_NAME: name,
    SKILL_LIST: formatSkillList(skillNames),
  });

  const custom = existingContent ? extractUserCustomizations(existingContent) : null;
  if (custom) {
    content = appendUserCustomizations(content, custom);
  }
  return content;
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

function checkRulesFileSync(target, config, adapter) {
  const dest = path.join(target, adapter.relDest);
  const relativeDest = adapter.relDest.replace(/\\/g, '/');
  if (!fs.existsSync(dest)) {
    return [{ path: relativeDest, reason: 'missing' }];
  }
  const actual = fs.readFileSync(dest, 'utf8');
  const expected = expectedRulesContent(target, config, adapter.template, actual);
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

  let existingContent = null;
  if (fs.existsSync(dest)) {
    if (!force && isGitDirty(target, relativeDest)) {
      console.log(`  skipped  ${relativeDest} (has unsaved modifications, use --force to overwrite)`);
      return { path: relativeDest, written: false, reason: 'dirty' };
    }
    existingContent = fs.readFileSync(dest, 'utf8');
  }

  const content = expectedRulesContent(target, config, adapter.template, existingContent);

  if (existingContent !== null && existingContent === content) {
    console.log(`  up-to-date  ${relativeDest}`);
    return { path: relativeDest, written: false, reason: 'unchanged' };
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  console.log(`  synced  ${relativeDest}`);
  return { path: relativeDest, written: true };
}

function expectedCursorRulesContent(target, config, existingContent) {
  return expectedRulesContent(target, config, 'cursorrules.tmpl', existingContent);
}

function checkCursorRulesSync(target, config) {
  const cursorAdapter = RULES_SYNC_ADAPTERS.find((adapter) => adapter.tool === 'cursor');
  return checkRulesFileSync(target, config, cursorAdapter);
}

function syncCursorRules(target, config, force) {
  const cursorAdapter = RULES_SYNC_ADAPTERS.find((adapter) => adapter.tool === 'cursor');
  return syncRulesFile(target, config, cursorAdapter, force);
}

function formatSummaryParts(parts) {
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function runSync(target, args) {
  const checkOnly = !!(args && args.check);
  const force = !!(args && args.force);

  const config = readProjectConfig(target);
  const tools = resolveSyncTools(target, config, args);

  const agentRoomDir = path.join(target, '.agent-room', 'skills');
  if (!fs.existsSync(agentRoomDir)) {
    throw new Error(`No .agent-room/skills/ found in ${target} - run "create-agent-room init" first.`);
  }

  const wantClaude = tools.includes('claude');
  const rulesAdapters = activeRulesAdapters(tools);

  if (!wantClaude && rulesAdapters.length === 0) {
    console.log('No tools requiring sync found in project configuration or workspace - nothing to sync.');
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

      const srcContent = fs.readFileSync(path.join(srcDir, file), 'utf8');
      if (fs.existsSync(dest)) {
        const destContent = fs.readFileSync(dest, 'utf8');
        if (destContent === srcContent) {
          console.log(`  up-to-date  ${relativeDest}`);
          results.push({ path: relativeDest, written: false, reason: 'unchanged' });
          continue;
        }
      }

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, srcContent);
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
      `\nSynced from .agent-room/skills/ into ${formatSummaryParts(parts)} (source of truth is .agent-room/skills/).`
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
  ALL_SYNC_TOOLS,
  detectWorkspaceTools,
  resolveSyncTools,
  extractUserCustomizations,
  appendUserCustomizations,
  isGitDirty,
};
