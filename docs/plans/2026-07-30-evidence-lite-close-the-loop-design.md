# Design: Evidence-lite close-the-loop (Phase B)

**Date:** 2026-07-30  
**Status:** Approved  
**Slices:** B.1 hook diff validation (this PR) → B.2 lint-sessions alignment (follow-up in same effort)

## Problem

Phase A+C stop hooks only check whether `.agent-room/decisions.md` or
`anti-patterns.md` appears in `git status --porcelain`. Agents can pass by
touching the file without adding meaningful content (whitespace, empty
`<!-- no-log: -->`).

## Goal

When source files outside the scaffold changed, require **visible evidence in
the git diff** on log files: a valid waiver or a structurally valid entry.
Mechanical only — regex/structure, no LLM quality judgment.

## Non-goals

- Classification-based phase sequencing (agentic-os style)
- Session log required at stop-hook time
- New runtime dependencies or guardrails.json toggles for v1

## B.1 — Close-the-loop hook (implement first)

### Pass rules

1. No non-scaffold source changes → pass (unchanged).
2. Cursor `aborted`/`error` stop → pass (unchanged).
3. `git diff HEAD` on log files contains **one of**:
   - Waiver: `<!-- no-log: <reason> -->` with ≥20 chars after `no-log:` and
     a deliberate keyword (e.g. `routine`, `fix`, `test`)
   - Anti-pattern entry: `### YYYY-MM-DD — title` plus one of
     `**What happened:**`, `**Root cause:**`, `**Avoid:**`
   - Decision entry: `### YYYY-MM-DD — title` plus `**Decision:**` and
     `**Why:**`
4. Else if log files not in porcelain → fail (existing “no log touched” message).
5. Else → fail (“log touched but evidence insufficient” message).

### Implementation

- `lib/closing-the-loop-evidence.js` — pure functions, unit-tested
- Copy to `.agent-room/hooks/closing-the-loop-evidence.js` alongside hook script
- `close-the-loop-check.js` requires local `./closing-the-loop-evidence.js`
- `doctor` drift check includes both hook files

## B.2 — lint-sessions alignment (follow-up)

When `**Status:** Completed`, `## Decisions made` must be non-empty and not
only placeholder text (`none`, `n/a`, `-`). Warn if content looks like a
waiver without pointing to `decisions.md`.

## Known limitations

- Diff since `HEAD`, not since turn start (same family as porcelain check).
- Structure validation only — cannot judge entry quality.

## Dogfood

Validate on `create-agent-room` repo: hook rejects empty waiver; accepts
real `decisions.md` / `anti-patterns.md` entries used during development.
