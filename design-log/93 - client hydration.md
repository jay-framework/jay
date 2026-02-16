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
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () => {
            // Standalone adopt functions — read ConstructContext from the stack
            // just like element(), dynamicText(), etc.
            adoptText("0", (vs) => vs.title);               // h1 (auto-index)
            adoptText("content", (vs) => vs.text, refContent()); // div ref="content"
        });
    
    return [refManager.getPublicAPI(), render];
}
```

`withHydrationRootContext` does one `querySelectorAll('[jay-coordinate]')` to build a coordinate→element map, stores it on the `ConstructContext`, then pushes that context onto the stack. The standalone `adoptText` / `adoptElement` functions call `currentConstructionContext()` to access the map — same pattern as `element()`, `dynamicText()`, etc.

This means Level 3 code (creating elements via `generated-element.ts`) works without any changes — the `ConstructContext` is already on the stack, so `element()`, `dynamicText()`, `conditional()`, `forEach()` all work as usual.

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
- Uses `ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, callback)` — one `querySelectorAll` upfront, context pushed onto the stack
- Calls standalone `adoptText(coordinate, accessor, ref?)` for dynamic text nodes
- Calls standalone `adoptElement(coordinate, attributes, children, ref?)` for dynamic elements
- Calls standalone `hydrateConditional(...)` for interactive `if=true` (Level 2) — adopt path only
- Uses existing `conditional()` from `generated-element.ts` for interactive `if=false` (Level 3) — no new function needed; creation code works because `ConstructContext` is on the stack
- Calls standalone `hydrateForEach(...)` for interactive forEach — adopts existing items + imports item creation from `generated-element.ts`

### Server Markers: Coordinate-Based Attributes

The server adds `jay-coordinate` attributes to dynamic elements. The coordinate value mirrors the runtime coordinate system from `ConstructContext` (see Design Log #91 for coordinate usage in WebMCP automation):

- **Ref elements**: `jay-coordinate="refName"` (or `jay-coordinate="trackByKey/refName"` inside forEach)
- **Dynamic elements without ref**: `jay-coordinate="0"`, `jay-coordinate="1"` (auto-index within scope)
- **Container elements**: elements that wrap interactive forEach or conditional children get auto-index coordinates — needed so hydration can find them and set up `Kindergarten` groups
- **forEach items**: `jay-coordinate="trackByKey"` on the item wrapper, establishing a coordinate scope
- **Nested forEach**: coordinates chain: `jay-coordinate="parentKey/childKey/refName"`

```html
<div>
    <h1 jay-coordinate="0">Hello World</h1>                      <!-- dynamic text, auto-index 0 -->
    <div jay-coordinate="content">Some text</div>                 <!-- ref="content" -->
    <p>Static footer</p>                                           <!-- no marker, skipped -->
    <div jay-coordinate="details">Details here</div>              <!-- interactive if, SSR=true -->
    <ul jay-coordinate="1">                                        <!-- forEach container, auto-index -->
        <li jay-coordinate="item-1">
            <span jay-coordinate="item-1/0">Widget</span>         <!-- auto-index 0 inside item -->
            <button jay-coordinate="item-1/addBtn">Add</button>   <!-- ref inside forEach -->
        </li>
        <li jay-coordinate="item-2">
            <span jay-coordinate="item-2/0">Gadget</span>
            <button jay-coordinate="item-2/addBtn">Add</button>
        </li>
    </ul>
