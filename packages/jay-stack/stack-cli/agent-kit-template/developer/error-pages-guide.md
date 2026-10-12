# Error Pages (Developer Side)

When a page or plugin render returns an error result, Jay renders the matching **error page** (see the
designer guide for authoring them) with the error data injected as the `error` ViewState. This guide
covers how to return enriched errors from `page.ts` so they surface well on the rendered page.

## Returning errors

Return an error result from any render phase to stop rendering and show an error page:

```typescript
import {
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  serverError5xx,
  clientError4xx,
} from '@jay-framework/fullstack-component';

if (!product) return notFound('The product you are looking for may have been removed.');

if (!input.query) return badRequest('Query is required');

if (!session) return unauthorized('Please log in');

if (!canAccess) return forbidden('Access denied');

return clientError4xx(429, 'Rate limit exceeded');

return serverError5xx(503, 'The inventory service is temporarily unavailable');
```

An **uncaught exception** in a render phase becomes a 500 and renders the `5xx` page — the stack is
logged, never shown.

## Enriching the error page

Every error constructor takes an optional options bag after the message: `{ title?, code?, details? }`.
These map directly onto the `error.*` bindings the error page can render.

```typescript
return notFound('The product you are looking for may have been removed.', {
  title: 'Product not found',
});
// → error.title = "Product not found", error.message = "The product…"

return serverError5xx(504, 'Upstream timed out', {
  title: 'This is taking too long',
  code: 'UPSTREAM_TIMEOUT',
  details: { upstream: 'inventory-service', waitedMs: '10000' },
});
// → renders pages/504 if present, else pages/5xx;
//   error.details lists the key/value pairs via forEach="error.details".
```

| Field     | Binding           | Notes                                                       |
| --------- | ----------------- | ----------------------------------------------------------- |
| status    | `{error.status}`  | The numeric status you pass (`notFound` → 404).             |
| message   | `{error.message}` | First positional arg; defaulted per status when omitted.    |
| `title`   | `{error.title}`   | Short headline; defaulted per status when omitted.          |
| `code`    | `{error.code}`    | App-specific code; `''` on the page when omitted.           |
| `details` | `error.details`   | `Record<string, unknown>` → stringified `{ key, value }[]`. |

## Which page renders

Resolution is by status, most specific first: exact (`pages/504/`) → family (`pages/5xx/`) → built-in
plain text. So `serverError5xx(503, …)` renders `pages/503/` if it exists, otherwise `pages/5xx/`.
`notFound(…)` renders `pages/404/`, or `pages/4xx/` as a family fallback.

## RenderPipeline

The pipeline factory methods mirror the constructors and accept the same options bag:

```typescript
const P = RenderPipeline.for<SlowViewState, CarryForward>();

return P.try(() => db.getProduct(props.slug))
  .map((product) => product ?? P.notFound('Product not found', { title: 'Product not found' }))
  .toPhaseOutput((product) => ({ viewState: { title: product.name }, carryForward: {} }));
```

## See also

- Full render-result reference (success, redirects, pipeline): `render-results.md`.
- Authoring the error page markup and bindings: `../designer/error-pages-guide.md`.
