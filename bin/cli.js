#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { runInit } = require('../lib/init');
const { runSync } = require('../lib/sync');
const { runMetrics } = require('../lib/metrics');
const { runValidate } = require('../lib/validate');
const { runPrDesc } = require('../lib/pr');
const { runLintSessions } = require('../lib/lint-sessions');
const { runDoctor } = require('../lib/doctor');
const { runEvalCli } = require('../lib/eval');
const { runVerify } = require('../lib/verify');
const { runSessionCli } = require('../lib/session');
const { runSkillCli } = require('../lib/skill');
const { runCiCli } = require('../lib/ci');

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
    } else if (a === '--dry-run') {
      args['dry-run'] = true;
    } else if (a === '--check' || a === '-c') {
      args.check = true;
    } else if (a === '--verbose') {
      args.verbose = true;
    } else if (a === '--write' || a === '-w') {
      args.write = true;
    } else if (a === '--no-sync') {
      args['no-sync'] = true;
      args.noSync = true;
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
    } else if (a === '--org') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.org = argv[++i];
      } else {
        throw new Error('Error: --org option requires an organization name.');
      }
    } else if (a === '--profile' || a === '--preset') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        const val = argv[++i];
        args.profile = val;
        args.preset = val;
      } else {
        throw new Error(`Error: ${a} option requires "minimal", "standard", or "strict".`);
      }
    } else if (a === '--test-command') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args['test-command'] = argv[++i];
      } else {
        throw new Error('Error: --test-command option requires a command string.');
      }
    } else if (a === '--no-test-command' || a === '--skip-test-verification') {
      args['no-test-command'] = true;
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
    } else if (a.startsWith('--test-command=')) {
      args['test-command'] = a.slice('--test-command='.length);
    } else if (a.startsWith('--org=')) {
      args.org = a.slice('--org='.length);
    } else if (a === '--format') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.format = argv[++i];
      } else {
        throw new Error('Error: --format option requires text, json, csv, or markdown.');
      }
    } else if (a === '--output') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.output = argv[++i];
      } else {
        throw new Error('Error: --output option requires a file path.');
      }
    } else if (a === '--suite') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.suite = argv[++i];
      } else {
        throw new Error('Error: --suite option requires a suite name.');
      }
    } else if (a.startsWith('--format=')) {
      args.format = a.slice('--format='.length);
    } else if (a.startsWith('--output=')) {
      args.output = a.slice('--output='.length);
    } else if (a.startsWith('--suite=')) {
      args.suite = a.slice('--suite='.length);
    } else if (a.startsWith('--profile=')) {
      args.profile = a.slice('--profile='.length);
      args.preset = args.profile;
    } else if (a.startsWith('--preset=')) {
      args.preset = a.slice('--preset='.length);
      args.profile = args.preset;
    } else if (a === '--strict') {
      args.strict = true;
    } else if (a === '--verify' || a === '--with-verification') {
      args.verify = true;
    } else if (a === '--all') {
      args.all = true;
    } else if (a === '--fix') {
      args.fix = true;
    } else if (a === '--timeout') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.timeout = parseInt(argv[++i], 10);
      } else {
        throw new Error('Error: --timeout option requires a millisecond duration.');
      }
    } else if (a.startsWith('--timeout=')) {
      args.timeout = parseInt(a.slice('--timeout='.length), 10);
    } else if (a === '--help' || a === '-h' || a === 'help') {
      args.help = true;
    } else if (a === '--version' || a === '-v') {
      args.version = true;
    } else if (a === '--evals-dir' || a === '--custom-evals') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args['evals-dir'] = argv[++i];
      } else {
        throw new Error(`Error: ${a} option requires a directory path.`);
      }
    } else if (a.startsWith('--evals-dir=')) {
      args['evals-dir'] = a.slice('--evals-dir='.length);
    } else if (a.startsWith('--custom-evals=')) {
      args['evals-dir'] = a.slice('--custom-evals='.length);
    } else if (a === '--custom-only') {
      args['custom-only'] = true;
    } else if (a === '--builtin-only') {
      args['builtin-only'] = true;
    } else if (a === '--goal') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.goal = argv[++i];
      } else {
        throw new Error('Error: --goal option requires a sentence string.');
      }
    } else if (a.startsWith('--goal=')) {
      args.goal = a.slice('--goal='.length);
    } else if (a === '--classification') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.classification = argv[++i];
      } else {
        throw new Error('Error: --classification option requires Bug, Enhancement, Feature, or Product.');
      }
    } else if (a.startsWith('--classification=')) {
      args.classification = a.slice('--classification='.length);
    } else if (a === '--status') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.status = argv[++i];
      } else {
        throw new Error('Error: --status option requires Completed, Handed Off, In Progress, or Blocked.');
      }
    } else if (a.startsWith('--status=')) {
      args.status = a.slice('--status='.length);
    } else if (a === '--agent') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.agent = argv[++i];
      } else {
        throw new Error('Error: --agent option requires an agent name.');
      }
    } else if (a.startsWith('--agent=')) {
      args.agent = a.slice('--agent='.length);
    } else if (a === '--handoff') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.handoff = argv[++i];
      } else {
        throw new Error('Error: --handoff option requires a handoff note.');
      }
    } else if (a.startsWith('--handoff=')) {
      args.handoff = a.slice('--handoff='.length);
    } else if (a === '--new') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.new = argv[++i];
      } else {
        throw new Error('Error: --new option requires a session name.');
      }
    } else if (a.startsWith('--new=')) {
      args.new = a.slice('--new='.length);
    } else if (a === '--record') {
      args.record = true;
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '--skip-verify') {
      args['skip-verify'] = true;
      args.skipVerify = true;
    } else if (a === '--skip-doctor') {
      args['skip-doctor'] = true;
      args.skipDoctor = true;
    } else if (a === '--skip-eval') {
      args['skip-eval'] = true;
      args.skipEval = true;
    } else if (a === '--skip-sessions' || a === '--skip-lint-sessions') {
      args['skip-sessions'] = true;
      args.skipSessions = true;
    } else if (a === '--skip-validate') {
      args['skip-validate'] = true;
      args.skipValidate = true;
    } else if (a === '--skip-pr' || a === '--skip-pr-audit') {
      args['skip-pr'] = true;
      args.skipPr = true;
    } else if (a === '--skip-pr-sessions') {
      args['skip-pr-sessions'] = true;
      args.skipPrSessions = true;
    } else if (a === '--only-verify') {
      args['only-verify'] = true;
      args.onlyVerify = true;
    } else if (a === '--only-doctor') {
      args['only-doctor'] = true;
      args.onlyDoctor = true;
    } else if (a === '--only-eval') {
      args['only-eval'] = true;
      args.onlyEval = true;
    } else if (a === '--only-sessions' || a === '--only-lint-sessions') {
      args['only-sessions'] = true;
      args.onlySessions = true;
    } else if (a === '--only-validate') {
      args['only-validate'] = true;
      args.onlyValidate = true;
    } else if (a === '--only-pr' || a === '--only-pr-audit') {
      args['only-pr'] = true;
      args.onlyPr = true;
    } else if (a === '--base' || a === '--base-ref') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.base = argv[++i];
      } else {
        throw new Error('Error: --base option requires a target git ref (e.g. main, origin/main).');
      }
    } else if (a.startsWith('--base=')) {
      args.base = a.slice('--base='.length);
    } else if (a.startsWith('--base-ref=')) {
      args.base = a.slice('--base-ref='.length);
    } else if (a === '--only') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.only = argv[++i];
      } else {
        throw new Error('Error: --only option requires check name(s).');
      }
    } else if (a.startsWith('--only=')) {
      args.only = a.slice('--only='.length);
    } else if (a === '--summary') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        args.summary = argv[++i];
      } else {
        args.summary = true;
      }
    } else if (a.startsWith('--summary=')) {
      args.summary = a.slice('--summary='.length);
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
  create-agent-room metrics [target-dir]
  create-agent-room validate [target-dir]
  create-agent-room lint-sessions [target-dir]
  create-agent-room pr-desc [target-dir] [options]
  create-agent-room doctor [target-dir] [--fix]
  create-agent-room eval [target-dir] [options]
  create-agent-room verify [target-dir] [options]
  create-agent-room session [target-dir] [name] [options]
  create-agent-room skill [list|add|remove] [packs...] [options]
  create-agent-room ci [target-dir] [options]

Options:
  --fix                     Automatically repair drifted hooks, missing stop hooks, and CI pins
  --base <ref>              PR target base ref (e.g. main, origin/main) for anti-tamper and bypass audit
  --skip-verify             Skip code verification test runner in CI
  --skip-doctor             Skip hook and template drift checks in CI
  --skip-eval               Skip compliance eval suites in CI
  --skip-sessions           Skip session log linting in CI
  --skip-validate           Skip room structure and guardrails schema checks in CI
  --skip-pr                 Skip PR anti-tamper and bypass audit checks in CI
  --skip-pr-sessions        Skip requiring a session log for code modifications in PR audit
  --only <checks>           Run only specified checks (comma-separated: validate,doctor,sessions,verify,eval,pr)
  --summary [file]          Write Markdown report to $GITHUB_STEP_SUMMARY or custom file
  --name <name>             Project name used in templates (default: target dir name)
  --new <name>              Session name/topic for session scaffolding
  --record                  Auto-record git changes, verification tests, decisions, and actions
  --goal <sentence>         Goal of the session log (one sentence)
  --classification <type>   Bug, Enhancement, Feature, or Product (default: inferred or Enhancement)
  --status <status>         Completed, Handed Off, In Progress, or Blocked (default: Completed)
  --agent <name>            Agent name (default: git author or AI Agent)
  --handoff <note>          Handoff note for subsequent agent sessions
  --json                    Output session or skill report in JSON format
  --no-sync                 Skip auto-syncing skill files and tool rules after add/remove
  --tools <list>            Comma-separated: claude,cursor,windsurf,cline,codex,copilot,git,all,none (default: prompt)
  --all                     Sync skills/rules across all supported tools (claude, cursor, windsurf, cline, codex, copilot)
  --template-source <path>  Custom template folder (default: search local/home/package)
  --package-manager <name>  Package manager to use (default: npm)
  --language <name>         Language used in project (default: javascript)
  --branch <name>           Default branch name (default: main)
  --skill-packs <list>      Comma-separated optional skill packs: testing,security,release (default: none)
  --org <name>              Organization layer name for template inheritance (default: none)
  --preset <name>           minimal|standard|strict - governance strictness preset (default: minimal)
  --profile <name>          Alias for --preset (minimal|standard|strict|full)
  --test-command <cmd>      Test command to verify changes before completing turns (e.g. "npm test")
  --no-test-command         Skip pre-stop test verification even if a test suite is detected
  --git                     Run "git init" and create an initial commit in target-dir
  --force                   Overwrite existing files instead of skipping them
  --dry-run                 Print what init would create/skip; write nothing to disk
  --check, -c               Check if mirrored files are out of sync without writing changes
  --format <text|json|csv|markdown> Output format (eval, verify, metrics)
  --output <file>           Write report or PR description to a file (eval, verify, metrics, pr-desc)
  --verify, --with-verification Execute verification test suite and embed attestation in PR description
  --evals-dir <path>        Custom eval suites directory (default: .agent-room/evals, evals/custom)
  --custom-only             Execute only custom adopter eval suites
  --builtin-only            Execute only built-in compliance eval suites
  --suite <name>            eval suite filter: close-the-loop, lint-sessions, validate, all
  --verbose                 Print detailed stack traces on failure
  --write, -w               Save generated PR description to .agent-room/pr-description.md
  --yes, -y                 Don't prompt; use defaults for anything unspecified
  --version, -v             Print the installed create-agent-room version and exit

--preset minimal (default) scaffolds AGENTS.md, guardrails, skills, and
the Stop/pre-commit hooks (if applicable), skipping principles.md,
workflow-classifier.md, coordination/, and skill packs unless requested
via --skill-packs. --preset standard adds the full guidance corpus and
enables pre-stop test verification. --preset strict adds pre-commit test
execution, import boundary enforcement, and strict waiver audits.

Examples:
  create-agent-room init my-new-project --tools claude,cursor,git --git
  create-agent-room init . --yes --language python --package-manager pip --skill-packs testing
  create-agent-room init . --yes --preset standard --tools claude,git --git
  create-agent-room init . --yes --preset strict --tools claude,cursor,git
  create-agent-room init . --dry-run --tools claude,git
  create-agent-room sync .
  create-agent-room sync . --all
  create-agent-room sync . --tools cursor,copilot
  create-agent-room sync . --check
  create-agent-room metrics .
  create-agent-room metrics . --format json
  create-agent-room validate .
  create-agent-room lint-sessions .
  create-agent-room verify .
  create-agent-room pr-desc . --write
  create-agent-room pr-desc . --verify --write
  create-agent-room pr-desc . --verify --output pr.md
  create-agent-room doctor .
  create-agent-room doctor . --fix
  create-agent-room eval
  create-agent-room eval . --custom-only
  create-agent-room eval . --evals-dir ./custom-evals
  create-agent-room eval --format json --output compliance-report.json
  create-agent-room session my-feature --record
  create-agent-room session --goal "Fix login timeout" --classification Bug --record
  create-agent-room session . my-feature --dry-run
  create-agent-room skill list
  create-agent-room skill add database,observability
  create-agent-room skill remove database
  create-agent-room ci
  create-agent-room ci --format json
  create-agent-room ci --format markdown --summary
  create-agent-room ci --strict --skip-verify
  create-agent-room --version

Sync mirrors .agent-room/skills/ into .claude/skills/ (claude) and
regenerates rule files for cursor, windsurf, cline, codex, and copilot
when those tools are detected in workspace, configured in .agent-room.json,
or explicitly specified with --tools or --all.
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (argv.includes('--version') || argv.includes('-v') || command === 'version') {
    console.log(require('../package.json').version);
    return;
  }

  if (!command || argv.includes('--help') || argv.includes('-h') || command === 'help') {
    printHelp();
    return;
  }

  const target = path.resolve(args._[0] || '.');

  if (command === 'init') {
    await runInit(target, args);
  } else if (command === 'sync') {
    runSync(target, args);
  } else if (command === 'metrics') {
    runMetrics(target, args);
  } else if (command === 'validate') {
    runValidate(target, args);
  } else if (command === 'lint-sessions') {
    runLintSessions(target);
  } else if (command === 'pr-desc') {
    runPrDesc(target, args);
  } else if (command === 'doctor') {
    runDoctor(target, args);
  } else if (command === 'eval') {
    runEvalCli(target, args);
  } else if (command === 'verify') {
    runVerify(target, args);
  } else if (command === 'session') {
    let sessionTarget = target;
    let sessionName = args.name || args.new;
    const firstArg = args._[0];
    if (firstArg) {
      if (firstArg === '.' || (fs.existsSync(firstArg) && fs.statSync(firstArg).isDirectory())) {
        sessionTarget = path.resolve(firstArg);
        sessionName = sessionName || args._[1];
      } else {
        sessionTarget = process.cwd();
        sessionName = sessionName || firstArg;
      }
    } else {
      sessionTarget = process.cwd();
    }
    args.name = sessionName;
    runSessionCli(sessionTarget, args);
  } else if (command === 'skill') {
    const sub = args._[0] || 'list';
    let skillTarget = process.cwd();
    let packs = [];
    const restArgs = args._.slice(1);
    if (restArgs.length > 0) {
      const last = restArgs[restArgs.length - 1];
      if (
        last === '.' ||
        (fs.existsSync(last) &&
          fs.statSync(last).isDirectory() &&
          (last.startsWith('.') || last.startsWith('/') || last.includes(path.sep)))
      ) {
        skillTarget = path.resolve(last);
        packs = restArgs.slice(0, -1);
      } else {
        packs = restArgs;
      }
    }
    args.packs = packs;
    const exitCode = runSkillCli(skillTarget, sub, args);
    if (exitCode) {
      process.exitCode = exitCode;
    }
  } else if (command === 'ci') {
    const exitCode = runCiCli(target, args);
    if (exitCode) {
      process.exitCode = exitCode;
    }
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
  }
}

if (require.main === module) {
  const { red } = require('../lib/color');
  main().catch((err) => {
    const isVerbose = process.argv.includes('--verbose');
    if (isVerbose && err && err.stack) {
      console.error(red(err.stack));
    } else {
      console.error(red(err && err.message ? err.message : String(err)));
    }
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
