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
    parts: DevServerPagePart[];              // page + keyed headless component definitions
    headlessContracts: HeadlessContractInfo[];// build-time only (for slowRenderTransform)
    headlessInstanceComponents: HeadlessInstanceComponent[]; // instance component definitions
    discoveredInstances: DiscoveredHeadlessInstance[];       // build-time only (for slow render)
    forEachInstances: ForEachHeadlessInstance[];             // forEach instance metadata
    keyedPartModules: KeyedPartModule[];                    // build-time only (for hydration entry)
    serverTrackByMap?: Record<string, string>;              // build-time only
    clientTrackByMap?: Record<string, string>;              // build-time only
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

## Design

### Pre-computed page config

Replace serve-time jay-html parsing with a build-time config file. The build pipeline already runs `loadProductionPageParts` to discover all components. Instead of discarding that knowledge and re-deriving it at serve time, serialize it.

#### Config schema

```ts
interface PagePartsConfig {
    /** Page component + keyed headless components */
    parts: Array<{
        modulePath: string;    // e.g., "server/pages/product/page.js" or "@wix/stores-plugin"
        exportName: string;    // e.g., "page" or "ProductCard"
        key?: string;          // keyed headless namespace
        contractInfo?: {
            contractName: string;
            metadata?: Record<string, unknown>;
        };
    }>;

    /** Instance headless components (used as <jay:xxx> tags) */
    instanceComponents: Array<{
        contractName: string;
        modulePath: string;
        exportName: string;
        propNames: string[];   // from contract.props, for forEach prop normalization
    }>;

    /** forEach headless instances */
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
async function loadPagePartsFromConfig(
    configPath: string,
    artifacts: FilesystemArtifactStore,
): Promise<ProductionPageParts> {
    const config: PagePartsConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    const parts: DevServerPagePart[] = [];
    for (const entry of config.parts) {
        const mod = entry.modulePath.startsWith('server/')
            ? await artifacts.loadPageModule(entry.modulePath)
            : await import(entry.modulePath);
        parts.push({
            compDefinition: mod[entry.exportName],
            key: entry.key,
            clientImport: '', clientPart: '',
            contractInfo: entry.contractInfo,
        });
    }

    const headlessInstanceComponents: HeadlessInstanceComponent[] = [];
    for (const entry of config.instanceComponents) {
        const mod = entry.modulePath.startsWith('server/')
            ? await artifacts.loadPageModule(entry.modulePath)
            : await import(entry.modulePath);
        headlessInstanceComponents.push({
            contractName: entry.contractName,
            compDefinition: mod[entry.exportName],
            contract: { props: entry.propNames.map(name => ({ name })) } as any,
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

| File | Change | Why |
|------|--------|-----|
| `instance-pipeline.ts` | After `loadProductionPageParts`, write `page-parts.json` | Serialize discovered config at build time |
| `load-production-parts.ts` | Add `loadPagePartsFromConfig()` function | Serve-time loader from pre-computed config |
| `page-handler.ts` | Call `loadPagePartsFromConfig()` instead of `loadProductionPageParts()` | Eliminate serve-time jay-html parsing |
| `main-server.ts` | Use `process.cwd()` instead of `manifest.projectRoot` | Fix Gap 4: absolute path in container |
| `page-handler.ts` | Use `process.cwd()` instead of `manifest.projectRoot` | Fix Gap 4 for page parts loading |
| `types.ts` | Make `projectRoot` optional in `RouteManifest` | It's no longer the source of truth |
| `artifact-store.ts` | Add `readPagePartsConfig(routeDir)` | Read page-parts.json for a route |

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
propNames: contract.props?.map(p => p.name) ?? []
```

If plugins need richer contract data at serve time (e.g., descriptions for automation), extend the config with an `effectiveContract` field per component. This is an additive change — start minimal.

### Module path resolution

At build time, `loadProductionPageParts` already resolves module paths:

- **NPM plugins:** package name (e.g., `"@wix/stores-plugin"`) — works with `import()` at serve time
- **Local components:** resolved to `build/v1/server/components/.../index.js` via the `serverBuildDir` parameter (load-production-parts.ts:86-100)

The config stores these resolved paths. At serve time, NPM modules import by package name; local modules import from the build directory.

## Implementation Plan

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

| Decision | Pro | Con |
|----------|-----|-----|
| Pre-compute config at build time | Eliminates all source file dependencies at serve time; solves Gaps 1-3 in one design | Adds a config file to the build output; build pipeline must keep it in sync |
| Minimal contract serialization (prop names only) | Tiny config, no complex serialization | If plugins need richer contract data at serve time, config must be extended |
| Per-route config (not per-instance) | Single file per route; matches current caching behavior | Assumes all instances of a route share the same component structure |
| `process.cwd()` for plugin discovery | Works in any deployment (Docker, local, CI) | Assumes project root == cwd; might need CLI flag for custom layouts |
| Keep `loadProductionPageParts` for build time | No refactor of the build pipeline; serve-time change is isolated | Two code paths for loading page parts (build-time vs serve-time) |

## Verification

1. Build a project with headfull FS components (golf: kitan-header with cart-indicator)
2. Run production server WITHOUT `src/`, WITHOUT `agent-kit/` — all routes serve correctly
3. Verify fast rendering works — headless instance data appears in SSR output
4. Verify forEach instances work — prop name normalization uses pre-computed propNames
5. Verify headfull component children of all types: nested headfull, keyed headless, instance headless
6. Verify Dockerfile needs only `COPY build/v1`, `COPY config` — no `COPY src/...` or `COPY agent-kit/...`
7. Verify no `sed` path rewriting needed in Dockerfile
8. Compare SSR output between dev server and production server for the same route — should match
