# Design Log #106 — Hydrate Dynamic Elements with Kindergarten

## Background

The element target's `e()` function uses `Kindergarten` to manage mixed children — static elements, forEach groups, and conditional groups each get their own `KindergartenGroup`. The `getOffsetFor(group)` method sums the sizes of preceding groups to compute the correct DOM insertion index. This ensures that adding a forEach item inserts at the right position among siblings.

The hydrate target's `adoptElement` does NOT use Kindergarten. It collects child updates/mounts but treats all children as a flat list. When `hydrateForEach` creates a `Kindergarten`, it creates it directly on the **container element** (the forEach wrapper `<div class="list">`), not on the parent that holds mixed content.

### Related

- DL#102 Issue 8 (new) — forEach add item inserts at wrong position
- DL#104 — hydration test plan (6c forEach interactivity)

## Problem

Page structure:

```html
<div jay-coordinate="0">
  <!-- parent with mixed content -->
  <h1>ForEach Headless</h1>
  <!-- static child (group 0) -->
  <div class="list">...</div>
  <!-- forEach item 1 (group 1) -->
  <div class="list">...</div>
  <!-- forEach item 2 (group 1) -->
  <div class="list">...</div>
  <!-- forEach item 3 (group 1) -->
  <button>Add Item</button>
  <!-- static child (group 2) -->
  <button>Remove Last</button>
  <!-- static child (group 3) -->
</div>
```

Current hydrate code:

```typescript
adoptElement('0', {}, [
  adoptText('0/0', (vs) => vs.title),
  hydrateForEach('0', (vs) => vs.items, '_id', adoptItem, createItem),
  adoptElement('0/2', {}, [], refAddButton()),
  adoptElement('0/3', {}, [], refRemoveButton()),
]);
```

`hydrateForEach` creates a `Kindergarten` on the container element (`<div jay-coordinate="0">`), but with `newGroup()` at index 0. It doesn't account for the `<h1>` before it. When a new item is added, `getOffsetFor(group)` returns 0 (no preceding groups), so the item is inserted before the `<h1>` instead of after the existing forEach items.

Similarly, `hydrateConditional` inserts an anchor comment and uses `insertBefore` relative to the adopted element's sibling. If other children are added/removed around it, the anchor position may become incorrect.

## Design

### Unified approach: `adoptDynamicElement` with Kindergarten

When the compiler detects that an element's children include `hydrateForEach` or `hydrateConditional`, it emits `adoptDynamicElement` instead of `adoptElement`. This function creates a `Kindergarten` on the DOM element and assigns each child position to a `KindergartenGroup`.

Only elements with dynamic children use this. Static-only `adoptElement` calls remain unchanged (no Kindergarten overhead).

### Accounting for static holes

The SSR DOM may contain static children that have no corresponding hydrate code. For example:

```html
<div jay-coordinate="0">
  <h1>Title</h1>
  <!-- static, no hydrate code -->
  <p>Description</p>
  <!-- static, no hydrate code -->
  <div class="list">...</div>
  <!-- forEach item 1 -->
  <div class="list">...</div>
  <!-- forEach item 2 -->
  <span jay-coordinate="0/4">count</span>
  <!-- dynamic text -->
  <button jay-coordinate="0/5">Add</button>
  <!-- ref -->
</div>
```

The hydrate script is compiled from the pre-rendered jay-html — at compile time we don't know how many forEach items will exist at runtime. So we can't use absolute DOM position indices.

**Solution: `STATIC` placeholder in children array.** Each static child that doesn't need hydration is represented by a `STATIC` marker. This tells the Kindergarten "there's 1 DOM node here that I don't manage."

```typescript
adoptDynamicElement('0', {}, [
    STATIC,                                    // h1 — 1 DOM node, no hydration
    STATIC,                                    // p — 1 DOM node, no hydration
    hydrateForEach(...),                       // forEach — N DOM nodes
    adoptText('0/4', ...),                     // dynamic text — 1 DOM node
    adoptElement('0/5', {}, [], refAdd()),      // button — 1 DOM node
])
```

At hydration time, the Kindergarten walks the parent's actual DOM children and assigns them to groups in order:

```
Template children:  [STATIC] [STATIC] [forEach] [adoptText] [adoptElement]
                      ↓        ↓        ↓          ↓           ↓
DOM children:       [h1]     [p]     [item1][item2]  [span]    [button]
                                     ↑ N items ↑
Groups:             [g0:1]  [g1:1]  [g2:2]      [g3:1]    [g4:1]
```

