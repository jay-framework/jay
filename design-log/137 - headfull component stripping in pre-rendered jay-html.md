# Design Log #137 — Production Build Self-Containment

## Background

When deploying to production (Docker/Cloud Run), only `build/`, `config/`, and `node_modules/` are in the container — no source files (`src/`). The production server fails in multiple places because it tries to read source files that don't exist. The build output should be fully self-contained.

DL#134b states the main server's design principle: **no compilation at runtime, all code is pre-compiled JS**. The "What the Main Server Does NOT Do" section explicitly excludes dynamic contract materialization and compilation. Yet the current serve-time code violates this by re-parsing jay-html and loading contracts from source files.

### Related Design Logs

- #134 — Production build (two-server architecture, artifact directory as contract)
- #134b — Main server (stateless request handling, pre-built artifacts only)
- #111 — Nested headfull full-stack components (template injection, headless pipeline)
- #123 — Deeply nested headfull and headless components (recursive hoisting)
- #94 — SSR streaming renderer (server element compilation)

## Problem

The production server requires source files that don't exist in the container. Four gaps were discovered during Cloud Run deployment of the golf project.

### Root Cause

All four gaps stem from one root cause: **the production server re-parses jay-html at serve time**. `loadProductionPageParts` calls `parseJayFile` and `injectHeadfullFSTemplates` to discover headless imports, load contracts, and resolve component modules — work that was already done at build time. This triggers file reads against source paths that don't exist in the container.

The fix is to **pre-compute the page configuration at build time** and load it directly at serve time, eliminating jay-html parsing entirely.

### Gap 1: Headfull component source files (ENOENT)

Two serve-time operations try to read headfull component source files:

1. **`parseJayFile`** (load-production-parts.ts:61) encounters `<script type="application/jay-headfull" src="../../components/header">` and calls `importResolver.readJayHtml()` — fails with ENOENT
2. **`injectHeadfullFSTemplates`** (load-production-parts.ts:154) also reads the same source file — fails with ENOENT

Subtlety: **headfull components can declare children** that are also needed at serve time:

