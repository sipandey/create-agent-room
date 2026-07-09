'use strict';

const fs = require('fs');
const path = require('path');
const { green, yellow, red, cyan, bold } = require('./color');
const { collectFindings } = require('./checks');
const { detectWorkspace } = require('./init');
const { version: CAR_VERSION } = require('../package.json');

// Hook files with no per-project {{VAR}} interpolation (verified: unlike
// github-actions.yml.tmpl, these three render identically regardless of
// project name/language), so a direct content comparison against the
// currently-packaged template is a valid, simple drift check - no need to
// re-resolve the full template-inheritance chain (org/stack layers) for v1.
// A room using a custom --org/--template-source override for these specific
// adapter files would produce a false "drifted" reading here; known
// limitation, not handled in this pass.
const STATIC_HOOK_FILES = [
  {
    installed: ['.git', 'hooks', 'pre-commit'],
    template: ['adapters', 'git-hooks', 'pre-commit.tmpl'],
    label: '.git/hooks/pre-commit'
  },
  {
    installed: ['.agent-room', 'hooks', 'guardrails-check.js'],
    template: ['adapters', 'git-hooks', 'guardrails-check.js'],
    label: '.agent-room/hooks/guardrails-check.js'
  },
  {
    installed: ['.agent-room', 'hooks', 'close-the-loop-check.js'],
    template: ['adapters', 'claude-hooks', 'close-the-loop-check.js'],
    label: '.agent-room/hooks/close-the-loop-check.js'
  }
];

// These exact three messages are the only warnings collectFindings() can
// ever produce for a --profile minimal room's principles.md/
// workflow-classifier.md/coordination/ checks (see the comment at their use
// site below). Coupled to lib/checks.js's exact wording on purpose - if
// that wording changes, this filter should be revisited alongside it.
const PROFILE_SCOPED_WARNINGS = new Set([
  'Recommended file not found: .agent-room/principles.md',
  'Recommended file not found: .agent-room/workflow-classifier.md',
  'Recommended directory not found: .agent-room/coordination'
]);

function normalize(content) {
  return content.replace(/\r\n/g, '\n').trim();
}

function checkHookDrift(target) {
  const drifted = [];
  const packagedTemplatesDir = path.join(__dirname, '..', 'templates');
  for (const hook of STATIC_HOOK_FILES) {
    const installedPath = path.join(target, ...hook.installed);
    const templatePath = path.join(packagedTemplatesDir, ...hook.template);
    if (!fs.existsSync(installedPath) || !fs.existsSync(templatePath)) continue;
    const installedContent = fs.readFileSync(installedPath, 'utf8');
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    if (normalize(installedContent) !== normalize(templateContent)) {
      drifted.push(hook.label);
    }
  }
  return drifted;
}

function checkCiVersionPin(target) {
  const ciPath = path.join(target, '.github', 'workflows', 'agent-room-validate.yml');
  if (!fs.existsSync(ciPath)) return null;
  const content = fs.readFileSync(ciPath, 'utf8');
  const match = content.match(/create-agent-room@([\w.]+)/);
  if (!match) return null;
  const pinned = match[1];
  if (pinned === 'latest') {
    return '.github/workflows/agent-room-validate.yml pins create-agent-room@latest, which defeats CI reproducibility';
  }
  if (pinned !== CAR_VERSION) {
    return `.github/workflows/agent-room-validate.yml pins create-agent-room@${pinned}; the installed CLI is ${CAR_VERSION}`;
  }
  return null;
}

// Cross-checks .agent-room.json's recorded tool selection against what's
// actually wired on disk - catches the case where a room was scaffolded,
// then partially edited/pruned by hand, or scaffolded by an older CLI
// version that wired things differently.
function checkConfigRealityMismatch(target) {
  const issues = [];
  const configPath = path.join(target, '.agent-room.json');
  if (!fs.existsSync(configPath)) return issues;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    // Malformed .agent-room.json is collectFindings'/validate's concern to
    // report, not doctor's to interpret further.
    return issues;
  }

  const tools = Array.isArray(config.tools) ? config.tools : [];

  if (tools.includes('claude')) {
    const settingsPath = path.join(target, '.claude', 'settings.json');
    let stopHookWired = false;
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const stopHooks = (settings.hooks && settings.hooks.Stop) || [];
        stopHookWired = stopHooks.some(
          (entry) =>
            Array.isArray(entry.hooks) &&
            entry.hooks.some((h) => h.command && h.command.includes('close-the-loop-check.js'))
        );
      } catch (err) {
        // ignore - malformed settings.json, nothing more to say here
      }
    }
    if (!stopHookWired) {
      issues.push('.agent-room.json lists "claude" as a tool, but the Stop hook is not wired in .claude/settings.json');
    }
  }

  if (tools.includes('git') && !fs.existsSync(path.join(target, '.git', 'hooks', 'pre-commit'))) {
    issues.push('.agent-room.json lists "git" as a tool, but .git/hooks/pre-commit does not exist');
  }

  return issues;
}

