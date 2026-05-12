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

**Initial Build (per-instance pipeline):**

```
For each route in project:
  For each param combination (from loadParams):
    1. Run slowlyRender(params) → slowViewState + carryForward
    2. Pre-render jay-html with slow ViewState → instance-specific jay-html
    3. Compile server element from pre-rendered jay-html → server-element.js
    4. Compile + bundle hydration script (per-instance Vite build) → instance-[hash].js
    5. Write all artifacts to build/v{version}/
```

The Vite build is **scoped per instance**, not per project. This means:
- Each instance is independently buildable — no waiting for all routes to finish
- A data change only triggers the pipeline for the affected instance
- Shared chunks (jay framework, plugins) are built once and referenced by all instances
- Instances can be built concurrently with bounded parallelism

**Shared chunks** are pre-built before instance builds begin:

```
Phase 0: Build shared chunks (jay framework, plugins) → build/v{version}/shared/
Phase 1: Per-instance pipeline (steps 1-5 above, concurrent) → build/v{version}/instances/
Phase 2: Write route-manifest.json → build/v{version}/
```

**Data Change Re-render:**

When external data changes (product updated, content edited):

```
Plugin webhook receives change notification
  │
  ├── Plugin resolves: item ID → contract + param value
  ├── Slow render server finds routes using that contract + params
  ├── Re-runs per-instance pipeline for affected instances only
  │   (slow render → compile → per-instance Vite build)
  ├── Updates instance artifacts in current version bucket
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

**Q8.2: What if the slow render server restarts? How do we know when to re-run all param combinations vs reuse previous build files?**

**A8.1 + A8.2 — Versioned storage buckets:**

A global version number increments on each deployment (code change). Artifacts are stored in versioned buckets: `build/v1/`, `build/v2/`, etc.

**Deployment (version change):**
```
1. New code deployed → version increments from v1 to v2
2. Slow render server builds all instances into build/v2/
   (build/v1/ continues serving via old main server instance)
3. When build completes, deploy new main server instance with JAY_BUILD_VERSION=2
4. Traffic shifts to new server instance (blue-green, rolling restart)
5. Old server instance + bucket (v1) can be cleaned up
```

The version is hardcoded in the deployed server instance — no dynamic version switching. Version transitions are standard server instance replacements.

**Restart (same version):**
```
1. Slow render server starts, reads current version from build-metadata.json
2. Version unchanged → all artifacts in build/v{current}/ are valid
3. No rebuild needed — immediate startup
4. Resume listening for data change webhooks
```

**Data change (within version):**
```
1. Webhook triggers re-render of specific instance
2. Instance artifacts updated in-place within build/v{current}/
3. Main server picks up changes on next request
```

This ensures:
- First startup with a new version: full build, but old version keeps serving throughout
- Subsequent restarts: instant, no rebuild
- Data changes: targeted per-instance rebuild, no full build
- Clean atomic transitions between code versions

**Q9: How does the main server know artifacts were updated? Options: filesystem polling, IPC signal, shared event bus, artifact versioning.**

**A9:** The main server reads artifacts from the artifact storage service (A3) on each request. No in-memory caching of artifact content required — read from files each time. For compiled JS modules loaded via `import()`, the main server can check file timestamps to avoid re-evaluating unchanged modules. This keeps the main server stateless w.r.t. artifacts and naturally picks up updates from the slow render server.

**Q10: Should the slow render server also re-run the Vite client build on data change? Client bundles shouldn't change on data change (only on code change), so probably not.**

**A10:** Yes, client bundles **do** change on data change. If a slow-rendered conditional changes value for a param combination, the pre-rendered jay-html is structurally different, producing a different hydration script. The Vite client build must re-run for affected instances after slow re-rendering.

**Q11: Can slow render and Vite build run in parallel, or does the Vite build depend on pre-rendered jay-html?**

**A11:** The Vite build depends on the slow render. Within a single instance, the pipeline is strictly sequential:

```
1. Slow render → pre-rendered jay-html
2. Compile server element + hydration script
3. Per-instance Vite build (references pre-built shared chunks)
```

Since the Vite build is per-instance, instances can be fully built independently and concurrently. No cross-instance dependency.

### Concern 5: Action Execution and Data Mutation

Actions (`makeJayAction`, `makeJayQuery`, `makeJayStream`) run on the main server. The action router (`action-router.ts`) is largely environment-agnostic — it receives HTTP requests, finds the action handler, executes it, returns the result.

In production:
- Actions run on the main server (same as dev)
- Action handlers are pre-compiled JS (no Vite)
- Actions that mutate data should trigger slow re-render

**Questions:**

**Q12: When an action mutates data, how does the main server notify the slow render server? Options: direct HTTP call, shared event bus, the mutation itself triggers re-render (if watching the data source).**

**A12:** The primary path is: action mutates data in the system of record → system of record sends event/callback to slow render server (same webhook mechanism as Q8). For setups without a system of record that sends events, the action can call the slow render server's webhook HTTP endpoint directly as a fallback.

**Q13: Should actions be code-split from page components, or bundled together in the server build?**

**A13:** Same bundle on the server. Actions and pages use the same services — no need to complicate things with code splitting on the server side.

### Concern 6: Service Lifecycle in Two Servers

Services (`makeJayInit`, service markers) are initialized once and injected into slow render, fast render, and actions. In the two-server model:

- **Slow render server** needs services for `slowlyRender()` calls
- **Main server** needs services for `fastRender()` and action execution
- Both import the same `init.ts`

Both servers are **stateless**. Services are initialized independently on each server from the same `init.ts`. The renderer server itself may have multiple instances (redundancy, multiple regions, edge locations), which further requires stateless architecture. Any shared state lives in external systems (databases, caches, etc.), not in-process.

**Questions:**

**Q14: Are there services that need to be shared between the two servers? If so, we need an external state store.**

**A14:** No in-process shared state. Both servers are stateless — any state that needs sharing goes through external systems (database, Redis, etc.). The renderer can run as multiple instances (regions, edges) which reinforces this constraint.

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

**A15:** Plugins are pre-compiled and export two scripts: `index.js` (server) and `index.client.js` (client). The production build uses these directly — no plugin compilation needed. Client scripts can be bundled into shared chunks when it makes sense.

### Concern 8: Static Asset Serving

Dev server uses Vite middleware to serve all assets. In production, a **CDN serves client assets** (JS, CSS, images). The main server only handles SSR HTML responses and action endpoints.

**Questions:**

**Q16: Should the build produce assets with content hashes for cache busting?**

**A16:** Yes. All client assets use content hashes — standard CDN cache-busting strategy.

**Q17: Should the main server support a `publicBasePath` for CDN-hosted assets (e.g., `https://cdn.example.com/assets/`)?**

