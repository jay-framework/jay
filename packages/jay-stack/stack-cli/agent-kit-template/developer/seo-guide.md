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

// JSON-LD structured data — prefer the jsonLd() helper (see below) over hand-building this tag
{ tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify(structuredData) }
```

## Structured Data (JSON-LD)

JSON-LD tells search engines and AI agents what a page _is_ (a product, article, recipe…). There are three ways to emit it — pick by where the data lives:

| Where the data lives                        | How to emit                                                             | Who writes it       |
| ------------------------------------------- | ----------------------------------------------------------------------- | ------------------- |
| Site-wide identity (org name, logo, social) | `.jay` `site.*` config — auto-emitted as `Organization` + `WebSite`     | Developer (config)  |
| Per-page dynamic data (product, article)    | `jsonLd(data)` from `page.ts`, returned in `headTags`                   | Developer (page.ts) |
| Static, hand-authored for one page          | `<script type="application/ld+json">` directly in the jay-html `<head>` | Designer (jay-html) |

### 1. Site-wide (`.jay` config)

Set site identity once; the production build auto-emits `Organization` + `WebSite` JSON-LD into every page's `<head>`:

```yaml
# .jay
site:
  baseUrl: https://example.com # also drives sitemap.xml
  name: Example Inc # required to emit Organization/WebSite JSON-LD
  logo: /logo.png # relative paths are resolved against baseUrl
  description: What we do
  sameAs:
    - https://twitter.com/example
    - https://github.com/example
```

Without `site.name`, no site-level JSON-LD is emitted (validation warns). Site-level JSON-LD is a **production** artifact (like `sitemap.xml`) — the dev server does not inject it.

### 2. Per-page (`jsonLd()` helper)

Use the `jsonLd()` helper from `@jay-framework/fullstack-component` for dynamic, per-page structured data — it builds the correct `HeadTag` and the framework escapes it breakout-safe:

```typescript
import { jsonLd } from '@jay-framework/fullstack-component';

return phaseOutput(viewState, carryForward, {
  headTags: [
    { tag: 'title', children: `${product.name} | Store` },
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.description,
      offers: { '@type': 'Offer', price: product.price, priceCurrency: 'USD' },
    }),
  ],
});
```

### 3. Static (jay-html `<head>`)

A `<script type="application/ld+json">` written directly in a jay-html `<head>` is **first-class** — no `jay-script="allow"` needed, no inline-script warning. The body is emitted breakout-safe. See the designer SEO guide.

### Validation

- `jay-stack validate` errors if a template `application/ld+json` block is not valid JSON or is missing `@context`/`@type`.
- `jay-stack validate` warns if `.jay` `site.name` is absent (no site-level JSON-LD).
- Never HTML-escape a JSON-LD body yourself — the framework escapes `<`, `>`, `&` as `\uXXXX` so the JSON stays valid and cannot break out of the `<script>`.

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

## Agent-Discovery Files (DL#214)

A Jay production build emits the conventional files agents and crawlers look for. Most are generated from the route manifest + `.jay` `site` config — you mostly configure `site.*`; one file (`ard.json`) you author.

### Generated automatically (override by placing your own file in `public/`)

| File           | When generated                  | Source                                                                   |
| -------------- | ------------------------------- | ------------------------------------------------------------------------ |
| `/sitemap.xml` | `site.baseUrl` set              | route manifest                                                           |
| `/llms.txt`    | `site.name` set                 | `site.name`/`site.description` + per-page `<title>`/`<meta description>` |
| `/robots.txt`  | always (if you didn't ship one) | default allow-all + `Sitemap:` line when `site.baseUrl` set              |

`llms.txt` is a markdown index of the site for LLMs: an H1 (`site.name`), a summary (`site.description`), and per-section links with each page's title + description. An author file at `public/llms.txt` / `public/robots.txt` always wins — the build never clobbers it.

### `/.well-known/*` — just works in `public/`

Drop any `.well-known` file (agent/tool manifests, `security.txt`, etc.) into `public/.well-known/` and it is served at `/.well-known/*` in **both** dev and production. (The dev server opts into serving dotdirs; production already did.)

### `/.well-known/ard.json` — you author this

Agentic Resource Discovery ([ARD v0.91](https://agenticresourcediscovery.org/spec)) lets agents discover a site's resources/APIs. The framework does **not** generate it — `jay-stack validate` warns when it's absent and validates its shape when present. Author `public/.well-known/ard.json`:

```json
{
  "entries": [
    {
      "identifier": "urn:air:acme:weather:node",
      "displayName": "Weather Data Node",
      "type": "application/mcp-server-card+json",
      "url": "https://api.acme.com/mcp/weather.json",
      "representativeQueries": ["weather in Paris", "forecast for tomorrow"],
      "description": "Live weather data and forecasts",
      "tags": ["weather", "forecast"]
    }
  ]
}
```

Each entry **requires**: `identifier` (URN `urn:air:<publisher>:<namespace>:<name>`), `displayName`, `type` (an IANA media type), and **exactly one** of `url` or `data`. `representativeQueries` (2–5) is strongly recommended — agents use it to find your resource. `ard.json` is pinned to v0.91 ("Proposal" status — expect the schema to move).

**Predecessor alias:** ARD renamed `ai-catalog.json` → `ard.json`. For older clients, also write a copy at `public/.well-known/ai-catalog.json`. `ard.json` is canonical; validation warns if only the alias exists or the two differ.

**No agent resources?** If the site exposes nothing agent-callable, suppress the presence nudge instead of authoring an empty file — add to `.jay` (it governs the project-level `ard.json`, so it lives in project config, not a page's `application/jay-validations` script):

```yaml
# .jay
validations:
  allow-no-ard: true
```
