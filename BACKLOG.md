# Architectural Backlog: create-agent-room

This document tracks all Epics, Stories, Acceptance Criteria, and implementation states for `create-agent-room` to ensure continuity across development sessions.

---

## Status Dashboard

| Epic | Story | Title | Status |
| :--- | :--- | :--- | :--- |
| **Epic 1: Shift-Left Certainty** | **1.1** | Pre-Stop Test & Build Verification Gate | ✅ **DONE** (`21f883e`) |
| | **1.2** | Workspace Stack Auto-Detection for Verification Commands | ✅ **DONE** |
| | **1.3** | `create-agent-room verify` Subcommand & Pre-Commit Verification Gate | ⏳ Queued |
| | **1.4** | Blast Radius & Scope Guardrails in `guardrails-check.js` | ⏳ Queued |
| **Epic 2: Friction-Free Adoption** | **2.1** | `create-agent-room doctor --fix` Auto-Remediation | ⏳ Queued |
| | **2.2** | Zero-Friction Governance Profiles (`--preset minimal\|standard\|strict`) | ⏳ Queued |
| | **2.3** | Unified Multi-Agent Sync (`create-agent-room sync --all`) | ⏳ Queued |
| **Epic 3: Enterprise Governance** | **3.1** | Session Telemetry & Governance Metrics Exporter | ✅ **DONE** |
| | **3.2** | PR Attestation & Verification Evidence Generator (`pr-desc --verify`) | ⏳ Queued |
| | **3.3** | Custom Adopter Compliance Eval Suites (`evals/custom/`) | ⏳ Queued |

---

## Epic 1: Shift-Left Certainty during Agent Execution

Enforce runtime determinism and mechanical gates so AI coding agents cannot declare tasks complete when code is untested, builds are broken, or boundaries are violated.

### Story 1.1: Pre-Stop Test & Build Verification Gate
- **Status:** ✅ **DONE** (Branch `feature/pre-stop-test-verification`, Commit `21f883e`)
- **Summary:**
  - Added automated test execution directly inside `close-the-loop-check.js` before Claude Code or Cursor completes an agent turn.
  - When non-scaffold files change, resolves `verification.testCommand` from `.agent-room.json` or CLI options.
  - If tests fail, returns exit code 2 (Claude) or `followup_message` JSON (Cursor) with bounded (~1,500 chars) failure logs.
  - Added `--test-command <cmd>` flag in `init` CLI.
  - Dogfooded in `.agent-room.json` with `"testCommand": "npm test"`.
  - Comprehensive unit test suite in `test/close-the-loop.test.js` (21 tests pass).

---

### Story 1.2: Workspace Stack Auto-Detection for Verification Commands
- **Status:** ✅ **DONE**
- **Summary:**
  - Added `detectTestCommand` discovering test runners for Node.js (`package.json` scripts, filtering dummy placeholders), Rust (`Cargo.toml`), Go (`go.mod`), Python (`pytest.ini`, `pyproject.toml`, test directories), Java/Kotlin (`gradlew`/`pom.xml`), and Makefiles (`test:` target).
  - Wired into `detectWorkspace` and `runInit` to auto-populate `verification.testCommand` without manual flags.
  - Added `--no-test-command` CLI flag to allow explicit opt-out.
  - Updated `computeEnforcedFeatures` to report the Pre-Stop test verification gate in post-init summary.
  - Comprehensive unit tests in `test/init.test.js` (50 tests pass).
- **Goal:**
  - Make test verification zero-configuration. When a developer runs `create-agent-room init` on any existing repository (Node, Python, Go, Rust, Java, etc.), automatically detect the existing test suite and populate `verification.testCommand` without requiring manual `--test-command` flags.
