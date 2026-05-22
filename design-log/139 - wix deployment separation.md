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

A8: They need to point to the CDN URL. `publicBasePath` in the manifest already exists for this — currently hardcoded to `/`. For Wix deployment it becomes the CDN base URL (e.g., `https://static.parastorage.com/services/jay-app/1.0.0/`). The import map builder and CSS/JS link generation already use `publicBasePath` — no logic change needed, just the right value.

## Design

### 1. Deployment Config

A new `.jay-deploy` YAML file in the project root. Supports multiple named environments, with one marked as the active/default.

```yaml
# .jay-deploy
environments:
  local:
    serving: self-hosted

  staging:
    serving: cdn
    staticBaseUrl: https://static.parastorage.com/services/jay-app/staging/

  production:
    serving: cdn
    staticBaseUrl: https://static.parastorage.com/services/jay-app/1.0.0/
```

**Fields per environment:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `serving` | `'self-hosted' \| 'cdn'` | `'self-hosted'` | Whether the server serves static files or they come from a CDN |
| `staticBaseUrl` | `string` | `'/'` | Base URL prefix for all browser-facing assets (JS, CSS, images). Used as `publicBasePath` in the manifest and import maps |

**Usage:**

```bash
jay-stack build --env production          # builds with production staticBaseUrl
jay-stack serve --env production          # serves with production config (no static serving)
jay-stack serve --env local               # serves with self-hosted static files
jay-stack serve                           # defaults to 'local' if no --env
```

The build writes `staticBaseUrl` into the manifest's `publicBasePath`. At serve time, the `serving` mode determines whether the static handler is enabled.

**Config type:**

```typescript
interface DeployEnvironment {
    serving: 'self-hosted' | 'cdn';
    staticBaseUrl?: string;  // defaults to '/'
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

At serve time, `publicBasePath` (from the deploy config's `staticBaseUrl`) is prepended to all frontend-relative paths when generating browser-facing URLs (import maps, CSS links, script tags). In `self-hosted` mode, `publicBasePath` defaults to `/` and the server maps those URLs to the `frontend/` folder on disk.

### 4. Cloudflare-Compatible Fetch Handler

The core server logic becomes a pure function:

```typescript
type FetchHandler = (request: Request) => Promise<Response>;

interface HandlerOptions {
    backendDir: string;
    frontendDir: string;
    serving: 'self-hosted' | 'cdn';
    staticBaseUrl: string;    // '/' for self-hosted, CDN URL for cdn mode
}

export function createJayHandler(options: HandlerOptions): FetchHandler {
    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        
        if (isActionRequest(url.pathname)) {
            return handleActionRequest(request);
        }
        
        // In self-hosted mode, serve static files from frontend/
        if (options.serving === 'self-hosted') {
            const staticResponse = await handleStaticRequest(
                request, options.frontendDir
            );
            if (staticResponse) return staticResponse;
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

The server entry wraps this in Node.js `http.createServer` using `node:http` adapters (or the built-in `Readable.toWeb`/`Readable.fromWeb` bridges).

#### Handler Module Changes

| File | Current API | New API |
|------|------------|---------|
| `page-handler.ts` | `(res: ServerResponse, ...) → void` | `(...) → Response` (streaming via `ReadableStream`) |
| `action-handler.ts` | `(req: IncomingMessage, res: ServerResponse) → void` | `(request: Request) → Response` |
| `static-handler.ts` | `(req, res, basePath, urlPrefix) → boolean` | `(request, basePath, urlPrefix) → Response \| null` — **kept**, enabled in `self-hosted` mode |
| `main-server.ts` | `http.createServer(callback)` | `createJayHandler()` + thin Node adapter |

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

#### Node.js Adapter (container entry point)

```typescript
import http from 'node:http';
import { createJayHandler } from './handler';

const handler = createJayHandler(options);

http.createServer(async (req, res) => {
    const request = new Request(
        new URL(req.url!, `http://${req.headers.host}`),
        { method: req.method, headers: req.headers as any }
    );
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    
    if (response.body) {
        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
    }
    res.end();
}).listen(port);
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

### Phase 1: Deployment config

1. **Create deploy config loader** — parse `.jay-deploy` YAML, resolve environment by name, defaults
2. **Add `DeployConfig` types** to production-server types
3. **Wire into CLI** — `--env` flag for `build` and `serve` commands

### Phase 2: Split build output

1. **Update `build-pipeline.ts`** — add `frontendDir` and `backendDir` paths derived from build root
2. **Update `shared-chunks-build.ts`** — output to `frontend/shared/`
3. **Update `server-code-build.ts`** — output to `backend/server/`
4. **Update `instance-pipeline.ts`** — split instance outputs between frontend and backend
5. **Update `route-manifest.ts`** — write manifest to `backend/`, with relative paths for both sides
6. **Add public folder copy** in finalize phase
7. **Update `BuildOptions`** — add `publicFolder` path, `staticBaseUrl`

### Phase 3: Cloudflare-compatible fetch handler

1. **Create `handler.ts`** — `createJayHandler()` returning `FetchHandler`
2. **Rewrite `page-handler.ts`** — return `Response` with `ReadableStream`
3. **Rewrite `action-handler.ts`** — `Request` → `Response`
4. **Update `static-handler.ts`** — convert to Fetch API, enabled when `serving: 'self-hosted'`
5. **Update `main-server.ts`** — thin Node adapter over `createJayHandler()`
6. **Update `artifact-store.ts`** — resolve against backend dir only

### Phase 4: Update CLI and renderer

1. **Update `run-production.ts`** — load deploy config, pass `staticBaseUrl` and `serving` mode
2. **Update renderer server** — invalidation writes to both backend and frontend folders
3. **Update tests**

## Trade-offs

- **Two output folders vs. one**: Slightly more complex build pipeline, but clean deployment separation. No runtime overhead.
- **Deploy config file**: Another config file in the project root. But it's optional — without it, everything defaults to `self-hosted` with `staticBaseUrl: '/'`, which matches current behavior exactly. Multi-environment support avoids needing env vars or CLI flags for each deployment target.
- **Fetch API refactor**: More code change upfront but cleaner abstraction — the handler becomes platform-agnostic (testable without a running server, works with any runtime that supports Fetch API).
- **Self-hosted mode kept**: Slightly more code to maintain (static handler stays), but essential for local development and non-CDN deployments.

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