Each group type:

- `STATIC` → group with 1 node, consumed from DOM in order
- `hydrateForEach` → group with N nodes (N = initial items array length)
- `hydrateConditional` → group with 0 or 1 nodes (based on SSR condition)
- `adoptText`/`adoptElement` → group with 1 node

### How it works — example

When forEach adds item3:

- `getOffsetFor(g2)` = g0.size(1) + g1.size(1) = 2
- Insert at position 2 + 2 = 4 (after item2, before span) ✓

When forEach removes item2:

- `g2.removeNode(item2)` → g2.size becomes 1
- `getOffsetFor(g3)` recalculates: 1 + 1 + 1 = 3 → span stays at correct position ✓

When conditional toggles false→true:

- `g_cond.ensureNode(dom, 0)` → g_cond.size becomes 1
- Subsequent groups' offsets shift by +1 ✓

### Changes needed

#### 1. New function: `adoptDynamicElement`

```typescript
/** Sentinel value representing a static DOM child that doesn't need hydration */
export const STATIC: BaseJayElement<any> = {
  dom: null,
  update: noopUpdate,
  mount: noopMount,
  unmount: noopMount,
  __static: true,
};

export function adoptDynamicElement<ViewState>(
  coordinate: string,
  attributes: Attributes<ViewState>,
  children: BaseJayElement<ViewState>[], // may include STATIC markers
  ref?: PrivateRef<ViewState, BaseJayElement<ViewState>>,
): BaseJayElement<ViewState>;
```

Implementation:

1. Resolve element by coordinate (same as `adoptElement`)
2. Create `Kindergarten` on the element
3. Walk `children` array and the parent's actual DOM children in parallel:
   - `STATIC` marker → create group, consume 1 DOM node, register in group (never changes)
   - `hydrateForEach` result → create group, consume N DOM nodes (N = initial items count)
   - `hydrateConditional` result → create group, consume 0 or 1 DOM nodes
   - Regular `adoptText`/`adoptElement`/`childCompHydrate` → create group, consume 1 DOM node
4. Wire up updates/mounts/unmounts same as `adoptElement`

#### 2. `hydrateForEach` receives a `KindergartenGroup`

Instead of creating its own Kindergarten, it receives the group from the parent:

```typescript
export function hydrateForEach<ViewState, Item>(
  accessor: (vs: ViewState) => Item[],
  trackBy: string,
  adoptItem: () => BaseJayElement<Item>[],
  createItem: (item: Item, id: string) => BaseJayElement<Item>,
  group: KindergartenGroup, // from parent's Kindergarten
): BaseJayElement<ViewState>;
```

`containerCoordinate` parameter removed — the parent `adoptDynamicElement` already resolved the container and created the group.

#### 3. `hydrateConditional` receives a `KindergartenGroup`

```typescript
export function hydrateConditional<ViewState>(
  condition: (vs: ViewState) => boolean,
  adoptExisting: () => BaseJayElement<ViewState>,
  createFallback: () => BaseJayElement<ViewState>,
  group: KindergartenGroup,
): BaseJayElement<ViewState>;
```

- True at SSR: group has 1 child (the adopted element)
- False at SSR: group has 0 children
- Toggle true→false: `group.removeNode(dom)`, group.size becomes 0
- Toggle false→true: `group.ensureNode(dom, 0)`, group.size becomes 1

No anchor comments needed — Kindergarten offset system handles positioning. The old anchor-based approach is removed entirely.

### Questions and Answers

**Q1: Should all `adoptElement` calls use Kindergarten?**
A: No (Option A). Only when children include dynamic groups. The compiler knows at compile time and emits `adoptDynamicElement` vs `adoptElement` accordingly.

**Q2: How does the compiler know which children are dynamic?**
A: The compiler already knows — `forEach` attribute → hydrateForEach, `if` attribute → hydrateConditional. It emits `STATIC` for template children that have no hydrate code (fully static elements).

**Q3: Does this affect coordinate resolution?**
A: No. Coordinates are resolved via the coordinate map. Kindergarten only manages DOM positions for insertion/removal.

**Q4: What about nested dynamic elements?**
A: A forEach item containing a conditional creates nested Kindergartens. Each level is independent — same pattern as the element target.

## Implementation Plan

### Phase 1: Runtime