- **Acceptance Criteria:**
  1. `detectVerificationCommand(target, language, packageManager)` accurately discovers:
     - **Node / JS / TS:** Inspects `package.json` `scripts.test`. If defined and not the npm placeholder (`"echo \"Error: no test specified\" && exit 1"`), sets `<pm> test`.
     - **Rust:** Detects `Cargo.toml` -> `cargo test`.
     - **Go:** Detects `go.mod` -> `go test ./...`.
     - **Python:** Detects `pyproject.toml`, `pytest.ini`, `setup.cfg`, `requirements.txt` -> `pytest` / `poetry run pytest` / `pipenv run pytest`.
     - **Makefile:** If `Makefile` has a `test:` target -> `make test`.
  2. If user provides `--test-command <cmd>`, user's explicit command takes precedence.
  3. Interactive confirmation: When prompting in interactive mode, displays the detected command and asks to confirm.
  4. In `--yes` mode: Automatically applies detected test command if found.
  5. Scaffolding output: Displays pre-stop test verification under "What actually enforces something".
  6. Unit tests covering all detection heuristics in `test/init.test.js`.

---

### Story 1.3: `create-agent-room verify` Subcommand & Pre-Commit Verification Gate
- **Status:** ✅ **DONE**
- **Summary:**
  - Implemented standalone `create-agent-room verify [target]` subcommand (`lib/verify.js`) reading `.agent-room.json` (or auto-detecting test runner).
  - Supports `--format json` for CI/tooling, `--strict` (fail if unconfigured), `--timeout <ms>`, and `--output <path>`.
  - Added opt-in pre-commit verification gate in `guardrails-check.js` (`verifyOnCommit` in `guardrails.json` or `CAR_VERIFY_ON_COMMIT=1`), rejecting failing commits unless bypassed via `GUARDRAILS_BYPASS=1`.
  - Added 9 unit tests in `test/verify.test.js` and 4 new tests in `test/guardrails-check.test.js` (all 197 repo tests pass).
- **Goal:**
  - Add a first-class `create-agent-room verify [target]` CLI command and optional pre-commit hook integration that runs the configured verification suite standalone, outputting structured pass/fail results.
- **Acceptance Criteria:**
  1. `create-agent-room verify [target]` reads `.agent-room.json` and executes the configured test command.
  2. Exits 0 on test pass, exits 1 on test failure with trimmed error summary.
  3. Support `--timeout <ms>`, `--strict`, and `--format json`.
  4. Integration with `.agent-room/hooks/guardrails-check.js`: optionally verify tests pass prior to git commit when `verifyOnCommit` or `CAR_VERIFY_ON_COMMIT=1` is enabled.
  5. Tested across CLI runner and pre-commit hook suites.

---

### Story 1.4: Blast Radius & Scope Guardrails in `guardrails-check.js` & `close-the-loop-check.js`
- **Status:** ✅ **DONE**
- **Summary:**
  - Implemented active architectural boundary enforcement across both pre-commit (`guardrails-check.js`) and pre-stop turn gates (`close-the-loop-check.js`).
  - Supported `scopeBoundaries` in `.agent-room/guardrails.json` with `allowedPaths` (allowed directories) and `disallowedCrossBoundaries` (mutually exclusive boundary groups).
  - Supported per-session dynamic scope overrides via `CAR_ALLOWED_SCOPE` and emergency bypass via `CAR_SKIP_SCOPE_CHECK` / `--skip-scope`.
  - Added structured remediation guidance in `stderr` (Claude Code exit code 2) and `followup_message` JSON (Cursor), pointing to `.agent-room/coordination/scope-boundaries.md`.
  - Exempted governance and scaffold files (`.agent-room/**`, `docs/plans/`, `AGENTS.md`, `CLAUDE.md`, `.agent-room.json`) to allow required logging.
  - Added schema validation in `lib/checks.js`.
  - Comprehensive unit test coverage with 8 new tests in `test/close-the-loop.test.js`, 5 new tests in `test/guardrails-check.test.js`, and 1 new test in `test/validate.test.js` (all 211 repo tests pass).
- **Goal:**
  - Prevent agents from making changes across too many modules or violating architectural boundaries during a single session.
- **Acceptance Criteria:**
  1. Support `scopeBoundaries` in `.agent-room/guardrails.json` (allowed directories per task or forbidden cross-boundary edits).
  2. Block pre-commit and stop hooks if an agent attempts edits outside the declared boundary.
  3. Emit structured remediation guidance in `stderr` / `followup_message`.

