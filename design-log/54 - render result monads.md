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
RenderResult.fromAsync(() => getProductBySlug(slug))
    .mapAsync(product => fetchInventory(product.inventoryId))
    .map(inventory => ({ inStock: inventory.count > 0 }))
    .toPhaseOutput(carryForward);
```

**Implementation Approach:**
- `map<U>(fn: (value: T) => U): RenderResult<U>` - Sync map
- `mapAsync<U>(fn: (value: T) => Promise<U>): Promise<RenderResult<U>>` - Async map
- `flatMap<U>(fn: (value: T) => RenderResult<U>): RenderResult<U>` - Chain results
- `flatMapAsync<U>(fn: (value: T) => Promise<RenderResult<U>>): Promise<RenderResult<U>>` - Async chain

### Q5: Should we use a class or type + functions approach?

**Option A: Class-based (OOP)**
```typescript
class RenderResult<T> {
    private constructor(private readonly value: RenderResultValue<T>) {}
    
    static ok<T>(value: T): RenderResult<T>;
    static notFound(message?: string): RenderResult<never>;
    
    map<U>(fn: (value: T) => U): RenderResult<U>;
    flatMap<U>(fn: (value: T) => RenderResult<U>): RenderResult<U>;
}
```

**Option B: Type + Functions (FP)**
```typescript
type RenderResult<T> = PhaseOutput<T> | ClientError4xx | ServerError5xx | Redirect3xx;

function map<T, U>(result: RenderResult<T>, fn: (value: T) => U): RenderResult<U>;
function flatMap<T, U>(result: RenderResult<T>, fn: (value: T) => RenderResult<U>): RenderResult<U>;
```

**Option C: Hybrid (Type + Builder)**
```typescript
type RenderResultValue<T> = PhaseOutput<T, any> | ClientError4xx | ServerError5xx | Redirect3xx;

interface RenderResult<T, CarryForward = unknown> {
    readonly value: RenderResultValue<T>;
    map<U>(fn: (value: T) => U): RenderResult<U, CarryForward>;
    flatMap<U>(fn: (value: T) => RenderResult<U, CarryForward>): RenderResult<U, CarryForward>;
}
```

**Recommendation:** Option A (Class-based) - It provides:
- Better method chaining ergonomics
- Clear distinction between RenderResult and its underlying values
- Encapsulation of error handling logic
- Better TypeScript inference in chains

### Q6: How should the monad integrate with existing `SlowlyRenderResult` and `FastRenderResult`?

The current types are:
```typescript
type SlowlyRenderResult<VS, CF> = PartialRender<VS, CF> | ServerError5xx | ClientError4xx | Redirect3xx;
type FastRenderResult<VS, CF> = PartialRender<VS, CF> | ServerError5xx | ClientError4xx | Redirect3xx;
```

**Approach:** 
- `RenderResult<T>` is the monadic wrapper used during computation
- Convert to `SlowlyRenderResult`/`FastRenderResult` at the end with `.unwrap()` or `.toResult()`
- These result types become the "final types" as requested

```typescript
// Usage
async function renderSlowlyChanging(props: PageProps): Promise<SlowlyRenderResult<...>> {
    return RenderResult.fromAsync(() => getProductBySlug(props.slug))
        .map(product => ({
            id: product.id,
            name: product.name,
        }))
        .toSlowlyResult({ productId: product.id });  // Unwrap to SlowlyRenderResult
}
```

### Q7: Should we support catching exceptions automatically?

**Option A: Explicit Error Handling**
```typescript
const result = await RenderResult.fromAsync(() => database.getProduct(id))
    .catch(err => RenderResult.serverError(500, 'Database error'));
```

**Option B: Auto-Catch with Recovery**
```typescript
const result = await RenderResult.tryAsync(() => database.getProduct(id))
    .recover(err => {
        if (err instanceof NotFoundError) return RenderResult.notFound();
        if (err instanceof AuthError) return RenderResult.unauthorized();
        return RenderResult.serverError(500, err.message);
    });
