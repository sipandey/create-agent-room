# Agent Instructions — RustService

This file is the entry point for any AI coding agent working in this repository.

## Read these before doing anything non-trivial

- [`.agent-room/principles.md`](.agent-room/principles.md) — how to get reliable output from an LLM.
- [`.agent-room/workflow-classifier.md`](.agent-room/workflow-classifier.md) — process weight classification.
- [`.agent-room/anti-patterns.md`](.agent-room/anti-patterns.md) — negative knowledge log.
- [`.agent-room/decisions.md`](.agent-room/decisions.md) — architectural choices log.
- [`.agent-room/skills/`](.agent-room/skills/) — brainstorming, writing-plans, TDD, systematic-debugging.

## The default workflow

1. **Classify the work** using `.agent-room/workflow-classifier.md`.
2. **Brainstorm before building**: ask clarifying questions, propose 2-3 approaches with trade-offs.
3. **Use TDD**: write a failing test with cargo, watch it fail, implement, verify.
4. **Debug systematically**: investigate root cause before editing.
5. **Verify before claiming done**: run cargo test and check output.
6. **Close the loop**: check decisions and anti-patterns before ending turn.

## Project-specific notes

- **Language:** rust
- **Package Manager:** cargo
- **Default Branch:** main

Commands:
- Run tests: `cargo test`
- Run linting: `cargo clippy`

<!-- Add stack, conventions, and anything else an agent needs that isn't derivable. -->
