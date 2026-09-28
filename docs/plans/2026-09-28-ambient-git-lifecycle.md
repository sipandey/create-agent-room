---
date: 2026-09-28T09:07:00Z
research_doc: docs/research/2026-09-28-ambient-git-lifecycle.md
branch: feature/ambient-git-lifecycle
status: completed
phases_total: 4
phases_completed: 4
---

# Ambient Git Lifecycle Governance (Stories 6.3 & 6.4) Implementation Plan

**Goal:** Implement ambient session tracking on `post-commit` (Story 6.3) and automatic multi-assistant rule synchronization on `post-checkout` / `post-merge` (Story 6.4), standardizing git lifecycle automation through first-class CLI actions in `create-agent-room hook`.

**Architecture:** Extend `lib/hook.js` with first-class handlers (`runPostCommit`, `runPostCheckout`, `runPostMerge`) and CLI actions (`hook post-commit`, `hook post-checkout`, `hook post-merge`). In `lib/session.js`, implement active session discovery and non-destructive commit appending without blocking test suite execution. In `lib/sync.js`, add quiet mode for unobtrusive hook sync. Update packaged templates (`post-commit.tmpl`, `post-checkout.tmpl`, `post-merge.tmpl`) to delegate to the new hook actions with local CLI fallbacks.

**Tech Stack:** Node.js standard library (`fs`, `path`, `child_process`, `node:test`, `node:assert`). Zero external dependencies.

---

## Current State Analysis
- `lib/hook.js` manages 5 supported hooks (`pre-commit`, `pre-push`, `post-commit`, `post-checkout`, `post-merge`) with delimited chaining, but only `pre-push` has programmatic dispatchers (`runPrePush` / `runPrePushCli`).
- `templates/adapters/git-hooks/post-commit.tmpl` calls `create-agent-room session . --record --status "In Progress"`, which creates a brand new timestamped file on every commit and runs tests synchronously (`verifyProject`), stalling commits.
- `post-checkout.tmpl` and `post-merge.tmpl` call raw `sync . --all >/dev/null 2>&1`, lacking structured error handling, declarative config checks, or testable programmatic interfaces.

### Key Discoveries:
- `lib/hook.js:638-720`: `runPrePush` provides the canonical pattern for hook bypasses (`CAR_SKIP_HOOK`, `CAR_SKIP_<HOOK>`), declarative config parsing from `.agent-room.json`, and clean CLI output formatting.
- `lib/session-utils.js:218-223`: `getLatestSession` retrieves recent session files, which can be extended to find in-progress sessions for the active branch.
- `lib/sync.js:416-560`: `runSync` is fully idempotent and supports `--all` across 6 assistant adapters, but prints verbose output that needs a `quiet` flag for ambient hooks.

---

## Desired End State
1. **`create-agent-room hook post-commit` (Story 6.3):**
   - Automatically detects current HEAD commit hash, subject, author, and changed files via `git diff-tree`.
   - Locates any active `In Progress` session in `.agent-room/sessions/` matching the branch/topic or day.
   - If an active session exists, non-destructively appends the commit to `## Actions taken` and touched files to `## Files touched`.
   - If no active session exists, scaffolds a new session log with `status: In Progress`.
   - Skips running test suites during commits to guarantee execution in under 50ms.
2. **`create-agent-room hook post-checkout` & `post-merge` (Story 6.4):**
   - `post-checkout` checks `$3` (branch switch flag); skips file checkouts (`$3 === "0"`).
   - On branch checkout or pull/merge, automatically runs `runSync(target, { all: true, quiet: true })`.
   - Idempotently ensures `.cursor/rules/`, `.claude/skills/`, `.windsurfrules`, `.github/copilot-instructions.md`, `.clinerules`, and `.codexrules` are in exact parity with `.agent-room/skills/`.
3. **Declarative Configuration & Bypasses:**
   - Supports `.agent-room.json` overrides: `hooks.postCommit`, `hooks.postCheckout`, `hooks.postMerge` with `{ enabled: false }`.
   - Supports environment bypasses: `CAR_SKIP_HOOK=1`, `CAR_SKIP_POST_COMMIT=1`, `CAR_SKIP_POST_CHECKOUT=1`, `CAR_SKIP_POST_MERGE=1`.
4. **Packaged Templates:**
   - `templates/adapters/git-hooks/{post-commit,post-checkout,post-merge}.tmpl` updated to delegate to the new CLI actions.
