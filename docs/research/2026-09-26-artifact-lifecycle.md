---
date: 2026-09-25T19:50:00Z
git_commit: f5f30421711dbb5b9e5d4cbefc3fbaef3ebef1fc
branch: feature/story-9.2-artifact-lifecycle
repository: create-agent-room
topic: "Standardized Artifact Lifecycle (Story 9.2)"
tags: [research, rpi, artifacts, validation, init, schemas]
status: complete
---

# Research: Standardized Artifact Lifecycle (Story 9.2)

## Research Question
How should `create-agent-room` standardize the on-disk artifact lifecycle across `docs/research/` and `docs/plans/`, enforce required YAML frontmatter schemas and file naming conventions, and integrate automated linting into `create-agent-room validate`?

## Summary
The RPI framework relies on durable on-disk artifacts as contracts between stages:
1. `research-codebase` emits technical research documents to `docs/research/`.
2. `writing-plans` emits phased execution plans to `docs/plans/`.
3. `implement-plan` reads plans from `docs/plans/` and checkpoints progress.
4. `validate-plan` reads plans and research to audit implementations.

To prevent drift, missing metadata, and unstructured files from polluting these directories, Story 9.2 establishes:
- Standard directory scaffolding in `init` (`docs/research/.gitkeep` alongside `docs/plans/.gitkeep`).
- Authoritative YAML frontmatter schemas for both artifact types.
- Strict linting in `create-agent-room validate` (`lib/checks.js`), verifying filenames (`YYYY-MM-DD-*.md`) and mandatory frontmatter attributes.

## Detailed Findings

### 1. Scaffolding in `lib/init.js`
In `lib/init.js`:
- Line 1132 copies `templates/docs/` to `target/docs/`.
- Currently `templates/docs/` contains `plans/.gitkeep`, but `templates/docs/research/` is empty and not tracked by git.
- Adding `templates/docs/research/.gitkeep` ensures that every newly scaffolded project immediately possesses both `docs/research/` and `docs/plans/` directories.

### 2. Standardized Artifact Naming & Frontmatter Schemas
Both artifact categories must follow standard ISO date-prefixed filenames:
- Pattern: `YYYY-MM-DD-[ticket-]topic.md` (Regex: `/^\d{4}-\d{2}-\d{2}-.+\.md$/`).
- Ignored files: `.gitkeep` and `README.md`.

#### Research Schema (`docs/research/*.md`)
Mandatory frontmatter attributes:
- `date`: string (ISO 8601 or YYYY-MM-DD)
- `git_commit`: string (commit SHA at time of research)
- `branch`: string (branch name where research was conducted)
- `repository`: string (repository name)
- `topic`: string (human-readable title/topic)
- `tags`: array or string
- `status`: string (e.g. `complete`, `in-progress`)

#### Plan Schema (`docs/plans/*.md`)
Mandatory frontmatter attributes:
- `date`: string (ISO 8601 or YYYY-MM-DD)
- `research_doc`: string (reference to source research doc or `N/A`)
- `branch`: string (intended feature/fix branch)
- `status`: string (`pending`, `in_progress`, `complete`)
- `phases_total`: number (total phases declared)
- `phases_completed`: number (completed phases)

### 3. Validation Integration (`lib/checks.js` & `lib/validate.js`)
Currently, `lib/checks.js` validates:
1. Core files and directories.
2. `guardrails.json` syntax and array structures.
3. Skill files frontmatter metadata (`name`, `description`).

Adding Section 4 to `lib/checks.js`:
- Scan `docs/research/` if it exists. For any `.md` file (excluding `README.md`):
  - Validate filename matches `/^\d{4}-\d{2}-\d{2}-.+\.md$/`.
  - Validate presence of YAML frontmatter delimiters (`---`).
  - Validate presence of non-empty required research keys (`date`, `git_commit`, `branch`, `repository`, `topic`, `tags`, `status`).
- Scan `docs/plans/` if it exists. For any `.md` file (excluding `README.md`):
  - Validate filename matches `/^\d{4}-\d{2}-\d{2}-.+\.md$/`.
  - Validate presence of YAML frontmatter delimiters (`---`).
  - Validate presence of non-empty required plan keys (`date`, `research_doc`, `branch`, `status`, `phases_total`, `phases_completed`).
  - Validate `phases_total` and `phases_completed` are numbers.
- In `lib/validate.js`:
  - When validation passes, log: `green('  ✅  All RPI artifacts (research & plans) follow schema conventions.')`.

### 4. Dogfood Repository Migration
The CAR dogfood repository already conforms to `docs/research/` schemas.
In `docs/plans/`, 5 historical design notes from July 2026 (`2026-07-*.md`) predate Epic 9's RPI framework. Adding standard frontmatter blocks to these historical notes will bring the entire repository into 100% compliance.
