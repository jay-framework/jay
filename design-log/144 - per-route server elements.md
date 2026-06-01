# DL#144: Per-Route Shared Artifacts (Server Element, Hydrate Script, CSS)

## Background

Server-element files, hydrate scripts, and CSS are compiled from jay-html templates into per-instance artifacts. For a product page with 10 SKUs, that's 10 server-element.js, 10 hydrate JS bundles, and 10 CSS files. For the golf project with 163 category/product instances, that's 489 nearly-identical files.

The problem: these files are 95%+ identical. They differ only in baked-in slow-phase data values. The template structure, bindings, and rendering logic are the same across all instances of a route.

### Golf project measurements

| Asset             | Instances | Total Size | Actual differences                         |
| ----------------- | --------- | ---------- | ------------------------------------------ |
| server-element.js | 163       | ~18MB      | Product name, options, descriptions, sizes |
| hydrate JS        | 163       | 6.8MB      | Product ID, choice IDs, swatch colors      |
| CSS               | 163       | copies     | Zero — all identical                       |

The hydrate scripts are even more "samey" than the server-element files. The baked-in data (product ID, choice IDs, color codes) could trivially come from `cache.json` at hydration time.

### Root cause: `slowForEach` and pre-rendering

The current system unrolls slow-phase `forEach` at build time via `slowRenderTransform`, baking slow data values into the jay-html. This produces per-instance jay-html with:

- Slow binding values resolved to literals (`{productName}` → `"Widget A"`)
- `forEach` unrolled into concrete `slowForEach` items (one element per array item)
- Slow conditionals resolved (false branches removed)

All three compilation targets (server-element, hydrate, element) then compile from this per-instance pre-rendered jay-html, producing per-instance artifacts.

## Problem

Per-instance artifacts cause:

1. **Build size bloat** — 59 MB pre-rendered content in the golf project. 163 near-identical server elements (18MB) + 163 near-identical hydrate scripts (6.8MB) + 163 identical CSS copies.

2. **Wasted V8 resources** — 163 separate modules parsed and compiled per artifact type. Each function called ~1x, runs interpreted (never JIT-optimized).

3. **Slow BaaS cold starts** — each instance requires separate file fetches from cloud storage. Hundreds of `import()` calls with I/O latency.

4. **Slow rebuilds** — when a product changes, server-element AND hydrate script AND CSS must be recompiled. With per-route artifacts, only `cache.json` needs updating.

5. **Browser can't cache** — each product page loads a unique hydrate script. Navigating between products forces a fresh parse of nearly-identical JS. A shared script would be cached after first load.

## Design

### Eliminate slowForEach, compile everything from original jay-html

Instead of pre-rendering jay-html per instance and compiling from it, compile all artifacts (server-element, hydrate script, CSS) **once per route** from the **original jay-html**.

The slow render phase still runs per instance and produces `cache.json` (slowViewState + carryForward). But it no longer transforms the jay-html. The pre-rendered jay-html is eliminated as a compilation input.

**Current flow (per-instance):**

```
Build:
  For each instance (route + params):
    1. Slow render → slow ViewState
    2. slowRenderTransform: bake slow values, unroll forEach → pre-rendered jay-html
    3. Compile pre-rendered HTML → per-instance server-element.js
    4. Compile pre-rendered HTML → per-instance hydrate-entry.js
    5. Extract CSS → per-instance page.css
    6. Write cache.json (slowViewState, carryForward)

Serve:
  1. import(instance-specific server-element.js)
  2. Read cache.json → get carryForward
  3. Fast render → fast ViewState
  4. Merge slow + fast ViewState
  5. Server-element renders fast+interactive bindings only (slow already baked)
  6. Client loads instance-specific hydrate script
```

**Proposed flow (per-route):**

```
Build:
  Once per route:
    1. Compile original jay-html → route server-element.js (ALL bindings dynamic)
    2. Compile original jay-html → route hydrate-entry.js (phase-aware)
    3. Extract CSS → route.css
  For each instance (route + params):
    4. Slow render → slow ViewState
    5. Write cache.json (slowViewState, carryForward)

Serve:
  1. import(route server-element.js) — cached after first load
  2. Read cache.json → slowViewState + carryForward
  3. Fast render → fast ViewState
  4. Merge slow + fast ViewState
  5. Server-element renders ALL bindings from merged ViewState
  6. Client loads shared hydrate script (cached across instances)
```

