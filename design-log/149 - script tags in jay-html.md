# DL#149 — Script Tags in Jay-HTML

## Background

Jay-HTML pages use `<script type="application/jay-*">` tags in `<head>` for framework declarations (headless imports, headfull imports, data contracts). The SSR output is built from scratch — it constructs a new `<html>` document containing only the rendered body and a hydration script. Any non-jay script tags in the original jay-html are silently dropped.

An AI agent was observed writing inline `<script>` tags for animation logic instead of using `page.ts`. The silent drop meant no error feedback — the script simply didn't work, and the agent didn't know why.

Separately, there are legitimate use cases for script tags: marketing/analytics snippets (Google Analytics, GTM, Meta Pixel), third-party widget embeds, and consent management scripts. These are provided as `<script>` tags and cannot reasonably be rewritten as `page.ts` components.

## Problem

1. **No validation feedback** — arbitrary `<script>` tags are silently dropped, confusing both agents and developers
2. **No mechanism for third-party scripts** — legitimate external scripts have no supported path into the rendered HTML
3. **Agent misdirection** — without guardrails, agents write inline JS instead of using the component API

## Questions and Answers

**Q1: Should we ever allow inline JS in jay-html?**
No. Inline JS bypasses the component model, can't participate in rendering phases, and breaks SSR. All behavior should go through `page.ts` / `makeJayStackComponent`.

**Q2: Should we allow external script includes (e.g., `<script src="https://...">`)?**
Yes, for third-party scripts like analytics, tag managers, and marketing pixels. These are fundamentally different from inline behavior — they're fire-and-forget includes that don't interact with the component model.

**Q3: Where should third-party scripts be declared?**
In `<head>`, alongside other head declarations. They should be carried through to the SSR output's `<head>`.

**Q4: Should third-party scripts be restricted to external URLs only?**
Yes. `<script src="https://...">` should be allowed. `<script>inline code</script>` should be rejected with a validation error pointing to `page.ts`.

**Q5: What about `<script>` tags with attributes like `async`, `defer`, `type="module"`?**
These should be preserved on external script includes. They're meaningful for third-party loading behavior.

## Design

### Validation severity levels

When the jay-html parser encounters a `<script>` tag that is not a `type="application/jay-*"` declaration:

- **Inline JS (has body)**: **error** — "Inline scripts are not supported in jay-html. Use page.ts with makeJayStackComponent for page behavior. If this script is required, add the jay-allow attribute to suppress this error."
- **Local src (`<script src="./...">`)**: **error** — "Local script imports are not supported in jay-html. Use page.ts with makeJayStackComponent for page behavior. If this script is required, add the jay-allow attribute to suppress this error."
- **External src (`<script src="https://...">`)**: **warning** — "External scripts are discouraged in jay-html. Prefer page.ts with makeJayStackComponent for page behavior. If this script is required (e.g., analytics or tag manager), add the jay-allow attribute to suppress this warning."

### The `jay-allow` attribute

Adding `jay-allow` to a script tag acknowledges the developer's intent and suppresses the error/warning:

```html
<!-- Warning suppressed: developer explicitly allows this external script -->
<script src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX" async jay-allow></script>

<!-- Error suppressed: developer explicitly allows this inline script -->
<script jay-allow>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXX');
</script>
```

The `jay-allow` attribute is stripped from the output — it's a compile-time directive only.

### External script passthrough

Script tags with `jay-allow` (or external scripts that the developer chooses to keep despite the warning) are collected during parsing and passed through to the SSR output `<head>`, similar to how `<link>` and `<meta>` tags work via the head tags system.

```html
<head>
  <!-- Allowed with jay-allow: third-party analytics -->
  <script src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX" async jay-allow></script>
  <!-- Framework declaration: no jay-allow needed -->
  <script type="application/jay-headless" plugin="wix-stores" contract="product-page" key="product"></script>
</head>
```

```html
<!-- Error: no jay-allow -->
<head>
  <script>
    document.addEventListener('scroll', () => { /* ... */ });
  </script>
</head>
<!-- Error: Inline scripts are not supported in jay-html. Use page.ts with makeJayStackComponent for page behavior. If this script is required, add the jay-allow attribute to suppress this error. -->
```

### Implementation approach

The head tags system (DL#127, DL#148) already handles `<title>`, `<meta>`, and `<link>` tags from jay-html `<head>`. Script tags can use the same mechanism:

1. **Parser**: during head parsing, collect non-jay `<script>` tags. Check for `jay-allow`. Without it: emit error (inline/local) or warning (external). With `jay-allow`: pass silently. Collect allowed scripts into a `headScripts` array.
2. **SSR output**: serialize `headScripts` into the generated `<head>`, preserving attributes (`src`, `async`, `defer`, `type`, etc.) but stripping `jay-allow`.
3. **Agent-kit**: update designer instructions to explain the script policy and `jay-allow` escape hatch.

### Agent-kit guidance

Update `designer/INSTRUCTIONS.md` and `designer/jay-html-syntax.md`:
- "Do not use `<script>` tags for page behavior — use `page.ts` with `makeJayStackComponent`"
- "Third-party scripts (analytics, tag managers) can be included with `jay-allow`: `<script src="https://..." jay-allow></script>`"

## Implementation Plan

### Phase 1: Validation (immediate)
- Add validation in jay-html parser for non-jay script tags
- Inline scripts without `jay-allow` → error
- Local src scripts without `jay-allow` → error
- External src scripts without `jay-allow` → warning
- All scripts with `jay-allow` → no error/warning

### Phase 2: Script passthrough
- Collect `jay-allow` script tags during head parsing
- Strip `jay-allow` attribute from output
- Add to head tags output alongside existing meta/link tags
- Serialize into SSR `<head>` output

### Phase 3: Agent-kit docs
- Update designer instructions with script policy and `jay-allow` escape hatch

## Trade-offs

- **Strictness vs flexibility**: errors for inline/local JS prevent footguns. `jay-allow` is the explicit escape hatch — it forces a conscious decision.
- **Warnings for external scripts**: not an error because external scripts are a legitimate use case, but the warning nudges toward page.ts when possible and ensures `jay-allow` is added for intentional includes.
- **Security**: `jay-allow` on inline scripts means trusting arbitrary JS. This is the developer's explicit choice.
- **Frozen pages**: allowed scripts should also appear in frozen/static page output (DL#127).

## Verification

- Validation: inline `<script>` without `jay-allow` → error with message mentioning page.ts and jay-allow
- Validation: `<script src="./local.js">` without `jay-allow` → error with message mentioning page.ts and jay-allow
- Validation: `<script src="https://cdn.example.com/lib.js" async>` without `jay-allow` → warning with message mentioning page.ts and jay-allow
- Validation: all three above with `jay-allow` → no error/warning
- SSR: `jay-allow` script tag appears in rendered `<head>` without the `jay-allow` attribute
- Frozen pages: `jay-allow` script tag appears in static output
- Agent-kit: designer instructions mention the constraint and escape hatch
