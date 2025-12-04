# Render Result Monads - Design Log 54

## Background

The Jay Stack framework uses several result types for server-side rendering phases:

- `ServerError5xx` - Server errors (database down, internal errors)
- `ClientError4xx` - Client errors (not found, unauthorized)
- `Redirect3xx` - Redirects (moved, temporary redirect)
- `PartialRender<ViewState, CarryForward>` - Successful partial render with data

Currently, these types are simple discriminated unions that are returned directly from render functions. The challenge is that error handling requires explicit if/else or switch statements, making the code verbose and error-prone.

### Current Usage Pattern

```typescript
async function renderSlowlyChanging(props: PageProps): Promise<SlowlyRenderResult<...>> {
    const product = await getProductBySlug(props.slug);
    if (!product) return notFound();  // Must check and return early

    const { id, name, description } = product;
    return partialRender(
        { id, name, description },
        { productId: id }
    );
}
```

### Pain Points

1. **Verbose Error Handling**: Every potential failure requires explicit checks
2. **No Message Support**: Error types don't carry human-readable messages or error details
3. **Chaining is Manual**: Multiple operations require nested conditionals
4. **Try-Catch Wrapping**: API/database calls need manual try-catch blocks

## Goals

1. **Functional Composition**: Enable `map`, `flatMap` (chain) operations on results
2. **Error Short-Circuiting**: Errors should automatically propagate through the chain
3. **Async Support**: Mapping functions can be async
4. **Message/Details**: Add support for error messages, codes, and details
5. **Type Safety**: Maintain full TypeScript type inference throughout the chain
6. **Ergonomic API**: Make common patterns simple and readable

## Design Questions & Answers

### Q1: What should the monad type be called?

The monad is **not** the result itself - it's a pipeline/chain that produces the result. So naming it `RenderResult` would be confusing:

```typescript
// Confusing: "RenderResult" is not what we're returning
return RenderResult.from(...).map(...).toPhaseOutput();
```

**Options:**

- `RenderPipeline<T>` - Emphasizes the pipeline/flow nature ✓
- `PhaseBuilder<T>` - Emphasizes building toward a phase output ✓
- `PhaseChain<T>` - Chain that produces phase output ✓
- `Render<T>` - Short, describes the render operation in progress
- `Pipeline<T>` - Generic but clear about purpose
- `DataPipeline<T>` - Generic data transformation pipeline

**Recommendation:** `RenderPipeline<T>` - It clearly communicates:

1. It's about rendering (domain-specific)
2. It's a pipeline (operations flow through it)
3. The result comes out at the end via `.toPhaseOutput()`

```typescript
// Clear: A pipeline that produces phase output
return RenderPipeline.for<ProductSlowViewState, CarryForward>()
    .from(() => getProduct(id))
    .map(...)
    .toPhaseOutput();
```

### Q2: Should we rename `PartialRender` to something else?

The current name "PartialRender" can be confusing because:

