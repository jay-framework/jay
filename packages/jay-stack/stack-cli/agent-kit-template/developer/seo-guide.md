# SEO Head Tags

Components inject `<title>`, `<meta>`, `<link>` tags into the HTML `<head>` during SSR by returning `headTags` from `phaseOutput()`.

## Basic Usage

```typescript
return phaseOutput(
  { title: product.name, price: product.price },
  { productId: product.id },
  {
    headTags: [
      { tag: 'title', children: `${product.name} | My Store` },
      { tag: 'meta', attrs: { name: 'description', content: product.description } },
      { tag: 'meta', attrs: { property: 'og:title', content: product.name } },
      { tag: 'meta', attrs: { property: 'og:description', content: product.description } },
      { tag: 'meta', attrs: { property: 'og:image', content: product.imageUrl } },
      { tag: 'link', attrs: { rel: 'canonical', href: canonicalUrl } },
    ],
  },
);
```

## HeadTag Type

```typescript
interface HeadTag {
  tag: string; // 'title', 'meta', 'link', etc.
  attrs?: Record<string, string>; // HTML attributes
  children?: string; // Text content (for <title>, <script>, etc.)
}
```

## Common SEO Tags

```typescript
// Page title
{ tag: 'title', children: 'Product Name | Store' }

// Meta description
{ tag: 'meta', attrs: { name: 'description', content: 'Product description here' } }

// Open Graph
{ tag: 'meta', attrs: { property: 'og:title', content: 'Product Name' } }
{ tag: 'meta', attrs: { property: 'og:description', content: 'Description' } }
{ tag: 'meta', attrs: { property: 'og:image', content: 'https://...' } }
{ tag: 'meta', attrs: { property: 'og:type', content: 'product' } }

// Twitter Card
{ tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } }
{ tag: 'meta', attrs: { name: 'twitter:title', content: 'Product Name' } }

// Canonical URL
{ tag: 'link', attrs: { rel: 'canonical', href: 'https://example.com/products/slug' } }

// JSON-LD structured data
{ tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify(structuredData) }
```

## Mapping Generic SEO Data

If the data source provides a generic structure (array of tags with type/props/children), map it:

```typescript
const headTags = seoData.tags.map((tag) => ({
  tag: tag.type,
  attrs: Object.fromEntries(tag.props.map((p) => [p.key, p.value])),
  children: tag.children,
}));

return phaseOutput(viewState, carryForward, { headTags });
```

## Phase Rules

- Return headTags from **slow** phase for build-time SEO data (product name, description)
- Return headTags from **fast** phase for per-request data (pricing, availability)
- Fast phase headTags **replace** slow phase entirely (no merge)
- No interactive phase — head tags are SSR-only

## Collision Rules

- `<title>` — singleton, last-write-wins
- `<meta name="X">` — keyed by `name`, last-write-wins
- `<meta property="X">` — keyed by `property`, last-write-wins
- `<link rel="canonical">` — singleton, last-write-wins
- Other tags — always included (no dedup)
- A warning is logged on collision between different components

## Restrictions

- Head tags from components inside `forEach` are ignored
- The framework handles HTML escaping automatically
