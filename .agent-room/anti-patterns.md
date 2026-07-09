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