**A17:** Yes. Configurable `publicBasePath`, defaults to the main server itself (self-hosting as fallback). When a CDN is configured, all `<script>` and `<link>` tags in SSR output use the CDN URL prefix.

## Child Design Logs Needed

All 17 questions resolved. Each concern maps to a child design log focused on detailed design and implementation.

| # | Focus Area | Key Decisions |
|---|---|---|
| A | **Build Pipeline** — per-instance compilation, per-instance Vite build, shared chunks, gap analysis vs compiler-jay-html | Q1, Q2, Q6, Q7, Q11 |
| B | **Main Server** — stateless request handling, artifact storage service, route manifest, CDN base path | Q3, Q4, Q5, Q5.5, Q9, Q16, Q17 |
| C | **Slow Render Server & Data Change** — webhook invalidation, plugin resolution, versioned buckets, restart resilience | Q8, Q8.1, Q8.2, Q10, Q12 |
| D | **Server Build** — compiling page.ts + actions together, stateless services, pre-compiled plugins | Q13, Q14, Q15 |

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
  build-metadata.json              # Current version, source hash, build timestamp
  v1/                              # Versioned storage bucket (one per deployment)
    route-manifest.json            # Routes, params, artifact paths per instance
    shared/                        # Pre-built shared chunks (once per version)
      jay-framework-[hash].js      # Jay runtime + component + stack-client-runtime
      vendor-[hash].js             # 3rd party deps (plugins, etc.)
      shared-manifest.json         # Maps chunk names to hashed filenames
    server/                        # Compiled page.ts, actions, services
      pages/
        home/page.js
        products/[slug]/page.js
      actions/
        addToCart.js
      init.js
    instances/                     # Per-instance artifacts
      home/
        page.jay-html              # Pre-rendered jay-html (slow data baked in)
        page.server-element.js     # Compiled SSR render function
        page-[hash].js             # Per-instance client bundle
      products/[slug]/
        page_abc123.jay-html       # slug=blue-widget (slow conditional true)
        page_abc123.server-element.js
        page_abc123-[hash].js
        page_def456.jay-html       # slug=red-gadget  (slow conditional false)
        page_def456.server-element.js
        page_def456-[hash].js
