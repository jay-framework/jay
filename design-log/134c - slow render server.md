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
  sourceHash: string; // Hash of source files at build time
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
  │   POST /_jay/webhooks/wix-stores.product-change
  │   Body: { "type": "product.updated", "itemId": "prod-123" }
  │
  ├── Plugin webhook handler (makeWebhook) executes:
  │   1. Parses event, resolves itemId to slug
  │   2. Calls invalidate('product-page', { slug: 'blue-widget' })
  │      (plugin invalidates by its own contract name, not route)
  │
  ├── Framework resolves contract → routes:
  │   Finds all routes using the 'product-page' contract
  │   (could be /products/[slug], /shop/[id], etc.)
  │
  ├── Framework invalidation runs per-instance pipeline:
  │   1. Slow render (with fresh data from plugin service)
  │   2. Compare new pre-rendered jay-html with existing
  │   3. If unchanged → skip remaining steps
  │   4. If changed → compile server element + hydration entry + Vite build
  │   5. Atomic update of route-manifest.json
  │
  └── Main server picks up changes on next request
      (timestamp-based caching detects file changes)
```

### Plugin Webhook Registration

Plugins register webhooks using a builder pattern similar to `makeJayAction`:

```typescript
// In plugin's actions or init file
import { makeWebhook, type InvalidateContract } from '@jay-framework/fullstack-component';

