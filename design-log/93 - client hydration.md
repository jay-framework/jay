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
    
    const render = (viewState: ViewState) => {
        // One querySelectorAll upfront — builds coordinate → element map
        const h = hydrateRoot(viewState, refManager, rootElement);
        
        // Adopt by coordinate key — compact, one call per dynamic node
        h.adoptText("0", (vs) => vs.title);               // h1 (auto-index)
        h.adoptText("content", (vs) => vs.text, refContent()); // div ref="content"
        
        return h.element();  // returns JayElement with dom, update, mount, unmount
    };
    
    return [refManager.getPublicAPI(), render];
}
```

`hydrateRoot` does one `querySelectorAll('[jay-coordinate]')` to build a `Map<string, Element>`. Each `h.adoptText` / `h.adoptElement` call is just a map lookup + wiring. No repeated DOM queries.

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
- Creates a `HydrationContext` via `hydrateRoot(viewState, refManager, rootElement)` — one `querySelectorAll` upfront
- Calls `h.adoptText(coordinate, accessor, ref?)` for dynamic text nodes
- Calls `h.adoptElement(coordinate, attributes, children, ref?)` for dynamic elements
- Calls `h.hydrateConditional(...)` for interactive `if=true` (Level 2) — adopt path only, no creation code
- Calls `h.hydrateConditionalEmpty(...)` for interactive `if=false` (Level 3) — imports element creation from `generated-element.ts`
- Calls `h.hydrateForEach(...)` for interactive forEach — adopts existing items + imports item creation from `generated-element.ts`

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

New `HydrationContext` class in `@jay-framework/runtime`:

```ts
/**
 * Central hydration context. Created via hydrateRoot().
 * Resolves all jay-coordinate elements in one querySelectorAll,
 * then provides adopt methods keyed by coordinate string.
 */
class HydrationContext<VS> {
    // Built internally by hydrateRoot — holds coordinate → Element map
    
    /** Adopt a text node inside the element at the given coordinate */
    adoptText(coordinate: string, accessor: (vs: VS) => string, ref?: PrivateRef<VS>): void;
    
    /** Adopt the element at the given coordinate with dynamic attributes/children */
    adoptElement(
        coordinate: string,
        attributes: DynamicAttributes<VS>,
        children: AdoptedChildren<VS>,
        ref?: PrivateRef<VS>,
    ): void;
    
    /** Create a scoped HydrationContext for a forEach item */
    forItem<ChildVS>(coordinatePrefix: string, childViewState: ChildVS): HydrationContext<ChildVS>;
    
    /** Hydration-aware conditional — for if=true at SSR time (Level 2)
     *  Adopts existing DOM. No creation code — Jay retains element on toggle. */
    hydrateConditional(
        condition: (vs: VS) => boolean,
        adoptExisting: (h: HydrationContext<VS>) => void,
        marker: Comment,
    ): void;
    
    /** Hydration-aware conditional — for if=false at SSR time (Level 3)
     *  Nothing in DOM, must create element on first true.
     *  Uses element creation code imported from generated-element.ts. */
    hydrateConditionalEmpty(
        condition: (vs: VS) => boolean,
        createElement: () => BaseJayElement<VS>,
        marker: Comment,
    ): void;
    
    /** Hydration-aware forEach.
     *  Adopts existing items, creates new items via generated-element.ts logic. */
    hydrateForEach<Item>(
        accessor: (vs: VS) => Item[],
        trackBy: string,
        adoptItem: (h: HydrationContext<Item>) => void,
        createItem: (item: Item) => BaseJayElement<Item>,
    ): void;
    
    /** Finalize and return the hydrated JayElement */
    element(): JayElement<VS, any>;
}

