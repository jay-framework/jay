# Plugin Routes

Plugins can provide complete pages served by the dev server. This is designed for backoffice tools, admin dashboards, and editors — pages with a boxed design that doesn't need per-site visual customization.

## When to Use Plugin Routes

- **Admin dashboards** — product management, analytics, settings
- **Editor tools** — visual page editors, contract browsers
- **Developer tools** — debugging panels, state inspectors

Plugin routes are NOT for end-user pages that need visual customization per site. For those, provide headless components and let the project create its own pages.

## Creating a Plugin Route

A plugin route is a **headless component + jay-html template + route path**. It uses the same rendering pipeline as project pages.

### 1. Create the jay-html template

```html
<!-- pages/admin/page.jay-html -->
<html>
  <head>
    <script type="application/jay-data">
      data:
          title: string
          items:
              - name: string
                count: number
    </script>
    <style>
      .admin {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        font-family: system-ui;
      }
    </style>
  </head>
  <body>
    <div class="admin">
      <h1>{title}</h1>
      <div forEach="items" trackBy="name"><span>{name}</span>: <strong>{count}</strong></div>
    </div>
  </body>
</html>
```

**Jay-html expression rules** — plugin route templates use the same binding syntax as project pages. `if` and `{…}` resolve **tag names only**; no `.length`, method calls, or bracket indexing. For empty lists, expose `hasItems: boolean` or `itemCount: number` in ViewState / the inline `application/jay-data` block. See [jay-html-template-syntax.md](../designer/jay-html-template-syntax.md#expression-limits-important).

### 2. Create the page component

```typescript
// pages/admin/page.ts
import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import { MY_SERVICE, MyService } from '../../services';

export const page = makeJayStackComponent()
  .withProps<{}>()
  .withServices(MY_SERVICE)
  .withFastRender(async (_props, myService: MyService) => {
    const data = await myService.getDashboardData();
    return phaseOutput({ title: 'Admin Dashboard', items: data.items }, {});
  });
```

The page component follows the same pattern as any `makeJayStackComponent` — supports `withSlowlyRender`, `withFastRender`, `withInteractive`, `withLoadParams`, and `withServices`.

### 3. Declare the route in plugin.yaml

```yaml
name: my-plugin
routes:
  - path: /admin/dashboard
    jayHtml: ./pages/admin/page.jay-html
    component: ./pages/admin/page.ts
    description: Admin dashboard showing key metrics
```

For local plugins, `jayHtml` and `component` are relative paths. For NPM packages, use `package.json` export subpaths.

### 4. For NPM packages — export the page files

```json
{
  "exports": {
    "./admin-dashboard.jay-html": "./dist/pages/admin/page.jay-html",
    "./admin-dashboard.css": "./dist/pages/admin/page.css"
  }
}
```

Then reference the export subpath in plugin.yaml:

```yaml
routes:
  - path: /admin/dashboard
    jayHtml: admin-dashboard.jay-html
    css: admin-dashboard.css
    component: adminDashboard
```

## Route Parameters

Plugin routes support the same parameter patterns as project routes:

```yaml
routes:
  - path: /admin/products/[id]
    jayHtml: ./pages/product-detail/page.jay-html
    component: ./pages/product-detail/page.ts
```

The page component can use `withLoadParams` for SSG parameter discovery:

```typescript
export const page = makeJayStackComponent()
  .withProps<{}>()
  .withServices(PRODUCTS_SERVICE)
  .withLoadParams<{ id: string }>(async function* (productsService) {
    const products = await productsService.listAll();
    yield products.map((p) => ({ id: p.id }));
  })
  .withSlowlyRender(async (props: { id: string }, productsService) => {
    const product = await productsService.getById(props.id);
    return phaseOutput({ name: product.name, price: product.price }, {});
  });
```

## Route Priority

Project routes always take precedence. If the project creates a page at the same path, the plugin's route is skipped:

```
src/pages/admin/dashboard/page.jay-html   ← project wins
plugin provides /admin/dashboard          ← skipped
```

This lets projects override any plugin page without modifying the plugin.

## Prefix Convention

Each plugin should choose a recognizable route prefix to avoid collisions:

- `/admin/...` — admin tools
- `/aiditor/...` — AIditor editor
- `/cms/...` — content management

There is no enforced convention — just pick a prefix that's unique and descriptive.

## Dev-only routes

Some plugin pages are **dev-server tooling** — internal dashboards, QA fixtures, builder settings UIs. Mark them with `devOnly: true` so consumers of `listRoutes()` can distinguish them from public site pages. Production builds do not yet exclude `devOnly` routes — that is planned for a future framework release.

```yaml
routes:
  - path: /my-plugin/admin
    jayHtml: ./lib/pages/admin/page.jay-html
    component: adminPage
    devOnly: true
    description: Dev-server admin UI
```

### What `devOnly` does (framework)

| Concern                        | Behavior                                                             |
| ------------------------------ | -------------------------------------------------------------------- |
| Dev server HTTP                | **Served normally** — direct URL works                               |
| `listRoutes()` / `RouteInfo`   | Includes route with `devOnly: true`                                  |
| Page navigation UIs            | **Consumer choice** — tools may filter `devOnly` routes from pickers |
| Routes loaded by explicit path | **Unaffected** — embed/host tools pass a known route URL             |
| Production build               | **Deferred** — future task excludes dev-only routes                  |

### Standalone access

Dev-only pages remain reachable at their URL on the dev server (new browser tab, bookmark). **This is intentional** — useful for debugging and optional standalone experiences.

Plugin authors decide how to handle visitors who open the URL outside an embedding host:

- **Redirect / gate** — explain the page is meant for a design tool
- **Standalone mode** — offer the same UI with appropriate copy
- **Hybrid** — embed in tool + "open in new tab" for power users

Example: detect iframe context (`?_jay_embed=true` or `window.parent !== window`) and adjust messaging.

### AIditor Project settings routes

Settings tabs embed a plugin route by URL. The usual pattern:

1. Ship `agent-kit/aiditor/settings.template.yaml` with `route` matching `routes[].path`
2. Materialize to `agent-kit/aiditor/settings/<plugin>.yaml` in the **project** via the `agentkit` handler
3. Set **`devOnly: true`** on that route entry

AIditor filters `devOnly` routes from the **Pages** dropdown but loads the settings iframe by explicit path — HTTP must remain available on the dev server.

Full contributor steps: [aiditor-settings-guide.md](aiditor-settings-guide.md). Runtime iframe protocol: `agent-kit/plugin/aiditor-add-menu.md` (after `jay-stack setup aiditor`).
