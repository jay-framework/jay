# Serving Modes

## Overview

The production server supports three deployment modes, all using the same build output:

| Mode             | Static files                   | Server                                                      | Use case                             |
| ---------------- | ------------------------------ | ----------------------------------------------------------- | ------------------------------------ |
| **Self-hosted**  | Server serves from `frontend/` | `jay-stack serve`                                           | Local testing, standalone deployment |
| **CDN**          | Uploaded to external CDN       | `jay-stack serve --static-base-url <url> --no-serve-static` | Production with CDN                  |
| **BaaS (fetch)** | Uploaded to CDN                | `createJayFetchHandler()`                                   | Wix, Cloudflare Workers              |

## Self-Hosted (Default)

The server serves both pages and static files. No external CDN needed.

```bash
jay-stack build
jay-stack serve --port 4000
```

Static files are served from `build/v{n}/frontend/` at these URL prefixes:

- `/shared/` — framework client chunks
- `/pages/` — per-page client bundles and CSS
- `/` — public folder assets (images, fonts, JSON)

## CDN Mode

Static files are hosted on an external CDN. The server only handles page requests and actions.

```bash
jay-stack build

# Upload frontend/ to CDN
# e.g., aws s3 sync build/v1/frontend/ s3://my-bucket/app/1.0.0/

# Start server with CDN URL
jay-stack serve --port 4000 \
  --static-base-url https://cdn.example.com/app/1.0.0/ \
  --no-serve-static
```

The server generates import maps, CSS links, and client bundle URLs prefixed with `--static-base-url`. It does not serve static files itself.

## BaaS Mode (Custom Artifact Store)

For platforms where backend files are not on the local filesystem (e.g., stored in a cloud database), use `createJayFetchHandler` with a custom `ArtifactStore` and pre-imported modules:

```typescript
import { createJayFetchHandler } from '@jay-framework/jay-fetch-handler';

const handler = createJayFetchHandler({
  artifactStore: customStore, // Custom ArtifactStore implementation
  staticBaseUrl: 'https://cdn.example.com/app/1.0.0/',
  plugins: [
    // Pre-imported plugin init modules
    { name: 'my-plugin', init: myPluginInit },
  ],
  actionModules: [
    // Pre-imported action modules
    { module: myPluginModule, name: 'my-plugin' },
  ],
});

export default { fetch: handler };
```

Pre-imported modules bypass filesystem discovery — the entry file bundles everything with esbuild. See [fetch-handler.md](fetch-handler.md) for the `ArtifactStore` interface and full BaaS example.

For serve-only imports without build-time dependencies, use `@jay-framework/production-server/serve`.

## CLI Flags

### jay-stack serve

| Flag                      | Default             | Description                                                 |
| ------------------------- | ------------------- | ----------------------------------------------------------- |
| `--port <n>`              | `3000`              | Server port                                                 |
| `--version <n>`           | from package.json   | Build version to serve                                      |
| `--role <role>`           | `main`              | `main` (pages + actions) or `renderer` (webhooks + rebuild) |
| `--static-base-url <url>` | `/`                 | Base URL for all browser-facing assets                      |
| `--no-serve-static`       | (serves by default) | Disable serving static files from `frontend/`               |
| `--test-mode`             | off                 | Enable `/_jay/health` and `/_jay/shutdown` endpoints        |
| `-v, --verbose`           | off                 | Verbose logging                                             |

### jay-stack build

| Flag            | Default           | Description                      |
| --------------- | ----------------- | -------------------------------- |
| `--version <n>` | from package.json | Build version number             |
| `--no-minify`   | minified          | Disable minification (debugging) |
| `-v, --verbose` | off               | Verbose logging                  |

## Test Mode

When `--test-mode` is enabled, the server exposes:

| Endpoint         | Method | Response                                                   |
| ---------------- | ------ | ---------------------------------------------------------- |
| `/_jay/health`   | GET    | `{"status":"ready","port":4000,"uptime":5.2}`              |
| `/_jay/shutdown` | POST   | `{"status":"shutting_down"}` — gracefully stops the server |

Use for smoke tests and CI pipelines. The dev server (`jay-stack dev --test-mode`) has the same endpoints.

## Two-Server Architecture

For data-driven sites, run two servers:

```bash
# Main server — handles page requests
jay-stack serve --role main --port 4000

# Renderer server — handles webhooks and rebuilds
jay-stack serve --role renderer --port 4001
```

The renderer server listens for data change webhooks and rebuilds affected page instances. The main server picks up the updated artifacts automatically (it re-reads the manifest when `build-metadata.json` changes).