- It implies the render is incomplete (but it's actually complete for that phase)
- It's tied to the multi-phase rendering concept (slow/fast/interactive)
- The "partial" refers to the ViewState being partial, not the render

**Options:**

- `PhaseRender` - Indicates a phase was rendered
- `RenderSuccess` - Generic success indicator
- `Rendered` - Simple past-tense
- `PhaseOutput` - Describes the output of a phase
- `Ok` - Rust-inspired, pairs with error types
- `Success` - Clear success indication

**Recommendation:** `PhaseOutput<ViewState, CarryForward>` - It's accurate (output of a rendering phase) and doesn't have the "partial" confusion.

### Q3: What message/details structure should error types have?

**Option A: Simple Message**

```typescript
interface ClientError4xx {
  kind: 'ClientError';
  status: number;
  message?: string;
}
```

**Option B: Message + Error Code**

```typescript
interface ClientError4xx {
  kind: 'ClientError';
  status: number;
  message?: string;
  code?: string; // e.g., 'PRODUCT_NOT_FOUND', 'AUTH_EXPIRED'
}
```

**Option C: Full Details Object**

```typescript
interface ClientError4xx {
  kind: 'ClientError';
  status: number;
  message?: string;
  code?: string;
  details?: Record<string, unknown>; // Arbitrary additional data
}
```

**Recommendation:** Option C with `details` - It provides flexibility for logging, debugging, and error pages without being overly prescriptive.

### Q4: How should async mapping work?

The monad should support async operations seamlessly:

```typescript
// Desired API
RenderPipeline.for<ViewState, CarryForward>()
  .tryAsync(() => getProductBySlug(slug))
  .then((p) =>
    p
      .mapAsync((product) => fetchInventory(product.inventoryId))
      .map((inventory) => ({ inStock: inventory.count > 0 }))
      .toPhaseOutput(),
  );
```

**Implementation Approach:**

- `map<U>(fn: (value: T) => U): RenderPipeline<U>` - Sync map
- `mapAsync<U>(fn: (value: T) => Promise<U>): Promise<RenderPipeline<U>>` - Async map
- `flatMap<U>(fn: (value: T) => RenderPipeline<U>): RenderPipeline<U>` - Chain pipelines
- `flatMapAsync<U>(fn: (value: T) => Promise<RenderPipeline<U>>): Promise<RenderPipeline<U>>` - Async chain

### Q5: Should we use a class or type + functions approach?

**Option A: Class-based (OOP)**

```typescript
class RenderPipeline<T> {
  private constructor(private readonly value: PipelineValue<T>) {}

  static ok<T>(value: T): RenderPipeline<T>;
  static notFound(message?: string): RenderPipeline<never>;

  map<U>(fn: (value: T) => U): RenderPipeline<U>;
  flatMap<U>(fn: (value: T) => RenderPipeline<U>): RenderPipeline<U>;
}
```

**Option B: Type + Functions (FP)**

```typescript
type RenderPipeline<T> = PhaseOutput<T> | ClientError4xx | ServerError5xx | Redirect3xx;

function map<T, U>(pipeline: RenderPipeline<T>, fn: (value: T) => U): RenderPipeline<U>;
function flatMap<T, U>(
  pipeline: RenderPipeline<T>,
  fn: (value: T) => RenderPipeline<U>,
): RenderPipeline<U>;
```

**Option C: Hybrid (Type + Builder)**

```typescript
type PipelineValue<T> = PhaseOutput<T, any> | ClientError4xx | ServerError5xx | Redirect3xx;

interface RenderPipeline<T, CarryForward = unknown> {
  readonly value: PipelineValue<T>;
  map<U>(fn: (value: T) => U): RenderPipeline<U, CarryForward>;
  flatMap<U>(fn: (value: T) => RenderPipeline<U, CarryForward>): RenderPipeline<U, CarryForward>;
}
```

**Recommendation:** Option A (Class-based) - It provides:

- Better method chaining ergonomics
- Clear distinction between the pipeline and its output values
- Encapsulation of error handling logic
- Better TypeScript inference in chains
- Natural home for the `.for<VS, CF>()` typed factory method

### Q6: How should the monad integrate with existing `SlowlyRenderResult` and `FastRenderResult`?

The current types are:

```typescript
type SlowlyRenderResult<VS, CF> =
  | PartialRender<VS, CF>
  | ServerError5xx
  | ClientError4xx
  | Redirect3xx;
type FastRenderResult<VS, CF> =
  | PartialRender<VS, CF>
  | ServerError5xx
  | ClientError4xx
  | Redirect3xx;
```

After renaming `PartialRender` to `PhaseOutput`:

```typescript
type SlowlyRenderResult<VS, CF> =
  | PhaseOutput<VS, CF>
  | ServerError5xx
  | ClientError4xx
  | Redirect3xx;
type FastRenderResult<VS, CF> = PhaseOutput<VS, CF> | ServerError5xx | ClientError4xx | Redirect3xx;
```

**Approach:**

- `RenderPipeline<T>` is the monadic wrapper used during computation
- Convert to `SlowlyRenderResult`/`FastRenderResult` at the end with `.toPhaseOutput()`
- These result types become the "final types" as requested
- The union type `RenderOutcome<VS, CF>` is identical to `SlowlyRenderResult` / `FastRenderResult`

```typescript
// Usage
async function renderSlowlyChanging(props: PageProps): Promise<SlowlyRenderResult<SlowVS, CF>> {
  return RenderPipeline.for<SlowVS, CF>()
    .tryAsync(() => getProductBySlug(props.slug))
    .then(
      (p) =>
        p
          .map((product) => ({ id: product.id, name: product.name }))
          .withCarryForward({ productId: product.id })
          .toPhaseOutput(), // Returns RenderOutcome<SlowVS, CF> which equals SlowlyRenderResult<SlowVS, CF>
    );
}
```

### Q7: Should we support catching exceptions automatically?

**Option A: Explicit Error Handling**

```typescript
const pipeline = await RenderPipeline.tryAsync(() => database.getProduct(id)).catch((err) =>
  RenderPipeline.serverError(500, 'Database error'),
);
```

**Option B: Auto-Catch with Recovery**

```typescript
const pipeline = await RenderPipeline.tryAsync(() => database.getProduct(id));
return pipeline
  .recover((err) => {
    if (err instanceof NotFoundError) return RenderPipeline.notFound();
    if (err instanceof AuthError) return RenderPipeline.unauthorized();
    return RenderPipeline.serverError(500, err.message);
  })
  .toPhaseOutput();
```

**Option C: Configurable Error Handler**

```typescript
const pipeline = await RenderPipeline.tryAsync(() => database.getProduct(id), {
  notFound: (err) => RenderPipeline.notFound(err.message),
  default: (err) => RenderPipeline.serverError(500, err.message),
});
```

**Recommendation:** Option B (Auto-Catch with Recovery) - It's flexible and allows domain-specific error mapping.

### Q8: How should ViewState and CarryForward be constructed?

**Key Insight:** The pipeline transforms a working value `T` through a chain of operations. The ViewState and CarryForward should be constructed **together at the end**, from the final working value.

**Problem with accumulating CarryForward separately:**

```typescript
// This approach loses access to the working value when building carryForward
RenderPipeline.ok(product)
  .withCarryForward({ productId: product.id }) // ✓ Has access to product
  .map((p) => ({ name: p.name })); // T changes to { name }
// Now we've lost access to product.inventoryItemId for carryForward!
```

**Solution: Construct both ViewState and CarryForward in `.toPhaseOutput()`**

The `.toPhaseOutput()` method takes a mapping function that has access to the final working value and produces both ViewState and CarryForward:

```typescript
RenderPipeline.for<ProductSlowViewState, ProductsCarryForward>()
  .tryAsync(() => getProductBySlug(slug))
  .map((product) => enrichProduct(product)) // T transforms freely
  .toPhaseOutput((enrichedProduct) => ({
    // ← Final mapping has access to everything
    viewState: {
      id: enrichedProduct.id,
      name: enrichedProduct.name,
      brand: enrichedProduct.brand,
    },
    carryForward: {
      productId: enrichedProduct.id,
      inventoryItemId: enrichedProduct.inventoryItemId,
    },
  }));
```

### Q9: How do we validate output types at the start of the chain?

**The Type Parameter Design:**

```typescript
RenderPipeline<T, TargetViewState, TargetCarryForward>;
```

Where:

- `T` = Current working value being transformed through `map()` / `flatMap()` - can be anything
- `TargetViewState` = The expected ViewState type for the output (set via `.for<>()`)
- `TargetCarryForward` = The expected CarryForward type for the output (set via `.for<>()`)

**Key principle:** `T` can transform freely through the chain. Only `.toPhaseOutput(fn)` validates that `fn` produces `{ viewState: TargetViewState, carryForward: TargetCarryForward }`.

**Usage Pattern:**

```typescript
return RenderPipeline.for<ProductSlowViewState, ProductsCarryForward>() // ← Set target output types
  .tryAsync(() => getProductBySlug(slug)) // T = Product | null
  .flatMap(
    (
      product, // Handle null
    ) => (product ? RenderPipeline.ok(product) : RenderPipeline.notFound('Product not found')),
  ) // T = Product
  .map((product) => ({
    // Enrich data
    ...product,
    formattedPrice: formatCurrency(product.price),
  })) // T = Product & { formattedPrice }
  .toPhaseOutput((data) => ({
    // ← Final mapping validates types
    viewState: {
      id: data.id,
      name: data.name,
      brand: data.brand,
      // ✅ TypeScript validates this matches ProductSlowViewState
    },
    carryForward: {
      productId: data.id,
      inventoryItemId: data.inventoryItemId,
      // ✅ TypeScript validates this matches ProductsCarryForward
    },
  }));
```

**Alternative: Return PhaseOutput directly:**

```typescript
.toPhaseOutput(data => phaseOutput(
    { id: data.id, name: data.name },     // viewState: ProductSlowViewState
    { productId: data.id }                 // carryForward: ProductsCarryForward
));
```

**Shorthand for simple cases (viewState = T, empty carryForward):**

```typescript
// When T already matches TargetViewState and no carryForward needed
RenderPipeline.for<SimpleViewState, {}>()
  .ok(data)
  .map((d) => ({ title: d.title, body: d.body }))
  .toPhaseOutput(); // No function needed - T becomes viewState, {} becomes carryForward
```

**Implementation Approach:**

```typescript
class RenderPipeline<T, TargetVS extends object = object, TargetCF extends object = {}> {
    // Single factory method that returns entry points with types baked in
    static for<TargetVS extends object, TargetCF extends object = {}>(): {
        ok<T>(value: T | Promise<T>): RenderPipeline<T, TargetVS, TargetCF>;
        try<T>(fn: () => T | Promise<T>): RenderPipeline<T, TargetVS, TargetCF>;
        from<T>(outcome: RenderOutcome<T, any>): RenderPipeline<T, TargetVS, TargetCF>;
        notFound(...): RenderPipeline<never, TargetVS, TargetCF>;
        serverError(...): RenderPipeline<never, TargetVS, TargetCF>;
        // ... other error constructors
    };

    // Unified map - always sync, handles U | Promise<U> | RenderPipeline<U>
    map<U>(fn: (value: T) => U | Promise<U> | RenderPipeline<U, TargetVS, TargetCF>): RenderPipeline<U, TargetVS, TargetCF>;

    // Final conversion - ONLY async method, resolves all pending promises
    toPhaseOutput(
        fn: (value: T) => { viewState: TargetVS; carryForward: TargetCF }
    ): Promise<RenderOutcome<TargetVS, TargetCF>>;
}
```

### Q10: Why a unified `map()` with deferred async resolution?

Traditional functional programming has separate methods:

- `map(fn: T => U)` - transform value
- `mapAsync(fn: T => Promise<U>)` - async transform
- `flatMap(fn: T => M<U>)` - chain monads

**Problems with separate methods:**

1. **Cognitive overhead**: Developers must choose the right method
2. **Refactoring pain**: Adding async to a sync function requires changing `map` to `mapAsync`
3. **Conditional branching**: Need to use `flatMap` just to return an error case
4. **Inconsistent return types**: Sometimes `RenderPipeline`, sometimes `Promise<RenderPipeline>`

**Solution: Lazy/deferred async resolution**

`map()` is always sync - it builds up a chain of transformations. Promises are tracked internally and only resolved when `toPhaseOutput()` is called.

```typescript
// map() always returns RenderPipeline (sync) - chains naturally
pipeline
    .map(x => x * 2)                              // Sync - stored
    .map(x => fetchDetails(x.id))                 // Async - promise stored, not awaited yet
    .map(x => x.valid ? x : Pipeline.notFound()) // Conditional - stored
    .toPhaseOutput(...)                           // ← Only here promises resolve
```

**Implementation approach:**

```typescript
class RenderPipeline<T, TargetVS, TargetCF> {
  private constructor(
    // Value can be immediate or a pending promise
    private readonly _value: T | Promise<T> | ServerError5xx | ClientError4xx | Redirect3xx,
    private readonly _isSuccess: boolean,
  ) {}

  map<U>(
    fn: (value: T) => U | Promise<U> | RenderPipeline<U, TargetVS, TargetCF>,
  ): RenderPipeline<U, TargetVS, TargetCF> {
    if (!this._isSuccess) {
      return this as unknown as RenderPipeline<U, TargetVS, TargetCF>; // Error passthrough
    }

    // Chain the transformation - may involve promises
    const newValue =
      this._value instanceof Promise
        ? this._value.then((v) => fn(v)) // Chain onto existing promise
        : fn(this._value as T); // Apply to immediate value

    // Normalize the result
    if (newValue instanceof RenderPipeline) {
      return newValue;
    }
    // Store promise or value - will be resolved at toPhaseOutput()
    return new RenderPipeline(newValue, true);
  }

  async toPhaseOutput(
    fn: (value: T) => { viewState: TargetVS; carryForward: TargetCF },
  ): Promise<RenderOutcome<TargetVS, TargetCF>> {
    if (!this._isSuccess) {
      return this._value as ServerError5xx | ClientError4xx | Redirect3xx;
    }

    // Resolve any pending promises
    const resolvedValue = await this._value;

    // If resolved to a RenderPipeline (from conditional map), unwrap it
    if (resolvedValue instanceof RenderPipeline) {
      return resolvedValue.toPhaseOutput(fn);
    }

    // Apply final mapping
    const { viewState, carryForward } = fn(resolvedValue as T);
    return { kind: 'PhaseOutput', rendered: viewState, carryForward };
  }
}
```

**Benefits:**

1. **Consistent API**: `map()` always returns `RenderPipeline`, chains naturally
2. **Single async point**: Only `toPhaseOutput()` is async
3. **No method selection**: One `map()` handles sync, async, and conditional
4. **Cleaner code**: No need to sprinkle `await` throughout the chain

## Proposed API

### Core Types

```typescript
// Final result types (renamed from current)
export interface PhaseOutput<ViewState extends object, CarryForward = {}> {
  kind: 'PhaseOutput';
  rendered: ViewState;
  carryForward: CarryForward;
}

export interface ServerError5xx {
  kind: 'ServerError';
  status: number;
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface ClientError4xx {
  kind: 'ClientError';
  status: number;
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface Redirect3xx {
  kind: 'Redirect';
  status: number;
  location: string;
  message?: string;
}

// Union of all possible outcomes
export type RenderOutcome<VS extends object, CF = {}> =
  | PhaseOutput<VS, CF>
  | ServerError5xx
  | ClientError4xx
  | Redirect3xx;
```

### RenderPipeline Monad

```typescript
/**
 * A pipeline for composing render operations with automatic error propagation.
 *
 * Type Parameters:
 * - T: The current working value being transformed through the chain
 * - TargetVS: The expected ViewState output type (set via .for<>())
 * - TargetCF: The expected CarryForward output type (set via .for<>())
 *
 * Usage:
 *    RenderPipeline.for<SlowViewState, CarryForward>()
 *        .tryAsync(() => fetchData())
 *        .map(data => transformData(data))
 *        .toPhaseOutput(data => ({
 *            viewState: { ... },
 *            carryForward: { ... }
 *        }));
 */
export class RenderPipeline<T, TargetVS extends object = object, TargetCF extends object = {}> {
  private constructor(
    private readonly _value: T | ServerError5xx | ClientError4xx | Redirect3xx,
    private readonly _isSuccess: boolean,
  ) {}

  // ===== Pipeline Factory =====

  /**
   * Create a typed pipeline with target output types declared upfront.
   * TypeScript validates that .toPhaseOutput() produces these types.
   *
   * Returns an object with entry point methods:
   * - .ok(value) - Start with a success value
   * - .try(fn) - Start with a function (sync or async, catches errors)
   * - .from(outcome) - Start from an existing RenderOutcome
   * - .notFound(), .serverError(), etc. - Start with an error
   */
  static for<TargetVS extends object, TargetCF extends object = {}>(): {
    /** Start with a success value (can be T or Promise<T>) */
    ok<T>(value: T | Promise<T>): RenderPipeline<T, TargetVS, TargetCF>;

    /**
     * Start with a function that returns T or Promise<T>.
     * Catches errors into the pipeline (accessible via recover()).
     * Always returns RenderPipeline (sync) - promises resolved at toPhaseOutput().
     */
    try<T>(fn: () => T | Promise<T>): RenderPipeline<T, TargetVS, TargetCF>;

    /** Start from an existing outcome */
    from<T>(outcome: RenderOutcome<T, any>): RenderPipeline<T, TargetVS, TargetCF>;

    // Error entry points
    notFound(
      message?: string,
      details?: Record<string, unknown>,
    ): RenderPipeline<never, TargetVS, TargetCF>;
    badRequest(
      message?: string,
      details?: Record<string, unknown>,
    ): RenderPipeline<never, TargetVS, TargetCF>;
    unauthorized(
      message?: string,
      details?: Record<string, unknown>,
    ): RenderPipeline<never, TargetVS, TargetCF>;
    forbidden(
      message?: string,
      details?: Record<string, unknown>,
    ): RenderPipeline<never, TargetVS, TargetCF>;
    serverError(
      status: number,
      message?: string,
      details?: Record<string, unknown>,
    ): RenderPipeline<never, TargetVS, TargetCF>;
    clientError(
      status: number,
      message?: string,
      details?: Record<string, unknown>,
    ): RenderPipeline<never, TargetVS, TargetCF>;
    redirect(status: number, location: string): RenderPipeline<never, TargetVS, TargetCF>;
  };

  // ===== Transformation Methods =====

  /**
   * Transform the working value. Always returns RenderPipeline (sync).
   *
   * The mapping function can return:
   * - U: Plain value
   * - Promise<U>: Async value (resolved later at toPhaseOutput)
   * - RenderPipeline<U>: For conditional errors/branching
   *
   * The pipeline internally tracks pending async operations.
   * All promises are resolved when toPhaseOutput() is called.
   *
   * Examples:
   *   .map(x => x * 2)                                    // Sync value
   *   .map(x => fetchDetails(x.id))                       // Async - resolved at end
   *   .map(x => x.valid ? x : Pipeline.notFound())        // Conditional error
   */
  map<U>(
    fn: (value: T) => U | Promise<U> | RenderPipeline<U, TargetVS, TargetCF>,
  ): RenderPipeline<U, TargetVS, TargetCF>;

  /** Handle the error case, potentially recovering to a success */
  recover<U>(
    fn: (error: Error) => RenderPipeline<U, TargetVS, TargetCF>,
  ): RenderPipeline<T | U, TargetVS, TargetCF>;

  // ===== Terminal Methods =====

  /**
   * Convert to final PhaseOutput with explicit mapping.
   *
   * This is the ONLY async method in the API.
   * It resolves all pending promises accumulated via map() calls,
   * then applies the final mapping to produce ViewState and CarryForward.
   *
   * TypeScript validates the output matches TargetVS and TargetCF.
   */
  toPhaseOutput(
    fn: (value: T) => { viewState: TargetVS; carryForward: TargetCF },
  ): Promise<RenderOutcome<TargetVS, TargetCF>>;

  /**
   * Alternative: return PhaseOutput directly from the mapping function.
   */
  toPhaseOutput(
    fn: (value: T) => PhaseOutput<TargetVS, TargetCF>,
  ): Promise<RenderOutcome<TargetVS, TargetCF>>;

  // ===== Utility Methods =====

  /** Check if this is a success */
  isOk(): boolean;

  /** Check if this is an error */
  isError(): boolean;

  /** Get the value or throw */
  unwrap(): T;

  /** Get the value or return a default */
  unwrapOr<U>(defaultValue: U): T | U;
}
```

### Example Usage

**Before (current):**

```typescript
async function renderSlowlyChanging(
  props: PageProps & ProductPageParams,
): Promise<SlowlyRenderResult<ProductSlowViewState, ProductsCarryForward>> {
  try {
    const product = await getProductBySlug(props.slug);
    if (!product) return notFound();

    const { id, brand, description, name, priceData } = product;
    return partialRender(
      { id, brand, description, name, priceData },
      { productId: id, inventoryItemId: product.inventoryItemId },
    );
  } catch (error) {
    if (error instanceof DatabaseError) {
      return serverError5xx(503);
    }
    throw error;
  }
}
```

**After (with typed pipeline):**

```typescript
async function renderSlowlyChanging(
  props: PageProps & ProductPageParams,
): Promise<SlowlyRenderResult<ProductSlowViewState, ProductsCarryForward>> {
  // Create pipeline factory with target output types
  const Pipeline = RenderPipeline.for<ProductSlowViewState, ProductsCarryForward>();

  // All map() calls are sync - chain naturally
  // Only toPhaseOutput() is async
  return Pipeline.try(() => getProductBySlug(props.slug)) // Start with async fetch
    .recover((err) => Pipeline.serverError(503, 'Database unavailable'))
    .map((product) =>
      product // Conditional - returns value or RenderPipeline
        ? product
        : Pipeline.notFound('Product not found', { slug: props.slug }),
    )
    .map((product) => ({
      // Sync transformation
      ...product,
      formattedPrice: formatCurrency(product.priceData.price),
    }))
    .toPhaseOutput((data) => ({
      // ← Only async point
      viewState: {
        id: data.id,
        brand: data.brand,
        description: data.description,
        name: data.name,
        priceData: data.priceData,
      },
      carryForward: {
        productId: data.id,
        inventoryItemId: data.inventoryItemId,
      },
    }));
}
```

**Multiple async operations - all sync until toPhaseOutput:**

```typescript
async function renderWithMultipleFetches(
  props: PageProps,
): Promise<SlowlyRenderResult<DashboardViewState, DashboardCarryForward>> {
  const Pipeline = RenderPipeline.for<DashboardViewState, DashboardCarryForward>();

  // Chain async operations - map() stays sync, promises tracked internally
  return Pipeline.try(() => fetchUser(props.userId)) // Async fetch stored
    .map(async (user) => {
      // Another async - promise chained
      const stats = await fetchUserStats(user.id);
      return { user, stats };
    })
    .recover((err) => Pipeline.serverError(503, 'Service unavailable'))
    .toPhaseOutput(({ user, stats }) => ({
      // ← All promises resolved here
      viewState: {
        userName: user.name,
        totalOrders: stats.orderCount,
        lastLogin: stats.lastLogin,
      },
      carryForward: {
        userId: user.id,
      },
    }));
}
```

**Simple case (no carryForward):**

```typescript
async function renderSimplePage(): Promise<SlowlyRenderResult<SimpleViewState, {}>> {
  return RenderPipeline.for<SimpleViewState, {}>()
    .try(() => fetchStaticData())
    .map((d) => ({ title: d.title, body: d.body }))
    .toPhaseOutput((vs) => ({ viewState: vs, carryForward: {} }));
}
```

**Conditional error in the middle of async chain:**

```typescript
async function renderProduct(slug: string) {
  const Pipeline = RenderPipeline.for<ProductVS, ProductCF>();

  return Pipeline.try(() => getProductBySlug(slug)) // Async
    .map((product) => (product ? product : Pipeline.notFound())) // Conditional error
    .map(async (product) => {
      // More async
      const inventory = await getInventory(product.id);
      return { product, inventory };
    })
    .map(
      (
        { product, inventory }, // Sync transform
      ) =>
        inventory.count > 0 ? { product, inventory } : Pipeline.clientError(410, 'Out of stock'),
    )
    .toPhaseOutput(({ product, inventory }) => ({
      // Resolve all
      viewState: { name: product.name, stock: inventory.count },
      carryForward: { productId: product.id },
    }));
}
```

## Implementation Plan

### Phase 1: Core Types Update

1. Rename `PartialRender` to `PhaseOutput`
2. Add `message`, `code`, `details` fields to error types
3. Update `SlowlyRenderResult` and `FastRenderResult` type aliases
4. Keep `partialRender()` constructor as alias for backwards compatibility

### Phase 2: RenderPipeline Monad - Core

1. Implement `RenderPipeline` class with core methods
2. Implement static constructors (`ok`, `notFound`, `serverError`, etc.)
3. Implement `map`, `flatMap`, `mapAsync`, `flatMapAsync`
4. Implement `tryAsync` with error catching
5. Implement `recover` for error handling
6. Implement `toPhaseOutput()` for final conversion

### Phase 3: Typed Pipeline Builder

1. Implement `RenderPipeline.for<VS, CF>()` factory
2. Implement `TypedPipelineBuilder` interface
3. Implement `TypedRenderPipeline` with type validation
4. Add compile-time validation that `toPhaseOutput()` matches target types

### Phase 4: Integration

1. Update existing examples to use new API (optional)
2. Update tests
3. Document the new API in README

### Phase 5: Deprecation (optional)

1. Mark old constructor functions as deprecated
2. Provide migration guide

## Migration Strategy

The new API is additive. Existing code continues to work:

- `partialRender()` still works (alias for `phaseOutput()`)
- `notFound()`, `serverError5xx()`, etc. still work
- Error types are backwards compatible (new fields are optional)

New code can incrementally adopt `RenderPipeline` where chaining is beneficial.

**Migration Example:**

```typescript
// Before: Direct return with manual error handling
async function render(props): Promise<SlowlyRenderResult<VS, CF>> {
  const data = await fetch();
  if (!data) return notFound();
  return partialRender({ name: data.name, price: data.price }, { dataId: data.id });
}

// After: Using pipeline - clean chain, single async point
async function render(props): Promise<SlowlyRenderResult<VS, CF>> {
  const Pipeline = RenderPipeline.for<VS, CF>();

  return Pipeline.try(() => fetch()) // Async stored
    .map((data) => (data ? data : Pipeline.notFound())) // Conditional
    .toPhaseOutput((data) => ({
      // ← Only await here
      viewState: { name: data.name, price: data.price },
      carryForward: { dataId: data.id },
    }));
}
```

## Open Questions

1. **Should we add combinator functions?** (e.g., `all`, `race`, `first`)

   - These could be useful for parallel data fetching
   - Example: `Pipeline.all([fetchA(), fetchB()]).map(([a, b]) => ...)`

2. **Should error types be classes instead of interfaces?**

   - Would allow `instanceof` checks but adds complexity
   - Current recommendation: Keep as interfaces with `kind` discriminator

3. **Should `.toPhaseOutput()` have a shorthand for the common case?**

   - When `T` already matches `TargetVS` and `TargetCF` is `{}`
   - Could allow `.toPhaseOutput()` with no argument
   - Or require explicit `.toPhaseOutput(vs => ({ viewState: vs, carryForward: {} }))`

4. **How should errors in async map functions be handled?**
   - If `map(async x => ...)` throws, should it become a ServerError?
   - Or should `.recover()` be able to catch it?
   - Current thinking: Caught exceptions become errors that `.recover()` can handle

## Appendix: Alternative Names Considered

For the main monad (chose `RenderPipeline`):

- `RenderResult` - ❌ Confusing: it's not the result, it's the pipeline producing results
- `PageResult` - Too page-specific
- `RenderMonad` - Too technical
- `RenderChain` - Decent but less clear than pipeline
- `PhaseBuilder` - Could work, but "builder" implies a different pattern
- `Outcome` - Too generic
- `Response` - Confuses with HTTP response

For PhaseOutput (chose `PhaseOutput`):

- `PartialRender` - ❌ Confusing: "partial" suggests incomplete
- `RenderData` - Doesn't capture carry-forward
- `PhaseResult` - Conflicts with Result terminology
- `PhaseComplete` - Implies finality incorrectly
- `RenderSuccess` - Too generic, doesn't convey phase concept
- `Rendered` - Too vague

## Status: Implemented ✅

Implementation complete in `@jay-framework/fullstack-component`:

- `RenderPipeline` class in `lib/render-pipeline.ts`
- Updated types (`PhaseOutput`, error types with messages) in `lib/jay-stack-types.ts`
- Tests in `test/render-pipeline.test.ts`
- Documentation in `README.md`