# Design Log #134b — Main Server

**Date:** May 10, 2026
**Status:** Draft
**Parent:** #134 (production build)
**Related:** #134a (build pipeline), #134d (server build), #94 (SSR streaming), #63 (server actions), #130 (plugin routes)

## Background

The production main server handles HTTP requests using pre-built artifacts — no Vite, no compilation at runtime. It is the production equivalent of the dev server's `handleCachedRequest()` path, where slow data is already baked into pre-rendered HTML and only the fast phase runs per-request.

Artifacts come from the build pipeline (DL#134a) and live in a versioned storage bucket (`build/v{n}/`). The server build (DL#134d) provides compiled page components, actions, and init. The build pipeline provides per-instance artifacts (pre-rendered jay-html, server elements, client bundles).

## Design

### Request Flow

```
HTTP Request
  │
  ├── /_jay/actions/:name
  │     → Action Router (parse input, resolve services, execute handler, return JSON)
  │
  ├── /assets/*
  │     → Static file handler (client bundles, CSS — or CDN redirect)
  │
  └── /* (page routes)
        │
        1. Match route from manifest
        2. Find instance for request params
        3. Load pre-rendered jay-html (slow ViewState + carryForward from cache metadata)
        4. Load compiled page module, run fast phase
        5. Handle fast phase result (redirect? error? phase output?)
        6. Merge slow + fast ViewState
        7. Load compiled server element, execute renderToStream()
        8. Assemble HTML response (head, SSR body, import map, init script)
        9. Send response
```

### Route Matching

The dev server uses `scanRoutes()` to discover routes from the filesystem and Express route patterns for matching. The production server uses the pre-built route manifest:

```typescript
interface RouteManifest {
  version: number;
  sourceHash: string;
  buildTimestamp: string;
  routes: RouteEntry[];
  actions: ActionEntry[];
  plugins: PluginEntry[];
  sharedManifest: Record<string, string>;  // module name → hashed filename
  publicBasePath: string;                   // CDN URL or "/" for self-hosting
}

interface RouteEntry {
  pattern: string;                          // "/products/[slug]"
  segments: RouteSegment[];                 // Parsed segments for matching
  serverModule: string;                     // "pages/products/[slug]/page.js"
  instances: InstanceEntry[];
  isPlugin?: boolean;
  pluginName?: string;
}

interface InstanceEntry {
  params: Record<string, string>;           // { slug: "blue-widget" }
  preRenderedPath: string;                   // "instances/products/[slug]/page_abc123.jay-html"
  serverElementPath: string;                // "instances/products/[slug]/page_abc123.server-element.js"
  clientBundlePath: string;                 // "instances/products/[slug]/page_abc123-a1b2c3.js"
  clientCssPath?: string;                   // "instances/products/[slug]/page_abc123-d4e5f6.css"
}
```

Route matching reuses the same segment-matching logic from `route-scanner`:
1. Sort routes by specificity (static > single param > catch-all)
2. Match URL path against route segments
3. Extract param values
4. Find instance with matching params

```typescript
function matchRequest(manifest: RouteManifest, pathname: string): MatchResult | undefined {
  for (const route of manifest.routes) {
    const params = matchSegments(route.segments, pathname);
    if (params) {
      const instance = route.instances.find(i => paramsMatch(i.params, params));
      return { route, instance, params };
    }
  }
  return undefined;
}
```

If no instance matches the params (e.g., new product added but not yet built), the server returns 404. The slow render server is responsible for building new instances when data changes.

### Artifact Storage Service

All artifact reads go through an abstraction (DL#134 Q3):

```typescript
interface ArtifactStore {
  readManifest(): Promise<RouteManifest>;
  readPreRenderedHtml(path: string): Promise<PreRenderedEntry>;
  loadServerElement(path: string): Promise<ServerElementModule>;
  loadPageModule(path: string): Promise<PageModule>;
  getClientAssetUrl(path: string): string;
}
```

#### Version Resolution

The version is a **deployment constant** — the server and its artifacts are deployed together. The version is hardcoded in the deployed server, not discovered dynamically:

```typescript
// Set at deployment time (env var, config, or baked into the build)
const BUILD_VERSION = process.env.JAY_BUILD_VERSION || '1';
const artifactStore = new FilesystemArtifactStore(`build/v${BUILD_VERSION}`);
```

Version transitions are handled by replacing the server instance (blue-green deployment, rolling restart, container replacement). The old server keeps serving from `build/v1/` until traffic drains, then the new server starts serving from `build/v2/`. No dynamic version switching, no pointer files, no race conditions.

```typescript
class FilesystemArtifactStore implements ArtifactStore {
  private basePath: string;  // build/v{n}/ — fixed for the lifetime of this server
  private manifestCache?: { manifest: RouteManifest; mtime: number };
  private moduleCache = new Map<string, { module: any; mtime: number }>();

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async readManifest(): Promise<RouteManifest> {
    const manifestPath = path.join(this.basePath, 'route-manifest.json');
    const stat = await fs.stat(manifestPath);
    if (this.manifestCache && stat.mtimeMs === this.manifestCache.mtime) {
      return this.manifestCache.manifest;
    }
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    this.manifestCache = { manifest, mtime: stat.mtimeMs };
    return manifest;
  }

  async loadServerElement(relativePath: string): Promise<ServerElementModule> {
    return this.loadModule(relativePath);
  }

  async loadPageModule(relativePath: string): Promise<PageModule> {
    return this.loadModule(relativePath);
  }

  private async loadModule(relativePath: string): Promise<any> {
    const fullPath = path.join(this.basePath, relativePath);
    const stat = await fs.stat(fullPath);
    const cached = this.moduleCache.get(relativePath);
    if (cached && stat.mtimeMs === cached.mtime) {
      return cached.module;
    }
    const mod = await import(fullPath + '?t=' + stat.mtimeMs);
    this.moduleCache.set(relativePath, { module: mod, mtime: stat.mtimeMs });
    return mod;
  }
}
```

**Data change updates (within a version):** The slow render server updates specific instance artifacts in-place within the current version bucket. The timestamp-based caching detects file changes per-module, so only affected instances are reloaded on next request.

### Page Request Handler

```typescript
async function handlePageRequest(
  req: IncomingMessage,
  res: ServerResponse,
  artifacts: ArtifactStore,
  services: ServiceRegistry,
): Promise<void> {
  const manifest = await artifacts.readManifest();
  const match = matchRequest(manifest, req.url);

  if (!match) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const { route, instance, params } = match;

  if (!instance) {
    // Route exists but no instance for these params
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // 1. Load pre-rendered entry (slow ViewState + carryForward embedded)
  const preRendered = await artifacts.readPreRenderedHtml(instance.preRenderedPath);

  // 2. Load page module, run fast phase
  const pageModule = await artifacts.loadPageModule(route.serverModule);
  const query = parseQueryString(req.url);
  const fastResult = await runFastPhase(
    pageModule, params, preRendered.carryForward, services, query
  );

  // 3. Handle non-success results
  if (fastResult.kind === 'Redirect3xx') {
    res.writeHead(fastResult.status, { Location: fastResult.location });
    res.end();
    return;
  }
  if (fastResult.kind === 'ServerError5xx' || fastResult.kind === 'ClientError4xx') {
    res.writeHead(fastResult.status);
    res.end(fastResult.message);
    return;
  }

  // 4. Merge slow + fast ViewState for SSR
  const fullViewState = mergeViewStates(
    preRendered.slowViewState,
    fastResult.rendered,
    route.trackByMap
  );

  // 5. Load server element, stream HTML response
  const serverElement = await artifacts.loadServerElement(instance.serverElementPath);
  const asyncPromises: Promise<string>[] = [];

  const basePath = manifest.publicBasePath;
  const importMap = buildImportMap(manifest.sharedManifest, basePath);
  const headTags = fastResult.headTags ? serializeHeadTags(fastResult.headTags) : '';
  const cssLink = instance.clientCssPath
    ? `    <link rel="stylesheet" href="${basePath}${instance.clientCssPath}" />\n`
    : '';

  // 6. Stream response — send <head> immediately, body as it renders
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  });

  res.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${headTags}${cssLink}    <script type="importmap">${JSON.stringify({ imports: importMap })}</script>
  </head>
  <body>
    <div id="target">`);

  // Stream SSR HTML as renderToStream produces chunks
  serverElement.renderToStream(fullViewState, {
    write: (chunk: string) => res.write(chunk),
    onAsync: (promise, id, templates) => {
      asyncPromises.push(promise.then(
        val => asyncSwapScript(id, templates.resolved(val)),
        err => asyncSwapScript(id, templates.rejected(err)),
      ));
    },
  });

  res.write('</div>');

  // Wait for async promises, stream swap scripts as they resolve
  const asyncScripts = (await Promise.all(asyncPromises)).filter(s => s).join('');
  if (asyncScripts) res.write(asyncScripts);

  // Hydration script — last, after all async content is in the DOM
  res.write(`
    <script type="module">
      import { init } from '${basePath}${instance.clientBundlePath}';
      init(${JSON.stringify(fastResult.rendered)}, ${JSON.stringify(fastResult.carryForward)});
    </script>
  </body>
</html>`);
  res.end();
}
```

### Fast Phase Execution

Reuses `renderFastChangingData()` from `stack-server-runtime`. The function is not Vite-dependent — it takes page parts and calls their `fastRender()` methods. In production:

- Page parts come from the compiled page module (DL#134d) instead of `vite.ssrLoadModule()`
- Services are resolved via the same `__JAY_SERVICE_RESOLVER__` global
- Headless instance data comes from the pre-rendered cache metadata (`carryForward.__instances`)

```typescript
async function runFastPhase(
  pageModule: PageModule,
  params: Record<string, string>,
  carryForward: object,
  services: ServiceRegistry,
  query: Record<string, string>,
): Promise<AnyFastRenderResult> {
  const parts = extractParts(pageModule);  // Get DevServerPagePart-like objects
  return renderFastChangingData(
    params,
    { params, query },
    carryForward,
    parts,
    carryForward.__instances,  // Instance phase data from slow render
    /* forEachInstances */ undefined,
    /* headlessInstanceComponents */ [],
    /* mergedSlowViewState */ undefined,
    query,
  );
}
```

### Action Router

The action router from `action-router.ts` is largely reusable. The HTTP handling (request parsing, response formatting, streaming, multipart file upload) is environment-agnostic. Changes for production:

- Actions loaded from compiled JS at startup (DL#134d) instead of Vite SSR
- No `vite.ssrLoadModule()` calls
- Same `actionRegistry` pattern

```typescript
function createProductionActionRouter(
  actionRegistry: ActionRegistry,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  // Same logic as dev action-router.ts:
  // 1. Parse action name from URL
  // 2. Parse input from query/body
  // 3. Handle multipart (busboy) if needed
  // 4. Resolve services
  // 5. Execute handler
  // 6. Return JSON or stream NDJSON
}
```

### Static Asset Serving

Client bundles and CSS are served either by the main server or a CDN:

**Self-hosted (default):**
```typescript
// Serve from build/v{n}/shared/ and build/v{n}/instances/
app.use('/assets', express.static(path.join(buildDir, 'shared')));
app.use('/assets', express.static(path.join(buildDir, 'instances')));
```

**CDN-hosted:**
```typescript
// publicBasePath = "https://cdn.example.com/v1/"
// Client bundles reference this URL prefix
// Main server only handles HTML and actions
```

Content-hashed filenames (DL#134 Q16) enable aggressive caching (`Cache-Control: immutable, max-age=31536000`).

### Import Maps for Shared Chunks

The SSR HTML includes an import map that resolves bare specifiers to hashed URLs:

```typescript
function buildImportMap(
  sharedManifest: Record<string, string>,
  basePath: string,
): Record<string, string> {
  const imports: Record<string, string> = {};
  for (const [name, hashedFile] of Object.entries(sharedManifest)) {
    imports[name] = basePath + hashedFile;
  }
  return imports;
}
```

Example output:
```html
<script type="importmap">{
  "imports": {
    "@jay-framework/stack-client-runtime": "/assets/stack-client-runtime-a1b2c3.js",
    "@jay-framework/component": "/assets/component-d4e5f6.js",
    "@jay-framework/reactive": "/assets/reactive-g7h8i9.js"
  }
}</script>
```

Instance bundles use bare `import` specifiers (`import { hydrateCompositeJayComponent } from '@jay-framework/stack-client-runtime'`), and the browser resolves them via the import map.

### Server Startup

```typescript
async function startMainServer(options: MainServerOptions) {
  const version = process.env.JAY_BUILD_VERSION || '1';
  const buildDir = path.join(options.buildRoot, `v${version}`);
  const artifacts = new FilesystemArtifactStore(buildDir);
  const manifest = await artifacts.readManifest();

  // 1. Initialize services (DL#134d)
  await initializeProductionServer(buildDir, manifest);

  // 2. Set up HTTP server
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith('/_jay/actions/')) {
      return actionRouter(req, res);
    }

    if (url.pathname.startsWith('/assets/')) {
      return staticHandler(req, res);
    }

    return handlePageRequest(req, res, artifacts, serviceRegistry);
  });

  server.listen(options.port);
}
```

### What the Main Server Does NOT Do

- No Vite — no `vite.ssrLoadModule()`, no HMR, no dev middleware
- No slow phase — never calls `slowlyRender()` or `preRenderJayHtml()`
- No file watching — artifacts are immutable until the slow render server updates them
- No route scanning — routes come from the manifest
- No compilation — all code is pre-compiled JS
- No freeze/snapshot — dev-only feature (DL#127)
- No automation API — dev-only feature
- No dynamic contract materialization — build-time only

## Implementation Plan

### Step 1: Route Matching

Extract route matching logic from `route-scanner` into a reusable function:
- Input: route manifest + URL pathname
- Output: matched route + instance + extracted params
- Test: matches static routes, param routes, catch-all, returns undefined for no match

### Step 2: Artifact Store

Implement `FilesystemArtifactStore`:
- Timestamp-based caching for modules and manifest
- Pre-rendered HTML parsing (extract cache metadata tag)
- Test: reads artifacts, caches correctly, detects file changes

### Step 3: Page Request Handler

Implement `handlePageRequest()`:
- Load artifacts, run fast phase, merge ViewState, render SSR, assemble HTML
- Test: produces correct HTML for known ViewState inputs

### Step 4: Production Action Router

Adapt action router for production:
- Same HTTP handling, load from compiled modules
- Test: action execution produces same results as dev server

### Step 5: Server Startup + Static Assets

Wire everything together:
- Service initialization → action registration → HTTP server
- Static file serving with cache headers
- Import map generation from shared manifest
- Test: end-to-end request handling

## Questions

**Q1: Should the main server support streaming SSR (chunked transfer encoding)?**

**A1:** Yes. DL#94 designed streaming SSR — `renderToStream` writes chunks via `write()` callbacks, and async promises stream swap scripts as they resolve. The production server streams directly to the HTTP response: send `<head>` immediately (CSS, import map), stream SSR body chunks, wait for async promises, send hydration script last. This matches the dev server behavior.

**Q2: How does the ArtifactStore load from the right version bucket?**

**A2:** The version is a deployment constant — hardcoded in the server (via env var `JAY_BUILD_VERSION` or baked into the build). The server always reads from `build/v{n}/` for its entire lifetime. Version transitions happen by replacing the server instance (blue-green deployment, rolling restart). No dynamic version switching, no pointer files, no race conditions. Within a version, timestamp-based caching handles data-change updates from the slow render server.

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| Timestamp-based module caching | Simple; naturally picks up artifact updates; no coordination needed | `stat()` syscall on every request per module; Node `import()` cache busting via query param |
| Import maps for shared chunks | Standard browser feature; clean module resolution; CDN-friendly | Requires modern browsers (Chrome 89+, Safari 16.4+) |
| Artifact store abstraction | Swappable backends (filesystem, S3, etc.) | Extra indirection; filesystem is likely the only implementation for now |
| Streaming SSR | Fast TTFB; browser starts parsing `<head>` (CSS, import map) immediately; async swap scripts stream as promises resolve | Cannot change HTTP status after streaming begins — fast phase errors must be checked before streaming starts |
| Hardcoded version | No dynamic version logic; no race conditions; clean deployment model | Requires server instance replacement for version transitions (standard for production) |
| Minimal HTTP server (no Express) | Lighter footprint; fewer dependencies | Less middleware ecosystem; manual routing |

## Verification Criteria

1. Main server starts without Vite and serves pages correctly
2. SSR HTML matches dev server output for the same ViewState
3. Fast phase produces same results as dev server
4. Actions work identically to dev server
5. Static assets served with correct cache headers
6. Import maps resolve correctly in browser
7. Artifact updates picked up without server restart
8. 404 for unknown routes, 404 for unknown params
9. Redirect and error responses from fast phase handled correctly
