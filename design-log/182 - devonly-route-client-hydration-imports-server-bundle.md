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

| Bundle                      | dev-server refs | `@jay-framework/compiler-*` | `.withHandler` | `makeJayQuery` |
| --------------------------- | --------------- | --------------------------- | -------------- | -------------- |
| `index.client.js` (browser) | 0               | 0                           | 0              | 0              |
| `tools.js` (server)         | 1               | 2                           | 40             | 36             |

## Root Cause

Two source locations, one broken assumption ("plugin component bundle is always `index.js`"):

**1. `dev-server/lib/dev-server.ts` — `scanPluginRoutes` (line ~120):** a devOnly plugin route sets
`compPath` to the **`./tools`** entry, and carries no separate client path:

```ts
const compPath = isLocalComponent
  ? path.resolve(plugin.pluginPath, route.component)
  : resolvePluginModule(plugin, route.devOnly === true ? './tools' : '.'); // tools.js for devOnly
// ... createRoute(route.path, jayHtmlPath, compPath, componentExport, { devOnly })
```

**2. `stack-server-build/lib/load-page-parts.ts` — `loadPageParts` (line ~118):** derives the
**client** hydration import from that same `compPath` by rewriting a trailing `index.js`:

```ts
// For NPM plugin routes (componentExport set), use the /client entry for browser imports.
// The server entry (compPath) contains server-only code (actions, services).
const clientImportPath = route.componentExport
  ? route.compPath.replace(/index\.js$/, 'index.client.js') // only rewrites index.js!
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

### Design decision: new `clientCompPath` field vs. reusing `packageName`

`JayRoute` already has `packageName` (route-scanner.ts:24), which the **production** build uses to
form `${packageName}/client` (build-pipeline.ts:229, :508). Two options:

- **(A) — chosen:** add a resolved-filesystem `clientCompPath` on the route.
- **(B):** set `packageName` on dev plugin routes (currently unset by `scanPluginRoutes`) and resolve
  `${packageName}/client` the way production does.

We choose **(A)** because the dev server serves the hydration import as an **absolute `/@fs` path**
that Vite resolves directly (see the reproduction: `from ".../dist/tools.js"`), whereas production
emits a bare package specifier resolved at build time. `resolvePluginModule` already produces the
absolute path the dev browser import needs; a bare `${packageName}/client` specifier would push the
resolution into Vite's optimizeDeps and reintroduce cache-timing surprises. `clientCompPath` keeps
dev resolution explicit and eager. (Production stays on `packageName`; the two derivations remain
separate by design — noted in "Relationship to Other Logs".)

**0. Resolver choice — use `resolvePluginExport`, not `resolvePluginModule`, for the client entry.**
`resolvePluginModule` (dev-server.ts:182) is typed `'.' | './tools'` _and_ degrades to a manual
`index.*` scan when the export is absent — for `'./client'` that manual scan returns the server bundle,
recreating this exact bug. Rather than widen its union and inherit that fallback, resolve the client
entry through the sibling `resolvePluginExport(pluginPath, subpath)` (dev-server.ts:143), which reads
`package.json` `exports` **only** and returns `undefined` when `./client` is missing. No signature
change to `resolvePluginModule` is required. (`resolvePluginExport` also already handles the
object-form export `{ default: ... }`, matching how `./tools`/`.` are declared.)

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
  routePath,
  jayHtmlPath,
  compPath,
  componentExport?,
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
and pass it through. SSR `compPath` resolution is unchanged.

**Fail loudly, never fall back to a server bundle.** `resolvePluginModule` degrades to manual
`index.*` resolution when the requested export is absent — for `'./client'` that silently returns the
server `.` bundle, i.e. the exact bug this DL fixes. So the client entry must be resolved via the
**exports-only** `resolvePluginExport` (which returns `undefined` when `./client` is missing) and a
missing result must surface as a validation error at load, not degrade silently:

```ts
const compPath = isLocalComponent
  ? path.resolve(plugin.pluginPath, route.component)
  : resolvePluginModule(plugin, route.devOnly === true ? './tools' : '.');
