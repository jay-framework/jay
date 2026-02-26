# Design Log 98 — Route-Based Server-Element Output

## Background

Design Log 96 established a consistent build folder with `pre-rendered/` mirroring route structure. The SSR hydration branch (DL93 + DL94) later added server-element file generation, but placed them in a flat `build/server-elements/` directory. This causes name collisions for multi-page sites and is inconsistent with DL96.

## Problem

If two routes share a jay-html filename (e.g., `pages/about/index.jay-html` and `pages/shop/index.jay-html`), their compiled server-element files collide in the flat `build/server-elements/` directory.

## Design

Server-element files should be written to `build/pre-rendered/{routeDir}/` instead of `build/server-elements/`, where `routeDir` is the route's directory relative to `pagesRootFolder`. This mirrors the pre-rendered file structure from DL96.

### Changes

1. **`generateSSRPageHtml`** and **`compileAndLoadServerElement`** receive a new `routeDir: string` parameter
2. **`sendResponse`** (dev-server) receives the original `sourceJayHtmlPath` (always `route.jayHtmlPath`) and computes `routeDir` from it relative to `pagesRootFolder`
3. Output directory changes from `path.join(buildFolder, 'server-elements')` to `path.join(buildFolder, 'pre-rendered', routeDir)`

## Verification

- Build passes
- Existing dev-server tests pass
- Full test suite passes
