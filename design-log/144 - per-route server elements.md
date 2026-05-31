# DL#144: Per-Route Server Elements

## Background

Server-element files are compiled from jay-html templates into streaming HTML renderers. Currently they're generated per-instance — one per route + params combination. For a product page with 10 SKUs, that's 10 server-element.js files. For the golf project with 163 category/product instances, that's 163 files totaling 4.9 MB of pre-rendered content out of 59 MB total build output.

The problem: these files are 95%+ identical. They differ only in baked-in slow-phase data values (product name, price, SKU). The template structure, bindings, and rendering logic are the same across all instances of a route.

Example diff between two product page instances:

```diff
-  w("Gaming Laptop");
+  w("Bluetooth Speaker");
-  w("1299.99");
+  w("89.99");
-  w("LAP-001");
+  w("SPK-007");
```

The `.cache.json` files already contain all the slow ViewState data. It's just being baked into JS literals instead of read at render time.

## Problem

Per-instance server elements cause:

1. **Build size bloat** — 59 MB pre-rendered content in the golf project. Category listing routes alone produce 58 nearly-identical 1,300-line files.

2. **Wasted V8 resources** — 163 separate modules parsed and compiled. Each render function called ~1x, runs interpreted (never JIT-optimized). 163 compiled function objects in memory.

3. **Slow BaaS cold starts** — each instance requires a separate file fetch from cloud storage. 163 `import()` calls with I/O latency.

4. **Slow rebuilds** — when a product changes, the entire server-element must be recompiled from the pre-rendered jay-html. With per-route elements, only the `.cache.json` needs updating.

5. **Negligible benefit** — the "performance" of baked-in string literals vs. ViewState property lookups is measured in nanoseconds. A few extra `escapeHtml` calls and loop iterations are irrelevant compared to parsing 163 JS modules.

## Golf Project Analysis

### Category listing routes (`[[category]]`)

27 kitan + 31 polgat instances, ~1,300 lines each. Only 122 lines differ between two category instances:

- Hero banner image URL
- Breadcrumb links and category name
- Sub-category filter checkboxes (varies by category)
- Jay-coordinate numbers shifting due to different filter count
- Category header title

The product grid — the heaviest part of the render — is already fully dynamic (`vs.search.searchResults`). The baked-in bits are a handful of category-level strings.

### Performance: single file vs per-instance

| Factor | Per-instance (current) | Single file + data |
|--------|----------------------|-------------------|
| V8 parse/compile | 163 separate modules parsed & compiled | 1 module, compiled once, reused |
| JIT optimization | Each function called ~1x, runs interpreted | One function called 163x, gets JIT-optimized |
| Memory | 163 compiled function objects | 1 compiled function object |
| Module loading | 163 `import()` calls with disk I/O | 1 cached import + JSON read |
| String escaping | Some pre-escaped literals | More `escapeHtml` calls |
| Branching | Unrolled (7 options = 7 blocks) | `for` loop over data |

The last two rows are the only costs — negligible compared to parsing/compiling 163 modules that are 95% identical.

## Design

### Per-route server elements

Compile one server-element.js per route (not per instance). The server-element renders ALL bindings — slow, fast, and interactive coordinates — from the full merged ViewState.

**Current flow (per-instance):**

```
Build:
  For each instance (route + params):
    1. Slow render → slow ViewState
    2. Pre-render jay-html (bake slow data into HTML)
    3. Compile pre-rendered HTML → per-instance server-element.js (slow data as literals)
    4. Write cache.json (slowViewState, carryForward)

Serve:
  1. import(instance-specific server-element.js)
  2. Read cache.json → get carryForward
  3. Run fast phase → fast ViewState
  4. Merge slow + fast ViewState (but slow is already baked in)
  5. Server-element renders only fast bindings
```

**Proposed flow (per-route):**

```
Build:
  Once per route:
    1. Compile original jay-html → per-route server-element.js (ALL bindings dynamic)
  For each instance (route + params):
    2. Slow render → slow ViewState
    3. Write cache.json (slowViewState, carryForward)
    (No pre-rendered jay-html needed for SSR — only for hydration entry)

Serve:
  1. import(route server-element.js) — cached after first load
  2. Read cache.json → get slowViewState + carryForward
  3. Run fast phase → fast ViewState
  4. Merge slow + fast ViewState
  5. Server-element renders full page from merged ViewState
```

### What changes

| Artifact | Current | Proposed |
|----------|---------|----------|
| `server-element.js` | Per instance, bakes slow data | Per route, all data from ViewState |
| `cache.json` | Stores slowViewState + carryForward | Same (no change) |
| Pre-rendered `.jay-html` | Used to compile server-element | Still needed for hydration coordinate assignment |
| Build time | Compile N server-elements per route | Compile 1 server-element per route |
| Serve time | Load instance-specific module | Load route-shared module, read cache.json |

### Server-element compilation target

