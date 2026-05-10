# 133 — HTML Entities in Text Nodes

## Background

Jay-html templates can contain HTML entities like `&times;`, `&amp;`, `&nbsp;` in text content. During SSR, these are emitted as-is into the HTML output and decoded by the browser's HTML parser. However, the client-side runtime creates and updates text nodes using `document.createTextNode(content)` and `node.textContent = newContent`, neither of which decode HTML entities — they set the literal string.

**Observed bug:** A button containing `&times;` in a jay-html template renders correctly on initial page load (SSR), but after a reactive update (e.g., forEach rebuild from filter change), it displays the raw text `&times;` instead of `×`.

## Problem

There are two code paths that produce text in the DOM:

1. **Static text** — compiled from template literals, known at build time
2. **Dynamic text** — interpolated from ViewState values, known at render time

Both use `createTextNode` / `textContent`, which treat content as plain text, not HTML.

## Forces

### 1. Runtime fix: use innerHTML instead of textContent

Replace text node updates with HTML-aware insertion (e.g., set `innerHTML` on a parent or wrapper). This would handle both static and dynamic text uniformly.

**Pro:** Solves both static and dynamic cases in one place.

### 2. Security risk with innerHTML

Dynamic text often comes from ViewState, which may originate from user input or 3rd-party data. Using `innerHTML` opens XSS attack vectors — a ViewState value like `<script>alert('xss')</script>` would execute.

This is especially critical in the secure sandbox context where 3rd-party components must not be able to inject arbitrary HTML.

**Possible mitigation:** Sanitize dynamic text before DOM insertion. But sanitization has its own complexity and performance cost.

### 3. Performance: innerHTML vs textContent

`textContent` is a simple string assignment. `innerHTML` triggers the HTML parser, which:
- Parses the string as HTML
- Builds a document fragment
- Replaces all child nodes

For plain text (the common case), this is unnecessary overhead on every update.

### 4. Compiler-only fix is incomplete

Decoding entities at compile time (so the JS output contains `×` instead of `&times;`) solves static text but does nothing for dynamic text where a ViewState value contains an entity.

## Questions

1. How common are HTML entities in dynamic ViewState values in practice? Is this primarily a static-text problem?
   - **A:** Both cases matter. Static is the immediate bug, but dynamic HTML (e.g., rich text from a CMS) is a real use case that contracts should support explicitly.
2. Should the runtime distinguish between "HTML content" and "text content" with separate code paths?
   - **A:** Yes — via contract types. `text` (default) uses textContent, `html` uses innerHTML.
3. Is there a meaningful performance difference between innerHTML and textContent for short strings (button labels, single characters)?
   - **A:** Yes, but it's moot — static HTML subtrees get an even bigger win (see design below).
4. Could a hybrid approach work — decode entities at compile time for static text, keep textContent for dynamic text?
   - **A:** The chosen design goes further: static content is treated as HTML natively, dynamic content follows the contract type.
5. Should jay-html templates discourage HTML entities in favor of literal Unicode characters in documentation/guides?
   - **A:** No — templates are HTML, entities should just work. The design below handles this.

## Design

### Principle: templates are HTML, ViewState values are typed

Static content in jay-html templates is HTML by definition. Dynamic content follows the contract's declared type.

### Static text → HTML constructor

When the compiler detects a fully static subtree (no dynamic bindings), it can emit a single `html()` constructor with the nested HTML string instead of building a tree of `createElement` / `createTextNode` calls.

```
// Before (current): builds each node individually
const div = document.createElement('div');
const span = document.createElement('span');
span.textContent = '&times;';  // BUG: literal string
div.appendChild(span);

// After: single HTML insertion for static subtrees
html('<div><span>&times;</span></div>');
```

This solves the entity problem and is a performance improvement — one innerHTML call replaces many DOM API calls for static content.

### Dynamic text → contract type

Add an `html-string` dataType to contracts alongside the existing `string`:

```yaml
# string (default) — safe, uses textContent
- name: productName
  dataType: string

# html-string — uses innerHTML, opt-in
- name: richDescription
  dataType: html-string
```

- **`string`** (default): Runtime uses `textContent`. Safe against XSS. HTML entities in the value appear literally — this is correct behavior for plain strings.
- **`html-string`**: Runtime uses `innerHTML`. The value is treated as HTML markup. Entities are decoded, tags are rendered. This is also the natural type for rich text content (e.g., WYSIWYG editor output, CMS rich text fields) which is typically stored as HTML.

### Sanitization for html-string

The `html-string` type carries an inherent XSS risk. Mitigation:

- The `secure` package (or a dedicated sanitizer) strips dangerous tags/attributes (`<script>`, `onerror`, etc.) while preserving safe markup (`<b>`, `<em>`, `<br>`, entities)
- Sanitization is a configurable hook — projects can provide their own sanitizer or use a built-in one

### Sanitizer delivery via RenderElementOptions

Compiled jay-html files export a `render(options?: RenderElementOptions)` function. The sanitizer is passed through this existing path:

1. Extend `RenderElementOptions` with an optional `sanitizeHtml` function
2. The construction context receives the sanitizer from the options
3. The `html()` constructor for `html-string` values calls `sanitizeHtml` before `innerHTML`

This reuses the existing options → construction context plumbing — no new injection mechanism needed.

```typescript
// RenderElementOptions extension
interface RenderElementOptions {
  // ... existing options
  sanitizeHtml?: (html: string) => string;
}

// In the html() constructor (compiled output for html-string bindings)
function html(content: string, ctx: ConstructionContext) {
  const safe = ctx.sanitizeHtml ? ctx.sanitizeHtml(content) : content;
  element.innerHTML = safe;
}
```

Static template HTML does not go through the sanitizer — it is author-controlled and trusted.

### Summary

```
┌─────────────────┬───────────────┬────────────┬──────────────┐
│ Content          │ Mechanism     │ Entities   │ Security     │
├─────────────────┼───────────────┼────────────┼──────────────┤
│ Static template  │ html()        │ ✓ decoded  │ Safe (author │
│                  │ constructor   │            │ controlled)  │
├─────────────────┼───────────────┼────────────┼──────────────┤
│ Dynamic string     │ textContent │ ✗ literal  │ Safe (no     │
│ (dataType: string) │             │            │ injection)   │
├────────────────────┼─────────────┼────────────┼──────────────┤
│ Dynamic html-string  │ innerHTML │ ✓ decoded  │ Sanitized    │
│ (dataType: html-string)│ + sanitize│            │ via callout  │
└─────────────────┴───────────────┴────────────┴──────────────┘
```

## Trade-offs

| Aspect | Benefit | Cost |
|---|---|---|
| Static HTML constructor | Solves entity bug + fewer DOM calls for static subtrees | Compiler must detect static subtrees and emit different code |
| Contract html-string type | Explicit opt-in for rich content, clear security boundary | New dataType to support in contracts, compiler, and runtime |
| Sanitization callout | Pluggable, secure-context aware | Added complexity, sanitizer dependency, performance cost on html-string updates |
| string as default | Safe by default, no behavior change for existing contracts | Dynamic values with entities won't decode (correct — they're strings, not HTML) |
