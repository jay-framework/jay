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

### Three concerns

1. **Body `<style>` crashes the parser** — CSS curly braces are parsed as template bindings
2. **Body `<style>` for inline co-located styles** — design tool output, animations
3. **Headfull component CSS scoping** — component styles from `<head>` leak into the global scope

### Priority 1: Don't crash

The parser must skip `<style>` tags in `<body>` during template expression scanning. CSS content should never be parsed as template bindings. This is a bug regardless of any design decision.

### Priority 2: Support inline body styles

Inline `<style>` in `<body>` is emitted as-is in the rendered output. The CSS is not hoisted, not extracted, not deduplicated — it stays exactly where the designer placed it.

```html
<body>
  <section class="hero">
    <style>
      @keyframes fall {
        0% { transform: translateY(-6px); opacity: 0.4; }
        100% { transform: translateY(0); opacity: 1; }
      }
      .hero-particle { animation: fall 2s ease-in-out infinite; }
    </style>
    <div class="hero-particle">...</div>
  </section>
</body>
```

All three compiler targets treat `<style>` in body as an opaque node:

- **Server element**: emit as raw HTML string
- **Element target**: emit as static element (no reactivity)
- **Hydrate target**: skip (static content, no coordinates needed)

### Priority 3: Headfull component CSS scoping with `@scope`

Headfull component styles (extracted from the component's `<head>`) currently merge into the page's global CSS unscoped. This causes class name collisions — a SiteHeader's `.nav-link` leaks into the page.

**Auto-scope with `@scope`:** when extracting headfull component CSS during template injection, wrap it in `@scope` targeting the component's root element:

```css
/* Before (current — global, leaks) */
.header-brand { font-size: 32px; }
.nav-link { color: var(--text-muted); }

/* After (auto-scoped by the compiler) */
@scope ([jay-component="site-header"]) {
  .header-brand { font-size: 32px; }
  .nav-link { color: var(--text-muted); }
}
```

The compiler adds a `jay-component="site-header"` attribute to the component's root element in the injected template. The scoped CSS is merged into the page's extracted CSS — it goes through the same extraction, minification, and caching pipeline as all head styles.

#### Why `@scope`

- Proper CSS encapsulation as the spec intended
- No synthetic class names or compiler-generated selectors
- Lower specificity than class-based scoping
- `@scope` boundary matches the component's DOM root naturally
- `to` boundary available for limiting scope depth if needed
- Well supported: Chrome 118+, Firefox 128+, Safari 17.4+

#### What gets scoped

- **Headfull component `<head>` styles** — auto-wrapped in `@scope` during CSS extraction
- **Body `<style>` tags** — emitted as-is (designer controls scoping manually)
- **Page-level `<head>` styles** — NOT scoped (global by intent)

#### `@keyframes` and `:root`

`@keyframes` defined inside `@scope` are still global (CSS spec). `:root` and `body` selectors inside `@scope` are ignored by the browser — component CSS shouldn't use them.

Since `@keyframes` can't be scoped, two components defining the same animation name (e.g., `@keyframes fade`) would silently collide — one overrides the other. The framework should detect this:

**Validation:** during CSS extraction, collect all `@keyframes` names across the page's own CSS and all headfull component CSS. If duplicates are found, emit a warning:

```
Warning: @keyframes "fade" is defined in both site-header and hero-section.
Animation names are global — rename one to avoid collisions (e.g., "site-header-fade").
```

**`@font-face`** has the same issue — two components declaring `font-family: "Icons"` with different `src` would silently collide:

```
Warning: @font-face "Icons" is defined in both site-header and product-card.
Font family names are global — rename one to avoid collisions.
```

Both are validation-only checks — no auto-prefixing. The designer renames the collision.

### Priority 4: Validation guidance

**Warn** (not error) when body `<style>` uses broad selectors that could leak:

- Bare element selectors: `div { ... }`, `p { ... }` — likely unintentional global styles
- `*` selector — almost certainly wrong in body styles
- No warning for class selectors, ID selectors, `@keyframes`, `@scope` — these are intentional

### Priority 5: Agent-kit guide

Document in `designer/jay-html-styling.md`:

- **Page `<head>` styles** — global styles, design tokens, page-level layout. Extracted, minified, cached.
- **Component `<head>` styles** — auto-scoped by the framework using `@scope`. No manual scoping needed.
- **Body `<style>`** — co-located inline styles for animations, component-specific rules. Emitted as-is.
- When to use which: page head for shared styles, component head for component styles (auto-scoped), body for inline co-located styles.

## Questions

1. ~~Should body styles participate in CSS extraction?~~ No — they stay inline, matching the co-location intent.

2. ~~Should headfull component styles be scoped?~~ Yes — auto-wrapped in `@scope` during extraction.

3. ~~Should the `jay-component` attribute use the contract name or a generated hash?~~ Contract name — readable and deterministic.

4. ~~Should body `<style>` inside headfull component templates also be auto-scoped?~~ No — body styles are designer-controlled.

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

### Phase 3: Auto-scope headfull component CSS

**`compiler-jay-html/lib/jay-target/jay-html-parser.ts`** — in `parseHeadfullFSImports`:

- When extracting CSS from a headfull component's `<head>`, wrap it in `@scope ([jay-component="contractName"]) { ... }`
- Add `jay-component="contractName"` attribute to the component's root element in the injected template body
- The scoped CSS merges into the page's `cssParts` as before — extraction, minification, and caching all work

### Phase 4: Validation

**`compiler-jay-html`** validation or **`stack-cli/lib/validate.ts`**:

- Warn on body `<style>` with bare element selectors or `*` selectors
- Suggest `@scope` or class selectors

### Phase 5: Agent-kit guide

**`designer/jay-html-styling.md`**:

- Add "Component CSS Scoping" section explaining auto-`@scope` for headfull components
- Add "Inline Body Styles" section for co-located styles
- Document when to use each approach

### Phase 6: Verify

- `yarn confirm` from monorepo root

## Trade-offs

| Choice | Pro | Con |
|--------|-----|-----|
| Auto `@scope` for components | Proper encapsulation, stays in CSS pipeline | Adds `jay-component` attribute to DOM |
| Body styles as-is | Simple, matches HTML spec | No extraction/caching for inline styles |
| Class-based scoping | No `@scope` needed | Synthetic classes, higher specificity |
| No scoping (current) | Simple | Style leaks between components |
| Reject body styles (error) | Clean contract                                    | Breaks design tool output, overly restrictive      |
