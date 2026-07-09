# How create-agent-room compares

Honest comparisons against three alternatives, in the same enforced /
guidance / aspirational spirit as [CAPABILITIES.md](../CAPABILITIES.md).
This is written by create-agent-room's own maintainer, which is a real
conflict of interest — read the cited sources yourself rather than taking
any claim below on faith, and open an issue if something here is wrong or
has gone stale.

**Methodology and freshness:** competitor facts below were fetched live
(GitHub API + the linked README/docs) while writing this document. Star
counts, versions, and file layouts change; treat anything with a date
attached as a snapshot, not a live fact. Where a claim rests on the
competitor's own self-reported numbers rather than something independently
reproduced here, it's attributed as theirs, not asserted as ours. Where a
claim couldn't be confidently verified at all, it's marked **[VERIFY]** —
check it yourself before repeating it.

---

## At a glance

| | create-agent-room | Hand-rolled hooks | agentic-os | Plain AGENTS.md/CLAUDE.md |
|:---|:---|:---|:---|:---|
| Setup cost | One CLI command | Hours of copy/config per repo | One clone + deploy script | Write a file |
| What's mechanically enforced | Stop hook (agent-runtime, Claude-only), guardrails pre-commit + CI | Whatever you wire (permission rules, pre-commit, sandbox) | 3 required CI checks (framework/shellcheck/markdown-links); credential scan runs pre-commit + every CI run but isn't a required merge check by default | Nothing |
| Evidence/phase gating | Presence check only (did *any* log get touched) | None built in | `validate.sh` parses per-task work logs against required phases | None |
| Multi-tool | Claude native; Cursor/Windsurf/Cline/Codex get rule files, no enforcement outside Claude | Whatever you build per tool | Claude/Codex/Gemini native; Cursor/Copilot "compatible" | Whichever tool reads the file |
| Runtime deps | Zero (Node stdlib only) | Whatever you pick (gitleaks, pre-commit.com, Docker) | None hard-required; Python 3.9+ "recommended" for full validation, degrades to advisory without it | None |
| Maturity (as of 2026-07-09) | 0 GitHub stars, created 2026-07-08 — pre-release | N/A (a practice, not a project) | 66 stars, 17 forks, v1.8.9, created 2026-04-12, active | N/A |

---

## 1. Hand-rolled hooks (the DIY approach)

