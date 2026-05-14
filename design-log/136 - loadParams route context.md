# Design Log #136 — loadParams Route Context

**Date:** May 14, 2026
**Status:** Draft
**Related:** #134a (build pipeline), #130 (plugin routes)

## Background

`loadParams` is a component method that enumerates all param combinations for a dynamic route at build time. Its current signature:

```typescript
type LoadParams<Services, Params> = (
    contexts: Services,
) => AsyncIterable<Params[]>;
```

It receives resolved services but **no information about the route it's being called for**.

## Problem

In the golf project, `wix-stores` product-page component is used by two route trees:

```
/kitan/products/[category]/[slug]     inferredParams: { prefix: "kitan" }
/polgat/products/[category]/[slug]    inferredParams: { prefix: "polgat" }
```

Both routes share the same component and `loadParams` implementation. `loadProductParams` queries the Wix API and returns ALL products with their computed `prefix` based on category tree:

```typescript
// wix-stores/lib/components/product-page.ts:111-153
async function* loadProductParams([wixStores]) {
    // ...
    params.prefix = findRootCategorySlug(product.mainCategoryId, tree);
    // Returns ALL products: some with prefix="kitan", others with prefix="polgat"
}
```

The build pipeline then merges `inferredParams` into each result:

```typescript
// build-pipeline.ts — after loadParams returns
if (inferredParams) {
    for (const p of allParams) {
        Object.assign(p, inferredParams);  // overwrites product's own prefix!
    }
}
```

### Result

- `/kitan/products/[category]/[slug]` builds **all** products (kitan AND polgat) with `prefix=kitan`
- `/polgat/products/[category]/[slug]` builds **all** products (kitan AND polgat) with `prefix=polgat`
- Each product is built twice under the wrong prefix, doubling build time and producing incorrect routes

A second related problem: static override routes (`/products/product-1`) coexist with their dynamic parent (`/products/[slug]`). The dynamic route's `loadParams` returns `product-1` too, causing it to be built twice.

## Design

### Approach: Pipeline-Level Splitting (No API Change)

Instead of changing the `loadParams` signature, the build pipeline handles routing:

1. **Detect** routes sharing the same component with `loadParams`
2. **Run `loadParams` once** per component (not once per route)
3. **Split** results by matching against each route's `inferredParams`
4. **Build** each item once, under the correct route

No changes to `LoadParams` type, no plugin modifications. `loadParams` stays a simple "return all items" function.

### How It Works

```
Routes using wix-stores product-page:
  /kitan/products/[category]/[slug]    inferredParams: { prefix: "kitan" }
  /polgat/products/[category]/[slug]   inferredParams: { prefix: "polgat" }
  /products/ceramic-flower-vase        inferredParams: { slug: "ceramic-flower-vase" }

Step 1: Run loadParams ONCE → returns 3800 products with { slug, category, prefix }

Step 2: Split by inferredParams matching:
  - prefix="kitan"  → 1900 items → build under /kitan/products/...
  - prefix="polgat" → 1900 items → build under /polgat/products/...
  - slug="ceramic-flower-vase" → 1 item → already built by static override, skip

Step 3: Build each item once, under its matching route
```

### Build Pipeline Changes

**`production-server/lib/builder/build-pipeline.ts`:**

Before the per-route loop, group routes by shared component:

```typescript
// Group dynamic routes by component (compPath or componentExport)
const routesByComponent = new Map<string, typeof routeEntries>();
for (const entry of routeEntries) {
    const { route } = entry;
    if (!route.segments.some(s => typeof s !== 'string')) continue; // skip static
    const key = route.componentExport
        ? `${route.compPath}:${route.componentExport}`
        : route.compPath;
    if (!key) continue;
    if (!routesByComponent.has(key)) routesByComponent.set(key, []);
    routesByComponent.get(key)!.push(entry);
}

// For components used by multiple routes, run loadParams once and split
for (const [compKey, entries] of routesByComponent) {
    if (entries.length <= 1) continue; // single route, handle normally

    // Run loadParams once
    const firstRoute = entries[0];
    const pageParts = await loadProductionPageParts(/* ... */);
    const partsWithLoadParams = pageParts.parts.filter(p => p.compDefinition?.loadParams);
    if (partsWithLoadParams.length === 0) continue;

    const allParams: Record<string, string>[] = [];
    for await (const batch of runLoadParams(partsWithLoadParams)) {
        allParams.push(...batch);
    }

    // Collect all inferredParams (including static overrides)
    const allInferred = entries
        .map(e => (e.route as any).inferredParams)
        .filter(Boolean);

    // Split: assign each param set to the route whose inferredParams match
    for (const params of allParams) {
        const matchingEntry = entries.find(({ route }) => {
            const inferred = (route as any).inferredParams;
            if (!inferred) return false;
            return Object.entries(inferred).every(([k, v]) => params[k] === v);
        });
        // Fall back to the route without inferredParams (the "catch-all" dynamic route)
        const target = matchingEntry || entries.find(({ route }) => !(route as any).inferredParams);
        if (target) {
            // Build instance under this route
            // ...
        }
    }
}
```

### Matching Rules

For each `loadParams` result, find the best matching route:

1. **Exact match** — all `inferredParams` keys match the result's values → use that route
2. **No match** — no route's `inferredParams` match → use the route without `inferredParams` (the base dynamic route)
3. **Static override already built** — if a static override route already built this exact param combination, skip it

### Static Override Deduplication

Static override routes (no dynamic segments, only `inferredParams`) are built before dynamic routes. When splitting `loadParams` results, any item matching a static override's `inferredParams` is skipped — it's already built.

