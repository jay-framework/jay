# Design Log #134c — Slow Render Server & Data Change

**Date:** May 10, 2026
**Status:** Draft
**Parent:** #134 (production build)
**Related:** #134a (build pipeline), #134b (main server), #134d (server build), #110 (slow render cache), #86 (workflow lifecycle)

## Background

The slow render server is responsible for producing the build artifacts that the main server consumes. It runs in two modes:

1. **One-shot build** (`jay-stack build`) — builds everything for a new version, then exits. Used in CI/CD pipelines and deployments.
2. **Long-running renderer** (`jay-stack serve --role=renderer`) — stays alive after the initial build, listening for data change webhooks and re-rendering affected instances.

The slow render server is the production equivalent of the dev server's `handlePreRenderRequest()` path + file watcher invalidation. The key difference: it runs the pipeline eagerly for all instances instead of lazily on first request.

## Design

### Build Mode (`jay-stack build`)

One-shot execution that produces a complete versioned bucket:

```
jay-stack build --version=2
  │
  ├── Phase 0: Shared Artifacts (DL#134a, DL#134d)
  │     ├── Scan routes + merge plugin routes
  │     ├── Compile server code (Vite SSR build)
  │     ├── Build shared client chunks
  │     └── Discover all param combinations (loadParams)
  │
  ├── Phase 1: Per-Instance Pipeline (concurrent)
  │     For each (route, params):
  │       ├── Slow render → pre-rendered jay-html
  │       ├── Compile server element (esbuild)
  │       ├── Generate hydration entry
  │       └── Per-instance Vite build
  │
  ├── Phase 2: Finalize
  │     ├── Write route-manifest.json
  │     └── Write build-metadata.json
  │
  └── Exit
```

Output: `build/v2/` — a complete, self-contained bucket ready for deployment.

The version number is provided as a CLI argument or derived automatically (git commit hash, CI build number, incrementing counter). The build metadata records:

```typescript
interface BuildMetadata {
  version: string;
  sourceHash: string;          // Hash of source files at build time
  buildTimestamp: string;
  nodeVersion: string;
  instanceCount: number;
}
```

### Renderer Mode (`jay-stack serve --role=renderer`)

Long-running process that:
1. On startup, verifies/builds the current version bucket
2. Listens for data change webhooks
3. Re-renders affected instances on data change

```
jay-stack serve --role=renderer --version=2
  │
  ├── Startup
  │     ├── Check build-metadata.json in build/v2/
  │     ├── If source hash matches → skip rebuild, artifacts valid
  │     ├── If source hash differs → full rebuild (Phase 0 + 1 + 2)
  │     └── Initialize services (same as main server)
  │
  ├── Start HTTP Server (webhook endpoints)
  │     ├── POST /_jay/webhooks/:pluginName → data change handler
  │     ├── POST /_jay/render/:route → manual re-render trigger
  │     └── GET  /_jay/status → health check + build info
  │
  └── Listen for webhooks...
```

### Data Change Flow

```
External system (CMS, database, etc.)
  │
  ├── Sends webhook to slow render server
  │   POST /_jay/webhooks/wix-stores
  │   Body: { "type": "product.updated", "itemId": "prod-123" }
  │
  ├── Plugin webhook handler resolves:
  │   itemId "prod-123" → contract "product-page" + params { slug: "blue-widget" }
  │
  ├── Slow render server finds affected instances:
  │   Route /products/[slug], instance with params { slug: "blue-widget" }
  │
  ├── Re-runs per-instance pipeline for affected instance:
  │   1. Slow render (with fresh data from plugin service)
  │   2. Compare new pre-rendered jay-html with existing
  │   3. If unchanged → skip remaining steps
  │   4. If changed → compile server element + hydration entry + Vite build
  │   5. Update route-manifest.json with new artifact paths
  │
  └── Main server picks up changes on next request
      (timestamp-based caching detects file changes)
```

### Plugin Webhook Handler

Plugins register webhook handlers that know how to resolve external change events to Jay routes:

```typescript
interface PluginWebhookHandler {
  pluginName: string;
  handleWebhook(event: WebhookEvent): Promise<InvalidationResult>;
}

interface WebhookEvent {
  type: string;                              // e.g., "product.updated"
  itemId: string;                            // External system's item ID
  payload?: Record<string, unknown>;         // Optional additional data
}

interface InvalidationResult {
  affectedInstances: AffectedInstance[];
}

interface AffectedInstance {
  contractName: string;                      // e.g., "product-page"
  params: Record<string, string>;            // e.g., { slug: "blue-widget" }
}
```

The plugin resolves the external item ID to Jay-level concepts (contract name + params). The slow render server then maps those to actual route instances in the manifest.

**Plugin.yaml extension:**

```yaml
name: wix-stores
webhook:
  handler: ./webhook-handler.js
  events:
    - product.updated
    - product.created
    - product.deleted
```

### Resolving Affected Routes

