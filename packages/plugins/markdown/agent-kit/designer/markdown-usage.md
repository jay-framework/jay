# Markdown Plugin

The `@jay-framework/markdown` plugin renders markdown content as HTML in jay-html pages. It provides three headless components.

## Components

### markdown-pages — Directory to pages

Scans a directory of `.md` files and provides page data. Each file becomes a routable page.

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

The component provides these ViewState fields (all slow phase):

- `{post.title}` — title from frontmatter
- `{post.content}` — rendered HTML
- `{post.description}` — description from frontmatter
- `{post.date}` — ISO date string
- `{post.tags}` — array with `{name}` field (use with forEach)
- `{post.frontmatter}` — full frontmatter as JSON string

SEO head tags (`<title>`, `<meta description>`, `og:title`, etc.) are injected automatically from frontmatter.

### markdown-content — Static inline renderer

Renders a markdown string at build time. Use for static content embedded in a page.

```html
<jay:markdown-content markdown="{myMarkdownField}">
  <div class="md">{html}</div>
</jay:markdown-content>
```

### markdown-live — Dynamic renderer

Renders markdown that can change at request time or on the client. Ships the parser to the browser.

```html
<jay:markdown-live markdown="{dynamicContent}">
  <div class="md">{html}</div>
</jay:markdown-live>
```

## Markdown File Format

```markdown
---
title: Getting Started
date: 2026-07-15
description: A guide to getting started
author: Jane Doe
tags: [tutorial, beginner]
---

# Getting Started

Your content here with **bold**, _italic_, and [links](https://example.com).
```

### Frontmatter Fields

| Field         | Purpose         | Auto-injected as                       |
| ------------- | --------------- | -------------------------------------- |
| `title`       | Page title      | `<title>`, `og:title`                  |
| `description` | SEO description | `<meta description>`, `og:description` |
| `date`        | Publish date    | `article:published_time`               |
| `author`      | Author name     | `<meta author>`                        |
| `image`       | Cover image     | `og:image`                             |
| `canonical`   | Canonical URL   | `<link canonical>`                     |

Any other field (e.g., `category: guides`) becomes `<meta name="category" content="guides">`.

## Code Highlighting

Code fences are highlighted with CSS classes. Supported languages: JavaScript/TypeScript, HTML, CSS, YAML, JSON, Bash, Python.

````markdown
```typescript
const hello = 'world';
```
````

### Output structure

```html
<pre class="md-code">
  <code class="language-typescript">
    <span class="token keyword">const</span> hello = <span class="token string">'world'</span>;
  </code>
</pre>
```

### CSS classes

| Class              | Element  | Purpose                                            |
| ------------------ | -------- | -------------------------------------------------- |
| `.md-code`         | `<pre>`  | Code block container                               |
| `.language-{lang}` | `<code>` | Language identifier (e.g., `.language-typescript`) |

### Token classes (inside `<code>`)

| Class                | Colors in default theme  | Used for                                                      |
| -------------------- | ------------------------ | ------------------------------------------------------------- |
| `.token.keyword`     | `#8b5cf6` (purple)       | `const`, `function`, `if`, `return`, `import`, `def`, `class` |
| `.token.string`      | `#059669` (green)        | `'hello'`, `"world"`, `` `template` ``                        |
| `.token.comment`     | `#94a3b8` (gray, italic) | `// comment`, `/* block */`, `# comment`                      |
| `.token.number`      | `#d97706` (amber)        | `42`, `3.14`, `16px`                                          |
| `.token.function`    | `#2563eb` (blue)         | `greet(`, `console.log(`                                      |
| `.token.operator`    | `#64748b` (slate)        | `=`, `+`, `=>`, `&&`                                          |
| `.token.punctuation` | `#94a3b8` (gray)         | `{}`, `()`, `;`, `,`                                          |
| `.token.tag`         | `#dc2626` (red)          | HTML tags: `<div`, `</span`                                   |
| `.token.attribute`   | `#d97706` (amber)        | HTML attributes: `class=`, `href=`                            |

## Mermaid Diagrams

Mermaid fences are rendered to SVG on the server (via `beautiful-mermaid`). On the client (markdown-live), they output as source text for optional client-side rendering.

````markdown
```mermaid
graph LR
  A[Start] --> B[End]
```
````

### Output structure

**Server (markdown-pages, markdown-content):**

```html
<div class="md-mermaid">
  <svg>...</svg>
</div>
```

**Client fallback (markdown-live):**

```html
<div class="md-mermaid">
  <pre class="md-mermaid-source">
graph LR
  A[Start] --> B[End]</pre
  >
</div>
```

### CSS classes

| Class                | Element | Purpose                                           |
| -------------------- | ------- | ------------------------------------------------- |
| `.md-mermaid`        | `<div>` | Mermaid diagram container (centered, with margin) |
| `.md-mermaid svg`    | `<svg>` | The rendered SVG diagram (max-width: 100%)        |
| `.md-mermaid-source` | `<pre>` | Raw mermaid source (client fallback only)         |
| `.md-mermaid-error`  | `<pre>` | Error message when rendering fails                |

## Theme CSS

Import a theme in your project CSS:

```css
@import '@jay-framework/markdown/themes/markdown-blog.css';
```

Available themes:

- `markdown-default.css` — clean, neutral
- `markdown-docs.css` — documentation style (narrower, tighter)
- `markdown-blog.css` — blog style (wider body text, generous spacing)

Override via CSS custom properties:

```css
.md {
  --md-color-link: var(--accent);
  --md-color-heading: var(--text-primary);
  --md-color-code-bg: var(--bg-secondary);
}
```
