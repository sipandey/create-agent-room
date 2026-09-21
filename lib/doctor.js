'use strict';

const fs = require('fs');
const path = require('path');
const { green, yellow, red, cyan, bold } = require('./color');
const { collectFindings } = require('./checks');
const { detectWorkspace, wireClaudeStopHook, wireCursorStopHook } = require('./init');
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
  },
  {
    installed: ['.agent-room', 'hooks', 'closing-the-loop-evidence.js'],
    template: ['adapters', 'claude-hooks', 'closing-the-loop-evidence.js'],
    label: '.agent-room/hooks/closing-the-loop-evidence.js'
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

  if (tools.includes('cursor')) {
    const hooksPath = path.join(target, '.cursor', 'hooks.json');
    let stopHookWired = false;
    if (fs.existsSync(hooksPath)) {
      try {
        const hooksDoc = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
        const stop = (hooksDoc.hooks && hooksDoc.hooks.stop) || [];
        stopHookWired = stop.some(
          (entry) =>
            entry &&
            typeof entry.command === 'string' &&
            entry.command.includes('close-the-loop-check.js') &&
            entry.command.includes('--adapter=cursor')
        );
      } catch (err) {
        // ignore malformed hooks.json
      }
    }
    if (!stopHookWired) {
      issues.push(
        '.agent-room.json lists "cursor" as a tool, but the stop hook is not wired in .cursor/hooks.json'
      );
    }
  }

  if (tools.includes('git') && !fs.existsSync(path.join(target, '.git', 'hooks', 'pre-commit'))) {
    issues.push('.agent-room.json lists "git" as a tool, but .git/hooks/pre-commit does not exist');
  }

  return issues;
}

// Pure computation behind runDoctor() - no console output, so both the CLI
// command and an external caller (e.g. scripts/check-doctor-clean.js) can
// consume the same findings without parsing printed/colored text. Extracted
// for the same reason lib/checks.js's collectFindings() was: two callers
// must never silently drift on what counts as a finding.
function getFindings(target) {
  const hasAgentRoom = fs.existsSync(path.join(target, '.agent-room'));
  if (!hasAgentRoom) {
    return { notSetUp: true, critical: [], advisory: [], isMinimalProfile: false };
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

  let preset = 'standard';
  const configPath = path.join(target, '.agent-room.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg && (cfg.preset || cfg.profile)) {
        preset = (cfg.preset || cfg.profile).toLowerCase();
        if (preset === 'full') preset = 'standard';
      }
    } catch (err) {
      // ignore
    }
  } else if (isMinimalProfile) {
    preset = 'minimal';
  }

  return { notSetUp: false, critical, advisory, isMinimalProfile, preset };
}