```

### No Vite in the main server

The main server is a plain Node.js HTTP server. It loads pre-compiled JS modules, reads pre-rendered files, and runs fast phase + SSR. No build tools at runtime.

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| Two servers (same codebase) | Clear separation of build-time vs request-time; independent scaling | Operational complexity; need to coordinate artifact updates |
| Build directory as interface | Simple, filesystem-based; easy to inspect and debug | Doesn't scale to distributed deployments without shared storage (mitigated by artifact service abstraction) |
| Per-instance Vite builds | Each instance independently buildable; data changes only rebuild affected instances; no global rebundle bottleneck | Many small Vite builds instead of one optimized global build; shared chunks must be pre-built separately |
| Versioned storage buckets | Atomic code deployments; instant restart on same version; clean rollback by pointing to old bucket | Disk usage: multiple versions coexist during transition; need cleanup strategy for old versions |
| No Vite in main server | Fast startup, predictable performance, smaller runtime footprint | Need separate compilation step for server-side TS; can't use Vite's resolve/transform |
| Pre-compile everything | Zero cold-start latency | Longer initial build; need rebuild for code changes |
| `jay-stack build` as one-shot | CI/CD friendly; deterministic output | Still need the renderer role for data change re-renders |

## Verification Criteria

1. `jay-stack build` produces all artifacts needed to serve the site
2. `jay-stack serve --role=main` starts without Vite and serves pages correctly
3. SSR output from main server matches dev server output for the same ViewState
4. Client bundles are tree-shaken and code-split (no server code in client bundles)
5. Action execution works identically in dev and production
6. Data change re-render updates artifacts without restarting the main server
7. Build time scales linearly with number of routes, not exponentially

## Implementation Status

### Working (verified on fake-shop)

- `jay-stack build` — produces versioned bucket with all artifacts (15 instances: 5 static + 10 product slugs)
- `jay-stack serve` — plain Node.js HTTP server, streaming SSR, import maps, no Vite
- **SSR** — server-rendered HTML with product names, prices, stock status visible without JS
- **CSS** — extracted from jay-html `<style>` blocks, served with correct cache headers
- **Dynamic params** — `loadParams` discovers all slug combinations, per-instance build
- **Actions** — action router handles GET/POST, streaming NDJSON, correct error codes
- **Hydration** — client adopts server-rendered DOM, interactive elements work (buttons, etc.)
- **Headless components** — slow render Pass 2 resolves instance bindings, `__headlessInstances` populated for client
- **slowForEach instances** — unrolled forEach instances slow-rendered in Pass 2, coordinate keys match hydrate expectations
- **Keyed headless parts** — keyed components (e.g., mood tracker `key="mt"`) included in hydration entry `parts` array with interactive constructors
- **Shared chunks** — deduplicated via wrapper entries + `resolve.dedupe`, singleton context preserved
- **Action stripping** — `makeJayQuery`/`makeJayAction`/`makeJayStream` stripped from client bundles

### Remaining Work

#### Must Fix

1. ~~**slowForEach headless instances**~~ — Done. The build pipeline's Pass 2 now runs `slowRenderInstances` on ALL instances discovered from the post-Pass-1 jay-html (including unrolled slowForEach static instances), and merges their data into `carryForward.__instances`. The key insight: slowForEach templates are unrolled by Pass 1 into static `<jay:xxx>` instances with coordinate keys like `S3/0/0/product-widget:AR0` — these must be slow-rendered in Pass 2, not treated as forEach instances.

2. ~~**Build folder conflict**~~ — Done. Dev server default changed from `build/` to `build/dev/`. Production uses `build/v{n}/`. Both can run without conflict.

3. ~~**Minification flag**~~ — Done. `jay-stack build --no-minify` disables minification for shared chunks and instance bundles. Default: minified. Flag flows through `BuildOptions.minify` → `InstanceBuildContext.minify` → `buildSharedChunks`/`buildInstanceClient`.

4. ~~**Keyed headless parts in hydration**~~ — Done. Hydration entry now includes keyed headless components (e.g., mood tracker `key="mt"`) as additional parts in the `parts` array. `loadProductionPageParts` tracks `keyedPartModules` (module path + export name + key) and passes them to `generateHydrationEntry`. NPM packages use `/client` entry path; local plugins use absolute source path (Vite resolves it during the instance build).

#### Future Phases

4. **Plugin routes** — plugin-provided pages (DL#130) not yet handled in production build
5. **Plugin init at serve time** — plugin `_serverInit()` not called during production server startup
6. **Head tags** — SEO head tags from fast phase not injected into SSR `<head>` (DL#127)
7. **Slow render server** — `jay-stack serve --role=renderer` with webhook-based invalidation (DL#134c)
8. **Source hash** — `build-metadata.json` source hash not computed yet (needed for restart validation)
9. **Query parameters** — `props.query` not passed through to fast render properly
10. **Error pages** — custom 404/500 pages not implemented
