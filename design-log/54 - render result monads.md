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
    code?: string;  // e.g., 'PRODUCT_NOT_FOUND', 'AUTH_EXPIRED'
}
```

**Option C: Full Details Object**
```typescript
interface ClientError4xx {
    kind: 'ClientError';
    status: number;
    message?: string;
    code?: string;
    details?: Record<string, unknown>;  // Arbitrary additional data
}
```

**Recommendation:** Option C with `details` - It provides flexibility for logging, debugging, and error pages without being overly prescriptive.

### Q4: How should async mapping work?

The monad should support async operations seamlessly:

```typescript
// Desired API
RenderPipeline.for<ViewState, CarryForward>()
    .tryAsync(() => getProductBySlug(slug))
    .then(p => p
        .mapAsync(product => fetchInventory(product.inventoryId))
        .map(inventory => ({ inStock: inventory.count > 0 }))
        .toPhaseOutput()
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
function flatMap<T, U>(pipeline: RenderPipeline<T>, fn: (value: T) => RenderPipeline<U>): RenderPipeline<U>;
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
type SlowlyRenderResult<VS, CF> = PartialRender<VS, CF> | ServerError5xx | ClientError4xx | Redirect3xx;
type FastRenderResult<VS, CF> = PartialRender<VS, CF> | ServerError5xx | ClientError4xx | Redirect3xx;
```

After renaming `PartialRender` to `PhaseOutput`:
```typescript
type SlowlyRenderResult<VS, CF> = PhaseOutput<VS, CF> | ServerError5xx | ClientError4xx | Redirect3xx;
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
    return RenderPipeline
        .for<SlowVS, CF>()
        .tryAsync(() => getProductBySlug(props.slug))
        .then(p => p
            .map(product => ({ id: product.id, name: product.name }))
            .withCarryForward({ productId: product.id })
            .toPhaseOutput()  // Returns RenderOutcome<SlowVS, CF> which equals SlowlyRenderResult<SlowVS, CF>
        );
}
```

### Q7: Should we support catching exceptions automatically?

**Option A: Explicit Error Handling**
```typescript
const pipeline = await RenderPipeline.tryAsync(() => database.getProduct(id))
    .catch(err => RenderPipeline.serverError(500, 'Database error'));
```

**Option B: Auto-Catch with Recovery**
```typescript
const pipeline = await RenderPipeline.tryAsync(() => database.getProduct(id));
return pipeline.recover(err => {
    if (err instanceof NotFoundError) return RenderPipeline.notFound();
    if (err instanceof AuthError) return RenderPipeline.unauthorized();
    return RenderPipeline.serverError(500, err.message);
}).toPhaseOutput();
```

**Option C: Configurable Error Handler**
```typescript
const pipeline = await RenderPipeline.tryAsync(
    () => database.getProduct(id),
    {
        notFound: err => RenderPipeline.notFound(err.message),
        default: err => RenderPipeline.serverError(500, err.message),
    }
);
```

**Recommendation:** Option B (Auto-Catch with Recovery) - It's flexible and allows domain-specific error mapping.

### Q8: How should ViewState and CarryForward be constructed?

**Key Insight:** The pipeline transforms a working value `T` through a chain of operations. The ViewState and CarryForward should be constructed **together at the end**, from the final working value.

**Problem with accumulating CarryForward separately:**
```typescript
// This approach loses access to the working value when building carryForward
RenderPipeline.ok(product)
    .withCarryForward({ productId: product.id })  // ✓ Has access to product
    .map(p => ({ name: p.name }))                  // T changes to { name }
    // Now we've lost access to product.inventoryItemId for carryForward!
```

**Solution: Construct both ViewState and CarryForward in `.toPhaseOutput()`**

The `.toPhaseOutput()` method takes a mapping function that has access to the final working value and produces both ViewState and CarryForward:

```typescript
RenderPipeline
    .for<ProductSlowViewState, ProductsCarryForward>()
    .tryAsync(() => getProductBySlug(slug))
    .map(product => enrichProduct(product))  // T transforms freely
    .toPhaseOutput(enrichedProduct => ({     // ← Final mapping has access to everything
        viewState: {
            id: enrichedProduct.id,
            name: enrichedProduct.name,
            brand: enrichedProduct.brand,
        },
        carryForward: {
            productId: enrichedProduct.id,
            inventoryItemId: enrichedProduct.inventoryItemId,
        }
    }));
