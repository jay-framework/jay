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
3. Verify with production build