### What changes

| Artifact                 | Current                             | Proposed                           |
| ------------------------ | ----------------------------------- | ---------------------------------- |
| `server-element.js`      | Per instance, bakes slow data       | Per route, all data from ViewState |
| hydrate script           | Per instance, bakes slow data       | Per route, phase-aware             |
| CSS                      | Per instance (all identical)        | Per route (single copy)            |
| `cache.json`             | Stores slowViewState + carryForward | Same (no change)                   |
| Pre-rendered `.jay-html` | Input for all compilers             | Eliminated                         |
| `slowRenderTransform`    | Bakes values + unrolls forEach      | No longer needed for compilation   |

### Coordinate consistency

With all compilers reading the same original jay-html, coordinate assignment is naturally consistent:

- `assignCoordinates` runs on the same DOM for both server-element and hydrate
- `forEach` gets a single shared scope (S1) — same in SSR output and hydrate adoption
- No `slowForEach` means no per-item scope divergence
- No coordinate shifts from conditional removal — conditionals are runtime `if` checks

### Phase-aware hydrate compilation

The hydrate compiler must become phase-aware when compiling from original jay-html:

- **Interactive bindings** (`interactivePaths`): emit coordinates, create adoption code, wire reactive updates. This is what the hydrate compiler already does for fast+interactive bindings.
- **Slow/fast-only bindings**: skip coordinate emission, no adoption code. The server-rendered content stays as-is in the DOM. The hydrate compiler already skips these via the `interactivePaths` check.