export const onProductChange = makeWebhook(
  'wix-stores.product-change',
  async (req: HttpRequest, invalidate: InvalidateContract): Promise<HttpResponse> => {
    const event = await req.json();
    const { type, itemId } = event;
    const slug = await resolveProductSlug(itemId);

    // Re-render pages using 'product-page' contract with this specific slug
    await invalidate('product-page', { slug });

    // Re-render all pages using 'search-results' contract
    // (any product change could affect search results)
    await invalidate('search-results');

    return { status: 200, body: { ok: true } };
  },
);
```

The `invalidate` API is contract-based — plugins invalidate by their own contract name, not by route patterns. The framework resolves which routes use each contract.

```typescript
type InvalidateContract = (contractName: string, params?: Record<string, string>) => Promise<void>;
```

- `invalidate('product-page', { slug: 'blue-widget' })` — find all routes using the `product-page` contract, re-render the instance with matching params. If no instance exists (new product), build a new one.
- `invalidate('search-results')` — find all routes using the `search-results` contract, re-render **all instances** of those routes.

**Why contract-based, not route-based:** A plugin defines contracts, not routes. The plugin `wix-stores` knows it provides the `product-page` contract, but doesn't know (and shouldn't know) that the project mapped it to `/products/[slug]` or `/shop/[id]`. The framework knows the mapping because the route manifest tracks which contracts each route uses.

**Future: reverse dependency map.** A more fine-grained approach would track which data items each instance depends on during slow render (e.g., instance `/search?q=shoes` consumed products A, B, C). On product A change, only instances that consumed product A are re-rendered. This is an optimization that can be added later without changing the `invalidate` API — it would refine the paramless `invalidate('search-results')` to only rebuild affected instances instead of all.

Webhooks are automatically exposed at `/_jay/webhooks/{webhookName}`:

- `POST /_jay/webhooks/wix-stores.product-change` → calls `onProductChange`

Discovery works the same as actions — scan exports for `JayWebhook`-branded constants, register at startup. The webhook is a server-only construct (no client transform needed).

### Invalidation Implementation

The `invalidate` function provided to webhook handlers enqueues rebuild requests rather than rebuilding directly. The webhook returns immediately; rebuilds happen asynchronously via the invalidation queue:

```typescript
function createInvalidator(
  queue: InvalidationQueue,
  manifest: RouteManifest,
  webhookName: string,
): InvalidateContract {
  return async (contractName: string, params?: Record<string, string>) => {
    // Resolve contract → affected routes
    const affectedRoutes = manifest.routes.filter((r) => r.contracts?.includes(contractName));
    for (const route of affectedRoutes) {
      await queue.enqueue({
        routePattern: route.pattern,
        params,
        source: webhookName,
        timestamp: Date.now(),
      });
    }
  };
}
```

The framework resolves `contractName` to routes using the `contracts` field in each `RouteEntry`. This field is populated during the build by scanning which contracts each page's jay-html references (headless component tags, keyed components).

**Specific instance invalidation** (`invalidate('product-page', { slug: 'blue-widget' })`):

```typescript
async function rebuildInstance(
  route: RouteEntry,
  params: Record<string, string>,
  ctx: BuildContext,
): Promise<void> {
  const existing = route.instances.find((i) => paramsMatch(i.params, params));

  // Run per-instance pipeline (slow render → compare → compile if changed)
  const result = await buildInstance(route, params, ctx);

  if (existing) {
    // Update existing instance in manifest
    Object.assign(existing, result);
  } else {
    // New instance (e.g., new product) — add to manifest
    route.instances.push(result);
  }

  await atomicManifestUpdate(ctx);
}
```

**Full contract invalidation** (`invalidate('search-results')` — no params):

```typescript
async function rebuildRoute(route: RouteEntry, ctx: BuildContext): Promise<void> {
  // Re-run loadParams to discover current param combinations
  const pageModule = await ctx.artifacts.loadPageModule(route.serverModule);
  const currentParams = await collectLoadParams(pageModule);

  // Find new, existing, and deleted instances
  const existingParams = new Set(route.instances.map((i) => paramKey(i.params)));
  const currentParamSet = new Set(currentParams.map((p) => paramKey(p)));

  // Rebuild existing + new instances
  for (const params of currentParams) {
    await rebuildInstance(route, params, ctx);
  }

  // Remove deleted instances
  route.instances = route.instances.filter((i) => currentParamSet.has(paramKey(i.params)));

  await atomicManifestUpdate(ctx);
}
```

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
      return 'valid'; // Same code → artifacts are good
    }
    return 'stale'; // Code changed → need full rebuild
  } catch {
    return 'missing'; // No build exists
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

async function buildAllInstances(routes: RouteEntry[], buildContext: BuildContext): Promise<void> {
  const allInstances = routes.flatMap((route) =>
    route.paramCombinations.map((params) => ({ route, params })),
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

### Error Handling During Data Changes

If a re-render fails (slow render throws, Vite build fails, etc.), the slow render server:

1. **Keeps existing artifacts** — the previous working version of the instance remains on disk
2. **Does not update the manifest** — the main server continues serving the old instance
3. **Returns error in webhook response** — `{ affected: 1, rebuilt: 0, errors: [{ params: {...}, error: "..." }] }`
4. **Logs the error** for monitoring/alerting

This is safe because each instance is rebuilt independently. A failed rebuild of one instance doesn't affect other instances or the overall manifest.

### Invalidation Queue

Webhook handlers don't rebuild directly — they enqueue invalidation requests. A worker pool drains the queue with bounded concurrency:

```typescript
// Queue operates on routes (contract → route resolution happens in createInvalidator)
interface InvalidationRequest {
  routePattern: string;
  params?: Record<string, string>; // undefined = all instances
  source: string; // webhook name, for logging
  timestamp: number;
}

interface InvalidationQueue {
  enqueue(request: InvalidationRequest): Promise<void>;
  drain(): AsyncIterable<InvalidationRequest>;
  depth(): number;
}
```

The queue provides:

- **Deduplication** — multiple invalidations for the same route+params within a short window collapse into one rebuild
- **Bounded concurrency** — N workers process queue items in parallel (configurable via `JAY_BUILD_CONCURRENCY`)
- **Serialization per route** — items for the same route are processed sequentially (prevents half-written artifacts)
- **Backpressure** — webhooks return immediately after enqueue; rebuild happens asynchronously

```typescript
class InMemoryInvalidationQueue implements InvalidationQueue {
  private pending = new Map<string, InvalidationRequest>(); // key = route+params
  private processing = new Set<string>(); // routes currently rebuilding
  private signal = new EventEmitter();

  async enqueue(request: InvalidationRequest) {
    const key = request.params
      ? `${request.routePattern}:${paramKey(request.params)}`
      : request.routePattern;

    // Dedup: newer request replaces older for same key
    this.pending.set(key, request);
    this.signal.emit('enqueued');
  }

