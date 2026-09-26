---
date: 2026-09-26T03:02:00Z
research_doc: docs/research/2026-09-26-rpi-routing.md
branch: feature/story-9.3-rpi-routing
status: complete
phases_total: 4
phases_completed: 4
---

# Implementation Plan: RPI Routing in Workflow Classifier & Universal AGENTS.md (Story 9.3)

## Overview
Formally wire the Research → Plan → Implement (RPI) pipeline into the CAR workflow taxonomy (`workflow-classifier.md`) and universal agent instructions (`AGENTS.md` / `AGENTS.md.tmpl` via `lib/init.js`), establishing clear routing for non-trivial features while preserving lightweight bug fix mechanics and profile-aware token footprints.

---

## What We're NOT Doing
- We are NOT removing the lightweight Bug Flow (single-file bugs must continue to bypass RPI).
- We are NOT bloating the `--profile minimal` template with unnecessary guidance files or broken links.
- We are NOT altering existing skill mechanics or adding new npm dependencies.

---

## Phase 1: Update Workflow Classifier Templates & Dogfood
Formally document and route tasks into the RPI pipeline within `workflow-classifier.md`.

- [x] **Phase 1.1**: Update `templates/.agent-room/workflow-classifier.md`:
  - Route `Feature`, `Product`, and multi-file `Enhancement` or `Refactor` tasks to the full RPI pipeline (`research-codebase` -> `writing-plans`/`iterate-plan` -> `implement-plan` -> `validate-plan` -> `commit-changes`/`describe-pr`).
  - Update the "Feature Flow" and "Product Flow" sections to explicitly describe RPI artifact generation (`docs/research/` and `docs/plans/`) and phase tracking (`- [ ]` -> `- [x]`).
  - Reinforce that "Bug Flow" skips RPI artifacts.
- [x] **Phase 1.2**: Update dogfood `.agent-room/workflow-classifier.md` to mirror the template changes.

### Automated Verification
```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('templates/.agent-room/workflow-classifier.md', 'utf8');
if (!content.includes('research-codebase') || !content.includes('implement-plan')) {
  throw new Error('Missing RPI skill references in workflow-classifier.md');
}
"
```

---

## Phase 2: Update Dynamic `AGENTS.md` Generation in `lib/init.js`
Update `buildAgentsMdSections` in `lib/init.js` across all profiles.

- [x] **Phase 2.1**: Update `GUIDANCE_LINKS` across `strict`, `full`/`standard`, and `minimal` profiles to list canonical RPI skills (`research-codebase`, `writing-plans`, `implement-plan`, `iterate-plan`, `test-driven-development`, `systematic-debugging`, `commit-changes`, `validate-plan`, `describe-pr`, `closing-the-loop`).
- [x] **Phase 2.2**: Update `DEFAULT_WORKFLOW` in `strict` and `full`/`standard` profiles:
  - Step 1: Classify work using `.agent-room/workflow-classifier.md`.
  - Step 2: For simple bugs, use Bug Flow (reproduce -> diagnose -> test -> fix).
  - Step 3: For features, products, and complex changes, execute the RPI Pipeline:
    - Research first (`research-codebase` -> `docs/research/YYYY-MM-DD-<topic>.md`)
    - Plan & Iterate (`writing-plans` / `iterate-plan` -> `docs/plans/YYYY-MM-DD-<topic>.md`)
    - Implement with live tracking (`implement-plan` -> phase-by-phase `- [x]` on disk)
    - Validate (`validate-plan` -> `docs/reviews/`)
    - Atomic commit & PR (`commit-changes` & `describe-pr`)
  - Step 4: Close the loop (`closing-the-loop`).
- [x] **Phase 2.3**: Update `DEFAULT_WORKFLOW` in `minimal` profile:
  - Provide a concise, self-contained RPI workflow without references to skipped files (`workflow-classifier.md`, `principles.md`, `coordination/`).

### Automated Verification
```bash
node -e "
const { runInit } = require('./lib/init');
// Verified via init tests
"
```

---

## Phase 3: Dogfood Root `AGENTS.md` & Unit Tests
Update root repository instructions and verify across the test suite.

- [x] **Phase 3.1**: Update root `AGENTS.md` to reflect the updated default workflow and RPI skills.
- [x] **Phase 3.2**: Add unit tests in `test/init.test.js` asserting that:
  - Full/standard profile `AGENTS.md` contains RPI pipeline steps (`research-codebase`, `docs/research/`, `docs/plans/`, `implement-plan`).
  - Minimal profile `AGENTS.md` contains self-contained RPI steps while maintaining zero dangling references to `workflow-classifier.md` or `principles.md`.
- [x] **Phase 3.3**: Run `node bin/cli.js validate .`, `npm run lint`, and `npm test` across all 386+ tests.

### Automated Verification
```bash
node bin/cli.js validate . && npm run lint && npm test
```

---

## Phase 4: Backlog, Decisions, and Plan Validation
Finalize project tracking and governance.

- [x] **Phase 4.1**: Update `BACKLOG.md` to mark Story 9.3 as `[x] DONE` and record deliverables.
- [x] **Phase 4.2**: Record architectural decision in `.agent-room/decisions.md`.
- [x] **Phase 4.3**: Create session log under `.agent-room/sessions/`.
- [x] **Phase 4.4**: Run plan validation audit and emit `docs/reviews/2026-09-26-story-9-3-validation.md`.

### Automated Verification
```bash
git status --porcelain
```
