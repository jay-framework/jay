# Design Log #110 — Filesystem-Based Slow Render Cache

## Background

The dev server's `SlowRenderCache` uses a hybrid approach: pre-rendered jay-html files are stored on disk (so Vite can compile them), but the cache metadata (`slowViewState`, `carryForward` with `__instances`) is stored in-memory. Additionally, `loadPageParts` runs on every request even though its output is stable per route until source files change.

## Problem

### 1. `withLoadParams` runs on every request

`compDefinition.loadParams` is called inside `runSlowlyForPage` on every request. It returns an async iterable of all valid param combinations (e.g., all product slugs) and checks if the current request params match. This can be expensive (e.g., querying a database). The result is stable for the lifetime of the dev server — param routes don't change while developing.

### 2. Cache metadata is in-memory only

`SlowRenderCache` stores `slowViewState` and `carryForward` (including `__instances` with discovered instances, their props, coordinates, and slow-phase carryForwards) in a `Map<CacheKey, SlowRenderCacheEntry>`. On dev server restart:

- The pre-rendered jay-html files on disk survive
- But the metadata is gone — the entry can't be reconstructed
- First request after restart always re-runs the full slow render pipeline

## Design

### Change 1: Cache `loadParams` results per route

Cache the `loadParams` result per route (`jayHtmlPath`). On first request for a route, `runSlowlyForPage` calls `compDefinition.loadParams`, iterates all param combinations, and caches the result. On subsequent requests, use the cached result to validate params without re-running the callback.

**Cache location:** In `DevSlowlyChangingPhase` (or a new cache passed to it). Keyed by `jayHtmlPath`.

**Invalidation:** When `page.ts` or `.jay-contract` changes (same triggers as slow render cache), invalidate the loadParams cache for that route. New param sets are discovered on the next request.

### Change 2: Embed cache metadata in the pre-rendered jay-html

Instead of storing `slowViewState` and `carryForward` in memory, embed them in the pre-rendered jay-html file as a `<script type="application/jay-cache">` tag.

```html
<script type="application/jay-cache">
  {
    "slowViewState": { "title": "Hello" },
    "carryForward": { "__instances": { ... } }
  }
</script>
```

**On cache set:** Prepend the script tag to the pre-rendered jay-html before writing to disk.

**On cache read:** Parse the script tag from the file, extract metadata, strip the tag before returning.

**The `SlowRenderCache` simplifies:**

- Remove in-memory `cache` map — the filesystem IS the cache
- `get()` checks if the file exists, reads it, extracts the `<script>` tag
- `set()` embeds the metadata and writes the file
- `invalidate()` deletes the file
- On startup, existing cache files are automatically available

## Questions

**Q1: Should we cache the full `loadParams` result or just the match outcome?**
A: Cache the full `UrlParams[]` result. `loadParams` returns an async iterable of all valid param combinations. Collect into an array and cache so `findMatchingParams` can check against it without re-running the callback.

**Q2: What about pages with URL params? Each param combination has a different cache file.**
A: Same as current behavior — each param combination gets its own file with its own `jay-cache` metadata. The `loadPageParts` cache is per route (not per params) since component definitions don't change with params.

**Q3: Should we strip the `<script>` tag in `SlowRenderCache.get()` or in the consumer?**
A: In `get()`. Return the entry with content already stripped. The consumer never sees the cache tag.

**Q4: What about the `pathToKeys` mapping for invalidation?**
A: Keep it for invalidation. But instead of mapping to cache keys, map source paths to cache file paths on disk. On invalidation, delete the files. On startup, reconstruct the mapping by scanning the cache directory.

## Implementation Plan

### Phase 1: Cache `loadParams` per route

1. Add `loadParamsCache: Map<string, UrlParams[]>` to `DevSlowlyChangingPhase` (or dev server state)
2. On first call to `runSlowlyForPage` for a route, collect all params from `loadParams` and cache
3. On subsequent calls, use cached params for `findMatchingParams`
4. Invalidate on file changes (same watcher as slow render cache)

### Phase 2: Embed cache metadata in jay-html

