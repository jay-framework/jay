# Design Log #115 — slowForEachItem Adopt Element Wrapping

## Background

`slowForEachItem` returns a `BaseJayElement` which has a single `dom` reference. The runtime assumes the adopt callback returns one element:

```typescript
slowForEachItem<ViewState, Item>(
    accessor: (vs: ViewState) => Item[],
    index: number,
    trackBy: string,
    adopt: () => BaseJayElement<Item>,  // single element
): BaseJayElement<ViewState>
```

When a slow forEach item has a single dynamic child, this works — the callback returns one element (an `adoptElement`, `adoptDynamicElement`, `childCompHydrate`, etc.). But when a slow forEach item contains **multiple children needing adoption**, the current hydrate compiler breaks.

### Related

- DL#106 Bug H — nested slowForEach coordinate stripping (fixed)
- DL#99 Bug F — nested slowForEach coordinate concatenation (fixed)
- Test fixture 10a — nested slow forEach with interactive content (currently failing)

## Problem

Template:

```html
<div class="category" forEach="categories" trackBy="_id">
  <h2>{name}</h2>
  <div class="item" forEach="items" trackBy="_id">
    <span class="label">{label}</span>
    <span class="count">{count}</span>
    <!-- fast+interactive -->
  </div>
</div>
```

After slow rendering, each category has multiple inner slow forEach items. The hydrate compiler generates:

```typescript
slowForEachItem(
    (vs) => vs.categories, 0, 'c1',
    () =>                                   // arrow function returns ONLY i1
        slowForEachItem(
            (vs1) => vs1.items, 0, 'i1',
            () => adoptText('1', ...),
        ),
    slowForEachItem(                        // i2 becomes stray 5th argument
        (vs1) => vs1.items, 1, 'i2',
        () => adoptText('1', ...),
    ),
),
```

The `() => expr1, expr2` arrow function only returns `expr1`. The `expr2` (`slowForEachItem` for i2) is evaluated (JS evaluates all arguments) but its result is discarded — it becomes a 5th argument to the outer `slowForEachItem` which only accepts 4.

**Root cause:** The hydrate compiler's slowForEach handler calls `renderHydrateElementContent` (processes children only), then wraps the result in `() => ${childContent}`. When `childContent` has multiple fragments joined by `,`, the single-expression arrow function can't return all of them.

The deeper issue: `slowForEachItem`'s callback should return a `BaseJayElement` representing the **item's root DOM element** — but no such element is adopted. The `<div class="category">` element is never wrapped in `adoptElement`.

## Design

### Always adopt the slow forEach item's root element

The hydrate compiler should wrap slowForEachItem content in `adoptElement` or `adoptDynamicElement` for the item's root DOM element. This mirrors how `hydrateForEach` items get their root element adopted.

Target output:

```typescript
slowForEachItem(
    (vs) => vs.categories, 0, 'c1',
    () => adoptDynamicElement('', {}, [
        STATIC,                                          // <h2>
        slowForEachItem(
            (vs1) => vs1.items, 0, 'i1',
            () => adoptElement('', {}, [
                adoptText('1', (vs2) => vs2.count),
            ]),
        ),
        slowForEachItem(
            (vs1) => vs1.items, 1, 'i2',
            () => adoptElement('', {}, [
                adoptText('1', (vs2) => vs2.count),
            ]),
        ),
    ]),
),
```

The `''` coordinate resolves to `coordinateBase.join('/')` itself — after `forItem('c1')`, that's `'c1'`, matching the DOM element's `jay-coordinate="c1"`.

### Changes needed

#### 1. SSR compiler: force `jay-coordinate` on slow forEach roots

Slow forEach items already have `jay-coordinate-base` from `assignCoordinates` (e.g., `c1`). But the SSR compiler skips emitting `jay-coordinate` when the element has no dynamic content or refs. With the adoption wrapping, the hydrate code needs the coordinate to find the element.

Fix: in `renderServerElement`'s slowForEach handler, pass `{ isRoot: true }` to `renderServerElementContent` to force coordinate emission. This is safe for fully-static slow forEach items (no hydrate code tries to resolve them).

#### 2. Hydrate compiler: wrap slowForEachItem content in adoptElement

