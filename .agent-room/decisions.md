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

### 2026-09-26 — Retire Redundant Legacy Skills & Orphan Purging (Story 9.6)

**Decision:** Formally deprecate and unregister legacy procedural skills (`brainstorming`, `verification-before-completion`) in favor of the canonical 10-skill Research → Plan → Implement (RPI) suite:
- **Registry Unregistration:** Updated `CORE_SKILL_FILES` in `lib/skill.js` to strictly contain the 10 canonical skills (`research-codebase.md`, `writing-plans.md`, `implement-plan.md`, `iterate-plan.md`, `test-driven-development.md`, `systematic-debugging.md`, `commit-changes.md`, `validate-plan.md`, `describe-pr.md`, `closing-the-loop.md`) and exported `RETIRED_CORE_SKILL_FILES = ['brainstorming.md', 'verification-before-completion.md']`.
- **Classification & Deprecation:** Updated `listSkillPacks` in `lib/skill.js` to classify lingering retired skills as `deprecated` rather than user `custom` skills.
- **Automated Orphan Purging in Sync & Doctor:** Enhanced `lib/sync.js` (`purgeDeprecatedSkills`, called during `syncSkillsToClaude` and before rules generation) and `lib/doctor.js` (`checkDeprecatedSkills` advisory finding, and auto-removal in `doctor --fix`) to detect and purge lingering retired skills from both `.agent-room/skills/` and `.claude/skills/`.
- **Template & Dogfood Deletion:** Removed `brainstorming.md` and `verification-before-completion.md` from `templates/.agent-room/skills/`, `.agent-room/skills/`, and `.claude/skills/`.
- **Guidance & Test Alignment:** Updated `principles.md`, `closing-the-loop.md`, `CLAUDE.md.tmpl`, `CLAUDE.md`, example projects, and `test/init.test.js` to reference canonical RPI procedures.
- **Circular Dependency Elimination:** Resolved circular dependency between `lib/sync.js` and `lib/skill.js` by lazy-loading `runSync` in mutating functions (`addSkillPacks`, `removeSkillPacks`).
**Why:** `brainstorming.md` was conceptually split into read-only fact gathering (`research-codebase.md`) and interactive plan authoring (`writing-plans.md`). `verification-before-completion.md` was made redundant because per-phase verification is baked directly into `implement-plan.md` checkboxes and verified at turn completion by `close-the-loop-check.js`. Keeping deprecated skills inflated agent context windows and caused confusion across tool adapters.
**Rejected:** Silently keeping legacy templates as optional skill packs (they are fully superseded and obsolete); leaving orphaned files in existing projects during `sync` or `doctor --fix` (leads to lingering ghost skills in Claude Code and Cursor).

### 2026-09-26 — Multi-Agent Adapters: Claude Slash Commands & Cursor RPI Rules (Story 9.4)

**Decision:** Implement native ergonomic shortcuts for the Research → Plan → Implement (RPI) pipeline across supported multi-agent tool adapters:
- **Claude Code Custom Slash Commands:** Scaffolds and synchronizes custom command files in `.claude/commands/{research,plan,implement,iterate}.md` using `$ARGUMENTS` to invoke the underlying procedural skills (`research-codebase`, `writing-plans`, `implement-plan`, `iterate-plan`) directly from the terminal via `/research`, `/plan`, `/implement`, and `/iterate`.
- **Cursor RPI Execution Pipeline Rules:** Injected explicit 5-stage RPI guidelines into `templates/adapters/cursorrules.tmpl` and `.cursor/rules/agent-room.mdc` to guide Cursor's agent mode through the phased sequence (Research -> Plan & Iterate -> Implement -> Audit -> Deliver).
- **Tool Adapter Parity:** Updated `lib/init.js` (`installClaudeCommands`) and `lib/sync.js` (`syncClaudeCommands`, `checkClaudeCommandsSync`) to maintain continuous parity between template command definitions and target workspaces, including dirty file protection and `--force` overrides.
- **Scope Alignment:** Removed Goose integration (`--tools goose`, `.goosehints`, and Goose recipes) per explicit user direction to keep the tool adapter surface clean and focused on existing supported assistants.
**Why:** While procedure skills exist in `.agent-room/skills/` and mirrored directories, developers and agents interacting via Claude Code and Cursor benefit from native slash commands and explicit agent mode rules that reduce prompt friction and prevent cognitive drift during execution.
**Rejected:** Embedding command shortcuts only as aliased directories in `.claude/skills/` (confuses skill metadata discovery with user slash command invocation).

### 2026-09-26 — Attested PR Description Skill (Story 9.9)

**Decision:** Author and package the canonical `describe-pr.md` skill (`/describe_pr` and `/describe-pr`) in `templates/.agent-room/skills/` and `.agent-room/skills/`, and register it in `CORE_SKILL_FILES` in `lib/skill.js`.
- **Deep Architectural Diff Analysis:** Categorizes changes across User-Facing, Internal Architecture, Breaking Changes, and Database / Migrations dimensions.
- **Embedded Execution Proof:** Integrates `create-agent-room pr-desc . --verify --output .agent-room/pr-description.md` to run test suites and embed exit code, duration, ISO timestamp, and console logs into the PR body.
- **Interactive Human Approval Gate:** Enforces presenting the draft PR description to the human and prompting: `"Shall I update the PR description on GitHub?"` before altering remote PR metadata.
- **GitHub CLI Direct Synchronization:** Automates updating PR bodies via `gh pr edit <number> --body-file <path>`.
**Why:** Pull request descriptions synthesized without verifiable execution evidence lead to rubber-stamping, unverified claims of "tests pass", and missing architectural context for reviewers. Operationalizing CAR's attestation engine into an interactive skill guarantees that every PR description is backed by fresh, audited execution proofs.
**Rejected:** Purely automated, unreviewed PR updates without human confirmation (violates developer sovereignty and risk management).

### 2026-09-26 — Plan Validation Auditor Skill (Story 9.8)

**Decision:** Author and package the canonical `validate-plan.md` skill (`/validate_plan` and `/validate-plan`) in `templates/.agent-room/skills/` and `.agent-room/skills/`, and register it in `CORE_SKILL_FILES` in `lib/skill.js`.
- **Role Isolation:** The auditor acts as an independent reviewer, strictly forbidden from rubber-stamping or modifying application code during the audit.
- **3-Vector Audit Matrix:**
  1. *Database & Schema Migrations:* Verifies database schemas, migrations, configurations, backwards compatibility, and rollbacks.
  2. *Code Specifications vs. Plan:* Directly compares git diffs against each phase of the plan in `docs/plans/` to catch omitted tasks, missed requirements, and unauthorized scope creep.
  3. *Automated Test Coverage & Active Execution:* Verifies automated tests cover all new capabilities and requires actively executing the plan's verification commands during the audit turn.
- **Triage Classification:** Classifies findings into Matches Plan (🟢), Deviations (🟡), Potential Issues (🔴), and Manual Testing Required (🔵).
- **Persistent Validation Artifact:** Emits structured reports under `docs/reviews/YYYY-MM-DD-[TICKET-]validation.md` with explicit executive verdicts (`PASSED`, `PASSED WITH WARNINGS`, `FAILED - ACTION REQUIRED`).
**Why:** After completing implementation, agents often suffer from cognitive bias or context truncation, missing edge cases, skipping planned tests, or introducing unrequested architectural changes. An independent post-implementation validation gate ensures complete fidelity to the approved plan before commits are finalized or PRs are opened.
**Rejected:** Embedding plan validation directly into `implement-plan.md` (combining implementation and auditing within the same agent prompt leads to confirmation bias and skipped verification).

### 2026-09-26 — Atomic Commit Workflow Skill (Story 9.7)

