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
    <script type="application/jay-headless"
      plugin="@jay-framework/markdown"
      contract="markdown-pages"
      key="post"
      props='{ "contentDir": "./content" }'>
    </script>
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
~~~markdown
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
~~~

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
<script type="application/jay-headless"
  plugin="@jay-framework/markdown"
  contract="markdown-pages"
  key="post"
  props='{ "contentDir": "./content" }'>
</script>
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

Ship `markdown-code.css` with default theme using CSS custom properties for easy theming.

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

| Decision | Pro | Con |
|----------|-----|-----|
| `marked` over `remark` | Fast, lightweight, simple API | Less extensible AST, fewer plugins |
| CSS-only code highlighting | No client JS, theme-able, fast | Less accurate than Shiki/Prism, limited language support |
| Build-time mermaid SVG | No client JS, no layout shift | Requires mermaid as build dep (~50MB), can't update diagrams interactively |
| Props on headless script tag | Per-page config, familiar pattern | Framework change needed |

## Verification Criteria

1. `markdown-pages` scans a directory and generates correct slugs via `loadParams`
2. Frontmatter extracted correctly (title, date, description, tags, custom fields)
3. Code blocks highlighted with CSS classes for all supported languages
4. Mermaid fences render to inline SVG
5. `markdown-content` renders markdown at slow phase
6. `markdown-live` renders at fast phase and re-renders on client when value changes
7. Plugin validates with `jay-stack validate-plugin`
8. Example page in a test project renders correctly
