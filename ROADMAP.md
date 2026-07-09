# Roadmap

`create-agent-room` stays intentionally small: zero runtime dependencies,
~2,300 lines of implementation, a package that fits in ~70KB. That's a
feature, not an oversight — every item below is judged against **does this
add real value without adding real weight**, not against "what would a
generic enterprise CLI have."

The same philosophy now applies to what gets scaffolded, not just the
tool itself: `init` defaults to `--profile minimal` rather than scaffolding
the full guidance corpus by default (`--profile full` opts back in). See
`.agent-room/decisions.md` for the reasoning and citation.

This file exists so scope decisions don't have to be re-litigated in every
issue and PR. Check it before proposing something new. If you think an
"explicitly out of scope" item deserves reconsidering, open an issue and
say what changed, don't just re-propose it.

Update this file whenever a scope decision is made — moving an item
between sections, adding a new one, or rejecting one — the same way
`.agent-room/decisions.md` records completed decisions. This file is the
forward-looking counterpart: where `decisions.md` says *why we did X*,
this says *what we're planning and why we're not planning Y*.

## Now

Small, cheap, clearly worth it:

- **CI check for `package.json`/`package-lock.json` version drift** — the
  lockfile has gone stale across version bumps twice now (see
  `.agent-room/anti-patterns.md`); a one-line CI check closes it for good
  instead of relying on someone noticing during an audit.

## Next

Worth doing, more effort, still in keeping with the project's scope:

- **A few more stack templates** (currently python/typescript/react) —
  organic growth as real usage demands them, not a race to a specific
  number.
- **DRY up the per-adapter blocks in `lib/init.js`** — cursor/windsurf/
  cline/codex each repeat a near-identical `copyFileInherited` call; a
  small table-driven loop would cut ~40 lines with no behavior change.
- **`create-agent-room doctor`** — audit an *existing* (non-scaffolded or
  partially-scaffolded) project and suggest what's missing, reusing
  `validate`'s checks rather than duplicating them. `action.yml` (the
  composite GitHub Action) already covers the narrower "check a repo that
  never ran `init`" case this would generalize.
- **Publish `action.yml` to the GitHub Marketplace** — the Action itself
  is written, tested, and documented (`docs/github-action.md`); the
  `v2.0.0` release created a rolling `v2` major tag (per Marketplace
  convention — bumped to `v2` from the originally-planned `v1` once the
  first release turned out to be v2.0.0, not v1.x). What's left is
  clicking through GitHub's "Publish this Action to the GitHub
  Marketplace" flow on that release — a human/CD step, not something a
  session should do unasked — see "Release process" in `AGENTS.md`.

## Later / needs a real signal first

Plausible, but shouldn't be built speculatively — wait for an actual user
need before spending the complexity budget:

- Multi-tool `sync` (currently Claude-only; Cursor/Windsurf/Cline sync is
  documented as aspirational in `CAPABILITIES.md`).
- A metrics export format (JSON/CSV) for teams who want to pipe session
  data into their own dashboards, instead of the tool building a dashboard
  itself.

## Explicitly out of scope

Considered and rejected, because each one trades away the thing that
makes this tool worth using — being small enough to read end-to-end and
trust:

- **Rewriting the CLI on commander.js + zod.** The 100-line hand-rolled
  parser has no known bugs and zero dependencies. Adding two dependencies
  for marginal ergonomic gain works against the project's own supply-chain
  posture.
- **Template engine (EJS/Handlebars) / deep-merge templating.** Current
  `{{VAR}}` substitution plus layered directory inheritance is enough for
  scaffolding markdown and JSON. A template engine is solving a problem
  this project doesn't have.
- **Plugin system / WASM sandboxing for guardrails.** Guardrails and skill
  packs are markdown and JSON, not executable code — there's no untrusted
  code to sandbox. If that ever changes, revisit; it hasn't.
- **Full TypeScript conversion, ESM/CJS dual publishing.** No correctness
  or DX problem this solves today.
- **VS Code extension, prebuilt binaries, Docker image, Homebrew/Scoop
  formulas.** `npx create-agent-room` already works everywhere Node does;
  each of these is a new release artifact to maintain for a package this
  size.
- **Real-time observability integrations (Prometheus, LangSmith,
  Helicone).** This tool parses static session logs after the fact by
  design — see "Observability Metrics & Dashboarding" in
  `CAPABILITIES.md`. Real-time monitoring is a different product.
- **SSO, audit logs, paid/enterprise tier.** Out of scope for a project
  scaffolder; would change what this project fundamentally is.
- **Self-improving meta-agent, "propose an open Agent Room spec."**
  Speculative, not actionable, no current demand.

## How items move between sections

- **Now → shipped:** goes in `CHANGELOG.md` under `[Unreleased]`, then
  under the version it ships in.
- **Idea → Now/Next:** needs a concrete cost estimate and a reason it's
  worth the weight, not just "would be nice."
- **Anything → Explicitly out of scope:** needs a one-line reason tied to
  the size/value tradeoff above, so the next person doesn't have to
  re-derive why it was rejected.
