# RenderPipeline

The `RenderPipeline` is a functional, type-safe API for composing render operations in Jay Stack components. It provides automatic error propagation, async/await handling, and clean composition of data transformations.

## Overview

The RenderPipeline solves common challenges in server-side rendering:

- **Type Safety**: Full TypeScript inference from start to finish
- **Error Handling**: Automatic error propagation without try/catch blocks
- **Async Composition**: Chain async operations naturally
- **Conditional Logic**: Branch to success or error paths seamlessly
- **Error Recovery**: Handle errors and recover to success paths

## Basic Usage

```typescript
import { RenderPipeline } from '@jay-framework/fullstack-component';

async function slowlyRender(props, wixStores) {
  const Pipeline = RenderPipeline.for<SlowViewState, CarryForward>();

  return Pipeline.try(() => wixStores.getProduct(props.slug))
    .map((product) => (product ? product : Pipeline.notFound()))
    .toPhaseOutput((product) => ({
      viewState: { name: product.name, price: product.price },
      carryForward: { productId: product.id },
    }));
}
```

## Creating a Pipeline

### Pipeline Factory

Always start by declaring your target types:

```typescript
const Pipeline = RenderPipeline.for<ViewStateType, CarryForwardType>();
```

This provides type checking for the final `toPhaseOutput()` call.

### Entry Points

#### `Pipeline.ok(value)`

Start with a successful value (sync or async):

```typescript
// Sync value
Pipeline.ok({ data: 'value' });

// Async value
Pipeline.ok(fetchData());
```

#### `Pipeline.try(fn)`

Start with a function that might throw. Errors are caught and can be recovered:

```typescript
// Sync function
Pipeline.try(() => JSON.parse(jsonString));

// Async function
Pipeline.try(async () => await api.fetchData());
```

**Key difference from `.ok()`**: `.try()` catches exceptions and makes them recoverable via `.recover()`.

#### Error Entry Points

Start directly with an error:

```typescript
Pipeline.notFound('Resource not found');
Pipeline.badRequest('Invalid input');
Pipeline.unauthorized('Authentication required');
Pipeline.forbidden('Access denied');
Pipeline.serverError(503, 'Service unavailable');
Pipeline.clientError(400, 'Bad request');
Pipeline.redirect(301, '/new-location');
```

## Transforming Values

### `.map(fn)`

Transform the current value. The function can return:

- A plain value: `x => x * 2`
- A Promise: `async x => await enrichData(x)`
- A RenderPipeline: `x => x ? Pipeline.ok(x) : Pipeline.notFound()`

```typescript
Pipeline
  .ok(5)
  .map(x => x * 2)                    // Simple transform: 10
  .map(x => ({ doubled: x }))         // Object transform: { doubled: 10 }
  .map(async x => await enrich(x))   // Async transform
  .toPhaseOutput(...)
```

**Error passthrough**: If the pipeline is in an error state, `.map()` functions are skipped:

```typescript
Pipeline.notFound('Missing')
  .map((x) => x * 2) // Skipped
  .map((x) => x + 1); // Skipped
// Still returns 404 error
```

### Conditional Branching

Return a RenderPipeline from `.map()` to branch to error paths:

```typescript
Pipeline
  .ok(maybeValue)
  .map(value => {
    if (!value) {
      return Pipeline.notFound('Value is null');
    }
    if (!isValid(value)) {
      return Pipeline.badRequest('Invalid format');
    }
    return value;  // Continue with success
  })
  .toPhaseOutput(...)
```

## Error Handling

### `.recover(fn)`

Handle errors and potentially recover to a success path:

```typescript
Pipeline
  .try(() => fetchPrimaryData())
  .recover(error => {
    console.log('Primary failed, using fallback');
    return Pipeline.ok(fallbackData);
  })
  .toPhaseOutput(...)
```

The recovery function receives an `Error` object and must return a new RenderPipeline:

```typescript
Pipeline
  .try(() => riskyOperation())
  .recover(error => {
    if (error.message.includes('not found')) {
      return Pipeline.notFound('Resource not found');
    }
    return Pipeline.serverError(500, 'Unexpected error');
  })
  .toPhaseOutput(...)
```