```

**Option C: Configurable Error Handler**
```typescript
const result = await RenderResult.tryAsync(
    () => database.getProduct(id),
    {
        notFound: err => RenderResult.notFound(err.message),
        default: err => RenderResult.serverError(500, err.message),
    }
);
```

**Recommendation:** Option B (Auto-Catch with Recovery) - It's flexible and allows domain-specific error mapping.

### Q8: How should CarryForward be handled in the monad?

The `PartialRender` type has two type parameters: `ViewState` and `CarryForward`. The monad should track both.

**Approach:**
- `RenderPipeline<T, CarryForward>` carries both types
- CarryForward is accumulated through the chain
- `toPhaseOutput()` produces the final `PhaseOutput<ViewState, CarryForward>`

```typescript
RenderPipeline.ok(product)
    .withCarryForward({ productId: product.id })  // Add to carry forward
    .map(p => ({ name: p.name, price: p.price }))  // Transform value
    .toPhaseOutput();  // → PhaseOutput<{ name, price }, { productId }>
```

### Q9: How do we validate output types at the start of the chain?

We want TypeScript to validate that the final `.toPhaseOutput()` matches the expected types declared at the beginning. This prevents runtime type mismatches.

**Option A: Generic Factory with Output Types**
```typescript
// Declare expected output types upfront
return RenderPipeline
    .for<ProductSlowViewState, ProductsCarryForward>()  // ← Declare target types
    .from(() => getProductBySlug(slug))
    .map(product => ({
        id: product.id,
        name: product.name,
        // price: product.price,  // ❌ TypeScript error if not in ProductSlowViewState
    }))
    .withCarryForward({ productId: product.id })
    .toPhaseOutput();  // ✅ TypeScript validates output matches declared types
```

**Option B: Typed Terminal Method**
```typescript
return RenderPipeline
    .from(() => getProductBySlug(slug))
    .map(product => ({ id: product.id, name: product.name }))
    .withCarryForward({ productId: product.id })
    .toPhaseOutput<ProductSlowViewState, ProductsCarryForward>();  // ← Validate at end
```

**Option C: Both (Flexible)**
```typescript
// Option 1: Validate at start (recommended for strict typing)
RenderPipeline.for<SlowVS, CF>().from(...).map(...).toPhaseOutput();

// Option 2: Validate at end (when types evolve through chain)
RenderPipeline.from(...).map(...).toPhaseOutput<SlowVS, CF>();

// Option 3: Infer everything (when caller already constrains return type)
async function render(): Promise<SlowlyRenderResult<SlowVS, CF>> {
    return RenderPipeline.from(...).map(...).toPhaseOutput();  // Inferred from return type
}
```

**Recommendation:** Option C (Both) with emphasis on Option 1 for most cases:

```typescript
// The .for<VS, CF>() pattern sets up type constraints early
// TypeScript then validates all operations against these target types
return RenderPipeline
    .for<ProductSlowViewState, ProductsCarryForward>()
    .tryAsync(() => getProductBySlug(slug))
    .map(product => ({
        id: product.id,       // ✅ Must be in ProductSlowViewState
        name: product.name,   // ✅ Must be in ProductSlowViewState
    }))
    .withCarryForward({
        productId: '...',     // ✅ Must be in ProductsCarryForward
    })
    .toPhaseOutput();         // ✅ Type-safe, validated against declared types
```

**Implementation Approach:**

The `.for<VS, CF>()` method returns a "typed pipeline builder" that constrains subsequent operations:

```typescript
class RenderPipeline<T, CF> {
    // Creates a typed builder that will validate output
    static for<TargetVS extends object, TargetCF extends object>(): TypedPipelineBuilder<TargetVS, TargetCF>;
    
