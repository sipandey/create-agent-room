---
date: 2026-09-26T03:01:00Z
git_commit: 374d08c947751c9e2f77f9b699ba9dfe1889bec0
branch: feature/story-9.3-rpi-routing
repository: create-agent-room
topic: "RPI Routing in Workflow Classifier & Universal AGENTS.md (Story 9.3)"
tags: [rpi, workflow-classifier, agents-md, routing, profiles, story-9.3]
status: complete
---

# Research: RPI Routing in Workflow Classifier & Universal AGENTS.md (Story 9.3)

## Research Question
How should `create-agent-room` formally wire the Research → Plan → Implement (RPI) pipeline into the CAR workflow taxonomy (`workflow-classifier.md`) and universal agent instructions (`AGENTS.md` / `AGENTS.md.tmpl`), ensuring proper task routing, profile awareness, and clear differentiation between lightweight bug fixes and RPI-driven features?

## Summary
The RPI framework was established in Stories 9.1 (`research-codebase`, `writing-plans`, `implement-plan`, `iterate-plan`), 9.7 (`commit-changes`), 9.8 (`validate-plan`), 9.9 (`describe-pr`), and 9.2 (artifact lifecycle schemas).
However, entry-point documentation still references legacy workflows:
1. `workflow-classifier.md` recommends `brainstorming` -> `writing-plans` -> TDD, lacking references to `research-codebase`, `implement-plan`, `validate-plan`, `commit-changes`, or `describe-pr`.
2. `AGENTS.md` and `lib/init.js:buildAgentsMdSections` instruct agents to "brainstorm before building" and write "a short design note under docs/plans/", omitting the read-only research phase (`docs/research/`), phased plan checklist (`- [ ]`), automated plan audit, and atomic commit workflow.
3. Profile awareness must be preserved:
   - `minimal`: Skips `workflow-classifier.md` and `principles.md`, providing a lean, self-contained RPI workflow in `AGENTS.md` without dead links or bloat.
   - `standard` / `full` / `strict`: Includes `workflow-classifier.md` and links full RPI skills and coordination protocols.

## Findings & Architectural Analysis

### 1. `workflow-classifier.md` Routing Architecture
- Location: `templates/.agent-room/workflow-classifier.md` and `.agent-room/workflow-classifier.md`.
- Current routing:
  - `Bug Flow`: Reproduce -> Diagnose -> Write failing test -> Smallest fix -> Note why in `anti-patterns.md`. (Properly lightweight; skips PRD/RPI).
  - `Enhancement Flow`: Fit existing rails -> short PRD -> closest prior example -> TDD -> ship.
  - `Feature Flow`: Write first design -> architecture discoveries -> TDD -> review. Mentions `brainstorming -> writing-plans -> TDD`.
  - `Product Flow`: Define problem before feature list -> hypotheses -> spikes -> MVP -> loop.
- Required Updates:
  - Formally designate `Feature`, `Product`, and multi-file `Enhancement`/`Refactor` tasks as candidates for the **RPI Pipeline**:
    1. **Research Phase (`research-codebase`):** Strictly read-only exploration mapping architecture and existing patterns into `docs/research/YYYY-MM-DD-<topic>.md`.
    2. **Planning Phase (`writing-plans` / `iterate-plan`):** Clarifying questions, trade-offs, and phased execution plan with automated verification into `docs/plans/YYYY-MM-DD-<topic>.md`.
    3. **Implementation Phase (`implement-plan`):** Phase-by-phase execution with TDD, automated verification commands, and disk-backed checkbox tracking (`- [ ]` -> `- [x]`).
    4. **Audit Phase (`validate-plan`):** 3-vector compliance audit recorded in `docs/reviews/YYYY-MM-DD-<topic>-validation.md`.
    5. **Delivery Phase (`commit-changes` & `describe-pr`):** Atomic git commits without AI attribution and attested pull request descriptions.
  - Explicitly reinforce that local, single-file bug fixes follow the **Bug Flow** without generating research or plan documents.

### 2. `AGENTS.md.tmpl` & `lib/init.js` Dynamic Sections
- In `lib/init.js`, `buildAgentsMdSections(profile)` generates:
  - `FIRST_FIVE_MINUTES`
  - `GUIDANCE_LINKS`
  - `DEFAULT_WORKFLOW`
- Across profiles:
  - `strict`: Enforces pre-commit test execution, import boundaries, and strict waivers.
  - `full` / `standard`: Standard guidance corpus including `principles.md`, `workflow-classifier.md`, and `coordination/`.
  - `minimal`: Skips secondary guidance files to keep tokens lean; `AGENTS.md` contains self-contained workflow steps with no dead links.
- Required Updates:
  - **`The First 5 Minutes`**: For non-trivial work, mandate following the RPI pipeline.
  - **`Read these before doing anything non-trivial`**: Update the skill list from legacy (`brainstorming`, `writing-plans`, `verification-before-completion`) to canonical RPI skills (`research-codebase`, `writing-plans`, `implement-plan`, `iterate-plan`, `test-driven-development`, `systematic-debugging`, `commit-changes`, `validate-plan`, `describe-pr`, `closing-the-loop`).
  - **`The default workflow`**:
    1. Classify the work (`Bug` vs. `Feature`/`Product`/`Enhancement`).
    2. Bug Flow for single-file defect fixes (reproduce -> diagnose -> failing test -> fix -> verify).
    3. RPI Pipeline for Features, Products, and multi-file changes:
       - Research (`research-codebase` -> `docs/research/`)
       - Plan & Iterate (`writing-plans` / `iterate-plan` -> `docs/plans/`)
       - Implement (`implement-plan` -> TDD + live checkbox state `- [x]`)
       - Audit (`validate-plan` -> `docs/reviews/`)
       - Commit & PR (`commit-changes` + `describe-pr`)
    4. Close the loop (decisions in `.agent-room/decisions.md` or anti-patterns in `.agent-room/anti-patterns.md`).

### 3. Dogfood Repository Alignment
- Root `AGENTS.md` in `create-agent-room` should mirror the updated `full`/`standard` profile guidance.
- `.agent-room/workflow-classifier.md` should mirror `templates/.agent-room/workflow-classifier.md`.

### 4. Test Considerations
- In `test/init.test.js`:
  - `test('runInit --profile minimal: AGENTS.md does not reference principles.md/workflow-classifier.md/coordination/')`:
    Verifies that no dangling references exist.
  - `test('runInit --profile full: AGENTS.md references principles.md/workflow-classifier.md/coordination/')`:
    Verifies full profile includes workflow classifier and principles.
  - Add tests verifying that `AGENTS.md` renders RPI guidance across minimal and full/standard profiles.
