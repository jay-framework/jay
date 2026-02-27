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

**Answer:** Part of `validate` — always runs. The agent gets errors + coverage in one command.

### Q2: How do we detect which tags are "used" in a jay-html file?

**Answer:** HTML tree traversal. Walk the parsed DOM tree returned by `parseJayFile()` (a `node-html-parser` HTMLElement), tracking the current scope (key + forEach nesting). Extract tag references from:
- `{key.tagName}` text expressions
- `if="key.tagName"` condition attributes
- `ref="key.tagName"` ref attributes
- `forEach="key.tagName"` forEach attributes
- Attribute values with `{expression}` bindings

Source text search was considered but rejected — it can't distinguish same-named child tags under different forEach scopes (e.g., `name` under `options` vs `name` under `variants`).

### Q3: How should we handle sub-contract tags inside `forEach` scopes?

**Answer:** Track forEach scopes. When entering `forEach="key.items"`, record that we're now inside `items` scope. Child references like `name` map to contract path `items.name`. The contract tells us which tags are repeated sub-contracts, so we know when a forEach introduces a new scope.

### Q4: What should the output look like?

```
Tag Coverage:
  src/pages/products/[slug]/page.jay-html
    productPage (product-page): 8/12 tags used
      Unused: ribbons, breadcrumbs, sku, additionalInfo
    cartIndicator (cart-indicator): 3/3 tags used
```

When there are required unused tags:
```
      ⚠ Required unused: productName, price
```

### Q5: Should we report on `jay:instance` tags (no key) or only key-based headless components?

**Answer:** Both. Key-based use `key.tagPath` references. Instance tags (`<jay:contract-name>`) use bare tag names inside their inline template. We can detect these by walking `<jay:*>` elements and checking child content against the contract.

### Q6: What counts as a "required" tag?

**Answer:** Only explicit `required: true` on contract tags.

## Design

### Tree traversal approach

Walk the parsed `body: HTMLElement` tree. Maintain a scope stack that tracks the current variable context:

1. Start with root scope — tag references are prefixed with headless keys (e.g., `productPage.name`)
2. When entering `forEach="key.items"`, push a new scope where bare names resolve to `items.childTag`
3. When entering `<jay:contract-name>`, push a scope for that contract's tags (bare names)
4. When entering `<with-data accessor="path">`, push scope for nested sub-contract

At each element, extract tag references from:
- `forEach` attribute value — marks the repeated tag as used
- `if` attribute value — parse the condition expression for tag references
- `ref` attribute value — marks the interactive tag as used
- Text content `{expr}` — parse for tag references
- Any attribute value containing `{expr}` — parse for tag references

### Collecting used tags

For each headless import (with or without key), maintain a `Set<string>` of used tag paths. After traversal, compare against the flattened contract tag list.

### Flattening contract tags

Recursively flatten `Contract.tags` into a list of paths:
- `{ tag: "name", type: data }` → path `"name"`
- `{ tag: "options", type: sub-contract, tags: [{ tag: "_id" }, { tag: "name" }] }` → paths `"options"`, `"options._id"`, `"options.name"`

### Output

Add `coverage: FileCoverage[]` to `ValidationResult`. Print after errors/warnings.

## Implementation Plan

### Phase 1: Tag coverage analysis function

1. Add `analyzeTagCoverage(jayHtml: JayHtmlSourceFile)` function in `validate.ts`
2. Implement contract tag flattening: `flattenContractTags(tags: ContractTag[], prefix?: string): TagInfo[]`
3. Implement DOM tree walker that collects used tag paths per headless import
4. Return `FileCoverage` with used/unused/required-unused per contract

### Phase 2: Integration with validate

1. Add `FileCoverage` and related types to `ValidationResult`
2. Call `analyzeTagCoverage()` for each successfully parsed jay-html file
3. Update `printJayValidationResult()` to print coverage report
4. Include coverage in `--json` output

## Verification Criteria

1. Running `jay-stack validate` on the whisky-store shows tag coverage per page per contract
2. Unused tags are listed by name
3. Required unused tags are highlighted with ⚠
4. Existing validation behavior (errors/warnings) is unchanged
5. Output is clear enough for an AI agent to act on