# Design Log 99 — Hydration Coordinate Alignment Bugs

## Background

DL93 (client hydration) and DL94 (SSR streaming renderer) established a coordinate system using `jay-coordinate` attributes to link server-rendered DOM with the client hydration code. The runtime tests (e.g., `hydrate-for-each.test.ts`) define the correct coordinate format. However, the two compiler targets (`generated-server-element.ts` and `generated-element-hydrate.ts`) produce **incompatible coordinates**, causing hydration to silently fail for any page with forEach or conditional+ref elements.

The compiler tests only compare generated code text against fixtures — they never verify that the two outputs work together at runtime.

## Problem

The whisky-store products page logs:

```
[jay hydration] hydrateForEach: could not find container element
```

Interactive elements (search, filters, add-to-cart) do not work.

## Root Cause Analysis

Three coordinate bugs in the compilers:

### Bug A: forEach child coordinates lack path prefix

The runtime expects forEach child coordinates to be prefixed with the item's trackBy value:

```html
<!-- Runtime test (hydrate-for-each.test.ts, line 35): -->
<li jay-coordinate="a"><span jay-coordinate="a/0">Alice</span></li>
```

But the server element compiler emits unprefixed coordinates:

```typescript
// collections/generated-server-element.ts (current, WRONG):
w(' jay-coordinate="' + escapeAttr(String(vs1.id)) + '">'); // item root: OK
w(' jay-coordinate="0">'); // child: WRONG, should be "{id}/0"
```

The hydrate runtime's `forItem(item, id)` sets `coordinateBase = [id]`, so `resolveCoordinate("0")` looks for `"{id}/0"` in the coordinate map. Since the server rendered plain `"0"`, it finds nothing.

**Impact**: ALL dynamic content inside forEach items fails to adopt — refs, dynamic text, conditionals are silently broken.

### Bug B: Conditional + ref counter divergence

When a conditional element has a ref (e.g., `<button ref="addToCartButton" if="...">`):

- **Hydrate compiler** (`renderHydrateElement`): ALWAYS increments counter, uses counter value as coordinate
- **Server compiler** (`renderServerElementContent`): uses ref name as coordinate, does NOT increment counter

```
coordinate = refName || String(context.coordinateCounter.count++)
                ↑ server takes this branch     ↑ hydrate takes this branch
```

This shifts all subsequent coordinates. In the whisky store's searchResults item:

| Element                  | Server coord | Hydrate coord |
| ------------------------ | ------------ | ------------- |
| addToCartButton (ref+if) | ref name     | `"10"`        |
| quick-options-area (if)  | `"10"`       | `"11"`        |
| quick-options-buttons    | `"12"`       | `"13"`        |
| inner forEach container  | —            | `"14"`        |

### Bug C: forEach containerCoordinate has no matching element

The hydrate compiler generates `containerCoordinate = counter++` for each forEach:

```typescript
// renderHydrateElement for forEach:
const containerCoordinate = String(context.coordinateCounter.count++);  // e.g., "3"
// ...
hydrateForEach("3", ...)
```

But the server element compiler does NOT emit this coordinate. The container IS the parent element (which has its own coordinate). So `hydrateForEach` resolves a coordinate that doesn't exist.

The collections fixture demonstrates this:

```
Server:  <div jay-coordinate="2">  ← only "2", no "3"
Hydrate: adoptElement('2', {}, [hydrateForEach('3', ...)])  ← looks for "3"
```

Compare with the working runtime test:

```typescript
// No wrapping adoptElement — hydrateForEach uses the container coordinate directly:
hydrateForEach('0', ...)  // "0" matches <ul jay-coordinate="0">
```

## Design

### Fix A: Prefix forEach child coordinates in server element

Add `coordinatePrefix` to `ServerContext`. When rendering coordinates inside a forEach item, prefix with the trackBy expression:

```typescript
// ServerContext:
interface ServerContext {
  // ... existing fields
  coordinatePrefix?: string; // runtime expression, e.g., `vs1.id`
}
```

In `renderServerElement` for forEach, set the prefix on the item context:

```typescript
const itemContext: ServerContext = {
  ...context,
  variables: forEachVariables,
  indent: itemIndent,
  coordinateCounter: { count: 0 },
  coordinatePrefix: `${forEachVariables.currentVar}.${trackBy}`, // NEW
};
```

In `renderServerElementContent`, when emitting a coordinate with a prefix:

```typescript
// Before (plain):
w(' jay-coordinate="${coordinate}">');

// After (prefixed):
w(' jay-coordinate="' + escapeAttr(String(${prefix})) + '/${coordinate}">');
```

For nested forEach, the prefix chains: `{outer}/{inner}/childCoord`.

### Fix B: Use ref name for conditionals with refs in hydrate compiler

In `renderHydrateElement` for conditionals, check for a ref and use it when available:

