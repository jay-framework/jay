# Design Log #69 - Route Priority Ordering for Static vs Dynamic Routes

## Background

The Jay Stack framework uses a file-system based routing approach where:

- `src/pages/products/page.jay-html` → `/products`
- `src/pages/products/[slug]/page.jay-html` → `/products/:slug` (dynamic)
- `src/pages/products/ceramic-flower-vase/page.jay-html` → `/products/ceramic-flower-vase` (static override)

Routes are scanned by `@jay-framework/stack-route-scanner` and registered with Express in `server.ts`.

## Problem

When you have both a static route and a dynamic route at the same level:

```
src/pages/products/
├── [slug]/page.jay-html              # dynamic: /products/:slug
├── ceramic-flower-vase/page.jay-html  # static: /products/ceramic-flower-vase
└── page.jay-html                      # /products
```

The current `scanRoutes` function returns routes in filesystem order (whatever `fs.readdir` returns), which is not deterministic and does not consider route specificity.

Express matches routes **in registration order**. If `/products/:slug` is registered before `/products/ceramic-flower-vase`, the dynamic route matches first and the static route is never reached.

**Expected behavior**: Static routes should match before dynamic routes, allowing specific overrides.

## Design

### Route Priority Rules

Sort routes by specificity (most specific first):

1. **Static segments** have higher priority than dynamic segments
2. **Single params** `[id]` have higher priority than **optional params** `[[id]]`
3. **Optional params** `[[id]]` have higher priority than **catch-all** `[...id]`
4. **More segments** have higher priority than fewer segments (at same specificity level)
5. **Alphabetical order** as tiebreaker for determinism

### Segment Priority (lowest number = highest priority)

| Segment Type              | Priority |
| ------------------------- | -------- |
| Static (e.g., `products`) | 0        |
| Single param `[slug]`     | 1        |
| Optional param `[[slug]]` | 2        |
| Catch-all `[...path]`     | 3        |

### Sorting Algorithm

Compare routes segment by segment:

1. Compare segment at index `i` of both routes
2. If priorities differ, lower priority number wins
3. If both are static strings, compare alphabetically
4. If one route has more segments, continue comparing
5. Shorter route (with same prefix) comes after longer route

### Examples

Given routes:

- `/products` (1 static)
- `/products/ceramic-flower-vase` (2 static)
- `/products/[slug]` (1 static + 1 param)
- `/products/[slug]/reviews` (1 static + 1 param + 1 static)
- `/[...path]` (1 catch-all)

**Sorted order:**

1. `/products/ceramic-flower-vase` ← 2 static segments
2. `/products/[slug]/reviews` ← more specific (has trailing static)
3. `/products/[slug]` ← 1 static + 1 param
4. `/products` ← 1 static segment
5. `/[...path]` ← catch-all (lowest priority)

## Implementation Plan

### Phase 1: Add sorting function to route-scanner

**File**: `jay/packages/jay-stack/route-scanner/lib/route-scanner.ts`

Add a `sortRoutesByPriority` function and apply it in `scanRoutes`.

```typescript
function getSegmentPriority(segment: JayRouteSegment): number {
  if (typeof segment === 'string') return 0; // Static
  switch (segment.type) {
    case JayRouteParamType.single:
      return 1;
    case JayRouteParamType.optional:
      return 2;
    case JayRouteParamType.catchAll:
      return 3;
  }
}

function compareRoutes(a: JayRoute, b: JayRoute): number {
  const maxLen = Math.max(a.segments.length, b.segments.length);

  for (let i = 0; i < maxLen; i++) {
    const segA = a.segments[i];
    const segB = b.segments[i];

    // If one route is shorter, it's less specific (comes later)
    if (segA === undefined) return 1;
    if (segB === undefined) return -1;

    const priorityA = getSegmentPriority(segA);
    const priorityB = getSegmentPriority(segB);

    if (priorityA !== priorityB) return priorityA - priorityB;

    // Both same type - if static, compare alphabetically for determinism
    if (typeof segA === 'string' && typeof segB === 'string') {
      const cmp = segA.localeCompare(segB);
      if (cmp !== 0) return cmp;
    }
  }

  return 0; // Routes are equivalent (shouldn't happen)
}

export function sortRoutesByPriority(routes: JayRoutes): JayRoutes {
  return [...routes].sort(compareRoutes);
}
```

### Phase 2: Update scanRoutes to return sorted routes

```typescript
export async function scanRoutes(baseDir: string, options: ScanFilesOptions): Promise<JayRoutes> {
  const BASE_DIR = path.resolve(baseDir);
  const routes = await scanDirectory(BASE_DIR, BASE_DIR, options);
  return sortRoutesByPriority(routes);
}
```

### Phase 3: Add tests for priority ordering

Add test fixture:

```
test/fixtures/priority/
├── products/
│   ├── [slug]/page.jay-html
│   ├── ceramic-flower-vase/page.jay-html
│   └── page.jay-html
└── [...path]/page.jay-html
```

Add test:

```typescript
it('should sort routes by priority (static before dynamic)', async () => {
  const routes = await scanRoutes('./test/fixtures/priority', options);
  const paths = routes.map((r) => r.rawRoute);

  expect(paths).toEqual([
    '/products/ceramic-flower-vase', // most specific (2 static)
    '/products/[slug]', // 1 static + 1 param
    '/products', // 1 static
    '', // root (if exists)
    '/[...path]', // catch-all (least specific)
  ]);
});
```

### Phase 4: Update existing tests

The existing test expectations in `route-scanner.test.ts` assume a specific order. Update them to match the new sorted order.

## Trade-offs

| Aspect              | Benefit                                                | Cost                         |
| ------------------- | ------------------------------------------------------ | ---------------------------- |
| Predictability      | Routes always match in a predictable, intuitive order  | Slight overhead for sorting  |
| Override capability | Users can create specific overrides for dynamic routes | N/A                          |
| Breaking change     | Better behavior                                        | Existing tests need updating |

## Verification Criteria

1. ✅ `/products/ceramic-flower-vase` request hits the static route, not `[slug]`
2. ✅ `/products/something-else` request hits the `[slug]` dynamic route
3. ✅ Route order is deterministic across runs
4. ✅ All existing tests pass (with updated expectations)
5. ✅ New priority-specific tests pass

---

## Implementation Results

### Changes Made

**File: `jay/packages/jay-stack/route-scanner/lib/route-scanner.ts`**

- Added `getSegmentPriority()` function - returns 0-3 based on segment type
- Added `compareRoutes()` function - compares routes segment-by-segment
- Added exported `sortRoutesByPriority()` function - sorts routes by specificity
- Modified `scanRoutes()` to return sorted routes

**File: `jay/packages/jay-stack/route-scanner/test/route-scanner.test.ts`**

- Updated existing test expectations to match new sorted order
- Added 2 new integration tests for priority ordering
- Added 4 new unit tests for `sortRoutesByPriority()`

**File: `jay/packages/jay-stack/route-scanner/test/route-to-express-route.test.ts`**

- Added priority fixture routes to expected set

**New test fixtures:**

- `test/fixtures/priority/products/page.jay-html`
- `test/fixtures/priority/products/[slug]/page.jay-html`
- `test/fixtures/priority/products/ceramic-flower-vase/page.jay-html`
- `test/fixtures/priority/[...path]/page.jay-html`

### Test Results

All 11 tests passing.

### Verification with store-light

```
Routes in priority order:
1. /cart
2. /products/ceramic-flower-vase  ← Static override now matches first!
3. /products/[slug]               ← Catches remaining slugs
4. /products
```

### Deviations from Design

None - implementation followed the design exactly.
