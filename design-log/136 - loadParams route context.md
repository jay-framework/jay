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

## Questions

### Q1: Should `loadParams` receive the inferred params, or should the build pipeline filter?

**Option A — Pass to `loadParams`:** The component knows how to filter (e.g., query only products matching a prefix). This is efficient — avoids loading unnecessary data from the API.

**Option B — Filter after `loadParams`:** The build pipeline filters results where `loadParams`-returned values conflict with `inferredParams`. Simpler, no API change, but loads all data and discards most of it.

**Option C — Both:** Pass params for efficiency, filter as safety net.

### Q2: What should the `loadParams` argument look like?

**Option 1 — Just the inferred params:**
```typescript
type LoadParams<Services, Params> = (
    contexts: Services,
    routeParams: Partial<Params>,
) => AsyncIterable<Params[]>;
```
Simple, but only works for inferred params. What about other route context?

**Option 2 — Route context object:**
```typescript
type LoadParams<Services, Params> = (
    contexts: Services,
    routeContext: { inferredParams: Partial<Params>; rawRoute: string },
) => AsyncIterable<Params[]>;
```
More extensible, but heavier API.

### Q3: How should `inferredParams` interact with `loadParams` results?

Current behavior: `Object.assign` overwrites loadParams values with inferredParams. This is wrong when loadParams already provides the correct value.

Options:
- **Don't merge** — if `loadParams` returns `prefix`, trust it. Only add inferred params for keys not returned by `loadParams`.
- **Filter** — skip instances where `loadParams` value conflicts with `inferredParams`.
- **Validate** — warn when `loadParams` returns a value that doesn't match `inferredParams`.

### Q4: Does this affect the dev server?

The dev server doesn't use `loadParams` — it resolves params from the URL at request time. So this is build-only. But changing the `LoadParams` type signature affects component definitions used in both environments.

## Design

*Pending answers to questions above.*

## Verification

After implementation:
- Golf build should produce ~1900 kitan products + ~1900 polgat products (not ~3800 each)
- No product should appear under the wrong prefix
- Build time should roughly halve (fewer instances)
- Existing projects without `inferredParams` should be unaffected
