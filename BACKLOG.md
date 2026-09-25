# Architectural Backlog: create-agent-room

This document tracks all Epics, Stories, Acceptance Criteria, and implementation states for `create-agent-room` to ensure continuity across development sessions.

---

## Status Dashboard

| Epic | Story | Title | Status |
| :--- | :--- | :--- | :--- |
| **Epic 1: Shift-Left Certainty** | **1.1** | Pre-Stop Test & Build Verification Gate | ✅ **DONE** (`21f883e`) |
| | **1.2** | Workspace Stack Auto-Detection for Verification Commands | ✅ **DONE** (`9cb6f0f`) |
| | **1.3** | `create-agent-room verify` Subcommand & Pre-Commit Verification Gate | ✅ **DONE** (`71711cf`) |
| | **1.4** | Blast Radius & Scope Guardrails in `guardrails-check.js` | ✅ **DONE** (`537708d`) |
| **Epic 2: Friction-Free Adoption** | **2.1** | `create-agent-room doctor --fix` Auto-Remediation | ✅ **DONE** (`b1ef503`) |
| | **2.2** | Zero-Friction Governance Profiles (`--preset minimal\|standard\|strict`) | ✅ **DONE** (`d102189`) |
| | **2.3** | Unified Multi-Agent Sync (`create-agent-room sync --all`) | ✅ **DONE** (`dd82354`) |
| **Epic 3: Enterprise Governance** | **3.1** | Session Telemetry & Governance Metrics Exporter | ✅ **DONE** (`0d8149c`) |
| | **3.2** | PR Attestation & Verification Evidence Generator (`pr-desc --verify`) | ✅ **DONE** (`fbca05d`) |
| | **3.3** | Custom Adopter Compliance Eval Suites (`evals/custom/`) | ✅ **DONE** (`7bda42e`) |
| **Epic 4: Active Defense & Lifecycle** | **4.1** | Comprehensive Guardrails Rule-Weakening & Anti-Tamper Gate | ✅ **DONE** (`f6871c1`) |
| | **4.2** | Automated Session Logging & Handoff CLI (`create-agent-room session`) | ✅ **DONE** (`89097a6`) |
| | **4.3** | Dynamic Skill Pack Management (`create-agent-room skill [list\|add\|remove]`) | ✅ **DONE** (`6eb2fac`) |
| **Epic 5: Enterprise CI/CD Governance** | **5.1** | `create-agent-room ci` Unified Headless CI Runner | ✅ **DONE** (`7181329`) |
| | **5.2** | Remote PR Anti-Tamper & Bypass Audit Gate (`ci --base`) | ✅ **DONE** (`5427172`) |
| | **5.3** | Automated PR Compliance Reporter & GitHub Action | ✅ **DONE** (`13cae8f`) |
| **Epic 6: Ambient Git & Invisible Governance** | **6.1** | Git Hook Manager CLI (`create-agent-room hook [install\|status\|uninstall]`) | 🟡 **IN PROGRESS** |
| | **6.2** | Pre-Push Local CI Gate (`pre-push` -> `create-agent-room ci`) | 📋 Ready |
| | **6.3** | Ambient Session Tracking & Auto-Handoff (`post-commit` -> auto session) | 📋 Ready |
| | **6.4** | Cross-Branch Auto-Sync & Drift Healing (`post-checkout` & `post-merge`) | 📋 Ready |
| **Epic 7: Lightweight Terminal UI & Observability Dashboard** | **7.1** | Interactive Room Dashboard (`create-agent-room ui` / `dashboard`) | 📋 Ready |
| | **7.2** | Live Session & Handoff Inspector (`create-agent-room session --watch`) | 📋 Ready |
| | **7.3** | Interactive Governance Switcher & Skill Explorer (`create-agent-room configure`) | 📋 Ready |
| **Epic 8: Centralized Policy Distribution & Monorepo Governance** | **8.1** | Remote Policy Distribution & Corporate Governance Presets (`init --preset https://...`) | 📋 Ready |
| | **8.2** | Monorepo Multi-Package Boundary Enforcement (nested `.agent-room` scopes) | 📋 Ready |
| | **8.3** | Centralized Compliance Drift & Remote Policy Synchronizer (`doctor --upstream`) | 📋 Ready |

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
- **Status:** ✅ **DONE**
- **Summary:**
  - Added `--verify` (alias `--with-verification`) to `create-agent-room pr-desc` (`lib/pr.js`, `bin/cli.js`), automatically executing `verifyProject` and embedding verification attestation proofs with execution status, exit code, duration, ISO timestamp, and collapsible test output.
  - Implemented `generateComplianceChecklist` pre-populating an interactive markdown checklist verifying automated test results, architectural documentation, scope containment, and session log recording.
  - Implemented guardrail compliance attestation checking `.agent-room/guardrails-bypass-log.md` and decisions linking from `.agent-room/decisions.md`.
  - Added `--output <file>` option to write generated PR descriptions to custom destination paths.
  - Added `--strict` exit code 1 handling on test failure under `--verify`.
  - Added 6 new unit tests in `test/pr.test.js` and 1 in `test/cli.test.js` (total repo tests: 253).
