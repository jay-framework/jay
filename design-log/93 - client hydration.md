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

**A:** Use a coordinate-based attribute: `jay-coordinate="trackByKey/refName"` or `jay-coordinate="trackByKey/index"`. This reuses the existing coordinate system from `ConstructContext` (see Design Log #91 for coordinate usage in automation). Coordinates mark each nested level with a path based on forEach element trackBy keys. Elements with refs use the ref name as the final segment. Elements without refs that still need hydration (e.g., a `<h1>` with dynamic text) use an auto-generated index within the current coordinate scope. The client uses `querySelectorAll('[jay-coordinate]')` to build a lookup map, then resolves each dynamic node by its coordinate path.

### Q2: What's the hydration compilation target?
Similar to how the compiler has `generated-element.ts` (full DOM) and `generated-element-bridge.ts` (sandbox), we need a `generated-element-hydrate.ts` (or a mode flag) that only connects to existing DOM.

**A:** Yes, a separate `generated-element-hydrate.ts` target. However, for Level 3 (interactive forEach and if=false), the hydration code should reuse the same element creation logic from `generated-element.ts` rather than duplicating it. The hydrate file imports from the element file for creation paths.

### Q3: Should hydration be a separate compiler target or a runtime mode?
A separate compiler target is cleaner — the hydration code is structurally different from creation code (no `document.createElement` calls). It's closer to the element bridge pattern.

**A:** Confirmed — separate compiler target.

### Q4: How do we handle the "mismatch" case where server HTML doesn't match client expectations?
For now, we can log warnings in dev mode. In production, mismatches would indicate a bug.

**A:** Confirmed — dev-mode warnings only.

### Q5: Does the component lifecycle change?
`mount()` currently means "start reactive updates." For hydration, it should also mean "connect to DOM." The `makeJayComponent` flow doesn't change much — instead of calling `render(viewState)` which creates DOM, we call `hydrate(viewState, rootElement)` which adopts DOM.

**A:** Confirmed — `mount()` semantics stay the same. Hydration replaces the element construction, not the lifecycle.

## Design

### Principle: Three Levels of Hydration Complexity

```
┌───────────────────────────────────────────────────────────────┐
│  Level 1: Static HTML with dynamic points                     │
│  → Skip static, walk to dynamic nodes via jay-coordinate      │
│  → Like element bridge: only refs/dynamic text matter         │
├───────────────────────────────────────────────────────────────┤
│  Level 2: Interactive if (condition=true at SSR)              │
│  → Children exist in DOM, adopt them (compact form, Level 1)  │
│  → No creation code needed — Jay retains element on toggle    │
├───────────────────────────────────────────────────────────────┤
│  Level 3: Interactive if=false / interactive forEach          │
│  → if=false: nothing in DOM, import creation from             │
│    generated-element.ts                                       │
│  → forEach: adopt existing items + import item creation       │
│    from generated-element.ts for new items                    │
└───────────────────────────────────────────────────────────────┘
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
function hydrate(rootElement: Element, viewState: ViewState): PreRender {
    const [refManager, [refContent]] = ReferencesManager.for(
        options,
        ['content'],
        [], [], [],
    );
    
    const render = (viewState: ViewState) =>
        ConstructContext.withHydrationContext(viewState, refManager, rootElement, (root) => {
            // Find dynamic nodes by coordinate
            const h0 = root.querySelector('[jay-coordinate="0"]');  // h1 (auto-index, no ref)
            const h1 = root.querySelector('[jay-coordinate="content"]');  // div ref="content"
            
            // Adopt dynamic text on existing text nodes
            const dt0 = adoptText(h0.firstChild, (vs) => vs.title);
            const dt1 = adoptText(h1.firstChild, (vs) => vs.text, refContent());
            
            return {
                dom: rootElement,
                update: (vs) => { dt0(vs); dt1(vs); },
                mount: () => { /* activate refs, start reactivity */ },
                unmount: () => { /* cleanup */ }
            };
        });
    
    return [refManager.getPublicAPI(), render];
}
```

### Level 2: Interactive `if` (condition is true at SSR time)

When `if="cond"` is true during SSR, the HTML exists in the DOM. The client can adopt it using compact form (Level 1). It does not need full creation code for the true branch.

Key insight: **Jay's conditional does not recreate elements on toggle.** When `if` goes true→false, Jay hides/retains the element. When it goes false→true, Jay reuses the original element. So:

- `if=true` at SSR: adopt existing DOM. No creation code needed — the element persists across toggles.
- `if=false` at SSR: nothing in DOM. Need full creation code (Level 3). Once created, the element persists across subsequent toggles.

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
- Walks existing DOM using `jay-coordinate` attributes
- Connects `dynamicText` to existing text nodes via `adoptText` (with ref binding when applicable)
- Connects refs to existing elements via `adoptElement`
- For interactive `if=true`: compact adopt path only (Level 2) — no creation code
- For interactive `if=false`: imports element creation from `generated-element.ts` (Level 3)
- For interactive `forEach`: adopts existing items + imports item creation from `generated-element.ts`

### Server Markers: Coordinate-Based Attributes

The server adds `jay-coordinate` attributes to dynamic elements. The coordinate value mirrors the runtime coordinate system from `ConstructContext` (see Design Log #91 for coordinate usage in WebMCP automation):

- **Ref elements**: `jay-coordinate="refName"` (or `jay-coordinate="trackByKey/refName"` inside forEach)
- **Dynamic elements without ref**: `jay-coordinate="0"`, `jay-coordinate="1"` (auto-index within scope)
- **forEach items**: `jay-coordinate="trackByKey"` on the item wrapper, establishing a coordinate scope
- **Nested forEach**: coordinates chain: `jay-coordinate="parentKey/childKey/refName"`

```html
<div>
    <h1 jay-coordinate="0">Hello World</h1>                      <!-- dynamic text, auto-index 0 -->
    <div jay-coordinate="content">Some text</div>                 <!-- ref="content" -->
    <p>Static footer</p>                                           <!-- no marker, skipped -->
    <!--jay-if:0:1-->                                              <!-- interactive if, SSR=true -->
    <div jay-coordinate="details">Details here</div>
    <!--/jay-if:0-->
    <ul>
        <!--jay-each:0-->
        <li jay-coordinate="item-1">
            <span jay-coordinate="item-1/0">Widget</span>         <!-- auto-index 0 inside item -->
            <button jay-coordinate="item-1/addBtn">Add</button>   <!-- ref inside forEach -->
        </li>
        <li jay-coordinate="item-2">
            <span jay-coordinate="item-2/0">Gadget</span>
            <button jay-coordinate="item-2/addBtn">Add</button>
        </li>
        <!--/jay-each:0-->
    </ul>
</div>
```

The client builds a coordinate→element map via `querySelectorAll('[jay-coordinate]')`, then resolves each dynamic node by its coordinate path. This is the same coordinate structure used by the automation API (`getInteraction(["item-1", "addBtn"])`).

### Runtime API Changes

New functions in `@jay-framework/runtime`:

```ts
// Adopt an existing text node instead of creating one
// ref is optional — passed when the parent element has a ref binding
function adoptText<VS>(
    textNode: Text,
    accessor: (vs: VS) => string,
    ref?: PrivateRef<VS>,
): updateFunc<VS>;

// Adopt an existing element instead of creating one
// Connects dynamic attributes, children, and optional ref to the existing DOM node
function adoptElement<VS>(
    element: Element,
    attributes: DynamicAttributes<VS>,
    children: AdoptedChildren<VS>,
    ref?: PrivateRef<VS>,
): BaseJayElement<VS>;

// Hydration-aware conditional — for if=true at SSR time
// Adopts existing DOM (Level 2). No creation code needed — Jay retains
// the element across true→false→true toggles.
function hydrateConditional<VS>(
    condition: (vs: VS) => boolean,
    adoptExisting: () => BaseJayElement<VS>,  // hydrate path (compact, Level 1)
    marker: Comment,                           // DOM comment marker for position
): BaseJayElement<VS>;

// Hydration-aware conditional — for if=false at SSR time (Level 3)
// Nothing in DOM, must create element on first true. Uses element creation
// code from generated-element.ts.
function hydrateConditionalEmpty<VS>(
    condition: (vs: VS) => boolean,
    createElement: () => BaseJayElement<VS>,  // full creation from generated-element.ts
    marker: Comment,
): BaseJayElement<VS>;

// Hydration-aware forEach
// Adopts existing items in DOM, creates new items via generated-element.ts logic
function hydrateForEach<VS, Item>(
    accessor: (vs: VS) => Item[],
    trackBy: string,
    existingItems: Element[],                  // server-rendered items by coordinate
    adoptItem: (el: Element) => BaseJayElement<Item>,  // hydrate existing item
    createItem: (item: Item) => BaseJayElement<Item>,  // from generated-element.ts
    marker: Comment,
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
1. Add `adoptText(textNode, accessor, ref?)` — adopts existing Text node, connects ref
2. Add `adoptElement(element, attributes, children, ref?)` — adopts existing Element
3. Add coordinate resolution utility — `querySelectorAll('[jay-coordinate]')` → Map
4. Add `ConstructContext.withHydrationContext()`
5. Tests: #1–#15, #34–#38 from test plan

### Phase 2: Hydration-Aware Conditional and forEach
1. Add `hydrateConditional()` — for if=true at SSR: adopt only, no creation code
2. Add `hydrateConditionalEmpty()` — for if=false at SSR: creation via generated-element.ts
3. Add `hydrateForEach()` — adopt existing items, create new items via generated-element.ts
4. Tests: #16–#33 from test plan

### Phase 3: Compiler Hydrate Target
1. Add `renderHydrateNode()` in `jay-html-compiler.ts` (similar to `renderElementBridgeNode`)
2. Generate `generated-element-hydrate.ts` files
3. For Level 1 (static + dynamic): compact form with coordinate lookups
4. For Level 2 (if=true): `hydrateConditional` — adopt path only
5. For Level 3 (if=false, forEach): import element creation from `generated-element.ts`
6. Tests: fixture-based, compare output

### Phase 4: Integration with jay-stack
1. Modify `makeCompositeJayComponent` to accept `{ hydrate: Element }` option
2. Modify client script to hydrate instead of create when SSR HTML exists
3. Tests: #39–#46 from test plan

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
    <h1 jay-coordinate="0">Hello World</h1>
    <div jay-coordinate="content">Content here</div>
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
| `jay-coordinate` attributes | Reuses existing coordinate system, reliable, matches automation API | Slight HTML size increase |
| if=true: adopt only, no creation code | Smaller bundle, simpler hydration | Relies on Jay's element retention behavior |
| if=false: import from generated-element.ts | No code duplication, reuses existing target | Hydrate file depends on element file |
| forEach: adopt + import create from element | Handles all cases, no duplication | Two code paths per forEach |
| Compact form for static + dynamic | Minimal hydration code, fast startup | Need to handle edge cases in walking |

## Verification Criteria

1. **No DOM recreation**: Hydrated page reuses server-rendered DOM nodes (verify via DOM node identity)
2. **Reactive updates work**: After hydration, ViewState changes update the DOM correctly
3. **Refs work**: Event handlers attached via refs fire correctly after hydration
4. **Conditional toggle**: `if` that was true at SSR can toggle to false and back
5. **forEach mutation**: Items rendered by server can be added/removed/reordered
6. **No flash**: Page doesn't flash or re-layout during hydration
7. **Bundle size**: Hydration-only components are smaller than full-render components (no createElement calls for static structure)

## Runtime Test Plan

Tests live in `packages/runtime/runtime/test/hydration/`. All use jsdom to simulate server-rendered HTML.

### adoptText tests (`adopt-text.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 1 | adopts existing text node | `adoptText` connects to a pre-existing `Text` node; verify node identity unchanged |
| 2 | updates text on ViewState change | After adoption, calling `update(newVS)` changes the text content |
| 3 | handles empty string | `adoptText` with accessor returning `""` sets `textContent` to empty |
| 4 | handles special characters | HTML entities in text don't get double-escaped after adoption |
| 5 | works with ref binding | `adoptText` with ref parameter registers the parent element on the ref manager |

### adoptElement tests (`adopt-element.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 6 | adopts existing element | `adoptElement` returns a `BaseJayElement` whose `.dom` is the same node (identity check) |
| 7 | connects dynamic attributes | After adoption, attribute bindings update on ViewState change (e.g., `class`, `style`) |
| 8 | connects dynamic children | Adopted element's dynamic text children update on ViewState change |
| 9 | attaches ref | `adoptElement` with ref makes the element accessible via `refManager.getPublicAPI()` |
| 10 | mount/unmount lifecycle | Calling `mount()` activates reactive updates; `unmount()` deactivates them |
| 11 | adopts element with static + dynamic children | Mix of static text and dynamic text children; only dynamic ones update |

### ConstructContext.withHydrationContext tests (`hydration-context.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 12 | creates element from existing DOM | `withHydrationContext` returns a `JayElement` whose `.dom` is the root element |
| 13 | coordinate lookup works | Elements with `jay-coordinate` attributes are found by the hydration constructor |
| 14 | ref manager is applied | Refs declared in the hydration constructor are accessible on the returned element |
| 15 | ViewState updates propagate | After hydration, updating ViewState changes text/attributes in the adopted DOM |

### hydrateConditional tests (if=true at SSR) (`hydrate-conditional.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 16 | adopts existing element when condition=true | Element exists in DOM, `hydrateConditional` adopts it, node identity preserved |
| 17 | hides element when condition toggles to false | After adoption, setting condition=false hides/removes the element |
| 18 | shows element when condition toggles back to true | Element reappears — same node, not recreated |
| 19 | dynamic content updates while visible | Text/attributes inside conditional element update on ViewState change |
| 20 | ref works inside conditional | Ref on the conditional element is accessible and fires events |

### hydrateConditionalEmpty tests (if=false at SSR) (`hydrate-conditional-empty.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 21 | no element in DOM initially | Nothing adopted; marker comment exists in DOM |
| 22 | creates element when condition becomes true | Uses imported `createElement` from generated-element.ts |
| 23 | created element is functional | Dynamic text, attributes, and refs work on the newly created element |
| 24 | toggles work after creation | true→false→true cycle works; element is retained, not recreated |

### hydrateForEach tests (`hydrate-for-each.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 25 | adopts all existing items | All server-rendered forEach items are adopted; node identity preserved for each |
| 26 | item dynamic content updates | Text inside each adopted item updates on ViewState change |
| 27 | item refs work | Refs inside forEach items are accessible with correct coordinates |
| 28 | add new item | Appending to the array creates a new item via imported `createItem` |
| 29 | remove existing item | Removing from the array removes the adopted DOM node |
| 30 | reorder items | Changing array order moves DOM nodes (verify via trackBy) |
| 31 | mixed adopt and create | Existing items adopted, new items created in same update |
| 32 | empty initial list then add | Server rendered 0 items; adding items creates them fresh |
| 33 | nested forEach | Inner forEach items adopted within outer forEach items |

### Coordinate resolution tests (`coordinate-resolution.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 34 | finds element by ref coordinate | `jay-coordinate="refName"` found by coordinate lookup |
| 35 | finds element by auto-index | `jay-coordinate="0"` found for elements without refs |
| 36 | finds element in forEach scope | `jay-coordinate="item-1/refName"` found with compound coordinate |
| 37 | finds element in nested forEach | `jay-coordinate="parent-1/child-2/refName"` works |
| 38 | handles missing coordinate gracefully | Missing element returns null / logs warning in dev mode |

### Integration tests (`hydration-integration.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 39 | full page hydration — static with dynamic text | Server HTML with `jay-coordinate` attrs; hydrate; verify text updates |
| 40 | full page hydration — with refs | Server HTML with refs; hydrate; verify ref events fire |
| 41 | full page hydration — conditional if=true | Hydrate page with visible conditional; toggle; verify |
| 42 | full page hydration — conditional if=false | Hydrate page with hidden conditional; show; verify |
| 43 | full page hydration — forEach | Hydrate page with list; add/remove/reorder items |
| 44 | full page hydration — mixed | Page with refs + conditionals + forEach; hydrate and mutate everything |
| 45 | DOM identity preserved | Compare node references before and after hydration — must be identical |
| 46 | no duplicate event handlers | After hydration, events fire exactly once (not double-bound) |
