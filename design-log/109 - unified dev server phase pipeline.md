# Design Log #109 — Unified Dev Server Phase Pipeline

## Background

The dev server has three request handlers (`handleClientOnlyRequest`, `handlePreRenderRequest`, `handleCachedRequest`) that each implement headless instance handling as separate steps scattered across the handler code. Each handler calls `discoverHeadlessInstances`, `slowRenderInstances`, `renderFastChangingDataForInstances`, and `renderFastChangingDataForForEachInstances` independently with different gating logic. This causes:

- **Test 7a** (fast-only page + headless): `slowRenderInstances` skips instances without `withSlowlyRender` (line 75: `if (!comp.compDefinition.slowlyRender) continue`). Returns `undefined` when no instances have slow data. This blocks the fast phase gate → widget data never reaches `__headlessInstances`.
- **Test 7b** (interactive-only page): SSR renders "undefined" for all values. After hydration, the interactive constructor provides values but `hydrateCompositeJayComponent` doesn't trigger an initial update → adopted DOM stays "undefined".

DL#107 identified this as "Phase 5 pre-processing extraction."

## Problem

### Instance handling is fragmented across handlers

Each handler duplicates ~50 lines of instance handling: discovery → slow render → fast render → merge into `__headlessInstances`. The logic differs subtly between handlers (e.g., `handleClientOnlyRequest` skips validation, cached handler reads from cache, pre-render handler writes to cache).

### `slowRenderInstances` skips fast-only instances

`instance-slow-render.ts:75` — `if (!comp || !comp.compDefinition.slowlyRender) continue;` — fast-only instances are never added to `discoveredForFast`, so their `fastRender` is never called.

### Interactive-only pages lack initial hydration update

`hydrateCompositeJayComponent` adopts SSR DOM and constructs interactive parts, but never calls `update()` with the constructor's initial render output.

## Design

### Absorb instance handling into the existing runners

Instead of running instance discovery and rendering as separate steps in each handler, absorb them into `loadPageParts`, `runSlowlyForPage`, and `renderFastChangingData`.

### Change 1: `loadPageParts` — add instance discovery

`loadPageParts` already reads the jay-html and processes headless imports. It knows the `headlessInstanceComponents`. Add discovery here.

**Current:** Returns `headlessInstanceComponents` (component definitions) and `headlessContracts` (key-based contracts). Discovery happens later in each handler.

**New:** Also runs `discoverHeadlessInstances()` on the jay-html content and returns `discoveredInstances` and `forEachInstances` alongside the existing data.

```typescript
// Add to LoadPagePartsResult:
discoveredInstances: DiscoveredHeadlessInstance[];
forEachInstances: ForEachHeadlessInstance[];
```

**Note:** For the pre-render path, discovery must run on the pre-rendered HTML (after `slowRenderTransform`). So the pre-render handler calls `loadPageParts` twice: once with original jay-html (to get component definitions), then after slow render with the pre-rendered jay-html (to get discovery results). The second call can pass the pre-rendered content to `loadPageParts` via the existing `preRenderedPath` option, which re-parses and re-discovers.

**File:** `packages/jay-stack/stack-server-runtime/lib/load-page-parts.ts`

### Change 2: `runSlowlyForPage` — absorb instance slow render

**Current:** Only runs `slowlyRender` for key-based parts. Returns `phaseOutput(slowViewState, carryForward)`.

**New:** Also runs `slowlyRender` for discovered instances (from Change 1). Returns a uniform result that always includes `instancePhaseData` (even if empty).

```typescript
// Extended return type:
interface SlowPhaseResult {
  rendered: object; // page slow ViewState
  carryForward: object; // page carryForward
  instancePhaseData: InstancePhaseData; // always present
  instanceSlowViewStates: Record<string, object>; // for resolveHeadlessInstances
  instanceResolvedData: Array<{ coordinate; contract; slowViewState }>; // for resolveHeadlessInstances
}
```

The key change: instances WITHOUT `slowlyRender` are still added to `instancePhaseData.discovered` — they just have empty carryForward. This ensures the fast phase always sees them.

**File:** `packages/jay-stack/stack-server-runtime/lib/slowly-changing-runner.ts`

### Change 3: `renderFastChangingData` — absorb instance fast render

**Current:** Only runs `fastRender` for key-based parts. Instance fast render is done by separate functions (`renderFastChangingDataForInstances`, `renderFastChangingDataForForEachInstances`) called from each handler.

**New:** Also runs fast render for instances. Receives `instancePhaseData` and `headlessInstanceComponents` as parameters. Returns `__headlessInstances` merged into the fast ViewState.