- **Goal:**
  - Automatically incorporate test verification output and decision logs into PR descriptions.
- **Acceptance Criteria:**
  1. `create-agent-room pr-desc --with-verification` injects the test verification proof into the PR description markdown.
  2. Generates compliance checklist items for PR reviewers.

---

### Story 3.3: Custom Adopter Compliance Eval Suites (`evals/custom/`)
- **Status:** ✅ **DONE** (Branch `feature/custom-compliance-eval-suites`)
- **Summary:**
  - Expanded `create-agent-room eval` (`lib/eval.js`, `bin/cli.js`) to discover and execute repo-specific custom compliance eval suites from `<target>/.agent-room/evals/`, `<target>/evals/custom/`, and `--evals-dir <dir>` / `--custom-evals <dir>`.
  - Supports both standalone `*.eval.json` files and fixture subdirectories containing `eval.json`.
  - Extended evaluation with new case types: `verify` (executing project test suite via `verifyProject`) and `command` (running arbitrary shell assertions with exit code inspection).
  - Added granular execution controls: `--custom-only` to run only custom adopter suites, `--builtin-only` to run only built-in compliance evals, and default combined execution.
  - Multi-format compliance reports (`text`, `json`, `csv`) report unified pass/fail totals alongside a distinct `summary.builtin` and `summary.custom` breakdown.
  - Added 7 new unit tests in `test/eval.test.js` and 2 in `test/cli.test.js` (total repo tests: 255 passing).
- **Goal:**
  - Allow organizations to write repo-specific compliance evals executed by `create-agent-room eval`.
- **Acceptance Criteria:**
  1. Discovers and runs tests in `<repo>/.agent-room/evals/`.
  2. Reports combined compliance scores in CI.

> [!NOTE]
> **Epic 3: Enterprise Governance, Telemetry & Compliance is now 100% COMPLETE!** (Story 3.1 ✅, Story 3.2 ✅, Story 3.3 ✅)

---

## Epic 4: Active Defense & Lifecycle Management

Eliminate silent governance bypasses and streamline agent session lifecycle management across repositories.