Given an `InvalidationResult` from a plugin, the slow render server finds which instances to re-render:

```typescript
function findAffectedInstances(
  manifest: RouteManifest,
  invalidation: InvalidationResult,
): Array<{ route: RouteEntry; instance: InstanceEntry }> {
  const affected = [];
  for (const { contractName, params } of invalidation.affectedInstances) {
    for (const route of manifest.routes) {
      // Check if this route uses the affected contract
      if (!routeUsesContract(route, contractName)) continue;
      // Find the instance with matching params
      const instance = route.instances.find(i => paramsMatch(i.params, params));
      if (instance) {
        affected.push({ route, instance });
      }
    }
  }
  return affected;
}
```

### New Instance Creation (e.g., new product)

When a plugin reports a new item (e.g., `product.created`), the plugin resolves it to params that don't yet have an instance. The slow render server:

1. Runs `loadParams` for the affected route to discover the new param combination
2. Runs the full per-instance pipeline (slow render → compile → Vite build)
3. Adds the new instance to the route manifest
4. Main server picks up the new instance on next manifest read

```typescript
async function handleNewInstance(
  route: RouteEntry,
  params: Record<string, string>,
  buildContext: BuildContext,
): Promise<InstanceEntry> {
  // Run the per-instance pipeline
  const instance = await buildInstance(route, params, buildContext);
  
  // Update manifest
  route.instances.push(instance);
  await writeManifest(buildContext.manifest, buildContext.buildDir);
  
  return instance;
}
```

### Instance Deletion (e.g., product removed)

When a plugin reports a deleted item:

1. Remove the instance from the route manifest
2. Optionally clean up artifact files (or leave for next full build)
3. Main server returns 404 for deleted params on next manifest read

### Optimistic Skip: Compare Pre-rendered Output

After re-running slow render, compare the new pre-rendered jay-html with the existing one. If they're identical (data didn't actually change, or changes don't affect the template), skip server element compilation and Vite build:

```typescript
const newPreRendered = await preRenderJayHtml(jayHtml, slowViewState);
const existingContent = await fs.readFile(instance.preRenderedPath, 'utf-8');

if (stripCacheMetadata(newPreRendered) === stripCacheMetadata(existingContent)) {
  // No structural change — skip compilation
  // Still update cache metadata (new slowViewState/carryForward)
  return;
}

// Structure changed — full rebuild of this instance
await compileServerElement(newPreRendered, ...);
await buildHydrationEntry(newPreRendered, ...);
await viteBuiltInstance(hydrateEntry, ...);
```

This is important because many data changes don't affect template structure (e.g., price change updates ViewState but doesn't toggle a slow conditional).

### Startup Validation

On renderer startup, check if existing artifacts are valid:

```typescript
async function validateExistingBuild(
  buildDir: string,
  sourceHash: string,
): Promise<'valid' | 'stale' | 'missing'> {
  const metadataPath = path.join(buildDir, 'build-metadata.json');
  
  try {
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    if (metadata.sourceHash === sourceHash) {
      return 'valid';  // Same code → artifacts are good
    }
    return 'stale';    // Code changed → need full rebuild
  } catch {
    return 'missing';  // No build exists
  }
}
```

Source hash is computed from source files that affect the build:
- `src/pages/**/*.ts`, `src/pages/**/*.jay-html`, `src/pages/**/*.jay-contract`
- `src/actions/**/*.ts`
- `src/lib/init.ts`
- `package.json` (dependency versions)

### Concurrency and Load Management

The per-instance pipeline is CPU-intensive (slow render calls external APIs, esbuild compiles TS, Vite bundles JS). The renderer controls concurrency:

```typescript
const CONCURRENCY = parseInt(process.env.JAY_BUILD_CONCURRENCY || '4');

async function buildAllInstances(
  routes: RouteEntry[],
  buildContext: BuildContext,
): Promise<void> {
  const allInstances = routes.flatMap(route =>
    route.paramCombinations.map(params => ({ route, params }))
  );

  // Bounded concurrency — process N instances at a time
  const queue = [...allInstances];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await buildInstance(item.route, item.params, buildContext);
    }
  });
  await Promise.all(workers);
}
```

For data change re-renders, the concurrency is typically 1 (single instance rebuild), but batch webhooks (many products updated at once) benefit from parallelism.

### Manifest Updates During Data Changes

When the slow render server updates instance artifacts, it must also update the route manifest. Since the main server reads the manifest per-request (with timestamp caching), the update must be atomic:

```typescript
async function updateManifest(
  manifestPath: string,
  updater: (manifest: RouteManifest) => void,
): Promise<void> {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  updater(manifest);
  // Write to temp file, then atomic rename
  const tempPath = manifestPath + '.tmp';
  await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2));
  await fs.rename(tempPath, manifestPath);
}
```

### Service Initialization

