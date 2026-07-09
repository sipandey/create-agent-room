# CLAUDE.md — create-agent-room

This file is read automatically by Claude Code. The actual guidance lives in
[`AGENTS.md`](AGENTS.md) and [`.agent-room/`](.agent-room/) — read those
first, this file only adds Claude Code-specific mechanics.

## Skills

The skills in `.agent-room/skills/` are mirrored into `.claude/skills/` so
Claude Code can discover and invoke them (`/brainstorming`,
`/writing-plans`, `/test-driven-development`, `/systematic-debugging`,
`/verification-before-completion`, `/closing-the-loop`).

`.agent-room/skills/` is the source of truth. If you edit a skill, re-run
`npx create-agent-room sync` to refresh the `.claude/skills/` copies — don't
edit the `.claude/skills/` copies directly, they'll be overwritten.

## Closing-the-loop hook

A `Stop` hook is wired up in `.claude/settings.json`, running
`.agent-room/hooks/close-the-loop-check.js` at the end of every turn. If the
turn changed tracked files outside the agent-room scaffold but didn't touch
`.agent-room/anti-patterns.md` or `.agent-room/decisions.md`, the hook
blocks the turn from ending and explains why. This is mechanical
enforcement of `.agent-room/skills/closing-the-loop.md` — it can't judge
whether an entry is *good*, only that the check wasn't silently skipped.

The exit hatch is a one-line waiver in `decisions.md`:
`<!-- no-log: routine change, no decision or anti-pattern worth recording -->`

The hook only looks at `git status --porcelain`, so unrelated pre-existing
dirty files in the work tree will also trigger it — commit or stash them
first if that gets noisy.

## Git rules

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

## Release process

The version is authoritative in `version` in `package.json`, but
`action.yml`'s `inputs.version.default` is a separate pinned copy that
must be bumped in lockstep (composite actions can't read `package.json`).
To cut a release: bump `package.json`'s version (semver), then run `npm
install` immediately to re-sync `package-lock.json` (this has drifted out
of sync before when that step was skipped), run `npm run lint && npm
test`, move `CHANGELOG.md`'s `[Unreleased]` section to a new
`[X.Y.Z] - YYYY-MM-DD` section (per-version `RELEASE_NOTES_*.md` files are
retired — don't create new ones), update `README.md`/`CAPABILITIES.md` if
behavior changed, bump `action.yml`'s pinned version, commit, and tag
(`git tag vX.Y.Z`, matching `v1.2.1`, `v1.3.0`). See "Release process" in
[`AGENTS.md`](AGENTS.md) for the full checklist.

**Never run `npm publish`, `git push`, or `git push --tags`** — prepare
the release locally and hand off to a human for that step.

## Roadmap & issues

Check [`ROADMAP.md`](ROADMAP.md) before proposing new scope — don't build
something listed under "Explicitly out of scope" without flagging the
mismatch first. If you find a bug or idea outside the current task, either
fix it now (small, related, logged per the closing-the-loop rule above) or
surface it in your response so the human can decide whether to file it
via `.github/ISSUE_TEMPLATE/`. Never run `gh issue create` unasked — same
rule as `git push`. When a scope decision is made, update `ROADMAP.md` in
the same commit; see "Roadmap & issue conventions" in
[`AGENTS.md`](AGENTS.md) for detail.
