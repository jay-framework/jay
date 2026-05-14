# Design Log #134d — Server Build

**Date:** May 10, 2026
**Status:** Draft
**Parent:** #134 (production build)
**Related:** #134a (build pipeline), #52 (code splitting), #63 (server actions), #65 (makeJayInit)

## Background

The production build pipeline (DL#134a Phase 0) needs to compile all server-side TypeScript into production JS. The main server loads these compiled modules via `import()` to run fast-phase rendering and action execution — no Vite at runtime.

Today, the dev server loads server code via `vite.ssrLoadModule()`, which handles TypeScript transpilation, import resolution, and hot reloading. The `jayStackCompiler` already supports SSR builds — the `jay-stack:code-split` plugin strips client code when `options.ssr = true`.

**The project server build is the same pattern as plugin package builds.** Plugin packages already use `jayStackCompiler` with `vite build --ssr` to produce `dist/index.js` (server) and `dist/index.client.js` (client). The project server build follows the same process — the difference is that plugins are published packages while the project build is deployment-specific.

## What Needs Compiling

### Server-side modules in a Jay Stack project:

| Module                 | Source                                 | Exports                                                                                         | Used By                                                   |
| ---------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Page components**    | `src/pages/*/page.ts`                  | `page: JayStackComponentDefinition` with `slowlyRender`, `fastRender`, `loadParams`, `services` | Slow render server (slow phase), main server (fast phase) |
| **Actions**            | `src/actions/*.actions.ts`             | Named `JayAction` constants with `handler`, `services`, `method`                                | Main server (action router)                               |
| **Init**               | `src/lib/init.ts`                      | `init: JayInit` with `_serverInit`                                                              | Both servers (service initialization)                     |
| **Service markers**    | Various `src/lib/*.ts`                 | `createJayService()` constants                                                                  | Imported by page.ts and actions                           |
| **Plugin server code** | `node_modules/@plugin/*/dist/index.js` | `init`, actions, component definitions                                                          | Both servers                                              |

### What the code-split transform does for server build:

Strips from `makeJayStackComponent` chains:

- `.withInteractive(constructor)` — client-side component
- `.withContexts(...)` — client-side contexts

Strips from `makeJayInit` chains:

- `.withClient(fn)` — client-side initialization

Keeps everything else: `.withServices()`, `.withSlowlyRender()`, `.withFastRender()`, `.withLoadParams()`, `.withServer()`

## Current State: How Dev Server Loads Server Code

### Page components

```
vite.ssrLoadModule('src/pages/products/[slug]/page.ts')
  → jayStackCompiler code-splits for server
  → returns { page: { slowlyRender, fastRender, loadParams, services, ... } }
```

### Actions

```
ServiceLifecycleManager.initialize()
  → glob scan: src/actions/*.actions.ts
  → vite.ssrLoadModule(each file)
  → extract JayAction-branded exports
  → actionRegistry.register(action)
```

### Init + services

```
ServiceLifecycleManager.initialize()
  → discover plugin inits (topological sort by dependencies)
  → vite.ssrLoadModule(plugin init path) → run _serverInit()
  → vite.ssrLoadModule('src/lib/init.ts') → run _serverInit()
  → registerService(marker, instance) for each service
  → globalThis.__JAY_SERVICE_RESOLVER__ = resolveServices
```

## Design

### Single Vite SSR Build

All server-side code compiles in one `vite build --ssr` invocation:

```typescript
import { build } from 'vite';

await build({
  plugins: [...jayStackCompiler(jayOptions)],
  build: {
    ssr: true,
    outDir: `build/v${version}/server`,
    rollupOptions: {
      input: {
        // Init
        init: 'src/lib/init.ts',
        // Pages (one entry per route, not per instance)
        'pages/home/page': 'src/pages/home/page.ts',
        'pages/products/[slug]/page': 'src/pages/products/[slug]/page.ts',
        // Actions
        'actions/cart': 'src/actions/cart.actions.ts',
        'actions/search': 'src/actions/search.actions.ts',
      },
      external: [
        // Jay framework server packages — available at runtime via node_modules
        '@jay-framework/fullstack-component',
        '@jay-framework/stack-server-runtime',
        '@jay-framework/ssr-runtime',
        '@jay-framework/view-state-merge',
        '@jay-framework/compiler-jay-html',
        '@jay-framework/compiler-shared',
        // Plugin packages — pre-compiled, loaded from node_modules
        ...pluginPackageNames,
      ],
    },
    // Preserve module structure for predictable import paths
    output: {
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name]-[hash].js',
      format: 'es',
    },
  },
});
```

Output:

```
build/v{n}/server/
  init.js
  pages/
    home/page.js
    products/[slug]/page.js
  actions/
    cart.js
    search.js
  chunks/
    shared-services-[hash].js    # Shared code between pages/actions
```

### Entry Point Discovery

Before running the build, scan the project to find all entries:

```typescript
interface ServerBuildEntries {
  init: string; // src/lib/init.ts
  pages: Record<string, string>; // route → source path
  actions: Record<string, string>; // action name → source path
}

async function discoverServerEntries(projectRoot: string): Promise<ServerBuildEntries> {
  // 1. Init: fixed path
  const init = 'src/lib/init.ts';

  // 2. Pages: from route scanning (same as dev server's scanRoutes)
  const routes = await scanRoutes(pagesRoot);
  const pages = {};
  for (const route of routes) {
    if (route.compPath) {
      pages[routeToEntryName(route)] = route.compPath;
    }
  }

  // 3. Actions: glob scan (same as dev server's discoverAndRegisterActions)
  const actionFiles = await glob('src/actions/**/*.actions.ts', { cwd: projectRoot });
  const actions = {};
  for (const file of actionFiles) {
    actions[actionFileToEntryName(file)] = file;
  }

  return { init, pages, actions };
}
```

### Production Server Startup

The main server initializes without Vite. Plugin and project code follow the same loading pattern — the only difference is where the compiled JS lives (node_modules vs build dir):

```typescript
async function initializeProductionServer(buildDir: string, manifest: RouteManifest) {
  // 1. Discover and sort plugins (same topological sort as dev server)
  const plugins = await discoverPlugins(manifest.plugins);
  const sortedPlugins = sortPluginsByDependencies(plugins);

  // 2. Run plugin inits in dependency order (from pre-compiled packages)
  for (const plugin of sortedPlugins) {
    const pluginModule = await import(plugin.packageName);
    if (pluginModule.init?._serverInit) {
      const data = await pluginModule.init._serverInit();
      setClientInitData(plugin.name, data);
    }
  }

  // 3. Run project init (from compiled build)
  const { init } = await import(path.join(buildDir, 'init.js'));
  if (init._serverInit) {
    const data = await init._serverInit();
    setClientInitData('project', data);
  }

  // 4. Register action handlers — both plugin and project actions
  for (const actionEntry of manifest.actions) {
    const actionModule = await import(
      actionEntry.isPlugin
        ? actionEntry.packageName // plugin: from node_modules
        : path.join(buildDir, actionEntry.serverModule) // project: from build dir
    );
    for (const [, action] of Object.entries(actionModule)) {
      if (action?.__brand === 'JayAction') {
        actionRegistry.register(action);
      }
    }
  }

  // 5. Service resolver available globally
  // (registerService calls in _serverInit already set this up)
}
```

### What Changes from Dev Server

| Concern           | Dev Server                                    | Production                                       |
| ----------------- | --------------------------------------------- | ------------------------------------------------ |
| Loading modules   | `vite.ssrLoadModule(tsPath)`                  | `import(jsPath)`                                 |
| Code splitting    | `jay-stack:code-split` transform at load time | Pre-applied during build                         |
| Action discovery  | Glob scan + dynamic load at startup           | Pre-discovered, paths in route manifest          |
| Service init      | Vite-loaded init.ts with hot reload support   | Static import, no hot reload                     |
| Plugin init order | Topological sort at startup                   | Same sort, but modules pre-compiled              |
| Hot reload        | File watcher → re-import module               | Not applicable (restart server for code changes) |

### Action Registration in Route Manifest

The route manifest includes action entries for both project and plugin actions:

```typescript
interface RouteManifest {
  // ... routes, instances (from DL#134a)
  plugins: PluginEntry[];
  actions: ActionEntry[];
}

interface PluginEntry {
  name: string;
  packageName: string;
}

interface ActionEntry {
  serverModule: string; // relative path: "actions/cart.js" (project)
  packageName?: string; // "@wix/stores" (plugin — alternative to serverModule)
  isPlugin: boolean;
  actionNames: string[]; // ["cart.addToCart", "cart.removeFromCart"]
}
```

Project action names are discovered during the build by statically analyzing the action source files — `extractActionsFromSource()` in `transform-action-imports.ts` already does this. Plugin action names are discovered by loading the plugin's `dist/index.js` and scanning for `JayAction`-branded exports.

### Plugin Server Artifacts

Plugins are pre-compiled (DL#134 Q15) using the same `jayStackCompiler` build process as the project. They export:

- `dist/index.js` — server code (init, component definitions, actions)
- `dist/index.client.js` — client code

In the project server build, plugin imports are externalized — they resolve at runtime from `node_modules`. The production server must load and integrate plugin server artifacts:

| Plugin Artifact           | How Loaded                                      | Production Behavior                                                                                        |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Init** (`_serverInit`)  | `import(pluginPkg).init`                        | Runs at startup, registers services. Sorted topologically by dependencies.                                 |
| **Component definitions** | `import(pluginPkg).componentName`               | Loaded by page route handler when page uses `<jay:plugin-contract>` headless instances                     |
| **Actions**               | `import(pluginPkg).actionName`                  | Registered in action router at startup                                                                     |
| **Routes** (plugin pages) | `plugin.yaml` → `jayHtml` + `component` exports | Merged with project routes. Plugin pages go through the same per-instance build pipeline as project pages. |

Plugin init order is determined by reading `plugin.yaml` dependency declarations and topologically sorting, same as the dev server's `sortPluginsByDependencies()`.

**Plugin routes in production:** When a plugin provides page routes (DL#130), those routes are discovered during the build via `scanPluginRoutes()`. Plugin page components are already compiled in the plugin's `dist/index.js`. Plugin jay-html templates are resolved via the package's `exports` field in `package.json`. These plugin pages go through the same per-instance pipeline as project pages — slow render, server element compilation, hydration entry generation, Vite build.

### Service Lifecycle Differences

**Dev server (`service-lifecycle.ts`):**

- Hot reload support: watches init.ts, re-runs on change
- Graceful shutdown handlers (SIGTERM, SIGINT)
- Vite-based module loading

**Production:**

- No hot reload — restart for code changes
- Same graceful shutdown handlers
- Static `import()` — modules loaded once at startup
- Services are stateless (DL#134 Q14) — each server instance has its own service instances

The production service lifecycle is simpler — it's a subset of the dev server's lifecycle without hot reload.

## Implementation Plan

### Step 1: Entry Discovery

Create `discoverServerEntries()`:

- Reuse `scanRoutes()` for page discovery
- Glob scan for action files
- Fixed path for init.ts
- Output: `ServerBuildEntries` object

### Step 2: Server Build Function

Create `buildServerCode(entries, options)`:

- Configure Vite SSR build with discovered entries
- Externalize framework packages + plugins
- Output to `build/v{n}/server/`
- Run `extractActionsFromSource()` to populate action manifest entries

### Step 3: Production Service Lifecycle

Create a production variant of `ServiceLifecycleManager`:

- `import()` instead of `vite.ssrLoadModule()`
- No file watching or hot reload
- Same topological sort for plugin init order
- Same `registerService` / `__JAY_SERVICE_RESOLVER__` mechanism

### Step 4: Production Action Router

Adapt `action-router.ts` for production:

- Load action modules from compiled JS (pre-discovered paths from manifest)
- Same HTTP handling logic (request parsing, response formatting, streaming, multipart)
- Same service resolution via `__JAY_SERVICE_RESOLVER__`

## Questions

**Q1: Should the server build produce ESM or CJS?**

ESM. The project already uses ESM throughout (`"type": "module"` in package.json). Node.js supports `import()` for ESM modules. CJS would require additional configuration.

**Q2: Should the server build bundle framework packages or externalize them?**

Externalize. Framework packages are in `node_modules` and available at runtime. Bundling them would duplicate code and make debugging harder. The server runtime doesn't need the same optimization pressure as client bundles.

**Q3: Should we preserve the source directory structure in the output?**

Yes. Using `entryFileNames: '[name].js'` with structured entry names (`pages/home/page`) preserves the directory layout. This makes the route manifest simpler — paths are predictable from route patterns.

## Trade-offs

| Decision                                  | Pro                                                                   | Con                                                           |
| ----------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| Single Vite SSR build for all server code | One build step; Rollup deduplicates shared code between pages/actions | Rebuilds everything on any server code change                 |
| Externalize framework + plugins           | Smaller output; uses pre-compiled packages; easier debugging          | Requires node_modules available at deployment                 |
| Static action discovery (build-time)      | No glob scanning at startup; action list in manifest                  | Must rebuild to add/remove actions                            |
| No hot reload in production               | Simpler lifecycle; predictable behavior                               | Restart required for code changes (acceptable for production) |

## Verification Criteria

1. `vite build --ssr` produces valid JS for all server entries
2. Compiled page modules export `slowlyRender`, `fastRender`, `loadParams` correctly
3. Compiled action modules export branded `JayAction` constants
4. Service initialization works via `import()` without Vite
5. Plugin init order matches dev server behavior
6. Action router handles requests identically to dev server
7. No client code in server build output (interactive constructors stripped)

## Implementation Results

### Server Code Build

- `discoverServerEntries()` scans pages, actions, init, and **local plugin components** (`src/plugins/*/*.ts`)
- Rollup sanitizes `[slug]` to `_slug_` in output paths — build pipeline maps accordingly
- Services must be initialized before slow render (init runs in Phase 0 before Phase 1)

### Action Builder Stripping (compiler-jay-stack changes)

- `jay-stack:code-split` quick check: skip `.jay-html` files (they contain builder names as HTML text like `<code>makeJayStream</code>`)
- `jay-stack:action-transform`: new `transform` hook strips inline `makeJayAction`/`makeJayQuery`/`makeJayStream` statements from component files in client builds
- `transformJayStackBuilder` extended with `stripBuilders` parameter — `findChainRootBuilderName` walks AST to identify action builder statements, removes them before method stripping
- `analyzeUnusedStatements` cleans up now-unused builder imports
