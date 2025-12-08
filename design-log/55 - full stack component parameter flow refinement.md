# Full Stack Component Parameter Flow Refinement

## Background

Design logs #34, #48, #50, and #51 established the foundation for full stack components with three rendering phases (slow, fast, interactive) and type-safe phase validation. However, the information passing between phases needed refinement to better support carry-forward data and reactive view state.

## The Problem

Current implementation has carry-forward mechanisms but with type safety and completeness issues:

### Current State (as of implementation)

**What Works:**
- ✅ Runtime correctly passes slow carry forward to fast render (`fast-changing-runner.ts` line 20-24)
- ✅ Fast carry forward is passed to interactive as `Signals<CarryForward>` (tuple `[Getter, Setter]` style)
- ✅ Builder tracks carry forward types through Services/Contexts arrays

**What Needs Improvement:**

1. **Fast View State Missing**: Interactive constructor receives carry forward as signals but NOT fast view state as signals. Since interactive view state is a subset of fast view state, fast properties should be available reactively.

2. **Implicit Carry Forward in Services Array**: Carry forward is prepended to Services array (`[CarryForward, ...Services]`) making it `services[0]`, but this is not obvious from the type signature. Could be more explicit.

**Note on Current Design:**
- ✅ Carry forward is passed as first element of Services array (clever type-level manipulation)
- ✅ `Signals<T>` using `[Getter<T>, Setter<T>]` tuple is correct - uses `@jay-framework/reactive` package
- Runtime behavior in `fast-changing-runner.ts` correctly destructures: `compDefinition.fastRender(props, slowCarryForward, ...services)`

## The Solution

Refine the parameter flow to make carry-forward data explicit, type-safe, and conditionally available based on which rendering phases are implemented.

### Key Principles

1. **Conditional Service Parameters**: Service parameters should only be included if the rendering phase exists
2. **Reactive View State**: Fast view state should be available as signals in interactive phase
3. **Explicit Carry Forward**: Each phase explicitly returns carry forward data for the next phase
4. **Type Safety**: TypeScript enforces correct parameter usage at compile time

## Current vs Proposed Implementation

### Current Implementation - How Carry Forward Works

The builder uses **type-level array manipulation** to pass carry forward through the Services array:

```typescript
// jay-stack-builder.ts line 127-140
withSlowlyRender<NewCarryForward extends object>(
  slowlyRender: RenderSlowly<Services, PropsT, SlowVS, NewCarryForward>,
): Builder<
  'FastRender',
  Refs,
  SlowVS,
  FastVS,
  InteractiveVS,
  [NewCarryForward, ...Services],  // ✅ Carry forward prepended to Services!
  Contexts,
  PropsT,
  Params,
  JayComponentCore<PropsT, InteractiveVS>
>;

// So RenderFast receives Services where Services[0] = SlowCarryForward
// fast-changing-runner.ts correctly destructures:
const fastRenderedPart = await compDefinition.fastRender(
  { ...pageProps, ...pageParams },
  partSlowlyCarryForward,  // First element of services array
  ...services,             // Rest of services
);
```

**This works correctly** but is implicit - carry forward is hidden in the array type.

### Current Interactive Constructor

```typescript
// simple-page/page.ts - Current usage
function ProductsPageConstructor(
  props: Props<PageProps>,
  refs: PageElementRefs,
  carryForward: Signals<FastCarryForward>,  // Only carry forward, not view state
) {
  // Can access carry forward as signals:
  const [fastDynamicRendered, setFastDynamicRendered] = carryForward.fastDynamicRendered;
  
  // ❌ Cannot access fast view state (e.g., fastRendered property)
  // even though it was rendered in the fast phase
}
```

## Proposed Refinements

### 1. Slow → Fast: Current Approach is Correct

**Current approach works well:**
- ✅ Carry forward is prepended to Services array: `[SlowCarryForward, ...Services]`
- ✅ Runtime correctly destructures it as first parameter
- ✅ Type system tracks it through array manipulation

**No changes needed** - the current design is elegant. Carry forward IS a service parameter, just passed via array manipulation.

**Example (current implementation):**

