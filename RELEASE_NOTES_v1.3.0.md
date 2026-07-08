# create-agent-room v1.3.0

## Highlights

- **CI enforcement by default:** the `git` adapter now scaffolds `.github/workflows/agent-room-validate.yml`, which runs `create-agent-room validate` and `create-agent-room lint-sessions` on every push and pull request. Previously these commands existed but were never wired into CI automatically — session logs and guardrails schema could silently drift out of compliance. This closes a gap called out in the internal audit (AUDIT.md) between "documented enforcement" and "actual enforcement."
- No new flags required — this rides on the existing `--tools git` selection (and git auto-detection), consistent with the pre-commit guardrails hook already installed there.

## Docs

- `CAPABILITIES.md` and `README.md` updated to reflect that CI validation now ships automatically with the git adapter instead of requiring manual setup.

## Tests

- Added coverage asserting the CI workflow file is scaffolded and references both `validate` and `lint-sessions`.
