# Contributing

Thanks for considering a contribution. This project is intentionally
small — read [ROADMAP.md](ROADMAP.md) before writing code, especially its
"Explicitly out of scope" section. A PR adding a dependency, a template
engine, or a new distribution artifact (Docker image, VS Code extension,
etc.) will likely be rejected on scope grounds, not quality — check first
and save yourself the round trip.

## Philosophy

Zero runtime dependencies, ~2,300 lines of implementation, readable
end-to-end in one sitting. Every change is judged against **does this add
real value without adding real weight**, not "what would a generic
enterprise CLI have." If your change makes the tool do more but harder to
trust, it's probably not a fit — see ROADMAP.md's "Explicitly out of
scope" list for concrete examples (commander.js, EJS/Handlebars, a plugin
system) and why each lost.

## Local setup

```bash
git clone https://github.com/sipandey/create-agent-room.git
cd create-agent-room
npm install
```

Run the CLI from source with `node bin/cli.js` instead of `npx
create-agent-room` (same convention the README uses):

```bash
node bin/cli.js init /tmp/test-project --yes --tools claude,git --git
node bin/cli.js validate /tmp/test-project
```

## Tests and lint

```bash
npm test       # node --test test/*.test.js
npm run lint   # eslint .
```

Both must pass clean before a PR is reviewable. Add or update a test for
any behavior change — this codebase has no meaningfully untested surface
by design; keep it that way.

## Release process

Maintainer-only — contributors don't need this to open a PR. If you're
curious (or bumping a version), see "Release process" in
[AGENTS.md](AGENTS.md#release-process). The full checklist lives there,
not duplicated here, to avoid two copies drifting apart.

## Adding a skill pack

Skill packs are optional, opt-in markdown files under
`templates/skill-packs/<pack-name>/*.md`. Each file needs YAML
frontmatter with `name` and `description` (see
`templates/skill-packs/testing/integration-testing.md` for the shape) —
`validate` lints this and fails a room missing either. Wire the new pack
name into the `validPacks` array in `installSkillPacks()`
(`lib/init.js`) and the `--skill-packs` help text in `bin/cli.js`.

## Adding a stack template

Stack-specific guidance lives under `templates/stacks/<language>/` — see
`python`/`typescript`/`react` for the shape (an `AGENTS.md.tmpl` plus any
stack-specific `.agent-room/` overrides). Open an issue before proposing
a new language rather than sending the PR directly: per ROADMAP.md, this
list grows from real usage, not proactively.

## Opening a PR

- One logical change per PR — don't bundle an unrelated refactor with a
  fix.
- Update `CHANGELOG.md` under `[Unreleased]` for anything user-visible.
- If you find a real bug while working on something else, mention it in
  the PR description instead of silently fixing it in the same diff —
  makes review easier.

Not sure something's in scope, or found a security issue instead? Open an
issue before writing code, or see [SECURITY.md](SECURITY.md) for
anything sensitive.