### Story 4.1: Comprehensive Guardrails Rule-Weakening & Anti-Tamper Gate
- **Status:** ✅ **DONE** (Branch `feature/guardrails-anti-tamper-weakening-gate`)
- **Summary:**
  - Implemented comprehensive anti-tamper and rule-weakening detection in `templates/adapters/git-hooks/guardrails-check.js` and `.agent-room/hooks/guardrails-check.js`.
  - Mechanically compares staged `guardrails.json` against `HEAD:.agent-room/guardrails.json` across all active rule categories:
    - Protected paths: blocks commits dropping or narrowing any `protectedPaths` entry, including self-weakening.
    - Forbidden patterns: blocks commits removing secret/credential scanning patterns from `forbiddenActions` or downgrading regex patterns to literals.
    - Scope guidance: blocks commits increasing `maxFilesPerChange` / `maxLinesPerChange` or removing scope limits.
    - Import boundaries: blocks commits removing source boundaries or dropping disallowed module patterns.
    - Scope boundaries: blocks commits removing `allowedPaths` or weakening `disallowedCrossBoundaries` isolation groups.
    - Verification gate: blocks commits disabling or removing `verifyOnCommit` or `verifyOnCommit.strict`.
    - Strict waivers: blocks commits disabling `strictWaivers`.
    - Anti-tamper deletion: blocks commits that delete `.agent-room/guardrails.json` entirely.
  - Commits that strengthen or preserve rules proceed cleanly without requiring bypass.
  - Any rule weakening requires `GUARDRAILS_BYPASS=1` with an auditable justification logged to `.agent-room/guardrails-bypass-log.md`.
  - Updated `CAPABILITIES.md` to remove the documented security limitation.
  - Added 11 new comprehensive unit tests in `test/guardrails-check.test.js` (all 272 repo tests pass).
- **Goal:**
  - Eliminate the documented limitation in `CAPABILITIES.md`: mechanically prevent any commit from weakening, dropping, or loosening existing guardrail rules relative to `HEAD`.
- **Acceptance Criteria:**
  1. Detects dropped paths from `protectedPaths`.
  2. Detects dropped patterns from `forbiddenActions`.
  3. Detects loosened `scopeGuidance` (`maxFilesPerChange`, `maxLinesPerChange`).
  4. Detects dropped or weakened `importBoundaries` and `scopeBoundaries`.
  5. Detects disabling or deletion of `verifyOnCommit`.
  6. Allows clean commits that strengthen or preserve rules.
  7. Requires `GUARDRAILS_BYPASS=1` with logged audit justification to bypass.

---

### Story 4.2: Automated Session Logging & Handoff CLI (`create-agent-room session`)
- **Status:** ✅ **DONE** (Branch `feature/automated-session-logging-cli`)
- **Summary:**
  - Implemented `createSession` and `runSessionCli` in `lib/session.js` and wired `session` command into `bin/cli.js`.
  - Auto-captures session environment: date/time, branch name, Git user author or `CAR_AGENT`/`AGENT_NAME`, and sanitized topic slug.
  - `--record` mode: automatically inspects `git status --porcelain` (Files touched), extracts recent Git commits (Actions taken), links recent architectural decisions from `.agent-room/decisions.md` (Decisions made), and runs `verifyProject` to capture test command and outcome (Tests run).
  - Flexible CLI parameters: `--goal`, `--classification`, `--status`, `--agent`, `--handoff`, `--output <file>`, `--dry-run`, and `--json`.
  - Updated `lib/lint-sessions.js` regex to tolerate standard markdown list spacing (`-\s*(Read|Created|Modified):`).
  - 100% compliant out of the box: every generated markdown or JSON session passes `validateMarkdownSession` and `validateJSONSession` with 0 errors and 0 warnings.
  - Added 9 unit/integration tests in `test/session.test.js` and 3 parser tests in `test/cli.test.js` (all 284 repo tests pass).
- **Goal:**
  - Provide a CLI subcommand to scaffold compliant session logs (`--new <name>`), capture git diff / tests outcome (`--record`), and validate formatting against `session-log-format.md`.
- **Acceptance Criteria:**
  1. `create-agent-room session <name>` creates a properly formatted session log under `.agent-room/sessions/`.
  2. Auto-populates date, author, branch, summary, and verification outcome.
  3. Passes `create-agent-room lint-sessions` out of the box.

---