**Recovery is optional**: If you don't call `.recover()`, unhandled errors become 500 server errors automatically.

## Terminal Operation

### `.toPhaseOutput(fn)`

**This is the only async method**. It resolves all promises and produces the final result:

```typescript
await Pipeline.ok(data).toPhaseOutput((data) => ({
  viewState: {
    /* SlowViewState */
  },
  carryForward: {
    /* CarryForward */
  },
}));
```

**Type safety**: TypeScript validates that `viewState` and `carryForward` match the types declared in `.for<>()`.

**Return types**:

- Success: `PhaseOutput<ViewState, CarryForward>`
- Error: `ClientError4xx`, `ServerError5xx`, or `Redirect3xx`

## Complete Examples

### Product Page - Slow Render

```typescript
interface ProductSlowViewState {
  name: string;
  description: string;
  brand: string;
}

interface ProductCarryForward {
  productId: string;
  inventoryId: string;
}

async function renderSlowlyChanging(props, wixStores) {
  const Pipeline = RenderPipeline.for<ProductSlowViewState, ProductCarryForward>();

  return (
    Pipeline
      // Fetch product, catching any errors
      .try(() => wixStores.products.getProductBySlug(props.slug))

      // Handle not found case
      .map((response) => {
        if (!response.product) {
          return Pipeline.notFound('Product not found');
        }
        return response.product;
      })

      // Transform to final output
      .toPhaseOutput((product) => ({
        viewState: {
          name: product.name,
          description: product.description,
          brand: product.brand || 'Unknown',
        },
        carryForward: {
          productId: product.id,
          inventoryId: product.inventoryItemId,
        },
      }))
  );
}
```

### With Error Recovery

```typescript
async function renderSlowlyChanging(props, dataService) {
  const Pipeline = RenderPipeline.for<ViewState, CarryForward>();

  return (
    Pipeline
      // Try primary data source
      .try(() => dataService.getPrimaryData(props.id))

      // Recover from errors by using fallback
      .recover((error) => {
        console.log('Primary source failed, using cache');
        return Pipeline.ok(dataService.getCachedData(props.id));
      })

      // Validate the data we got
      .map((data) => {
        if (!data || !data.isValid) {
          return Pipeline.badRequest('Invalid data');
        }
        return data;
      })

      .toPhaseOutput((data) => ({
        viewState: { content: data.content },
        carryForward: { dataId: data.id },
      }))
  );
}
```

### Multiple Async Operations

```typescript
async function renderSlowlyChanging(props, api) {
  const Pipeline = RenderPipeline.for<ViewState, CarryForward>();

  return (
    Pipeline
      // Fetch user
      .try(() => api.getUser(props.userId))

      // Fetch user's orders (async)
      .map(async (user) => {
        const orders = await api.getOrders(user.id);
        return { user, orders };
      })

      // Fetch order details for each order (parallel)
      .map(async ({ user, orders }) => {
        const orderDetails = await Promise.all(
          orders.map((order) => api.getOrderDetails(order.id)),
        );
        return { user, orders, orderDetails };
      })

      .toPhaseOutput(({ user, orders, orderDetails }) => ({
        viewState: {
          userName: user.name,
          orderCount: orders.length,
          totalSpent: orderDetails.reduce((sum, d) => sum + d.total, 0),
        },
        carryForward: {
          userId: user.id,
        },
      }))
  );
}
```

### Conditional Validation

```typescript
async function renderFastChanging(props, slowCarryForward, inventoryService) {
  const Pipeline = RenderPipeline.for<FastViewState, FastCarryForward>();

  return (
    Pipeline.try(() => inventoryService.getStatus(slowCarryForward.productId))

      // Validate inventory response
      .map((inventory) => {
        if (!inventory) {
          return Pipeline.serverError(503, 'Inventory service unavailable');
        }
        if (inventory.status === 'discontinued') {
          return Pipeline.clientError(410, 'Product discontinued');
        }
        return inventory;
      })

      .toPhaseOutput((inventory) => ({
        viewState: {
          inStock: inventory.available > 0,
          quantity: inventory.available,
        },
        carryForward: {
          productId: slowCarryForward.productId,
          inventoryId: inventory.id,
        },
      }))
  );
}
```

