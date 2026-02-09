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

Static override alongside a dynamic route:

```
src/pages/products/
├── [slug]/page.jay-html              # dynamic: /products/:slug
└── ceramic-flower-vase/page.jay-html # static override for this specific product
```

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

When a contract declares `params`, it means the component expects those URL parameters to be provided by the route. This tells you that the page using this contract **should be placed in a matching dynamic route directory**.

For example, if a contract declares:

```yaml
name: product-page
params:
  slug: string
tags:
  - ...
```

Then the page using this contract should live at a route that provides a `slug` param:

```
src/pages/products/[slug]/page.jay-html
```

### Discovering Param Values

For SSG with dynamic routes, the plugin component provides a `loadParams` generator that yields all valid param combinations. Use it to discover what routes will be generated:

```bash
jay-stack params wix-stores/product-page
# Output: [{"slug": "blue-shirt"}, {"slug": "red-hat"}, ...]
```

Params are always strings (URL params).
