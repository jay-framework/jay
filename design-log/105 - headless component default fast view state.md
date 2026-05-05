# Design Log #105 — Headless Component Client Defaults

## Background

Headless component instances inside `forEach` can be added dynamically on the client (e.g., "Add Item" button appends to the array). When a new item is created client-side, `makeHeadlessInstanceComponent`'s `wrappedConstructor` looks up the instance's fast ViewState from `__headlessInstances[key]` — but no server data exists for the new item. The lookup returns `undefined`, `makeSignals({})` creates an empty object, and the interactive constructor crashes when destructuring signals (e.g., `const [value, setValue] = fastViewState.value` → TypeError).

### Related

- DL#102 Issue 7 — headless instance ref onclick (fixed: coordinate on root element)
- DL#104 — hydration test plan (6c forEach interactivity test exposes this)

## Problem

When a headless component instance is created **client-side** (not from SSR):

1. No `__headlessInstances` entry exists for the new instance's coordinate key
2. `fastVS` is `undefined` → `makeSignals({})` → empty signals
3. Interactive constructor receives empty `Signals<FastVS>` → crash on destructure

This affects:

- forEach "add item" — new items have no server data
- Conditional toggle — showing a previously-hidden headless instance that wasn't SSR'd (condition was false at SSR time)
- Any dynamic headless instance creation after initial page load

Does NOT affect:

- Conditional true→false→true toggle — the DOM instance and component are preserved, no new creation needed

## Design

### New lifecycle: `withClientDefaults`

Add an optional lifecycle function to the full-stack component builder that provides default ViewState and carryForward values from props. Called on the **client only** when server data is missing.

```typescript
export const widget = makeJayStackComponent<WidgetContract>()
  .withProps<WidgetProps>()
  .withFastRender(async (props) => {
    // Server-side: may use database, services, etc.
    const product = await db.getProduct(props.productId);
    return Pipeline.ok({}).toPhaseOutput(() => ({
      viewState: { name: product.name, price: product.price, inStock: product.inStock },
      carryForward: { productId: product.id },
    }));
  })
  .withClientDefaults((props) => ({
    // Client-side fallback: pure computation from props, no server APIs
    viewState: { name: props.name, price: props.price, inStock: true },
    carryForward: { productId: props.productId },
  }))
  .withInteractive((props, refs, fastViewState, carryForward) => {
    // fastViewState is ALWAYS Signals<FastVS> — never undefined
    const [inStock] = fastViewState.inStock;
    // ...
  });
```

Note: The props are the same on server and client. On the server, the page's fast render does the query and passes product data as props to each widget. On the client, the page passes the same props when adding new items. `clientDefaults` uses these props to compute initial values.

### Synchronous only

`clientDefaults` is synchronous — `(props: Props) => { viewState, carryForward }`. No `Promise` support.

Individual ViewState members can be async (Jay supports async rendering via `when-loading`/`when-resolved`). If the component needs to fetch data for a new item, it should use an async ViewState member, not an async `clientDefaults`.

### Runtime behavior

In `makeHeadlessInstanceComponent`'s `wrappedConstructor`:

```typescript
const fastVS = instanceData?.viewStates?.[resolvedKey];
const cf = instanceData?.carryForwards?.[resolvedKey];

let resolvedFastVS: object;
let resolvedCf: object;

if (fastVS) {
  // Server data available (existing SSR items)
  resolvedFastVS = fastVS;
  resolvedCf = cf || {};
} else if (clientDefaults) {
  // No server data, use client-side defaults
  const defaults = clientDefaults(props);
  resolvedFastVS = defaults.viewState;
  resolvedCf = defaults.carryForward ?? {};
} else {
  // No server data, no defaults — warn and use empty
  console.warn(`Headless component instance has no server data and no clientDefaults`);
  resolvedFastVS = {};
  resolvedCf = {};
}

const signalVS = makeSignals(resolvedFastVS);
return interactiveConstructor(props, refs, signalVS, resolvedCf, ...pluginResolvedContexts);
```

### Builder chain position

```
makeJayStackComponent()
    .withProps<P>()
    .withSlowlyRender(...)              // optional
    .withFastRender(...)                // optional
    .withClientDefaults(...)  // NEW, optional, client-only
    .withInteractive(...)               // optional
```

### Type signature

```typescript
withClientDefaults(
    fn: (props: Props) => { viewState: FastViewState; carryForward?: CarryForward }
): Builder<...>
```

Return type must match the shape of `withFastRender`'s output — `viewState` has the same type as `FastViewState`, `carryForward` has the same type as the carry-forward from the fast phase.

### Compiler interaction

`makeHeadlessInstanceComponent` receives the whole component definition object instead of individual properties:

```typescript
// Current (4 separate params):
makeHeadlessInstanceComponent(preRender, widget.comp, key, widget.contexts);

// Proposed (component object):
makeHeadlessInstanceComponent(preRender, widget, key);
```

`makeHeadlessInstanceComponent` reads from `widget`:

- `widget.comp` — interactive constructor
- `widget.contexts` — context markers
- `widget.clientDefaults` — default factory (may be undefined)

This simplifies the compiler output and makes adding future properties non-breaking.

### Client-only code

`clientDefaults` is client-only — it must NOT be included in server bundles. The compiler's existing code-splitting for `makeJayStackComponent` erases client-only functions from server builds. `clientDefaults` follows the same pattern: it's stored on the component definition object (alongside `comp`) which is already client-only.

### Conditional headless instances

- **SSR condition = false → client toggles to true**: The create path runs. No server data exists → `clientDefaults` is called.
- **SSR condition = true → client toggles false → true**: The `hydrateConditional` preserve-on-toggle behavior keeps the DOM instance alive. No new creation. `clientDefaults` is NOT called.

