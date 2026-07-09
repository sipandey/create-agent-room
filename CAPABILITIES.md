# create-agent-room: Capabilities & Limitations

This document clarifies which features are actively enforced, which are prescriptive guidance, and which are aspirational frameworks requiring additional setup.

---

## 🟢 Actively Enforced Features

These features **actively block, fail, or prevent** operations if violated:

### Agent Guardrails (Pre-commit Hook)

- **What it does:** When Git adapter is selected, a pre-commit hook reads `guardrails.json` and prevents commits that:
  - Touch protected paths (checked via glob patterns and literal matches)
  - Contain forbidden action patterns (regex or literal strings)
  - Violate environment-variable guardrails
- **How it fails:** Exit code 1; blocks the commit
- **User action:** Requires `--tools git` during `init`
- **Bypass:** Set `GUARDRAILS_BYPASS=1` environment variable for emergency commits (requires human decision)
- **Known limitation:** if `guardrails.json` itself is listed in `protectedPaths`, a commit that both edits `guardrails.json` and removes its own path from `protectedPaths` in that same edit is compared against HEAD's prior `protectedPaths` (via `git show HEAD:.agent-room/guardrails.json`) specifically to catch this self-weakening case — but only for `guardrails.json` itself, not for other rules weakened in the same commit (e.g. narrowing a glob or dropping an unrelated forbidden pattern still succeeds silently).

### Session Log Format Validation

- **What it does:** `lint-sessions` command validates all logs in `.agent-room/sessions/` against required schema:
  - Required sections: Goal, Files touched, Actions taken, Tests run, Decisions made, Outcome
  - Required fields: Date (YYYY-MM-DD HH:MM format), Agent, Classification (Bug|Enhancement|Feature|Product)
- **How it fails:** Exit code 1 if any session is malformed
- **CI integration:** Scaffolded automatically as `.github/workflows/agent-room-validate.yml` whenever the `git` adapter is active (see `--tools git`), running both `validate` and `lint-sessions` on push/PR
- **User action:** None — ships automatically with the git adapter; edit or remove the workflow file if you use a different CI provider

### Skill Frontmatter Validation

- **What it does:** `validate` command lints skill YAML frontmatter and aborts if:
  - Missing `---` delimiters
  - Missing `name` or `description` attributes
  - Invalid JSON schema in guardrails.json
- **How it fails:** Exit code 1; descriptive error message
- **User action:** Required before committing skill packs

---

## 🟡 Prescriptive Guidance (Requires Human Discipline)

These features provide templates and protocols that agents must choose to follow. **There is no automatic enforcement:**

### Workflow Classifier

- **What it is:** Template guidance on tagging work as Bug / Enhancement / Feature / Product
- **Location:** `.agent-room/workflow-classifier.md`
- **Enforcement:** Manual; agents must apply classification when creating session logs
- **Why manual:** Classification often requires human judgment and context

### Multi-Agent Coordination Protocols

- **What it is:** Template guidance for handoffs, scope boundaries, and state serialization
- **Locations:**
  - `.agent-room/coordination/handoff-protocol.md`
  - `.agent-room/coordination/scope-boundaries.md`
  - `.agent-room/coordination/session-log-format.md`
- **Enforcement:** None; agents must follow these protocols manually
- **Reality:** Handoff success depends on agents reading and following the docs

### Anti-patterns & Decisions Logs

- **What it is:** Append-only logs for recording negative knowledge and decisions
- **Locations:** `.agent-room/anti-patterns.md`, `.agent-room/decisions.md`
- **Enforcement:** The close-the-loop pre-commit hook (Claude only) requires updates to at least one of these files before committing
- **User action:** Requires manual updates by agents; not automatically populated

### Principles Playbook

- **What it is:** 12 guidelines for reliable LLM output (brainstorming, debugging, verification, etc.)
- **Location:** `.agent-room/principles.md`
- **Enforcement:** None; agents must read and apply
- **Reality:** Tool provides guidance; discipline is external

### Tool Adapters (Claude, Cursor, Windsurf, Cline, Codex)

- **What it is:** Rule files copied to `.claude/`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `.codexrules`
- **Enforcement:** Tool-dependent. Claude Code and Cursor read rule files; others may not.
- **Reality:** Rules are available but tools decide whether/how to apply them

---

## 🔵 Aspirational/Framework Features

These provide a framework that requires external setup or effort:

### Stack-Specific Templates

