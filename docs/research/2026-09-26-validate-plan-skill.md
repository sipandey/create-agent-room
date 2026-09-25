---
date: 2026-09-25T19:19:09Z
git_commit: 3876bcf48533a848c4c68fe6cce1012bf73426c3
branch: feature/story-9.8-validate-plan-skill
repository: create-agent-room
topic: "Plan Validation Auditor Skill (Story 9.8)"
tags: [research, skills, rpi, validation, plan, audit, governance]
status: complete
---

# Research: Plan Validation Auditor Skill (Story 9.8)

## Research Question
How should `create-agent-room` structure and implement the canonical `validate-plan.md` skill (`/validate_plan`), providing an independent post-implementation validation gate that audits code modifications, schema migrations, and automated test coverage against the approved plan in `docs/plans/`, produces triaged classification reports, and integrates into CAR's skill registry and multi-agent sync system?

## Summary
In the Research → Plan → Implement (RPI) development lifecycle:
1. `research-codebase.md` (`/research`) uncovers architecture, files, and patterns.
2. `writing-plans.md` (`/plan`) defines detailed, phased execution specifications with automated verification commands and checkboxes.
3. `implement-plan.md` (`/implement`) executes the plan sequentially using TDD.
4. `commit-changes.md` (`/commit`) atomizes changes into verified git commits.

However, after implementation and before closing or submitting a PR, there is a risk of silent divergence:
- Steps or edge cases in the plan were unintentionally skipped or left incomplete.
- Unplanned code modifications or scope creep occurred.
- Database schemas or configuration updates deviated from the plan's architectural contract.
- Tests only assert happy paths or skip certain phase verification requirements.

Story 9.8 introduces `validate-plan.md` (invokable as `/validate_plan` and `/validate-plan`), an independent post-implementation auditor skill that systematically reconciles code changes against the active plan across a 3-Vector Audit (Schemas, Code Specifications, and Test Coverage) and produces a structured validation report under `docs/reviews/`.

## Detailed Findings

### 1. Context Discovery Requirements
The auditor must reliably discover the relevant plan and changes:
- **Locate Active Plan**: Discover the target plan file in `docs/plans/` (either specified by user or the most recently updated plan for the current ticket/branch).
- **Inspect Commit History & Working Diff**:
  - Run `git log -n 20 --oneline` to view recent commits on the feature branch.
  - Run `git diff origin/main...HEAD` or `git diff HEAD~N..HEAD` plus `git status` to capture the complete delta of changes introduced by the feature.
  - Parse the plan's expected deliverables, files changed, and phase verification commands.

### 2. 3-Vector Audit Architecture
The audit evaluates three distinct dimensions:
1. **Vector 1: Database & Schema Migrations**
   - Check data models, migrations, table definitions, schemas, and configurations.
   - Verify non-breaking backward compatibility, indexing, and migration rollbacks if specified in the plan.
2. **Vector 2: Code Modifications vs. Plan Specifications**
   - Compare modified files and symbols against those explicitly outlined in each plan phase.
   - Detect missing requirements (planned changes not implemented).
   - Detect unauthorized changes (files or APIs modified without being specified in the plan).
3. **Vector 3: Automated Test Coverage & Verification**
   - Verify that test suites cover all new/modified capabilities.
   - Execute the plan's automated verification commands directly in this turn.
   - Read test outputs to verify all tests genuinely pass.

### 3. Triage Classification
Results must be categorized into standard buckets:
- 🟢 **Matches Plan**: Implementation directly and cleanly fulfills plan phases and specifications.
- 🟡 **Deviations from Plan**: Intentional or accidental differences from plan specifications, along with rationale.
- 🔴 **Potential Issues**: Unhandled edge cases, security risks, performance regressions, or test gaps.
- 🔵 **Manual Testing Required**: Behaviors that cannot be verified automatically (e.g. UX nuances, external API integrations, hardware/browser interactions).

### 4. Validation Report Artifact Structure
Reports are persisted to `docs/reviews/YYYY-MM-DD-[TICKET-]validation.md` (creating `docs/reviews/` if absent).
The report format includes:
- YAML frontmatter (`date`, `git_commit`, `branch`, `plan_file`, `status: [PASSED | FAILED | WARN]`, `summary`).
- Executive Verdict (`PASSED`, `PASSED WITH WARNINGS`, or `FAILED - ACTION REQUIRED`).
- 3-Vector Audit Findings matrix.
- Triage Breakdown (Matches, Deviations, Issues, Manual Testing).
- Recommended Remediation Steps.

### 5. Multi-Tool Scaffolding & Core Registry
- **Template Location**: `templates/.agent-room/skills/validate-plan.md`
- **Scaffold / Local Location**: `.agent-room/skills/validate-plan.md`
- **Core Skills Registry**: Register `'validate-plan.md'` in `CORE_SKILL_FILES` in `lib/skill.js`.
- **Sync**: `runSync` will automatically mirror to `.claude/skills/validate-plan/SKILL.md` and update skill listings across Cursor, Windsurf, Cline, Codex, and Copilot.
- **Unit Testing**: Add registration and metadata tests in `test/skill.test.js`.