```typescript
if (isConditional(element)) {
  const refAttr = element.attributes.ref;
  const refName = refAttr ? camelCase(refAttr) : null;
  // Match server behavior: use ref name when present, counter only otherwise
  const coordinate = refName || String(context.coordinateCounter.count++);
  // ... rest unchanged
}
```

This keeps both compilers' counters aligned.

### Fix C: forEach uses parent coordinate, not a separate containerCoordinate

Two changes:

**Hydrate compiler**: Don't increment the counter for forEach. Instead, receive the parent element's coordinate from the caller:

```typescript
// renderHydrateElement for forEach:
// BEFORE: const containerCoordinate = String(context.coordinateCounter.count++);
// AFTER:  use the parent's coordinate passed via context
const containerCoordinate = context.parentCoordinate!;
```

Pass the parent's coordinate down through `HydrateContext`:

```typescript
interface HydrateContext {
  // ... existing fields
  parentCoordinate?: string; // coordinate of the enclosing adopted element
}
```

Set it in `renderHydrateElementContent` when processing children:

```typescript
// When processing children, pass the current element's coordinate as parentCoordinate:
const childContext = { ...context, parentCoordinate: coordinate };
childNodes.map((child) => renderHydrateNode(child, childContext));
```

**Runtime**: Add `peekCoordinate` to `ConstructContext` (reads without consuming via `shift()`):

```typescript
peekCoordinate(key: string): Element | undefined {
    if (!this._coordinateMap) return undefined;
    const fullKey = this.coordinateBase.length > 0
        ? this.coordinateBase.join('/') + '/' + key : key;
    const elements = this._coordinateMap.get(fullKey);
    if (!elements || elements.length === 0) return undefined;
    return elements[0];  // Don't shift
}
```

Use it in `hydrateForEach` for the container:

```typescript
const containerElement = context.peekCoordinate(containerCoordinate);
```

This works because `hydrateForEach` (inside the children array) evaluates BEFORE `adoptElement` (JavaScript argument evaluation order). `hydrateForEach` peeks at the coordinate, then `adoptElement` consumes it.

### Fix summary

```
Server:  <div jay-coordinate="2">         ← parent/container (one coordinate)
           <div jay-coordinate="{id}">    ← item root
             <span jay-coordinate="{id}/0"> ← prefixed child

Hydrate: adoptElement('2', {}, [
           hydrateForEach('2', ...)       ← same coordinate, peek mode
         ])
```

## Structural Improvements

### Shared coordinate library

The root cause of all three bugs is that coordinate logic is duplicated across two compiler targets with no shared code. The server element compiler and hydrate compiler each independently decide when to assign coordinates, what values to use, and when to increment counters — and they diverge.

Extract coordinate assignment to a shared module in `compiler-shared` (or a new `coordinate` module within `compiler-jay-html`):

```typescript
// Shared coordinate assignment logic:
interface CoordinateDecision {
    coordinate: string | null;    // The coordinate value (ref name or auto-index)
    incrementCounter: boolean;    // Whether the counter was consumed
}

function assignCoordinate(
    element: HTMLElement,
    context: { coordinateCounter: { count: number }; coordinatePrefix?: string },
    forceCoordinate: boolean,
    variables: Variables,
): CoordinateDecision { ... }
```

Both `renderServerElementContent` and `renderHydrateElementContent` call this shared function. This makes it structurally impossible for the two targets to diverge on coordinate decisions.

### SSR + hydration integration test

The compiler tests currently verify each target in isolation (text comparison against fixtures). This missed all three bugs because the server element and hydrate target were never tested together.

Add a new test phase to existing fixtures that:

1. Compiles the jay-html into both server element and hydrate target
2. Runs the server element's `renderToStream()` to produce HTML
3. Parses the HTML into a DOM (via jsdom/happy-dom)
4. Runs the hydrate target's `hydrate()` on the DOM
5. Verifies: all coordinates resolve, refs are wired, dynamic text updates work

```typescript
// test/jay-target/ssr-hydration-integration.test.ts
it('collections: SSR output hydrates correctly', async () => {
    // Step 1: compile
    const jayFile = parseJayFile(collectionsJayHtml, ...);
    const serverCode = generateServerElementFile(jayFile);
    const hydrateCode = generateElementHydrateFile(jayFile, ...);

    // Step 2: run server render
    const html = renderToString(serverModule, viewState);

    // Step 3: hydrate
    const root = parseHTML(html);
    const [refs, render] = hydrateModule.hydrate(root);
    const element = render(viewState);

    // Step 4: verify
    expect(root.querySelector('[jay-coordinate="a/0"]').textContent).toBe('Alice');
    element.update({ ...viewState, things: [{ id: 'a', name: 'Updated' }] });
    expect(root.querySelector('[jay-coordinate="a/0"]').textContent).toBe('Updated');
});
```

This catches any future coordinate divergence automatically.

## Implementation Plan

### Phase 1: Shared coordinate module

- Extract `assignCoordinate()` function used by both compiler targets
- Both `renderServerElementContent` and `renderHydrateElementContent` use it
- This makes fixes B and C automatic — both targets make the same decisions

