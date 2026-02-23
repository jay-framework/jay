# Design Log #94 — SSR Streaming Renderer

## Background

Jay currently does NOT render HTML on the server. The server produces ViewState data (slow + fast phases), then sends an empty `<div id="target"></div>` plus a `<script>` that imports the compiled element and creates the entire DOM on the client (see `generate-client-script.ts`).

This means:

- Users see a blank page until JavaScript loads and executes
- Search engines see an empty page (no SEO)
- Time to First Contentful Paint is slow

We need the server to render the full HTML from compiled jay-html, streaming it directly to the response without materializing the full HTML string in memory.

### Related Design Logs

- #11 — SSR (original concept, mentions stream support)
- #34 — Jay Stack (3-phase rendering pipeline)
- #50 — Rendering phases in contracts
- #75 — Slow rendering jay-html to jay-html
- #93 — Client hydration (companion — how client connects to this HTML)

## Problem

1. **No server HTML rendering** exists. The compiler produces `generated-element.ts` which calls `document.createElement` — browser-only APIs.
2. **The fast phase only produces data**, not HTML. `renderFastChangingData()` returns ViewState objects.
3. We need a new compilation target that renders jay-html to an HTML **stream** on the server, without DOM APIs.

## Questions and Answers

### Q1: Should we compile jay-html into a streaming render function, or interpret jay-html at runtime on the server?

Compilation is preferred — it avoids parsing jay-html at request time and produces optimal code.

**A:** Confirmed — compile. The compiled output will also be used for production builds later, not just dev server.

### Q2: What format should the compiled server render function output?

A stream of strings (or chunks). The function yields/writes HTML fragments sequentially, allowing the HTTP response to start immediately.

**A:** Confirmed — stream of string chunks via `write()` callback.

### Q3: How do slow-rendered (pre-rendered) jay-html templates work with SSR?

