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

**A:**

### Q2: What format should the compiled server render function output?
A stream of strings (or chunks). The function yields/writes HTML fragments sequentially, allowing the HTTP response to start immediately.

**A:**

### Q3: How do slow-rendered (pre-rendered) jay-html templates work with SSR?
After slow rendering (Design Log #75), we have pre-rendered jay-html with slow data baked in. The SSR compiler should compile this pre-rendered jay-html into the streaming render function, binding only fast + interactive data at request time.

**A:**

### Q4: Where does the SSR render function live — in the compiler output or in jay-stack server runtime?
In the compiler output. The compiler produces a `generated-server-element.ts` (or similar) that exports a render function. Jay-stack's server runtime calls it.

**A:**

### Q5: How do headless components render on the server?
Headless components that have slow/fast phases already produce ViewState. The SSR render function needs the merged ViewState to render the HTML. The headless component resolution happens before SSR rendering.

**A:**

### Q6: How do we handle interactive `if` and `forEach` in SSR?
- `if`: evaluate the condition with the current ViewState, render the matching branch. For the client, include hydration markers (see Design Log #93).
- `forEach`: iterate the array, render each item. Include markers for hydration.

**A:**

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
import type { Writable } from 'node:stream';

export interface ServerRenderOptions {
    viewState: ViewState;
    write: (chunk: string) => void;
}

export function renderToStream(options: ServerRenderOptions): void {
    const { viewState: vs, write: w } = options;
    
    w('<div>');
    w('<h1 data-jay-h>');
    w(escapeHtml(vs.title));
    w('</h1>');
    w('<div data-jay-h>');
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
- **Markers** — adds `data-jay-h` for elements that need client hydration (Design Log #93)
- **Escaping** — all dynamic values are HTML-escaped

### Rendering Rules by Jay-HTML Construct

| Construct | SSR Behavior |
|-----------|-------------|
| Static HTML | Write directly: `w('<p>Hello</p>')` |
| `{binding}` | Evaluate + escape: `w(escapeHtml(vs.title))` |
| `ref="name"` | No output change (refs are client-only) |
| `style` binding | Evaluate and inline: `w('style="color:' + vs.color + '"')` |
| `if="cond"` (interactive) | Evaluate condition, render matching branch. Add comment markers for hydration: `<!--jay-if:0-->...<!--/jay-if:0-->` |
| `if="cond"` (slow/fast only) | Evaluate condition, render or skip. No markers needed. |
| `forEach` (interactive) | Iterate array, render each item. Add markers: `<!--jay-each:0--><!--jay-item:key-->...<!--/jay-each:0-->` |
| `forEach` (slow) | Already unrolled by slow render (Design Log #75) |
| headless component | Already resolved to ViewState before SSR. Render its jay-html with merged ViewState. |
| child component | Render component's server element recursively |

### Comment Markers for Interactive Elements

For interactive `if` and `forEach`, the server adds HTML comment markers so the client hydration can find boundaries:

```html
<!-- Interactive if (cond=true at SSR) -->
<!--jay-if:0:1-->
<div style="color:red">Content when true</div>
<!--/jay-if:0-->

<!-- Interactive if (cond=false at SSR) -->
<!--jay-if:1:0-->
<!--/jay-if:1-->

<!-- Interactive forEach -->
<!--jay-each:0-->
  <!--jay-item:abc--><div>Item ABC</div><!--/jay-item:abc-->
  <!--jay-item:def--><div>Item DEF</div><!--/jay-item:def-->
<!--/jay-each:0-->
```

The markers encode:
- `jay-if:INDEX:SSR_VALUE` — which conditional, and what value it had at SSR time
- `jay-each:INDEX` — which forEach loop
- `jay-item:TRACK_BY_KEY` — individual forEach items (for hydration matching)

### Compiled Output Example

Given this jay-html:

```html
<div>
    <h1>{title}</h1>
    <div if="showDetails" ref="details">
        <span>{description}</span>
    </div>
    <ul>
        <li forEach="items" trackBy="id">
            <span>{name}</span> - <span>{price}</span>
        </li>
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

export function renderToStream(vs: ViewState, w: (chunk: string) => void): void {
    w('<div>');
    
    // {title} — dynamic text, mark for hydration
    w('<h1 data-jay-h>');
    w(escapeHtml(String(vs.title)));
    w('</h1>');
    
    // if="showDetails" — interactive conditional
    w('<!--jay-if:0:' + (vs.showDetails ? '1' : '0') + '-->');
    if (vs.showDetails) {
        w('<div data-jay-h>');  // has ref, mark for hydration
        w('<span data-jay-h>');
        w(escapeHtml(String(vs.description)));
        w('</span>');
        w('</div>');
    }
    w('<!--/jay-if:0-->');
    
    // forEach="items" — interactive collection
    w('<ul>');
    w('<!--jay-each:0-->');
    for (const item of vs.items) {
        w('<!--jay-item:' + escapeHtml(String(item.id)) + '-->');
        w('<li>');
        w('<span data-jay-h>');
        w(escapeHtml(String(item.name)));
        w('</span>');
        w(' - ');
        w('<span data-jay-h>');
        w(escapeHtml(String(item.price)));
        w('</span>');
        w('</li>');
        w('<!--/jay-item:' + escapeHtml(String(item.id)) + '-->');
    }
    w('<!--/jay-each:0-->');
    w('</ul>');
    
    w('</div>');
}
```

### Integration with Jay-Stack Server

The flow changes from:

```
Current: slow phase → fast phase → empty HTML + client script + JSON ViewState
```

To:

```
New: slow phase → fast phase → SSR render (streamed HTML) + hydration script + JSON ViewState
```

In the dev server / production server:

```ts
// Current (generate-client-script.ts)
return `<div id="target"></div><script>...</script>`;

// New (generate-ssr-response.ts)
function generateSSRResponse(res: ServerResponse, viewState, jayHtmlPath, ...) {
    // 1. Write HTML head
    res.write('<!doctype html><html><head>...</head><body>');
    res.write('<div id="target">');
    
    // 2. Stream the rendered component HTML
    const { renderToStream } = await import(serverElementPath);
    renderToStream(viewState, (chunk) => res.write(chunk));
    
    // 3. Close target and add hydration script
    res.write('</div>');
    res.write(`<script type="module">
        import { hydrate } from '${hydrateElementPath}';
        import { makeCompositeJayComponent } from '@jay-framework/stack-client-runtime';
        const viewState = ${JSON.stringify(viewState)};
        const target = document.getElementById('target');
        hydrateCompositeComponent(hydrate, viewState, target.firstElementChild, ...);
    </script>`);
    res.write('</body></html>');
    res.end();
}
```

### New Package: `@jay-framework/ssr-runtime`

Minimal server-side utilities (no DOM dependency):

```ts
// packages/runtime/ssr-runtime/lib/index.ts

/** HTML-escape a string for safe embedding in HTML content */
export function escapeHtml(str: string): string { ... }

/** HTML-escape a string for safe embedding in attribute values */  
export function escapeAttr(str: string): string { ... }
```

This package must be very small — the compiled server elements import from it.

### Compiler Changes

In `compiler-jay-html`:

1. **New render function**: `renderServerNode(node, context)` — similar to `renderElementNode` and `renderElementBridgeNode`
2. **New file generator**: `generateServerElementFile(jayFile)` — produces `generated-server-element.ts`
3. **Marker generation**: Track which elements need `data-jay-h` and which conditionals/forEach need comment markers
4. **escapeHtml calls**: Wrap all dynamic text and attribute bindings with `escapeHtml()`

### When to Compile SSR vs Client-Only

| Scenario | Generate server element? | Generate hydrate element? | Generate client element? |
|----------|------------------------|--------------------------|-------------------------|
| Component has slow/fast + interactive | Yes | Yes | No (hydrate replaces it) |
| Component is server-only (no interactive) | Yes | No | No |
| Component is client-only (no slow/fast) | No | No | Yes (current behavior) |

## Implementation Plan

### Phase 1: SSR Runtime Package
1. Create `packages/runtime/ssr-runtime`
2. Implement `escapeHtml()` and `escapeAttr()`
3. Tests: escape edge cases (HTML entities, quotes, null bytes)

### Phase 2: Compiler — Server Element Target
1. Add `renderServerNode()` in `jay-html-compiler.ts`
2. Handle static HTML, dynamic text, attributes, style bindings
3. Generate `generated-server-element.ts` files
4. Tests: fixture-based, starting with simple cases (static text, dynamic text, refs)

### Phase 3: Compiler — Conditionals and forEach
1. Add `if` handling with comment markers
2. Add `forEach` handling with item markers
3. Handle nested conditionals and forEach
4. Tests: conditions fixture, collections fixture

### Phase 4: Jay-Stack Integration
1. Create `generate-ssr-response.ts` in `stack-server-runtime`
2. Modify dev server to use SSR rendering
3. Stream HTML response instead of empty shell
4. Embed ViewState JSON for hydration script
5. Tests: dev server integration tests

### Phase 5: Production Optimizations
1. Concatenate adjacent static `w()` calls at compile time: `w('<div><h1 data-jay-h>')` instead of `w('<div>'); w('<h1 data-jay-h>')`
2. Strip `data-jay-h` in production if using positional hydration
3. Pre-compute static portions as template literals

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
        <h1 data-jay-h>Hello</h1>
        <!--jay-each:0-->
          <!--jay-item:1--><li><span data-jay-h>Widget</span> - <span data-jay-h>9.99</span></li><!--/jay-item:1-->
          <!--jay-item:2--><li><span data-jay-h>Gadget</span> - <span data-jay-h>19.99</span></li><!--/jay-item:2-->
        <!--/jay-each:0-->
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

## Trade-offs

| Decision | Pro | Con |
|----------|-----|-----|
| Compile to `write()` calls | Streaming, no memory accumulation | More compiler complexity |
| Comment markers for if/forEach | Standard HTML, no extra elements | Slightly larger HTML |
| Separate ssr-runtime package | Minimal server dependency | Another package to maintain |
| SSR at fast phase (not slow) | Slow data already baked in, fast = per-request | Must re-render on every request (cacheable) |
| `data-jay-h` on dynamic elements | Reliable hydration targeting | Small HTML overhead |

## Verification Criteria

1. **Streaming**: HTML response starts before full render completes (verify with chunked transfer encoding)
2. **No memory accumulation**: Server does not build full HTML string (verify with memory profiling on large pages)
3. **Correct HTML**: Server-rendered HTML matches what client would produce (verify with DOM comparison)
4. **Hydration compatible**: Design Log #93 hydration can find all markers and adopt all nodes
5. **Performance**: SSR response is faster than client-side render for First Contentful Paint
6. **SEO**: HTML content is visible without JavaScript (verify with curl)
7. **escapeHtml**: No XSS vectors in server-rendered dynamic content
