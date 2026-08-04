# Show HN — launch post draft

**Title (HN limit: 80 characters — do not include `Show HN:`; HN adds that):**

```
create-agent-room – mechanical governance (stop hooks, CI), not AGENTS.md
```
(73 chars)

**Alternates:**

| Chars | Title |
|------:|-------|
| 71 | `create-agent-room: agent governance with stop hooks + CI, not AGENTS.md` |
| 67 | `create-agent-room: mechanical governance (hooks, CI), not AGENTS.md` |
| 61 | `create-agent-room – stop hooks + CI evals, not just AGENTS.md` |

**URL:** https://github.com/sipandey/create-agent-room

---

Most teams write an `AGENTS.md` and hope the model reads it. I built a small CLI
(~70KB, zero runtime deps) that **enforces** governance at four boundaries:

1. **End of agent turn** — Claude `Stop` + Cursor `stop` hooks block the turn
   when source files changed without a decision/anti-pattern log (evidence-lite:
   the log diff must contain real content, not just a file touch)
2. **git commit** — pre-commit guardrails (protected paths, secret patterns,
   scope limits) with an audited bypass log
3. **CI** — `validate` + `lint-sessions` on every push/PR
4. **CI** — `eval` runs packaged compliance regression fixtures (no LLM, no API
   keys) so hook/schema behavior doesn't silently break after CLI upgrades

Try it:

```bash
npx create-agent-room@latest init . --yes --tools git,cursor --git
```

Demo gif in the README shows a real staged AWS key blocked at commit time, then
an agent turn blocked for missing decision log — unmocked.

**What it's not:** phase-sequenced workflow enforcement (see agentic-os for
that). This is intentionally small: mechanical checks you can read end-to-end.

**Stack:** Node stdlib only. Published on npm. GitHub Action for repos that
didn't run `init`.

Feedback welcome — especially on whether Layer 4 (`eval`) belongs in default
scaffolded CI or should stay opt-in.

---

## Posting checklist

- [ ] **Account gate:** HN may block Show HN for new/low-karma accounts during influx
  periods (“temporarily restricting Show HNs”). If blocked, use the channels below
  first; build karma via genuine comments, then retry in a few weeks.
- [ ] Read: [guidelines](https://news.ycombinator.com/newsguidelines.html),
  [welcome](https://news.ycombinator.com/newswelcome.html),
  [Show HN rules](https://news.ycombinator.com/showhn.html)
- [ ] Post Tuesday–Thursday, 8–10am US Eastern (when eligible)
- [ ] Reply to comments within the first 2 hours
- [ ] Link to `docs/enforcement-model.md` when asked "how is this different from X?"
- [ ] Don't argue with "just use AGENTS.md" — agree and show the demo

## If Show HN is blocked (do these instead)

1. **Reddit** — `docs/launch/community-posts.md` (r/ClaudeAI, r/cursor, r/programming)
2. **Discord** — Cursor / Claude server (one thoughtful post, not spam)
3. **Dev.to or personal blog** — same body as this draft; link GitHub + demo gif
4. **Awesome-list PRs** — `docs/launch/awesome-list-prs.md` (compounding traffic)
5. **HN karma (optional):** comment helpfully on threads in your domain for 1–2 weeks,
   then retry Show HN — no gaming, just participate
