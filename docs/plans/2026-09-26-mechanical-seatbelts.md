---
date: 2026-09-26T04:30:00Z
research_doc: docs/research/2026-09-26-mechanical-seatbelts.md
branch: feature/story-9.5-mechanical-seatbelts
status: planned
phases_total: 5
phases_completed: 5
status: complete
last_updated: 2026-09-26
---

# Implementation Plan: Mechanical Seatbelts for RPI Execution (Story 9.5)

## Context & Objectives
Story 9.5 backs the Research → Plan → Implement (RPI) pipeline with runtime mechanical enforcement so agents cannot quietly abandon the process mid-stream:
1. **Stop Hook Phase Verification (`close-the-loop-check.js`):** When an active plan exists in `docs/plans/` and files are modified, verify that the automated verification command for the completed phase passed before allowing the agent to end its turn.
2. **Pre-Commit Blast Radius & Plan Gate (`guardrails-check.js`):** If staged changes touch >5 non-scaffold files across multiple directories, verify that a corresponding implementation plan exists under `docs/plans/` (or require an explicit waiver log / `GUARDRAILS_BYPASS=1`).
3. **State Checkpoint Resiliency (`lib/plan.js`):** Plan parsing utility verifying disk-backed checkbox updates (`- [x]`) so agents surviving context compaction or fresh session spawns pick up exactly where execution left off without state loss.

---

## Phased Execution Checklist

### Phase 1: Core Plan Parser & State Checkpoint Utility (`lib/plan.js`)
- [x] Create `lib/plan.js` with zero-dependency functions:
  - `parsePlan(markdownContent)`: extracts frontmatter, phases, checkboxes (`- [ ]`, `- [x]`), automated verification commands.
  - `findActivePlan(target, currentBranch)`: discovers active plan in `docs/plans/` matching current branch or latest non-complete plan.
  - `getPlanResumptionPoint(plan)`: extracts active phase index, completed counts, and first pending task.
- [x] Create `test/plan.test.js` covering plan parsing, checkbox counting, verification command extraction, and resumption discovery.
*Automated Verification:* `node --test test/plan.test.js` and `npm run lint`.

### Phase 2: Pre-Commit Blast Radius & Plan Gate (`guardrails-check.js`)
- [x] Update `templates/adapters/git-hooks/guardrails-check.js` and dogfood `.agent-room/hooks/guardrails-check.js`:
  - When `stagedFiles` contain >5 non-scaffold files across >1 distinct directories (`dirs.size > 1`):
  - Check whether a plan exists in `docs/plans/` or is staged.
  - Check for waiver in `.agent-room/decisions.md` (`<!-- no-plan: ... -->`) or `GUARDRAILS_BYPASS=1`.
  - Block commit with clear violation message if no plan or waiver is present.
- [x] Add unit tests in `test/guardrails-check.test.js` covering multi-file commits with plan, without plan (rejected), and with waiver.
*Automated Verification:* `node --test test/guardrails-check.test.js`.

### Phase 3: Stop Hook Phase Verification Gate (`close-the-loop-check.js`)
- [x] Update `templates/adapters/claude-hooks/close-the-loop-check.js` and dogfood `.agent-room/hooks/close-the-loop-check.js`:
  - In `checkClosingTheLoop`: when non-scaffold files changed and an active plan exists in `docs/plans/`:
  - Extract the verification command for the active/completed phase.
  - Run the phase verification command and ensure exit code 0.
  - Return formatted failure message if the phase verification command fails.
- [x] Add unit tests in `test/close-the-loop.test.js` covering phase verification pass and fail.
*Automated Verification:* `node --test test/close-the-loop.test.js`.

### Phase 4: Full Suite Verification & Sync Parity
- [x] Ensure hook templates and dogfood hooks are synchronized.
- [x] Run full test suite and linter.
*Automated Verification:* `npm test && npm run lint && node bin/cli.js validate .`.

### Phase 5: Governance, Backlog & Audit Report
- [x] Update `BACKLOG.md` (mark Story 9.5 as DONE).
- [x] Append architectural decision to `.agent-room/decisions.md`.
- [x] Author plan validation audit in `docs/reviews/2026-09-26-story-9-5-validation.md`.
- [x] Author session log in `.agent-room/sessions/`.
*Automated Verification:* `node bin/cli.js validate .` and `npm run lint`.

---

## What We're NOT Doing
- We are NOT removing deprecated skills in this story (`brainstorming`, `verification-before-completion`) — that is Story 9.6.
- We are NOT blocking small defect fixes (Bug Flow) touching <=5 files within a single directory — those intentionally bypass RPI plan overhead.
- We are NOT adding third-party parser dependencies; plan parsing is implemented with lean native regex/string scanning.

---

## Success Criteria & Verification
- `lib/plan.js` accurately parses plan structure, checkboxes, verification commands, and resumption point.
- Pre-commit hook enforces plan gate for >5 files across multiple directories.
- Stop hook enforces phase verification commands when an active plan exists.
- All unit and integration tests pass cleanly (`npm test`).
- Linter passes with 0 errors and 0 warnings.
- Repository passes `create-agent-room validate .`.
