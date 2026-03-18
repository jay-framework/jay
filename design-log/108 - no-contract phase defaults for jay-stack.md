# Design Log #108 — No-Contract Phase Defaults for Jay Stack

## Background

Jay Stack components use three-phase rendering: slow (build time), fast (SSR request time), fast+interactive (SSR + client reactive). When a `.jay-contract` exists, each field has an explicit phase annotation. When no contract exists (inline `jay-data`), the framework must decide which phase each binding belongs to.

Two conflicting decisions exist:

- **DL#51** (type generation): Without a contract, all data is `interactive` → `SlowViewState = {}`, `FastViewState = {}`, `InteractiveViewState = PageViewState`. Rationale: backward compatibility with client-only Jay.
- **DL#107** (`noMainContract` flag): Without a contract, slow render treats all bindings as slow → resolves them from the slow ViewState. Rationale: practical fix so SSR produces HTML.

This contradiction causes test 4b to fail: the component puts data in `withFastRender`, but the slow render resolves bindings from an empty slow ViewState → "undefined".

## Problem

### 1. Jay Stack requires `fast+interactive`, not `interactive` alone

Jay Stack always renders SSR. SSR requires data at request time (fast phase). A binding that is only `interactive` (client-only) has no server-side value — SSR renders "undefined".

Client-only Jay (no SSR) can have `interactive`-only bindings because there's no server render. But Jay Stack pages always go through SSR.

Therefore: in Jay Stack, the minimum phase for data is `fast+interactive`, never `interactive` alone.

### 2. No-contract pages should not have a slow phase

Without a contract, there's no way to distinguish slow vs fast bindings. The `noMainContract` flag in DL#107 treats everything as slow, but this only works if the slow ViewState actually contains the data. If the component puts data in `withFastRender` (which the types currently allow), slow render produces "undefined".

The safest option: without a contract, all data is `fast+interactive`. No slow phase. If a component without a contract defines `withSlowlyRender` that returns data, that's an error — there's no contract to tell the framework which bindings are slow.

## Questions

**Q1: Tests 2b and 3b currently put all data in `withSlowlyRender`. After this fix, slow render resolves nothing without a contract — don't those tests need to move data to `withFastRender`?**

A: Yes. Tests 2b, 3b, and 4b all need updating. 2b and 3b move data from `withSlowlyRender` to `withFastRender`. 4b already uses `withFastRender` but has a no-op `withSlowlyRender` that should be removed.

**Q2: DL#107 added 3 tests in `describe('No contract')` for the slow-render-transform. Removing `noMainContract` will break those — what happens to them?**

A: The three affected tests are 2b, 3b, and 4b in the dev-server hydration tests. We fix them as part of this change.

**Q3: Should `withSlowlyRender` returning data without a contract be a warning or an error?**

A: Error. Without a contract, there's no way to know which bindings are slow. Data returned from `withSlowlyRender` would be silently ignored, which is always a bug.

**Q4: Does the phase-aware hydration fix (interactivePaths) need changes?**

A: No. Without a contract, `interactivePaths` is empty, so the guard `size > 0` prevents any skipping — all bindings are treated as dynamic. This is correct: all data is `fast+interactive`, so all bindings need client adoption.

**Q5: What about `slowForEach` without a contract? If slow render resolves nothing, the `forEach` won't be unrolled.**

A: There is no `slowForEach` without a slow phase. The slow render creates `slowForEach` items by unrolling forEach elements whose array is slow. Without a contract, no arrays are slow, so no unrolling happens. The forEach stays intact for the server-element target to iterate at SSR time.

**Q6: Fix 1 changes type defaults for all jay-html files. Does this affect client-only Jay (non-stack)?**

A: No. Client-only Jay uses the same `.d.ts` files (e.g., `examples/jay/async-counter/src/counter.jay-html.d.ts`). Jay's client-only component is exactly the same as the Jay Stack interactive part — Jay is the client component of Jay Stack. The client-only component just ignores the fast ViewState type. Having `FastViewState = PageViewState` is harmless for client-only usage.

## Design

### Fix 1: Change no-contract type defaults to `fast+interactive`

When generating phase-specific types for a jay-html without a contract:

```typescript
// Current (DL#51 — wrong for Jay Stack)
export type PageSlowViewState = {};
export type PageFastViewState = {};
export type PageInteractiveViewState = PageViewState;

// New
export type PageSlowViewState = {};
export type PageFastViewState = PageViewState;
export type PageInteractiveViewState = PageViewState;
```

