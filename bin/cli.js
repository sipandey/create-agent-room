#!/usr/bin/env node
'use strict';

const path = require('path');
const { runInit } = require('../lib/init');
const { runSync } = require('../lib/sync');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes' || a === '-y') {
      args.yes = true;
    } else if (a === '--git') {
      args.git = true;
    } else if (a === '--force') {
      args.force = true;
    } else if (a === '--check' || a === '-c') {
      args.check = true;
    } else if (a === '--tools') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.tools = argv[++i];
      } else {
        throw new Error('Error: --tools option requires a comma-separated list of tools.');
      }
    } else if (a === '--name') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.name = argv[++i];
      } else {
        throw new Error('Error: --name option requires a project name.');
      }
    } else if (a === '--template-source') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args['template-source'] = argv[++i];
      } else {
        throw new Error('Error: --template-source option requires a directory path.');
      }
    } else if (a === '--package-manager') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args['package-manager'] = argv[++i];
      } else {
        throw new Error('Error: --package-manager option requires a package manager name.');
      }
    } else if (a === '--language') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.language = argv[++i];
      } else {
        throw new Error('Error: --language option requires a language name.');
      }
    } else if (a === '--branch') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.branch = argv[++i];
      } else {
        throw new Error('Error: --branch option requires a branch name.');
      }
    } else if (a === '--skill-packs') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args['skill-packs'] = argv[++i];
      } else {
        throw new Error('Error: --skill-packs option requires a comma-separated list of skill packs.');
      }
    } else if (a.startsWith('--tools=')) {
      args.tools = a.slice('--tools='.length);
    } else if (a.startsWith('--name=')) {
      args.name = a.slice('--name='.length);
    } else if (a.startsWith('--template-source=')) {
      args['template-source'] = a.slice('--template-source='.length);
    } else if (a.startsWith('--package-manager=')) {
      args['package-manager'] = a.slice('--package-manager='.length);
    } else if (a.startsWith('--language=')) {
      args.language = a.slice('--language='.length);
    } else if (a.startsWith('--branch=')) {
      args.branch = a.slice('--branch='.length);
    } else if (a.startsWith('--skill-packs=')) {
      args['skill-packs'] = a.slice('--skill-packs='.length);
    } else if (a === '--help' || a === '-h' || a === 'help') {
      args.help = true;
    } else if (a.startsWith('-')) {
      throw new Error(`Error: Unknown option: ${a}`);
    } else {
      args._.push(a);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
create-agent-room - scaffold an LLM-agent-friendly project structure

Usage:
  create-agent-room init [target-dir] [options]
  create-agent-room sync [target-dir] [options]

Options:
  --name <name>             Project name used in templates (default: target dir name)
  --tools <list>            Comma-separated: claude,cursor,windsurf,cline,codex,git,none (default: prompt)
  --template-source <path>  Custom template folder (default: search local/home/package)
  --package-manager <name>  Package manager to use (default: npm)
  --language <name>         Language used in project (default: javascript)
  --branch <name>           Default branch name (default: main)
  --skill-packs <list>      Comma-separated optional skill packs: testing,security,release (default: none)
  --git                     Run "git init" and create an initial commit in target-dir
  --force                   Overwrite existing files instead of skipping them
  --check, -c               Check if mirrored files are out of sync without writing changes
  -y, --yes                 Don't prompt; use defaults for anything unspecified

Examples:
  create-agent-room init my-new-project --tools claude,cursor,git --git
  create-agent-room init . --yes --language python --package-manager pip --skill-packs testing
  create-agent-room sync . --check
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (!command || argv.includes('--help') || argv.includes('-h') || command === 'help') {
    printHelp();
    return;
  }

  const target = path.resolve(args._[0] || '.');

  if (command === 'init') {
    await runInit(target, args);
  } else if (command === 'sync') {
    runSync(target, args);
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
