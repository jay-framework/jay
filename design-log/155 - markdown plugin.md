# Design Log #155 — Markdown Plugin

## Background

Jay Stack needs a markdown rendering plugin for content-driven pages — blogs, documentation, changelogs, knowledge bases. The plugin should integrate with the three-phase rendering model, support code highlighting and mermaid diagrams, and work with both static directories of markdown files and dynamic markdown values.

### Related

- DL#39 — Plugin package requirements
- DL#60 — Plugin system refinement, dynamic contracts
- DL#84 — Headless component props
- DL#85 — Rendering phases and agent kit
- DL#130 — Plugin routes and templates
- DL#152 — Phase-aware contract props

## Problem

No built-in way to render markdown content in Jay Stack pages. Projects that need blog posts, documentation, or markdown-driven content must implement their own parsing, rendering, and routing. This is a common enough need to warrant a plugin.

## Questions & Answers

**Q1: How should the directory-to-pages component know which markdown directory to scan?**

A1: Via props on the headless component script tag. This requires a framework change — currently `<script type="application/jay-headless">` supports `plugin`, `contract`, and `key` attributes but no `props`. See "Framework Gap" section below.

**Q2: Should code highlighting use a JS library (Shiki, Prism) or CSS-only?**

A2: CSS-only with pre-tagged HTML. The marked renderer extension tokenizes code into `<span class="token keyword">` etc. A shipped CSS file provides colors. No client JS needed, theme-able via CSS custom properties.

**Q3: Should mermaid render at build time or client-side?**

A3: Build-time SVG in the slow phase. No client JS, no layout shift, diagrams are part of the static HTML. Mermaid is a build-time dependency only.

**Q4: What markdown parser?**

A4: `marked` — fast, lightweight, extensible via tokenizer/renderer extensions.

**Q5: Should the single-value renderer support interactive updates?**

A5: Yes — two components. `markdown-content` renders at slow phase (static). `markdown-live` renders at fast+interactive (dynamic, re-parses on client when value changes).

## Design

### Components

#### 1. `markdown-pages` — Directory to pages

A headless component that scans a directory of `.md` files and provides page data. The page's `page.jay-html` references it, and it contributes a `slug` param via `loadParams`.

**Usage in page.jay-html:**

```html
<html>
  <head>
    <script
      type="application/jay-headless"
      plugin="@jay-framework/markdown"
      contract="markdown-pages"
      key="post"
      props='{ "contentDir": "./content" }'
    ></script>
  </head>
  <body>
    <article>
      <h1>{post.title}</h1>
      <time>{post.date}</time>
      <div>{post.content}</div>
    </article>
  </body>
</html>
```

**Directory structure:**

```
src/pages/blog/[slug]/
  page.jay-html          ← references markdown-pages
  page.jay-contract      ← optional, for page-level data
  content/
    getting-started.md
    advanced-topics.md
    changelog.md
```

**Markdown file format:**

````markdown
---
title: Getting Started
date: 2026-07-15
description: Learn how to set up the project
tags: [tutorial, beginner]
---

# Getting Started

Your content here...

```typescript
const hello = 'world';
```

```mermaid
graph LR
  A[Start] --> B[End]
```
````

**Component behavior:**

- `loadParams` scans `contentDir` relative to the page, yields `{ slug }` for each `.md` file (filename without extension)
- Slow render: reads the markdown file, extracts frontmatter, parses markdown to HTML (with code highlighting and mermaid SVG), returns ViewState
- No fast or interactive phases needed — content is static

#### 2. `markdown-content` — Static single-value renderer

Takes a markdown string via props, renders to HTML at build time.

**Usage:**

```html
<jay:markdown-content>
  <div>{html}</div>
</jay:markdown-content>
```

