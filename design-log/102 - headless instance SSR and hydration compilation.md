# Design Log #102 — Headless Instance SSR and Hydration Compilation

## Background

The compiler has three code generation targets for jay-html files:
- **Element target** (`generated-element.ts`) — client-side DOM creation
- **Server-element target** (`generated-server-element.ts`) — SSR streaming HTML
- **Hydrate target** (`generated-element-hydrate.ts`) — client-side DOM adoption after SSR

Headless component instances (`<jay:contract-name>`) are fully supported in the element target (DL#84, DL#90) but **not implemented** in the server-element or hydrate targets. This means pages with headless instances cannot be server-rendered or hydrated.

The runtime infrastructure is complete — `makeHeadlessInstanceComponent`, `hydrateCompositeJayComponent`, `__headlessInstances` ViewState, and the coordinate system all work. The gap is strictly in the compiler's code generation.

## Current Behavior: Try-Catch Fallback to Client Rendering

The dev-server (`sendResponse()`, line ~810-854) wraps the SSR attempt in a try-catch. When the server-element compiler generates broken code for `<jay:xxx>` tags (treating them as literal HTML), the error is caught and the dev-server falls back to `generateClientScript()` — pure client-side rendering with no SSR.

This means pages with headless instances (like `fake-shop/src/pages/page.jay-html` which uses `product-widget` and `stock-status` instances) **always** fall back to client-only rendering. The runtime infrastructure works (instance discovery, slow/fast phases, `__headlessInstances` ViewState), but the compiled `renderToStream()` function can't handle the `<jay:xxx>` tags.

The fallback is silent except for a warning: `"[SSR] Failed, falling back to client rendering: {error}"`.

## Problem

Five scenarios need support in both server-element and hydrate targets:

1. **Page-level headless component** — old-style `<script type="application/jay-headless">` with `key` (SSR works, hydration missing)
2. **Nested headless instance** — `<jay:product-card productId="prod-hero">` with inline template
3. **Conditional headless instance** — `<jay:product-card if="showPromo">`
4. **forEach headless instance** — `<jay:product-card>` inside `forEach`
5. **slowForEach headless instance** — `<jay:product-card>` inside `slowForEach`

### Current Compiler Gaps

**Server-element target:**
- `ServerContext` has no `headlessContractNames`, `headlessImports`, or `headlessInstanceDefs`
- `renderServerElement()` has no check for `<jay:xxx>` component tags
- A headless instance tag gets treated as literal HTML (`<jay:product-card>`) — broken

**Hydrate target:**
- `HydrateContext` has `headlessContractNames` but `renderHydrateElement()` doesn't distinguish `headless-instance` from `headful`
- Emits `childComp(product-card, ...)` where `product-card` is undefined — broken

## Design

### Key Insight: Server-Element vs Element/Hydrate Divergence

The server-element target is fundamentally different from element and hydrate targets:
- Element/hydrate generate **component definitions** (`makeHeadlessInstanceComponent`) that are instantiated at runtime via `childComp()`
- Server-element generates **streaming HTML** — there are no components, no `childComp()`, no `makeHeadlessInstanceComponent`

For server-element, the headless instance's inline template should be **inlined directly** into the `renderToStream` function. The only change needed is switching the ViewState context from the page's `vs` to the instance's ViewState within `vs.__headlessInstances[coordinate]`.

For the hydrate target, the approach mirrors the element target — generate inline template render functions using hydrate APIs (`adoptElement`, `adoptText`, etc.) plus `makeHeadlessInstanceComponent` definitions and `childComp()` calls.

### Server-Element Target Design

#### ViewState Access Pattern

The `renderToStream(vs, ctx)` function receives the full merged ViewState. The headless instance's data is at `vs.__headlessInstances[coordinateKey]`.

For a headless instance, the compiler needs to:
1. Compute the coordinate key (same logic as element target)
2. Create a local variable for the instance's ViewState
3. Render the inline template children using that local variable
4. Assign coordinates to dynamic elements within the inline template

#### Coordinate Keys

Same as element target:
- **Static instance**: `'product-card:0'` or `'product-card:hero'` (if ref is provided)
- **Inside slowForEach**: `'p1/product-card:0'` (jayTrackBy prefix)
- **Inside forEach**: runtime expression using trackBy value

#### Example: Simple Instance

Input:
```html
<jay:product-card productId="prod-hero">
    <article class="hero-card">
        <h2>{name}</h2>
        <span class="price">{price}</span>
        <button ref="addToCart">Add to Cart</button>
    </article>
</jay:product-card>
```

Server-element output (within `renderToStream`):
```typescript
// Headless instance: product-card (coordinate: product-card:0)
const vs_pc0 = (vs as any).__headlessInstances?.['product-card:0'];
if (vs_pc0) {
    w('<article');
    w(' class="hero-card"');
    w(' jay-coordinate="product-card:0/0">');
    w('<h2');
    w(' jay-coordinate="product-card:0/1">');
    w(escapeHtml(String(vs_pc0.name)));
    w('</h2>');
    w('<span');
    w(' class="price"');
    w(' jay-coordinate="product-card:0/2">');
    w(escapeHtml(String(vs_pc0.price)));
    w('</span>');
    w('<button');
    w(' jay-coordinate="product-card:0/addToCart">');
    w('Add to Cart');
    w('</button>');
    w('</article>');
}
```

The coordinate prefix for all children within the instance is the instance's coordinate key (e.g., `product-card:0/`).

#### Question Q1: Should the instance be wrapped in a guard?

If `vs.__headlessInstances` doesn't contain the key, the instance shouldn't render. Using `if (vs_pc0)` guard handles this. This also means that if the headless component has no slow/fast phases providing data, the instance won't render on the server — which is correct behavior (it would then be created by the hydrate target's create fallback).