</div>
```

No comment boundaries are needed. The runtime's `Kindergarten` class handles DOM positioning through **offset counting** — each dynamic child gets a `KindergartenGroup`, and `getOffsetFor()` computes the insertion position by summing `children.size` of preceding groups. This works for:
- **if=true**: element adopted into its group (size=1). On toggle to false, `removeNode` sets size=0.
- **if=false**: group starts empty (size=0). On toggle to true, `ensureNode` inserts at the correct offset.
- **forEach**: items tracked in their group. New items use offset counting for correct placement.

**Kindergarten group setup during hydration**: The current `dynamicElement` creates Kindergarten groups for ALL children — including static ones — so offset counting is correct. Hydration must match this: for each container element (`de()` in compiled code), the hydration code must create groups for static siblings too (pre-populated with existing DOM nodes by child index). This ensures offsets remain correct when conditionals toggle or forEach items change post-hydration.

The client builds a coordinate→element map via `querySelectorAll('[jay-coordinate]')`, then resolves each dynamic node by its coordinate path. This is the same coordinate structure used by the automation API (`getInteraction(["item-1", "addBtn"])`).

### Runtime API Changes

#### Extending ConstructContext

The existing `ConstructContext` is extended with an optional coordinate map for hydration mode:

```ts
class ConstructContext<ViewState> {
    // Existing fields
    private readonly data: ViewState;
    public readonly forStaticElements: boolean;
    private readonly coordinateBase: Coordinate;
    
    // New: optional coordinate map for hydration mode
    private readonly coordinateMap?: Map<string, Element>;
    private readonly rootElement?: Element;
    
    // Existing methods (unchanged)
    get currData(): ViewState;
    get dataIds(): Coordinate;
    coordinate(refName: string): Coordinate;
    forItem<ChildVS>(childViewState: ChildVS, id: string): ConstructContext<ChildVS>;
    forAsync<ChildVS>(childViewState: ChildVS): ConstructContext<ChildVS>;
    
    // New: resolve an element by coordinate key from the map
    resolveCoordinate(key: string): Element | undefined;
    
    // New: whether this context is in hydration mode
    get isHydrating(): boolean;
    
    // Existing: create from scratch
    static withRootContext(viewState, refManager, elementConstructor): JayElement;
    
    // New: hydrate existing DOM — builds coordinate map, pushes context onto stack
    static withHydrationRootContext<VS, Refs>(
        viewState: VS,
        refManager: ReferencesManager,
        rootElement: Element,
        hydrateConstructor: () => void,
    ): JayElement<VS, Refs>;
}
```

`withHydrationRootContext`:
1. Does `rootElement.querySelectorAll('[jay-coordinate]')` once → `Map<string, Element>`
2. Creates a `ConstructContext` with the coordinate map
3. Pushes it onto the context stack via `withContext(CONSTRUCTION_CONTEXT_MARKER, ...)`
4. Calls the `hydrateConstructor` callback
5. Returns the hydrated `JayElement` (using `rootElement` as `.dom`)

The `forItem()` method propagates the coordinate map to child contexts. The child context's `resolveCoordinate` scopes lookups by the `coordinateBase` prefix — e.g., inside a forEach item with trackBy `"item-1"`, `resolveCoordinate("addBtn")` resolves to the element with `jay-coordinate="item-1/addBtn"`.

#### Standalone Adopt Functions

New standalone functions, same pattern as `element()`, `dynamicText()`, `conditional()`, `forEach()`:

```ts
// Adopt a text node inside the element at the given coordinate.
// Reads ConstructContext from the stack to resolve coordinate → element.
function adoptText<VS>(
    coordinate: string,
    accessor: (vs: VS) => string,
    ref?: PrivateRef<VS>,
): BaseJayElement<VS>;

// Adopt the element at the given coordinate with dynamic attributes/children.
function adoptElement<VS>(
    coordinate: string,
    attributes: DynamicAttributes<VS>,
    children: AdoptedChildren<VS>,
    ref?: PrivateRef<VS>,
): BaseJayElement<VS>;

// Hydration-aware conditional — for if=true at SSR time (Level 2).
// Adopts existing DOM. No creation code — Jay retains element on toggle.
// No marker parameter — Kindergarten offset counting handles positioning.
function hydrateConditional<VS>(
    condition: (vs: VS) => boolean,
    adoptExisting: () => BaseJayElement<VS>,
): BaseJayElement<VS>;

// Hydration-aware conditional — for if=false at SSR time (Level 3).
// Nothing in DOM. Uses regular conditional() from generated-element.ts.
// (This is just the existing conditional() — no new function needed.)