1. Add `DynamicChildGroup` type to `hydrate.ts`
2. Add `adoptDynamicElement` function that creates Kindergarten and assigns groups
3. Modify `hydrateForEach` to accept a `KindergartenGroup` instead of creating its own Kindergarten
4. Modify `hydrateConditional` to accept an optional `KindergartenGroup` and use it for DOM positioning

### Phase 2: Compiler

1. Detect when `adoptElement` children include forEach or conditional
2. Emit `adoptDynamicElement` instead of `adoptElement` for those cases
3. Pass group references from parent to forEach/conditional children

### Phase 3: Tests

1. Update hydration tests for correct forEach add/remove positioning
2. Test conditional toggle within mixed-content parent
3. Test nested forEach + conditional

## Verification Criteria

1. forEach "Add Item" inserts at correct position (after existing items, before buttons)
2. forEach "Remove Last" removes from correct position
3. Conditional toggle doesn't displace siblings
4. Nested dynamic elements work (forEach item with conditional)
5. Static-only adoptElement unchanged (no Kindergarten overhead)
6. All existing hydration tests pass

## Implementation Results

### Deviations from design

**Deferred group assignment via `_setGroup` callback** — The design proposed passing `KindergartenGroup` as a parameter to `hydrateForEach`/`hydrateConditional`. This doesn't work because JS argument evaluation order means these calls execute _before_ `adoptDynamicElement` can create groups. Solution: `hydrateForEach` and `hydrateConditional` return a `DynamicChild<ViewState>` (extends `BaseJayElement` with a `_setGroup` callback). `adoptDynamicElement` creates groups and calls `_setGroup` on each dynamic child.

**`STATIC` is a Symbol, not an object** — The design proposed a `BaseJayElement` with `__static: true`. Implementation uses `Symbol('STATIC')` which is simpler and allows `child === STATIC` identity check instead of property access.

**Code size reduction via `adoptBase` / `collectChild` helpers** — `adoptElement` and `adoptDynamicElement` share coordinate resolution, ref wiring, and dynamic attribute binding via extracted `adoptBase()`. Child update/mount/unmount collection extracted into `collectChild()`.

### Additional bug fix: `buildCoordinatePrefix` coordinate mismatch

During integration testing with the `fake-shop` example, discovered that `buildCoordinatePrefix` (used by `discoverHeadlessInstances` to compute `__headlessInstances` keys) produced coordinates that didn't match `assignCoordinates` (used by server-element and hydrate targets for lookup).

**Root cause:** `buildCoordinatePrefix` computed child indices incorrectly:

- It counted `jay:xxx` elements as DOM children, but `assignCoordinates` skips them (`childCounter` is not incremented for headless directives)
- When the headless instance was a direct child of a slowForEach div, this produced a spurious `/0` index (`"1/0/widget:0"` instead of `"1/widget:0"`)
- When intermediate wrapper elements existed (e.g., `<div class="product-card">`), the child index was needed but relative to the wrapper's real DOM siblings

**Fix:** `buildCoordinatePrefix` now:

