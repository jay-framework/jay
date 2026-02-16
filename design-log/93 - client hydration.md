# Design Log #93 — Client Hydration

## Background

Jay currently renders entirely on the client. The server sends an empty `<div id="target"></div>` with a `<script>` that imports `render` and `makeCompositeJayComponent`, creates the full DOM via `element()` calls, and appends to `target` (see `generate-client-script.ts`).

With SSR (Design Log #94), the server will generate full HTML. The client runtime needs to **hydrate** — connect to the existing server-rendered DOM instead of creating it from scratch.

### Related Design Logs
- #11 — SSR (original concept)
- #34 — Jay Stack (3-phase rendering)
- #50 — Rendering phases in contracts
- #75 — Slow rendering jay-html to jay-html
- #72 — Skip client script for non-interactive components
- #94 — SSR streaming renderer (companion to this log)

## Problem

When the server renders full HTML, the client must:
1. Find and connect to existing DOM nodes for dynamic elements (refs, dynamic text, bindings)
2. Set up reactive updates (signals, conditionals, forEach)
3. Attach event handlers via refs
4. **NOT** recreate static HTML that already exists in the DOM

Currently, `element()` always creates new DOM nodes via `document.createElementNS`. There's no way to "adopt" existing DOM nodes.

## Key Design Guideline

**Do not hydrate static HTML.** The element bridge pattern (see `generated-element-bridge.ts` in refs fixture) demonstrates this principle:

```
// Full element (generated-element.ts) — creates entire DOM tree:
e('div', {}, [
    e('div', {}, [dt((vs) => vs.text)], refRef1()),
    e('div', {}, [dt((vs) => vs.text)], refRef()),
    e('div', {}, [e('div', {}, [dt((vs) => vs.text)], refRef3())]),
])

// Element bridge (generated-element-bridge.ts) — only refs, skips static structure:
elementBridge(viewState, refManager, () => [
    e(refRef1()),
    e(refRef()),
    e(refRef3()),
])
```

The bridge doesn't create the wrapper `<div>` or the nested `<div>` around ref3. It only knows about dynamic attachment points (refs). Hydration should follow the same principle.

## Questions and Answers

### Q1: How does the client find existing DOM nodes to hydrate?
The server can mark dynamic elements with data attributes (e.g., `data-jay-h="0"`) to create an index. The client walks the DOM or uses `querySelectorAll` to locate these markers.

**A:**

### Q2: What's the hydration compilation target?
Similar to how the compiler has `generated-element.ts` (full DOM) and `generated-element-bridge.ts` (sandbox), we need a `generated-element-hydrate.ts` (or a mode flag) that only connects to existing DOM.

**A:**

### Q3: Should hydration be a separate compiler target or a runtime mode?
A separate compiler target is cleaner — the hydration code is structurally different from creation code (no `document.createElement` calls). It's closer to the element bridge pattern.

**A:**

### Q4: How do we handle the "mismatch" case where server HTML doesn't match client expectations?
For now, we can log warnings in dev mode. In production, mismatches would indicate a bug.

**A:**

### Q5: Does the component lifecycle change?
`mount()` currently means "start reactive updates." For hydration, it should also mean "connect to DOM." The `makeJayComponent` flow doesn't change much — instead of calling `render(viewState)` which creates DOM, we call `hydrate(viewState, rootElement)` which adopts DOM.

**A:**

## Design

### Principle: Three Levels of Hydration Complexity

```
┌─────────────────────────────────────────────┐
│  Level 1: Static HTML with dynamic points   │
│  → Skip static, walk to dynamic nodes       │
│  → Like element bridge: only refs matter    │
├─────────────────────────────────────────────┤
│  Level 2: Interactive if (condition=true)    │
│  → Children exist in DOM, adopt them        │
│  → Can use compact form (Level 1)           │
├─────────────────────────────────────────────┤
│  Level 3: Interactive if/forEach            │
│  → Need full compiled jay-html as children  │
│  → Must be able to create NEW elements      │
│  → if=false: nothing in DOM, need template  │
│  → forEach: items may be added/removed      │
└─────────────────────────────────────────────┘
```

### Level 1: Static HTML with Dynamic Points

For jay-html with static structure and dynamic bindings:

```html
<div>
    <h1>{title}</h1>
    <div ref="content">{text}</div>
    <p>Static footer</p>
</div>
```

The hydration code only needs to:
1. Find the `<h1>` text node and connect `dynamicText` to it
2. Find the `<div ref="content">` and connect the ref + `dynamicText`
3. Ignore `<p>Static footer</p>` entirely

Compiled hydration (conceptual):

```ts
function hydrate(rootElement: Element, viewState: ViewState) {
    // Walk to dynamic points using server-generated indices
    const h0 = rootElement.querySelector('[data-jay-h="0"]'); // h1's text
    const h1 = rootElement.querySelector('[data-jay-h="1"]'); // ref="content" div
    
    // Connect dynamic text to existing text node
    const dt0 = adoptText(h0.firstChild, (vs) => vs.title);
    // Connect ref + dynamic text
    const dt1 = adoptText(h1.firstChild, (vs) => vs.text);
    
    return { 
        dom: rootElement,
        update: (vs) => { dt0(vs); dt1(vs); },
        mount: () => { /* activate refs */ },
        unmount: () => { /* cleanup */ }
    };
}
```

### Level 2: Interactive `if` (condition is true at SSR time)

When `if="cond"` is true during SSR, the HTML exists in the DOM. The client can adopt it using compact form (Level 1). It does not need the full jay-html template for the true branch since it can walk the existing DOM.

When `if="cond"` becomes false at runtime, the client removes the DOM nodes (same as current behavior).

When `if` flips from false→true, the client needs to create new DOM. This requires the full element creation code for that branch.

**For simplicity**: interactive `if` always includes both:
- Hydration path (adopt existing DOM when condition matches SSR)  
- Creation path (create new DOM when condition changes)

### Level 3: Interactive `forEach`

forEach items exist in the DOM at SSR time. The client must:
1. Adopt existing items (hydrate each)
2. Be able to create new items (when data changes)
3. Remove items (when data shrinks)

This means forEach children need:
- **Hydration template**: to connect to existing DOM items
- **Creation template**: to create new items (same as current `element()` code)

### Compiler Output: `generated-element-hydrate.ts`

New compiler target alongside existing ones:

| Target | File | Purpose |
|--------|------|---------|
| element | `generated-element.ts` | Full client DOM creation |
| bridge | `generated-element-bridge.ts` | Sandbox/worker bridge |
| react | `generated-react-element.tsx` | React integration |
| **hydrate** | **`generated-element-hydrate.ts`** | **Adopt server-rendered DOM** |

The hydrate target generates code that:
- Walks existing DOM using data attributes or positional indices
- Connects `dynamicText` to existing text nodes (`adoptText`)
- Connects refs to existing elements
- For interactive `if`: includes both adopt and create paths
- For interactive `forEach`: includes both adopt-item and create-item paths

### Server Markers

The server adds minimal markers to the HTML so hydration can find dynamic nodes:

```html
<div>
    <h1 data-jay-h>Hello World</h1>           <!-- dynamic text -->
    <div data-jay-h ref="content">Some text</div>  <!-- ref + dynamic text -->
    <p>Static footer</p>                        <!-- no marker, skipped -->
</div>
```

Alternative: use positional walking (child index path) instead of data attributes. This avoids polluting the DOM but is more fragile.

**Recommendation**: Use `data-jay-h` markers. They're small, reliable, and can be stripped in production if desired.

### Runtime API Changes

New functions in `@jay-framework/runtime`:

```ts
// Adopt an existing text node instead of creating one
function adoptText<VS>(textNode: Text, accessor: (vs: VS) => string): updateFunc<VS>;

// Adopt an existing element instead of creating one
function adoptElement<VS>(
    element: Element,
    attributes: DynamicAttributes<VS>,
    children: AdoptedChildren<VS>,
    ref?: PrivateRef<VS>
): BaseJayElement<VS>;

// Hydration-aware conditional
function hydrateConditional<VS>(
    condition: (vs: VS) => boolean,
    ssrValue: boolean,               // what the server rendered
    adoptExisting: () => BaseJayElement<VS>,  // hydrate path
    createNew: () => BaseJayElement<VS>,      // creation path (same as current)
    marker: Comment                    // DOM comment marker for position
): BaseJayElement<VS>;

// Hydration-aware forEach  
function hydrateForEach<VS, Item>(
    accessor: (vs: VS) => Item[],
    trackBy: string,
    existingItems: Element[],         // server-rendered items
    adoptItem: (el: Element, item: Item) => BaseJayElement<Item>,
    createItem: (item: Item) => BaseJayElement<Item>,
    marker: Comment
): BaseJayElement<VS>;
```

### ConstructContext Changes

```ts
class ConstructContext {
    // Existing: create from scratch
    static withRootContext(viewState, refManager, elementConstructor): JayElement;
    
    // New: hydrate existing DOM
    static withHydrationContext(
        viewState: VS, 
        refManager: ReferencesManager,
        rootElement: Element,
        hydrateConstructor: (root: Element) => BaseJayElement<VS>
    ): JayElement;
}
```

### Integration with makeCompositeJayComponent

```ts
// Current (client-side render):
const instance = pageComp({ /* props */ });
target.appendChild(instance.element.dom);

// Hydration mode:
const instance = pageComp({ /* props */ }, { hydrate: target });
// No appendChild — DOM already exists
```

## Implementation Plan

### Phase 1: Runtime Hydration Primitives
1. Add `adoptText()` — takes existing Text node, returns update function
2. Add `adoptElement()` — takes existing Element, connects attributes + children
3. Add `ConstructContext.withHydrationContext()`
4. Tests: unit test each primitive with jsdom

### Phase 2: Hydration-Aware Conditional and forEach
1. Add `hydrateConditional()` — uses adopt path on first render, create path on toggle
2. Add `hydrateForEach()` — adopts existing items, creates new items on change
3. Tests: conditional toggle, forEach add/remove after hydration

### Phase 3: Compiler Hydrate Target
1. Add `renderHydrateNode()` in `jay-html-compiler.ts` (similar to `renderElementBridgeNode`)
2. Generate `generated-element-hydrate.ts` files
3. For Level 1: compact form (only dynamic points)
4. For if/forEach: dual mode (adopt + create)
5. Tests: fixture-based, compare output

### Phase 4: Integration with jay-stack
1. Modify `makeCompositeJayComponent` to accept `{ hydrate: Element }` option
2. Modify client script to hydrate instead of create when SSR HTML exists
3. Tests: end-to-end with server-rendered HTML + client hydration

## Examples

### Before (current — full client render)

```ts
// Server sends:
<div id="target"></div>
<script>
  const instance = pageComp({});
  target.appendChild(instance.element.dom);
</script>

// Client creates entire DOM from scratch
```

### After (with hydration)

```ts
// Server sends (Design Log #94):
<div id="target">
  <div>
    <h1 data-jay-h>Hello World</h1>
    <div data-jay-h>Content here</div>
    <p>Static footer</p>
  </div>
</div>
<script>
  import { hydrate } from './generated-element-hydrate';
  const target = document.getElementById('target');
  const instance = hydratePageComp(hydrate, viewState, target.firstElementChild);
  // DOM already exists — no appendChild
</script>
```

## Trade-offs

| Decision | Pro | Con |
|----------|-----|-----|
| Separate compiler target (hydrate) | Clean separation, optimal code | More compiler complexity, another file to generate |
| data-jay-h markers | Reliable DOM finding | Slight HTML size increase |
| Always include create path for if/forEach | Simpler, always works | Larger bundle for if=true-only cases |
| Compact form for static + dynamic | Minimal hydration code, fast startup | Need to handle edge cases in walking |

## Verification Criteria

1. **No DOM recreation**: Hydrated page reuses server-rendered DOM nodes (verify via DOM node identity)
2. **Reactive updates work**: After hydration, ViewState changes update the DOM correctly
3. **Refs work**: Event handlers attached via refs fire correctly after hydration
4. **Conditional toggle**: `if` that was true at SSR can toggle to false and back
5. **forEach mutation**: Items rendered by server can be added/removed/reordered
6. **No flash**: Page doesn't flash or re-layout during hydration
7. **Bundle size**: Hydration-only components are smaller than full-render components (no createElement calls for static structure)