```typescript
export const productPage = makeJayStackComponent<ProductContract>()
  .withProps<{ productId: string }>()
  .withServices(DATABASE_SERVICE, INVENTORY_SERVICE)
  .withSlowlyRender(async (props, db, inventory) => {
    // Services array is: [db, inventory]
    const product = await db.query('SELECT * FROM products WHERE id = $1', [props.productId]);
    return partialRender(
      { name: product.name, sku: product.sku },
      { productMetadata: { category: product.category, tags: product.tags } }  // Carry forward
    );
  })
  .withFastRender(async (props, slowCarryForward, db, inventory) => {
    // ✅ Services array is now: [slowCarryForward, db, inventory]
    // Builder prepended carry forward automatically!
    const inStock = await inventory.checkStock(props.productId);
    const recommendations = await getRecommendations(slowCarryForward.productMetadata.category);
    
    return partialRender(
      { price: 99.99, inStock },
      { recommendations }  // Carry forward to interactive
    );
  });
```

**Why this works**: The builder's type system prepends carry forward to the Services array, so it arrives as the first parameter after props. Type-safe and elegant.

### 2. Fast → Interactive: Add Fast View State as Signals (PRIMARY ISSUE)

**Current Issue**: Interactive only receives carry forward as signals, not the fast-rendered view state.

**Proposed Addition**: Pass BOTH fast view state AND carry forward to interactive phase:
1. **Fast View State as Signals**: All fast-rendered view state properties become reactive signals (MISSING)
2. **Carry Forward as Signals**: Already works correctly via Contexts array prepending

**How it currently works:**

```typescript
// jay-stack-builder.ts line 229-242 (Services state)
withFastRender<NewCarryForward extends object>(
  fastRender: RenderFast<Services, PropsT, FastVS, NewCarryForward>,
): Builder<
  'InteractiveRender',
  Refs,
  SlowVS,
  FastVS,
  InteractiveVS,
  Services,
  [Signals<NewCarryForward>, ...Contexts],  // ✅ Carry forward prepended to Contexts
  PropsT,
  Params,
  JayComponentCore<PropsT, InteractiveVS>
>;

// Current interactive constructor (from simple-page/page.ts):
function Constructor(
  props: Props<PageProps>,
  refs: PageElementRefs,
  carryForward: Signals<FastCarryForward>,  // First element of Contexts array
  ...contexts: Contexts
) {
  const [value, setValue] = carryForward.someProperty;  // ✅ Works
  // ❌ MISSING: Cannot access fast view state signals
}
```

**Proposed change:**

```typescript
withFastRender<NewCarryForward extends object>(
  fastRender: RenderFast<Services, PropsT, FastVS, NewCarryForward>,
): Builder<
  'InteractiveRender',
  Refs,
  SlowVS,
  FastVS,
  InteractiveVS,
  Services,
  [Signals<FastVS>, Signals<NewCarryForward>, ...Contexts],  // ✅ NEW: Prepend BOTH
  PropsT,
  Params,
  JayComponentCore<PropsT, InteractiveVS>
>;

// Proposed interactive constructor:
function Constructor(
  props: Props<PageProps>,
  refs: PageElementRefs,
  fastViewState: Signals<FastVS>,          // ✅ NEW: First element
  fastCarryForward: Signals<FastCarryForward>,  // ✅ Second element
  ...contexts: Contexts
) {
  const [price, setPrice] = fastViewState.price;  // ✅ Can access fast view state
  const [cartId] = fastCarryForward.cartId;       // ✅ Can access carry forward
}
```

**Example:**

```typescript
export const productPage = makeJayStackComponent<ProductContract>()
  .withProps<{ productId: string }>()
  .withFastRender(async (props) => {
    return partialRender(
      { price: 99.99, inStock: true, quantity: 1 },
      { cartId: generateCartId() }  // Carry forward
    );
  })
  .withInteractive((props, fastViewState, fastCarryForward, refs) => {
    // ✅ fastViewState contains reactive signals
    // { price: Signal<number>, inStock: Signal<boolean>, quantity: Signal<number> }
    
    // ✅ fastCarryForward is typed
    const cartId = fastCarryForward.cartId;
    
    refs.addToCart.onclick(() => {
      // Can read fast view state reactively
      console.log('Current price:', fastViewState.price.value);
      console.log('In stock:', fastViewState.inStock.value);
      
      // Interactive view state can modify quantity
      fastViewState.quantity.value += 1;
    });
    
    return {
      render: () => ({
        // Interactive view state
        quantity: fastViewState.quantity.value
      })
    };
  });
```

