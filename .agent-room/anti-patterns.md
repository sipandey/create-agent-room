# Anti-Patterns Log — create-agent-room

Negative knowledge: things that have already gone wrong here, so nobody
(human or agent) repeats them. One avoided bug is worth more than one
polished example — keep entries short and concrete.

Append a new entry every time:
- a bug slips through and you find the root cause,
- an approach seemed reasonable but turned out wrong,
- a fix gets reverted because it only patched a symptom.

## Format

```
### YYYY-MM-DD — short title

**What happened:** one or two sentences.
**Root cause:** the actual cause, not the symptom.
**Avoid:** the concrete rule that would have prevented it.
```

<!-- Entries go below this line, newest first. -->

### 2026-07-09 — guardrails-check.js could self-weaken via a single commit

**What happened:** `guardrails-check.js` reads `guardrails.json` live at
hook-run time and evaluates `protectedPaths` against the version of the
file *being committed*, not the version at HEAD. A single commit that both
edited `guardrails.json` and removed its own path from `protectedPaths` in
that same edit passed the check — the hook checked the newly-weakened
rules against themselves and found nothing wrong, since by the time it ran
the self-protecting entry was already gone from the file it read.
**Root cause:** the check trusted the staged content of the very file that
defines what's protected, with no comparison against the prior, presumably
still-trusted state (HEAD) of that same file.
**Avoid:** when a config file's own rules govern whether edits to that
config file are allowed, don't evaluate a staged edit purely against
itself — diff it against the last-committed version and flag edits that
remove protection the previous version had, regardless of what the new
version now claims. `guardrails-check.js` does this for `guardrails.json`
via `git show HEAD:.agent-room/guardrails.json`, falling back to "no prior
protection" (not a crash) when there's no HEAD yet or HEAD's copy doesn't
parse.

### 2026-07-09 — shell injection via string-interpolated execSync in git hooks

**What happened:** `templates/adapters/git-hooks/guardrails-check.js` and
`lib/sync.js` built shell commands with template literals
(`` execSync(`git show :${file}`) ``, `` execSync(`git status --porcelain
"${relativePath}"`) ``) where the interpolated value came from a filename —
either a staged file in the working tree or a file copied in from a remote
skill pack (`--skill-packs <git-url>`). A filename containing shell
metacharacters (e.g. `` $(touch pwned) ``) executed arbitrary commands when
the hook ran. Confirmed exploitable with a working PoC in both files.
**Root cause:** `execSync` runs its argument through a shell, so any
interpolated value is not just a filename to it — it's shell syntax. This
is a well-known Node.js footgun; `lib/init.js` already avoided it elsewhere
by using `execFileSync(cmd, [args])`, but the two git-hook files didn't
follow the same pattern.
**Avoid:** never build an `execSync`/`exec` string via template literal or
concatenation with any value that isn't a hardcoded constant. Use
`execFileSync`/`spawnSync` with an argument array instead — it passes
arguments directly to the process, bypassing the shell entirely.

### 2026-07-09 — session-utils.js cached cwd at module load, silently polluting the real repo

**What happened:** `lib/session-utils.js` computed `SESSION_DIR =
path.join(process.cwd(), '.agent-room', 'sessions')` once as a module-level
constant. Two tests in `test/session-utils.test.js` monkey-patched
`process.cwd` to point at a tmp dir, expecting `save()` to write there —
but since the module was already `require`d (and `SESSION_DIR` already
computed) before the monkey-patch ran, every `npm test` run wrote real
session-log fixtures into this repo's actual `.agent-room/sessions/`
directory. Four such files were already committed into history
(`6e946f6`, `ce4ebc3`) before this was caught.
**Root cause:** computing a cwd-derived path once at require-time instead
of on each call. Module caching means that constant is frozen for the
lifetime of the process, so any later `process.cwd()` change (test
monkey-patch, or a real caller that `chdir`s) has no effect on it.
**Avoid:** never memoize `process.cwd()` (or anything derived from it) at
module scope if the module can be `require`d before the real working
directory is settled. Wrap it in a function and call that function fresh
each time the path is needed.

### 2026-07-09 — guardrails-check.js self-triggers on its own guardrails.json

**What happened:** discovered while dogfooding the scaffold on this repo:
committing the freshly-generated `.agent-room/guardrails.json` tripped the
hook's own `forbiddenActions` scan, because that file's job is to list the
literal phrases the scanner treats as violations — so the file matches its
own rules by definition. The scanner does a blind substring/regex match
over all staged file content with no awareness that one of the staged
files is the guardrails config defining those patterns in the first
place.
**Root cause:** the forbidden-pattern scan treated every staged file
identically, including the guardrails config/docs that legitimately quote
the patterns being defined.
**Avoid:** when a scanner's rule set is itself stored in a file the scanner
also scans, exempt that file (and its prose counterpart) from the content
check explicitly — don't rely on the patterns "just not matching" their
own definitions.

### 2026-07-09 — package-lock.json left stale across version bumps

**What happened:** `package-lock.json` still said `"version": "0.1.0"` and
`"node": ">=14"` while `package.json` had already moved on to `1.3.0` /
`>=18`. Caught during an audit, not before a release — nothing in CI or
the release steps checks that the two files agree.
**Root cause:** past version bumps edited `package.json` directly without
following up with `npm install` (or `npm version`, which does both
atomically) to regenerate the lockfile. `npm install` is a no-op when
dependencies haven't changed, so the drift is silent — nothing errors,
the lockfile is just wrong until someone happens to diff it.
**Avoid:** always run `npm install` immediately after editing `version` in
`package.json`, even if no dependency changed — it's now the second step
in the documented release process (see "Release process" in
`AGENTS.md`/`CLAUDE.md`). Consider also adding a CI check that fails if
`package-lock.json`'s version doesn't match `package.json`'s.

### 2026-07-09 — removed committed test-pollution fixtures from .agent-room/sessions/

**What happened:** four files (`2026-07-08-17-20-test-json.json`,
`2026-07-08-17-20-test-save.md`, `2026-07-08-17-36-test-json.json`,
`2026-07-08-17-36-test-save.md`) were sitting tracked in
`.agent-room/sessions/` — leftover artifacts from the `session-utils.js`
stale-cwd bug (see the earlier entry in this file), written straight into
this repo's real session log directory by `npm test` and accidentally
committed in `6e946f6`/`ce4ebc3` before anyone noticed. Removed now that
the root cause is fixed and they're confirmed to be test fixtures, not
real session logs.
**Root cause:** same as the stale-cwd entry above — these are its
downstream evidence, not a separate bug.
**Avoid:** nothing new here; covered by the fix already made. Noting it
so a future `git log` reader isn't confused about why sessions/ briefly
had content dated before this repo had ever been scaffolded with
`create-agent-room` on itself.
