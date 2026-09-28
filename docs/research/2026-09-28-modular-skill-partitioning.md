---
date: 2026-09-28T07:48:27Z
git_commit: 2b748177f83c032536f696f5428bc6518803b274
branch: feature/modular-skill-partitioning
repository: create-agent-room
topic: "Modular Profile / Skill Partitioning for Delivery & Audit Workflows"
tags: [research, codebase, rpi, skills, profiles, modularization]
status: complete
last_updated: 2026-09-28
---

# Research: Modular Profile / Skill Partitioning for Delivery & Audit Workflows

## Research Question
How should `create-agent-room` partition the canonical 10-skill suite so that default `--profile minimal` / `--preset minimal` rooms package strictly the core build loop (the 4 RPI triad skills and 3 core hygiene skills), while downstream delivery and audit skills (`commit-changes`, `validate-plan`, `describe-pr`) are modularized into full mode (`--profile full` / `--preset standard` / `--preset strict`) or optional skill packs, reducing prompt token overhead without breaking backwards compatibility or validation?

## Summary
Currently, `create-agent-room init` defaults to `--profile minimal`, which excludes secondary guidance documents (`principles.md`, `workflow-classifier.md`, and `.agent-room/coordination/`). However, all 10 procedural skill files located in `templates/.agent-room/skills/` are unconditionally copied into `.agent-room/skills/` regardless of the profile. This produces an initial guidance corpus of ~16,400 tokens (~26,000 bytes) even in minimal mode.

The roadmap item under `## Next` in `ROADMAP.md` calls for further streamlining `--profile minimal` to package strictly the **Core Build Triad** (`research-codebase.md`, `writing-plans.md`, `implement-plan.md`, `iterate-plan.md`) and **Core Hygiene** (`test-driven-development.md`, `systematic-debugging.md`, `closing-the-loop.md`) — 7 skills total. Downstream delivery and audit skills (`commit-changes.md`, `validate-plan.md`, `describe-pr.md`) are partitioned into full mode (`--profile full` / `--preset standard` / `--preset strict`) and made available as optional skill pack inclusions (`release`, `code-review`) or via `create-agent-room skill add`.

This research document analyzes the current scaffolding, skill registry, adapter synchronization, and testing mechanics to establish a clean, zero-dependency implementation path.

## Detailed Findings

### 1. Scaffolding & Profile Exclusion (`lib/init.js`)
- `runInit` (lines 1140–1165 in `lib/init.js`) defines `minimalProfileExcludes`:
  ```javascript
  const minimalProfileExcludes = ['principles.md', 'workflow-classifier.md', /^coordination\//];
  const agentRoomOpts = Object.assign({}, opts, {
    exclude: profile === 'minimal' ? minimalProfileExcludes : []
  });
  ```
  `copyDirInherited` in `lib/fsutil.js` checks each relative path against `opts.exclude`. Because `minimalProfileExcludes` does not currently include any skill paths, every file in `templates/.agent-room/skills/` is copied.
- `buildAgentsMdSections` (lines 420–530 in `lib/init.js`) renders `GUIDANCE_LINKS` and `DEFAULT_WORKFLOW` for `AGENTS.md`. In both full and minimal branches, all 10 skills are listed:
  - Lines 440–443 & 497–500: lists `commit-changes`, `validate-plan`, `describe-pr`.
  - Lines 460–462 & 516–517: describes `- Audit: Run validate-plan ...` and `- Deliver: Run commit-changes ... and describe-pr ...`.
- In `estimateGuidanceTokens` (lines 1036–1060 in `lib/init.js`), token estimation sums the byte size of all files scaffolded into `.agent-room/` (excluding `hooks/` and `sessions/`) divided by 4.
  - The 3 delivery/audit skills account for:
    - `commit-changes.md`: ~7,069 bytes (~1,767 tokens)
    - `describe-pr.md`: ~9,206 bytes (~2,301 tokens)
    - `validate-plan.md`: ~9,791 bytes (~2,447 tokens)
    - Total delivery/audit weight: ~26,066 bytes (~6,515 tokens).
  - Removing these 3 files from `--profile minimal` reduces the guidance token footprint from ~16,400 tokens down to ~9,900 tokens (a ~40% reduction in context window consumption).

### 2. Skill Registry & Management (`lib/skill.js`)
- `CORE_SKILL_FILES` (lines 64–75 in `lib/skill.js`) is an exported array of the 10 canonical skills:
  ```javascript
  const CORE_SKILL_FILES = [
    'closing-the-loop.md',
    'commit-changes.md',
    'describe-pr.md',
    'implement-plan.md',
    'iterate-plan.md',
    'research-codebase.md',
    'systematic-debugging.md',
    'test-driven-development.md',
    'validate-plan.md',
    'writing-plans.md'
  ];
  ```
- `BUILTIN_SKILL_PACKS` (lines 11–57 in `lib/skill.js`) defines optional packs:
  - `release`: `files: ['release-management.md']`.
  - `code-review`: `files: ['code-review.md']`.
