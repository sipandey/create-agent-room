---
date: 2026-09-25T17:57:42Z
git_commit: 1a7422e0d6cc8eed57874cd9097aed02b8b482f8
branch: main
repository: create-agent-room
topic: "Core RPI Guidance & Skill Suite (Story 9.1)"
tags: [research, skills, rpi, guidance, prompt-engineering, governance]
status: complete
---

# Research: Core RPI Guidance & Skill Suite

## Research Question
How are skills, procedures, and agent workflows currently implemented in `create-agent-room`, and what is the exact architecture needed to introduce the 4 core RPI skills (`research-codebase.md`, `writing-plans.md`, `implement-plan.md`, `iterate-plan.md`) without breaking existing tool adapters or violating CAR's zero-dependency invariant?

## Summary
In `create-agent-room`, skills are Markdown documents located in `.agent-room/skills/` with YAML frontmatter headers containing `name` and `description`. These skills serve two functions:
1. Procedural playbooks directly read and followed by LLM agents.
2. Source files mirrored into tool-specific locations (e.g. `.claude/skills/<name>/SKILL.md` for Claude Code, and referenced in `.cursor/rules/agent-room.mdc` for Cursor).

Currently, CAR includes 6 core skills: `brainstorming.md`, `writing-plans.md`, `test-driven-development.md`, `systematic-debugging.md`, `verification-before-completion.md`, and `closing-the-loop.md`.
The existing `brainstorming.md` attempts to cover context exploration, questioning, and solution design in a single unstructured pass. This leads to models assuming existing patterns rather than verifying them on disk.

To introduce RPI (Story 9.1), we need to:
1. Author `research-codebase.md` (read-only factual exploration).
2. Refactor `writing-plans.md` (phased plan authoring with automated verification and checkboxes, ingesting the research doc).
3. Author `implement-plan.md` (mechanical execution updating `- [x]` checkboxes on disk).
4. Author `iterate-plan.md` (surgical plan revisions).
5. Update `CORE_SKILL_FILES` in `lib/skill.js` to recognize the new skills.
6. Package them in both `templates/.agent-room/skills/` and the repo's dogfooded `.agent-room/skills/`.

## Detailed Findings

### 1. Skill Storage & Templating Structure

Skills exist in two parallel locations:
- **Packaged templates:** [`templates/.agent-room/skills/`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/templates/.agent-room/skills/)
  These are copied into target repositories during `create-agent-room init`.
- **Dogfooded local directory:** [`.agent-room/skills/`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/.agent-room/skills/)
  The active skills used by agents working inside `create-agent-room` itself.

Each skill follows a strict frontmatter format:
```markdown
---
name: skill-name
description: "Brief summary used by tool loaders"
---

# Title
## Overview
...
```

### 2. Core Skill Registry in `lib/skill.js`

In [`lib/skill.js:60-67`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/lib/skill.js#L60-L67), built-in core skills are tracked via:
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
Any file in `.agent-room/skills/` that matches `CORE_SKILL_FILES` is recognized as a built-in core skill. Any `.md` file in `.agent-room/skills/` that is NOT in `CORE_SKILL_FILES` and not in `BUILTIN_SKILL_PACKS` is treated as a `custom` user skill (`lib/skill.js:167`).

Adding `research-codebase.md`, `implement-plan.md`, and `iterate-plan.md` requires updating `CORE_SKILL_FILES` in `lib/skill.js` so that `create-agent-room skill list` reports them correctly as core rather than unmanaged custom skills.

### 3. Tool Adapter Mirroring & Synchronization

- **Claude Code (`.claude/skills/`):**
  - [`lib/init.js:669-694`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/lib/init.js#L669-L694) (`mirrorSkillsToClaude`) and [`lib/sync.js:102-140`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/lib/sync.js#L102-L140) (`syncClaudeSkills`) inspect `.agent-room/skills/` and copy each `<name>.md` to `.claude/skills/<name>/SKILL.md`.
  - Claude Code auto-discovers these directories and exposes them as tool skills.
- **Cursor (`.cursor/rules/agent-room.mdc`):**
  - [`lib/init.js:709-714`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/lib/init.js#L709-L714) formats the installed skills into a comma-separated list (`formatSkillList`) and injects it into `.cursor/rules/agent-room.mdc` via `{{SKILL_LIST}}`.
- **Windsurf, Cline, Codex, Copilot:**
  - Mirroring occurs through `lib/sync.js` rules synchronization.

### 4. Existing Skills Analysis

#### 4.1 `brainstorming.md` (65 lines)
- **Current Flow:** Context Exploration -> Ask questions (1 at a time) -> Propose 2-3 approaches -> Present design section-by-section -> Write design doc -> Implementation.
- **Limitation:** Tries to combine read-only codebase exploration with creative architectural design. Agents often propose designs without first surveying the real files on disk.

#### 4.2 `writing-plans.md` (88 lines)
- **Current Flow:** Turn approved design into bite-sized tasks (2-5 min steps) with failing test, minimal code, verify pass, commit.
- **Limitation:** Lacks formal phasing with automated verification commands per phase, lacks explicit progress checkboxes (`- [ ]` / `- [x]`) for context-compaction recovery, and lacks "What We Are NOT Doing" boundaries.

#### 4.3 `verification-before-completion.md` (57 lines)
- **Current Flow:** Prose reminder: "Evidence before assertions, always."
- **Limitation:** Purely advisory prose with no mechanical hook. Under RPI, automated verification is embedded directly into each phase checklist in the implementation plan.

### 5. Code References

- [`lib/skill.js:60-67`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/lib/skill.js#L60-L67) — Definition of `CORE_SKILL_FILES`.
- [`lib/skill.js:163-175`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/lib/skill.js#L163-L175) — Discovery of custom vs. core skills.
- [`lib/init.js:669-694`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/lib/init.js#L669-L694) — `mirrorSkillsToClaude` logic.
- [`lib/sync.js:102-140`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/lib/sync.js#L102-L140) — Claude skill directory synchronization.
- [`test/skill.test.js:25-53`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/test/skill.test.js#L25-L53) — Tests validating core vs. custom skill classification.
- [`templates/.agent-room/skills/`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/templates/.agent-room/skills/) — Packaged skill files.
- [`.agent-room/skills/`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/.agent-room/skills/) — Dogfooded skill files.

## Open Questions for Planning Phase (Phase 2)

1. **Retirement Timeline for `brainstorming.md`:** Should `brainstorming.md` be retired in Story 9.1 or kept until Story 9.6 while being updated with a deprecation notice pointing to `research-codebase.md` + `writing-plans.md`?
2. **Sub-agent Execution on Non-Goose Agents:** Goose natively supports spawning parallel sub-agents (`sub_recipes`). For single-thread tools (Claude Code without subagents, Cursor), how should `research-codebase.md` instruct the agent? (Recommendation: sequential execution of the 3 subroutines: Locate files -> Analyze code -> Find patterns).
3. **Artifact Directory Conventions:** Should research documents be written to `docs/research/` or `thoughts/research/`? (Recommendation: `docs/research/` to match CAR's existing `docs/plans/` convention).
