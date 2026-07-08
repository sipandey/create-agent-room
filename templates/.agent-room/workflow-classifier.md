# Workflow Classifier

Not all work deserves the same process. Classify before loading process —
over-process wastes time, under-process builds the wrong thing.

## Quick classifier

| Work Type | Use it for | PRD | Architecture | TDD | Time |
| --- | --- | --- | --- | --- | --- |
| Bug | Something broke | None | None | Fix + regression test | Hours |
| Enhancement | Small change on existing rails | Light | Light | Yes | Days |
| Feature | New bounded capability | Yes | Yes | Full | Weeks |
| Product | New system or unclear scope | Deep | Extensive | Full + spikes | Months |

## Decision tree

```
Did something break?
  yes -> Bug Flow
  no
    Does similar code/pattern already exist in this repo?
      yes -> Enhancement Flow
      no
        Is the scope clear and bounded?
          yes -> Feature Flow
          no  -> Product Flow
```

Stop as soon as one answer is clear. Ask in this order:
1. Did something break?
2. Am I extending an existing pattern?
3. Can I define "done" right now?
4. If not, am I still discovering the problem?

## Bug Flow (hours)
Reproduce -> Diagnose (root cause, not symptom) -> Write the regression test
first -> Smallest fix that passes -> Run the relevant checks -> Note why it
slipped through (append to `.agent-room/anti-patterns.md`).

Do not load: PRD files, architecture exploration, spikes.

## Enhancement Flow (days)
Confirm it fits existing rails -> short PRD (a paragraph is fine) -> find the
closest prior example in the codebase -> TDD -> quick review and ship.

Rule of thumb: if you can describe it as "do X like we already do Y," it's an
enhancement. If you can't find a Y, it's a feature.

## Feature Flow (weeks)
Write the first design from the user journey -> let architecture discoveries
tighten/simplify the design (don't treat draft 1 as sacred) -> TDD against the
final shape -> review -> observe after shipping.

Use the `brainstorming` -> `writing-plans` -> TDD chain in `.agent-room/skills/`
for this.

## Product Flow (months)
Define the problem before the feature list -> write the key hypotheses ->
spike the risky assumptions -> build the smallest useful MVP -> learn from
reality and loop (iterate or pivot).

## Time budget as a signal

| Work Type | Design | Build | Review | Total |
| --- | --- | --- | --- | --- |
| Bug | 0 | ~2h | 30m | hours |
| Enhancement | 30m | ~4h | 1h | 1-2 days |
| Feature | 4-8h | 16h+ | 4h | 1-2 weeks |
| Product | 8h+ | 40h+ | 8h+ | 4+ weeks |

If real work keeps blowing past the expected budget, the classification —
not the estimate — is probably wrong. Re-classify rather than push through.
