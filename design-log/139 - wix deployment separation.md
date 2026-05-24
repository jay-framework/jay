# DL#139: Wix Deployment — Build Separation & Fetch Handler Package

## Background

The production server (DL#134b) currently uses Node.js `http.createServer` with `IncomingMessage`/`ServerResponse`. All build artifacts live in a single `build/v{n}/` folder. For Wix backend-as-a-service deployment:

- The runtime calls a **fetch function** (`(Request) → Response`) exported from a module — similar to how `@wix/runtime-fetch-adapter` wraps Astro for BaaS (see `tmp/cloud-runtime-baas/packages/wix-runtime-fetch-adapter`)
- **Frontend assets** (JS, CSS, images) are uploaded to **Wix statics CDN** — they don't live on the server
- **Backend artifacts** (server modules, pre-rendered HTML, manifests) stay on the server

The public folder (`./public` in project root) contains media files (images, fonts, etc.) and is currently only served by the dev server — the production build ignores it.

## Problem

1. The main server uses `node:http` types (`IncomingMessage`, `ServerResponse`) throughout all handlers. The serve-time API should be a standard `fetch(request: Request): Response` function exported from a module — the same interface used by BaaS runtimes, Cloudflare Workers, and other platforms. The HTTP server is just one consumer of this function.

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

A7: Currently `handleStaticRequest` serves `shared/` and `pre-rendered/` files from the build folder via filesystem. After separation, static file serving becomes optional — controlled by whether `frontendDir` is passed to the fetch handler. When provided, the handler serves static files from `frontend/` (for local/standalone deployments). When omitted, all browser-facing URLs use the CDN base path via `staticBaseUrl`. This way the same fetch handler works for Wix BaaS deployment, standalone, and local testing.

**Q8: What about the import map URLs — they currently point to `/shared/filename.js`?**

A8: They need to point to the CDN URL. Currently `publicBasePath` in the manifest is hardcoded to `/`. After this change, `publicBasePath` is removed from the manifest — the fetch handler receives `staticBaseUrl` as a creation-time option and prepends it when generating import maps, CSS links, and script tags. The import map builder and link generation keep the same logic, but read the base URL from the handler options instead of the manifest.

## Design

### 1. Fetch Handler Package

A new package `@jay-framework/jay-fetch-handler` that exports a `fetch(request: Request) → Promise<Response>` function. This is the primary serve-time API — not an HTTP server.

The package:

- Imports internals from `@jay-framework/production-server` (artifact store, route matcher, page handler, action handler)
- Composes them into a single fetch function
- Is consumed directly by BaaS runtimes (Wix, Cloudflare) or wrapped in an HTTP server by `jay-stack serve`

```
┌─────────────────────────────────────────────────────┐
│  BaaS runtime / jay-stack serve                     │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  @jay-framework/jay-fetch-handler             │  │
│  │  createJayFetchHandler(options) → fetch        │  │
│  │                                               │  │
│  │  (Request) → Response                         │  │
│  │  • page requests → SSR streaming              │  │
│  │  • actions → JSON responses                   │  │
│  │  • static files (optional) → from frontend/   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Package API:**

```typescript
interface JayFetchHandlerOptions {
  backendDir: string;
  staticBaseUrl?: string; // defaults to '/'
  frontendDir?: string; // when set, serves static files from this dir
}

export function createJayFetchHandler(
  options: JayFetchHandlerOptions,
): (request: Request) => Promise<Response>;
```

**Usage — Wix BaaS deployment:**

```typescript
import { createJayFetchHandler } from '@jay-framework/jay-fetch-handler';

const handler = createJayFetchHandler({
  backendDir: './build/v1/backend',
  staticBaseUrl: 'https://static.parastorage.com/services/jay-app/1.0.0/',
});

export default { fetch: handler };
```

**Usage — self-hosted (jay-stack serve):**

```typescript
import { createJayFetchHandler } from '@jay-framework/jay-fetch-handler';
import http from 'node:http';

const handler = createJayFetchHandler({
  backendDir: './build/v1/backend',
  staticBaseUrl: '/',
  frontendDir: './build/v1/frontend', // serve static files from disk
});

http
  .createServer(async (req, res) => {
    const request = toFetchRequest(req);
    const response = await handler(request);
    await pipeFetchResponse(response, res);
  })
  .listen(4000);
```

The `jay-stack serve` CLI command creates the HTTP wrapper. The fetch handler is the universal core.

**No `.jay-deploy` config file.** The `staticBaseUrl` and `frontendDir` are passed programmatically. For `jay-stack serve`, these come from CLI flags (`--static-base-url`, `--serve-static`). Defaults match current behavior: `staticBaseUrl: '/'`, static files served from `frontend/`.

`publicBasePath` is **removed from the manifest**. The manifest contains only relative paths. The fetch handler receives `staticBaseUrl` at creation time and prepends it when generating import maps, CSS links, and script tags.

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

### 4. Fetch Handler Package (`@jay-framework/jay-fetch-handler`)

A new package in `packages/jay-stack/jay-fetch-handler/`. Imports internals from `@jay-framework/production-server` and exposes a single `createJayFetchHandler` function.

#### Package Structure

```
packages/jay-stack/jay-fetch-handler/
├── package.json
├── lib/
│   ├── index.ts              # Public API: createJayFetchHandler + types
│   ├── fetch-handler.ts      # Core fetch handler composition
│   ├── static-files.ts       # Static file serving (Request → Response | null)
│   └── http-adapter.ts       # Request/Response conversion utilities
```

#### Core Implementation

```typescript
// lib/fetch-handler.ts
import { FilesystemArtifactStore } from '@jay-framework/production-server';
import { matchRequest } from '@jay-framework/production-server';
import { initializeServices } from '@jay-framework/production-server';

export function createJayFetchHandler(options: JayFetchHandlerOptions) {
  const { backendDir, staticBaseUrl = '/', frontendDir } = options;
  const artifacts = new FilesystemArtifactStore(backendDir);
  let initialized = false;

  return async (request: Request): Promise<Response> => {
    if (!initialized) {
      await initialize(backendDir, artifacts);
      initialized = true;
    }

    const url = new URL(request.url);

    // Static files (when frontendDir is provided)
    if (frontendDir) {
      const staticResponse = await serveStaticFile(url.pathname, frontendDir);
      if (staticResponse) return staticResponse;
    }

    // Actions
    if (isActionRequest(url.pathname)) {
      return handleActionRequest(request);
    }

    // Page requests
    const manifest = await artifacts.readManifest();
    const match = matchRequest(manifest, url.pathname);

    if (!match) {
      return new Response('Not Found', { status: 404 });
    }

    return handlePageRequest(match, manifest, url, artifacts, staticBaseUrl);
  };
}
```

#### Handler Module Changes

The page and action handlers in `@jay-framework/production-server` are refactored to use Fetch API types:

| File                | Current API                                          | New API                                             |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| `page-handler.ts`   | `(res: ServerResponse, ...) → void`                  | `(...) → Response` (streaming via `ReadableStream`) |
| `action-handler.ts` | `(req: IncomingMessage, res: ServerResponse) → void` | `(request: Request) → Response`                     |
| `static-handler.ts` | `(req, res, basePath, urlPrefix) → boolean`          | `(pathname, frontendDir) → Response \| null`        |

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

#### CLI Integration (`jay-stack serve`)

The `jay-stack serve` command imports the fetch handler and wraps it in an HTTP server:

```typescript
// run-production.ts
import { createJayFetchHandler } from '@jay-framework/jay-fetch-handler';

async function runServe(options) {
  const handler = createJayFetchHandler({
    backendDir: path.join(buildDir, 'backend'),
    staticBaseUrl: options.staticBaseUrl ?? '/',
    frontendDir: options.serveStatic !== false ? path.join(buildDir, 'frontend') : undefined,
  });

  startHttpServer(handler, options.port);
}
```

New CLI flags for `jay-stack serve`:

- `--static-base-url <url>` — base URL for browser-facing assets (default: `/`)
- `--no-serve-static` — disable static file serving from frontend/

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

### Phase 2: Refactor handlers to Fetch API

1. **Rewrite `page-handler.ts`** — return `Response` with `ReadableStream`
2. **Rewrite `action-handler.ts`** — `Request` → `Response`
3. **Create `static-files.ts`** — `(pathname, frontendDir) → Response | null`
4. **Update `artifact-store.ts`** — resolve against backend dir only

### Phase 3: Create `@jay-framework/jay-fetch-handler` package

1. **Create package** in `packages/jay-stack/jay-fetch-handler/` with package.json, tsconfig
2. **Create `fetch-handler.ts`** — `createJayFetchHandler(options)` composing handlers from production-server
3. **Create `http-adapter.ts`** — `toFetchRequest()` and `pipeFetchResponse()` utilities
4. **Export public API** from `index.ts`

### Phase 4: Update CLI

1. **Update `run-production.ts`** — import `createJayFetchHandler`, wrap in HTTP server
2. **Add CLI flags** — `--static-base-url`, `--no-serve-static`
3. **Update `main-server.ts`** — thin wrapper using the fetch handler
4. **Update renderer server** — invalidation writes to both backend and frontend folders

### Phase 5: Tests and smoke test

1. **Update existing production-server tests**
2. **Update DL140 smoke test** — add CDN mode tests (Milestone 2)
3. **Add fetch handler unit tests** in new package

## Trade-offs

- **Two output folders vs. one**: Slightly more complex build pipeline, but clean deployment separation. No runtime overhead.
- **Separate fetch handler package**: One more package in the monorepo, but cleanly separates the serve-time API from the build-time logic. The production-server package stays focused on building; the fetch handler package is the runtime.
- **No deploy config file**: CLI flags (`--static-base-url`, `--no-serve-static`) are simpler than a YAML config file. For BaaS deployment, the consumer passes options programmatically. No config file to maintain or sync.
- **Fetch handler as universal core**: All code paths go through the same `(Request) → Response` function. The HTTP server in `jay-stack serve` is a thin wrapper. The same handler runs identically in BaaS, Cloudflare Workers, or standalone Node.js.

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

## Implementation Results — Phase 1: Split Build Output

### What was implemented

Phase 1 complete. The build now produces `build/v{n}/frontend/` and `build/v{n}/backend/` with clean separation.

**Build output structure:**

- `backend/` — `route-manifest.json`, `build-metadata.json`, `server/` (compiled page.ts + actions + init), `pre-rendered/` (jay-html, cache.json, server-element.js, page-parts.json)
- `frontend/` — `shared/` (framework client chunks), `pages/` (instance client bundles + CSS), `public/` (copied from project)

**`publicBasePath` removed from manifest and `BuildOptions`.** The manifest is now environment-agnostic — all paths are relative to their respective root directory (backend or frontend).

### Files changed

**`production-server` package:**

- `lib/types.ts` — removed `publicBasePath` from `RouteManifest` and `BuildOptions`
- `lib/builder/build-pipeline.ts` — derive `backendDir`/`frontendDir`, route outputs to correct dirs, copy `public/` to frontend
- `lib/builder/instance-pipeline.ts` — added `backendDir`/`frontendDir` to `InstanceBuildContext`, split instance outputs (backend: jay-html, cache, server-element; frontend: client bundle, CSS), rewrite headfull component paths for build output resolution
- `lib/builder/route-manifest.ts` — action paths relative to `backendDir`
- `lib/serve/main-server.ts` — read from `backend/`, serve static files from `frontend/shared/`, `frontend/pages/`, `frontend/public/`; made `publicBasePath` optional
- `lib/serve/page-handler.ts` — hardcode `/` as static base URL (will become configurable in Phase 2)
- `lib/invalidation/rebuild.ts` — manifest and metadata paths under `backend/`
- `lib/shared/init-services.ts` — no changes needed (receives `backendDir` which contains `server/`)
- `test/build.test.ts` — updated paths for `backend/`/`frontend/` split
- `test/serve.test.ts` — updated manifest and shared-manifest paths
- `tsconfig.json` — added `"node"` to types array (fixes WebStorm resolution for `node:*` imports)

**`stack-cli` package:**

- `lib/run-production.ts` — removed `publicBasePath` from build and serve calls

### Verified on

- **smoke-test project** (DL#140) — 28/28 tests passing (dev mode + production self-hosted)
- **production-server unit tests** — 85/85 passing (build, serve, param-routing)
- **golf project** — confirmed working by user

## Implementation Results — Phases 2-4: Fetch API + Package + CLI

### What was implemented

Phases 2-4 complete. Handlers refactored to Fetch API, new `@jay-framework/jay-fetch-handler` package created, main-server converted to use fetch handlers.

### Phase 2: Fetch API handlers (in `production-server`)

New files alongside the old Node.js handlers:

- `lib/serve/fetch-page-handler.ts` — `fetchPageRequest()` returns `Response` with `ReadableStream` for streaming SSR, accepts `staticBaseUrl` for URL generation
- `lib/serve/fetch-action-handler.ts` — `fetchActionRequest(request)` accepts Fetch `Request`, uses `request.text()` for body parsing, returns `Response`
- `lib/serve/fetch-static-handler.ts` — `fetchStaticFile(pathname, frontendDir)` returns `Response | null`, tries direct path then `public/` subdirectory for root-level assets
- All exported from `lib/index.ts`

Old Node.js handlers (`page-handler.ts`, `action-handler.ts`, `static-handler.ts`) kept but no longer used by main-server.

### Phase 3: `@jay-framework/jay-fetch-handler` package

New package at `packages/jay-stack/jay-fetch-handler/`:

- `createJayFetchHandler(options)` — composes artifact store, service init, action registration, and all Fetch API handlers into a single `(Request) → Response` function
- Lazy initialization on first request
- Options: `backendDir` (required), `staticBaseUrl` (default `/`), `frontendDir` (optional — enables static file serving)

### Phase 4: main-server.ts converted

- Uses Fetch API handlers internally via `toFetchRequest()` / `pipeFetchResponse()` conversion
- `toFetchRequest()` — converts Node.js `IncomingMessage` to Fetch `Request` (including streaming body via `Readable.toWeb`)
- `pipeFetchResponse()` — streams Fetch `Response` body back to Node.js `ServerResponse`

### Verified on

- **smoke-test** — 28/28 passing (dev + production self-hosted, including public assets)
- **production-server unit tests** — 85/85 passing
- **Public folder fix** — `fetchStaticFile` checks `frontend/public/` fallback for root-level assets (images, JSON)
