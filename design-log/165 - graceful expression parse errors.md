# DL#165 — Graceful Expression Parse Errors

## Background

When a jay-html template contains an invalid expression — unsupported operator, malformed binding, typo — the PEG parser throws an error. This error propagates up through the compiler and crashes the page with a Vite plugin error.

### Current behavior

```
[plugin:jay:runtime] Failed to parse expression [currentPath ^= '/docs/designer'].

Parse error: Expected "!=", "!==", "&&", ".", "<", "<=", "==", "===", ">", ">=", or "||" but "^" found.
```

The entire page fails to render. In dev mode this blocks the designer from seeing any output. In the AIditor workflow, this is especially problematic — the design tool may generate expressions using syntax the framework doesn't yet support, and a single bad expression takes down the whole page.

### Where errors originate

All expression parsing flows through `doParse()` in `expression-compiler.ts` (line 220):

```typescript
function doParse(expression: string, startRule: string, vars?: Variables) {
    try {
        return parse(expression, { ... });
    } catch (e) {
        throw new Error(`Failed to parse expression [${expression}].\n\nParse error: ${e.message}...`);
    }
}
```

The `throw` propagates to callers in all three compiler targets (element, hydrate, server), which don't catch it. The Vite plugin's transform hook catches the error and reports it as a plugin error, killing the page.

### Affected expression types

Every expression type passes through `doParse`:

- `parseCondition` — `if="..."` attributes
- `parseTextExpression` — `{text}` bindings
- `parseClassExpression` — `class="..."` with bindings
- `parseAttributeExpression` — dynamic attributes
- `parseBooleanAttributeExpression` — `disabled="condition"`
- `parseComponentPropExpression` — component prop bindings
- `parseAccessor` — property paths
- `parseStyleDeclarations` — inline style bindings
- `parseServerCondition` — server-side conditions
- `parseTemplateParts` — template literal parts
- `findHtmlStringBindings` — HTML string binding extraction

## Problem

1. **Page crash** — a single invalid expression kills the entire page
2. **No graceful degradation** — the designer sees a Vite error overlay instead of the page with the broken part marked
3. **AIditor incompatibility** — design tools may generate expressions the framework doesn't support yet. The page should render with the invalid parts flagged, not crash entirely.

## Design

### Convert parse errors to validation messages

Instead of throwing, `doParse` should catch parse errors and return a `RenderFragment` with validation messages. The compiler targets already handle `RenderFragment.validations` — they collect them and report them without crashing.

```typescript
function doParse(expression: string, startRule: string, vars?: Variables) {
    try {
        return parse(expression, { ... });
    } catch (e) {
        const message = `Failed to parse expression [${expression}]: ${e.message}`;
        const fallback = getFallbackForRule(startRule, expression);
        return fallback;
    }
}
```

The rendered output uses a type-appropriate fallback so the compiled code doesn't crash at runtime. The validation message is collected and reported through the normal validation pipeline.

### Fallback values by expression type

String expressions render a **visible error marker** so the designer can spot the problem in the page. Boolean expressions return `false` silently.

| Expression type        | Fallback rendered value             | Effect                       |
| ---------------------- | ----------------------------------- | ---------------------------- |
| `conditionFunc`        | `vs => false`                       | Conditional element hidden   |
| `condition`            | `false`                             | Condition evaluates to false |
| `dynamicText`          | `dt(vs => '[INVALID: expression]')` | Visible error in page        |
| `dynamicAttribute`     | `da(vs => '[INVALID: expression]')` | Visible error in attribute   |
| `classExpression`      | `''`                                | No classes added             |
| `booleanAttribute`     | `ba(vs => false)`                   | Attribute not present        |
| `dynamicComponentProp` | `vs => '[INVALID: expression]'`     | Visible error in prop value  |
| `accessor`             | Null accessor with validation error | No data, error collected     |
| `styleDeclarations`    | Empty style object                  | No inline styles             |

### What the designer sees

In dev mode, the page renders. Broken string expressions show `[INVALID: expression]` visibly in the page so the designer can spot them. Broken boolean expressions silently hide the conditional element. The browser console shows the validation details. The Vite error overlay does NOT appear — the page is usable.

The `jay-stack validate` CLI reports all expression errors as validation messages.

### No behavior change for valid expressions

This only changes error handling. Valid expressions parse and compile exactly as before.

### `parseAccessor` graceful fallback

`parseAccessor` returns an `Accessor` with validation errors for unknown fields, but throws on parse errors. The same pattern applies — return a null accessor (renders as `undefined`, carries validation messages) instead of throwing.

### Multiple root elements in body

The compiler's `ensureSingleChildElement` expects one root element in `<body>` and returns a validation error when there are multiple. This crashes the page.

Design tools (and manual editing) can easily produce multiple root elements:

```html
<body>
  <header>...</header>
  <main>...</main>
  <footer>...</footer>
</body>
```

**Auto-wrap approach:** when the body has multiple child elements, wrap them in a `<div>` with `display: contents` so it's layout-transparent:

```html
<body>
  <div style="display: contents">
    <header>...</header>
    <main>...</main>
    <footer>...</footer>
  </div>
</body>
```

`display: contents` makes the wrapper invisible to CSS layout — the children behave as if they're direct children of `<body>`. The wrapper exists only to satisfy the single-root constraint for coordinate assignment and hydration.

This is preferred over a validation error because:

- Multiple root elements are a common, natural HTML pattern
- The designer shouldn't need to know about the single-root constraint
- The `display: contents` wrapper has no visual or layout side effects

