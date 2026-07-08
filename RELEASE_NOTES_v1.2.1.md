# create-agent-room v1.2.1

## Highlights

- **Guardrails enforcement (opt-in):** a new pre-commit hook reads `guardrails.json` and blocks commits that touch protected paths or match forbidden-action patterns. Requires `--tools git` during `init`; escape hatch via `GUARDRAILS_BYPASS=1`.
- **Session log validation:** new `lint-sessions` command validates session logs in `.agent-room/sessions/` against the required schema (Date, Agent, Classification, Goal, Files touched, Actions taken, Tests run, Decisions, Outcome) — CI-friendly, exits non-zero on malformed logs.
- **Stack-specific templates:** packaged `templates/stacks/{python,typescript,react}/` with stack-specific `AGENTS.md.tmpl` and skill files, closing the gap between documented and shipped inheritance layers.
- **Codex adapter:** added `templates/adapters/codexrules.tmpl`, completing tool-adapter coverage for the tools already listed in `VALID_TOOLS`.
- **Session utils API:** structured helpers for writing session logs programmatically instead of hand-authoring markdown.

## Fixes

- Resolved ESLint errors (invalid `\Z` regex escape, unused variables).

## Docs

- Clarified in README/CAPABILITIES.md which features are prescriptive guidance vs. actively enforced, and which require human discipline to follow (workflow classifier, most skill packs).

## Housekeeping

- `package.json` now includes `repository`, `homepage`, `bugs`, `keywords`, and `author` metadata for npm.

---

**Full diff:** compare `v1.2.0...v1.2.1` on GitHub once tags are pushed.
