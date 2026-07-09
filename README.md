# create-agent-room

[![npm version](https://img.shields.io/npm/v/create-agent-room.svg)](https://www.npmjs.com/package/create-agent-room)
[![CI](https://github.com/sipandey/create-agent-room/actions/workflows/ci.yml/badge.svg)](https://github.com/sipandey/create-agent-room/actions/workflows/ci.yml)

**Define your agent governance rules once. `create-agent-room` enforces them at every layer an agent passes through — while it's working, when it commits, and in CI — instead of just documenting them and hoping.**

Most "AI agent guidelines" are a Markdown file an agent may or may not read. `create-agent-room` scaffolds that documentation (`AGENTS.md`, a principles playbook, a workflow classifier, multi-agent coordination protocols) but backs the parts that matter with three concrete enforcement points, each catching a different failure mode:

1. **While the agent is working** — a Claude Code `Stop` hook blocks the agent from ending its turn if it changed files without logging a decision or anti-pattern. This is the most differentiated piece of the tool: it runs *inside the agent's own loop*, before there's even anything to commit, so there's no `--no-verify` equivalent for it — a genuinely stronger enforcement category than a commit-time or CI-time check.
2. **When it commits** — a git pre-commit hook (`guardrails-check.js`) blocks commits that touch protected paths or contain forbidden patterns (hardcoded credentials, private keys, etc.).
3. **In CI** — `validate` and `lint-sessions` fail the build if the guardrails schema, skill frontmatter, or session logs are malformed.

Not every feature here is enforced this way — see [Feature Categories](#feature-categories) below and [CAPABILITIES.md](CAPABILITIES.md) for the honest breakdown of what's mechanical versus what still depends on an agent choosing to follow a doc.

---

## Features

- **Agent Runtime Enforcement (Stop Hook)**: A Claude Code `Stop` hook (`.agent-room/hooks/close-the-loop-check.js`) inspects `git status` at the end of every turn and blocks the agent from finishing if it changed files outside the scaffold without touching `.agent-room/anti-patterns.md` or `decisions.md`. *[Actively enforced inside the agent's own loop when Claude adapter selected — distinct from, and earlier than, the commit-time guardrails below; scoped to Claude Code sessions only]*
- **Agent Guardrails**: Defines protected paths, require-approval rules, and forbidden actions via `guardrails.json`. Forbidden actions are explicit `{ "pattern", "type": "regex" | "literal", "description" }` rules (AWS keys, private key headers, API tokens, etc. by default) — not free-text prose. The default `protectedPaths` list also covers the guardrails machinery itself (`guardrails.json`, `guardrails.md`, `.agent-room/hooks/**`, `.claude/settings.json`), so a later commit can't quietly edit or delete the rules governing it. *[Actively enforced via a git pre-commit hook when Git adapter selected]*
- **Session Log & Schema Validation**: `validate` lints skill frontmatter and the guardrails schema; `lint-sessions` validates session logs against required structure. Both run as a scaffolded CI workflow on every push/PR when the Git adapter is selected. *[Actively enforced; fails the build if malformed]*
- **Multi-Agent Coordination**: Scaffolds templates for handoffs, scope boundaries, and structured session logs. *[Guidance only; requires human discipline to follow protocols]*
- **Inheritance & Composition**: Composes templates sequentially from base structures, stack-specific files (e.g. Python, React), org-specific conventions (`--org <name>`), and project overrides. *[Framework provided; stack templates must be created or inherited]*
- **Built-in & External Skill Packs**: Standard templates (testing, security, database-migrations, api-design, code-review, performance, observability, docs) or remote skill packs directly from Git repositories and local paths. *[Documentation and guidance; not executable rules]*
- **Observability Metrics Dashboard**: Parse and compile analytics (success rates, classifications, file modifications volumes) from agent session logs. *[Post-hoc aggregation; not real-time monitoring]*
- **PR Description Generator**: Automatically extract Goal, Touched Files, Actions, and Handoff notes from the latest session log to generate standard Pull Request descriptions.

---

## Feature Categories

### 🟢 Actively Enforced Features
These features actively constrain behavior and will fail/block operations if violated:

- **Agent Runtime Enforcement (Stop Hook)** — Claude Code's `Stop` hook blocks an agent from ending its turn if it changed files without updating `anti-patterns.md`/`decisions.md`; runs inside the agent's own loop, before there's necessarily even a commit (Claude Code sessions only; requires `--tools claude`)
- **Agent Guardrails** — Pre-commit hook blocks commits to protected paths or with forbidden patterns (optional; requires `--tools git`)
- **Session Log Validation** — `lint-sessions` command validates all session logs against schema; fails CI with exit code 1 if malformed. With the `git` adapter, a `.github/workflows/agent-room-validate.yml` workflow is scaffolded automatically to run `validate` and `lint-sessions` on every push/PR.
- **Skill Frontmatter Validation** — `validate` command lints skill YAML headers

### 🟡 Prescriptive Guidance (Requires Human Discipline)
These features provide templates and protocols that agents must choose to follow:

- **Workflow Classifier** — Guides agents to tag work as Bug / Enhancement / Feature / Product (not automatically enforced)
- **Multi-Agent Coordination Protocols** — Handoff, scope, session log format templates exist but agents must follow them manually
- **Principles Playbook** — 12 guidelines for reliable LLM output; agents must apply them

### 🔵 Aspirational/Framework Features
These provide a framework that requires external setup:

- **Stack-Specific Templates** — Inheritance system supports Python, TypeScript, React stacks, but these must be created or provided via `--org` or `--template-source`
- **Observability Metrics** — Post-hoc aggregation of completed sessions; not real-time monitoring or alerting
- **Tool Adapters** — Currently supports Claude, Cursor, Windsurf, Cline, Codex, and Git; sync is Claude-only (other tools manually update)

---

## What Requires Human Discipline?

Some features depend on agents choosing to follow documented guidance. **There is no automatic enforcement**:

- **Workflow Classification** — Agents must tag work as Bug / Enhancement / Feature / Product when creating session logs
- **Following Coordination Protocols** — Agents must read and follow handoff, scope, and session log format guidelines
- **Writing good Decisions & Anti-patterns entries** — Claude Code's Stop hook forces the *act* of logging (or an explicit waiver) before an agent can end its turn, but it can't judge whether an entry is any good, and the tool never auto-populates content; other tools get no equivalent runtime check at all
- **Applying Principles** — Agents must read the principles playbook and apply them; the tool provides no real-time guidance
- **Respecting Tool Rules** — Tool adapters (Claude, Cursor, etc.) provide guidance files, but tools decide whether/how to apply them

These features work **only if your team commits to following them**. The tool creates the structure and validation hooks; discipline is external.

For comprehensive details on what's enforced, guidance, and aspirational, see [CAPABILITIES.md](CAPABILITIES.md).

---

## Usage

`create-agent-room` is published on npm, so the usual entry point is `npx`
— no install step needed:

```bash
# Initialize a new project with all tool adapters, git initialization, and specific skill packs:
npx create-agent-room init ../my-project --tools claude,cursor,git --git --skill-packs testing,security,observability

# Scaffolding using template inheritance (Base -> Python stack -> Acme Org rules):
npx create-agent-room init . --yes --language python --org acme

# Fetching skill packs dynamically from a remote git repository:
npx create-agent-room init . --yes --skill-packs https://github.com/my-org/custom-skills.git

# Preview exactly what init would create/skip, writing nothing to disk:
npx create-agent-room init . --tools claude,git --git --dry-run

# Opt into the full guidance corpus (principles, workflow classifier, coordination protocols):
npx create-agent-room init . --yes --profile full --tools claude,git --git

# Run integrity validation on the room (exits with code 1 if files are missing or skill frontmatter is malformed):
npx create-agent-room validate .

# Generate an observability report dashboard based on session logs:
npx create-agent-room metrics .

# Generate a Pull Request description from the latest session log and save it:
npx create-agent-room pr-desc . --write
```

**Example: Init Command**

![Create Agent Room Init Output](docs/images/media__1783509718671.png)

If you're working from a clone of this repo instead (contributing, or
testing an unreleased change), swap `npx create-agent-room` for
`node bin/cli.js`:

```bash
node bin/cli.js init my-new-project
node bin/cli.js validate .
node bin/cli.js metrics .
node bin/cli.js pr-desc . --write
```

---

## Directory Structure

```
AGENTS.md                          Generic entry point read by any agent
.agent-room/
  principles.md                    12 playbooks for reliable LLM output           [--profile full only]
  workflow-classifier.md           Bug / Enhancement / Feature / Product routing  [--profile full only]
  guardrails.md                    Prose boundaries and constraints (what not to do)
  guardrails.json                  Machine-readable guardrail rule schema
  anti-patterns.md                 Append-only negative-knowledge log (starts empty)
  decisions.md                     Append-only decisions log (starts empty)
  skills/
    brainstorming.md               Brainstorming rules, hard-gated
    writing-plans.md               Design-to-task plan blueprints
    test-driven-development.md     TDD red-green-refactor loop
    systematic-debugging.md        Root-cause analysis protocols
    verification-before-completion.md   Double-checking results before completion
    closing-the-loop.md            Closing out decisions and anti-patterns
    [skill packs]                  observability.md, api-design.md, database-migrations.md, etc. (opt-in via --skill-packs, either profile)
  coordination/                    [--profile full only]
    handoff-protocol.md            Protocols for serializing state between sessions
    scope-boundaries.md            Resource ownership guidelines
    session-log-format.md          Layout template for writing session logs
  sessions/                        Directory where session logs get saved
docs/plans/                        Where design docs and task plans get saved
.agent-room.json                   Project config tracking language, tools, branch, skill packs, and profile
```

`--profile minimal` (the default) skips the two rows and the whole
`coordination/` directory marked above — see [Profiles](#profiles-minimal-vs-full).

---

## Subcommands

### 1. `init [target-dir]`

Scaffold the agent workspace. If files already exist in the target, they are skipped by default to protect manual edits unless `--force` is specified. Defaults to `--profile minimal`; pass `--dry-run` to preview what would be created/skipped without writing anything. See [Options](#options) and [Profiles](#profiles-minimal-vs-full).

### 2. `sync [target-dir]`

Synchronize custom rules from `.agent-room/skills/` directly to `.claude/skills/` mirrors.

- Run with `--check` to verify if mirrored rule files are out of date without rewriting them.
- Sync will automatically skip overwriting files if they have uncommitted manual edits, unless `--force` is used.

### 3. `validate [target-dir]`

Performs structural validation and linting on the room. Returns exit code `1` on error:

- Asserts presence of all mandatory files and folders (e.g. `AGENTS.md`, `guardrails.md`).
- Lints skill files under `.agent-room/skills/*.md` to ensure they contain Jekyll-style frontmatter headers (`---`) with valid `name` and `description` attributes.
- Parses and validates `.agent-room/guardrails.json` schema.
- Reads the `profile` recorded in `.agent-room.json` to decide whether `principles.md`/`workflow-classifier.md`/`coordination/` are required (`full`) or merely recommended-with-a-warning (`minimal`) — a `--profile minimal` room is not an error.

**Example: Validation Passed**

![Validation Passed Output](docs/images/media__1783509718049.png)

**Example: Validation Failed**

![Validation Failed Output](docs/images/media__1783509718346.png)

### 4. `metrics [target-dir]`

Aggregates all JSON and Markdown session logs inside `.agent-room/sessions/` and renders a clean CLI dashboard detailing outcome success rates, task type distributions, and overall file edit volumes.

**Example: Metrics Dashboard**

![Agent Session Dashboard](docs/images/media__1783509718617.png)

### 5. `pr-desc [target-dir]`

Parses the latest session log inside `.agent-room/sessions/` (based on timestamp filename order) and formats it into a Pull Request description template.

- Use `--write` (or `-w`) to output and save it directly to `.agent-room/pr-description.md`.

**Example: PR Description Output**

![Pull Request Description](docs/images/media__1783509718632.png)

### 6. `lint-sessions [target-dir]`

Validates all session logs in `.agent-room/sessions/` against the required schema (Date, Agent, Classification, Goal, Files touched, Actions taken, Tests run, Decisions, Outcome).

- Returns exit code `1` if validation fails (suitable for CI gating)
- Reports errors (missing required sections) and warnings (invalid classifications, missing files)

**Usage in CI:**

```yaml
- name: Validate Session Logs
  run: npx create-agent-room lint-sessions .
```

---

## Options

| Flag                       | Effect                                                                                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--name <name>`            | Project name substituted into templates (default: target dir name)                                                                                                                                                |
| `--tools <list>`           | Comma-separated: `claude,cursor,windsurf,cline,codex,git,none` (default: prompt)                                                                                                                                  |
| `--template-source <path>` | Custom templates folder path (default: searches local, home, package)                                                                                                                                             |
| `--package-manager <name>` | Package manager to use, e.g. npm, poetry, cargo (default: npm)                                                                                                                                                    |
| `--language <name>`        | Target project language, e.g. typescript, python, rust (default: javascript)                                                                                                                                      |
| `--branch <name>`          | Default git branch (default: main)                                                                                                                                                                                |
| `--skill-packs <list>`     | Comma-separated built-in names (`testing`, `security`, `release`, `code-review`, `api-design`, `database`, `performance`, `observability`, `documentation`), Git URLs (`git+ssh://...`), or local directory paths |
| `--org <name>`             | Organization layer directory name to look for during template inheritance overlays                                                                                                                                |
| `--profile <name>`         | `minimal` (default) or `full` — see [Profiles](#profiles-minimal-vs-full) below                                                                                                                                   |
| `--git`                    | Run `git init` and create an initial commit in the target directory                                                                                                                                               |
| `--force`                  | Overwrite existing files instead of skipping them                                                                                                                                                                 |
| `--dry-run`                | Print exactly what `init` would create/skip; write nothing to disk                                                                                                                                                |
| `--write, -w`              | Save generated PR description output to `.agent-room/pr-description.md`                                                                                                                                           |
| `--verbose`                | Print detailed stack traces on failure                                                                                                                                                                            |
| `-y, --yes`                | Skip all prompts, use defaults                                                                                                                                                                                    |

### Profiles: `minimal` vs `full`

`--profile minimal` is the default. It scaffolds `AGENTS.md` (kept slim),
`guardrails.md` + `guardrails.json`, the base skills, and the Stop/pre-commit
hooks (when the corresponding adapter is selected) — everything that's
either mechanically enforced or directly load-bearing. It skips
`principles.md`, `workflow-classifier.md`, `coordination/`, and skill packs
(skill packs are opt-in regardless of profile — pass `--skill-packs` to add
them under either profile).

`--profile full` restores everything: the full guidance corpus described
throughout this README.

This default is deliberate, not arbitrary: per Gloaguen et al. 2026 (ETH
Zurich), verbose LLM-facing context files measurably reduce agent
performance and increase token cost relative to minimal ones. `init`
reports an approximate token count for whatever it scaffolds (see the
post-scaffold summary), so you can judge the trade-off directly rather than
taking it on faith. Teams that want the complete framework should pass
`--profile full` explicitly.

---

## Template Composition & Inheritance

`create-agent-room` supports a powerful hierarchical layering mechanism. The overlay resolver will find and inherit files, merging folders in order from lowest-priority to highest-priority:

1. **Packaged Default Templates** (built-in base rules) ✅ Provided
2. **Packaged Stack-specific Templates** (e.g. `templates/stacks/python/`) ✅ Provided
3. **Global Templates** (`~/.agent-room-templates/base/`) 🔵 User-provided (optional)
4. **Global Stack-specific Templates** (`~/.agent-room-templates/stacks/python/`) 🔵 User-provided (optional)
5. **Global Org-specific Templates** (`~/.agent-room-templates/org/<org-name>/`) 🔵 User-provided via `--org` (optional)
6. **Local Templates** (`.agent-room-templates/` or `--template-source`) 🔵 User-provided (optional)

During this overlay process, files in higher-priority folders will overwrite conflicts from lower layers, enabling modular organization-wide guidelines with project-level overrides.

**Note:** Layers 3-6 are **aspirational** — the framework supports them, but you must create or provide these templates yourself. Layers 1-2 ship with the package. To use stack inheritance effectively, create your org's stack templates in layer 5 or provide them at project init time.
