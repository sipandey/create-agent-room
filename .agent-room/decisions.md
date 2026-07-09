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

<!-- no-log: added --version/-v to bin/cli.js - a standard CLI convention that was simply missing, mirrors the existing --help short-circuit pattern exactly, no non-obvious design call or bug root-cause to record. -->

### 2026-07-09 — action.yml doesn't check out the repo itself, and version is a second pinned copy of package.json's

**Decision:** the composite `action.yml` requires the calling workflow to
run `actions/checkout@v4` before it — it does not include a checkout
step itself. Its `version` input defaults to a hardcoded `'1.3.1'`,
duplicating (not deriving from) `package.json`'s version, and the
"Release process" checklist in `AGENTS.md`/`CLAUDE.md` was updated with
an explicit step to bump both in lockstep.
**Why:** composite actions that check out the repo internally are a
known anti-pattern — the calling job may already be several steps into
its own checkout/setup sequence (submodules, sparse-checkout, a specific
ref), and a composite action silently re-checking-out over that is
surprising and hard to debug. Checkout is the caller's responsibility;
this action only needs the files to already be present. On the version:
a composite `action.yml` is static YAML evaluated by GitHub's runner,
not Node — it cannot `require('./package.json')` to compute a default
at "compile time," so there was no way to make the two automatically
stay in sync short of a build step (which this project doesn't have and
isn't taking on for one string). Pinning by default was itself a
requirement from the task (mirroring the `{{CAR_VERSION}}` fix for the
scaffolded workflow template), not just a style choice.
**Rejected:** defaulting `version` to `latest` — would reintroduce
exactly the CI-reproducibility problem the scaffolded workflow's
`{{CAR_VERSION}}` interpolation was fixed to avoid earlier this session,
for the one distribution channel (a versioned Marketplace Action) where
users most expect pinned-by-default behavior. `latest` remains available
as an explicit opt-in via the `version` input for people who want it.

### 2026-07-09 — tested action.yml by extracting and running its `run:` steps directly, not with `act`

**Decision:** `act` (`nektos/act`, brew-installed) was available but its
Docker backend wasn't running on this machine, and starting Docker
Desktop for one test run was judged too heavy a detour. Instead: parsed
`action.yml` with `js-yaml` to prove structural validity, extracted each
step's `run:` script body programmatically (not hand-copied — read
straight from the parsed YAML, so the test exercises exactly what's
committed), substituted `${{ inputs.* }}` the way GitHub's runner would,
and executed the resulting scripts against a real scaffolded room (a
clean one and one deliberately missing `guardrails.json`) via a fake
`npx` shim on `PATH` that forwards to the local `bin/cli.js`. Also
independently re-evaluated every step's `if:` condition in Node for all
four `checks` values (`both`/`validate`/`lint-sessions`/an invalid
value) to confirm the right steps fire, and did one real (non-mocked)
`npm view create-agent-room@1.3.1 version` to confirm the pinned default
actually resolves on the registry.
**Why:** the task explicitly allowed "just validate the YAML schema
carefully" as a fallback when `act` isn't available, but schema-only
validation wouldn't catch a broken `if:` expression, a wrong input
substitution, or the reject-unknown-input step exiting 0 by mistake —
all real bugs a composite action can ship with despite valid YAML. This
approach still lacks `act`'s ability to spin up an actual `ubuntu-latest`
container and run the real `runs.using: composite` step sequencer (step
ordering, `actions/setup-node@v4` resolution, context injection) — that
part is unverified and should be confirmed with `act` or a real workflow
run before publishing.
**Rejected:** starting Docker Desktop just for this — reasonable to do,
but a heavier, slower action than the task's own stated fallback
required; left as a note here rather than done silently, in case a
future session has Docker already running and can close this gap cheaply.

### 2026-07-09 — README demo GIF shows the Stop hook via direct script invocation, not a simulated Claude Code turn

