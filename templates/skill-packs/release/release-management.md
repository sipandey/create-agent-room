---
name: release-management
description: "Use when preparing release commits, tagging, bumping version numbers, compiling changelogs, or deciding whether a change is safe to release."
---

# Release Management

## Overview

Releasing software should be automated, reproducible, and traceably
documented. A release is not "push to main and hope" — it's a controlled
process with validation gates, a rollback plan, and post-release
verification.

## The iron law

```
NO RELEASE WITHOUT A ROLLBACK PLAN
```

Before tagging a release, you must be able to answer: "If this breaks
production, what do we do in the next 5 minutes?" If the answer is "I
don't know," the release is not ready.

## Release process

### 1. Pre-release validation checklist

Before bumping the version, confirm:

- [ ] All tests pass on the release branch (not just locally — in CI)
- [ ] Linter is clean with zero warnings
- [ ] No high/critical dependency audit findings
- [ ] Breaking changes are documented with migration instructions
- [ ] Database migrations are backward-compatible (see below)
- [ ] Feature flags for incomplete features are defaulted to off
- [ ] The changelog is complete and reviewed

If any box is unchecked, the release is not ready. Don't ship with
"we'll fix it in the next release."

### 2. Version bump

Increment the version in configuration files (`package.json`, `setup.py`,
`Cargo.toml`, etc.) according to Semantic Versioning:

| Change type | Version bump | Example |
| --- | --- | --- |
| Bug fixes, patches | PATCH | 1.2.3 → 1.2.4 |
| New features (backward-compatible) | MINOR | 1.2.3 → 1.3.0 |
| Breaking changes | MAJOR | 1.2.3 → 2.0.0 |

**When in doubt, it's a MINOR.** PATCH is only for pure bug fixes with
no new behavior. If you added a flag, an option, a new endpoint — it's
MINOR, even if it "feels small."

### 3. Changelog generation

Compile changes into `CHANGELOG.md`, grouped by type:

```markdown
## [1.3.0] - 2025-03-15

### Added
- Webhook notification support for order status changes (#142)

### Changed
- Increased default pagination limit from 20 to 50 (#138)

### Fixed
- Timezone conversion error in reporting module (#145)

### Breaking
- Removed deprecated `/api/v1/users` endpoint (#130). Use `/api/v2/users`.
```

Write entries for humans, not for commit logs. "Fixed #145" is not a
changelog entry. "Fixed timezone conversion error that caused incorrect
daily totals in the reporting module" is.

### 4. Release commit and tag

```bash
git add CHANGELOG.md package.json  # (or equivalent version files)
git commit -m "chore(release): version {{VERSION}}"
git tag -a v{{VERSION}} -m "Version {{VERSION}}"
```

### 5. Merge to main

Ensure all release updates are merged into the default branch
`{{DEFAULT_BRANCH}}`. The tagged commit must be reachable from the
default branch.

## Rollback plan

Every release must document its rollback strategy before shipping:

- **Stateless services:** Rollback is redeploying the previous version.
  Confirm the previous Docker image / artifact is still available.
- **Database migrations included:** Rollback requires a reverse
  migration. Write and test the reverse migration *before* releasing.
  If the migration is not reversible (dropped column, data transformation),
  document the manual recovery procedure.
- **Breaking API changes:** Rollback may require client-side changes.
  Use API versioning to maintain the old endpoint during the transition
  period.

## Database migration safety

Migrations are the riskiest part of most releases. Rules:

1. **Forward-only in production.** Never hand-edit a production database.
2. **Backward-compatible by default.** The old code should still work
   after the migration runs (deploy migration first, then new code).
3. **Additive changes are safe:** new tables, new columns (nullable or
   with defaults), new indexes.
4. **Destructive changes require a multi-step release:**
   - Release 1: Add the new column, start writing to both old and new.
   - Release 2: Backfill data, switch reads to new column.
   - Release 3: Remove the old column.
5. **Index creation:** Use `CREATE INDEX CONCURRENTLY` (Postgres) or
   equivalent. Large indexes on production tables can lock writes.

## Feature flag coordination

When releasing behind feature flags:

- Default new flags to **off** in production.
- The release changelog should note which flags are included and their
  default state.
- Remove flags promptly after the feature is fully rolled out. Stale
  flags are technical debt that compounds — each flag doubles the number
  of code paths to test.

## Post-release monitoring

After deploying:

1. Watch error rates for 15 minutes. Any spike → investigate immediately.
2. Check key metrics (latency, throughput, error rate) against the
   pre-release baseline.
3. If metrics degrade beyond acceptable thresholds, execute the rollback
   plan. Don't debug in production under pressure — roll back first,
   investigate second.