## Comparison with Direct phaseOutput

### Without RenderPipeline

```typescript
async function renderSlowlyChanging(props, wixStores) {
  try {
    const response = await wixStores.products.getProductBySlug(props.slug);

    if (!response.product) {
      return clientError4xx(404, 'Product not found');
    }

    const product = response.product;

    if (!product.name) {
      return badRequest('Invalid product data');
    }

    return phaseOutput(
      {
        name: product.name,
        description: product.description,
        brand: product.brand || 'Unknown',
      },
      {
        productId: product.id,
      },
    );
  } catch (error) {
    console.error('Failed to load product:', error);
    return serverError5xx(500, 'Internal server error');
  }
}
```

### With RenderPipeline

```typescript
async function renderSlowlyChanging(props, wixStores) {
  const Pipeline = RenderPipeline.for<ViewState, CarryForward>();

  return Pipeline.try(() => wixStores.products.getProductBySlug(props.slug))
    .map((response) => response.product || Pipeline.notFound('Product not found'))
    .map((product) => (product.name ? product : Pipeline.badRequest('Invalid product data')))
    .toPhaseOutput((product) => ({
      viewState: {
        name: product.name,
        description: product.description,
        brand: product.brand || 'Unknown',
      },
      carryForward: {
        productId: product.id,
      },
    }));
}
```

**Benefits:**

- No manual try/catch blocks
- Errors propagate automatically
- More functional, composable style
- Type-safe transformations
- Cleaner separation of concerns

## Advanced Patterns

### Parallel Operations with Conditional Logic

```typescript
Pipeline
  .ok({ categoryId: props.categoryId })
  .map(async ({ categoryId }) => {
    // Fetch both in parallel
    const [products, category] = await Promise.all([
      api.getProducts(categoryId),
      api.getCategory(categoryId)
    ]);
    return { products, category };
  })
  .map(({ products, category }) => {
    if (products.length === 0) {
      return Pipeline.notFound('No products in this category');
    }
    return { products, category };
  })
  .toPhaseOutput(...)
```

### Nested Recovery

```typescript
Pipeline
  .try(() => primaryApi.getData())
  .recover(() => {
    console.log('Primary failed, trying secondary');
    return Pipeline
      .try(() => secondaryApi.getData())
      .recover(() => {
        console.log('Secondary failed, using cache');
        return Pipeline.ok(cache.getData());
      });
  })
  .toPhaseOutput(...)
```

### Data Enrichment Chain

```typescript
Pipeline.try(() => db.getProduct(props.id))
  .map(async (product) => ({
    ...product,
    reviews: await reviewsApi.getReviews(product.id),
  }))
  .map(async (data) => ({
    ...data,
    recommendations: await recommendationsApi.get(data.product.id),
  }))
  .map(async (data) => ({
    ...data,
    inventory: await inventoryApi.getStatus(data.product.inventoryId),
  }))
  .toPhaseOutput((data) => ({
    viewState: {
      product: data.product,
      reviews: data.reviews,
      recommendations: data.recommendations,
      inStock: data.inventory.available > 0,
    },
    carryForward: {
      productId: data.product.id,
    },
  }));
```

## Utility Methods

### `.isOk()` and `.isError()`

Check pipeline state (useful for debugging):

```typescript
const pipeline = Pipeline.ok('value');
console.log(pipeline.isOk()); // true
console.log(pipeline.isError()); // false

const errorPipeline = Pipeline.notFound();
console.log(errorPipeline.isOk()); // false
console.log(errorPipeline.isError()); // true
```

## Type Safety

The RenderPipeline provides full type inference:

```typescript
interface UserViewState {
  name: string;
  email: string;
}

interface UserCarryForward {
  userId: string;
}

const Pipeline = RenderPipeline.for<UserViewState, UserCarryForward>();

// TypeScript validates the entire chain
Pipeline.ok(5) // Type: RenderPipeline<number>
  .map((x) => x * 2) // Type: RenderPipeline<number>
  .map((x) => ({ value: x })) // Type: RenderPipeline<{ value: number }>
  .toPhaseOutput((data) => ({
    // ✅ TypeScript ensures these match UserViewState
    viewState: {
      name: 'User',
      email: 'user@example.com',
    },
    // ✅ And these match UserCarryForward
    carryForward: {
      userId: 'user-123',
    },
  }));
```

