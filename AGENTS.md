# Agent Instructions — create-agent-room

This file is the entry point for any AI coding agent (Claude Code, Codex,
Cursor, etc.) working in this repository. Tool-specific files (`CLAUDE.md`,
`.cursor/rules`, ...) are thin pointers back to this file plus their own
loading mechanics — the actual content lives here and in `.agent-room/`.

## The First 5 Minutes

When you first enter this repository or start a new task, **stop and read**.
Do not immediately start writing code.

1.  **Check coordination state:** Are there other agents working? Check open
    PRs, issue assignments, or the `.agent-room/sessions/` directory.
    Read `.agent-room/coordination/handoff-protocol.md` if you are picking
    up someone else's work.
2.  **Classify the work:** Use `.agent-room/workflow-classifier.md`. Don't
    apply Feature-weight process to a one-line bug fix, and don't skip design
    for a "simple" feature.
3.  **Check guardrails:** Review `.agent-room/guardrails.md`. Ensure your
    planned work does not touch protected paths or require human approval
    without asking first.
4.  **Review past decisions:** Read `.agent-room/anti-patterns.md` and
    `.agent-room/decisions.md` to understand *why* the codebase is structured
    this way, and what mistakes to avoid.

## Read these before doing anything non-trivial

- [`.agent-room/principles.md`](.agent-room/principles.md) — how to get
  reliable output from an LLM (context, iteration, checkpointing, tests as
  spec, negative knowledge).
- [`.agent-room/guardrails.md`](.agent-room/guardrails.md) — boundaries and
  constraints. Check before touching protected paths or making large changes.
- [`.agent-room/workflow-classifier.md`](.agent-room/workflow-classifier.md) —
  how to size the process to the work (Bug / Enhancement / Feature / Product).
- [`.agent-room/anti-patterns.md`](.agent-room/anti-patterns.md) — things that
  have already gone wrong in this project. Check before repeating a mistake;
  append after fixing one.
- [`.agent-room/decisions.md`](.agent-room/decisions.md) — short log of
  architecture/design decisions and why. Append when you make one that future
  sessions would otherwise have to re-derive.
- [`.agent-room/skills/`](.agent-room/skills/) — procedures to follow, not
  just read: `brainstorming`, `writing-plans`, `test-driven-development`,
  `systematic-debugging`, `verification-before-completion`,
  `closing-the-loop`.
- [`.agent-room/coordination/`](.agent-room/coordination/) — protocols for
  multi-agent workflows: `handoff-protocol`, `scope-boundaries`,
  `session-log-format`.

## The default workflow

1. **Classify the work** using `.agent-room/workflow-classifier.md`.
2. **For anything beyond a trivial bug fix**, brainstorm before building: ask
   clarifying questions, propose 2-3 approaches with trade-offs, get the
   design approved, *then* write a short design note under `docs/plans/`.
3. **Use TDD**: write the failing test first, watch it fail, write the
   minimal code to pass, refactor, commit. No production code without a
   failing test first.
4. **Debug systematically**: find the root cause before proposing a fix.
   Reproduce, check recent changes, gather evidence at component boundaries.
   No fixes without root-cause investigation.
5. **Verify before claiming done**: run the actual test/build/lint command in
   this turn and read its output before saying "tests pass" or "fixed."
   "Should work" is not evidence.
6. **Serialize state**: Before ending your session, log your work in
   `.agent-room/sessions/` according to `session-log-format.md`, and write
   a handoff note if the task is incomplete.
7. **Close the loop — before ending the turn, not after**: this is a gate,
   not a suggestion. Follow `.agent-room/skills/closing-the-loop.md`. If the
   turn fixed a bug, found a root cause, or made a non-obvious design call,
   append it to `.agent-room/anti-patterns.md` or `.agent-room/decisions.md`
   *before* claiming the task is done. If nothing qualifies, say so
   explicitly rather than silently skipping the check.

## Project-specific notes

- **Language:** javascript
- **Package Manager:** npm
- **Default Branch:** main

Commands:
- Run tests: `npm test`
- Run linting: `npm run lint`

### Git identity & rules

Use this identity for commits in this repo:

```
git config user.name "Siddharth Pandey"
git config user.email "siddharth.pandey06@gmail.com"
```

Re-verify (`git config user.name && git config user.email`) before any
push, not just at session start — a global config change or a fresh clone
mid-session can silently reset it.

- Do not run `git push` unless explicitly asked.
- Do not amend or rewrite history on shared branches without being asked.

