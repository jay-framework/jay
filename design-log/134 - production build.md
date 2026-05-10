# Design Log #134 — Production Build

**Date:** May 10, 2026
**Status:** Draft
**Related:** #34 (jay stack), #86 (workflow lifecycle), #94 (SSR streaming), #110 (slow render cache), #52 (code splitting)

## Background

Jay Stack has a working dev server (`jay-stack dev`) that handles everything in a single process: route scanning, slow rendering, fast rendering, SSR, hydration, action execution, and Vite-based asset serving. This works well for development but isn't suitable for production:

- **Vite runs at request time** — every SSR render compiles server elements on-the-fly via `vite.ssrLoadModule()`, and client assets are served through Vite's dev middleware
- **Slow render runs per-request** — cache-miss requests trigger the full slow pipeline, blocking the response
- **No optimized bundles** — client code is served as unbundled ES modules via Vite dev server
- **Single process** — a slow render blocking the event loop affects request handling

The dev server architecture is in `packages/jay-stack/dev-server/`, with runtime support split between `stack-server-runtime/` (slow render, fast render, SSR generation) and `stack-client-runtime/` (hydration, signals, action calls).

## Problem

We need a production deployment model where:

1. Pages are pre-compiled and pre-rendered — no Vite at request time
2. Client assets are bundled and optimized — tree-shaken, minified, code-split
3. Slow rendering happens ahead of time (build or data change) — not on the request path
4. Request handling is fast — just fast phase + SSR with pre-compiled artifacts
5. Data changes trigger targeted re-rendering without downtime

## Two-Server Architecture

```
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│       SLOW RENDER SERVER        │     │          MAIN SERVER             │
│   (build-time / data-change)    │     │      (request-time)              │
│                                 │     │                                  │
│  - Compile jay-html → artifacts │     │  - Route matching                │
│  - Run slow phase per route     │     │  - Run fast phase (SSR)          │
│  - Bundle client JS/CSS (Vite)  │     │  - Execute actions               │
│  - Produce route manifest       │     │  - Serve static assets           │
│  - Watch for data change events │     │  - Read pre-built artifacts      │
│                                 │     │                                  │
│  Output: build/                 │────▶│  Input: build/                   │
│    pre-rendered/                │     │    (reads artifacts from disk     │
│    server-elements/             │     │     or shared storage)           │
│    client-bundles/              │     │                                  │
│    route-manifest.json          │     │                                  │
└─────────────────────────────────┘     └──────────────────────────────────┘
```

Both servers could be **the same codebase running in different modes** (e.g., `jay-stack serve --role=renderer` vs `jay-stack serve --role=main`), sharing:
- Service initialization (`init.ts`)
- Plugin loading
- Component definitions (`page.ts`)
- Action handlers

### Why Two Servers?

The slow render can be expensive (database queries, API calls, template compilation). Keeping it off the request path means:
- Main server startup is instant — just load pre-built artifacts
- Request latency is predictable — no cache-miss slow renders
- Slow renders can run on different hardware (more CPU, less memory)
- Data change re-renders don't affect serving

## Concern Map

### Concern 1: Build Artifacts — What the Slow Render Server Produces

The dev server today produces these artifacts on-the-fly:

| Artifact | Dev Server | Production |
|---|---|---|
| Pre-rendered jay-html (slow data baked in) | `build/pre-rendered/*.jay-html` with `<script type="application/jay-cache">` metadata | Same format, all routes pre-rendered at build time |
| Server element modules (for SSR) | `.ts` files in `build/server-elements/`, loaded via `vite.ssrLoadModule()` | Pre-compiled `.js` files, loaded via `import()` — no Vite |
| Hydration scripts (client) | Served on-demand via Vite plugin (`?jay-hydrate` query) | Bundled into client JS by Vite build |
| Client JS bundles | Unbundled ES modules via Vite dev server | Vite production build — tree-shaken, minified, code-split |
| CSS | Written to build dir, served via `/@fs/` prefix | Extracted and optimized by Vite build |
| Route manifest | In-memory `scanRoutes()` result | `route-manifest.json` — static file listing all routes, their params, and artifact paths |

**Questions:**

**Q1: Should server element modules be compiled to plain JS or kept as TS loaded through a lightweight transformer?**

**Q2: Should the Vite build produce a single entry per page, or a shared chunk strategy?**

**Q3: Where do pre-rendered files live in deployment — local filesystem, object storage, or embedded in the server?**

### Concern 2: Main Server Runtime — Request Handling Without Vite

The main server needs to handle requests using only pre-built artifacts:

