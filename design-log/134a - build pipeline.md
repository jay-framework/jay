# Design Log #134a — Build Pipeline

**Date:** May 10, 2026
**Status:** Draft
**Parent:** #134 (production build)
**Related:** #94 (SSR streaming), #110 (slow render cache), #52 (code splitting), #118 (jay-html-compiler refactor)

## Background

Design Log #134 establishes a two-server production architecture where a slow render server produces build artifacts and a main server consumes them. This child design log covers the **build pipeline** — the process of turning source code into production artifacts.

The pipeline must produce, per instance (route + param combination):
1. Pre-rendered jay-html (slow data baked in)
2. Compiled server element JS (for SSR at request time)
3. Compiled + bundled client JS (hydration script)
4. CSS

Plus shared artifacts built once per version:
- Jay framework shared chunks
- Plugin shared chunks
- Compiled server code (page.ts, actions, services, init.ts)
- Route manifest

## Current State: What Exists Today

### compiler-jay-html — Four Compilation Targets

The compiler produces four targets from a single `.jay-html` file (`jay-html-compiler.ts`, `jay-html-compiler-server.ts`):

| Target | Generator | Output | Used By |
|---|---|---|---|
| **Element** | `generateElementFile()` | `render()` — creates DOM from scratch | Client-only rendering (no SSR) |
| **Hydrate** | `generateElementHydrateFile()` | `hydrate()` — adopts existing DOM | Client after SSR |
| **Server Element** | `generateServerElementFile()` | `renderToStream(vs, ctx)` — writes HTML strings | SSR on server |
| **Bridge** | `generateElementBridgeFile()` | Worker sandbox communication | Secure mode (not relevant here) |

### compiler-jay-stack — Vite Plugin Composition

`jayStackCompiler()` returns three Vite plugins (`compiler-jay-stack/lib/index.ts`):

1. **jay-stack:code-split** — strips server/client code based on `options.ssr`
   - Server build: keeps `withSlowlyRender`, `withFastRender`, strips `withInteractive`
   - Client build: strips server phases, keeps `withInteractive`
2. **jay-stack:action-transform** — replaces action imports with `createActionCaller()` stubs (client only)
3. **jay:runtime** — the base jay-html compiler plugin

### Plugin Packages — Already Pre-compiled

Plugins use the same `jayStackCompiler` for their builds (`examples/jay-stack/mood-tracker-plugin/vite.config.ts`):
- Server build: `vite build --ssr` → `dist/index.js` (server code)
- Client build: `vite build` → `dist/index.client.js` (client code)
- Jay framework packages are externalized — they become shared chunks in the consuming project

### Dev Server — How SSR Works Today

`generate-ssr-response.ts` at request time:

```
1. parseJayFile(jayHtmlContent)        — parse jay-html YAML
2. generateServerElementFile(jayFile)   — compile to TS
3. fs.writeFile(serverElementPath)      — write .server-element.ts to build/
4. vite.ssrLoadModule(serverElementPath) — Vite compiles TS → JS + loads
5. renderToStream(viewState, ctx)       — execute to produce HTML
6. generateHydrationScript(...)         — inline <script> with imports
```

The hydration script is an inline `<script type="module">` that imports:
- `hydrateCompositeJayComponent` from `@jay-framework/stack-client-runtime`
- `hydrate` from `page.jay-html?jay-hydrate` (compiled on-demand by Vite plugin)
- Each page part's client export
- Plugin/project init modules

Vite dev server resolves all these imports at request time.

## Problem: Gaps for Production

### Gap 1: Server elements compiled at request time via Vite

`compileAndLoadServerElement()` uses `vite.ssrLoadModule()` which requires a running Vite dev server. Production needs pre-compiled `.js` files loadable via `import()`.

**What to change:** The compilation steps (parse → generate → write) are reusable. Replace `vite.ssrLoadModule()` with a pre-compilation step that produces standalone JS.

### Gap 2: Hydration script is an inline module with bare imports

The hydration script uses bare specifiers (`@jay-framework/stack-client-runtime`, `page.jay-html?jay-hydrate`) that Vite resolves at request time. Production needs a bundled JS file with all dependencies resolved.

**What to change:** Generate a hydration entry point TS file per instance, then run Vite build on it.

