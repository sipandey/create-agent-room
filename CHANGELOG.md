# Changelog

All notable changes to `create-agent-room` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project uses [Semantic Versioning](https://semver.org/).

Releases before 1.2.1 predate this changelog. See `git log` and the tags
`v0.2.0`–`v1.2.1` for that history.

## [Unreleased]

### Added

- `create-agent-room doctor [target-dir]` — a read-only health check that
  works whether or not `init` has ever been run. On an unscaffolded
  directory, it detects the workspace and prints the `init` command to
  run. On an existing room, it reuses `validate`'s structural/schema
  checks and adds advisory-only ones: hook files (`pre-commit`,
  `guardrails-check.js`, `close-the-loop-check.js`) that have drifted
  from the currently installed CLI's templates, a scaffolded CI workflow
  pinned to a stale or `@latest` `create-agent-room` version, and
  `.agent-room.json` claiming a tool (`claude`, `git`) that isn't
  actually wired up on disk (e.g. the Stop hook or pre-commit hook is
  missing). Never writes to disk — the difference from `init --force` is
  that `doctor` only ever prints a suggested remediation command, it
  doesn't run one.

### Changed

- Extracted `collectFindings()` into a new `lib/checks.js`, pulled out of
  `lib/validate.js`'s `runValidate()`. `validate` is now a thin
  print/exit-code wrapper around it; `doctor` calls the same function so
  the two never drift out of sync on what counts as a structural error
  vs. a warning. No behavior change to `validate` itself.

## [2.0.1] - 2026-07-09

### Fixed

- `action.yml`'s `description` field (~340 characters, explaining what
  the Action checks and when to prefer the `init --tools git`-scaffolded
  workflow instead) exceeded the GitHub Marketplace listing form's
  125-character limit — only surfaced when actually clicking through
  "Publish this Action to the GitHub Marketplace" on the `v2.0.0` draft
  release, since nothing validates this locally. Shortened to a
  114-character summary; the fuller explanation moved to a code comment
  plus the existing `docs/github-action.md`/`README.md` coverage, which
  were never length-constrained. Logged in
  `.agent-room/anti-patterns.md`.

## [2.0.0] - 2026-07-09

**Why a major bump:** `init` now defaults to `--profile minimal` instead
of scaffolding the full guidance corpus — a change to default CLI
*behavior* (what gets written to disk with no flags passed), not just an
addition. Existing automation that assumed the old always-everything
default (e.g. a script asserting `principles.md` exists after a bare
`init`) will need `--profile full` to keep working unchanged. See
"Profiles: `minimal` vs `full`" in `README.md` and
`.agent-room/decisions.md` for the reasoning.

### Added