function fixFindings(target) {
  const fixed = [];
  const packagedTemplatesDir = path.join(__dirname, '..', 'templates');

  // 1. Re-synchronize drifted static hooks
  for (const hook of STATIC_HOOK_FILES) {
    const installedPath = path.join(target, ...hook.installed);
    const templatePath = path.join(packagedTemplatesDir, ...hook.template);
    if (!fs.existsSync(templatePath)) continue;

    if (fs.existsSync(installedPath)) {
      const installedContent = fs.readFileSync(installedPath, 'utf8');
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      if (normalize(installedContent) !== normalize(templateContent)) {
        fs.writeFileSync(installedPath, templateContent);
        if (hook.installed.includes('pre-commit')) {
          try {
            fs.chmodSync(installedPath, 0o755);
          } catch (err) {
            // ignore chmod errors on Windows
          }
        }
        fixed.push(`Synchronized drifted hook: ${hook.label}`);
      }
    }
  }

  // 2. Re-pin CI version in .github/workflows/agent-room-validate.yml
  const ciPath = path.join(target, '.github', 'workflows', 'agent-room-validate.yml');
  if (fs.existsSync(ciPath)) {
    let content = fs.readFileSync(ciPath, 'utf8');
    const match = content.match(/create-agent-room@([\w.]+)/);
    if (match) {
      const pinned = match[1];
      if (pinned !== CAR_VERSION) {
        content = content.replace(/create-agent-room@[\w.]+/, `create-agent-room@${CAR_VERSION}`);
        fs.writeFileSync(ciPath, content);
        fixed.push(`Re-pinned CI action version to create-agent-room@${CAR_VERSION}`);
      }
    }
  }

  // 3. Re-wire missing Claude/Cursor/Git hooks if registered in .agent-room.json
  const configPath = path.join(target, '.agent-room.json');
  if (fs.existsSync(configPath)) {
    let config;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      config = null;
    }

    if (config && Array.isArray(config.tools)) {
      if (config.tools.includes('claude')) {
        const res = wireClaudeStopHook(target);
        if (res && res.written) {
          fixed.push('Re-wired Claude Code Stop hook in .claude/settings.json');
        }
      }

      if (config.tools.includes('cursor')) {
        const res = wireCursorStopHook(target);
        if (res && res.written) {
          fixed.push('Re-wired Cursor stop hook in .cursor/hooks.json');
        }
      }

      if (config.tools.includes('git')) {
        const preCommitPath = path.join(target, '.git', 'hooks', 'pre-commit');
        if (!fs.existsSync(preCommitPath)) {
          const tmplPath = path.join(packagedTemplatesDir, 'adapters', 'git-hooks', 'pre-commit.tmpl');
          if (fs.existsSync(tmplPath)) {
            fs.mkdirSync(path.dirname(preCommitPath), { recursive: true });
            fs.writeFileSync(preCommitPath, fs.readFileSync(tmplPath, 'utf8'));
            try {
              fs.chmodSync(preCommitPath, 0o755);
            } catch (err) {
              // ignore
            }
            fixed.push('Restored missing git pre-commit hook in .git/hooks/pre-commit');
          }
        }
      }
    }
  }

  return fixed;
}

function runDoctor(target, opts) {
  opts = opts || {};
  const isFix = Boolean(opts.fix);

  if (isFix) {
    console.log(bold(`create-agent-room doctor --fix: ${cyan(target)}\n`));
  } else {
    console.log(bold(`create-agent-room doctor: ${cyan(target)}\n`));
  }

  const initialFindings = getFindings(target);

  if (initialFindings.notSetUp) {
    const detected = detectWorkspace(target);
    console.log(bold(red('🔴 Not set up yet')));
    console.log('  No .agent-room/ found in this directory.\n');

    const toolsGuess = detected.tools.length > 0 ? detected.tools.join(',') : 'claude,git';
    const langFlag = detected.language ? ` --language ${detected.language}` : '';

    console.log('  Recommended:');
    console.log(`    ${cyan(`create-agent-room init . --tools ${toolsGuess}${langFlag} --git`)}\n`);
    console.log('  Preview first without writing anything:');
    console.log(`    ${cyan(`create-agent-room init . --dry-run --tools ${toolsGuess}${langFlag} --git`)}\n`);
    return { findings: initialFindings, fixed: [] };
  }

  let fixed = [];
  if (isFix) {
    fixed = fixFindings(target);
    if (fixed.length > 0) {
      console.log(bold(green('🛠️  Applied auto-remediations:')));
      for (const item of fixed) {
        console.log(green(`  ✅  ${item}`));
      }
      console.log('');
    } else {
      console.log(yellow('  No auto-remediable issues found.\n'));
    }
  }

  const findings = isFix ? getFindings(target) : initialFindings;
  const { critical, advisory, isMinimalProfile } = findings;

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
    if (!isFix) {
      console.log(
        `  Auto-repair drifted hooks, missing stop hooks, and CI pins with ${cyan('create-agent-room doctor --fix')}.`
      );
    }
    console.log('  Or refresh all scaffolded files to match the current CLI (overwrites any manual');
    console.log('  edits to those files — review with `git diff` afterward):');
    console.log(`    ${cyan('create-agent-room init . --force')}\n`);
  } else {
    console.log(bold(green('🟢 Looks good')));
    console.log(green('  Structure and guardrails schema are valid, skills are valid, and hooks'));
    console.log(green('  match the currently installed CLI\'s templates.\n'));
  }

  return { findings, fixed };
}

module.exports = { runDoctor, getFindings, fixFindings, STATIC_HOOK_FILES };

