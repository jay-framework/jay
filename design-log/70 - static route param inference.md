# Design Log #70 - Static Route Param Inference

## Background

Following Design Log #69, static override routes now have higher priority than dynamic routes. However, this creates a runtime issue: when a static route matches, Express doesn't extract URL parameters.

## Problem

For `/products/ceramic-flower-vase` (static override of `/products/[slug]`):
- Express route: `/products/ceramic-flower-vase` (no `:slug` param)
- `req.params` = `{}` (empty)
- The page component still expects `params.slug = 'ceramic-flower-vase'`

This breaks pages that use the same headless component as the dynamic route.

## Questions

**Q1: Should static overrides share logic with dynamic routes, or be completely independent?**

The `ceramic-flower-vase` page uses `productPage` headless component which calls `wixStores.products.getProductBySlug(props.slug)`. If we want this pattern to work, the static route needs access to the same params.

**Q2: Where should param inference happen?**

Options:
- At scan time (add inferred params to JayRoute)
- At request time (derive from URL and sibling routes)
- In the page itself (explicit config)

---

## Option A: Infer Params at Scan Time

Add `inferredParams` to `JayRoute` during scanning by finding sibling dynamic routes.

```typescript
export type JayRoute = {
    segments: JayRouteSegment[];
    rawRoute: string;
    jayHtmlPath: string;
    compPath: string;
    inferredParams?: Record<string, string>;  // NEW
};
```

**Algorithm:**
1. After scanning all routes, group by parent path
2. For each static route, find sibling dynamic routes
3. Map static segment values to param names from dynamic route

**Example:**
```
Routes:
  /products/[slug]              → params from Express
  /products/ceramic-flower-vase → inferredParams: { slug: 'ceramic-flower-vase' }
```

**Pros:**
- Clean separation - route scanner handles all route logic
- Params available immediately without URL parsing
- Explicit about what's inferred

**Cons:**
- Cross-route analysis during scanning
- Adds complexity to route scanner

---

## Option B: Synthesize Params at Request Time

In `mkRoute`, the handler already has access to the route definition. Add a utility to extract params by matching URL segments against sibling dynamic routes.

```typescript
// In dev-server.ts
function extractParamsFromUrl(
    url: string,
    currentRoute: JayRoute,
    allRoutes: JayRoutes
): Record<string, string> {
    // Find sibling dynamic route that would match this URL
    // Extract params using that route's structure
}
```

**Pros:**
- No changes to route scanner
- Params always reflect current URL

**Cons:**
- Requires passing all routes to each handler
- More runtime work per request

---

## Option C: Use URL Parsing in the Handler

Extract params directly from the URL path based on the route's position in the hierarchy.

```typescript
// In dev-server handler
const urlSegments = url.split('/').filter(Boolean);
const routeSegments = route.segments;

const pageParams: Record<string, string> = { ...req.params };

// For static routes, try to infer params from sibling dynamic routes
if (Object.keys(req.params).length === 0) {
    // Find matching dynamic route and extract params
}
```

**Pros:**
- Localized change in dev-server

**Cons:**
- Logic duplicated between scan and request handling

---

## Option D: Static Overrides Define Their Own Params

Static pages explicitly declare what params they provide via a config file.

```yaml
# page.conf.yaml
params:
  slug: ceramic-flower-vase
```

**Pros:**
- Explicit, no magic
- Works for any scenario

**Cons:**
- Extra boilerplate for users
- Easy to forget

---

## Recommendation

**Option A (Infer at Scan Time)** seems cleanest because:

1. Route scanner already analyzes all routes for sorting
2. Params become part of the route definition
3. No runtime overhead per request
4. Clear semantics: "this static route provides these param values"

### Implementation Sketch

```typescript
// After sorting, infer params
function inferParamsForStaticRoutes(routes: JayRoutes): JayRoutes {
    // Group routes by parent path (all segments except last)
    const routesByParent = groupByParent(routes);
    
    return routes.map(route => {
        // Only process fully-static routes
        if (route.segments.some(s => typeof s !== 'string')) {
            return route;
        }
        
        const parent = getParentPath(route);
        const siblings = routesByParent.get(parent) || [];
        
        // Find a sibling dynamic route
        const dynamicSibling = siblings.find(sib => 
            sib !== route && 
            sib.segments.length === route.segments.length &&
            hasDynamicSegments(sib)
        );
        
        if (!dynamicSibling) return route;
        
        // Build inferred params
        const inferredParams: Record<string, string> = {};
        for (let i = 0; i < route.segments.length; i++) {
            const staticSeg = route.segments[i];
            const dynSeg = dynamicSibling.segments[i];
            
            if (typeof staticSeg === 'string' && typeof dynSeg !== 'string') {
                inferredParams[dynSeg.name] = staticSeg;
            }
        }
        
        return { ...route, inferredParams };
    });
}
```

### Dev Server Change

```typescript
// In mkRoute handler
const pageParams = {
    ...req.params,
    ...route.inferredParams,  // Merge inferred params
};
```

---

## Trade-offs Summary

| Option | Complexity | Runtime Cost | User Effort |
|--------|------------|--------------|-------------|
| A: Scan time | Medium | None | None |
| B: Request time | Medium | Low | None |
| C: Handler parsing | Low | Low | None |
| D: Explicit config | Low | None | High |

---

## Decision

**Option A implemented** - infer params at scan time.

---

## Implementation Results

### Changes Made

**File: `jay/packages/jay-stack/route-scanner/lib/route-scanner.ts`**
- Added `inferredParams?: Record<string, string>` to `JayRoute` type
- Added `dynamicRouteCouldMatch()` function - checks if a dynamic pattern could match a static route
- Added `inferParamsForStaticRoutes()` function - exported for testing
- Added `ParamInferenceResult` interface for logging
- Modified `scanRoutes()` to call inference after sorting, with console logging

**File: `jay/packages/jay-stack/dev-server/lib/dev-server.ts`**
- Updated `mkRoute` handler to merge inferred params:
  ```typescript
  const pageParams = { ...route.inferredParams, ...req.params };
  ```

**File: `jay/packages/jay-stack/route-scanner/test/route-scanner.test.ts`**
- Added 2 integration tests for inferred params in scanRoutes
- Added 5 unit tests for `inferParamsForStaticRoutes()`

### Test Results

All 18 tests passing.

### Verification with store-light

```
[route-scanner] Inferred params for static override routes:
  /products/ceramic-flower-vase → params from /products/[slug]: { slug: 'ceramic-flower-vase' }

Routes with inferred params:
1. /cart → inferredParams: (none)
2. /products/ceramic-flower-vase → inferredParams: {"slug":"ceramic-flower-vase"}
3. /products/[slug] → inferredParams: (none)
4. /products → inferredParams: (none)
```

### Algorithm Summary

For each fully-static route:
1. Find a dynamic route that "could match" (same length, static segments match, params can match any value)
2. Build `inferredParams` by mapping static segment values to param names from the dynamic route
3. Log the mapping for debugging

### Deviations from Design

None - implementation followed Option A as designed.