### Gap 3: No per-instance Vite build capability

The existing `jayStackCompiler` is designed for whole-project builds (all pages at once). We need per-instance builds where each instance has its own entry point referencing pre-rendered jay-html.

**What to change:** Create a Vite build configuration that takes a single instance entry point and produces a bundled JS file, referencing pre-built shared chunks.

### Gap 4: Client script generation is runtime-only

`buildScriptFragments()` and `generateHydrationScript()` produce inline script text. Production needs them to produce importable TS/JS entry files.

**What to change:** Extract the logic that generates imports and wiring into a file-writing function instead of inline string generation.

### Gap 5: CSS handling relies on Vite's `/@fs/` URL scheme

`compileAndLoadServerElement` writes CSS to disk and serves it via `/@fs/` prefix. Production needs CSS as a build artifact with content hashing.

**What to change:** CSS becomes part of the per-instance Vite build — imported by the hydration entry, extracted by Vite's CSS handling.

### Gap 6: No shared chunk pre-building

In dev, shared dependencies are resolved on-demand. Production needs shared chunks built once and referenced by all instances.

**What to change:** A separate Vite build step that produces shared chunks from jay framework + plugin packages.

## Design

### Build Pipeline Overview

```
                        Version Build (jay-stack build)
                        ==============================

Phase 0: Shared Artifacts
  ├── Compile server code (page.ts, actions, init.ts) → build/v{n}/server/
  ├── Build shared client chunks (jay framework, plugins) → build/v{n}/shared/
  └── Scan routes + load params → route list

Phase 1: Per-Instance Pipeline (concurrent, bounded parallelism)
  For each (route, params):
    ├── 1. Slow render → slowViewState + carryForward
    ├── 2. Pre-render jay-html → instance-specific jay-html
    ├── 3. Compile server element → .server-element.js
    ├── 4. Generate hydration entry → .hydrate-entry.ts
    ├── 5. Per-instance Vite build → instance-[hash].js + instance-[hash].css
    └── 6. Write instance manifest entry

Phase 2: Finalize
  └── Write route-manifest.json → build/v{n}/
```

### Phase 0: Shared Artifacts

#### Server Code Compilation

Use Vite build in SSR mode to compile all server-side TypeScript:

```typescript
await build({
  plugins: [...jayStackCompiler(jayOptions)],
  build: {
    ssr: true,
    outDir: `build/v${version}/server`,
    rollupOptions: {
      input: {
        init: 'src/lib/init.ts',
        ...pageEntries,    // { 'pages/home/page': 'src/pages/home/page.ts', ... }
        ...actionEntries,  // { 'actions/addToCart': 'src/lib/actions/addToCart.actions.ts', ... }
      },
      external: [
        '@jay-framework/fullstack-component',
        '@jay-framework/stack-server-runtime',
        // ... other server-side framework packages
      ],
    },
  },
});
```

This produces `build/v{n}/server/pages/home/page.js`, etc. — compiled JS with server-only code (slow + fast phases). These are what the main server loads via `import()` for fast-phase rendering.

#### Shared Client Chunks

Build jay framework + plugin client code into shared chunks:

```typescript
await build({
  plugins: [...jayStackCompiler(jayOptions)],
  build: {
    outDir: `build/v${version}/shared`,
    lib: {
      entry: {
        'stack-client-runtime': '@jay-framework/stack-client-runtime',
        'component': '@jay-framework/component',
        'reactive': '@jay-framework/reactive',
        'runtime': '@jay-framework/runtime',
        // plugin client entries
        ...pluginClientEntries,
      },
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
});
```

Output: `build/v{n}/shared/shared-manifest.json` mapping module names to hashed filenames.

**Question:**

**Q1: Should shared chunks use Vite's library mode or a custom chunk strategy?**

Vite library mode externalizes dependencies and produces one file per entry. A custom chunk strategy (`manualChunks`) can deduplicate shared code between entries. For shared chunks that multiple instance bundles reference, library mode with `external` seems right — each shared module becomes a standalone file that instance bundles import.

However, instance bundles need to resolve these imports at runtime. Options:
- **Import maps** — browser-native, `<script type="importmap">` maps bare specifiers to hashed URLs
- **Rollup `paths` option** — rewrite imports at bundle time to absolute URLs
- **Pre-bundled with externals** — instance bundles include only page-specific code, shared code loaded via separate `<script>` tags