```
HTTP Request
  │
  ├── /_jay/actions/:name  →  Action Router (same as dev)
  │
  ├── /static/*            →  Serve bundled client assets
  │
  └── /*                   →  Page Route
        │
        ├── Match route from manifest
        ├── Load pre-rendered jay-html (slow data baked in)
        ├── Load compiled server element module
        ├── Run fast phase (call component's fastRender)
        ├── Merge fast ViewState into server element
        ├── Execute renderToStream → HTML
        ├── Append client bundle <script> tags
        └── Send response
```

Key differences from dev server:
- **No Vite** — server elements are pre-compiled JS, client assets are static files
- **No slow phase on request path** — only fast phase + SSR
- **Route manifest** — static JSON instead of filesystem scanning
- **No file watching** — artifacts are immutable until slow render server updates them

**Questions:**

**Q4: How does the main server load page components (`page.ts`) for the fast phase? In dev, Vite's SSR module loading handles TypeScript + imports. In production, these need to be pre-compiled to JS too.**

**Q5: Should the main server use Express like the dev server, or something lighter?**

### Concern 3: Vite Build — Client-Side Bundle Production

The dev server serves client code through Vite's dev middleware (unbundled, with HMR). Production needs a proper Vite build:

```
Input:                           Output:
  src/pages/                       build/client-bundles/
    home/page.jay-html      →        assets/
    products/[slug]/                    home-[hash].js
      page.jay-html          →          products-slug-[hash].js
      page.ts                →          shared-[hash].js
                                        vendor-[hash].js
                                      home.html  (or manifest entry)
                                      products/[slug].html
```

The Vite build needs to:
1. Discover all page entry points from routes
2. Compile each page's jay-html hydration target as an entry
3. Include the composite component wiring (from `generate-client-script.ts`)
4. Tree-shake server-only code (`withSlowlyRender`, `withFastRender`, services)
5. Code-split shared runtime (`@jay-framework/component`, `stack-client-runtime`)
6. Output a manifest mapping routes to their JS/CSS assets

**Questions:**

**Q6: The existing `compiler-jay-stack` Vite plugin handles on-demand compilation. Does it work for `vite build` as-is, or does it need a production mode?**

**Q7: How do we handle pages with dynamic params (`[slug]`)? Each param combination shares the same client bundle but has different SSR output.**

### Concern 4: Slow Phase Execution — Build Time and Data Change

**Initial Build:**

```
For each route in project:
  For each param combination (from loadParams):
    1. Run slowlyRender(params) → slowViewState + carryForward
    2. Pre-render jay-html with slow ViewState
    3. Write pre-rendered file to build/
    4. Compile server element from pre-rendered jay-html
    5. Write server element to build/
```

This is what the dev server does on first request, but done eagerly for all routes.

**Data Change Re-render:**

When external data changes (product updated, content edited):

```
Slow Render Server receives data change event
  │
  ├── Identify affected routes (by contract dependency?)
  ├── Re-run slow phase for those routes
  ├── Write updated pre-rendered jay-html
  ├── Re-compile server element
  └── Signal main server to reload affected artifacts
```

**Questions:**

**Q8: How does the slow render server receive data change events? Options: HTTP webhook endpoint, message queue, polling, filesystem watcher.**

**Q9: How does the main server know artifacts were updated? Options: filesystem polling, IPC signal, shared event bus, artifact versioning.**

**Q10: Should the slow render server also re-run the Vite client build on data change? Client bundles shouldn't change on data change (only on code change), so probably not.**

**Q11: Can slow render and Vite build run in parallel, or does the Vite build depend on pre-rendered jay-html?**

### Concern 5: Action Execution and Data Mutation

Actions (`makeJayAction`, `makeJayQuery`, `makeJayStream`) run on the main server. The action router (`action-router.ts`) is largely environment-agnostic — it receives HTTP requests, finds the action handler, executes it, returns the result.

In production:
- Actions run on the main server (same as dev)
- Action handlers are pre-compiled JS (no Vite)
- Actions that mutate data should trigger slow re-render

**Questions:**

**Q12: When an action mutates data, how does the main server notify the slow render server? Options: direct HTTP call, shared event bus, the mutation itself triggers re-render (if watching the data source).**

**Q13: Should actions be code-split from page components, or bundled together in the server build?**

### Concern 6: Service Lifecycle in Two Servers

Services (`makeJayInit`, service markers) are initialized once and injected into slow render, fast render, and actions. In the two-server model:

- **Slow render server** needs services for `slowlyRender()` calls
- **Main server** needs services for `fastRender()` and action execution
- Both import the same `init.ts`

