# DL#143: Artifact Store Abstraction for BaaS Deployment

## Background

The production server (DL#134b, DL#139) uses `FilesystemArtifactStore` to read build artifacts — manifests, pre-rendered HTML, server elements, page modules. The fetch handler (`createJayFetchHandler` in `@jay-framework/jay-fetch-handler`) creates this store from a `backendDir` path and passes it through the serve pipeline.

For Wix BaaS deployment, the entry file (`entry.mjs`) runs in a container where backend files are not on the local filesystem — they're stored in Wix data collections and fetched on demand, cached to `/tmp`. The current architecture assumes filesystem everywhere: `fs.readFile`, `fs.stat` for mtime, `import()` with filesystem paths.

See Wix design log #21 (baas-entry-framework-requirements) for the full requirements from the Wix side.

## Problem

Six filesystem assumptions block BaaS deployment:

1. `FilesystemArtifactStore` is a concrete class, not an interface — serve functions type it concretely
2. `createJayFetchHandler` creates the store internally from `backendDir` — no way to inject a custom store
3. `production-server` exports build-time dependencies (Vite, compilers) alongside serve functions — bundling pulls in 50+ MB of unnecessary code
4. `initializeServices` discovers init modules from filesystem paths (`buildDir/server/plugins/...`)
5. `registerActionsFromManifest` imports action modules from filesystem paths (`buildDir/serverModule`)
6. `loadPagePartsFromConfig` reads `page-parts.json` and imports modules from filesystem paths

## Design

### 1. ArtifactStore interface

Extract from `FilesystemArtifactStore`:

```typescript
// production-server/lib/serve/artifact-store.ts
export interface ArtifactStore {
    readManifest(): Promise<RouteManifest>;
    readPreRenderedHtml(relativePath: string): Promise<PreRenderedEntry>;
    loadServerElement(relativePath: string): Promise<ServerElementModule>;
    getAssetPath(relativePath: string): string;
    getBuildDir(): string;
}

export class FilesystemArtifactStore implements ArtifactStore {
    // Existing implementation unchanged
    // loadPageModule and readRawFile removed — unused by the serve pipeline
}
```

Update `fetchPageRequest` and `getPageParts` to accept `ArtifactStore` (the interface) instead of `FilesystemArtifactStore` (the class):

```typescript
export async function fetchPageRequest(
    match: MatchResult,
    manifest: RouteManifest,
    requestUrl: URL,
    artifacts: ArtifactStore,        // ← interface, not class
    staticBaseUrl: string,
    cookies?: Record<string, string>,
): Promise<Response>
```

### 2. createJayFetchHandler accepts custom ArtifactStore

```typescript
export interface JayFetchHandlerOptions {
    // Option A: filesystem (existing)
    backendDir?: string;
    // Option B: custom store (new)
    artifactStore?: ArtifactStore;

    staticBaseUrl?: string;
    frontendDir?: string;
}
```

When `artifactStore` is provided, use it directly. When `backendDir` is provided, create `FilesystemArtifactStore` as before. Exactly one must be present.

### 3. Serve-only export

Add a `/serve` entry point to production-server that re-exports only serve functions — no build-time dependencies:

```json
// production-server/package.json exports
{
    ".": "./dist/index.js",
    "./serve": "./dist/serve.js"
}
```

**`lib/serve-index.ts`** (new entry point):
```typescript
export type { ArtifactStore } from './serve/artifact-store';
export { FilesystemArtifactStore } from './serve/artifact-store';
export { fetchPageRequest } from './serve/fetch-page-handler';
export { fetchActionRequest, isActionRequest, registerActionsFromManifest } from './serve/fetch-action-handler';
export { fetchStaticFile } from './serve/fetch-static-handler';
export { matchRequest } from './serve/route-matcher';
export { initializeServices } from './shared/init-services';
export type { RouteManifest, RouteEntry, InstanceEntry, PreRenderedEntry, ServerElementModule, PageModule, MatchResult } from './types';
```

This pulls in only runtime dependencies (`logger`, `stack-server-runtime`, `ssr-runtime`, `view-state-merge`). No `vite`, `compiler-*`, or `vite-plugin`.

Then `jay-fetch-handler` imports from `@jay-framework/production-server/serve` instead of `@jay-framework/production-server`.

### 4. initializeServicesFromModules

New function that accepts pre-imported init modules instead of discovering them from the filesystem:

```typescript
// production-server/lib/shared/init-services.ts
export interface PreImportedPlugin {
    name: string;
    init: JayInit<any>;
}

export async function initializeServicesFromModules(
    plugins: PreImportedPlugin[],
    label: string,
): Promise<void> {
    const logger = getLogger();
    for (const plugin of plugins) {
        try {
            const services = plugin.init.build();
            for (const { marker, factory } of services) {
                const instance = await factory();
                registerService(marker, instance);
            }
            logger.info(`[${plugin.name}] ${label} initialization complete`);
        } catch (err: any) {
            logger.warn(`[${plugin.name}] ${label} init failed: ${err.message}`);
        }
    }
}
```

The existing `initializeServices(buildDir, projectRoot, label)` stays unchanged for self-hosted deployments.

### 5. registerActionsFromModules

New function that accepts pre-imported action modules:

```typescript
// production-server/lib/serve/fetch-action-handler.ts
export async function registerActionsFromModules(
    modules: Array<{ module: Record<string, unknown>; name: string }>,
    registry: ActionRegistry = actionRegistry,
): Promise<void> {
    for (const { module, name } of modules) {
        for (const [exportName, exported] of Object.entries(module)) {
            if (isJayAction(exported)) {
                registry.register(exported);
            } else if (isJayStreamAction(exported)) {
                registry.registerStream(exported);
            }
        }
    }
}
```

### 6. createJayFetchHandler with all options

```typescript
export interface JayFetchHandlerOptions {
    // Artifact source (one required)
    backendDir?: string;
    artifactStore?: ArtifactStore;

    // Static assets
    staticBaseUrl?: string;
    frontendDir?: string;

    // Pre-imported modules (for bundled entry.mjs)
    plugins?: PreImportedPlugin[];
    actionModules?: Array<{ module: Record<string, unknown>; name: string }>;
}

export function createJayFetchHandler(
    options: JayFetchHandlerOptions,
): (request: Request) => Promise<Response> {
    const store = options.artifactStore
        ?? new FilesystemArtifactStore(options.backendDir!);

    return async (request: Request): Promise<Response> => {
        if (!initialized) {
            const manifest = await store.readManifest();
            
            if (options.plugins) {
                await initializeServicesFromModules(options.plugins, 'FetchHandler');
            } else if (options.backendDir) {
                await initializeServices(options.backendDir, process.cwd(), 'FetchHandler');
            }

            if (options.actionModules) {
                await registerActionsFromModules(options.actionModules);
            } else if (manifest.actions.length > 0 && options.backendDir) {
                await registerActionsFromManifest(manifest.actions, options.backendDir);
            }
            
            initialized = true;
        }
        // ... rest of handler
    };
}
```

### 7. loadPagePartsFromConfig with ArtifactStore

Currently `loadPagePartsFromConfig(configPath, buildDir)` reads a JSON file and uses `import()` with filesystem paths. For BaaS, modules are already bundled — the page-parts config needs a way to resolve modules without filesystem paths.

Two approaches:

**A. ArtifactStore handles module loading:**
```typescript
export async function loadPagePartsFromConfig(
    configPath: string,
    artifacts: ArtifactStore,
): Promise<ProductionPageParts>
```

The store's `loadPageModule` resolves the path — for filesystem it's `import(path.join(buildDir, modulePath))`, for BaaS it's `import('/tmp/cache/' + modulePath)` or a pre-loaded module.

**B. Pre-loaded page parts (bundled entry):**
For the BaaS case, the entry.mjs bundles all page modules. The page-parts config maps to pre-imported modules by name rather than loading at runtime.

Approach A is cleaner — it keeps the loading strategy in the store where it belongs.

## Implementation Plan

### Phase 1: ArtifactStore interface

**`production-server/lib/serve/artifact-store.ts`**:
1. Extract `ArtifactStore` interface from existing class methods
2. `FilesystemArtifactStore implements ArtifactStore`
3. Export interface and class

**`production-server/lib/serve/fetch-page-handler.ts`**:
4. Change parameter type from `FilesystemArtifactStore` to `ArtifactStore`

**`production-server/lib/index.ts`**:
5. Export `ArtifactStore` interface

### Phase 2: createJayFetchHandler accepts custom store

**`jay-fetch-handler/lib/index.ts`**:
1. Add `artifactStore?` to options interface
2. Use provided store or create `FilesystemArtifactStore` from `backendDir`
3. Export `ArtifactStore` type for consumer convenience

### Phase 3: Pre-imported modules

**`production-server/lib/shared/init-services.ts`**:
1. Add `PreImportedPlugin` interface
2. Add `initializeServicesFromModules` function

**`production-server/lib/serve/fetch-action-handler.ts`**:
3. Add `registerActionsFromModules` function

**`jay-fetch-handler/lib/index.ts`**:
4. Add `plugins` and `actionModules` to options
5. Use pre-imported modules when provided, fall back to filesystem discovery

### Phase 4: Serve-only export

**`production-server/lib/serve-index.ts`** (new):
1. Re-export only serve functions and types (no build deps)

**`production-server/package.json`**:
2. Add `"./serve"` to exports map
3. Add `serve-index.ts` to tsup entry points

**`production-server/tsconfig.json`** and build config:
4. Ensure `/serve` entry is built separately

### Phase 5: loadPagePartsFromConfig with ArtifactStore

**`production-server/lib/builder/load-production-parts.ts`**:
1. Accept `ArtifactStore` instead of raw `buildDir` string
2. Use `artifacts.loadPageModule()` for module loading
3. Use `artifacts.readRawFile()` for config file reading

### Phase 6: Tests

1. Test `ArtifactStore` interface compliance with `FilesystemArtifactStore`
2. Test `createJayFetchHandler` with custom artifact store (mock)
3. Test `initializeServicesFromModules` with pre-imported init modules
4. Test `registerActionsFromModules` with pre-imported action modules
5. Verify `/serve` export doesn't pull in build deps (bundle size check)
6. Run existing production-server tests for regressions
7. Run smoke-test project (DL#140) in all modes

## Examples

### Self-hosted (unchanged)

```typescript
const handler = createJayFetchHandler({
    backendDir: './build/v1/backend',
    staticBaseUrl: '/',
    frontendDir: './build/v1/frontend',
});
```

### BaaS with custom store

```typescript
import { createJayFetchHandler } from '@jay-framework/jay-fetch-handler';
import { WixDataArtifactStore } from '@jay-framework/wix-baas-adapter';
import { init as wixStoresInit } from '@jay-framework/wix-stores';
import * as wixStoresModule from '@jay-framework/wix-stores';

const handler = createJayFetchHandler({
    artifactStore: new WixDataArtifactStore({
        collectionId: 'jay-backend-files',
        cacheDir: '/tmp/jay-backend',
    }),
    staticBaseUrl: 'https://static.parastorage.com/services/my-app/1.0.0/',
    plugins: [
        { name: 'wix-stores', init: wixStoresInit },
    ],
    actionModules: [
        { module: wixStoresModule, name: 'wix-stores' },
    ],
});

export default { fetch: handler };
```

## Trade-offs

| Aspect | Benefit | Cost |
|--------|---------|------|
| ArtifactStore interface | Clean abstraction, any backend storage | One more interface to maintain |
| `/serve` export | No build deps in BaaS entry, small bundle | Two entry points to maintain |
| Pre-imported modules | esbuild can bundle everything, no runtime discovery | Must list plugins explicitly |
| Keeping filesystem as default | Zero breaking changes for self-hosted | Two code paths to maintain |
| loadPageParts via ArtifactStore | Single abstraction for all file access | Slightly more indirection for local deployments |

## Verification Criteria

1. Existing self-hosted deployment works identically (no breaking changes)
2. `createJayFetchHandler({ artifactStore })` works with a mock store
3. `initializeServicesFromModules` registers services without filesystem
4. `registerActionsFromModules` registers actions without filesystem
5. `@jay-framework/production-server/serve` import does not pull in Vite or compiler packages
6. Smoke-test project (DL#140) passes in all modes
7. A mock BaaS entry.mjs can be bundled with esbuild without stubs for build-time deps