In `renderHydrateElement`'s slowForEach handler, instead of:

```typescript
const childContent = renderHydrateElementContent(element, itemContext, ...);
// ... wrap in: () => ${childContent}
```

Generate an `adoptElement`/`adoptDynamicElement` call that:

1. Uses coordinate `''` (stripped jayTrackBy = empty = coordinateBase itself)
2. Has the children from `renderHydrateElementContent` as its child array
3. Uses `adoptDynamicElement` when children include dynamic groups (slowForEachItem, hydrateForEach, hydrateConditional), `adoptElement` otherwise

To avoid recursion (`renderHydrateElement` → detects slowForEach → loops), the adoption wrapping is done directly in the slowForEach handler rather than calling back into `renderHydrateElement`.

#### 3. Handle fully-static slow forEach items

When `childContent` is empty (fully static slow forEach item, no dynamic descendants), skip the wrapping — return empty as before. No `adoptElement` needed.

When `childContent` has a single fragment (one dynamic child), still wrap in `adoptElement` for consistency and correctness.

## Implementation Plan

### Phase 1: SSR — force coordinate on slow forEach roots

In `renderServerElement`'s slowForEach handler, pass `{ isRoot: true }` to both `renderServerElementContent` calls (the non-indented and indented paths).

### Phase 2: Hydrate — wrap slowForEachItem callback in adoptElement

In `renderHydrateElement`'s slowForEach handler:

1. After `renderHydrateElementContent`, check if content is non-empty
2. Determine if children include dynamic groups (need `adoptDynamicElement` vs `adoptElement`)
3. Generate the adoption wrapper with coordinate `''`
4. Wrap in the `slowForEachItem(...)` call as before

### Phase 3: Verify

1. Run 10a test (nested slow forEach with interactive content) — should pass
2. Run all hydration tests — no regressions
3. Run compiler tests — no regressions
4. Test golf page — no hydration warnings

## Verification Criteria

1. 10a fixture: "no hydration warnings" passes in all 3 SSR modes
2. 10a fixture: "DOM is correct after hydration" verifies count values render correctly
3. 10d fixture: interactivity test toggles `isActive` conditional inside slow forEach — verifies Kindergarten works
4. All existing hydration tests (1–9a, 10b–10d) continue passing
5. Golf page: no `adoptBase coordinate not found` warnings

## Implementation Results

### Approach: targeted wrapping based on child count

Instead of always using `forceAdopt` (which generated unnecessary `adoptElement('', {}, [])` for fully static items), the fix processes children individually and decides:

- **0 non-empty children** → skip entirely (fully static, as before)
- **1 non-empty child** → callback returns it directly (no wrapper needed)
- **2+ non-empty children** → wrap in `adoptElement` or `adoptDynamicElement`

For the multi-child case, the wrapper type depends on whether children include dynamic groups:

- **Has interactive conditional, forEach, or nested slowForEach** → `adoptDynamicElement` with `STATIC` sentinels (Kindergarten for DOM positioning)
- **Otherwise** → plain `adoptElement`

### SSR change

`renderServerElement`'s slowForEach handler passes `{ isRoot: true }` to `renderServerElementContent`, forcing `jay-coordinate` emission on slow forEach item root elements. This is needed so the hydrate wrapper's `adoptElement('', ...)` can resolve the element.

### Files changed

- `jay-html-compiler.ts` (hydrate path): slowForEach handler processes children individually via `renderHydrateNode`, counts non-empty results, wraps in `adoptElement`/`adoptDynamicElement` when multiple children exist
- `jay-html-compiler.ts` (SSR path): slowForEach handler passes `{ isRoot: true }` to force coordinate emission
- 2 SSR compiler test fixtures updated (slow forEach roots now emit `jay-coordinate`)
- 10a fixture: added `count` field at `phase: fast+interactive` to exercise nested slow forEach with dynamic content
- 10d fixture: added toggle button + `withInteractive` handler + interactivity test that toggles `isActive` conditional

### Test results

- 458/458 hydration tests pass (including 10a nested slow forEach + 10d interactivity toggle)
- 616/616 compiler-jay-html tests pass
- 68/68 packages build successfully
