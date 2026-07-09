# Changelog

All notable changes to `create-agent-room` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project uses [Semantic Versioning](https://semver.org/).

Releases before 1.2.1 predate this changelog. See `git log` and the tags
`v0.2.0`–`v1.2.1` for that history.

## [Unreleased]

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

[Unreleased]: https://github.com/sipandey/create-agent-room/compare/v1.3.1...HEAD
[1.3.1]: https://github.com/sipandey/create-agent-room/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/sipandey/create-agent-room/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/sipandey/create-agent-room/releases/tag/v1.2.1
