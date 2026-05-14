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

### What Stays the Same

- `LoadParams` type signature — unchanged
- Plugin `loadParams` implementations — unchanged
- `runLoadParams` in `stack-server-runtime` — unchanged
- Dev server — doesn't use `loadParams` at all
- Single-route components — handled by existing per-route loop (no grouping needed)

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

## Verification

After implementation:
- Golf build should produce ~1900 kitan products + ~1900 polgat products (not ~3800 each)
- No product should appear under the wrong prefix
- Build time should roughly halve (fewer instances, single API call instead of two)
- Existing projects without `inferredParams` should be unaffected
- Static override routes (`/products/ceramic-flower-vase`) are not duplicated
- Agent-kit docs are unchanged (no API change)
