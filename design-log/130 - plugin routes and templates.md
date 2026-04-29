# Design Log #130 — Plugin Routes and Templates

## Background

Plugins currently provide headless components, actions, services, and contexts — but not pages. Some plugins need to provide complete page experiences with a boxed design that doesn't need per-site visual customization. The primary use case is **backoffice / tooling applications** — admin panels, editors, dashboards — where the UI is functional, not brand-specific.

Example: the **AIditor** — a visual editor for Jay projects. It needs routes like `/aiditor`, `/aiditor/pages/[route]`, `/aiditor/contracts`, etc. These pages have their own UI, their own components, and their own page code. Packaging it as a Jay plugin means any Jay project can install it and get the editor at `/aiditor`.

Related design logs: #39 (plugin package), #60 (plugin system), #69 (route priority), #111 (headfull FS components), #128 (page freeze).

## Problem

A backoffice plugin like the AIditor needs to provide full pages — jay-html templates with styling, page components with three-phase rendering, and routes. Today, the project developer must:

1. Manually create route pages in `src/pages/` for each tool screen
2. Wire up the plugin's components and actions
3. Maintain these pages as the plugin evolves

This doesn't scale. The plugin author should ship the complete page experience — routes, templates, components, and styles — as part of the plugin package. The project just installs the plugin and the routes appear.

## Questions

1. **Q: Where do plugin pages live?**

   **A:** A plugin is just an NPM package with `package.json`. Page files (jay-html, CSS) are exported via `package.json` exports. The component is referenced by its exported name (same pattern as contracts and actions).

2. **Q: How are plugin routes discovered and registered?**

   **A:** From `plugin.yaml` — the `routes` array declares each route's path, jay-html export, and component name. The dev server reads these during startup.

3. **Q: What happens when a project defines the same route as a plugin?**

   **A:** Project route takes precedence. Plugin routes are only registered when no project route matches the same path.

4. **Q: Can the project customize a plugin page's template without ejecting?**

   **A:** Not for now. A project can override by creating the same route in `src/pages/`. In theory, the project could also use the plugin's component as a keyed headless component and create its own jay-html around it.

5. **Q: How do plugin routes work with route params and loadParams?**

   **A:** Same as any other page — the plugin page component supports `withLoadParams`, route params (`[slug]`), and three-phase rendering. A plugin route is essentially a headless component + jay-html + route path.

6. **Q: How do plugin pages work with NPM packages vs local plugins?**

   **A:** Same as other headless components — resolved via `package.json` exports for NPM, relative paths for local plugins.

### Key Insight

A plugin route is a **headless component + jay-html template + route path**. The component is declared the same way as any headless component (exported member name, contract, services). The jay-html is the inline template. The route is just the URL at which the dev server serves it. No new rendering concepts — just a new way to deliver an existing pattern.

## Design

### Plugin Pages in plugin.yaml

Plugins declare routes in `plugin.yaml`. Page files use `package.json` exports (same as contracts). The component uses the exported member name (same as headless components):

```yaml
name: aiditor
global: true

routes:
  - path: /aiditor
    jayHtml: aiditor-dashboard.jay-html
    css: aiditor-dashboard.css
    component: aiditorDashboard
    description: AIditor main dashboard — page list, freeze manager
  - path: /aiditor/pages/[route]
    jayHtml: aiditor-page-editor.jay-html
    css: aiditor-page-editor.css
    component: aiditorPageEditor
    description: AIditor page editor — visual editing with freeze and variant views
  - path: /aiditor/contracts
    jayHtml: aiditor-contracts.jay-html
    component: aiditorContracts
    description: AIditor contract browser — view all contracts and their tags

actions:
  - name: generateJayHtml
    action: generate-jay-html.jay-action
```

### Package.json Exports

