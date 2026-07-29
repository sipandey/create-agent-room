# Design: Cursor Stop parity + multi-tool sync (hybrid mini)

**Date:** 2026-07-29  
**Status:** Approved (architecture, components, testing)  
**Scope slice:** Phase A+C now; Phase B (evidence-lite) deferred to a follow-up design

## Goal

For open-source adopters: close the gap where Cursor gets guidance files but no runtime enforcement, and where `sync` only mirrors skills to Claude. Quality bar is **control** — agents stay inside boundaries — not more prose they can ignore.

## North star (chosen)

**D — Hybrid mini:** Cursor Stop-hook parity + multi-tool skill/rules sync first; evidence-lite enforcement next (separate design).

## Non-goals (this slice)

- Windsurf / Cline / Codex runtime hooks
- `preToolUse` / `beforeShellExecution` deny lists
- New skill-pack *content* (wiring only)
- Evidence-lite content checks (Phase B)
- New runtime npm dependencies (commander, zod, gitleaks, etc.)
- Inventing a Cursor `SKILL.md` tree before a stable convention is confirmed

## Architecture

One shared close-the-loop checker; tool adapters only translate *how* to block or continue. One skills source of truth; `sync` fans out per selected tool.

```
.agent-room/skills/*.md                         ← canonical
.agent-room/hooks/close-the-loop-check.js       ← shared logic + thin adapters
        │
        ├─ Claude: .claude/settings.json Stop
        │          → exit 2 + stderr (blocks turn end)
        └─ Cursor: .cursor/hooks.json stop
                   → stdout JSON { followup_message }
                     (forces another turn; same user outcome)

sync
        ├─ Claude: .claude/skills/<name>/SKILL.md
        └─ Cursor: regenerate .cursor/rules/agent-room.md
                   (rules sync only — not a skills dir yet)
```

**Honest capability difference:** Claude’s Stop hook *blocks* ending the turn. Cursor’s `stop` hook cannot block the same way; it auto-submits a `followup_message`. Document this in CAPABILITIES.md / README — same check, different mechanism.

## Components

### Shared hook core

Extract pure logic from `close-the-loop-check.js`:

```
checkClosingTheLoop(cwd) → { ok, sourceChanges, message }
```

Thin runners via `--adapter=claude|cursor` (default `claude` for backward compatibility with existing `.claude/settings.json` entries that omit the flag):

| Adapter | On fail | On pass |
|---|---|---|
| `claude` (default) | stderr + `exit 2` | `exit 0` |
| `cursor` | stdout `{ "followup_message": "<guidance>" }`, `exit 0` | empty/`{}`, `exit 0` |

Unknown `--adapter` → exit 1 with a clear error.

### `init --tools cursor`

Today only writes `.cursor/rules/agent-room.md`. Add:

1. Install/reuse the shared hook under `.agent-room/hooks/` (same file Claude uses — do not duplicate logic).
2. Write/merge `.cursor/hooks.json`:

```json
{
  "version": 1,
  "hooks": {
    "stop": [
      {
        "command": "node .agent-room/hooks/close-the-loop-check.js --adapter=cursor",
        "loop_limit": 5
      }
    ]
  }
}
```

3. Merge safely if the file exists (preserve unrelated hooks; same spirit as `.claude/settings.json` Stop merge).
4. Extend scaffold path prefixes so `.cursor/hooks.json` / `.cursor/hooks/**` do not false-trigger the check.
5. Post-init summary: list Cursor stop as enforced, with the followup_message caveat.

`init --tools claude,cursor` → one hook file, both adapters wired.

### `sync` multi-tool

Read `tools` from `.agent-room.json`.

| Tool in config | Sync behavior |
|---|---|
| `claude` | Existing: `.agent-room/skills/*.md` → `.claude/skills/<name>/SKILL.md` |
| `cursor` | Regenerate `.cursor/rules/agent-room.md` from template + current skill list so rules stay accurate after skill edits |

`--check`, dirty-file skip, and `--force` behave as today, per destination.

Codex / Windsurf / Cline: out of this slice (init-time rule copy only; no sync).

### Docs

Update CAPABILITIES.md and README Feature Categories:

- Cursor runtime enforcement via `stop` → follow-up loop
- Claude via exit-2 block
- `sync` no longer Claude-only for rules/skills fan-out (Claude skills + Cursor rules)

### `doctor` / `dry-run`

- `init --dry-run` reports Cursor hook paths that would be written.
- `doctor`: if `.agent-room.json` lists `cursor` but `.cursor/hooks.json` is missing or unwired → advisory finding; hook drift vs template (same pattern as Claude/git).

## Error handling & edge cases

- No `.agent-room/` or not a git repo → pass (unchanged).
- Cursor stdin: if JSON `status` is `aborted` or `error` → pass (do not loop on cancel / hard fail). Missing/unparseable stdin → still run the check (Claude / local invoke).
- `loop_limit: 5` on Cursor stop entry; fail message tells the agent to log or add a waiver.
- Invalid JSON in `.cursor/hooks.json` / `.claude/settings.json` → warn and re-init carefully when parse fails; never wipe unrelated keys when parse succeeds.
- Pre-existing dirty work tree → known limitation (document; not fixed in this slice).

## Testing (TDD)

1. **Unit:** `checkClosingTheLoop` — source-only dirty → fail; log touched → pass; scaffold-only → pass; Cursor scaffold paths ignored.
2. **Adapter CLI:** `--adapter=cursor` failure → valid JSON with `followup_message`; success → nothing/`{}`; `--adapter=claude` → exit 2 + stderr; default = claude.
3. **init:** `--tools cursor` writes/merges `hooks.json` + rules; `--tools claude,cursor` wires both without duplicating the hook script; merge preserves foreign hooks.
4. **sync:** `tools: ["cursor"]` refreshes rules; `["claude","cursor"]` does both; `--check` reports drift; Claude-only rooms unchanged.
5. **doctor:** `cursor` in config but no `hooks.json` → advisory finding.

## Phase B (deferred — not this PR)

Evidence-lite: require decision / anti-pattern / session-log *structure or content*, not mere file touch. Separate design after A+C ships.

## Dependencies

None new. Optional later (out of this design): `picomatch` for globs, optional `gitleaks` shell-out — see session brainstorm notes; not required for A+C.

## Implementation order (when approved to code)

1. Extract `checkClosingTheLoop` + failing tests.
2. Adapter CLI (`--adapter`) + Cursor JSON output tests.
3. `init` Cursor `hooks.json` merge + scaffold prefixes + dry-run/summary.
4. `sync` Cursor rules path + tests.
5. `doctor` finding + CAPABILITIES/README honesty updates.
6. Closing-the-loop log entries for any non-obvious calls made during implementation.
