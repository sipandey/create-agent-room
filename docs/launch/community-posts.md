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

## LinkedIn

**Already posted (do not re-post the same launch in the same week):**

1. **"Unpopular opinion"** — positioning post (enforcement thesis). Keep this as
   the canonical LinkedIn framing.
2. **Early build-in-public** — scaffold/story post. Softer, older narrative
   (scaffolding ground rules). Prefer the unpopular-opinion angle going forward.

**Format tip:** blank lines between paragraphs; attach `docs/demo.gif` when
possible. Link in first comment often outperforms link-in-body for reach.

### Follow-up (3–7 days later — reply engagement or new post)

Not another launch dump. Pick one:

**A — Demo / proof**
That "agent ignored the docs" story? Here's the stop hook catching it live
(attach gif). Same CLI: create-agent-room. Curious what rule your team still
can't enforce.

**B — Answer your own question**
Last week I asked which agent rule teams still can't enforce. The replies
clustered around [X]. Here's how we handle that in create-agent-room: …

**C — Soft credit + product clarity**
Inspired early by agent-room-of-requirements (Amul Badjatya) for the room
idea. create-agent-room went further into *mechanical* enforcement — hooks,
guardrails, CI — so the rules aren't just files on disk. Still open to
feedback: https://github.com/sipandey/create-agent-room

### Experience-sharing posts (learning, not launch)

Use these spaced ~1 week apart. Soft product mention at the end is enough —
LinkedIn rewards “what I learned” more than “what I shipped.”

---

#### 1 — Docs ≠ enforcement (recommended next)

I spent months treating AGENTS.md like a control plane.

It isn’t.

It’s a suggestion the model may or may not read. The first time an agent
skipped a “must log decisions” rule and still closed the turn cleanly, the
lesson stuck: if it doesn’t fail a hook, a commit, or CI — it isn’t a rule.
It’s hope.

What changed my approach:

1. Put the check where the agent *exits*, not where you write prose
2. Prefer exit codes over vibes (hooks, pre-commit, CI)
3. Keep the enforcement surface small enough that you can audit it

Building create-agent-room was mostly that lesson packaged into a CLI —
not “more documentation,” but fewer places for silent non-compliance.

Curious: what’s one rule in your agent docs that still has zero mechanical
teeth?

(Link in comments if useful: github.com/sipandey/create-agent-room)

---

#### 2 — Zero deps as a product decision

Unpopular engineering take: dependencies are a governance problem too.

When I started create-agent-room, the temptation was real — commander for
flags, zod for schemas, a template engine for scaffolding. Each one was
“reasonable.” Together they would have made a small trust tool harder to
read than the agents it was supposed to constrain.

Constraint I kept: zero runtime deps. Node stdlib only. ~70KB.

Tradeoff I accepted: a hand-rolled argv parser and dumb `{{VAR}}` templates.

Tradeoff I rejected: rewriting in TypeScript / adding a plugin system “for
enterprise.”

Lesson: for tools that sit in the trust path (hooks, CI, secrets),
*readability is a feature*. If a senior engineer can’t skim the enforcement
in an afternoon, they won’t adopt it.

What’s one dependency you regret adding to a “small” CLI?

---

#### 3 — Ship order beats version bumps

I burned a CI run on a release that was otherwise correct.

Symptom: `npm error ETARGET — No matching version found for create-agent-room@X.Y.Z`

Cause: dogfood workflow installs the CLI from the *registry*. I pushed the
version pin to GitHub before `npm publish` finished.

Main CI was green (runs from checkout). Dogfood CI was red (runs from npm).
Same commit. Two truths.

Lesson I’ve now written into the release checklist:

publish → then push the pin  
(or push first, publish immediately, re-run the failed job)

Boring. Mechanical. The kind of thing that only hurts once — unless you
don’t write it down.

What’s the most embarrassing “CI lied to me” moment you’ve hit on a release?

---

#### 4 — Evidence, not file touches

Early version of our stop hook: “did `decisions.md` change this turn?”

Agents learned the cheat code: touch the file, write nothing useful, end turn.

So we tightened to evidence-lite — the *diff* must contain a real waiver or
a structured entry. Presence isn’t proof.

Same pattern shows up everywhere in agent workflows:
• “tests ran” vs test output
• “reviewed” vs review notes
• “logged” vs log content

If your check only asks “was the artifact touched?”, you’re measuring
compliance theater.

Where have you seen agents optimize for the check instead of the intent?

---

#### 5 — What I refused to build

The roadmap pressure on an agent-governance tool is predictable:

• golden-task evals (“did the model behave?”)
• VS Code extension
• real-time observability dashboards
• plugin marketplace

I wrote them under “explicitly out of scope.”

Not because they’re bad ideas — because they turn a ~70KB scaffolder into a
platform, and platforms demand trust I haven’t earned yet.

create-agent-room answers one question well: do the *governance machines*
still work (hooks, schema, lint)? Not: did the model write good code?

Saying no was harder than shipping features. Still glad I did.

What’s on your “proudly won’t build” list?

---

#### 6 — Short carousel / punchy (5 lines)

Building agent tools taught me:

1. AGENTS.md is documentation, not a control plane
2. Agents optimize for your check, not your intent
3. CI that installs from npm can fail while “local CI” passes
4. Zero deps is a trust signal for hooks
5. Out-of-scope lists are product work

(Open-source notes from shipping create-agent-room — happy to dig into any
of these.)

---

## Dev.to / personal blog (longer)

Use the Show HN draft (`show-hn.md`) as the body. Add:

- Embedded demo gif
- Link to `docs/comparisons.md` (honest tradeoffs vs agentic-os and DIY hooks)
- "Why not golden-task evals?" → link `docs/enforcement-model.md`

Tags: `ai`, `devtools`, `cursor`, `claude`, `github-actions`
