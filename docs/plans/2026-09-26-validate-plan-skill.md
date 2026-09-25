---
date: 2026-09-25T19:22:00Z
research_doc: docs/research/2026-09-26-validate-plan-skill.md
branch: feature/story-9.8-validate-plan-skill
status: complete
phases_total: 4
phases_completed: 4
---

# Implementation Plan: Plan Validation Auditor Skill (Story 9.8)

## Overview
Implement the canonical `validate-plan.md` procedural skill (`/validate_plan` and `/validate-plan`) in `create-agent-room`. This skill provides an independent post-implementation validation gate that audits code modifications, schema migrations, and automated test coverage against the approved plan in `docs/plans/`, performs triaged classification, and emits a structured report under `docs/reviews/`.

---

## What We're NOT Doing
- We are NOT replacing pre-commit hooks (`guardrails-check.js`) or pre-stop hooks (`close-the-loop-check.js`).
- We are NOT automatically modifying application source code during an audit (auditor reports findings; fixes are made in implementation phases or via `iterate-plan`).
- We are NOT introducing external npm dependencies.
- We are NOT running unsolicited `git push` commands.

---

## Phase 1: Author `validate-plan.md` Skill & Template
Implement the canonical skill document adhering to CAR's prompt standards, frontmatter requirements, and operational seatbelts.

- [x] **Phase 1.1**: Create `templates/.agent-room/skills/validate-plan.md` with:
  - YAML frontmatter: `name: validate-plan`, `description: "Audit an implementation against its approved plan across code, tests, and schema migrations with triaged reporting."`
  - Hard Gate: Auditor role isolation; no rubber-stamping; mandatory automated test verification in the turn.
  - Context Discovery: Active plan detection in `docs/plans/`, git commit history (`git log -n 20 --oneline`), git diff inspection (`git diff origin/main...HEAD` or `git diff HEAD~N..HEAD`).
  - 3-Vector Audit:
    1. Schema & Migration Audit (database tables, models, configurations, backward compatibility).
    2. Code Specification Audit (verify every phase's stated file changes, methods, classes, and APIs; identify missing requirements and unauthorized scope creep).
    3. Automated Test Coverage Audit (verify unit/integration coverage for all added functionality; execute automated verification command in this turn).
  - Triage Classification: Matches Plan (🟢), Deviations from Plan (🟡), Potential Issues (🔴), Manual Testing Required (🔵).
  - Validation Report Artifact: Emits structured markdown report to `docs/reviews/YYYY-MM-DD-[TICKET-]validation.md` (creating directory if needed) with executive verdict (`PASSED`, `PASSED WITH WARNINGS`, or `FAILED - ACTION REQUIRED`).
- [x] **Phase 1.2**: Copy `templates/.agent-room/skills/validate-plan.md` to `.agent-room/skills/validate-plan.md` for dogfooding.

### Automated Verification
```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('templates/.agent-room/skills/validate-plan.md', 'utf8');
if (!content.includes('name: validate-plan')) throw new Error('Missing frontmatter name');
if (!content.includes('3-Vector Audit')) throw new Error('Missing 3-Vector Audit section');
if (!content.includes('Matches Plan') || !content.includes('Deviations from Plan')) throw new Error('Missing triage categories');
if (!content.includes('docs/reviews/')) throw new Error('Missing docs/reviews report destination');
"
```

---

## Phase 2: Register Core Skill & Add Test Coverage
Register `validate-plan.md` in `lib/skill.js` and add unit test coverage in `test/skill.test.js`.

- [x] **Phase 2.1**: Update `CORE_SKILL_FILES` in `lib/skill.js` to include `'validate-plan.md'`.
- [x] **Phase 2.2**: Add test in `test/skill.test.js` verifying that `CORE_SKILL_FILES` includes `'validate-plan.md'` and that the skill file exists in templates and has valid frontmatter.

### Automated Verification
```bash
node --test test/skill.test.js
```

---

## Phase 3: Multi-Agent Adapter Sync & Full Verification
Synchronize `.agent-room/skills/` across all supported tool interfaces and verify integrity.

- [x] **Phase 3.1**: Run `node bin/cli.js sync . --all --force` to mirror `validate-plan.md` to `.claude/skills/validate-plan/SKILL.md` and refresh tool instruction manifests.
- [x] **Phase 3.2**: Run `node bin/cli.js validate .` to confirm agent-room compliance.
- [x] **Phase 3.3**: Run `npm run lint` and `npm test` to verify zero regressions across all 377+ tests.

### Automated Verification
```bash
node bin/cli.js validate . && npm run lint && npm test
```

---

## Phase 4: Backlog, Decisions, and Session Telemetry
Record project status and architectural decisions according to repository governance.

- [x] **Phase 4.1**: Update `BACKLOG.md` to mark Story 9.8 as `[x] DONE` and record deliverables.
- [x] **Phase 4.2**: Record architectural decision in `.agent-room/decisions.md`.
- [x] **Phase 4.3**: Create session log under `.agent-room/sessions/` per `session-log-format.md`.

### Automated Verification
```bash
git status --porcelain
```
