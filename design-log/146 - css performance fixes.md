# Design Log #146 — CSS Performance Fixes

## Problem

Lighthouse flags two CSS performance issues on production builds:

1. **CSS not minified** — Route CSS files are extracted as raw text from jay-html and written to disk without minification. JS bundles go through Vite with `minify: true`, but CSS bypasses this entirely.

2. **Font loading waterfall** — Three sequential network hops after HTML:
   - HTML → route.css (261ms) → Google Fonts CSS (342ms) → woff2 files (420ms each)
   - route.css has no preload hint, so the browser discovers it during HTML parsing
   - Font files can't start loading until Google Fonts CSS response arrives with `@font-face` declarations

## Design

### Fix 1: Minify CSS at build time

In `server-element-compile.ts`, minify the extracted CSS string before writing to disk. Use `esbuild.transform` (already a Vite dependency) with `{ loader: 'css', minify: true }`.

**File**: `packages/jay-stack/production-server/lib/builder/server-element-compile.ts` (line 76)

### Fix 2: Preload route CSS

In `fetch-page-handler.ts`, add `<link rel="preload" as="style">` for the route CSS so it starts loading in parallel with the importmap and module preloads, instead of being discovered later.

**File**: `packages/jay-stack/production-server/lib/serve/fetch-page-handler.ts` (line 123)

## Implementation Plan

1. Add `esbuild.transform` CSS minification in `server-element-compile.ts`
2. Add CSS preload link in `fetch-page-handler.ts`
3. Extract `@import` URLs from CSS at build time for preload hints
4. Verify with production build

## Implementation Results

All 85 production-server tests passing.

### CSS minification

- `server-element-compile.ts`: added `esbuild.transform(css, { loader: 'css', minify: true })` before writing route CSS to disk
- Respects `--no-minify` flag via `minifyCss` parameter threaded from `build-pipeline.ts` → `compileRouteServerElement` → `compileServerElement`
- Dev server unaffected — it doesn't use this code path (CSS is inlined via Vite dev pipeline)

### CSS preload hint

- `fetch-page-handler.ts`: emits `<link rel="preload" href="...route.css" as="style" />` at the top of `<head>`, before the importmap
- Browser starts fetching CSS immediately instead of discovering it during HTML parsing

### CSS @import preload hints

- `server-element-compile.ts`: `extractCssImportUrls()` scans CSS for external `@import` URLs (e.g., Google Fonts) at build time. Handles all syntax forms: `@import url("...")`, `@import url('...')`, `@import "..."`, and minified `@import"..."` (no space)
- Extracted URLs stored in `RouteEntry.cssImports` in the route manifest
- `fetch-page-handler.ts`: emits `<link rel="preload" as="style">` for each `cssImports` URL at the top of `<head>`
- The `@import` stays in the CSS file — the preload just ensures the browser starts the fetch early, and the `@import` hits the cache

### Resulting `<head>` order

```
<link rel="preload" href="...route.css" as="style" />
<link rel="preload" href="https://fonts.googleapis.com/css2?..." as="style" />
<script type="importmap">...</script>
<!-- head tags (preconnect, Google Fonts stylesheet, SEO) -->
<!-- module preloads -->
<link rel="stylesheet" href="...route.css" />
```
