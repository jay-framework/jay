# DL#139: Wix Deployment — Build Separation & Cloudflare-Compatible Head

## Background

The production server (DL#134b) currently uses Node.js `http.createServer` with `IncomingMessage`/`ServerResponse`. All build artifacts live in a single `build/v{n}/` folder. For Wix backend-as-a-service deployment:

- The **head** (main server) runs as a container but must expose a **Cloudflare-compatible HTTP API** (Fetch API: `Request` → `Response`)
- **Frontend assets** (JS, CSS, images) are uploaded to **Wix statics CDN** — they don't live on the server
- **Backend artifacts** (server modules, pre-rendered HTML, manifests) stay on the server

The public folder (`./public` in project root) contains media files (images, fonts, etc.) and is currently only served by the dev server — the production build ignores it.

## Problem

1. The main server uses `node:http` types (`IncomingMessage`, `ServerResponse`) throughout all handlers. Cloudflare Workers expect `fetch(request: Request): Response`. The server runs as a container (not on Workers edge), so Node.js APIs are available — but the HTTP interface must be Cloudflare-compatible.

2. Build artifacts are interleaved in one folder. The browser-facing files (`shared/` chunks, instance `.js` bundles, `.css` files) must be separated from server-only files (`server/` modules, `pre-rendered/` HTML + cache + server-elements, manifests) so frontend assets can be uploaded to CDN independently.

3. The `public/` folder contents need to be included in the frontend output.

## Questions and Answers

**Q1: Should we use Node.js native `Request`/`Response` (available since Node 18) or a polyfill?**

A1: Node 18+ has native Web API support. Since we require Node >= 20, we can use native `Request`/`Response`/`ReadableStream` directly. No polyfill needed.

**Q2: How should streaming SSR work with Fetch API `Response`?**

A2: Use `new Response(ReadableStream)` with a `TransformStream` or manual `ReadableStream` controller. The current `res.write()` calls become `controller.enqueue()`.

**Q3: Should the build produce two separate root folders or two subfolders?**

A3: Subfolders under `build/v{n}/` — `frontend/` and `backend/`.

**Q4: Should the route manifest live in both folders or just backend?**

A4: Just backend. The manifest is only consumed by the server. The CDN folder is dumb static hosting.

**Q5: What about `pre-rendered/` files — some are server-only (jay-html, cache.json, server-element.js) and some are browser-facing (instance .js bundles, .css)?**

A5: Currently each instance produces these files in the same directory:

- `page_{hash}.jay-html` → backend
- `page_{hash}.cache.json` → backend
- `page_{hash}.server-element.js` → backend
- `page_{hash}-{viteHash}.js` → frontend
- `page_{hash}.css` → frontend

The build pipeline needs to write these to different output trees.

**Q6: Do we need to handle the public folder during rebuilds (slow render server)?**

A6: No. Public folder contents are static project assets — they don't change during data invalidation rebuilds. They're only copied during the initial build.

**Q7: How does the main server currently serve static files, and what changes?**

A7: Currently `handleStaticRequest` serves `shared/` and `pre-rendered/` files from the build folder via filesystem. After separation, the server **keeps** this capability — it's controlled by a deployment config. In `self-hosted` mode, the server serves static files from `frontend/` (same as today, for local/standalone deployments). In `cdn` mode, static serving is disabled and all browser-facing URLs use the CDN base path. This way the same server works for Wix deployment, other setups, and local testing.

**Q8: What about the import map URLs — they currently point to `/shared/filename.js`?**

A8: They need to point to the CDN URL. Currently `publicBasePath` in the manifest is hardcoded to `/`. After this change, `publicBasePath` is removed from the manifest — the serve layer reads `staticBaseUrl` from the deploy config and prepends it when generating import maps, CSS links, and script tags. The import map builder and link generation keep the same logic, but read the base URL from config instead of the manifest.

## Design

### 1. Deployment Config

A new `.jay-deploy` YAML file in the project root. Supports multiple named environments with three orthogonal concerns:

1. **`serveStaticFiles`** — does the server serve frontend static files from disk?
2. **`staticBaseUrl`** — base URL for all browser-facing assets (import maps, CSS links, script tags)
3. **`serverStyle`** — how the server is exposed: `http` (Node.js `http.createServer` wrapping the fetch handler) or `fetch` (exports a `(Request) → Response` function directly)

The fetch handler (`Request → Response`) is the core in **all** modes — it handles page requests, actions, and SSR. The `serverStyle` only controls how that handler is exposed to the outside world. Static file serving is a separate layer outside the fetch handler, controlled by `serveStaticFiles`.

```yaml
# .jay-deploy
environments:
  local:
    serverStyle: http
    serveStaticFiles: true

  staging:
    serverStyle: fetch
    serveStaticFiles: false
    staticBaseUrl: https://static.parastorage.com/services/jay-app/staging/

  production:
    serverStyle: fetch
    serveStaticFiles: false
    staticBaseUrl: https://static.parastorage.com/services/jay-app/1.0.0/
```

**Fields per environment:**

| Field              | Type                | Default  | Description                                                                                                                                            |
| ------------------ | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serverStyle`      | `'http' \| 'fetch'` | `'http'` | `http`: Node.js HTTP server wrapping the fetch handler. `fetch`: exports the fetch handler directly (Cloudflare Workers / service-worker style)        |
| `serveStaticFiles` | `boolean`           | `true`   | Whether the server serves `frontend/` files from disk. Independent of `serverStyle`                                                                    |
| `staticBaseUrl`    | `string`            | `'/'`    | Base URL prefix for all browser-facing assets. When `serveStaticFiles: true` and `staticBaseUrl: '/'`, the server maps these to the `frontend/` folder |

These compose freely — all combinations are valid:

| `serverStyle` | `serveStaticFiles` | `staticBaseUrl` | Use case                                               |
| ------------- | ------------------ | --------------- | ------------------------------------------------------ |
| `http`        | `true`             | `/`             | Local dev, standalone deployment                       |
| `http`        | `false`            | CDN URL         | Node server behind CDN (no static serving overhead)    |
| `fetch`       | `false`            | CDN URL         | Wix / Cloudflare Workers deployment                    |
| `fetch`       | `true`             | `/`             | Fetch-style handler with self-hosted statics (testing) |

**Usage:**

```bash
jay-stack build                           # build is environment-agnostic, no --env needed
jay-stack serve --env production          # starts with fetch handler, no static serving
jay-stack serve --env local               # starts Node HTTP server with static files
jay-stack serve                           # defaults to 'local' if no --env
```

The deploy config is **serve-time only**. The build always produces the same output with relative paths — no environment baked in. This means: build once, deploy to any environment. `publicBasePath` is removed from the manifest; the serve layer resolves it from the deploy config's `staticBaseUrl`.

**Config type:**

```typescript
interface DeployEnvironment {
  serverStyle?: 'http' | 'fetch'; // defaults to 'http'
  serveStaticFiles?: boolean; // defaults to true
  staticBaseUrl?: string; // defaults to '/'
}

interface DeployConfig {
  environments: Record<string, DeployEnvironment>;
}
```

### 2. Build Output Structure

```
build/v{n}/
├── frontend/                          # → uploaded to Wix CDN
│   ├── shared/                        # Framework + plugin client chunks
│   │   ├── component-{hash}.js
│   │   ├── runtime-{hash}.js
│   │   └── ...
│   ├── pages/                         # Instance client bundles + CSS
│   │   ├── index/
│   │   │   ├── page_{hash}-{viteHash}.js
│   │   │   └── page_{hash}.css
│   │   └── items/[slug]/
│   │       ├── page_{hash1}-{viteHash}.js
│   │       └── page_{hash1}.css
│   └── public/                        # Copied from project ./public
│       └── images/
│           └── logo.png
│
├── backend/                           # → deployed with server container
│   ├── route-manifest.json
│   ├── build-metadata.json
│   ├── server/                        # Compiled page.ts + actions + init
│   │   ├── init.js
│   │   ├── pages/{route}/page.js
│   │   └── actions/{name}.actions.js
│   └── pre-rendered/                  # Server-only artifacts
│       ├── index/
│       │   ├── page.jay-html
│       │   ├── page.cache.json
│       │   ├── page.server-element.js
│       │   └── page-parts.json
│       └── items/[slug]/
│           ├── page_{hash}.jay-html
│           ├── page_{hash}.cache.json
│           ├── page_{hash}.server-element.js
│           └── page-parts.json
```

### 3. Manifest Path Changes

All paths in the manifest stay **relative** — never absolute or CDN-prefixed:

- **`serverModule`**: relative to `backend/` (e.g., `server/pages/index/page.js`)
- **`preRenderedPath`**: relative to `backend/` (e.g., `pre-rendered/index/page.jay-html`)
- **`serverElementPath`**: relative to `backend/` (e.g., `pre-rendered/index/page.server-element.js`)
- **`clientBundlePath`**: relative to `frontend/` (e.g., `pages/index/page_{hash}-{viteHash}.js`)
- **`clientCssPath`**: relative to `frontend/` (e.g., `pages/index/page_{hash}.css`)
- **`sharedManifest`**: values are relative to `frontend/shared/`

At serve time, `staticBaseUrl` (from the deploy config, defaults to `/`) is prepended to all frontend-relative paths when generating browser-facing URLs (import maps, CSS links, script tags). In `self-hosted` mode with `staticBaseUrl: '/'`, the server maps those URLs to the `frontend/` folder on disk.

`publicBasePath` is **removed from the manifest**. The manifest is environment-agnostic — it contains only relative paths. The serve layer reads `staticBaseUrl` from the deploy config.

### 4. Fetch Handler (Core) and Server Styles

#### Architecture

```
┌─────────────────────────────────────────────────┐
│  Server Style Layer (http or fetch)             │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Static Files Layer (optional)            │  │
│  │  serveStaticFiles: true → serve frontend/ │  │
│  │                                           │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │  Fetch Handler (always the core)    │  │  │
│  │  │  (Request) → Response               │  │  │
│  │  │  • page requests → SSR streaming    │  │  │
│  │  │  • actions → JSON responses         │  │  │
│  │  │  • webhooks → invalidation          │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

The fetch handler is the core logic in **all** modes. It handles page requests, actions, and webhooks — never static files. Static file serving wraps around it as a separate layer, enabled by `serveStaticFiles`.

#### Fetch Handler

```typescript
type FetchHandler = (request: Request) => Promise<Response>;

interface HandlerOptions {
  backendDir: string;
  staticBaseUrl: string;
}

export function createJayHandler(options: HandlerOptions): FetchHandler {
  const artifacts = new FilesystemArtifactStore(options.backendDir);

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (isActionRequest(url.pathname)) {
      return handleActionRequest(request);
    }

    const manifest = await artifacts.readManifest();
    const match = matchRequest(manifest, url.pathname);

    if (!match) {
      return new Response('Not Found', { status: 404 });
    }

    return handlePageRequest(match, manifest, url, artifacts);
  };
}
```

#### Static Files Layer

Wraps the fetch handler. When `serveStaticFiles` is true, incoming requests are first checked against the `frontend/` folder. Unmatched requests fall through to the fetch handler.

```typescript
function withStaticFiles(handler: FetchHandler, frontendDir: string): FetchHandler {
  return async (request: Request): Promise<Response> => {
    const staticResponse = await serveStaticFile(request, frontendDir);
    if (staticResponse) return staticResponse;
    return handler(request);
  };
}
```

#### Server Style: `http`

Wraps the handler in `http.createServer`. Used for standalone deployments and local testing.

```typescript
import http from 'node:http';

function startHttpServer(handler: FetchHandler, port: number): void {
  http
    .createServer(async (req, res) => {
      const request = toFetchRequest(req);
      const response = await handler(request);
      await pipeFetchResponse(response, res);
    })
    .listen(port);
}
```

#### Server Style: `fetch`

Exports the handler directly. The hosting platform (Cloudflare Workers, Wix backend) calls it.

```typescript
// Entry point for fetch-style platforms
export default {
  fetch: handler,
};
```

#### Handler Module Changes

| File                | Current API                                          | New API                                                                                |
| ------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `page-handler.ts`   | `(res: ServerResponse, ...) → void`                  | `(...) → Response` (streaming via `ReadableStream`)                                    |
| `action-handler.ts` | `(req: IncomingMessage, res: ServerResponse) → void` | `(request: Request) → Response`                                                        |
| `static-handler.ts` | `(req, res, basePath, urlPrefix) → boolean`          | `(request, frontendDir) → Response \| null` — separate layer, not inside fetch handler |
| `main-server.ts`    | `http.createServer(callback)`                        | Composes layers based on config: fetch handler + optional static files + server style  |

#### Streaming SSR with ReadableStream

```typescript
function handlePageRequest(...): Response {
    const stream = new ReadableStream({
        async start(controller) {
            controller.enqueue(headHtml);

            serverElement.renderToStream(fullViewState, {
                write: (chunk: string) => controller.enqueue(chunk),
                onAsync: (promise, id, templates) => { ... },
            });

            controller.enqueue(footerHtml);
            controller.close();
        }
    });

    return new Response(stream, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}
```

#### Composition at Startup

All three config fields are serve-time only. The build output is identical regardless of environment.

```typescript
async function startServer(config: DeployEnvironment, dirs: Dirs): Promise<void> {
  // staticBaseUrl comes from deploy config, not from the manifest
  let handler = createJayHandler({
    backendDir: dirs.backend,
    staticBaseUrl: config.staticBaseUrl ?? '/',
  });

  if (config.serveStaticFiles !== false) {
    handler = withStaticFiles(handler, dirs.frontend);
  }

  if (config.serverStyle === 'fetch') {
    // Export for platform consumption
    module.exports = { fetch: handler };
  } else {
    // Default: Node.js HTTP server
    startHttpServer(handler, config.port);
  }
}
```

### 5. Build Pipeline Changes

#### Phase 0: Shared Chunks

Currently writes to `build/v{n}/shared/`. Change output to `build/v{n}/frontend/shared/`.

#### Phase 0: Server Code

Currently writes to `build/v{n}/server/`. Change output to `build/v{n}/backend/server/`.

#### Phase 1: Per-Instance Pipeline

Currently writes all instance files to `build/v{n}/pre-rendered/{route}/`. Split:

- `.jay-html`, `.cache.json`, `.server-element.js`, `page-parts.json` → `build/v{n}/backend/pre-rendered/{route}/`
- `{hash}-{viteHash}.js`, `.css` → `build/v{n}/frontend/pages/{route}/`

#### Phase 2: Finalize

- Write `route-manifest.json` and `build-metadata.json` to `build/v{n}/backend/`
- Copy `public/` folder to `build/v{n}/frontend/public/`

#### Artifact Store

`FilesystemArtifactStore` constructor takes `backendDir` instead of `buildDir`. All server-side reads resolve against the backend folder. The store no longer needs to know about frontend files.

### 6. Public Folder Handling

During build Phase 2 (finalize), recursively copy the project's `public/` folder to `frontend/public/`. In `self-hosted` mode the server serves these from disk. In `cdn` mode they're available at `{staticBaseUrl}/public/...`.

In dev mode, the dev server already serves `public/` via Express static middleware — no change needed there.

## Implementation Plan

### Phase 1: Split build output

1. **Update `build-pipeline.ts`** — add `frontendDir` and `backendDir` paths derived from build root
2. **Update `shared-chunks-build.ts`** — output to `frontend/shared/`
3. **Update `server-code-build.ts`** — output to `backend/server/`
4. **Update `instance-pipeline.ts`** — split instance outputs between frontend and backend
5. **Update `route-manifest.ts`** — write manifest to `backend/`, remove `publicBasePath` from manifest, all paths relative
6. **Add public folder copy** in finalize phase
7. **Update `BuildOptions`** — add `publicFolder` path (no `staticBaseUrl` — that's serve-time only)

### Phase 2: Deployment config (serve-time only)

1. **Create deploy config loader** — parse `.jay-deploy` YAML, resolve environment by name, defaults
2. **Add `DeployConfig` / `DeployEnvironment` types** to production-server types
3. **Wire into CLI** — `--env` flag for `serve` command only (not `build`)

### Phase 3: Fetch handler (core)

1. **Create `handler.ts`** — `createJayHandler()` returning `FetchHandler`
2. **Rewrite `page-handler.ts`** — return `Response` with `ReadableStream`
3. **Rewrite `action-handler.ts`** — `Request` → `Response`
4. **Update `artifact-store.ts`** — resolve against backend dir only

### Phase 4: Server composition

1. **Update `static-handler.ts`** — convert to Fetch API (`Request → Response | null`), used as wrapper layer
2. **Create `with-static-files.ts`** — `withStaticFiles(handler, frontendDir)` wrapper
3. **Create `http-adapter.ts`** — `startHttpServer(handler, port)` for `serverStyle: 'http'`
4. **Create `fetch-entry.ts`** — export entry for `serverStyle: 'fetch'`
5. **Update `main-server.ts`** — compose layers based on deploy config

### Phase 5: Update CLI and renderer

1. **Update `run-production.ts`** — load deploy config on serve, remove `publicBasePath` from build path
2. **Update renderer server** — invalidation writes to both backend and frontend folders
3. **Update tests**

## Trade-offs

- **Two output folders vs. one**: Slightly more complex build pipeline, but clean deployment separation. No runtime overhead.
- **Deploy config file**: Another config file in the project root. But it's optional — without it, everything defaults to `serverStyle: 'http'`, `serveStaticFiles: true`, `staticBaseUrl: '/'`, which matches current behavior exactly. Multi-environment support avoids needing env vars or CLI flags for each deployment target.
- **Three orthogonal concerns**: More config surface, but each combination is valid and independently testable. No "magic" modes where changing one setting has hidden side effects on another.
- **Fetch handler as universal core**: All code paths go through the same `(Request) → Response` function. The http adapter and static file layer are thin wrappers. This means the fetch handler is always tested regardless of server style.

## Verification

1. `jay-stack build` produces `build/v{n}/frontend/` and `build/v{n}/backend/` with correct file placement
2. `frontend/` contains only browser-consumable files (JS, CSS, images) — no `.jay-html`, `.cache.json`, or server modules
3. `backend/` contains only server-consumable files — no client bundles or CSS
4. `jay-stack serve` starts correctly from `backend/` and serves pages that reference CDN URLs for assets
5. Import maps resolve to `publicBasePath + "shared/..."` correctly
6. Instance client bundles and CSS resolve to `publicBasePath + "pages/..."` correctly
7. Public folder files available at `publicBasePath + "public/..."` on CDN
8. Rebuild (invalidation) correctly writes new files to both frontend and backend folders
9. Streaming SSR works via `ReadableStream` / `Response` API
10. Actions work via `Request` / `Response` API
