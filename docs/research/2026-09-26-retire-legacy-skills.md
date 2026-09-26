---
date: 2026-09-26T08:36:40Z
git_commit: e318722a91061351c3b9ec47a496529989471cc3
branch: feature/story-9.6-retire-legacy-skills
repository: create-agent-room
topic: "Retire Redundant Legacy Skills (brainstorming, verification-before-completion) & Orphan Purging"
tags: [research, codebase, rpi, skills, deprecation, cleanup]
status: complete
last_updated: 2026-09-26
---

# Research: Retire Redundant Legacy Skills & Orphan Purging (Story 9.6)

## Research Question
How are `brainstorming.md` and `verification-before-completion.md` currently registered, scaffolded, synchronized, mirrored, and referenced across `create-agent-room`, and what architectural mechanisms are needed to cleanly unregister them, remove templates, purge lingering orphans via `sync --all` and `doctor --fix`, and update pointers across guidance documentation?

## Summary
The RPI (Research → Plan → Implement) framework (Stories 9.1–9.5) established modern, structured procedural skills that supersede the legacy procedural skills:
- `brainstorming.md` is superseded by `research-codebase.md` (read-only architectural exploration) and `writing-plans.md` (iterative design, Q&A, and trade-off analysis).
- `verification-before-completion.md` is superseded by `implement-plan.md` (per-phase test checkboxes and verification commands) and runtime enforcement in `close-the-loop-check.js`.

Currently, `brainstorming.md` and `verification-before-completion.md` remain registered in `CORE_SKILL_FILES` in `lib/skill.js`, exist as template files in `templates/.agent-room/skills/`, are scaffolded during `init`, are mirrored into `.claude/skills/`, and are referenced in `templates/.agent-room/principles.md`, `templates/adapters/CLAUDE.md.tmpl`, `CLAUDE.md`, and `closing-the-loop.md`.

Retiring these skills requires updating `CORE_SKILL_FILES` in `lib/skill.js`, introducing `RETIRED_CORE_SKILL_FILES` to differentiate legacy skills from user custom skills, removing the templates from `templates/.agent-room/skills/` and dogfood directories, enhancing `doctor` (`getFindings` and `fixFindings`) and `sync` (`checkSkillsSync` and `syncSkillsToClaude`) to detect and purge lingering orphans, and updating guidance docs and tests.

---

## Detailed Findings

### 1. Skill Registration & Management (`lib/skill.js`)
- **Location:** `lib/skill.js:60-73`
- `CORE_SKILL_FILES` currently contains 12 entries:
  - `brainstorming.md`
  - `closing-the-loop.md`
  - `commit-changes.md`
  - `describe-pr.md`
  - `implement-plan.md`
  - `iterate-plan.md`
  - `research-codebase.md`
  - `systematic-debugging.md`
  - `test-driven-development.md`
  - `validate-plan.md`
  - `verification-before-completion.md`
  - `writing-plans.md`
- In `listSkillPacks(target)` (`lib/skill.js:169-181`), existing files in `.agent-room/skills/` that are NOT in `CORE_SKILL_FILES` and not in `BUILTIN_SKILL_PACKS` are categorized as `custom` workspace skills. If `brainstorming.md` and `verification-before-completion.md` are simply dropped from `CORE_SKILL_FILES` without an explicit retirement list, any lingering files in a target workspace would be misclassified as user custom skills.
- An explicit array `RETIRED_CORE_SKILL_FILES = ['brainstorming.md', 'verification-before-completion.md']` allows CAR to distinguish deprecated framework artifacts from legitimate user custom skills.

### 2. Multi-Agent Synchronization (`lib/sync.js`)
- **Location:** `lib/sync.js:186-224`, `lib/sync.js:265-293`, `lib/sync.js:329-350`
- `checkSkillsSync(target)`:
  - Iterates `.agent-room/skills/*.md`.
  - Compares against `.claude/skills/<skillName>/SKILL.md`.
  - Flags any subdirectory in `.claude/skills/` not in `.agent-room/skills/` as `orphaned`.
- `syncSkillsToClaude(target)`:
  - Mirrors all `.agent-room/skills/*.md` into `.claude/skills/<skillName>/SKILL.md`.
  - Deletes any subdirectories in `.claude/skills/` that do not exist in `.agent-room/skills/`.
- Crucially, if `brainstorming.md` lingers in `.agent-room/skills/`, `syncSkillsToClaude` will preserve and mirror it.
- To fulfill Acceptance Criterion 3, `sync` should detect `RETIRED_CORE_SKILL_FILES` in `.agent-room/skills/`, remove or archive them, and then purge their corresponding `.claude/skills/` directories.
- Once removed from `.agent-room/skills/`, `listSkillNamesFromDir` will exclude them, ensuring tool adapters (`.cursor/rules/agent-room.mdc`, `.windsurfrules`, `.clinerules`, `.codexrules`, `.github/copilot-instructions.md`) automatically drop them from `{{SKILL_LIST}}`.

