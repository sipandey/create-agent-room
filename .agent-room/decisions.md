# Decisions Log — create-agent-room

Short, append-only record of architecture/design decisions and why. A
decision belongs here if a future session (or a future you) would otherwise
have to re-derive it from scratch by reading git history.

## Format

```
### YYYY-MM-DD — short title

**Decision:** what was decided.
**Why:** the constraint or trade-off that drove it.
**Rejected:** what else was considered, and why it lost.
```

<!-- Entries go below this line, newest first. -->

### 2026-07-09 — closing-the-loop enforcement moved out of the git pre-commit hook entirely

**Decision:** removed the `HAS_SOURCE_CHANGES`/`HAS_LOG_TOUCHED` logic
from `templates/adapters/git-hooks/pre-commit.tmpl`. That hook now only
runs `guardrails-check.js`. Closing-the-loop enforcement (did this turn
log a decision or anti-pattern?) is enforced solely by the existing
Claude Code Stop hook, `.agent-room/hooks/close-the-loop-check.js`.
**Why:** the pre-commit version applied to every commit — human or
agent, regardless of whether Claude Code was even in use — since it was
installed whenever `--tools git` was selected. Field consensus on agent
guardrails is that a heavy local commit-time gate like this teaches
people to reach for `git commit --no-verify` to get past it, which also
silently disables `guardrails-check.js` running in the *same* hook —
the one check here that's actually security-relevant (secret detection,
protected-path enforcement). The Stop hook doesn't have this problem: it
only fires for Claude Code agent turns, has no interaction with git
commit flags at all, and already ships with a proper waiver escape
hatch (a one-line `<!-- no-log: ... -->` comment) instead of an
all-or-nothing bypass flag.
**Rejected:** keeping both mechanisms (Stop hook for agents, pre-commit
gate as a human backstop) — redundant, and the redundant gate is exactly
the one that creates `--no-verify` pressure. Making the pre-commit
version opt-out via a flag was also considered and rejected as more
complexity for a check that already has a correctly-scoped
implementation elsewhere.

### 2026-07-09 — pin scaffolded CI workflow to a version, resolved from package.json rather than hardcoded

**Decision:** the scaffolded `.github/workflows/agent-room-validate.yml`
now runs `npx --yes create-agent-room@{{CAR_VERSION}} ...` instead of
`@latest`, where `{{CAR_VERSION}}` is resolved in `lib/init.js` via
`require('../package.json').version` at scaffold time and interpolated
into the template like any other `{{VAR}}`, rather than being hardcoded
into `github-actions.yml.tmpl` directly.
**Why:** `@latest` meant the same commit could pass CI one week and fail
the next purely from an upstream `create-agent-room` release, with no way
to reproduce a past CI run. Resolving from `package.json` instead of
hardcoding a version string into the template means every release
automatically scaffolds workflows pinned to itself — no separate template
edit needed at release time (which would be one more place to forget,
matching the `package-lock.json` drift pattern already logged in
`anti-patterns.md`).
**Rejected:** hardcoding a literal version number in the `.tmpl` file —
would require remembering to bump it on every release, the exact kind of
manual sync step that's already bitten this project twice.

<!-- no-log: 1.3.1 release commit (version bump, lockfile sync, changelog promotion) - follows the documented release process exactly, no new decision or anti-pattern to record. -->

<!-- no-log: README.md usage section flipped to lead with npx (the package is confirmed published as of 1.3.1) instead of "once published to npm", plus npm-version/CI badges - a routine doc-accuracy fix already tracked as a ROADMAP.md "Now" item, not a new decision or bug root-cause. -->

### 2026-07-09 — added CHANGELOG.md, ROADMAP.md, and GitHub issue templates; retired per-version release notes