## Questions and Answers

**Q1: Should `clientDefaults` also provide default `carryForward`?**
A: Yes. The function returns `{ viewState, carryForward }`. CarryForward is optional and defaults to `{}`.

**Q2: What happens for conditional headless instances?**
A: SSR false → toggle true: `clientDefaults` called. Toggle true→false→true: DOM preserved, no call needed.

**Q3: How does this interact with the compiler?**
A: Pass the whole `widget` object to `makeHeadlessInstanceComponent` instead of `widget.comp` + `widget.contexts` separately. Simplifies compiler output and is future-proof.

**Q4: Should missing `clientDefaults` be an error or a warning?**
A: Warning for now. Log a console warning, pass `{}`. The interactive constructor may crash with a clearer error (destructuring undefined).

**Q5: For the product search example, where does the product data come from?**
A: Props are the same on server and client. The page's fast render does the query, passes product data as props. On the client, the page passes the same props when adding new items. `clientDefaults` uses these props — no duplication.

## Implementation Plan

### Phase 1: Runtime support

1. Add `clientDefaults?: (props: Props) => { viewState: FastVS; carryForward?: CF }` to `JayStackComponentDefinition`
2. Add `withClientDefaults(fn)` to `jay-stack-builder.ts`
3. Update `makeHeadlessInstanceComponent` signature: receive component object instead of `comp` + `contexts`
4. In `wrappedConstructor`: when `fastVS` is undefined, call `clientDefaults(props)` if available, else warn and use `{}`

### Phase 2: Compiler support

1. Update all `makeHeadlessInstanceComponent` call sites to pass `widget` (whole object) instead of `widget.comp, key, widget.contexts`
2. Element target, hydrate target, server-element target
3. Verify `clientDefaults` is client-only (not in server bundle)

### Phase 3: Tests

#### Runtime tests (`packages/jay-stack/stack-client-runtime` or `packages/runtime/runtime`)

1. `makeHeadlessInstanceComponent` with `clientDefaults`:

   - Server data available → uses server data, `clientDefaults` NOT called
   - Server data missing, `clientDefaults` defined → calls `clientDefaults(props)`, creates correct signals
   - Server data missing, `clientDefaults` undefined → warns, passes `{}` (graceful degradation)
   - `clientDefaults` receives correct props
   - CarryForward from `clientDefaults` is passed to interactive constructor

2. `makeHeadlessInstanceComponent` with whole component object:
   - Reads `widget.comp`, `widget.contexts`, `widget.clientDefaults` correctly
   - Works when `clientDefaults` is undefined (backward compatible)

#### Compiler tests (`packages/compiler/compiler-jay-html`)

1. Element target: `makeHeadlessInstanceComponent` call emits `widget` (whole object) instead of `widget.comp, key, widget.contexts`
2. Hydrate target: same — `makeHeadlessInstanceComponent` call passes whole object
3. Update all headless instance fixtures (element + hydrate) to match new call signature
4. Verify `clientDefaults` property is NOT referenced in server-element target output

#### Builder tests (`packages/jay-stack/full-stack-component`)

1. `withClientDefaults` in builder chain: sets `clientDefaults` on component definition
2. `withClientDefaults` is optional: omitting it → `clientDefaults` is undefined
3. Chain order: `withFastRender` → `withClientDefaults` → `withInteractive` works
4. Chain without `withFastRender`: `withClientDefaults` → `withInteractive` works

#### Integration tests (`packages/jay-stack/dev-server/test/hydration.test.ts`)

1. 6c forEach: "Add Item" creates widget with default values from `clientDefaults` (no crash)
2. 6c forEach: existing SSR items still use server data (not defaults)
3. 6c forEach: increment on new item works (signals from defaults are reactive)
4. 6c forEach: remove item works (no orphan state)
5. 6b conditional: false→true toggle uses `clientDefaults` when SSR condition was false
6. Label text preserved after button click (slow data not overwritten by interactive update)

## Verification Criteria

1. New forEach items render with default values (no crash)
2. Existing SSR items still use server fast ViewState (not defaults)
3. Interactive constructor always receives valid `Signals<FastVS>` (never undefined)
4. `withClientDefaults` is optional — components without it behave as before (warning logged)
5. `clientDefaults` is not included in server bundles
6. 6c forEach interactivity test passes (add item, increment, remove)
7. All existing compiler fixture tests pass (updated for new call signature)
8. All existing hydration tests pass (no regressions)

## Addendum: withClientDefaults lifecycle clarification

### Investigation

Explored whether `withClientDefaults` should be removed from the framework. Analysis found:

- Every usage in test fixtures was an exact copy of `withFastRender` output — appeared redundant
- The builder only allows `withClientDefaults` after `withFastRender`, making it unavailable for components without server phases

### Conclusion: keep withClientDefaults

`withClientDefaults` serves a legitimate purpose that `withFastRender` cannot: **providing initial ViewState for forEach items created on the client**. When a user adds a new item to a forEach array, `makeHeadlessInstanceComponent` creates a new instance with no server data. `clientDefaults` provides the initial ViewState for these dynamically-created items.

This is NOT a safety net for framework bugs — it's a required feature for dynamic client-side item creation.

### What withClientDefaults is NOT for

- Fallback when server data delivery fails (that's a framework bug to fix)
- Default ViewState for components without `withFastRender` (use `withFastRender` instead)
- Components outside forEach that have static props (server always provides data)

### UI Kit components

The ui-kit components (`scroll-carousel`, `clipboard-copy`) use `withFastRender` for SSR initial state and do NOT need `withClientDefaults` — they're not used inside forEach.
