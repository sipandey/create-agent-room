# create-agent-room

Scaffold an LLM-agent-friendly project structure and governance framework into any new or existing project.

`create-agent-room` is a **best-practices scaffolder and analytics engine** for LLM agents. It provides a generic `AGENTS.md` entry point, a principles playbook, a workflow classifier, anti-patterns/decisions logs, and custom multi-agent coordination protocols. It also supports optional thin adapters for Claude Code, Cursor, Windsurf, Cline, Git, and Codex to provide guidance and **optionally enforce** quality and governance.

> **Note:** This tool excels at generating initial project structure and post-hoc analytics. Some features are **prescriptive guidance** (documentation) while others are **actively enforced** (e.g., guardrails pre-commit hook, session log validation). See [Feature Categories](#feature-categories) and [CAPABILITIES.md](CAPABILITIES.md) for details on what's enforced vs. guidance.

---

## Features

- **Multi-Agent Coordination**: Scaffolds templates for handoffs, scope boundaries, and structured session logs. *[Guidance only; requires human discipline to follow protocols]*
- **Agent Guardrails**: Defines protected paths, require-approval rules, and forbidden actions via `guardrails.json`. *[Actively enforced via pre-commit hook when Git adapter selected]*
- **Session Log Format Enforcement**: Validates session logs against required structure via `lint-sessions` command. *[Actively enforced; fails CI if logs malformed]*
- **Inheritance & Composition**: Composes templates sequentially from base structures, stack-specific files (e.g. Python, React), org-specific conventions (`--org <name>`), and project overrides. *[Framework provided; stack templates must be created or inherited]*
- **Built-in & External Skill Packs**: Standard templates (testing, security, database-migrations, api-design, code-review, performance, observability, docs) or remote skill packs directly from Git repositories and local paths. *[Documentation and guidance; not executable rules]*
- **CI Room Validation**: Lint skill YAML frontmatter headers, verify guardrail schemas, and validate session logs in your CI/CD pipelines.
- **Observability Metrics Dashboard**: Parse and compile analytics (success rates, classifications, file modifications volumes) from agent session logs. *[Post-hoc aggregation; not real-time monitoring]*
- **PR Description Generator**: Automatically extract Goal, Touched Files, Actions, and Handoff notes from the latest session log to generate standard Pull Request descriptions.

---

## Feature Categories

### 🟢 Actively Enforced Features
These features actively constrain behavior and will fail/block operations if violated:

- **Agent Guardrails** — Pre-commit hook blocks commits to protected paths or with forbidden patterns (optional; requires `--tools git`)
- **Session Log Validation** — `lint-sessions` command validates all session logs against schema; fails CI with exit code 1 if malformed. With the `git` adapter, a `.github/workflows/agent-room-validate.yml` workflow is scaffolded automatically to run `validate` and `lint-sessions` on every push/PR.
- **Skill Frontmatter Validation** — `validate` command lints skill YAML headers

### 🟡 Prescriptive Guidance (Requires Human Discipline)
These features provide templates and protocols that agents must choose to follow:

- **Workflow Classifier** — Guides agents to tag work as Bug / Enhancement / Feature / Product (not automatically enforced)
- **Multi-Agent Coordination Protocols** — Handoff, scope, session log format templates exist but agents must follow them manually
- **Anti-patterns & Decisions Logs** — Require manual updates; no automated enforcement
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
- **Updating Decisions & Anti-patterns Logs** — Agents must manually append learnings; the tool doesn't auto-populate these
- **Applying Principles** — Agents must read the principles playbook and apply them; the tool provides no real-time guidance
- **Respecting Tool Rules** — Tool adapters (Claude, Cursor, etc.) provide guidance files, but tools decide whether/how to apply them

These features work **only if your team commits to following them**. The tool creates the structure and validation hooks; discipline is external.

For comprehensive details on what's enforced, guidance, and aspirational, see [CAPABILITIES.md](CAPABILITIES.md).

---

## Usage

```bash
# Initialize a new project with all tool adapters, git initialization, and specific skill packs:
node bin/cli.js init ../my-project --tools claude,cursor,git --git --skill-packs testing,security,observability

# Scaffolding using template inheritance (Base -> Python stack -> Acme Org rules):
node bin/cli.js init . --yes --language python --org acme

# Fetching skill packs dynamically from a remote git repository:
node bin/cli.js init . --yes --skill-packs https://github.com/my-org/custom-skills.git

# Run integrity validation on the room (exits with code 1 if files are missing or skill frontmatter is malformed):
node bin/cli.js validate .

# Generate an observability report dashboard based on session logs:
node bin/cli.js metrics .

# Generate a Pull Request description from the latest session log and save it:
node bin/cli.js pr-desc . --write
```

**Example: Init Command**

![Create Agent Room Init Output](docs/images/media__1783509718671.png)

Once published to npm, the same commands work via `npx`:

```bash
npx create-agent-room init my-new-project
npx create-agent-room validate .
npx create-agent-room metrics .
npx create-agent-room pr-desc . --write
```

---

## Directory Structure

```
AGENTS.md                          Generic entry point read by any agent
.agent-room/
  principles.md                    12 playbooks for reliable LLM output
  workflow-classifier.md           Bug / Enhancement / Feature / Product routing
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
    [skill packs]                  observability.md, api-design.md, database-migrations.md, etc.
  coordination/
    handoff-protocol.md            Protocols for serializing state between sessions
    scope-boundaries.md            Resource ownership guidelines
    session-log-format.md          Layout template for writing session logs
  sessions/                        Directory where session logs get saved
docs/plans/                        Where design docs and task plans get saved
.agent-room.json                   Project config tracking language, tools, branch, and skill packs
```

---

## Subcommands

### 1. `init [target-dir]`

Scaffold the agent workspace. If files already exist in the target, they are skipped by default to protect manual edits unless `--force` is specified.

### 2. `sync [target-dir]`

Synchronize custom rules from `.agent-room/skills/` directly to `.claude/skills/` mirrors.

- Run with `--check` to verify if mirrored rule files are out of date without rewriting them.
- Sync will automatically skip overwriting files if they have uncommitted manual edits, unless `--force` is used.

### 3. `validate [target-dir]`

Performs structural validation and linting on the room. Returns exit code `1` on error:

- Asserts presence of all mandatory files and folders (e.g. `AGENTS.md`, `guardrails.md`).
- Lints skill files under `.agent-room/skills/*.md` to ensure they contain Jekyll-style frontmatter headers (`---`) with valid `name` and `description` attributes.
- Parses and validates `.agent-room/guardrails.json` schema.

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
| `--git`                    | Run `git init` and create an initial commit in the target directory                                                                                                                                               |
| `--force`                  | Overwrite existing files instead of skipping them                                                                                                                                                                 |
| `--write, -w`              | Save generated PR description output to `.agent-room/pr-description.md`                                                                                                                                           |
| `--verbose`                | Print detailed stack traces on failure                                                                                                                                                                            |
| `-y, --yes`                | Skip all prompts, use defaults                                                                                                                                                                                    |

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