```typescript
// Extended signature:
function renderFastChangingData(
  pageParams,
  pageProps,
  carryForward,
  parts,
  // New parameters:
  instancePhaseData?: InstancePhaseData,
  headlessInstanceComponents?: HeadlessInstanceComponent[],
  mergedSlowFastViewState?: object, // needed for forEach instance array resolution
): Promise<AnyFastRenderResult>; // returned viewState includes __headlessInstances
```

Handles both static instances and forEach instances. For instances without `slowlyRender`, calls `fastRender(props, ...services)`. For instances with `slowlyRender`, calls `fastRender(props, carryForward, ...services)`.

**File:** `packages/jay-stack/stack-server-runtime/lib/fast-changing-runner.ts`

### Change 4: Simplify request handlers

With Changes 1-3, each handler becomes:

```
loadPageParts() → parts + discoveredInstances + forEachInstances
runSlowlyForPage(parts, discoveredInstances) → slowVS + instancePhaseData
[pre-render only: slowRenderTransform + resolveHeadlessInstances]
renderFastChangingData(parts, instancePhaseData, ...) → fastVS with __headlessInstances
sendResponse()
```

Remove: `renderFastChangingDataForInstances`, `renderFastChangingDataForForEachInstances` from `dev-server.ts` (they move into `renderFastChangingData`). Remove instance handling boilerplate from all three handlers.

**File:** `packages/jay-stack/dev-server/lib/dev-server.ts`

### Change 5: Fix interactive-only hydration (7b)

In `hydrateCompositeJayComponent`: after constructing interactive parts and producing the initial render, call `element.update(viewState)` so adopted DOM nodes reflect the constructor's values.

**File:** `packages/jay-stack/stack-client-runtime/lib/hydrate-composite-component.ts`

## Implementation Plan

### Phase 1: `loadPageParts` — add discovery

1. Import `discoverHeadlessInstances` in `load-page-parts.ts`
2. After parsing jay-html, run discovery and add results to return type
3. Update `LoadPagePartsResult` interface

### Phase 2: `runSlowlyForPage` — absorb instance slow render

1. Accept `discoveredInstances` and `headlessInstanceComponents` parameters
2. After running key-based parts, run instance slow render (from `slowRenderInstances` logic)
3. Always include instances in `instancePhaseData.discovered` (even without slow data)
4. Return `instancePhaseData`, `instanceSlowViewStates`, `instanceResolvedData`

### Phase 3: `renderFastChangingData` — absorb instance fast render

1. Accept `instancePhaseData`, `headlessInstanceComponents`, `mergedViewState` parameters
2. After running key-based parts, run instance fast render (from `renderFastChangingDataForInstances` logic)
3. Run forEach instance fast render (from `renderFastChangingDataForForEachInstances` logic)
4. Merge `__headlessInstances` into returned viewState

### Phase 4: Simplify handlers

1. Update all three handlers to use the unified flow
2. Remove `renderFastChangingDataForInstances` and `renderFastChangingDataForForEachInstances` from `dev-server.ts`
3. Remove duplicate instance handling code

### Phase 5: Fix interactive-only hydration (7b)

1. `hydrateCompositeJayComponent`: trigger initial `update()` after interactive constructor

### Phase 6: Unskip tests 7a and 7b, verify

## Files to modify

- `packages/jay-stack/stack-server-runtime/lib/load-page-parts.ts` — add discovery
- `packages/jay-stack/stack-server-runtime/lib/slowly-changing-runner.ts` — absorb instance slow render
- `packages/jay-stack/stack-server-runtime/lib/fast-changing-runner.ts` — absorb instance fast render
- `packages/jay-stack/dev-server/lib/dev-server.ts` — simplify handlers, remove duplicated functions
- `packages/jay-stack/stack-client-runtime/lib/hydrate-composite-component.ts` — initial update
- `packages/jay-stack/dev-server/test/hydration.test.ts` — unskip 7a, 7b

## Verification

1. Test 7a passes — fast-only page with headless instance renders in all modes
2. Test 7b passes — interactive-only page updates DOM after hydration in all modes
3. Tests 1-6a unchanged — no regressions (182 tests)

## Implementation Results

### Completed

**Phase 1** — `loadPageParts` now runs `discoverHeadlessInstances` on the jay-html content and returns `discoveredInstances` and `forEachInstances` in `LoadedPageParts`.

**Phase 2** — `runSlowlyForPage` accepts `discoveredInstances` and `headlessInstanceComponents`. Runs instance slow render after key-based parts. Always includes all discovered instances in `instancePhaseData.discovered` (even without `slowlyRender`). Stores instance data in `carryForward.__instances`, `__instanceSlowViewStates`, `__instanceResolvedData`.

**Phase 3** — `renderFastChangingData` accepts `instancePhaseData`, `forEachInstances`, `headlessInstanceComponents`, `mergedSlowViewState`. Runs static instance fast render and forEach instance fast render. Merges `__headlessInstances` into returned viewState/carryForward. Handles instances without `slowlyRender` (calls `fastRender(props, ...services)` without carryForward).