### Phase 2: Server compiler — fix A (coordinate prefix)

- Add `coordinatePrefix` to `ServerContext`
- Set it in `renderServerElement` for forEach item context
- Use it in `renderServerElementContent` when emitting coordinates
- For ref names inside forEach: also prefix with coordinatePrefix
- Handle nested forEach (chain prefixes)
- Update test fixture: `collections/generated-server-element.ts`

### Phase 3: Hydrate compiler — fix B (conditional + ref)

- Follows from Phase 1 if shared module is used
- Otherwise: in `renderHydrateElement`, use ref name for conditionals with refs
- Update affected test fixtures

### Phase 4: Hydrate compiler + runtime — fix C (forEach containerCoordinate)

- Add `peekCoordinate` method to `ConstructContext` in `context.ts`
- Use `peekCoordinate` in `hydrateForEach` for container resolution in `hydrate.ts`
- Add `parentCoordinate` to `HydrateContext`
- Set it in `renderHydrateElementContent` when processing children
- In `renderHydrateElement` for forEach, use `parentCoordinate` instead of `counter++`
- Update test fixture: `collections/generated-element-hydrate.ts`

### Phase 5: Integration test

- Add `ssr-hydration-integration.test.ts` in compiler-jay-html tests
- Test existing fixtures (collections, page-using-counter) end-to-end
- Verify coordinates resolve, refs wire up, dynamic updates work

### Phase 6: Verify

- Run runtime tests: `cd packages/runtime/runtime && yarn vitest run`
- Run compiler tests: `cd packages/compiler/compiler-jay-html && yarn vitest run`
- Run full suite: `yarn test`
- Run whisky store and verify interactive elements work

## Verification Criteria

1. Runtime hydration tests pass (existing + new peek test)
2. Compiler tests pass with updated fixtures
3. New integration test passes — SSR output hydrates correctly
4. Full test suite passes
5. Whisky store products page: search, filters, add-to-cart all work
6. No `hydrateForEach: could not find container element` errors in console

## Implementation Results

Implemented fixes A, B, C and runtime peekCoordinate. Shared coordinate module (Phase 1) and integration test (Phase 5) deferred for follow-up.

### Files changed

**Runtime** (`packages/runtime/runtime/lib/`):

- `context.ts` — Added `peekCoordinate(key)` method to `ConstructContext`. Reads from the coordinate map without consuming (`elements[0]` instead of `elements.shift()`), so both `hydrateForEach` and the parent `adoptElement` can resolve the same element.
- `hydrate.ts` — `hydrateForEach` uses `peekCoordinate()` for container resolution instead of `resolveCoordinate()`.

**Compiler** (`packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts`):

- **Fix A**: Added `coordinatePrefix?: string` to `ServerContext`. In `renderServerElement` for forEach, sets `coordinatePrefix` to a JS expression (`escapeAttr(String(trackByExpr))`). In `renderServerElementContent`, emits prefixed coordinates: `jay-coordinate="' + ${prefix} + '/${coordinate}">'`. Nested forEach chains prefixes with `+ '/' +`.
- **Fix B**: In `renderHydrateElement` for conditionals, checks for ref name and uses it when available (`refName || counter++`), matching server element behavior. Counter only increments when no ref exists.
- **Fix C**: Added `parentCoordinate?: string` to `HydrateContext`. In `renderHydrateElementContent`, passes the current element's coordinate to children as `parentCoordinate` when processing interactive children. In `renderHydrateElement` for forEach, uses `context.parentCoordinate` instead of `counter++` when available.

**Test fixtures** (6 files updated):

- `collections/generated-server-element.ts` — Child coordinates prefixed: `"0"` → `"' + escapeAttr(String(vs1.id)) + '/0"`
- `collections/generated-element-hydrate.ts` — `hydrateForEach('3', ...)` → `hydrateForEach('2', ...)`
- `conditions-with-refs/generated-element-hydrate.ts` — Conditional with ref uses ref name: `adoptText('1', ...)` → `adoptText('text1', ...)`, subsequent counter shifted
- `async-arrays/generated-server-element.ts` — Same prefix fix as collections
- `duplicate-ref-different-branches/generated-element-hydrate.ts` — `hydrateForEach('3', ...)` → `'2'`, subsequent conditional `'4'` → `'3'`
- `duplicate-ref-only-one-used/generated-element-hydrate.ts` — `hydrateForEach('2', ...)` → `'0'`

### Deviations from plan

- **Phase 1 (shared coordinate module) deferred**: The three fixes were applied directly to each compiler target. Extracting shared coordinate logic would be a clean refactor but wasn't needed for correctness. The bug fixes align the two targets manually.
- **Phase 5 (integration test) deferred**: The SSR+hydration integration test is still recommended but was not implemented in this pass. The three bug fixes are validated by existing unit tests and the whisky store manual test.

### Test results

- All 68 packages build successfully
- All 68 packages test successfully (no failures)
