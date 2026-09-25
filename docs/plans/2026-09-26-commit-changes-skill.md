---
date: 2026-09-26T00:26:00+05:30
research_doc: docs/research/2026-09-26-commit-changes-skill.md
branch: feature/story-9.7-commit-changes-skill
status: complete
phases_total: 4
phases_completed: 4
---

# Implementation Plan: Atomic Commit Workflow Skill (Story 9.7)

## Overview
Implement the canonical `commit-changes.md` procedural skill (`/commit`) in `create-agent-room`, standardizing atomic commit formulation, imperative messages, pre-commit guardrail checks, clean user attribution, and mandatory human confirmation gates across all supported tool interfaces.

---

## What We're NOT Doing
- We are NOT implementing automated git commit generation in CLI binaries (this is an agent procedural skill, not a headless CLI auto-committer).
- We are NOT enabling automated `git push` (pushing requires explicit user command).
- We are NOT removing any existing pre-commit hooks or guardrail policies.
- We are NOT introducing any external dependencies or npm packages.

---

## Phase 1: Author `commit-changes.md` Skill & Template
Implement the canonical skill document adhering to CAR's prompt standards, frontmatter requirements, and operational seatbelts.

- [x] **Phase 1.1**: Create `templates/.agent-room/skills/commit-changes.md` with:
  - YAML frontmatter: `name: commit-changes`, `description: "Formulate atomic git commits with pre-commit guardrail verification, user approval gate, and zero AI attribution."`
  - Hard Gate: No unsolicited pushes, no AI co-author attribution, never `git add .` or `git add -A`.
  - Pre-commit verification: `git status`, `git diff`, `git branch --show-current` branch check, `git config user.name && git config user.email` identity check.
  - Scope guidance compliance: Enforce max 20 files / 500 lines per commit from `.agent-room/guardrails.json`.
  - Interactive Plan Approval Gate: Present files + imperative commit message and prompt: `"I plan to create [N] commit(s) with these changes. Shall I proceed?"`.
  - Execution protocol: Specific file adds (`git add <file>`), imperative commits, and output display (`git log --oneline -n [N]`).
- [x] **Phase 1.2**: Copy `templates/.agent-room/skills/commit-changes.md` to `.agent-room/skills/commit-changes.md` for dogfooding.

### Automated Verification
```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('templates/.agent-room/skills/commit-changes.md', 'utf8');
if (!content.includes('name: commit-changes')) throw new Error('Missing frontmatter name');
if (!content.includes('Shall I proceed?')) throw new Error('Missing approval prompt');
if (!content.includes('Co-Authored-By')) throw new Error('Missing co-author prohibition');
"
```

---

## Phase 2: Register Core Skill & Add Test Coverage
Register `commit-changes.md` in `lib/skill.js` and add unit test coverage in `test/skill.test.js`.

- [x] **Phase 2.1**: Update `CORE_SKILL_FILES` in `lib/skill.js` to include `'commit-changes.md'`.
- [x] **Phase 2.2**: Add test in `test/skill.test.js` verifying that `CORE_SKILL_FILES` includes `'commit-changes.md'` and that the skill file exists in templates and has valid frontmatter.

### Automated Verification
```bash
node --test test/skill.test.js
```

---

## Phase 3: Synchronize Multi-Agent Tool Adapters
Propagate the new skill to Claude Code, Cursor, Windsurf, Cline, Codex, and GitHub Copilot.

- [x] **Phase 3.1**: Run `node bin/cli.js sync . --all --force` to mirror `.claude/skills/commit-changes/SKILL.md` and update IDE tool rule manifests.
- [x] **Phase 3.2**: Verify that `create-agent-room validate .` passes cleanly.

### Automated Verification
```bash
node bin/cli.js sync . --all --check && node bin/cli.js validate .
```

---

## Phase 4: Full Repository Verification & Closing the Loop
Ensure entire test suite and lint checks pass cleanly, update session logs, and prepare atomic commits.

- [x] **Phase 4.1**: Run full test suite and linter: `npm test && npm run lint`.
- [x] **Phase 4.2**: Update `BACKLOG.md` marking Story 9.7 as ✅ **DONE**.
- [x] **Phase 4.3**: Append architectural decision to `.agent-room/decisions.md`.
- [x] **Phase 4.4**: Dogfood the newly created `/commit` protocol to commit and push changes on branch `feature/story-9.7-commit-changes-skill`.

### Automated Verification
```bash
npm test && npm run lint && node bin/cli.js lint-sessions .
```

---

## Rollback Plan
If any step fails or tests regress:
```bash
git checkout -- templates/.agent-room/skills/commit-changes.md .agent-room/skills/commit-changes.md lib/skill.js test/skill.test.js
git clean -fd .claude/skills/commit-changes/
```