**Phase 4** — `handleClientOnlyRequest` simplified to use unified flow (discovery from `loadPageParts`, slow from `runSlowlyForPage`, fast from `renderFastChangingData`). `handlePreRenderRequest` simplified: after caching, delegates to `handleCachedRequest` instead of duplicating the fast phase. `handleCachedRequest` updated to use unified `renderFastChangingData`. Removed `renderFastChangingDataForInstances`, `renderFastChangingDataForForEachInstances`, `resolvePathValue`, `resolveBinding` from `dev-server.ts` (moved to `fast-changing-runner.ts`).

**Phase 5 (partial)** — Fix in `component.ts`: after first render (`element = render(viewState)`), calls `element.update(viewState)` to propagate initial values to adopted DOM nodes. Runtime tests pass (56 component, 249 runtime). However, test 7b SSR mode still shows "undefined" — the fix is in the dist but Vite's module resolution in the test doesn't pick it up. SSR-disabled mode passes.

**`preRenderJayHtml`** — Always populates `instancePhaseData` when instances are discovered, even without slow data. This ensures fast-only instances are visible to the fast phase.

### Deviations

- **Change 5 target changed** — The initial update fix was applied in `component.ts` (`makeJayComponent`) instead of `hydrate-composite-component.ts`. The fix is in the shared component creation path, affecting both element and hydrate targets. This is correct — both paths need the initial update.
- **`handlePreRenderRequest` delegates to `handleCachedRequest`** — Not in the original design but a natural simplification. After caching the pre-render result, the handler creates a cache entry and delegates, eliminating ~60 lines of duplicated fast-phase code.
- **`preRenderJayHtml` still does its own discovery** — Discovery couldn't fully move to `loadPageParts` for the pre-render path because discovery must run on the pre-rendered HTML (after `slowRenderTransform`). The pre-render handler loads parts twice: first for component definitions, then `preRenderJayHtml` discovers on the transformed HTML.
- **Test 7b remains skipped** — The `component.ts` fix is correct (runtime tests pass) but the Vite dev server test doesn't pick up the change. Needs investigation into Vite module resolution for workspace packages.

### Test results

- Tests 1-7a: 195 pass, 0 fail, 13 skipped (7b only)
- stack-server-runtime: 89 pass
- runtime component: 56 pass
- runtime: 249 pass

4. `cd packages/jay-stack/stack-server-runtime && yarn vitest run` — runtime tests pass
5. `cd packages/compiler/compiler-jay-html && yarn vitest run` — compiler tests pass

## Bug Fix: slowForEach headless instance coordinate mismatch

**Discovered during DL#110 implementation.**

### Problem

When a `<jay:xxx>` headless instance is wrapped in a container element inside a slowForEach, the `__headlessInstances` lookup key in the compiled server-element doesn't match the key produced by the fast renderer.

```html
<!-- Works (direct child): coordinate = "1/widget:AR0" -->
<div forEach="items" trackBy="_id">
  <jay:widget itemId="{_id}">...</jay:widget>
</div>

<!-- Broken (wrapped): coordinate = "1/0/widget:AR0" -->
<div forEach="items" trackBy="_id">
  <div class="card">
    <jay:widget itemId="{_id}">...</jay:widget>
  </div>
</div>
```

The server-element compiler took ALL coordinate segments before the instance suffix as the prefix (including intermediate coordinate-bases like `0` from wrapper elements). But `discoverHeadlessInstances` only produces `[trackByValue, instanceSuffix]` — no intermediate bases. The fast renderer joins these to create the `__headlessInstances` key.

### Fix

In `jay-html-compiler.ts`, both the server-element and hydrate targets computed the slowForEach prefix as `coordSegments.slice(0, suffixIndex).join('/')`. Changed to use only `coordSegments[0]` (the trackBy value), matching the discovery coordinate format. The decision to exclude intermediate element coordinates was already established for forEach — this aligns slowForEach with the same rule.

Also stripped `<script type="application/jay-cache">` tags in the Vite plugin's `loadJayFile` hook (`rollup-plugin/lib/runtime/load.ts`), since pre-rendered files now embed cache metadata on disk (DL#110).

### Test

Added test `5d2-page-headless-slow-foreach-wrapped` — same as 5d but with a `<div class="card">` wrapper between forEach and `<jay:widget>`. This reproduces the fake-shop pattern.

### Files changed

- `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts` — fix prefix computation (2 locations: server + hydrate targets)
- `packages/compiler/rollup-plugin/lib/runtime/load.ts` — strip cache tag in Vite load hook
- `packages/jay-stack/dev-server/test/5d2-page-headless-slow-foreach-wrapped/` — new test fixture
- `packages/jay-stack/dev-server/test/hydration.test.ts` — test 5d2
