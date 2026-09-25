'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { bold, cyan, green, yellow, red, gray } = require('./color');
const { runSync } = require('./sync');

const TEMPLATES_SKILL_PACKS_DIR = path.join(__dirname, '..', 'templates', 'skill-packs');

const BUILTIN_SKILL_PACKS = {
  testing: {
    name: 'testing',
    description: 'Integration and cross-boundary test patterns',
    files: ['integration-testing.md']
  },
  security: {
    name: 'security',
    description: 'Defensive engineering and security principles',
    files: ['security-principles.md']
  },
  release: {
    name: 'release',
    description: 'Semantic versioning and release management',
    files: ['release-management.md']
  },
  'code-review': {
    name: 'code-review',
    description: 'Review standards and PR quality gates',
    files: ['code-review.md']
  },
  'api-design': {
    name: 'api-design',
    description: 'Robust REST/RPC API design practices',
    files: ['api-design.md']
  },
  database: {
    name: 'database',
    description: 'Schema migrations and query performance',
    files: ['database-migrations.md']
  },
  performance: {
    name: 'performance',
    description: 'Profiling, benchmarking, and optimization',
    files: ['performance-optimization.md']
  },
  observability: {
    name: 'observability',
    description: 'Logging, metrics, and tracing instrumentation',
    files: ['observability.md']
  },
  documentation: {
    name: 'documentation',
    description: 'Technical documentation and architecture notes',
    files: ['documentation.md']
  }
};

const CORE_SKILL_FILES = [
  'brainstorming.md',
  'closing-the-loop.md',
  'commit-changes.md',
  'implement-plan.md',
  'iterate-plan.md',
  'research-codebase.md',
  'systematic-debugging.md',
  'test-driven-development.md',
  'verification-before-completion.md',
  'writing-plans.md'
];

function isGitUrl(str) {
  if (!str || typeof str !== 'string') return false;
  return (
    str.startsWith('git+') ||
    str.startsWith('git://') ||
    str.includes('github.com/') ||
    str.includes('gitlab.com/') ||
    str.endsWith('.git')
  );
}

function readConfig(target) {
  const configPath = path.join(target, '.agent-room.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      return {};
    }
  }
  return {};
}

