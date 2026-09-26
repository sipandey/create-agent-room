---
date: 2026-09-25T19:52:00Z
research_doc: docs/research/2026-09-26-artifact-lifecycle.md
branch: feature/story-9.2-artifact-lifecycle
status: complete
phases_total: 4
phases_completed: 4
---

# Implementation Plan: Standardized Artifact Lifecycle (Story 9.2)

## Overview
Establish predictable on-disk artifact directories, standard frontmatter schemas, and automated validation for technical research documents (`docs/research/`) and implementation plans (`docs/plans/`) within `create-agent-room`.

---

## What We're NOT Doing
- We are NOT removing or relocating existing documentation directories.
- We are NOT forcing historical markdown design notes to be rewritten (we simply attach compliant YAML frontmatter headers to make them schema-valid).
- We are NOT introducing external schema validation libraries like AJV or Joi (we maintain CAR's zero-runtime-dependency invariant by implementing pure JavaScript frontmatter linting in `lib/checks.js`).

---

## Phase 1: Scaffold `docs/research/` in Templates
Ensure both `docs/research/` and `docs/plans/` are scaffolded during repository initialization.

- [x] **Phase 1.1**: Add `.gitkeep` to `templates/docs/research/.gitkeep`.
- [x] **Phase 1.2**: Add test in `test/init.test.js` verifying that `runInit` scaffolds both `docs/plans/` and `docs/research/`.

### Automated Verification
```bash
node -e "
const fs = require('fs');
if (!fs.existsSync('templates/docs/research/.gitkeep')) throw new Error('Missing templates/docs/research/.gitkeep');
if (!fs.existsSync('templates/docs/plans/.gitkeep')) throw new Error('Missing templates/docs/plans/.gitkeep');
"
```

---

## Phase 2: Implement Artifact Validation in `lib/checks.js` & `lib/validate.js`
Add strict linting for RPI artifact file naming conventions and YAML frontmatter schemas.

- [x] **Phase 2.1**: Update `lib/checks.js` with Section 4 (Lint RPI Artifacts):
  - Check `docs/research/`:
    - Ensure `.md` files (ignoring `README.md`) start with `YYYY-MM-DD-`.
    - Ensure valid YAML frontmatter delimiters (`---`).
    - Validate required keys: `date`, `git_commit`, `branch`, `repository`, `topic`, `tags`, `status`.
  - Check `docs/plans/`:
    - Ensure `.md` files (ignoring `README.md`) start with `YYYY-MM-DD-`.
    - Ensure valid YAML frontmatter delimiters (`---`).
    - Validate required keys: `date`, `research_doc`, `branch`, `status`, `phases_total`, `phases_completed`.
    - Validate `phases_total` and `phases_completed` are numbers.
- [x] **Phase 2.2**: Update `lib/validate.js` success output to report: `green('  ✅  All RPI artifacts (research & plans) follow schema conventions.')`.
- [x] **Phase 2.3**: Add unit tests in `test/validate.test.js` covering:
  - Fails when research doc has invalid filename or missing frontmatter attributes.
  - Fails when plan doc has invalid filename, missing frontmatter attributes, or non-numeric phases.
  - Passes when valid artifacts exist.

### Automated Verification
```bash
node --test test/validate.test.js
```

---

## Phase 3: Backfill Legacy Design Notes & Full Suite Verification
Ensure dogfood repository and test suites pass completely.

- [x] **Phase 3.1**: Add compliant YAML frontmatter to the 5 historical July 2026 design notes in `docs/plans/`.
- [x] **Phase 3.2**: Run `node bin/cli.js validate .`, `npm run lint`, and `npm test` across all 379+ tests.

### Automated Verification
```bash
node bin/cli.js validate . && npm run lint && npm test
```

---

## Phase 4: Backlog, Decisions, and Session Telemetry
Record project status and architectural decisions according to repository governance.

- [x] **Phase 4.1**: Update `BACKLOG.md` to mark Story 9.2 as `[x] DONE` and record deliverables.
- [x] **Phase 4.2**: Record architectural decision in `.agent-room/decisions.md`.
- [x] **Phase 4.3**: Create session log under `.agent-room/sessions/` per `session-log-format.md`.
- [x] **Phase 4.4**: Run plan validation audit and emit `docs/reviews/2026-09-26-story-9-2-validation.md`.

### Automated Verification
```bash
git status --porcelain
```
