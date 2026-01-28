# Unified Condition Parsing for Code Generation and Evaluation

## Summary

Unify condition expression parsing so the same parser handles both:

1. **Code generation** - JavaScript code strings for the runtime (existing)
2. **Compile-time evaluation** - Evaluating conditions against data during slow rendering (new)

Currently these are handled separately, leading to potential inconsistency and duplicated parsing logic.

---

## Background

The Jay compiler has a PEG-based expression parser (`expression-parser.pegjs`) that parses condition expressions like:

- Simple property access: `imageUrl`, `product.name`
- Negation: `!imageUrl`, `!product.isAvailable`
- Comparisons: `count <= 0`, `status == pending`
- Logical operators: `condition1 && condition2`

The parser currently outputs **JavaScript code strings** via `RenderFragment` for code generation:

```pegjs
booleanCondition
  = not:bang? head:accessor {
    return not?
      head.render().map(_ => `!${_}`):
      head.render()
  }
```

For slow rendering (Design Log #75), we need to **evaluate conditions at compile time** against slow-phase data. We added a separate `analyzeSimpleCondition()` function with regex-based parsing:

```typescript
export function analyzeSimpleCondition(expr: string): AnalyzedCondition | null {
  const trimmed = expr.trim();
  if (trimmed.startsWith('!')) {
    const inner = trimmed.slice(1).trim();
    if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(inner)) {
      return { path: inner, isNegated: true };
    }
    return null;
  }
  if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(trimmed)) {
    return { path: trimmed, isNegated: false };
  }
  return null;
}
```

---

## Problem Statement

Having two separate parsing implementations causes:

1. **Code duplication** - Parsing logic exists in both PEG grammar and TypeScript regex
2. **Inconsistency risk** - New expression features must be added to both places
3. **Limited evaluation** - The regex approach only handles simple cases (`path` or `!path`)

As we add more expression features (comparisons, logical operators), maintaining two parsers becomes increasingly problematic.

---

## Questions & Answers

### Q1: What condition types need evaluation support?

**A:** All condition types should be supported:

- Simple property access: `isOnSale`
- Negation: `!imageUrl`
- Comparisons: `count > 0`, `price <= 100`, `status == active`
- Logical operators: `inStock && !discontinued`, `a || b`
- Parentheses: `(a && b) || c`

### Q2: Can we modify the existing parser to return both?

**A:** Yes, but a better approach is to modify the parser to accept slow-phase data and perform partial evaluation inline (see Option D).

### Q3: What about complex expressions with mixed phases?

**A:** Replace slow properties with their values, then simplify the expression. For example:

```
Expression: "!imageUrl && price > 0"
Slow data: { imageUrl: "" }  (price is fast-phase)

Step 1: Replace imageUrl with "" → "!'' && price > 0"
Step 2: Evaluate !"" → true
Step 3: Simplify: "true && price > 0" → "price > 0"
Step 4: Output: Runtime expression for "price > 0"
```

The result is a simplified runtime-only expression with slow values already resolved.

---

## Design Options

### Option A: Add AST Output to the PEG Parser

Modify the grammar to return an intermediate AST that can be:

1. Rendered to JavaScript code (for code generation)
2. Evaluated against data (for slow rendering)

```typescript
// New types
type ConditionNode =
  | { type: 'property'; path: string }
  | { type: 'negation'; operand: ConditionNode }
  | { type: 'comparison'; left: ConditionNode; op: string; right: ConditionNode | number }
  | { type: 'logical'; op: '&&' | '||'; left: ConditionNode; right: ConditionNode };

interface ParsedCondition {
  ast: ConditionNode; // For evaluation
  codeFragment: RenderFragment; // For code generation
}

// In expression-compiler.ts
export function evaluateCondition(ast: ConditionNode, data: Record<string, unknown>): boolean {
  switch (ast.type) {
    case 'property':
      return !!getValueByPath(data, ast.path);
    case 'negation':
      return !evaluateCondition(ast.operand, data);
    case 'comparison':
    // ... handle comparisons
    case 'logical':
    // ... handle && and ||
  }
}
```

**Pros:**

- Single source of truth for parsing
- Full feature support for evaluation
- AST can be used for other analysis (e.g., extracting property paths)

**Cons:**

- Significant refactor to PEG grammar
- Changes return types, affects all consumers
- More complex implementation

### Option B: Add New Start Rule for Evaluation

Add a new PEG start rule like `evaluableCondition` that returns an evaluable structure, separate from code generation rules:

```pegjs
// New rule for evaluation (returns AST-like structure)
evaluableCondition
  = evaluableLogicalOr

evaluableLogicalOr
  = head:evaluableLogicalAnd tail:(_ "||" _ evaluableLogicalAnd)* {
    if (tail.length === 0) return head;
    return { type: 'logical', op: '||', operands: [head, ...tail.map(t => t[3])] };
  }

evaluableLogicalAnd
  = head:evaluablePrimary tail:(_ "&&" _ evaluablePrimary)* {
    if (tail.length === 0) return head;
    return { type: 'logical', op: '&&', operands: [head, ...tail.map(t => t[3])] };
  }

evaluablePrimary
  = "!" _ cond:evaluablePrimary { return { type: 'negation', operand: cond }; }
  / acc:accessor { return { type: 'property', path: acc.terms.join('.') }; }
```

Then in `expression-compiler.ts`:

```typescript
export function parseEvaluableCondition(expr: string): ConditionNode | null {
  try {
    return doParse(expr, 'evaluableCondition');
  } catch {
    return null;
  }
}
```

**Pros:**

- Less invasive - existing code unchanged
- Reuses accessor parsing from grammar
- Clear separation of concerns

**Cons:**

- Two parallel rule sets in grammar
- Must keep in sync with code generation rules

### Option C: Return Both from Existing Rules

Modify existing grammar actions to return both code and evaluable data:

```pegjs
booleanCondition
  = not:bang? head:accessor {
    const ast = not
      ? { type: 'negation', operand: { type: 'property', path: head.terms.join('.') } }
      : { type: 'property', path: head.terms.join('.') };
    const code = not
      ? head.render().map(_ => `!${_}`)
      : head.render();
    return { ast, code };
  }
```

**Pros:**

- Always in sync - single parsing, dual output
- No separate rule sets

**Cons:**

- Changes return type of all condition rules
- Breaking change requiring updates to all consumers
- More complex grammar actions

### Option D: Partial Evaluation with Slow Data Inlining (Recommended)

Modify the parser to accept slow-phase data as an additional parameter. During parsing:

1. Replace slow property references with their actual values
2. Evaluate operators that can be resolved (comparisons, negation, logical)
3. Simplify the expression (e.g., `true && X` → `X`)
4. If reduced to constant `true`/`false`, eliminate from runtime entirely

```typescript
// New parsing function signature
export function parseConditionWithSlowData(
  expr: string,
  vars: Variables,
  slowData: Record<string, unknown>,
  phaseMap: Map<string, PhaseInfo>,
): ConditionResult;

interface ConditionResult {
  // If fully resolved to a constant
  resolved?: boolean;
  // If partially or not resolved, the runtime code
  runtimeCode?: RenderFragment;
}
```

**Example 1: Fully slow expression**

```
Input:  if="!imageUrl"
Slow data: { imageUrl: "" }

Parsing:
  1. imageUrl is slow-phase, value is ""
  2. Replace: !""
  3. Evaluate: !falsy → true

Result: { resolved: true }
Action: Keep element, remove if attribute
```

**Example 2: Mixed-phase expression**

```
Input:  if="!imageUrl && price > 0"
Slow data: { imageUrl: "http://..." }  (price is fast)

Parsing:
  1. imageUrl is slow-phase, value is "http://..."
  2. Replace: !"http://..." && price > 0
  3. Evaluate !truthy → false
  4. Simplify: false && X → false

Result: { resolved: false }
Action: Remove element entirely
```

**Example 3: Mixed-phase, slow part is true**

```
Input:  if="inStock && price > 0"
Slow data: { inStock: true }  (price is fast)

Parsing:
  1. inStock is slow-phase, value is true
  2. Replace: true && price > 0
  3. Simplify: true && X → X

Result: { runtimeCode: RenderFragment("vs => vs.price > 0") }
Action: Keep element, update if attribute to simplified expression
```

**Example 4: Enum comparison**

```
Input:  if="status == active"
Slow data: { status: "active" }

Parsing:
  1. status is slow-phase, value is "active"
  2. Replace: "active" == Status.active
  3. Evaluate: true

Result: { resolved: true }
Action: Keep element, remove if attribute
```

**Implementation approach:**

The grammar actions would check if a property path is slow-phase:

- If slow: substitute the value and continue evaluation
- If fast/interactive: keep as runtime code fragment

Logical operators would simplify:

- `true && X` → `X`
- `false && X` → `false`
- `true || X` → `true`
- `false || X` → `X`
- `!true` → `false`
- `!false` → `true`

**Pros:**

- Single parsing pass handles both code gen and evaluation
- Supports ALL expression types (comparisons, logical, etc.)
- Produces minimal runtime expressions
- Can fully eliminate conditions when possible
- Natural integration with existing parser

**Cons:**

- More complex grammar actions
- Need to pass slow data and phase map through parser
- Expression simplification logic needed

---

## Recommendation

**Option D (Partial Evaluation with Slow Data Inlining)** is the most powerful approach:

1. **Complete solution** - Handles all expression types, not just simple properties
2. **Optimal output** - Produces minimal runtime expressions
3. **Single pass** - No separate evaluation phase needed
4. **Natural fit** - Extends existing parser rather than adding parallel code

---

## Implementation Plan

### Phase 1: Define Result Types

Add types to `expression-compiler.ts`:

```typescript
export interface SlowRenderContext {
  slowData: Record<string, unknown>;
  phaseMap: Map<string, PhaseInfo>;
  contextPath: string; // For nested paths like "products.0"
}

export type ConditionResult =
  | { type: 'resolved'; value: boolean }
  | { type: 'runtime'; code: RenderFragment };
```

### Phase 2: Add Slow-Aware Parsing Function

Add new function that wraps the parser with slow context:

```typescript
export function parseConditionForSlowRender(
  expr: string,
  vars: Variables,
  slowContext: SlowRenderContext,
): ConditionResult;
```

### Phase 3: Modify Grammar for Value Substitution

Update grammar actions to:

1. Check if accessor path is slow-phase via `slowContext.phaseMap`
2. If slow, get value from `slowContext.slowData` and return as literal
3. If fast/interactive, return runtime code fragment as before

Add simplification for logical operators:

- `true && X` → `X`
- `false && X` → `false`
- `true || X` → `true`
- `false || X` → `X`

### Phase 4: Update Slow Render Transform

Replace current condition handling in `slow-render-transform.ts`:

```typescript
// Old approach
const analyzedCondition = analyzeSimpleCondition(ifAttr);
if (analyzedCondition) {
  /* simple evaluation */
}

// New approach
const result = parseConditionForSlowRender(ifAttr, vars, slowContext);
if (result.type === 'resolved') {
  if (result.value) {
    element.removeAttribute('if'); // Condition is true, keep element
  } else {
    return []; // Condition is false, remove element
  }
} else {
  // Update if attribute with simplified runtime expression
  element.setAttribute('if', renderToIfAttribute(result.code));
}
```

### Phase 5: Add Comprehensive Tests

1. **Fully slow conditions**: Simple property, negation, comparison, enum
2. **Mixed-phase conditions**: Slow values substituted, runtime code for fast
3. **Logical simplification**: `true && X` → `X`, `false || X` → `X`, etc.
4. **Nested properties**: `product.category.isActive`
5. **Edge cases**: Empty strings, null, undefined, zero

---

## Examples

### Example 1: Fully Slow - Simple Negation

```typescript
const expr = '!imageUrl';
const slowData = { imageUrl: '' };
const phaseMap = new Map([['imageUrl', { phase: 'slow' }]]);

const result = parseConditionForSlowRender(expr, vars, { slowData, phaseMap, contextPath: '' });
// Returns: { type: 'resolved', value: true }

// Action: Keep element, remove if attribute
```

### Example 2: Fully Slow - Comparison

```typescript
const expr = 'productCount > 0';
const slowData = { productCount: 5 };
const phaseMap = new Map([['productCount', { phase: 'slow' }]]);

const result = parseConditionForSlowRender(expr, vars, { slowData, phaseMap, contextPath: '' });
// Returns: { type: 'resolved', value: true }
```

### Example 3: Mixed Phase - Slow True, Keep Runtime

```typescript
const expr = 'inStock && price > 0';
const slowData = { inStock: true };
const phaseMap = new Map([
  ['inStock', { phase: 'slow' }],
  ['price', { phase: 'fast' }],
]);

const result = parseConditionForSlowRender(expr, vars, { slowData, phaseMap, contextPath: '' });
// Simplification: true && (price > 0) → (price > 0)
// Returns: { type: 'runtime', code: RenderFragment("vs => vs.price > 0") }

// Action: Update if attribute to "price > 0"
```

### Example 4: Mixed Phase - Slow False, Short Circuit

```typescript
const expr = 'inStock && price > 0';
const slowData = { inStock: false };
const phaseMap = new Map([
  ['inStock', { phase: 'slow' }],
  ['price', { phase: 'fast' }],
]);

const result = parseConditionForSlowRender(expr, vars, { slowData, phaseMap, contextPath: '' });
// Simplification: false && X → false
// Returns: { type: 'resolved', value: false }

// Action: Remove element entirely (don't even evaluate price at runtime)
```

### Example 5: Nested Property in forEach Context

```typescript
// Inside forEach="categories", evaluating a child element
const expr = '!imageUrl';
const slowData = { imageUrl: 'http://example.com/img.jpg' }; // Current item's data
const phaseMap = new Map([['categories.imageUrl', { phase: 'slow' }]]);
const contextPath = 'categories'; // We're inside the categories array

const result = parseConditionForSlowRender(expr, vars, { slowData, phaseMap, contextPath });
// Returns: { type: 'resolved', value: false }

// Action: Remove element (image exists, so placeholder not needed)
```

### Example 6: Logical OR with Mixed Phases

```typescript
const expr = 'isPromoted || hasDiscount';
const slowData = { isPromoted: true };
const phaseMap = new Map([
  ['isPromoted', { phase: 'slow' }],
  ['hasDiscount', { phase: 'fast' }],
]);

const result = parseConditionForSlowRender(expr, vars, { slowData, phaseMap, contextPath: '' });
// Simplification: true || X → true
// Returns: { type: 'resolved', value: true }

// Action: Keep element, remove if attribute (no runtime check needed!)
```

---

## Trade-offs

### Advantages

1. **Single parsing implementation** - No separate regex or evaluation code
2. **Complete expression support** - All operators work: `!`, `&&`, `||`, `==`, `<`, `>`, etc.
3. **Optimal runtime output** - Eliminates conditions entirely when possible
4. **Short-circuit optimization** - `false && expensiveCheck` doesn't generate runtime code for `expensiveCheck`
5. **Consistent behavior** - Same parser for all use cases, impossible to drift

### Disadvantages

1. **More complex grammar actions** - Need to handle value substitution and simplification
2. **Additional parser parameters** - Must pass slow data and phase map through
3. **Grammar changes** - Existing grammar needs modification (not just new rules)

---

## Related Design Logs

- **#71 - Boolean Attribute Condition Style Parsing**: Condition syntax for boolean attributes
- **#75 - Slow Rendering Jay-HTML to Jay-HTML**: Slow phase pre-rendering

---

## Status

**Implemented** - Option D (Partial Evaluation with Slow Data Inlining)

---

## Implementation Results

### Summary

Implemented Option D by adding new rules to the PEG grammar (`expression-parser.pegjs`) that perform partial evaluation during parsing. The grammar now supports a `slowCondition` start rule that:

1. Accepts `slowContext` via parser options
2. Substitutes slow-phase values during parsing
3. Simplifies expressions using logical short-circuit rules
4. Returns either resolved values or minimal runtime code

### Files Modified

1. **`lib/expressions/expression-parser.pegjs`**

   - Added helper functions in grammar header: `isSlowPhase`, `getSlowValue`, `isTruthy`, `combineAnd`, `combineOr`, `applyNot`, `compareValues`, `applyComparison`
   - Added new grammar rules: `slowCondition`, `slowLogicalOr`, `slowLogicalAnd`, `slowComparison`, `slowUnary`, `slowPrimary`, `slowNumericLiteral`, `slowBooleanLiteral`, `slowPropertyAccess`
   - Added `ComparisonOperator` rule

2. **`lib/expressions/expression-compiler.ts`**

   - Added `SlowRenderContext`, `ConditionResult`, `PartialValue` types
   - Added `parseConditionForSlowRender()` that calls the PEG parser with `slowCondition` start rule
   - Removed custom tokenizer/parser (now handled by PEG grammar)

3. **`lib/slow-render/slow-render-transform.ts`**

   - Replaced `analyzeSimpleCondition()` usage with `parseConditionForSlowRender()`
   - Now supports all condition types (logical operators, comparisons)

4. **`package.json`**
   - Added `slowCondition` to allowed start rules in `build:pegjs` script

### Test Results

All tests pass: **472 tests** (468 passed, 4 skipped)

New tests added:

- 34 unit tests for `parseConditionForSlowRender` covering:
  - Fully slow conditions (simple, negated, nested, comparisons, logical operators)
  - Mixed phase conditions (simplification rules)
  - Fully runtime conditions
  - Edge cases (zero, null, undefined, boolean literals, context paths)
  - Unknown properties not in phase map (headless component fix)
- 1 integration fixture test (`conditional-complex`) covering:
  - Slow AND/OR that resolve
  - Slow comparisons
  - Mixed phase simplification
  - Short-circuit optimization

### No Deviations from Design

The implementation follows Option D as designed - using the PEG parser with slow context for partial evaluation.

### Supported Expressions

- Simple property access: `isActive`, `product.name`
- Negation: `!imageUrl`, `!!value`
- Comparisons: `count > 0`, `price <= 100`, `status == 5`, `count != 0`
- Logical AND: `inStock && hasDiscount`
- Logical OR: `isPromoted || hasDiscount`
- Parentheses: `(a && b) || c`
- Boolean literals: `true`, `false`
- Numeric literals: `0`, `123`, `-5`

### Simplification Rules Applied

- `true && X` → `X`
- `false && X` → `false`
- `true || X` → `true`
- `false || X` → `X`
- `X && true` → `X`
- `X && false` → `false`
- `X || true` → `true`
- `X || false` → `X`
- `!true` → `false`
- `!false` → `true`

### Bug Fix: Unknown Properties Must Not Be Evaluated

**Problem:** Properties not in the phase map (e.g., from headless components like `productSearch.hasResults`) were being evaluated as slow by default. This caused conditions like `if="!productSearch.hasResults"` to be incorrectly evaluated during slow rendering.

**Root Cause:** The `isSlowPhase()` function returned `true` when a property was not found in the phase map:

```javascript
return !info || info.phase === 'slow'; // WRONG: defaults to slow if not found
```

**Fix:** Changed to only treat properties as slow if they are EXPLICITLY marked as slow in the phase map:

```javascript
return info && info.phase === 'slow'; // CORRECT: unknown = not slow
```

This ensures that:

- Properties from headless components (not in page's phase map) are NOT evaluated
- Only properties explicitly defined in the contract with `phase: slow` are evaluated
- Properties with unknown phase are preserved as runtime conditions

**Files Fixed:**

- `lib/expressions/expression-parser.pegjs` - `isSlowPhase()` helper
- `lib/slow-render/slow-render-transform.ts` - `isSlowPhase()` function

**Tests Added:**

- "should NOT evaluate properties not in phase map (e.g., headless component properties)"
- "should NOT evaluate unknown properties even with data present"

### Headless Contract Integration (2026-01-27)

**Problem:** Even with the `isSlowPhase` fix above, text bindings from headless components (like `{categoryName}` from `productSearch`) still weren't being resolved. The properties were correctly NOT evaluated when missing from the phase map, but they should have been IN the phase map.

**Root Cause:** The phase map was only built from the page's main contract, not from headless component contracts.

**Solution:** Extended the slow-render system to include headless contracts in the phase map:

1. Added `HeadlessContractInfo` type with `key` and `contract`
2. Extended `SlowRenderInput` to accept `headlessContracts?: HeadlessContractInfo[]`
3. Updated `buildPhaseMap` to include headless contract properties with key prefix (e.g., `productSearch.filters.categoryFilter.categories.categoryName`)

**Key Insight:** The `parseJayFile` function (in `jay-html-parser.ts`) already loads headless contracts via `parseHeadlessImports`. Rather than duplicating this logic, we:

1. Extended `LoadedPageParts` (in `load-page-parts.ts`) to expose the contracts
2. Had the dev-server pass them through to `slowRenderTransform`

This ensures consistent contract loading and avoids code duplication.

**Files Modified:**

- `lib/slow-render/slow-render-transform.ts` - Added headless contract support
- `lib/index.ts` - Export `HeadlessContractInfo`
- `stack-server-runtime/lib/load-page-parts.ts` - Include headless contracts in result
- `dev-server/lib/dev-server.ts` - Pass headless contracts to transform

### Enum Comparison Support in Slow Render (2026-01-28)

**Problem:** Enum comparisons like `productPage.productType == PHYSICAL` were being rendered to invalid expressions like `0 === PHYSICAL` during slow rendering. The left side was correctly resolved to its numeric enum value (0), but the right side (the enum identifier `PHYSICAL`) was not being resolved.

**Root Cause:** The slow condition parser didn't understand enum types. When parsing `property == IDENTIFIER`:

1. The left side property was resolved to its slow value (e.g., `0`)
2. The right side identifier `PHYSICAL` was treated as a property access
3. Since `PHYSICAL` wasn't in the phase map, it became runtime code `vs?.PHYSICAL`
4. The comparison became `0 === vs?.PHYSICAL` which is invalid

**Solution:** Extended the slow render system to understand enum types:

1. **Extended `PhaseInfo`** to include `enumValues?: string[]` - the list of enum value names for enum-typed properties

2. **Updated `buildPhaseMap`** to extract enum values from `JayEnumType` when processing contract tags:

   ```typescript
   if (tag.dataType && isEnumType(tag.dataType)) {
     enumValues = tag.dataType.values;
   }
   ```

3. **Added helper functions to PEG grammar:**

   - `getPhaseInfo(path)` - Get full phase info including enum values
   - `resolveEnumValue(enumValues, identifier)` - Resolve enum identifier to its index

4. **Modified `slowPropertyAccess`** to track the property path in the return value so it can be used for enum lookup

5. **Modified `slowComparison`** to recognize enum comparisons:
   - When left side is resolved (slow value) AND has a property path
   - AND right side is a simple identifier (code that's just an identifier)
   - Check if the left property has enum values
   - If so, resolve the right identifier to its enum index
   - Then perform the comparison with both sides resolved

**Key Design Decision:** Only resolve enum values when the LEFT side is a resolved slow value. For fast-phase enum comparisons, preserve the original expression (which gets converted to `property === EnumType.VALUE` by the regular compiler).

**Files Modified:**

- `lib/slow-render/slow-render-transform.ts` - Extended `PhaseInfo`, updated `buildPhaseMap`
- `lib/expressions/expression-compiler.ts` - Extended `SlowRenderContext.phaseMap` type
- `lib/expressions/expression-parser.pegjs` - Added enum handling in `slowComparison`

**Tests Added:**

- Fixture: `conditional-enum-comparison` - Tests slow enum comparisons that resolve to true/false, and fast enum comparisons that are preserved

**Example:**

```
Input: if="productPage.productType == PHYSICAL"
Slow data: { productType: 0 }  // 0 = PHYSICAL, 1 = DIGITAL
Enum values: ["PHYSICAL", "DIGITAL"]

Parsing:
  1. Left side `productType` is slow phase → resolve to 0
  2. Right side `PHYSICAL` is a simple identifier
  3. Left has enum values → resolve `PHYSICAL` to index 0
  4. Compare: 0 === 0 → true

Result: { type: 'resolved', value: true }
Action: Keep element, remove if attribute
```
