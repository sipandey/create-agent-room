# GitHub Action

`create-agent-room` publishes an official composite [GitHub Action](../action.yml)
that runs unified room governance and compliance checks (`validate`, `doctor`, `sessions`, `verify`, `eval`, `pr`) against an existing agent-room
scaffold. It also automatically formats and writes Markdown scorecards to `$GITHUB_STEP_SUMMARY` and posts/updates sticky compliance comments directly on pull requests.

It is ideal for repositories wanting seamless CI governance without manual scripting — checking out existing scaffolds, auditing monorepo subdirectories, or leveraging GitHub Marketplace discoverability (`uses: sipandey/create-agent-room@v2`).

## When to use this instead of `init --tools git`

`create-agent-room init --tools git` scaffolds a direct workflow file
(`.github/workflows/agent-room-ci.yml`) that calls `create-agent-room ci --summary` via an explicit `npm install -g` followed by direct invocation.
If you have already run `init --tools git`,
**use that scaffolded workflow, not this Action** — they execute the same underlying governance engine.

Use this Action instead when:

- You haven't run (and don't plan to run) `create-agent-room init` in this repository, but want turn-key CI governance anyway.
- You are checking a subdirectory or a repository someone else scaffolded.
- You want Marketplace-style discoverability (`uses: sipandey/create-agent-room@v2`) instead of hand-writing install and run steps.
- You want turn-key sticky PR comments posted and updated in-place on every push to a pull request.

## Minimal Usage

```yaml
name: Agent Room CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: sipandey/create-agent-room@v2
```

That runs all room compliance checks (`validate`, `doctor`, `sessions`, `verify`, `eval`, `pr`) against `.`, formatting results directly into the **GitHub Actions Job Summary** (`$GITHUB_STEP_SUMMARY`).

> **Note**: `actions/checkout@v4` must run first. When running PR diff and tamper audits, fetch depth should include the base branch:
> ```yaml
> - uses: actions/checkout@v4
>   with:
>     fetch-depth: 0
> ```

---

## Sticky Pull Request Scorecard Comments

The Action can automatically post and update a sticky compliance scorecard directly on pull requests:

```yaml
name: Agent Room PR Compliance

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: sipandey/create-agent-room@v2
        with:
          comment: true
          strict: true
```

### How Sticky Comments Work
1. When `comment: true` (or `--comment`) is set, the reporter inspects the GitHub PR event payload or environment.
2. It searches existing comments on the PR for the invisible marker:
   ```html
   <!-- agent-room-pr-comment -->
   ```
3. If an existing scorecard comment is found, it updates the comment in-place (`PATCH /repos/{owner}/{repo}/issues/comments/{id}`), preventing notification spam.
4. If no prior comment exists, it creates a new comment (`POST /repos/{owner}/{repo}/issues/{pr}/comments`).
5. All requests use Node's native global `fetch` with zero external dependencies.

### Required Permissions
Posting PR comments requires GitHub App token write access to issues/pull requests:
```yaml
permissions:
  contents: read
  pull-requests: write
```

---

## Inputs Reference

| Input | Default | Description |
| :--- | :--- | :--- |
| `target-dir` | `.` | Directory containing the `.agent-room/` scaffold to check |
| `base` | `''` | Target base branch or ref (e.g. `main` or `origin/main`) for PR anti-tamper and diff audits |
| `strict` | `false` | Treat warnings as failures and enforce strict test passing (exit code 1) |
| `comment` | `false` | Post or update sticky compliance scorecard comment on pull requests (`pull-requests: write` required) |
| `summary` | `true` | Write interactive Markdown scorecard to GitHub Actions Job Summary (`$GITHUB_STEP_SUMMARY`) |
| `github-token` | `''` | GitHub token for posting PR comments (defaults to `github.token` or `env.GITHUB_TOKEN`) |
| `skip` | `''` | Comma-separated check IDs to skip (e.g. `verify,eval`) |
| `only` | `''` | Comma-separated check IDs to run exclusively (e.g. `validate,doctor`) |
| `checks` | `''` | *(Legacy)* `both`, `validate`, or `lint-sessions`. Preserved for backward-compatibility. |
| `version` | `2.5.0` | `create-agent-room` version to install globally (pinned by default for deterministic builds) |
| `node-version` | `20` | Node.js version set up before installing/running the CLI |

---

## Examples

### 1. Monorepo Subdirectory with PR Comments & Strict Mode
```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: sipandey/create-agent-room@v2
  with:
    target-dir: packages/agent-workspace
    comment: true
    strict: true
    base: origin/main
```

### 2. Fast Lightweight Validation (Skip Test & Eval Suites)
```yaml
- uses: actions/checkout@v4
- uses: sipandey/create-agent-room@v2
  with:
    skip: verify,eval
```

### 3. Legacy Migration Mode
Existing workflows configuring `checks: validate` or `checks: lint-sessions` continue to work without changes:
```yaml
- uses: actions/checkout@v4
- uses: sipandey/create-agent-room@v2
  with:
    checks: validate
```

---

## Why the Version is Pinned by Default

Same reasoning as the scaffolded workflow's version interpolation: an unpinned `create-agent-room@latest` means the same commit can pass CI one week and fail the next purely from an upstream tool update, breaking CI determinism. The Action's default `version` input is bumped in lockstep with `package.json`'s version at release time. If you deliberately wish to follow the latest release, pass `version: latest`.
