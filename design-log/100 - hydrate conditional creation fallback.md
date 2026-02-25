# Design Log 100 — Hydrate Conditional Creation Fallback

## Background

DL93 defined three levels of hydration complexity:
- **Level 1**: Static HTML with dynamic text/attribute points
- **Level 2**: Conditionals that are true at SSR — adopt existing DOM, toggle on/off
- **Level 3**: Conditionals that are false at SSR — element doesn't exist in DOM, needs creation code

DL93/94 implemented Levels 1 and 2. Level 3 was left as future work. DL99 fixed coordinate alignment bugs but exposed Level 3 as a real problem on the whisky-store products page.

## Problem

When a conditional is false at SSR time, the server doesn't render the element. The hydrate target generates:

```typescript
hydrateConditional(vs => vs.productSearch?.isSearching, () => adoptElement("3", {}, []))
```

`adoptElement("3", ...)` fails (coordinate "3" doesn't exist in DOM), returns noop. `hydrateConditional` sees `!adopted.dom`, returns noop. The element can **never appear**, even when the condition becomes true at interactive time.

Example: the loading overlay `<div class="loading-overlay" if="productSearch.isSearching">` never shows because `isSearching` is false on initial page load.

This affects ALL conditionals that are false at SSR — not just this one.

## Design

### Approach: creation fallback in `hydrateConditional`

Add an optional `createFallback` parameter to `hydrateConditional`. When adoption fails and a create callback exists, set up lazy creation similar to the standard `conditional()` / `mkUpdateCondition` pattern.

```typescript
export function hydrateConditional<ViewState>(
    condition: (vs: ViewState) => boolean,
    adoptExisting: () => BaseJayElement<ViewState>,
    createFallback?: () => BaseJayElement<ViewState>,  // NEW
): BaseJayElement<ViewState>
```

### DOM insertion challenge

When the condition was false at SSR, the element doesn't exist in the DOM. When it toggles true, where should the created element be inserted?

The standard element target uses Kindergarten groups — the parent `dynamicElement` manages child positions via offset-based insertion. But `adoptElement` (used in hydration) doesn't set up Kindergarten.

**Solution: comment anchor from adoptElement**

`adoptElement` already knows its DOM element (the parent container). After evaluating children, it can insert comment anchors for any children that have `dom: undefined` (false-at-SSR conditionals). These anchors mark the insertion positions.

The challenge: `adoptElement` evaluates children before resolving its own element (JS argument evaluation). So children don't know the parent during construction.

**Workaround**: `hydrateConditional` returns `dom: undefined` with a `setAnchor(parent)` callback. After `adoptElement` resolves its element, it scans children for missing DOM and inserts anchors in document order.

### Alternative considered: use `dynamicElement` for parents with conditionals

Change the hydrate compiler to emit `de()` instead of `adoptElement()` for parents that contain conditional children. `de()` handles Kindergarten and `Conditional` descriptors natively.

Rejected because:
- `de()` creates DOM from scratch — it doesn't adopt existing server-rendered elements
- Would need a new hybrid function that adopts AND manages Kindergarten
- More complex than the anchor approach

### Compiler changes

The hydrate compiler generates BOTH adopt AND create code for conditionals (same pattern as `hydrateForEach` which already generates both):

```typescript
hydrateConditional(
    vs => vs.productSearch?.isSearching,
    // Adopt callback (for true-at-SSR):
    () => adoptElement("3", {}, []),
    // Create callback (for false-at-SSR):
    () => e('div', {class: 'loading-overlay'}, [
        e('div', {class: 'loading-spinner'}, [])
    ])
)
```

The create callback uses the standard element target (`e()`, `dt()`, `da()` etc.), exactly like `hydrateForEach`'s create callback.

## Implementation Plan

### Phase 1: Runtime — `hydrateConditional` with createFallback

In `hydrateConditional`, when `!adopted.dom` and `createFallback` exists:
- Create a comment anchor node
- Return a `BaseJayElement` with:
  - `dom: anchor` (comment node — zero-width, doesn't affect layout)
  - `mount`: no-op (anchor is already positioned by parent)
  - `update`: on first true → call `createFallback()`, insert before anchor, track as visible. On subsequent toggles, remove/re-insert before anchor (same as true-at-SSR path).

The anchor gets its position from being returned as `dom`. The parent `adoptElement` ignores child `dom` values, but the anchor is in the correct logical position because it was created at construction time.

**Anchor insertion**: After `adoptElement` resolves its element and processes children, it needs to insert anchors for children with comment-node DOMs. Add a post-processing step in `adoptElement` that appends comment-node children to the parent element in order.

### Phase 2: Hydrate compiler — generate create callback

In `renderHydrateElement` for conditionals, also generate the creation code:
- Use `renderHtmlElementContent` / manual `e()` construction (same approach as `hydrateForEach`'s create callback)
- Pass as the third argument to `hydrateConditional`
- Import `element as e`, `dynamicText as dt`, etc. when needed

### Phase 3: Update `adoptElement` — anchor insertion

After `adoptElement` resolves its DOM element and collects children, scan children for comment-node DOMs and insert them into the parent element. This places anchors at the correct document position for conditional insertion/removal.

### Phase 4: Test and verify

- Add runtime test for false-at-SSR conditional
- Update compiler test fixtures if needed
- Full test suite
- Whisky store: verify loading overlay appears on search

## Verification Criteria

1. Loading overlay appears when `isSearching` becomes true
2. Conditionals that toggle from false→true→false work correctly
3. Existing true-at-SSR conditionals still work (no regression)
4. All tests pass