// Hydration-aware forEach.
// Adopts existing items, creates new items via regular forEach item creator.
function hydrateForEach<VS, Item>(
    accessor: (vs: VS) => Item[],
    trackBy: string,
    adoptItem: () => BaseJayElement<Item>,  // called per existing item (hydrate)
    createItem: () => BaseJayElement<Item>, // called per new item (from generated-element.ts)
): BaseJayElement<VS>;
```

All of these call `currentConstructionContext()` internally — they're just like `element()` and `dynamicText()` but instead of creating DOM, they adopt existing nodes from the coordinate map.

#### Why this works for Level 3

When Level 3 needs to create new elements (if=false toggles to true, or forEach adds items), it calls regular `element()`, `dynamicText()`, `conditional()`, `forEach()` from `generated-element.ts`. These functions call `currentConstructionContext()` and find the same `ConstructContext` on the stack — they work without any changes. The context is in hydration mode, but the creation functions don't care — they always create new DOM nodes regardless.

```
generated-element-hydrate.ts:
  withHydrationRootContext(viewState, refManager, rootElement, () => {
      adoptText("0", (vs) => vs.title);       // ← reads from coordinate map
      adoptElement("1", {}, [                  // ← adopt <ul> container (auto-index)
          hydrateForEach(
              (vs) => vs.items,
              'id',
              () => { adoptText("0", ...); },  // ← adopt existing items
              () => { e('li', {}, [dt(...)]); },// ← create new items (regular element/dt!)
          ),
      ]);
  });
```

Both `adoptText` and `element` call `currentConstructionContext()`. The context stack manages scoping for forEach items via `forItem()`, just as it does today.

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

### Phase 1: Extend ConstructContext + Adopt Primitives
1. Extend `ConstructContext` with optional `coordinateMap` and `rootElement` fields
2. Add `ConstructContext.withHydrationRootContext()` — builds map, pushes context onto stack
3. Add `resolveCoordinate(key)` — scoped lookup by coordinateBase prefix
4. Ensure `forItem()` propagates the coordinate map to child contexts
5. Add standalone `adoptText(coordinate, accessor, ref?)` — reads context from stack
6. Add standalone `adoptElement(coordinate, attributes, children, ref?)` — reads context from stack
7. Tests: #1–#15, #34–#38 from test plan

### Phase 2: Hydration-Aware Conditional and forEach
1. Add standalone `hydrateConditional()` — for if=true at SSR: adopt only, no creation code
2. For if=false at SSR: use existing `conditional()` from generated-element.ts (no new function)
3. Add standalone `hydrateForEach()` — adopt existing items, create new items via regular `element()` / `dynamicText()`
4. Tests: #16–#33 from test plan

### Phase 3: Compiler Hydrate Target
1. Add `renderHydrateNode()` in `jay-html-compiler.ts` (similar to `renderElementBridgeNode`)
2. Add `generateElementHydrateFile()` in compiler
3. Add `readFixtureElementHydrateFile()` and `readFileAndGenerateElementHydrateFile()` test utilities
4. Generate `generated-element-hydrate.ts` golden files for existing fixtures
5. For Level 1 (static + dynamic): compact form with coordinate lookups
6. For Level 2 (if=true): `hydrateConditional` — adopt path only
7. For Level 3 (if=false, forEach): import element creation from `generated-element.ts`
8. Tests: #C1–#C27 from compiler test plan (fixture-based, compare output)

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

## Test Plan

### A. Runtime Tests

Tests live in `packages/runtime/runtime/test/hydration/`. All use jsdom to simulate server-rendered HTML.

### adoptText tests (`adopt-text.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 1 | adopts existing text node | `adoptText("0", ...)` resolves coordinate from `ConstructContext`, connects to existing text node; verify node identity unchanged |
| 2 | updates text on ViewState change | After adoption, ViewState update changes the text content |
| 3 | handles empty string | `adoptText` with accessor returning `""` sets `textContent` to empty |
| 4 | handles special characters | HTML entities in text don't get double-escaped after adoption |
| 5 | works with ref binding | `adoptText("refName", accessor, ref)` registers the element on the ref manager |

