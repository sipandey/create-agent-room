---
date: 2026-09-28T09:02:17Z
git_commit: 8f72b2e3af912a8a8887106e625c779041db3f25
branch: feature/ambient-git-lifecycle
repository: create-agent-room
topic: "Ambient Git Lifecycle Governance (Stories 6.3 & 6.4)"
tags: [research, git-hooks, session-tracking, sync, multi-agent]
status: complete
last_updated: 2026-09-28
---

# Research: Ambient Git Lifecycle Governance (Stories 6.3 & 6.4)

## Research Question
How does `create-agent-room` currently manage git lifecycle hooks, session logging, and multi-agent synchronization, and what technical mechanisms exist to implement ambient session tracking on `post-commit` (Story 6.3) and automatic tool rule synchronization on `post-checkout` / `post-merge` (Story 6.4)?

---

## Summary
The codebase already defines an extensible, non-destructive git hook manager (`lib/hook.js` and `create-agent-room hook`), which manages 5 canonical git lifecycle hooks (`pre-commit`, `pre-push`, `post-commit`, `post-checkout`, `post-merge`) using delimited marker blocks (`# --- create-agent-room hook: <name> ---`). 

Currently:
1. `post-commit.tmpl` invokes `create-agent-room session . --record --status "In Progress"`, but `lib/session.js` creates a fresh, separate session file on every invocation with the current minute timestamp and runs test verification synchronously (`verifyProject`), which creates session log churn and adds unneeded latency to local commits.
2. `post-checkout.tmpl` and `post-merge.tmpl` invoke `create-agent-room sync . --all`, but the underlying commands are executed as raw shell strings in shell templates without dedicated CLI actions or programmatic hook dispatchers in `lib/hook.js` (unlike `runPrePush` / `runPrePushCli` in Story 6.2).
3. Neither `post-commit`, `post-checkout`, nor `post-merge` are configured via `.agent-room.json` or tested for ambient execution across git operations.

---

## Detailed Findings

### 1. Git Hook Architecture & Lifecycle Manager (`lib/hook.js`)
- **Supported Hooks (`lines 8-14`):**
  - `pre-commit`: Runs `.agent-room/hooks/guardrails-check.js`.
  - `pre-push`: Runs local CI simulation (`runPrePush` / `runPrePushCli`) with upstream detection (`detectUpstreamBranch`) and branch deletion filtering.
  - `post-commit`: Intended for ambient session logging.
  - `post-checkout`: Intended for multi-assistant rule sync on branch checkout (`$3 == 1`).
  - `post-merge`: Intended for multi-assistant rule sync after merges/pulls (`$1 == 0 | 1`).
- **Hook Discovery & Chaining (`lines 18-105`):**
  - Resolves `core.hooksPath` if configured (e.g., `.husky/`, `.agent-room/hooks/git/`), otherwise falls back to worktrees / `.git/hooks`.
  - Encapsulates hook bodies inside standard delimited blocks:
    ```sh
    # --- create-agent-room hook: <name> ---
    <body>
    # --- end create-agent-room hook: <name> ---
    ```
  - Preserves third-party / user code when chaining or uninstalling.
- **Hook CLI Dispatch (`lines 494-502`):**
  - Currently handles `pre-push` via `runPrePushCli(target, opts)`.
  - Unknown hook actions fall through to error (`lines 500-502`). Actions for `post-commit`, `post-checkout`, and `post-merge` are missing programmatic dispatchers in `lib/hook.js`.

### 2. Session Logging & State Tracking (`lib/session.js` & `lib/session-utils.js`)
- **Session Scaffolding (`lib/session.js:154-307`):**
  - `createSession(target, topicOrOptions, maybeOptions)` initializes a `SessionLog` instance.
  - File naming: `${log.timestamp}-${topic}.md` where `timestamp` is `YYYY-MM-DD-HH-MM`.
  - In `--record` mode (`lines 205-240`):
    - Reads unstaged/staged git files via `git status --porcelain`.
    - Detects commit messages via `git log -n 5 --oneline` or `git log main..HEAD --oneline`.
    - Detects recent ADRs from `.agent-room/decisions.md`.
    - Executes `verifyProject` synchronously with a 120s timeout.
- **Limitation for Ambient Tracking:**
  - `createSession` assumes a new session file is desired whenever called without an explicit `--output`. Calling it repeatedly during rapid commits creates multiple files (`2026-09-28-14-30-feat.md`, `2026-09-28-14-35-feat.md`).
  - Running `verifyProject` during `post-commit` blocks the developer's terminal for the duration of the test suite (up to 70+ seconds in large repos).
  - Ambient tracking requires discovering the *current active session* for the branch/topic, updating its `## Actions taken` with the new commit SHA and message, updating `## Files touched` with the commit's diff-tree changes, and recording lightweight test status without blocking.

