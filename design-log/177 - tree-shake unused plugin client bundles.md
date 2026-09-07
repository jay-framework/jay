# Design Log #177 — Per-Route Preload Filtering for Shared Chunks

## Background

The production build bundles client-side code for every installed plugin that exports `./client` into shared chunks under `frontend/shared/`. The HTML page handler then preloads ALL shared chunks via `<link rel="modulepreload">` on every page, regardless of whether the page actually imports them.

## Problem

The jay-website installs `@jay-framework/markdown` but only uses it server-side (`markdown-pages` contract). The markdown plugin's client bundle (438 KiB: `marked` parser + mermaid + syntax highlighting) is preloaded on every page even though no page's hydrate script imports it.

`<link rel="modulepreload">` triggers an eager download — the browser fetches the file even though no script references it. Google PageSpeed flags this as a performance issue.

The root cause is in `fetch-page-handler.ts` line 149:

```ts
const preloadUrls = [...Object.values(importMap), clientBundleUrl];
```

This preloads every shared manifest entry on every page.

## Design

### Let Vite tell us what each route needs

The per-route client bundle is compiled by Vite/Rollup, which resolves all imports — including transitive ones through headfull components that import other headfull components that import headless plugin components. The rollup output already knows exactly which shared chunks each entry depends on.

Capture those dependencies at build time and store them on the `RouteEntry`. At serve time, preload only the route's dependencies instead of all shared chunks.

### Transitive imports are already handled

A page importing `<jay:SiteHeader>` → SiteHeader importing `<jay:NavMenu>` → NavMenu using `<jay:clipboard-copy>` from ui-kit: the compiler resolves all of this at compile time and the hydrate script has explicit `import` statements for every needed client module. Vite's rollup output captures these as chunk dependencies.

### Changes

**Build time (`instance-client-build.ts` or route compilation):**
After Vite builds the per-route client bundle, inspect the rollup output for the entry chunk's `imports` array. These are the shared chunk filenames the route depends on. Store them on `RouteEntry.sharedDeps`.

**Route manifest (`types.ts`):**
Add `sharedDeps?: string[]` to `RouteEntry`.

**Serve time (`fetch-page-handler.ts`):**
Replace:

```ts
const preloadUrls = [...Object.values(importMap), clientBundleUrl];
```

With:

```ts
const sharedPreloads = (route.sharedDeps ?? Object.keys(manifest.sharedManifest))
  .map((dep) => importMap[dep])
  .filter(Boolean);
const preloadUrls = [...sharedPreloads, clientBundleUrl];
```

Falls back to all shared chunks if `sharedDeps` is not set (backward compat with older manifests).

**Import map stays complete** — it includes all shared chunks so dynamic imports still resolve. Only the preload hints are filtered.

## Implementation Plan

1. Add `sharedDeps?: string[]` to `RouteEntry` in `types.ts`
2. After route client bundle compilation, extract chunk imports from rollup output and store on the route entry
3. In `fetch-page-handler.ts`, preload only `sharedDeps` chunks (with fallback)
4. Verify jay-website build: markdown chunk should NOT be preloaded on pages that don't use it

## Verification

1. Build jay-website — markdown shared chunk still exists in `frontend/shared/` (that's fine)
2. View page source — `<link rel="modulepreload">` should NOT include `markdown_client-*.js` on non-markdown pages
3. PageSpeed should no longer flag the unused bundle
4. Pages that use clipboard-copy, scroll-carousel etc. still preload ui-kit chunks
5. Smoke tests pass
