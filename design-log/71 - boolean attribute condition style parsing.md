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
   - After: `isEnabled` → `ba(vs => vs.isEnabled)`

2. **Enum comparisons supported**:

   - `status == active` → `ba(vs => vs.status === Status.active)`

3. **Logical operators supported**:

   - `isEnabled && status == active` → `ba(vs => (vs.isEnabled) && (vs.status === Status.active))`

4. **Nested property access**:

   - `sortBy.currentSort == newest` → `ba(vs => vs.sortBy.currentSort === CurrentSort.newest)`

5. **Comparison operators supported** (`<`, `<=`, `>`, `>=`):

   - `count > 0` → `ba(vs => vs.count > 0)`
   - `page <= 1` → `ba(vs => vs.page <= 1)`
   - `current >= total` → `ba(vs => vs.current >= vs.total)`

6. **Equality with numbers**:

   - `count == 5` → `ba(vs => vs.count === 5)`
   - `count != 0` → `ba(vs => vs.count !== 0)`

7. **Field-to-field comparisons** (using dotted paths for equality):

   - `a >= b.value` → `ba(vs => vs.a >= vs.b?.value)`
   - `current == options.default` → `ba(vs => vs.current === vs.options?.default)`

8. **Boolean attributes are always dynamic if present with a value**:
   - `disabled` (bare) → static, always present
   - `disabled="condition"` → dynamic, controlled by condition
   - Omit attribute → never present

### Supported Boolean Attributes

Extended the list of recognized boolean attributes:

| Category   | Attributes                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------- |
| Form       | `disabled`, `readonly`, `required`, `autofocus`, `multiple`, `novalidate`, `formnovalidate` |
| Selection  | `selected`                                                                                  |
| Visibility | `hidden`, `open`, `inert`                                                                   |
| Media      | `autoplay`, `controls`, `loop`, `muted`, `playsinline`                                      |
| Other      | `reversed`, `ismap`, `defer`, `async`, `default`                                            |

**Note:** `checked` and `value` remain as PROPERTY type (using `dp()` with template-style `{expr}` syntax) because they reflect DOM property values, not boolean presence.

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

### Phase 5: Error Handling Improvements (DONE)

- [x] Added `getExpressionHelp()` function in `expression-compiler.ts`
- [x] Enhanced error messages with context-specific examples for each expression type
- [x] Error messages now include:
  - The expression that failed to parse
  - The underlying parse error
  - Examples of valid syntax with ✓ markers

### Phase 6: Comparison Operators (DONE)

Extended condition expressions to support comparison operators beyond just enum equality.

#### Ordering Operators (`<`, `<=`, `>`, `>=`)

- [x] Added `orderingCondition` rule in PEG.js parser
- [x] Supports comparison with numeric literals: `count > 0`, `page <= 1`
- [x] Supports comparison with any accessor: `current >= total`, `a.value < b.value`

#### Equality with Numbers

- [x] Added `equalityComparisonCondition` rule in PEG.js parser
- [x] Supports equality with numbers: `count == 5`, `count != 0`
- [x] Normalizes `==` to `===` and `!=` to `!==` in output

#### Field-to-Field Comparison

- [x] Supports comparing two fields using dotted accessors
- [x] For equality operators: right side must be dotted path to distinguish from enum values
  - `current == options.default` → field comparison
  - `status == active` → enum comparison (unchanged)
- [x] For ordering operators: any accessor allowed (no ambiguity with enums)
  - `count >= total` → works
  - `a.page <= b.page` → works

### Documentation Updated

- Added "Boolean Attributes" section to `docs/core/jay-html.md` with:
  - Syntax explanation
  - Full list of supported attributes
  - Condition expression examples (including comparison operators)
  - Static vs dynamic comparison table
  - Note about `checked`/`value` being properties, not boolean attributes
- Updated conditional rendering section with comparison examples

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

### Numeric comparison

```html
<button disabled="currentPage <= 1">Previous</button>
<button disabled="count == 0">No items</button>
<span if="count > 0">You have {count} items</span>
```

### Field-to-field comparison

```html
<button disabled="currentPage >= pagination.totalPages">Next</button>
<span if="available >= required">In stock</span>
```

### Combined conditions

```html
<button disabled="count <= 0 || isLoading">Checkout</button>
<button if="currentPage > 1 && !isLoading">Previous</button>
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

1. ✅ Unit tests pass for boolean, nested boolean, and enum comparison conditions
2. ✅ Fixture tests compile correctly
3. ✅ Expression `sortBy.currentSort == newest` works in boolean attribute context
4. ✅ Comparison operators (`<`, `<=`, `>`, `>=`) work with numbers and fields
5. ✅ Equality operators (`==`, `===`, `!=`, `!==`) work with numbers
6. ✅ Field-to-field comparisons work with dotted paths
7. ✅ Error messages provide helpful context-specific examples
8. ✅ All 140 unit tests pass, `yarn confirm` succeeds
