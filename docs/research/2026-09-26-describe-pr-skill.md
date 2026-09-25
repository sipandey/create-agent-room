---
date: 2026-09-25T19:31:06Z
git_commit: 7aadab9fbae35b2d21917ebe51d5b65d98f5940b
branch: feature/story-9.9-describe-pr-skill
repository: create-agent-room
topic: "Attested PR Description Skill (Story 9.9)"
tags: [research, skills, pr, attestation, github-cli, governance]
status: complete
---

# Research: Attested PR Description Skill (Story 9.9)

## Research Question
How should `create-agent-room` design and implement the canonical `describe-pr.md` skill (`/describe_pr` and `/describe-pr`) to synthesize high-quality pull request descriptions that combine deep architectural diff analysis with CAR's verified execution proofs (`create-agent-room pr-desc --verify`), respect repository PR templates, and synchronize directly to GitHub via `gh pr edit`?

## Summary
Writing pull request descriptions is often treated as an afterthought by developers and AI agents alike, leading to vague summaries ("fixes bugs", "updates code") that lack architectural context, omit verification evidence, and fail to document breaking changes or migrations.

`create-agent-room` already provides a powerful underlying CLI command:
- `create-agent-room pr-desc [target-dir] [options]` (implemented in `lib/pr.js`)
- Supporting `--verify` (runs test suite, records duration, timestamp, console output), `--write` (saves to `.agent-room/pr-description.md`), and `--output <path>`.

Story 9.9 operationalizes this capability into an interactive procedural skill: `describe-pr.md` (invokable as `/describe_pr` or `/describe-pr`). The skill automates:
1. Discovery of active PR context using `gh pr view` and `gh pr diff`.
2. Discovery and compliance with repository PR templates (e.g. `.github/pull_request_template.md`).
3. Deep architectural diff analysis classifying user-facing vs. internal changes and breaking changes.
4. Automatic generation of execution attestation proofs using `create-agent-room pr-desc . --verify --output <path>`.
5. Presentation to user for interactive approval.
6. Direct synchronization to GitHub using `gh pr edit <number> --body-file <path>`.

## Detailed Findings

### 1. Underlying CLI Attestation Mechanics (`lib/pr.js`)
`lib/pr.js` provides `runPrDesc(target, args)` and `generatePrDescription(session, latestFile, options)`:
- Scans `.agent-room/sessions/` for the latest session log (either markdown or JSON format).
- Parses `Goal`, `Files touched`, `Actions taken`, `Tests run`, `Decisions made`, and `Outcome`.
- When `--verify` is passed:
  - Invokes `verifyProject(target, args)` to run the configured verification test command (`npm test`).
  - Records execution metrics: exit code, duration in milliseconds, ISO timestamp, and captured console output.
  - Parses `.agent-room/guardrails-bypass-log.md` for bypass statistics.
  - Parses `.agent-room/decisions.md` for decisions recorded.
  - Emits the Attestation Proof block and Reviewer Compliance Checklist (`- [x] Tests verified passing`).
- Flags supported:
  - `--verify`: Run automated verification and embed proof.
  - `--write` / `-w`: Write to `.agent-room/pr-description.md`.
  - `--output <path>`: Write to custom file path.

### 2. GitHub CLI Integration Mechanics
The skill utilizes `gh` CLI commands:
- **PR Discovery**:
  - `gh pr view --json number,title,body,baseRefName,headRefName,url`
  - If a PR does not exist yet for the branch, check `git log origin/main...HEAD` and `git diff origin/main...HEAD`.
- **PR Diff Inspection**:
  - `gh pr diff` or `git diff origin/main...HEAD`
- **PR Body Update**:
  - `gh pr edit <number> --body-file .agent-room/pr-description.md`
- **Interactive Gate**:
  - The skill MUST present the draft PR description to the human user and request explicit confirmation before modifying remote PR metadata.

### 3. Architectural Diff Analysis Requirements
A compliant PR description requires more than an automated log dump:
- **User-Facing Changes**: CLI options, flags, commands, public APIs, exported functions.
- **Internal Architecture**: Refactors, helpers, registry updates, internal hooks.
- **Breaking Changes & Migrations**: Any backwards-incompatible shifts or schema changes.
- **Template Conformance**: If the repository provides `.github/pull_request_template.md`, the skill merges its custom sections with the repository's required format.

### 4. Core Skills Registration & Scaffolding
- Template file: `templates/.agent-room/skills/describe-pr.md`
- Dogfood file: `.agent-room/skills/describe-pr.md`
- Register `'describe-pr.md'` in `CORE_SKILL_FILES` in `lib/skill.js`.
- Unit test in `test/skill.test.js`.
- Sync to `.claude/skills/describe-pr/SKILL.md` and IDE adapter manifests via `runSync`.