**Answer**: yes, wrap in `if (vs_pc0)` guard.

#### Question Q2: What about the `<jay:xxx>` element itself — does it produce a wrapper element?

No. In the element target, `<jay:product-card>` does not produce a DOM element. The inline template children are rendered directly. The `<jay:xxx>` tag is a compiler directive, not an HTML element.

**Answer**: no wrapper element. Inline template children are rendered directly.

#### Question Q3: How do coordinates work inside headless instances?

The inline template is a separate "scope" — its children get their own coordinate counter starting at 0, prefixed by the instance's coordinate key.

For server-element:
- Set `coordinatePrefix` to the instance's coordinate key
- Reset `coordinateCounter` to 0
- Children get coordinates like `product-card:0/0`, `product-card:0/1`, etc.
- Refs use their ref name: `product-card:0/addToCart`

**Answer**: prefix all child coordinates with the instance's coordinate key. Reset counter. This matches how the hydrate target should access them.

#### Question Q4: Do we need imports for contract types in server-element?

For the server-element, we access `vs.__headlessInstances[key]` with a local variable. We need the ViewState type for type safety, but can use `any` cast since server-element is runtime-only. Looking at the existing `page-using-counter` server-element fixture, it imports `CounterViewState` and `IsPositive` from the contract. So yes, import contract types when needed (e.g., for enum comparisons).

For the simple inline template case, the local variable can be typed as the contract's ViewState type.

**Answer**: import contract ViewState types for type safety. Import enum types when used in conditions.

#### Example: forEach Instance

Input:
```html
<div class="grid" forEach="products" trackBy="_id">
    <jay:product-card productId="{_id}">
        <article class="product-tile">
            <h2>{name}</h2>
        </article>
    </jay:product-card>
</div>
```

Server-element output:
```typescript
w('<div');
w(' jay-coordinate="' + coordPrefix + '">');
for (const vs1 of vs.products) {
    w('<div');
    w(' class="grid"');
    w(' jay-coordinate="' + escapeAttr(String(vs1._id)) + '">');
    // Headless instance: product-card (coordinate: dynamic)
    const vs_pc0 = (vs as any).__headlessInstances?.[vs1._id + ',product-card:0'];
    if (vs_pc0) {
        w('<article');
        w(' class="product-tile"');
        w(' jay-coordinate="' + escapeAttr(String(vs1._id)) + '/product-card:0/0">');
        w('<h2');
        w(' jay-coordinate="' + escapeAttr(String(vs1._id)) + '/product-card:0/1">');
        w(escapeHtml(String(vs_pc0.name)));
        w('</h2>');
        w('</article>');
    }
    w('</div>');
}
w('</div>');
```