- `docs/comparisons.md`, linked from `README.md`: an honest comparison
  against hand-rolled Claude Code hooks (citing the "How to Safely Use
  AI Coding Agents in a Real Codebase" DIY approach), the direct
  competitor [agentic-os](https://github.com/KbWen/agentic-os), and a
  plain `AGENTS.md`/`CLAUDE.md` with no tooling — including where
  create-agent-room currently loses (agentic-os's evidence-gated phase
  sequencing and published lifecycle token benchmark are both genuinely
  more capable than anything this project has today). Competitor facts
  were fetched live via the GitHub API and the linked docs while writing
  it, dated, and marked `[VERIFY]` where not independently confirmable.
- `--version`/`-v` flag (and a `version` subcommand) to the CLI, printing
  the installed `create-agent-room` version and exiting. Previously
  there was no way to check this — `.github/ISSUE_TEMPLATE/bug_report.md`
  even had to tell reporters to run `--help` or check `package.json`
  directly as a workaround. Short-circuits in `main()` the same way
  `--help` already does, so it works regardless of position (e.g.
  `create-agent-room init --yes --version` still just prints the version).
- `action.yml`: a composite GitHub Action publishing `validate` and
  `lint-sessions` for repos that want the CI check without running
  `create-agent-room init` at all (checking out someone else's already-
  scaffolded repo, or a hand-scaffolded subdirectory). Inputs:
  `target-dir` (default `.`), `checks` (`both`/`validate`/`lint-sessions`,
  default `both`), `version` (pinned, default `2.0.0`, matching the same
  reproducibility reasoning as the scaffolded workflow's `{{CAR_VERSION}}`
  interpolation), and `node-version` (default `20`). An invalid `checks`
  value fails fast with a clear `::error::` annotation instead of silently
  skipping both checks. Deliberately does not run `actions/checkout`
  itself (the calling workflow's job, per composite-action convention)
  and is explicitly documented as an alternative to — not additive with —
  the workflow file `init --tools git` already scaffolds; see
  `docs/github-action.md` for the full input reference, examples, and
  when to use which. This release tags the rolling `v2` major version
  Marketplace consumers pin to (`sipandey/create-agent-room@v2`);
  whether it's actually *listed* on the Marketplace depends on a
  separate human step (GitHub's "Publish this Action" flow) tracked in
  `ROADMAP.md`. The "Release process" checklist in `AGENTS.md`/`CLAUDE.md`
  now includes bumping `action.yml`'s pinned version default alongside
  `package.json`'s, since composite actions can't read `package.json` at
  "compile" time and this is a second place the version now lives.
- `scripts/demo.sh` and `docs/demo.gif`: a ~17-second terminal recording
  embedded at the top of README.md showing the guardrails pre-commit hook
  actually blocking a staged fake AWS key (`AKIAIOSFODNN7EXAMPLE`, AWS's
  own documentation example key — never real), then the Claude Code Stop
  hook blocking an agent turn that changed files without logging a
  decision. `scripts/demo.sh` is real, unmocked output: it runs `init`
  and `git commit` for real inside a throwaway temp directory it creates
  and removes on exit (safe to re-run). The Stop hook segment invokes
  `.agent-room/hooks/close-the-loop-check.js` directly, since there's no
  way to trigger Claude Code's Stop hook *mechanism* from a plain shell
  script outside an actual agent turn — it's the same file Claude Code
  runs automatically, just invoked manually instead of by the harness.
  `docs/demo.tape` is the [VHS](https://github.com/charmbracelet/vhs)
  source used to regenerate the GIF (`vhs docs/demo.tape`).
- `SECURITY.md`: a standard vulnerability-disclosure process (private
  reporting via GitHub Security Advisories, expected response times,
  supported-versions policy). Previously listed as missing in
  `ROADMAP.md`'s "Now" section; removed from there now that it's done.
- `init` now prints a summary after "Scaffolding Complete!" that
  separates what was just scaffolded into 🟢 **Enforced (works
  automatically)** — the Claude Code Stop hook, guardrails pre-commit
  hook, and CI workflow, whichever are active based on the selected
  adapters — versus 🟡 **Guidance (requires reading)** — AGENTS.md,
  principles, skill packs, coordination docs. Also reports an
  approximate token footprint of the guidance-tier corpus (chars/4 over
  AGENTS.md + `.agent-room/**`, excluding `hooks/` and `sessions/`,
  explicitly labeled as approximate) and names the single next command
  to run (commit, if the guardrails hook is active; `validate .`
  otherwise). Previously a first-time user had no way to tell which of
  the ~20 scaffolded files actually enforce anything versus which are
  advisory markdown.
- `init --dry-run`: prints exactly what `init` would create/skip, in the
  same format as a real run (including the enforced/guidance summary
  above), without writing anything to disk. `git init`/`git commit` are
  simulated, not actually run. Implemented by threading a `dryRun` option
  through `copyFile`/`copyDirInherited`/`copyFileInherited` in
  `lib/fsutil.js` (same pattern as the existing `force` option) — it
  still renders template content and returns the same `{ path, written }`
  result shape `reportResults()` expects, it just skips the actual
  `fs.writeFileSync`.
- `init --profile <minimal|full>` (default: `minimal`): controls how much
  of the guidance corpus gets scaffolded. `minimal` ships `AGENTS.md`
  (trimmed), `guardrails.md`/`guardrails.json`, the base skills, and the
  Stop/pre-commit hooks (when applicable) — `principles.md`,
  `workflow-classifier.md`, `coordination/`, and skill packs are skipped
  unless `--skill-packs` is passed explicitly. `full` restores the
  previous default (everything). This default is deliberately
  opinionated: per Gloaguen et al. 2026 (ETH Zurich), verbose LLM-facing
  context files measurably reduce agent performance and increase token
  cost relative to minimal ones. `lib/validate.js` now reads the
  `profile` recorded in `.agent-room.json` and only requires
  `principles.md`/`workflow-classifier.md`/`coordination/` under `full`
  — otherwise a freshly-scaffolded default room would fail its own
  `validate` command (and CI) for correctly not having files it never
  claimed to scaffold. A room with no `.agent-room.json` (or an
  unreadable one) is treated as `full` for backward compatibility with
  rooms scaffolded before this existed.

### Changed

- The scaffolded `.github/workflows/agent-room-validate.yml` pinned
  `npx --yes create-agent-room@latest validate/lint-sessions` to
  `@latest`, meaning the same commit could pass CI one week and fail the
  next with no version reproducibility. `init` now interpolates a
  `{{CAR_VERSION}}` template var resolved from this package's own
  `package.json` at scaffold time, so generated workflows pin to the
  exact version that scaffolded them, with a comment explaining how to
  bump it (`init --force` again, or hand-edit the version).
- The scaffolded git `pre-commit` hook enforced closing-the-loop
  discipline (blocking any commit that touched non-scaffold files
  without also updating `.agent-room/anti-patterns.md` or
  `decisions.md`) for *every* commit — human or agent. Field consensus
  on agent guardrails is that a heavy local commit-time gate like this
  teaches people to reach for `git commit --no-verify`, which then also
  bypasses the guardrails-check.js run in the same hook — the actually
  security-relevant check. `pre-commit.tmpl` now only runs
  `guardrails-check.js`; closing-the-loop enforcement stays exactly
  where it already correctly lived, the Claude Code Stop hook
  (`.agent-room/hooks/close-the-loop-check.js`, wired via
  `installCloseTheLoopHook`), which is scoped to agent sessions and
  doesn't share a hook with guardrails. `README.md`/`CAPABILITIES.md`
  updated to describe closing-the-loop enforcement as Claude-agent-scoped
  rather than a universal commit gate.

### Fixed

- CI failed (though the same tests passed locally) on the genesis-commit
  regression test in `test/init.test.js`: a fresh CI runner has no git
  identity configured at all, so the real `git commit` inside
  `runInit({ git: true })` failed with "please tell me who you are,"
  leaving files staged but never committed. Fixed by setting
  `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL`
  once at the top of the test file (git honors these for every
  invocation in the process, including ones nested inside code under
  test), rather than depending on the runner's ambient `~/.gitconfig`
  existing — the same class of test-environment dependency
  `test/guardrails-check.test.js`'s `makeRepo()` helper already avoided
  by configuring a local identity per repo.
- `init --tools git --git` scaffolds `.github/workflows/agent-room-validate.yml`,
  but the default `.agent-room/guardrails.json` protects `.github/workflows/**`
  — so the tool's own initial commit was rejected by the pre-commit hook it
  had just installed. `guardrails-check.js` now exempts protected-path
  enforcement on a repository's very first commit only (detected via
  `git rev-parse --verify HEAD` having no prior `HEAD`), since there's
  nothing yet to protect a change *against* — the forbidden-pattern/secret
  scan still applies to that commit. `gitInit()` in `lib/init.js` also now
  captures the real `git commit` stderr instead of collapsing every failure
  into a generic "skipped" message, and calls out guardrails-blocked
  failures explicitly with the `GUARDRAILS_BYPASS=1` escape hatch.
- `guardrails-check.js` failed *open* (`process.exit(0)`, allowing the
  commit) when `.agent-room/guardrails.json` failed to parse, silently
  disabling all guardrail enforcement on a corrupted config. It now fails
  closed (`exit 1`) with a clear error, still overridable via
  `GUARDRAILS_BYPASS=1`.
- The default `guardrails.json`'s `forbiddenActions` list was plain English
  prose (e.g. describing what not to do), which the pre-commit content scan
  matched as a literal substring — meaning it would essentially never match
  real staged code, so a genuinely risky credential could be staged and
  committed without the hook noticing. `forbiddenActions` entries are now
  explicit `{ "pattern", "type": "regex" | "literal", "description" }`
  objects, and the default template ships working detection rules (AWS
  access key IDs, private key file headers, Slack/GitHub token formats, a
  generic hardcoded-API-key assignment pattern) instead of prose
  placeholders. The old flat-string entries are still accepted by the hook
  for backward compatibility (inferring regex-vs-literal the previous
  best-effort way) but `validate` now warns on them, since they carry no
  real detection pattern. The human-facing prose intents (deploy-to-prod,
  auth-middleware review, etc.) moved to `guardrails.md`, which was always
  meant to be read rather than pattern-matched. `lib/validate.js` and
  `CAPABILITIES.md`/`README.md` were updated to describe the new schema.
- The default `protectedPaths` list didn't cover the guardrails machinery
  itself — `.agent-room/guardrails.json`, `.agent-room/guardrails.md`,
  `.agent-room/hooks/**`, and `.claude/settings.json` could be edited or
  deleted in the same diff as an unrelated change with nothing blocking
  it. These four paths are now in the default `protectedPaths` array. This
  is independent of (and doesn't reopen) the existing
  `guardrailsSelfPaths` content-scan exemption from 1.3.1: that exemption
  only stops `guardrails.json`/`guardrails.md` from self-triggering the
  forbidden-*pattern* scan because they legitimately quote those patterns
  as data; it says nothing about whether the files may be staged at all.
  Path protection and content-scan exemption are orthogonal checks and now
  both hold at once — a commit editing `guardrails.json` is blocked as a
  protected-path violation regardless of what changed inside it, while its
  *content* still isn't flagged as containing a forbidden pattern for
  merely defining one. The existing genesis-commit exemption (also from
  this cycle) covers these new paths automatically, since `init --git`
  creates them in the same first commit as everything else. **Known
  limitation at the time this was written, since fixed by the entry
  below:** the hook evaluated `protectedPaths` against the version of
  `guardrails.json` being committed, so a single commit that edited
  `guardrails.json` *and* stripped its own path out of `protectedPaths`
  in that same edit wasn't caught.
- `guardrails-check.js` evaluated `protectedPaths` against the version of
  `guardrails.json` being committed, not the previous (HEAD) version, so a
  commit that both edited `guardrails.json` and removed its own path from
  `protectedPaths` in the same edit was not caught — the newly-weakened
  rules approved themselves. When `guardrails.json` is staged, the hook now
  also compares against `git show HEAD:.agent-room/guardrails.json`: if
  HEAD's `protectedPaths` protected the file but the staged version no
  longer does, the commit is still blocked. Handles the genesis commit (no
  HEAD) and an unparseable HEAD copy without crashing. This still only
  covers `guardrails.json`'s own protected-path entry being removed — see
  the "Known limitation" note in `CAPABILITIES.md`.

### Docs

- README usage examples now lead with `npx create-agent-room ...` (the
  package is confirmed published as of 1.3.1) instead of the stale "once
  published to npm" framing; `node bin/cli.js` is now documented as the
  from-source alternative for contributors. Added npm-version and CI
  badges.

## [1.3.1] - 2026-07-09

### Fixed

- Shell injection in `guardrails-check.js` and `sync.js`: both built shell
  commands via string-interpolated `execSync` calls, letting a crafted
  filename (e.g. from a remote `--skill-packs <git-url>`, or a staged file
  in the working tree) execute arbitrary commands. Both now use
  `execFileSync` with argument arrays.
- `session-utils.js` computed its session-log output directory once at
  module load instead of per call, so it silently wrote to whichever `cwd`
  was active when the module was first `require`d — including polluting
  this repo's own `.agent-room/sessions/` on every test run.
- The guardrails forbidden-pattern scanner self-triggered on
  `.agent-room/guardrails.json`/`guardrails.md`, which legitimately quote
  the forbidden phrases as configuration data. Both files are now exempt
  from the content scan; protected-path and real-content checks are
  unaffected.
- `package-lock.json` was several releases stale relative to
  `package.json` (`0.1.0`/`node >=14` vs. `1.3.0`/`node >=18`).

### Added

- Regression test (`test/package.test.js`) asserting the published npm
  package never includes this repo's own dogfooded `.agent-room/`,
  `.claude/`, `.github/`, `AGENTS.md`, or `CLAUDE.md` — those exist to
  test and improve the CLI itself, not for consumers of the package.
- "Release process" section in `AGENTS.md`/`CLAUDE.md`.
- This repo now runs `create-agent-room` on itself (dogfooding): `AGENTS.md`,
  `.agent-room/`, `.claude/`, a pre-commit guardrails hook, and the
  `agent-room-validate` CI workflow.
- `ROADMAP.md`, `CHANGELOG.md`, and GitHub issue templates
  (`.github/ISSUE_TEMPLATE/`).

### Removed

- Four committed test-log files left over from the `session-utils.js`
  bug above (real fix; these were downstream evidence, not a separate
  issue).

## [1.3.0] - 2026-07-08

### Added

- CI enforcement by default: the `git` adapter now scaffolds
  `.github/workflows/agent-room-validate.yml`, running
  `create-agent-room validate` and `create-agent-room lint-sessions` on
  every push and pull request. Previously these commands existed but were
  never wired into CI automatically, so session logs and guardrails
  schema could silently drift out of compliance.
- No new flags required — rides on the existing `--tools git` selection
  (or git auto-detection), consistent with the pre-commit guardrails hook
  already installed there.

### Docs

- `CAPABILITIES.md` and `README.md` updated to reflect that CI validation
  now ships automatically with the git adapter.

### Tests

- Coverage asserting the CI workflow file is scaffolded and references
  both `validate` and `lint-sessions`.

## [1.2.1] - 2026-07-08

### Added

- Guardrails enforcement pre-commit hook (opt-in via `--tools git`):
  blocks commits that touch protected paths or match forbidden-action
  patterns in `guardrails.json`. Escape hatch via `GUARDRAILS_BYPASS=1`.
- `lint-sessions` command: validates session logs in
  `.agent-room/sessions/` against the required schema (Date, Agent,
  Classification, Goal, Files touched, Actions taken, Tests run,
  Decisions, Outcome). CI-friendly, exits non-zero on malformed logs.
- Stack-specific templates: `templates/stacks/{python,typescript,react}/`
  with stack-specific `AGENTS.md.tmpl` and skill files.
- Codex adapter (`templates/adapters/codexrules.tmpl`), completing
  tool-adapter coverage for the tools already listed in `VALID_TOOLS`.
- Session utils API: structured helpers for writing session logs
  programmatically instead of hand-authoring markdown.

### Fixed

- ESLint errors (invalid `\Z` regex escape, unused variables).

### Docs

- Clarified in README/CAPABILITIES.md which features are prescriptive
  guidance vs. actively enforced, and which require human discipline to
  follow (workflow classifier, most skill packs).

### Housekeeping

- `package.json` now includes `repository`, `homepage`, `bugs`,
  `keywords`, and `author` metadata for npm.

[Unreleased]: https://github.com/sipandey/create-agent-room/compare/v2.0.1...HEAD
[2.0.1]: https://github.com/sipandey/create-agent-room/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/sipandey/create-agent-room/compare/v1.3.1...v2.0.0
[1.3.1]: https://github.com/sipandey/create-agent-room/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/sipandey/create-agent-room/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/sipandey/create-agent-room/releases/tag/v1.2.1
