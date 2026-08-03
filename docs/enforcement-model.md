# Enforcement model

`create-agent-room` is a **governance scaffold**, not an agent framework. It
does not own the agent loop — Claude Code, Cursor, Windsurf, Cline, and Codex
each run their own. What this tool provides is **mechanical enforcement** at
specific boundaries an agent passes through on the way to shipping code.

For what's enforced vs guidance-only, see [CAPABILITIES.md](../CAPABILITIES.md).

## Four layers (in time order)

| # | When | Mechanism | CLI / path | Blocks? |
| --- | --- | --- | --- | --- |
| 1 | End of agent turn | Stop hooks + evidence-lite | `.agent-room/hooks/close-the-loop-check.js` (Claude `Stop`, Cursor `stop`) | Yes — Claude `exit 2`; Cursor `followup_message` |
| 2 | `git commit` | Pre-commit guardrails | `.agent-room/hooks/guardrails-check.js` | Yes — exit 1; `GUARDRAILS_BYPASS` audited |
| 3 | CI push/PR | Schema + session lint | `validate`, `lint-sessions` (scaffolded workflow when `--tools git`) | Yes — exit 1 fails the build |
| 4 | CI push/PR | Compliance regression pack | `create-agent-room eval` (scaffolded workflow when `--tools git`) | Yes — exit 1 if fixtures fail |

Layers 1–4 are the default adoption path when `--tools git` scaffolds CI.
Layer 4 confirms the **tool's own checks** still behave after you upgrade
the CLI — not that your model followed instructions.

## Layer 1: Stop hooks (runtime)

**Trigger:** Agent tries to end a turn while the work tree has relevant changes.

**Checks:**

1. `git status --porcelain` — did tracked files outside the scaffold change
   without touching `.agent-room/decisions.md` or `anti-patterns.md`?
2. **Evidence-lite** — if a log file was touched, does `git diff HEAD` on that
   file contain a valid `<!-- no-log: ... -->` waiver (≥20 chars + keyword) or
   a structured `### YYYY-MM-DD` entry?

**Adapters:**

- **Claude Code** — `.claude/settings.json` → `Stop` hook
- **Cursor** — `.cursor/hooks.json` → `stop` hook (`loop_limit: 5`)

Windsurf, Cline, and Codex get rule files via `sync` but **no runtime stop
hook** in this tool.

**Source of truth:** `templates/adapters/claude-hooks/close-the-loop-check.js`
(copied to `.agent-room/hooks/` at `init`). Evidence logic:
`closing-the-loop-evidence.js`.

## Layer 2: Pre-commit guardrails

**Trigger:** `git commit` with staged changes.

**Checks** (from `.agent-room/guardrails.json`):

- Protected paths (includes the guardrails machinery itself)
- Forbidden patterns (AWS keys, private keys, tokens, etc.)
- Optional `scopeGuidance` (`maxFilesPerChange`, `maxLinesPerChange`)

**Bypass:** `GUARDRAILS_BYPASS=1` — every use appended to
`.agent-room/guardrails-bypass-log.md` and auto-staged.

Genesis commit (first commit in a repo) is exempt so `init --git` can
scaffold without tripping its own rules.

## Layer 3: CI validation

**Trigger:** Push or pull request (when `.github/workflows/agent-room-validate.yml`
is scaffolded, or via the [GitHub Action](github-action.md)).

**Commands:**

- `create-agent-room validate` — required files, skill frontmatter, guardrails schema
- `create-agent-room lint-sessions` — session log structure; rejects placeholder
  `Decisions made` when status is `Completed`
- `create-agent-room eval` — packaged compliance regression fixtures (Layer 4;
  see below)

Install pattern: `npm install -g create-agent-room@<version>` then invoke
directly — not `npx` (see `.agent-room/anti-patterns.md`).

## Layer 4: Compliance evals

**Trigger:** Push or pull request (same scaffolded workflow as Layer 3), or
manual `create-agent-room eval` locally.

**What it tests:** Packaged fixtures under `evals/builtin/` — close-the-loop
inputs, lint-sessions fixture dirs, validate fixture rooms. Pure functions, no
LLM, no API keys.

**What it does not test:** Whether an agent read `AGENTS.md`, chose the right
fix, or wrote good prose in session logs. That is a different class of problem
(see [ROADMAP.md](../ROADMAP.md) — golden-task evals are explicitly out of scope).

```bash
create-agent-room eval
create-agent-room eval --format json --output compliance-report.json
create-agent-room eval --suite close-the-loop
```

## Guidance (not enforced)

These ship with `--profile full` or via skills but are **not mechanically checked**:

- `.agent-room/principles.md` — how to work with an LLM
- `.agent-room/workflow-classifier.md` — Bug / Enhancement / Feature / Product
- `.agent-room/coordination/` — handoffs, scope, session format

Stop hooks enforce *that you logged*; they do not judge *whether the log is good*.

## Keeping adapters in sync

`.agent-room/skills/` is the source of truth. After editing skills:

```bash
create-agent-room sync .
create-agent-room sync . --check   # CI: fail if mirrors drifted
```

`doctor` reports hook template drift and unwired tools without writing files.

## Related docs

- [README.md](../README.md) — install, commands, feature categories
- [CAPABILITIES.md](../CAPABILITIES.md) — enforced vs guidance vs aspirational
- [docs/comparisons.md](comparisons.md) — alternatives and trade-offs
- [docs/github-action.md](github-action.md) — CI without running `init`
