'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ask } = require('./prompt');
const { copyDir, copyFile, ensureDir, resolveTemplateSource } = require('./fsutil');
const { green, yellow, red, cyan, bold } = require('./color');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
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
  const answer = await ask('Optional skill packs to include? (comma-separated: testing,security,release; blank = none): ');
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

function installSkillPacks(target, skillPacks, templatesDir, vars, opts) {
  const results = [];
  const validPacks = ['testing', 'security', 'release'];
  for (const pack of skillPacks) {
    if (!validPacks.includes(pack)) {
      console.warn(yellow(`Warning: Unknown skill pack skipped: ${pack}`));
      continue;
    }
    let srcDir = path.join(templatesDir, 'skill-packs', pack);
    if (!fs.existsSync(srcDir)) {
      srcDir = path.join(__dirname, '..', 'templates', 'skill-packs', pack);
    }
    if (fs.existsSync(srcDir)) {
      const destDir = path.join(target, '.agent-room', 'skills');
      results.push(...copyDir(srcDir, destDir, vars, opts));
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
    execFileSync('git', ['commit', '-m', 'Scaffold project with create-agent-room'], {
      cwd: target,
      stdio: 'ignore',
    });
    return true;
  } catch (err) {
    return false;
  }
}

function mirrorSkillsToClaude(target, opts) {
  const srcDir = path.join(target, '.agent-room', 'skills');
  const results = [];
  if (!fs.existsSync(srcDir)) return results;
  for (const file of fs.readdirSync(srcDir)) {
    if (!file.endsWith('.md')) continue;
    const skillName = file.replace(/\.md$/, '');
    const dest = path.join(target, '.claude', 'skills', skillName, 'SKILL.md');
    const exists = fs.existsSync(dest);
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, fs.readFileSync(path.join(srcDir, file), 'utf8'));
    if (!exists && opts && typeof opts.onWrite === 'function') {
      opts.onWrite(dest);
    }
    results.push({ path: path.relative(target, dest), written: true });
  }
  return results;
}

const STOP_HOOK_COMMAND = 'node .agent-room/hooks/close-the-loop-check.js';

function installCloseTheLoopHook(target, vars, opts) {
  const results = [];

  results.push(
    Object.assign(
      { path: path.join('.agent-room', 'hooks', 'close-the-loop-check.js') },
      copyFile(
        path.join(TEMPLATES_DIR, 'adapters', 'claude-hooks', 'close-the-loop-check.js'),
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
    ensureDir(path.dirname(settingsPath));
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
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

  let isGit = fs.existsSync(path.join(target, '.git'));
  if (args.git && !isGit) {
    try {
      execFileSync('git', ['init'], { cwd: target, stdio: 'ignore' });
      isGit = true;
    } catch (err) {
      // ignore
    }
  }

  const language = await resolveLanguage(args, detected);
  const packageManager = await resolvePackageManager(args, language, detected);
  const defaultBranch = await resolveBranch(args);
  const skillPacks = await resolveSkillPacks(args);
  const { testCommand, lintCommand } = getDerivedCommands(language, packageManager);

  const templatesDir = resolveTemplateSource(args['template-source']);

  const vars = {
    PROJECT_NAME: name,
    LANGUAGE: language,
    PACKAGE_MANAGER: packageManager,
    'package-manager': packageManager,
    DEFAULT_BRANCH: defaultBranch,
    'default-branch': defaultBranch,
    TEST_COMMAND: testCommand,
    'test-command': testCommand,
    LINT_COMMAND: lintCommand,
    'lint-command': lintCommand
  };

  const createdFiles = [];
  const opts = {
    force: !!args.force,
    root: target,
    onWrite: (filePath) => {
      createdFiles.push(filePath);
    }
  };

  console.log(`Scaffolding agent-room structure into ${cyan(target)}\n`);

  const results = [];

  try {
    results.push(
      Object.assign(
        { path: 'AGENTS.md' },
        copyFile(path.join(templatesDir, 'AGENTS.md.tmpl'), path.join(target, 'AGENTS.md'), vars, opts)
      )
    );
    results.push(...copyDir(path.join(templatesDir, '.agent-room'), path.join(target, '.agent-room'), vars, opts));
    results.push(...copyDir(path.join(templatesDir, 'docs'), path.join(target, 'docs'), vars, opts));

    results.push(...installSkillPacks(target, skillPacks, templatesDir, vars, opts));

    const configPath = path.join(target, '.agent-room.json');
    if (!fs.existsSync(configPath) || opts.force) {
      const configData = {
        name,
        tools,
        language,
        packageManager,
        defaultBranch,
        skillPacks
      };
      const configExists = fs.existsSync(configPath);
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2) + '\n');
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
          copyFile(
            path.join(templatesDir, 'adapters', 'CLAUDE.md.tmpl'),
            path.join(target, 'CLAUDE.md'),
            vars,
            opts
          )
        )
      );
      results.push(...mirrorSkillsToClaude(target, opts));
      results.push(...installCloseTheLoopHook(target, vars, opts));
    }

    if (tools.includes('cursor')) {
      results.push(
        Object.assign(
          { path: path.join('.cursor', 'rules', 'agent-room.md') },
          copyFile(
            path.join(templatesDir, 'adapters', 'cursorrules.tmpl'),
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
          copyFile(
            path.join(templatesDir, 'adapters', 'windsurfrules.tmpl'),
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
          copyFile(
            path.join(templatesDir, 'adapters', 'clinerules.tmpl'),
            path.join(target, '.clinerules'),
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
          copyFile(
            path.join(templatesDir, 'adapters', 'git-hooks', 'pre-commit.tmpl'),
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

  if (args.git) {
    const ok = gitInit(target);
    console.log(
      ok
        ? `\n${green('Initialized git repo and created initial commit.')}`
        : `\n${yellow('Git init/commit skipped (already a repo, nothing to commit, or git unavailable).')}`
    );
  }

  console.log(`\n======================================================`);
  console.log(`${bold(green('Scaffolding Complete!'))}`);
  console.log(`------------------------------------------------------`);
  console.log(`${bold('Project Name:')}     ${cyan(name)}`);
  console.log(`${bold('Language:')}         ${cyan(language)} (${packageManager})`);
  console.log(`${bold('Default Branch:')}   ${cyan(defaultBranch)}`);
  if (skillPacks.length > 0) {
    console.log(`${bold('Skill Packs:')}      ${cyan(skillPacks.join(', '))}`);
  }
  if (tools.length > 0 && tools[0] !== 'none') {
    console.log(`${bold('Adapters:')}         ${cyan(tools.join(', '))}`);
  }
  console.log(`======================================================`);

  console.log(`\nDone. Start by reading ${bold(cyan(path.join(target, 'AGENTS.md')))}.`);
}

module.exports = { runInit, mirrorSkillsToClaude, VALID_TOOLS, parseSafeJSON, detectWorkspace };
