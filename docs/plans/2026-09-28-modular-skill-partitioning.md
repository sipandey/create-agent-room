---
date: 2026-09-28T07:55:00Z
research_doc: docs/research/2026-09-28-modular-skill-partitioning.md
branch: feature/modular-skill-partitioning
status: complete
phases_total: 4
phases_completed: 4
---

# Modular Profile / Skill Partitioning for Delivery & Audit Workflows Implementation Plan

**Goal:** Streamline `--profile minimal` to scaffold strictly the 7 core build-loop skills, partitioning downstream delivery and audit skills (`commit-changes`, `validate-plan`, `describe-pr`) into full mode (`--profile full` / `--preset standard` / `--preset strict`) and modular skill packs, reducing guidance prompt overhead by ~40% (~6,500 tokens).

**Architecture:** Update `lib/init.js` to exclude delivery and audit skill files during minimal profile scaffolding and dynamically generate profile-tailored RPI guidance in `AGENTS.md`. Update `lib/skill.js` to export categorized skill constants (`MINIMAL_CORE_SKILL_FILES`, `DELIVERY_AUDIT_SKILL_FILES`), support individual extended skill installation, and register optional `audit` and `delivery` packs. Maintain full backward compatibility across CLI commands (`validate`, `doctor`, `sync`).

**Tech Stack:** Node.js (>=18), CommonJS standard library (`fs`, `path`, `node:test`, `node:assert`). Zero runtime dependencies.

---

## Current State Analysis
- `templates/.agent-room/skills/` contains 10 core skills.
- Currently, `runInit` in `lib/init.js` (`lines 1140-1165`) applies `minimalProfileExcludes = ['principles.md', 'workflow-classifier.md', /^coordination\//]`, which leaves all 10 skills in `.agent-room/skills/`.
- In minimal mode, `AGENTS.md` (`buildAgentsMdSections`, `lines 489-530`) references all 10 skills in `GUIDANCE_LINKS` and describes audit (`validate-plan`) and delivery (`commit-changes`, `describe-pr`) in `DEFAULT_WORKFLOW`.
- Guidance corpus size for minimal is currently ~16,400 tokens (~26,000 bytes).
- `lib/skill.js` exports a single flat array `CORE_SKILL_FILES` of 10 skills.

### Key Discoveries:
- `copyDirInherited` in `lib/fsutil.js:188-194` matches `exclude` array against relative paths inside `.agent-room`, so `'skills/commit-changes.md'`, `'skills/validate-plan.md'`, and `'skills/describe-pr.md'` cleanly prevent them from being copied in minimal mode.
- `lib/checks.js:221-280` only lints whatever markdown files exist under `.agent-room/skills/`; it does not hardcode expected skill filenames.
- `estimateGuidanceTokens` in `lib/init.js:1036-1060` calculates tokens from scaffolded results, so excluding these 3 files immediately drops the reported guidance token size to ~9,900 tokens.

## Desired End State
- Running `create-agent-room init` (defaulting to `--profile minimal` / `--preset minimal`):
  - Scaffolds strictly the **7 Core Build Skills**:
    1. `research-codebase.md`
    2. `writing-plans.md`
    3. `implement-plan.md`
    4. `iterate-plan.md`
    5. `test-driven-development.md`
    6. `systematic-debugging.md`
    7. `closing-the-loop.md`
  - Does NOT scaffold `commit-changes.md`, `validate-plan.md`, or `describe-pr.md`.
  - Scaffolds `AGENTS.md` whose `GUIDANCE_LINKS` lists the 7 build skills and whose `DEFAULT_WORKFLOW` focuses on the Core Build Loop (Research -> Plan & Iterate -> Implement -> Verify -> Close the Loop), noting that delivery & audit workflows are available in full mode or via skill packs.
  - Reported guidance corpus size in init summary drops from ~16,400 tokens to ~9,900 tokens.
- Running `create-agent-room init --profile full` (or `--preset standard` / `--preset strict`):
  - Scaffolds all 10 core skills (the 7 build skills + `commit-changes.md`, `validate-plan.md`, `describe-pr.md`).
  - Scaffolds full `AGENTS.md` with the 5-stage RPI pipeline.