function runDoctor(target) {
  console.log(bold(`create-agent-room doctor: ${cyan(target)}\n`));

  const hasAgentRoom = fs.existsSync(path.join(target, '.agent-room'));

  if (!hasAgentRoom) {
    const detected = detectWorkspace(target);
    console.log(bold(red('🔴 Not set up yet')));
    console.log('  No .agent-room/ found in this directory.\n');

    const toolsGuess = detected.tools.length > 0 ? detected.tools.join(',') : 'claude,git';
    const langFlag = detected.language ? ` --language ${detected.language}` : '';

    console.log('  Recommended:');
    console.log(`    ${cyan(`create-agent-room init . --tools ${toolsGuess}${langFlag} --git`)}\n`);
    console.log('  Preview first without writing anything:');
    console.log(`    ${cyan(`create-agent-room init . --dry-run --tools ${toolsGuess}${langFlag} --git`)}\n`);
    return;
  }

  const { errors, warnings } = collectFindings(target);
  const driftedHooks = checkHookDrift(target);
  const ciVersionIssue = checkCiVersionPin(target);
  const configIssues = checkConfigRealityMismatch(target);

  // collectFindings() reports principles.md/workflow-classifier.md/
  // coordination/ as "warnings" for a --profile minimal room - by
  // construction of collectFindings' own logic, those three specific
  // messages can ONLY appear when the profile is deliberately minimal
  // (a full-profile room missing them would be an *error*, not a warning).
  // That's a correct, deliberate scaffold, not a problem - surfacing it
  // as an actionable "Recommended" item (and pointing at `init --force`,
  // which wouldn't even add them back) would be misleading noise for the
  // single most common case: a fresh default-profile room. Filter them out
  // here and say so plainly instead.
  const isMinimalProfile = warnings.some((w) => PROFILE_SCOPED_WARNINGS.has(w));
  const actionableWarnings = warnings.filter((w) => !PROFILE_SCOPED_WARNINGS.has(w));

  const critical = [...errors];
  const advisory = [
    ...actionableWarnings,
    ...driftedHooks.map(
      (label) => `${label} doesn't match the currently installed CLI's template — it may be missing recent fixes`
    ),
    ...(ciVersionIssue ? [ciVersionIssue] : []),
    ...configIssues
  ];

  if (isMinimalProfile) {
    console.log(
      cyan('  ℹ️  Scaffolded with --profile minimal — principles.md, workflow-classifier.md, and')
    );
    console.log(cyan('     coordination/ are intentionally skipped, not missing. Re-run with --profile'));
    console.log(cyan('     full to add them back.\n'));
  }

  if (critical.length > 0) {
    console.log(bold(red('🔴 Needs attention')));
    for (const e of critical) {
      console.log(red(`  - ${e}`));
    }
    console.log('');
  }

  if (advisory.length > 0) {
    console.log(bold(yellow('🟡 Recommended')));
    for (const w of advisory) {
      console.log(yellow(`  - ${w}`));
    }
    console.log('');
  }

  if (critical.length > 0 || advisory.length > 0) {
    console.log('  Refresh scaffolded files to match the current CLI (overwrites any manual');
    console.log('  edits to those files — review with `git diff` afterward):');
    console.log(`    ${cyan('create-agent-room init . --force')}\n`);
  } else {
    console.log(bold(green('🟢 Looks good')));
    console.log(green('  Structure and guardrails schema are valid, skills are valid, and hooks'));
    console.log(green('  match the currently installed CLI\'s templates.\n'));
  }
}

module.exports = { runDoctor };
