---
date: 2026-09-26T08:37:00Z
git_commit: e318722a91061351c3b9ec47a496529989471cc3
branch: feature/story-9.6-retire-legacy-skills
repository: create-agent-room
topic: "Retire Redundant Legacy Skills (brainstorming, verification-before-completion) & Orphan Purging (Story 9.6)"
research_doc: docs/research/2026-09-26-retire-legacy-skills.md
tags: [rpi, plan, skills, deprecation, cleanup]
status: complete
phases_total: 5
phases_completed: 5
verification_command: "npm test && npm run lint && node bin/cli.js validate ."
---

# Retire Redundant Legacy Skills & Orphan Purging (Story 9.6) Implementation Plan

**Goal:** Cleanly deprecate and unregister legacy procedural skills (`brainstorming`, `verification-before-completion`) that are superseded by the RPI pipeline, prevent scaffolding in new repos, purge lingering orphans in existing repos via `sync --all` and `doctor --fix`, and update guidance pointers.
**Architecture:** Update `CORE_SKILL_FILES` and introduce `RETIRED_CORE_SKILL_FILES` in `lib/skill.js`; enhance `lib/sync.js` and `lib/doctor.js` with retired skill detection and automated cleanup; delete obsolete templates and dogfood copies; update principles, adapters, and examples; maintain zero external dependencies and 100% test pass rate.
**Tech Stack:** Node.js (v18+ core `fs`, `path`), Node Test Runner (`node --test`), ESLint.

---

## Current State Analysis
Based on `docs/research/2026-09-26-retire-legacy-skills.md`:
- `lib/skill.js:60-73`: `CORE_SKILL_FILES` contains `brainstorming.md` and `verification-before-completion.md`.
- `templates/.agent-room/skills/`: Still has `brainstorming.md` and `verification-before-completion.md`. Fresh `init` copies all files from this directory.
- `lib/sync.js`: Prunes `.claude/skills/` subdirectories only if they don't exist in `.agent-room/skills/`. If `brainstorming.md` remains in `.agent-room/skills/`, `sync` continues mirroring it.
- `lib/doctor.js`: Does not inspect `.agent-room/skills/` for deprecated core skills.
- `templates/.agent-room/principles.md`, `.agent-room/principles.md`, `CLAUDE.md.tmpl`, and `CLAUDE.md`: Contain legacy pointers to `brainstorming.md` and `verification-before-completion.md`.
- `test/init.test.js`: Contains test assertion expecting `brainstorming.md` to be scaffolded.

### Key Discoveries:
- Without `RETIRED_CORE_SKILL_FILES`, `listSkillPacks` would misclassify lingering `brainstorming.md` as a user custom skill.
- Deleting the templates from `templates/.agent-room/skills/` ensures `init` never scaffolds them.
- `doctor --fix` and `sync --all` provide the automated migration path for existing repositories.

## Desired End State
1. `CORE_SKILL_FILES` contains only the 10 canonical core skills: `closing-the-loop.md`, `commit-changes.md`, `describe-pr.md`, `implement-plan.md`, `iterate-plan.md`, `research-codebase.md`, `systematic-debugging.md`, `test-driven-development.md`, `validate-plan.md`, `writing-plans.md`.
2. `RETIRED_CORE_SKILL_FILES = ['brainstorming.md', 'verification-before-completion.md']` is exported and recognized across CAR.
3. Templates `brainstorming.md` and `verification-before-completion.md` are removed; new projects never receive them.
4. `create-agent-room sync --all` and `create-agent-room doctor --fix` automatically detect and purge lingering retired skills from `.agent-room/skills/` and `.claude/skills/`.
5. All references in `principles.md`, `closing-the-loop.md`, `CLAUDE.md`, and examples point to the canonical RPI skills.
6. 100% of test suites pass cleanly (`npm test`), linter passes (`npm run lint`), and integrity validation succeeds (`node bin/cli.js validate .`).

## What We're NOT Doing
- We are NOT removing any canonical RPI skills (`research-codebase`, `writing-plans`, `implement-plan`, `iterate-plan`, `validate-plan`, `commit-changes`, `describe-pr`, `systematic-debugging`, `test-driven-development`, `closing-the-loop`).
- We are NOT altering user custom skills that are not in `RETIRED_CORE_SKILL_FILES`.
- We are NOT breaking backward compatibility for custom skill packs.

