# Design Log #136 — loadParams Route Deduplication

**Date:** May 14, 2026
**Status:** Implementing
**Related:** #134a (build pipeline), #130 (plugin routes)

## Background

`loadParams` is a component method that enumerates all param combinations for a dynamic route at build time. Its current signature:

```typescript
type LoadParams<Services, Params> = (contexts: Services) => AsyncIterable<Params[]>;
```

It receives resolved services but **no information about the route it's being called for**.

## Problem

### Problem 1: Duplicate builds across routes sharing a component

In the golf project, `wix-stores` product-page component is used by two route trees:

```
/kitan/products/[category]/[slug]     inferredParams: { prefix: "kitan" }
/polgat/products/[category]/[slug]    inferredParams: { prefix: "polgat" }
```

Both routes share the same `loadParams`. The build runs it twice (once per route), and merges `inferredParams` via `Object.assign` — overwriting each product's own `prefix`. Every product is built twice under the wrong prefix.

### Problem 2: Static override duplication

```
/products/[slug]              ← dynamic, loadParams returns all products
/products/ceramic-flower-vase ← static override, inferredParams: { slug: "ceramic-flower-vase" }
```

The dynamic route's `loadParams` also returns `ceramic-flower-vase`, so it's built twice.

### Problem 3: Cross-product of multiple loadParams

When a route has two headless components each with `loadParams` (e.g., i18n providing `lang` and product-page providing `slug`), the current code concatenates results instead of computing the cross product.

## Design

### Approach: Materialize → Dedupe → Build

No API changes. Three pipeline steps, each a pure testable function:

**Step 1 — Collect unique `loadParams` and run each once**

Multiple routes may reference the same headless component with `loadParams` (by function identity). Run each unique `loadParams` once and cache the results. When a route has multiple parts with `loadParams` providing disjoint param keys, compute the cross product.

**Step 2 — Materialize URLs**

For each route, generate all `(url, params, route)` tuples:

- **Static routes** (no dynamic segments, has `inferredParams`): one tuple from the inferred params
- **Dynamic routes**: for each cached `loadParams` result compatible with the route's `inferredParams`, generate a tuple. Compatibility = all `inferredParams` keys match the result's values.

This naturally splits kitan/polgat — a product with `prefix: "polgat"` is incompatible with the kitan route's `inferredParams: { prefix: "kitan" }`, so it only materializes under polgat.

**Step 3 — Dedupe by URL**

When multiple routes produce the same URL, the most specific route wins:

1. More `inferredParams` keys = more specific
2. Fewer dynamic segments = more specific
3. Static override > dynamic route

**Step 4 — Build the deduplicated list**

### Example

```
Routes:
  /kitan/products/[category]/[slug]    inferredParams: { prefix: "kitan" }
  /polgat/products/[category]/[slug]   inferredParams: { prefix: "polgat" }
  /products/ceramic-flower-vase        inferredParams: { slug: "ceramic-flower-vase" } (static)

Step 1: Run loadParams ONCE → 3800 products with { slug, category, prefix }

Step 2: Materialize:
  static override → ("/products/ceramic-flower-vase", { slug: "ceramic-flower-vase" })
  kitan route + params where prefix="kitan" → 1900 tuples
  polgat route + params where prefix="polgat" → 1900 tuples
  (products with prefix="kitan" don't materialize under polgat — incompatible)

Step 3: Dedupe:
  ceramic-flower-vase appears twice (static + dynamic) → static wins
  No other duplicates

Step 4: Build 1 + 1900 + 1900 - 1 = 3800 instances (not 7600)
```

### Testable Functions

**1. `collectLoadParams(routes, loadParamsFn) → Map<route, params[]>`**

Runs each unique `loadParams` once (deduped by identity). Cross-products params from multiple parts on the same route. Returns cached results per route.

```typescript
// Input: routes with their loadParams function references
// Output: map of route → all param combinations
// Mockable: loadParamsFn is injected, not imported
```

**2. `materializeRouteParams(routes, loadParamsResults) → MaterializedEntry[]`**

For each route, generates `{ url, params, route, specificity }` tuples. Filters by `inferredParams` compatibility. Includes static override routes.

```typescript
// Test: dynamic route + matching params → materialized
// Test: dynamic route + incompatible inferredParams → filtered out
// Test: static override → one entry
// Test: route without loadParams or inferredParams → one entry with empty params
```

**3. `dedupeByUrl(entries) → MaterializedEntry[]`**

Groups by URL, picks most specific route per URL.

```typescript
// Test: unique URLs → pass through
// Test: same URL from static + dynamic → static wins
// Test: same URL from specific + catch-all → specific wins
```

Each function is pure — takes data in, returns data out. No filesystem, no Vite, no services.

### Cross-Product

When a route has multiple parts with `loadParams` providing disjoint keys:

```
Route: /[lang]/products/[slug]
Part A (i18n):    yields [{ lang: "en" }, { lang: "fr" }]
Part B (products): yields [{ slug: "shirt" }, { slug: "hat" }]

Cross product → [
  { lang: "en", slug: "shirt" },
  { lang: "en", slug: "hat" },
  { lang: "fr", slug: "shirt" },
  { lang: "fr", slug: "hat" },
]
```

If two parts provide overlapping keys, warn and use the first provider's value.

### What Stays the Same

- `LoadParams` type signature — unchanged
- Plugin `loadParams` implementations — unchanged
- `runLoadParams` in `stack-server-runtime` — unchanged
- Dev server — doesn't use `loadParams` at all
- Agent-kit docs — unchanged

### Optional Segment Defaults

When a route has an optional segment (`[[category]]`) and declares an inferred param for it, the inferred value is a **default**, not a filter.

```
Route: /polgat/products/[[category]]
jay-params:
  prefix: polgat
  category: polgat      ← default value for the optional segment
```

**Filtering:** Inferred params for required segments (like `prefix`) are strict filters — `loadParams` results must include the key with a matching value. Inferred params for optional segments (like `category`) are skipped during filtering — all values pass.

**URL building:** When an optional segment's param value equals its inferred default, the segment is omitted from the URL:

- `{ prefix: "polgat", category: "shoes" }` → `/polgat/products/shoes`
- `{ prefix: "polgat", category: "polgat" }` → `/polgat/products` (category matches default → omitted)

**Param merging:** `loadParams` values take precedence. Inferred params only fill in keys not provided by `loadParams`. This prevents the inferred `category: "polgat"` from overwriting `category: "shoes"`.

**Plugin requirement:** `loadParams` must return the inferred default value as one of its entries to build the root page. E.g., `loadSearchParams` must yield `{ prefix: "polgat", category: "polgat" }` to produce `/polgat/products`.

### Edge Cases

**Route with `inferredParams` AND dynamic segments:**
Inferred params for required segments act as filters. Inferred params for optional segments are defaults (not filters).

**`loadParams` result matching no route's `inferredParams`:**
Falls to the catch-all (route without `inferredParams`). If none exists, warn and skip.

**Multiple required `inferredParams` keys:**
All required inferred keys must match for compatibility.

## Verification

After implementation:

- Golf build should produce ~1900 kitan products + ~1900 polgat products (not ~3800 each)
- No product should appear under the wrong prefix
- Build time should roughly halve (fewer instances, single API call instead of two)
- Existing projects without `inferredParams` should be unaffected
- Static override routes (`/products/ceramic-flower-vase`) are not duplicated
- All three utility functions have unit tests with mocked loadParams