**Decision:** introduced `CHANGELOG.md` (Keep a Changelog format, single
running file with an `[Unreleased]` section) as the project's changelog
going forward, and retired the per-version `RELEASE_NOTES_vX.Y.Z.md` file
convention — existing ones stay as historical record, but the release
process now updates `CHANGELOG.md` instead of creating a new file each
time. Also added `ROADMAP.md`, capturing the "Now / Next / Later /
Explicitly out of scope" priorities that came out of an independent audit
of the project earlier in this session, and `.github/ISSUE_TEMPLATE/`
(bug report, feature request, config) so external contributors have a
structured place to file things instead of unstructured blank issues.
Updated `AGENTS.md`/`CLAUDE.md`'s release-process section and added a new
"Roadmap & issue conventions" section instructing agents to check
`ROADMAP.md` before proposing new scope, and to surface (not silently fix
or silently drop) out-of-scope findings for a human to decide whether to
file as an issue.
**Why:** a single running changelog is more standard and less
duplicative than a new file per release; `RELEASE_NOTES_*.md` and
`CHANGELOG.md` would otherwise be two sources of truth for the same
information. `ROADMAP.md` exists so scope arguments (e.g. "should this
add a plugin system?") don't get re-litigated from scratch in every issue
— the audit already did that analysis once.
**Rejected:** keeping both `RELEASE_NOTES_*.md` and `CHANGELOG.md` going
forward — redundant, and drift between the two is exactly the kind of
"two files, one fact" problem this project has already been bitten by
(see the `package-lock.json` entry above). Deleting the existing
`RELEASE_NOTES_*.md` files was also considered and rejected — they're
committed history, not worth an irreversible cleanup for files that do no
harm sitting there.

### 2026-07-09 — regression-test the npm package contents, and centralize release steps

**Decision:** added `test/package.test.js`, which runs `npm pack --dry-run
--json` and asserts this repo's own dogfooded `.agent-room/`, `.claude/`,
`.github/`, `AGENTS.md`, and `CLAUDE.md` never appear in the published
tarball, while `templates/.agent-room/*` (the real scaffold source) and
`examples/*/AGENTS.md` still do. Also added a "Release process" section to
`AGENTS.md`/`CLAUDE.md` documenting the version-bump → `npm install` →
lint/test → release notes → commit → tag sequence, and stating explicitly
that `npm publish`/`git push`/`git push --tags` require a human.
**Why:** the `files` field in `package.json` already excludes the root
scaffold today (it's a whitelist and those paths aren't in it), but that
protection was implicit — nothing would fail if a future change to
`files` accidentally widened it. Release steps were similarly undocumented
and had already drifted once (`package-lock.json` was stale relative to
`package.json` until an audit caught it).
**Rejected:** an `.npmignore` file — redundant since `files` already takes
precedence over it, and would only add a second place to keep in sync.

### 2026-07-09 — getLayers() treats stacks/org subdirs as structured, instead of restructuring templates/ into base/

**Decision:** fixed `getLayers()` in `lib/fsutil.js` to also recognize a
template root as "structured" (needing layer merging) when it has a
`stacks/` or `org/` subdirectory, not only a `base/` subdirectory — and to
use the root itself as the implicit base layer in that case. Left the
packaged `templates/` directory layout unchanged (files at its root,
`stacks/<language>/` and future `org/<name>/` as siblings).
**Why:** the alternative — restructuring `templates/` into
`templates/base/` + `templates/stacks/` + `templates/org/` to match what
`getLayers()` originally expected — touches every `relativePath` argument
passed into `copyFileInherited`/`copyDirInherited` in `lib/init.js`, plus
anything (docs, `examples/`, packaging) that assumes today's flat root
layout. The `getLayers()` change is a single function, is backward
compatible with the synthetic `base/`+`stacks/`+`org/` layout the existing
"template inheritance layers merge correctly" test already covers, and has
no blast radius outside `fsutil.js`.
**Rejected:** restructuring `templates/` to have an explicit `base/` dir —
correct in the abstract (makes "structured" detection unambiguous) but a
much larger diff for the same outcome, with no functional benefit since
`getLayers()` can absorb the ambiguity in one place instead.