**Decision:** Author and package the canonical `commit-changes.md` skill (`/commit`) in `templates/.agent-room/skills/` and `.agent-room/skills/`, and register it in `CORE_SKILL_FILES` in `lib/skill.js`.
- **Pre-Commit Assessment & Guardrails Gate:** Before formulating commits, the skill inspects `git status`, `git diff`, re-verifies authorized git identity (`git config user.name && git config user.email`), verifies the active branch is a dedicated feature/fix branch, and enforces the blast-radius scope limit from `.agent-room/guardrails.json` (max 20 files, max 500 lines per commit).
- **Mandatory Interactive Approval Gate:** The agent must present the formulated commit plan (files list and imperative Conventional Commits message) to the human and prompt: `"I plan to create [N] commit(s) with these changes. Shall I proceed?"`, halting turn until explicit confirmation is received.
- **Strict Anti-Sloppiness Staging:** Prohibits `git add -A`, `git add .`, and `git commit -a`. Only specific, named file paths may be staged.
- **Zero AI Attribution Policy:** Commits must be authored exclusively by the human user identity; strictly forbids `Co-Authored-By` or AI attribution trailers.
- **No Unsolicited Pushes:** Never executes `git push` without separate, explicit user instruction.
**Why:** Agents completing implementation phases frequently make monolithic commits exceeding guardrail scope limits, accidentally stage sensitive or temporary files with `git add .`, add unwanted AI attribution headers, or push prematurely to remotes. Standardizing atomic commit execution with an interactive approval gate guarantees clean, auditable git history.
**Rejected:** Automating commit creation headlessly without human approval (violates pair-programming control and makes unreviewed changes irreversible).

### 2026-09-26 — RPI Routing in Workflow Classifier & Universal AGENTS.md (Story 9.3)

**Decision:** Formally integrate the Research → Plan → Implement (RPI) pipeline into the CAR workflow taxonomy (`workflow-classifier.md`) and universal agent entrance instructions (`AGENTS.md` / `buildAgentsMdSections`), establishing explicit routing for non-trivial tasks while preserving lightweight defect flows and profile-aware token footprints.
- **Workflow Classifier Routing:** Formally routed `Feature`, `Product`, and multi-file `Enhancement` or `Refactor` tasks to the 5-stage RPI pipeline (`research-codebase` -> `writing-plans`/`iterate-plan` -> `implement-plan` -> `validate-plan` -> `commit-changes`/`describe-pr`). Explicitly defined that localized defect fixes follow the lightweight Bug Flow (reproduce -> diagnose -> test -> fix) without RPI documentation overhead.
- **Universal AGENTS.md Instructions:** Updated `FIRST_FIVE_MINUTES` to instruct agents not to skip RPI for non-trivial features, updated `GUIDANCE_LINKS` to reference canonical RPI procedure skills, and restructured `DEFAULT_WORKFLOW` to mandate RPI for features/products and TDD execution with live checkpoint tracking (`- [ ]` -> `- [x]`).
- **Profile Awareness:**
  - `strict` & `full` / `standard`: Supply full procedural guidance, linking `workflow-classifier.md`, `principles.md`, and RPI skills.
  - `minimal`: Keeps guidance lean with direct, self-contained RPI workflow steps in `AGENTS.md` and zero dead or dangling references to skipped files.
- **Dogfood Repository Alignment:** Synchronized root `AGENTS.md` and `.agent-room/workflow-classifier.md` with the updated templates.
**Why:** Without universal, prominent guidance at the repository entrance (`AGENTS.md`) and routing classifier (`workflow-classifier.md`), AI agents default to unstructured, monolithic execution and bypass the RPI discipline. Codifying RPI into the entry point ensures agents immediately adopt phased, verified workflows on all tasks.
**Rejected:** Forcing RPI onto trivial single-line bug fixes (unnecessary documentation overhead slows down debugging); hardcoding a single static `AGENTS.md` template without profile awareness (would leak broken references into minimal-profile projects).

### 2026-09-26 — Standardized Artifact Lifecycle & Schemas (Story 9.2)

**Decision:** Standardize the on-disk artifact lifecycle for RPI research documents (`docs/research/`) and implementation plans (`docs/plans/`), scaffolding both directories on `init` and enforcing YAML frontmatter schemas in `create-agent-room validate`.
- **Scaffolding:** Added `templates/docs/research/.gitkeep` so both `docs/research/` and `docs/plans/` are scaffolded consistently during repository initialization.
- **Strict Frontmatter Schemas:**
  - `docs/research/*.md`: requires `date`, `git_commit`, `branch`, `repository`, `topic`, `tags`, and `status`.
  - `docs/plans/*.md`: requires `date`, `research_doc`, `branch`, `status`, `phases_total`, and `phases_completed` (with numeric phase validation).
- **Automated Validation in `lib/checks.js` & `lib/validate.js`:** Section 4 of `collectFindings` validates file naming conventions (`YYYY-MM-DD-<topic>.md`, ignoring `README.md` and `.gitkeep`), verifies frontmatter delimiters (`---`), required attributes, non-empty values, and numeric phase counts.
- **Dogfood Repository Alignment:** Attached compliant YAML frontmatter headers to historical design notes in `docs/plans/`, ensuring 100% compliance across all dogfooded artifacts.
**Why:** Hand-crafted, unstructured markdown files scattered in arbitrary directories cause agent amnesia and make cross-session audits impossible. Predictable on-disk locations with validated frontmatter schemas establish durable, machine-readable contracts between research, planning, implementation, and review.
**Rejected:** External schema validation libraries (e.g. ajv, zod, joi) — CAR maintains a zero-runtime-dependency invariant by implementing pure JavaScript frontmatter linting in `lib/checks.js`.

### 2026-09-25 — Core RPI Guidance & Skill Suite (Story 9.1)

