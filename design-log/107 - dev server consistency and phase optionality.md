# Design Log #107 — Dev Server Consistency and Phase Optionality

## Background

During integration testing of DL#106 (hydration with Kindergarten), multiple inconsistencies were discovered in how the dev server handles different component configurations. These cause hard-to-debug failures when component phase combinations differ from the tested paths.

## Problems

### 1. Slow render cache on/off produces different behavior

The dev server has a `dontCacheSlowly` option. When the slow render cache is enabled, a full pre-render pipeline runs: `slowRenderTransform` → `discoverHeadlessInstances` → `resolveHeadlessInstances` → `assignCoordinates` → `renderFastChangingDataForInstances/ForEachInstances`. When disabled, much of this pipeline is skipped, and headless instances inside forEach are never discovered or rendered server-side.

**Expected:** The dev server should produce the same output regardless of the cache setting. The cache should only affect performance (avoid re-running slow render on every request), not correctness.

### 2. Component phases are optional but the pipeline assumes specific combinations

A full-stack component can have any combination of phases:

- Slow only: `withSlowlyRender()`
- Fast only: `withFastRender()`
- Slow + fast: `withSlowlyRender().withFastRender()`
- Slow + fast + interactive: all three
- Fast + interactive: `withFastRender().withInteractive()`

Current issues:

- A fast-only component (no slow phase) inside a forEach is never discovered because discovery runs on the slow-rendered HTML and only finds instances whose slow bindings were resolved.
- If no fast phase, the carry forward for the interactive phase should be empty (`{}`), but some code paths don't handle this.
- If no slow phase, `fastRender` receives `(props, ...services)` instead of `(props, carryForward, ...services)` — this is correct but fragile and inconsistent with the slow+fast case.

### 3. Client script should work with or without fast/slow parts

A component with an interactive phase should work on the client regardless of whether it has slow or fast server phases. Currently:

- Without `withInteractive()`, no client code is needed — this works.
- With `withInteractive()` but without `withFastRender()`, the composite component's `hasFastRendering` is false, so it doesn't pass `fastViewState` signals to parts. The interactive constructor then receives wrong parameters.
- The `HEADLESS_INSTANCES` context is only provided when `__headlessInstances` data exists in the viewState. If the server didn't produce it (e.g., no slow cache), the context is missing and `useContext` throws.

### 4. No option to disable SSR

For development, it would be useful to disable SSR entirely and only serve client scripts without hydration. The page would render entirely on the client via the element target (not the hydrate target). This simplifies debugging when SSR/hydration issues are blocking development.

**Proposed:** A global dev server setting `ssr: false` that:

- Serves an empty `<div id="target"></div>` instead of SSR HTML
- Uses the element target (not hydrate target) for the client script
- Skips all server rendering phases

### 5. Build folder not cleared on dev server start

The `build/` directory (containing pre-rendered HTML, server-element files, coordinate debug output) persists between dev server restarts. Stale artifacts from previous runs can cause hydration mismatches when code changes.

**Proposed:** Clear the `build/` directory on dev server startup.

### 6. `loadParams` called on every request

The `loadParams` function (which resolves route parameters) is called on every request and every page. The result should be cached for the lifecycle of the dev server, since route params don't change during a session.

**Proposed:** Cache `loadParams` result in the dev server instance. Invalidate only on file changes that affect route definitions.

## Implementation Plan

### Phase 1: Build folder cleanup

- Clear `build/` directory on `mkDevServer()` startup
- Low risk, immediate value

### Phase 2: loadParams caching

- Cache in the dev server instance
- Invalidate on route file changes

### Phase 3: SSR disable option

- Add `ssr: boolean` to dev server options (default `true`)
- When `false`: empty target div, element target script, skip server rendering

### Phase 4: Phase optionality consistency

- Ensure `HEADLESS_INSTANCES` context is always provided (even if empty)
- Handle missing fast/slow phases gracefully in all code paths
- Test matrix: all phase combinations × static/forEach/slowForEach instances

### Phase 5: Extract coordinate pre-processing from compiler targets

