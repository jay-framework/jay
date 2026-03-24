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

### Static Override Params (`jay-params`)

Static override routes often use the same contract as the dynamic route they override. Since the static route has no dynamic directory segment, the params must be declared explicitly using `<script type="application/jay-params">`:

```html
<!-- src/pages/products/ceramic-flower-vase/page.jay-html -->
<html>
  <head>
    <script type="application/jay-params">
      slug: ceramic-flower-vase
    </script>
    <script
      type="application/jay-headless"
      plugin="wix-stores"
      contract="product-page"
      key="product"
    ></script>
  </head>
  <body>
    <h1>{product.productName}</h1>
  </body>
</html>
```

The script body is YAML. The declared params are passed to the component as if extracted from a dynamic URL segment. Without this, the component would receive no param values.

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

### Discovering Param Values

For SSG with dynamic routes, the plugin component provides a `loadParams` generator that yields all valid param combinations. Use it to discover what routes will be generated:

```bash
jay-stack params wix-stores/product-page
# Output: [{"slug": "blue-shirt"}, {"slug": "red-hat"}, ...]
```

Params are always strings (URL params).
