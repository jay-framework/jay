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

## Implementation Plan

### Phase 1: Fix static text entities (bug fix)

**Goal:** Static text like `&times;` in jay-html templates renders correctly after client-side re-creation.

**Approach:** Decode HTML entities at compile time. The compiler emits the decoded Unicode character in the JS string literal, so `createTextNode` receives the actual character.

**Files:**
- `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts` — In `renderTextNode()` (line ~169), decode HTML entities in the static text before passing to `parseTextExpression()`. Add a `decodeHtmlEntities()` utility that converts `&times;` → `×`, `&amp;` → `&`, `&nbsp;` → ` `, etc.
- `packages/compiler/compiler-jay-html/lib/expressions/expression-compiler.ts` — OR decode entities here inside `parseTextExpression()` for the static-string portions only (not inside `{bindings}`)

**Key detail:** Only decode entities in the *static portions* of text expressions. Dynamic `{binding}` values pass through as-is — they are plain strings, not HTML.

**Verification:** Compile a template containing `<button>&times;</button>`, confirm the compiled JS output contains the Unicode `×` character, not `&times;`.

---

### Phase 2: Add `html-string` dataType to contracts

**Goal:** Contracts can declare a property as HTML content.

**Files:**
- `packages/compiler/compiler-shared/lib/jay-type.ts` (line ~35)
  - Add `JayHtmlString = new JayAtomicType('string')` (maps to `string` in TypeScript — it's still a string, just treated differently by the compiler)
  - Add `'html-string': JayHtmlString` to `typesMap`
  - **Note:** `JayHtmlString` maps to TS `string` but needs to be distinguishable from `JayString` so the compiler can emit different code. Options: (a) use a separate instance `new JayAtomicType('html-string')` and handle the TS mapping in type generation, or (b) create a marker subclass.

- `packages/compiler/compiler-jay-html/lib/contract/contract-parser.ts` — No changes needed; `resolvePrimitiveType()` picks it up automatically.

- Type generation (contract → `.d.ts`): Ensure `html-string` maps to `string` in the emitted TypeScript interface. Check `contract-to-view-state-and-refs.ts` to see if atomic type names are emitted directly — if so, we need to map `html-string` → `string` there.

**Verification:** A contract with `dataType: html-string` parses without error and generates a TypeScript type with `string`.

---

### Phase 3: Runtime `dynamicHtml` + sanitizer plumbing

**Goal:** A runtime function that updates DOM content as HTML, with optional sanitization.

**Constraint:** `html-string` bindings can only appear as the sole child of an element: `<element>{htmlBinding}</element>`. Mixed content like `<element>text {htmlBinding} more</element>` is not allowed. This means the parent element is always the container — no wrapper element needed. The runtime sets `innerHTML` directly on the parent.

**Files:**
- `packages/runtime/runtime/lib/element.ts`
  - `dynamicHtml` is not a standalone child constructor like `dynamicText`. Instead, it's an **attribute-like** modifier on the parent element — it takes over the element's children via `innerHTML`. It can be passed as a special attribute or applied after element creation:
    ```typescript
    export function dynamicHtml<ViewState>(
        parentElement: HTMLElement,
        htmlContent: (vs: ViewState) => string,
    ): updateFunc<ViewState> {
        let context = currentConstructionContext();
        let content = htmlContent(context.currData);
        const sanitize = context.sanitizeHtml;
        parentElement.innerHTML = sanitize ? sanitize(content) : content;
        return (newData: ViewState) => {
            let newContent = htmlContent(newData);
            if (newContent !== content) {
                parentElement.innerHTML = sanitize ? sanitize(newContent) : newContent;
                content = newContent;
            }
        };
    }
    ```
  - The compiled output would look like: `e('div', {}, [])` followed by a `dynamicHtml` call on the created element, or integrated into the element construction.

- `packages/runtime/runtime/lib/element-types.ts` (line ~67)
  - Extend `RenderElementOptions`:
    ```typescript
    export interface RenderElementOptions {
        eventWrapper?: JayEventHandlerWrapper<any, any, any>;
        sanitizeHtml?: (html: string) => string;
    }
    ```

- `packages/runtime/runtime/lib/context.ts`
  - `ConstructContext` (line ~156) currently does not receive `RenderElementOptions`. Options flow only to `ReferencesManager.for()`. Need to thread `sanitizeHtml` through:
    - Option A: Add `sanitizeHtml` to `ConstructContext` constructor, pass from compiled preRender
    - Option B: Store in a module-level variable set during preRender, read by `dynamicHtml`
    - Option A is cleaner.

- `packages/runtime/runtime/lib/index.ts` — Export `dynamicHtml`

**Verification:** `dynamicHtml(vs => vs.richText)` creates an element whose innerHTML is the value, and updates when ViewState changes.

---

### Phase 4: Compiler — emit `dynamicHtml` for html-string bindings

**Goal:** When a `{binding}` references an `html-string` typed property, the compiler emits `dh()` (dynamicHtml) instead of `dt()` (dynamicText).

**Files:**
- `packages/compiler/compiler-shared/lib/imports.ts` (after line ~68)
  - Add import entry:
    ```typescript
    dynamicHtml: importStatementFragment(JAY_RUNTIME, 'dynamicHtml as dh', ImportsFor.implementation),
    ```

- `packages/compiler/compiler-jay-html/lib/expressions/expression-compiler.ts`
  - Since `html-string` must be the sole child of its parent element, this is handled at the element level, not the text expression level. The compiler detects when an element's only child is a `{binding}` to an `html-string` property and emits `dynamicHtml` on the parent element instead of creating a child text node.

- `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts`
  - In element rendering, when the element has a single child that is a text node containing only a `{binding}` to an `html-string` typed property: emit the element with no children, then apply `dynamicHtml` to it.
  - This check happens at the element level where `variables: Variables` provides type context.

- **Validation:** The compiler should emit an error if an `html-string` binding appears in mixed content (e.g., `<div>text {htmlBinding} more</div>`) or alongside sibling elements.

**Verification:** `<div>{richDescription}</div>` where `richDescription` is `html-string` compiles to `e('div', {})` with a `dh(el, vs => vs.richDescription)` call, not `e('div', {}, [dt(vs => vs.richDescription)])`.

---

### Phase 5: SSR for html-string

**Goal:** Server-side rendering emits html-string values without escaping.

**Files:**
- `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler-server.ts` (line ~94-112)
  - Currently, dynamic text is wrapped with `escapeHtml(String(...))`. For `html-string` bindings, skip the `escapeHtml` wrapper — the value is already HTML.
  - Same challenge as Phase 4: the server compiler needs type awareness for bindings.

- `packages/runtime/ssr-runtime/lib/escape.ts` — No changes needed; we just conditionally skip calling `escapeHtml`.

**Verification:** A server-rendered page with `html-string` binding emits the raw HTML value (e.g., `<b>bold</b>`) without escaping to `&lt;b&gt;bold&lt;/b&gt;`.

---

### Phase 6: Hydration for html-string

**Goal:** Client-side hydration correctly adopts server-rendered html-string content.

Since `html-string` is always the sole child of its parent element, hydration is simpler: adopt the parent element (which already works via `adoptElement`), then attach a `dynamicHtml` updater to it. The existing innerHTML from SSR is correct on first render — `dynamicHtml` just needs to take over future updates.

**Files:**
- `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler-hydrate.ts`
  - When hydrating an element whose sole child is an `html-string` binding: adopt the element normally, skip adopting children (they're raw HTML, not structured nodes), and attach `dynamicHtml` updater.

- `packages/runtime/runtime/lib/hydrate.ts` — No new `adoptHtml()` needed. The parent element is adopted, and `dynamicHtml(parentEl, accessor)` handles updates.

---

### Phase 7: Tests

Each phase should include tests:

- **Phase 1:** Compiler test — template with `&times;`, `&amp;`, `&nbsp;` produces decoded characters in compiled output
- **Phase 2:** Contract parser test — `dataType: html-string` parses to correct type, generates `string` in TypeScript
- **Phase 3:** Runtime test — `dynamicHtml` creates element with innerHTML, updates correctly
- **Phase 4:** Compiler test — html-string binding emits `dh()` import and call
- **Phase 5:** SSR test — html-string value not escaped in server output
- **Phase 6:** Hydration test — html-string content adopted correctly from SSR

---

### Implementation Order

Phase 1 is independent and fixes the immediate bug. Phases 2–6 build on each other sequentially. Phase 7 is parallel to each phase.

Suggested order: **1 → 2 → 3 → 4 → 5 → 6**, each phase verified before proceeding.

**Future optimization:** Static subtree → single innerHTML constructor (collapse multiple static createElement calls into one innerHTML). This is a performance optimization independent of the html-string type and can be done separately.

## Trade-offs

| Aspect | Benefit | Cost |
|---|---|---|
| Static HTML constructor | Solves entity bug + fewer DOM calls for static subtrees | Compiler must detect static subtrees and emit different code |
| Contract html-string type | Explicit opt-in for rich content, clear security boundary | New dataType to support in contracts, compiler, and runtime |
| Sanitization callout | Pluggable, secure-context aware | Added complexity, sanitizer dependency, performance cost on html-string updates |
| string as default | Safe by default, no behavior change for existing contracts | Dynamic values with entities won't decode (correct — they're strings, not HTML) |

## Implementation Results

All 6 phases implemented. Tests: 647 compiler tests + 269 runtime tests passing.

### Phase 1: Static entity decoding
- Added `he` as direct dependency to `compiler-jay-html`
- `decodeHtmlEntities()` in `jay-html-compiler-shared.ts` wraps `he.decode()`
- Called in `renderTextNode()` before `textEscape()` — decodes entities at compile time
- Static text `&times;` compiles to Unicode `×` in the JS output

### Phase 2: html-string dataType
- `JayHtmlString = new JayAtomicType('string')` — distinct instance from `JayString`, same TS output
- `isHtmlStringType()` checks by reference equality (`=== JayHtmlString`)
- Added to `typesMap` as `'html-string'`

### Phase 3: Runtime dynamicHtml + sanitizer
- `dynamicHtml()` returns `HtmlContent` marker object (not a DOM element)
- `elementNS` and `dynamicElementNS` detect `HtmlContent` in children array, set `innerHTML` on parent
- `sanitizeHtml` optional field on `RenderElementOptions` → threaded through `ConstructContext` to all child contexts
- `ConstructContext.withRootContext` accepts optional `sanitizeHtml` parameter

### Phase 4: Compiler emits dh() for html-string
- `Import.dynamicHtml` added to imports registry
- `tryRenderHtmlStringChild()` in `jay-html-compiler.ts` detects sole-child html-string binding
- Emits `e('div', {}, [dh(vs => vs.richContent)])` — fits natural children array pattern

### Phase 5: SSR skips escapeHtml
- `isHtmlStringBinding()` in `jay-html-compiler-server.ts` detects html-string bindings
- SSR emits `w(String(vs.richContent))` without `escapeHtml` wrapper

### Phase 6: Hydration
- `adoptElement` in `hydrate.ts` handles `HtmlContent` children — skips initial innerHTML (SSR content correct), wires update
- Hydration compiler emits `adoptElement("coord", {}, [dh(vs => vs.richContent)])` for html-string

### Deviations from design
- **dynamicHtml approach**: Design proposed `dynamicHtml(parentElement, accessor)` taking parent directly. Implementation uses `HtmlContent` marker object in children array instead — cleaner integration with existing element/children pattern, no need for multi-statement compiled output.
- **Static subtree optimization**: Deferred as planned — Phase 1 uses compile-time entity decoding instead of full innerHTML constructor.
