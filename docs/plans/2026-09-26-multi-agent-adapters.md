---
date: 2026-09-26T03:52:00Z
research_doc: docs/research/2026-09-26-multi-agent-adapters.md
branch: feature/story-9.4-multi-agent-adapters
status: complete
phases_total: 5
phases_completed: 5
last_updated: 2026-09-26
---

# Implementation Plan: Multi-Agent Adapters: Claude Slash Commands & Cursor RPI Rules (Story 9.4)

## Context & Objectives
Story 9.4 delivers native ergonomic access to the Research → Plan → Implement (RPI) pipeline across supported AI coding agents:
1. **Claude Code:** Custom slash command shortcuts (`/research`, `/plan`, `/implement`, `/iterate`) in `.claude/commands/` using `$ARGUMENTS` to invoke the corresponding RPI procedure skills cleanly.
2. **Cursor:** Canonical RPI pipeline guidelines injected into `.cursor/rules/agent-room.mdc` guiding Cursor's agent mode through the phased sequence.
3. **Multi-Tool Synchronization:** Full support in `init` and `sync` maintaining parity between templates and workspace adapters.

*(Note: Per user direction, Goose integration has been removed from scope).*

---

## Phased Execution Checklist

### Phase 1: Multi-Agent Adapter Templates & RPI Guidelines
- [x] Create `templates/adapters/claude-commands/research.md` (invokes `research-codebase` with `$ARGUMENTS`).
- [x] Create `templates/adapters/claude-commands/plan.md` (invokes `writing-plans` with `$ARGUMENTS`).
- [x] Create `templates/adapters/claude-commands/implement.md` (invokes `implement-plan` with `$ARGUMENTS`).
- [x] Create `templates/adapters/claude-commands/iterate.md` (invokes `iterate-plan` with `$ARGUMENTS`).
- [x] Update `templates/adapters/cursorrules.tmpl` to inject explicit 5-stage RPI pipeline rules into Cursor's agent rules.
*Automated Verification:* Inspect created template files and verify formatting.

### Phase 2: Claude Commands Installation & Sync Machinery (`lib/init.js`, `lib/sync.js`)
- [x] Update `lib/init.js`:
  - Implement `installClaudeCommands` to copy `.claude/commands/*.md` templates when `tools.includes('claude')`.
  - Wire `installClaudeCommands` into `runInit` alongside `mirrorSkillsToClaude`.
- [x] Update `lib/sync.js`:
  - Implement `checkClaudeCommandsSync` in `runSync` for `checkOnly` mode.
  - Implement `syncClaudeCommands` to synchronize `.claude/commands/` templates, respecting dirty file protection and `--force`.
  - Include `.claude/commands/*` in sync completion summary output.
*Automated Verification:* `npm run lint`.

### Phase 3: Dogfooding & Repository Alignment
- [x] Scaffold `.claude/commands/` in repo root (`research.md`, `plan.md`, `implement.md`, `iterate.md`).
- [x] Synchronize root `.cursor/rules/agent-room.mdc` with RPI pipeline guidelines.
*Automated Verification:* `node bin/cli.js validate .` and `git status`.

### Phase 4: Unit Test Suite & CLI Verification
- [x] Add unit tests in `test/init.test.js`:
  - Verify `--tools claude` scaffolds `.claude/commands/{research,plan,implement,iterate}.md`.
  - Verify Cursor rules include RPI execution pipeline guidelines.
- [x] Add unit tests in `test/sync.test.js`:
  - Verify `runSync` syncs `.claude/commands/` when modified or missing.
  - Verify `runSync --check` detects out-of-sync Claude commands.
- [x] Run full test suite and linter.
*Automated Verification:* `npm test && npm run lint`.

### Phase 5: Governance, Backlog & Audit Report
- [x] Update `BACKLOG.md` (mark Story 9.4 as DONE with adjusted scope).
- [x] Append architectural decision to `.agent-room/decisions.md`.
- [x] Author plan validation audit in `docs/reviews/2026-09-26-story-9-4-validation.md`.
- [x] Author session log in `.agent-room/sessions/`.
*Automated Verification:* `node bin/cli.js validate .` and `npm run lint`.

---

## What We're NOT Doing
- We are NOT integrating Goose (`--tools goose`, `.goosehints`, Goose recipes) per explicit user direction.
- We are NOT removing deprecated skills in this story (`brainstorming`, `verification-before-completion`) — that is Story 9.6.
- We are NOT implementing runtime stop-hook plan gating in this story — that is Story 9.5.

---

## Success Criteria & Verification
- Claude Code slash commands `/research`, `/plan`, `/implement`, `/iterate` are generated and kept in sync.
- Cursor rules `.cursor/rules/agent-room.mdc` guide agent mode through the 5-stage RPI sequence.
- All existing and new unit tests pass (`npm test`, 387+ passing).
- ESLint passes clean with 0 warnings/errors.
- Repository passes `create-agent-room validate .`.