#### Question Q5: forEach coordinate key format — slash vs comma?

Looking at the runtime code (`headless-instance-context.ts`):
- Static: `'product-card:0'` (string)
- forEach: `(dataIds) => [...dataIds, 'product-card:0'].toString()` — produces `trackByValue,product-card:0`

The comma-separated format comes from `Array.toString()`. The server side (`renderFastChangingDataForForEachInstances`) computes: `[trackByValue, coordinateSuffix].toString()`.

So for forEach, the coordinate key in `__headlessInstances` uses **commas**: `"prod-123,product-card:0"`.

But the `jay-coordinate` attribute for DOM elements uses **slashes** (for the hydration coordinate system). These are two different things:
- `__headlessInstances` key: comma-separated (for data lookup)
- `jay-coordinate` attribute: slash-separated (for DOM walking)

**Answer**: use comma for `__headlessInstances` key lookup, slash for `jay-coordinate` attributes.

#### Example: slowForEach Instance

Input:
```html
<div slowForEach="products" trackBy="_id" jayIndex="0" jayTrackBy="p1">
    <jay:product-card productId="prod-123">
        <article class="hero-card">
            <h2>Product A</h2>
            <span class="price">{price}</span>
        </article>
    </jay:product-card>
</div>
```

Server-element output:
```typescript
// slowForEach item: jayTrackBy="p1"
const vs_pc0 = (vs as any).__headlessInstances?.['p1/product-card:0'];
if (vs_pc0) {
    w('<div');
    w(' jay-coordinate="p1">');
    w('<article');
    w(' class="hero-card"');
    w(' jay-coordinate="p1/product-card:0/0">');
    w('<h2');
    w('>');
    w('Product A');
    w('</h2>');
    w('<span');
    w(' class="price"');
    w(' jay-coordinate="p1/product-card:0/1">');
    w(escapeHtml(String(vs_pc0.price)));
    w('</span>');
    w('</article>');
    w('</div>');
}
```

For slowForEach, the coordinate prefix includes the `jayTrackBy` value: `p1/product-card:0`.

#### Example: Conditional Instance

Input:
```html
<jay:product-card productId="prod-promo" ref="promo" if="showPromo">
    <div class="promo">
        <h3>{name}</h3>
    </div>
</jay:product-card>
```

Server-element output:
```typescript
if (vs.showPromo) {
    const vs_pc1 = (vs as any).__headlessInstances?.['product-card:promo'];
    if (vs_pc1) {
        w('<div');
        w(' class="promo"');
        w(' jay-coordinate="product-card:promo/0">');
        w('<h3');
        w(' jay-coordinate="product-card:promo/1">');
        w(escapeHtml(String(vs_pc1.name)));
        w('</h3>');
        w('</div>');
    }
}
```

The `if` condition on the `<jay:xxx>` tag uses the page's ViewState (not the instance's). The coordinate uses the ref name `promo` instead of a counter.

### Hydrate Target Design

The hydrate target mirrors the element target's structure. It needs:

1. **Inline template hydrate functions** — same pattern as element target but using `adoptElement`/`adoptText`/`hydrateConditional`/`hydrateForEach` instead of `e`/`dt`/`c`/`forEach`
2. **`makeHeadlessInstanceComponent` definitions** — identical to element target
3. **`childComp()` calls** — identical to element target

#### Key Difference from Element Target

The render function body uses hydrate APIs:
- `e('article', ...)` → `adoptElement('coord', ...)`
- `dt((vs) => vs.name)` → `adoptText('coord', (vs) => vs.name)`
- `e('button', ...)` with ref → `adoptElement('addToCart', ...)` with ref