The hydrate compiler already has this logic — it uses `interactivePaths` (built from the contract) to decide coordinate emission. The change is that it now receives original jay-html (where slow bindings are still `{productName}`) instead of pre-rendered jay-html (where they're `"Widget A"`). Since slow bindings are not in `interactivePaths`, the compiler correctly ignores them.

### slowForEach → regular forEach

Slow-phase `forEach` becomes regular `forEach` in the compiled output:

- Server element: `for (const vs1 of vs.products) { ... }` — iterates at render time
- Hydrate script: `forEach(accessor, creator, trackBy)` — standard forEach adoption
- Element target: same `forEach` — no `slowForEachItem` needed

The `slowForEachItem` runtime function, `isSlowForEach` compiler handlers, and forEach unrolling in `slowRenderTransform` become dead code.

### Headless instances in slow forEach

Currently, headless component instances inside `slowForEach` are discovered and slow-rendered during pre-rendering (Pass 2 in `instance-pipeline.ts`). With the new approach:

- Headless instances inside `forEach` are discovered at build time from the original jay-html
- Their slow render still runs per instance (producing instance-specific ViewState)
- The ViewState is stored in `cache.json` under `carryForward.__instances`
- At serve time, the server element reads instance ViewState from `__headlessInstances` (existing mechanism)
- The hydrate script wires interactive bindings on the headless instance's template

## Questions

**Q1: Does this break the slow render cache?**

No. `cache.json` still stores `slowViewState` and `carryForward`. The only change is that we no longer generate pre-rendered jay-html alongside it.

**Q2: What about slow conditionals (`if` blocks on slow data)?**

The server element evaluates them at render time from the merged ViewState. The hydrate script ignores them if they're not interactive (no coordinate emitted). If a slow conditional wraps interactive content, the hydrate compiler emits a conditional adoption — this already works for fast-phase conditionals.

**Q3: How does the hydrate script get slow data for initial render?**

Same as today: the hydrate entry receives `slowViewState` (baked into the hydrate entry as a JSON literal, read from `cache.json` at build time). It merges slow + fast ViewState before hydrating. The difference is that the hydrate SCRIPT (the compiled template) is shared; only the DATA (slowViewState JSON) is per-instance.

**Q4: Can the hydrate entry still be per-instance if the hydrate script is per-route?**

Yes. The hydrate entry is a thin wrapper:

```javascript
import { hydrate } from './route.hydrate.js'; // shared
const slowViewState = {...}; // per-instance, baked from cache.json
export function init(fastViewState) {
    const vs = merge(slowViewState, fastViewState);
    hydrate(vs);
}
```

The `route.hydrate.js` is the shared compiled template. The entry file bakes the per-instance `slowViewState` and imports the shared script.

**Q5: How does this affect BaaS deployment (DL#143)?**

Major improvement. The `ArtifactStore` loads 1 server-element + 1 hydrate script per route instead of N per instance. For the golf project: 3 files instead of ~500 fetches.

**Q6: What about the `slow` attribute on forEach elements?**

The `slow` attribute in the original jay-html marks a forEach as slow-phase. With the new approach, this attribute is informational for the build pipeline (determines which forEach arrays to slow-render) but doesn't change compilation. The server-element and hydrate compilers treat it as a regular `forEach`. The `slow` attribute is already in `DIRECTIVE_ATTRIBUTES` so it's filtered from HTML output.

## Implementation Plan

### Phase 1: Server-element from original jay-html

1. Compile server-element once per route from original jay-html (ALL bindings dynamic) ✅ done
2. `forEach` (including slow-phase) compiled as loops — no unrolling ✅ done
3. Build pipeline compiles route server-element before per-instance loop ✅ done
4. Serve pipeline loads route-shared server-element ✅ done

### Phase 2: Hydrate script from original jay-html

1. Compile hydrate target once per route from original jay-html
2. Phase-aware: only interactive bindings get coordinates and adoption code
3. `forEach` (including slow-phase) uses standard `forEach` runtime — no `slowForEachItem`
4. Split hydrate entry: shared script (per-route) + data wrapper (per-instance)

### Phase 3: CSS deduplication

1. Extract CSS once per route (already identical across instances)
2. All instances reference the shared CSS file

### Phase 4: Remove slowRenderTransform from compilation path

1. `slowRenderTransform` no longer needed for server-element or hydrate compilation
2. Slow render still runs per instance → produces `cache.json`
3. Headless instance discovery + slow render still runs per instance
4. Remove per-instance pre-rendered jay-html generation (no longer used as compiler input)

### Phase 5: Clean up dead code

1. Remove `slowForEachItem` from runtime (or deprecate)
2. Remove `isSlowForEach`/`getSlowForEachInfo` handlers from compilers
3. Remove forEach unrolling from `slowRenderTransform`
4. Update test fixtures from unrolled `slowForEach` format to `forEach` format

### Phase 6: Tests

1. Verify SSR output renders correctly with all bindings dynamic
2. Verify hydration round-trip works (click handlers, reactive updates)
3. Test forEach with varying item counts across instances
4. Run smoke tests in all modes (dev, self-hosted, CDN)
5. Measure build size reduction

### Tests to remove/rewrite (use unrolled `slowForEach` format)

Server element tests (skipped — test removed `isSlowForEach` handler):

- `generate-server-element.test.ts` > "for headless instance inside slowForEach" (`contracts/page-with-headless-in-slow-foreach`)
- `generate-server-element.test.ts` > "for headless instance mixed (child, conditional, slowForEach)" (`contracts/page-with-headless-mixed`)

Element target tests (still passing — `isSlowForEach` handler not yet removed):

- `generate-element.test.ts` > "for headless instance inside slowForEach" (`contracts/page-with-headless-in-slow-foreach`)
- `generate-element.test.ts` > "for headless instance mixed" (`contracts/page-with-headless-mixed`)

Hydrate target tests (still passing — `isSlowForEach` handler not yet removed):

- `generate-element-hydrate.test.ts` > "for headless instance inside slowForEach" (`contracts/page-with-headless-in-slow-foreach`)
- `generate-element-hydrate.test.ts` > "for headless instance mixed" (`contracts/page-with-headless-mixed`)
- `generate-element-hydrate.test.ts` > "for fully static slowForEach" (`contracts/page-with-fully-static-slow-foreach`)
- `generate-element-hydrate.test.ts` > "for mixed static and headless slowForEach" (`contracts/page-with-mixed-static-slow-foreach`)

Fixture jay-html files using unrolled `slowForEach` format (candidates for rewrite to `forEach` with conditionals):

- `contracts/page-with-headless-in-slow-foreach/page-with-headless-in-slow-foreach.jay-html`
- `contracts/page-with-mixed-static-slow-foreach/page-with-mixed-static-slow-foreach.jay-html`
- `contracts/page-with-fully-static-slow-foreach/page-with-fully-static-slow-foreach.jay-html`
- `contracts/page-with-headless-mixed/page-with-headless-mixed.jay-html`

## Trade-offs

| Aspect          | Benefit                                               | Cost                                              |
| --------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Build size      | Dramatic reduction (~25MB → ~1MB for route artifacts) | None                                              |
| Build time      | 1 compilation per route vs N per instance             | None                                              |
| V8 performance  | JIT optimization, fewer modules, less memory          | Negligible: more `escapeHtml` calls               |
| Browser caching | Shared hydrate script cached across product pages     | None                                              |
| BaaS cold start | ~3 file fetches per route vs ~500                     | None                                              |
| Invalidation    | Only update cache.json, not recompile anything        | None                                              |
| Complexity      | Simpler build (fewer artifacts, no pre-rendering)     | Hydrate compiler must be phase-aware (already is) |
| Dead code       | slowForEachItem, unrolling logic removable            | Migration effort                                  |

## Future Optimization: Async Creation Branches

Once the hydrate script is shared per route and phase-aware, a further optimization becomes possible: **lazy-load creation branches via async imports**.

The hydrate script has two kinds of code for each dynamic element:

- **Adoption code** — finds the SSR-rendered element in the DOM and wires it up. Runs on every page load.
- **Creation code** — creates an element from scratch when it doesn't exist in the DOM. Only runs when a conditional flips false→true or a forEach adds a new item.

Currently both are bundled together. But creation branches are cold paths on initial load — the SSR output already has all visible elements. Creation only fires later in response to user interaction or data changes.

With per-route hydrate scripts, creation branches could become **async imports**:

```javascript
// Adoption (sync, runs immediately):
adoptElement('S1/0', div({}, [...]))

// Creation (async, loaded on demand):
createFallback: () => import('./create-branches.js').then(m => m.createS1(...))
```

This reduces the initial JS parse/execute cost. The creation code is loaded only when needed — when a user action triggers a conditional or adds a forEach item.

## Verification Criteria

1. **Fake-shop** — full build + production serve works, all pages render correctly including slowForEach products
2. **Smoke-test** — all modes pass (dev, self-hosted, CDN)
3. **Coordinate consistency** — server-element and hydrate script produce identical coordinates because they compile from the same original jay-html. No coordinate shifts.
4. **Hydration round-trip** — pages with interactive elements hydrate correctly (click handlers, reactive updates, forEach item tracking)
5. **Build size** — significant reduction in server-element + hydrate + CSS artifacts
6. **Serve-time performance** — equal or better
7. **forEach correctness** — varying item counts across instances of the same route render and hydrate correctly

## Implementation Status

### Phase 1: Server element from original jay-html — ✅ complete

- `compileRouteServerElement()` added to `server-element-compile.ts` — compiles from original jay-html, resolves paths via `resolveJayHtmlPaths` (HTML parser, relative paths per DL#143)
- Server element compiler: removed `isSlowForEach` handler, `slowForEachScope`, `insideSlowForEach`. All `forEach` (slow or fast) compiles as regular loop with shared scope
- `'slow'` added to `DIRECTIVE_ATTRIBUTES` (filtered from HTML output)
- Build pipeline (`build-pipeline.ts`): Step 3b compiles route server element before per-instance loop
- Instance pipeline (`instance-pipeline.ts`): accepts `routeServerElementPath`/`routeCssPath`, skips per-instance server element compilation
- Serve pipeline (`fetch-page-handler.ts`): uses `route.serverElementPath` (falls back to `instance.serverElementPath`)
- Types: `serverElementPath` and `routeCssPath` added to `RouteEntry`
- Test fixtures `collections/slow-for-each` and `collections/slow-for-each-dynamic-bindings` converted from unrolled `slowForEach` to `forEach` format with updated expected outputs
- 2 server element tests skipped (use unrolled `slowForEach` format, pending rewrite)
- All 647 compiler-jay-html tests pass

### Phase 2: Hydrate script from original jay-html — in progress

- `compileRouteHydrateScript()` added, compiles hydrate target from original jay-html
- Build pipeline compiles route hydrate before per-instance loop, stores `routeHydratePath` on `RouteEntry`
- Hydrate entry imports shared module via `jay-route-hydrate` import map key (external in instance build)
- Serve pipeline adds `jay-route-hydrate` to import map
- Fix: `preserveEntrySignatures: 'exports-only'` prevents Vite from tree-shaking the `hydrate` export
- Smoke tests 39/39 pass, production-server 85/85 pass
- Known issue: fake-shop slowForEach page broken — headless instances inside forEach don't render

### Phase 2 completed — per-instance client bundles eliminated

- `generateRouteHydrationEntry()` generates a per-route entry that accepts `slowViewState` as a parameter (not baked)
- Route client bundle compiled once per route in `build-pipeline.ts` via `buildInstanceClient`
- Instance pipeline no longer generates hydrate entries or runs per-instance Vite builds — only produces `cache.json`
- Serve pipeline passes `slowViewState` to `init()` in the inline script
- `jayStackCompiler` used for route hydrate build (instead of `jayRuntime`) — resolves plugin `/client` subpath imports via `plugin-client-import-resolver`
- Build output: 2 JS files per route (`route.hydrate` + `route.client`) instead of N per instance

### Phase 2b — non-interactive conditional guards

- Hydrate compiler wraps adoption of non-interactive conditional elements with spread guard: `...(condition ? [adoptElement(...)] : [])`
- Uses `parseServerCondition` with `viewState` variable (the hydrate render function parameter) for the guard expression
- Server element compiler emits `jay-coordinate` on ALL conditional elements (not just interactive ones) so hydrate can find them
- `assignCoordinates` called before `renderFunctionImplementation` in `generateElementHydrateFile` to ensure consistent ref assignment across compilers

### Phase 3: CSS deduplication — complete

- CSS extracted once per route during `compileRouteServerElement`, stored as `routeCssPath` on `RouteEntry`
- All instances reference the shared route CSS

### Phase 4: Remove slowRenderTransform from compilation path — partial

- Instance pipeline no longer calls `slowRenderTransform` — discovers headless instances from original jay-html via `loadProductionPageParts`
- `assignCoordinatesToJayHtml` runs before `discoverHeadlessInstances` in `loadProductionPageParts` to ensure consistent ref assignment
- forEach instances stored in `carryForward.__instances.forEachInstances` for serve-time processing
- Empty `.jay-html` stub files still written alongside `cache.json` (compatibility shim for `readPreRenderedHtml`)

### Phase 5: Clean up dead code — not started

- `isSlowForEach`/`getSlowForEachInfo` handlers still in element and hydrate compilers
- `isSlowForEach` handler in server element compiler kept for dev server backward compat
- `slowForEachItem` still in runtime
- forEach unrolling still in `slowRenderTransform`
- `generateHydrationEntry` (per-instance version) still exists alongside `generateRouteHydrationEntry`

### Phase 6: Tests — in progress

- Compiler-jay-html: 649 pass, 4 skipped
- Production-server: 85/85 pass
- Smoke test: 39/39 pass
- Dev-server: 674/674 pass (still uses pre-rendered path, not yet aligned)

## Pending

### Dev server alignment
The dev server still compiles from pre-rendered jay-html. Aligning it with production requires:
1. `generateSSRPageHtml` receives original jay-html + merged slow+fast ViewState
2. Server element cache keys on source jay-html path
3. Hydrate script (`?jay-hydrate`) compiled from original jay-html
4. The `interactivePaths` empty-set issue: when a contract has only slow properties, `interactivePaths` is empty — same as "no contract". The compiler can't distinguish and treats all bindings as interactive. Needs a nullable `interactivePaths` or a `hasContract` flag.

### Dead code removal
- Remove `slowForEachItem` from `@jay-framework/runtime`
- Remove `isSlowForEach`/`getSlowForEachInfo` handlers from all three compilers (server, hydrate, element)
- Remove forEach unrolling from `slowRenderTransform`
- Remove `generateHydrationEntry` (per-instance version)
- Remove empty `.jay-html` stub file generation (update serve pipeline to read `cache.json` directly)
- Update/remove test fixtures using unrolled `slowForEach` format

### Test fixture rewrites
Fixtures still using unrolled `slowForEach` format:
- `contracts/page-with-headless-in-slow-foreach` (element, hydrate, server-element)
- `contracts/page-with-mixed-static-slow-foreach` (hydrate, server-element)
- `contracts/page-with-fully-static-slow-foreach` (element, hydrate)
- `contracts/page-with-headless-mixed` (element, hydrate, server-element)

### Upload action investigation
File upload actions return 400 in production serve for the fake-shop `/upload` page. Unrelated to DL144 — action callers are correctly compiled. May be a pre-existing issue with the production action router's multipart handling (works in dev server).

## Revised Phase Model: Simplified Compilation

### Single source, binary phase distinction

The phase model for compilation collapses to one axis:

| Category            | Includes         | Compiler behavior                                                                                        |
| ------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| **Non-interactive** | slow + fast      | Rendered by server element from ViewState. Stays as-is in DOM. No `jay-coordinate`, no hydrate adoption. |
| **Interactive**     | fast+interactive | Rendered by server element. Adopted by hydrate with `jay-coordinate`. Client wires reactive updates.     |

The compiler does not need to distinguish slow from fast. Both are "data from ViewState, rendered once." The only distinction is: does the client need to find and wire this element?

### Single `.jay-html` per route

One `.jay-html` file per route serves as the single source of truth for all compilation:

```
original page.jay-html
    ↓ inject headfull FS templates
route.jay-html (with inlined headfull components)
    ↓                          ↓
server-element.ts          hydrate.ts
(SSR rendering)            (client adoption)
```

Both compilers read the same DOM, run `assignCoordinates` on the same structure, and use the same `interactivePaths` to decide coordinate emission. Coordinates are naturally consistent.

### What this eliminates

- **`slowRenderTransform` for compilation** — no longer transforms jay-html. Still runs per instance to produce `cache.json` (slowViewState + carryForward).
- **Pre-rendered `.jay-html` files** — no longer generated as compiler input.
- **`slowForEach` / `slowForEachItem`** — slow forEach is just regular `forEach` in compiled output.
- **Slow vs fast compiler switches** — the only compiler switch is `interactivePaths` (interactive vs non-interactive).
- **Per-instance server-element, hydrate, CSS** — all per-route now.

### Dev server alignment

The dev server must also compile from original jay-html (not pre-rendered) to match production behavior. This requires:

1. `generateSSRPageHtml` receives original jay-html content + merged slow+fast ViewState
2. The server element cache keys on the source jay-html path (shared across instances of the same route)
3. The hydrate script (`?jay-hydrate`) also compiles from original jay-html

The `interactivePaths` check already handles phase-awareness correctly when a contract is present. When no contract exists, all bindings are treated as interactive (existing behavior, correct default).

### Next: Eliminate per-instance client bundles

Currently each instance still gets a thin hydrate entry that bakes `slowViewState` as a JSON literal and imports the shared route hydrate script. This produces a per-instance JS file that the browser loads.

But the serve pipeline already passes `fastViewState` as a JSON argument in the inline `<script>` tag:

```javascript
await init(${JSON.stringify(fastViewState)}, ${JSON.stringify(fastCarryForward)}, ...);
```

The `slowViewState` can be passed the same way — the serve pipeline already has it from `cache.json`. The `init()` signature becomes:

```javascript
export function init(slowViewState, fastViewState, fastCarryForward, clientInitData) {
    const viewState = deepMergeViewStates(slowViewState, fastViewState, trackByMap);
    hydrate(viewState, ...);
}
```

With `slowViewState` passed at serve time instead of baked at build time, the hydrate entry is identical across all instances — it IS the shared route hydrate script. No per-instance Vite build needed.

This eliminates:

- Per-instance hydrate entry generation (`generateHydrationEntry`)
- Per-instance client Vite build (`buildInstanceClient`)
- Per-instance JS files in `frontend/pages/`
- The `jay-route-hydrate` import map key (the client bundle IS the route hydrate script)

The build pipeline simplifies to:

```
Per route:  server-element.js + hydrate.js + route.css
Per instance:  cache.json only
```

### Non-interactive conditional guards in hydrate

With per-route hydrate scripts compiled from original jay-html, non-interactive conditionals (`if` on slow/fast properties) are present in the template. The hydrate compiler sees them and generates `adoptElement` calls. But at runtime, the SSR output may omit these elements (condition was false for this instance).

Previously, non-interactive conditionals were resolved during `slowRenderTransform` — false branches were removed before the hydrate compiler saw them. Each instance had its own hydrate script that only adopted elements that existed in that instance's SSR output.

Fix: the hydrate compiler wraps adoption of non-interactive conditional elements in a ViewState ternary:

```javascript
// Before (unconditional — breaks when inStock is false):
adoptElement('S0/0/10/0', {}, [], refAddToCart());

// After (guarded — skips adoption when condition is false):
vs.inStock ? adoptElement('S0/0/10/0', {}, [], refAddToCart()) : null;
```

Since these appear inside children arrays, the parent's children array filters nulls. The ternary is sufficient because non-interactive conditions are static for the page lifetime — no create/destroy lifecycle needed.