### Story 4.3: Dynamic Skill Pack Management (`create-agent-room skill [list|add|remove]`)
- **Status:** ✅ **DONE** (Merged into `main` via PR #15, Commit `6eb2fac`)
- **Summary:**
  - Implemented `lib/skill.js` with `listSkillPacks`, `addSkillPacks`, `removeSkillPacks`, and `runSkillCli`.
  - Added support for 9 built-in packs (`testing`, `security`, `release`, `code-review`, `api-design`, `database`, `performance`, `observability`, `documentation`), remote Git repositories (`git+...`, `https://...`), and local directory paths.
  - Subcommands:
    - `skill list` / `ls` / `status`: displays installed, available built-in, and custom workspace skills, with `--format json` / `--json` support.
    - `skill add` / `install`: copies skill templates into `.agent-room/skills/`, updates `skillPacks` in `.agent-room.json`, and triggers automatic `sync --all` across all tool adapters.
    - `skill remove` / `rm` / `uninstall`: deletes skill files, updates `.agent-room.json`, cleans up orphaned Claude skills in `.claude/skills/`, and re-syncs all tool adapters.
  - Added `--no-sync` flag to skip auto-syncing during batch workflows or offline execution.
  - Updated `lib/sync.js` to automatically detect and purge orphaned mirrored skills from `.claude/skills/`.
  - Added 11 unit/integration tests in `test/skill.test.js` and updated `test/cli.test.js` (all 296 repo tests pass).
- **Goal:**
  - Manage built-in and remote/local skill packs post-init, automatically syncing to Claude, Cursor, Windsurf, Cline, Codex, and GitHub Copilot.
- **Acceptance Criteria:**
  1. `create-agent-room skill list` shows installed and available skill packs.
  2. `create-agent-room skill add <pack>` installs and automatically runs `sync --all`.
  3. Preserves user customizations during skill additions.

---

> [!NOTE]
> **Epic 4: Active Defense & Lifecycle Management is now 100% COMPLETE!** (Story 4.1 ✅, Story 4.2 ✅, Story 4.3 ✅)

---

## Epic 5: Enterprise CI/CD Governance & Pull Request Gate

Close the "local-only" enforcement gap by transforming `create-agent-room` into a zero-friction, headless CI/CD policy gate for pull requests in GitHub Actions, GitLab CI, CircleCI, and automated agent pipelines.

### Story 5.1: `create-agent-room ci` Unified Headless CI Runner
- **Status:** ✅ **DONE** (Merged into `main` via PR #16, Commit `7181329`)
- **Summary:**
  - Build `create-agent-room ci [target] [options]` in `lib/ci.js` and `bin/cli.js`.
  - Orchestrates all 5 room governance dimensions in a single invocation:
    1. `validate`: Repository structure and guardrails schema integrity (`collectFindings`).
    2. `doctor`: Static hook sync and drift detection (`getFindings`).
    3. `lint-sessions`: Session log compliance against `session-log-format.md` (`lintSessions`).
    4. `verify`: Automated code verification test suite (`verifyProject`).
    5. `eval`: Built-in and custom compliance eval suites (`runEval`).
  - Flags and options:
    - `--format <text|json|markdown>`: Formatted terminal tables (default), machine-readable JSON, or GitHub Flavored Markdown.
    - `--output <file>`: Write report to disk.
    - `--summary`: Write or append Markdown report to `$GITHUB_STEP_SUMMARY` in GitHub Actions.
    - `--strict`: Enforce strict checks across all phases (e.g. failing if tests are not configured in `verify`).
    - Selective execution: `--skip-verify`, `--skip-doctor`, `--skip-eval`, `--skip-sessions`, `--skip-validate`, or `--only-<check>`.
  - Exit codes: `0` when all enabled checks pass; `1` when any enabled check fails.
- **Goal:**
  - Provide a single, deterministic command for CI pipelines that replaces disparate manual steps and delivers unified compliance reporting.
- **Acceptance Criteria:**
  1. `create-agent-room ci` executes enabled checks, reports per-stage durations, and returns `0` on clean rooms.
  2. Any failure in `validate`, `doctor`, `lint-sessions`, `verify`, or `eval` sets exit code `1` and details failures clearly.
  3. Supports `--format json`, `--format markdown`, `--output <path>`, and `--skip-*` options.

---

### Story 5.2: Remote PR Anti-Tamper & Bypass Audit Gate (`create-agent-room ci --base <ref>`)
- **Status:** ✅ **DONE** (Merged into `main` via PR #17, Commit `5427172`)
- **Goal:**
  - Mechanically evaluate the complete pull request diff against the target branch (`--base origin/main` or `GITHUB_BASE_REF`).
  - Detect unauthorized rule weakening or guardrails deletion across the branch history.
  - Enforce that any rule bypass is accompanied by an authorized bypass record with ticket reference.
  - Verify that changes touching non-scaffold files contain a corresponding valid `.agent-room/sessions/` log.
- **Acceptance Criteria:**
  1. Detects rule loosening against the base branch across multiple commits.
  2. Enforces presence of session log for feature/bugfix branches.
  3. Fails CI if unapproved bypasses are present in the PR.

### Story 5.3: Automated PR Compliance Reporter & GitHub Action (`agent-room-action`)
- **Status:** ✅ **DONE** (Merged into `main` via PR #18, Commit `13cae8f`)
- **Summary:**
  - Implemented zero-dependency `lib/pr-comment.js` using Node.js 18+ standard library global `fetch`.
  - Automatically posts and updates sticky PR compliance scorecards in-place via marker `<!-- agent-room-pr-comment -->`, preventing comment notification churn.
  - Automatically resolves PR context from CLI flags (`--github-token`, `--pr`), GitHub Actions event files (`GITHUB_EVENT_PATH`, `GITHUB_REPOSITORY`), GitLab CI (`CI_MERGE_REQUEST_IID`), or git remote URL.
  - Integrated into `create-agent-room ci` with flags `--comment` / `--pr-comment`, `--github-token`, and `--pr`.
  - Modernized official composite GitHub Action in `action.yml` supporting modern inputs (`target-dir`, `base`, `strict`, `comment`, `summary`, `github-token`, `skip`, `only`, `version`, `node-version`) while preserving 100% backward-compatibility for legacy `checks`.
  - Fully documented in `docs/github-action.md` and `README.md`.
  - 100% test coverage with 341 tests passing across Node 22.x & 24.x CI matrix.
- **Goal:**
  - Create a reusable composite GitHub Action / workflow template (`uses: sipandey/create-agent-room@v2`).
  - Automatically posts or updates an interactive PR compliance card with verification outcomes, guardrail status, and session audits.
- **Acceptance Criteria:**
  1. Reusable GitHub Action packaged and documented.
  2. Automatic sticky PR comment updates with audit summary.

---

## Epic 6: Ambient Git & Invisible Lifecycle Governance

Eliminate cognitive friction by embedding `create-agent-room` commands directly into standard `git` lifecycle hooks. AI agents and engineers just use native git commands (`commit`, `push`, `checkout`, `pull`), while governance, session recording, rule synchronization, and CI pre-flight checks run invisibly in the background.

### Story 6.1: Git Hook Manager CLI (`create-agent-room hook [install|status|uninstall]`)
- **Status:** ✅ **DONE** (Merged into `main` via PR #19, Commit `b24cbf8`)
- **Summary:**
  - Implemented `lib/hook.js` with `installHooks`, `getHookStatus`, `uninstallHooks`, and `runHookCli`, adding `hook` subcommand to `bin/cli.js`.
  - Added support for 5 standard git lifecycle hooks: `pre-commit`, `pre-push`, `post-commit`, `post-checkout`, and `post-merge`.
  - Non-destructive chaining: wraps CAR hooks inside delimited comment blocks (`# --- create-agent-room hook: <name> ---`), preserving existing developer scripts and hooks (Husky, Lefthook, custom shell scripts).
  - Dynamic hooks path resolution: checks `git config core.hooksPath` (e.g. `.husky/`, `.agent-room/hooks/git/`), git worktrees, and submodules before `.git/hooks/`.
  - Safe uninstallation: strips CAR blocks cleanly and only deletes hook files if no user logic remains.
  - Enhanced `lib/doctor.js`: recognizes delimited CAR hook blocks without false drift warnings, and repairs hooks under `--fix` using `installHooks`.
  - Created hook templates in `templates/adapters/git-hooks/` (`pre-push.tmpl`, `post-commit.tmpl`, `post-checkout.tmpl`, `post-merge.tmpl`).
  - Added comprehensive unit tests in `test/hook.test.js` and CLI integration tests in `test/cli.test.js` (all 361 repo tests pass, 0 lint warnings).
- **Goal:**
  - Provide a first-class CLI command and programmatic API to install, inspect, and remove CAR git lifecycle hooks without clobbering existing developer hooks.
- **Acceptance Criteria:**
  1. `create-agent-room hook install [target] [options]`:
     - Installs or updates git hooks in `.git/hooks/` (or configured `core.hooksPath`).
     - Detects existing hooks (including Husky, Lefthook, or custom shell scripts); chains execution non-destructively by prepending/appending without overwriting user scripts.
     - Ensures proper executable permissions (`chmod +x` or `0o755`).
     - Supports `--hooks <list>` (e.g. `pre-commit,pre-push,post-commit,post-checkout,post-merge`) and `--all`.
  2. `create-agent-room hook status [target]`:
     - Inspects all supported git hooks in the target repository.
     - Reports whether CAR hooks are active, executable, drifted from templates, or missing.
     - Supports `--json` for automated CI/environment audits.
  3. `create-agent-room hook uninstall [target]`:
     - Safely removes CAR hook snippets or files while leaving user-defined hooks intact.
  4. Integration with existing tooling:
     - `create-agent-room init --tools git` invokes `hook install` automatically.
     - `create-agent-room doctor` checks hook status and `doctor --fix` repairs drifted or missing hooks.
  5. Zero external dependencies: pure Node.js standard library implementation.

---

### Story 6.2: Pre-Push Local CI Gate (`pre-push` -> `create-agent-room ci`)
- **Status:** ✅ **DONE** (Merged into `main` via PR #20, Commit `5010263`)
- **Summary:**
  - Enhanced `templates/adapters/git-hooks/pre-push.tmpl` with upstream tracking branch auto-detection (`@{upstream}`, `${REMOTE}/main`, `origin/main`), remote branch deletion bypass (all-zero commit SHAs), `.agent-room.json` config parsing (`hooks.prePush`), and actionable terminal remediation guidance.
  - Implemented `detectUpstreamBranch`, `resolvePrePushConfig`, `runPrePush`, and `runPrePushCli` in `lib/hook.js` with git ref verification to safely handle initial pushes in fresh repositories.
  - Added CLI and programmatic `--skip <checks>` support in `lib/ci.js` and `bin/cli.js` for comma-separated or array check exclusions.
  - Added schema validation in `lib/checks.js` for `.agent-room.json` `hooks` and `hooks.prePush` structure and property types.
  - Added comprehensive test suites in `test/hook.test.js`, `test/ci.test.js`, `test/cli.test.js`, and `test/validate.test.js` (all 376 repo tests pass, 0 lint warnings).
- **Goal:**
  - Run the unified headless CI runner locally before `git push` transmits code to remote remotes, guaranteeing that PR anti-tamper, missing session logs, and test regressions are caught in milliseconds rather than waiting for remote CI runners.
- **Acceptance Criteria:**
  1. Installs `.git/hooks/pre-push` executing `create-agent-room ci --base <upstream>`.
  2. Automatically detects upstream tracking branch or defaults to `origin/main` / `origin/master`.
  3. If tests fail, rule weakening is unapproved, or session logs are missing, intercepts the push and outputs actionable terminal remediation steps.
  4. Supports fast bypass mechanisms: `git push --no-verify` or `CAR_SKIP_HOOK=1` / `CAR_SKIP_PRE_PUSH=1`.
  5. Configurable in `.agent-room.json` (`hooks.prePush: { "enabled": true, "strict": false, "skip": ["eval"] }`).

---

### Story 6.3: Ambient Session Tracking & Auto-Handoff (`post-commit` -> auto session)
- **Status:** 📋 Ready
- **Goal:**
  - Automatically record commits, diffs, and decision references to the active session log on `git commit`, eliminating the need for agents or developers to manually scaffold session files.
- **Acceptance Criteria:**
  1. Installs `.git/hooks/post-commit` running ambient session tracking.
  2. If an active session log exists for the current branch/date, appends the new commit hash, message, and touched files automatically.
  3. If no session log exists and non-scaffold code was committed, auto-scaffolds a compliant session log in `.agent-room/sessions/` using branch name and commit context.
  4. Runs swiftly (<100ms) and asynchronously/non-blocking so developer commit workflows remain snappy.
  5. Fully compliant with `create-agent-room lint-sessions`.

---

### Story 6.4: Cross-Branch Auto-Sync & Drift Healing (`post-checkout` & `post-merge`)
- **Status:** 📋 Ready
- **Goal:**
  - Keep AI agent tool configurations (Claude Code, Cursor, Windsurf, Cline) synchronized automatically whenever switching branches or pulling upstream changes.
- **Acceptance Criteria:**
  1. Installs `.git/hooks/post-checkout` and `.git/hooks/post-merge`.
  2. Detects if `.agent-room.json` or `.agent-room/skills/` changed between `HEAD@{1}` and `HEAD` (or on branch change).
  3. Automatically runs `create-agent-room sync --all` to sync skills and rules across all configured tool adapters.
  4. Warns the developer/agent if the newly checked-out branch has drifted hooks, unapproved guardrail weakening, or missing dependencies.

---

## Epic 7: Lightweight Terminal UI & Observability Dashboard

Provide a dependency-free, interactive terminal dashboard (TUI) for human tech leads, developers, and autonomous agents to visually monitor repository governance, browse skills, inspect session handoffs, and manage room configurations without reading raw markdown or JSON files.

### Story 7.1: Interactive Room Dashboard (`create-agent-room ui` / `dashboard`)
- **Status:** 📋 Ready
- **Goal:**
  - Provide a standalone, zero-dependency ANSI/terminal interactive dashboard visualizing overall agent room health, guardrails status, and recent activity.
- **Acceptance Criteria:**
  1. `create-agent-room ui` (or `dashboard`):
     - Renders an interactive, responsive terminal dashboard using Node.js `process.stdout` and ANSI escape sequences (zero external npm dependencies).
     - Displays Governance Scorecard (validate, doctor, sessions, test verification, evals).
     - Displays Active Guardrails & Blast Radius Limits (`maxFilesPerChange`, `protectedPaths`, boundaries).
     - Displays Tool Adapters Status (synced tools: Claude, Cursor, Windsurf, Cline, Git).
  2. Keyboard navigation: `q` to quit, `r` to refresh, `d` for doctor auto-fix, `s` to sync.
  3. Non-interactive fallback: if stdout is not a TTY or `--format` is specified, outputs formatted summary text or JSON.

---

### Story 7.2: Live Session & Handoff Inspector (`create-agent-room session --watch` / timeline view)
- **Status:** 📋 Ready
- **Goal:**
  - Provide an interactive or streaming timeline inspector of agent sessions, decisions, and inter-agent handoff notes.
- **Acceptance Criteria:**
  1. `create-agent-room session log` / `session list`:
     - Renders a chronological timeline table of all session logs in `.agent-room/sessions/`.
     - Displays date, author/agent identity, classification, status, and goal.
  2. `create-agent-room session view [id]`:
     - Formats and displays a specific session log with decision links, actions taken, and handoff notes in readable terminal typography.
  3. `--watch` mode: monitors `.agent-room/sessions/` for changes and live-updates as agents complete turns.

---

### Story 7.3: Interactive Governance Switcher & Skill Explorer (`create-agent-room configure`)
- **Status:** 📋 Ready
- **Goal:**
  - Provide a terminal-driven interactive configurator to inspect installed vs. available skill packs, toggle governance profiles (`minimal`, `standard`, `strict`), and manage tool adapters.
- **Acceptance Criteria:**
  1. `create-agent-room configure`:
     - Interactive terminal menu to switch governance profiles (`minimal` <-> `standard` <-> `strict`).
     - Browse built-in skill pack catalog (testing, security, release, code-review, etc.) with description and install/remove toggles.
     - Enable or disable individual tool adapters on the fly with automatic re-sync.
  2. Non-interactive CLI support: `--preset <name>`, `--add-skill <name>`, `--enable-tool <name>`.

---

## Epic 8: Centralized Policy Distribution & Enterprise Monorepo Governance

Empower engineering organizations to distribute, synchronize, and enforce standardized guardrail policies, custom skill packs, and cross-package architectural boundaries across dozens of repositories and large monorepos.

### Story 8.1: Remote Policy Distribution & Corporate Governance Presets
- **Status:** 📋 Ready
- **Goal:**
  - Enable organizations to publish centralized governance presets (e.g. corporate security rules, required skill packs, standard evals) and inherit them across repos.
- **Acceptance Criteria:**
  1. `create-agent-room init --preset <git-url|https-url|npm-pkg>`:
     - Fetches and inherits remote `guardrails.json`, skills, and eval suites from a centralized repository or registry.
  2. Policy inheritance model in `.agent-room.json`:
     - Supports `"extends": "https://github.com/my-org/car-policies@v1.0.0"`.
     - Merges corporate baseline rules with repo-specific local additions without overwriting corporate non-negotiables.
  3. Integrity & security verification:
     - Locks remote policy revision/checksum to prevent unauthorized remote tampering.

---

### Story 8.2: Monorepo Multi-Package Boundary Enforcement
- **Status:** 📋 Ready
- **Goal:**
  - Support monorepo architectures where multiple packages/workspaces require independent scope boundaries, package-level skills, and strict cross-package import restrictions.
- **Acceptance Criteria:**
  1. Multi-package workspace discovery:
     - Auto-detects npm/pnpm/yarn workspaces, Lerna, Turborepo, or Nx subpackages.
  2. Nested boundary enforcement:
     - Enforces package-level `scopeBoundaries` so agents working in `packages/auth` cannot arbitrarily touch `packages/billing` without explicit cross-package authorization.
  3. Package-specific verification:
     - `create-agent-room verify --package <pkg>` executes targeted package test suites.
  4. Monorepo CI pass:
     - `create-agent-room ci` runs per-package validation and reports consolidated monorepo scorecard.

---

### Story 8.3: Centralized Compliance Drift & Remote Policy Synchronizer
- **Status:** 📋 Ready
- **Goal:**
  - Automatically detect and reconcile drift between local repository policies and upstream corporate governance policies.
- **Acceptance Criteria:**
  1. `create-agent-room doctor --upstream` (or `sync --remote`):
     - Checks if the remote policy defined in `"extends"` has a new release or if local rules conflict with upstream baseline.
  2. Automatic reconciliation:
     - Updates shared skill packs and security rules while preserving workspace-specific custom rules.
  3. CI drift gate:
     - Remote CI can flag outdated corporate policies or unaligned security baselines.




