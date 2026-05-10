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

**A1:** Plain JS. No need for a complex runtime architecture — compile everything ahead of time.

**Q2: Should the Vite build produce a single entry per page, or a shared chunk strategy?**

**A2:** Shared chunks for Jay framework and plugin dependencies. Page-specific code is **per slow-rendered instance**, not per route — because slow-phase conditionals can produce different pre-rendered jay-html per param combination, which compiles to different hydration scripts. Two instances of the same route may have structurally different client bundles if a slow conditional evaluates differently.

**Q3: Where do pre-rendered files live in deployment — local filesystem, object storage, or embedded in the server?**

**A3:** Start with local filesystem. Artifact storage should be behind an abstraction (a service) so it can be swapped for object storage or other backends later without changing the server code.

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

**A4:** The route manifest (`route-manifest.json`) includes references to compiled `page.js` files. The main server loads them via `import()` at startup or on first use.

**Q5: Should the main server use Express like the dev server, or something lighter?**

**A5:** Use whatever makes sense — something lighter than Express is fine since we don't need Vite middleware.

**Q5.5: How does the route manifest get updated when data changes?**

**A5.5:** The route manifest needs to change when param combinations change (new product added, old one removed — `loadParams` returns different results). The slow render server is responsible for updating it. For the main server to pick up changes without downtime, options:

1. **Atomic file swap** — slow render writes `route-manifest.next.json`, atomically renames over `route-manifest.json`. Main server detects the change (poll or filesystem watch).
2. **Re-read on request** — main server reads the manifest from the artifact store on each request (or with a short TTL cache). Simple and works with any storage backend.
3. **Signal-based reload** — slow render calls an HTTP endpoint on the main server to trigger a manifest reload.

Option 2 fits best with the artifact storage abstraction (A3) — the artifact service can handle caching internally.

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

**A6:** `compiler-jay-html` already supports production builds for non-jay-stack examples. The preference is to do the same with `compiler-jay-stack` — use the existing compiler infrastructure for production. Need to map the gaps between what compiler-jay-html supports today and what jay-stack needs (slow-rendered input, composite components, headless instances, etc.).

**Q7: How do we handle pages with dynamic params (`[slug]`)? Each param combination shares the same client bundle but has different SSR output.**

**A7:** Each param combination can have a **different client bundle**. If a slowly-rendered conditional (`if="slowProp"`) evaluates to true for one param set and false for another, the pre-rendered jay-html is structurally different, producing different SSR server elements and different hydration scripts. The Vite build must produce per-instance bundles for pages where slow rendering affects template structure.

### Concern 4: Slow Phase Execution — Build Time and Data Change

**Initial Build (sequential per instance):**

```
For each route in project:
  For each param combination (from loadParams):
    1. Run slowlyRender(params) → slowViewState + carryForward
    2. Pre-render jay-html with slow ViewState → instance-specific jay-html
    3. Compile server element from pre-rendered jay-html → server-element.js
    4. Compile hydration script from pre-rendered jay-html → hydrate entry
    5. Write all artifacts to build/

Then:
  6. Vite build — bundle all hydration entries into optimized client bundles
     (shared chunks for jay framework + plugins, per-instance entries)
```

This is what the dev server does on first request, but done eagerly for all routes. Steps 1-5 can run concurrently across instances (bounded parallelism). Step 6 runs once after all instances are compiled.

**Data Change Re-render:**

When external data changes (product updated, content edited):

```
Plugin webhook receives change notification
  │
  ├── Plugin resolves: item ID → contract + param value
  ├── Slow render server finds routes using that contract + params
  ├── Re-runs slow phase for affected instances only
  ├── Re-compiles server element + hydration script
  ├── Re-runs Vite build for affected entries
  └── Main server picks up new artifacts on next request
```

**Questions:**

**Q8: How does the slow render server receive data change events? Options: HTTP webhook endpoint, message queue, polling, filesystem watcher.**

**A8:** HTTP webhook exposed by plugins. Each plugin provides a webhook handler that resolves: changed item ID → plugin component + param value. The slow render server then invalidates routes that use that plugin component with that param value. The invalidation flow:

```
External data change (e.g., product updated in CMS)
  → HTTP webhook hits slow render server
  → Plugin resolves: item ID "prod-123" → contract "product-page" + params { slug: "blue-widget" }
  → Slow render server finds routes using "product-page" contract
  → Re-renders those routes with the specific params
  → Updates artifacts
```