The coordinate values inside the inline template use the same numbering as the server-element target, but WITHOUT the instance coordinate prefix (because the hydrate runs within the instance's component scope, which has its own coordinate map).

#### Question Q6: Coordinate prefix in hydrate — full prefix or relative?

In the element target, `childComp()` creates a new `ConstructContext` for the child component. The hydration equivalent would be `ConstructContext.withHydrationRootContext()` scoped to the instance's coordinate prefix in the DOM.

Looking at how `component-in-component` hydration works: `childComp(Counter, ...)` — the Counter component's hydrate function receives its own root element and manages its own coordinates internally. The parent doesn't prefix coordinates for child components.

For headless instances, `makeHeadlessInstanceComponent` wraps the render function. When hydrating, the component's render function is called within a scoped coordinate context. So the inline template's coordinates should be **relative** (starting at 0), not prefixed.

**Answer**: relative coordinates in the hydrate inline template. The component scope handles the prefix.

#### Example: Simple Instance Hydrate

```typescript
// Inline template for headless component: product-card #0
// (type definitions identical to element target)

function _headlessProductCard0Render(
    options?: RenderElementOptions,
): _HeadlessProductCard0ElementPreRender {
    const [refManager, [refAddToCart]] = ReferencesManager.for(
        options,
        ['add to cart'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            adoptElement('0', { class: 'hero-card' }, [
                adoptText('1', (vs) => vs.name),
                adoptText('2', (vs) => vs.price),
            ], refAddToCart()),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}

const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0Render,
    productCard.comp,
    'product-card:0',
    productCard.contexts,
);

// In hydrate function:
childComp(
    _HeadlessProductCard0,
    (vs: PageViewState) => ({ productId: 'prod-hero' }),
    refAR1(),
)
```

#### Question Q7: Does the hydrate inline template use `adoptElement` or the full create-from-scratch pattern?

The hydrate target assumes the DOM was server-rendered. The inline template in hydrate mode should use `adoptElement`/`adoptText` to walk and attach to existing DOM nodes.

But — the headless instance's inline template might NOT have been rendered by SSR (e.g., condition was false at SSR time). In that case, the create fallback from `hydrateConditional` handles it. For the headless instance itself:
- If the instance data exists in `__headlessInstances`, SSR rendered it → adopt
- If not, SSR didn't render it → nothing to adopt, and `makeHeadlessInstanceComponent` handles the absence

Wait — the `makeHeadlessInstanceComponent` constructor checks if ViewState exists (`if (fastVS)`) and creates signals. But the render function always runs. If SSR rendered the instance, the DOM nodes exist and need adoption. If SSR didn't render it, the DOM nodes don't exist.

This is actually the same pattern as `hydrateConditional` — the instance itself is conditionally present in the DOM based on whether SSR had data for it. The hydrate inline template should use adopt APIs, and the conditional presence is handled by the component lifecycle.

Actually, looking more carefully: `childComp()` always renders the component. The component's render function creates DOM (in element target) or adopts DOM (in hydrate target). The `makeHeadlessInstanceComponent` wrapper ensures the ViewState is available.

For hydration: if SSR rendered the instance, `childComp()` calls the hydrate render function which adopts. If SSR didn't render it... that's a problem — we'd need the create fallback.

For now, let's handle the primary case: SSR rendered the instance (data was available). The fallback case (SSR didn't render, client needs to create) is a Level 3 hydration concern similar to DL#100, and can be deferred.

**Answer**: use `adoptElement`/`adoptText` in the hydrate inline template. The primary case is adopting SSR-rendered DOM.

#### Example: forEach Instance Hydrate

```typescript
const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0Render,
    productCard.comp,
    (dataIds) => [...dataIds, 'product-card:0'].toString(),
    productCard.contexts,
);

// In hydrate function:
adoptElement('0', {}, [
    adoptText('1', (vs) => vs.pageTitle),
    adoptElement('2', {}, [
        hydrateForEach(
            '2',
            (vs) => vs.products,
            '_id',
            () => [
                childComp(
                    _HeadlessProductCard0,
                    (vs1) => ({ productId: vs1._id }),
                    refAR1(),
                ),
            ],
            (vs1) => {
                return e('div', { class: 'grid' }, [
                    childComp(
                        _HeadlessProductCard0,
                        (vs1) => ({ productId: vs1._id }),
                        refAR1(),
                    ),
                ]);
            },
        ),
    ]),
])
```