**Why**: 
- **Signals**: Fast-rendered data (like price from API) may need to update reactively on the client without a full page reload
- **Carry Forward**: Server-side computed data (like session IDs, tokens) needs to be available for client interactions
- **Subset Relationship**: Interactive view state is a subset of fast view state, so fast properties are already reactive

### 3. Current Parameter Pattern (Via Array Manipulation)

The builder uses array prepending to pass carry forward through Services/Contexts:

**How it works now:**

| Phase | Builder Method | Array Manipulation | Function Receives |
|-------|---------------|-------------------|-------------------|
| Slow → Fast | `withSlowlyRender` | Services → `[SlowCF, ...Services]` | `(props, slowCF, ...services)` |
| Fast → Interactive | `withFastRender` | Contexts → `[Signals<FastCF>, ...Contexts]` | `(props, refs, fastCF, ...contexts)` |

**Proposed enhancement:**

| Phase | Builder Method | Array Manipulation | Function Receives |
|-------|---------------|-------------------|-------------------|
| Slow → Fast | `withSlowlyRender` | Services → `[SlowCF, ...Services]` | `(props, slowCF, ...services)` ✅ No change |
| Fast → Interactive | `withFastRender` | Contexts → `[Signals<FastVS>, Signals<FastCF>, ...Contexts]` | `(props, refs, fastVS, fastCF, ...contexts)` ✅ Add view state |

**Example: Interactive-Only Component**

```typescript
export const counter = makeJayStackComponent<CounterContract>()
  .withProps<{}>()
  .withInteractive((props, refs) => {
    // ✅ No fast view state or carry forward - not needed
    let count = 0;
    
    refs.increment.onclick(() => {
      count++;
    });
    
    return {
      render: () => ({ count })
    };
  });
```

**Example: Full Pipeline**

```typescript
export const fullPage = makeJayStackComponent<PageContract>()
  .withProps<{ id: string }>()
  .withSlowlyRender(async (props) => {
    return partialRender({ title: 'Page' }, { metadata: { version: 1 } });
  })
  .withFastRender(async (props, slowCarryForward) => {
    // ✅ Receives slow carry forward
    console.log('Version:', slowCarryForward.metadata.version);
    return partialRender({ content: 'Dynamic' }, { sessionId: 'abc123' });
  })
  .withInteractive((props, fastViewState, fastCarryForward, refs) => {
    // ✅ Receives both fast view state as signals and carry forward
    console.log('Content signal:', fastViewState.content);
    console.log('Session:', fastCarryForward.sessionId);
    
    return {
      render: () => ({})
    };
  });
```

## Type Implementation

### Builder State Tracking

The builder tracks which rendering phases are implemented to adjust type signatures:

```typescript
type BuilderState = {
  hasSlowRender: boolean;
  hasFastRender: boolean;
  slowCarryForward?: Type;
  fastCarryForward?: Type;
};

// Fast render signature depends on slow render
type FastRenderFn<State extends BuilderState> = 
  State['hasSlowRender'] extends true
    ? (props: Props, slowCarryForward: State['slowCarryForward'], ...services: Services) => FastResult
    : (props: Props, ...services: Services) => FastResult;

// Interactive signature depends on fast render
type InteractiveFn<State extends BuilderState> = 
  State['hasFastRender'] extends true
    ? (props: Props, fastViewState: Signals<FastVS>, fastCarryForward: State['fastCarryForward'], refs: Refs) => Component
    : (props: Props, refs: Refs) => Component;
```

### PartialRenderResult Monad

From Design Log #54, the `PartialRenderResult` monad encapsulates view state and carry forward:

```typescript
type PartialRenderResult<ViewState, CarryForward> = {
  viewState: Partial<ViewState>;
  carryForward: CarryForward;
};

function partialRender<ViewState, CarryForward>(
  viewState: Partial<ViewState>,
  carryForward: CarryForward
): PartialRenderResult<ViewState, CarryForward> {
  return { viewState, carryForward };
}
```

### Signals Type (Current Implementation)

Fast view state properties become reactive signals using `@jay-framework/reactive`:

