---
description: "Prevents creating false green tests - tests that pass by matching buggy output"
alwaysApply: true
---

# No False Green Tests

## Rule

**NEVER create a test that passes by copying the current (buggy) output as the expected output.**

This is called a "false green" and it is strictly forbidden. It locks in bugs, gives a false sense of progress, and defeats the purpose of TDD.

## What to do instead

1. **Write the CORRECT expected output first** — what the system SHOULD produce, not what it currently produces
2. **Let the test fail (red)** — this is the desired state for unimplemented features
3. **Then fix the code** to make the test pass (green)
4. **Failing tests are good** — they show exactly what needs to be fixed
5. **A test suite with many red tests is honest** — a test suite with false greens is dangerous

## Specifically

- When creating fixture-based tests (e.g., `expected.figma.json`), write the expected file to reflect the CORRECT output, even if the converter cannot produce it yet
- NEVER run the converter, copy its output to `expected.figma.json`, and call it done
- If you don't know what the correct output should be, ASK — don't guess by using the current output
- It is perfectly fine to have 0 passing tests — that's an honest starting point
