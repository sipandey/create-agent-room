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
| **Epic 3: Enterprise Governance** | **3.1** | Session Telemetry & Governance Metrics Exporter | ⏳ Queued |
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
- **Status:** ⏳ Queued
- **Goal:**
  - Add a first-class `create-agent-room verify [target]` CLI command and optional pre-commit hook integration that runs the configured verification suite standalone, outputting structured pass/fail results.
- **Acceptance Criteria:**
  1. `create-agent-room verify [target]` reads `.agent-room.json` and executes the configured test command.
  2. Exits 0 on test pass, exits 1 on test failure with trimmed error summary.
  3. Support `--timeout <ms>` and `--bail`.
  4. Integration with `.agent-room/hooks/guardrails-check.js` or `.git/hooks/pre-commit`: optionally verify tests pass prior to git commit when `--verify-on-commit` is enabled.
  5. Evaluated in `create-agent-room eval` compliance suite.

---

### Story 1.4: Blast Radius & Scope Guardrails in `guardrails-check.js`
- **Status:** ⏳ Queued
- **Goal:**
  - Prevent agents from making changes across too many modules or violating architectural boundaries during a single session.
- **Acceptance Criteria:**
  1. Support `scopeBoundaries` in `.agent-room/guardrails.json` (e.g. allowed directories per task or forbidden cross-boundary edits).
  2. Block pre-commit and stop hooks if an agent attempts edits outside the declared boundary.
  3. Emit structured remediation guidance in `stderr` / `followup_message`.

---

## Epic 2: Friction-Free Adoption & Developer Ergonomics

Eliminate friction for developers adopting, upgrading, and maintaining `create-agent-room` across multi-agent setups.

### Story 2.1: `create-agent-room doctor --fix` Auto-Remediation
- **Status:** ⏳ Queued
- **Goal:**
  - Enable one-command repair of any findings identified by `create-agent-room doctor`.
- **Acceptance Criteria:**
  1. `doctor --fix` re-synchronizes drifted static hooks (`close-the-loop-check.js`, `guardrails-check.js`, etc.) with current packaged templates.
  2. Re-wires missing Claude (`.claude/settings.json`) or Cursor (`.cursor/hooks.json`) stop hooks if registered in `.agent-room.json`.
  3. Re-pins CI action versions to the installed CLI version.
  4. Prompts or confirms files touched; preserves custom overrides where marked.

---

### Story 2.2: Zero-Friction Governance Profiles (`--preset minimal|standard|strict`)
- **Status:** ⏳ Queued
- **Goal:**
  - Allow teams to choose governance strictness easily without manual JSON tweaking.
- **Acceptance Criteria:**
  1. `--preset minimal`: AGENTS.md, guardrails, skills, stop hooks (fastest, lightweight).
  2. `--preset standard`: Adds principles.md, test verification gate, workflow-classifier.
  3. `--preset strict`: Adds import boundary checks, pre-commit test execution, strict waiver audits.

---

### Story 2.3: Unified Multi-Agent Sync (`create-agent-room sync --all`)
- **Status:** ⏳ Queued
- **Goal:**
  - Single command that syncs `.agent-room/skills` and rules across Claude Code, Cursor, Windsurf, Cline, Codex, and GitHub Copilot simultaneously.
- **Acceptance Criteria:**
  1. Generates and updates adapter files for all tools detected in workspace or listed in `--tools`.
  2. Idempotent: does not clobber user-authored customizations.

---

## Epic 3: Enterprise Governance, Telemetry & Compliance

Provide engineering leadership with transparency, metrics, and regression proof across all agent sessions.

### Story 3.1: Session Telemetry & Governance Metrics Exporter
- **Status:** ⏳ Queued
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