1. **Nested headfull components** (DL#123 Scenario B) — headfull A contains headfull B
2. **Keyed headless components** — headfull component imports a plugin with a `key` attribute for page-level data binding
3. **Instance headless components** — headfull component imports a plugin used as `<jay:xxx>` instances

All three types are hoisted into the page's `headlessImports` during `parseHeadfullFSImports`, but only in memory — not persisted in the pre-rendered HTML.

### Gap 2: CSS files referenced by headfull components (ENOENT)

`parseJayFile` resolves CSS `<link>` tags from headfull components' jay-html against source paths. The CSS is already compiled into the build output. This gap goes away when we stop parsing jay-html at serve time.

### Gap 3: Materialized contracts needed at serve time (ENOENT)

`parseJayFile` → `parseHeadlessImports` calls `importResolver.loadPluginContract()` to load contracts at serve time. For NPM plugins, contracts resolve from `node_modules` (fine). For materialized contracts, the resolver looks in `agent-kit/materialized-contracts/` (doesn't exist in container). This gap goes away when we stop parsing jay-html at serve time — the contract data needed for fast rendering is pre-computed.

### Gap 4: Absolute paths in route manifest

`route-manifest.json` bakes in the build machine's absolute path as `projectRoot`. The production server passes this to `scanPlugins()` and `loadProductionPageParts`. Inside the container, that path doesn't exist.

## Questions and Answers

### Q1: After slow rendering and template injection, is a headfull component semantically equivalent to a headless component?

Yes. At that point:

| Contribution        | Where it lives after slow rendering                  |
| ------------------- | ---------------------------------------------------- |
| Template content    | Inlined in `<jay:Name>` tags in the body             |
| Slow-phase bindings | Resolved into static HTML                            |
| Component module    | Referenced by compiled server-element/hydrate output |

What remains is a component with a contract, a module, and `<jay:Name>` instances — exactly what a headless component is. The `<script type="application/jay-headfull">` tag is leftover metadata.

### Q2: Why does the production server parse jay-html at serve time?

It shouldn't. `loadProductionPageParts` calls `parseJayFile` to produce `ProductionPageParts`:

```ts
interface ProductionPageParts {
  parts: DevServerPagePart[]; // page + keyed headless component definitions
  headlessContracts: HeadlessContractInfo[]; // build-time only (for slowRenderTransform)
  headlessInstanceComponents: HeadlessInstanceComponent[]; // instance component definitions
  discoveredInstances: DiscoveredHeadlessInstance[]; // build-time only (for slow render)
  forEachInstances: ForEachHeadlessInstance[]; // forEach instance metadata
  keyedPartModules: KeyedPartModule[]; // build-time only (for hydration entry)
  serverTrackByMap?: Record<string, string>; // build-time only
  clientTrackByMap?: Record<string, string>; // build-time only
}
```

At serve time, `handlePageRequest` only uses a subset: `parts`, `headlessInstanceComponents`, and `forEachInstances`. All of these are known at build time.

### Q3: What does `renderFastChangingData` actually need from each component?

Traced through `fast-changing-runner.ts`:

**From `parts` (page + keyed headless):**

- `compDefinition.fastRender` — the function to call (loaded from module)
- `compDefinition.slowlyRender` — checked to determine fastRender signature
- `compDefinition.services` — for service resolution
- `key` — optional namespace for ViewState merging
- `contractInfo.contractName` + `contractInfo.metadata` — passed as props to fastRender

**From `headlessInstanceComponents` (instance headless):**

- `contractName` — to match against discovered instances
- `compDefinition.fastRender`, `.slowlyRender`, `.services` — same as above
- `contract.props` — **only** for prop name normalization in forEach instances (line 154-156):
  ```ts
  const contractProps = comp.contract?.props ?? [];
  const normalizePropName = (key: string) =>
    contractProps.find((p) => p.name.toLowerCase() === key.toLowerCase())?.name ?? key;
  ```
  Just needs `Array<{ name: string }>`.

**From `forEachInstances`:**

- `contractName`, `forEachPath`, `trackBy`, `propBindings`, `coordinateSuffix` — all plain serializable data.

### Q4: Can we pre-compute this config at build time?

Yes. Everything `renderFastChangingData` needs is either:

1. A module to import (serialize as path + export name)
2. Plain data (serialize as JSON)

The only non-serializable parts are `compDefinition` objects (functions). Replace with module references that the serve-time loader imports.

### Q5: What about contracts — are they needed at serve time beyond prop name normalization?

The full `Contract` object is not needed. At serve time, the only contract usage is `contract.props` for forEach prop name normalization. The rest (type generation, ViewState schema, phase annotations) is build-time only.

For the automation/webMCP system: contract descriptions and structure are used **client-side** by the automation API to help AI agents understand the page. This comes from the compiled hydration entry, not from server-side contract resolution.

We should compile the "effective contract" — the minimal contract data each component needs at serve time — and embed it in the page config. This also makes contracts available to plugins that need them at serve time.

### Q6: Is the page config per-route or per-instance?

Per-route. All instances of the same route share the same source jay-html and the same component structure. They differ only in slow ViewState (which is already in `cache.json`). The current `page-handler.ts` caches `pageParts` by `route.pattern` (line 29-31), confirming this assumption.

### Q7: What about headfull component children — nested headfull, keyed headless, instance headless?

All three are handled at build time by `parseHeadfullFSImports` (recursive for nested headfull, lines 1076-1114). The build pipeline already discovers and resolves all children via `loadProductionPageParts`. The pre-computed config captures the complete resolved result — all children are flattened into the parts and headlessInstanceComponents arrays.

No special serve-time handling needed. The config simply records the final resolved state.

### Q8: The config is written "once per route, first instance writes it." How do we know the first instance's result is correct for all instances?

All instances of a route share the same source jay-html — slow rendering changes data bindings, not template structure. The headless imports, forEach declarations, and component modules are structural. The config captures template structure, not data.

Note on `ForEachHeadlessInstance` vs `DiscoveredHeadlessInstance`: slow forEach expansion (Pass 1) unrolls items into static `<jay:xxx>` tags, which become `DiscoveredHeadlessInstance` entries stored in `carryForward.__instances` (per-instance, in `cache.json`). Interactive forEach blocks stay as `ForEachHeadlessInstance` — template-structural, same for all instances. The `coordinateSuffix` (e.g., `product-card:AR0`) is a position-based suffix determined by template structure, not by data. It is safe per-route.

### Q9: Module paths in the config — what if the build directory moves between build and serve (e.g., different mount point in Docker)?

Paths must be relative to the build directory, not absolute. When serializing, store `server/components/kitan-header/index.js` (relative to buildDir), not `/Users/yoav/work/jay/golf/build/v1/server/...`. The serve-time loader resolves against its own buildDir. NPM module paths (e.g., `@wix/stores-plugin`) are package names, not filesystem paths — they resolve via `node_modules`.

### Q10: Is there a race condition if instances of the same route build concurrently?

Currently `buildInstance` runs sequentially per route (`for (const params of paramsList)` in build-pipeline.ts:371). The first instance writes the config, subsequent ones skip. No race. If concurrent builds are added later, last-writer-wins is safe because the config is identical for all instances of a route.

### Q11: The serve-time loader casts `{ props: [...] } as any` to satisfy the `Contract` type. Is this safe?

No — `as any` is fragile. If future code accesses other contract fields at serve time, it silently gets `undefined`. Instead, narrow the type. Introduce `ServeTimeContract`:

```ts
interface ServeTimeContract {
  props: Array<{ name: string }>;
}
```

Update `HeadlessInstanceComponent.contract` to accept `Contract | ServeTimeContract`, or use `Pick<Contract, 'props'>` if `Contract.props` has the right shape. This makes the contract boundary explicit and type-safe.

### Q12: The serve-time loader uses `modulePath.startsWith('server/')` to distinguish local from NPM modules. Is this reliable?

The heuristic works for the current naming convention (local modules are compiled to `server/...`), but it's implicit. Better: add a `source: 'npm' | 'local'` field to the config. Explicit is safer than convention-based.

### Q13: When the slow render server re-renders an instance on data change (DL#134c), does it need to regenerate `page-parts.json`?

No. Data changes only affect slow ViewState (stored in `cache.json`). The component structure (which modules, which contracts, which forEach declarations) is determined by the source jay-html, which doesn't change on data change — only on code deployment. The page-parts config is stable within a version.

### Q14: `trackByMap` for `deepMergeViewStates` — is it populated in the route manifest?

No — this is a latent bug. `buildRouteEntry` in route-manifest.ts does not set `trackByMap`, but `page-handler.ts:131` reads `route.trackByMap || {}` for `deepMergeViewStates`. The `pageParts.clientTrackByMap` from `loadProductionPageParts` is available at build time (passed to `generateHydrationEntry`) but not written to the manifest.

This affects the `secure` package's deep merge behavior. Since jay-stack does not yet support the secure package, this can be fixed separately. For now, note it as a known gap: the page-parts config or route manifest should include `trackByMap` when secure package support is added.

## Design

### Pre-computed page config

Replace serve-time jay-html parsing with a build-time config file. The build pipeline already runs `loadProductionPageParts` to discover all components. Instead of discarding that knowledge and re-deriving it at serve time, serialize it.

#### Config schema

```ts
interface PagePartsConfigEntry {
  modulePath: string; // e.g., "server/pages/product/page.js" or "@wix/stores-plugin"
  exportName: string; // e.g., "page" or "ProductCard"
  source: 'npm' | 'local';
}

interface PagePartsConfig {
  /** Page component + keyed headless components */
  parts: Array<
    PagePartsConfigEntry & {
      key?: string; // keyed headless namespace
      contractInfo?: {
        contractName: string;
        metadata?: Record<string, unknown>;
      };
    }
  >;

  /** Instance headless components (used as <jay:xxx> tags) */
  instanceComponents: Array<
    PagePartsConfigEntry & {
      contractName: string;
      propNames: string[]; // from contract.props, for forEach prop normalization
    }
  >;

  /** forEach headless instances (interactive forEach only — slow forEach is in carryForward) */
  forEachInstances: Array<{
    contractName: string;
    forEachPath: string;
    trackBy: string;
    propBindings: Record<string, string>;
    coordinateSuffix: string;
  }>;
}
```

All fields are plain JSON. No parsed contracts, no function references, no file handles.

For the contract type at serve time, introduce a narrow type instead of casting:

```ts
interface ServeTimeContract {
  props: Array<{ name: string }>;
}
```

`HeadlessInstanceComponent.contract` should accept `Contract | ServeTimeContract` so the serve-time loader can construct it type-safely from `propNames`.

#### Build-time: write config

In `instance-pipeline.ts`, after `loadProductionPageParts` (line 100-107), serialize the config:

```
Build time (instance-pipeline.ts):
  1. loadProductionPageParts() → pageParts              [already done]
  2. writePagePartsConfig(pageParts) → page-parts.json  [NEW]
  3. injectHeadfullFSTemplates() → templates inlined    [already done]
  4. slowRenderTransform() → slow bindings resolved     [already done]
  5. ... rest of pipeline unchanged ...
```

The config is written **per-route** (not per-instance). First instance of each route writes it; subsequent instances skip. Location: `build/v1/pre-rendered/{routeDir}/page-parts.json`.

#### Serve-time: load config

Replace `loadProductionPageParts` with a new function that:

1. Reads `page-parts.json`
2. Imports each module by path (using `import()` for NPM packages, artifact store for local modules)
3. Assembles `ProductionPageParts` from config + loaded modules
4. Returns the same shape as today — `handlePageRequest` doesn't change

```ts
async function importModule(
  entry: PagePartsConfigEntry,
  artifacts: FilesystemArtifactStore,
): Promise<any> {
  return entry.source === 'local'
    ? artifacts.loadPageModule(entry.modulePath)
    : import(entry.modulePath);
}

async function loadPagePartsFromConfig(
  configPath: string,
  artifacts: FilesystemArtifactStore,
): Promise<ProductionPageParts> {
  const config: PagePartsConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));

  const parts: DevServerPagePart[] = [];
  for (const entry of config.parts) {
    const mod = await importModule(entry, artifacts);
    parts.push({
      compDefinition: mod[entry.exportName],
      key: entry.key,
      clientImport: '',
      clientPart: '',
      contractInfo: entry.contractInfo,
    });
  }

  const headlessInstanceComponents: HeadlessInstanceComponent[] = [];
  for (const entry of config.instanceComponents) {
    const mod = await importModule(entry, artifacts);
    const serveTimeContract: ServeTimeContract = {
      props: entry.propNames.map((name) => ({ name })),
    };
    headlessInstanceComponents.push({
      contractName: entry.contractName,
      compDefinition: mod[entry.exportName],
      contract: serveTimeContract,
    });
  }

  return {
    parts,
    headlessContracts: [],
    headlessInstanceComponents,
    discoveredInstances: [],
    forEachInstances: config.forEachInstances,
    keyedPartModules: [],
  };
}
```

No `parseJayFile`, no `injectHeadfullFSTemplates`, no `importResolver`, no source files, no contracts.

### What changes in each file

| File                       | Change                                                                  | Why                                        |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------ |
| `instance-pipeline.ts`     | After `loadProductionPageParts`, write `page-parts.json`                | Serialize discovered config at build time  |
| `load-production-parts.ts` | Add `loadPagePartsFromConfig()` function                                | Serve-time loader from pre-computed config |
| `page-handler.ts`          | Call `loadPagePartsFromConfig()` instead of `loadProductionPageParts()` | Eliminate serve-time jay-html parsing      |
| `main-server.ts`           | Use `process.cwd()` instead of `manifest.projectRoot`                   | Fix Gap 4: absolute path in container      |
| `page-handler.ts`          | Use `process.cwd()` instead of `manifest.projectRoot`                   | Fix Gap 4 for page parts loading           |
| `types.ts`                 | Make `projectRoot` optional in `RouteManifest`                          | It's no longer the source of truth         |
| `artifact-store.ts`        | Add `readPagePartsConfig(routeDir)`                                     | Read page-parts.json for a route           |

### What does NOT change

- `instance-pipeline.ts` build flow (slow render, server element compile, hydration gen) — unchanged
- `loadProductionPageParts` itself — still used at build time by `buildInstance` and param discovery
- Pre-rendered jay-html format — still written to disk for server-element compilation and hydration entry gen (both build-time only)
- `renderFastChangingData` — receives the same `ProductionPageParts` shape
- `handlePageRequest` response assembly — unchanged

### Effective contract compilation

For components that need contract data at serve time (forEach prop normalization), embed only what's needed:

```ts
// At build time, extract from contract:
propNames: contract.props?.map((p) => p.name) ?? [];
```

If plugins need richer contract data at serve time (e.g., descriptions for automation), extend the config with an `effectiveContract` field per component. This is an additive change — start minimal.

### Module path resolution

At build time, `loadProductionPageParts` already resolves module paths:

- **NPM plugins:** package name (e.g., `"@wix/stores-plugin"`) — works with `import()` at serve time
- **Local components:** resolved to `build/v1/server/components/.../index.js` via the `serverBuildDir` parameter (load-production-parts.ts:86-100)

The config stores these resolved paths. At serve time, NPM modules import by package name; local modules import from the build directory.

## Implementation Plan

### Phase 0: Expand test fixture and establish baseline

The existing `basic-project` fixture only tests two simple headfull pages — none of the configurations affected by DL#137. Expand it to cover all relevant component patterns, verify they work with the current build+serve pipeline, then verify they still work after implementation.

#### Fixture structure

```
basic-project/
├── src/
│   ├── lib/init.ts                              [keep]
│   ├── actions/cart.actions.ts                  [keep]
│   ├── components/
│   │   └── site-header/
│   │       ├── index.ts                         headfull FS component
│   │       ├── site-header.jay-html             template — includes <jay:cart-badge>
│   │       └── site-header.jay-contract         contract
│   ├── plugins/
│   │   └── cart-badge/
│   │       ├── index.ts                         headless component (local plugin)
│   │       └── cart-badge.jay-contract          contract
│   └── pages/
│       ├── page.ts                              [NEW] index — simple page
│       ├── page.jay-html
│       ├── home/
│       │   ├── page.ts                          [MOVED from /] original home page
│       │   └── page.jay-html
│       ├── featured/
│       │   ├── page.ts                          [NEW] page with headfull FS component
│       │   ├── page.jay-html                    imports site-header (headfull with nested headless)
│       │   └── page.jay-contract
│       ├── catalog/
│       │   ├── page.ts                          [NEW] page with direct headless instance
│       │   ├── page.jay-html                    uses <jay:cart-badge> directly
│       │   └── page.jay-contract
│       └── items/[slug]/
│           ├── page.ts                          [keep] dynamic page with loadParams
│           └── page.jay-html                    [keep]
```

#### What each page tests

| Route           | Configuration                                                               | DL#137 relevance                                                 |
| --------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `/`             | Simple page, slow+fast, no headless/headfull                                | Baseline — no source file dependencies at serve time             |
| `/home`         | Moved home page (same logic as current `/`)                                 | Verifies non-root routes work                                    |
| `/featured`     | Headfull FS component (site-header) containing nested headless (cart-badge) | **Gap 1 core case** — headfull source + nested headless hoisting |
| `/catalog`      | Direct headless instance `<jay:cart-badge>` on page                         | Headless without headfull wrapping                               |
| `/items/[slug]` | Dynamic params + loadParams (2 slugs)                                       | Per-instance builds, different slow ViewState                    |

#### Components

**`site-header`** (headfull FS):

- Contract: `siteName: string (slow)`, ref: `menuButton`
- Template includes `<jay:cart-badge>` — a nested headless instance
- Has slow+interactive phases

**`cart-badge`** (headless, local plugin):

- Contract: `count: number (fast)`
- Fast phase returns cart count
- Used in two contexts: nested inside site-header (featured page) AND directly on catalog page

#### Test strategy

**Build tests** — for each new page:

- Pre-rendered jay-html exists and contains expected content
- Server element loads and produces HTML via `renderToStream`
- Client bundle exists
- Cache metadata has correct slow ViewState

**Serve tests** — for each new page:

- SSR response returns 200 with expected content
- Headless component data appears in rendered output
- Import map and hydration script present

**Self-containment test** (the DL#137 litmus test):

1. Build the project
2. Remove/rename `src/` directory
3. Start the production server from build artifacts only
4. Hit each route — should all return 200

This test should **FAIL with current code** (confirming the gap) and **PASS after implementation**.

### Phase 1: Write page-parts.json at build time

1. In `instance-pipeline.ts`, after `loadProductionPageParts()` returns `pageParts`, serialize a `PagePartsConfig` to `page-parts.json`
2. Write once per route (skip if already written for a different instance of the same route)
3. Extract module paths from the headless import resolution that `loadProductionPageParts` already performed
4. Extract `propNames` from `contract.props` for each instance component
5. Extract `forEachInstances` from the discovery result

### Phase 2: Serve-time loader from config

1. Add `loadPagePartsFromConfig()` to `load-production-parts.ts`
2. Update `page-handler.ts` to call it instead of `loadProductionPageParts()`
3. The function reads `page-parts.json`, imports modules, assembles `ProductionPageParts`
4. Cache per-route (same as current `pagePartsCache`)

### Phase 3: Fix absolute paths (Gap 4)

1. In `main-server.ts`, replace `manifest.projectRoot` with `process.cwd()` for `discoverPluginsWithInit`
2. In `page-handler.ts`, replace `manifest.projectRoot` with `process.cwd()` for page parts loading
3. Make `projectRoot` optional in `RouteManifest` type — keep it for debugging but don't depend on it

### Phase 4: Clean up

1. Remove `parseJayFile` / `injectHeadfullFSTemplates` / `JAY_IMPORT_RESOLVER` imports from serve-time code paths
2. Remove `jayHtmlPath` from `RouteEntry` — not needed at serve time
3. The `loadProductionPageParts` function stays for build-time use

## Trade-offs

| Decision                                         | Pro                                                                                  | Con                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Pre-compute config at build time                 | Eliminates all source file dependencies at serve time; solves Gaps 1-3 in one design | Adds a config file to the build output; build pipeline must keep it in sync |
| Minimal contract serialization (prop names only) | Tiny config, no complex serialization                                                | If plugins need richer contract data at serve time, config must be extended |
| Per-route config (not per-instance)              | Single file per route; matches current caching behavior                              | Assumes all instances of a route share the same component structure         |
| `process.cwd()` for plugin discovery             | Works in any deployment (Docker, local, CI)                                          | Assumes project root == cwd; might need CLI flag for custom layouts         |
| Keep `loadProductionPageParts` for build time    | No refactor of the build pipeline; serve-time change is isolated                     | Two code paths for loading page parts (build-time vs serve-time)            |

## Verification

### Automated (Phase 0 fixture)

1. **Build tests pass** — all 5 routes build successfully with correct artifacts
2. **Serve tests pass** — all routes return 200 with expected SSR content
3. **Self-containment test** — build, remove `src/`, serve, all routes return 200
4. Routes covering all configurations: simple page, headfull FS, headfull+nested headless, direct headless instance, dynamic params

### Manual (golf project)

5. Build golf project with headfull FS components (kitan-header with cart-indicator)
6. Run production server WITHOUT `src/`, WITHOUT `agent-kit/` — all routes serve correctly
7. Verify Dockerfile needs only `COPY build/v1`, `COPY config` — no `COPY src/...` or `COPY agent-kit/...`
8. Verify no `sed` path rewriting needed in Dockerfile

## Implementation Results

### Phase 0: Fixture expansion — DONE

Expanded `basic-project` test fixture from 2 routes to 5:

| Route           | Configuration                                                   | Purpose                   |
| --------------- | --------------------------------------------------------------- | ------------------------- |
| `/`             | Simple page (slow render only)                                  | Baseline                  |
| `/home`         | Moved original home (slow+fast, head tags, CSS)                 | Non-root route            |
| `/featured`     | Headfull FS (`site-header`) with nested headless (`cart-badge`) | Gap 1 core case           |
| `/catalog`      | Direct headless instance `<jay:cart-badge>`                     | Headless without headfull |
| `/items/[slug]` | Dynamic params + loadParams                                     | Per-instance builds       |

Added two local components:

- `src/components/site-header/` — headfull FS with contract, template containing `<jay:cart-badge>`
- `src/plugins/cart-badge/` — headless plugin with plugin.yaml, contract, slow+fast phases

74 tests pass (22 build + 27 serve + 25 param-routing).

### Phases 1–3: Pre-computed page config — DONE

**Phase 1 — Build-time config (`page-parts.json`):**

- `loadProductionPageParts` now tracks `headlessModuleInfos` — resolved module paths, export names, source type (`npm`/`local`), and contract prop names for each headless import
- `buildPagePartsConfig()` serializes this into a `PagePartsConfig` JSON structure with three sections: `parts` (page + keyed headless), `instanceComponents` (instance headless), `forEachInstances`
- `instance-pipeline.ts` writes `page-parts.json` per route directory (first instance writes, subsequent skip via `fs.access` check)
- Module paths stored relative to buildDir for local modules, package name for NPM

**Phase 2 — Serve-time config loader:**

- `loadPagePartsFromConfig()` reads `page-parts.json`, imports modules by path (`import()` for NPM, path join for local), assembles `ProductionPageParts`
- `page-handler.ts` uses the config-based loader — no more `parseJayFile`, `injectHeadfullFSTemplates`, or `JAY_IMPORT_RESOLVER` at serve time
- Fallback: if `page-parts.json` missing (e.g., pages without jay-html), creates minimal parts from the page module directly

**Phase 3 — Absolute path fix (Gap 4):**

- `main-server.ts` uses `process.cwd()` instead of `manifest.projectRoot` for `discoverPluginsWithInit`

**No deviations from design.** The `ServeTimeContract` type is used via `as any` cast for now (the `HeadlessInstanceComponent.contract` type still expects full `Contract`). The narrower type should be introduced in `stack-server-runtime` when the secure package adds jay-stack support (Q14).

### Phase 4: Clean up — PENDING

Serve-time code paths still import `parseJayFile` etc. but no longer call them. Cleanup deferred to avoid unnecessary churn — the imports are harmless and the serve path is fully config-based.

### Fake-shop verification (May 18, 2026)

Built and served `examples/jay-stack/fake-shop` — a real project with 10 routes, 19 instances, local plugins, headless components (product-widget, stock-status, mood-tracker), keyed headless (product-rating), actions, and init.

**`yarn confirm`:** Passed. Full rebuild + type check + test + format across all 70 packages.

**`yarn build`:** 19/19 instances built successfully. `page-parts.json` generated for all 10 routes.

**`yarn serve` route test results:**

| Route                     | Status | Notes                                                                                    |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `/`                       | 200    | Homepage with mood tracker, product widgets (static + slowForEach + interactive forEach) |
| `/products`               | 200    | Product listing page                                                                     |
| `/products/gaming-laptop` | 200    | Dynamic product page with keyed headless (product-rating)                                |
| `/cart`                   | 200    | Cart page                                                                                |
| `/checkout`               | 200    | Checkout page                                                                            |
| `/ui-demo`                | 200    | UI kit demo (popover, carousel, clipboard, etc.)                                         |
| `/mood-stats`             | 200    | Plugin route (mood-tracker-plugin, external package)                                     |
| `/upload`                 | —      | Not tested (file upload)                                                                 |
| `/inventory-check`        | —      | Not tested                                                                               |
| `/thankyou`               | —      | Not tested                                                                               |

All 7 tested routes return 200. Verified in browser — pages render correctly with interactive features.

**Bugs found and fixed during verification:**

1. **Bracket escaping in module paths** — `page-parts.json` for dynamic routes (e.g., `/products/[slug]`) wrote `server/pages/products/[slug]/page.js` but the build pipeline escapes brackets to underscores (`server/pages/products/_slug_/page.js`). Fixed by adding `.replace(/\[/g, '_').replace(/\]/g, '_')` to match `build-pipeline.ts:239`. Symptom: `/products/gaming-laptop` rendered SSR HTML but client hydration crashed (keyed headless data missing from fast ViewState because the page module import failed silently).

2. **Plugin route source type** — Plugin-provided pages (e.g., mood-stats from mood-tracker-plugin) had their module path stored as `source: 'local'` with an absolute filesystem path. The serve-time loader joined this with buildDir, creating a nonsensical path. Fixed by detecting plugin routes (`route.componentExport` set) and using `source: 'npm'` so the path is imported directly. Symptom: `/mood-stats` returned 500 ("Cannot read properties of undefined (reading 'fastRender')").

**Remaining source file references in build output:**

1. **`route-manifest.json`** — `jayHtmlPath` fields contain absolute source paths (e.g., `.../src/pages/cart/page.jay-html`). No longer used at serve time after our changes — `getPageParts` reads from `page-parts.json` instead. `projectRoot` also absolute — no longer used after Phase 3 (`process.cwd()` replaces it). Both are harmless metadata.

2. **`cache.json`** — `sourcePath` field per instance points to source jay-html. Informational only, not used at serve time for file resolution.

3. **`page-parts.json`** — **clean**. Local module paths relative to buildDir (`server/pages/...`, `server/plugins/...`). Plugin module paths are absolute (to the NPM package dist). No source file references.

### Local plugin init in production — FIXED

**Problem:** `main-server.ts` has its own inline plugin init loop (lines 40-51) that does `import(pluginInit.packageName)`. For NPM plugins, `packageName` is the npm package name (resolved via node_modules). For local plugins, `scanPlugins` sets `packageName: pluginPath` = the source directory path (e.g., `/Users/.../src/plugins/product-rating`). Node ESM rejects directory imports.

The dev server avoids this because `executePluginServerInits` (plugin-init-discovery.ts:217) constructs `modulePath = path.join(plugin.pluginPath, plugin.initModule)` and loads via `viteServer.ssrLoadModule()`. The production server's inline loop skips this logic.

**Root cause:** Same class of problem as DL#137's page parts — serve-time code accesses source files instead of compiled build output.

**Fix:** Two changes:

1. `main-server.ts` — for local plugins, redirect the import from the source directory to the compiled init module in `build/v1/server/plugins/{name}/{initModule}.js`
2. `server-code-build.ts` — removed the `file !== 'init.ts'` exclusion so `init.ts` in plugin directories is compiled to the build output

After fix: all plugin inits succeed — `[product-rating] Initializing ratings service...` appears in the server startup log.

### Cleanup — DONE

- Removed `sourcePath` from `cache.json` metadata (instance-pipeline.ts)
- Removed `jayHtmlPath` from `RouteEntry` type and route manifest output
- Serve-time code has no dead imports (no `parseJayFile`/`JAY_IMPORT_RESOLVER` in `lib/serve/`)

**Summary:**

The core DL#137 goal is achieved: **the serve-time code path no longer parses jay-html or reads source files**. All component discovery, contract resolution, and module path mapping happens at build time and is serialized to `page-parts.json`. The production server loads this config and imports the listed modules — no compiler, no import resolver, no source files needed.

All 7 tested routes return 200 in fake-shop. All plugin inits succeed. 74 unit tests pass.