**Decision:** `scripts/demo.sh` demonstrates the Claude Code Stop hook by
running `node .agent-room/hooks/close-the-loop-check.js` directly against
an uncommitted change, rather than attempting to fake or narrate what a
live Claude Code session would show.
**Why:** there is no way to trigger Claude Code's Stop hook *mechanism*
from a plain shell script — it's Claude Code's own harness that invokes
it at the end of an agent turn, and no such turn exists in a scripted
demo. The alternative was either skip the Stop hook entirely or fake it
with a canned message, but running the real hook script directly is
neither: it's the exact file the harness would run, exercising its real
blocking logic (including the real exit code and the real waiver
mechanism), just invoked manually instead of automatically. This was an
explicit instruction from whoever requested the demo (tell them if it
can't be scripted rather than faking it) — direct invocation threads
that needle without omitting the tool's most differentiated feature from
its own demo.
**Rejected:** faking a "simulated Claude Code session" transcript —
would misrepresent the demo as more automated than it is, and the whole
point of this GIF is proving real, unmocked behavior (a real secret
actually gets blocked, not described).

### 2026-07-09 — used VHS (not asciinema+agg) to render the demo GIF

**Decision:** installed [VHS](https://github.com/charmbracelet/vhs)
(`brew install vhs`) and wrote `docs/demo.tape` to record and render
`docs/demo.gif` directly, rather than recording with `asciinema` and
converting the `.cast` file separately.
**Why:** VHS renders straight to GIF from a declarative `.tape` script
(shell + typing speed + sleeps + theme, all in one file), with no
separate conversion step or extra runtime dependency (`agg`,
`asciicast2gif`) to install and keep working. The `.tape` file is also
the reproducible recipe for regenerating the GIF after `scripts/demo.sh`
changes — check it in alongside the GIF for that reason.
**Rejected:** `asciinema` + `agg` — an extra tool in the pipeline for no
capability VHS didn't already provide here; also produces an SVG/cast
format that still needs converting to GIF for a plain `![]()` README
embed.

### 2026-07-09 — `init` defaults to `--profile minimal`; summary functions and validate.js made profile-aware

**Decision:** added `--profile minimal|full` to `init`, defaulting to
`minimal`. Minimal scaffolds `AGENTS.md` (trimmed via computed
`{{FIRST_FIVE_MINUTES}}`/`{{GUIDANCE_LINKS}}`/`{{DEFAULT_WORKFLOW}}` vars
in `lib/init.js`, not a second template file), `guardrails.md`/
`guardrails.json`, the base skills, and the Stop/pre-commit hooks where
applicable; it skips `principles.md`, `workflow-classifier.md`, and
`coordination/` (skill packs were already opt-in regardless of profile,
so no change needed there). `lib/validate.js` now reads the `profile`
field this run added to `.agent-room.json` and only requires those three
things under `full` — defaulting to `full` when `.agent-room.json` is
missing or unreadable, so rooms scaffolded before this feature existed
keep their old (strict) validation behavior.
**Why:** per Gloaguen et al. 2026 (ETH Zurich), verbose LLM-facing
context files measurably reduce agent performance and increase token
cost relative to minimal ones — the tool's own "actively enforced vs.
guidance" framing (CAPABILITIES.md) already argues discipline-dependent
guidance is the weaker category, so defaulting to less of it (with the
Stop hook still shipping) is consistent with that stance, not a
contradiction of it. `validate.js` needed the matching change because
shipping "minimal by default" without it would have made every default
`init` fail its own `validate` command and CI on the very first run —
found during manual testing before writing any tests, not something the
task explicitly called out.
**Rejected:** trimming `AGENTS.md` by shipping a second, parallel
`AGENTS.md.tmpl` for minimal — rejected because the project has no
template-engine conditionals (deliberately, per the "Explicitly out of
scope" section of `ROADMAP.md`) and two full copies of the same template
would drift out of sync with each other over time. Computing the
varying sections in JS and injecting them via the existing flat
`{{VAR}}` substitution avoids a second file entirely, and also avoids
touching the (separately broken — see anti-patterns.md) stack-specific
`AGENTS.md.tmpl` layer, which isn't reachable by the packaged templates
today anyway.

### 2026-07-09 — `computeEnforcedFeatures`/`computeGuidanceSummary`/`estimateGuidanceTokens` moved from disk-scanning to the `results` array

**Decision:** these three summary functions (added in the previous
session for the post-`init` enforced/guidance summary) previously took
`target` and scanned the filesystem directly. They now take the
accumulated `results` array from `runInit` instead, and
`mirrorSkillsToClaude` was changed to read its skill-file list from
`results` rather than re-reading `target/.agent-room/skills` off disk.
**Why:** implementing `--dry-run` exposed that disk-scanning breaks
under a dry run — nothing is actually written, so a scan would report
an empty room regardless of what tools/profile say. `copyFile` (via
`copyDirInherited`/`copyFileInherited`) already produces a correct
`{ path, written }` entry for every file candidate whether or not it
physically writes (dry run or not), and — importantly — also for files
skipped because they *already existed* on a real re-run (`written:
false, reason: 'exists'`), so filtering `results` by path is strictly
more correct than the disk-scan version was, not just dry-run-compatible:
it doesn't require the file to exist under the exact cwd being checked,
just to have been a real candidate this run considered.
**Rejected:** keeping the disk-scan implementation for real runs and
adding a parallel dry-run-only code path — rejected as exactly the kind
of duplication the task asked to avoid; the `results`-based version
handles both cases with one code path and no `dryRun` parameter needed
on any of the three functions.

### 2026-07-09 — post-init summary derives "enforced" from final on-disk state, not the run's write log

**Decision:** the new post-`init` summary (`computeEnforcedFeatures`,
`computeGuidanceSummary`, `estimateGuidanceTokens` in `lib/init.js`)
determines what's enforced/guidance/token-heavy by checking final
on-disk state (`tools` selection + `fs.existsSync` + directory walks)
rather than diffing the `results`/`createdFiles` arrays already
collected during this run.
**Why:** `results` only reflects what *this specific run* wrote or
skipped — on a re-run with `--force` omitted, files that already existed
show up as "skipped," but the mechanisms they represent (Stop hook,
guardrails hook, CI workflow) are still fully active. A summary based on
the write log would tell returning users their protections were "not
created" when they're actually already in place. Token estimation has
the same requirement: it needs to reflect the whole guidance corpus
present after scaffolding, not just files new to this run.
**Rejected:** deriving the summary from `results` directly — simpler
(no extra filesystem walk) but wrong on any run where files already
existed, which is common (re-running `init` on a project that already
has git/claude adapters configured, or a partial re-scaffold).

### 2026-07-09 — recategorized the Stop hook from 🟡 guidance to 🟢 enforced in README/CAPABILITIES

**Decision:** moved "Anti-patterns & Decisions Logs" (the Claude Code
Stop hook, `close-the-loop-check.js`) from the 🟡 "Prescriptive Guidance
— there is no automatic enforcement" bucket to the 🟢 "Actively
Enforced" bucket in both `README.md` and `CAPABILITIES.md`, and gave it
top billing as the lead feature in README's opening pitch and Features
list. Also fixed `CAPABILITIES.md`'s "Recommended Setup" section, which
claimed "pre-commit hook enforces guardrails and decisions log updates"
— wrong on two counts: it attributed Stop-hook behavior to the git
pre-commit hook, and the setup recipe above it only passed `--tools
git`, which never installs the Stop hook at all (that requires `--tools
claude`).
**Why:** the 🟡 bucket's own entry text already said the Stop hook
mechanically blocks an agent from ending its turn — leaving it filed
under "no automatic enforcement" directly contradicted its own
description. It also undersold the tool's most differentiated feature:
the Stop hook runs inside the agent's own loop, before there's
necessarily even a commit to gate, which is a stronger enforcement
point than a commit-time or CI-time check (no `--no-verify` equivalent
exists for it). Leaving it buried as one bullet among four in a
"requires human discipline" list didn't reflect that.
**Rejected:** keeping it in 🟡 with clarified wording only — considered,
but the category label itself ("no automatic enforcement") was the
misleading part, not just the surrounding prose; a reader skimming
section headers would still walk away with the wrong impression.

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
