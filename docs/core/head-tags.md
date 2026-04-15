# Head Tags (SEO)

Components can inject `<title>`, `<meta>`, `<link>`, and other tags into the HTML `<head>` during SSR. This enables dynamic SEO metadata — product titles, descriptions, Open Graph tags, canonical URLs — rendered server-side for search engine crawlers.

## Quick Start

Return `headTags` from `phaseOutput()` in the slow or fast render phase:

```typescript
import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent<ProductPageContract>()
  .withServices(PRODUCTS_DB)
  .withSlowlyRender(async (props, db) => {
    const product = await db.getProduct(props.slug);
    return phaseOutput(
      { title: product.name, price: product.price },
      { productId: product.id },
      {
        headTags: [
          { tag: 'title', children: `${product.name} | My Store` },
          { tag: 'meta', attrs: { name: 'description', content: product.description } },
          { tag: 'meta', attrs: { property: 'og:title', content: product.name } },
          { tag: 'meta', attrs: { property: 'og:image', content: product.imageUrl } },
          { tag: 'link', attrs: { rel: 'canonical', href: `https://example.com/products/${product.slug}` } },
        ],
      },
    );
  });
```

The SSR pipeline serializes these tags and injects them into the `<head>` of the HTML response.

## HeadTag Interface

```typescript
interface HeadTag {
  tag: string;                        // Element name: 'title', 'meta', 'link', etc.
  attrs?: Record<string, string>;     // HTML attributes
  children?: string;                  // Text content (for non-void elements like <title>)
}
```

## Phase Behavior

- **Slow phase** headTags are rendered at build time (SSG)
- **Fast phase** headTags are rendered at request time (SSR)
- **Fast replaces slow entirely** — if the fast phase returns any headTags (even an empty array), they replace the slow phase's headTags completely. If fast returns no headTags (`undefined`), slow phase headTags are used.
- **No interactive phase** — head tags are SSR-only, not hydrated on the client

## Collision Handling

When multiple components on the same page declare head tags, collisions are resolved with **last-write-wins**:

- Tags are deduplicated by identity key:
  - `<title>` — singleton (one per page)
  - `<meta name="X">` — keyed by `name`
  - `<meta property="X">` — keyed by `property`
  - `<meta charset>` — singleton
  - `<link rel="canonical">` — singleton
  - Other tags — no dedup (always included)

- Ordering: page-level headless components (in template order), then the page component. The page component has final say.

- A warning is logged when two different components declare the same head tag.

## Mapping Generic SEO Data

If your data source provides a generic SEO structure (e.g., an array of tag objects with type/props/children), map it to `HeadTag[]` in the component:

```typescript
const headTags = seoData.tags.map(tag => ({
  tag: tag.type,
  attrs: Object.fromEntries(tag.props.map(p => [p.key, p.value])),
  children: tag.children,
}));

return phaseOutput(viewState, carryForward, { headTags });
```

## Restrictions

- **forEach components**: Head tags from components rendered inside `forEach` are ignored — a list item should not set the page title
- **Head tags replace the default title**: When a component provides a `<title>` tag, the framework's default `<title>` is suppressed
- **HTML escaping**: The framework escapes attribute values and text content automatically — no XSS risk from user data
