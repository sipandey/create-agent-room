# Awesome-list PR drafts

Submit **one PR per list** after v2.3.1 is live. Search each repo for existing
entries to avoid duplicates and match their format.

---

## 1. AI agents / governance lists

Search GitHub for: `awesome ai agents`, `awesome claude`, `awesome cursor`,
`awesome agents.md`

**Suggested entry format** (adapt to each list's style):

```markdown
- [create-agent-room](https://github.com/sipandey/create-agent-room) - Mechanical agent governance CLI: Claude/Cursor stop hooks, git guardrails, CI validate/lint-sessions/eval. Zero runtime deps.
```

**PR body template:**

> Adds create-agent-room — enforces agent governance at turn/commit/CI boundaries
> (stop hooks with evidence-lite validation, not just AGENTS.md). v2.3.1 on npm,
> MIT, actively maintained.

---

## 2. GitHub Actions lists

Search: `awesome github actions` `actions` `ci`

```markdown
- [create-agent-room Validate](https://github.com/sipandey/create-agent-room) - Validate agent-room scaffolds (guardrails schema, skill frontmatter, session logs) without running init. `uses: sipandey/create-agent-room@v2`
```

---

## 3. Cursor rules / MCP lists

Search: `awesome cursor rules`, `cursor directory`

Note: create-agent-room generates `.cursor/rules/agent-room.mdc` via `sync` and
ships a Cursor `stop` hook — position as **governance enforcement**, not a
rules collection.

```markdown
- [create-agent-room](https://github.com/sipandey/create-agent-room) - Scaffolds Cursor stop hook + alwaysApply rules from `.agent-room/skills/`; multi-tool sync for Claude/Windsurf/Cline/Codex.
```

---

## Targets to search manually

Run before opening PRs:

```bash
# Example searches (run in browser or gh search)
# awesome-claude-code
# awesome-cursorrules
# awesome-ai-agents
# awesome-devtools
```

Pick lists with recent commits (merged PRs in last 6 months) — stale lists
won't drive traffic.
