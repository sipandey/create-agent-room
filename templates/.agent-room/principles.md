# LLM-Native Development Principles

A working reference for getting predictable outcomes out of an LLM coding
agent. The point is not to sound clever — it's to make outcomes predictable.

| # | Principle | Default move |
| --- | --- | --- |
| 1 | LLMs are retrieval systems | Use precise names, types, constraints, and input context |
| 2 | Iteration is required | Explore, constrain, refine, verify — don't one-shot |
| 3 | Context windows forget | Write summary checkpoints to files, not just chat |
| 4 | Explanation pressure finds weak spots | Ask it to explain, challenge, and restate the work |
| 5 | Negative knowledge is leverage | Keep an anti-patterns file; one avoided bug beats one good example |
| 6 | Tests are the spec | Write the test before the implementation |
| 7 | Specific names retrieve better | Prefer clear, specific, stable names over short or sprawling ones |
| 8 | Match process to work type | Use the lightest process that still protects quality |
| 9 | PRD and architecture co-evolve | Let architecture discoveries simplify the requirements |
| 10 | Serialize state | A checkpoint should let someone else resume without guesswork |
| 11 | Delegate with rules, not vibes | Can I define correctness right now? Yes: proceed. Missing facts: research. Unclear requirement: escalate. |
| 12 | Close the loop | Record failures and wins; feed both back into future prompts |

## Why this matters

Output quality depends on input context quality more than on "prompting
skill." Most failures trace back to one of:

- Vague or missing context (principle 1) — fix the input, not the model.
- A single-shot answer treated as final (principle 2) — iterate instead.
- A long session that silently lost an earlier decision (principle 3) —
  checkpoint to `.agent-room/decisions.md`.
- A claim made without forcing the model (or yourself) to explain it
  (principle 4) — ask "what could fail here?" before shipping.
- The same mistake repeated because nobody wrote it down (principle 5/12) —
  log it in `.agent-room/anti-patterns.md`.

## How they connect

```
[Foundation] -> [Quality] -> [Process]
      ^                           |
      |                           |
      +-------- learning ---------+

Foundation = model behavior   (1-5)
Quality    = output quality   (6-7)
Process    = safe delivery    (8-11)
Learning   = feeds back in    (12)
```

> Fill the context with the right information at the right time.
