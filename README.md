# create-agent-room

Scaffold an LLM-agent-friendly project structure into any new or existing
project: a generic `AGENTS.md` entry point, principles + workflow-classifier
reference docs, append-only anti-patterns/decisions logs, and 6 core skills
(`brainstorming`, `writing-plans`, `test-driven-development`,
`systematic-debugging`, `verification-before-completion`,
`closing-the-loop`) — plus optional thin adapters for Claude Code, Cursor,
Windsurf, Cline, and Git. The Claude Code and Git hook adapters install
verification checks that mechanically check the closing-the-loop discipline
instead of just hoping the developer remembers.

## Usage

```bash
# from this repo, without publishing/installing:
node bin/cli.js init ../my-new-project --tools claude,cursor,windsurf,cline,git --git

# interactive (prompts for name + tools):
node bin/cli.js init ../my-new-project

# non-interactive, generic-only (no tool adapters):
node bin/cli.js init . --yes

# after editing .agent-room/skills/*.md by hand, refresh the Claude Code mirror:
node bin/cli.js sync .

# check if mirrors are out of sync (exits with code 1 if out-of-sync):
node bin/cli.js sync . --check
```

Once published to npm, the same commands work as:

```bash
npx create-agent-room init my-new-project --tools claude,cursor,windsurf,cline,git --git
npx create-agent-room sync .
```

## What gets created

```
AGENTS.md                          generic entry point, read by any agent
.agent-room/
  principles.md                    12 principles for reliable LLM output
  workflow-classifier.md           Bug / Enhancement / Feature / Product routing
  guardrails.md                    boundaries and constraints (what not to do)
  guardrails.json                  machine-readable guardrails config
  anti-patterns.md                 append-only negative-knowledge log (starts empty)
  decisions.md                     append-only decisions log (starts empty)
  skills/
    brainstorming.md               design before code, hard-gated
    writing-plans.md               design -> bite-sized TDD task plan
    test-driven-development.md     red-green-refactor, iron law
    systematic-debugging.md        root-cause before fixes, iron law
    verification-before-completion.md   evidence before completion claims, iron law
    closing-the-loop.md            check anti-patterns/decisions before ending a turn
    [optional skill packs]         testing, security, release, code-review, etc.
  coordination/
    handoff-protocol.md            rules for serializing state between sessions
    scope-boundaries.md            rules for partitioning work to avoid conflicts
    session-log-format.md          format for tracking agent activity
  sessions/                        where session logs get saved
docs/plans/                        where design docs and task plans get saved
.agent-room.json                   project config tracking language, tools, default branch, and skill packs
```

With `--tools claude`:
```
CLAUDE.md                          pointer to AGENTS.md + Claude Code mechanics
.claude/skills/<name>/SKILL.md     mirrored from .agent-room/skills/* (run `sync` after editing)
.agent-room/hooks/close-the-loop-check.js   Stop hook script
.claude/settings.json              wires the Stop hook (merged, not overwritten, if it already exists)
```

**The Stop hook** runs at the end of every Claude Code turn. If the turn
changed files outside the agent-room scaffold without touching
`anti-patterns.md` or `decisions.md`, it blocks the turn (exit code 2) and
tells the agent why via stderr. The exit hatch is a one-line waiver:
`<!-- no-log: routine change, no decision or anti-pattern worth recording -->`
appended to `decisions.md`. It only looks at `git status --porcelain`
relative to the last commit, so unrelated pre-existing dirty files will also
trigger it.

With `--tools cursor`:
```
.cursor/rules/agent-room.md        pointer to AGENTS.md + .agent-room/
```

With `--tools windsurf`:
```
.windsurfrules                     pointer to AGENTS.md + .agent-room/
```

With `--tools cline`:
```
.clinerules                        pointer to AGENTS.md + .agent-room/
```

With `--tools git`:
```
.git/hooks/pre-commit              Git pre-commit hook enforcing close-the-loop check
```

**The Git pre-commit hook** runs automatically on any staged local commit. If source files are changed but neither `.agent-room/anti-patterns.md` nor `.agent-room/decisions.md` is modified, it blocks the commit to ensure the loops are closed. You can bypass the block by adding a waiver to `decisions.md` or using `git commit --no-verify`.

`codex` reads `AGENTS.md` natively — no extra adapter file is generated for it.

## Options

| Flag | Effect |
| --- | --- |
| `--name <name>` | Project name substituted into templates (default: target dir name) |
| `--tools <list>` | Comma-separated: `claude,cursor,windsurf,cline,codex,git,none` (default: interactive prompt) |
| `--template-source <path>` | Custom templates folder path (default: searches local, home, package) |
| `--package-manager <name>` | Package manager to use, e.g. npm, poetry, cargo (default: npm) |
| `--language <name>` | Target project language, e.g. typescript, python, rust (default: javascript) |
| `--branch <name>` | Default git branch (default: main) |
| `--skill-packs <list>` | Comma-separated optional skill packs: testing, security, release (default: none) |
| `--git` | `git init` + an initial commit in the target dir |
| `--force` | Overwrite files that already exist (default: skip existing files) |
| `--verbose` | Print detailed stack traces on failure (default: print clean error messages) |
| `-y, --yes` | Skip all prompts, use defaults |

Re-running `init` on an existing target is safe — it skips files that
already exist unless `--force` is passed.

## Design notes

- `.agent-room/skills/*.md` is always the source of truth, even in projects
  with a Claude Code adapter. `.claude/skills/*` is a generated mirror —
  edit the source and run `sync`, don't edit the mirror directly. **To protect
  your work, `sync` checks for uncommitted changes in mirrored files and
  skips them if they have unsaved edits, unless `--force` is passed.**
- The core set is intentionally lean: no stack-specific idiom files or coder
  personas are included by default. Add those per-project as needed.
