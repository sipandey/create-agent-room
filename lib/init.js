'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { ask } = require('./prompt');
const { ensureDir, resolveTemplateSources, copyFileInherited, copyDirInherited, copyFile } = require('./fsutil');
const { green, yellow, red, cyan, bold } = require('./color');
const { version: CAR_VERSION } = require('../package.json');

const VALID_TOOLS = ['claude', 'cursor', 'windsurf', 'cline', 'codex', 'git', 'none'];

function parseSafeJSON(str) {
  if (!str || !str.trim()) return {};
  const clean = str.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? '' : m));
  return JSON.parse(clean);
}

function detectWorkspace(target) {
  const result = {
    language: null,
    packageManager: null,
    tools: []
  };

  if (!fs.existsSync(target)) return result;

  // 1. Language & Manager Detection
  if (fs.existsSync(path.join(target, 'Cargo.toml'))) {
    result.language = 'rust';
    result.packageManager = 'cargo';
  } else if (fs.existsSync(path.join(target, 'go.mod'))) {
    result.language = 'go';
    result.packageManager = 'go';
  } else if (fs.existsSync(path.join(target, 'package.json'))) {
    result.language = 'javascript';
    if (fs.existsSync(path.join(target, 'tsconfig.json'))) {
      result.language = 'typescript';
    }
    if (fs.existsSync(path.join(target, 'pnpm-lock.yaml'))) {
      result.packageManager = 'pnpm';
    } else if (fs.existsSync(path.join(target, 'yarn.lock'))) {
      result.packageManager = 'yarn';
    } else if (fs.existsSync(path.join(target, 'bun.lockb')) || fs.existsSync(path.join(target, 'bun.lock'))) {
      result.packageManager = 'bun';
    } else {
      result.packageManager = 'npm';
    }
  } else if (
    fs.existsSync(path.join(target, 'Pipfile')) ||
    fs.existsSync(path.join(target, 'requirements.txt')) ||
    fs.existsSync(path.join(target, 'pyproject.toml'))
  ) {
    result.language = 'python';
    if (fs.existsSync(path.join(target, 'pyproject.toml'))) {
      result.packageManager = 'poetry';
    } else if (fs.existsSync(path.join(target, 'Pipfile'))) {
      result.packageManager = 'pipenv';
    } else {
      result.packageManager = 'pip';
    }
  }

  // 2. Tools Auto-detection
  if (fs.existsSync(path.join(target, '.git'))) {
    result.tools.push('git');
  }
  if (fs.existsSync(path.join(target, '.claude')) || fs.existsSync(path.join(target, 'CLAUDE.md'))) {
    result.tools.push('claude');
  }
  if (
    fs.existsSync(path.join(target, '.cursor')) ||
    fs.existsSync(path.join(target, '.cursorrules')) ||
    fs.existsSync(path.join(target, '.cursor/rules'))
  ) {
    result.tools.push('cursor');
  }
  if (fs.existsSync(path.join(target, '.windsurfrules'))) {
    result.tools.push('windsurf');
  }
  if (fs.existsSync(path.join(target, '.clinerules'))) {
    result.tools.push('cline');
  }

  return result;
}

async function resolveLanguage(args, detected) {
  if (args.language) return args.language;
  const defaultLang = detected.language || 'javascript';
  if (args.yes || !process.stdin.isTTY) return defaultLang;
  const answer = await ask(`Project programming language (default: ${defaultLang}): `);
  return answer || defaultLang;
}

async function resolvePackageManager(args, language, detected) {
  if (args['package-manager']) return args['package-manager'];
  const defaultPM = (() => {
    const lang = (language || 'javascript').toLowerCase();
    if (detected.language && detected.language.toLowerCase() === lang && detected.packageManager) {
      return detected.packageManager;
    }
    if (lang === 'python') return 'pip';
    if (lang === 'go') return 'go';
    if (lang === 'rust') return 'cargo';
    return 'npm';
  })();
  if (args.yes || !process.stdin.isTTY) return defaultPM;
  const answer = await ask(`Package manager (default: ${defaultPM}): `);
  return answer || defaultPM;
}

async function resolveBranch(args) {
  if (args.branch) return args.branch;
  if (args.yes || !process.stdin.isTTY) return 'main';
  const answer = await ask('Default git branch (default: main): ');
  return answer || 'main';
}