### adoptElement tests (`adopt-element.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 6 | adopts existing element | `adoptElement("refName", ...)` — the resulting element's `.dom` is the same node (identity check) |
| 7 | connects dynamic attributes | After adoption, attribute bindings update on ViewState change (e.g., `class`, `style`) |
| 8 | connects dynamic children | Adopted element's dynamic text children update on ViewState change |
| 9 | attaches ref | `adoptElement` with ref makes the element accessible via `refManager.getPublicAPI()` |
| 10 | mount/unmount lifecycle | Calling `mount()` activates reactive updates; `unmount()` deactivates them |
| 11 | adopts element with static + dynamic children | Mix of static text and dynamic text children; only dynamic ones update |

### withHydrationRootContext / ConstructContext tests (`hydration-context.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 12 | builds coordinate map from root | `withHydrationRootContext` does one `querySelectorAll`, builds coordinate map on `ConstructContext` |
| 13 | returns JayElement with original root DOM | `.dom` is the same root element passed to `withHydrationRootContext` |
| 14 | ref manager is applied | Refs passed via adopt calls are accessible on the returned element |
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
| 21 | no element in DOM initially | Nothing adopted; Kindergarten group starts empty (size=0) |
| 22 | creates element when condition becomes true | Uses imported `createElement` from generated-element.ts |
| 23 | created element is functional | Dynamic text, attributes, and refs work on the newly created element |
| 24 | toggles work after creation | true→false→true cycle works; element is retained, not recreated |

### hydrateForEach tests (`hydrate-for-each.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 25 | adopts all existing items | `hydrateForEach` — all server-rendered items adopted; node identity preserved via `ConstructContext.forItem` scoping |
| 26 | item dynamic content updates | Text inside each adopted item updates on ViewState change |
| 27 | item refs work | Refs inside forEach items are accessible with correct coordinates |
| 28 | add new item | Appending to the array creates a new item via imported `createItem` |
| 29 | remove existing item | Removing from the array removes the adopted DOM node |
| 30 | reorder items | Changing array order moves DOM nodes (verify via trackBy) |
| 31 | mixed adopt and create | Existing items adopted, new items created in same update |
| 32 | empty initial list then add | Server rendered 0 items; adding items creates them fresh |
| 33 | nested forEach | Inner `hydrateForEach` inside outer, `ConstructContext.forItem` creates nested scopes |

### Coordinate resolution tests (`coordinate-resolution.test.ts`)

Tests for coordinate → element resolution via `ConstructContext.resolveCoordinate`.

| # | Test | Description |
|---|------|-------------|
| 34 | finds element by ref coordinate | `adoptText("refName", ...)` resolves via `resolveCoordinate` from context |
| 35 | finds element by auto-index | `adoptText("0", ...)` resolves for elements without refs |
| 36 | finds element in forEach scope | Inside `forItem("item-1")` context, `adoptText("refName", ...)` resolves `"item-1/refName"` |
| 37 | finds element in nested forEach | Nested `forItem("parent-1").forItem("child-2")`, `adoptText("refName", ...)` resolves `"parent-1/child-2/refName"` |
| 38 | handles missing coordinate gracefully | Adopt call for missing coordinate logs warning in dev mode, does not throw |

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

---

### B. Compiler Tests

Tests live in `packages/compiler/compiler-jay-html/test/jay-target/generate-element-hydrate.test.ts`. Follow the existing fixture-based pattern: parse jay-html → generate hydrate file → prettify → compare against golden `generated-element-hydrate.ts` file in fixture directory.

Each fixture directory gets a new `generated-element-hydrate.ts` golden file alongside existing `generated-element.ts` and `generated-element-bridge.ts`.

#### Test utilities additions (`test-utils/file-utils.ts`)

