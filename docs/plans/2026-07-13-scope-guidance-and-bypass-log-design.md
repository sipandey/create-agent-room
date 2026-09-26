---
date: 2026-07-13T00:00:00Z
research_doc: N/A
branch: feature/scope-guidance-and-bypass-log
status: complete
phases_total: 1
phases_completed: 1
---

# Design: enforce `scopeGuidance` + a durable guardrails-bypass log

Date: 2026-07-13
Status: Approved (user: "yes fix both of them").
Branch: `feature/scope-guidance-and-bypass-log` (from `main`, no `develop`
branch exists in this repo).

## Origin

Two concrete gaps found while comparing this project against a set of
generic "vibe coding security debt" principles (guardrails must be
automatic, not memory-dependent; small unreviewed decisions compound
invisibly; bypassing security controls diffuses accountability if it
isn't tracked). Both gaps are real, verified against the current code —
not speculative:

1. `guardrails.json`'s `scopeGuidance: { maxFilesPerChange, maxLinesPerChange }`
   is declared in the shipped schema but **never read anywhere** in the
   codebase (verified via grep across `lib/`, `templates/`, `bin/`) — dead
   config. A 60-file, 3,000-line commit ships today with zero friction,
   despite the schema explicitly modeling "this is too big to have been
   meaningfully reviewed."
2. `GUARDRAILS_BYPASS=1` already exists as the escape hatch for a blocked
   commit, and correctly prints a warning — but that warning only ever
   goes to the terminal. There is no durable record of who bypassed a
   guardrail, when, or what was being overridden. The moment the terminal
   scrolls, the event is gone.

## 1. Enforcing `scopeGuidance`

**Where:** inside the existing pre-commit hook
(`templates/adapters/git-hooks/guardrails-check.js`), as a third check
alongside `protectedPaths` and `forbiddenActions` — not in `validate`/
`doctor`, since those operate on room *structure*, not a specific staged
diff; the hook already has the staged-file machinery this needs.

**Measurement (zero new deps, same `execSync`/`execFileSync` pattern
already used in this file):**
- File count: reuse the existing `stagedFiles.length` (already computed
  via `git diff --cached --name-only`).
- Line count: new — `git diff --cached --numstat`, sum added+deleted per
  line, skipping binary markers (`-\t-\tpath`).

**Trigger:** if `guardrails.scopeGuidance` is absent, skip entirely
(backward compatible with any existing `guardrails.json`). If present,
violate when `stagedFiles.length > maxFilesPerChange` **or**
`totalLines > maxLinesPerChange` (either limit, not both).

**Severity: blocks the commit**, added to the same `violations` array the
other two checks already populate — same tier as `protectedPaths`/
`forbiddenActions`, same `GUARDRAILS_BYPASS` escape hatch, no new
severity concept introduced into the hook.

**Critical exemption — verified necessary, not theoretical:** a normal
`init --tools git --git` genesis commit touches **25 files / 1,569
insertions** (measured just now) — already over the *default*
`maxFilesPerChange: 20` / `maxLinesPerChange: 500`. Without exempting it,
the tool would immediately block its own onboarding flow — the same
class of self-inflicted bug already fixed once for `protectedPaths`
(see `.agent-room/anti-patterns.md`, "guardrails' own genesis-commit
blocked itself"). Reuses the existing `isInitialCommit()` check, same as
`protectedPaths` already does.

## 2. Durable bypass log

**New scaffolded file:** `.agent-room/guardrails-bypass-log.md`
(`templates/.agent-room/guardrails-bypass-log.md`), picked up
automatically by the existing `copyDirInherited('.agent-room', ...)` walk
in `lib/init.js` — no `init.js` changes needed, same as how
`anti-patterns.md`/`decisions.md` are already scaffolded.

**When it's written:** a new `logBypass(reasons)` helper in the hook,
called from **both** existing bypass sites — the corrupted-`guardrails.json`
fail-closed branch, and the `violations.length > 0` branch (which now
also carries `scopeGuidance` violations from part 1, for free). Only
fires when a bypass actually happens; a clean commit writes nothing.

**Entry format** (single line, machine-appended, append-only —
mirrors the append-only convention `anti-patterns.md`/`decisions.md`
already use, but kept single-line since this is written by code, not
composed prose):

```
- 2026-07-13T16:42:01.234Z | author: Jane Doe <jane@example.com> | bypassed: Protected path violation: .github/workflows/ci.yml
```

Author identity via `git config user.name`/`user.email` (already how
this repo's own identity is verified elsewhere); falls back to
`"unknown"` rather than crashing the hook if unset.

**After writing, `git add` the log file** so the entry is included in the
very commit it's recording — the same side-car pattern tools like
lint-staged already use, and the only way the entry reliably ends up in
history rather than an orphaned working-tree change.

**Explicitly deferred (documented limitation, not silently missing):**
the log file itself is **not** added to `protectedPaths`. Doing so would
create a bypass-loop — the hook's own auto-`git add` of the log would
immediately trip a protected-path violation on the same commit. Tamper-
detection for the log (e.g. diffing against HEAD to catch someone
shrinking it) is out of scope for v1; git history itself is the tamper-
evidence for now, same posture as `decisions.md`/`anti-patterns.md`,
neither of which have special anti-tampering either.

## Testing (TDD, `test/guardrails-check.test.js`)

1. `scopeGuidance` absent from `guardrails.json` → no enforcement
   (backward compat).
2. Non-initial commit exceeding `maxFilesPerChange` → blocked.
3. Non-initial commit exceeding `maxLinesPerChange` → blocked.
4. Non-initial commit within both limits → passes.
5. Genesis commit exceeding both limits → **not** blocked (exemption).
6. A bypassed protected-path violation → bypass log gets one entry with
   timestamp/author/reason, and that entry is part of the resulting
   commit (not just the working tree).
7. A bypassed `scopeGuidance` violation → also logged.
8. A clean commit (no violations) → bypass log untouched, zero entries.

## Docs & closing-the-loop

`guardrails.md` (scopeGuidance moves from "declared" to "enforced"),
README/CAPABILITIES (if `scopeGuidance` or bypass behavior is mentioned
anywhere — audit and update), `CHANGELOG.md` `[Unreleased]`, and a
`decisions.md` entry covering both fixes and the "why" (dead schema +
untracked bypass = accountability gap), each with a `**Rejected:**` note
for the deferred tamper-detection.
