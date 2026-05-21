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

A7: Currently `handleStaticRequest` serves `shared/` and `pre-rendered/` files from the build folder via filesystem. After separation, the server no longer serves these — the CDN does. The server only needs to handle page requests and actions. Static file serving on the server can be removed entirely (or kept as a dev/fallback mode).

**Q8: What about the import map URLs — they currently point to `/shared/filename.js`?**

A8: They need to point to the CDN URL. `publicBasePath` in the manifest already exists for this — currently hardcoded to `/`. For Wix deployment it becomes the CDN base URL (e.g., `https://static.parastorage.com/services/jay-app/1.0.0/`). The import map builder and CSS/JS link generation already use `publicBasePath` — no logic change needed, just the right value.

## Design

### 1. Build Output Structure

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

### 2. Manifest Path Changes

Paths in the manifest currently are relative to `build/v{n}/`. After separation:

- **`serverModule`**: relative to `backend/` (e.g., `server/pages/index/page.js`)
- **`preRenderedPath`**: relative to `backend/` (e.g., `pre-rendered/index/page.jay-html`)
- **`serverElementPath`**: relative to `backend/` (e.g., `pre-rendered/index/page.server-element.js`)
- **`clientBundlePath`**: relative to `frontend/` (e.g., `pages/index/page_{hash}-{viteHash}.js`)
- **`clientCssPath`**: relative to `frontend/` (e.g., `pages/index/page_{hash}.css`)
- **`sharedManifest`**: values are relative to `frontend/shared/`

The `publicBasePath` prefixes all frontend-relative paths when generating URLs for the browser (import maps, CSS links, script tags). This already works today.

### 3. Cloudflare-Compatible Fetch Handler

The core server logic becomes a pure function:

```typescript
type FetchHandler = (request: Request) => Promise<Response>;

export function createJayHandler(options: HandlerOptions): FetchHandler {
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

The server entry wraps this in Node.js `http.createServer` using `node:http` adapters (or the built-in `Readable.toWeb`/`Readable.fromWeb` bridges).

#### Handler Module Changes

| File | Current API | New API |
|------|------------|---------|
| `page-handler.ts` | `(res: ServerResponse, ...) → void` | `(...) → Response` (streaming via `ReadableStream`) |
| `action-handler.ts` | `(req: IncomingMessage, res: ServerResponse) → void` | `(request: Request) → Response` |
| `static-handler.ts` | `(req, res, basePath, urlPrefix) → boolean` | **Removed** — CDN serves static files |
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

### 4. Build Pipeline Changes

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

### 5. Public Folder Handling

During build Phase 2 (finalize), recursively copy the project's `public/` folder to `frontend/public/`. The main server references public files via `publicBasePath + "public/"` for any URL patterns, but since the CDN serves everything under `frontend/`, the public files are available at `{cdnBase}/public/...`.

In dev mode, the dev server already serves `public/` via Express static middleware — no change needed there.

## Implementation Plan

### Phase 1: Split build output

1. **Update `build-pipeline.ts`** — add `frontendDir` and `backendDir` paths derived from build root
2. **Update `shared-chunks-build.ts`** — output to `frontend/shared/`
3. **Update `server-code-build.ts`** — output to `backend/server/`
4. **Update `instance-pipeline.ts`** — split instance outputs between frontend and backend
5. **Update `route-manifest.ts`** — write manifest to `backend/`, adjust paths in manifest entries
6. **Add public folder copy** in finalize phase
7. **Update `BuildOptions`** — add `publicFolder` path

### Phase 2: Cloudflare-compatible fetch handler

1. **Create `handler.ts`** — `createJayHandler()` returning `FetchHandler`
2. **Rewrite `page-handler.ts`** — return `Response` with `ReadableStream`
3. **Rewrite `action-handler.ts`** — `Request` → `Response`
4. **Remove `static-handler.ts`** — no longer needed (CDN serves statics)
5. **Update `main-server.ts`** — thin Node adapter over `createJayHandler()`
6. **Update `artifact-store.ts`** — resolve against backend dir only

### Phase 3: Update CLI and renderer

1. **Update `run-production.ts`** — pass `publicBasePath` from config/CLI, `publicFolder` path
2. **Update renderer server** — invalidation writes to backend folder only (client bundles also go to frontend)
3. **Update tests**

## Trade-offs

- **Two output folders vs. one**: Slightly more complex build pipeline, but clean deployment separation. No runtime overhead.
- **Removing static handler**: The server can't self-host static files anymore. For local testing, either use a reverse proxy or add a `--self-host` flag that re-enables static serving from the frontend folder.
- **Fetch API refactor**: More code change upfront but cleaner abstraction — the handler becomes platform-agnostic (testable without a running server, works with any runtime that supports Fetch API).

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