#### Example: slowForEach Instance Hydrate

For slowForEach, each item is a separate compilation unit with its own coordinate scope:

```typescript
// Each slowForEach item has its own headless instance definition
// (identical to element target: _HeadlessProductCard0 with coordinate 'p1/product-card:0')

// In hydrate function:
adoptElement('0', {}, [
    adoptText('1', (vs) => vs.pageTitle),
    adoptElement('2', {}, [
        // slowForEach items use the same pattern as element target
        slowForEachItem<PageViewState, ProductViewState>(
            (vs) => vs.products,
            0,
            'p1',
            () => adoptElement('p1', {}, [
                childComp(
                    _HeadlessProductCard0,
                    (vs1) => ({ productId: 'prod-123' }),
                    refAR1(),
                ),
            ]),
        ),
        // ... second item
    ]),
])
```

### Page-Level Headless (Old-Style) Hydration

The old-style `<script type="application/jay-headless" key="counter">` headless component renders data into the page's own ViewState (e.g., `vs.counter.count`). This is NOT the `<jay:xxx>` instance pattern — it's a top-level data import.

For SSR, this already works (see `page-using-counter/generated-server-element.ts`). For hydration, the page's template accesses `vs.counter.count` etc. — same as any other ViewState property. No special headless handling needed in the hydrate output because the data is part of the page's ViewState directly.

So page-level headless SSR+hydration needs:
- SSR: already covered by `page-using-counter` fixture ✓
- Hydration: standard template adoption (no headless-specific code needed)
- Test: add `generated-element-hydrate.ts` fixture for `page-using-counter`

## Implementation Plan

### Phase 1: Server-Element Target — Headless Instance Support

1. Add `headlessContractNames`, `headlessImports` to `ServerContext`
2. Add component detection (`getComponentName`) to `renderServerElement()`
3. Implement `renderServerHeadlessInstance()`:
   - Compute coordinate key (static string or runtime expression for forEach)
   - Create local variable: `const vs_pcN = (vs as any).__headlessInstances?.[key]`
   - Guard with `if (vs_pcN)`
   - Set `coordinatePrefix` to instance coordinate key
   - Reset `coordinateCounter`
   - Render inline template children with instance's variable context
4. Handle `if` condition on `<jay:xxx>` — wrap in page-level condition first, then instance guard
5. Import contract ViewState types as needed

### Phase 2: Hydrate Target — Headless Instance Support

1. Add `headlessImports`, `headlessInstanceDefs`, `headlessInstanceCounter` to `HydrateContext`
2. Add headless-instance detection in `renderHydrateElement()` (check `componentMatch.kind`)
3. Implement `renderHydrateHeadlessInstance()`:
   - Same pattern as element target's `renderHeadlessInstance()`
   - Inline template compiled with hydrate APIs (`adoptElement`, `adoptText`, etc.)
   - Generate `_headlessXxxNRender` functions and `makeHeadlessInstanceComponent` definitions
   - Return `childComp()` calls
4. Handle conditional and forEach containers (same as element target)

### Phase 3: Test Fixtures and Tests

For each scenario, create expected output fixtures and add test cases:

| Scenario | Fixture | Server-Element | Hydrate |
|---|---|---|---|
| Page-level headless | `page-using-counter` | exists ✓ | new fixture |
| Simple instance | `page-with-headless-instance` | new fixture | new fixture |
| Conditional instance | `page-with-headless-mixed` | new fixture | new fixture |
| forEach instance | `page-with-headless-in-foreach` | new fixture | new fixture |
| slowForEach instance | `page-with-headless-in-slow-foreach` | new fixture | new fixture |

Add test cases to:
- `generate-server-element.test.ts` — 4 new tests
- `generate-element-hydrate.test.ts` — 5 new tests

## Verification Criteria

1. All existing tests pass (no regressions)
2. New server-element fixtures match actual compiler output
3. New hydrate fixtures match actual compiler output
4. Coordinate alignment: server-element and hydrate produce compatible coordinates for all 5 scenarios
5. The generated code type-checks (correct import paths and type references)