### 3. Multi-Assistant Rule Synchronization (`lib/sync.js`)
- **Sync Engine (`lib/sync.js:416-559`):**
  - `runSync(target, args)` synchronizes skill mirrors and tool instruction files across Claude Code, Cursor, Windsurf, Cline, Codex, and GitHub Copilot.
  - Resolves workspace tools from `.agent-room.json` (`tools`) or auto-detects tool rule files in the target directory (`detectWorkspaceTools`).
  - Idempotency & dirty file protection: `isGitDirty` skips modified tracked rules unless `--force` is passed. Already-synced files report `up-to-date`.
- **Limitation for Ambient Hook Integration:**
  - `runSync` prints verbose terminal output by default. In git hooks (`post-checkout`, `post-merge`), silent/quiet execution is required to avoid noisy output during routine developer operations, unless errors or sync changes occur.
  - The shell templates (`post-checkout.tmpl`, `post-merge.tmpl`) currently call `create-agent-room sync . --all >/dev/null 2>&1 || true`. If `create-agent-room` is not globally installed or run via local CLI, errors are silently swallowed without diagnostics.

### 4. Hook Templates (`templates/adapters/git-hooks/`)
- `post-commit.tmpl`:
  - Currently a basic 18-line script calling `create-agent-room session . --record --status "In Progress"`.
  - Needs delegation to `create-agent-room hook post-commit` (matching the robust pattern in `pre-push.tmpl`).
- `post-checkout.tmpl`:
  - Checks `$3 = "1"` (branch checkout) and runs `sync . --all`.
  - Needs delegation to `create-agent-room hook post-checkout "$1" "$2" "$3"`.
- `post-merge.tmpl`:
  - Checks merge status and runs `sync . --all`.
  - Needs delegation to `create-agent-room hook post-merge "$1"`.

---

## Code References
- `lib/hook.js:8-14` - `SUPPORTED_HOOKS` array defining all 5 lifecycle hooks.
- `lib/hook.js:165-208` - `installHooks` creating/updating delimited hook blocks.
- `lib/hook.js:231-320` - `getHookStatus` inspecting installed, active, and drifted status.
- `lib/hook.js:638-720` - `runPrePush` and `runPrePushCli` reference implementation for hook execution.
- `lib/session.js:50-77` - `detectGitFiles` using `git status --porcelain`.
- `lib/session.js:79-116` - `detectActions` using `git log`.
- `lib/session.js:154-307` - `createSession` main entry point.
- `lib/session-utils.js:218-223` - `getLatestSession` scanning `.agent-room/sessions/`.
- `lib/sync.js:416-560` - `runSync` multi-agent rule synchronization.
- `templates/adapters/git-hooks/post-commit.tmpl` - Packaged post-commit hook template.
- `templates/adapters/git-hooks/post-checkout.tmpl` - Packaged post-checkout hook template.
- `templates/adapters/git-hooks/post-merge.tmpl` - Packaged post-merge hook template.

---

## Key Design Patterns & Conventions Discovered
1. **Zero External Runtime Dependencies:** Standard library only (`node:fs`, `node:path`, `node:child_process`).
2. **Environment Variable Bypasses:** Every hook respects `CAR_SKIP_HOOK=1` as well as hook-specific flags (`CAR_SKIP_POST_COMMIT=1`, `CAR_SKIP_POST_CHECKOUT=1`, `CAR_SKIP_POST_MERGE=1`).
3. **Declarative Config in `.agent-room.json`:**
   Hooks are configured under `hooks.<hookName>` (e.g. `hooks.prePush`, `hooks.postCommit`, `hooks.postCheckout`, `hooks.postMerge`) with `{ enabled: boolean }`.
4. **Delimited Hook Block Chaining:**
   Hooks must never overwrite existing developer scripts; they append/update inside `# --- create-agent-room hook: <name> ---`.
5. **Non-Blocking Hook Execution:**
   Git hooks that run after commits or checkouts must be lightweight and non-blocking. Heavy test executions belong in pre-stop or pre-push, not `post-commit`.

---

## Boundaries and Invariants
- **Non-destructive Session Logging:** Ambient tracking must never erase existing session goals, manual notes, or completed statuses without explicit user intent.
- **Performance:** `post-commit`, `post-checkout`, and `post-merge` must execute within milliseconds (<200ms) to ensure zero noticeable lag in interactive git usage.
- **Cross-Platform Compatibility:** Must work cleanly across macOS, Linux, and Windows Git Bash environments.
- **Backward Compatibility:** Existing `create-agent-room hook install`, `doctor`, and `session` invocations must remain fully compatible.

---

## Related Work & Prior Decisions
- **Story 6.1 (`2026-09-25`):** First-class git hook manager CLI with delimited chaining and custom `core.hooksPath` support.
- **Story 6.2 (`2026-09-25`):** Pre-push local CI simulation gate with upstream detection and branch deletion filtering.
- **Story 4.2 (`2026-09-23`):** Automated session logging & handoff CLI (`create-agent-room session --record`).
- **Story 2.3 (`2026-09-22`):** Unified multi-agent sync engine across 6 AI tools (`create-agent-room sync --all`).
