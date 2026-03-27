# Design Log #117: Fast-Phase Query Parameters

## Background

Jay Stack supports URL **path parameters** via file-system routing (`[slug]`, `[[optional]]`, `[...catchAll]`). These are extracted by the route scanner, merged with `inferredParams` (DL#113), and passed as props to both slow and fast render phases.

URL **query parameters** (`?page=2&sort=price`) have no dedicated support. The raw URL string is available in `PageProps.url` but never parsed. Components wanting query params must parse the URL themselves.

### Current data flow

```
Request: GET /products/vases?page=2&sort=price

dev-server.ts:
  pageParams  = { slug: 'vases' }               ← path params (from Express + inferredParams)
  pageProps   = { language: 'en', url: '/products/vases?page=2&sort=price' }

slowly-changing-runner.ts:
  props = { ...pageProps, ...pageParams }        ← slow phase sees raw url only

fast-changing-runner.ts:
  props = { ...pageProps, ...pageParams }        ← fast phase sees raw url only
```

## Problem

1. No ergonomic way to access query parameters — component authors must manually parse `props.url`
2. No phase-appropriate boundary — query params are per-request data, but there's no type-level distinction between slow (cached/SSG) and fast (per-request) data sources

### Why query params don't belong in the slow phase

- Slow render results are cached per route + path params (`SlowRenderCache` in `slow-render-cache.ts`)
- Query params change frequently (`?page=1`, `?page=2`, `?sort=name`, etc.)
- Including query params in slow phase would either bust the cache on every distinct query string, or serve stale cached content
- Conceptually, slow phase is build-time/SSG — query params don't exist at build time

### Why query params belong in the fast phase

- Fast phase runs per-request (SSR)
- Query params modify _how_ a resource is displayed (pagination, sorting, filtering), not _which_ resource
- Fast phase already receives per-request data (`pageProps`, `pageParams`)

## Design

### New type: `RequestQuery`

```typescript
// jay-stack-types.ts
export interface RequestQuery {
  query: Record<string, string>;
}
```

### Type-safe fast-only access

Change `RenderFast` to intersect `PropsT` with `RequestQuery`:

```typescript
// Before
export type RenderFast<Services, PropsT, FastViewState, FastCarryForward> = (
  props: PropsT,
  ...services: Services
) => Promise<FastRenderResult<FastViewState, FastCarryForward>>;

// After
export type RenderFast<Services, PropsT, FastViewState, FastCarryForward> = (
  props: PropsT & RequestQuery,
  ...services: Services
) => Promise<FastRenderResult<FastViewState, FastCarryForward>>;
```

`RenderSlowly` stays unchanged — `props: PropsT` has no `query` field.

### Result

```typescript
// ✅ Fast phase — query is available
.withFastRender(async (props, carryForward, dbService) => {
    const page = parseInt(props.query.page || '1');
    const sort = props.query.sort || 'name';
    const products = await dbService.getProducts({ page, sort });
    // ...
})

// ❌ Slow phase — query does NOT exist on props (type error)
.withSlowlyRender(async (props, dbService) => {
    props.query  // ← TypeScript error: Property 'query' does not exist
    // ...
})
```

### Runtime changes

Parse query params from the request in `dev-server.ts` and pass to `renderFastChangingData`:

```typescript
// dev-server.ts — inside mkRoute handler
const urlObj = new URL(req.originalUrl, `http://${req.headers.host}`);
const query: Record<string, string> = {};
for (const [key, value] of urlObj.searchParams) {
  query[key] = value; // last value wins for repeated keys
}
```

Add `query` parameter to `renderFastChangingData` and merge into fast props:

```typescript
// fast-changing-runner.ts
export async function renderFastChangingData(
    pageParams: object,
    pageProps: PageProps,
    carryForward: object,
    parts: Array<DevServerPagePart>,
    instancePhaseData?: InstancePhaseData,
    forEachInstances?: ForEachHeadlessInstance[],
    headlessInstanceComponents?: HeadlessInstanceComponent[],
    mergedSlowViewState?: object,
    query?: Record<string, string>,       // ← new
): Promise<AnyFastRenderResult> {
    // ...
    const partProps = {
        ...pageProps,
        ...pageParams,
        query: query || {},               // ← inject into fast props
        ...(contractInfo && { ... }),
    };
    // ...
}
```

### Interactive phase

No framework API needed. Client-side code reads query params via standard browser APIs:

```typescript
const params = new URLSearchParams(window.location.search);
const page = params.get('page');
```

If a component needs reactive query params, it can create a signal from `window.location.search` in the interactive phase.

### Multi-value query params

`?tag=a&tag=b` — `URLSearchParams` iteration yields both entries, but `Record<string, string>` stores only one. The last value wins (consistent with Express `req.query` simple mode).

Multi-value support (`Record<string, string | string[]>`) can be added later if needed. This keeps the initial API simple.

## Implementation Plan

### Phase 1: Type changes

**File: `packages/jay-stack/full-stack-component/lib/jay-stack-types.ts`**

1. Add `RequestQuery` interface
2. Change `RenderFast` props type from `PropsT` to `PropsT & RequestQuery`
3. Export `RequestQuery` from index

### Phase 2: Runtime — parse and pass query params

**File: `packages/jay-stack/dev-server/lib/dev-server.ts`**

1. In `mkRoute` handler: parse `req.originalUrl` into `Record<string, string>`
2. Pass `query` to `handlePreRenderRequest`, `handleCachedRequest`, `handleClientOnlyRequest`
3. Each handler passes `query` to `renderFastChangingData`

**File: `packages/jay-stack/stack-server-runtime/lib/fast-changing-runner.ts`**

1. Add `query` parameter to `renderFastChangingData`
2. Merge `query` into `partProps` for page-level fast render
3. Merge `query` into props for instance fast render

### Phase 3: Tests

**File: `packages/jay-stack/stack-server-runtime/test/fast-changing-runner.test.ts`** (new or extend existing)

1. Test that query params appear in fast render props
2. Test that empty query params default to `{}`
3. Test that last-value-wins for repeated query keys

**File: `packages/jay-stack/full-stack-component/test/jay-stack-builder.test.ts`** (extend)

1. Type-level test: `RenderFast` callback receives `query` in props
2. Type-level test: `RenderSlowly` callback does NOT have `query` in props

### Phase 4: Update headless instance fast render

In `fast-changing-runner.ts`, instance fast render also needs query params:

1. Static instances — add `query` to instance props
2. ForEach instances — add `query` to forEach item props

## Examples

### ✅ Paginated product list

```typescript
export const page = makeJayStackComponent<ProductListContract>()
  .withServices(PRODUCTS_DB)
  .withSlowlyRender(async (props, db) => {
    // Slow: fetch categories (cached, no query params)
    const categories = await db.getCategories();
    return phaseOutput({ categories }, {});
  })
  .withFastRender(async (props, carryForward, db) => {
    // Fast: paginate based on query params (per-request)
    const page = parseInt(props.query.page || '1');
    const sort = props.query.sort || 'name';
    const products = await db.getProducts({ page, sort });
    return phaseOutput({ products, currentPage: page, sortBy: sort }, {});
  })
  .withInteractive((refs, viewState) => {
    /* ... */
  });
```

### ✅ Search page

```typescript
.withFastRender(async (props, carryForward, searchService) => {
    const q = props.query.q || '';
    const results = q ? await searchService.search(q) : [];
    return phaseOutput({ searchQuery: q, results }, {});
})
```

### ❌ Anti-pattern: query params in slow phase

```typescript
.withSlowlyRender(async (props, db) => {
    const page = props.query.page;  // ← TypeScript error!
    // query params are per-request, slow phase is cached — this is wrong
})
```

## Trade-offs

| Aspect          | Benefit                                            | Cost                                         |
| --------------- | -------------------------------------------------- | -------------------------------------------- |
| Type safety     | Slow phase cannot access query (compile error)     | Slightly different prop types between phases |
| Simplicity      | `Record<string, string>` is easy to use            | No multi-value support initially             |
| Caching         | Slow cache unaffected by query variations          | None                                         |
| Backward compat | Existing components unaffected (query is additive) | Fast render callbacks see new field          |

## Verification Criteria

1. `props.query` is available in `withFastRender` callbacks with correct types
2. `props.query` is NOT available in `withSlowlyRender` callbacks (TypeScript error)
3. Query params from request URL are correctly parsed and passed to fast phase
4. Empty query string → `query` is `{}`
5. Repeated keys (`?a=1&a=2`) → last value wins (`{ a: '2' }`)
6. Slow render cache is unaffected (keyed by path params only)
7. Headless instance fast render also receives query params