The slow render server needs services to call `slowlyRender()` (plugins query external APIs). Service initialization follows the same pattern as the main server (DL#134d):

```typescript
// Same init as main server — plugins sorted topologically, services registered
await initializeProductionServer(buildDir, manifest);
```

Both servers initialize services independently. Since services are stateless (DL#134 Q14), this is fine — each server gets its own API client instances, database connections, etc.

### Renderer HTTP API

```
POST /_jay/webhooks/:pluginName
  Body: WebhookEvent
  Response: { affected: number, rebuilt: number, skipped: number }

POST /_jay/render/:routePattern
  Body: { params?: Record<string, string> }
  Response: { rebuilt: number }
  Purpose: Manual re-render trigger (CI, admin, debugging)

POST /_jay/render-all
  Response: { total: number, rebuilt: number, skipped: number }
  Purpose: Force full re-render of all instances

GET /_jay/status
  Response: {
    version: string,
    buildTimestamp: string,
    instanceCount: number,
    uptime: number,
    lastWebhook?: { pluginName: string, timestamp: string, affected: number }
  }
```

### Relationship Between Build and Serve Modes

```
jay-stack build --version=2
  → Runs Phase 0 + Phase 1 + Phase 2
  → Exits
  → Deploy main server with JAY_BUILD_VERSION=2

jay-stack serve --role=renderer --version=2
  → On startup: validates build/v2/ (rebuilds if stale)
  → Stays alive, listens for webhooks
  → Re-renders affected instances on data change
  → Main server (same version) picks up changes via timestamp caching
```

Both use the same build pipeline code. The difference:
- `build` runs once and exits
- `renderer` runs once, then keeps running for incremental updates

## Implementation Plan

### Step 1: Build Orchestrator

Create `buildVersion(version, options)`:
- Wire Phase 0 → Phase 1 → Phase 2 from DL#134a
- Bounded concurrency for per-instance pipeline
- Progress reporting (instance N/M built)
- Write build-metadata.json

### Step 2: CLI Commands

Add to `stack-cli`:
- `jay-stack build --version=N` — one-shot build
- `jay-stack serve --role=renderer --version=N` — long-running renderer

### Step 3: Startup Validation

Implement `validateExistingBuild()`:
- Source hash computation
- Build metadata comparison
- Decision: rebuild / skip / partial

### Step 4: Webhook HTTP Server

Create webhook endpoint handler:
- Route `POST /_jay/webhooks/:pluginName`
- Load plugin webhook handler
- Execute resolution
- Trigger per-instance rebuild

### Step 5: Plugin Webhook Handler Interface

Define `PluginWebhookHandler` interface and `plugin.yaml` extension:
- Plugin resolves item ID → contract + params
- Slow render server maps to route instances

### Step 6: Incremental Instance Rebuild

Implement single-instance re-render:
- Slow render with fresh data
- Optimistic skip (compare pre-rendered output)
- Compile + Vite build if changed
- Atomic manifest update

### Step 7: New/Deleted Instance Handling

Handle `product.created` and `product.deleted`:
- Run loadParams for new params discovery
- Add/remove instance from manifest
- Build new instance artifacts

## Questions

**Q1: Should the renderer authenticate webhook requests?**

Yes. Webhooks from external systems should be authenticated (shared secret, HMAC signature, or API key). The renderer should reject unauthenticated webhook requests. Authentication details are plugin-specific — each plugin defines how its webhook is authenticated.

**Q2: Should the renderer batch rapid webhook events?**

If multiple webhooks arrive in quick succession for different instances of the same route, it's efficient to batch them into a single Vite build (per-route batching from DL#134a). A short debounce window (e.g., 1-2 seconds) could accumulate events before triggering the rebuild.

**Q3: Should the renderer notify the main server after rebuilding?**

Not required — the main server's timestamp-based caching detects file changes naturally. But an optional notification endpoint on the main server could warm caches proactively, improving latency for the first request after a data change.

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| Optimistic skip (compare output) | Avoids unnecessary compilation when data changes don't affect template structure | Extra comparison step; must read existing file |
| Bounded concurrency for builds | Predictable resource usage; doesn't overwhelm external APIs or CPU | Slower than unbounded parallelism for small builds |
| Plugin-owned webhook resolution | Plugins know their data model; framework stays generic | Each plugin must implement webhook handler; no default behavior |
| Atomic manifest updates | Main server never reads a partial manifest | Extra write (temp file + rename) |
| Source hash for startup validation | Fast rebuild skip when code unchanged; reliable staleness detection | Hash computation adds startup time; must include all relevant source files |

## Verification Criteria

1. `jay-stack build` produces a complete versioned bucket
2. `jay-stack serve --role=renderer` starts and validates existing build
3. Same-version restart skips rebuild
4. Webhook triggers re-render of affected instances only
5. Optimistic skip avoids unnecessary compilation
6. New instance creation adds to manifest correctly
7. Instance deletion removes from manifest correctly
8. Manifest updates are atomic (no partial reads)
9. Build concurrency stays within configured bounds
10. Renderer health endpoint reports accurate status
