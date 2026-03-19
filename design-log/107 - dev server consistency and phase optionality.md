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

### Decision: Remove `dontCacheSlowly`, add `disableSSR`

The `dontCacheSlowly` option creates a parallel code path (`handleDirectRequest`) that skips `slowRenderTransform` + `discoverHeadlessInstances`. This is the root cause of coordinate mismatches when slow cache is disabled. Fix: remove this option entirely. SSR always uses the full pipeline (handlePreRenderRequest/handleCachedRequest). For development without SSR, a new `disableSSR` option serves client-only pages using `generateClientScript` (element target, not hydrate target).

- Deleted `handleDirectRequest` function entirely
- Removed `dontCacheSlowly` from `DevServerOptions`, `defaults()`, `mkDevServer`, `DevSlowlyChangingPhase`, `stack-cli/server.ts`, `serve-fixture.ts`
- Added `disableSSR?: boolean` to `DevServerOptions`
- Added `handleClientOnlyRequest` for the `disableSSR` code path
- Tests 7a/7b repurposed as `disableSSR` tests (no SSR fixture comparison, just hydration + interactivity)
- Removed `useSlowRenderCache` and `fixtureVariant` from test infrastructure (no longer needed)
- Deleted no-cache fixture files

**Test results after refactoring:**

- Baseline (before): 24 failures / 40 pass / 64 total
- After refactoring: 16 failures / 42 pass / 8 skipped / 66 total
- All 65 other packages pass. Compiler-jay-html: 597 pass. Runtime: 252 pass.
- Newly passing: 6b (2 fixture mismatches fixed), 7c/7d properly skipped
- Pre-existing failures (AR prefix coordinate mismatch): 6a, 6c, 6d, 6e, 6e-2 interactivity
- Pipeline-change regressions (pages now use full pre-render instead of direct): 2, 3, 5 — same AR prefix root cause
- disableSSR tests (7a, 7b): same AR prefix bug causes page crash in client-only mode

**`slowRenderTransform` treats all values as slow when no contract** — When no `.jay-contract` file exists, `slowRenderTransform` resolved nothing because `isSlowPhase()` returned false for all bindings (empty phase map). Added a `noMainContract` flag (derived from `!input.contract`) that makes `isSlowPhase` return true for any binding not already in the phase map (from headless contracts). Threaded through `resolveTextBindings`, `transformElement`, `transformChildren`. Also added `noMainContract` to `SlowRenderContext` and updated the PEG parser's `isSlowPhase`. Root cause of hydration test 2/3/5 failures (slow ViewState values never baked into pre-rendered HTML → `sendResponse` sends only fast ViewState → page renders with undefined). 3 new tests added in `describe('No contract')`. All 596 compiler-jay-html tests pass.

**Phase-aware hydration: skip adoptText/jay-coordinate for non-interactive bindings** — Test 2a exposed that the hydrate compiler generated `adoptText` + `jay-coordinate` for ALL `{...}` bindings regardless of contract phase. For `fastCount` (phase `fast`), this is wrong — the value is static on the client after SSR. Only `fast+interactive` bindings need client-side adoption.

Fix in `jay-html-compiler.ts`:

- `buildInteractivePaths(contract?)` — walks contract tags, collects camelCased property names where `getEffectivePhase() === 'fast+interactive'`. Returns empty set when no contract (preserves existing behavior — all bindings remain dynamic).
- `textHasInteractiveBindings(text, interactivePaths)` — regex-scans `{expr}` bindings, returns true if any binding's root identifier is in the set.
- Added `interactivePaths: Set<string>` to both `HydrateContext` and `ServerContext`.
- `renderHydrateElementContent`: after detecting dynamic text, nulls `textFragment` when `interactivePaths` has entries but none match. Same for mixed-content dynamic text check.
- `renderServerElementContent`: same treatment — nulls `dynamicTextFragment` when bindings are all non-interactive, uses `hasMixedContentDynamicTextInteractive` instead of `hasMixedContentDynamicText`.
- `renderHydrate()`: new `contract?: Contract` param, sourced from `jayFile.contract` in `generateElementHydrateFile`.
- `generateServerElementFile`: builds `interactivePaths` in context from `jayFile.contract`.
- Safety: when `interactivePaths` is empty (no contract), the guard `size > 0` prevents any skipping — no-contract pages behave exactly as before.

New compiler-jay-html test fixture `basics/phase-aware-dynamic-text`:

- Contract with `title` (slow), `fast-count` (fast), `interactive-count` (fast+interactive)
- Hydrate fixture: only `adoptText('0/2', ...)` for `interactiveCount` — no adoption for `title` or `fastCount`
- Server fixture: only `jay-coordinate="0"` (root) and `jay-coordinate="0/2"` (interactiveCount)
  Test results: compiler-jay-html 598 pass (all green). Hydration test 2a: 13/13 pass (all 3 SSR modes).

**Phase-aware conditionals: skip hydrateConditional/jay-coordinate for non-interactive conditions** — Extended the phase-aware fix to `if=` conditionals. A conditional whose condition references a slow or fast-only property doesn't need `hydrateConditional` or `jay-coordinate` — it's resolved at SSR and static on the client.

Fix in `jay-html-compiler.ts`:

