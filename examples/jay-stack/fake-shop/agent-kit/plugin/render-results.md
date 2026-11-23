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

### Response Headers (fast phase only)

The third parameter accepts `responseHeaders` to set HTTP headers on the page response:

```typescript
return phaseOutput(
  { memberName: member.name },
  {},
  { responseHeaders: { 'Cache-Control': 'no-store' } },
);
```

Use this when the component renders per-user data that must not be cached by CDN or browser. Can be combined with `headTags` in the same options object.

### Freshness — `ttl` and `grace` (slow phase only)

A slow render runs at build time, so its data ages. Return `ttl` (and optionally `grace`) — both in **seconds** — to tell the production server when the data goes stale:

```typescript
return phaseOutput(
  { name: product.name, price: product.price },
  { productId: product.id },
  { ttl: 300, grace: 6 * 60 * 60 }, // fresh for 5 minutes, usable for 6 hours
);
```

- **`ttl`** — the data is `fresh` for `ttl` seconds after it was rendered. After that it is `stale`: the server serves it immediately (`Cache-Control: no-store`) and re-runs the slow render in the background. No `ttl` → the data never goes stale (today's behavior). Minimum effective `ttl` is 10 seconds.
- **`grace`** — absolute age after which the data is `expired`: the server waits (up to `JAY_STALE_WAIT_MS`, default 2000) for the refresh before answering. Default `max(12h, ttl)`.
- Responses carry `jay-freshness: fresh | stale | expired, <age>ms`.
- A page with several slow parts (page, keyed headless components, headless instances) gets the **minimum positive** `ttl` and the minimum positive `grace` across all of them; `0` / `null` are ignored.
- With `RenderPipeline`, return `ttl` / `grace` from the `toPhaseOutput` callback next to `viewState` and `carryForward`.
- Pick a `ttl` that matches how quickly the underlying data changes, not how fast you want pages to be: every `ttl` expiry costs one slow render per instance.

### Cookies (fast phase only)

The fast phase receives `props.cookies` — a `Record<string, string>` parsed from the HTTP `Cookie` header:

```typescript
.withFastRender(async (props, memberService) => {
    const token = props.cookies['session-token'];
    if (!token) return redirect3xx(302, '/login');

    const member = await memberService.validate(token);
    if (!member) return redirect3xx(302, '/login');

    return phaseOutput(
        { isLoggedIn: true, memberName: member.name },
        {},
        { responseHeaders: { 'Cache-Control': 'no-store' } },
    );
})
```

- `props.cookies` is `Record<string, string>` — empty `{}` when no cookies
- Not available in the slow phase (compile error) — same as `props.query`

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
