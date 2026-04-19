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