- `listSkillPacks` (lines 122–202 in `lib/skill.js`) inspects `.agent-room/skills/` on disk:
  - Files matching `RETIRED_CORE_SKILL_FILES` are flagged as `deprecated`.
  - Files not in `CORE_SKILL_FILES` and not in `builtinFiles` are flagged as `custom`.
  - If `CORE_SKILL_FILES` remains the superset of all canonical core skills (both minimal build loop and extended delivery/audit), existing rooms that have all 10 skills will continue to recognize them as core rather than misclassifying them as `custom`.
- `addSkillPacks` (lines 204–332 in `lib/skill.js`):
  - Copies template files from `templates/skill-packs/<pack>` into `.agent-room/skills/`.
  - Also supports copying individual skill files if mapped.
  - Can incorporate `commit-changes.md`, `describe-pr.md`, or `validate-plan.md` into built-in packs (e.g. `release` or `code-review`) or allow adding them via `create-agent-room skill add`.

### 3. Tool Adapters & Slash Commands (`lib/init.js`, `lib/sync.js`)
- **Claude Code:**
  - `CLAUDE_COMMAND_FILES` in `lib/init.js` (line 706):
    `['research.md', 'plan.md', 'implement.md', 'iterate.md']`.
    These 4 commands map directly to the 4 RPI triad skills (`research-codebase`, `writing-plans`, `implement-plan`, `iterate-plan`). None of the 4 slash commands depend on `commit-changes`, `validate-plan`, or `describe-pr`.
  - `mirrorSkillsToClaude` mirrors whatever skills were scaffolded into `.agent-room/skills/` into `.claude/skills/<skill>/SKILL.md`.
    In minimal profile, Claude will mirror only the 7 build-loop skills, reducing token usage during Claude skill tool invocations.
- **Cursor, Windsurf, Cline, Codex, Copilot:**
  - Rules templates use `{{SKILL_LIST}}`, which is populated by `listSkillNamesFromDir(path.join(target, '.agent-room', 'skills'))`.
  - In minimal profile, `{{SKILL_LIST}}` will dynamically list only the 7 active skills.

### 4. Integrity Checks & Verification (`lib/checks.js`, `lib/validate.js`)
- `checkDir` and `checkFile` in `lib/checks.js`:
  - `collectFindings` (lines 98–116) requires `principles.md`, `workflow-classifier.md`, and `coordination/` only when `scaffoldedProfile !== 'minimal'`.
  - Section 3 (lines 221–280): Lints markdown skill files under `.agent-room/skills/` by parsing YAML frontmatter. It checks that *whichever* skill files exist have valid `---` delimiters, non-empty `name`, and non-empty `description`. It does NOT mandate specific skill filenames.
  - Therefore, scaffolding 7 skills instead of 10 in minimal mode will pass `validate` cleanly without schema errors.

### 5. Existing Tests & Invariants
- `test/init.test.js`:
  - `runInit: defaults to --profile minimal, skipping principles/workflow-classifier/coordination` tests that `writing-plans.md` exists.
  - Tests verify token estimation, template rendering, and guidance summaries.
- `test/skill.test.js`:
  - Tests `listSkillPacks`, `addSkillPacks`, `removeSkillPacks`, and checks `CORE_SKILL_FILES`.
- `test/validate.test.js`:
  - Tests `runValidate` on minimal and full profiles.
- All 414 tests currently pass. Any partitioning must ensure existing test suites and assertions for `--profile full` / `--preset standard` continue to pass.

## Code References
- `lib/init.js:1140-1147`: `minimalProfileExcludes` definition in `runInit`.
- `lib/init.js:420-530`: `buildAgentsMdSections` generating `AGENTS.md` across profiles.
- `lib/init.js:706`: `CLAUDE_COMMAND_FILES` definition for Claude slash commands.
- `lib/skill.js:11-57`: `BUILTIN_SKILL_PACKS` dictionary.
- `lib/skill.js:64-75`: `CORE_SKILL_FILES` canonical list.
- `lib/checks.js:221-280`: Markdown skill frontmatter validator.
- `ROADMAP.md:31-40`: Roadmap definition of the modular skill partitioning milestone.
- `CAPABILITIES.md:5-13`: Description of `--preset` / `--profile` and RPI delivery/audit tiers.

## Key Design Patterns & Conventions Discovered
- **Profile Exclude Pattern:** `copyDirInherited` in `lib/fsutil.js` supports strings and RegExp patterns in `opts.exclude`. For skills, an array of regexes or relative file paths (e.g. `path.join('skills', 'commit-changes.md')` or `/skills\/(commit-changes|validate-plan|describe-pr)\.md$/`) cleanly stops files from being written.
- **Dynamic Skill Detection:** Tool rules and summaries dynamically query `listSkillNamesFromDir` rather than hardcoding skill lists, so adapter manifests adapt to whatever skills are scaffolded.
- **Zero Runtime Dependencies:** All path manipulation, profile routing, frontmatter parsing, and CLI formatting use native Node.js APIs (`fs`, `path`, `child_process`).
- **Backward Compatibility:** `listSkillPacks` should treat both the 7 minimal build skills and the 3 delivery/audit skills as core (non-custom) skills so that existing rooms or upgraded rooms do not show warnings.