Import maps are the cleanest solution — the SSR HTML includes an import map, and both shared and instance scripts use standard ES module imports.

### Phase 1: Per-Instance Pipeline

#### Step 1-2: Slow Render + Pre-render

Reuse existing `DevSlowlyChangingPhase.runSlowlyForPage()` and `slowRenderTransform()` from `stack-server-runtime`. These are not Vite-dependent — they parse contracts, run component slow render functions, and transform jay-html.

The slow render needs compiled server code from Phase 0 to call `slowlyRender()`. Load page components via `import()` from `build/v{n}/server/`.

#### Step 3: Compile Server Element to JS

Today: `generateServerElementFile()` → TS → `vite.ssrLoadModule()`.

Production: `generateServerElementFile()` → TS → compile to JS without Vite.

The server element TS is simple — it imports only from `@jay-framework/ssr-runtime` (which is a small package with `escapeHtml`, `escapeAttr`, `ServerRenderContext`). Compiling it requires:
- TypeScript → JS transpilation (no type checking needed, just strip types)
- Import resolution for `@jay-framework/ssr-runtime`

Options:
- **esbuild** — fast TS-to-JS transpilation, can bundle the single import
- **Vite build in SSR mode** — heavier but consistent with the rest of the pipeline
- **`tsc --noEmit false`** — standard TS compiler

esbuild is the best fit — it's already a Vite dependency, fast, and can produce a standalone JS file:

```typescript
import { build } from 'esbuild';

await build({
  entryPoints: [serverElementTsPath],
  outfile: serverElementJsPath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: [], // Bundle everything (ssr-runtime is tiny)
});
```

Output: `build/v{n}/instances/{route}/page_{hash}.server-element.js` — a standalone ESM file with no external dependencies, loadable via `import()`.

#### Step 4: Generate Hydration Entry

Today: `generateHydrationScript()` in `generate-ssr-response.ts` produces an inline `<script>` with imports that Vite resolves.

Production: Generate a **TS file** per instance, which becomes the Vite build entry.

**What's known at build time vs request time:**

| Data | Known at | Embedded in |
|---|---|---|
| Slow ViewState | Build time (per instance) | Hydration entry (bundled) |
| Fast ViewState | Request time | SSR inline JSON |
| CarryForward | Request time | SSR inline JSON |
| TrackByMap | Build time | Hydration entry (bundled) |
| Hydrate function | Build time (per instance, depends on pre-rendered jay-html) | Hydration entry (bundled) |
| Page parts (interactive) | Build time | Hydration entry (bundled) |

The slow ViewState is different per instance — it's the output of slow rendering, which produced the pre-rendered jay-html that this instance is compiled from. It must be embedded in the hydration entry so the client can merge it with the fast ViewState for a complete picture.

```typescript
// page_abc123.hydrate-entry.ts — per-instance
import { hydrateCompositeJayComponent } from '@jay-framework/stack-client-runtime';
import { hydrate } from './page_abc123.jay-html?jay-hydrate';
// Part imports (client-side only, code-split by jay-stack:code-split)
import pagePart from '../../../pages/products/[slug]/page';

// Slow ViewState — known at build time, baked into this instance's bundle
const slowViewState = {"title":"Blue Widget","inStock":true,"variants":[...]};
const trackByMap = {"variants": "id"};

export function init(fastViewState, fastCarryForward) {
  const target = document.getElementById('target');
  const rootElement = target.firstElementChild;
  const parts = [pagePart].filter(p => p.comp).map(p => ({
    comp: p.comp, contexts: p.contexts || []
  }));
  const pageComp = hydrateCompositeJayComponent(
    hydrate, slowViewState, fastViewState, fastCarryForward,
    parts, trackByMap, rootElement
  );
  return pageComp({});
}
```

The SSR response at request time only injects fast-phase data:

```html
<script type="importmap">{ "imports": { ... } }</script>
<script type="module">
  import { init } from '/assets/page_abc123-a1b2c3.js';
  init(
    ${JSON.stringify(fastViewState)},
    ${JSON.stringify(fastCarryForward)}
  );
</script>
```