- On-Demand Extended Skills:
  - Users in minimal rooms can add delivery/audit skills on demand via `create-agent-room skill add commit-changes`, `skill add validate-plan`, `skill add describe-pr`, or via packs `create-agent-room skill add delivery`, `create-agent-room skill add audit`.
- Existing tests pass, and new tests verify the partitioned behavior.

## What We're NOT Doing
- We are NOT removing `commit-changes.md`, `validate-plan.md`, or `describe-pr.md` from the repository or from `--profile full` / `--preset standard` / `--preset strict`.
- We are NOT modifying the RPI Pre-Commit Plan Gate or Stop Hook phase verification gate in `guardrails-check.js` and `close-the-loop-check.js` (they operate independently of which skill files are in `skills/`).
- We are NOT adding external runtime dependencies.

## Implementation Approach
Execution proceeds in 4 isolated phases:
1. **Phase 1: Skill Registry & Pack Definitions (`lib/skill.js`, `templates/skill-packs/`)**
   - Partition core skill constants: `MINIMAL_CORE_SKILL_FILES` and `DELIVERY_AUDIT_SKILL_FILES`, preserving `CORE_SKILL_FILES` as their combined union.
   - Add template packs / addSkillPacks support for extended skills (`commit-changes`, `validate-plan`, `describe-pr`, and optional `audit` / `delivery` aliases).
2. **Phase 2: Scaffolding Exclusion & Dynamic Guidance (`lib/init.js`)**
   - Update `minimalProfileExcludes` in `runInit` to exclude delivery and audit skills for `--profile minimal`.
   - Update `buildAgentsMdSections` to render minimal-tailored `GUIDANCE_LINKS` (7 skills) and workflow instructions in `AGENTS.md`.
3. **Phase 3: Automated Test Suite Expansion (`test/init.test.js`, `test/skill.test.js`)**
   - Add unit tests verifying that `--profile minimal` scaffolds exactly 7 skills and ~9,900 tokens.
   - Add unit tests verifying that `--profile full` / `--preset standard` scaffolds all 10 skills.
   - Add unit tests verifying adding extended skills individually via `create-agent-room skill add`.
4. **Phase 4: Documentation Alignment & Audit (`ROADMAP.md`, `CAPABILITIES.md`, `README.md`)**
   - Move the roadmap item in `ROADMAP.md` from `## Next` to `## Shipped`.
   - Update `CAPABILITIES.md` and `README.md` to accurately document minimal vs. full skill suites.
   - Run full regression suite (`npm test`, `npm run lint`, `create-agent-room validate .`).

---

## Phase 1: Skill Registry & Pack Definitions

### Overview
Update `lib/skill.js` to define the partitioned skill categories, ensure `listSkillPacks` correctly accounts for both minimal and extended core skills, and allow `addSkillPacks` to install extended skills on demand from `templates/.agent-room/skills/`.

### Changes Required:
- **File:** `lib/skill.js`
  - Export `MINIMAL_CORE_SKILL_FILES`:
    ```javascript
    const MINIMAL_CORE_SKILL_FILES = [
      'closing-the-loop.md',
      'implement-plan.md',
      'iterate-plan.md',
      'research-codebase.md',
      'systematic-debugging.md',
      'test-driven-development.md',
      'writing-plans.md'
    ];
    ```
  - Export `DELIVERY_AUDIT_SKILL_FILES`:
    ```javascript
    const DELIVERY_AUDIT_SKILL_FILES = [
      'commit-changes.md',
      'describe-pr.md',
      'validate-plan.md'
    ];
    ```
  - Define `CORE_SKILL_FILES = [...MINIMAL_CORE_SKILL_FILES, ...DELIVERY_AUDIT_SKILL_FILES].sort()`.
  - In `addSkillPacks`: if a requested pack matches an extended skill name (e.g. `commit-changes`, `validate-plan`, `describe-pr`) or pack aliases `audit` / `delivery`, copy the corresponding files from `templates/.agent-room/skills/` into target `.agent-room/skills/`.
  - In `removeSkillPacks`: allow removing individual extended skills if requested.

### Verification Checkpoint:
*Automated Verification:* `node --test test/skill.test.js`

