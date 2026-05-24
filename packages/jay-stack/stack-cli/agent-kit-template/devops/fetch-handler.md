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
  backendDir: string; // Path to build/v{n}/backend/
  staticBaseUrl?: string; // Base URL for browser assets (default: '/')
  frontendDir?: string; // When set, serves static files from this directory
}
```

| Option          | Required | Description                                                                                                                          |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `backendDir`    | Yes      | Path to the backend build directory containing manifest, server modules, and pre-rendered files                                      |
| `staticBaseUrl` | No       | URL prefix for import maps, CSS links, and client bundles. Set to your CDN URL for external hosting. Default: `/`                    |
| `frontendDir`   | No       | When provided, the handler serves static files from this directory. Omit for CDN deployments where static files are hosted elsewhere |

## Usage — Wix BaaS

```typescript
import { createJayFetchHandler } from '@jay-framework/jay-fetch-handler';

const handler = createJayFetchHandler({
  backendDir: './build/v1/backend',
  staticBaseUrl: 'https://static.parastorage.com/services/my-app/1.0.0/',
});

export default { fetch: handler };
```

The BaaS runtime calls `handler(request)` for each incoming HTTP request.

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
