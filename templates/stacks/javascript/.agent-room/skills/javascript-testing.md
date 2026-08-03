---
name: javascript-testing
description: "JavaScript testing: Node test runner, Jest/Vitest patterns, mocking, and TDD workflows"
---

# JavaScript Testing Best Practices

## Test discovery and structure

- Colocate tests as `*.test.js` / `*.spec.js` or under `test/` — match the repo convention
- One behavior per test; descriptive `test('...')` names
- Keep fixtures small; prefer factories over large static blobs

## Node built-in test runner

```javascript
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('myModule', () => {
  test('returns expected value', () => {
    assert.equal(myFn(), expected);
  });
});
```

Run: `node --test` (or the project's `npm test` script).

## Mocking and isolation

- Prefer dependency injection over deep module mocking when possible
- With Jest/Vitest: `vi.mock()` / `jest.mock()` at module boundaries, not internals
- Reset mocks between tests (`afterEach`)

## TDD workflow

1. Write a failing test for the smallest behavior
2. Implement the minimum code to pass
3. Refactor with tests green
4. Never commit production code without a failing test first (unless explicitly waived)

## Common pitfalls

- ❌ Testing implementation details (private functions, call order) instead of behavior
- ❌ Flaky timers — use fake timers (`vi.useFakeTimers`) when testing delays
- ❌ Shared mutable state between tests
- ✅ Run `npm test` (or `node --test`) before claiming done
