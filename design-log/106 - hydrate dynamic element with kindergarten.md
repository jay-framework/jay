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