---

## Phase 1: Core Skill Registry & Classification Updates (`lib/skill.js`)

### Overview
Update `lib/skill.js` to unregister `brainstorming.md` and `verification-before-completion.md` from `CORE_SKILL_FILES`, export `RETIRED_CORE_SKILL_FILES`, and ensure `listSkillPacks` does not treat retired core skills as active custom skills.

### Changes Required:
1. In `lib/skill.js`:
   - Define and export `RETIRED_CORE_SKILL_FILES = ['brainstorming.md', 'verification-before-completion.md']`.
   - Update `CORE_SKILL_FILES` to only include the 10 canonical skills.
   - In `listSkillPacks(target)`: Filter out `RETIRED_CORE_SKILL_FILES` from `custom` skills discovery, or add a `deprecated` list in the response.
2. In `test/skill.test.js`:
   - Add unit test verifying `CORE_SKILL_FILES` does not contain `brainstorming.md` or `verification-before-completion.md`.
   - Add unit test verifying `RETIRED_CORE_SKILL_FILES` contains `brainstorming.md` and `verification-before-completion.md`.
   - Add unit test verifying `listSkillPacks` does not classify retired skills as user custom skills.

### Verification:
Command: `node --test test/skill.test.js`
- [x] Phase 1 Task 1: Update `CORE_SKILL_FILES` and export `RETIRED_CORE_SKILL_FILES` in `lib/skill.js`
- [x] Phase 1 Task 2: Update `listSkillPacks` to handle retired core skills
- [x] Phase 1 Task 3: Add unit tests in `test/skill.test.js` and verify passing

---

## Phase 2: Sync & Doctor Orphan Detection & Auto-Cleanup (`lib/sync.js`, `lib/doctor.js`)

### Overview
Enhance `sync` and `doctor` to detect deprecated core skills lingering in `.agent-room/skills/` or `.claude/skills/`, report them in findings, and purge them automatically under `doctor --fix` and `sync --all`.

### Changes Required:
1. In `lib/sync.js`:
   - In `checkSkillsSync`: detect if `RETIRED_CORE_SKILL_FILES` exist in `.agent-room/skills/` or mirrored in `.claude/skills/`, flagging them as `deprecated` or `orphaned`.
   - In `syncSkillsToClaude(target)` / `runSync(target)`:
     - Check if any `RETIRED_CORE_SKILL_FILES` exist in `target/.agent-room/skills/`.
     - Remove them from `.agent-room/skills/`.
     - Purge `.claude/skills/<skillName>` for any retired skill.
2. In `lib/doctor.js`:
   - In `getFindings(target)`: Check if any `RETIRED_CORE_SKILL_FILES` exist in `.agent-room/skills/` or `.claude/skills/`. If found, add advisory item: `Deprecated legacy skill found: .agent-room/skills/<file> (superseded by RPI framework; run doctor --fix to remove)`.
   - In `fixFindings(target)`: Remove lingering `RETIRED_CORE_SKILL_FILES` from `.agent-room/skills/` and delete their subdirectories in `.claude/skills/`, recording `fixed.push('Removed deprecated legacy skill: .agent-room/skills/<file>')`.
3. In `test/sync.test.js` and `test/doctor.test.js`:
   - Add unit tests verifying `doctor` flags deprecated skills and `doctor --fix` removes them.
   - Add unit test verifying `sync --all` purges deprecated skills from `.agent-room/skills/` and `.claude/skills/`.

### Verification:
Command: `node --test test/sync.test.js test/doctor.test.js`
- [x] Phase 2 Task 1: Implement deprecated skill detection and cleanup in `lib/sync.js`
- [x] Phase 2 Task 2: Implement deprecated skill detection and auto-fix in `lib/doctor.js`
- [x] Phase 2 Task 3: Add unit tests in `test/sync.test.js` and `test/doctor.test.js` and verify passing

---

## Phase 3: Template & Dogfood Cleanup

