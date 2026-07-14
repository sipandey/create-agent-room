# Design: fix three dogfood-drift findings, and stop them recurring

Date: 2026-07-14
Status: Approved (user asked directly for this design after the three
`doctor` findings from the previous session).
Branch: `fix/dogfood-drift-and-ci-pin` (from `main`).

## The findings, grounded

All three of `doctor`'s remaining findings on this repo trace back to the
**same root cause**: this repo's own scaffolded/dogfooded copies drifted
from templates that were already fixed, unnoticed because nothing ever
re-checks them.

1. **`.git/hooks/pre-commit` drift.** The installed hook still runs old,
   inline closing-the-loop bash logic. The current template
   (`pre-commit.tmpl`) is deliberately narrow — it only runs
   `guardrails-check.js`; closing-the-loop discipline now lives in the
   Claude Code Stop hook instead, which is already what
   `CAPABILITIES.md` documents. Re-syncing is a safe correction, not a
   functional regression — the old bash logic is genuinely superseded,
   not an alternate path someone relies on.
2. **Legacy flat-string `forbiddenActions`.** The **shipped template is
   already clean** — 5 real regex rules (AWS key, private key, API key,
   Slack token, GitHub token), no flat strings. This repo's own
   `.agent-room/guardrails.json` currently has **only the 4 legacy
   strings and none of the 5 real rules** — meaning this repo's own
   commits have had zero functional secret-scanning this whole time, the
   exact "looked enforced but matched nothing" bug already fixed once in
   the packaged template, still live in our own file.
3. **CI `@latest` pin.** `decisions.md` already documents, from before
   this session, exactly why `@latest` was replaced with `{{CAR_VERSION}}`
   pinning: "the same commit could pass CI one week and fail the next."
   Our own `.github/workflows/agent-room-validate.yml` predates that fix.

## Why this keeps happening

`doctor` already detects all three (that's how they were found) — but
`doctor` is, by design, advisory-only for *end users*: a scaffolded
room's hooks or CI file might be legitimately, intentionally customized,
so it must never block a build it doesn't own the context for. That
correctness is exactly why the same drift has now recurred three times,
unnoticed, in our own repo: nobody is required to run `doctor` here, and
this project's own CI never calls it.

## The fix: three content corrections + one preventive CI gate

### Content fixes

1. `.git/hooks/pre-commit` ← replaced with the current
   `templates/adapters/git-hooks/pre-commit.tmpl` content, `chmod 755`
   (matching exactly what `lib/init.js`'s own scaffolding does today).
2. `.agent-room/guardrails.json`'s `forbiddenActions` ← replaced with the
   5 entries from `templates/.agent-room/guardrails.json`, so this repo's
   own file becomes a functional scanner matching the shipped defaults
   (not just "fewer bad entries" — real ones added).
3. `.github/workflows/agent-room-validate.yml` ← both `validate` and
   `lint-sessions` steps repinned from `create-agent-room@latest` to
   `create-agent-room@2.1.0` (current `package.json` version).

### Preventive measure: a project-specific "stay clean" CI gate

Extract `lib/doctor.js`'s finding-computation into a new pure function,
`getFindings(target)`, returning `{ critical: string[], advisory: string[] }`
with no console output — mirroring the exact pattern already used for
`lib/checks.js`'s `collectFindings()` (shared by `validate`/`doctor`).
`runDoctor()` calls it internally to build the printed report; nothing
about `doctor`'s existing CLI behavior, wording, or (always-zero) exit
code changes for end users.

New `scripts/check-doctor-clean.js` (same shape as the existing
`scripts/check-lockfile-version.js`): calls `getFindings('.')`, prints
anything found, exits 1 if non-empty, 0 if clean. Wired into this
project's own `.github/workflows/ci.yml` as `npm run check:doctor`,
alongside the existing `check:lockfile` step — **not** part of the
templates scaffolded for other users' projects. This is a self-check for
this repo specifically, not a new product feature.

## Testing

- `test/doctor.test.js`: new tests for `getFindings()` as a pure function
  — clean room → both arrays empty; hook drift / stale CI pin / config
  mismatch → each surfaces in `advisory`; structural errors → `critical`.
- Manual: run `scripts/check-doctor-clean.js` against this repo before
  the three fixes (expect exit 1, listing exactly these three findings)
  and after (expect exit 0).
- Full `npm run lint && npm test`.

## Out of scope

- Making `doctor`'s own CLI exit code non-zero for end users — it stays
  advisory by design; only this repo's own CI gates on it.
- Auto-fixing drift (a `doctor --fix` or similar) — not asked for, a
  separate speculative feature needing its own design.