/** Create a HydrationContext — one querySelectorAll, then adopt by key */
function hydrateRoot<VS>(
    viewState: VS,
    refManager: ReferencesManager,
    rootElement: Element,
): HydrationContext<VS>;
```

Key design choices:
- **One DOM traversal**: `hydrateRoot` does `querySelectorAll('[jay-coordinate]')` once, builds a `Map<string, Element>`
- **Adopt by key**: each `h.adoptText("coordinate", ...)` is a map lookup — no repeated DOM queries
- **Scoped contexts**: `h.forItem(prefix, childVS)` creates a child context that filters the map by prefix — used inside forEach
- **Conditional/forEach on context**: `h.hydrateConditional(...)` and `h.hydrateForEach(...)` are methods on the context, keeping the generated code compact

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

### Phase 1: Runtime HydrationContext and Primitives
1. Add `HydrationContext` class with coordinate map built from `querySelectorAll`
2. Add `hydrateRoot(viewState, refManager, rootElement)` factory
3. Add `h.adoptText(coordinate, accessor, ref?)` — map lookup + text node wiring
4. Add `h.adoptElement(coordinate, attributes, children, ref?)` — map lookup + element wiring
5. Add `h.forItem(prefix, childVS)` — scoped child context for forEach items
6. Add `h.element()` — finalize and return `JayElement`
7. Tests: #1–#15, #34–#38 from test plan

### Phase 2: Hydration-Aware Conditional and forEach
1. Add `h.hydrateConditional()` — for if=true at SSR: adopt only, no creation code
2. Add `h.hydrateConditionalEmpty()` — for if=false at SSR: creation via generated-element.ts
3. Add `h.hydrateForEach()` — adopt existing items, create new items via generated-element.ts
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

### h.adoptText tests (`adopt-text.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 1 | adopts existing text node | `h.adoptText("0", ...)` connects to the text node inside the element at coordinate "0"; verify node identity unchanged |
| 2 | updates text on ViewState change | After adoption, ViewState update changes the text content |
| 3 | handles empty string | `h.adoptText` with accessor returning `""` sets `textContent` to empty |
| 4 | handles special characters | HTML entities in text don't get double-escaped after adoption |
| 5 | works with ref binding | `h.adoptText("refName", accessor, ref)` registers the element on the ref manager |

### h.adoptElement tests (`adopt-element.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 6 | adopts existing element | `h.adoptElement("refName", ...)` — the resulting element's `.dom` is the same node (identity check) |
| 7 | connects dynamic attributes | After adoption, attribute bindings update on ViewState change (e.g., `class`, `style`) |
| 8 | connects dynamic children | Adopted element's dynamic text children update on ViewState change |
| 9 | attaches ref | `h.adoptElement` with ref makes the element accessible via `refManager.getPublicAPI()` |
| 10 | mount/unmount lifecycle | Calling `mount()` activates reactive updates; `unmount()` deactivates them |
| 11 | adopts element with static + dynamic children | Mix of static text and dynamic text children; only dynamic ones update |

### hydrateRoot / HydrationContext tests (`hydration-context.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 12 | builds coordinate map from root | `hydrateRoot` does one `querySelectorAll`, builds `Map<string, Element>` with all `jay-coordinate` elements |
| 13 | h.element() returns JayElement with original root DOM | `.dom` is the same root element passed to `hydrateRoot` |
| 14 | ref manager is applied | Refs passed via adopt calls are accessible on the returned element |
| 15 | ViewState updates propagate | After hydration, updating ViewState changes text/attributes in the adopted DOM |

### h.hydrateConditional tests (if=true at SSR) (`hydrate-conditional.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 16 | adopts existing element when condition=true | Element exists in DOM, `h.hydrateConditional` adopts it, node identity preserved |
| 17 | hides element when condition toggles to false | After adoption, setting condition=false hides/removes the element |
| 18 | shows element when condition toggles back to true | Element reappears — same node, not recreated |
| 19 | dynamic content updates while visible | Text/attributes inside conditional element update on ViewState change |
| 20 | ref works inside conditional | Ref on the conditional element is accessible and fires events |

### h.hydrateConditionalEmpty tests (if=false at SSR) (`hydrate-conditional-empty.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 21 | no element in DOM initially | Nothing adopted; marker comment exists in DOM |
| 22 | creates element when condition becomes true | Uses imported `createElement` from generated-element.ts |
| 23 | created element is functional | Dynamic text, attributes, and refs work on the newly created element |
| 24 | toggles work after creation | true→false→true cycle works; element is retained, not recreated |

### h.hydrateForEach tests (`hydrate-for-each.test.ts`)

