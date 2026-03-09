# Design Log 100 — Hydrate Conditional Creation Fallback

## Background

DL93 defined three levels of hydration complexity:

- **Level 1**: Static HTML with dynamic text/attribute points
- **Level 2**: Conditionals that are true at SSR — adopt existing DOM, toggle on/off
- **Level 3**: Conditionals that are false at SSR — element doesn't exist in DOM, needs creation code

DL93/94 implemented Levels 1 and 2. Level 3 was left as future work. DL99 fixed coordinate alignment bugs but exposed Level 3 as a real problem on the whisky-store products page.

## Problem

When a conditional is false at SSR time, the server doesn't render the element. The hydrate target generates:

```typescript
hydrateConditional(
  (vs) => vs.productSearch?.isSearching,
  () => adoptElement('3', {}, []),
);
```

`adoptElement("3", ...)` fails (coordinate "3" doesn't exist in DOM), returns noop. `hydrateConditional` sees `!adopted.dom`, returns noop. The element can **never appear**, even when the condition becomes true at interactive time.

Example: the loading overlay `<div class="loading-overlay" if="productSearch.isSearching">` never shows because `isSearching` is false on initial page load.

This affects ALL conditionals that are false at SSR — not just this one.

## Design

### Approach: creation fallback in `hydrateConditional`

Add an optional `createFallback` parameter to `hydrateConditional`. When adoption fails and a create callback exists, set up lazy creation similar to the standard `conditional()` / `mkUpdateCondition` pattern.

```typescript
export function hydrateConditional<ViewState>(
  condition: (vs: ViewState) => boolean,
  adoptExisting: () => BaseJayElement<ViewState>,
  createFallback?: () => BaseJayElement<ViewState>, // NEW
): BaseJayElement<ViewState>;
```

### How it works

`hydrateConditional` already handles the conditional logic — it IS the adoption of the conditional itself. The adopt callback tries to find and adopt the element. When adoption fails (false at SSR), the create callback provides the element creation code as a fallback.

```typescript
hydrateConditional(
  (vs) => vs.productSearch?.isSearching,
  () => adoptElement('3', {}, []), // adopt (existing)
  () =>
    e('div', { class: 'loading-overlay' }, [
      // create (fallback)
      e('div', { class: 'loading-spinner' }, []),
    ]),
);
```

- **True at SSR**: adopt callback finds the element → existing toggle behavior, create callback ignored
- **False at SSR**: adopt callback returns noop → create callback stored, called lazily when condition first becomes true

The create callback uses the standard element target (`e()`, `dt()`, `da()` etc.), same pattern as `hydrateForEach`'s create callback.

### Why not split into `hydrateConditionalTrue` / `hydrateConditionalFalse`?

Considered splitting into two methods to reduce client script size. Doesn't help because the compiler can't determine at compile time whether a condition is true or false at SSR — conditions like `if="productSearch.isSearching"` depend on fast/interactive-phase data resolved at request time. The hydrate compiler must generate code for both outcomes; the runtime decides based on whether adoption succeeds.

The one exception is **slow-phase conditions**: the value IS known at compile time (baked into pre-rendered jay-html). If true → only adoption needed. If false → no code needed (slow data doesn't change). These are already handled implicitly.

### DOM insertion position

When the condition was false at SSR and toggles true, the created element needs a position in the DOM. Solution: `hydrateConditional` creates a comment anchor node as a position marker. The parent `adoptElement` inserts anchors for children that returned `dom: undefined`.

Challenge: `adoptElement` evaluates children before resolving its own element (JS argument evaluation order). Workaround: `adoptElement` post-processes children after resolving — scans for comment-anchor DOMs and appends them to the parent in order.

## Implementation Plan

### Phase 1: Runtime — `hydrateConditional` with createFallback

Add optional third parameter `createFallback` to `hydrateConditional`.

When `!adopted.dom` and `createFallback` exists:

- Create a comment anchor node
- Return a `BaseJayElement` with `dom: anchor` and an `update` function that:
  - On first true condition → call `createFallback()`, insert created element before anchor
  - On subsequent toggles → remove/re-insert before anchor (same as true-at-SSR path)

### Phase 2: Runtime — `adoptElement` anchor insertion

After `adoptElement` resolves its DOM element and collects children, scan children for comment-node DOMs and append them to the parent element. This places anchors at the correct document position.

### Phase 3: Hydrate compiler — generate create callback

In `renderHydrateElement` for conditionals, also generate the creation code using the standard element target (manual `e()` construction, same approach as `hydrateForEach`'s create callback). Pass as third argument to `hydrateConditional`.

### Phase 4: Test and verify

- Add runtime test for false-at-SSR conditional toggling true
- Update compiler test fixtures if needed
- Full test suite
- Whisky store: verify loading overlay appears on search

## Verification Criteria

1. Loading overlay appears when `isSearching` becomes true
2. Conditionals that toggle from false→true→false work correctly
3. Existing true-at-SSR conditionals still work (no regression)
4. All tests pass

## Implementation Results

### Changes

**Runtime** (`packages/runtime/runtime/lib/hydrate.ts`):

- `hydrateConditional` — Added optional `createFallback` parameter. When adoption fails and createFallback exists, delegates to `hydrateConditionalFalse`.
- `hydrateConditionalFalse` — New function. Checks condition immediately with current ViewState (not just SSR state). If already true, creates element during construction. Otherwise stores create callback for lazy creation on first true. Uses comment anchor for DOM positioning. Mount inserts the created element before the anchor once the anchor is in the DOM.
- `adoptElement` — Post-processes children: inserts Comment-node DOMs (anchors from false-at-SSR conditionals) into the parent element.

**Compiler** (`packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts`):

- `renderHydrateElement` for conditionals — Generates creation code alongside adopt code. Uses the standard element target (`e()`, `dt()`, `da()`) for the create callback, same pattern as `hydrateForEach`'s create callback.

**Hydration script ordering** (`packages/jay-stack/stack-server-runtime/lib/generate-ssr-response.ts`):

- Reordered generated script: `hydrateCompositeJayComponent → clientInit → pageComp()`. Hydration sets up first, then services provide contexts, then component instantiates with contexts available and reads current signal values.

**Signal initialization** (`packages/jay-stack/stack-client-runtime/lib/`):

- `makeSignals({} as any)` for undefined partViewState in `hydrate-composite-component.ts`, `composite-component.ts`, and `headless-instance-context.ts`. Ensures reactive graph exists even when SSR had no data for a part.

**Test fixtures** (3 hydrate fixtures updated with create callbacks):

- `conditions/conditions/generated-element-hydrate.ts`
- `conditions/conditions-with-refs/generated-element-hydrate.ts`
- `collections/duplicate-ref-different-branches/generated-element-hydrate.ts`

**Runtime tests** (`packages/runtime/runtime/test/lib/hydration/hydrate-conditional.test.ts`):

Added 9 tests covering:

- False at SSR, still false at hydration — anchor only
- False at SSR → toggled true — element created via fallback
- False at SSR → true → false — created then removed
- False at SSR → true → false → true — same element re-inserted
- False at SSR, dynamic content updates after creation
- False at SSR, already true at hydration — immediate creation
- False at SSR, true at hydration → toggle off/on
- True at SSR, false at hydration → first update removes
- True at SSR, false at hydration → toggle back (same node)

### Bug fix: create callbacks must use `de()` for parents with conditional children

The create callbacks in both `hydrateConditional` and `hydrateForEach` initially used `e()` (static element) for the fallback element wrapper. But when the element has conditional children (`c()`), the parent must use `de()` (dynamicElement with Kindergarten) to manage child insertion/removal. Without `de()`, `normalizeUpdates` crashes because `e()` doesn't handle `Conditional` descriptors.

Fix: the hydrate compiler checks `createChildNodes` for conditionals/forEach/async (same check as the standard element target at `needDynamicElement`) and emits `de()` instead of `e()` when needed.

### Key insight: hydration cannot assume client state matches SSR state

`hydrateConditionalFalse` checks the condition with the CURRENT ViewState during construction, not just during `update()`. If data arrived between SSR and hydration (e.g., cart loaded via client init), the condition may already be true. The element is created immediately rather than waiting for the first reactive update. This applies generally — hydration should reconcile against current state, not blindly trust SSR state.

### Test results

- 15 hydrate-conditional tests pass (6 existing + 9 new)
- All 68 packages build and test successfully
