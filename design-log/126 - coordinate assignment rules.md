# Design Log #126 — Scoped Coordinate System

## Background

The coordinate system ensures SSR and hydration consistently resolve elements in the DOM tree. Coordinates are assigned at compile/pre-render time, written to `jay-coordinate` attributes in SSR HTML, and resolved at runtime during hydration.

DL#103 introduced coordinate pre-processing. DL#106 added Kindergarten for dynamic elements. DL#123 added headfull FS components. This design log addresses a fundamental inconsistency in how coordinates are computed and proposes a scoped coordinate system to replace the current approach.

## The Problem

The current system has two inconsistent mechanisms:

1. **SSR (assign-coordinates + server element):** Writes coordinates that mix absolute paths with relative segments depending on context. slowForEach items use a separate `slowForEachPrefix` chain that skips headless instance segments.

2. **Hydrate compiler:** Strips prefixes from coordinates to produce relative coordinates, then relies on the runtime's `coordinateBase` accumulation (`forInstance`/`forItem`) to reconstruct the full path.

These two mechanisms produce different results when slowForEach items are nested inside headless instances:

**SSR writes:** `jay-coordinate="001de78a-..."` (trackBy value only — no parent prefix)
**Hydrate resolves:** `0/kitanheader:AR0/0/category-list:AR0/001de78a-...` (full accumulated path)

### Root Cause

The inconsistency comes from coordinate stripping in the hydrate compiler that has no equivalent in the SSR path. The hydrate compiler strips prefixes when entering headless instances, forEach, and slowForEach — producing relative coordinates that the runtime rebuilds via `forInstance`/`forItem`. But the SSR assigns coordinates using `assign-coordinates.ts` which has its own independent prefix tracking (`slowForEachPrefix`) that doesn't match the hydrate's stripping rules.

The more nesting levels (headfull FS → headless plugin → slowForEach), the more the two systems diverge.

## Current Rules (Status Quo)

### Element Types and Coordinates

| Element Type                  | Coordinate Format                | Example        |
| ----------------------------- | -------------------------------- | -------------- |
| Regular HTML element          | `parentCoord/childIndex`         | `0/1/2`        |
| slowForEach item              | `slowForEachPrefix/jayTrackBy`   | `p1/p2`        |
| Headless instance `<jay:xxx>` | `parentCoord/contractName:ref`   | `0/widget:AR0` |
| forEach item                  | `$trackBy/childIndex` (template) | `$_id/0`       |

### The Two Coordinate Chains

**Chain A — `parentCoord` (full DOM path):**
Includes every nesting level: element indices, headless instance identifiers, and slowForEach trackBy values.

**Chain B — `slowForEachPrefix` (trackBy-only chain):**
Only includes `jayTrackBy` values. Skips element indices and headless instance coordinates.

For page-level slowForEach, both chains produce the same result. For nested cases (headless instance → slowForEach), Chain A has extra segments that Chain B skips — causing the mismatch.

### Runtime Resolution

The runtime maintains `coordinateBase` that mirrors Chain A:

| Method               | Adds to coordinateBase   | Used by              |
| -------------------- | ------------------------ | -------------------- |
| `forItem(id)`        | `[...base, id]`          | forEach, slowForEach |
| `forInstance(coord)` | `[...base, ...segments]` | headless instances   |

Resolution: `fullKey = coordinateBase.join('/') + '/' + localCoordinate`

## Design: Scoped Coordinates

### Core Idea

Define **coordinate scopes**. Each scope is a self-contained coordinate namespace. Coordinates within a scope are relative to the scope root. Scopes are either **static** (compile-time, shared between SSR and hydrate) or **DOM-relative** (runtime, for dynamic forEach).

### Scope Boundaries

Three element types define scope boundaries:

1. **Headless instance** (`<jay:xxx>`) — each instance starts a new scope
2. **forEach item** — each iteration starts a new scope
3. **slowForEach item** — each concrete item starts a new scope

The page root is the initial scope (`S0`).

Scope IDs are assigned by a depth-first counter in `assign-coordinates`: `S0`, `S1`, `S2`, ... Both SSR and hydrate compilers process the same template in the same order, so they produce the same IDs.

### The Universal Rule

**Every scope is resolved against its own DOM subtree, not a global map.**

When entering a scope boundary, the runtime builds a local coordinate map from that element's subtree. All coordinate lookups within the scope search this local map. This is the same mechanism used for the page root (`withHydrationRootContext` builds a map from the root element's descendants).

This means scope IDs CAN repeat — for example, a forEach body compiled once always uses the same scope IDs (`S3`, `S4`, ...). Each forEach iteration builds its own local map from its own DOM branch, so `S3/0` in iteration A resolves to a different element than `S3/0` in iteration B. No collisions because different local maps.

### Coordinate Format

All coordinates use the same format:

```
jay-coordinate="S<n>/<relativeCoord>"
```

- `S<n>`: Scope ID (e.g., `S0`, `S1`, `S2`)
- `<relativeCoord>`: Position within the scope (e.g., `0`, `0/1`)