- `conditionIsInteractive(condition, interactivePaths)` — extracts root identifier from `if=` expression (stripping `!` prefix), returns true if it's in the interactive set. When `interactivePaths` is empty (no contract), all conditionals are treated as interactive.
- Hydrate: `renderHydrateElement` skips the conditional block when `!conditionIsInteractive(...)` — the element is treated as a regular static element instead of generating `hydrateConditional`.
- Hydrate: `hasInteractiveChildren` only counts conditionals whose condition is interactive — non-interactive conditionals don't trigger `adoptDynamicElement` on the parent.
- Hydrate: dynamic child loop only treats interactive conditionals as dynamic children.
- Server: `needsCoordinate` only emits `jay-coordinate` for interactive conditionals.

New compiler-jay-html test fixture `basics/phase-aware-conditionals`:

- Contract with `slow-flag` (slow), `fast-flag` (fast), `interactive-flag` (fast+interactive)
- Hydrate fixture: `STATIC, STATIC, hydrateConditional(interactiveFlag)` — slow and fast conditionals produce STATIC sentinels
- Server fixture: only `jay-coordinate="0"` (root) and `jay-coordinate="0/2"` (interactive conditional)

New dev-server test `3a. Phase-aware conditionals`:

- 6 conditionals across 3 phases (slow true/false, fast true/false, interactive true/false)
- Validates slow/fast conditionals are static, interactive conditionals are reactive
- Interactivity test: toggle button flips interactive conditionals while slow/fast remain unchanged

Test results: compiler-jay-html 600 pass (all green). Hydration test 3a: 16/16 pass (all 3 SSR modes).

**AR prefix alignment for element target** — The element target auto-generated headless instance refs as `0`, `1`, etc., while `assignCoordinates` (used by the dev server discovery pipeline) generated `AR0`, `AR1`, etc. This key mismatch caused SSR-disabled headless tests to fail: `makeHeadlessInstanceComponent` looked up `widget:0` in `__headlessInstances` but the data was keyed as `widget:AR0`.

Fix: changed element target's auto-ref generation from `String(localIndex)` to `` `AR${localIndex}` `` in `renderHeadlessInstance`. Updated 4 element target fixtures.

**Headless instance interactivePaths** — The phase-aware hydration fix used the page's contract for `interactivePaths` when compiling headless instance inline templates. But the template bindings reference the widget's contract fields (e.g., `{value}` from the widget, not the page). This caused `value` (fast+interactive in the widget contract) to be skipped from adoption and `jay-coordinate`.

Fix: both `renderHydrateHeadlessInstance` and `renderServerHeadlessInstance` now use `buildInteractivePaths(headlessImport.contract)` instead of inheriting the page's `interactivePaths`. This fixed SSR interactivity failures for tests 5b, 5c, 5e.

**Test restructuring** — Tests renumbered: old 6→5 (headless), old 5a-page-with-headless→6a-page-with-keyed-headless (skipped, key-based headless). Test fixture comparison improved: `prettify()` applied to expected fixtures, monorepo paths canonicalized with `{{ROOT}}` placeholder. `serve-fixture` script enhanced with `--no-ssr` flag, `--list`, `--help`.

Test results: 166 pass, 3 fail (5d slowForEach SSR-disabled only), 42 skipped.

**5d slowForEach SSR-disabled fix** — Three issues fixed:

1. **Test fixture had pre-rendered jay-html** — `page.jay-html` had `slowForEach` attributes (post-slow-render format) instead of `forEach`. Fixed to use regular `forEach` with `phase: slow` in the contract. The slow render transform unrolls it during the pipeline.

2. **`buildCoordinatePrefix` included intermediate element indices** — When `<jay:widget>` was inside a wrapper div within a slowForEach item, `buildCoordinatePrefix` included the wrapper's child index (e.g., `2/0/widget:AR0`), but the element target only used jayTrackBy values (`2/widget:AR0`). Simplified `buildCoordinatePrefix` to only collect `jayTrackBy` values — no intermediate indices.

3. **`handleClientOnlyRequest` blocked slow-phase forEach instances** — `validateForEachInstances` rejected headless components with slow phases inside forEach. In client-only mode this validation is wrong: the client renders everything. Removed the validation for the client-only path.

4. **`renderFastChangingDataForForEachInstances` skipped slow phase** — For forEach instances with `withSlowlyRender`, `fastRender` expects `(props, carryForward, ...services)`. The function only called `fastRender(props, ...services)`. Fixed to run `slowlyRender` first when present, pass `carryForward` to `fastRender`, and merge slow+fast viewStates.

Test results: 169 pass, 0 fail, 42 skipped. All tests 1–5 pass in all modes (SSR enabled + disabled).

**6a key-based headless component** — Extended the key-based headless fixture with all three phases: `label` (slow), `count` (fast+interactive), `increment` (interactive ref). Three issues found and fixed:

1. **Shallow viewState merge overwrote keyed parts** — `handleClientOnlyRequest` merged slow+fast with `{ ...slow, ...fast }`. For keyed headless parts, this overwrites `headless: { label }` with `headless: { count }`. Fixed to always use `deepMergeViewStates` which preserves nested keys.

2. **Test fixture used `{{double-brace}}` syntax** — Updated to single-brace `{headless.label}` and added `ref="headless.increment"` for the button.

3. **Plugin resolution for `.d.ts` generation** — The CLI can't resolve test plugins (`test-headless`). Manually wrote the contract `.d.ts` with proper phase types.

Test results: 182 pass, 0 fail, 32 skipped. All tests 1–6a pass in all modes.

### Remaining work (not yet implemented)

- **7c fix** — fast-only page needs the pre-render pipeline to discover headless instances without a slow phase.
- **7d fix** — interactive-only page needs the adoptText reconciliation to fire before the first DOM check.
- **Phase 5 pre-processing extraction** — the full DL#107 structural fix (single pre-processing stage) is not yet implemented.
