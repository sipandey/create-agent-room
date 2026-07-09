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

### 2026-07-09 — fixed the Marketplace description-length rejection with a v2.0.1 patch, not by rewriting the pushed v2.0.0 tag

**Decision:** after `v2.0.0`'s `action.yml` `description` was rejected
by GitHub's Marketplace publish form for exceeding 125 characters, the
fix shipped as a new `v2.0.1` patch release. `v2.0.0`'s tag stays
exactly as originally pushed. Only the rolling `v2` major tag (the one
Marketplace consumers pin to via `@v2`) was force-moved to point at
`v2.0.1`.
**Why:** an exact-version tag (`v2.0.0`) is a promise that a given tag
name always resolves to the same commit — once pushed, moving it is a
silent, retroactive rewrite of what anyone who already has that tag
would get, which is exactly the class of operation this project's own
git-safety norms (and the permission system enforcing them) exist to
prevent. A first attempt at force-moving `v2.0.0` was correctly blocked
by the harness before it happened. The rolling `v2` tag is different in
kind: moving it on every release is its documented, expected purpose
(that's what "rolling" means), not a rewrite of a promise anyone relied
on. The `description` field itself is Marketplace-listing metadata only
— it doesn't affect the Action's runtime behavior, so leaving `v2.0.0`
tagged with the long description causes no functional harm to anyone
already using `@v2.0.0` directly.
**Rejected:** force-moving `v2.0.0` to the fixed commit — simpler
(one release instead of two, no `2.0.1` for a metadata-only change) but
wrong: it would have made `v2.0.0` mean two different things depending
on when you fetched it, undermining the entire point of an immutable
version tag for a one-line, publish-blocking fix that didn't need that
tradeoff.

### 2026-07-09 — v2.0.0: major bump for the --profile minimal default, not minor

**Decision:** the release accumulated in `CHANGELOG.md`'s `[Unreleased]`
since `1.3.1` (dry-run, `--profile`, the GitHub Action, `--version`,
demo GIF, comparisons doc, CI fix) shipped as `2.0.0`, not `1.4.0`,
specifically because of one item in that list: `init` now defaults to
`--profile minimal` instead of scaffolding everything. The GitHub
Action's rolling Marketplace tag is `v2` as a direct consequence — every
`@v1`-style usage example across `README.md`, `docs/github-action.md`,
and `docs/comparisons.md` was updated to `@v2` in the same commit, and
`ROADMAP.md`'s "publish to Marketplace" item (which had assumed `v1`)
was corrected.
**Why:** everything else accumulated this cycle is additive — a new
flag, a new file, a new doc, a bug fix. The profile default is
different in kind: it changes what a bare `create-agent-room init`
*does* with no flags passed, which is a change to default CLI behavior,
not a new capability layered on top. Per this project's own semver
policy (documented in `AGENTS.md`'s Release process: "major for breaking
changes to the CLI, flags, or scaffolded output"), that's a major bump
by the project's own stated rule, not just a judgment call invented for
this release.
**Rejected:** `1.4.0` (minor) — considered, since most of the release is
genuinely additive and a major bump makes the release look bigger than
it "feels." Rejected because shipping a default-behavior change under a
minor version would violate the semver contract this project has
already committed to in writing, and an npm/Action consumer pinning to
`^1.x` would silently get different scaffolded output on their next
install — exactly the kind of surprise semver exists to prevent.

<!-- no-log: this commit's own version-bump/lockfile-sync/changelog-promotion/action.yml-version-bump mechanics follow the documented release process exactly (see AGENTS.md "Release process"); the one substantive decision this release involved (major vs. minor bump) is logged above. -->

### 2026-07-09 — docs/comparisons.md: don't compare agentic-os's lifecycle token benchmark against our static corpus-size number

**Decision:** `docs/comparisons.md` explicitly states that agentic-os's
published `LIFECYCLE_BENCHMARK.md` numbers (measured multi-phase session
token cost, e.g. ~22–27K tokens for a `quick-win` task) and
create-agent-room's post-`init` "guidance corpus size" (a one-time
static count of scaffolded file bytes) are **not comparable to each
other**, even though both happen to use the same `chars/4` estimation
formula. The doc credits agentic-os with having done real, reproducible
measurement work here that create-agent-room hasn't, rather than
presenting the two numbers side by side as if they answered the same
question.
**Why:** the two metrics measure different things — cumulative token
cost across an entire task lifecycle (multiple phases, multiple reads,
skill loads) versus a single static snapshot of what gets written to
disk at `init` time. Presenting "agentic-os: 22K tokens" next to
"create-agent-room: ~6K tokens" without that caveat would look like
create-agent-room is 4x more token-efficient, which is not a claim this
project can actually support — it has no equivalent lifecycle
measurement tool at all. The request that produced this document was
explicit that a biased comparison would backfire with its technical
audience; a superficially favorable but methodologically unsound number
is exactly that.
**Rejected:** omitting agentic-os's token numbers entirely to avoid the
comparability problem — considered, but their benchmark is a genuine,
verifiable strength worth naming; the fix was caveating it correctly,
not hiding it.

### 2026-07-09 — verified action.yml's `@v1` usage example doesn't work yet before shipping the comparison doc

**Decision:** an early draft of `docs/comparisons.md` claimed
create-agent-room ships `action.yml` "for `uses:
sipandey/create-agent-room@v1`" as a strength versus agentic-os. Checked
`git tag -l` and `gh api repos/sipandey/create-agent-room/tags` before
finalizing the doc — no `v1` tag exists yet (only full semver tags:
`v1.2.1`, `v1.3.0`, `v1.3.1`). Corrected the doc to say the Action is
written/tested/documented but not yet tagged or published, with a
pointer to `ROADMAP.md` for the outstanding human step.
**Why:** the whole premise of this document is that its credibility
depends on being genuinely fair and fact-checked — shipping a claim
about our own tool that doesn't actually work yet would have been a
worse credibility failure than any bias toward create-agent-room in the
prose, and an easy one to make by describing the *intent* of a feature
(the Action exists and is designed for `@v1` pinning) instead of its
*current, verified state* (untagged, so that exact invocation fails
today).
**Avoid:** when a comparison document cites your own project's
capability, verify its current state the same way you'd verify a
competitor's claim — "I wrote the code for X" and "X works today for an
external user" are different facts, and it's easy to conflate them when
you're the one who wrote the code.

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