### Example: Golf Project Structure

```
Page root (scope S0):
  <div jay-coordinate="S0/0">
    <jay:kitanheader>  → defines scope S1

Kitanheader (scope S1):
  <div jay-coordinate="S1/0">              ← wrapper for multi-child body
    <div class="top-bar">                  ← S1/0/0
      <div class="top-bar-actions">        ← S1/0/0/1
        <jay:cart-indicator>  → defines scope S2

Cart-indicator (scope S2):
  <a jay-coordinate="S2/0">               ← cart link
    <span jay-coordinate="S2/0/0">        ← count (conditional)

Back in Kitanheader (scope S1):
    <jay:category-list>  → defines scope S3

Category-list (scope S3):
  <div jay-coordinate="S3/0">             ← category bar wrapper
    <div slowForEach jayTrackBy="001de78a">  → defines scope S4

SlowForEach item (scope S4):
  <a jay-coordinate="S4/0">               ← category link
```

### Example: forEach with Nested Component

```
Page (scope S0):
  <div jay-coordinate="S0/0">
    <div forEach="items" trackBy="_id">      ← scope S1 (per item)

forEach item (scope S1, local map per iteration):
  <div jay-coordinate="S1/0">
    <jay:widget>  → scope S2

Widget (scope S2, local map per iteration):
  <div jay-coordinate="S2/0">
    <span jay-coordinate="S2/0/1">
```

The forEach body is compiled once. Every iteration uses the same scope IDs (`S1`, `S2`). This works because each iteration builds its own local coordinate map from its own DOM subtree. `S2/0` in iteration A resolves to a different element than `S2/0` in iteration B — different local maps, no collisions.

### Comparison with Current System

**Current:** `jay-coordinate="0/kitanheader:AR0/0/0/1/cart-indicator:AR0/0"`
**Scoped:** `jay-coordinate="S2/0"`

**Current:** `jay-coordinate="001de78a"` (broken — missing parent prefix)
**Scoped:** `jay-coordinate="S4/0"` (always correct — scope is self-contained)

**Current forEach:** `jay-coordinate="$_id/0/widget:AR0/0"`
**Scoped forEach:** item root has `jay-coordinate="S1/0"`, widget has `jay-coordinate="S2/0"`

### How Scope Resolution Works

All scopes work the same way — no static vs dynamic distinction:

1. `assign-coordinates` assigns `jay-scope="S<n>"` on the boundary element and `jay-coordinate="S<n>/..."` on descendants within that scope
2. SSR writes these attributes to the HTML
3. At hydration time, when entering a scope:
   a. Locate the scope boundary element in the parent scope
   b. Build a **local coordinate map** from that element's `jay-coordinate` descendants
   c. Create a scoped context with this local map
   d. Adopt children using scoped coordinates (`S<n>/...`)
4. This is the same mechanism used for the page root (`withHydrationRootContext`)

Every scope is a mini hydration root. The page root is scope `S0`. Each headless instance, forEach item, and slowForEach item creates a new scope with its own local map.

### Runtime Changes

**Context — entering a scope:**

```typescript
forScope(scopeRootElement: Element) {
    // Build a LOCAL coordinate map from this element's subtree
    const localMap = buildCoordinateMap(scopeRootElement);
    return new ConstructContext(
        childViewState,
        false,
        [],           // RESET coordinateBase — scoped coordinates are self-contained
        localMap,     // LOCAL map scoped to this subtree
        scopeRootElement,
        this._dataIds,
    );
}
```

No more `forInstance` / `forItem` accumulation. `resolveCoordinate('S2/0')` just does `localMap.get('S2/0')`.

**Hydrate compiler — no more stripping:**

```typescript
// Current (stripping + accumulation):
adoptElement('0/1', {}, [
    childCompHydrate(_Widget, ..., '0/1/widget:AR0', ...)
])

// Scoped (direct):
adoptElement('S1/0/1', {}, [
    childCompHydrate(_Widget, ..., 'S2', ...)
])
```

### Scope ID Generation

`assign-coordinates` maintains a counter per compilation unit:

```
S0  — page root (always)
S1  — first scope boundary encountered (depth-first)
S2  — second scope boundary
...
```

The same IDs appear in every forEach iteration — this is correct because each iteration builds its own local map. `S2/0` in iteration A resolves against iteration A's local map, `S2/0` in iteration B resolves against B's.

### Benefits

1. **Uniform mechanism** — all scopes (page, headless, forEach, slowForEach) work identically
2. **No stripping logic** — coordinates are always self-contained within their scope
3. **No accumulation** — no `forInstance`/`forItem` coordinateBase stacking
4. **No two-chain divergence** — `slowForEachPrefix` concept eliminated
5. **Naturally handles arbitrary nesting** — any combination of headfull FS → headless → slowForEach → forEach just creates nested scopes
6. **forEach repetition is safe** — same scope IDs, different local maps

### Trade-offs

