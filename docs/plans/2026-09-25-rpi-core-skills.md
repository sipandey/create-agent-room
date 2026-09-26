---
date: 2026-09-25T00:00:00Z
research_doc: N/A
branch: main
status: complete
phases_total: 4
phases_completed: 4
---

# Core RPI Guidance & Skill Suite (Story 9.1) — Implementation Plan

**Goal:** Author and package the four core RPI procedure skills (`research-codebase`, `writing-plans`, `implement-plan`, `iterate-plan`) in `templates/.agent-room/skills/` and `.agent-room/skills/`, register them in `lib/skill.js`, and mark `brainstorming.md` as deprecated.  
**Architecture:** Markdown skills with standardized YAML frontmatter, integrated into CAR's zero-dependency runtime and tool synchronization machinery.  
**Tech Stack:** JavaScript (Node.js stdlib), Markdown, YAML Frontmatter.  

---

## Current State Analysis

- Core skills reside in [`templates/.agent-room/skills/`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/templates/.agent-room/skills/) and [`.agent-room/skills/`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/.agent-room/skills/).
- [`lib/skill.js:60-67`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/lib/skill.js#L60-L67) hardcodes `CORE_SKILL_FILES`:
  ```javascript
  const CORE_SKILL_FILES = [
    'brainstorming.md',
    'closing-the-loop.md',
    'systematic-debugging.md',
    'test-driven-development.md',
    'verification-before-completion.md',
    'writing-plans.md'
  ];
  ```
- Existing `brainstorming.md` conflates exploration with design, leading to assumption drift.
- Existing `writing-plans.md` lacks dependency-ordered phasing, automated verification commands, and disk-backed checkbox state tracking (`- [ ]`).
- No skills exist for `research-codebase.md`, `implement-plan.md`, or `iterate-plan.md`.

## Desired End State

1. **`research-codebase.md`** established: strictly read-only, 3 subroutines (`find_files`, `analyze_code`, `find_patterns`), outputs to `docs/research/YYYY-MM-DD-HHmm-<topic>.md`.
2. **`writing-plans.md`** updated: ingests research doc, structured Q&A, trade-off evaluation, outputs phased checklist with automated verification to `docs/plans/YYYY-MM-DD-HHmm-<topic>.md`.
3. **`iterate-plan.md`** established: surgical updates to existing plans based on feedback.
4. **`implement-plan.md`** established: mechanical phase execution updating `- [x]` checkboxes on disk, resilient to context compaction.
5. **`brainstorming.md`** updated with deprecation banner pointing to `research-codebase.md` + `writing-plans.md`.
6. **`CORE_SKILL_FILES`** in `lib/skill.js` updated to include the new skills.
7. All tests in `test/skill.test.js` and full test suite pass clean.

## What We're NOT Doing

- We are NOT removing `brainstorming.md` or `verification-before-completion.md` completely in this story (that is scheduled for Story 9.6 to manage backwards compatibility and orphan purging).
- We are NOT implementing the Goose YAML generator CLI or `--tools goose` adapter in this story (that is Story 9.4).
- We are NOT adding pre-commit git hook enforcement for plans in this story (that is Story 9.5).

---

## Implementation Approach

Work in dependency order:
1. Author `research-codebase.md` in both `templates/` and `.agent-room/`.
2. Refactor `writing-plans.md` in both locations.
3. Author `iterate-plan.md` in both locations.
4. Author `implement-plan.md` in both locations.
5. Update `lib/skill.js` core skill list and deprecate `brainstorming.md`.
6. Run skill tests and full test verification suite.

---

## Phase 1: Create `research-codebase.md` Skill

### Overview
Create the read-only factual discovery skill in `templates/.agent-room/skills/research-codebase.md` and `.agent-room/skills/research-codebase.md`.

### Changes Required:
1. **Create `templates/.agent-room/skills/research-codebase.md`**
   - Frontmatter: `name: research-codebase`, `description: "Research and document codebase for a specific topic before proposing any changes. Factual, read-only discovery."`
   - Hard gate: strictly read-only, no code changes, no solution proposals.
   - 3 subroutines: `find_files` (codebase locator), `analyze_code` (codebase analyzer), `find_patterns` (pattern finder). Run in parallel if supported, or sequentially.
   - Collect git metadata (`date -Iseconds`, `git rev-parse HEAD`, `git branch --show-current`, repo name).
   - Write output to `docs/research/YYYY-MM-DD-HHmm-<topic>.md`.
   - Present summary with key file references.
2. **Copy to `.agent-room/skills/research-codebase.md`** (dogfooded copy).

### Success Criteria:
#### Automated Verification:
- [x] File exists: `templates/.agent-room/skills/research-codebase.md`
- [x] File exists: `.agent-room/skills/research-codebase.md`
- [x] Has valid YAML frontmatter header

---

## Phase 2: Refactor `writing-plans.md` Skill

### Overview
Upgrade `writing-plans.md` in `templates/.agent-room/skills/writing-plans.md` and `.agent-room/skills/writing-plans.md` to implement RPI Phase 2.

### Changes Required:
1. **Update `templates/.agent-room/skills/writing-plans.md` and `.agent-room/skills/writing-plans.md`**:
   - Ingests `docs/research/` document.
   - Socratic discovery: ask focused clarifying questions (one at a time, multiple-choice preferred).
   - Design trade-offs: present 2-3 architectural approaches with pros/cons before writing the plan.
   - Standardized plan structure:
     - Header metadata (`Topic`, `Research Doc`, `Date`, `Status`).
     - Overview, Current State Analysis, Desired End State, What We're NOT Doing.
     - Phased sections in dependency order:
       - Phase N: Name
       - Files to create/modify/delete (exact paths)
       - Code changes (specific snippets)
       - Automated Verification: exact commands (`npm test`, `cargo test`, `make lint`) with checkbox `- [ ]`
       - Manual Verification: UI/UX check or human confirmation
     - Rollback plan.
   - Target location: `docs/plans/YYYY-MM-DD-HHmm-<topic>.md`.

### Success Criteria:
#### Automated Verification:
- [x] File updated: `templates/.agent-room/skills/writing-plans.md`
- [x] File updated: `.agent-room/skills/writing-plans.md`
- [x] Contains phased plan template with automated verification checkboxes

---

## Phase 3: Create `iterate-plan.md` Skill

### Overview
Create the surgical plan iteration skill in `templates/.agent-room/skills/iterate-plan.md` and `.agent-room/skills/iterate-plan.md`.

### Changes Required:
1. **Create `templates/.agent-room/skills/iterate-plan.md` and `.agent-room/skills/iterate-plan.md`**:
   - Frontmatter: `name: iterate-plan`, `description: "Update existing implementation plans based on feedback with targeted, surgical research."`
   - Read entire plan file without truncation.
   - Parse requested changes; research only what changed (subroutines if needed).
   - Confirm proposed modifications with user before making edits.
   - Apply surgical edits: maintain phase consistency, update checkboxes, keep automated verification criteria measurable.
   - Present diff/summary of plan updates.

### Success Criteria:
#### Automated Verification:
- [x] File exists: `templates/.agent-room/skills/iterate-plan.md`
- [x] File exists: `.agent-room/skills/iterate-plan.md`
- [x] Has valid YAML frontmatter header

---

## Phase 4: Create `implement-plan.md` Skill

### Overview
Create the mechanical execution skill in `templates/.agent-room/skills/implement-plan.md` and `.agent-room/skills/implement-plan.md`.

### Changes Required:
1. **Create `templates/.agent-room/skills/implement-plan.md` and `.agent-room/skills/implement-plan.md`**:
   - Frontmatter: `name: implement-plan`, `description: "Implement an approved technical plan phase by phase with automated verification and live checkbox tracking."`
   - Philosophy: "Intentionally boring", mechanical execution. Trust the plan.
   - Phase Execution Loop:
     1. Read plan and find first unchecked phase (`- [ ]`).
     2. Implement code changes using minimal code / TDD.
     3. Run the phase's automated verification command.
     4. On success, update the plan file on disk to `- [x]`.
     5. Pause for human confirmation if manual verification steps exist.
     6. Advance to next phase.
   - Resuming after context compaction: pick up from the first `- [ ]` without re-researching.

### Success Criteria:
#### Automated Verification:
- [x] File exists: `templates/.agent-room/skills/implement-plan.md`
- [x] File exists: `.agent-room/skills/implement-plan.md`
- [x] Has valid YAML frontmatter header

---

## Phase 5: Update `lib/skill.js` Core Skill Registry & Deprecate `brainstorming.md`

### Overview
Register the new skills in `CORE_SKILL_FILES` in `lib/skill.js` and add a deprecation notice to `brainstorming.md`.

### Changes Required:
1. **Update `lib/skill.js:60-67`**:
   ```javascript
   const CORE_SKILL_FILES = [
     'brainstorming.md',
     'closing-the-loop.md',
     'implement-plan.md',
     'iterate-plan.md',
     'research-codebase.md',
     'systematic-debugging.md',
     'test-driven-development.md',
     'verification-before-completion.md',
     'writing-plans.md'
   ];
   ```
2. **Update `templates/.agent-room/skills/brainstorming.md` and `.agent-room/skills/brainstorming.md`**:
   Add deprecation header:
   ```markdown
   > [!NOTE]
   > **Deprecated:** Brainstorming is superseded by the Research → Plan → Implement (RPI) pipeline.
   > Use `research-codebase` for factual discovery and `writing-plans` for phased design and architecture.
   ```

### Success Criteria:
#### Automated Verification:
- [x] `node --test test/skill.test.js` passes
- [x] `npm run lint` passes

---

## Phase 6: Final Verification & Mirroring

### Overview
Sync skills to `.claude/skills/` and run the repository's full test suite and lint checks.

### Changes Required:
1. Mirror new skills to `.claude/skills/`:
   - `.claude/skills/research-codebase/SKILL.md`
   - `.claude/skills/writing-plans/SKILL.md`
   - `.claude/skills/implement-plan/SKILL.md`
   - `.claude/skills/iterate-plan/SKILL.md`
2. Run full repo checks: `npm test && npm run lint`.

### Success Criteria:
#### Automated Verification:
- [x] All unit tests pass (`npm test`)
- [x] Linter passes (`npm run lint`)
- [x] No regression in skill pack management tests

---

## Rollback Plan

If any issue arises:
1. Git revert any changes made to `lib/skill.js` or `templates/.agent-room/skills/`.
2. Existing rooms and workflows remain completely unaffected.