## Implementation Plan

### Phase 1: Make `doParse` return validation errors

**`compiler-jay-html/lib/expressions/expression-compiler.ts`**:

- Change `doParse` to catch errors and return `RenderFragment` with validations
- Add a `fallback` parameter or derive it from `startRule` to produce the right safe value
- For `parseAccessor`, return an `Accessor` with validations instead of throwing

### Phase 2: Auto-wrap multiple root elements

**`compiler-jay-html/lib/jay-target/jay-html-compiler.ts`**, **`jay-html-compiler-hydrate.ts`**, **`jay-html-compiler-server.ts`**:

- In `ensureSingleChildElement` (or its callers), when multiple children are found, wrap them in `<div style="display: contents">` instead of returning a validation error

### Phase 3: Verify compiler targets handle validations

**`jay-html-compiler.ts`**, **`jay-html-compiler-hydrate.ts`**, **`jay-html-compiler-server.ts`**:

- Verify that `RenderFragment.validations` from parse functions are propagated to the page-level validation list
- Most call sites already merge `.validations` — check for any that assume no validations

### Phase 4: Actionable validation messages

Validation messages must give an AI agent (or human) enough information to fix the problem. Each message should include:

- **What failed** — the expression and which attribute it was in
- **Why it failed** — the parse error (unexpected token, unknown operator)
- **How to fix** — pointer to the relevant agent-kit guide

Example:

```
[page.jay-html:42] Failed to parse condition: currentPath ^= '/docs'
  Parse error: unexpected operator "^=" — did you mean "===" or "!=="?
  See: agent-kit/designer/jay-html-template-syntax.md → Conditional Rendering
```

For expressions using unsupported syntax:

```
[page.jay-html:15] Failed to parse expression: {item.price | currency}
  Parse error: pipe operators are not supported in jay-html expressions.
  Supported syntax: {field}, {field.nested}, {condition ? classA : classB}
  See: agent-kit/designer/jay-html-template-syntax.md → Data Binding
```

### Phase 5: Tests

- Add test cases for malformed expressions: missing field, unknown operator, unclosed parenthesis
- Verify they produce validation messages instead of throwing
- Verify the fallback values don't cause runtime crashes
- Add test for multiple root elements producing a `display: contents` wrapper

### Phase 6: Slow render

**`expression-parser.pegjs`** slow render rules:

- `parseConditionForSlowRender` also calls `doParse` — verify it gets the same graceful handling

### Phase 7: Documentation

**Agent-kit `designer/jay-html-template-syntax.md`**:

- Add a "Common Errors" section listing typical parse errors and their fixes
- Document the supported expression syntax clearly so agents know what's valid

**Top-level `docs/core/jay-html.md`**:

- Document the graceful error handling behavior (validation messages, visible markers)

**Compiler `compiler-jay-html/docs/jay-html-docs.md`**:

- Document the fallback value strategy per expression type

### Phase 8: Validate

- Run `yarn confirm` from monorepo root — all tests, type checks, and formatting must pass

## Trade-offs

| Choice                          | Pro                                               | Con                                                  |
| ------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Validation errors (proposed)    | Page renders, designer can work, errors collected | Bad expression silently produces wrong output        |
| Throw (current)                 | Fails fast, error is obvious                      | Page crashes, blocks designer workflow               |
| Render visible error marker     | Designer spots issues easily                      | Clutters the design, may confuse non-technical users |
| Auto-wrap multiple roots        | Transparent, matches HTML convention              | Adds a DOM node (but `display: contents` hides it)   |
| Reject multiple roots (current) | Enforces clean structure                          | Crashes on common HTML pattern, blocks designer      |

## Implementation Results

### What was implemented

All phases from the plan, no deviations from the design.

**`expression-compiler.ts`:**

- `getFallbackForRule` function returns type-appropriate fallback per `startRule` (string expressions → `[INVALID: expr]`, booleans → `false`, etc.)
- `doParse` catches parse errors and returns fallback with validation messages + console warning
- `throwOnError` parameter for structural parsing (`parseImportNames`, `parseEnumValues`) that must still throw
- `parseAccessor` returns null `Accessor` with `JayUnknown` type on parse error
- `getExpressionHelp` updated with `^=` and string comparison examples
- All validation messages include `See: agent-kit/designer/jay-html-template-syntax.md` pointer

**`jay-html-helpers.ts`:**

- `ensureSingleChildElement` auto-wraps multiple body children in `<div style="display: contents">`
- Zero elements still returns validation error

**`jay-html-compiler-server.ts`:**

- Fixed validation propagation for `parseServerCondition` at conditional and headless instance sites

**Documentation:**

- Agent-kit `jay-html-template-syntax.md`: "Common Errors" table
- `docs/core/jay-html.md`: Error Handling section
- `compiler-jay-html/docs/jay-html-docs.md`: Fallback strategy table and multi-root wrapping

### Tests

6 new tests in `expression-compiler.unit.test.ts`:

- Malformed condition → `vs => false` with validation
- Malformed text expression → `[INVALID: ...]` with validation
- Malformed class expression → empty string with validation
- Malformed accessor → `JayUnknown` accessor with validation
- Malformed boolean attribute → `ba(vs => false)` with validation
- Validation message includes guide reference

2 existing tests updated from `toThrow` to check validations (text expression, react text expression).

All 692 compiler tests pass. `yarn confirm` passes clean.