## Best Practices

### 1. Declare Types Upfront

Always use `.for<ViewState, CarryForward>()`:

```typescript
// ✅ Good
const Pipeline = RenderPipeline.for<SlowViewState, CarryForward>();

// ❌ Avoid
const Pipeline = RenderPipeline.for<any, any>();
```

### 2. Use `.try()` for Operations That Might Fail

```typescript
// ✅ Good - errors are caught and recoverable
Pipeline.try(() => api.fetchData());

// ❌ Risky - exceptions will bubble up
Pipeline.ok(api.fetchData()); // If api.fetchData() throws synchronously
```

### 3. Keep `.map()` Functions Focused

```typescript
// ✅ Good - single responsibility
Pipeline
  .try(() => fetchUser())
  .map(user => validateUser(user))
  .map(user => enrichUser(user))
  .toPhaseOutput(...)

// ❌ Avoid - doing too much in one map
Pipeline
  .try(() => fetchUser())
  .map(user => {
    const validated = validateUser(user);
    const enriched = enrichUser(validated);
    const transformed = transformUser(enriched);
    return transformed;
  })
  .toPhaseOutput(...)
```

### 4. Handle Specific Error Cases

```typescript
// ✅ Good - specific error handling
Pipeline.try(() => fetchData()).recover((error) => {
  if (error.message.includes('not found')) {
    return Pipeline.notFound('Resource not found');
  }
  if (error.message.includes('permission')) {
    return Pipeline.forbidden('Access denied');
  }
  return Pipeline.serverError(500, 'Unexpected error');
});

// ❌ Generic - less helpful
Pipeline.try(() => fetchData()).recover(() => Pipeline.serverError(500, 'Error'));
```

### 5. Use Descriptive Error Messages

```typescript
// ✅ Good
Pipeline.notFound(`Product with slug "${props.slug}" not found`);
Pipeline.badRequest('Invalid email format: must include @ symbol');

// ❌ Vague
Pipeline.notFound('Not found');
Pipeline.badRequest('Invalid');
```

## Performance Considerations

1. **Async operations are lazy**: Promises don't execute until `.toPhaseOutput()` is called
2. **Error short-circuit**: Once an error occurs, subsequent `.map()` calls are skipped (no wasted computation)
3. **Type checking is compile-time**: No runtime overhead for type safety

## Integration with Jay Stack

The RenderPipeline integrates seamlessly with Jay Stack components:

```typescript
export const productPage = makeJayStackComponent<ProductPageContract>()
  .withProps<PageProps>()
  .withServices(WIX_STORES_SERVICE)
  .withLoadParams(loadProductParams)
  .withSlowlyRender(renderSlowlyChanging) // Uses RenderPipeline
  .withFastRender(renderFastChanging) // Uses RenderPipeline
  .withInteractive(ProductPageInteractive);

async function renderSlowlyChanging(props, wixStores) {
  const Pipeline = RenderPipeline.for<SlowViewState, CarryForward>();
  return Pipeline.try(() => wixStores.products.getProductBySlug(props.slug))
    .map((response) => response.product || Pipeline.notFound())
    .toPhaseOutput((product) => ({
      viewState: {
        /* ... */
      },
      carryForward: {
        /* ... */
      },
    }));
}
```

## Summary

**Use RenderPipeline when you want:**

- ✅ Clean, functional composition
- ✅ Automatic error propagation
- ✅ Type-safe transformations
- ✅ Easy error recovery
- ✅ Readable async chains

**Use direct `phaseOutput()` when:**

- Simple, single-step renders with no error handling
- Maximum performance is critical (though the difference is negligible)

---

For more examples, see the [wix-stores product-page implementation](https://github.com/jay-framework/wix-stores/blob/main/lib/components/product-page.ts) which uses RenderPipeline extensively.
