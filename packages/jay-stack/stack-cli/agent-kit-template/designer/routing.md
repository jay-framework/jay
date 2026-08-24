# Directory-Based Routing

## Route Structure

Pages live under `src/pages/`. Directory names become URL segments.

```
src/pages/
├── page.jay-html                    → /
├── about/
│   └── page.jay-html                → /about
├── products/
│   ├── page.jay-html                → /products
│   └── [slug]/
│       └── page.jay-html            → /products/:slug
├── blog/
│   ├── page.jay-html                → /blog
│   └── [[slug]]/
│       └── page.jay-html            → /blog/:slug  (optional)
└── files/
    └── [...path]/
        └── page.jay-html            → /files/*  (catch-all)
```

## Dynamic Routes

| Syntax       | Meaning            | Example                                 |
| ------------ | ------------------ | --------------------------------------- |
| `[param]`    | Required parameter | `[slug]` → `/products/:slug`            |
| `[[param]]`  | Optional parameter | `[[slug]]` → `/blog` or `/blog/my-post` |
| `[...param]` | Catch-all          | `[...path]` → matches any sub-path      |

## Route Priority

Static routes match before dynamic routes (most specific first):

1. **Static segments** (exact match) — highest priority
2. **`[param]`** — required dynamic param
3. **`[[param]]`** — optional param
4. **`[...param]`** — catch-all — lowest priority

## Static Route Overrides

A static route can override a dynamic route for a specific URL — giving one particular page a custom layout while the dynamic route handles everything else:

```
src/pages/products/
├── [slug]/page.jay-html              # dynamic: /products/:slug
└── ceramic-flower-vase/page.jay-html # static override for this specific product
```

The static `ceramic-flower-vase/` route takes priority over `[slug]/` for that URL, but all other product URLs still use the dynamic route.

### Static Override Params and Headless Component Props

Static override routes use the same headless component as the dynamic route they override. Since the static route has no dynamic directory segment, the params must be declared in the headless component's YAML body:

```html
<!-- src/pages/products/ceramic-flower-vase/page.jay-html -->
<html>
  <head>
    <script
      type="application/jay-headless"
      plugin="wix-stores"
      contract="product-page"
      key="product"
    >
      slug: ceramic-flower-vase
    </script>
  </head>
  <body>
    <h1>{product.productName}</h1>
  </body>
</html>
```

The script body is YAML. Values are passed to the component as props alongside route params. This same mechanism is used for any per-component configuration:

```html
<script
  type="application/jay-headless"
  plugin="@jay-framework/markdown"
  contract="markdown-pages"
  key="post"
>
  contentDir: ./content
</script>
```

> **Note:** `<script type="application/jay-params">` is deprecated. Move param values into the headless component's script tag body.

## Page Files

Each page directory can contain:

| File                | Purpose                             |
| ------------------- | ----------------------------------- |
| `page.jay-html`     | Template (required for rendering)   |
| `page.jay-contract` | Page-level data contract (optional) |

### page.jay-contract

Defines the page's own ViewState — data that the page's server-side code provides:

```yaml
name: Page
tags:
  - tag: title
    type: data
    dataType: string
    phase: slow
  - tag: items
    type: sub-contract
    repeated: true
    trackBy: id
    tags:
      - tag: id
        type: data
        dataType: string
      - tag: name
        type: data
        dataType: string
```

## Dynamic Routes and Contract Params

When a component on the page — whether the page contract, a headless component, or a headfull full-stack component — declares `params`, the page should be placed in a dynamic route directory that provides those params.

For example, if a headless component's contract declares:

```yaml
name: product-page
params:
  slug: string
tags:
  - ...
```

Then the page using this component should live at a route that provides a `slug` param:

```
src/pages/products/[slug]/page.jay-html
```

Multiple components on the same page can each declare params. The route directory must provide all required params across all components. For example, if the page contract requires `lang` and a headless component requires `slug`, the page should live at `src/pages/[lang]/products/[slug]/page.jay-html`.

### Passing Route Params to Nested Components

Route params flow automatically to keyed headless components that declare them as `params` in their contract. Instance-based headless components and headfull components do not receive route params directly — they receive props from the template.

#### Direct binding with `jay.params` (no page.ts needed)

Use `jay.params.X` to bind route params directly to nested component props:

```html
<!-- src/pages/docs/[role]/[slug]/page.jay-html -->
<jay:DocsSidebar activeRole="{jay.params.role}" activePage="{jay.params.slug}" />
```

No `page.ts`, no page contract needed for param passing. `jay.params` is available at all render phases. Use `jay.url.path` for the full URL pathname:

```html
<jay:Sidebar currentPath="{jay.url.path}" />
```

See [jay-html-template-syntax.md](jay-html-template-syntax.md) for the full list of `jay.` bindings and [navigation-patterns.md](navigation-patterns.md) for active menu patterns.

#### Passing via page.ts (when you need data transformation)

When route params need processing before reaching the component (e.g., fetching data, computing derived values), use the `page.ts` passthrough pattern:

**1. Page contract exposes the param as ViewState:**

```yaml
# page.jay-contract
name: Page
params:
  slug: string
tags:
  - tag: activePage
    type: data
    dataType: string
    phase: slow
```

**2. `page.ts` passes the param into ViewState:**

```typescript
.withSlowlyRender(async (props) =>
  phaseOutput({ activePage: props.slug }, {})
)
```

**3. Template binds ViewState to the nested component prop:**

```html
<jay:SideNav activePage="{activePage}" />
```

The same pattern works with keyed headless data — if a keyed component already provides the value, bind directly: `<jay:SideNav activePage="{product.slug}" />`.

### Discovering Param Values

For SSG with dynamic routes, the plugin component provides a `loadParams` generator that yields all valid param combinations. Use it to discover what routes will be generated:

```bash
jay-stack params wix-stores/product-page
# Output: [{"slug": "blue-shirt"}, {"slug": "red-hat"}, ...]
```

Params are always strings (URL params). Routes are **case-sensitive** — a slug of `My-Page` produces the URL `/my-page` only if the param value is exactly `my-page`. Use lowercase for all param values and filenames that become URL segments.

## Query Parameters

URL query parameters (`?page=2&sort=price`) are available in the **fast render phase only** via `props.query`:

```typescript
.withFastRender(async (props, carryForward, dbService) => {
    const page = parseInt(props.query.page || '1');
    const sort = props.query.sort || 'name';
    const products = await dbService.getProducts({ page, sort });
    return phaseOutput({ products, currentPage: page }, {});
})
```

- `props.query` is `Record<string, string>` — empty `{}` when no query string
- Not available in the slow phase (compile error) — slow results are cached by path params only
- In the interactive phase, use `new URLSearchParams(window.location.search)` directly
