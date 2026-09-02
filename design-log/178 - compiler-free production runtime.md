# Design Log #178 — Compiler-Free Production Runtime

## Background

The production server has two modes: **serve** (main server handles requests) and **rebuild** (renderer server re-runs slow phase when data changes). Neither mode genuinely needs the compiler — all compilation happens during `jay-stack build`. But compiler packages are pulled into the serve/rebuild bundle through accidental import chains, inflating the deploy artifact.

This matters for Wix BaaS deployment where the serve bundle must be under 20MB. Currently we hack around it by stripping compiler packages from the bundle post-build.

## Problem

Two packages each mix build-time and serve-time code in a single bundle:

### stack-server-runtime

Compiles to a single `dist/index.js` that imports compiler packages at the top level. Dev-server-only modules (`load-page-parts.ts`, `generate-ssr-response.ts`) import `compiler-jay-html`, but serve-time modules (`fast-changing-runner.ts`, `slowly-changing-runner.ts`) are bundled alongside them. Any import from `stack-server-runtime` triggers loading the compiler.

Two small utility functions are genuinely needed at serve time but live in `compiler-shared`:
- `computeForEachInstanceKey` — ~10-line pure function for forEach instance coordination
- `loadPluginManifest` — reads and parses `plugin.yaml` files

### production-server (currently)

Has a `serve-index.ts` entry point intended to exclude build deps, but Vite's bundler creates a shared chunk containing both `loadProductionPageParts` (build-only, imports compiler) and `loadPagePartsFromConfig` (serve-only, compiler-free) because they share a file.

Rebuild also unnecessarily re-parses jay-html via `loadProductionPageParts` when it could read the pre-built `page-parts.json`.

## Design

### Two package splits with parallel naming

Split each mixed package into a runtime package (zero compiler deps) and a build package (compiler + vite deps):

| Runtime (serve + rebuild) | Build (compile + bundle) |
|---------------------------|--------------------------|
| `@jay-framework/production-server` | `@jay-framework/production-build` |
| `@jay-framework/stack-server-runtime` | `@jay-framework/stack-server-build` |

#### stack-server-runtime → stack-server-runtime + stack-server-build

**`@jay-framework/stack-server-runtime`** — pure runtime, zero compiler deps:
- `slowly-changing-runner.ts`, `fast-changing-runner.ts`, `instance-slow-render.ts`
- `resolve-instance-props.ts`, `services.ts`
- `plugin-scanner.ts` (with inlined `loadPluginManifest`)
- `parseCookies`
- Inlined `computeForEachInstanceKey` (copied from compiler-shared)

**`@jay-framework/stack-server-build`** — dev-server and build tooling, depends on compiler:
- `load-page-parts.ts` (needs Vite + compiler-jay-html)
- `generate-ssr-response.ts` (needs compiler for dev-server SSR)
- `action-metadata.ts`, `action-discovery.ts`, `contract-materializer.ts`
- Depends on `stack-server-runtime` + compiler packages

#### production-server → production-server + production-build

**`@jay-framework/production-server`** — serve + rebuild, zero compiler deps:
- `main-server.ts`, `renderer-server.ts`
- `fetch-page-handler.ts`, `fetch-action-handler.ts`, `fetch-static-handler.ts`
- `route-matcher.ts`, `import-map.ts`, `artifact-store.ts`
- `init-services.ts`
- `rebuild.ts` (using `loadPagePartsFromConfig`, not re-parsing)
- `generate-sitemap.ts`
- Depends on `stack-server-runtime` (not `stack-server-build`)

**`@jay-framework/production-build`** — build pipeline, depends on compiler + vite:
- `build-pipeline.ts`, `instance-pipeline.ts`, `instance-client-build.ts`
- `server-element-compile.ts`, `shared-chunks-build.ts`, `server-code-build.ts`
- `load-production-parts.ts` (the build version with `loadProductionPageParts`)
- `param-routing.ts`, `route-manifest.ts`
- Depends on `production-server` + `stack-server-build` + compiler + vite

### Make rebuild compiler-free

Currently `rebuild.ts` calls `buildInstance()` which calls `loadProductionPageParts()` (re-parses jay-html). But rebuild only re-runs the slow phase when data changes — the jay-html hasn't changed.

Create `rebuildInstance()` in `production-server` that uses `loadPagePartsFromConfig()` (reads pre-built `page-parts.json`) instead of re-parsing. `buildInstance()` stays in `production-build` for the initial build.

### Inline utilities

Copy two small functions into `stack-server-runtime` to break the `compiler-shared` dependency:

- `computeForEachInstanceKey` — pure hash function, ~10 lines, no deps
- `loadPluginManifest` — YAML file reader, inline into `plugin-scanner.ts`

## Consumer mapping

| Consumer | Depends on |
|----------|------------|
| Dev server | `stack-server-runtime` + `stack-server-build` |
| CLI build (`jay-stack build`) | `production-build` |
| CLI serve (`jay-stack serve`) | `production-server` |
| CLI validate/agent-kit/etc. | `stack-server-build` (via stack-cli) |
| Wix BaaS deploy | `production-server` only |
| jay-fetch-handler | `production-server` |

## Dependency graph

```
stack-server-runtime ←── production-server       (both zero compiler deps)
       ↑                        ↑
stack-server-build ←─── production-build          (both have compiler + vite deps)
                               ↑
                           stack-cli
```

## Implementation Plan

### Phase 1: Create `stack-server-build` package

1. Create `packages/jay-stack/stack-server-build/` with `package.json`
2. Move build-only modules from `stack-server-runtime`
3. Depends on `stack-server-runtime` + compiler packages
4. Update dev-server imports

### Phase 2: Clean `stack-server-runtime`

1. Inline `computeForEachInstanceKey` and `loadPluginManifest`
2. Remove all compiler imports
3. Verify zero compiler dependencies in built output

### Phase 3: Rename current `production-server` to `production-build`

1. Rename package directory and `package.json` name
2. Keep all build code
3. Update `stack-cli` build imports

### Phase 4: Create new `production-server` package (serve + rebuild)

1. Create `packages/jay-stack/production-server/` with `package.json`
2. Move serve-time modules from `production-build`
3. Move `loadPagePartsFromConfig` (serve-only)
4. Create `rebuildInstance()` using `page-parts.json`
5. Move `rebuild.ts` to use `rebuildInstance()`
6. Depends on `stack-server-runtime` only

### Phase 5: Update all consumers

1. `stack-cli` `runServe`: import from `production-server`
2. `stack-cli` `runBuild`: import from `production-build`
3. `jay-fetch-handler`: import from `production-server`
4. Wix deploy plugin: depend on `production-server`
5. Dev-server: import build symbols from `stack-server-build`

### Phase 6: Verify

1. `production-server` has zero deps on compiler-jay-html, compiler-shared, compiler-jay-stack, vite
2. `stack-server-runtime` has zero compiler deps
3. `jay-stack serve` starts cleanly
4. Rebuild via `/_jay/rebuild` works using `page-parts.json`
5. `jay-stack build` works via `production-build`
6. Wix BaaS deploy bundle under 5MB
7. Smoke tests pass for dev, production self-hosted, production CDN