Currently the server-element compiler takes pre-rendered jay-html (slow data baked in) and outputs a render function where slow values are string literals. The proposed change: compile from the original jay-html template and output a render function where ALL values come from the ViewState parameter.

This is conceptually the same as what the dev server does — it compiles the original jay-html and renders with the full ViewState. The production build just needs to use the same compilation target.

### Coordinate assignment

Jay-coordinates are assigned during pre-rendering and must be consistent between server-element (SSR) and hydration (client). With per-route server elements, coordinates are still assigned from the same template — they're deterministic based on template structure, not data.

The one exception: `slowForEach` items can vary per instance (different number of items). The coordinate assignment for forEach is data-dependent. This needs careful handling — the server-element must use the runtime ViewState to determine forEach iterations, not a baked-in count.

### Impact on the hydration entry

The hydration entry (`page.hydrate-entry.ts`) currently uses the pre-rendered jay-html to determine which coordinates need client-side wiring. With per-route server elements, the hydration entry is still compiled from the same jay-html template (it doesn't use the server-element). No change needed.

## Questions

**Q1: Does this break the slow render cache?**

A1: No. The slow render cache (`cache.json`) already stores `slowViewState` and `carryForward`. The only difference is that the server-element reads `slowViewState` from the cache instead of having it baked into the render function.

**Q2: What about `slowForEach` where the number of items varies per instance?**

A2: The server-element must handle `slowForEach` dynamically — iterate over the ViewState array at render time instead of unrolling a fixed number of items. This is already how `forEach` works in the fast+interactive phases.

**Q3: Does this affect the client bundle or hydration?**

A3: No. The client bundle and hydration entry are compiled from the original jay-html, not from the server-element. They already handle all phases dynamically.

**Q4: What about conditionals that depend on slow data?**

A4: Same as Q2 — the server-element evaluates conditionals at render time from the ViewState. This is how the dev server already works.

**Q5: How does this affect BaaS deployment (DL#143)?**

A5: Significant improvement. The `ArtifactStore` now loads 1 server-element per route instead of N per instance. For the golf project, 1 file instead of 163 fetches from cloud storage.

## Implementation Plan

### Phase 1: Server-element compilation from original jay-html

1. Add a "full" compilation mode to the server-element compiler that outputs a render function taking the complete ViewState (slow + fast)
2. All data values are read from the ViewState parameter — no baked-in literals
3. `slowForEach` iterates over ViewState arrays at render time

### Phase 2: Build pipeline changes

1. Compile server-element once per route (from original jay-html), write to route directory
2. Each instance still runs slow render and writes `cache.json`
3. Remove per-instance server-element compilation
4. Update `page-parts.json` to reference the shared server-element path

### Phase 3: Serve pipeline changes

1. `fetchPageRequest`: load route-shared server-element (cached after first load)
2. Read `cache.json` for slow ViewState
3. Merge slow + fast ViewState
4. Render full page with merged ViewState

### Phase 4: Dev server alignment

1. Verify the dev server already uses the equivalent approach (compiles from original jay-html, renders with full ViewState)
2. Ensure coordinate assignment is consistent between dev and production

### Phase 5: Tests

1. Verify SSR output matches between per-instance and per-route approaches
2. Test with `slowForEach` (varying item counts across instances)
3. Test with slow-phase conditionals
4. Run smoke tests in all modes
5. Measure build size reduction and serve-time performance

## Trade-offs

| Aspect | Benefit | Cost |
|--------|---------|------|
| Build size | Dramatic reduction (59 MB → much less for pre-rendered content) | None |
| Build time | Fewer compilations (1 per route vs N per instance) | None |
| V8 performance | JIT optimization, fewer modules, less memory | Negligible: more `escapeHtml` calls at render time |
| BaaS cold start | 1 file fetch per route vs N | None |
| Invalidation | Only update cache.json, not recompile server-element | None |
| Complexity | Simpler build pipeline (fewer artifacts) | Server-element must handle all phases dynamically |

## Verification Criteria

1. **Fake-shop** — full build + production serve works, all pages render correctly
2. **Smoke-test** — all modes pass (dev, self-hosted, CDN)
3. **Coordinate stability** — jay-coordinate values in SSR output must be identical to current per-instance output. Coordinates drive client hydration — if SSR and hydration disagree on coordinates, bindings break silently. Specifically:
   - `slowForEach` items must produce the same coordinate structure as today (coordinate-base assignments, forEach prefix keys)
   - Slow-phase conditionals (`if` blocks that depend on slow data) must produce the same coordinate offsets — a false-at-SSR conditional must still reserve its coordinate slot so subsequent elements don't shift
   - The coordinate assignment algorithm (DL#103, DL#126) must not change — the server-element reads coordinates from the same pre-assigned `jay-coordinate-base` attributes
4. **Hydration round-trip** — pages with interactive elements hydrate correctly after SSR (click handlers, reactive updates work)
5. Build size is significantly smaller
6. Serve-time performance is equal or better
7. `slowForEach` renders correctly with varying item counts across instances of the same route