After slow rendering (Design Log #75), we have pre-rendered jay-html with slow data baked in. The SSR compiler should compile this pre-rendered jay-html into the streaming render function, binding only fast + interactive data at request time.

**A:** Confirmed.

### Q4: Where does the SSR render function live — in the compiler output or in jay-stack server runtime?

In the compiler output. The compiler produces a `generated-server-element.ts` (or similar) that exports a render function. Jay-stack's server runtime calls it.

**A:** Confirmed — compiler output.

### Q5: How do headless components render on the server?

Headless components that have slow/fast phases already produce ViewState. The SSR render function needs the merged ViewState to render the HTML. The headless component resolution happens before SSR rendering.

**A:** Confirmed.

### Q6: How do we handle interactive `if` and `forEach` in SSR?

- `if`: evaluate the condition with the current ViewState, render the matching branch. For the client, include hydration markers (see Design Log #93).
- `forEach`: iterate the array, render each item. Include markers for hydration.

**A:** Confirmed. Uses `jay-coordinate` attributes on elements for hydration targeting, consistent with Design Log #93. No comment boundaries needed — the runtime's `Kindergarten` handles DOM positioning via offset counting.

### Q7: How do we handle ViewState with Promise / async data?

See Design Log #45 for async types (`when-resolved`, `when-loading`, `when-rejected`).

**A:** Render the `when-pending` (loading) variant immediately into the stream. Do NOT close the final `</html>` tag yet — keep the stream open. Once the promise resolves (or rejects), write inline `<script>` that replaces the pending content with the resolved/rejected variant. This is similar to React Suspense streaming.

Flow:

1. When SSR hits an `async` property, render the `when-loading` variant inline
2. Mark it with a placeholder: `<template jay-async="p1:pending">...</template>` wrapper (or similar)
3. Continue streaming other HTML
4. When the promise settles, append an inline `<script>` at the end of the stream that:
   - Contains the resolved/rejected HTML as a string
   - Swaps the pending placeholder with the resolved/rejected content
5. Only close `</html>` after all promises settle (or after a timeout)

This means `renderToStream` becomes **async** — it returns a Promise that resolves when all async ViewState properties have settled.

## Design

### Architecture Overview

```
                          Build Time                    Request Time
                          ─────────                    ────────────

jay-html ──→ slow render ──→ pre-rendered jay-html ──→ SSR compiler output
                                                            │
                                                    ┌───────┴────────┐
                                                    │                │
                                            generated-server   generated-element
                                            -element.ts        -hydrate.ts
                                            (server render)    (client hydrate)
                                                    │                │
                                                    ▼                ▼
                                             HTML stream ──→  Client hydration
                                             (to response)    (Design Log #93)
```

### Compilation Target: `generated-server-element.ts`

New compiler target that produces a function rendering HTML to a stream:

```ts
// generated-server-element.ts
import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export function renderToStream(vs: ViewState, ctx: ServerRenderContext): void {
  const { write: w } = ctx;

  w('<div>');
  w('<h1 jay-coordinate="0">');
  w(escapeHtml(vs.title));
  w('</h1>');
  w('<div jay-coordinate="content">');
  w(escapeHtml(vs.text));
  w('</div>');
  w('<p>Static footer</p>');
  w('</div>');
}
```

Key properties:

- **No DOM APIs** — pure string concatenation via `write()` calls
- **Streaming** — each `write()` can flush to the HTTP response
- **No intermediate string** — never builds the full HTML in memory
- **`jay-coordinate`** — marks elements that need client hydration (Design Log #93's coordinate system)
- **Escaping** — all dynamic values are HTML-escaped
- **`onAsync`** — registers promises for streaming async resolution

### Rendering Rules by Jay-HTML Construct

| Construct                    | SSR Behavior                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static HTML                  | Write directly: `w('<p>Hello</p>')`                                                                                                                            |
| `{binding}`                  | Evaluate + escape + coordinate: `w('<h1 jay-coordinate="0">'); w(escapeHtml(vs.title)); w('</h1>')`                                                            |
| `ref="name"`                 | Add `jay-coordinate="refName"` to element. Ref itself is client-only.                                                                                          |
| `style` binding              | Evaluate and inline: `w('style="color:' + escapeAttr(vs.color) + '"')`                                                                                         |
| `if="cond"` (interactive)    | Evaluate condition, render matching branch with `jay-coordinate` on dynamic elements. No comment markers — `Kindergarten` offset counting handles positioning. |
| `if="cond"` (slow/fast only) | Evaluate condition, render or skip. No markers needed.                                                                                                         |
| `forEach` (interactive)      | Add `jay-coordinate` (auto-index) on container element; iterate items with `jay-coordinate="trackByKey"` on each.                                              |
| `forEach` (slow)             | Already unrolled by slow render (Design Log #75)                                                                                                               |
| `when-loading` (async)       | Render pending variant inline with `jay-async="propName:pending"` wrapper. Register promise with `ctx.onAsync`.                                                |
| `when-resolved` (async)      | Not rendered initially. Written via inline `<script>` when promise resolves.                                                                                   |
| `when-rejected` (async)      | Not rendered initially. Written via inline `<script>` when promise rejects.                                                                                    |
| headless component           | Already resolved to ViewState before SSR. Render its jay-html with merged ViewState.                                                                           |
| child component              | Render component's server element recursively                                                                                                                  |

### Markers for Interactive Elements

Uses the `jay-coordinate` attribute system from Design Log #93. No comment boundaries — the runtime's `Kindergarten` class handles DOM positioning through offset counting (each dynamic child gets a `KindergartenGroup`, and `getOffsetFor()` computes insertion position by summing `children.size` of preceding groups).

```html
<!-- Interactive if (cond=true at SSR) -->
<div jay-coordinate="details">Content when true</div>

<!-- Interactive if (cond=false at SSR) — nothing rendered -->

<!-- Interactive forEach (container gets auto-index coordinate for Kindergarten setup) -->
<ul jay-coordinate="1">
  <li jay-coordinate="abc">
    <span jay-coordinate="abc/0">Item ABC</span>
    <button jay-coordinate="abc/addBtn">Add</button>
  </li>
  <li jay-coordinate="def">
    <span jay-coordinate="def/0">Item DEF</span>
    <button jay-coordinate="def/addBtn">Add</button>
  </li>
</ul>

<!-- Async promise (pending) -->
<div jay-async="po1:pending">
  <span>Still loading the object</span>
</div>
```

Markers:

- `jay-coordinate="..."` on elements — for hydration targeting (Design Log #93)
- `jay-async="propName:state"` attribute — async promise placeholder (replaced by inline script when settled)

### Compiled Output Example

Given this jay-html:

```html
<div>
  <h1>{title}</h1>
  <div if="showDetails" ref="details">
    <span>{description}</span>
  </div>
  <ul>
    <li forEach="items" trackBy="id"><span>{name}</span> - <span>{price}</span></li>
  </ul>
</div>
```

Compiled `generated-server-element.ts`:

```ts
import { escapeHtml } from '@jay-framework/ssr-runtime';

interface ViewState {
  title: string;
  showDetails: boolean;
  description: string;
  items: Array<{ id: string; name: string; price: number }>;
}

export function renderToStream(vs: ViewState, ctx: ServerRenderContext): void {
  const { write: w } = ctx;
  w('<div>');

  // {title} — dynamic text, coordinate for hydration
  w('<h1 jay-coordinate="0">');
  w(escapeHtml(String(vs.title)));
  w('</h1>');

  // if="showDetails" — interactive conditional
  if (vs.showDetails) {
    w('<div jay-coordinate="details">'); // ref="details"
    w('<span jay-coordinate="details/0">');
    w(escapeHtml(String(vs.description)));
    w('</span>');
    w('</div>');
  }

  // forEach="items" — interactive collection
  w('<ul jay-coordinate="1">'); // container for forEach, auto-index
  for (const item of vs.items) {
    const key = escapeHtml(String(item.id));
    w('<li jay-coordinate="' + key + '">');
    w('<span jay-coordinate="' + key + '/0">');
    w(escapeHtml(String(item.name)));
    w('</span>');
    w(' - ');
    w('<span jay-coordinate="' + key + '/1">');
    w(escapeHtml(String(item.price)));
    w('</span>');
    w('</li>');
  }
  w('</ul>');

  w('</div>');
}
```

### Compiled Output Example: Async Properties

Given this jay-html with async data (Design Log #45):

```html
<div>
  <span>{s1}</span>
  <span when-resolved="p1">{.}</span>
  <span when-loading="p1">Still loading</span>
  <span when-rejected="p1">Error: {message}</span>
</div>
```

Compiled `generated-server-element.ts`:

```ts
export function renderToStream(vs: ViewState, ctx: ServerRenderContext): void {
  const { write: w, onAsync } = ctx;
  w('<div>');
  w('<span jay-coordinate="0">');
  w(escapeHtml(String(vs.s1)));
  w('</span>');

  // Async p1: render when-loading immediately, register promise for later
  w('<div jay-async="p1:pending" jay-coordinate="p1">');
  w('<span>Still loading</span>');
  w('</div>');

  // Register the promise — when it settles, the framework writes inline JS
  onAsync(vs.p1, 'p1', {
    resolved: (val) => '<span jay-coordinate="p1">' + escapeHtml(String(val)) + '</span>',
    rejected: (err) =>
      '<span jay-coordinate="p1">Error: ' + escapeHtml(String(err.message)) + '</span>',
  });

  w('</div>');
}
```

When the promise resolves, the framework appends to the stream:

```html
<script>
  (function () {
    var t = document.querySelector('[jay-async="p1:pending"]');
    var d = document.createElement('div');
    d.innerHTML = '<span jay-coordinate="p1">Hello World</span>';
    t.replaceWith(d.firstChild);
    // Trigger hydration update for this coordinate
    window.__jay?.hydrateAsync?.('p1');
  })();
</script>
```

This pattern:

1. Renders pending content immediately — user sees loading state
2. Keeps the HTTP stream open until all promises settle
3. When a promise settles, writes an inline `<script>` that does a DOM swap
4. The swap happens before the hydration script runs (scripts execute in order)
5. By the time hydration runs, the DOM already has the resolved content

### Integration with Jay-Stack Server

The flow changes from:

```
Current: slow phase → fast phase → empty HTML + client script + JSON ViewState
```

To:

```
New: slow phase → fast phase → SSR render (streamed HTML) + async scripts + hydration script + JSON ViewState
```

In the dev server / production server:

```ts
// Current (generate-client-script.ts)
return `<div id="target"></div><script>...</script>`;

// New (generate-ssr-response.ts)
async function generateSSRResponse(res: ServerResponse, viewState, jayHtmlPath, ...) {
    // 1. Write HTML head
    res.write('<!doctype html><html><head>...</head><body>');
    res.write('<div id="target">');

    // 2. Stream the rendered component HTML
    const { renderToStream } = await import(serverElementPath);
    const pendingPromises: Array<Promise<void>> = [];

    const ctx: ServerRenderContext = {
        write: (chunk) => res.write(chunk),
        onAsync: (promise, id, templates) => {
            pendingPromises.push(
                promise.then(
                    (val) => res.write(`<script>(function(){
                        var t=document.querySelector('[jay-async="${id}:pending"]');
                        var d=document.createElement('div');
                        d.innerHTML='${templates.resolved(val)}';
                        t.replaceWith(d.firstChild);
                    })()</script>`),
                    (err) => res.write(`<script>(function(){
                        var t=document.querySelector('[jay-async="${id}:pending"]');
                        var d=document.createElement('div');
                        d.innerHTML='${templates.rejected(err)}';
                        t.replaceWith(d.firstChild);
                    })()</script>`),
                )
            );
        },
    };

    renderToStream(viewState, ctx);

    // 3. Close target div
    res.write('</div>');

    // 4. Wait for all async promises to settle (scripts stream as they resolve)
    await Promise.allSettled(pendingPromises);

    // 5. Add hydration script (after all async swaps)
    res.write(`<script type="module">
        import { hydrate } from '${hydrateElementPath}';
        const viewState = ${JSON.stringify(viewState)};
        const target = document.getElementById('target');
        hydrateCompositeComponent(hydrate, viewState, target.firstElementChild, ...);
    </script>`);
    res.write('</body></html>');
    res.end();
}
```

The async flow means the HTTP response stays open while promises resolve. Each resolved promise writes an inline `<script>` that swaps the pending placeholder. The browser executes these scripts as they arrive (streaming). The hydration script comes last, after all async content is in the DOM.

### New Package: `@jay-framework/ssr-runtime`

Minimal server-side utilities (no DOM dependency):

```ts
// packages/runtime/ssr-runtime/lib/index.ts

/** HTML-escape a string for safe embedding in HTML content */
export function escapeHtml(str: string): string { ... }

/** HTML-escape a string for safe embedding in attribute values */
export function escapeAttr(str: string): string { ... }

/** Context passed to compiled renderToStream functions */
export interface ServerRenderContext {
    write: (chunk: string) => void;
    onAsync: (
        promise: Promise<any>,
        id: string,
        templates: {
            resolved: (val: any) => string;
            rejected: (err: any) => string;
        },
    ) => void;
}

/** Generate the inline <script> for async promise swap */
export function asyncSwapScript(id: string, html: string): string { ... }
```

This package must be very small — the compiled server elements import from it.

### Compiler Changes

In `compiler-jay-html`:

1. **New render function**: `renderServerNode(node, context)` — similar to `renderElementNode` and `renderElementBridgeNode`
2. **New file generator**: `generateServerElementFile(jayFile)` — produces `generated-server-element.ts`
3. **Coordinate generation**: Assign `jay-coordinate` values using same coordinate system as Design Log #93 (ref names, auto-index for non-ref elements, trackBy keys for forEach, auto-index for container elements wrapping forEach/conditional)
4. **Async handling**: `when-loading` → render inline with `jay-async` wrapper; `when-resolved`/`when-rejected` → generate template functions for `ctx.onAsync`
5. **escapeHtml calls**: Wrap all dynamic text and attribute bindings with `escapeHtml()` / `escapeAttr()`

### When to Compile SSR vs Client-Only

| Scenario                                  | Generate server element? | Generate hydrate element? | Generate client element? |
| ----------------------------------------- | ------------------------ | ------------------------- | ------------------------ |
| Component has slow/fast + interactive     | Yes                      | Yes                       | No (hydrate replaces it) |
| Component is server-only (no interactive) | Yes                      | No                        | No                       |
| Component is client-only (no slow/fast)   | No                       | No                        | Yes (current behavior)   |

## Implementation Plan

### Phase 1: SSR Runtime Package

1. Create `packages/runtime/ssr-runtime`
2. Implement `escapeHtml()`, `escapeAttr()`, `asyncSwapScript()`
3. Define `ServerRenderContext` interface
4. Tests: escape edge cases (HTML entities, quotes, null bytes), async swap script generation

### Phase 2: Compiler — Server Element Target (basics)

1. Add `renderServerNode()` in `jay-html-compiler.ts`
2. Handle static HTML, dynamic text, attributes, style bindings
3. Generate `jay-coordinate` attributes (same coordinate system as Design Log #93)
4. Generate `generated-server-element.ts` files
5. Tests: fixture-based, starting with simple cases (static text, dynamic text, refs)

### Phase 3: Compiler — Conditionals and forEach

1. Add `if` handling — evaluate condition, render matching branch with `jay-coordinate` on dynamic elements
2. Add `forEach` handling — iterate items with `jay-coordinate="trackByKey"` on each
3. Handle nested conditionals and forEach
4. Tests: conditions fixture, collections fixture

### Phase 4: Compiler — Async Promise Streaming

1. Add `when-loading` → render inline with `jay-async="propName:pending"` wrapper
2. Add `when-resolved` / `when-rejected` → generate template functions for `ctx.onAsync`
3. `renderToStream` signature uses `ServerRenderContext` (with `onAsync`)
4. Tests: async fixtures (async-simple-types, async-objects, async-arrays)

### Phase 5: Jay-Stack Integration

1. Create `generate-ssr-response.ts` in `stack-server-runtime`
2. Modify dev server to use SSR rendering
3. Stream HTML response, wait for async promises, then write hydration script
4. Embed ViewState JSON for hydration script
5. Tests: dev server integration tests

### Phase 6: Production Optimizations

1. Concatenate adjacent static `w()` calls at compile time: `w('<div><h1 jay-coordinate="0">')` instead of separate calls
2. Pre-compute static portions as template literals
3. Async timeout: close stream after N seconds even if promises haven't settled

## Examples

### Before (current)

Browser receives:

```html
<!doctype html>
<html>
  <body>
    <div id="target"></div>
    <script type="module">
      // ... imports ...
      const viewState = {"title":"Hello","items":[...]};
      const instance = pageComp({});
      target.appendChild(instance.element.dom);
    </script>
  </body>
</html>
```

User sees: blank page → flash → content

### After (with SSR)

Browser receives (streamed):

```html
<!doctype html>
<html>
  <body>
    <div id="target">
      <div>
        <h1 jay-coordinate="0">Hello</h1>
        <ul jay-coordinate="1">
          <li jay-coordinate="w1">
            <span jay-coordinate="w1/0">Widget</span> - <span jay-coordinate="w1/1">9.99</span>
          </li>
          <li jay-coordinate="g2">
            <span jay-coordinate="g2/0">Gadget</span> - <span jay-coordinate="g2/1">19.99</span>
          </li>
        </ul>
      </div>
    </div>
    <script type="module">
      // ... hydration imports ...
      const viewState = {"title":"Hello","items":[...]};
      hydrateCompositeComponent(hydrate, viewState, target.firstElementChild, ...);
    </script>
  </body>
</html>
```

User sees: content immediately → interactive after hydration

### After (with SSR + async promise)

Browser receives (streamed progressively):

```html
<!doctype html>
<html>
  <body>
    <div id="target">
      <div>
        <span jay-coordinate="0">Hello</span>
        <!-- p1 is still pending, show loading state -->
        <div jay-async="p1:pending" jay-coordinate="p1">
          <span>Still loading</span>
        </div>
      </div>
    </div>
    <!-- Promise p1 resolves while streaming — inline script swaps content -->
    <script>
      (function () {
        var t = document.querySelector('[jay-async="p1:pending"]');
        var d = document.createElement('div');
        d.innerHTML = '<span jay-coordinate="p1">World</span>';
        t.replaceWith(d.firstChild);
      })();
    </script>
    <!-- All promises settled, now hydrate -->
    <script type="module">
      const viewState = {"s1":"Hello","p1":"World"};
      hydrateCompositeComponent(hydrate, viewState, target.firstElementChild, ...);
    </script>
  </body>
</html>
```

User sees: "Hello" + "Still loading" → "Hello" + "World" (swap) → interactive after hydration

## Trade-offs

| Decision                                          | Pro                                                        | Con                                                       |
| ------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Compile to `write()` calls                        | Streaming, no memory accumulation, reusable for production | More compiler complexity                                  |
| `jay-coordinate` on dynamic elements              | Consistent with DL#93 hydration and automation API         | Small HTML overhead                                       |
| No comment markers (Kindergarten offset counting) | Cleaner HTML, less output, simpler compiler                | Relies on Kindergarten internals for position correctness |
| Separate ssr-runtime package                      | Minimal server dependency                                  | Another package to maintain                               |
| SSR at fast phase (not slow)                      | Slow data already baked in, fast = per-request             | Must re-render on every request (cacheable)               |
| Async: render pending inline, swap via script     | Progressive loading, no re-render of entire page           | Inline scripts add complexity; stream stays open          |
| Async: wait for all promises before hydration     | Hydration sees final DOM, no race conditions               | Slow promises delay interactivity                         |

## Verification Criteria

1. **Streaming**: HTML response starts before full render completes (verify with chunked transfer encoding)
2. **No memory accumulation**: Server does not build full HTML string (verify with memory profiling on large pages)
3. **Correct HTML**: Server-rendered HTML matches what client would produce (verify with DOM comparison)
4. **Coordinate consistency**: `jay-coordinate` values in server output match what DL#93 hydration expects (same coordinate system)
5. **Hydration compatible**: Design Log #93 hydration can find all coordinates and adopt all nodes
6. **Async streaming**: Pending content renders immediately; resolved content swaps in via inline script before hydration
7. **Async timeout**: Stream closes after timeout even if promises haven't settled (graceful degradation)
8. **Performance**: SSR response is faster than client-side render for First Contentful Paint
9. **SEO**: HTML content is visible without JavaScript (verify with curl)
10. **escapeHtml**: No XSS vectors in server-rendered dynamic content

## Implementation Results

### Phase 1 — SSR Runtime Package (Completed)

**Package created:** `packages/runtime/ssr-runtime` (`@jay-framework/ssr-runtime`)

**Files created:**

- `lib/escape.ts` — `escapeHtml()` and `escapeAttr()` using map-based regex replacement (escapes `& < > " '`)
- `lib/server-render-context.ts` — `ServerRenderContext` interface with `write` and `onAsync` members
- `lib/async-swap-script.ts` — `asyncSwapScript(id, html)` generates inline `<script>` for async promise swap
- `lib/index.ts` — re-exports all public API
- `package.json`, `tsconfig.json`, `vite.config.ts` — package scaffolding (modeled on list-compare)

**Tests added (22 total, all passing):**

- `test/escape.test.ts` — 15 tests (P1-P15): escapeHtml + escapeAttr covering all 5 HTML entities, multiple entities, empty string, non-string coercion, XSS prevention
- `test/async-swap-script.test.ts` — 7 tests (P16-P20 + extras): script tag generation, quote/backslash escaping, placeholder targeting, replaceWith usage, hydration callback trigger

**No deviations from design.** Implementation matches DL#94 Phase 1 specification exactly.

### Phase 2 & 3 — Server Element Target: Basics, Conditionals, forEach (Completed)

**Files modified:**

- `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts` — Added `ServerContext` interface, `renderServerNode()`, `renderServerElement()`, `renderServerElementContent()`, `renderServerOpenTag()`, `renderServerAttributes()`, `generateServerElementFile()`. Handles static HTML, dynamic text/attributes, conditionals (`if=`), and `forEach` with `jay-coordinate` attributes.
- `packages/compiler/compiler-shared/lib/imports.ts` — Added `Import.escapeHtml`, `Import.escapeAttr`, `Import.ServerRenderContext`
- `packages/compiler/compiler-jay-html/lib/index.ts` — Exported `generateServerElementFile`
- `packages/compiler/compiler-jay-html/test/test-utils/file-utils.ts` — Added `readFixtureServerElementFile()`, `readFileAndGenerateServerElementFile()`

**Tests added (6 total, all passing):**

- `test/jay-target/generate-server-element.test.ts`:
  - basics: simple-dynamic-text, composite, refs, attributes
  - conditions: conditions
  - collections: collections (forEach)

**Golden fixtures created:** `generated-server-element.ts` in each fixture directory.

### Phase 4 — Async Promise Streaming (Completed)

**Files modified:**

- `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts` — Added async handling to server element target:
  - `renderServerNodeAsString()` / `renderServerElementAsString()` — Template string rendering mode that produces string concatenation expressions instead of `w()` calls. Used inside `onAsync` template callbacks.
  - `renderServerForEachAsString()` — Handles `forEach` inside resolved templates using `.map().join('')`.
  - `renderServerAttributesAsString()` — Attribute rendering for template string mode.
  - `collectAsyncGroups()` — Groups `when-loading`, `when-resolved`, `when-rejected` siblings by property name.
  - `renderServerAsyncGroup()` — Renders loading content inline with `<div jay-async="propName:pending">` wrapper, then emits `onAsync()` call with resolved/rejected template functions.
  - Updated `renderServerElementContent()` — Children processing now detects async groups, renders loading inline, skips resolved/rejected siblings, and emits `onAsync()` after loading.
  - Updated `generateServerElementFile()` — Destructures `onAsync` from ctx when async directives are present.
  - Updated `renderServerAttributes()` — Filters async directive attributes.
  - Updated `hasInteractiveChildElements()` — Includes async check.

**Tests added (3 new, 9 total, all passing):**

- `test/jay-target/generate-server-element.test.ts`:
  - async: async-simple-types — `Promise<string>` with loading/resolved/rejected
  - async: async-objects — `Promise<{ps2, pn2}>` with loading/resolved
  - async: async-arrays — `Promise<Array<{ps3, pn3}>>` with loading/resolved containing forEach

**Golden fixtures created:** `generated-server-element.ts` in async-simple-types, async-objects, async-arrays directories.

**Key design decisions:**

1. Template functions use string concatenation (`'<span>' + escapeHtml(String(val)) + '</span>'`) — not `w()` calls — because they're passed to `onAsync` which returns the HTML string.
2. The resolved/rejected template's root element uses the property name as its `jay-coordinate` (e.g., `jay-coordinate="p1"`), matching the hydration convention.
3. `forEach` inside resolved templates renders as `.map((item) => ...).join('')`.
4. The `jay-async` wrapper div is always emitted around loading content, even when the loading element itself is a div.

**No deviations from design.** Implementation matches DL#94 Phase 4 specification.

### Phase 5 — Jay-Stack Integration (SSR + Hydration in Dev Server)

**Files created:**

- `packages/jay-stack/stack-server-runtime/lib/generate-ssr-response.ts` — `generateSSRPageHtml()` function
- `packages/jay-stack/stack-client-runtime/lib/hydrate-composite-component.ts` — `hydrateCompositeJayComponent()`

**Files modified:**

- `packages/compiler/compiler-shared/lib/runtime-mode.ts` — added `JAY_QUERY_HYDRATE` constant
- `packages/compiler/compiler-shared/lib/jay-module-specifier.ts` — added `isHydrate` to `ParsedJayModuleSpecifier`, added hydrate pattern to `JAY_QUERY_PATTERNS`
- `packages/compiler/rollup-plugin/lib/runtime/generate-code-from-structure.ts` — detect `?jay-hydrate` query, call `generateElementHydrateFile` when hydrate target requested
- `packages/jay-stack/stack-client-runtime/lib/index.ts` — export `hydrateCompositeJayComponent`
- `packages/jay-stack/stack-server-runtime/lib/index.ts` — export `generateSSRPageHtml`
- `packages/jay-stack/stack-server-runtime/package.json` — added `@jay-framework/ssr-runtime` dependency
- `packages/jay-stack/dev-server/lib/dev-server.ts` — `sendResponse()` now tries SSR first, falls back to client-only rendering on error
- `packages/jay-stack/dev-server/test/dev-server.test.ts` — updated test expectations for SSR output

**Test results:** 67/67 packages pass. TSC clean.

**SSR flow (implemented):**

1. `sendResponse()` reads jay-html, calls `generateSSRPageHtml()`
2. `generateSSRPageHtml()` parses jay-html via `parseJayFile()`, generates server element code via `generateServerElementFile()`
3. Writes server element TS to `<buildFolder>/server-elements/`, loads via `vite.ssrLoadModule()`
4. Executes `renderToStream()` with buffered `write()` and `onAsync` handler
5. Builds hydration script importing `hydrate` from `?jay-hydrate` target and using `hydrateCompositeJayComponent`
6. Returns full HTML page, processed by `vite.transformIndexHtml()`
7. On SSR failure, falls back to client-only rendering via `generateClientScript()`

**Hydration flow:**

- Client imports `hydrate` from `page.jay-html?jay-hydrate` (vite plugin generates hydrate target code)
- `hydrateCompositeJayComponent()` adapts the hydrate function signature `(rootElement, options?) => [Refs, Render]` to the `PreRenderElement` signature expected by `makeJayComponent` by binding `rootElement`
- No `target.appendChild` — DOM is already present from SSR

**Deviations from plan:**

1. `generateSSRPageHtml` accepts `projectRoot` and `tsConfigFilePath` instead of the full `JayRollupConfig` (to avoid adding `@jay-framework/rollup-plugin` as a dependency of stack-server-runtime)
2. The `?jay-hydrate` query is recognized directly in the `parseJayModuleSpecifier` infrastructure (via `isHydrate` field) rather than using a separate detection mechanism
3. Test pages that use `{{expr}}` syntax (double braces) or have multiple root elements in body correctly fall back to client-only rendering — SSR requires valid jay-html single-brace syntax and single root element

### Phase 5 Bug Fix — Coordinate Alignment Between Server Element and Hydrate Targets

**Problem:** Product pages crashed with `Cannot read properties of undefined (reading 'dom')` in `hydrateConditional`. Two root causes:

1. **Coordinate counter divergence.** The server element target only assigned `jay-coordinate` to elements with dynamic content (text, attributes, refs). Conditional elements with static content (e.g., `<div if="cond">static text</div>`) got no coordinate. The hydrate target always assigns coordinates to conditionals via `context.coordinateCounter.count++` in its conditional handler. After the first static-content conditional, all subsequent coordinates were misaligned between the two targets — the hydrate code tried to adopt elements at wrong coordinates.

2. **`hydrateConditional` crash on static-content conditionals.** When a conditional has only static content, `renderHydrateElementContent` determined `needsAdoption = false` and returned empty content. The adopt callback became `() => {}` (returns `undefined`), and `hydrateConditional` crashed accessing `.dom` on `undefined`.

**Fix:**

- Server element target: pass `forceCoordinate: true` to `renderServerElementContent` for conditional elements (`jay-html-compiler.ts:2528`)
- Hydrate target: pass `forceAdopt: true` to `renderHydrateElementContent` for conditional elements (`jay-html-compiler.ts:2052`)
- Runtime: `hydrateConditional` defensively handles `adopted === undefined` (`hydrate.ts:178`)

**Key insight:** The server element and hydrate targets share a coordinate counter convention. Any element that receives a coordinate in one target MUST receive the same coordinate in the other. Conditionals always consume a coordinate in the hydrate target (via the handler's `count++`), so the server target must do the same.

**Additional finding:** The homepage SSR falls back to client rendering because enum values (e.g., `CurrentMood` from `if="mt.currentMood === happy"`) are not imported in the generated server element file. This is a known limitation for Phase 5 — enum support in SSR will need the server element generator to emit enum imports.