5. **Quality & Verification:**
   - 100% test pass rate with new unit tests in `test/hook.test.js` and `test/session.test.js`.
   - Clean lint (`npm run lint`) and room validation (`node bin/cli.js validate .`).

---

## What We're NOT Doing
- **NO blocking test execution in `post-commit`:** Unit tests belong in pre-stop checks (`close-the-loop-check.js`) and pre-push CI simulation (`pre-push.tmpl`), not in `post-commit`.
- **NO breaking existing manual `create-agent-room session`:** Explicit `--record` and manual options remain 100% backward compatible.
- **NO external dependencies:** Everything implemented using Node.js standard library.

---



## Phase 1: Ambient Session Tracking Engine (Story 6.3)
- [x] Implement `findActiveSession` and `recordAmbientCommit` in `lib/session.js`
- [x] Implement `resolvePostCommitConfig`, `runPostCommit`, and `runPostCommitCli` in `lib/hook.js`
- [x] Update `templates/adapters/git-hooks/post-commit.tmpl`
- [x] Automated verification for Phase 1

### Overview
Implement active session discovery and ambient commit tracking in `lib/session.js`, and wire `runPostCommit` / `runPostCommitCli` in `lib/hook.js`.

### Changes Required:
1. **`lib/session.js` / `lib/session-utils.js`**:
   - Implement `findActiveSession(target, branch)`:
     - Scans `.agent-room/sessions/` for markdown files.
     - Parses header and status. Returns the path of the first session matching `**Status:** In Progress` and matching the current branch or topic.
   - Implement `recordAmbientCommit(target, options)`:
     - Extracts HEAD commit SHA (`git rev-parse HEAD`), short SHA (`git rev-parse --short HEAD`), commit subject (`git log -1 --pretty=%s`), and commit author (`git log -1 --pretty=%an`).
     - Extracts files changed in the commit via `git diff-tree --no-commit-id --name-status -r HEAD`.
     - If an active session is found via `findActiveSession`:
       - Reads existing content.
       - Appends `Commit <shortSha>: <subject>` to `## Actions taken` if not already present.
       - Appends newly touched files to `## Files touched` (`- Created:` / `- Modified:`) if not already present.
       - Checks for new decisions in `.agent-room/decisions.md` and appends to `## Decisions made`.
       - Saves updated file.
     - If no active session is found:
       - Invokes `createSession(target, { name: branch, status: 'In Progress', record: false, skipVerify: true })` and populates the initial commit and files.
2. **`lib/hook.js`**:
   - Implement `resolvePostCommitConfig(target)`.
   - Implement `runPostCommit(target, options)`:
     - Checks bypass flags (`CAR_SKIP_HOOK`, `CAR_SKIP_POST_COMMIT`).
     - Checks `.agent-room.json` (`hooks.postCommit.enabled !== false`).
     - Calls `recordAmbientCommit(target, options)`.
     - Returns `{ ok: true, skipped: false, action: 'updated' | 'created', sessionPath }`.
   - Implement `runPostCommitCli(target, options)`.
3. **`templates/adapters/git-hooks/post-commit.tmpl`**:
   - Update script to delegate to `create-agent-room hook post-commit` with fallback to `node bin/cli.js hook post-commit`.

### Verification Commands:
- `node --test test/session.test.js`
- `node --test test/hook.test.js`

---

## Phase 2: Multi-Assistant Rule Sync Engine (Story 6.4)
- [x] Add `quiet` mode to `runSync` in `lib/sync.js`
- [x] Implement `runPostCheckout`, `runPostMerge`, and CLI dispatchers in `lib/hook.js`
- [x] Update `post-checkout.tmpl` and `post-merge.tmpl`
- [x] Automated verification for Phase 2

### Overview
Enhance `lib/sync.js` with quiet mode and implement `runPostCheckout` and `runPostMerge` in `lib/hook.js`.

### Changes Required:
1. **`lib/sync.js`**:
   - Add `quiet: Boolean(args && args.quiet)` to `runSync(target, args)`.
   - In quiet mode, suppress verbose "up-to-date" logs, logging only when files are actively written/synced, deprecated skills purged, or on errors.