**Q8.1: How do we handle load on startup with many param combinations?**

**A8.1:** On first build, all param combinations need slow rendering + compilation. For large sites this can be expensive. Options:
- Parallel slow renders (worker pool or bounded concurrency)
- Priority queue (render most-visited routes first, if analytics available)
- Incremental startup: start the main server with existing artifacts, slow render server re-renders in background

**Q8.2: What if the slow render server restarts? How do we know when to re-run all param combinations vs reuse previous build files?**

**A8.2:** Build artifacts on disk include enough metadata to determine validity. DL#110 already embeds `slowViewState` and `carryForward` in pre-rendered jay-html files. On restart:
- If source code hasn't changed (check source file timestamps or git hash against a `build-metadata.json`), previous artifacts are valid — skip re-rendering
- If source code changed, artifacts are stale — need full rebuild
- If only data changed (webhook-triggered), only affected routes are stale — selective re-render
- The `build-metadata.json` stores: source hash, build timestamp, list of compiled artifacts with their source dependencies

**Q9: How does the main server know artifacts were updated? Options: filesystem polling, IPC signal, shared event bus, artifact versioning.**

**A9:** The main server reads artifacts from the artifact storage service (A3) on each request. No in-memory caching of artifact content required — read from files each time. For compiled JS modules loaded via `import()`, the main server can check file timestamps to avoid re-evaluating unchanged modules. This keeps the main server stateless w.r.t. artifacts and naturally picks up updates from the slow render server.

**Q10: Should the slow render server also re-run the Vite client build on data change? Client bundles shouldn't change on data change (only on code change), so probably not.**

**A10:** Yes, client bundles **do** change on data change. If a slow-rendered conditional changes value for a param combination, the pre-rendered jay-html is structurally different, producing a different hydration script. The Vite client build must re-run for affected instances after slow re-rendering.

**Q11: Can slow render and Vite build run in parallel, or does the Vite build depend on pre-rendered jay-html?**

**A11:** The Vite build depends on the slow render. The pipeline is strictly sequential:

```
1. Slow render (per instance) → pre-rendered jay-html
2. Compile server elements + hydration scripts (from pre-rendered jay-html)
3. Vite build (bundles hydration scripts into optimized client bundles)
```

Step 2 and 3 could potentially overlap across instances (Vite builds instance A while slow-rendering instance B), but within a single instance the order is fixed.

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

Each concern above maps to a potential child design log. Many questions are now answered — child logs focus on detailed design and implementation.

| # | Focus Area | Resolved | Open |
|---|---|---|---|
| A | **Build Pipeline** — compiler-jay-stack production build, per-instance compilation, Vite bundling with shared chunks | Q1, Q2, Q7, Q11 | Q6 (gap analysis vs compiler-jay-html) |
| B | **Main Server** — request handling without Vite, artifact storage service, route manifest loading | Q3, Q4, Q5, Q5.5, Q9 | Q16, Q17 |
| C | **Slow Render Server & Data Change** — webhook-based invalidation, plugin resolution, restart resilience, load management | Q8, Q8.2, Q10 | Q8.1 (parallelism strategy), Q12 |
| D | **Server Build** — compiling page.ts, actions, services, plugins to production JS | Q4 | Q13, Q14, Q15 |

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
  build-metadata.json              # Source hash, build timestamp, artifact index
  route-manifest.json              # Routes, params, artifact paths per instance
  pre-rendered/                    # Slow-rendered jay-html per instance
    home/page.jay-html
    products/[slug]/
      page_abc123.jay-html         # slug=blue-widget (slow conditional true)
      page_def456.jay-html         # slug=red-gadget  (slow conditional false)
  server-elements/                 # Compiled SSR render functions (per instance)
    home/page.server-element.js
    products/[slug]/
      page_abc123.server-element.js
      page_def456.server-element.js
  server/                          # Compiled page.ts, actions, services
    pages/
      home/page.js
      products/[slug]/page.js
    actions/
      addToCart.js
    init.js
  client/                          # Vite build output
    assets/
      home-[hash].js               # Per-instance entry bundles
      products-slug-abc123-[hash].js
      products-slug-def456-[hash].js
      jay-framework-[hash].js      # Shared chunk: jay runtime + component
      vendor-[hash].js             # Shared chunk: 3rd party deps
    manifest.json                  # Vite manifest mapping entries to assets
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