    // Regular untyped entry points
    static from<T>(value: T): RenderPipeline<T, {}>;
    static tryAsync<T>(fn: () => Promise<T>): Promise<RenderPipeline<T, {}>>;
}

interface TypedPipelineBuilder<TargetVS, TargetCF> {
    from<T>(value: T): TypedRenderPipeline<T, {}, TargetVS, TargetCF>;
    tryAsync<T>(fn: () => Promise<T>): Promise<TypedRenderPipeline<T, {}, TargetVS, TargetCF>>;
}

// The typed pipeline validates that final map produces TargetVS
// and final withCarryForward produces TargetCF
interface TypedRenderPipeline<T, CF, TargetVS, TargetCF> {
    map<U>(fn: (value: T) => U): TypedRenderPipeline<U, CF, TargetVS, TargetCF>;
    withCarryForward<CF2>(cf: CF2): TypedRenderPipeline<T, CF & CF2, TargetVS, TargetCF>;
    
    // toPhaseOutput validates: T extends TargetVS && CF extends TargetCF
    toPhaseOutput(): RenderOutcome<TargetVS, TargetCF>;
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

### RenderResult Monad

```typescript
export class RenderResult<T, CarryForward = {}> {
    private constructor(
        private readonly _value: T | ServerError5xx | ClientError4xx | Redirect3xx,
        private readonly _isSuccess: boolean,
        private readonly _carryForward: CarryForward,
    ) {}

    // ===== Static Constructors =====
    
    /** Create a success result */
    static ok<T>(value: T): RenderResult<T, {}>;
    
    /** Create a result from an async operation, catching errors */
    static tryAsync<T>(
        fn: () => Promise<T>,
    ): Promise<RenderResult<T, {}> & { recover: RecoverMethod<T> }>;
    
    /** Create from an existing result value */
    static from<T, CF>(outcome: RenderOutcome<T, CF>): RenderResult<T, CF>;
    
    // Error constructors
    static notFound(message?: string, details?: Record<string, unknown>): RenderResult<never, never>;
    static badRequest(message?: string, details?: Record<string, unknown>): RenderResult<never, never>;
    static unauthorized(message?: string, details?: Record<string, unknown>): RenderResult<never, never>;
    static forbidden(message?: string, details?: Record<string, unknown>): RenderResult<never, never>;
    static serverError(status: number, message?: string, details?: Record<string, unknown>): RenderResult<never, never>;
    static redirect(status: number, location: string): RenderResult<never, never>;
    
    // ===== Instance Methods =====
    
    /** Transform the success value */
    map<U>(fn: (value: T) => U): RenderResult<U, CarryForward>;
    
    /** Transform the success value with an async function */
    mapAsync<U>(fn: (value: T) => Promise<U>): Promise<RenderResult<U, CarryForward>>;
    
    /** Chain with another RenderResult-producing function */
    flatMap<U, CF2>(fn: (value: T) => RenderResult<U, CF2>): RenderResult<U, CarryForward & CF2>;
    
    /** Chain with an async RenderResult-producing function */
    flatMapAsync<U, CF2>(
        fn: (value: T) => Promise<RenderResult<U, CF2>>
    ): Promise<RenderResult<U, CarryForward & CF2>>;
    
    /** Add data to carry forward */
    withCarryForward<CF2 extends object>(cf: CF2): RenderResult<T, CarryForward & CF2>;
    
    /** Convert to a final PhaseOutput (for success) or error type */
    toPhaseOutput(): RenderOutcome<T extends object ? T : never, CarryForward>;
    
    /** Check if this is a success */
    isOk(): boolean;
    
    /** Check if this is an error */
    isError(): boolean;
    
    /** Get the value or throw */
    unwrap(): T;
    
    /** Get the value or return a default */
    unwrapOr<U>(defaultValue: U): T | U;
    
    /** Handle the error case */
    recover<U>(fn: (error: ServerError5xx | ClientError4xx | Redirect3xx) => RenderResult<U, CarryForward>): RenderResult<T | U, CarryForward>;
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

**After (with monad):**
```typescript
async function renderSlowlyChanging(
    props: PageProps & ProductPageParams,
): Promise<SlowlyRenderResult<ProductSlowViewState, ProductsCarryForward>> {
    return RenderResult.tryAsync(() => getProductBySlug(props.slug))
        .then(result => result
            .recover(error => {
                if (error instanceof NotFoundError) {
                    return RenderResult.notFound('Product not found', { slug: props.slug });
                }
                return RenderResult.serverError(503, 'Database unavailable');
            })
            .flatMap(product => product
                ? RenderResult.ok(product)
                : RenderResult.notFound('Product not found', { slug: props.slug })
            )
            .map(({ id, brand, description, name, priceData }) => ({
                id, brand, description, name, priceData
            }))
            .withCarryForward({ productId: product.id, inventoryItemId: product.inventoryItemId })
            .toPhaseOutput()
        );
}
```

**Or more idiomatically:**
```typescript
async function renderSlowlyChanging(
    props: PageProps & ProductPageParams,
): Promise<SlowlyRenderResult<ProductSlowViewState, ProductsCarryForward>> {
    return RenderResult
        .tryAsync(() => getProductBySlug(props.slug))
        .recover(err => RenderResult.serverError(503, 'Database unavailable'))
        .flatMap(product => 
            product 
                ? RenderResult.ok(product).withCarryForward({ 
                    productId: product.id, 
                    inventoryItemId: product.inventoryItemId 
                  })
                : RenderResult.notFound('Product not found', { slug: props.slug })
        )
        .map(({ id, brand, description, name, priceData }) => ({
            id, brand, description, name, priceData
        }))
        .toPhaseOutput();
}
```

## Implementation Plan

### Phase 1: Core Types Update
1. Rename `PartialRender` to `PhaseOutput`
2. Add `message`, `code`, `details` fields to error types
3. Update `SlowlyRenderResult` and `FastRenderResult` type aliases
4. Keep `partialRender()` constructor as alias for backwards compatibility

### Phase 2: RenderResult Monad
1. Implement `RenderResult` class with core methods
2. Implement static constructors (`ok`, `notFound`, `serverError`, etc.)
3. Implement `map`, `flatMap`, `mapAsync`, `flatMapAsync`
4. Implement `tryAsync` with error catching
5. Implement `recover` for error handling
6. Implement `toPhaseOutput()` for final conversion

### Phase 3: Integration
1. Update existing examples to use new API (optional)
2. Update tests
3. Document the new API in README

### Phase 4: Deprecation (optional)
1. Mark old constructor functions as deprecated
2. Provide migration guide

## Migration Strategy

The new API is additive. Existing code continues to work:
- `partialRender()` still works (alias for `phaseOutput()`)
- `notFound()`, `serverError5xx()`, etc. still work
- Error types are backwards compatible (new fields are optional)

New code can incrementally adopt `RenderResult` where chaining is beneficial.

## Open Questions

1. **Should `RenderResult` be lazy?** (Only execute on `.toPhaseOutput()`)
   - Pro: Can compose without immediate execution
   - Con: More complex, harder to debug

2. **Should we add combinator functions?** (e.g., `all`, `race`, `first`)
   - These could be useful for parallel data fetching

3. **Should error types be classes instead of interfaces?**
   - Would allow `instanceof` checks but adds complexity

## Appendix: Alternative Names Considered

For the main monad:
- `PageResult` - Too page-specific
- `RenderMonad` - Too technical
- `Outcome` - Too generic
- `Response` - Confuses with HTTP response

For PhaseOutput:
- `RenderData` - Doesn't capture carry-forward
- `PhaseResult` - Conflicts with Result terminology
- `PhaseComplete` - Implies finality incorrectly