  depth() {
    return this.pending.size;
  }
}
```

**Initial implementation:** In-memory queue (simple, no external dependencies). The queue interface is pluggable — can be swapped for a disk-based queue (survives restarts) or an infrastructure queue (Redis, SQS) for distributed renderer deployments.

**Worker loop:**

```typescript
async function startWorkers(queue: InvalidationQueue, ctx: BuildContext) {
  const concurrency = parseInt(process.env.JAY_BUILD_CONCURRENCY || '4');

  for (let i = 0; i < concurrency; i++) {
    (async () => {
      for await (const request of queue.drain()) {
        try {
          if (request.params) {
            await rebuildInstance(findRoute(request.routePattern), request.params, ctx);
          } else {
            await rebuildRoute(findRoute(request.routePattern), ctx);
          }
        } catch (err) {
          // Error handling: log, keep existing artifacts, continue draining
          logger.error(`Rebuild failed: ${request.routePattern}`, err);
        }
      }
    })();
  }
}
```

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
POST /_jay/webhooks/:webhookName
  Body: (plugin-defined, passed as HttpRequest)
  Response: (plugin-defined HttpResponse, plus rebuild stats in headers)

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
    queueDepth: number,
    lastWebhook?: { webhookName: string, timestamp: string }
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

### Step 4: `makeWebhook` Builder

Create `makeWebhook(name, handler)` in `fullstack-component`:

- Similar pattern to `makeJayAction`
- Handler receives `(req: HttpRequest, invalidate: InvalidateRoute)`
- Returns branded `JayWebhook` constant
- Discovery via export scanning (same as actions)

### Step 5: Webhook HTTP Server

Create webhook endpoint routing:

- Route `POST /_jay/webhooks/:webhookName`
- Load registered webhook handler
- Inject `invalidate` function
- Execute handler, return response

### Step 6: Invalidation Engine

Implement `invalidate(routePattern, params?)`:

- With params: rebuild specific instance (slow render → compare → compile if changed)
- Without params: re-run loadParams, rebuild all instances, remove deleted
- Atomic manifest update after each invalidation

### Step 7: Incremental Instance Rebuild

Implement `buildInstance` with optimistic skip:

- Slow render with fresh data
- Compare pre-rendered output with existing
- Skip compilation if unchanged
- Full pipeline if changed

## Questions

**Q1: Should the renderer authenticate webhook requests?**

Yes. Webhooks from external systems should be authenticated (shared secret, HMAC signature, or API key). The renderer should reject unauthenticated webhook requests. Authentication details are plugin-specific — each plugin defines how its webhook is authenticated.

**Q2: Should the renderer batch rapid webhook events?**

If multiple webhooks arrive in quick succession for different instances of the same route, it's efficient to batch them into a single Vite build (per-route batching from DL#134a). A short debounce window (e.g., 1-2 seconds) could accumulate events before triggering the rebuild.

**Q3: Should the renderer notify the main server after rebuilding?**

Not required — the main server's timestamp-based caching detects file changes naturally. But an optional notification endpoint on the main server could warm caches proactively, improving latency for the first request after a data change.

## Trade-offs

| Decision                             | Pro                                                                                                | Con                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Optimistic skip (compare output)     | Avoids unnecessary compilation when data changes don't affect template structure                   | Extra comparison step; must read existing file                             |
| Bounded concurrency for builds       | Predictable resource usage; doesn't overwhelm external APIs or CPU                                 | Slower than unbounded parallelism for small builds                         |
| `makeWebhook` pattern (like actions) | Consistent with existing patterns; webhook logic in code not config; plugins own their data model  | Each plugin must implement webhook handler; no default behavior            |
| Contract-based `invalidate` API      | Plugin only knows its own contracts; framework resolves to routes; project can remap routes freely | Route manifest must track which contracts each route uses                  |
| Atomic manifest updates              | Main server never reads a partial manifest                                                         | Extra write (temp file + rename)                                           |
| Source hash for startup validation   | Fast rebuild skip when code unchanged; reliable staleness detection                                | Hash computation adds startup time; must include all relevant source files |

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

## Implementation Results

### Implemented (May 18, 2026)

**`makeWebhook` builder** (`full-stack-component/lib/jay-webhook-builder.ts`):

- Builder pattern matching `makeJayAction`: `makeWebhook(name).withServices(...).withHandler(fn)`
- Handler receives `(event: WebhookEvent, invalidate: InvalidateContract, ...services)`
- `isJayWebhook` type guard for discovery
- 5 tests passing

**Contracts field population** (`builder/instance-pipeline.ts`):

- `RouteEntry.contracts` populated during build from headless component contract names
- Collected from `pageParts.headlessInstanceComponents` and `pageParts.parts[].contractInfo`
- 5 tests verifying contract population and contract→route resolution

**Rebuild engine** (`invalidation/rebuild.ts`):

- `rebuild(options)` — unified rebuild with three target modes:
  - `{ mode: 'contract', contractName, params? }` — rebuild all routes using a contract
  - `{ mode: 'route', routePattern, params? }` — rebuild instances of a specific route
  - `{ mode: 'url', url }` — resolve URL to route+params via route matcher, rebuild that instance
- `resolveContractToRoutes(manifest, contractName)` — finds routes by contract
- `rebuildContract(options)` — convenience wrapper for contract mode (used by webhook handlers)
- Optimistic skip: compares pre-rendered output, skips compilation if unchanged
- Atomic manifest update via temp file + rename

**Rebuild CLI** (`stack-cli/lib/run-production.ts`):

- Three modes via flags:
  - `jay-stack rebuild --contract product-page --params '{"slug":"x"}'`
  - `jay-stack rebuild --route /products/[slug]` (all instances)
  - `jay-stack rebuild --url /products/blue-widget` (single instance by URL)
- `--route` without `--params` rebuilds all instances of the route (useful for pages with `page.ts` and no contract)
- `--url` resolves to route+params using the same matcher as the main server

**Renderer server** (`renderer/renderer-server.ts`):

- `jay-stack serve --role=renderer` starts HTTP server with:
  - `POST /_jay/webhooks/:name` — dispatches to discovered webhook handlers
  - `POST /_jay/rebuild` — accepts `{ contract, route, url, params }` (any one target mode)
  - `GET /_jay/status` — reports version, uptime, webhook list, last webhook
- Webhook discovery from `plugin.yaml` declarations (matching actions pattern)
- Service initialization via shared `init-services.ts`

**Version derivation** (`stack-cli/lib/cli.ts`):

- Default version derived from project `package.json` (major*10000 + minor*100 + patch)
- `--version` flag overrides for all commands (build, serve, rebuild)

**CLI refactor** (`stack-cli/lib/`):

- All CLI commands extracted to dedicated files: `run-dev.ts`, `run-production.ts`, `run-validate.ts`, `run-agent-kit.ts`
- `cli.ts` is now command registration only (~170 lines)
- All commands use `-p, --path` option instead of positional `[path]`
- Shared `resolveProductionContext` for build/serve/rebuild

### Test Coverage

- 85 production-server tests (74 existing + 11 new)
- 5 webhook builder tests
- Full monorepo build: 70 packages pass

### Deviations from Design

- `InvalidationContext` / `InvalidationQueue` from the design were not needed — `rebuild()` handles everything directly. The queue can be added later if batch webhooks need it.
- Webhook handler signature uses `WebhookEvent` (type, payload, headers) instead of raw `HttpRequest` — cleaner API, framework handles HTTP parsing
- Webhook discovery uses `plugin.yaml` declarations instead of export scanning — consistent with actions
- Added `--route` and `--url` rebuild modes beyond the original contract-only design — enables rebuilding routes with `page.ts` but no headless contracts
- Startup validation (source hash comparison) not implemented yet — listed as remaining work

### Known Issues / Future Optimization

- **Optimistic skip removed.** The original design compared pre-rendered HTML after `buildInstance` to skip unchanged instances. Two problems were found: (1) `stripCacheMetadata` stripped the `slowViewState` from the comparison, so data-only changes (e.g., price update that doesn't change template structure) were incorrectly reported as unchanged; (2) the comparison ran after the full pipeline completed, so no work was actually saved. The skip was removed entirely. A proper implementation would compare slowViewState + template content _before_ server element compilation and Vite build — requires splitting `buildInstance` or adding an early-exit path after slow render.