### Release process

This package is published to npm as `create-agent-room`
(https://www.npmjs.com/package/create-agent-room). The version is
authoritative in one place, the `version` field in `package.json` — but
`action.yml`'s `version` input default is a deliberate pinned copy (see
"Why the version is pinned by default" in `docs/github-action.md`) that
must be bumped in lockstep, not left to drift. To cut a release:

1. **Pick the version bump** (semver): patch for fixes, minor for
   backward-compatible additions (new flags, templates, skill packs),
   major for breaking changes to the CLI, flags, or scaffolded output.
2. **Edit `version` in `package.json`.**
3. **Run `npm install`** right after, even though nothing else changed —
   this re-syncs `package-lock.json`'s `version` fields to match. Skipping
   this step is how `package-lock.json` drifted out of sync with
   `package.json` in the past (caught during an audit, not before a
   release).
4. **Run the full check before writing anything else:** `npm run lint &&
   npm test` must pass clean.
5. **Update `CHANGELOG.md`:** rename the `## [Unreleased]` section to
   `## [X.Y.Z] - YYYY-MM-DD`, then add a fresh empty `## [Unreleased]`
   section above it. Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
   categories (`Added`, `Fixed`, `Changed`, `Removed`, etc.) — entries
   should already exist there if `.agent-room/decisions.md` /
   `anti-patterns.md` were kept up to date during the work, this step is
   mostly promoting "Unreleased" to a version number, not writing from
   scratch. Add the compare-link footer entries at the bottom of the file
   to match the existing pattern.
   (The old `RELEASE_NOTES_vX.Y.Z.md` per-version files are retired as of
   `CHANGELOG.md`'s introduction — don't create new ones; the existing
   files stay as historical record.)
6. **Update `README.md`** (and `CAPABILITIES.md` if enforcement behavior
   changed) if commands, flags, or capabilities changed.
7. **Bump `action.yml`'s `inputs.version.default`** to match. It's a
   separate hardcoded string (composite `action.yml` can't reference
   `package.json` at "compile" time), so it doesn't get updated by step 2
   — easy to forget, which is exactly the kind of drift this checklist
   exists to prevent (see the `package-lock.json` version-drift entry in
   `.agent-room/anti-patterns.md` for what happens when a step like this
   gets skipped).
8. **Commit** the version bump, lockfile, changelog, `action.yml`, and any
   doc updates. Either as part of the feature commit that earns the bump,
   or as a dedicated `chore: release vX.Y.Z` commit — either is fine, just
   don't silently fold a version bump into an unrelated commit's message.
9. **Tag the release commit:** `git tag vX.Y.Z` (matches existing tags:
   `v1.2.1`, `v1.3.0`). Marketplace consumers pin to major-version tags
   (`sipandey/create-agent-room@v1`), so also move/create the rolling
   `v1` tag to point at the new release commit if this is a `v1.x.y`
   release — see `docs/github-action.md` for consumer-facing detail. (Tag
   management for the Action is a human/CD step, not something this
   session performs — see the "Do not run" note below.)

**Do not run `npm publish`, `git push`, or `git push --tags` yourself.**
Publishing and pushing a tag are irreversible and externally visible —
prepare everything above locally, then stop and hand off to a human to
review the diff and push/publish.

### Roadmap & issue conventions

- **Before proposing new scope** (a new flag, template, integration,
  dependency, etc.), check [`ROADMAP.md`](ROADMAP.md). If it's listed
  under "Explicitly out of scope," don't quietly build it — either skip
  it or explain to the human what's different about this case before
  proceeding.
- **When you find a real bug or a good idea that's out of scope for the
  current task**, don't silently drop it and don't silently expand scope
  to fix it either. Two options: fix it now if it's small and directly
  related (following the workflow above, including the changelog/log
  entry), or flag it clearly to the human in your response so they can
  decide whether to open a GitHub issue using the templates in
  `.github/ISSUE_TEMPLATE/`. Filing an issue is a visible, external
  action — don't run `gh issue create` without being asked to, same as
  `git push`.
- **When a scope decision gets made** (something added to or rejected
  from the roadmap), update `ROADMAP.md` in the same commit — move the
  item between sections, or add a one-line reason under "Explicitly out
  of scope." Treat this the same as a `decisions.md` entry: it's
  forward-looking instead of retrospective, but the same "don't make the
  next person re-derive this" rule applies.

<!-- Add stack, conventions, and anything else an agent needs that isn't derivable. -->
