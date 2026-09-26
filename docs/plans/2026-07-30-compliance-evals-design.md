---
date: 2026-07-30T00:00:00Z
research_doc: N/A
branch: main
status: complete
phases_total: 1
phases_completed: 1
---

# Design: Compliance evals + export (A+B)

**Date:** 2026-07-30  
**Status:** Approved  

## Problem

OSS adopters get hooks, `validate`, and `lint-sessions`, but no single
command that answers whether governance enforcement still works as
intended. That regression coverage lives only in this repo's `npm test`.

## Goal

`create-agent-room eval` runs **packaged, deterministic compliance
scenarios** (no LLM, no API keys) and emits **text / JSON / CSV** for CI
and dashboards.

## Non-goals (v1)

- LLM-as-judge or live agent runners
- `.agent-room/evals/` custom packs in consumer repos (Phase 2)
- Real-time observability integrations

## Architecture

```
create-agent-room eval [options]
        │
        ├─ load evals/builtin/** (shipped with package)
        ├─ run each case (pure fn input or fixture directory)
        └─ aggregate → text | json | csv (--output optional)
```

### Case types

| Type | Mechanism |
|------|-----------|
| `close-the-loop` | `checkClosingTheLoop` with inline `input` in `*.eval.json` |
| `lint-sessions` | Fixture dir with `.agent-room/sessions/*.md` |
| `validate` | Fixture dir; `collectFindings` errors empty = pass |

### Fixture layout

```
evals/builtin/
  close-the-loop/*.eval.json
  lint-sessions/<id>/eval.json + .agent-room/sessions/
  validate/<id>/eval.json + minimal room tree
```

### CLI

```bash
create-agent-room eval
create-agent-room eval --format json --output report.json
create-agent-room eval --format csv --suite close-the-loop
```

- `--suite` filter: `close-the-loop`, `lint-sessions`, `validate`, or `all` (default)
- Exit `1` if any case fails

### JSON report

`toolVersion`, `ranAt`, `summary` (`total`, `passed`, `failed`), `cases[]`
with `suite`, `id`, `description`, `passed`, `durationMs`, optional `error`.

### CSV

One row per case: `suite,id,description,passed,expected,duration_ms,error`

## Testing

- `test/eval.test.js` — loader, runners, formatters
- Builtin fixtures are the eval pack (no duplicate definitions)
- `package.json` `files` includes `evals/`
- Optional: `create-agent-room eval` in CI (dogfood)

## Size

~200–400 LOC, zero new runtime dependencies.