2. **`lib/hook.js`**:
   - Implement `resolvePostCheckoutConfig(target)` and `resolvePostMergeConfig(target)`.
   - Implement `runPostCheckout(target, options)`:
     - Checks `$3` (branch flag). If `$3 !== '1'` and `$3 !== undefined` (file checkout), returns `{ ok: true, skipped: true, reason: 'file-checkout' }`.
     - Checks bypass env vars (`CAR_SKIP_HOOK`, `CAR_SKIP_POST_CHECKOUT`).
     - Checks `.agent-room.json` (`hooks.postCheckout.enabled !== false`).
     - Calls `runSync(target, { all: true, quiet: true })`.
     - Returns `{ ok: true, skipped: false, action: 'synced' }`.
   - Implement `runPostCheckoutCli(target, options)`.
   - Implement `runPostMerge(target, options)`:
     - Checks bypass env vars (`CAR_SKIP_HOOK`, `CAR_SKIP_POST_MERGE`).
     - Checks `.agent-room.json` (`hooks.postMerge.enabled !== false`).
     - Calls `runSync(target, { all: true, quiet: true })`.
     - Returns `{ ok: true, skipped: false, action: 'synced' }`.
   - Implement `runPostMergeCli(target, options)`.
3. **`templates/adapters/git-hooks/post-checkout.tmpl` & `post-merge.tmpl`**:
   - Update `post-checkout.tmpl` to invoke `create-agent-room hook post-checkout "$1" "$2" "$3"`.
   - Update `post-merge.tmpl` to invoke `create-agent-room hook post-merge "$1"`.

### Verification Commands:
- `node --test test/sync.test.js`
- `node --test test/hook.test.js`

---

## Phase 3: Hook CLI Dispatch & Configuration Integration
- [x] Wire `post-commit`, `post-checkout`, and `post-merge` into `runHookCli`
- [x] Update `bin/cli.js` hook options and help text
- [x] Update `lib/doctor.js` static hook drift detection
- [x] Automated verification for Phase 3

### Overview
Wire `post-commit`, `post-checkout`, and `post-merge` subcommands into `runHookCli` and `bin/cli.js`, and ensure `doctor` validates hook templates without false drift.

### Changes Required:
1. **`lib/hook.js`**:
   - Update `runHookCli(target, action, args, options)`:
     - Add cases for `post-commit`, `post-checkout`, and `post-merge`.
     - Support `--json` and human-friendly terminal outputs.
2. **`bin/cli.js`**:
   - Update CLI help text for `hook` subcommand:
     `create-agent-room hook [install|status|uninstall|pre-push|post-commit|post-checkout|post-merge]`
   - Forward positional arguments to `runHookCli`.
3. **`lib/doctor.js`**:
   - Update `checkHookDrift` so that if `post-commit`, `post-checkout`, or `post-merge` are installed with delimited blocks, CAR strips shebang and checks body equality against current templates without false positive drift.

### Verification Commands:
- `node bin/cli.js hook status`
- `node bin/cli.js doctor .`

---

## Phase 4: Automated Testing & Documentation Synchronization
- [x] Add unit and integration tests in `test/hook.test.js`
- [x] Update `ROADMAP.md` (Stories 6.3 & 6.4 completed)
- [x] Update `CAPABILITIES.md` (ambient git lifecycle governance)
- [x] Update `README.md`
- [x] Run full test suite, lint, and validation

### Overview
Add comprehensive unit and integration tests covering ambient hook execution, bypasses, and multi-tool synchronization. Synchronize project documentation.

### Changes Required:
1. **`test/hook.test.js`**:
   - Test `runPostCommit`: bypasses (`CAR_SKIP_POST_COMMIT=1`, `CAR_SKIP_HOOK=1`), disabled config, session creation when none exists, and session updating when in-progress session exists.
   - Test `runPostCheckout`: bypasses on file checkout (`$3 === '0'`), executes sync on branch checkout (`$3 === '1'`).
   - Test `runPostMerge`: executes sync on merge.
   - Test `runHookCli`: dispatches `post-commit`, `post-checkout`, `post-merge` cleanly with `--json`.
   - Test template script execution: verify `post-commit.tmpl`, `post-checkout.tmpl`, and `post-merge.tmpl` run cleanly inside temporary git repositories.
2. **`ROADMAP.md`**:
   - Move Ambient Git Lifecycle Governance (Stories 6.3 & 6.4) from "Next" to "Shipped".
3. **`CAPABILITIES.md`**:
   - Document Ambient Session Tracking and Multi-Assistant Rule Sync under Actively Enforced Features.
4. **`README.md`**:
   - Document the ambient git lifecycle hooks in the Hook Manager section.

### Verification Commands:
- `npm test` (all tests passing)
- `npm run lint` (0 errors, 0 warnings)
- `node bin/cli.js validate .` (repository integrity check)
- `node bin/cli.js lint-sessions .` (session logs check)