Canonical example used here: ["How to Safely Use AI Coding Agents in a
Real Codebase"](https://travis.media/blog/safely-use-ai-coding-agents/)
(Travis Media). It recommends, roughly: run agents on isolated git
branches/worktrees; a Claude Code `settings.json` permission allow/ask/deny
list (e.g. deny `Bash(rm -rf:*)`, `Read(./.env)`); `pre-commit.com` +
`gitleaks` for secret scanning; a hand-written `PreToolUse` hook that logs
every tool call to an audit file; running the agent in a throwaway Docker
container; and a `CLAUDE.md` with a prose "definition of done."

**What it gets right that create-agent-room doesn't:**

- **Permission-level sandboxing.** Claude Code's `allow`/`ask`/`deny`
  rules can block a *tool call* before it happens — `rm -rf`, reading
  `.env`, a force-push. create-agent-room has no equivalent: it only
  checks what's already staged for commit. An agent that never commits
  the damage (a deleted directory, a leaked env var read into context)
  isn't caught by anything this tool ships.
- **Process/OS-level isolation.** A container boundary the agent can't
  talk its way around is a strictly stronger guarantee than any git hook.
  create-agent-room doesn't touch process isolation at all — out of
  scope by design (see [ROADMAP.md](../ROADMAP.md)'s "Explicitly out of
  scope"; this tool scaffolds files, it doesn't manage runtime sandboxes).
- **Per-tool-call audit logging.** The blog's `PreToolUse` hook records
  *every* tool invocation, not just what ends up in a commit. That's a
  genuinely finer-grained trail than create-agent-room's session logs
  (which are written by the agent, after the fact, not captured
  automatically per tool call).

**What create-agent-room gets right that the DIY approach doesn't:**

- **It's a five-minute command, not an afternoon of copying config
  snippets across repos.** The blog post is a checklist you re-implement
  per project; drift between repos is inevitable once you have more than
  a couple.
- **The secret-detection rules ship with real patterns already tested
  against a fake AWS key**, not left as "go install gitleaks and hope
  its ruleset covers your case." (Concretely: the blog's `.pre-commit-config.yaml`
  wires in `gitleaks` but leaves you to configure and maintain it;
  create-agent-room's `guardrails.json` ships default patterns for AWS
  keys, private key headers, Slack/GitHub tokens, and generic API-key
  assignments, versioned and tested in this repo.)
- **The Stop hook is a category the blog's toolkit doesn't have at all**:
  something that blocks an *agent turn* from ending, before there's even
  a commit to scan. The blog's audit log records what happened; it
  doesn't stop anything from happening.

**Where this is a real tradeoff, not a clean win either way:** the DIY
approach is strictly more customizable (you own every rule) at the cost
of strictly more maintenance (you own every rule, in every repo,
forever). If you already have infra for shared Claude Code settings
across repos, some of create-agent-room's convenience advantage
disappears.

---

## 2. agentic-os

[github.com/KbWen/agentic-os](https://github.com/KbWen/agentic-os) is the
closest thing to a direct competitor found while researching this
document — genuinely overlapping goals (gated workflow phases, evidence
requirements, multi-tool `AGENTS.md`/`CLAUDE.md` distribution, required CI
checks) and, as of this writing, considerably more mature: v1.8.9, created
2026-04-12, 66 stars / 17 forks, actively shipping (last push 2026-07-09).
create-agent-room's GitHub repo was created 2026-07-08 and has 0 stars —
be aware of that maturity gap reading the rest of this section.

**Where agentic-os is ahead, concretely:**

- **Evidence-gated phase sequencing is real, not just a hook that checks
  "was a file touched."** Its `validate.sh` parses each task's work log
  and fails if a *required phase for that task's classification* is
  missing or under-evidenced (five classifications — tiny-fix through
  architecture-change — each with a different required phase sequence,
  e.g. `feature` requires Bootstrap → Spec → Plan → Implement → Review →
  Test → Handoff → Ship). create-agent-room's Stop hook only checks
  whether *any* entry landed in `anti-patterns.md`/`decisions.md` — it
  has no concept of task classification, required phases, or evidence
  content. This is the single biggest capability gap: agentic-os
  enforces a workflow; create-agent-room enforces a logging habit.
- **A published, reproducible token-economics benchmark.**
  `docs/LIFECYCLE_BENCHMARK.md` reports real measured (not estimated)
  multi-phase lifecycle token costs, generated by a script
  (`analyze_token_lifecycle.py`) anyone can re-run — e.g. a `quick-win`
  task measured at ~22–27K tokens, a `feature` at ~39–70K depending on
  domain, with documented optimization techniques (compact-index
  skill probing, heading-scoped reads) cutting 17–47% off those numbers.
  create-agent-room's "guidance corpus size" in the post-`init` summary
  is a much shallower metric — a one-time static count of the scaffolded
  files on disk (chars/4, same formula agentic-os uses, coincidentally),
  not a measured cost across an actual task lifecycle. **These numbers
  are not comparable to each other** — agentic-os measures cumulative
  multi-phase session cost; create-agent-room measures one-time corpus
  size — but agentic-os has done real work here that create-agent-room
  hasn't: it actually measures usage cost, not just scaffold size.
- **A skill-auto-attach system scoped to task type.** 14 skills that
  load based on what the task actually touches (auth code triggers an
  auth-security skill, a migration triggers forward-only DB-safety
  checks) instead of create-agent-room's model, where skill packs are a
  flat opt-in list the user picks at `init` time and every selected pack
  is scaffolded regardless of what a given task touches.
- **Cross-session memory with write-conflict protection.**
  `.agentcortex/context/` uses single-writer locking per branch and
  records session identity (model + timestamp) for traceable handoffs.
  create-agent-room's `.agent-room/coordination/` is prose protocol
  documentation — there's no lock file, no automatic conflict detection;
  agents are trusted to follow the written protocol.
- **Existing files are never silently overwritten** — the installer
  writes `.acx-incoming` sidecars for anything that would conflict,
  leaving the merge to the user. create-agent-room's `init` either skips
  a file that already exists or overwrites it wholesale with `--force`;
  there's no partial/sidecar merge path.

**Where create-agent-room is ahead, concretely:**

- **Zero runtime dependencies, full stop.** agentic-os's full validation
  mode wants Python 3.9+; it degrades gracefully without it (their own
  docs are explicit about this — Python-dependent checks report `WARN`
  instead of `FAIL` in `--no-python` mode), but create-agent-room never
  has a "degraded mode" to think about — it's Node stdlib only, always.
- **npm/npx distribution.** `npx create-agent-room@version` needs
  nothing pre-cloned. agentic-os's quick start is `git clone` + run a
  deploy script from inside the clone — one more step, and one you
  repeat (or script yourself) per target repo.
- **Simpler mental model for a smaller problem.** If what you need is
  "block secrets, keep the agent from ending its turn without logging a
  decision, run a CI check" — agentic-os's five-phase classification
  system, ADRs, skill-auto-attach, and multi-agent locking are a lot of
  surface area to adopt for that. create-agent-room is deliberately
  narrower.
- **Composite GitHub Action.** create-agent-room ships `action.yml` for
  a `uses: sipandey/create-agent-room@v2`-style workflow step with no
  clone step at all — written, tested, and documented in
  [docs/github-action.md](github-action.md). As of the `v2.0.0` release
  the `v2` tag exists; whether it's actually listed on the GitHub
  Marketplace yet depends on whether the "Publish this Action" step in
  the release flow (see [ROADMAP.md](../ROADMAP.md)) has been completed
  — check the repo's Marketplace listing directly rather than assuming
  from this doc. **[VERIFY]** — agentic-os's repo wasn't checked for an
  equivalent published Action; it may have one.

**Where it's a wash, not a win for either side:**

- **Both local hooks are bypassable.** create-agent-room's guardrails
  pre-commit hook can be skipped with `git commit --no-verify` or
  overridden with `GUARDRAILS_BYPASS=1`. agentic-os's local pre-commit
  hook is explicitly documented as "opt-in" and skippable the same way.
  Neither is a hard floor until it's also a *required* CI status check —
  and agentic-os's own maintainer notes (in their install docs) that
  even their security-scanning CI jobs are **not** required merge checks
  in their own repo by default; a repo admin has to explicitly add them
  to branch protection, same as create-agent-room's scaffolded workflow
  isn't a required check unless the repo owner makes it one.
- **Multi-tool support is comparably tiered on both sides**: a couple of
  "native" integrations (Claude Code + Codex for both projects) and a
  broader "reads the same Markdown, no special enforcement" tier for
  everything else (Cursor/Windsurf/Cline/Copilot). Neither tool has
  deeper enforcement in Cursor or Windsurf than "the rule file is
  there."

---

## 3. Plain AGENTS.md / CLAUDE.md, no tooling

The baseline: a hand-written prose file, no hooks, no CI, no scaffolding
tool at all.

**What it gets right:**

- **Total control, zero abstraction to learn.** Every word is exactly
  what you wrote; there's no scaffold structure, template inheritance,
  or tool-specific quirk to understand first.
- **No maintenance surface.** No dependency to update, no template
  version to track, nothing that can drift out of sync with itself the
  way `package.json`/`package-lock.json` or `action.yml`'s pinned version
  can (see `.agent-room/anti-patterns.md` in this repo for two real
  incidents of exactly that drift).
- **It's genuinely enough for a solo project or a small, trusted team**
  where the failure mode create-agent-room targets — an agent
  confidently claiming "done" without evidence, or committing a secret —
  is rare enough that the cost of a mechanical gate isn't worth paying.

**What it gets wrong — the whole reason this tool and its competitors
exist:**

- **A rules file is a prompt, not a check.** Nothing stops an agent from
  reading it and doing something else anyway. This is the exact gap
  every tool in this document exists to close, in different ways and to
  different degrees.
- **No secret detection.** A hardcoded key in a diff is caught only if a
  human happens to notice it in review.
- **No cross-session memory beyond what's manually written down and
  manually re-read.** Nothing forces a future session (or a different
  agent) to actually check `anti-patterns.md`-equivalent content before
  repeating a known mistake, because there's no file with that job
  description in the first place — someone has to invent it, then invent
  the discipline to keep updating it.

**The honest recommendation:** if your team is small, trusted, and hasn't
been burned by an agent yet, a well-written plain `AGENTS.md` may
genuinely be the right amount of process. The moment "yet" happens once —
a leaked key, a confidently-wrong "tests pass" — is the moment a
mechanical gate (any of the three other options here) starts paying for
itself.

---

## When to pick something other than create-agent-room

- **You need process-isolation or permission-level tool-call
  blocking** (not just commit-time scanning) → hand-roll it, or pair
  create-agent-room's guardrails with the DIY permission-rules approach;
  they're not mutually exclusive.
- **You need phase-sequenced, evidence-content-verified workflow
  enforcement**, not just "was a log file touched" → agentic-os is
  meaningfully more capable here today. **[VERIFY]** the current state of
  both projects before deciding — this document is a snapshot, not a
  standing fact.
- **Your team is small and hasn't hit the failure mode yet** → a plain
  `AGENTS.md` might be all you need; don't adopt tooling to solve a
  problem you don't have yet.

Pick create-agent-room when the shape of the problem is "I want the
guardrails/Stop-hook/CI trio with a five-minute setup and zero runtime
dependencies," and the heavier phase-classification and multi-agent
locking machinery in agentic-os would be more process than the team
actually needs.

---

*Sources: [agentic-os README](https://github.com/KbWen/agentic-os),
[docs/INSTALL.md](https://github.com/KbWen/agentic-os/blob/main/docs/INSTALL.md),
[docs/LIFECYCLE_BENCHMARK.md](https://github.com/KbWen/agentic-os/blob/main/docs/LIFECYCLE_BENCHMARK.md)
(fetched 2026-07-09); GitHub API repo metadata for both projects (fetched
2026-07-09); ["How to Safely Use AI Coding Agents in a Real
Codebase"](https://travis.media/blog/safely-use-ai-coding-agents/)
(Travis Media). Found no other actively-maintained direct competitor with
comparable scope during this research pass — if you know of one, open an
issue.*
