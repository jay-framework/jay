# DL#149 — Script Tags in Jay-HTML

## Background

Jay-HTML pages use `<script type="application/jay-*">` tags in `<head>` for framework declarations (headless imports, headfull imports, data contracts). The SSR output is built from scratch — it constructs a new `<html>` document containing only the rendered body and a hydration script. Any non-jay script tags in the original jay-html are silently dropped.

An AI agent was observed writing inline `<script>` tags for animation logic instead of using `page.ts`. The silent drop meant no error feedback — the script simply didn't work, and the agent didn't know why.

Separately, there are legitimate use cases for script tags: marketing/analytics snippets (Google Analytics, GTM, Meta Pixel), third-party widget embeds, and consent management scripts. These are often provided as inline snippets (GTM gives an inline `<script>` that bootstraps the external tag manager with site-specific parameters) or external `<script src="...">` includes.

## Problem

1. **No validation feedback** — arbitrary `<script>` tags are silently dropped, confusing both agents and developers
2. **No mechanism for third-party scripts** — legitimate external and inline marketing scripts have no supported path into the rendered HTML
3. **Agent misdirection** — without guardrails, agents write inline JS instead of using the component API

## Questions and Answers

**Q1: Should we ever allow inline JS in jay-html?**
Not by default. Inline JS bypasses the component model, can't participate in rendering phases, and breaks SSR. All page behavior should go through `page.ts` / `makeJayStackComponent`. However, some third-party tools (e.g., Google Tag Manager) provide inline snippets that bootstrap their external script with site-specific parameters. These need to be supported via an explicit opt-in (`jay-script`).

**Q2: Should we allow local script imports (`<script src="./local.js">`)?**
No, not even with `jay-script`. Local scripts should be part of `page.ts`. Only inline snippets and external URLs are supported.

**Q3: Where can third-party scripts be placed?**
In `<head>` or in `<body>` (top or bottom). Placement matters for performance:
- `<head>` with `async` or `defer` — loads without blocking rendering
- End of `<body>` — loads after page content
- `<head>` without `async`/`defer` — blocks rendering (discouraged)

The agent-kit guide should advise on placement and loading strategies.

**Q4: What about `<script>` tags with attributes like `async`, `defer`, `type="module"`?**
These should be preserved on included scripts. They're meaningful for loading behavior.

**Q5: Could `jay-script` carry values for future extensibility?**
Yes. Using `jay-script="allow"` (instead of a boolean `jay-allow`) leaves room for future modes like `jay-script="sandbox"` (run in isolated context) without introducing new attributes.

## Design

### The `jay-script` attribute

A value-carrying attribute that marks a script for inclusion. Currently supports one value:

- `jay-script="allow"` — include this script as-is in the rendered output

Future values (not implemented now):
- `jay-script="sandbox"` — run in an isolated context
- `jay-script="defer"` — framework-managed deferred loading

### Validation rules

When the jay-html parser encounters a `<script>` tag that is not a `type="application/jay-*"` declaration:

| Script type                                | Without `jay-script` | With `jay-script="allow"`   |
|--------------------------------------------|----------------------|-----------------------------|
| **Inline** (has body)                      | **error**            | Allowed, included in output |
| **Local src** (`./`, `../`, relative path) | **error**            | **error** (never allowed)   |
| **External src** (`https://...`)           | **warning**          | Allowed, included in output |

Error message (inline/local without `jay-script`):
> "Inline scripts are not supported in jay-html. Use page.ts with makeJayStackComponent for page behavior. If this is a third-party script that must be included as-is, add jay-script="allow"."

Warning message (external without `jay-script`):
> "External scripts should be explicitly marked. If this script is required (e.g., analytics or tag manager), add jay-script="allow". Prefer page.ts for page behavior."

Error message (local src with `jay-script`):
> "Local script imports are not supported. Move the script logic into page.ts with makeJayStackComponent."

### Script passthrough

Scripts marked with `jay-script="allow"` are collected during parsing and included in the SSR output. They can appear in `<head>` or `<body>` — their position is preserved. The `jay-script` attribute itself is stripped from the output.

```html
<head>
  <!-- External script: loads GTM library -->
  <script src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX" async jay-script="allow"></script>
  <!-- Inline script: GTM bootstrap with site parameters -->
  <script jay-script="allow">
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XXXXX');
  </script>
  <!-- Framework declaration: no jay-script needed -->
  <script type="application/jay-headless" plugin="wix-stores" contract="product-page" key="product"></script>
</head>
```

```html
<!-- End-of-body placement for non-critical scripts -->
<body>
  <main>...</main>
  <script src="https://cdn.example.com/chat-widget.js" defer jay-script="allow"></script>
</body>
```

### Agent-kit guidance

Create a new shared agent-kit guide `contracts/script-tags.md` (referenced from designer instructions) covering:

- **Default rule**: use `page.ts` with `makeJayStackComponent` for all page behavior
- **When scripts are needed**: third-party analytics, tag managers, consent tools, chat widgets
- **How to include**: add `jay-script="allow"` to the script tag
- **Local scripts**: not supported — move logic into `page.ts`
- **Performance considerations**:
  - Place non-critical scripts at end of `<body>` or use `defer`/`async`
  - Avoid `<head>` scripts without `async`/`defer` — they block page rendering
  - Consider whether the script is needed on every page or just specific routes
- **`jay-script` means "I know what I'm doing"** — the agent should only add it when the script is genuinely required and cannot be handled through the component model

## Implementation Plan

### Phase 1: Validation
- Add validation in jay-html parser for non-jay script tags
- Inline scripts without `jay-script="allow"` → error
- Local src scripts → always error (even with `jay-script`)
- External src scripts without `jay-script="allow"` → warning
- Scripts with `jay-script="allow"` (non-local) → no error/warning

### Phase 2: Script passthrough
- Collect `jay-script="allow"` scripts during parsing (both head and body)
- Preserve placement (head vs body position)
- Strip `jay-script` attribute from output
- Serialize into SSR output, preserving all other attributes

### Phase 3: Agent-kit docs
- Create `contracts/script-tags.md` with full guidance
- Update designer `INSTRUCTIONS.md` to reference it
- Add to the reference docs table

## Trade-offs

- **Strictness vs flexibility**: errors for unmarked scripts prevent footguns. `jay-script="allow"` is an explicit opt-in that forces a conscious decision.
- **Warnings for external scripts**: not an error because external scripts are a legitimate use case, but the warning ensures they're explicitly acknowledged.
- **No local scripts**: opinionated — all local JS goes through the component model. Simplifies the mental model.
- **Extensible attribute**: `jay-script="allow"` is slightly more verbose than a boolean `jay-allow`, but leaves room for future modes without attribute proliferation.
- **Frozen pages**: allowed scripts should also appear in frozen/static page output (DL#127).

## Verification

- Validation: inline `<script>` without `jay-script` → error mentioning page.ts and jay-script
- Validation: `<script src="./local.js">` → always error, even with `jay-script`
- Validation: `<script src="https://cdn.example.com/lib.js">` without `jay-script` → warning
- Validation: inline and external with `jay-script="allow"` → no error/warning
- SSR: `jay-script="allow"` scripts appear in rendered output without the `jay-script` attribute
- SSR: head scripts appear in `<head>`, body scripts appear in `<body>` at correct position
- Frozen pages: allowed scripts appear in static output
- Agent-kit: `script-tags.md` guide exists and is referenced from designer instructions