1. Walks up from the element, stopping at the first `jayTrackBy` ancestor
2. For intermediate elements between the instance and the jayTrackBy scope, adds their positional index (matching `assignCoordinates childCounter`)
3. Skips `jay:xxx` elements when computing sibling position (they're directives, not DOM elements)
4. Uses `jayTrackBy` value as the coordinate base (not a positional index)

### Test improvements

- **`waitForHydration` with diagnostics** — Uses `Promise.race` with a 6s hard timeout to handle Vite reload loops. Collects page errors and reports them on failure.
- **`page.setDefaultTimeout(2000)`** — Playwright selector calls fail fast (2s) instead of auto-waiting 30s, preventing test timeouts from masking assertion failures.
- **`dumpTargetContent` on failure** — Catches check/interactivity errors, reads `#target` innerHTML via `page.evaluate`, and re-throws with DOM content for debugging.
- **`afterAll` cleanup** — Removes `build/` directories created during tests.
- **`// @ts-ignore` in fixtures** — Before `} from '...'` lines to suppress tsc errors on Vite-style import paths. `stripTsDirectives` removes them before comparison.

### Test results

- Runtime: 249 passed (252 total, 3 skipped)
- Compiler: 592 passed (596 total, 4 skipped)
- Dev-server: 42 passed (including all 6a–6d headless tests)
- Full suite: 68 packages, all passing

### Removed redundant `instanceVs` lookup from hydrate render functions

The generated hydrate code had 3 lines per headless instance that looked up `HEADLESS_INSTANCES` context to override the viewState:

```js
const instanceData = useContext(HEADLESS_INSTANCES);
const instanceKey = '1/widget:0';
const instanceVs = instanceData?.viewStates?.[instanceKey] ?? viewState;
```

This was redundant — `makeHeadlessInstanceComponent`'s wrapped constructor already resolves the fast ViewState from `HEADLESS_INSTANCES` and merges it into `compCore.render()`. By the time the hydrate render function is called (step 3 in `makeJayComponent`: `render(compCore.render())`), the `viewState` parameter already has the correct instance data.

The redundancy also caused a bug for forEach instances: `dataIds` already contained the instance suffix (added by `forInstance` in `childCompHydrate`), and appending it again produced duplicated keys like `"3,stock-status:0,stock-status:0"`.

Also simplified `makeHeadlessInstanceComponent` — removed old `ComponentConstructor` parameter support, now only accepts `HeadlessComponentDef`.

### Fix: forEach coordinate `$trackBy` prefix not stripped in hydrate target

Discovered via `fake-shop` example: headless instances inside a forEach with intermediate wrapper elements (e.g., `<div class="card"><jay:widget>`) failed to hydrate — coordinate resolution produced "not found" errors.

**Two related issues:**

1. **Element coordinates emitted with `$trackBy` prefix** — `assignCoordinates` assigns coordinates like `"$_id/0/0"` inside forEach items. The server-element target compiles these via `compileCoordinateExpr` which resolves the `$` placeholder to a runtime expression. But the hydrate target emitted the `$_id/0/0` string literally. At runtime, `forItem("1")` sets coordinateBase to `["1"]`, then `resolveCoordinate("$_id/0/0")` looked up `"1/$_id/0/0"` — wrong.

2. **`childCompHydrate` coordinate missing intermediate elements** — For forEach, `coordKeyArg` was just `coordinateSuffix` (e.g., `"widget:0"`). `forInstance("widget:0")` extended the base to `["1", "widget:0"]`, so `adoptElement("0")` resolved to `"1/widget:0/0"`. But the DOM element was at `"1/0/widget:0/0"` — the `/0/` from the wrapper `<div class="card">` was missing.

**Fix in `renderHydrateElementContent`:** When inside a forEach and the coordinate starts with `$`, strip the `$trackBy/` prefix. `forItem` already scopes by trackBy value, so `resolveCoordinate("0/0")` correctly resolves to `"1/0/0"`.

**Fix in `coordKeyArg`:** Unified forEach and slowForEach — both use `coordSegments.slice(1).join('/')` to strip the first segment (`$trackBy` or `jayTrackBy`). The remaining path includes intermediate wrapper elements (e.g., `"$_id/0/widget:0"` → `"0/widget:0"`).

**Test:** Updated 6c dev-server test (`page-headless-foreach`) to wrap the headless instance in `<div class="card"><strong>{name}</strong><jay:widget>` — the same pattern as the fake-shop. Verifies both hydration DOM correctness and interactivity (button click updates widget value).

### Fix: `dataIds` polluted by `forInstance` segments

`ConstructContext.dataIds` (used by `makeHeadlessInstanceComponent` to compute `__headlessInstances` lookup keys) returned `coordinateBase`, which serves double duty: coordinate resolution AND forEach trackBy tracking. When `forInstance("0/widget:0")` extended `coordinateBase` for resolution, it also polluted `dataIds` — producing keys like `"1,0,widget:0"` instead of `"1,widget:0"`.

**Fix:** Separated `_dataIds` from `coordinateBase` in `ConstructContext`. `forItem` adds to both (trackBy values). `forInstance` only adds to `coordinateBase` (instance coordinate segments are not trackBy values).

### Fix: hydrate target missing `coordinateSuffix` in forEach key function

The hydrate target generated `(dataIds) => dataIds.join(',')` for the `makeHeadlessInstanceComponent` coordinate key function — missing the `coordinateSuffix`. The element target correctly used `(dataIds) => [...dataIds, '${coordinateSuffix}'].toString()`. Fixed hydrate target to match.

**Test:** Added new 6e test (`page-headless-foreach-nested`) — forEach with headless instance inside wrapper div + preceding static sections + no `clientDefaults`. Reproduces the exact fake-shop pattern where key mismatch caused `"undefined is not iterable"` crash.