The component receives markdown via props (from the parent page's data), renders at slow phase, outputs `html-string`.

#### 3. `markdown-live` — Dynamic single-value renderer

Takes a markdown string that can change at request time or on the client.

**Usage:**

```html
<jay:markdown-live>
  <div>{html}</div>
</jay:markdown-live>
```

- Fast phase: server-side markdown parse with `marked`
- Interactive phase: client-side re-parse when the markdown prop changes
- Ships `marked` to the client bundle (lightweight ~35KB)

### Framework Gap: Props on Keyed Headless Components

**Current state:** `parseHeadlessImports` in `compiler-jay-html/lib/jay-target/jay-html-parser.ts` (line 622) reads `plugin`, `contract`, and `key` attributes from `<script type="application/jay-headless">`. No `props` attribute is parsed.

**What's needed:** The `markdown-pages` component needs `contentDir` as a prop. Instance-based headless components (`<jay:markdown-content>`) already support props via the contract's `props` section. But page-level keyed headless components don't.

**Proposed fix:** Add `props` attribute parsing to `parseHeadlessImports`. The attribute value is a JSON string. Parsed props are passed to the component's `withSlowlyRender` / `withFastRender` via the existing `props` parameter.

```html
<script
  type="application/jay-headless"
  plugin="@jay-framework/markdown"
  contract="markdown-pages"
  key="post"
  props='{ "contentDir": "./content" }'
></script>
```

This is a small, backward-compatible change — existing headless imports without `props` continue to work. The contract's `props` section declares the expected shape, and the validate command checks consistency (DL#124, DL#152).

### Contracts

**markdown-pages.jay-contract:**

```yaml
name: markdown-pages
description: Renders a directory of markdown files as pages

props:
  - name: contentDir
    kind: required
    description: Path to markdown directory (relative to page)

params:
  - name: slug
    kind: required

tags:
  - tag: title
    type: data
    dataType: string
    phase: slow
    description: Title from frontmatter

  - tag: content
    type: data
    dataType: html-string
    phase: slow
    description: Rendered HTML from markdown body

  - tag: description
    type: data
    dataType: string
    phase: slow
    description: Description from frontmatter

  - tag: date
    type: data
    dataType: string
    phase: slow
    description: Date from frontmatter (ISO string)

  - tag: tags
    type: sub-contract
    repeated: true
    phase: slow
    description: Tags from frontmatter
    tags:
      - tag: name
        type: data
        dataType: string

  - tag: frontmatter
    type: data
    dataType: string
    phase: slow
    description: Full frontmatter as JSON string (for custom fields)
```

**markdown-content.jay-contract:**

```yaml
name: markdown-content
description: Renders a markdown string to HTML at build time

props:
  - name: markdown
    kind: required
    description: Markdown string to render

tags:
  - tag: html
    type: data
    dataType: html-string
    phase: slow
```

**markdown-live.jay-contract:**

```yaml
name: markdown-live
description: Renders markdown with fast+interactive updates

props:
  - name: markdown
    kind: required
    description: Markdown string to render

tags:
  - tag: html
    type: data
    dataType: html-string
    phase: fast+interactive
```

### Markdown Processing

#### Parser setup

```typescript
import { marked } from 'marked';
import yaml from 'js-yaml';

interface ParsedMarkdown {
  frontmatter: Record<string, any>;
  html: string;
}

function extractFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  return {
    frontmatter: yaml.load(match[1]) as Record<string, any>,
    body: match[2],
  };
}

function parseMarkdown(content: string, options?: { renderMermaid?: boolean }): ParsedMarkdown {
  const { frontmatter, body } = extractFrontmatter(content);
  const html = marked.parse(body); // with extensions registered
  return { frontmatter, html };
}
```

#### Code highlighting extension

Tokenize code blocks into CSS-class-tagged spans. Support common languages: JavaScript/TypeScript, HTML, CSS, YAML, JSON, Bash, Python.

```typescript
const codeRenderer: marked.RendererExtension = {
  name: 'code',
  renderer(token) {
    const lang = token.lang || '';
    const highlighted = highlightCode(token.text, lang);
    return `<pre class="md-code"><code class="language-${lang}">${highlighted}</code></pre>`;
  },
};
```

The `highlightCode` function uses regex-based tokenization per language:

- Keywords → `<span class="token keyword">`
- Strings → `<span class="token string">`
- Comments → `<span class="token comment">`
- Numbers → `<span class="token number">`
- Punctuation → `<span class="token punctuation">`

#### Markdown Theme CSS

Ship complete markdown theme CSS files — not just code highlighting, but the full rendered output: headings, paragraphs, blockquotes, lists, tables, code blocks, mermaid containers. This gives agents a working starting point to choose from or customize.

**Shipped themes:**

```
lib/themes/
  markdown-default.css     # Clean, neutral — works on light backgrounds
  markdown-docs.css        # Documentation-style (wider code blocks, tighter spacing)
  markdown-blog.css        # Blog-style (larger body text, generous spacing)
```

Each theme uses CSS custom properties for easy overrides:

```css
.md {
  --md-font-body: inherit;
  --md-font-code: 'Fira Code', monospace;
  --md-color-heading: inherit;
  --md-color-link: #2563eb;
  --md-color-code-bg: #f1f5f9;
  --md-color-blockquote-border: #e2e8f0;
  --md-spacing-block: 1.5rem;
}

.md h1 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--md-color-heading);
}
.md h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--md-color-heading);
}
.md p {
  line-height: 1.7;
  margin-bottom: var(--md-spacing-block);
}
.md blockquote {
  border-left: 3px solid var(--md-color-blockquote-border);
  padding-left: 1rem;
}
.md pre.md-code {
  background: var(--md-color-code-bg);
  border-radius: 0.5rem;
  padding: 1rem;
  overflow-x: auto;
}
.md .md-mermaid {
  text-align: center;
  margin: var(--md-spacing-block) 0;
}
/* ... */
```

Code highlighting tokens in each theme:

```css
.md .token.keyword {
  color: #8b5cf6;
}
.md .token.string {
  color: #059669;
}
.md .token.comment {
  color: #94a3b8;
  font-style: italic;
}
.md .token.number {
  color: #d97706;
}
.md .token.punctuation {
  color: #64748b;
}
```

**Consuming themes:** The jay-html compiler resolves `<link>` CSS paths relative to the page directory — it does not resolve npm package paths. Instead, the page's linked CSS file uses `@import` (which Vite resolves from `node_modules`):

```css
/* src/styles/markdown-theme.css */
@import '@jay-framework/markdown/themes/markdown-blog.css';

/* Override custom properties to match project DESIGN.md */
.md {
  --md-color-link: var(--accent);
  --md-color-heading: var(--text-primary);
}
```

```html
<!-- page.jay-html -->
<link rel="stylesheet" href="../styles/markdown-theme.css" />
```

This uses Vite's built-in `@import` resolution for npm packages. No framework changes needed.

#### Mermaid extension

Detect ` ```mermaid ` fences and render to SVG at build time.

```typescript
import mermaid from 'mermaid';

const mermaidRenderer: marked.RendererExtension = {
  name: 'code',
  renderer(token) {
    if (token.lang !== 'mermaid') return false; // fall through to default
    const svg = renderMermaidSync(token.text); // build-time only
    return `<div class="md-mermaid">${svg}</div>`;
  },
};
```

Mermaid initialization runs once at build time. The `mermaid` package renders to SVG string using its `renderToSVG` API (or the CLI wrapper). This is a server-only dependency — not shipped to the client.

### Frontmatter and SEO

The `markdown-pages` component automatically maps frontmatter fields to `<head>` tags via the existing `headTags` mechanism (DL#127). The component returns `headTags` in its `phaseOutput`:

**Recognized frontmatter fields:**

| Frontmatter field | Maps to                                                          | Example                          |
| ----------------- | ---------------------------------------------------------------- | -------------------------------- |
| `title`           | `<title>` + `<meta property="og:title">`                         | `<title>Getting Started</title>` |
| `description`     | `<meta name="description">` + `<meta property="og:description">` | SEO description                  |
| `canonical`       | `<link rel="canonical">`                                         | Canonical URL                    |
| `image`           | `<meta property="og:image">`                                     | Open Graph image                 |
| `author`          | `<meta name="author">`                                           | Author name                      |
| `date`            | `<meta property="article:published_time">`                       | ISO 8601 date                    |

**Unrecognized fields** become `<meta name="fieldName" content="value">` automatically. This lets markdown authors add arbitrary metadata without framework changes:

```yaml
---
title: My Post
category: tutorials
reading-time: 5 min
---
```

Produces:

```html
<title>My Post</title>
<meta property="og:title" content="My Post" />
<meta name="category" content="tutorials" />
<meta name="reading-time" content="5 min" />
```

Array values like `tags: [tutorial, beginner]` are skipped for `<meta>` — they're available via the `frontmatter` JSON string in ViewState for template rendering.

**Implementation in the component:**

```typescript
const KNOWN_FIELDS = new Set([
  'title',
  'description',
  'canonical',
  'image',
  'author',
  'date',
  'tags',
]);

function frontmatterToHeadTags(fm: Record<string, any>): HeadTag[] {
  const tags: HeadTag[] = [];
  if (fm.title) {
    tags.push({ tag: 'title', children: fm.title });
    tags.push({ tag: 'meta', attrs: { property: 'og:title', content: fm.title } });
  }
  if (fm.description) {
    tags.push({ tag: 'meta', attrs: { name: 'description', content: fm.description } });
    tags.push({ tag: 'meta', attrs: { property: 'og:description', content: fm.description } });
  }
  if (fm.canonical) {
    tags.push({ tag: 'link', attrs: { rel: 'canonical', href: fm.canonical } });
  }
  if (fm.image) {
    tags.push({ tag: 'meta', attrs: { property: 'og:image', content: fm.image } });
  }
  if (fm.author) {
    tags.push({ tag: 'meta', attrs: { name: 'author', content: fm.author } });
  }
  if (fm.date) {
    tags.push({
      tag: 'meta',
      attrs: { property: 'article:published_time', content: new Date(fm.date).toISOString() },
    });
  }
  for (const [key, value] of Object.entries(fm)) {
    if (KNOWN_FIELDS.has(key)) continue;
    if (typeof value === 'string' || typeof value === 'number') {
      tags.push({ tag: 'meta', attrs: { name: key, content: String(value) } });
    }
  }
  return tags;
}
```

**Merge behavior:** The page's `page.jay-html` can define static `<title>` and `<meta>` in `<head>`. Component-injected head tags merge with (and override) the static ones — component tags win for same-name meta tags.

### Plugin Structure

```
packages/plugins/markdown/
  plugin.yaml
  package.json
  vite.config.ts
  tsconfig.json
  lib/
    index.ts                       # Server exports
    index.client.ts                # Client exports (markdown-live)
    parse-markdown.ts              # marked setup, frontmatter, extensions
    code-highlighter.ts            # CSS-class tokenizer per language
    mermaid-renderer.ts            # Mermaid → SVG at build time
    head-tags.ts                   # Frontmatter → headTags SEO mapping
    themes/
      markdown-default.css         # Clean, neutral
      markdown-docs.css            # Documentation-style
      markdown-blog.css            # Blog-style
    components/
      markdown-pages.ts            # Directory → pages
      markdown-content.ts          # Static renderer
      markdown-live.ts             # Dynamic renderer
  agent-kit/
    designer/
      markdown-usage.md            # Guide for using markdown components
  test/
    parse-markdown.test.ts
    code-highlighter.test.ts
    head-tags.test.ts
    fixtures/
      sample-post.md
      code-post.md
      mermaid-post.md
  dist/
```

### plugin.yaml

```yaml
name: markdown
description: Markdown rendering — pages from directories, inline content, code highlighting, mermaid diagrams

contracts:
  - name: markdown-pages
    contract: markdown-pages.jay-contract
    component: markdownPages
    description: Renders a directory of markdown files as routable pages

  - name: markdown-content
    contract: markdown-content.jay-contract
    component: markdownContent
    description: Renders a markdown string to HTML at build time (slow phase)

  - name: markdown-live
    contract: markdown-live.jay-contract
    component: markdownLive
    description: Renders markdown with fast+interactive updates
```

## Implementation Plan

### Phase 1: Framework — Props on keyed headless components

1. Update `parseHeadlessImports` to read `props` attribute (JSON string)
2. Pass parsed props through to component `withSlowlyRender` / `withFastRender`
3. Update `checkComponentPropsAndParams` to validate keyed headless props
4. Tests

### Phase 2: Core markdown parsing

1. `parse-markdown.ts` — marked setup, frontmatter extraction
2. `code-highlighter.ts` — CSS-class tokenizer for JS/TS/HTML/CSS/YAML/JSON/Bash/Python
3. `markdown-code.css` — default theme with CSS custom properties
4. Tests with fixture markdown files

### Phase 3: Mermaid rendering

1. `mermaid-renderer.ts` — build-time SVG rendering
2. Marked extension for mermaid fences
3. Tests with mermaid fixtures

### Phase 4: Components

1. `markdown-pages` — directory scanning, loadParams, slow render
2. `markdown-content` — static single-value renderer
3. `markdown-live` — dynamic renderer with client-side re-parse
4. Contracts, plugin.yaml, package.json, build config

### Phase 5: Agent kit and docs

1. `agent-kit/designer/markdown-usage.md`
2. Integration test with example project

## Trade-offs

| Decision                     | Pro                               | Con                                                                        |
| ---------------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| `marked` over `remark`       | Fast, lightweight, simple API     | Less extensible AST, fewer plugins                                         |
| CSS-only code highlighting   | No client JS, theme-able, fast    | Less accurate than Shiki/Prism, limited language support                   |
| Build-time mermaid SVG       | No client JS, no layout shift     | Requires mermaid as build dep (~50MB), can't update diagrams interactively |
| Props on headless script tag | Per-page config, familiar pattern | Framework change needed                                                    |

## Verification Criteria

1. `markdown-pages` scans a directory and generates correct slugs via `loadParams`
2. Frontmatter extracted correctly (title, date, description, tags, custom fields)
3. Code blocks highlighted with CSS classes for all supported languages
4. Mermaid fences render to inline SVG
5. `markdown-content` renders markdown at slow phase
6. `markdown-live` renders at fast phase and re-renders on client when value changes
7. Plugin validates with `jay-stack validate-plugin`
8. Example page in a test project renders correctly

---

## Implementation Results

### What was built

Plugin at `packages/plugins/markdown/` with 29 tests, dual build (server + client), validates clean.

**Core library:**

- `parse-markdown.ts` — `Marked` parser with configurable mermaid renderer via `createMarkedParser(mermaidRenderer?)`. Without mermaid renderer, fences output `<pre class="md-mermaid-source">` fallback.
- `code-highlighter.ts` — regex-based CSS-class tokenizer for 8 languages
- `head-tags.ts` — frontmatter → HeadTag mapping with unknown-field pass-through
- `mermaid-renderer.ts` — shells out to `mmdc` (via `@mermaid-js/mermaid-cli` + Puppeteer) for build-time SVG

**Three components:**

- `markdownPages` — keyed headless, reads `.md` files by slug from `contentDir` (via DL#156 headless props), uses `loadParams` to enumerate slugs, renders with mermaid SVG
- `markdownContent` — instance-based, static slow-phase renderer with mermaid SVG
- `markdownLive` — instance-based, fast+interactive renderer WITHOUT mermaid (client-side only)

**Three CSS themes:** default, docs, blog

**Agent kit:** `markdown-usage.md`

**Smoke tests:** Two test pages in `examples/jay-stack/smoke-test/`:

- `/markdown/[slug]/` — `markdown-pages` component rendering `.md` files with mermaid diagrams
- `/markdown-live/` — `markdown-live` component rendering markdown at request time

### Framework changes (DL#156)

- `LoadParams` type accepts optional `props` parameter
- `runLoadParams` passes `part.headlessProps` so `loadParams` can access component configuration (e.g., `contentDir`)
- Both dev server and production build pipeline pass headless props through

### Key architectural decision: Server vs client mermaid rendering

Mermaid requires a DOM to render SVGs. We evaluated four approaches:

1. **`@mermaid-js/mermaid-cli` (chosen for server)** — shells out to `mmdc` which uses Puppeteer/Chromium. Produces real SVGs at build time. Heavy dev dependency (~150MB with Chromium) but correct output.
2. **Mermaid + JSDOM** — lighter but rendering quirks with mermaid's DOM usage.
3. **Client-side rendering** — no build dependency but ~500KB client bundle and layout shift.
4. **Placeholder only** — no rendering, just styled source blocks.

**Result: split architecture.** Server components (`markdown-pages`, `markdown-content`) use mmdc for real SVG output. Client component (`markdown-live`) outputs `<pre class="md-mermaid-source">` placeholder — client-side mermaid.js can be added by the project if needed.

The `createMarkedParser(mermaidRenderer?)` factory enables this split: server code passes `renderMermaidBlock`, client code passes nothing. No conditional imports, no Node.js APIs in the client bundle.

### Production build fix: headless props vs route params

**Problem:** The production build skipped `markdown/[slug]` entirely — `loadParams` yielded `[{slug: "hello"}]` correctly, but the route materialization step filtered it out.

**Root cause:** The route scanner's `parseHeadlessProps` (DL#156) merged ALL headless YAML body values into `route.inferredParams`. For the markdown route, this included `{contentDir: "src/pages/markdown/content"}`. The `materializeRouteParams` function then compared `loadParams` output (`{slug: "hello"}`) against `inferredParams` (`{contentDir: "..."}`) via `paramsMatchInferred` — which failed because `contentDir` isn't a route param, causing all param combinations to be skipped.

**Fix in `route-scanner.ts`:** Filter headless props based on route type:

- **Dynamic routes** (with `[slug]` etc.): only include props whose keys match dynamic segment names. Component props like `contentDir` are excluded — they're configuration, not route params.
- **Static routes** (no dynamic segments): include all props as `inferredParams`. This preserves the static override pattern where `slug: ceramic-flower-vase` tells the build which product a static page represents.

**Debugging note:** Required rebuilding `route-scanner` and `production-server` dist — the stack-cli imports from pre-built dist, not source. Source changes without rebuild are invisible to the build pipeline.

### Deviations from design

- **Mermaid rendering is split** between server (Puppeteer SVG) and client (source fallback), rather than a single build-time-only approach. The design assumed build-time-only, but the `markdown-live` client component can't use Puppeteer.
- **`loadParams` required a framework change** — `LoadParams` type updated to accept optional props parameter. Not anticipated in the original DL#155 design (was expected to be covered by DL#156 alone, but `loadParams` is a separate code path from render).
- **`@mermaid-js/mermaid-cli` requires Puppeteer** as a peer dependency, which downloads Chromium (~150MB). This is heavier than the "~50MB" estimate in the trade-offs table. Acceptable for build-time tooling but worth noting.
- **`markdown-pages` contract `tags` sub-contract** needed `trackBy: name` — the original contract design omitted this, caught by the validate command.
- **Route scanner needed to distinguish component props from route params** — headless YAML body values serve two purposes (component configuration and route param declaration). The scanner now filters by route type to avoid production build failures.