This tells the component author: put all data in `withFastRender`. The data is available at SSR and reactive on the client.

**Files:** `jay-html-compiler.ts` — `generatePhaseSpecificTypes` (or the section that generates the default types when no contract exists).

### Fix 2: Remove `noMainContract` slow render behavior

Remove the `noMainContract` flag from `slowRenderTransform`. Without a contract, `isSlowPhase()` returns `false` for all bindings → slow render resolves nothing → bindings pass through to the fast/server-element phase.

This aligns with Fix 1: no-contract pages have no slow data, so slow render is a no-op.

**Files:**

- `slow-render-transform.ts` — remove `noMainContract` from `isSlowPhase`, `resolveTextBindings`, `transformElement`, `transformChildren`, `SlowRenderContext`
- `expression-parser.pegjs` — remove `noMainContract` from `isSlowPhase`
- `expression-compiler.ts` — remove `noMainContract` from `SlowRenderContext`

### Fix 3: Error on slow data without contract

If a Jay Stack component without a contract returns non-empty data from `withSlowlyRender`, emit an error. Without a contract, the slow render has no way to know which bindings to resolve — data from `withSlowlyRender` would be silently ignored, which is always a bug.

**Where:** In the dev server pipeline, when `slowRenderTransform` receives data but has no contract.

### Fix 4: Update no-contract test components

- **2b** (`page-dynamic-text-no-contract`): Move data from `withSlowlyRender` to `withFastRender`
- **3b** (`page-conditional`): Move data from `withSlowlyRender` to `withFastRender`
- **4b** (`page-foreach`): Remove no-op `withSlowlyRender`, keep `withFastRender`
- Regenerate `expected-ssr.html` and `expected-hydrate.ts` fixtures for all three

## Verification

1. Test 2b passes — dynamic text with no contract renders correctly via fast phase
2. Test 3b passes — conditionals with no contract render correctly via fast phase
3. Test 4b passes — forEach with no contract renders correctly via fast phase
4. Tests with contracts (2a, 3a, 4a) unaffected — contract phases still work
5. Generated `.d.ts` for no-contract pages shows `FastViewState = PageViewState`
6. compiler-jay-html tests all pass (including DL#107 `No contract` slow-render tests updated)
7. Error emitted when `withSlowlyRender` returns data without a contract

## Implementation Results

### Completed

**Fix 1** — Changed `generatePhaseSpecificTypes` in `jay-html-compiler.ts`: when `jayFile.hasInlineData` (no contract), `FastViewState` now equals the full ViewState type instead of `{}`.

**Fix 2** — Removed `noMainContract` flag from:

- `slow-render-transform.ts`: removed from `isSlowPhase`, `resolveTextBindings`, `transformElement`, `transformChildren`, and the `slowRenderTransform` call site
- `expression-parser.pegjs` and `expression-parser.cjs`: `isSlowPhase` now always returns `false` for unknown bindings
- `expression-compiler.ts`: removed `noMainContract` from `SlowRenderContext` interface
- Also fixed `transformElement` forEach check: `!phaseInfo || phase === 'slow'` → `phaseInfo?.phase === 'slow'` (without phase info, forEach is not slow)

**Fix 4** — Updated test components:

- 2b: moved data from `withSlowlyRender` to `withFastRender`
- 3b: moved data from `withSlowlyRender` to `withFastRender`
- 4b: removed no-op `withSlowlyRender`, simplified to just `withFastRender` with `phaseOutput`
- Regenerated `expected-ssr.html` and `expected-hydrate.ts` fixtures for all three

**Slow-render "No contract" tests updated** — The 3 tests from DL#107 (`describe('No contract')`) were updated to validate the new behavior: slow render leaves bindings unresolved and forEach un-unrolled when no contract exists. Reduced from 3 to 2 tests (removed nested object test — redundant with the text binding test).

**Fixture cascade** — 96 inline-data fixture files updated: `FastViewState = {}` → `FastViewState = ViewStateType`. Contract-based fixtures with explicit phase types were not affected.

### Deviations

- **Fix 3 deferred** — Error on `withSlowlyRender` returning data without a contract was not implemented. This is a dev-server pipeline concern and less critical now that the types guide developers to use `withFastRender`.

### Test results

- compiler-jay-html: 599 pass, 4 skipped (all green)
- dev-server hydration tests 2b, 3b, 4b: 36 pass (all 3 SSR modes)
