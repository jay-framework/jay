# Fetch Handler Package

## Overview

`@jay-framework/jay-fetch-handler` exports a standard `(Request) → Response` function for BaaS platforms (Wix, Cloudflare Workers) where an HTTP server is not needed — the platform provides the HTTP layer and calls the fetch function directly.

## Installation

```bash
npm install @jay-framework/jay-fetch-handler
```

## API

```typescript
import { createJayFetchHandler } from '@jay-framework/jay-fetch-handler';

const handler = createJayFetchHandler(options);
// handler: (request: Request) => Promise<Response>
```

### Options

```typescript
interface JayFetchHandlerOptions {
  // Artifact source (one required)
  backendDir?: string; // Path to build/v{n}/backend/ (creates FilesystemArtifactStore)
  artifactStore?: ArtifactStore; // Custom store for non-filesystem backends (DL#143)

  staticBaseUrl?: string; // Base URL for browser assets (default: '/')
  frontendDir?: string; // When set, serves static files from this directory

  // Pre-imported modules — for bundled entry.mjs (DL#143)
  plugins?: PreImportedPlugin[];
  actionModules?: Array<{ module: Record<string, unknown>; name: string }>;
}
```

| Option          | Required | Description                                                                                                                          |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `backendDir`    | \*       | Path to the backend build directory. Creates a `FilesystemArtifactStore` internally                                                  |
| `artifactStore` | \*       | Custom `ArtifactStore` implementation (e.g., cloud storage). Use instead of `backendDir`                                             |
| `staticBaseUrl` | No       | URL prefix for import maps, CSS links, and client bundles. Set to your CDN URL for external hosting. Default: `/`                    |
| `frontendDir`   | No       | When provided, the handler serves static files from this directory. Omit for CDN deployments where static files are hosted elsewhere |
| `plugins`       | No       | Pre-imported plugin init modules. Bypasses filesystem discovery — use for bundled deployments                                        |
| `actionModules` | No       | Pre-imported action modules. Bypasses filesystem discovery — use for bundled deployments                                             |

\* One of `backendDir` or `artifactStore` is required.

## Usage — Self-Hosted

```typescript
import { createJayFetchHandler } from '@jay-framework/jay-fetch-handler';

const handler = createJayFetchHandler({
  backendDir: './build/v1/backend',
  staticBaseUrl: '/',
  frontendDir: './build/v1/frontend',
});
```

## Usage — CDN Mode

```typescript
const handler = createJayFetchHandler({
  backendDir: './build/v1/backend',
  staticBaseUrl: 'https://static.parastorage.com/services/my-app/1.0.0/',
});

export default { fetch: handler };
```

The BaaS runtime calls `handler(request)` for each incoming HTTP request.

## Usage — BaaS with Custom Artifact Store

For deployments where backend files are not on the local filesystem (e.g., stored in a cloud database), provide a custom `ArtifactStore` and pre-imported modules:

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
  plugins: [{ name: 'wix-stores', init: wixStoresInit }],
  actionModules: [{ module: wixStoresModule, name: 'wix-stores' }],
});

export default { fetch: handler };
```

The `ArtifactStore` interface:

```typescript
interface ArtifactStore {
  readManifest(): Promise<RouteManifest>;
  readCacheData(relativePath: string): Promise<CacheEntry>;
  readPagePartsConfig(relativePath: string): Promise<any>;
  loadServerElement(relativePath: string): Promise<ServerElementModule>;
  loadModule(modulePath: string, local?: boolean): Promise<any>;
  getAssetPath(relativePath: string): string;
  getBuildDir(): string;
}
```

`loadModule` handles all module loading — server elements, page components, headless components. The `local` flag indicates whether the path is relative to the build directory (`true`) or an npm package (`false`). For filesystem deployments, local modules resolve from `basePath` and npm modules use bare `import()`. BaaS implementations resolve all modules from their pre-bundled registry, ignoring the `local` flag.

For serve-only imports (no build-time dependencies), use `@jay-framework/production-server/serve`.

## Usage — Cloudflare Workers

```typescript
import { createJayFetchHandler } from '@jay-framework/jay-fetch-handler';

const handler = createJayFetchHandler({
  backendDir: './backend',
  staticBaseUrl: 'https://cdn.example.com/assets/',
});

export default { fetch: handler };
```

## Usage — Standalone with HTTP Server

```typescript
import { createJayFetchHandler } from '@jay-framework/jay-fetch-handler';
import http from 'node:http';
import { Readable } from 'node:stream';

const handler = createJayFetchHandler({
  backendDir: './build/v1/backend',
  staticBaseUrl: '/',
  frontendDir: './build/v1/frontend',
});

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
    const init: RequestInit = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = Readable.toWeb(req) as ReadableStream;
      (init as any).duplex = 'half';
    }
    const request = new Request(url, init);
    const response = await handler(request);

    const resHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });
    res.writeHead(response.status, resHeaders);
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  })
  .listen(4000);
```

This is what `jay-stack serve` does internally. Use the CLI for standard deployments; use the handler directly when you need custom server logic.

## Behavior

The handler processes requests in this order:

1. **Actions** — `/_jay/actions/*` routes to the action registry
2. **Static files** — if `frontendDir` is set, checks `frontend/`, then `frontend/public/`
3. **Page requests** — matches against the route manifest, runs fast-phase SSR, streams HTML

Initialization (loading manifest, running `init.ts`, registering actions) happens lazily on the first request.