1. **Scope IDs are positional** — adding/removing a scope boundary changes subsequent IDs. Fine because SSR and hydrate are compiled from the same template.
2. **Larger refactor** — touches assign-coordinates, server element compiler, hydrate compiler, and runtime context
3. **Local map per scope** — small overhead to build a coordinate map per scope boundary. Already done once for the page root.

## Implementation Plan

### Phase 1: assign-coordinates

- Add scope counter (`S0`, `S1`, ...)
- Add `jay-scope="S<n>"` attribute on ALL scope boundary elements (headless instances, forEach items, slowForEach items)
- All coordinates within a scope use format `S<n>/<relativeCoord>`
- Remove `slowForEachPrefix` parameter — no longer needed
- Remove `$trackBy` prefix from forEach coordinate templates — forEach items are scopes

### Phase 2: Server element compiler

- Read `jay-scope` to determine scope transitions
- Write `jay-coordinate="S<n>/..."` consistently for all scopes
- When entering a scope boundary, emit the scope marker
- `__headlessInstances` key: use scope ID (replaces `contractName:ref`)

### Phase 3: Hydrate compiler

- Remove all coordinate stripping logic (`instanceCoordPrefix`, forEach prefix stripping, slowForEach prefix stripping)
- Generate scope IDs in the same depth-first order as assign-coordinates
- All `adoptElement`/`adoptText` calls use `S<n>/<relative>` directly
- `childCompHydrate` passes scope ID
- `hydrateForEach` / `slowForEachItem` pass scope ID

### Phase 4: Runtime

- Add `forScope(scopeRootElement)` — builds local coordinate map from subtree, resets coordinateBase
- `resolveCoordinate` unchanged — looks up in the current (local) map
- Remove `forInstance`, simplify `forItem` to just call `forScope`
- `withHydrationRootContext` becomes just the `S0` scope entry

### Phase 5: Tests

- Update all expected-ssr.html and expected-hydrate.ts fixtures (coordinate format changes)
- Add test: forEach with nested headless component
- Verify golf project (slowForEach inside headless inside headfull FS)
- Run full test suite

## Verification Criteria

1. All existing hydration tests pass (coordinate format changes, but behavior preserved)
2. Golf project: slowForEach items inside category-list inside kitanheader render and hydrate correctly
3. No hydration coordinate warnings in any test or the golf project
4. Test 8m (ViewState mismatch in nested headless) continues to work

## Implementation Results

### Test Results

- compiler-jay-html: 633 passed, 4 skipped (637 total)
- runtime hydration: 67 passed
- dev-server hydration: 618 passed
- dev-server unit: 4 passed

### Deviations from Original Design

1. **Local scope maps via `forScope()` instead of global map only.** The design mentioned using the same mechanism as `withHydrationRootContext`, but the implementation revealed that forEach items sharing the same scope IDs require LOCAL coordinate maps per item. `forScope(element)` builds a map from the element's subtree. Without this, `adoptText` (which uses `peekCoordinate`) would resolve the same entry for all items, causing cross-item contamination.

2. **`forItem` still accumulates `coordinateBase`.** The design said to remove coordinateBase accumulation, but the non-hydration path (element target) still uses `coordinateBase` via the `coordinate()` method for ref resolution. `forItem` keeps accumulating for backward compatibility; `resolveCoordinate` simply ignores it (uses key directly).

3. **`childCompHydrate` takes `scopeRootCoordinate` parameter.** The design said no coordinate argument needed. In practice, `childCompHydrate` needs to find the scope root element to build a local map via `forScope()`. The coordinate is passed and consumed from the parent scope's map.

4. **`hydrateForEach` takes `itemCoordinate` parameter.** Each forEach item's root element shares the same coordinate (e.g., `S0/0/1`). `hydrateForEach` resolves each item root from the parent scope (consuming entries in document order), then builds a local scope map for each item.

5. **`__headlessInstances` key changed to full `jay-coordinate-base` value.** The design didn't specify key format changes. The implementation uses the full scoped coordinate (e.g., `S0/0/widget:AR0`) instead of just the suffix (`widget:AR0`). This required:

   - Running `assignCoordinatesToJayHtml` before `discoverHeadlessInstances` in the dev-server pipeline
   - Running discovery twice: first to assign refs, then coordinate assignment, then re-discovery to read `jay-coordinate-base`
   - Updating the element target to also run `assignCoordinates` and read `jay-coordinate-base` for the key

6. **`adoptText` still uses `peekCoordinate` (unchanged).** The design implied removing the peek/resolve distinction. In practice, `adoptText` and `adoptElement` can share the same coordinate (element with dynamic attrs + text content), so `adoptText` must peek while `adoptElement` consumes. The forEach cross-contamination is solved by local scope maps, not by changing peek behavior.

7. **Coordinate format `S<n>/<path>` includes full path within scope.** The design showed `S<n>/<relativeCoord>` as a flat index. The implementation uses the full positional path within the scope (e.g., `S0/0/0/1` for a deeply nested element), matching the old system's path structure but prefixed with the scope ID.