```

### Q9: How do we validate output types at the start of the chain?

**The Type Parameter Design:**

```typescript
RenderPipeline<T, TargetViewState, TargetCarryForward>
```

Where:
- `T` = Current working value being transformed through `map()` / `flatMap()` - can be anything
- `TargetViewState` = The expected ViewState type for the output (set via `.for<>()`)
- `TargetCarryForward` = The expected CarryForward type for the output (set via `.for<>()`)

**Key principle:** `T` can transform freely through the chain. Only `.toPhaseOutput(fn)` validates that `fn` produces `{ viewState: TargetViewState, carryForward: TargetCarryForward }`.

**Usage Pattern:**

```typescript
return RenderPipeline
    .for<ProductSlowViewState, ProductsCarryForward>()  // ← Set target output types
    .tryAsync(() => getProductBySlug(slug))             // T = Product | null
    .flatMap(product =>                                  // Handle null
        product 
            ? RenderPipeline.ok(product) 
            : RenderPipeline.notFound('Product not found')
    )                                                    // T = Product
    .map(product => ({                                   // Enrich data
        ...product,
        formattedPrice: formatCurrency(product.price),
    }))                                                  // T = Product & { formattedPrice }
    .toPhaseOutput(data => ({                           // ← Final mapping validates types
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
        }
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
RenderPipeline
    .for<SimpleViewState, {}>()
    .ok(data)
    .map(d => ({ title: d.title, body: d.body }))
    .toPhaseOutput();  // No function needed - T becomes viewState, {} becomes carryForward
```

**Implementation Approach:**

```typescript
class RenderPipeline<T, TargetVS extends object = object, TargetCF extends object = {}> {
    // Creates a typed pipeline with target output types
    static for<TargetVS extends object, TargetCF extends object = {}>(): TypedPipelineStarter<TargetVS, TargetCF>;
    
    // Untyped entry points
    static ok<T>(value: T): RenderPipeline<T>;
    static tryAsync<T>(fn: () => Promise<T>): Promise<RenderPipeline<T>>;
}

interface TypedPipelineStarter<TargetVS, TargetCF> {
    ok<T>(value: T): RenderPipeline<T, TargetVS, TargetCF>;
    tryAsync<T>(fn: () => Promise<T>): Promise<RenderPipeline<T, TargetVS, TargetCF>>;
}

class RenderPipeline<T, TargetVS, TargetCF> {
    // Transform working value (T changes, target types preserved)
    map<U>(fn: (value: T) => U): RenderPipeline<U, TargetVS, TargetCF>;
    mapAsync<U>(fn: (value: T) => Promise<U>): Promise<RenderPipeline<U, TargetVS, TargetCF>>;
    flatMap<U>(fn: (value: T) => RenderPipeline<U, any, any>): RenderPipeline<U, TargetVS, TargetCF>;
    
    // Final conversion with explicit mapping - validates output types
    toPhaseOutput(
        fn: (value: T) => { viewState: TargetVS; carryForward: TargetCF }
    ): RenderOutcome<TargetVS, TargetCF>;
    
    // Alternative: return PhaseOutput directly
    toPhaseOutput(
        fn: (value: T) => PhaseOutput<TargetVS, TargetCF>
    ): RenderOutcome<TargetVS, TargetCF>;
    
    // Shorthand: when T extends TargetVS and TargetCF is {}
    toPhaseOutput(): T extends TargetVS 
        ? TargetCF extends {} 
            ? RenderOutcome<TargetVS, TargetCF> 
            : never 
        : never;
}
```

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

    // ===== Typed Pipeline Factory =====
    
    /**
     * Create a typed pipeline with target output types declared upfront.
     * TypeScript validates that .toPhaseOutput() produces these types.
     */
    static for<TargetVS extends object, TargetCF extends object = {}>(): TypedPipelineStarter<TargetVS, TargetCF>;

    // ===== Untyped Static Constructors =====
    
    /** Create a success pipeline from a value */
    static ok<T, TargetVS extends object, TargetCF extends object = {}>(value: T): RenderPipeline<T, TargetVS, TargetCF>;
    
    /** Create a pipeline from an async operation, catching errors */
    static tryAsync<T, TargetVS extends object, TargetCF extends object = {}>(fn: () => Promise<T>): Promise<RenderPipeline<T, TargetVS, TargetCF>>;
    
    /** Create from an existing outcome value */
    static from<T, TargetVS extends object, TargetCF extends object = {}>(outcome: RenderOutcome<T, any>): RenderPipeline<T, TargetVS, TargetCF>;
    
    // ===== Error Constructors =====
    
    /** 404 Not Found */
    static notFound(message?: string, details?: Record<string, unknown>): RenderPipeline<never>;
    
    /** 400 Bad Request */
    static badRequest(message?: string, details?: Record<string, unknown>): RenderPipeline<never>;
    
    /** 401 Unauthorized */
    static unauthorized(message?: string, details?: Record<string, unknown>): RenderPipeline<never>;
    
    /** 403 Forbidden */
    static forbidden(message?: string, details?: Record<string, unknown>): RenderPipeline<never>;
    
    /** Custom 5xx Server Error */
    static serverError(status: number, message?: string, details?: Record<string, unknown>): RenderPipeline<never>;
    
    /** Custom 4xx Client Error */
    static clientError(status: number, message?: string, details?: Record<string, unknown>): RenderPipeline<never>;
    
    /** 3xx Redirect */
    static redirect(status: number, location: string): RenderPipeline<never>;
    
    // ===== Transformation Methods =====
    
    /** Transform the success value (errors pass through unchanged) */
    map<U>(fn: (value: T) => U): RenderPipeline<U, TargetVS, TargetCF>;
    
    /** Transform the success value with an async function */
    mapAsync<U>(fn: (value: T) => Promise<U>): Promise<RenderPipeline<U, TargetVS, TargetCF>>;
    
    /** Chain with another RenderPipeline-producing function */
    flatMap<U>(fn: (value: T) => RenderPipeline<U, any, any>): RenderPipeline<U, TargetVS, TargetCF>;
    
    /** Chain with an async RenderPipeline-producing function */
    flatMapAsync<U>(
        fn: (value: T) => Promise<RenderPipeline<U, any, any>>
    ): Promise<RenderPipeline<U, TargetVS, TargetCF>>;
    
    /** Handle the error case, potentially recovering to a success */
    recover<U>(
        fn: (error: Error) => RenderPipeline<U, any, any>
    ): RenderPipeline<T | U, TargetVS, TargetCF>;
    
    // ===== Terminal Methods =====
    
    /**
     * Convert to final PhaseOutput with explicit mapping.
     * The mapping function receives the final working value and produces both ViewState and CarryForward.
     * TypeScript validates the output matches TargetVS and TargetCF.
     */
    toPhaseOutput(
        fn: (value: T) => { viewState: TargetVS; carryForward: TargetCF }
    ): RenderOutcome<TargetVS, TargetCF>;
    
    /**
     * Alternative: return PhaseOutput directly from the mapping function.
     */
    toPhaseOutput(
        fn: (value: T) => PhaseOutput<TargetVS, TargetCF>
    ): RenderOutcome<TargetVS, TargetCF>;
    
    /**
     * Shorthand for simple cases where T already matches TargetVS and TargetCF is {}.
     * Only available when these conditions are met.
     */
    toPhaseOutput(): T extends TargetVS 
        ? TargetCF extends Record<string, never>  // Empty object
            ? RenderOutcome<TargetVS, TargetCF> 
            : never 
        : never;
    
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

/**
 * Entry point for creating a typed pipeline.
 * Returns methods to start the pipeline with a value or async operation.
 */
interface TypedPipelineStarter<TargetVS extends object, TargetCF extends object> {
    /** Start with a success value */
    ok<T>(value: T): RenderPipeline<T, TargetVS, TargetCF>;
    
    /** Start with an async operation (catches errors into pipeline) */
    tryAsync<T>(fn: () => Promise<T>): Promise<RenderPipeline<T, TargetVS, TargetCF>>;
    
    /** Start from an existing outcome */
    from<T>(outcome: RenderOutcome<T, any>): RenderPipeline<T, TargetVS, TargetCF>;
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
            { productId: id, inventoryItemId: product.inventoryItemId }
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
    // Declare target output types upfront
    const pipeline = await RenderPipeline
        .for<ProductSlowViewState, ProductsCarryForward>()
        .tryAsync(() => getProductBySlug(props.slug));
    
    return pipeline
        .recover(err => RenderPipeline.serverError(503, 'Database unavailable'))
        .flatMap(product => 
            product 
                ? RenderPipeline.ok(product)
                : RenderPipeline.notFound('Product not found', { slug: props.slug })
        )
        // T is now Product, we can transform it freely
        .map(product => ({
            ...product,
            formattedPrice: formatCurrency(product.priceData.price),
        }))
        // Final mapping produces both ViewState and CarryForward
        .toPhaseOutput(data => ({
            viewState: {
                id: data.id,
                brand: data.brand,
                description: data.description,
                name: data.name,
                priceData: data.priceData,
                // ✅ TypeScript validates this matches ProductSlowViewState
            },
            carryForward: {
                productId: data.id,
                inventoryItemId: data.inventoryItemId,
                // ✅ TypeScript validates this matches ProductsCarryForward
            }
        }));
}
```

**Using phaseOutput helper:**
```typescript
async function renderSlowlyChanging(
    props: PageProps & ProductPageParams,
): Promise<SlowlyRenderResult<ProductSlowViewState, ProductsCarryForward>> {
    const pipeline = await RenderPipeline
        .for<ProductSlowViewState, ProductsCarryForward>()
        .tryAsync(() => getProductBySlug(props.slug));
    
    return pipeline
        .recover(err => RenderPipeline.serverError(503, 'Database unavailable'))
        .flatMap(product => 
            product 
                ? RenderPipeline.ok(product)
                : RenderPipeline.notFound('Product not found')
        )
        .toPhaseOutput(product => phaseOutput(
            { id: product.id, brand: product.brand, name: product.name, ... },
            { productId: product.id, inventoryItemId: product.inventoryItemId }
        ));
}
```

**Simple case (no carryForward):**
```typescript
async function renderSimplePage(): Promise<SlowlyRenderResult<SimpleViewState, {}>> {
    const data = await fetchStaticData();
    
    return RenderPipeline
        .for<SimpleViewState, {}>()
        .ok(data)
        .map(d => ({ title: d.title, body: d.body }))
        .toPhaseOutput(vs => ({ viewState: vs, carryForward: {} }));
    
    // Or shorthand when T matches TargetVS and TargetCF is {}:
    // .toPhaseOutput();
}
```

**Multiple async operations:**
```typescript
async function renderWithMultipleFetches(
    props: PageProps,
): Promise<SlowlyRenderResult<DashboardViewState, DashboardCarryForward>> {
    const pipeline = await RenderPipeline
        .for<DashboardViewState, DashboardCarryForward>()
        .tryAsync(() => fetchUser(props.userId));
    
    return pipeline
        .flatMapAsync(async user => {
            const stats = await fetchUserStats(user.id);
            return RenderPipeline.ok({ user, stats });
        })
        .recover(err => RenderPipeline.serverError(503, 'Service unavailable'))
        .toPhaseOutput(({ user, stats }) => ({
            viewState: {
                userName: user.name,
                totalOrders: stats.orderCount,
                lastLogin: stats.lastLogin,
            },
            carryForward: {
                userId: user.id,
            }
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
    return partialRender(
        { name: data.name, price: data.price },
        { dataId: data.id }
    );
}

// After: Using pipeline (optional, for complex cases)
async function render(props): Promise<SlowlyRenderResult<VS, CF>> {
    const pipeline = await RenderPipeline
        .for<VS, CF>()
        .tryAsync(() => fetch());
    
    return pipeline
        .flatMap(data => data 
            ? RenderPipeline.ok(data) 
            : RenderPipeline.notFound()
        )
        .toPhaseOutput(data => ({
            viewState: { name: data.name, price: data.price },
            carryForward: { dataId: data.id }
        }));
}
```

## Open Questions

1. **Should `RenderPipeline` be lazy?** (Only execute on `.toPhaseOutput()`)
   - Pro: Can compose without immediate execution
   - Con: More complex, harder to debug
   - Current recommendation: Eager execution for simplicity

2. **Should we add combinator functions?** (e.g., `all`, `race`, `first`)
   - These could be useful for parallel data fetching
   - Example: `RenderPipeline.all([fetchA(), fetchB()]).map(([a, b]) => ...)`

3. **Should error types be classes instead of interfaces?**
   - Would allow `instanceof` checks but adds complexity
   - Current recommendation: Keep as interfaces with `kind` discriminator

4. **Should `.toPhaseOutput()` have a shorthand for the common case?**
   - When `T` already matches `TargetVS` and `TargetCF` is `{}`
   - Could allow `.toPhaseOutput()` with no argument
   - Or require explicit `.toPhaseOutput(vs => ({ viewState: vs, carryForward: {} }))`

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