Currently `assignCoordinates` runs inside `generateServerElementFile` and `renderHydrate` independently, and `discoverHeadlessInstances` auto-generates refs independently too. This causes synchronization issues (DL#106: counter mismatch, `buildCoordinatePrefix` vs `assignCoordinates`).

**Refactoring:** Extract into a single pre-processing stage in the dev server:

1. **Always runs** — regardless of slow render cache setting
2. **Single pass:** auto-generate refs for all `<jay:xxx>` elements, then `assignCoordinates`
3. **Output:** jay-html with `ref` attributes and `jay-coordinate-base` attributes
4. **Cached:** saved to `build/pre-processed/page.jay-html` (distinct from slow render cache at `build/pre-rendered/page.jay-html`)
5. **Both compiler targets read it** — server-element and hydrate compile from the pre-processed file, never running `assignCoordinates` themselves

This subsumes phases 4 and 5:

- **Phase 4 (phase optionality):** pre-processing runs for all pages, so headless instances are always discovered even without slow cache
- **Phase 5 (slow cache parity):** one pipeline, one output — both cached and uncached paths are identical

The pipeline becomes:

```
jay-html → [pre-process: refs + coordinates] → pre-processed.jay-html
                                                    ↓
                                              [slow render (if enabled)] → pre-rendered.jay-html
                                                    ↓
                                              [discover headless instances]
                                              [resolve slow bindings]
                                              [fast render for instances]
                                                    ↓
                                              server-element compiler ← reads pre-rendered or pre-processed
                                              hydrate compiler        ← reads pre-rendered or pre-processed
```

## Verification Criteria

1. All 6a–6e hydration tests pass with both `useSlowRenderCache: true` and `false`
2. Fake-shop example works correctly (mood tracker, static widgets, forEach widgets)
3. `yarn test` passes for all 68 packages
4. Dev server starts with clean build directory
5. `loadParams` called once per dev server lifecycle
6. Compiler targets never call `assignCoordinates` — they read pre-assigned coordinates from the input HTML

## Implementation Progress

### Completed

**`HEADLESS_INSTANCES` context always provided** — Both `hydrateCompositeJayComponent` and `makeCompositeJayComponent` now always push the `HEADLESS_INSTANCES` context to `provideContexts`, even when `__headlessInstances` is empty. Previously, `useContext(HEADLESS_INSTANCES)` would throw when no server data existed (e.g., no slow cache, fast-only page). Now headless instance constructors gracefully fall back to `clientDefaults` or empty data.

**`adoptText` DOM reconciliation** — `adoptText` now initializes `content` from the DOM text (not the accessor) so the first update detects SSR-to-hydration ViewState mismatches. Fixes interactive-only pages where SSR renders "undefined" but the interactive constructor provides real values.

**`assignCoordinates` auto-generates refs** — When a `<jay:xxx>` element has no `ref` attribute, `assignCoordinates` auto-generates one using an `AR` prefix with a global counter per contract (e.g., `AR0`, `AR1`). This matches `discoverHeadlessInstances`'s counter scoping and ensures both systems produce the same refs. Eliminates the counter synchronization bug for the non-cached code path.

**`fixtureVariant` option for test infrastructure** — Replaced `skipFixtures` with `fixtureVariant` (e.g., `'no-cache'`) which looks for alternate fixture files like `expected-ssr-no-cache.html`. Allows the same fixture directory to be tested with different configurations.

**forEach carry forward** — `renderFastChangingDataForForEachInstances` now returns `{ viewStates, carryForwards }` (matching the static instance function). All call sites updated to merge carry forwards into `fastCarryForward.__headlessInstances`.

### New tests added

- **7a**: forEach without slow cache — **passes**
- **7b**: Two static instances without slow cache — **passes**
- **7c**: Fast-only page with headless instance — **fails** (page has no slow phase → dev server doesn't run slow render → no instance discovery)
- **7d**: Interactive-only page (no slow, no fast) — **fails** (SSR renders "undefined" → DOM update timing issue)

### Remaining work (not yet implemented)

- **Build folder cleanup on startup** — reverted because it interfered with slow render cache timing. Needs smarter approach (clear stale artifacts without breaking active caches).
- **7c fix** — fast-only page needs the pre-render pipeline to discover headless instances even without a slow phase.
- **7d fix** — interactive-only page needs the adoptText reconciliation to fire before the first DOM check.
- **AR prefix fixture cascade** — changing auto-ref naming from `"0"` to `"AR0"` requires updating all slow-render, server-element, and hydrate fixtures.
- **Phase 5 pre-processing extraction** — the full DL#107 structural fix (single pre-processing stage) is not yet implemented.