**Decision:** Author and package the four core procedural skills for the Research → Plan → Implement (RPI) framework: `research-codebase.md`, `writing-plans.md`, `implement-plan.md`, and `iterate-plan.md`.
- **Factual, Read-Only Research Phase (`research-codebase.md`):** Mandates zero opinions, zero proposals, and strictly read-only codebase discovery using 3 subroutines (`find_files`, `analyze_code`, `find_patterns`), saving output to `docs/research/YYYY-MM-DD-HHmm-<topic>.md`.
- **Phased Implementation Planning (`writing-plans.md`):** Ingests research docs, conducts structured clarifying Q&A, presents 2–3 architectural approaches with trade-offs, and outputs phased implementation plans to `docs/plans/YYYY-MM-DD-HHmm-<description>.md` with automated verification commands and state checkboxes (`- [ ]`).
- **Targeted Plan Iteration (`iterate-plan.md`):** Performs surgical plan updates based on user feedback without re-running full research from scratch.
- **Mechanical, Boring Implementation (`implement-plan.md`):** Executes plans phase-by-phase in a fresh session, runs automated verification commands, and updates checkboxes on disk (`- [ ]` -> `- [x]`) for context-compaction resilience.
- **Skill Registry Integration:** Updated `CORE_SKILL_FILES` in `lib/skill.js` to recognize `research-codebase.md`, `implement-plan.md`, and `iterate-plan.md` as built-in core skills. Added a deprecation notice to `brainstorming.md` directing agents to the RPI pipeline.
**Why:** Unconstrained agents jump directly into code execution, causing assumption drift, hallucinated architectural patterns, and context window blowups. Structuring work into isolated phases with explicit on-disk artifacts and checkpoint checkboxes provides predictability, correctness, and context resilience across all supported tools.
**Rejected:** Pure YAML prompt recipes as the primary format (pure YAML violates CAR's zero-dependency invariant and cannot be natively consumed by Claude Code, Cursor, or Copilot; Markdown with YAML frontmatter serves as the universal source of truth, with Goose YAML adapters generated for Goose).


<!-- no-log: v2.5.0 release commit — routine release mechanics (version bump, lockfile re-sync, action.yml and CI pin bump, CHANGELOG [Unreleased]→[2.5.0]). The CHANGELOG is the record; nothing new to add here. -->

### 2026-09-25 — pre-push local CI gate and upstream detection (Story 6.2)

**Decision:** Implement the pre-push local CI gate in `templates/adapters/git-hooks/pre-push.tmpl` and `lib/hook.js` (`runPrePush`, `detectUpstreamBranch`, `resolvePrePushConfig`), integrating with `create-agent-room ci --base <upstream>`.
- **Automatic Upstream Branch Resolution:** Detects the branch's tracking branch (`git rev-parse --abbrev-ref @{upstream}`), falls back to remote targets (`${REMOTE}/main`, `${REMOTE}/master`, `origin/main`, `origin/master`), and respects `CAR_BASE_REF` or `.agent-room.json` overrides. Safely verifies ref existence in git so fresh local repositories without remotes don't fail unexpectedly.
- **Smart Branch Deletion Bypass:** Inspects standard input for all-zero commit SHAs (`0000000000000000000000000000000000000000`), automatically skipping checks when deleting remote branches.
- **Declarative Configuration in `.agent-room.json`:** Supports `hooks.prePush: { enabled, strict, skip, only, base }`. Allows teams to toggle pre-push verification, skip heavy checks (e.g. `skip: ["eval"]`), or enforce strict mode (`strict: true`).
- **Emergency Bypass Support:** Fully supports native `git push --no-verify` and `CAR_SKIP_PRE_PUSH=1` / `CAR_SKIP_HOOK=1` environment variables.
- **Actionable Remediation Guidance:** Emits clear, structured failure summaries in terminal stderr with exact commands to run tests manually or bypass for emergency pushes.
**Why:** Remote CI feedback loops can take minutes, slowing down engineers and agents. Catching unapproved rule weakening, test regressions, and missing session logs on `git push` catches issues locally in milliseconds before code transmits upstream.
**Rejected:** Running pre-push checks synchronously on every commit (pre-commit should remain lightweight for code review; pre-push is the proper boundary for full CI pre-flight).

### 2026-09-25 — first-class git hook manager CLI (Story 6.1)

**Decision:** Implement `create-agent-room hook [install|status|uninstall]` in `lib/hook.js` to manage git lifecycle hooks with non-destructive chaining and custom `core.hooksPath` support.
- **Non-Destructive Chaining:** Uses delimited blocks (`# --- create-agent-room hook: <name> --- ... # --- end create-agent-room hook: <name> ---`). When repositories already use Husky, Lefthook, or custom developer scripts, CAR appends or updates its block without overwriting user scripts. On uninstall, only the CAR block is stripped; if no user code remains, the file is cleanly deleted.
- **Five Lifecycle Hooks Supported:** Defines standardized templates for `pre-commit` (guardrails check), `pre-push` (local CI simulation), `post-commit` (ambient session tracking), `post-checkout` (multi-agent rule sync), and `post-merge` (multi-agent rule sync).
- **Custom Hooks Directory Resolution:** Automatically detects `git config core.hooksPath` (e.g. `.husky/`, `.agent-room/hooks/git/`) and resolves git worktree/submodule pointers before falling back to `.git/hooks`.
- **Integrated Lifecycle Management:** Deeply wired into `init --tools git` and `doctor --fix`, while `doctor` checks hook blocks to eliminate false drift warnings on chained hooks.
**Why:** Relying on developer or agent memory to run governance commands creates friction and leads to avoidable CI failures. Hooking CAR commands directly into native git operations makes governance ambient and invisible. Providing an explicit, non-destructive hook manager ensures CAR integrates seamlessly into any existing git setup without breaking custom workflows.
**Rejected:** Forcing `core.hooksPath` globally (overwriting user's `core.hooksPath` breaks Husky setups); clobbering existing hook files unconditionally.

### 2026-09-23 — automated PR compliance reporter & modern GitHub Action (Story 5.3)

**Decision:** Implement automated sticky PR scorecard reporting in `lib/pr-comment.js` and modernize the official composite GitHub Action in `action.yml` to orchestrate `create-agent-room ci`.
- **Zero External Runtime Dependencies:** The PR comment reporter uses Node.js 18+ standard library global `fetch` with zero npm dependencies (`@actions/*`, `octokit`, or external HTTP clients), keeping the package lightweight and fast.
- **Sticky In-Place PR Comments:** Embeds an invisible marker `<!-- agent-room-pr-comment -->` in scorecard reports. On pull request runs, searches existing comments for the marker via GitHub REST API (`GET /repos/{owner}/{repo}/issues/{pr}/comments`); if found, updates the comment in-place (`PATCH`), and if absent, creates a new comment (`POST`). This eliminates notification spam across iterative commits.
- **Context Auto-Resolution:** Automatically detects repository full name and PR number from CLI flags (`--github-token`, `--pr`), GitHub Actions environment (`GITHUB_EVENT_PATH`, `GITHUB_REPOSITORY`), GitLab CI (`CI_MERGE_REQUEST_IID`), or `git remote get-url origin`. Gracefully skips if run outside a PR context or without write credentials.
- **Modernized Composite GitHub Action:** Updated `action.yml` to run `create-agent-room ci` with support for all modern options (`target-dir`, `base`, `strict`, `comment`, `summary`, `github-token`, `skip`, `only`, `version`, `node-version`) while preserving 100% backward-compatibility for legacy `checks` input (`both`, `validate`, `lint-sessions`).
**Why:** Continuous integration feedback is most valuable when visible directly where engineers and agents review code. Running separate steps or cluttering PR timelines with redundant comments degrades reviewer experience. In-place sticky comments combined with GitHub Actions job summaries make compliance visible and unobtrusive.
**Rejected:** Introducing `@actions/github` or `octokit` runtime dependencies (violates the project's zero-external-runtime-dependency invariant); posting new comments on every push (creates noisy comment churn).

### 2026-09-23 — remote PR anti-tamper and bypass audit gate (Story 5.2)

**Decision:** Implement remote PR diff auditing in `lib/pr-audit.js` and integrate it into `create-agent-room ci --base <ref>` to prevent unauthorized guardrails tampering and rule degradation across pull requests.
- **Merge-Base Diff Calculation:** Inspects git diff between `HEAD` and `merge-base` with `--base <ref>` (or `GITHUB_BASE_REF`).
- **Comprehensive Rule-Weakening Detection:** Audits `guardrails.json` changes against base across 7 governance dimensions (`protectedPaths`, `forbiddenActions`, `scopeGuidance`, `importBoundaries`, `scopeBoundaries`, `verifyOnCommit`, and `strictWaivers`).
- **Mandatory Structured Bypass Log:** Requires any rule weakening to be explicitly documented with a structured entry in `.agent-room/guardrails-bypass-log.md` within the PR diff, enforcing author, timestamp, and minimum 20-character rationale (and ticket reference in `--strict` mode).
- **Session Log Requirement:** Requires at least one valid session log in `.agent-room/sessions/` whenever non-scaffold code files are touched, with `--skip-pr-sessions` override.
**Why:** Local pre-commit hooks can be bypassed or skipped with `--no-verify`. Enforcing rule preservation and bypass accountability as a remote CI gate ensures repository governance cannot be bypassed silently before merging.
**Rejected:** Requiring manual approval webhooks or external service checks (all checks must be self-contained and run locally in standard CI pipelines).

### 2026-09-23 — unified headless CI runner (Story 5.1)

**Decision:** Implement `create-agent-room ci [target] [options]` in `lib/ci.js` as a unified, headless runner for CI/CD pipelines (GitHub Actions, GitLab CI, CircleCI, Bitbucket, pre-push scripts).
- **Consolidated Health Dimensions:** Orchestrates all 5 governance dimensions in a single deterministic execution: `validate` (structure and guardrails schema), `doctor` (hook drift, permissions, CI pins), `lint-sessions` (session log format compliance), `verify` (codebase test suite), and `eval` (compliance evals).
- **Flexible Check Control:** Allows granular skips (`--skip-verify`, `--skip-doctor`, `--skip-eval`, `--skip-sessions`, `--skip-validate`) and targeting (`--only <checks>`, `--only-<check>`).
- **Multi-Format Output & CI Step Summary:** Generates ANSI terminal tables (`text`), serialized JSON (`json`), or GitHub Flavored Markdown (`markdown`) with collapsible failure diagnostics. Passing `--summary` or running in an environment with `$GITHUB_STEP_SUMMARY` automatically writes the Markdown scorecard directly to the GitHub Actions Job Summary.
- **Pure Programmatic Linting:** Extracted pure `lintSessions(target)` in `lib/lint-sessions.js` that returns structured results without setting exit codes or printing side-effects, keeping subcommands decoupled.
**Why:** Prior to `create-agent-room ci`, validating a repository in CI required writing 5 separate shell steps in workflow YAML, each with disparate error handling, different exit behaviors, and zero consolidated reporting for pull request reviewers. `create-agent-room ci` collapses this into a single zero-dependency command with rich failure diagnostics and an actionable exit code.
**Rejected:** Chaining CLI subcommands via child processes (running in-process functions is 10x faster and allows structured failure aggregation); forcing verification tests unconditionally in environments where test suites run in separate job matrices.

### 2026-09-23 — dynamic skill pack management CLI (Story 4.3)

**Decision:** Implement `create-agent-room skill [list|add|remove]` in `lib/skill.js` to manage the lifecycle of skill packs post-initialization while ensuring seamless cross-tool rule updates and preserving local custom rules.
- **Unified Catalog & Discovery:** Built-in catalog defines 9 domain packs (`testing`, `security`, `release`, `code-review`, `api-design`, `database`, `performance`, `observability`, `documentation`). `skill list` inspects both `.agent-room.json` and `.agent-room/skills/` to provide clear statuses (installed, available, custom) with human-friendly and `--json` outputs.
- **Dynamic Installation (`skill add`):** Copies skill templates for built-in packs, clones shallow Git URLs for remote packs, and copies files from local paths into `.agent-room/skills/`. Updates `.agent-room.json` (`skillPacks`) deduplicated.
- **Clean Removal & Orphan Purging (`skill remove`):** Deletes skill files associated with specified packs, updates `.agent-room.json`, and cleans up orphaned mirrored directories in `.claude/skills/`.
- **Automatic Multi-Agent Sync:** By default, adding or removing packs automatically triggers `runSync(target, { all: true })` so that Claude, Cursor, Windsurf, Cline, Codex, and GitHub Copilot adapters remain in exact synchronization. Supports `--no-sync` for offline/manual pipelines.
**Why:** Prior to Story 4.3, skill packs could only be configured during initial repository scaffolding via `init --skill-packs <list>`. Adding or removing skills after initialization required manual file copying, manual edits to `.agent-room.json`, manual invocations of `sync`, and manual cleanup of mirrored tool files. Providing a first-class CLI command automates this entire lifecycle reliably without breaking user customizations.
**Rejected:** Silently leaving orphaned skill files in tool adapter mirrors (orphaned skills confuse agent tools and cause drift); omitting `--no-sync` (scripting and batch migrations benefit from decoupled sync).

### 2026-09-23 — automated session logging & handoff CLI (Story 4.2)

**Decision:** Implement `create-agent-room session [name] [options]` to streamline session log creation and inter-agent handoffs while ensuring zero external dependencies and 100% compliance with `lint-sessions`.
- **Intelligent Git State Ingestion:** In `--record` mode, CAR queries `git status --porcelain` to record created and modified files, extracts recent commit messages as session actions, links newest architectural decisions from `.agent-room/decisions.md`, and runs `verifyProject` to capture concrete test command results.
- **Zero-Friction CLI Interface:** Accepts explicit metadata (`--goal`, `--classification`, `--status`, `--agent`, `--handoff`), supports custom destination paths (`--output`), and supports `--dry-run` and `--json` for scripting and CI automation.
- **Guaranteed Out-of-the-Box Compliance:** Automatically derives compliant goals and default placeholders so scaffolded sessions pass `validateMarkdownSession` and `validateJSONSession` with 0 errors and 0 warnings.
- **Tolerant Parsing & Formatting:** Updated `lib/lint-sessions.js` to accept standard markdown list syntax (`- Read:`, `- Created:`, `- Modified:`) with optional whitespace.
**Why:** Prior to Story 4.2, engineers and agents had to manually write `.agent-room/sessions/YYYY-MM-DD-HHMM-topic.md` files or rely on memory. Context between consecutive turns was frequently lost, and manual logs often failed `lint-sessions` due to missing headers, formatting differences, or omitted decision references. Automating this eliminates friction and ensures high audit quality.
**Rejected:** Requiring an external LLM call to summarize the session (CAR strictly maintains zero runtime dependencies and local deterministic execution); forcing interactive prompts when run in CI environments.

### 2026-09-23 — comprehensive guardrails rule-weakening & anti-tamper gate (Story 4.1)

**Decision:** Eliminate the security limitation documented in `CAPABILITIES.md` by implementing mechanical rule-weakening and anti-tamper enforcement in `templates/adapters/git-hooks/guardrails-check.js` and `.agent-room/hooks/guardrails-check.js`.
- **Comprehensive HEAD Comparison:** When `guardrails.json` is modified or deleted in any non-genesis commit, it is evaluated against `HEAD:.agent-room/guardrails.json`.
- **Anti-Tamper Deletion Detection:** Deleting `.agent-room/guardrails.json` is detected immediately and blocked with an explicit anti-tamper error.
- **Rule Weakening Detection Across All Categories:**
  1. `protectedPaths`: Flag any dropped or narrowed protected path (including self-weakening).
  2. `forbiddenActions`: Flag any dropped secret/credential detection pattern or pattern type downgrade from regex to literal.
  3. `scopeGuidance`: Flag any increase in `maxFilesPerChange` or `maxLinesPerChange`, or removal of limits.
  4. `importBoundaries`: Flag any removed source boundary rule or dropped disallowed import pattern.
  5. `scopeBoundaries`: Flag any removed or emptied `allowedPaths` or weakened `disallowedCrossBoundaries` isolation groups.
  6. `verifyOnCommit`: Flag any disabling of pre-commit verification or disabling of strict verification mode.
  7. `strictWaivers`: Flag any disabling of strict waiver auditing.
- **Strengthening Allowed:** Commits that preserve or tighten existing rules (adding protected paths/patterns, lowering scope limits, adding import boundaries, or adding new checks) proceed cleanly with exit code 0.
- **Audit & Bypass Requirement:** Any intentional rule loosening requires `GUARDRAILS_BYPASS=1` (with `GUARDRAILS_BYPASS_REASON` in strict mode), automatically appending a permanent, machine-logged audit record into `.agent-room/guardrails-bypass-log.md`.
**Why:** Prior to Story 4.1, the pre-commit hook only compared against HEAD to catch self-weakening (`guardrails.json` removing its own path from `protectedPaths`). An agent could silently drop secret patterns (like AWS or GitHub keys), delete import boundaries, or increase scope limits without triggering a violation. Story 4.1 closes this security loophole entirely, providing mechanical guarantees that guardrail defenses cannot be silently softened.
**Rejected:** Allowing rule weakening without an auditable bypass justification; attempting semantic AST diffing across non-JSON configs (JSON structure provides deterministic, dependency-free validation).

<!-- no-log: v2.4.0 release commit — routine release mechanics (version bump, lockfile re-sync, action.yml and CI pin bump, CHANGELOG [Unreleased]→[2.4.0]). The CHANGELOG is the record; nothing new to add here. -->

### 2026-09-23 — custom adopter compliance eval suites (Story 3.3)

**Decision:** Expand `create-agent-room eval` (`lib/eval.js` and `bin/cli.js`) to discover and execute repo-specific compliance eval suites from `<target>/.agent-room/evals/`, `<target>/evals/custom/`, and custom directories specified via `--evals-dir <dir>` / `--custom-evals <dir>`.
- **Custom Case Formats:** Supports both standalone `*.eval.json` files and fixture subdirectories containing `eval.json`.
- **Extended Case Types:** Added first-class support for `verify` cases (running `verifyProject`) and `command` cases (running shell assertions or compliance scripts), in addition to built-in `close-the-loop`, `lint-sessions`, and `validate`.
- **Flexible Execution Modes:** Added `--custom-only` (runs only custom adopter evals) and `--builtin-only` (runs only built-in evals). By default, both built-in and custom suites execute together and output aggregated results.
- **Reporting & Attribution:** Each case tracks `source: 'builtin' | 'custom'`. Multi-format reports (`text`, `json`, `csv`) report unified pass/fail totals alongside a distinct `summary.builtin` and `summary.custom` breakdown.
**Why:** While `create-agent-room` ships with built-in compliance evals for core governance invariants, organizations and adopters frequently enforce proprietary compliance checks, security policies, custom linting rules, or workspace-specific invariants. Story 3.3 delivers the Phase 2 custom pack discovery originally scoped in the compliance eval design doc, giving platform teams an extensible evaluation harness with zero external dependencies.
**Rejected:** Requiring npm test runner dependencies or external test frameworks for custom evals; separating custom evals into an isolated subcommand instead of integrating into unified `create-agent-room eval`.


### 2026-09-23 — PR attestation & verification evidence generator (Story 3.2)

**Decision:** Add `--verify` (alias `--with-verification`) and `--output <file>` options to `create-agent-room pr-desc` (`lib/pr.js` and `bin/cli.js`), enabling automated injection of test verification evidence, architectural decision links, guardrail compliance attestations, and reviewer compliance checklists directly into generated Pull Request descriptions.
- **Verification Proof Attestation:** Automatically triggers `verifyProject(target, args)` to execute the repository's configured test command, capturing exit code, duration, ISO timestamp, and bounded test output inside a collapsible `<details>` block.
- **Guardrails & Decisions Attestation:** Inspects `.agent-room/guardrails-bypass-log.md` and `.agent-room/decisions.md` to attest whether the changes adhered cleanly to project guardrails or whether auditable bypasses were logged, cross-referencing recent ADRs.
- **Reviewer Compliance Checklist:** Pre-populates a structured markdown checklist with interactive status checkboxes (`[x]` or `[ ]`) verifying automated test results, architectural documentation, scope containment, and session tracking.
- **Output Flexibility:** Supports `--output <file>` to direct output to custom files (such as `.github/pull_request_template.md` or CI artifacts) in addition to `--write` (`.agent-room/pr-description.md`), and supports `--strict` to exit 1 if verification fails.
**Why:** Pull request reviewers and compliance auditors need verifiable evidence that AI agents actually ran and passed the repository's test suite, recorded necessary architectural decisions, and obeyed guardrails. Manual copy-pasting of test terminal outputs into PR descriptions is error-prone and frequently skipped by agents. Automated attestation gives human reviewers immediate cryptographic and execution certainty.
**Rejected:** Generating PR descriptions purely from git diffs without session logs (session logs capture the agent's explicit goal, decisions, and handoff reasoning).


### 2026-09-23 — session telemetry & governance metrics exporter (Story 3.1)

**Decision:** Expand `create-agent-room metrics` from a simple terminal dashboard into a comprehensive multi-format telemetry and governance metrics engine (`lib/metrics.js` and `bin/cli.js`).
- **Telemetry Aggregation:** Aggregates session execution data (`.agent-room/sessions/`), verification test pass/fail rates from `## Tests run` / `testsRun`, architectural decisions velocity from `.agent-room/decisions.md`, and auditable guardrail bypass records from `.agent-room/guardrails-bypass-log.md` (categorized into scope, protected path, forbidden pattern/secret, verification gate, and other).
- **Multi-Format Export:** Supports `--format <text|json|csv|markdown>` (default: `text`). JSON and CSV allow automated ingestion into data warehouses, dashboards, and CI/CD pipelines; Markdown generates executive KPI reports suitable for pull requests and audits.
- **Output Redirection:** Added `--output <file>` to export reports directly to disk without shell piping.
- **Backward Compatibility:** Preserved legacy CLI output strings when no sessions are found in text mode.
**Why:** Engineering leaders and platform teams managing autonomous agent workflows need quantifiable visibility into agent productivity, success rates, test verification coverage, decision velocity, and compliance friction. Without machine-readable metrics export, telemetry was trapped in local terminal outputs and unable to be tracked across teams or integrated into governance reporting dashboards.
**Rejected:** Introducing external telemetry SDKs or remote network reporters (strictly maintaining zero external runtime dependencies); altering session log schemas (metrics extracts telemetry transparently from existing markdown/json logs).


### 2026-09-22 — unified multi-agent sync & github copilot adapter (Story 2.3)

**Decision:** Add GitHub Copilot (`copilot`) adapter support generating `.github/copilot-instructions.md` with links to `AGENTS.md` and `.agent-room/skills/`, and enhance `create-agent-room sync` with `--all`, `--tools <list>`, workspace tool auto-detection, and user-customization preservation (`<!-- user-customizations-start -->` ... `<!-- user-customizations-end -->` or `<!-- user-customizations -->`).
- `sync --all`: Fans out skill mirrors and rules across all 6 supported tools (`claude`, `cursor`, `windsurf`, `cline`, `codex`, `copilot`) in a single command.
- `sync --tools <list>`: Selectively targets specified tools (e.g. `--tools cursor,copilot`).
- Workspace auto-detection: If `tools` is not defined in `.agent-room.json`, `sync` inspects the workspace to discover which tool rule files are present and syncs them automatically.
- Idempotency & Customization Preservation: When regenerating rules files, user custom rules in designated marker blocks are extracted and preserved, avoiding clobbering user customizations on re-sync. Already in-sync files report `up-to-date` without touching file timestamps or rewriting.
**Why:** Modern engineering organizations rarely standardize on a single AI coding agent; engineers simultaneously use Claude Code, Cursor, Windsurf, Cline, Codex, and GitHub Copilot. Previously, syncing across all tools required manual invocations or custom scripts, and regenerating rules files risked wiping out user-authored project rules. `sync --all` provides a single idempotent command to keep all AI agents aligned with zero maintenance overhead.
**Rejected:** Forcing a single global agent format; requiring separate sync subcommands per tool; dropping support for uncommitted git edits check.


### 2026-09-21 — zero-friction governance profiles (--preset minimal|standard|strict)

**Decision:** Implement governance presets (`--preset minimal|standard|strict`, with `--profile` as an interchangeable alias) allowing teams to select governance strictness out of the box without manual JSON edits.
- `minimal` (default): Lightweight scaffold (AGENTS.md, guardrails, skills, stop hooks), skipping verbose documentation files (`principles.md`, `workflow-classifier.md`, `coordination/`) to minimize agent token overhead.
- `standard` (canonical name for legacy `full`): Restores the full guidance corpus and configures pre-stop test verification.
- `strict` (enterprise governance): Enforces pre-commit test execution (`verifyOnCommit.strict: true`), architectural import boundaries (`importBoundaries` in `guardrails.json` and `guardrails-check.js`), strict waiver audits requiring auditable references (`ticket: #123`, `approved-by: lead`) and >= 40 chars, mandatory `GUARDRAILS_BYPASS_REASON` for bypasses, and tighter scope guidance limits (10 files / 300 lines).
**Why:** Teams have different governance requirements depending on repo maturity and risk profile. Beginners and rapid prototyping teams need low token friction (`minimal`), standard product teams need comprehensive guidelines and pre-stop test gates (`standard`), while enterprise and security-sensitive teams require hard gates at pre-commit and strict waiver audits (`strict`).
**Rejected:** Requiring manual hand-crafting of `guardrails.json` and `.agent-room.json` for every strict feature; dropping backward compatibility for `--profile full`.


### 2026-09-21 — doctor --fix auto-remediation

**Decision:** Add `--fix` flag to `create-agent-room doctor` (`lib/doctor.js`) enabling one-command automated remediation of actionable findings: re-synchronizing drifted static hooks (`close-the-loop-check.js`, `guardrails-check.js`, `pre-commit`, etc.) with packaged templates, re-wiring missing Claude and Cursor stop hooks when registered in `.agent-room.json`, restoring missing git pre-commit hooks, and re-pinning CI action versions in `.github/workflows/agent-room-validate.yml` to the installed CLI version.
**Why:** Developers and teams upgrade `create-agent-room` over time. Telling users that their hooks have drifted or their stop hooks are missing without providing a clean, non-destructive auto-repair command forced them to manually run `init --force` (which risks overwriting custom configs) or copy files by hand. `doctor --fix` provides targeted, safe auto-repair.
**Rejected:** Full destructive re-scaffolding inside `doctor --fix` (users should use `init --force` if they want to overwrite full room configs and principles).


### 2026-09-21 — blast radius & architectural scope guardrails

**Decision:** Enforce architectural scope boundaries across both Pre-Commit hooks (`guardrails-check.js`) and Pre-Stop turn hooks (`close-the-loop-check.js`), converting the guidance in `.agent-room/coordination/scope-boundaries.md` into active mechanical enforcement. Supported via `scopeBoundaries` in `.agent-room/guardrails.json` (`allowedPaths` and `disallowedCrossBoundaries`) and dynamically via `CAR_ALLOWED_SCOPE`. Governance paths (`.agent-room/**`, `docs/plans/`, `AGENTS.md`, `CLAUDE.md`, `.agent-room.json`) remain exempt to allow required logging and decision tracking.
**Why:** Agents assigned to isolated components frequently exhibit blast radius creep across the codebase (e.g. editing backend, migrations, or infra while on a frontend task), causing merge conflicts and broken parallel work. Mechanical enforcement guarantees adherence to architectural boundaries before commits or turn completions.
**Rejected:** Blocking governance docs from being updated when scope is restricted (would prevent agents from satisfying closing-the-loop requirements).


### 2026-09-21 — cli `verify` subcommand and opt-in pre-commit verification gate

**Decision:** Implement `create-agent-room verify` as a standalone subcommand in `bin/cli.js` and `lib/verify.js`, supporting `--format json`, `--strict`, `--timeout <ms>`, and `--output <path>`. Also add opt-in pre-commit verification to `guardrails-check.js` triggered by `guardrails.verifyOnCommit` (boolean or object) or `CAR_VERIFY_ON_COMMIT=1`. Commits failing verification are blocked unless bypassed via `GUARDRAILS_BYPASS=1` (which records durable audit log entries in `.agent-room/guardrails-bypass-log.md`).
**Why:** Teams want to run test verification both standalone in CI pipelines / local scripts (`create-agent-room verify --format json`) and mechanically gate git commits before code is recorded. Bounded timeout prevents hung tests from freezing git hooks or agents indefinitely.
**Rejected:** Running pre-commit verification by default without opt-in (would impose unexpected latency on standard developer workflows); running verification on initial genesis commit (dependencies might not yet be installed).


### 2026-09-21 — workspace test command auto-detection for verification

**Decision:** Auto-detect existing test commands during `create-agent-room init` (`detectTestCommand`) by inspecting `package.json` scripts (ignoring empty/dummy npm placeholders), `Cargo.toml`, `go.mod`, Python pytest configurations, Java/Kotlin gradlew/mvn, and Makefiles. In `--yes` mode, populate `verification.testCommand` automatically; in interactive mode, prompt with the detected default; allow overriding via `--test-command` or disabling via `--no-test-command`.
**Why:** Requiring users to know about and manually pass `--test-command` leaves verification unused on most repos. Auto-detection provides out-of-the-box shift-left certainty while safely ignoring unconfigured/placeholder scripts to avoid false positives.
**Rejected:** Defaulting to `npm test` unconditionally without inspecting `package.json` (would break repos that don't define a test runner); running tests during `init` (slow and network-dependent).

### 2026-09-21 — pre-stop test & build verification gate

**Decision:** Wire automated pre-stop test & build verification directly into `close-the-loop-check.js` (Claude Code Stop and Cursor stop hooks) and `init --test-command`. When non-scaffold files change during an agent turn, if `verification.testCommand` is defined in `.agent-room.json` (or passed via CLI/opts), the hook executes the test command before turn completion. Failure exits code 2 (Claude Code) or emits `followup_message` (Cursor) with a bounded (~1,500 chars) output snippet, blocking premature completion claims when tests fail.
**Why:** Agents frequently declare task completion when tests are broken or unrun ("verification-before-completion" anti-pattern). While `.agent-room/skills/verification-before-completion.md` provides prose guidance, mechanical Stop hook enforcement guarantees that touched code compiles and passes tests before the agent can yield back to the user, converting the Layer 2 guidance into an active Layer 3 gate.
**Rejected:** Running tests on every command/turn (too slow and disruptive); running tests when only `.agent-room/` documentation changed; unbounded failure log output that would blow out LLM context windows.

<!-- no-log: v2.3.0 release commit — routine release mechanics (version bump, lockfile re-sync, action.yml and CI pin bump, CHANGELOG [Unreleased]→[2.3.0]). The CHANGELOG is the record; nothing new to add here. -->

<!-- no-log: v2.2.0 release commit — routine release mechanics (version bump, lockfile re-sync, action.yml and CI pin bump, CHANGELOG [Unreleased]→[2.2.0]). The CHANGELOG is the record; nothing new to add here. -->

### 2026-07-30 — reject golden-task evals; add enforcement-model doc instead

**Decision:** Golden-task / behavioral evals ("given repo state, agent should…")
stay out of scope for this CLI. Adopter-facing system explanation lives in
`docs/enforcement-model.md` (four layers, code paths) plus a mermaid diagram
in README — not a separate "agent loop architecture" spec.
**Why:** Compliance `eval` is mechanical regression on governance machinery;
golden tasks need live agents, model pinning, graders, and flaky CI. Mixing
the two misleads adopters and bloats a small scaffolder.
**Rejected:** Golden-task eval file in core CLI; parallel architecture bible.

<!-- no-log: routine doc and roadmap scope logging for enforcement-model.md and ROADMAP rejection entries — no new product behavior. -->

### 2026-07-30 — compliance `eval` command (builtin pack + JSON/CSV export)

**Decision:** Add `create-agent-room eval` running packaged fixtures under
`evals/builtin/` for close-the-loop, lint-sessions, and validate — no LLM,
no consumer-repo eval packs in v1. Reports support `--format json|csv` for
CI/dashboards; exit 1 on failure.
**Why:** OSS adopters need regression proof that governance enforcement still
works after upgrades; this stays mechanical and zero-dep, unlike agent
quality benchmarks.
**Rejected:** LLM-as-judge evals; live agent runners; custom
`.agent-room/evals/` in v1.

### 2026-07-30 — stricter no-log waiver validation (20 chars + keyword)

**Decision:** Tighten evidence-lite waivers from ≥8 chars to ≥20 chars after
`no-log:`, plus a mechanical keyword check (`routine`, `fix`, `test`, and a
small allowlist of similar tokens). Structured decision/anti-pattern entries
unchanged.
**Why:** User chose option C after dogfood — short or padding-only waivers
still passed the hook too easily.
**Rejected:** LLM quality judgment on waiver prose; requiring session logs at
stop time.

### 2026-07-30 — extend `sync` to Windsurf, Cline, and Codex rules files

**Decision:** Complete point C of the hybrid-mini slice: `sync` now
regenerates `.windsurfrules`, `.clinerules`, and `.codexrules` from the
same packaged templates + `{{SKILL_LIST}}` as Cursor rules (Claude skills
mirror unchanged). Refactored `lib/sync.js` around a shared
`RULES_SYNC_ADAPTERS` table rather than Cursor-only helpers.
**Why:** OSS adopters editing `.agent-room/skills/` shouldn't manually
refresh four separate rule files; init-time copy alone went stale after the
first skill-pack change.
**Rejected:** runtime hooks for Windsurf/Cline/Codex (no stable API);
inventing Codex/Gemini skill trees; bidirectional sync in this slice.

### 2026-07-30 — evidence-lite close-the-loop (diff validation + lint-sessions)

**Decision:** Phase B ships in two slices: B.1 validates `git diff HEAD` on
log files in the stop hook (valid waiver or structured entry required, not
mere file touch); B.2 rejects placeholder `## Decisions made` content when
session `**Status:** Completed`. Shared pure logic lives in
`lib/closing-the-loop-evidence.js`, copied to `.agent-room/hooks/` at init.
**Why:** presence-only checks were gamed in dogfood (whitespace / empty
waiver). Mechanical structure validation closes the gap without agentic-os
classification machinery or LLM quality judgment.
**Rejected:** requiring session logs at stop-hook time; classification-based
phase evidence; a single monolithic PR without dogfood on this repo first.

### 2026-07-29 — Cursor Stop parity via followup_message; shared hook + multi-tool sync (rules first)

**Decision:** Next product slice is hybrid mini (design:
`docs/plans/2026-07-29-cursor-stop-and-multi-tool-sync-design.md`): (1) wire
Cursor `stop` through the same close-the-loop checker Claude uses, adapting
via `--adapter=cursor` to emit `{ followup_message }` rather than exit 2;
(2) extend `sync` so Cursor regenerates `.cursor/rules/agent-room.md` from
canonical `.agent-room/skills/` (Claude skills mirror unchanged); (3) defer
evidence-lite content checks and Cursor `SKILL.md` trees to later work.
**Why:** OSS adopters' quality bar is agents staying inside boundaries;
Cursor today gets rules but no runtime gate. Cursor's documented `stop`
API continues the loop with `followup_message` — it does not block like
Claude's exit-2 Stop — so one shared check with thin adapters is honest
and avoids duplicating logic. Rules sync closes the "skills changed,
Cursor still points at stale guidance" gap without inventing an unstable
Cursor skills path.
**Rejected:** (a) Enforcement-only or guidance-only first — misses either
multi-tool feel or the ignore-guidance pain; (b) inventing a Cursor
skills directory now — convention not stable enough; (c) full
evidence-lite / preToolUse denies in the same slice — too much surface
before Stop parity ships; (d) separate duplicated hook scripts per tool —
drift risk.

### 2026-07-14 — replaced `npx --yes pkg@version cmd` with explicit install + invoke, everywhere it appeared

**Decision:** in three places — this repo's own
`.github/workflows/agent-room-validate.yml`, the scaffolded
`templates/adapters/ci/github-actions.yml.tmpl`, and the published
composite Action (`action.yml`) — replaced `run: npx --yes
create-agent-room@<version> <cmd> <target>` with a separate `npm
install -g create-agent-room@<version>` step followed by `run:
create-agent-room <cmd> <target>`. Also updated the one-line CI example
in `README.md`'s `lint-sessions` section for consistency, and a
`test/init.test.js` assertion that checked for the old pattern.
**Why:** `npx --yes pkg@version cmd` failed reproducibly (twice,
identically) on real GitHub Actions runs immediately after re-pinning
this repo's own CI to a specific version — confirmed not a registry/CDN
propagation blip (recurred on a later push, after propagation would
have caught up) and not a broken package (verified published correctly
via `npm pack`/`npm view`, and a clean local repro with matching
Node/npm versions worked). The exact internal npx failure mode wasn't
fully root-caused, but explicit install-then-invoke doesn't depend on
knowing it — it replaces one opaque, bundled mechanism with two
ordinary, independently-diagnosable steps. Fixed in all three places at
once since they shared the identical pattern and therefore the
identical latent bug — every project scaffolded with `--tools git`, and
every user of the published Action, had this same risk.
**Rejected:** treating this repo's own CI failure as an isolated fix
and leaving the scaffolded template / `action.yml` as-is — would have
left the actual product-facing bug (affecting every scaffolded user's
CI and every Marketplace Action consumer) unfixed, since the only
reason it surfaced here first is that this repo's own CI happens to run
on every push.

### 2026-07-14 — excluded the git-hook-missing finding from check:doctor's CI gate specifically, not from doctor itself

**Decision:** `scripts/check-doctor-clean.js` now filters out the one
`getFindings()` advisory message matching `lists "git" as a tool, but
.git/hooks/pre-commit does not exist` before deciding whether to fail
the build. `lib/doctor.js`'s own logic is unchanged — `doctor` still
reports this finding normally when run by a human on their own machine.
**Why:** git hooks live in `.git/hooks/`, which is never part of the
tracked file tree — no `git checkout` (including `actions/checkout`)
ever restores it, by design, since checking out a repo must never
implicitly execute hook code. That makes this one specific finding
structurally unsatisfiable in *any* CI checkout, for this repo or any
project shaped like it — CI enforces guardrails via `validate`, not the
git hook, which is explicitly a local-machine safeguard (a pre-commit
hook can't meaningfully run in CI anyway, since CI triggers on
push/PR events, not on the act of committing). Discovered when
`check:doctor`'s very first real CI run failed on exactly this — see
`.agent-room/anti-patterns.md`, 2026-07-14.
**Rejected:** changing `checkConfigRealityMismatch()` in `lib/doctor.js`
itself to stop reporting this — would remove genuinely useful advice for
a human who scaffolded with `--tools git` but never actually got the
hook installed locally (e.g. `init` failed partway, or they cloned
someone else's already-scaffolded repo without re-running `init --git`).

### 2026-07-14 — added a project-specific `check:doctor` CI gate instead of changing doctor's own exit-code contract

**Decision:** three `doctor` findings on this repo (hook drift, legacy
`forbiddenActions` format, CI `@latest` pin) were fixed directly, and a
new `scripts/check-doctor-clean.js` was wired into this project's own
`.github/workflows/ci.yml` as `npm run check:doctor` — it fails the build
if `getFindings('.')` (a new pure function extracted from
`lib/doctor.js`, same pattern as `collectFindings()` in `lib/checks.js`)
returns any critical or advisory item for this repo. `doctor`'s own CLI
behavior, wording, and always-zero exit code for end users are
unchanged.
**Why:** `doctor` is deliberately advisory for end users — a scaffolded
room's hooks or CI file might be legitimately customized, so it must
never block someone else's build over a difference it doesn't have
context for. That correctness is exactly why the same class of drift
recurred three times in this repo specifically: nothing was ever
required to run `doctor` here, and CI never called it. Rather than
weaken `doctor`'s advisory-only contract for everyone to close that gap,
add a gate that only applies to this repo's own CI, mirroring
`check:lockfile`'s shape exactly.
**Rejected:** making `doctor` exit non-zero whenever it finds anything —
would break the tool's own stated design (`doctor` vs. `validate`: see
the 2026-07-10 entry below) for every user who intentionally customized
a hook or hasn't gotten around to bumping a CI pin yet.

### 2026-07-13 — enforced `scopeGuidance` and added a durable bypass log, both in the pre-commit hook

**Decision:** found two real gaps by auditing this project's own guardrails
machinery: (1) `guardrails.json`'s `scopeGuidance` (`maxFilesPerChange`,
`maxLinesPerChange`) was declared in the shipped schema but never read
anywhere — a 60-file, 3,000-line commit shipped with zero friction despite
the schema explicitly modeling "this is too big to have been meaningfully
reviewed." (2) `GUARDRAILS_BYPASS` correctly warns on override but only to
the terminal — no durable record of who bypassed a guardrail, when, or
what was being overridden. Fixed both in
`templates/adapters/git-hooks/guardrails-check.js`: `scopeGuidance` is now
enforced as a third check alongside `protectedPaths`/`forbiddenActions`
(same `violations` array, same `GUARDRAILS_BYPASS` escape hatch, no new
severity tier), and a new `logBypass()` helper appends an entry (ISO
timestamp, `git config user.name`/`user.email`, reason) to
`.agent-room/guardrails-bypass-log.md` on every bypass, auto-staging it
into the same commit it records.
**Why:** both gaps map onto a real risk pattern in AI-assisted development —
small, individually-reasonable decisions compound invisibly (an
agent-generated commit that "just works" but was never reviewed at that
scale), and bypassing a control that isn't tracked diffuses accountability
(nobody can answer "who decided to override this and why" after the fact).
`scopeGuidance` enforcement had to exempt the genesis commit — verified
necessary, not theoretical: a normal `init --tools git --git` scaffold is
25 files / 1,569 insertions, already over the shipped defaults (20 files /
500 lines), so without the exemption the tool would have immediately
blocked its own onboarding flow, the same class of bug already fixed once
for `protectedPaths`. The bypass log is deliberately **not** added to
`protectedPaths` — the hook's own auto-stage of the log would otherwise
trip a protected-path violation on the same commit it's trying to record
(a bypass-loop).
**Rejected:** tamper-detection for the bypass log itself (e.g. diffing
against HEAD to catch someone shrinking it, the same technique already
used for `guardrails.json`'s self-weakening protection) — out of scope
for v1; git history is the tamper-evidence for now, same posture as
`decisions.md`/`anti-patterns.md`, neither of which have special
anti-tampering either. Also found and fixed in passing: this repo's own
`.agent-room/hooks/guardrails-check.js` had drifted from
`templates/adapters/git-hooks/guardrails-check.js` since before this
session (predating even the genesis-commit and forbiddenActions-schema
fixes) — `doctor` had been correctly flagging it as drifted the whole
time; re-synced it as part of this change since it's the exact file being
touched here.

<!-- no-log: 2026-07-10 v2.1.0 release commit — routine release mechanics (version bump, lockfile re-sync, action.yml lockstep bump, CHANGELOG [Unreleased]→[2.1.0]). The CHANGELOG and the per-feature decisions.md entries below are the record; nothing new to add here. -->

### 2026-07-10 — DRY'd the tool adapters into a table, but kept `claude`/`git` as explicit blocks

**Decision:** replaced the four near-identical `cursor`/`windsurf`/`cline`/
`codex` blocks in `runInit` (each a single `copyFileInherited` wrapped in
`Object.assign({ path }, ...)`) with a module-level `SIMPLE_TOOL_ADAPTERS`
table and one loop. Deliberately left `claude` and `git` OUT of the table
and as their own explicit `if (tools.includes(...))` blocks.
**Why:** `claude` and `git` aren't single-file copies — `claude` also
mirrors skills into `.claude/` and installs the Stop hook, and `git`
needs an initialized repo and installs two hook files (`pre-commit` +
`guardrails-check.js`) plus scaffolds the CI workflow. Forcing them into
a "template -> destParts" table would mean the table needs an escape
hatch (per-entry callbacks / side-effect flags) for exactly two of six
tools, which is more complexity than the four uniform cases save. The
table earns its keep precisely because it only describes the cases that
are actually uniform. Net −30 lines, all 115 tests green, verified
end-to-end that all four adapters (including `codex`, which had no
explicit test) still scaffold with correct `{{VAR}}` interpolation.
**Rejected:** a fully general adapter table with optional
`sideEffect`/`postCopy` hooks covering all six tools — it would put the
two genuinely-special tools' logic behind an indirection for no real
dedup gain, making the common path harder to read to accommodate two
outliers.

### 2026-07-10 — added a CI check for package.json/package-lock.json version drift as a small Node script, not an inline shell one-liner

**Decision:** added `scripts/check-lockfile-version.js` (compares
`package.json`'s `version` against both `package-lock.json`'s top-level
`version` and `packages[""].version`) and wired it into `.github/workflows/ci.yml`
as `npm run check:lockfile`, run right after `npm ci` and before `lint`/`test`.
**Why:** this exact drift has bitten the project twice already (see
`.agent-room/anti-patterns.md`), and it's silent — `npm install` no-ops
when dependencies haven't changed, so nothing errors until someone
happens to diff the two files during a release audit. A Node script
(rather than a `jq`/`grep` one-liner in the workflow YAML) matches how
every other check in this repo is written, is testable the same way
(ran it against a deliberately-mismatched copy in the scratchpad to
confirm the failure path exits 1 with a clear message), and doesn't
require assuming `jq` is present on the runner.
**Rejected:** checking both `package.json` and `package-lock.json`
versions in `lib/checks.js`/`doctor` instead — that module is about
auditing a *scaffolded room*, not this repository's own release
hygiene; conflating the two would mean every project scaffolded by this
tool inherits a check about npm publishing that has nothing to do with
them.

### 2026-07-10 — added `doctor`, extracting `lib/checks.js` out of `lib/validate.js` first

**Decision:** added `create-agent-room doctor [target-dir]`, a strictly
read-only advisory command. To share logic with `validate` instead of
duplicating it, pulled `validate`'s structural/schema checks out into a
new pure function, `collectFindings()` in `lib/checks.js`, which both
`lib/validate.js` (thin print/exit-code wrapper now) and `lib/doctor.js`
call. `doctor` adds three checks `validate` intentionally doesn't do,
because they're advisory rather than pass/fail: hook-file drift against
the currently installed CLI's templates (`pre-commit`,
`guardrails-check.js`, `close-the-loop-check.js` — verified these three
have no per-project `{{VAR}}` interpolation, so direct content comparison
is valid), a CI workflow pinned to a stale or `@latest`
`create-agent-room` version, and `.agent-room.json` claiming a tool
(`claude`/`git`) that isn't actually wired up on disk. On an
unscaffolded directory it calls `detectWorkspace()` (already used by
`init`) and prints the `init` command to run instead of failing.
**Why:** `validate` is a CI gate — it has to stay exit-code-driven and
narrowly scoped to "is this room structurally valid," or CI becomes noisy
and gets ignored. `doctor` is for a human (or agent) who wants a "what's
wrong and what would I run to fix it" answer, including for projects that
never ran `init` at all, which `validate` can't do since it assumes
`.agent-room/` exists. Refactoring `collectFindings()` out first, rather
than writing `doctor`'s own copy of the structural checks, means the two
commands can't silently drift on what counts as an error.
**Rejected:** letting `doctor` surface `collectFindings()`'s
principles.md/workflow-classifier.md/coordination/ warnings as actionable
"Recommended" items — caught in manual testing that these three warnings
can *only* ever fire for a deliberately `--profile minimal` room (by
construction of `collectFindings`'s own logic), so flagging them read as
noise on the single most common case (a fresh default room), and the
suggested `init --force` fix wouldn't even resolve them (`--profile full`
would). Filtered those three exact messages out of `doctor`'s advisory
list and replaced them with an accurate note instead.
**Rejected:** giving `doctor` a non-zero exit code or wiring it into the
scaffolded CI workflow — it's meant to be run by a human deciding what to
fix, not to gate a build; that's what `validate` is for.

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

### 2026-08-03 — scaffold eval as a default CI step, not an optional comment

**Decision:** the git-adapter scaffold
(`.github/workflows/agent-room-validate.yml` from
`templates/adapters/ci/github-actions.yml.tmpl`) now runs
`create-agent-room eval` after `validate` and `lint-sessions` on every
push/PR — an always-on step, not a commented optional block.
**Why:** Layer 4 in `docs/enforcement-model.md` exists to catch governance
regressions after CLI upgrades; this repo already dogfoods `eval` in
`.github/workflows/ci.yml`. Making it default for adopters closes the gap
between "documented enforcement model" and "what `init --tools git`
actually wires," with near-zero cost (packaged fixtures, no API keys, fast).
**Rejected:** commented optional step — would leave most adopters without
Layer 4 unless they noticed and uncommented it, recreating the same
"documented but not scaffolded" drift `validate`/`lint-sessions` had
before v1.3.0.

<!-- no-log: regenerated demo.gif + README caption; routine media refresh, no design decision. -->

<!-- no-log: launch playbooks + Marketplace marked done on ROADMAP; routine docs. -->

### 2026-09-23 — remote PR anti-tamper and rule weakening audit gate in CI

**Decision:** integrated `auditPullRequest` as the 6th check stage in `create-agent-room ci` (`pr`), evaluating git PR diffs relative to `--base <ref>` (or auto-detected `GITHUB_BASE_REF` / `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`). The gate detects deletion of `.agent-room/guardrails.json`, rule weakening across `protectedPaths`, `forbiddenActions`, `scopeGuidance`, `importBoundaries`, `scopeBoundaries`, `verifyOnCommit`, and `strictWaivers`, and blocks merge unless authorized via an auditable bypass entry in `.agent-room/guardrails-bypass-log.md` added directly in the PR diff. It also verifies presence of a session log when non-scaffold code files are touched.
**Why:** autonomous coding agents running in branches or PRs can alter guardrails configuration, lower file/line thresholds, or delete protected paths to bypass pre-commit hooks. Local hooks are ineffective once code is pushed; CI is the authoritative gatekeeper. Enforcing anti-tamper and rule weakening checks in CI ensures all governance loosening is auditable and tracked in Git history with explicit reasons and ticket references.
**Rejected:** (a) blocking any modification to `guardrails.json` entirely — would prevent legitimate architectural evolution and repo administration; (b) requiring external API checks or third-party webhooks — violates CAR's zero external runtime dependencies constraint; (c) separate standalone command requiring separate CI step — unifying inside `create-agent-room ci` maintains zero friction and consolidated Markdown reporting.

### 2026-09-26 — mechanical seatbelts for RPI execution (Story 9.5)

**Decision:** Backed the Research → Plan → Implement (RPI) pipeline with CAR's signature runtime mechanical enforcement across commit gates and agent turn boundaries, ensuring agents cannot quietly abandon approved plans or skip verification mid-stream:
1. **Core Plan Parsing & State Checkpoint Utility (`lib/plan.js`):** Built zero-dependency parser functions (`parsePlan`, `findActivePlan`, `getPlanResumptionPoint`) extracting YAML frontmatter, phases, task checkboxes (`- [ ]` vs `- [x]`), automated verification commands (`*Automated Verification:* \`...\``), and resumption points. Provides deterministic recovery from LLM context window compaction or fresh session spawns.
2. **Pre-Commit Blast Radius & Plan Gate (`guardrails-check.js`):** In `templates/adapters/git-hooks/guardrails-check.js` and `.agent-room/hooks/guardrails-check.js`, if staged changes touch >5 non-scaffold files across multiple directories (`dirs.size > 1`), mandate that a corresponding plan exists in `docs/plans/` (or is staged). Multi-file cross-directory changes without a plan or an explicit waiver (`<!-- no-plan: ... -->` in `.agent-room/decisions.md` or `GUARDRAILS_BYPASS=1`) are blocked with actionable violation diagnostics. Localized fixes (<= 5 files or within a single directory) follow the lightweight Bug Flow without RPI plan overhead.
3. **Stop Hook Phase Verification Gate (`close-the-loop-check.js`):** In `templates/adapters/claude-hooks/close-the-loop-check.js` and `.agent-room/hooks/close-the-loop-check.js`, when non-scaffold files are modified and an active plan exists in `docs/plans/`, discovers the verification command for the completed or in-progress phase and executes it before allowing turn completion. If verification fails, exits 2 (Claude Code) or emits `followup_message` (Cursor) with bounded test failure output.
**Why:** While procedural skill instructions define the 5-stage RPI methodology, LLMs can experience context compaction or attempt shortcuts under complex tasks. Prompt-level instructions alone cannot prevent an agent from abandoning a plan or claiming tasks pass without executing tests. Mechanical enforcement at `git commit` and Stop hook turn boundaries provides hard programmatic guarantees without adding external npm dependencies or interrupting rapid single-file bug fixes.
**Rejected:** Blocking small bug fixes (<= 5 files in a single directory) with mandatory plan requirements (excessive process overhead for trivial defect repairs); invoking external LLMs to evaluate plan compliance (CAR strictly relies on fast, local, deterministic regex and git state inspection).