### Tasks:
- [x] Define `MINIMAL_CORE_SKILL_FILES` and `DELIVERY_AUDIT_SKILL_FILES` in `lib/skill.js`.
- [x] Enhance `addSkillPacks` and `removeSkillPacks` to support extended core skill files.
- [x] Verify `node --test test/skill.test.js` passes.

---

## Phase 2: Scaffolding Exclusion & Dynamic Guidance

### Overview
Update `lib/init.js` so `--profile minimal` excludes delivery and audit skills during scaffolding, and generates tailored `AGENTS.md` content matching the active profile.

### Changes Required:
- **File:** `lib/init.js`
  - In `runInit`:
    ```javascript
    const minimalProfileExcludes = [
      'principles.md',
      'workflow-classifier.md',
      /^coordination\//,
      'skills/commit-changes.md',
      'skills/validate-plan.md',
      'skills/describe-pr.md'
    ];
    ```
  - In `buildAgentsMdSections(profile)`:
    - In minimal profile branch (`profile === 'minimal'`):
      - Update `GUIDANCE_LINKS` to list the 7 build-loop skills:
        `research-codebase`, `writing-plans`, `implement-plan`, `iterate-plan`, `test-driven-development`, `systematic-debugging`, `closing-the-loop`.
      - Update `DEFAULT_WORKFLOW` to focus on the Core Build Loop: Research -> Plan & Iterate -> Implement -> Verify -> Close the Loop, noting delivery and audit skills are available in full mode or via skill packs.
    - In full/standard branch:
      - Preserve the 10-skill list and full 5-stage RPI pipeline.

### Verification Checkpoint:
*Automated Verification:* `node --test test/init.test.js`

### Tasks:
- [x] Update `minimalProfileExcludes` in `lib/init.js`.
- [x] Update `buildAgentsMdSections` in `lib/init.js` for minimal vs full profiles.
- [x] Verify `node --test test/init.test.js` passes.

---

## Phase 3: Automated Test Suite Expansion

### Overview
Add comprehensive unit test coverage verifying the partitioned behavior across minimal, standard, and full profiles, and validating on-demand skill addition.

### Changes Required:
- **File:** `test/init.test.js`
  - Add test verifying `--profile minimal` scaffolds exactly the 7 build skills and excludes `commit-changes.md`, `validate-plan.md`, `describe-pr.md`.
  - Add test verifying `--profile full` and `--preset standard` scaffold all 10 core skills.
  - Verify `AGENTS.md` content differences between minimal and full profiles.
  - Verify `estimateGuidanceTokens` reports ~9,900 tokens for minimal.
- **File:** `test/skill.test.js`
  - Add test verifying `addSkillPacks` can install `commit-changes`, `validate-plan`, and `describe-pr` into a minimal room.
  - Add test verifying `removeSkillPacks` removes them cleanly.

### Verification Checkpoint:
*Automated Verification:* `npm test`

### Tasks:
- [x] Add profile skill partitioning tests in `test/init.test.js`.
- [x] Add extended skill addition/removal tests in `test/skill.test.js`.
- [x] Run full test suite: `npm test` (all tests passing).

---

## Phase 4: Documentation Alignment & Audit

### Overview
Synchronize project documentation to reflect the modularized profiles, update the roadmap, update `CAPABILITIES.md`, and validate the repository.

### Changes Required:
- **File:** `ROADMAP.md`
  - Move "Modular Profile / Skill Partitioning for Delivery & Audit Workflows" from `## Next` to `## Now / Shipped`.
- **File:** `CAPABILITIES.md`
  - Update description of `--preset minimal` and `--preset standard` to reflect the 7 build skills in minimal vs. 10 skills in full mode.
  - Clean up outdated lines (e.g. lines 308-319).
- **File:** `README.md`
  - Update Presets and Profiles table and RPI section to document minimal (7 build skills) vs standard (10 skills).

### Verification Checkpoint:
*Automated Verification:* `npm test && npm run lint && node bin/cli.js validate .`

### Tasks:
- [x] Update `ROADMAP.md`.
- [x] Update `CAPABILITIES.md` and `README.md`.
- [x] Run full verification: `npm test && npm run lint && node bin/cli.js validate .`.
- [x] Review `git diff` and confirm zero unintended modifications.