### Overview
Delete obsolete skill files from `templates/.agent-room/skills/` and `.agent-room/skills/`, and purge local `.claude/skills/` mirrors.

### Changes Required:
1. Remove template files:
   - `rm templates/.agent-room/skills/brainstorming.md`
   - `rm templates/.agent-room/skills/verification-before-completion.md`
2. Remove local dogfood files:
   - `rm .agent-room/skills/brainstorming.md`
   - `rm .agent-room/skills/verification-before-completion.md`
3. Remove local Claude mirrors:
   - `rm -rf .claude/skills/brainstorming`
   - `rm -rf .claude/skills/verification-before-completion`

### Verification:
Command: `test ! -f templates/.agent-room/skills/brainstorming.md && test ! -f .agent-room/skills/brainstorming.md`
- [x] Phase 3 Task 1: Delete `brainstorming.md` and `verification-before-completion.md` from `templates/.agent-room/skills/`
- [x] Phase 3 Task 2: Delete `brainstorming.md` and `verification-before-completion.md` from `.agent-room/skills/`
- [x] Phase 3 Task 3: Delete mirrored directories from `.claude/skills/`

---

## Phase 4: Documentation, Guidance Pointers & Examples Update

### Overview
Update all references in principles, skill docs, adapter templates, root CLAUDE.md, and examples to remove mentions of deprecated skills and highlight canonical RPI skills.

### Changes Required:
1. In `templates/.agent-room/principles.md` and `.agent-room/principles.md`:
   - Replace `brainstorming.md` references with `research-codebase.md` / `writing-plans.md`.
   - Replace `verification-before-completion.md` references with `implement-plan.md`.
2. In `templates/.agent-room/skills/closing-the-loop.md` and `.agent-room/skills/closing-the-loop.md`:
   - Replace reference to `verification-before-completion.md` with `implement-plan.md` / `close-the-loop-check.js`.
3. In `templates/adapters/CLAUDE.md.tmpl` and `CLAUDE.md`:
   - Update the skills list to reference RPI commands (`/research`, `/plan`, `/implement`, `/commit`, `/validate_plan`, `/describe_pr`, `/closing-the-loop`).
4. In `examples/python-project/AGENTS.md` and `examples/rust-project/AGENTS.md`:
   - Update skill list from legacy (`brainstorming`, `writing-plans`, `TDD`) to canonical RPI list.
5. In `test/init.test.js`:
   - Update line 737 from checking `brainstorming.md` to checking `writing-plans.md`.

### Verification:
Command: `node --test test/init.test.js`
- [x] Phase 4 Task 1: Update `principles.md` in templates and dogfood
- [x] Phase 4 Task 2: Update `closing-the-loop.md` in templates and dogfood
- [x] Phase 4 Task 3: Update `CLAUDE.md.tmpl` and `CLAUDE.md`
- [x] Phase 4 Task 4: Update example files and `test/init.test.js`

---

## Phase 5: Full Test Suite Verification, Parity & Delivery Artifacts

### Overview
Verify 100% template-to-dogfood parity, execute full test suite and linter, author plan validation report, update BACKLOG.md, and record architectural decision in `.agent-room/decisions.md`.

### Changes Required:
1. Run diff checks between `templates/.agent-room/` and `.agent-room/`.
2. Run full test suite: `npm test`.
3. Run linter: `npm run lint`.
4. Run integrity check: `node bin/cli.js validate .`.
5. Update `BACKLOG.md`: mark Story 9.6 as `DONE`.
6. Add ADR in `.agent-room/decisions.md`: document retirement of legacy skills.
7. Author validation audit report in `docs/reviews/2026-09-26-story-9-6-validation.md`.
8. Scaffold session log in `.agent-room/sessions/`.

### Verification:
Command: `npm test && npm run lint && node bin/cli.js validate .`
- [x] Phase 5 Task 1: Verify template-to-dogfood parity
- [x] Phase 5 Task 2: Run full test suite (`npm test`), lint (`npm run lint`), and integrity checks (`node bin/cli.js validate .`)
- [x] Phase 5 Task 3: Update `BACKLOG.md`, `.agent-room/decisions.md`, and delivery artifacts
