# Design Log #105 — Headless Component Default Fast ViewState

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
- Conditional toggle — showing a previously-hidden headless instance that wasn't SSR'd
- Any dynamic headless instance creation after initial page load

## Design

### New lifecycle: `withDefaultFastViewState`

Add an optional lifecycle function to the full-stack component builder that provides default fast ViewState values from props. The framework calls it automatically when server data is missing.

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
    .withDefaultFastViewState((props) => ({
        // Client-side fallback: pure computation from props, no server APIs
        name: '',
        price: 0,
        inStock: false,
    }))
    .withInteractive((props, refs, fastViewState, carryForward) => {
        // fastViewState is ALWAYS Signals<FastVS> — never undefined
        const [inStock] = fastViewState.inStock;
        // ...
    });
```

### Runtime behavior

In `makeHeadlessInstanceComponent`'s `wrappedConstructor`:

```typescript
const fastVS = instanceData?.viewStates?.[resolvedKey];
const resolvedFastVS = fastVS
    ?? defaultFastViewState?.(props)
    ?? {};
const signalVS = makeSignals(resolvedFastVS);
```

- **Existing items (from SSR)**: Server fast ViewState used. `defaultFastViewState` never called.
- **New client-side items**: `defaultFastViewState(props)` provides initial signal values.
- **No default defined**: Falls back to `{}` — component author's responsibility. Consider logging a warning.

### Builder chain position

`withDefaultFastViewState` is optional and comes after `withFastRender`, before `withInteractive`:

```
makeJayStackComponent()
    .withProps<P>()
    .withSlowlyRender(...)        // optional
    .withFastRender(...)          // optional
    .withDefaultFastViewState(...)  // NEW, optional
    .withInteractive(...)         // optional
```

### Type signature

```typescript
withDefaultFastViewState(
    fn: (props: Props) => FastViewState
): Builder<...>
```

The return type must match `FastViewState` — the same type that `withFastRender` produces. This ensures the signals created from defaults have the same shape as signals from server data.

### Async support

Should `defaultFastViewState` support `Promise<FastViewState>`?

**Arguments for**: Some defaults might need a client-side fetch (e.g., calling a query action).
**Arguments against**: Adds complexity to `wrappedConstructor` (needs async handling). The interactive constructor expects synchronous component creation. Query actions should be called by the page, not the component.

**Decision**: TBD — start with synchronous, add async if needed.

## Questions

**Q1: Should `defaultFastViewState` also provide default `carryForward`?**

Currently `carryForward` defaults to `{}` when missing. But some interactive constructors depend on carryForward values. Should the default factory return both?

```typescript
.withDefaultFastViewState((props) => ({
    viewState: { name: '', price: 0 },
    carryForward: { productId: props.productId },
}))
```

Or keep it simple — just ViewState, carryForward stays `{}`.

**Q2: What happens for conditional headless instances?**

When `showWidget` toggles from false→true, the create path runs. If the component had SSR data (showWidget was true at SSR time), does the data persist? Or does the create path use `defaultFastViewState`?

Currently, `hydrateConditional` has both adopt (SSR content exists) and create (SSR content doesn't exist) paths. The create path creates a fresh component instance. If the condition was true at SSR but is toggled off→on, the create path runs without server data.

Should the framework cache the original `__headlessInstances` data for conditional instances so it survives toggles? Or should `defaultFastViewState` handle it?

**Q3: How does this interact with the compiler?**

The compiler generates `makeHeadlessInstanceComponent(preRender, widget.comp, key, widget.contexts)`. Should it also pass `widget.defaultFastViewState`?

```typescript
makeHeadlessInstanceComponent(
    preRender,
    widget.comp,
    key,
    widget.contexts,
    widget.defaultFastViewState,  // NEW parameter
)
```

This means:
- The full-stack component definition needs `defaultFastViewState` property
- The compiler emits `widget.defaultFastViewState` (may be undefined)
- `makeHeadlessInstanceComponent` accepts it as optional 5th parameter

**Q4: Should missing `defaultFastViewState` be an error or a warning?**

When `fastVS` is undefined AND `defaultFastViewState` is not defined:
- **Error**: Crash with a clear message ("headless component X has no server data and no defaultFastViewState")
- **Warning**: Log warning, pass `{}`, let the interactive constructor handle it (may crash with a less clear error)
- **Silent**: Just pass `{}` (current behavior, minus the crash)

**Q5: For the product search example, where does the product data come from?**

The page calls a query action to get products. The response includes product data (name, price, etc.). This data is passed as props to the widget. But `withFastRender` on the server also computes this data.

Should `defaultFastViewState` duplicate the logic of `withFastRender`? Or should the page pass the data via a different mechanism (e.g., extended props)?

If the page already has the product data from the query action, and the widget just displays it, maybe the widget's fast phase is redundant for new items — the data is already available via props.

## Implementation Plan

### Phase 1: Runtime support

1. Add `defaultFastViewState?: (props: Props) => FastVS` to `JayStackComponentDefinition`
2. Add `withDefaultFastViewState(fn)` to `jay-stack-builder.ts`
3. Update `makeHeadlessInstanceComponent` to accept and use `defaultFastViewState`
4. When `fastVS` is undefined and `defaultFastViewState` exists: call it with props, use result for `makeSignals`

### Phase 2: Compiler support

1. Update `makeHeadlessInstanceComponent` call sites to pass `widget.defaultFastViewState`
2. Both element target and hydrate target

### Phase 3: Test

1. Update test widget with `withDefaultFastViewState`
2. Verify 6c forEach "Add Item" creates widget with correct default values
3. Verify existing SSR items still use server data

## Verification Criteria

1. New forEach items render with default values (no crash)
2. Existing SSR items still use server fast ViewState (not defaults)
3. Interactive constructor always receives valid `Signals<FastVS>` (never undefined)
4. `withDefaultFastViewState` is optional — components without it behave as before
5. 6c forEach interactivity test passes (add item, increment, remove)