- `readFixtureElementHydrateFile(folder)` — reads `generated-element-hydrate.ts` from fixture
- `readFileAndGenerateElementHydrateFile(folder)` — parse + generate hydrate file

#### Basics (`generate-element-hydrate.test.ts` → `describe('basics')`)

| # | Fixture | Description |
|---|---------|-------------|
| C1 | `basics/simple-dynamic-text` | Single dynamic text — `adoptText("0", ...)` |
| C2 | `basics/simple-static-text` | Fully static — hydrate file is minimal (no adopt calls) |
| C3 | `basics/empty-element` | Empty element — trivial hydrate |
| C4 | `basics/refs` | Three refs (incl. nested) — `adoptElement` with ref bindings; static wrappers skipped (compact form like element bridge) |
| C5 | `basics/composite` | Nested divs with dynamic text — only dynamic points get `adoptText` calls |
| C6 | `basics/composite 2` | More complex nesting — verifies coordinate auto-indexing |
| C7 | `basics/attributes` | Dynamic attributes — `adoptElement` connects attribute bindings |
| C8 | `basics/style-bindings` | Dynamic style bindings — `adoptElement` with style updates |
| C9 | `basics/data-types` | Various ViewState types — accessors in `adoptText` handle different types |

#### Conditions (`describe('conditions')`)

| # | Fixture | Description |
|---|---------|-------------|
| C10 | `conditions/conditions` | Basic if/else — `hydrateConditional` for true branch, regular `conditional()` for false branch |
| C11 | `conditions/conditions-with-refs` | Conditional with refs — ref binding inside `hydrateConditional` adopt path |
| C12 | `conditions/conditions-with-repeated-ref` | Same ref name in if/else branches — correct ref wiring per branch |
| C13 | `conditions/conditions-with-enum` | Enum-based conditions — multiple conditional hydrations |

#### Collections (`describe('collections')`)

| # | Fixture | Description |
|---|---------|-------------|
| C14 | `collections/collections` | Basic forEach — `hydrateForEach` with adopt + create import from generated-element.ts |
| C15 | `collections/collection-with-refs` | forEach with refs — `forItem` scoping via `ConstructContext`, ref accessible per item |
| C16 | `collections/collection-with-repeating-refs` | Repeated refs in forEach — each item gets own ref instance via coordinate |
| C17 | `collections/collections-with-conditions` | forEach + if inside — nested `hydrateConditional` inside `hydrateForEach` adopt path |
| C18 | `collections/nested-arrays-with-students` | Nested forEach — inner `hydrateForEach` inside outer, compound coordinate scoping via `ConstructContext` |
| C19 | `collections/nested-collection-with-refs` | Nested forEach with refs — deep coordinate paths |
| C20 | `collections/slow-for-each` | Pre-rendered slow arrays — hydrate items that were unrolled at slow phase |

#### Components (`describe('components')`)

| # | Fixture | Description |
|---|---------|-------------|
| C21 | `components/counter` | Child component — hydrate generates `childComp` with hydration option |
| C22 | `components/component-in-component` | Nested components — recursive hydration through component boundary |

#### Linked contracts / headless (`describe('linked contract')`)

| # | Fixture | Description |
|---|---------|-------------|
| C23 | `html-with-contract-ref` (existing fixture) | Linked contract — hydrate respects contract-level phase annotations |
| C24 | headless instance in forEach | Headless component inside forEach — hydrate items that include headless rendering |

#### Structural verification (`describe('structure')`)

| # | Test | Description |
|---|------|-------------|
| C25 | hydrate file imports from generated-element.ts | Verify that Level 3 cases (if=false, forEach create) import the element creation functions from generated-element.ts |
| C26 | hydrate file does not import document.createElement for Level 1/2 | Verify compact form: Level 1/2 only imports `adoptText`/`adoptElement`/`hydrateConditional` — no `element as e` |
| C27 | jay-coordinate values match between server and hydrate | Verify the coordinates used in generated-element-hydrate.ts match those emitted by the server renderer (Design Log #94) |