This means the SSR inline script is minimal — just the `init()` call with fast-phase data. All build-time knowledge (slow ViewState, hydrate function, page parts, trackByMap) is bundled in the instance JS.

#### Step 5: Per-Instance Vite Build

Build the hydration entry into a bundled JS file:

```typescript
await build({
  plugins: [...jayStackCompiler(jayOptions)],
  build: {
    outDir: `build/v${version}/instances/${routeDir}`,
    rollupOptions: {
      input: { [instanceId]: hydrateEntryPath },
      external: [
        // Shared chunks — resolved via import map at runtime
        '@jay-framework/stack-client-runtime',
        '@jay-framework/component',
        '@jay-framework/reactive',
        '@jay-framework/runtime',
      ],
      output: {
        entryFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash].[ext]', // CSS
      },
    },
  },
});
```

The `?jay-hydrate` import is resolved by the `jay:runtime` plugin, which compiles the pre-rendered jay-html into hydrate code. The `jay-stack:code-split` plugin strips server phases. The `jay-stack:action-transform` replaces action imports with client callers.

Output per instance:
- `page_abc123-[hash].js` — bundled hydration entry
- `page_abc123-[hash].css` — extracted CSS (if any)

**Question:**

**Q2: Running a separate Vite build per instance could be slow for many instances. Can we batch multiple instance entries into a single Vite build?**

Yes — Vite supports multiple entry points. We can batch instances within the same route (they share the same `page.ts` and plugins, only the jay-html differs):

```typescript
await build({
  rollupOptions: {
    input: {
      'page_abc123': 'instances/products/[slug]/page_abc123.hydrate-entry.ts',
      'page_def456': 'instances/products/[slug]/page_def456.hydrate-entry.ts',
    },
  },
});
```

This allows Rollup to deduplicate code shared between instances of the same route. For data change re-renders, only the affected instance's entry is rebuilt.

Batching strategy:
- **Full build:** All instances in one Vite build (maximum deduplication, slower for incremental)
- **Per-route build:** Instances of the same route in one build (good balance)
- **Per-instance build:** One build per instance (maximum incrementality, more overhead)

Per-route seems like the right default — instances of the same route share most code.

### Phase 2: Route Manifest

```typescript
interface RouteManifest {
  version: number;
  buildTimestamp: string;
  sourceHash: string;
  routes: RouteEntry[];
}

interface RouteEntry {
  pattern: string;           // e.g., "/products/[slug]"
  serverModule: string;      // relative path to compiled page.js
  instances: InstanceEntry[];
}

interface InstanceEntry {
  params: Record<string, string>;  // e.g., { slug: "blue-widget" }
  preRenderedHtml: string;         // relative path to pre-rendered jay-html
  serverElement: string;           // relative path to server-element.js
  clientBundle: string;            // relative path to instance-[hash].js
  clientCss?: string;              // relative path to instance-[hash].css
}
```

The main server reads this manifest to:
- Match incoming requests to routes
- Find the correct instance for a given set of params
- Load the right server element for SSR
- Reference the right client bundle in the HTML response

### SSR Response in Production

The main server produces HTML using pre-built artifacts:

```typescript
async function handleRequest(req, res) {
  const route = matchRoute(manifest, req.path);
  const instance = findInstance(route, req.params);

  // Load pre-compiled server element
  const { renderToStream } = await import(instance.serverElement);

  // Load pre-compiled page component, run fast phase
  const pageModule = await import(route.serverModule);
  const carryForward = instance.carryForward; // from slow render, stored in manifest or cache file
  const fastResult = await pageModule.default.fastRender(carryForward, ...services);

  // Merge slow + fast ViewState for SSR rendering
  const fullViewState = mergeViewStates(instance.slowViewState, fastResult.rendered);

  // SSR render — server element needs the full merged ViewState
  const htmlChunks = [];
  renderToStream(fullViewState, {
    write: c => htmlChunks.push(c),
    onAsync: (promise, id, templates) => { /* ... */ }
  });

  // Build response — init() only receives fast-phase data
  // (slow ViewState + trackByMap are already embedded in the client bundle)
  const importMap = buildImportMap(sharedManifest, publicBasePath);
  res.write(`<!doctype html><html><head>
    <script type="importmap">${JSON.stringify(importMap)}</script>
    <link rel="stylesheet" href="${publicBasePath}/${instance.clientCss}" />
  </head><body>
    <div id="target">${htmlChunks.join('')}</div>
    <script type="module">
      import { init } from '${publicBasePath}/${instance.clientBundle}';
      init(${JSON.stringify(fastResult.rendered)}, ${JSON.stringify(fastResult.carryForward)});
    </script>
  </body></html>`);
}
```

