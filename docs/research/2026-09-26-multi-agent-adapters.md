---
date: 2026-09-26T03:49:37Z
git_commit: 85014276a33dc490eabfafd3bc8c139349f6a929
branch: feature/story-9.4-multi-agent-adapters
repository: create-agent-room
topic: "Multi-Agent Adapters: Claude Slash Commands & Cursor RPI Rules (Story 9.4)"
tags: [research, adapters, rpi, claude-commands, cursor-rules, multi-agent]
status: complete
last_updated: 2026-09-26
---

# Research: Multi-Agent Adapters: Claude Slash Commands & Cursor RPI Rules (Story 9.4)

## Research Question
How are multi-agent tool adapters currently implemented across `create-agent-room` (Claude Code, Cursor, Windsurf, Cline, Codex, Copilot), and what architectural extensions are required to:
1. Provide Claude Code custom slash command shortcuts (`/research`, `/plan`, `/implement`, `/iterate`) alongside mirrored skills?
2. Inject canonical RPI guidelines into `.cursor/rules/agent-room.mdc` to guide Cursor's agent mode through the phased sequence?

---

## Summary
Currently, `create-agent-room` supports 6 coding assistants: `claude`, `cursor`, `windsurf`, `cline`, `codex`, and `copilot`.
Each assistant adapter falls into one of three architectural patterns:
1. **Rule Manifest Mirroring (`SIMPLE_TOOL_ADAPTERS` & `RULES_SYNC_ADAPTERS`):** Single template copy to root rule files (`.windsurfrules`, `.clinerules`, `.codexrules`, `.cursor/rules/agent-room.mdc`, `.github/copilot-instructions.md`) with variable interpolation (`{{PROJECT_NAME}}`, `{{SKILL_LIST}}`).
2. **Skill Directory Mirroring:** Claude Code mirrors all `.agent-room/skills/*.md` files into `.claude/skills/<name>/SKILL.md`.
3. **Turn Gate & Hook Wiring:** Claude Code (`.claude/settings.json`) and Cursor (`.cursor/hooks.json`) wire pre-stop hooks pointing to `.agent-room/hooks/close-the-loop-check.js`.

To satisfy Story 9.4 (focused on multi-agent adapters without Goose):
1. **Claude Code Adapter:** Provide native custom slash commands in `.claude/commands/{research,plan,implement,iterate}.md` that invoke the RPI procedure skills with `$ARGUMENTS`, installed during `init` and synced during `sync`.
2. **Cursor Adapter:** Enhance `templates/adapters/cursorrules.tmpl` and `.cursor/rules/agent-room.mdc` with explicit RPI Execution Pipeline guidelines directing Cursor's agent mode through the phased sequence (Research -> Plan & Iterate -> Implement -> Audit -> Deliver).
3. **Multi-Agent Parity:** Maintain clean synchronization across all 6 supported tools via `create-agent-room sync`.

---

## Detailed Findings

### 1. Claude Code Adapter Architecture
- **Skill Mirroring:** In [`lib/init.js:679-704`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/lib/init.js#L679-L704) and [`lib/sync.js:240-268`](file:///Users/sidpande2/Documents/SIDDHARTH/create-agent-room/lib/sync.js#L240-L268), skills are mirrored from `.agent-room/skills/<name>.md` to `.claude/skills/<name>/SKILL.md`. Claude Code exposes these as `/research-codebase`, `/writing-plans`, etc.
- **Custom Slash Commands:** Claude Code discovers custom markdown slash commands in `.claude/commands/<command>.md`. Placing `research.md`, `plan.md`, `implement.md`, and `iterate.md` in `.claude/commands/` exposes `/research`, `/plan`, `/implement`, and `/iterate` to the developer with argument capture via `$ARGUMENTS`.
- **Sync Integration:** In `lib/sync.js`, Claude synchronization must sync both `.claude/skills/` and `.claude/commands/`, detecting drift and maintaining parity with templates.

### 2. Cursor Adapter Architecture
- **Rule File:** Cursor rules live at `.cursor/rules/agent-room.mdc` generated from `templates/adapters/cursorrules.tmpl`.
- **Current Content:** Currently lists files under `.agent-room/` and interpolated `{{SKILL_LIST}}`, but does not prescribe the mandatory RPI execution order.
- **RPI Guidelines:** Adding explicit 5-stage RPI pipeline instructions ensures Cursor's agent mode enforces research before planning, planning before coding, and post-implementation auditing before finishing turns.

### 3. Integration Touchpoints in CAR
- **`lib/init.js`:**
  - `installClaudeCommands`: Copies `.claude/commands/*.md` templates when `tools.includes('claude')`.
- **`lib/sync.js`:**
  - Synchronize `.claude/commands/` alongside `.claude/skills/`.
  - Check for drift in `.claude/commands/` in `checkOnly` mode.
- **`templates/adapters/`:**
  - `claude-commands/research.md`: Custom command prompt executing `research-codebase`.
  - `claude-commands/plan.md`: Custom command prompt executing `writing-plans`.
  - `claude-commands/implement.md`: Custom command prompt executing `implement-plan`.
  - `claude-commands/iterate.md`: Custom command prompt executing `iterate-plan`.
  - `cursorrules.tmpl`: Updated with RPI Execution Pipeline rules.

---

## Code References
- `lib/init.js:679-704` - `mirrorSkillsToClaude` skill mirroring
- `lib/init.js:1220-1234` - Claude adapter installation in `runInit`
- `lib/sync.js:11-42` - `RULES_SYNC_ADAPTERS` array
- `lib/sync.js:44` - `ALL_SYNC_TOOLS` declaration
- `lib/sync.js:186-224` - `checkSkillsSync`
- `lib/sync.js:240-268` - `syncSkillsToClaude`
- `templates/adapters/cursorrules.tmpl` - Cursor rule template

## Constraints & Invariants
- Zero new runtime npm dependencies.
- Zero AI attribution in git commits or scaffolded files.
- Preserves backwards compatibility: existing projects continue functioning without error.
- All YAML/Markdown files must parse cleanly and conform to schema.
