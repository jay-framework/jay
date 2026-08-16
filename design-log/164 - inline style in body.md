# DL#164 — Inline Style Blocks in Body

## Background

Jay's template parser scans `<body>` content for `{...}` expressions (template bindings like `{post.title}`). This works because HTML content doesn't normally contain curly braces.

CSS uses curly braces for rule blocks (`{ transform: translateY(0); }`). When a `<style>` tag appears in `<body>`, the parser treats CSS curly braces as template expressions and fails.

### How this happens

The AIditor (design tool) generates inline `<style>` tags in the body for component-scoped animations:

```html
<body>
  <div class="hero">
    <style>
      @keyframes fall {
        0% {
          transform: translateY(-6px);
          opacity: 0.4;
        }
        100% {
          transform: translateY(0);
          opacity: 1;
        }
      }
      .hero-particle {
        animation: fall 2s ease-in-out infinite;
      }
    </style>
    <div class="hero-particle">...</div>
  </div>
</body>
```

The parser sees `{ transform: translateY(-6px); opacity: 0.4; }` and tries to parse it as a template binding expression.

### Current behavior

The `<head>` already handles `<style>` correctly — the parser extracts CSS from head styles and processes them separately. But `<body>` styles are scanned for template bindings like any other text content.

### Error

```
Failed to parse expression [
  @keyframes fall {
    0%   { transform: translateY(-6px); opacity: 0.4; ].
Parse error: Expected "." or identifier but "\n" found.
```

### Related Design Logs

- DL#162 — Structural headfull components (template injection)
- DL#146 — CSS performance fixes

## Problem

1. **Parser crash** — inline `<style>` in body causes a hard failure, not a graceful fallback
2. **No support for body styles** — even if the parser didn't crash, body `<style>` content would be treated as text nodes and mangled
3. **Design tool output** — the AIditor legitimately generates `<style>` in body for scoped animations. The framework should handle this.

## Design

### Two kinds of body styles

Body `<style>` tags serve two distinct purposes:

1. **Global styles in the wrong place** — animations, utility classes that belong in `<head>`. These should be hoisted automatically.
2. **Scoped styles** — CSS that is intentionally co-located with the HTML it styles. This is a legitimate pattern, especially for headfull components and design tool output where styles and markup belong together.

### Priority 1: Don't crash

The parser must skip `<style>` tags in `<body>` during template expression scanning. CSS content should never be parsed as template bindings. This is a bug regardless of any design decision.

### Priority 2: Support inline scoped styles

Inline `<style>` in `<body>` is emitted as-is in the rendered output. The CSS is not hoisted, not extracted, not deduplicated — it stays exactly where the designer placed it.

```html
<body>
  <section class="hero">
    <style>
      @keyframes fall {
        0% {
          transform: translateY(-6px);
          opacity: 0.4;
        }
        100% {
          transform: translateY(0);
          opacity: 1;
        }
      }
      .hero-particle {
        animation: fall 2s ease-in-out infinite;
      }
    </style>
    <div class="hero-particle">...</div>
  </section>
</body>
```

This keeps styles co-located with the component they belong to. The designer controls placement.

#### Why not require `@scope`

`@scope` CSS is the future for scoping, but it adds syntactic overhead and the scoping boundary needs a selector. For simple cases (animations, component-specific rules), plain `<style>` in body is sufficient and matches standard HTML behavior. The browser already supports `<style>` anywhere in the document.

A validation rule can recommend `@scope` when body styles use selectors that could leak (e.g., bare element selectors like `div`, `p`), but it shouldn't be required.

#### How it works in the compiler

All three compiler targets (element, hydrate, server) treat `<style>` in body as an opaque node:

- **Server element**: emit the `<style>` tag and its content as a raw HTML string
- **Element target**: emit as a static element (no reactivity)
- **Hydrate target**: skip adoption — the `<style>` tag is static, no coordinates needed

No CSS extraction, no minification, no Vite processing. The styles are inlined in the HTML output as-is. This is intentional — scoped styles are small, and deduplication/caching is the job of head styles.

### Priority 3: Validation guidance

**Warn** (not error) when body `<style>` uses broad selectors that could leak:

- Bare element selectors: `div { ... }`, `p { ... }` — likely unintentional global styles
- `*` selector — almost certainly wrong in body styles
- No warning for class selectors, ID selectors, `@keyframes`, `@scope` — these are intentional

**Recommend** `@scope` when appropriate:

```
Warning: Body <style> uses bare element selector "div" which affects the entire page.
Consider using @scope or class selectors to limit the scope.
```

### Priority 4: Agent-kit guide

Document in `designer/jay-html-styling.md`:

- **Head `<style>`** — global styles, design tokens, page-level layout. Extracted, minified, cached by the framework.
- **Body `<style>`** — co-located component styles, animations, scoped rules. Emitted inline as-is. Use class selectors or `@scope` to avoid leaking.
- When to use which: head for shared styles, body for component-specific styles that travel with the markup.

## Questions

1. Should body styles participate in CSS extraction at all? Keeping them inline is simpler and matches the co-location intent. But it means they can't be cached separately.

2. Should headfull component `<style>` in their jay-html body also work this way? Currently headfull component styles are extracted from `<head>`. If a headfull component has `<style>` in its body, the same inline treatment should apply after template injection.

3. Should the production build minify inline body styles? Since they pass through as raw HTML, esbuild/Vite won't touch them. Could add a post-processing minification step, but it adds complexity for marginal gain.

## Implementation Plan

### Phase 1: Parser — skip style tags in body (don't crash)

**`compiler-jay-html/lib/jay-target/jay-html-compiler.ts`** (element target), **`jay-html-compiler-server.ts`** (server target), **`jay-html-compiler-hydrate.ts`** (hydrate target):

- When rendering child nodes, check if the node is a `<style>` element
- If so, emit the style content as a raw string (no template binding parsing)
- Handle in the HTML parser config — `node-html-parser` already has `blockTextElements: { script: true, style: true }` for head parsing, verify this also applies to body styles

### Phase 2: Emit body styles as-is

In each compiler target, when encountering a `<style>` element in body:

- **Server element**: `w('<style>'); w(styleContent); w('</style>');`
- **Element target**: `e('style', {}, [t(styleContent)])`
- **Hydrate target**: skip (static content, no adoption needed)

### Phase 3: Validation

**`compiler-jay-html`** validation or **`stack-cli/lib/validate.ts`**:

- Parse the CSS content of body `<style>` tags (lightweight — just scan for selectors)
- Warn on bare element selectors or `*` selectors
- Suggest `@scope` or class selectors

### Phase 4: Agent-kit guide

**`designer/jay-html-styling.md`**:

- Add "Inline Scoped Styles" section explaining head vs body `<style>` usage
- Show examples of co-located animations and component styles
- Document the validation warnings and how to resolve them

## Trade-offs

| Choice                     | Pro                                               | Con                                                |
| -------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| Emit body styles as-is     | Simple, matches HTML spec, design tool compatible | No minification, no caching, potential style leaks |
| Hoist all to head          | CSS extraction + caching for everything           | Breaks co-location intent, implicit behavior       |
| Require @scope             | Prevents leaks by design                          | Syntactic overhead, limits adoption                |
| Reject body styles (error) | Clean contract                                    | Breaks design tool output, overly restrictive      |