The SSR server element renders with the **full merged ViewState** (slow + fast) to produce correct HTML. But the client `init()` only receives **fast-phase data** — the slow ViewState is already baked into the client bundle at build time. The client merges them internally before hydrating.

## Implementation Plan

### Step 1: Server Code Compilation

Create a build function that compiles all server-side TypeScript using Vite SSR build:
- Input: scanned routes (page.ts paths), action files, init.ts
- Output: `build/v{n}/server/` with compiled JS
- Test: compiled page modules can be `import()`-ed and their `fastRender` called

### Step 2: Shared Client Chunks

Create a build function that produces shared chunks:
- Input: list of framework packages + plugin client entries
- Output: `build/v{n}/shared/` with hashed JS files + `shared-manifest.json`
- Test: import map can be constructed from manifest, modules load correctly in browser

### Step 3: Server Element Compilation (without Vite)

Extract `compileAndLoadServerElement` logic into a production variant:
- Input: pre-rendered jay-html content
- Output: standalone `.server-element.js` via esbuild
- Test: `renderToStream` produces identical HTML to dev server for same ViewState

### Step 4: Hydration Entry Generation

Create a function that generates a `.hydrate-entry.ts` file per instance:
- Input: pre-rendered jay-html path, page parts, plugin inits
- Output: TS file exporting `init(viewState, carryForward, trackByMap)`
- Test: generated file is valid TS, imports resolve

### Step 5: Per-Instance Vite Build

Create a build function that compiles hydration entries:
- Input: one or more `.hydrate-entry.ts` files
- Output: bundled JS + CSS per entry
- Test: bundle loads in browser, hydration works

### Step 6: Route Manifest Generation

Create a function that assembles the route manifest:
- Input: all instance build results
- Output: `route-manifest.json`
- Test: manifest correctly maps routes → instances → artifact paths

### Step 7: Build Orchestrator

Wire all steps together into `jay-stack build`:
- Phase 0: steps 1-2 + route scanning (parallel)
- Phase 1: slow render + steps 3-5 per instance (concurrent with bounded parallelism)
- Phase 2: step 6

## Questions

**Q1: Import maps vs pre-bundled shared code?**

Import maps are cleaner (standard ES modules, browser-native resolution) but require browser support (Chrome 89+, Firefox 108+, Safari 16.4+). Pre-bundling shared code into each instance bundle is simpler but produces larger bundles with duplicated framework code.

**Q2: Per-route or per-instance Vite builds?**

Per-route batching seems optimal — instances of the same route share page.ts code and plugins. Full-project batching maximizes dedup but makes incremental rebuilds slower.

**Q3: Should esbuild or Vite compile server elements?**

esbuild is simpler and faster for a single-file compilation with one small dependency. Vite is more consistent with the rest of the pipeline but heavier. The server element is self-contained (imports only ssr-runtime), so esbuild seems right.

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| Import maps for shared chunks | Standard ES modules; browser-native; clean separation | Requires modern browsers; extra `<script>` tag in HTML |
| esbuild for server elements | Fast; already a dependency; simple for single-file compilation | Different tool than rest of pipeline; potential edge cases |
| Per-route Vite batching | Good dedup within route; reasonable incremental rebuild | Less dedup across routes; more builds than full-project |
| `init()` export pattern | Clean separation of build-time vs request-time data | Extra indirection; ViewState still inlined as JSON |

## Verification Criteria

1. `jay-stack build` produces all artifacts in the versioned bucket
2. Server elements produce identical HTML to dev server for the same ViewState
3. Hydration works correctly — client adopts server-rendered DOM without flicker
4. Shared chunks are loaded once and shared across pages
5. Per-instance CSS is correctly extracted and linked
6. Incremental rebuild (single instance change) only rebuilds affected artifacts
7. Build time scales linearly with instance count