---

## Epic 2: Friction-Free Adoption & Developer Ergonomics

Eliminate friction for developers adopting, upgrading, and maintaining `create-agent-room` across multi-agent setups.

### Story 2.1: `create-agent-room doctor --fix` Auto-Remediation
- **Status:** ✅ **DONE**
- **Summary:**
  - Implemented `create-agent-room doctor --fix` (`lib/doctor.js`, `bin/cli.js`).
  - Added `fixFindings(target)`:
    - Auto-heals and synchronizes drifted static hook files (`guardrails-check.js`, `close-the-loop-check.js`, `closing-the-loop-evidence.js`, `.git/hooks/pre-commit`) with current packaged templates.
    - Re-wires missing Claude Code Stop hook in `.claude/settings.json` when `claude` is listed in `.agent-room.json`.
    - Re-wires missing Cursor stop hook in `.cursor/hooks.json` when `cursor` is listed in `.agent-room.json`.
    - Restores missing `.git/hooks/pre-commit` when `git` is listed in `.agent-room.json` and sets chmod 0o755.
    - Re-pins outdated or `latest` CI action versions in `.github/workflows/agent-room-validate.yml` to the current installed version.
  - Added 5 new unit tests in `test/doctor.test.js` covering all remediation actions (all 216 repo tests pass).
- **Goal:**
  - Enable one-command repair of any findings identified by `create-agent-room doctor`.
- **Acceptance Criteria:**
  1. `doctor --fix` re-synchronizes drifted static hooks (`close-the-loop-check.js`, `guardrails-check.js`, etc.) with current packaged templates.
  2. Re-wires missing Claude (`.claude/settings.json`) or Cursor (`.cursor/hooks.json`) stop hooks if registered in `.agent-room.json`.
  3. Re-pins CI action versions to the installed CLI version.
  4. Confirms files touched; preserves custom overrides where marked.

---

### Story 2.2: Zero-Friction Governance Profiles (`--preset minimal|standard|strict`)
- **Status:** ✅ **DONE**
- **Summary:**
  - Implemented governance presets (`--preset minimal|standard|strict`) with `--profile` as an interchangeable alias (`bin/cli.js`, `lib/init.js`).
  - `--preset minimal`: Lightweight scaffold (AGENTS.md, guardrails, skills, stop hooks), skipping principles.md/workflow-classifier.md/coordination/ to minimize token overhead.
  - `--preset standard` (canonical name for legacy `full`): Scaffolds full guidance corpus and configures pre-stop test verification gate.
  - `--preset strict`: Scaffolds full guidance corpus, configures pre-commit test execution (`verifyOnCommit.strict: true`), architectural import boundaries (`importBoundaries`), strict waiver audits (min 40 chars, audit reference like `ticket: #123` / `approved-by: lead`, required `GUARDRAILS_BYPASS_REASON`), and tight scope guidance (10 files / 300 lines).
  - Added schema validation for `importBoundaries` in `lib/checks.js`.
  - Added 16 new unit tests across `cli.test.js`, `init.test.js`, `guardrails-check.test.js`, `close-the-loop.test.js`, and `validate.test.js` (total: 232 test cases, all passing).
- **Goal:**
  - Allow teams to choose governance strictness easily without manual JSON tweaking.
- **Acceptance Criteria:**
  1. `--preset minimal`: AGENTS.md, guardrails, skills, stop hooks (fastest, lightweight).
  2. `--preset standard`: Adds principles.md, test verification gate, workflow-classifier.
  3. `--preset strict`: Adds import boundary checks, pre-commit test execution, strict waiver audits.

---