async function resolveSkillPacks(args) {
  if (args['skill-packs']) {
    return args['skill-packs']
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (args.yes || !process.stdin.isTTY) {
    return [];
  }
  const answer = await ask('Optional skill packs to include? (comma-separated: testing,security,release,code-review,api-design,database,performance,observability,documentation; blank = none): ');
  return answer
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getDerivedCommands(language, packageManager) {
  const lang = (language || 'javascript').toLowerCase();
  const pm = (packageManager || 'npm').toLowerCase();

  let testCommand = `${pm} test`;
  let lintCommand = `${pm} run lint`;

  if (lang === 'typescript' || lang === 'javascript') {
    if (pm === 'npm') {
      testCommand = 'npm test';
      lintCommand = 'npm run lint';
    } else if (pm === 'yarn') {
      testCommand = 'yarn test';
      lintCommand = 'yarn lint';
    } else if (pm === 'pnpm') {
      testCommand = 'pnpm test';
      lintCommand = 'pnpm lint';
    } else if (pm === 'bun') {
      testCommand = 'bun test';
      lintCommand = 'bun lint';
    }
  } else if (lang === 'python') {
    testCommand = 'pytest';
    lintCommand = 'flake8 .';
    if (pm === 'poetry') {
      testCommand = 'poetry run pytest';
      lintCommand = 'poetry run flake8 .';
    } else if (pm === 'pipenv') {
      testCommand = 'pipenv run pytest';
      lintCommand = 'pipenv run flake8 .';
    }
  } else if (lang === 'go') {
    testCommand = 'go test ./...';
    lintCommand = 'golangci-lint run';
  } else if (lang === 'rust') {
    testCommand = 'cargo test';
    lintCommand = 'cargo clippy';
  } else if (lang === 'java' || lang === 'kotlin') {
    if (pm === 'gradle') {
      testCommand = './gradlew test';
      lintCommand = './gradlew checkstyleMain';
    } else {
      testCommand = 'mvn test';
      lintCommand = 'mvn checkstyle:check';
    }
  }

  return { testCommand, lintCommand };
}

const VALID_PROFILES = ['minimal', 'full'];

// "minimal" is the default profile, not "full", per Gloaguen et al. 2026
// (ETH Zurich): verbose LLM-facing context files measurably reduce agent
// performance and increase token cost relative to minimal ones. Under
// "minimal", the scaffold ships only what's mechanically enforced or
// directly load-bearing (AGENTS.md, guardrails, skills, the Stop/pre-commit
// hooks) and skips the rest of the framework (principles.md,
// workflow-classifier.md, coordination/, skill packs) unless explicitly
// requested. "full" restores the pre-profile default (everything) for teams
// that want the complete framework regardless of the token cost.
function resolveProfile(args) {
  const profile = (args.profile || 'minimal').toLowerCase();
  if (!VALID_PROFILES.includes(profile)) {
    throw new Error(`Unknown profile: ${profile}. Valid: ${VALID_PROFILES.join(', ')}`);
  }
  return profile;
}

// AGENTS.md's "First 5 Minutes" / "Read these" / "default workflow"
// sections reference principles.md, workflow-classifier.md, and
// coordination/ - all of which are skipped under the "minimal" profile.
// Rather than a second template file (which would need to be duplicated
// and kept in sync with the base one), these three sections are computed
// here and injected via {{FIRST_FIVE_MINUTES}}/{{GUIDANCE_LINKS}}/
// {{DEFAULT_WORKFLOW}} - the existing flat {{VAR}} substitution mechanism,
// no template-engine conditionals needed.
function buildAgentsMdSections(profile) {
  if (profile === 'full') {
    return {
      FIRST_FIVE_MINUTES: [
        '1.  **Check coordination state:** Are there other agents working? Check open',
        '    PRs, issue assignments, or the `.agent-room/sessions/` directory.',
        '    Read `.agent-room/coordination/handoff-protocol.md` if you are picking',
        '    up someone else\'s work.',
        '2.  **Classify the work:** Use `.agent-room/workflow-classifier.md`. Don\'t',
        '    apply Feature-weight process to a one-line bug fix, and don\'t skip design',
        '    for a "simple" feature.',
        '3.  **Check guardrails:** Review `.agent-room/guardrails.md`. Ensure your',
        '    planned work does not touch protected paths or require human approval',
        '    without asking first.',
        '4.  **Review past decisions:** Read `.agent-room/anti-patterns.md` and',
        '    `.agent-room/decisions.md` to understand *why* the codebase is structured',
        '    this way, and what mistakes to avoid.'
      ].join('\n'),
      GUIDANCE_LINKS: [
        '- [`.agent-room/principles.md`](.agent-room/principles.md) — how to get',
        '  reliable output from an LLM (context, iteration, checkpointing, tests as',
        '  spec, negative knowledge).',
        '- [`.agent-room/guardrails.md`](.agent-room/guardrails.md) — boundaries and',
        '  constraints. Check before touching protected paths or making large changes.',
        '- [`.agent-room/workflow-classifier.md`](.agent-room/workflow-classifier.md) —',
        '  how to size the process to the work (Bug / Enhancement / Feature / Product).',
        '- [`.agent-room/anti-patterns.md`](.agent-room/anti-patterns.md) — things that',
        '  have already gone wrong in this project. Check before repeating a mistake;',
        '  append after fixing one.',
        '- [`.agent-room/decisions.md`](.agent-room/decisions.md) — short log of',
        '  architecture/design decisions and why. Append when you make one that future',
        '  sessions would otherwise have to re-derive.',
        '- [`.agent-room/skills/`](.agent-room/skills/) — procedures to follow, not',
        '  just read: `brainstorming`, `writing-plans`, `test-driven-development`,',
        '  `systematic-debugging`, `verification-before-completion`,',
        '  `closing-the-loop`.',
        '- [`.agent-room/coordination/`](.agent-room/coordination/) — protocols for',
        '  multi-agent workflows: `handoff-protocol`, `scope-boundaries`,',
        '  `session-log-format`.'
      ].join('\n'),
      DEFAULT_WORKFLOW: [
        '1. **Classify the work** using `.agent-room/workflow-classifier.md`.',
        '2. **For anything beyond a trivial bug fix**, brainstorm before building: ask',
        '   clarifying questions, propose 2-3 approaches with trade-offs, get the',
        '   design approved, *then* write a short design note under `docs/plans/`.',
        '3. **Use TDD**: write the failing test first, watch it fail, write the',
        '   minimal code to pass, refactor, commit. No production code without a',
        '   failing test first.',
        '4. **Debug systematically**: find the root cause before proposing a fix.',
        '   Reproduce, check recent changes, gather evidence at component boundaries.',
        '   No fixes without root-cause investigation.',
        '5. **Verify before claiming done**: run the actual test/build/lint command in',
        '   this turn and read its output before saying "tests pass" or "fixed."',
        '   "Should work" is not evidence.',
        '6. **Serialize state**: Before ending your session, log your work in',
        '   `.agent-room/sessions/` according to `session-log-format.md`, and write',
        '   a handoff note if the task is incomplete.',
        '7. **Close the loop — before ending the turn, not after**: this is a gate,',
        '   not a suggestion. Follow `.agent-room/skills/closing-the-loop.md`. If the',
        '   turn fixed a bug, found a root cause, or made a non-obvious design call,',
        '   append it to `.agent-room/anti-patterns.md` or `.agent-room/decisions.md`',
        '   *before* claiming the task is done. If nothing qualifies, say so',
        '   explicitly rather than silently skipping the check.'
      ].join('\n')
    };
  }

  return {
    FIRST_FIVE_MINUTES: [
      '1.  **Check guardrails:** Review `.agent-room/guardrails.md`. Ensure your',
      '    planned work does not touch protected paths or require human approval',
      '    without asking first.',
      '2.  **Review past decisions:** Read `.agent-room/anti-patterns.md` and',
      '    `.agent-room/decisions.md` to understand *why* the codebase is structured',
      '    this way, and what mistakes to avoid.'
    ].join('\n'),
    GUIDANCE_LINKS: [
      '- [`.agent-room/guardrails.md`](.agent-room/guardrails.md) — boundaries and',
      '  constraints. Check before touching protected paths or making large changes.',
      '- [`.agent-room/anti-patterns.md`](.agent-room/anti-patterns.md) — things that',
      '  have already gone wrong in this project. Check before repeating a mistake;',
      '  append after fixing one.',
      '- [`.agent-room/decisions.md`](.agent-room/decisions.md) — short log of',
      '  architecture/design decisions and why. Append when you make one that future',
      '  sessions would otherwise have to re-derive.',
      '- [`.agent-room/skills/`](.agent-room/skills/) — procedures to follow, not',
      '  just read: `brainstorming`, `writing-plans`, `test-driven-development`,',
      '  `systematic-debugging`, `verification-before-completion`,',
      '  `closing-the-loop`.',
      '',
      '_Scaffolded with `--profile minimal` (the default): `principles.md`,',
      '`workflow-classifier.md`, and `coordination/` were skipped. Re-run',
      '`init --profile full --force` to add them._'
    ].join('\n'),
    DEFAULT_WORKFLOW: [
      '1. **For anything beyond a trivial bug fix**, brainstorm before building: ask',
      '   clarifying questions, propose 2-3 approaches with trade-offs, get the',
      '   design approved, *then* write a short design note under `docs/plans/`.',
      '2. **Use TDD**: write the failing test first, watch it fail, write the',
      '   minimal code to pass, refactor, commit. No production code without a',
      '   failing test first.',
      '3. **Debug systematically**: find the root cause before proposing a fix.',
      '   Reproduce, check recent changes, gather evidence at component boundaries.',
      '   No fixes without root-cause investigation.',
      '4. **Verify before claiming done**: run the actual test/build/lint command in',
      '   this turn and read its output before saying "tests pass" or "fixed."',
      '   "Should work" is not evidence.',
      '5. **Serialize state**: Before ending your session, log your work in',
      '   `.agent-room/sessions/`.',
      '6. **Close the loop — before ending the turn, not after**: this is a gate,',
      '   not a suggestion. Follow `.agent-room/skills/closing-the-loop.md`. If the',
      '   turn fixed a bug, found a root cause, or made a non-obvious design call,',
      '   append it to `.agent-room/anti-patterns.md` or `.agent-room/decisions.md`',
      '   *before* claiming the task is done. If nothing qualifies, say so',
      '   explicitly rather than silently skipping the check.'
    ].join('\n')
  };
}

function isGitUrl(str) {
  return (
    str.startsWith('git+') ||
    str.startsWith('git://') ||
    str.includes('github.com/') ||
    str.includes('gitlab.com/') ||
    str.endsWith('.git')
  );
}

function copySkillsFromDirectory(sourceDir, target, vars, opts) {
  const results = [];
  const destDir = path.join(target, '.agent-room', 'skills');
  ensureDir(destDir);

  const skillsDir = path.join(sourceDir, 'skills');
  const hasSkillsSubdir = fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory();

  const scanDir = hasSkillsSubdir ? skillsDir : sourceDir;

  const files = fs.readdirSync(scanDir).filter(
    (f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md' && f.toLowerCase() !== 'agents.md'
  );

  const root = (opts && opts.root) || destDir;

  for (const file of files) {
    const srcPath = path.join(scanDir, file);
    const destPath = path.join(destDir, file);
    const res = copyFile(srcPath, destPath, vars, opts);
    results.push(Object.assign({ path: path.relative(root, destPath) }, res));
  }
  return results;
}

function installSkillPacks(target, skillPacks, srcDirs, vars, opts) {
  const results = [];
  const validPacks = ['testing', 'security', 'release', 'code-review', 'api-design', 'database', 'performance', 'observability', 'documentation'];
  const tempDirs = [];

  for (const pack of skillPacks) {
    if (validPacks.includes(pack)) {
      const packSrcDirs = srcDirs.map((d) => path.join(d, 'skill-packs', pack));
      const destDir = path.join(target, '.agent-room', 'skills');
      results.push(...copyDirInherited(packSrcDirs, '', destDir, vars, opts));
    } else if (isGitUrl(pack)) {
      const tempCloneDir = path.join(os.tmpdir(), `create-agent-room-clone-${Date.now()}`);
      tempDirs.push(tempCloneDir);
      try {
        console.log(`Cloning external skill pack from: ${cyan(pack)}`);
        const cleanUrl = pack.replace(/^git\+/, '');
        execFileSync('git', ['clone', '--depth', '1', cleanUrl, tempCloneDir], { stdio: 'ignore' });
        results.push(...copySkillsFromDirectory(tempCloneDir, target, vars, opts));
      } catch (err) {
        console.warn(red(`Warning: Failed to clone external skill pack from ${pack}: ${err.message}`));
      }
    } else {
      const localPath = path.resolve(pack);
      if (fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()) {
        results.push(...copySkillsFromDirectory(localPath, target, vars, opts));
      } else {
        console.warn(yellow(`Warning: Unknown skill pack, git URL, or local path skipped: ${pack}`));
      }
    }
  }

  // Cleanup temporary clone directories
  for (const d of tempDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (err) {
      // ignore
    }
  }

  return results;
}

async function resolveName(target, args) {
  if (args.name) return args.name;
  const base = path.basename(target);
  if (args.yes || !process.stdin.isTTY) return base;
  const answer = await ask(`Project name (default: ${base}): `);
  return answer || base;
}

async function resolveTools(args, detected) {
  if (args.tools) {
    return args.tools
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  const defaultTools = detected.tools.length > 0 ? detected.tools : [];
  if (args.yes || !process.stdin.isTTY) {
    return defaultTools;
  }
  const defaultStr = defaultTools.join(',') || 'none';
  const answer = await ask(
    `Which agent tools should get adapters? (comma-separated: claude,cursor,windsurf,cline,codex,git; default: ${defaultStr}): `
  );
  if (!answer.trim()) return defaultTools.length > 0 ? defaultTools : [];
  return answer
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function gitInit(target) {
  try {
    execFileSync('git', ['init'], { cwd: target, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: target, stdio: 'ignore' });
  } catch (err) {
    return { success: false, error: (err.stderr || err.message || '').toString() };
  }

  try {
    execFileSync('git', ['commit', '-m', 'Scaffold project with create-agent-room'], {
      cwd: target,
      stdio: 'pipe',
    });
    return { success: true };
  } catch (err) {
    const output =
      ((err.stderr && err.stderr.toString()) || '') +
      ((err.stdout && err.stdout.toString()) || '') ||
      err.message;
    const guardrailsBlocked = /Guardrails Check Failed|guardrails\.json is broken/.test(output);
    return { success: false, error: output.trim(), guardrailsBlocked };
  }
}

// Takes the *accumulated* results array (not a disk scan of
// target/.agent-room/skills) so this works correctly under --dry-run, where
// the skill source files were never actually written to disk. copyFile
// always produces a correct { path, written } entry for every candidate
// skill file regardless of dryRun, so filtering that array is both dry-run
// safe and accurate on a re-run where skills already existed.
function mirrorSkillsToClaude(target, priorResults, opts) {
  const dryRun = !!(opts && opts.dryRun);
  const results = [];

  const skillRelPaths = priorResults
    .map((r) => r.path && r.path.replace(/\\/g, '/'))
    .filter((p) => p && /^\.agent-room\/skills\/[^/]+\.md$/.test(p));

  for (const relPath of skillRelPaths) {
    const file = path.basename(relPath);
    const skillName = file.replace(/\.md$/, '');
    const dest = path.join(target, '.claude', 'skills', skillName, 'SKILL.md');
    const exists = fs.existsSync(dest);

    if (!dryRun) {
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, fs.readFileSync(path.join(target, relPath), 'utf8'));
    }

    if (!exists && opts && typeof opts.onWrite === 'function') {
      opts.onWrite(dest);
    }
    results.push({ path: path.relative(target, dest), written: true });
  }
  return results;
}

const STOP_HOOK_COMMAND = 'node .agent-room/hooks/close-the-loop-check.js';

function installCloseTheLoopHook(target, srcDirs, vars, opts) {
  const results = [];

  results.push(
    Object.assign(
      { path: path.join('.agent-room', 'hooks', 'close-the-loop-check.js') },
      copyFileInherited(
        srcDirs,
        path.join('adapters', 'claude-hooks', 'close-the-loop-check.js'),
        path.join(target, '.agent-room', 'hooks', 'close-the-loop-check.js'),
        vars,
        opts
      )
    )
  );

  const settingsPath = path.join(target, '.claude', 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, 'utf8');
      settings = parseSafeJSON(content);
    } catch (err) {
      console.warn(yellow(`Warning: Failed to parse existing .claude/settings.json: ${err.message}. Re-initializing settings.`));
      settings = {};
    }
  }

  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    settings = {};
  }

  settings.hooks = settings.hooks || {};
  settings.hooks.Stop = settings.hooks.Stop || [];

  const alreadyWired = settings.hooks.Stop.some(
    (entry) =>
      Array.isArray(entry.hooks) && entry.hooks.some((h) => h.command === STOP_HOOK_COMMAND)
  );

  if (!alreadyWired) {
    settings.hooks.Stop.push({ hooks: [{ type: 'command', command: STOP_HOOK_COMMAND }] });
    const settingsExists = fs.existsSync(settingsPath);
    if (!(opts && opts.dryRun)) {
      ensureDir(path.dirname(settingsPath));
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    }
    if (!settingsExists && opts && typeof opts.onWrite === 'function') {
      opts.onWrite(settingsPath);
    }
    results.push({ path: path.join('.claude', 'settings.json'), written: true });
  } else {
    results.push({
      path: path.join('.claude', 'settings.json'),
      written: false,
      reason: 'already wired',
    });
  }

  return results;
}

// All three summary functions below derive from the *accumulated results
// array* (every file candidate this run considered, whether it ended up
// written or skipped-because-it-already-existed) rather than scanning the
// target directory on disk. This matters for two reasons:
//   1. --dry-run never writes anything, so a disk scan would report an
//      empty room even when tools/profile say otherwise.
//   2. A re-run with pre-existing files still gets an entry per candidate
//      (copyFile returns `written:false, reason:'exists'` rather than
//      omitting the entry), so this is also more accurate than a disk scan
//      would be for "did I already scaffold this" on a second run.
// The --profile exclude mechanism (lib/fsutil.js copyDirInherited) means
// excluded files never get a results entry at all, so minimal-profile rooms
// correctly report a smaller guidance set with no special-casing here.

function hasResultPath(results, relPath) {
  return results.some((r) => r.path && r.path.replace(/\\/g, '/') === relPath);
}

// What's actually mechanically enforced after scaffolding.
function computeEnforcedFeatures(results) {
  const items = [];

  if (hasResultPath(results, '.agent-room/hooks/close-the-loop-check.js')) {
    items.push({
      label: 'Claude Code Stop hook',
      file: '.agent-room/hooks/close-the-loop-check.js',
      detail: "blocks an agent from ending its turn if it changed files without logging a decision or anti-pattern — runs inside the agent's own loop, before there's even a commit"
    });
  }

  if (hasResultPath(results, '.git/hooks/pre-commit')) {
    items.push({
      label: 'Guardrails pre-commit hook',
      file: '.git/hooks/pre-commit',
      detail: 'blocks commits touching protected paths or matching forbidden patterns (e.g. AWS keys, private key headers)'
    });
  }

  if (hasResultPath(results, '.github/workflows/agent-room-validate.yml')) {
    items.push({
      label: 'CI validation workflow',
      file: '.github/workflows/agent-room-validate.yml',
      detail: 'runs validate + lint-sessions on every push/PR'
    });
  }

  return items;
}

// Guidance-tier files: documentation an agent must choose to read, as
// opposed to the mechanically-enforced hooks above. Mirrors the 🟡
// category from CAPABILITIES.md.
function computeGuidanceSummary(results) {
  const lines = [];

  if (hasResultPath(results, 'AGENTS.md')) {
    lines.push('AGENTS.md — generic entry point read by any agent');
  }
  if (hasResultPath(results, '.agent-room/principles.md')) {
    lines.push('.agent-room/principles.md — playbooks for reliable LLM output');
  }
  if (hasResultPath(results, '.agent-room/workflow-classifier.md')) {
    lines.push('.agent-room/workflow-classifier.md — Bug/Enhancement/Feature/Product routing');
  }
  if (hasResultPath(results, '.agent-room/guardrails.md')) {
    lines.push('.agent-room/guardrails.md — prose policy (read this; not machine-checked)');
  }

  const skillCount = results.filter(
    (r) => r.path && /^\.agent-room\/skills\/[^/]+\.md$/.test(r.path.replace(/\\/g, '/'))
  ).length;
  if (skillCount > 0) lines.push(`.agent-room/skills/ — ${skillCount} skill file(s)`);

  const coordCount = results.filter(
    (r) => r.path && /^\.agent-room\/coordination\/[^/]+\.md$/.test(r.path.replace(/\\/g, '/'))
  ).length;
  if (coordCount > 0) lines.push(`.agent-room/coordination/ — ${coordCount} protocol doc(s)`);

  return lines;
}

// Rough token proxy (chars / 4) over the guidance-tier corpus: AGENTS.md
// plus everything under .agent-room/ except the machine hook scripts
// (.agent-room/hooks/) and runtime session logs (.agent-room/sessions/),
// neither of which an agent reads as prose guidance. Uses byte size as a
// stand-in for character count — approximate, not exact. `size` comes from
// copyFile (set whenever it renders content, dry-run or not); for a file
// skipped this run because it already existed, copyFile never read it, so
// this falls back to statting it directly off disk — safe, since a "skip,
// already exists" result guarantees the file is really there.
function estimateGuidanceTokens(target, results) {
  const inCorpus = (relPath) => {
    if (relPath === 'AGENTS.md') return true;
    return relPath.startsWith('.agent-room/') && !relPath.startsWith('.agent-room/hooks/') && !relPath.startsWith('.agent-room/sessions/');
  };

  let totalBytes = 0;
  for (const r of results) {
    if (!r.path) continue;
    const relPath = r.path.replace(/\\/g, '/');
    if (!inCorpus(relPath)) continue;

    if (typeof r.size === 'number') {
      totalBytes += r.size;
    } else {
      try {
        totalBytes += fs.statSync(path.join(target, r.path)).size;
      } catch (err) {
        // ignore
      }
    }
  }

  return Math.round(totalBytes / 4);
}

function reportResults(results) {
  for (const r of results) {
    if (r.written) {
      console.log(`  ${green('created')}  ${cyan(r.path)}`);
    } else if (r.reason === 'already wired') {
      console.log(`  ${yellow('skipped')}  ${r.path} (hook already wired)`);
    } else {
      console.log(`  ${yellow('skipped')}  ${r.path} (already exists, use --force to overwrite)`);
    }
  }
}

async function runInit(target, args) {
  ensureDir(target);

  const detected = detectWorkspace(target);
  const name = await resolveName(target, args);
  const tools = await resolveTools(args, detected);
  const unknown = tools.filter((t) => !VALID_TOOLS.includes(t));
  if (unknown.length) {
    throw new Error(`Unknown tool(s): ${unknown.join(', ')}. Valid: ${VALID_TOOLS.join(', ')}`);
  }

  const dryRun = !!args['dry-run'];
  const profile = resolveProfile(args);

  let isGit = fs.existsSync(path.join(target, '.git'));
  if (args.git && !isGit) {
    if (dryRun) {
      // Simulate for preview purposes only - a dry run must not actually
      // run `git init`.
      isGit = true;
    } else {
      try {
        execFileSync('git', ['init'], { cwd: target, stdio: 'ignore' });
        isGit = true;
      } catch (err) {
        // ignore
      }
    }
  }

  const language = await resolveLanguage(args, detected);
  const packageManager = await resolvePackageManager(args, language, detected);
  const defaultBranch = await resolveBranch(args);
  const skillPacks = await resolveSkillPacks(args);
  const { testCommand, lintCommand } = getDerivedCommands(language, packageManager);

  const srcDirs = resolveTemplateSources(target, args, language, packageManager);

  const vars = Object.assign(
    {
      PROJECT_NAME: name,
      LANGUAGE: language,
      PACKAGE_MANAGER: packageManager,
      'package-manager': packageManager,
      DEFAULT_BRANCH: defaultBranch,
      'default-branch': defaultBranch,
      TEST_COMMAND: testCommand,
      'test-command': testCommand,
      LINT_COMMAND: lintCommand,
      'lint-command': lintCommand,
      CAR_VERSION
    },
    buildAgentsMdSections(profile)
  );

  const createdFiles = [];
  const opts = {
    force: !!args.force,
    dryRun,
    root: target,
    onWrite: (filePath) => {
      createdFiles.push(filePath);
    }
  };

  // `minimal` (the default) skips principles.md/workflow-classifier.md/
  // coordination/ - see buildAgentsMdSections()/resolveProfile() above for
  // the full reasoning. Scoped to just the `.agent-room` copy so it can't
  // accidentally exclude a same-named file under docs/ or a skill pack.
  const minimalProfileExcludes = ['principles.md', 'workflow-classifier.md', /^coordination\//];
  const agentRoomOpts = Object.assign({}, opts, {
    exclude: profile === 'minimal' ? minimalProfileExcludes : []
  });

  console.log(
    dryRun
      ? `${bold(yellow('DRY RUN'))} — previewing what would be scaffolded into ${cyan(target)} (nothing will be written)\n`
      : `Scaffolding agent-room structure into ${cyan(target)}\n`
  );

  const results = [];

  try {
    results.push(
      Object.assign(
        { path: 'AGENTS.md' },
        copyFileInherited(srcDirs, 'AGENTS.md.tmpl', path.join(target, 'AGENTS.md'), vars, opts)
      )
    );
    results.push(...copyDirInherited(srcDirs, '.agent-room', path.join(target, '.agent-room'), vars, agentRoomOpts));
    results.push(...copyDirInherited(srcDirs, 'docs', path.join(target, 'docs'), vars, opts));

    results.push(...installSkillPacks(target, skillPacks, srcDirs, vars, opts));

    const configPath = path.join(target, '.agent-room.json');
    if (!fs.existsSync(configPath) || opts.force) {
      const configData = {
        name,
        tools,
        language,
        packageManager,
        defaultBranch,
        skillPacks,
        profile
      };
      const configExists = fs.existsSync(configPath);
      if (!dryRun) {
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2) + '\n');
      }
      if (!configExists) {
        createdFiles.push(configPath);
      }
      results.push({ path: '.agent-room.json', written: true });
    } else {
      results.push({ path: '.agent-room.json', written: false, reason: 'exists' });
    }

    if (tools.includes('claude')) {
      results.push(
        Object.assign(
          { path: 'CLAUDE.md' },
          copyFileInherited(
            srcDirs,
            path.join('adapters', 'CLAUDE.md.tmpl'),
            path.join(target, 'CLAUDE.md'),
            vars,
            opts
          )
        )
      );
      results.push(...mirrorSkillsToClaude(target, results, opts));
      results.push(...installCloseTheLoopHook(target, srcDirs, vars, opts));
    }

    if (tools.includes('cursor')) {
      results.push(
        Object.assign(
          { path: path.join('.cursor', 'rules', 'agent-room.md') },
          copyFileInherited(
            srcDirs,
            path.join('adapters', 'cursorrules.tmpl'),
            path.join(target, '.cursor', 'rules', 'agent-room.md'),
            vars,
            opts
          )
        )
      );
    }

    if (tools.includes('windsurf')) {
      results.push(
        Object.assign(
          { path: '.windsurfrules' },
          copyFileInherited(
            srcDirs,
            path.join('adapters', 'windsurfrules.tmpl'),
            path.join(target, '.windsurfrules'),
            vars,
            opts
          )
        )
      );
    }

    if (tools.includes('cline')) {
      results.push(
        Object.assign(
          { path: '.clinerules' },
          copyFileInherited(
            srcDirs,
            path.join('adapters', 'clinerules.tmpl'),
            path.join(target, '.clinerules'),
            vars,
            opts
          )
        )
      );
    }

    if (tools.includes('codex')) {
      results.push(
        Object.assign(
          { path: '.codexrules' },
          copyFileInherited(
            srcDirs,
            path.join('adapters', 'codexrules.tmpl'),
            path.join(target, '.codexrules'),
            vars,
            opts
          )
        )
      );
    }

    if (tools.includes('git') && isGit) {
      const hookDest = path.join(target, '.git', 'hooks', 'pre-commit');
      const hookExists = fs.existsSync(hookDest);
      results.push(
        Object.assign(
          { path: '.git/hooks/pre-commit' },
          copyFileInherited(
            srcDirs,
            path.join('adapters', 'git-hooks', 'pre-commit.tmpl'),
            hookDest,
            vars,
            opts
          )
        )
      );
      if (!hookExists && fs.existsSync(hookDest)) {
        createdFiles.push(hookDest);
      }
      try {
        fs.chmodSync(hookDest, '755');
      } catch (err) {
        // Ignore if chmod fails (e.g. on Windows)
      }

      // Install guardrails-check hook
      const guardrailsHookDest = path.join(target, '.agent-room', 'hooks', 'guardrails-check.js');
      const guardrailsHookExists = fs.existsSync(guardrailsHookDest);
      results.push(
        Object.assign(
          { path: '.agent-room/hooks/guardrails-check.js' },
          copyFileInherited(
            srcDirs,
            path.join('adapters', 'git-hooks', 'guardrails-check.js'),
            guardrailsHookDest,
            vars,
            opts
          )
        )
      );
      if (!guardrailsHookExists && fs.existsSync(guardrailsHookDest)) {
        createdFiles.push(guardrailsHookDest);
      }
      try {
        fs.chmodSync(guardrailsHookDest, '755');
      } catch (err) {
        // Ignore if chmod fails (e.g. on Windows)
      }

      // Install GitHub Actions workflow that runs validate + lint-sessions in CI
      const ciWorkflowDest = path.join(target, '.github', 'workflows', 'agent-room-validate.yml');
      const ciWorkflowExists = fs.existsSync(ciWorkflowDest);
      results.push(
        Object.assign(
          { path: '.github/workflows/agent-room-validate.yml' },
          copyFileInherited(
            srcDirs,
            path.join('adapters', 'ci', 'github-actions.yml.tmpl'),
            ciWorkflowDest,
            vars,
            opts
          )
        )
      );
      if (!ciWorkflowExists && fs.existsSync(ciWorkflowDest)) {
        createdFiles.push(ciWorkflowDest);
      }
    } else if (tools.includes('git') && !isGit) {
      console.warn(yellow('\nWarning: Git adapter requested but target is not a git repository. Skipping pre-commit hook.'));
    }

  } catch (err) {
    console.error(red(`\nScaffolding failed: ${err.message}`));
    console.log(yellow('Rolling back created files...'));
    for (const file of createdFiles) {
      if (fs.existsSync(file)) {
        try {
          fs.rmSync(file, { force: true });
        } catch (e) {
          // ignore rollback failures
        }
      }
    }
    throw err;
  }

  reportResults(results);

  if (args.git && !dryRun) {
    const result = gitInit(target);
    if (result.success) {
      console.log(`\n${green('Initialized git repo and created initial commit.')}`);
    } else if (result.guardrailsBlocked) {
      console.log(`\n${red('Initial commit blocked by guardrails — see error above.')}`);
      if (result.error) console.log(result.error);
      console.log(
        yellow(
          'Run GUARDRAILS_BYPASS=1 git commit to override, or adjust .agent-room/guardrails.json.'
        )
      );
    } else {
      console.log(`\n${yellow('Git init/commit skipped (already a repo, nothing to commit, or git unavailable).')}`);
      if (result.error) console.log(yellow(result.error));
    }
  } else if (args.git && dryRun) {
    console.log(`\n${yellow('Dry run: would run "git init" and create an initial commit (skipped).')}`);
  }

  console.log(`\n======================================================`);
  console.log(dryRun ? `${bold(yellow('Dry Run Complete — Nothing Written'))}` : `${bold(green('Scaffolding Complete!'))}`);
  console.log(`------------------------------------------------------`);
  console.log(`${bold('Project Name:')}     ${cyan(name)}`);
  console.log(`${bold('Language:')}         ${cyan(language)} (${packageManager})`);
  console.log(`${bold('Default Branch:')}   ${cyan(defaultBranch)}`);
  console.log(`${bold('Profile:')}          ${cyan(profile)}`);
  if (skillPacks.length > 0) {
    console.log(`${bold('Skill Packs:')}      ${cyan(skillPacks.join(', '))}`);
  }
  if (tools.length > 0 && tools[0] !== 'none') {
    console.log(`${bold('Adapters:')}         ${cyan(tools.join(', '))}`);
  }
  console.log(`======================================================`);

  const enforced = computeEnforcedFeatures(results);
  const guidance = computeGuidanceSummary(results);
  const tokenEstimate = estimateGuidanceTokens(target, results);

  console.log(`\n${bold('What actually enforces something')}`);
  console.log(`------------------------------------------------------`);
  if (enforced.length > 0) {
    console.log(`${green('🟢 Enforced (works automatically):')}`);
    for (const item of enforced) {
      console.log(`  ${green('✓')} ${item.label} ${cyan(`(${item.file})`)}`);
      console.log(`      ${item.detail}`);
    }
  } else {
    console.log(
      yellow('🟢 Nothing is actively enforced yet — pass --tools git and/or --tools claude to turn on the pre-commit/CI/Stop-hook enforcement below.')
    );
  }

  if (guidance.length > 0) {
    console.log(`\n${yellow('🟡 Guidance (requires reading):')}`);
    for (const line of guidance) {
      console.log(`  - ${line}`);
    }
  }

  console.log(
    `\n${bold('Guidance corpus size:')} ~${tokenEstimate.toLocaleString()} tokens (approximate — chars/4 over AGENTS.md + .agent-room/**, excluding hooks/ and sessions/)`
  );

  const nextStep = dryRun
    ? `re-run without ${cyan('--dry-run')} to actually scaffold this`
    : tools.includes('git') && isGit
      ? 'commit your changes — the guardrails pre-commit hook runs automatically'
      : `run ${cyan('npx create-agent-room validate .')} to check the room before you start working`;
  console.log(`\n${bold('Next:')} ${nextStep}.`);

  if (!dryRun) {
    console.log(`\nStart by reading ${bold(cyan(path.join(target, 'AGENTS.md')))}.`);
  }
}

module.exports = {
  runInit,
  mirrorSkillsToClaude,
  VALID_TOOLS,
  parseSafeJSON,
  detectWorkspace,
  computeEnforcedFeatures,
  computeGuidanceSummary,
  estimateGuidanceTokens
};