```typescript
// jay-stack-builder.ts line 31-33
export type Signals<T extends object> = {
  [K in keyof T]: K extends string ? [Getter<T[K]>, Setter<T[K]>] : T[K];
};

// From @jay-framework/reactive
type Getter<T> = () => T;
type Setter<T> = (value: T) => void;

// Example
type FastViewState = { price: number; inStock: boolean };
type FastSignals = Signals<FastViewState>;
// = { 
//   price: [Getter<number>, Setter<number>];
//   inStock: [Getter<boolean>, Setter<boolean>];
// }

// Usage in constructor:
const [getPrice, setPrice] = fastViewState.price;
console.log(getPrice());  // Read value
setPrice(99.99);          // Set value
```

**Note**: The tuple `[Getter, Setter]` style is Jay's reactive pattern, not a Vue/React signal object.

## Benefits

1. **Type Safety**: Compiler enforces correct parameter usage across all phases
2. **Conditional APIs**: Only pay for what you use - parameters only exist if phases exist
3. **Reactive Fast State**: Fast-rendered data can update on client without full re-render
4. **Explicit Data Flow**: Clear chain of data passing through the rendering pipeline
5. **Self-Documenting**: Function signatures show exactly what data is available
6. **No Boilerplate**: Builder automatically adjusts signatures based on implementation

## Migration Impact

### What Changes for Developers

**Current code (still works after fix):**

```typescript
// Current: Fast render signature doesn't show slow carry forward in types
// but runtime provides it (types will be fixed to match)
export const page = makeJayStackComponent<PageContract>()
  .withSlowlyRender(async (props) => {
    return partialRender({ title: 'Page' }, { metadata: {} });
  })
  .withFastRender(async (props, slowCarryForward, ...services) => {
    // ✅ Already works at runtime, types will be fixed
    console.log(slowCarryForward.metadata);
    return partialRender({ content: 'Text' }, { sessionId: '' });
  })
  .withInteractive((props, refs, carryForward) => {
    // ✅ Carry forward already available
    const [sessionId] = carryForward.sessionId;
    console.log(sessionId());
    
    // ❌ MISSING: Cannot access fastViewState
  });
```

**After refinement (NEW capabilities):**

```typescript
export const page = makeJayStackComponent<PageContract>()
  .withSlowlyRender(async (props) => {
    return partialRender({ title: 'Page' }, { metadata: {} });
  })
  .withFastRender(async (props, slowCarryForward, ...services) => {
    // ✅ Types now match runtime behavior
    console.log(slowCarryForward.metadata);
    return partialRender({ content: 'Text' }, { sessionId: '' });
  })
  .withInteractive((props, fastViewState, fastCarryForward, refs) => {
    // ✅ NEW: Fast view state available as signals
    const [content, setContent] = fastViewState.content;
    console.log(content());  // Read fast-rendered content
    setContent('Updated');   // Update reactively
    
    // ✅ Carry forward still available (unchanged)
    console.log(fastCarryForward.sessionId);
  });
```

## Implementation Checklist

### 1. Add Fast View State to Interactive (PRIMARY CHANGE)
- [ ] Update `withFastRender` in builder to prepend BOTH `Signals<FastVS>` and `Signals<FastCF>` to Contexts array
- [ ] Modify stack-client-runtime to create signals for fast view state (in addition to carry forward)
- [ ] Update interactive constructor signature pattern to receive both parameters
- [ ] Ensure interactive view state remains a subset of fast view state for type safety
- [ ] Test that fast view state signals work correctly on client

### 2. Documentation and Migration
- [ ] Update full-stack-component README to show new parameter pattern
- [ ] Document that fast view state is now available as signals in interactive phase
- [ ] Update examples in test fixtures (simple-page, etc.)
- [ ] Add examples showing when to use fast view state vs carry forward

### 3. Ensure Backward Compatibility
- [ ] Verify components without fast render still work (no view state/carry forward parameters)
- [ ] Ensure type inference still works correctly through builder chain

## Related Design Logs

- **#34**: Original Jay Stack architecture with three rendering phases
- **#48**: Services pattern for server-side dependency injection
- **#50**: Rendering phases in contracts with type validation
- **#51**: Contract references in Jay HTML for phase annotations
- **#54**: Render result monads (`PartialRenderResult` type)