- **What it is:** A 6-layer inheritance system designed to support Python, TypeScript, React, and other stacks
- **Current state:**
  - ✅ Layers 1-2 (packaged defaults + built-in stack templates) provided
  - ❌ Layers 3-6 (global and org-specific templates) must be user-created
- **Reality:** The framework exists, but you must populate it with your org's stack guidelines
- **How to use:**
  - Create `~/.agent-room-templates/org/my-org/python/AGENTS.md` for org-wide Python guidelines
  - Or use `--org my-org` during init to inherit from that layer
  - Or provide `--template-source /path/to/templates/` at init time

### Multi-Agent Orchestration

- **What it is:** Real-time coordination, queuing, or scheduling of work across agents
- **Current state:** ❌ Not implemented
- **Available instead:** Session log parsing for post-hoc metrics; manual handoff protocols
- **Reality:** Tool excels at scaffolding and analytics, not runtime coordination

### Observability Metrics & Dashboarding

- **What it is:** Real-time monitoring, trending, alerting on agent performance
- **Current state:**
  - ✅ Post-hoc aggregation of completed sessions (success rates, classifications, file volumes)
  - ❌ No trending, no alerting, no real-time dashboarding
  - ❌ No performance metrics (latency, cost, tokens)
- **Reality:** Metrics are point-in-time aggregates; useful for retrospectives, not monitoring

### Skill Packs as Executable Rules

- **What it is:** Built-in skill packs that somehow constrain or guide agent behavior
- **Current state:**
  - ✅ 9 skill packs provided (testing, security, database, api-design, code-review, performance, observability, documentation, release)
  - ❌ Skill packs are guidance/documentation only, not executable rules
  - ❌ No hooks or tooling to enforce skill pack practices
- **Reality:** Skill packs are templates for humans to read; they don't constrain agent behavior

### Multi-Tool Sync

- **What it is:** Synchronizing custom rules across Claude, Cursor, Windsurf, Cline
- **Current state:**
  - ✅ Sync works for Claude (`.claude/skills/` ↔ `.agent-room/skills/`)
  - ❌ Sync not implemented for Cursor, Windsurf, Cline
  - ❌ Sync is one-way (only agent-room → tool, not tool → agent-room)
- **Reality:** Only Claude has working sync; others require manual file copying

---

## What This Means

### For Tool Builders/Org Leads

1. **Use enforced features for hard constraints:** Guardrails, session validation, skill validation are mechanical and reliable.
2. **Use guidance features for best practices:** Workflow classifier, principles, coordination protocols provide structure but require discipline.
3. **Treat aspirational features as frameworks:** Stack templates and multi-tool sync can be built out over time.
4. **Expect to customize:** The tool provides a foundation; your org must layer on stack-specific guidance and tool-specific rules.

### For Agents

1. **Read and follow guidance files:** The tool won't enforce them, but they exist for good reason.
2. **Expect guardrails to block some commits:** Pre-commit hooks will catch violations; respect the `GUARDRAILS_BYPASS` protocol for emergencies.
3. **Write well-formed session logs:** Validation will fail malformed logs; aim for the schema.
4. **Refer to your org's stack guidance:** If provided via layers 3-6 of the template system, they'll override defaults.

---

## Recommended Setup

### Minimum (Guidance-focused)

1. `init .` with default templates
2. Agents read `.agent-room/principles.md`, `workflow-classifier.md`, `coordination/handoff-protocol.md`
3. Agents manually follow best practices
4. Optionally run `validate` and `lint-sessions` in CI

### Standard (Prescriptive + Guidance)

1. `init . --tools git --language python --org my-org` (or appropriate language/org)
2. Pre-commit hook enforces guardrails and decisions log updates
3. CI includes `create-agent-room validate .` and `create-agent-room lint-sessions .`
4. Agents manually follow coordination and workflow guidance

### Advanced (Custom Org Stack)

1. Create `~/.agent-room-templates/org/my-org/` with stack-specific AGENTS.md, skills, principles
2. Create language-specific templates: `python/`, `typescript/`, `react/`
3. `init . --tools git,claude --org my-org` pulls your org guidance
4. All governance features + org-specific customization active

---

## Future Roadmap

Features planned for future releases:

- **Real-time observability:** Dashboards, trending, alerting
- **Session orchestration:** Query handoff state during execution, queue work
- **Multi-tool sync:** Extend to Cursor, Windsurf, Cline
- **Metrics export:** JSON/CSV for external dashboarding
- **Hook standardization:** Extend close-the-loop to all tool adapters
- **Approval workflows:** Simple gates for guardrails violations
- **Performance tracking:** Cost, tokens, latency per session
