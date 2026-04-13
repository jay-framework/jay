# Render Results

Each rendering phase (slow, fast) returns a render result indicating success, error, or redirect.

## phaseOutput — Success

Returns ViewState data and optional carry-forward data for the next phase:

```typescript
import { phaseOutput } from '@jay-framework/fullstack-component';

return phaseOutput(
  { title: 'My Product', price: 29.99 }, // ViewState — sent to template
  { productId: 'abc123' }, // CarryForward — passed to next phase only
);
```

CarryForward is available in the next phase via `props.carryForward` but is not part of the ViewState.

## Error Results

Return errors to stop rendering and show an error page:

```typescript
import {
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  serverError5xx,
  clientError4xx,
} from '@jay-framework/fullstack-component';

// 404
if (!product) return notFound('Product not found');

// 400
if (!input.query) return badRequest('Query is required');

// 401
if (!session) return unauthorized('Please log in');

// 403
if (!canAccess) return forbidden('Access denied');

// Custom 4xx
return clientError4xx(429, 'Rate limit exceeded');

// 5xx
return serverError5xx(500, 'Database connection failed');
```

## Redirects

```typescript
import { redirect3xx } from '@jay-framework/fullstack-component';

return redirect3xx(301, '/new-location');
return redirect3xx(302, `/products/${product.slug}`);
```

## RenderPipeline — Composable Rendering

For complex render logic, `RenderPipeline` chains operations with automatic error propagation:

```typescript
import { RenderPipeline } from '@jay-framework/fullstack-component';

const Pipeline = RenderPipeline.for<SlowViewState, CarryForward>();

return Pipeline.try(() => db.getProduct(props.slug))
  .map((product) => product ?? Pipeline.notFound('Product not found'))
  .map(async (product) => ({
    ...product,
    reviews: await db.getReviews(product.id),
  }))
  .toPhaseOutput((product) => ({
    viewState: { title: product.name, price: product.price },
    carryForward: { productId: product.id },
  }));
```

### Pipeline Factory Methods

```typescript
const P = RenderPipeline.for<VS, CF>();

P.ok(value); // Wrap a value
P.try(() => fetchData()); // Wrap a function (catches errors)
P.from(previousPhaseResult); // Continue from a prior phase result
P.notFound('message'); // Error pipeline
P.badRequest('message'); // Error pipeline
P.unauthorized('message'); // Error pipeline
P.forbidden('message'); // Error pipeline
P.serverError(500, 'message'); // Error pipeline
P.redirect(301, '/path'); // Redirect pipeline
```

### Pipeline Chain Methods

```typescript
pipeline
    .map(value => transform(value))           // Transform the value
    .map(async value => await asyncOp(value)) // Async transform
    .recover(error => P.ok(fallbackValue))    // Recover from errors
    .toPhaseOutput(value => ({                // Convert to PhaseOutput
        viewState: { ... },
        carryForward: { ... },
    }));
```

Errors short-circuit — if any step returns an error pipeline, subsequent `.map()` calls are skipped.