This means services are initialized independently on each server. For stateless services (API clients, database connections), this is fine. For stateful services (in-memory caches, connection pools), each server has its own instance.

**Questions:**

**Q14: Are there services that need to be shared between the two servers? If so, we need an external state store.**

### Concern 7: Plugin System in Production

Plugins provide:
- Headless components (contracts + component logic)
- Actions
- Routes (plugin pages)
- Services
- Client init code

In production:
- Plugin routes merge with project routes (project takes precedence) — same as dev
- Plugin components are compiled and bundled with the page that uses them
- Plugin actions are registered in the action router
- Plugin services are initialized with project services

**Questions:**

**Q15: Are plugin packages pre-compiled (published as JS), or do they need compilation during the production build?**

### Concern 8: Static Asset Serving

Dev server uses Vite middleware to serve all assets. Production options:

1. **Main server serves everything** — simplest, but adds load to the server
2. **CDN for client bundles** — main server serves HTML, CDN serves JS/CSS/images
3. **Reverse proxy** — nginx/CloudFront in front, main server only handles SSR + actions

**Questions:**

**Q16: Should the build produce assets with content hashes for cache busting?**

**Q17: Should the main server support a `publicBasePath` for CDN-hosted assets (e.g., `https://cdn.example.com/assets/`)?**

## Child Design Logs Needed

Each concern above maps to a potential child design log:

| # | Focus Area | Key Questions |
|---|---|---|
| A | **Build Pipeline** — Vite production build, server element compilation, artifact layout | Q1, Q2, Q6, Q7, Q11 |
| B | **Main Server** — Request handling without Vite, route manifest, artifact loading | Q3, Q4, Q5, Q16, Q17 |
| C | **Slow Render Server** — Build-time rendering, data change re-render, artifact updates | Q8, Q9, Q10, Q12 |
| D | **Server Build** — Compiling page.ts, actions, services, plugins to production JS | Q4, Q13, Q14, Q15 |

Suggested order: **A → D → B → C** — build pipeline first (defines artifact format), then server build (compiles the server code), then main server (consumes artifacts), then slow render server (produces artifacts on change).

## Design Decisions (Pending Discussion)

### Same codebase, two roles

Both servers share the same codebase and entry point. A mode flag determines which role to run:

```bash
jay-stack serve --role=renderer   # Slow render server
jay-stack serve --role=main       # Main server
jay-stack build                   # One-time build (renderer runs once and exits)
```

`jay-stack build` is the slow render server running once (no data change watching). It produces all artifacts, then exits. `jay-stack serve --role=renderer` is the same but stays alive for data change events.

### Artifact directory as the contract

The `build/` directory is the interface between the two servers. Its structure is the contract:

```
build/
  route-manifest.json              # Routes, params, artifact paths
  pre-rendered/                    # Slow-rendered jay-html per route/params
    home/page.jay-html
    products/[slug]/
      page_abc123.jay-html
      page_def456.jay-html
  server-elements/                 # Compiled SSR render functions
    home/page.server-element.js
    products/[slug]/page.server-element.js
  server/                          # Compiled page.ts, actions, services
    pages/
      home/page.js
      products/[slug]/page.js
    actions/
      addToCart.js
    init.js
  client/                          # Vite build output
    assets/
      home-[hash].js
      products-slug-[hash].js
      shared-[hash].js
      vendor-[hash].js
    manifest.json                  # Vite manifest for asset references
```

### No Vite in the main server

The main server is a plain Node.js HTTP server. It loads pre-compiled JS modules, reads pre-rendered files, and runs fast phase + SSR. No build tools at runtime.

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| Two servers (same codebase) | Clear separation of build-time vs request-time; independent scaling | Operational complexity; need to coordinate artifact updates |
| Build directory as interface | Simple, filesystem-based; easy to inspect and debug | Doesn't scale to distributed deployments without shared storage |
| No Vite in main server | Fast startup, predictable performance, smaller runtime footprint | Need separate compilation step for server-side TS; can't use Vite's resolve/transform |
| Pre-compile everything | Zero cold-start latency | Longer build times; need rebuild for code changes |
| `jay-stack build` as one-shot | CI/CD friendly; deterministic output | Still need the renderer role for data change re-renders |

## Verification Criteria

1. `jay-stack build` produces all artifacts needed to serve the site
2. `jay-stack serve --role=main` starts without Vite and serves pages correctly
3. SSR output from main server matches dev server output for the same ViewState
4. Client bundles are tree-shaken and code-split (no server code in client bundles)
5. Action execution works identically in dev and production
6. Data change re-render updates artifacts without restarting the main server
7. Build time scales linearly with number of routes, not exponentially
