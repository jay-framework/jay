# 71 - Boolean Attribute Condition-Style Parsing

## Background

In Jay-HTML, boolean attributes like `disabled`, `hidden`, `checked` need to be conditionally applied based on view state values. Previously, boolean attributes used template-style parsing similar to dynamic attributes.

The expression `{categoryPage.sortBy.currentSort == newest}` was failing to compile because the template-style parser couldn't handle enum comparisons in boolean attribute context.

## Problem

Template-style parsing for boolean attributes:

- ❌ Doesn't support enum comparisons: `{status == active}`
- ❌ Doesn't support logical operators: `{isEnabled && status == active}`
- ❌ Only works with simple accessor: `{isEnabled}`

We need boolean attributes to support the same condition expressions as class ternaries and other conditional contexts.

## Design

Change `booleanAttribute` rule in the PEG.js parser from template-style to condition-style parsing.

### Before (template style)

```pegjs
booleanAttribute
  = template:template {
  let [renderFragment, isDynamic] = template;
  return isDynamic ?
      renderFragment.map(_ => `ba(${vars.currentVar} => ${_})`).plusImport(ba):
      renderFragment;
}
```

### After (condition style)

```pegjs
booleanAttribute
  = cond:condition {
  return cond.map(_ => `${vars.currentVar} => ${_}`)
}
```

### Key Changes

1. **No curly braces required**: Conditions are parsed directly

   - Before: `{isEnabled}` → `ba(vs => vs.isEnabled)`
   - After: `isEnabled` → `vs => vs.isEnabled`

2. **Enum comparisons supported**:

   - `status == active` → `vs => vs.status === Status.active`

3. **Logical operators supported**:

   - `isEnabled && status == active` → `vs => (vs.isEnabled) && (vs.status === Status.active)`

4. **Nested property access**:

   - `sortBy.currentSort == newest` → `vs => vs.sortBy.currentSort === CurrentSort.newest`

5. **No `ba()` import wrapper in parsed result**: The condition returns the function directly, wrapper is applied by the compiler at usage site.

## Implementation Plan

### Phase 1: Parser Update (DONE)

- [x] Update `booleanAttribute` rule in `expression-parser.pegjs`
- [x] Add `ba()` wrapper and import to parsed result

### Phase 2: Unit Test Updates (DONE)

- [x] Update `parseBooleanAttributeExpression` tests in `expression-compiler.unit.test.ts`
- [x] Add tests for boolean condition
- [x] Add tests for nested boolean (dotted path)
- [x] Add tests for enum comparison
- [x] Add tests for logical operators (&&, ||)

### Phase 3: Fixture Test Updates (DONE)

- [x] Update `compiler-jay-html/test/fixtures/basics/attributes/attributes.jay-html`
- [x] Update example files: `scrum-board/lib/task.jay-html`, `scrum-board-with-context/lib/task.jay-html`

### Phase 4: Compiler Updates (DONE)

- [x] Add empty string handling in `jay-html-compiler.ts` for empty boolean attributes like `<button disabled></button>`
- [x] Add boolean attribute handling in `jay-html-compiler-react.ts` for React target

## Implementation Results

All tests pass: `yarn confirm` succeeds with exit code 0.

## Examples

### Simple boolean condition

```html
<button disabled="{isDisabled}">
  <!-- OLD (template style) -->
  <button disabled="isDisabled"><!-- NEW (condition style) --></button>
</button>
```

### Enum comparison

```html
<option selected="currentSort == newest">Newest</option>
```

### Nested property with enum

```html
<option selected="sortBy.currentSort == newest">Newest</option>
```

### Logical operators

```html
<button disabled="!isValid || isProcessing">Submit</button>
```

## Trade-offs

### Pros

- Consistent with condition syntax in class ternaries
- Supports full condition expression language
- Simpler mental model - same syntax everywhere conditions are used

### Cons

- Breaking change for template-style boolean attributes with embedded text
- No longer supports template interpolation like `some {value} thing` (which didn't make sense for boolean attributes anyway)

## Verification Criteria

1. Unit tests pass for boolean, nested boolean, and enum comparison conditions
2. Fixture tests compile correctly
3. Expression `sortBy.currentSort == newest` works in boolean attribute context