function writeConfig(target, config) {
  const configPath = path.join(target, '.agent-room.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function normalizePacks(packsInput) {
  if (!packsInput) return [];
  if (Array.isArray(packsInput)) {
    return packsInput
      .flatMap((p) => (typeof p === 'string' ? p.split(',') : p))
      .map((p) => (typeof p === 'string' ? p.trim() : p))
      .filter(Boolean);
  }
  if (typeof packsInput === 'string') {
    return packsInput
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return [];
}

function listSkillPacks(target, _options = {}) {
  const skillsDir = path.join(target, '.agent-room', 'skills');
  const config = readConfig(target);
  const configuredPacks = Array.isArray(config.skillPacks) ? config.skillPacks : [];

  const existingFiles = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md'))
    : [];

  const installed = [];
  const available = [];
  const trackedPackNames = new Set(configuredPacks);

  // 1. Evaluate built-in skill packs
  for (const [packName, meta] of Object.entries(BUILTIN_SKILL_PACKS)) {
    const isConfigured = trackedPackNames.has(packName);
    const hasFiles = meta.files.some((f) => existingFiles.includes(f));

    if (isConfigured || hasFiles) {
      installed.push({
        name: packName,
        type: 'builtin',
        description: meta.description,
        files: meta.files.filter((f) => existingFiles.includes(f)),
        status: 'installed'
      });
      trackedPackNames.delete(packName);
    } else {
      available.push({
        name: packName,
        type: 'builtin',
        description: meta.description,
        files: meta.files,
        status: 'available'
      });
    }
  }

  // 2. Track remaining configured external/git packs
  for (const pack of trackedPackNames) {
    installed.push({
      name: pack,
      type: isGitUrl(pack) ? 'git' : 'custom',
      description: isGitUrl(pack) ? 'External Git skill pack' : 'Custom skill pack',
      files: [],
      status: 'installed'
    });
  }

  // 3. Discover uncatalogued custom skills in .agent-room/skills/
  const builtinFiles = new Set(Object.values(BUILTIN_SKILL_PACKS).flatMap((p) => p.files));
  const custom = [];
  for (const file of existingFiles) {
    if (!CORE_SKILL_FILES.includes(file) && !builtinFiles.has(file)) {
      custom.push({
        file,
        name: file.replace(/\.md$/, ''),
        path: path.join('.agent-room', 'skills', file)
      });
    }
  }

  return {
    installed,
    available,
    custom,
    totalInstalled: installed.length,
    totalAvailable: available.length
  };
}

function addSkillPacks(target, rawPacks, options = {}) {
  const skillsDir = path.join(target, '.agent-room', 'skills');
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`No .agent-room/skills/ directory found in ${target}. Run "create-agent-room init" first.`);
  }

  const packs = normalizePacks(rawPacks);
  if (packs.length === 0) {
    throw new Error('No skill packs specified to add. Specify at least one pack name, Git URL, or path.');
  }

  const dryRun = Boolean(options.dryRun || options['dry-run']);
  const force = Boolean(options.force);
  const skipSync = Boolean(options.noSync || options['no-sync']);

  const config = readConfig(target);
  const currentPacks = Array.isArray(config.skillPacks) ? config.skillPacks.slice() : [];

  const addedFiles = [];
  const addedPacks = [];
  const tempDirs = [];

  for (const pack of packs) {
    if (BUILTIN_SKILL_PACKS[pack]) {
      const packSrcDir = path.join(TEMPLATES_SKILL_PACKS_DIR, pack);

      if (!fs.existsSync(packSrcDir)) {
        throw new Error(`Built-in skill pack template not found: ${packSrcDir}`);
      }

      const files = fs.readdirSync(packSrcDir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const dest = path.join(skillsDir, file);
        if (fs.existsSync(dest) && !force) {
          // Already exists
          continue;
        }
        if (!dryRun) {
          fs.copyFileSync(path.join(packSrcDir, file), dest);
        }
        addedFiles.push(path.join('.agent-room', 'skills', file));
      }

      if (!currentPacks.includes(pack)) {
        currentPacks.push(pack);
      }
      addedPacks.push(pack);
    } else if (isGitUrl(pack)) {
      const tempDir = path.join(os.tmpdir(), `car-skill-pack-clone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
      tempDirs.push(tempDir);
      try {
        const cleanUrl = pack.replace(/^git\+/, '');
        execFileSync('git', ['clone', '--depth', '1', cleanUrl, tempDir], {
          stdio: ['ignore', 'pipe', 'ignore']
        });

        const scanDir = fs.existsSync(path.join(tempDir, 'skills')) ? path.join(tempDir, 'skills') : tempDir;
        const files = fs.readdirSync(scanDir).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md');

        for (const file of files) {
          const dest = path.join(skillsDir, file);
          if (fs.existsSync(dest) && !force) continue;
          if (!dryRun) {
            fs.copyFileSync(path.join(scanDir, file), dest);
          }
          addedFiles.push(path.join('.agent-room', 'skills', file));
        }

        if (!currentPacks.includes(pack)) {
          currentPacks.push(pack);
        }
        addedPacks.push(pack);
      } catch (err) {
        throw new Error(`Failed to clone external skill pack from ${pack}: ${err.message}`);
      }
    } else {
      const localPath = path.resolve(pack);
      if (fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()) {
        const scanDir = fs.existsSync(path.join(localPath, 'skills')) ? path.join(localPath, 'skills') : localPath;
        const files = fs.readdirSync(scanDir).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md');

        for (const file of files) {
          const dest = path.join(skillsDir, file);
          if (fs.existsSync(dest) && !force) continue;
          if (!dryRun) {
            fs.copyFileSync(path.join(scanDir, file), dest);
          }
          addedFiles.push(path.join('.agent-room', 'skills', file));
        }

        const packLabel = path.basename(localPath);
        if (!currentPacks.includes(packLabel)) {
          currentPacks.push(packLabel);
        }
        addedPacks.push(packLabel);
      } else {
        throw new Error(`Unknown skill pack, Git URL, or directory path: ${pack}`);
      }
    }
  }

  // Cleanup temp clone dirs
  for (const d of tempDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  }

  if (!dryRun) {
    config.skillPacks = currentPacks;
    writeConfig(target, config);

    if (!skipSync) {
      runSync(target, { all: true, force });
    }
  }

  return {
    success: true,
    dryRun,
    addedPacks,
    addedFiles,
    skillPacks: currentPacks,
    synced: !skipSync && !dryRun
  };
}

function removeSkillPacks(target, rawPacks, options = {}) {
  const skillsDir = path.join(target, '.agent-room', 'skills');
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`No .agent-room/skills/ directory found in ${target}. Run "create-agent-room init" first.`);
  }

  const packs = normalizePacks(rawPacks);
  if (packs.length === 0) {
    throw new Error('No skill packs specified to remove.');
  }

  const dryRun = Boolean(options.dryRun || options['dry-run']);
  const skipSync = Boolean(options.noSync || options['no-sync']);

  const config = readConfig(target);
  let currentPacks = Array.isArray(config.skillPacks) ? config.skillPacks.slice() : [];

  const removedFiles = [];
  const removedPacks = [];

  for (const pack of packs) {
    let filesToDelete = [];
    if (BUILTIN_SKILL_PACKS[pack]) {
      filesToDelete = BUILTIN_SKILL_PACKS[pack].files;
    } else {
      // Check if pack corresponds to a direct skill file or custom pack
      const directFile = pack.endsWith('.md') ? pack : `${pack}.md`;
      if (fs.existsSync(path.join(skillsDir, directFile))) {
        filesToDelete.push(directFile);
      }
    }

    for (const file of filesToDelete) {
      const filePath = path.join(skillsDir, file);
      if (fs.existsSync(filePath)) {
        if (!dryRun) {
          fs.unlinkSync(filePath);
        }
        removedFiles.push(path.join('.agent-room', 'skills', file));
      }
    }

    currentPacks = currentPacks.filter((p) => p !== pack && p !== path.basename(pack));
    removedPacks.push(pack);
  }

  if (!dryRun) {
    config.skillPacks = currentPacks;
    writeConfig(target, config);

    if (!skipSync) {
      runSync(target, { all: true, force: true });
    }
  }

  return {
    success: true,
    dryRun,
    removedPacks,
    removedFiles,
    skillPacks: currentPacks,
    synced: !skipSync && !dryRun
  };
}

function runSkillCli(target, subcommand, args = {}) {
  const sub = (subcommand || 'list').toLowerCase();
  const isJson = Boolean(args.json || (args.format && args.format.toLowerCase() === 'json'));

  if (sub === 'list' || sub === 'ls' || sub === 'status') {
    const listResult = listSkillPacks(target, args);
    if (isJson) {
      console.log(JSON.stringify(listResult, null, 2));
      return 0;
    }

    console.log(bold(`\nSkill Packs for ${cyan(target)}\n`));

    console.log(bold(green('Installed Skill Packs:')));
    if (listResult.installed.length === 0) {
      console.log(gray('  None installed. (Run "create-agent-room skill add <pack>" to install)'));
    } else {
      for (const pack of listResult.installed) {
        const filesStr = pack.files.length > 0 ? gray(` (${pack.files.join(', ')})`) : '';
        console.log(`  ✓ ${bold(pack.name)} - ${pack.description}${filesStr}`);
      }
    }

    console.log(bold(cyan('\nAvailable Built-in Skill Packs:')));
    if (listResult.available.length === 0) {
      console.log(gray('  All built-in skill packs are already installed.'));
    } else {
      for (const pack of listResult.available) {
        console.log(`  + ${bold(pack.name)} - ${pack.description}`);
      }
    }

    if (listResult.custom.length > 0) {
      console.log(bold(yellow('\nCustom Workspace Skills:')));
      for (const s of listResult.custom) {
        console.log(`  • ${bold(s.name)} (${s.path})`);
      }
    }

    console.log('');
    return 0;
  }

  if (sub === 'add' || sub === 'install') {
    const packs = args.packs || [];
    if (packs.length === 0) {
      console.error(red('Error: Please specify one or more skill packs to add (e.g. "create-agent-room skill add database,observability").'));
      return 1;
    }

    const result = addSkillPacks(target, packs, args);
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (result.dryRun) {
      console.log(yellow(`\n[Dry Run] Would add skill packs: ${result.addedPacks.join(', ')}`));
      for (const f of result.addedFiles) {
        console.log(`  would create  ${f}`);
      }
      return 0;
    }

    console.log(bold(green(`\n✅ Added skill packs: ${result.addedPacks.join(', ')}`)));
    for (const f of result.addedFiles) {
      console.log(`  created  ${f}`);
    }
    if (result.synced) {
      console.log(green('  synced all tool adapters (Claude, Cursor, Windsurf, Cline, Codex, Copilot).'));
    }
    console.log('');
    return 0;
  }

  if (sub === 'remove' || sub === 'rm' || sub === 'uninstall') {
    const packs = args.packs || [];
    if (packs.length === 0) {
      console.error(red('Error: Please specify one or more skill packs to remove (e.g. "create-agent-room skill remove database").'));
      return 1;
    }

    const result = removeSkillPacks(target, packs, args);
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (result.dryRun) {
      console.log(yellow(`\n[Dry Run] Would remove skill packs: ${result.removedPacks.join(', ')}`));
      for (const f of result.removedFiles) {
        console.log(`  would delete  ${f}`);
      }
      return 0;
    }

    console.log(bold(green(`\n✅ Removed skill packs: ${result.removedPacks.join(', ')}`)));
    for (const f of result.removedFiles) {
      console.log(`  removed  ${f}`);
    }
    if (result.synced) {
      console.log(green('  synced all tool adapters (Claude, Cursor, Windsurf, Cline, Codex, Copilot).'));
    }
    console.log('');
    return 0;
  }

  console.error(red(`Unknown skill action: ${sub}. Use "create-agent-room skill [list|add|remove]".`));
  return 1;
}

module.exports = {
  BUILTIN_SKILL_PACKS,
  CORE_SKILL_FILES,
  isGitUrl,
  listSkillPacks,
  addSkillPacks,
  removeSkillPacks,
  runSkillCli
};
