# Routing

Jay Stack uses directory-based routing where the file system structure maps directly to URL paths.

## Directory Structure

Pages live under `src/pages/`. Directory names become URL segments:

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

## Dynamic Route Params

Dynamic segments are declared using bracket syntax in directory names:

| Syntax       | Meaning            | Example URL                   |
| ------------ | ------------------ | ----------------------------- |
| `[param]`    | Required parameter | `/products/blue-shirt`        |
| `[[param]]`  | Optional parameter | `/blog` or `/blog/my-post`    |
| `[...param]` | Catch-all          | `/files/a/b/c` (any sub-path) |

Dynamic route params are available to the page's component via props. All param values are strings.

### Contract Params

When a component on the page — whether the page contract, a headless component, or a headfull full-stack component — declares `params`, the page should be placed in a dynamic route directory that provides those params:

```yaml
# product-page.jay-contract (used by a headless component)
name: product-page
params:
  slug: string
tags:
  - tag: productName
    type: data
    dataType: string
    phase: slow
```

This contract expects a `slug` param, so the page belongs at `src/pages/products/[slug]/page.jay-html`.

Multiple components on the same page can each declare params. The route directory must provide all required params across all components. For example, if the page contract requires `lang` and a headless component requires `slug`, the page should live at `src/pages/[lang]/products/[slug]/page.jay-html`.

## Route Priority

When multiple routes could match a URL, static routes take priority over dynamic ones:

1. **Static segments** (exact match) — highest priority
2. **`[param]`** — required dynamic param
3. **`[[param]]`** — optional param
4. **`[...param]`** — catch-all — lowest priority

## Static Route Overrides

A static route can override a dynamic route for a specific URL. For example, to give `/products/ceramic-flower-vase` a custom page while keeping the dynamic `/products/[slug]` for all other products:

```
src/pages/products/
├── [slug]/
│   └── page.jay-html                # dynamic: /products/:slug
└── ceramic-flower-vase/
    └── page.jay-html                # static override for this URL
```

The static route matches first due to route priority.

### Declaring Params for Static Overrides

Static override routes often use the same contract as the dynamic route they override. That contract expects URL params (e.g., `slug`), but a static route has no dynamic segments to extract them from.

Use `<script type="application/jay-params">` to explicitly declare the param values:

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
    <!-- custom layout for this specific product -->
  </body>
</html>
```

The script body is YAML. The declared params are passed to the component just as if they were extracted from a dynamic URL segment.

Without `jay-params`, the component would receive no param values and its `loadParams`-dependent data would not load correctly.

## Query Parameters

URL query parameters (`?page=2&sort=price`) are available in the **fast phase only** via `props.query`. They are not available in the slow phase because slow render results are cached by path params — query param variations would either bust the cache or serve stale content.

```typescript
// ✅ Fast phase — props.query is available
.withFastRender(async (props, carryForward, dbService) => {
    const page = parseInt(props.query.page || '1');
    const sort = props.query.sort || 'name';
    const products = await dbService.getProducts({ page, sort });

    return phaseOutput({ products, currentPage: page }, {});
})

// ❌ Slow phase — props.query does not exist (TypeScript error)
.withSlowlyRender(async (props, dbService) => {
    props.query  // ← compile error
})
```

`props.query` is a `Record<string, string>`. For repeated keys (`?tag=a&tag=b`), the last value wins. When the URL has no query string, `props.query` is `{}`.

The interactive phase (client-side) can read query params directly from the browser:

```typescript
const params = new URLSearchParams(window.location.search);
const page = params.get('page');
```

## Loading Params for SSG

For static site generation (SSG), dynamic routes need to know all possible param combinations at build time. Plugin components provide a `loadParams` generator that yields valid param sets:

```typescript
interface ProductParams extends UrlParams {
  slug: string;
}

async function* urlLoader(): AsyncIterable<ProductParams[]> {
  let offset = 0;
  const limit = 100;

  while (true) {
    const page = await getProducts({ offset, limit });
    yield page.items.map(({ slug }) => ({ slug }));

    if (!page.hasMore) break;
    offset += limit;
  }
}
```

The generator yields batches of params — pages are pre-rendered as each batch arrives rather than waiting for all params to be collected first.

You can discover available params using the CLI:

```bash
jay-stack params wix-stores/product-page
# Output: [{"slug": "blue-shirt"}, {"slug": "red-hat"}, ...]
```

See [Jay Stack Components](./jay-stack.md#url-parameter-loading) for more on `loadParams` and parameter loading patterns.