| # | Test | Description |
|---|------|-------------|
| 25 | adopts all existing items | `h.hydrateForEach` — all server-rendered items adopted; node identity preserved via `h.forItem` scoping |
| 26 | item dynamic content updates | Text inside each adopted item updates on ViewState change |
| 27 | item refs work | Refs inside forEach items are accessible with correct coordinates |
| 28 | add new item | Appending to the array creates a new item via imported `createItem` |
| 29 | remove existing item | Removing from the array removes the adopted DOM node |
| 30 | reorder items | Changing array order moves DOM nodes (verify via trackBy) |
| 31 | mixed adopt and create | Existing items adopted, new items created in same update |
| 32 | empty initial list then add | Server rendered 0 items; adding items creates them fresh |
| 33 | nested forEach | Inner `h.hydrateForEach` inside outer, `h.forItem` creates nested scopes |

### Coordinate map tests (`coordinate-map.test.ts`)

Tests for the coordinate → element map built by `hydrateRoot`.

| # | Test | Description |
|---|------|-------------|
| 34 | finds element by ref coordinate | `h.adoptText("refName", ...)` resolves correctly from map |
| 35 | finds element by auto-index | `h.adoptText("0", ...)` resolves for elements without refs |
| 36 | finds element in forEach scope | `h.forItem("item-1").adoptText("refName", ...)` resolves compound coordinate |
| 37 | finds element in nested forEach | `h.forItem("parent-1").forItem("child-2").adoptText("refName", ...)` works |
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
| C1 | `basics/simple-dynamic-text` | Single dynamic text — `h.adoptText("0", ...)` |
| C2 | `basics/simple-static-text` | Fully static — hydrate file is minimal (no adopt calls) |
| C3 | `basics/empty-element` | Empty element — trivial hydrate |
| C4 | `basics/refs` | Three refs (incl. nested) — `h.adoptElement` with ref bindings; static wrappers skipped (compact form like element bridge) |
| C5 | `basics/composite` | Nested divs with dynamic text — only dynamic points get `h.adoptText` calls |
| C6 | `basics/composite 2` | More complex nesting — verifies coordinate auto-indexing |
| C7 | `basics/attributes` | Dynamic attributes — `h.adoptElement` connects attribute bindings |
| C8 | `basics/style-bindings` | Dynamic style bindings — `h.adoptElement` with style updates |
| C9 | `basics/data-types` | Various ViewState types — accessors in `h.adoptText` handle different types |

#### Conditions (`describe('conditions')`)

| # | Fixture | Description |
|---|---------|-------------|
| C10 | `conditions/conditions` | Basic if/else — `h.hydrateConditional` for true branch, `h.hydrateConditionalEmpty` for false branch |
| C11 | `conditions/conditions-with-refs` | Conditional with refs — ref binding inside `h.hydrateConditional` adopt path |
| C12 | `conditions/conditions-with-repeated-ref` | Same ref name in if/else branches — correct ref wiring per branch |
| C13 | `conditions/conditions-with-enum` | Enum-based conditions — multiple conditional hydrations |

#### Collections (`describe('collections')`)

| # | Fixture | Description |
|---|---------|-------------|
| C14 | `collections/collections` | Basic forEach — `h.hydrateForEach` with adopt + create import from generated-element.ts |
| C15 | `collections/collection-with-refs` | forEach with refs — `h.forItem` scoping, ref accessible per item |
| C16 | `collections/collection-with-repeating-refs` | Repeated refs in forEach — each item gets own ref instance via coordinate |
| C17 | `collections/collections-with-conditions` | forEach + if inside — nested `h.hydrateConditional` inside `h.hydrateForEach` adopt path |
| C18 | `collections/nested-arrays-with-students` | Nested forEach — inner `h.hydrateForEach` inside outer, `h.forItem` compound scoping |
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
| C26 | hydrate file does not import document.createElement | Verify compact form: no `element as e` import, only `hydrateRoot` and `HydrationContext` methods |
| C27 | jay-coordinate values match between server and hydrate | Verify the coordinates used in generated-element-hydrate.ts match those emitted by the server renderer (Design Log #94) |