The plugin's `package.json` exports the page files (same pattern as contracts):

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./plugin.yaml": "./plugin.yaml",
    "./aiditor-dashboard.jay-html": "./dist/pages/dashboard/page.jay-html",
    "./aiditor-dashboard.css": "./dist/pages/dashboard/page.css",
    "./aiditor-page-editor.jay-html": "./dist/pages/page-editor/page.jay-html",
    "./aiditor-page-editor.css": "./dist/pages/page-editor/page.css",
    "./aiditor-contracts.jay-html": "./dist/pages/contracts/page.jay-html",
    "./generate-jay-html.jay-action": "./dist/actions/generate-jay-html.jay-action"
  }
}
```

The component (`aiditorDashboard`) is an exported member from the package's main module — resolved the same way as headless component names.

### Route Resolution

For each route in `plugin.yaml`:

1. **jayHtml**: Resolved via `package.json` exports → `"./<jayHtml>"` → actual file path
2. **css**: Same — resolved via exports (optional)
3. **component**: Exported member name from the module (resolved via `index.ts` export chain, same as `resolveComponentSourcePath`)

This is the same resolution chain used for contracts (DL#124) — `plugin.yaml` → `package.json` exports → file on disk.

### Validation (validate-plugin)

`validate-plugin` should check:

- Each route's `jayHtml` is exported in `package.json`
- Each route's `css` (if present) is exported in `package.json`
- Each route's `component` exists as an exported member from the module
- Route `path` is a valid route pattern

### Route Priority: Project > Plugin

When both the project and a plugin define the same route:

1. **Project routes take precedence** — always. If a project has `src/pages/aiditor/page.jay-html`, it overrides the plugin's `/aiditor` route.
2. **Plugin routes fill gaps** — only registered when no project route matches.
3. **No conflict errors** — silent override. The project developer knows they're customizing.

Implementation: scan project routes first, then scan plugin routes, skip any that collide with project paths.

### Route Discovery and Registration

During dev server startup:

1. `scanRoutes(pagesRootFolder)` — scan project pages (existing behavior)
2. `scanPluginRoutes(plugins)` — new: scan plugin manifests for `routes` entries
3. Merge: for each plugin route, add only if no project route exists at the same path
4. Sort by priority (DL#69 rules apply to all routes)
5. Mount as Express handlers

```typescript
// In mkDevServer:
const projectRoutes = await scanRoutes(pagesRootFolder);
const pluginRoutes = await scanPluginRoutes(plugins, projectRoutes);
const allRoutes = [...projectRoutes, ...pluginRoutes];
const sorted = sortRoutesByPriority(allRoutes);
```

### Plugin Route Resolution

For each route in `plugin.yaml`, resolution follows the same chain as contracts (DL#124):

1. `jayHtml: products-page.jay-html` → look up `"./products-page.jay-html"` in `package.json` exports → resolve to disk path
2. `css: products-page.css` → same export lookup
3. `component: productPageRoute` → follow `index.ts` export chain to find the source file (same as `resolveComponentSourcePath`)

### Customizing Plugin Pages

A project can customize a plugin page in three ways:

1. **Full override**: Create the same route in `src/pages/` — completely replaces the plugin page
2. **Template override**: Use the plugin's component but provide a custom jay-html — declare in a project config or convention (future)
3. **No override**: Use the plugin page as-is

The simplest MVP is options 1 and 3 only. Template override (option 2) can be added later.

### How Plugin Pages Render

Plugin pages use the same rendering pipeline as project pages:

- **Slow phase**: `page.ts` runs `withSlowlyRender` / `withLoadParams`
- **Fast phase**: `page.ts` runs `withFastRender`
- **Interactive phase**: `page.ts` runs `withInteractive`
- **SSR**: jay-html is compiled to server element, rendered with ViewState
- **Hydration**: jay-html is compiled to hydrate script

The only difference: the source files come from the plugin's NPM package instead of `src/pages/`. For backoffice tools like the AIditor, this means the full editing UI is served by the same dev server, with the same SSR, hydration, and HMR support as project pages.

## Implementation Plan

### Phase 1: Extend plugin.yaml schema and validation

- Add `routes` field to `PluginManifest` type: `Array<{ path, jayHtml, css?, component, description? }>`
- Update `validate-plugin` to check:
  - `jayHtml` is exported in `package.json` exports
  - `css` (if present) is exported in `package.json` exports
  - `component` exists as an exported member from the module
  - `path` is a valid route pattern

### Phase 2: Plugin route scanning and resolution

- Add `scanPluginRoutes()` function
- For each plugin with `routes`, resolve file paths via `package.json` exports (reuse `resolveContractFile` pattern)
- Resolve component path via export chain (reuse `resolveComponentSourcePath`)
- Construct `JayRoute` for each, skipping routes that collide with project paths

### Phase 3: Dev server integration

- Merge plugin routes with project routes in `mkDevServer`
- Sort all routes by priority (DL#69)
- Plugin routes go through the same SSR/hydration pipeline

### Phase 4: Agent-kit integration

- `listRoutes()` in `DevServerService` returns both project and plugin routes
- Plugin routes include `source: 'plugin'` and plugin name
- `plugins-index.yaml` includes route information

## Trade-offs

- **Best for backoffice tools**: plugin routes suit tools/admin UIs where the design is boxed, not per-site. The AIditor, analytics dashboards, content editors — these don't need visual customization per project.
- **Project always wins**: simple rule, no conflict resolution needed. If a project defines the same route, it overrides the plugin's page.
- **Same rendering pipeline**: no special rendering for plugin pages. They're just pages with different source paths. Full SSR, hydration, HMR support.
- **Plugin-owned prefix**: each plugin chooses its own route prefix (e.g., `/aiditor`, `/admin`, `/cms`). The prefix should be recognizable and unique to the plugin to avoid collisions with project routes.
- **No template override (MVP)**: customizing a plugin page requires fully replacing it. Template-level customization (swap just the jay-html) is a future feature.
- **Plugin pages can use plugin components**: a plugin's page jay-html can reference its own headless components, actions, and services naturally.
- **Route scanning order**: project first, then plugins. This ensures project routes are never shadowed.

## Implementation Results

### Files Modified

| File                                                       | Change                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `compiler-shared/lib/plugin-resolution.ts`                 | Added `routes` field to `PluginManifest`                                                          |
| `plugin-validator/lib/validate-plugin.ts`                  | Route schema + export validation                                                                  |
| `route-scanner/lib/route-scanner.ts`                       | Added `parseRouteSegments()` and `createRoute()` exports                                          |
| `dev-server/lib/dev-server.ts`                             | `scanPluginRoutes()`, `resolvePluginExport()`, `resolvePluginModule()`, merge with project routes |
| `stack-server-runtime/lib/contract-materializer.ts`        | `RouteIndexEntry`, routes in `plugins-index.yaml`                                                 |
| `stack-cli/agent-kit-template/plugin/plugin-structure.md`  | Route entry fields documentation                                                                  |
| `examples/jay-stack/fake-shop/src/plugins/product-widget/` | Example admin dashboard route                                                                     |

### Deviations from Design

1. **Route parsing in route-scanner, not dev-server.** The design had all scanning in the dev server. Moved `parseRouteSegments` and `createRoute` to `@jay-framework/stack-route-scanner` since route parsing is a route-scanner concern.

2. **Local plugins use file paths, NPM use export names.** The `component` field in `routes` is a relative file path for local plugins (e.g., `./pages/admin/page.ts`) and an exported member name for NPM packages. Detected by checking if the value starts with `./`.

3. **Example uses product-widget plugin.** The fake-shop example adds an `/admin/products` route to the product-widget plugin, showing a product dashboard page with the same rendering pipeline as project pages.

4. **DevServerService registered as a Jay service.** `DEV_SERVER_SERVICE` marker created via `createJayService<DevServerService>('DevServerService')` and registered with `registerService` during `mkDevServer`. Plugin actions and components can inject it via `.withServices(DEV_SERVER_SERVICE)` to access route listing, param discovery, and freeze management. Import from `@jay-framework/dev-server`.

### loadRouteParams and route scanner fixes

**Route scanner: `compPath` existence check** — `route-scanner/lib/route-scanner.ts` always derived `compPath` by string replacement (`page.jay-html` → `page.ts`) without checking file existence. Routes without a `page.ts` got a non-existent `compPath`, causing SSR load failures. Fixed: `compPath` is now `''` when the file doesn't exist.

**`loadRouteParams` uses `loadPageParts` + `runLoadParams`** — The original `loadRouteParams` in `DevServerService` only loaded `page.ts` directly, ignoring keyed headless components that may also define `loadParams`. Rewritten to:

1. Call `loadPageParts()` to get all `DevServerPagePart[]` (page + keyed headless plugins)
2. Delegate to `runLoadParams()` in `stack-server-runtime/lib/slowly-changing-runner.ts`, which iterates all parts and calls `loadParams` on each one that defines it
3. Return empty when `compPath` is empty (no `page.ts`) or when no parts have `loadParams`

`DevServerService` constructor now takes `pagesBase`, `projectBase`, and `jayRollupConfig` to support calling `loadPageParts`.

| File                                                 | Change                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `route-scanner/lib/route-scanner.ts`                 | Check file existence for `compPath`, set `''` if missing                                        |
| `stack-server-runtime/lib/slowly-changing-runner.ts` | `runLoadParams(parts)` iterates all parts, resolves services, yields param batches              |
| `dev-server/lib/dev-server-service.ts`               | Constructor takes page/project config; `loadRouteParams` uses `loadPageParts` + `runLoadParams` |
| `dev-server/lib/dev-server.ts`                       | Pass config args to `DevServerService` constructor                                              |

### Fix: componentExport for NPM plugin page routes

NPM plugin routes declare the page component's export name in `plugin.yaml` (e.g., `component: aiditorPage`). But `loadPageParts` hardcoded the export name to `page`, so the SSR module load always accessed `.page` regardless of what the plugin declared.

**Fix:**

- `JayRoute.componentExport` — new optional field (default: `'page'`)
- `createRoute()` — accepts optional 4th arg `componentExport`
- Dev server — passes `route.component` as `componentExport` for NPM plugin routes (where the component field is an export name, not a file path)
- `loadPageParts()` — uses `route.componentExport || 'page'` for both SSR load and client import generation

| File | Change |
| --- | --- |
| `route-scanner/lib/route-scanner.ts` | `JayRoute.componentExport` field; `createRoute()` 4th arg |
| `dev-server/lib/dev-server.ts` | Pass `componentExport` for NPM plugin routes |
| `stack-server-runtime/lib/load-page-parts.ts` | Use `componentExport` instead of hardcoded `'page'` |