### Story 2.3: Unified Multi-Agent Sync (`create-agent-room sync --all`)
- **Status:** ✅ **DONE**
- **Summary:**
  - Implemented `create-agent-room sync --all` (`lib/sync.js`, `bin/cli.js`), enabling simultaneous synchronization of skills and rules across Claude Code, Cursor, Windsurf, Cline, Codex, and GitHub Copilot in a single command.
  - Added GitHub Copilot (`copilot`) adapter support: created `templates/adapters/copilot-instructions.tmpl`, added `copilot` to `VALID_TOOLS`, `SIMPLE_TOOL_ADAPTERS`, and `RULES_SYNC_ADAPTERS`, scaffolding and synchronizing `.github/copilot-instructions.md`.
  - Added `sync --tools <list>` supporting selective multi-tool sync (e.g. `--tools cursor,copilot`).
  - Added workspace auto-detection in `sync`: automatically discovers existing tool rule files (`.windsurfrules`, `.clinerules`, `.codexrules`, `.github/copilot-instructions.md`, `.cursor/`, `.claude/`) and keeps them synchronized even when `tools` is not configured in `.agent-room.json`.
  - Added user-customization preservation in `sync`: automatically extracts and preserves custom rules inside marker blocks (`<!-- user-customizations-start -->` ... `<!-- user-customizations-end -->` or `<!-- user-customizations -->`) across skill additions and updates.
  - Idempotent execution: identical files report `up-to-date` without touching file modification timestamps or rewriting.
  - Added 8 new unit tests across `test/sync.test.js`, `test/init.test.js`, and `test/cli.test.js` (total: 240 test cases, 100% passing).
- **Goal:**
  - Single command that syncs `.agent-room/skills` and rules across Claude Code, Cursor, Windsurf, Cline, Codex, and GitHub Copilot simultaneously.
- **Acceptance Criteria:**
  1. Generates and updates adapter files for all tools detected in workspace or listed in `--tools` (or `--all`).
  2. Idempotent: does not clobber user-authored customizations.

> [!NOTE]
> **Epic 2: Friction-Free Adoption is now 100% COMPLETE!** (Story 2.1 ✅, Story 2.2 ✅, Story 2.3 ✅)


---

## Epic 3: Enterprise Governance, Telemetry & Compliance

Provide engineering leadership with transparency, metrics, and regression proof across all agent sessions.

### Story 3.1: Session Telemetry & Governance Metrics Exporter
- **Status:** ✅ **DONE**
- **Summary:**
  - Expanded `create-agent-room metrics` (`lib/metrics.js`, `bin/cli.js`) to aggregate session outcomes, classifications, agent distribution, files touched, test verification pass rates (`## Tests run` / `testsRun`), architectural decisions count and velocity (`.agent-room/decisions.md`), and auditable guardrail bypass records (`.agent-room/guardrails-bypass-log.md`).
  - Added `--format <text|json|csv|markdown>`: JSON and CSV for automated data ingestion, Markdown for executive KPI overview tables and governance audits.
  - Added `--output <file>`: direct report file writing with automatic parent directory creation.
  - Added comprehensive unit tests in `test/metrics.test.js` (9 tests pass; total repo tests: 247).
- **Goal:**
  - Export session metrics, bypass counts, and test verification outcomes for team dashboards.
- **Acceptance Criteria:**
  1. `create-agent-room metrics --format json|csv|markdown --output <file>`.
  2. Aggregates guardrail bypasses from `.agent-room/guardrails-bypass-log.md`, decision volume, and verification pass rates.

---

### Story 3.2: PR Attestation & Verification Evidence Generator (`pr-desc --verify`)
- **Status:** ⏳ Queued
- **Goal:**
  - Automatically incorporate test verification output and decision logs into PR descriptions.
- **Acceptance Criteria:**
  1. `create-agent-room pr-desc --with-verification` injects the test verification proof into the PR description markdown.
  2. Generates compliance checklist items for PR reviewers.

---

### Story 3.3: Custom Adopter Compliance Eval Suites (`evals/custom/`)
- **Status:** ⏳ Queued
- **Goal:**
  - Allow organizations to write repo-specific compliance evals executed by `create-agent-room eval`.
- **Acceptance Criteria:**
  1. Discovers and runs tests in `<repo>/.agent-room/evals/`.
  2. Reports combined compliance scores in CI.
