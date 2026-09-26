---
date: 2026-09-26T04:27:34Z
git_commit: b36033f27732fa9a08f31c805de94ab73f83d922
branch: feature/story-9.5-mechanical-seatbelts
repository: create-agent-room
topic: "Mechanical Seatbelts for RPI Execution (Story 9.5)"
tags: [research, rpi, seatbelts, stop-hook, guardrails, plan-gate]
status: complete
last_updated: 2026-09-26
---

# Research: Mechanical Seatbelts for RPI Execution (Story 9.5)

## Research Question
How can CAR's signature runtime mechanical enforcement (`close-the-loop-check.js` stop hook and `guardrails-check.js` pre-commit hook) be extended to guarantee that AI agents adhere to the Research → Plan → Implement (RPI) pipeline without silently skipping verification or abandoning approved plans mid-stream?

---

## Summary
The RPI methodology relies on 5 disciplined stages: Research, Plan, Implement, Audit, and Deliver. While skills provide prompt-level instructions, LLMs can experience context window compaction, hallucinations, or process shortcuts. Story 9.5 introduces mechanical seatbelts across turn gates and commit gates:

1. **Stop Hook Phase Verification (`close-the-loop-check.js`):**
   - Active at turn boundary when Claude Code or Cursor attempts to finish.
   - When non-scaffold files are modified and an active implementation plan exists in `docs/plans/`, verify that automated verification commands defined for the active/completed phase pass clean before allowing turn completion.
2. **Pre-Commit Blast Radius & Plan Gate (`guardrails-check.js`):**
   - Active at `git commit` via pre-commit hook.
   - If staged changes touch >5 non-scaffold files across multiple directories (`dirs.size > 1`), mandate that a corresponding implementation plan exists in `docs/plans/` (or require an explicit waiver log `<!-- no-plan: ... -->` / `GUARDRAILS_BYPASS=1`).
3. **State Checkpoint Resiliency & Plan Parser (`lib/plan.js`):**
   - Provide a zero-dependency plan parsing utility that parses YAML frontmatter and phase task checkboxes (`- [ ]` vs `- [x]`).
   - Identifies active phase, completed phases, and first unchecked task to guarantee deterministic resumption across fresh sessions or context compaction.

---

## Detailed Findings

### 1. Stop Hook Architecture in `close-the-loop-check.js`
- **Location:** Packaged in [`templates/adapters/claude-hooks/close-the-loop-check.js`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/templates/adapters/claude-hooks/close-the-loop-check.js) and dogfooded in [`.agent-room/hooks/close-the-loop-check.js`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/.agent-room/hooks/close-the-loop-check.js).
- **Execution Lifecycle:**
  - Evaluated on agent stop (Claude Code Stop event, Cursor stop hook).
  - Currently evaluates:
    1. Pre-stop test verification gate (lines 340-387).
    2. Scope boundaries gate (lines 389-400).
    3. Log touch / waiver check (lines 402-460).
- **Extension for RPI Phase Verification:**
  - Scan `docs/plans/` for the active plan matching current git branch (`git branch --show-current`) or latest plan where `status !== 'complete'`.
  - If an active plan exists and non-scaffold files changed:
    - Inspect completed phases or active phase verification commands (e.g. `*Automated Verification:* \`...\`` or test/lint commands).
    - If defined, execute the verification command; if it fails, block turn with structured remediation error and output snippet.

### 2. Pre-Commit Hook Architecture in `guardrails-check.js`
- **Location:** Packaged in [`templates/adapters/git-hooks/guardrails-check.js`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/templates/adapters/git-hooks/guardrails-check.js) and dogfooded in [`.agent-room/hooks/guardrails-check.js`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/.agent-room/hooks/guardrails-check.js).
- **Execution Lifecycle:**
  - Evaluated on `git commit`.
  - Currently checks:
    1. Anti-tamper on `.agent-room/guardrails.json`.
    2. Protected paths.
    3. Forbidden actions (credentials, secrets).
    4. Scope boundaries (`scopeBoundaries`).
    5. Import boundaries (`importBoundaries`).
    6. Strict waivers (`strictWaivers`).
    7. Test verification on commit (`verifyOnCommit`).
- **Extension for Multi-File Plan Gate:**
  - Filter `nonScaffoldStaged = stagedFiles.filter(p => !isScaffoldPath(p))`.
  - Compute distinct directories: `dirs = new Set(nonScaffoldStaged.map(p => path.dirname(p)))`.
  - If `nonScaffoldStaged.length > 5 && dirs.size > 1`:
    - Check if a plan exists in `docs/plans/` (or in staged files).
    - Check for plan waiver in decisions log (`<!-- no-plan: ... -->`) or `GUARDRAILS_BYPASS=1`.
    - If absent, reject commit with structured violation message.

### 3. Plan Parsing & Checkpoint Utility (`lib/plan.js`)
- **Needs:**
  - A clean, zero-dependency Markdown plan parser.
  - Frontmatter parser: extracts `date`, `research_doc`, `branch`, `status`, `phases_total`, `phases_completed`.
  - Phase parser: extracts `## Phase N` headers, task items `- [ ]` vs `- [x]`, and `Automated Verification` commands.
  - State calculation: `phases_total`, `phases_completed`, `active_phase`, `first_unchecked_task`, `is_resuming`.
  - Dogfood and export via `lib/plan.js` for CLI / test / hook consumption.

---

## Code References
- `templates/adapters/claude-hooks/close-the-loop-check.js:340-387` - Pre-Stop Test Verification Gate
- `templates/adapters/git-hooks/guardrails-check.js:250-295` - Pre-Commit Scope Boundary Checks
- `lib/checks.js:280-345` - Plan frontmatter validation
- `lib/init.js:726-753` - Stop hook script scaffolding

## Constraints & Invariants
- Zero third-party runtime dependencies.
- Plan gate must never block scaffold files, docs, or genesis/initial commits.
- Bypasses must remain auditable (`GUARDRAILS_BYPASS=1` or `<!-- no-plan: ... -->`).
- All tests must pass clean (`npm test`), lint clean (`npm run lint`), and validate passes.
