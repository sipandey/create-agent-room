# Guardrails Bypass Log — create-agent-room

Append-only, machine-written record of every commit that used
`GUARDRAILS_BYPASS=1` (or `SKIP_GUARDRAILS_CHECK=1`) to override a blocked
commit. Written automatically by `.agent-room/hooks/guardrails-check.js` -
do not edit by hand; edits here don't reflect what actually happened.

Review this periodically (or in code review) so bypasses stay visible
instead of scrolling off a terminal and being forgotten.

<!-- Entries below this line, newest first, appended automatically. -->
