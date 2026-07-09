# GitHub Action

`create-agent-room` publishes a composite [GitHub Action](../action.yml)
that runs `validate` and `lint-sessions` against an existing agent-room
scaffold. It's for repos that want the CI check without running
`create-agent-room init` at all — for example, checking out someone else's
already-scaffolded repo, or adding the check to a monorepo subdirectory
that was scaffolded by hand.

## When to use this instead of `init --tools git`

`create-agent-room init --tools git` scaffolds a workflow file
(`.github/workflows/agent-room-validate.yml`) that calls the same two
commands directly via `npx`. If you've already run `init --tools git`,
**use that scaffolded workflow, not this Action** — they do the same
thing, and running both is redundant, not additive.

Use this Action instead when:

- You haven't run (and don't plan to run) `create-agent-room init` in
  this repo, but want the CI check anyway.
- You're checking a subdirectory or a repo someone else scaffolded.
- You want Marketplace-style discoverability (`uses:
  sipandey/create-agent-room@v2`) instead of a `run: npx ...` step.

Either path runs identical checks — pick one per repo, not both.

## Minimal usage

```yaml
name: agent-room-validate

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: sipandey/create-agent-room@v2
```

That's `validate` and `lint-sessions` against `.` with no further
configuration. `actions/checkout@v4` must run first — the Action doesn't
check out your repo itself (composite actions shouldn't; that's the
calling workflow's job).

## Inputs

| Input          | Default | Effect                                                                |
| --------------- | ------- | ---------------------------------------------------------------------- |
| `target-dir`    | `.`     | Directory containing the `.agent-room/` scaffold to check              |
| `checks`        | `both`  | `both`, `validate`, or `lint-sessions`                                 |
| `version`       | pinned to the version this Action ships with | `create-agent-room` version to run via `npx`, e.g. `2.0.1` or `latest` |
| `node-version`  | `20`    | Node.js version set up before running `npx`                            |

None of these are required — omit anything you don't need to override.

## Examples

Check a subdirectory, and only run schema/frontmatter validation (skip
session log linting):

```yaml
- uses: actions/checkout@v4
- uses: sipandey/create-agent-room@v2
  with:
    target-dir: packages/agent-workspace
    checks: validate
```

Always run the newest release instead of the pinned default (not
recommended for CI reproducibility, but useful for dogfooding an
unreleased fix):

```yaml
- uses: actions/checkout@v4
- uses: sipandey/create-agent-room@v2
  with:
    version: latest
```

## Why the version is pinned by default

Same reasoning as the scaffolded workflow's `{{CAR_VERSION}}`
interpolation (see `templates/adapters/ci/github-actions.yml.tmpl`): an
unpinned `npx create-agent-room@latest` means the same commit can pass CI
one week and fail the next, purely from an upstream release, with no way
to reproduce a past CI run. The Action's default `version` input is
bumped in lockstep with `package.json`'s version at release time — see
"Release process" in `AGENTS.md`/`CLAUDE.md`.