### 3. Repository Health & Auto-Remediation (`lib/doctor.js`)
- **Location:** `lib/doctor.js:189-240`, `lib/doctor.js:242-324`
- `getFindings(target)`:
  - Checks hook drift, CI version pins, and missing tools.
  - Does not currently inspect `.agent-room/skills/` for deprecated core skills.
  - Can be extended to inspect `.agent-room/skills/` and `.claude/skills/` for `RETIRED_CORE_SKILL_FILES`, emitting an advisory finding if found (e.g. `Deprecated legacy skill found: .agent-room/skills/brainstorming.md (superseded by RPI framework; run doctor --fix to remove)`).
- `fixFindings(target)`:
  - Currently syncs hooks, re-pins CI versions, and re-wires missing hooks.
  - Can be extended to delete lingering `RETIRED_CORE_SKILL_FILES` from `.agent-room/skills/` and `.claude/skills/`, logging `Removed deprecated legacy skill: ...`.

### 4. Templates & Dogfood Corpus
- **Templates:**
  - `templates/.agent-room/skills/brainstorming.md` (65 lines) — to be removed.
  - `templates/.agent-room/skills/verification-before-completion.md` (57 lines) — to be removed.
  - `templates/.agent-room/principles.md` — references `brainstorming.md` (7 occurrences) and `verification-before-completion.md` (1 occurrence).
  - `templates/.agent-room/skills/closing-the-loop.md` — references `verification-before-completion.md` (line 67).
  - `templates/adapters/CLAUDE.md.tmpl` — references `/brainstorming` and `/verification-before-completion`.
- **Dogfood & Local Workspace:**
  - `.agent-room/skills/brainstorming.md` — to be removed.
  - `.agent-room/skills/verification-before-completion.md` — to be removed.
  - `.claude/skills/brainstorming/` — to be purged.
  - `.claude/skills/verification-before-completion/` — to be purged.
  - `.agent-room/principles.md` — update references.
  - `.agent-room/skills/closing-the-loop.md` — update references.
  - `CLAUDE.md` — update references.
- **Scaffolding (`lib/init.js`):**
  - Uses `copyDirInherited` on `templates/.agent-room/skills/`. Removing the files from `templates/` immediately prevents `init` from scaffolding them into new projects.

### 5. Test Suites Impacted
- `test/init.test.js`:
  - Line 737: `assert.ok(fs.existsSync(path.join(tmpDir, '.agent-room', 'skills', 'brainstorming.md')));` needs to assert a canonical core skill like `writing-plans.md` or `research-codebase.md`.
  - Lines 560, 576, 590, 616: mock fixture paths in result-formatting tests can be updated or kept as synthetic paths.
- `test/sync.test.js`:
  - Lines 80, 130: tests creating a skill called `brainstorming.md` to verify rules generation. These should use a custom skill name or canonical skill so as not to collide with orphan purging logic.
- `test/skill.test.js`:
  - Tests verify `CORE_SKILL_FILES` contents and `listSkillPacks`. Update `CORE_SKILL_FILES` assertions and add tests for deprecated skill handling.
- `test/doctor.test.js`:
  - Add tests verifying that `doctor` flags lingering deprecated skills and `doctor --fix` purges them.

---

## Code References
- `lib/skill.js:60-73` — `CORE_SKILL_FILES` definition
- `lib/skill.js:169-181` — Custom skill discovery logic
- `lib/sync.js:186-224` — `checkSkillsSync` skill synchronization checks
- `lib/sync.js:265-293` — `syncSkillsToClaude` mirroring and orphan cleanup
- `lib/doctor.js:189-240` — `getFindings` advisory checks
- `lib/doctor.js:242-324` — `fixFindings` auto-remediation
- `templates/.agent-room/skills/` — Template skill files
- `templates/adapters/CLAUDE.md.tmpl:9-12` — Claude slash command instructions

---

## Key Design Patterns & Conventions Discovered
1. **Zero External Dependencies:** All file deletions and checks must use standard Node.js `fs` and `path`.
2. **Template-to-Dogfood Parity:** Files in `templates/.agent-room/` must match `.agent-room/` exactly.
3. **Idempotent Repair:** `doctor --fix` and `sync --all` must be safely re-runnable without throwing errors if files are already absent.
4. **Distinguishing Deprecated vs. Custom:** Without a clear `RETIRED_CORE_SKILL_FILES` constant, existing workspaces upgrading CAR would see `brainstorming.md` classified as a custom skill rather than flagged for retirement.
