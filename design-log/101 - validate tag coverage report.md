# Validate Tag Coverage Report

**Date:** February 27, 2026
**Related:** Design Log #73 (jay-stack validate command), #38 (Contract File), #85 (agent kit)

## Background

The `jay-stack validate` command validates `.jay-html` and `.jay-contract` files for parse and compile errors. AI agents run this command after generating pages to verify correctness. However, validation currently only checks for errors — it doesn't tell the agent whether it used the contract's data effectively.

An agent generating a product page might successfully compile a page that only uses 3 of 12 available contract tags, missing important data like price, images, or stock status. The agent has no feedback that it left data on the table.

## Problem

After generating a jay-html page, an agent needs a sanity check:

1. Which contract tags did I use?
2. Which tags did I miss?
3. Are any **required** tags missing?

This feedback lets the agent decide whether to iterate on the page or move on.

## Questions and Answers

### Q1: Should this be a separate command or part of `validate`?

**Options:**1
A) Part of `validate` — always runs with validation
B) Separate `jay-stack coverage` command
C) Flag on validate — `jay-stack validate --coverage`

### Q2: How do we detect which tags are "used" in a jay-html file?

The jay-html references contract tags through several patterns, all prefixed with the headless key:
- `{key.tagName}` — data binding
- `if="key.tagName"` — conditional
- `ref="key.tagName"` — interactive ref
- `forEach="key.tagName"` — loop
- `key.parent.child` — nested sub-contract access

**Options:**
A) **Source text search** — search the raw jay-html source for `key.tagPath` substrings. Simple, fast, slightly imprecise (could have false positives from comments/strings).
B) **AST analysis** — walk the parsed jay-html AST and extract all variable references from expressions, conditions, refs, forEach bindings. More precise but more complex.
C) **Compiler instrumentation** — hook into the code generation phase to track which tags are accessed during compilation. Most precise but tightly coupled.

### Q3: How should we handle sub-contract tags inside `forEach` scopes?

Inside `<div forEach="key.items">`, child tags are referenced without the parent prefix (e.g., just `name` instead of `key.items.name`).

**Options:**
A) Search for both `key.parent.child` and bare `child` name
B) Only count the parent repeated tag as "used" — don't recurse into forEach children
C) Track forEach scopes and adjust search accordingly

### Q4: What should the output look like?

### Q5: Should we report on `jay:instance` tags (no key) or only key-based headless components?

Instance-only headless components (`<jay:product-card>`) don't have a key, so their tags are accessed differently (inside the inline template). Should coverage include these?

### Q6: What counts as a "required" tag?

Contracts have an optional `required: true` field on tags. Should we also consider interactive tags as implicitly required (since they're the user's interaction points)?

## Design

*To be filled after Q&A*

## Implementation Plan

*To be filled after design*

## Verification Criteria

1. Running `jay-stack validate` on the whisky-store shows tag coverage per page per contract
2. Unused tags are listed by name
3. Required unused tags are highlighted as warnings
4. Existing validation behavior (errors/warnings) is unchanged
5. Output is clear enough for an AI agent to act on