```
/products/[slug]              ← dynamic
/products/ceramic-flower-vase ← static override, already built

loadParams returns: [..., { slug: "ceramic-flower-vase" }, ...]
Splitting: ceramic-flower-vase matches static override → skip
```

### Multiple Components with loadParams (Cross-Product)

A route can have multiple headless components, each with its own `loadParams`:

```
Route: /[lang]/products/[slug]

Part A (i18n plugin):    loadParams yields [{ lang: "en" }, { lang: "fr" }]
Part B (product plugin): loadParams yields [{ slug: "shirt" }, { slug: "hat" }]
```

Each component provides a subset of the route's params. The build pipeline must compute the **cross product**:

```
Result: [
  { lang: "en", slug: "shirt" },
  { lang: "en", slug: "hat" },
  { lang: "fr", slug: "shirt" },
  { lang: "fr", slug: "hat" },
]
```

**Note:** The current `runLoadParams` concatenates batches sequentially — it doesn't cross-product. This is a pre-existing gap that needs fixing regardless of the route-splitting work.

#### Detection

Each `loadParams` result has a set of keys it provides. If two parts provide **disjoint** key sets, they need cross-producting. If they provide **overlapping** keys, it's a conflict (warn).

```typescript
// Collect results per part, grouped by the param keys they provide
const paramsByPart: { keys: Set<string>; values: Record<string, string>[] }[] = [];

for (const part of partsWithLoadParams) {
    const services = resolveServices(part.compDefinition.services);
    const partParams: Record<string, string>[] = [];
    for await (const batch of part.compDefinition.loadParams(services)) {
        partParams.push(...batch);
    }
    const keys = new Set(partParams.flatMap(p => Object.keys(p)));
    paramsByPart.push({ keys, values: partParams });
}

// Cross-product all parts with disjoint key sets
const allParams = crossProduct(paramsByPart);
```

#### Impact on Route Splitting

The grouping key for the "run once, split" optimization must be the **set of `loadParams` providers**, not a single component. Two routes share work only if they use the exact same set of components with `loadParams`.

```
Route A: /kitan/products/[slug]   — uses product-page (loadParams: slug)
Route B: /polgat/products/[slug]  — uses product-page (loadParams: slug)
Route C: /[lang]/products/[slug]  — uses i18n + product-page (loadParams: lang, slug)

Groups:
  { product-page } → routes A, B — run loadParams once, split by prefix
  { i18n, product-page } → route C alone — run both, cross-product
```

### What Stays the Same

- `LoadParams` type signature — unchanged
- Plugin `loadParams` implementations — unchanged
- Dev server — doesn't use `loadParams` at all
- Single-route, single-component cases — handled by existing per-route loop

### What Changes

- `runLoadParams` — needs cross-product support for multiple parts with disjoint params
- Build pipeline — groups routes by loadParams provider set, runs once per group, splits results

### Edge Cases

**Component used by routes with AND without `inferredParams`:**
```
/products/[slug]                    ← no inferredParams (catch-all)
/kitan/products/[category]/[slug]   ← inferredParams: { prefix: "kitan" }
```
Items with `prefix=kitan` go to the kitan route. Items without a matching prefix go to the catch-all.

**`loadParams` returns items that don't match any route:**
Build under the route without `inferredParams`. If no such route exists, warn and skip.

**Multiple `inferredParams` keys:**
All keys must match for a route to claim an item. Partial matches don't count.

**Overlapping param keys from multiple components:**
Two components both providing `slug` is a conflict. Warn and use the first component's value.

### Testability

The algorithm has three distinct pure functions that can be unit tested independently, without Vite, services, or real components:

**1. `groupRoutesByLoadParamsProviders(routeEntries) → Map<string, RouteEntry[]>`**

Input: route entries with component paths and `inferredParams`.
Output: groups of routes sharing the same `loadParams` provider set.

```typescript
// Test: two routes with same component → same group
// Test: route with different component → separate group
// Test: route with two components → separate group from route with one
// Test: static routes (no dynamic segments) → not grouped
```

**2. `crossProductParams(paramsByPart: { keys: Set<string>; values: Record<string, string>[] }[]) → Record<string, string>[]`**

Input: arrays of param sets from each component, each with its key set.
Output: cartesian product of all parts with disjoint keys.

```typescript
// Test: single part → pass through
// Test: two parts, disjoint keys → cross product
// Test: two parts, overlapping keys → warn, use first
// Test: empty part → empty result
// Test: one part returns 3 items × other returns 2 → 6 items
```

**3. `splitParamsByRoute(allParams, routeEntries) → Map<RouteEntry, Record<string, string>[]>`**

Input: all param combinations + route entries with `inferredParams`.
Output: params assigned to each route.

```typescript
// Test: params matching inferredParams → assigned to that route
// Test: params not matching any → assigned to catch-all (no inferredParams)
// Test: params matching static override → excluded
// Test: multiple inferredParams keys → all must match
// Test: no catch-all route, no match → warned and skipped
```

Each function is pure — takes data in, returns data out. No filesystem, no Vite, no services. The build pipeline calls them in sequence and handles the I/O (loading modules, running `loadParams`, building instances).

## Verification

After implementation:
- Golf build should produce ~1900 kitan products + ~1900 polgat products (not ~3800 each)
- No product should appear under the wrong prefix
- Build time should roughly halve (fewer instances, single API call instead of two)
- Existing projects without `inferredParams` should be unaffected
- Static override routes (`/products/ceramic-flower-vase`) are not duplicated
- Agent-kit docs are unchanged (no API change)
