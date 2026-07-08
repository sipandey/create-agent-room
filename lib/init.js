'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ask } = require('./prompt');
const { copyDir, copyFile, ensureDir } = require('./fsutil');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const VALID_TOOLS = ['claude', 'cursor', 'codex', 'none'];

async function resolveName(target, args) {
  if (args.name) return args.name;
  const base = path.basename(target);
  if (args.yes || !process.stdin.isTTY) return base;
  const answer = await ask(`Project name (default: ${base}): `);
  return answer || base;
}

async function resolveTools(args) {
  if (args.tools) {
    return args.tools
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (args.yes || !process.stdin.isTTY) {
    return [];
  }
  const answer = await ask(
    'Which agent tools should get adapters? (comma-separated: claude,cursor,codex; blank = generic AGENTS.md only): '
  );
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

function mirrorSkillsToClaude(target, vars, opts) {
  const srcDir = path.join(TEMPLATES_DIR, '.agent-room', 'skills');
  const results = [];
  for (const file of fs.readdirSync(srcDir)) {
    const skillName = file.replace(/\.md$/, '');
    const dest = path.join(target, '.claude', 'skills', skillName, 'SKILL.md');
    const res = copyFile(path.join(srcDir, file), dest, vars, opts);
    results.push(Object.assign({ path: path.relative(target, dest) }, res));
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
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  }
  settings.hooks = settings.hooks || {};
  settings.hooks.Stop = settings.hooks.Stop || [];

  const alreadyWired = settings.hooks.Stop.some(
    (entry) =>
      Array.isArray(entry.hooks) && entry.hooks.some((h) => h.command === STOP_HOOK_COMMAND)
  );

  if (!alreadyWired) {
    settings.hooks.Stop.push({ hooks: [{ type: 'command', command: STOP_HOOK_COMMAND }] });
    ensureDir(path.dirname(settingsPath));
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
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
    if (r.written) console.log(`  created  ${r.path}`);
    else if (r.reason === 'already wired') console.log(`  skipped  ${r.path} (hook already wired)`);
    else console.log(`  skipped  ${r.path} (already exists, use --force to overwrite)`);
  }
}

async function runInit(target, args) {
  ensureDir(target);

  const name = await resolveName(target, args);
  const tools = await resolveTools(args);
  const unknown = tools.filter((t) => !VALID_TOOLS.includes(t));
  if (unknown.length) {
    throw new Error(`Unknown tool(s): ${unknown.join(', ')}. Valid: ${VALID_TOOLS.join(', ')}`);
  }

  const vars = { PROJECT_NAME: name };
  const opts = { force: !!args.force, root: target };

  console.log(`Scaffolding agent-room structure into ${target}\n`);

  const results = [];

  results.push(
    Object.assign(
      { path: 'AGENTS.md' },
      copyFile(path.join(TEMPLATES_DIR, 'AGENTS.md.tmpl'), path.join(target, 'AGENTS.md'), vars, opts)
    )
  );
  results.push(...copyDir(path.join(TEMPLATES_DIR, '.agent-room'), path.join(target, '.agent-room'), vars, opts));
  results.push(...copyDir(path.join(TEMPLATES_DIR, 'docs'), path.join(target, 'docs'), vars, opts));

  if (tools.includes('claude')) {
    results.push(
      Object.assign(
        { path: 'CLAUDE.md' },
        copyFile(
          path.join(TEMPLATES_DIR, 'adapters', 'CLAUDE.md.tmpl'),
          path.join(target, 'CLAUDE.md'),
          vars,
          opts
        )
      )
    );
    results.push(...mirrorSkillsToClaude(target, vars, opts));
    results.push(...installCloseTheLoopHook(target, vars, opts));
  }

  if (tools.includes('cursor')) {
    results.push(
      Object.assign(
        { path: path.join('.cursor', 'rules', 'agent-room.md') },
        copyFile(
          path.join(TEMPLATES_DIR, 'adapters', 'cursorrules.tmpl'),
          path.join(target, '.cursor', 'rules', 'agent-room.md'),
          vars,
          opts
        )
      )
    );
  }

  // codex reads AGENTS.md natively - no extra adapter file needed.

  reportResults(results);

  if (args.git) {
    const ok = gitInit(target);
    console.log(
      ok
        ? '\nInitialized git repo and created initial commit.'
        : '\nGit init/commit skipped (already a repo, nothing to commit, or git unavailable).'
    );
  }

  console.log(`\nDone. Start by reading ${path.join(target, 'AGENTS.md')}.`);
}

module.exports = { runInit, mirrorSkillsToClaude, VALID_TOOLS };
