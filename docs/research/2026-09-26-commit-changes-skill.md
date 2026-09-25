---
date: 2026-09-26T00:25:30+05:30
git_commit: 97ee6c5d89a7e4d5cdf0f606981aaf8d893230f0
branch: feature/story-9.7-commit-changes-skill
repository: create-agent-room
topic: "Atomic Commit Workflow Skill (Story 9.7)"
tags: [research, skills, git, commit, workflow, guardrails, governance]
status: complete
---

# Research: Atomic Commit Workflow Skill (Story 9.7)

## Research Question
What is the current git workflow, hook enforcement, and skill architecture in `create-agent-room`, and what are the exact requirements to introduce the canonical `commit-changes.md` skill (`/commit`) with pre-commit guardrail verification, atomic file grouping, imperative commit conventions, user approval gates, and zero AI attribution?

## Summary
In `create-agent-room`, git interactions are governed by multiple layers:
1. **Repository Rules & Identity**: [`AGENTS.md`](AGENTS.md) specifies exact commit author identity (`Siddharth Pandey <siddharth.pandey06@gmail.com>`), forbids unsolicited `git push`, and forbids history rewrites without explicit instruction.
2. **Pre-Commit Enforcement**: [`.agent-room/hooks/guardrails-check.js`](.agent-room/hooks/guardrails-check.js) enforces protected paths, secret scanning, scope guidance (`maxFilesPerChange: 20`, `maxLinesPerChange: 500`), scope boundaries, and optional `verifyOnCommit` test execution.
3. **Core Skills Registry**: [`lib/skill.js`](lib/skill.js) registers framework core skills in `CORE_SKILL_FILES`.
4. **Multi-Agent Sync**: [`lib/sync.js`](lib/sync.js) mirrors `.agent-room/skills/*.md` to `.claude/skills/<name>/SKILL.md` and generates tool rules for Cursor, Windsurf, Cline, Codex, and GitHub Copilot.

Currently, agents completing implementation phases in CAR lack a standardized procedural skill for staging and committing changes. This historically leads to:
- Committing too many files at once and tripping `guardrails-check.js` (`limit 20 files, limit 500 lines`).
- Using dangerous shortcuts like `git add .` or `git add -A` which can stage secrets or temp files.
- Adding unwanted AI attribution (`Co-Authored-By: Claude...`).
- Failing to present the commit plan to the human developer before staging.
- Attempting unsolicited `git push` commands.

Story 9.7 introduces the canonical `commit-changes.md` skill (`/commit`) to solve these exact failure modes.

## Detailed Findings

### 1. Guardrail Hook Mechanics (`guardrails-check.js`)
When `git commit` is executed, the pre-commit hook runs and verifies:
- **Protected Paths**: Changes cannot touch `infrastructure/**`, `**/*.tfstate`, `.github/workflows/**`, `.agent-room/guardrails.json`, `.agent-room/guardrails.md`, `.agent-room/hooks/**`, or `.claude/settings.json` without an explicit bypass (`GUARDRAILS_BYPASS=1`).
- **Forbidden Actions / Secret Scanning**: Rejects commits containing AWS keys, private keys, API keys, Slack tokens, and GitHub personal access tokens.
- **Scope Guidance**: By default, checks `stagedFiles.length <= maxFilesPerChange (20)` and `totalLines <= maxLinesPerChange (500)`.
- **Architectural Import Boundaries**: Blocks imports crossing designated module boundaries.
- **Verification on Commit**: If configured in `.agent-room.json`, runs tests before allowing the commit.

### 2. Core Skills Registration in `lib/skill.js`
In `lib/skill.js`:
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
Adding `'commit-changes.md'` to `CORE_SKILL_FILES`:
- Categorizes `commit-changes` as a built-in core framework skill.
- Prevents `create-agent-room skill remove` from erroneously treating it as an optional pack.
- Enables `create-agent-room skill list` to display it under Core Skills.

### 3. File Distribution & Synchronization
Like the other core skills, `commit-changes.md` must be placed in:
1. `templates/.agent-room/skills/commit-changes.md` (shipped template for new rooms)
2. `.agent-room/skills/commit-changes.md` (active dogfooded room)
3. Mirrored to `.claude/skills/commit-changes/SKILL.md` (Claude Code skill format)
4. Mirrored into tool rule files (`.cursor/rules/agent-room.mdc`, `.windsurfrules`, `.clinerules`, `.codexrules`, `.github/copilot-instructions.md`) via `create-agent-room sync --all`.

### 4. Behavioral Requirements for the `commit-changes` Skill
The prompt must enforce:
1. **Pre-Commit Assessment**:
   - Inspect `git status` and `git diff` to understand what was accomplished.
   - Re-verify git author identity (`git config user.name && git config user.email`).
   - Check active branch (`git branch --show-current`) to ensure changes are not committed directly to `main`/`master` without intent.
2. **Atomic Planning**:
   - Split modifications across multiple logical commits if distinct concerns exist (e.g. core feature vs. tests vs. documentation vs. tool configs).
   - Keep commits under `maxFilesPerChange` (20) and `maxLinesPerChange` (500).
   - Write clear, imperative commit messages focusing on *why*, not just *what*.
3. **Interactive Plan Approval Gate**:
   - Must present the commit plan to the user:
     - List of files for each commit.
     - Planned commit message.
     - Prompt: `"I plan to create [N] commit(s) with these changes. Shall I proceed?"`
   - Must wait for explicit human approval before running `git add` or `git commit`.
4. **Execution Seatbelts**:
   - Only use `git add <file1> <file2>...` with explicit file paths. Never `git add -A` or `git add .`.
   - Never add `Co-Authored-By` or AI attribution trailers.
   - Show result with `git log --oneline -n [N]`.
   - Never run `git push` without explicit human instruction.
