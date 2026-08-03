# Community post drafts (Week 2)

Post **after** Show HN (or 24–48h later) so you have a GitHub Release URL and
npm version to link.

---

## r/ClaudeAI / r/cursor (short)

**Title:** CLI that enforces agent governance with stop hooks + CI (not just AGENTS.md)

I open-sourced `create-agent-room` — scaffolds hooks for Claude Code and Cursor
that **block** agent turns when you change code without logging to
`decisions.md`, plus pre-commit guardrails and CI validation.

One command:

```bash
npx create-agent-room@latest init . --yes --tools git,cursor --git
```

Demo in README: https://github.com/sipandey/create-agent-room

It's ~70KB, zero deps, MIT. Not trying to replace your workflow docs — just
mechanical enforcement at commit/turn/CI boundaries. Happy to answer setup
questions.

---

## Cursor Discord / Claude Discord (one paragraph)

Shipped **create-agent-room** — mechanical agent governance for Claude + Cursor:
shared stop hook (evidence-lite diff validation), git guardrails, and CI with
`validate` / `lint-sessions` / `eval`. `npx create-agent-room@latest init . --yes --tools git,cursor --git`. Repo: https://github.com/sipandey/create-agent-room — demo gif shows real hook blocks.

---

## Dev.to / personal blog (longer)

Use the Show HN draft (`show-hn.md`) as the body. Add:

- Embedded demo gif
- Link to `docs/comparisons.md` (honest tradeoffs vs agentic-os and DIY hooks)
- "Why not golden-task evals?" → link `docs/enforcement-model.md`

Tags: `ai`, `devtools`, `cursor`, `claude`, `github-actions`
