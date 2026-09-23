# Guardrails Bypass Log — create-agent-room

Append-only, machine-written record of every commit that used
`GUARDRAILS_BYPASS=1` (or `SKIP_GUARDRAILS_CHECK=1`) to override a blocked
commit. Written automatically by `.agent-room/hooks/guardrails-check.js` -
do not edit by hand; edits here don't reflect what actually happened.

Review this periodically (or in code review) so bypasses stay visible
instead of scrolling off a terminal and being forgotten.

<!-- Entries below this line, newest first, appended automatically. -->
- 2026-07-14T08:23:12.810Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Change scope exceeds guidance: 555 lines changed (limit 500)
- 2026-07-14T08:43:05.767Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .agent-room/guardrails.json; Protected path violation: .github/workflows/agent-room-validate.yml; Protected path violation: .github/workflows/ci.yml; Forbidden pattern found in CHANGELOG.md: AWS access key ID
- 2026-07-14T09:23:56.667Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .github/workflows/agent-room-validate.yml
- 2026-07-29T11:22:19.474Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .agent-room/hooks/close-the-loop-check.js; Change scope exceeds guidance: 1458 lines changed (limit 500)
- 2026-07-30T05:38:20.811Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .agent-room/hooks/close-the-loop-check.js; Protected path violation: .agent-room/hooks/closing-the-loop-evidence.js; Change scope exceeds guidance: 747 lines changed (limit 500)
- 2026-07-30T05:52:11.963Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .agent-room/hooks/closing-the-loop-evidence.js
- 2026-07-30T06:01:06.936Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .github/workflows/agent-room-validate.yml
- 2026-07-30T07:36:11.863Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .github/workflows/ci.yml; Forbidden pattern found in scripts/demo.sh: AWS access key ID; Change scope exceeds guidance: 47 files changed (limit 20); Change scope exceeds guidance: 1064 lines changed (limit 500)
- 2026-07-30T07:54:45.097Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .github/workflows/agent-room-validate.yml
- 2026-08-03T05:26:43.460Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .github/workflows/agent-room-validate.yml
- 2026-09-21T12:13:37.158Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .agent-room/hooks/close-the-loop-check.js; Change scope exceeds guidance: 557 lines changed (limit 500)
- 2026-09-21T12:38:45.217Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .agent-room/hooks/guardrails-check.js; Forbidden pattern found in test/guardrails-check.test.js: AWS access key ID; Forbidden pattern found in test/guardrails-check.test.js: Private key file contents; Change scope exceeds guidance: 658 lines changed (limit 500)
- 2026-09-21T12:50:16.788Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | bypassed: Protected path violation: .agent-room/hooks/close-the-loop-check.js; Protected path violation: .agent-room/hooks/guardrails-check.js; Forbidden pattern found in test/guardrails-check.test.js: AWS access key ID; Forbidden pattern found in test/guardrails-check.test.js: Private key file contents; Change scope exceeds guidance: 679 lines changed (limit 500)
- 2026-09-21T13:31:14.366Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | reason: Dogfooding governance presets into create-agent-room hooks and adding test cases | bypassed: Protected path violation: .agent-room/hooks/close-the-loop-check.js; Protected path violation: .agent-room/hooks/closing-the-loop-evidence.js; Protected path violation: .agent-room/hooks/guardrails-check.js; Forbidden pattern found in test/guardrails-check.test.js: AWS access key ID; Forbidden pattern found in test/guardrails-check.test.js: Private key file contents; Change scope exceeds guidance: 986 lines changed (limit 500)
- 2026-09-22T14:50:59.944Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | reason: feat: unified multi-agent sync and copilot adapter implementation with test suite expansion | bypassed: Change scope exceeds guidance: 537 lines changed (limit 500)
- 2026-09-23T03:12:51.717Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | reason: feat: session telemetry and governance metrics exporter (Story 3.1) with comprehensive tests and documentation | bypassed: Change scope exceeds guidance: 906 lines changed (limit 500)
- 2026-09-23T03:24:09.468Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | reason: feat: PR attestation and verification evidence generator (Story 3.2) with tests and documentation | bypassed: Change scope exceeds guidance: 505 lines changed (limit 500)
- 2026-09-23T04:02:59.558Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | reason: feat: add custom adopter compliance eval suites (Story 3.3) | bypassed: Change scope exceeds guidance: 584 lines changed (limit 500)
- 2026-09-23T04:11:17.425Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | reason: docs: overhaul README for easy onboarding with scenarios and quickstart | bypassed: Change scope exceeds guidance: 693 lines changed (limit 500)
- 2026-09-23T04:15:42.380Z | author: Siddharth Pandey <siddharth.pandey06@gmail.com> | reason: chore(release): version 2.4.0 | bypassed: Protected path violation: .github/workflows/agent-room-validate.yml