const componentExport = isLocalComponent ? undefined : route.component;
// Client hydration must load the browser-safe bundle, never ./tools (devOnly) or . .
// resolvePluginExport reads package.json exports ONLY (no index.* fallback), so a plugin
// without a "./client" export yields undefined instead of the server bundle.
const clientCompPath = isLocalComponent
  ? undefined
  : resolvePluginExport(plugin.pluginPath, './client');

if (!isLocalComponent && !clientCompPath) {
  getLogger().error(
    `[Routes] Plugin "${plugin.name}" route ${route.path}: no "./client" export — ` +
      `hydration cannot load a browser-safe bundle. Add "./client" to package.json exports.`,
  );
  continue; // do not register a route that would import a server bundle into the browser
}

pluginRoutes.push(
  createRoute(route.path, jayHtmlPath, compPath, componentExport, {
    devOnly: route.devOnly === true,
    clientCompPath,
  }),
);
```

> Note: `resolvePluginExport` returns a path even for a _declared-but-unbuilt_ `./client` only if the
> file exists (it `accessSync`-checks in its fallback branch but the exports branch does not). If the
> `./client` file is declared but missing on disk, the hydration import will 404 — acceptable and
> obvious, unlike silently importing the server bundle. The build-order prevention rule below closes
> the "declared but unbuilt" window at validate time.

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

> The SSR-loaded component (`ssrLoadModule(compPath)[exportName]`) and the client import
> (`import {exportName} from clientImportPath`) reference the **same export name** (e.g. `aiditorPage`)
> in two different bundles. DL#179 guarantees `./client` re-exports the same members as `.`/`./tools`
> with server code stripped — so `exportName` must resolve in `./client` too. If it doesn't, the browser
> import resolves to `undefined` at hydration. The build-order/validation rule below is what enforces
> that guarantee.

### Prevention (validate before runtime)

Per prevention-first: this class of bug should be caught by `jay-stack validate`, not only at dev-server
runtime. Today `validate-plugin.ts:1232-1259` errors on a missing `./client` **only** when
interactivity is detected `=== true`; when interactivity is `'unknown'` (plugin not built at validate
time) it degrades to a _warning_. A `devOnly` route is hydrated by definition, so a plugin that
**provides any route** should require `./client` regardless of interactivity detection:

- In the plugin-validator, treat "manifest declares `routes`" as an independent trigger for the
  `./client` requirement (error, not warning), alongside `contexts !== undefined` and
  `interactivity === true`.
- This closes the "declared-but-unbuilt / interactivity-unknown" gap so the fsevents crash can never
  reach a running dev server.

### Tests (regression, in the jay repo)

The node_modules patch below proved the mechanism but leaves no guard in this repo. Add:

1. **`route-scanner/test/route-scanner.test.ts`** — `createRoute(..., { clientCompPath })` threads
   `clientCompPath` onto the route; omitted when not provided.
2. **`stack-server-build/test/generate-client-script.test.ts`** (or a `load-page-parts` test) — for a
   `devOnly` plugin route (`componentExport` set, `compPath` ending in `tools.js`, `clientCompPath`
   set), the generated `clientImport` targets the `./client` bundle and **contains no `tools.js` / `.`
   server path**. Assert with a full-string comparison (not `toContain` on code — per repo rules).
3. **`plugin-validator/test/validate-plugin.test.ts`** — a route-providing plugin without a `./client`
   export produces an **error** (covers the Prevention rule above).

### Validated in node_modules

The equivalent edits were applied to the built `@jay-framework/dev-server/dist/index.js` in the
aiditor repo and validated against the starter example (cold `.vite` cache):

- `GET /aiditor/` → HTTP 200, **0** fsevents/`.node` errors in the dev-server log.
- Hydration module now imports `from ".../dist/index.client.js"` (HTTP 200) instead of `tools.js`.
- All `/_jay/actions/*` endpoints resolve normally.

## Verification Criteria

**Automated (must exist in the jay repo before this is "done"):**

- [x] `route-scanner` test: `clientCompPath` threads through `createRoute` and is absent when unset.
- [x] `stack-server-build` test: a `devOnly` plugin route generates a hydration import of the `./client`
      bundle; the generated client script contains no `tools.js` / server `.` path (full-string compare).
- [x] `plugin-validator` test: a route-providing plugin missing `./client` reports an error.
- [x] Type check passes (`clientCompPath` field typed; `resolvePluginModule` union left unchanged — the
      client entry resolves via `resolvePluginExport`, so no widening was needed. See Implementation Results).

**Manual (end-to-end, aiditor starter, cold `.vite` cache):**

- [ ] Loading a `devOnly` plugin route (aiditor `/aiditor/`) produces no
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
  `${packageName}/client` (build-pipeline.ts:229, :508). This DL brings the dev server in line on the
  **net rule** (client hydration → `./client`), while keeping the **resolution mechanism** separate by
  design: production emits a bare package specifier resolved at build; dev emits an absolute `/@fs` path
  resolved eagerly (see "Design decision" above). Both must never point the browser at `.` or `./tools`.

## Implementation Results (2026-09-07)

Implemented per the "How to Fix" plan. Automated verification complete; manual (aiditor cold-cache) was
already validated in node_modules during diagnosis (see "Validated in node_modules").

**Source changes:**

1. `route-scanner/lib/route-scanner.ts` — added `clientCompPath?: string` to `JayRoute` and threaded it
   through `createRoute(..., { devOnly?, clientCompPath? })`.
2. `dev-server/lib/dev-server.ts` — `scanPluginRoutes` now resolves the client entry via
   `resolvePluginExport(plugin.pluginPath, './client')` (exports-only, no `index.*` fallback) and, for
   NPM plugin routes, fails loudly (`getLogger().error` + `continue`) when `./client` is absent rather
   than registering a route that would import a server bundle. `clientCompPath` is passed to `createRoute`.
3. `stack-server-build/lib/load-page-parts.ts` — the client-import selection now calls the new pure helper
   `resolveClientImportPath(route)` (prefers `clientCompPath`; falls back to the `index.js`→`index.client.js`
   rewrite only for legacy `componentExport` routes; local components hydrate from `compPath`).
4. `plugin-validator/lib/validate-plugin.ts` — the `./client` requirement now also triggers (error, not
   warning) when the manifest declares any `routes`, closing the "interactivity-unknown / declared-but-unbuilt"
   gap. Error message distinguishes the route trigger: "provides a route (hydrated in the browser)".

**Deviations from the plan:**

- **Step 0 (resolver):** the plan's early draft widened `resolvePluginModule`'s `'.' | './tools'` union to
  include `'./client'`; the finalized DL already replaced that with using `resolvePluginExport` instead
  (avoids the `index.*` server-bundle fallback). Implementation followed the finalized decision — **no
  signature change to `resolvePluginModule`**.
- **Step 3 (testability):** instead of leaving the client-path selection inline in `loadPageParts`
  (which needs a Vite server + fixtures to exercise), it was extracted into an exported pure function
  `resolveClientImportPath(route)`. This makes the DL#182 branch directly unit-testable without a dev
  server. Behavior is identical; only structure changed.

**Tests (all full-string comparisons, no `toContain` on code):**

- `route-scanner/test/route-scanner.test.ts` — +2 tests (`clientCompPath` threaded; omitted when unset).
- `stack-server-build/test/resolve-client-import-path.test.ts` — new, 4 tests (devOnly `tools.js` route →
  `./client`; non-devOnly `index.js` route → `./client`; fallback rewrite when no `clientCompPath`; local
  component → `compPath`).
- `plugin-validator/test/validate-plugin.test.ts` — +2 tests (route-providing plugin without `./client`
  errors with the route-specific message; route-providing plugin with `./client` does not error).

**Results:**

- route-scanner: 21/21 · stack-server-build: 51/51 · plugin-validator: 49/49 · dev-server: 710/710
  (incl. 678 hydration). All four packages build + type-check clean.
