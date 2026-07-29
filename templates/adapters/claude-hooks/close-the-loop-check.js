#!/usr/bin/env node
'use strict';

/*
 * Close-the-loop Stop hook: mechanically enforces
 * .agent-room/skills/closing-the-loop.md.
 *
 * Shared check for Claude Code and Cursor. Adapter only changes how a
 * failure is surfaced:
 *   --adapter=claude (default): exit 2 + stderr (Claude Code Stop)
 *   --adapter=cursor: stdout JSON { followup_message } (Cursor stop hook)
 *
 * Runs at the end of every turn. If tracked, uncommitted changes touch files
 * outside the agent-room scaffold but neither .agent-room/anti-patterns.md
 * nor .agent-room/decisions.md was also touched, it prevents the turn from
 * finishing cleanly (Claude blocks; Cursor forces a follow-up turn).
 *
 * Exit hatch: touch either log file - a real entry, or a one-line waiver
 * comment - and the check passes. See closing-the-loop.md for the format.
 *
 * Limitations (by design, to stay simple):
 * - Only looks at `git status --porcelain` since the last commit, not since
 *   the start of this turn. Pre-existing unrelated dirty changes in the work
 *   tree will also trigger this - commit or stash them first if that's noisy.
 * - Treats any file rename touching scaffold paths as a non-scaffold change
 *   (rare, harmless false positive).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCAFFOLD_PREFIXES = [
  '.agent-room/',
  'docs/plans/',
  '.claude/skills/',
  '.claude/settings.json',
  '.cursor/rules/',
  '.cursor/hooks.json',
  '.cursor/hooks/',
];
const SCAFFOLD_FILES = ['AGENTS.md', 'CLAUDE.md'];

function sh(cmd, cwd) {
  try {
    return execSync(cmd, { cwd: cwd || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch (err) {
    return '';
  }
}

function isScaffoldPath(p) {
  if (SCAFFOLD_FILES.includes(p)) return true;
  // Bidirectional: p itself under a scaffold prefix (normal case), OR p is an
  // ancestor directory of a scaffold prefix (git collapses an untracked dir
  // with no other tracked siblings into a single porcelain line, e.g. a
  // brand-new ".claude/" with nothing else in it yet shows as "?? .claude/").
  return SCAFFOLD_PREFIXES.some((prefix) => p.startsWith(prefix) || prefix.startsWith(p));
}

function isLogPath(p) {
  return p === '.agent-room/anti-patterns.md' || p === '.agent-room/decisions.md';
}

function buildFailureMessage(sourceChanges) {
  const sample = sourceChanges.slice(0, 5).join(', ') + (sourceChanges.length > 5 ? ', ...' : '');
  return (
    'Closing-the-loop check failed: this turn changed ' +
    sourceChanges.length +
    ' file(s) outside the agent-room scaffold (' +
    sample +
    '), but neither ' +
    '.agent-room/anti-patterns.md nor .agent-room/decisions.md was touched.\n\n' +
    'Follow .agent-room/skills/closing-the-loop.md before finishing this turn:\n' +
    '- If this fixed a bug or found a root cause, append an entry to anti-patterns.md.\n' +
    '- If this made a non-obvious design/architecture call, append an entry to decisions.md.\n' +
    '- If genuinely neither applies, add a one-line waiver to decisions.md instead:\n' +
    '  <!-- no-log: routine change, no decision or anti-pattern worth recording -->\n'
  );
}

/**
 * @param {string} cwd
 * @param {{ hasAgentRoom?: boolean, isGitRepo?: boolean, statusPorcelain?: string }} [opts]
 * @returns {{ ok: boolean, sourceChanges: string[], message: string }}
 */
function checkClosingTheLoop(cwd, opts) {
  opts = opts || {};

  const hasAgentRoom =
    typeof opts.hasAgentRoom === 'boolean'
      ? opts.hasAgentRoom
      : fs.existsSync(path.join(cwd, '.agent-room'));
  if (!hasAgentRoom) {
    return { ok: true, sourceChanges: [], message: '' };
  }

  const isGitRepo =
    typeof opts.isGitRepo === 'boolean'
      ? opts.isGitRepo
      : sh('git rev-parse --is-inside-work-tree 2>/dev/null', cwd).trim() === 'true';
  if (!isGitRepo) {
    return { ok: true, sourceChanges: [], message: '' };
  }

  const porcelain =
    typeof opts.statusPorcelain === 'string' ? opts.statusPorcelain : sh('git status --porcelain', cwd);
  const lines = porcelain.split('\n').filter(Boolean);
  const changedPaths = lines.map((line) => line.slice(3).trim());

  const nonScaffold = changedPaths.filter((p) => !isScaffoldPath(p));
  const logTouched = changedPaths.some(isLogPath);

  if (nonScaffold.length === 0 || logTouched) {
    return { ok: true, sourceChanges: [], message: '' };
  }

  return {
    ok: false,
    sourceChanges: nonScaffold,
    message: buildFailureMessage(nonScaffold),
  };
}

function parseAdapter(argv) {
  for (const a of argv) {
    if (a === '--adapter' || a.startsWith('--adapter=')) {
      const value = a.startsWith('--adapter=') ? a.slice('--adapter='.length) : null;
      if (value === null) {
        const idx = argv.indexOf(a);
        return argv[idx + 1] || '';
      }
      return value;
    }
  }
  return 'claude';
}

function readStdinSync() {
  try {
    if (process.stdin.isTTY) return '';
    return fs.readFileSync(0, 'utf8');
  } catch (err) {
    return '';
  }
}

function parseCursorStatus(stdinText) {
  if (!stdinText || !stdinText.trim()) return null;
  try {
    const parsed = JSON.parse(stdinText);
    return parsed && typeof parsed.status === 'string' ? parsed.status : null;
  } catch (err) {
    return null;
  }
}

function applyAdapter(adapter, result) {
  if (adapter === 'claude') {
    if (result.ok) {
      process.exit(0);
    }
    process.stderr.write(result.message);
    process.exit(2);
  }

  if (adapter === 'cursor') {
    if (result.ok) {
      process.stdout.write('{}\n');
      process.exit(0);
    }
    process.stdout.write(JSON.stringify({ followup_message: result.message }) + '\n');
    process.exit(0);
  }

  process.stderr.write(
    'Unknown adapter: ' + adapter + '. Use --adapter=claude or --adapter=cursor.\n'
  );
  process.exit(1);
}

function main() {
  const adapter = parseAdapter(process.argv.slice(2));
  if (adapter !== 'claude' && adapter !== 'cursor') {
    applyAdapter(adapter, { ok: true, sourceChanges: [], message: '' });
    return;
  }

  if (adapter === 'cursor') {
    const status = parseCursorStatus(readStdinSync());
    if (status === 'aborted' || status === 'error') {
      process.stdout.write('{}\n');
      process.exit(0);
    }
  }

  const result = checkClosingTheLoop(process.cwd());
  applyAdapter(adapter, result);
}

if (require.main === module) {
  main();
}

module.exports = {
  checkClosingTheLoop,
  isScaffoldPath,
  parseAdapter,
  SCAFFOLD_PREFIXES,
};
