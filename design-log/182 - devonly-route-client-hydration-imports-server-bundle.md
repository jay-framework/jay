# Design Log #182 — devOnly Route Client Hydration Imports the Server Bundle

> A `devOnly` plugin route's **client hydration** import resolves to the plugin's server SSR bundle
> (`./tools`) instead of its browser-safe bundle (`./client`). The browser then pulls the entire
> server bundle — including `@jay-framework/dev-server` → `vite` → `fsevents` — into the optimizeDeps
> graph, producing `No loader is configured for ".node" files: fsevents.node`. Regression introduced
> by DL#180's dev-server route resolution.

## Background

- **DL#179** — runtime (`.`, compiler-free) vs tools (`./tools`, compiler-OK) entry split. A plugin
  also ships a browser bundle at **`./client`** (`index.client.js`) where the compiler's runtime-mode
  transform has stripped all server code (action handlers, services, dev-server/compiler imports).
- **DL#180** — `routes[].devOnly` / `actions[].devOnly`. A `devOnly` route whose page component uses
  the compiler resolves its component from `./tools` on the dev server (Phase 2, step 3:
  "devOnly route component resolution from `./tools` when present").
- The **aiditor** plugin (DL#180's driving case) migrated its `/aiditor` route to `devOnly: true`.
  This is the first real consumer of devOnly-route resolution, and is where the bug surfaced.

The dev server serves each page as SSR HTML plus a hydration `<script type="module">`. The hydration
script imports the page component for the **browser**. That import must always target the plugin's
`./client` bundle — the browser must never load `./tools` (server-only: dev-server + compiler) nor
`.` (server actions/services).

## Problem

Running the aiditor starter example (`yarn dev`, then load `/aiditor/`) fails on a cold Vite cache:

```
✘ [ERROR] No loader is configured for ".node" files: ../../node_modules/fsevents/fsevents.node
    ../../node_modules/fsevents/fsevents.js:13:23:
      13 │ const Native = require("./fsevents.node");
[vite] error while updating dependencies:
Error: Build failed with 1 error:
  ../../node_modules/fsevents/fsevents.js:13:23: ERROR: No loader is configured for ".node" files ...
```

The error fires immediately after `GET /aiditor/`, during Vite's browser **optimizeDeps** pass. It is
**not** a fsevents problem per se — fsevents only enters the browser dep graph because the hydration
import chain reaches it:

```
/aiditor/ hydration script
  → import { aiditorPage } from ".../dist/tools.js"   ← WRONG: server bundle
      → @jay-framework/dev-server → vite → chokidar → fsevents → fsevents.node
```

The correctly-stripped `dist/index.client.js` exists and is clean — the browser is simply never
pointed at it. Bundle audit of the aiditor plugin confirms the stripping plugin works; only the
resolution is wrong:

| Bundle                     | dev-server refs | `@jay-framework/compiler-*` | `.withHandler` | `makeJayQuery` |
| -------------------------- | --------------- | --------------------------- | -------------- | -------------- |
| `index.client.js` (browser) | 0             | 0                           | 0              | 0              |
| `tools.js` (server)        | 1               | 2                           | 40             | 36             |

## Root Cause

Two source locations, one broken assumption ("plugin component bundle is always `index.js`"):

**1. `dev-server/lib/dev-server.ts` — `scanPluginRoutes` (line ~120):** a devOnly plugin route sets
`compPath` to the **`./tools`** entry, and carries no separate client path:

```ts
const compPath = isLocalComponent
    ? path.resolve(plugin.pluginPath, route.component)
    : resolvePluginModule(plugin, route.devOnly === true ? './tools' : '.');   // tools.js for devOnly
// ... createRoute(route.path, jayHtmlPath, compPath, componentExport, { devOnly })
```

**2. `stack-server-build/lib/load-page-parts.ts` — `loadPageParts` (line ~118):** derives the
**client** hydration import from that same `compPath` by rewriting a trailing `index.js`:

```ts
// For NPM plugin routes (componentExport set), use the /client entry for browser imports.
// The server entry (compPath) contains server-only code (actions, services).
const clientImportPath = route.componentExport
    ? route.compPath.replace(/index\.js$/, 'index.client.js')   // only rewrites index.js!
    : route.compPath;
```

The comment states the correct intent, but the `/index\.js$/` regex only fires when `compPath` ends
in `index.js`. For a devOnly route `compPath` is `dist/tools.js`; the regex does not match, so
`clientImportPath` stays `dist/tools.js` and the browser imports the server bundle.

- **Non-devOnly route:** `compPath = dist/index.js` → regex rewrites → `dist/index.client.js` ✅
- **devOnly route:** `compPath = dist/tools.js` → regex no-op → `dist/tools.js` ❌

This is a DL#180 regression: pointing devOnly SSR at `./tools` silently repurposed the single
`compPath` that also feeds the client import. Production build is unaffected — it already resolves the
client import from the package's `/client` export explicitly
(`production-build/lib/builder/build-pipeline.ts:229`, ``const clientImportPath = `${pluginInit.packageName}/client` ``).
Only the dev server derives the client path from `compPath`.

## How to Reproduce

Requires a plugin with a `devOnly: true` route whose component is an NPM export (`componentExport`
set) — e.g. aiditor's `/aiditor` route (`component: aiditorPage`, `devOnly: true`).

```bash
# In the consuming project (aiditor/examples/starter)
rm -rf node_modules/.vite        # force a cold optimizeDeps pass
yarn dev                         # dev server boots
curl -s http://localhost:3000/aiditor/    # trigger hydration graph + optimizeDeps
# → dev-server log shows: No loader is configured for ".node" files: fsevents.node
```

Confirm the mechanism (the hydration module imports the server bundle):

```bash
curl -s 'http://localhost:3000/@id/__x00__aiditor/index.html?html-proxy&index=0.js' \
  | grep -oE "from ['\"][^'\"]+['\"]"
# → from ".../dist/tools.js"        (BUG — should be .../dist/index.client.js)
```

A warm `.vite/deps` cache hides the error (deps already pre-bundled), so the cold cache
(`rm -rf node_modules/.vite`) is essential to reproduce.

## How to Fix

A devOnly route's **SSR** loads from `./tools`; its **client hydration** must always load `./client`.
Carry an explicit client path on the route instead of pattern-matching `compPath`.

**1. `route-scanner/lib/route-scanner.ts`** — add a first-class field to `JayRoute` and thread it
through `createRoute`:

```ts
export type JayRoute = {
    // ...
    compPath: string;
    /** Browser-safe (./client) bundle path for hydration; distinct from SSR compPath. */
    clientCompPath?: string;
    componentExport?: string;
    // ...
};

export function createRoute(
    routePath, jayHtmlPath, compPath, componentExport?,
    options?: { devOnly?: boolean; clientCompPath?: string },
): JayRoute {
    return {
        // ...
        compPath,
        ...(options?.clientCompPath && { clientCompPath: options.clientCompPath }),
        ...(componentExport && { componentExport }),
        ...(options?.devOnly && { devOnly: true }),
    };
}
```

**2. `dev-server/lib/dev-server.ts` — `scanPluginRoutes`** — resolve `./client` for plugin (NPM) routes
and pass it through. SSR `compPath` resolution is unchanged:

```ts
const compPath = isLocalComponent
    ? path.resolve(plugin.pluginPath, route.component)
    : resolvePluginModule(plugin, route.devOnly === true ? './tools' : '.');
const componentExport = isLocalComponent ? undefined : route.component;
// Client hydration must load the browser-safe bundle, never ./tools (devOnly) or . :
const clientCompPath = isLocalComponent
    ? undefined
    : resolvePluginModule(plugin, './client');

pluginRoutes.push(
    createRoute(route.path, jayHtmlPath, compPath, componentExport, {
        devOnly: route.devOnly === true,
        clientCompPath,
    }),
);
```

**3. `stack-server-build/lib/load-page-parts.ts` — `loadPageParts`** — prefer the explicit client path;
keep the `index.js` rewrite only as the fallback for local components:

```ts
const clientImportPath = route.clientCompPath
    ? route.clientCompPath
    : route.componentExport
      ? route.compPath.replace(/index\.js$/, 'index.client.js')
      : route.compPath;
```

Net rule: **SSR resolves `./tools` for devOnly (`.` otherwise); client hydration always resolves
`./client`, never `./tools` or `.`.**

### Validated in node_modules

The equivalent edits were applied to the built `@jay-framework/dev-server/dist/index.js` in the
aiditor repo and validated against the starter example (cold `.vite` cache):

- `GET /aiditor/` → HTTP 200, **0** fsevents/`.node` errors in the dev-server log.
- Hydration module now imports `from ".../dist/index.client.js"` (HTTP 200) instead of `tools.js`.
- All `/_jay/actions/*` endpoints resolve normally.

## Verification Criteria

- [ ] With a cold `.vite` cache, loading a `devOnly` plugin route (aiditor `/aiditor/`) produces no
      `No loader is configured for ".node"` error.
- [ ] The hydration module for a `devOnly` route imports the plugin's `./client` bundle
      (`index.client.js`), not `./tools` or `.`.
- [ ] A non-devOnly plugin route still hydrates from `./client` (no regression).
- [ ] No `@jay-framework/dev-server` / `@jay-framework/compiler-*` / fsevents references enter the
      browser optimizeDeps graph for a devOnly route.

## Relationship to Other Logs

- **Fixes a regression from DL#180** — devOnly route resolution (`./tools`) was applied to a `compPath`
  that also fed the client hydration import.
- **Depends on DL#179** — the `./client` browser bundle is the correct hydration target; the compiler's
  runtime transform already strips it clean.
- **Consistency with production** — `production-build` already resolves the client import from
  `${packageName}/client`; this brings the dev server in line.