1. `SlowRenderCache.set()`: prepend `<script type="application/jay-cache">` with JSON metadata
2. `SlowRenderCache.get()`: read file, extract and parse the script tag, return entry
3. Remove in-memory `cache` map
4. Strip the `<script>` tag in the returned content

### Phase 3: Startup cache recovery

1. On `get()`, if the file exists on disk but isn't in the path mapping, read and parse it
2. Lazy recovery — no startup scan, just discover on first access

## Files to modify

- `packages/jay-stack/stack-server-runtime/lib/slow-render-cache.ts` — embed metadata, filesystem-only
- `packages/jay-stack/stack-server-runtime/lib/slowly-changing-runner.ts` — loadParams caching
- `packages/jay-stack/dev-server/lib/dev-server.ts` — invalidation for loadParams cache

## Verification

1. Dev server restart with existing cache files → no slow render on first request
2. File change → cache invalidated → next request triggers full pre-render
3. `loadParams` called once per route per dev server lifecycle
4. All hydration tests pass (195 tests)
5. `stack-server-runtime` tests pass
6. Pages with URL params work correctly (param validation uses cached result)

## Implementation Results

### Changes Made

**`slow-render-cache.ts`:**

- Removed in-memory `cache` map — filesystem is now the only cache
- `set()` embeds `<script type="application/jay-cache">` with JSON metadata (slowViewState, carryForward, sourcePath), returns full `SlowRenderCacheEntry` with stripped content
- `get()` is now async — reads file from disk, extracts and strips the cache tag, returns entry or undefined
- `has()` is now async — checks file existence
- Added `preRenderedContent` to `SlowRenderCacheEntry` — consumers get pre-stripped content
- `pathToKeys` renamed to `pathToFiles` (maps source paths to pre-rendered file paths)
- Added `scanAndDeleteCacheFiles()` for invalidation after restart when pathToFiles is not populated
- Lazy recovery: `get()` registers discovered files in pathToFiles automatically

**`slowly-changing-runner.ts`:**

- Added `loadParamsCache: Map<string, UrlParams[][]>` to `DevSlowlyChangingPhase`
- Added `jayHtmlPath?: string` parameter to `SlowlyChangingPhase` interface
- On first call, collects all params from async iterable per part and caches them
- On subsequent calls, validates against cached params without re-running loadParams
- Added `invalidateLoadParamsCache(jayHtmlPath)` method

**`load-page-parts.ts`:**

- Added `preRenderedContent?: string` to `LoadPagePartsOptions`
- When provided, uses content directly instead of reading from disk

**`dev-server.ts`:**

- Build folder cleanup now preserves `pre-rendered/` directory for cache survival across restarts
- `get()` calls are now awaited (async API)
- Removed `fs.access` check — `get()` handles file existence internally
- `handleCachedRequest` passes `preRenderedContent` to both `loadPageParts` and `sendResponse`
- `handlePreRenderRequest` uses `set()` return value (full entry) directly
- `sendResponse` accepts optional `preLoadedContent` parameter
- `setupSlowRenderCacheInvalidation` also invalidates loadParams cache via `slowlyPhase.invalidateLoadParamsCache()`
- Both `runSlowlyForPage` call sites pass `route.jayHtmlPath` for loadParams caching

### Deviations from Design

- `loadParamsCache` stores `UrlParams[][]` (array of arrays, one per part with loadParams) instead of flat `UrlParams[]`, correctly handling multiple parts with independent loadParams
- Added `preRenderedContent` to the cache entry and plumbed it through `loadPageParts` and `sendResponse` to avoid re-reading the file that now contains the cache tag
- Added route filtering in `mkDevServer` to exclude routes found inside the build folder. Preserving `pre-rendered/` across restarts means cached `page.jay-html` files could be picked up by `scanRoutes` as additional routes (when build folder is inside pages root, e.g., in tests)

### Test Results

- stack-server-runtime: 89/89 passed (10 test files)
- hydration: 195/195 passed
- dev-server: 4/4 passed
- TypeScript: zero type errors in both packages
