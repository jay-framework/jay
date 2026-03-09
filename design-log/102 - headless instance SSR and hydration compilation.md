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
const vs_pc0 = (vs as any).__headlessInstances?.['product-card:0'] as ProductCardViewState | undefined;
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
    const vs_pc0 = (vs as any).__headlessInstances?.[vs1._id + ',product-card:0'] as ProductCardViewState | undefined;
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
const vs_pc0 = (vs as any).__headlessInstances?.['p1/product-card:0'] as ProductCardViewState | undefined;
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
    const vs_pc1 = (vs as any).__headlessInstances?.['product-card:promo'] as ProductCardViewState | undefined;
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

#### Design Principle: SSR and Hydration Must Be In Sync

The SSR output and hydration script are compiled from the same jay-html source. The hydration script should match what SSR produced. If they disagree (e.g., SSR rendered a conditional but hydration expects it absent), that's an error — fail fast rather than silently producing broken DOM.

To validate sync, the compiler can embed a version ID in both the SSR HTML (as a data attribute or comment) and the hydration script. On hydration startup, compare IDs; mismatch → error.

**Hydration script compilation input**: The hydration script is compiled from the **slow-rendered** (pre-rendered) jay-html — the same input as the server-element target. It only needs the slow rendering ViewState to determine its structure. Fast-phase data arrives as runtime JSON, not as structural changes to the compiled script.

#### Question Q6: Do headless instance inline templates need adopt APIs or element APIs?

Headless instance inline templates must use **adopt APIs** (`adoptElement`, `adoptText`) to properly hydrate the SSR-rendered DOM. Creating fresh DOM via `e()` would waste the SSR content and cause a flash of replacement — that's not true hydration.

The current `childComp` (element.ts:41-66) always creates fresh DOM because it calls `ConstructContext.withRootContext()` which creates a context without a coordinate map. We need a new `childCompHydrate` that scopes the coordinate context to the instance's coordinate prefix.

**Answer**: adopt APIs for hydration. New runtime support needed.

#### New Runtime: `childCompHydrate` and `withHydrationChildContext`

**`ConstructContext.withHydrationChildContext(viewState, refManager, fn)`** — like `withRootContext` but inherits `coordinateBase` and `coordinateMap` from the current (parent) context. This allows adopt calls inside the inline template to resolve coordinates scoped to the instance prefix.

**`childCompHydrate(component, getProps, instanceCoordinate, ref)`** — like `childComp` but first extends the current context's `coordinateBase` with the instance coordinate (e.g., `'product-card:0'`), then calls the component factory within that scoped context.

**Coordinate resolution flow:**
1. Page hydrate → `withHydrationRootContext` → context has full coordinateMap
2. `childCompHydrate(_HeadlessPC, getProps, 'product-card:0', ref)` → extends coordinateBase to `['product-card:0']`, shares coordinateMap
3. Component factory calls hydratePreRender → `withHydrationChildContext` inherits scoped base
4. `adoptElement('0')` → `resolveCoordinate('0')` → prepends base → `product-card:0/0` → finds SSR element ✓

This works because `resolveCoordinate` (context.ts:221-228) prepends `coordinateBase.join('/')` to the key before looking up in the shared map.

#### Question Q7: How many preRender functions per headless instance?

**ONE preRender per component definition.** Each `makeHeadlessInstanceComponent` has one preRender.

The SSR and hydration script must agree on what was rendered:
- If SSR rendered the instance → hydrate has adopt version → coordinates match ✓
- If SSR did not render the instance → hydrate has create version → no DOM to adopt ✓
- If they disagree → error (detectable via sync ID)

#### Slow vs Fast Conditionals

**Slow conditionals** (condition uses a slow-phase property): Resolved at build time by the slow render transform. If true → the `if` attribute is removed (becomes unconditional). If false → the element is deleted from the pre-rendered jay-html. The hydrate script is compiled from the resolved jay-html, so it naturally has only one path. No special handling needed.

**Fast conditionals** (condition uses a fast/interactive-phase property): Dynamic per request. The hydrate script is compiled once (statically) but must handle both outcomes — SSR may render the instance on one request and skip it on another. So the hydrate needs `hydrateConditional` with **both** adopt and create callbacks, requiring **two separate component definitions**.

For **forEach**, which structurally needs both adopt (existing items) and create (new items), the same two-definition pattern applies.

| Context          | Component Definitions                                       | Hydrate API                                              |
|------------------|-------------------------------------------------------------|----------------------------------------------------------|
| Unconditional    | 1 adopt                                                     | `childCompHydrate`                                       |
| Slow conditional | 1 (resolved at build time: adopt if true, removed if false) | `childCompHydrate`                                       |
| Fast conditional | 2: adopt + create                                           | `hydrateConditional` wraps both                          |
| forEach          | 2: adopt + create                                           | `hydrateForEach` uses adopt for existing, create for new |
| slowForEach      | 1 adopt                                                     | items pre-rendered, always adopt                         |

#### Code Size Trade-off: Adopt + Create Duplication

For forEach and fast conditionals, having both adopt and create component definitions increases client bundle size. In most cases, the adopt version is considerably smaller than the create version because it doesn't include static DOM nodes — it only wires up dynamic points. But in edge cases (templates with mostly dynamic content), the two versions can be similar in size.

**Future optimization**: The create path can be downloaded dynamically (lazy import). If the data hasn't changed since SSR, the create path isn't needed until a reactive update adds new items (forEach) or toggles a condition. By that time, the create code can be loaded on demand. This defers the cost to when it's actually needed.

#### Example: Simple Instance Hydrate

```typescript
// Hydrate inline template — uses adopt APIs
function _headlessProductCard0HydrateRender(
    options?: RenderElementOptions,
): _HeadlessProductCard0ElementPreRender {
    const [refManager, [refAddToCart]] = ReferencesManager.for(
        options, ['add to cart'], [], [], [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('0', { class: 'hero-card' }, [
                adoptText('1', (vs) => vs.name),
                adoptText('2', (vs) => vs.price),
            ], refAddToCart()),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}

const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0HydrateRender, productCard.comp, 'product-card:0', productCard.contexts,
);

// In page hydrate function:
adoptElement('0', {}, [
    adoptText('1', (vs) => vs.pageTitle),
    childCompHydrate(
        _HeadlessProductCard0,
        (vs: PageViewState) => ({ productId: 'prod-hero' }),
        'product-card:0',
        refAR1(),
    ),
])
```

#### Example: Slow Conditional Instance Hydrate

Slow conditionals are resolved at build time. If the condition was true, the `if` attribute is removed and the headless instance becomes unconditional — same as the simple instance example above. If false, the element is deleted from the pre-rendered jay-html.

#### Example: Fast Conditional Instance Hydrate

Fast conditionals are dynamic per request. The hydrate script needs both adopt and create paths:

```typescript
// TWO separate components: adopt for true-at-SSR, create for false-at-SSR
const _HeadlessProductCard1Adopt = makeHeadlessInstanceComponent(
    _headlessProductCard1HydrateRender, productCard.comp, 'product-card:promo', productCard.contexts,
);
const _HeadlessProductCard1Create = makeHeadlessInstanceComponent(
    _headlessProductCard1Render, productCard.comp, 'product-card:promo', productCard.contexts,
);

// hydrateConditional handles both cases:
hydrateConditional(
    (vs) => vs.showPromo,
    // adopt path: SSR rendered it
    () => childCompHydrate(
        _HeadlessProductCard1Adopt,
        (vs: PageViewState) => ({ productId: 'prod-promo' }),
        'product-card:promo',
        refPromo(),
    ),
    // create path: SSR did not render it
    () => childComp(
        _HeadlessProductCard1Create,
        (vs: PageViewState) => ({ productId: 'prod-promo' }),
        refPromo(),
    ),
)
```

#### Example: forEach Instance Hydrate

```typescript
// TWO separate components: adopt for existing items, create for new items
const _HeadlessProductCard0Adopt = makeHeadlessInstanceComponent(
    _headlessProductCard0HydrateRender, productCard.comp,
    (dataIds) => [...dataIds, 'product-card:0'].toString(),
    productCard.contexts,
);
const _HeadlessProductCard0Create = makeHeadlessInstanceComponent(
    _headlessProductCard0Render, productCard.comp,
    (dataIds) => [...dataIds, 'product-card:0'].toString(),
    productCard.contexts,
);

// In page hydrate function:
adoptElement('0', {}, [
    adoptText('1', (vs) => vs.pageTitle),
    adoptElement('2', {}, [
        hydrateForEach(
            '2',
            (vs) => vs.products,
            '_id',
            () => [
                childCompHydrate(
                    _HeadlessProductCard0Adopt,
                    (vs1) => ({ productId: vs1._id }),
                    'product-card:0',
                    refAR1(),
                ),
            ],
            (vs1) => {
                return e('div', { class: 'grid' }, [
                    childComp(
                        _HeadlessProductCard0Create,
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

```typescript
// ONE adopt component per slowForEach item (pre-rendered, always adopt)
const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0HydrateRender, productCard.comp, 'p1/product-card:0', productCard.contexts,
);

// In page hydrate function:
adoptElement('0', {}, [
    adoptText('1', (vs) => vs.pageTitle),
    adoptElement('2', {}, [
        slowForEachItem<PageViewState, ProductViewState>(
            (vs) => vs.products, 0, 'p1',
            () => adoptElement('p1', {}, [
                childCompHydrate(
                    _HeadlessProductCard0,
                    (vs1) => ({ productId: 'prod-123' }),
                    'product-card:0',
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
   - Create local variable: `const vs_pcN = (vs as any).__headlessInstances?.[key] as ContractViewState | undefined`
   - Guard with `if (vs_pcN)`
   - Set `coordinatePrefix` to instance coordinate key
   - Reset `coordinateCounter`
   - Render inline template children with instance's variable context
4. Handle `if` condition on `<jay:xxx>` — wrap in page-level condition first, then instance guard
5. Import contract ViewState types as needed

### Phase 2: Runtime — Hydration Support for Child Components

1. Add `ConstructContext.withHydrationChildContext(viewState, refManager, fn)` — inherits `coordinateBase` and `coordinateMap` from parent context
2. Add `childCompHydrate(component, getProps, instanceCoordinate, ref)` — extends `coordinateBase` with instance coordinate, then calls component factory within scoped context
3. Optional: sync ID validation between SSR and hydration script

### Phase 3: Hydrate Target — Headless Instance Support

1. Add `headlessImports`, `headlessInstanceDefs`, `headlessInstanceCounter` to `HydrateContext`
2. Add headless-instance detection in `renderHydrateElement()` (check `componentMatch.kind`)
3. Implement `renderHydrateHeadlessInstance()`:
   - Compile inline template with adopt APIs (`adoptElement`, `adoptText`) and `withHydrationChildContext`
   - Generate `_headlessXxxNHydrateRender` functions and `makeHeadlessInstanceComponent` definitions
   - Return `childCompHydrate()` calls
4. forEach and fast conditionals: generate TWO separate component definitions (adopt + create)
5. Unconditional/slow conditional/slowForEach: ONE adopt component definition

### Phase 4: Test Fixtures and Tests

For each scenario, create expected output fixtures and add test cases:

| Scenario             | Fixture                              | Server-Element   | Hydrate     |
|----------------------|--------------------------------------|------------------|-------------|
| Page-level headless  | `page-using-counter`                 | exists ✓         | new fixture |
| Simple instance      | `page-with-headless-instance`        | new fixture      | new fixture |
| Conditional instance | `page-with-headless-mixed`           | new fixture      | new fixture |
| forEach instance     | `page-with-headless-in-foreach`      | new fixture      | new fixture |
| slowForEach instance | `page-with-headless-in-slow-foreach` | new fixture      | new fixture |

Add test cases to:
- `generate-server-element.test.ts` — 4 new tests
- `generate-element-hydrate.test.ts` — 5 new tests

### Phase 5: Fake-Shop Integration and Dev-Server Tests

Create dedicated pages in `examples/jay-stack/fake-shop/src/pages/` for each headless instance scenario:
- Page with a single headless instance (unconditional)
- Page with headless instance inside a fast conditional
- Page with headless instance inside forEach
- Page with headless instance inside slowForEach (pre-rendered)

Extend the dev-server tests to cover these pages end-to-end:
- Verify SSR produces correct HTML (no client-only fallback)
- Verify hydration script loads and hydrates without errors
- Verify interactive behavior works after hydration (e.g., button clicks trigger actions)

## Verification Criteria

1. All existing tests pass (no regressions)
2. New server-element fixtures match actual compiler output
3. New hydrate fixtures match actual compiler output
4. Server-element coordinates align with hydrate adopt coordinates (same values, same order)
5. `childCompHydrate` correctly scopes coordinate resolution (e.g., `adoptElement('0')` inside instance resolves to `product-card:0/0`)
6. forEach hydrate uses adopt component for existing items, create component for new items
7. The generated code type-checks (correct import paths and type references)

## Implementation Results

### Phase 1: Server-Element Target — Completed

**Files changed:**
- `packages/compiler/compiler-jay-html/lib/expressions/expression-compiler.ts` — Added optional `customVarName` parameter to `Variables` constructor
- `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts` — Extended `ServerContext`, added `renderServerHeadlessInstance()`, updated `renderServerElement()` and `generateServerElementFile()`
- `packages/compiler/compiler-jay-html/test/jay-target/generate-server-element.test.ts` — 4 new tests

**New fixture files:**
- `test/fixtures/contracts/page-with-headless-instance/generated-server-element.ts`
- `test/fixtures/contracts/page-with-headless-in-foreach/generated-server-element.ts`
- `test/fixtures/contracts/page-with-headless-in-slow-foreach/generated-server-element.ts`
- `test/fixtures/contracts/page-with-headless-mixed/generated-server-element.ts`

**Deviations from design:**
- Added `customVarName` to `Variables` constructor — design didn't specify how to scope the variable name for inline template children. Without this, expressions resolved to `vs.name` (page ViewState) instead of `vs_product_card0.name` (instance ViewState).
- Added `headlessCoordinateCounters: Map<string, number>` to `ServerContext` — design didn't specify per-scope counters for coordinate refs. Without this, the second slowForEach instance got `product-card:1` instead of `product-card:0` (each scope should reset).
- Headless instance detection moved BEFORE conditional check in `renderServerElement()` — design didn't specify ordering. A `<jay:xxx if="...">` must be handled by `renderServerHeadlessInstance()` (which handles the `if` internally) rather than by the conditional handler (which would treat the tag as literal HTML).

**Phase 1 review fixes:**
- **Bug fix**: forEach `__headlessInstances` key now uses raw `String(vs1._id)` instead of `escapeAttr(String(vs1._id))`. Added `rawCoordinatePrefix` to `ServerContext` to track unescaped prefix separately from the HTML-escaped `coordinatePrefix`.
- **Bug fix**: slowForEach `headlessCoordinateCounters` now reset per item (`new Map()` in slowForEach itemContext). Second item correctly uses `p2/product-card:0` instead of `p2/product-card:1`.
- **Fixture accuracy**: Updated jay-html fixtures to reflect post-slow-render state — `{name}` (phase:slow) resolved to literals ("Hero Product", "Promo Product"). Updated both jay-html source files and element target fixture files.

**Tests: 568/568 passing (4 new + 564 existing, 4 skipped)**

### Phase 2: Runtime — Completed

**Files changed:**
- `packages/runtime/runtime/lib/context.ts` — Added `forInstance(instanceCoordinate)` method on `ConstructContext` (extends coordinateBase with instance segments, shares coordinateMap). Added `withHydrationChildContext` static method (inherits coordinateBase and coordinateMap from parent context).
- `packages/runtime/runtime/lib/hydrate.ts` — Added `childCompHydrate(compCreator, getProps, instanceCoordinate, ref)` function. Uses `context.forInstance()` to scope coordinate resolution before calling the component factory.
- `packages/runtime/runtime/lib/index.ts` — Exported `childCompHydrate`.

**New test file:**
- `packages/runtime/runtime/test/lib/hydration/child-comp-hydrate.test.ts` — 3 tests:
  - Scopes coordinate resolution to instance prefix (`product-card:0/0` via `adoptElement('0')`)
  - Multi-segment coordinate prefix (`p1/product-card:0/0` for slowForEach)
  - Does not interfere with parent coordinate resolution (elements before and after `childCompHydrate` adopt correctly)

**No deviations from design.**

**Tests: 242/242 passing (5 new + 237 existing, 3 skipped)**

### Phase 3: Hydrate Compiler — Completed

**Files changed:**
- `packages/compiler/compiler-shared/lib/imports.ts` — Added `childCompHydrate` import definition
- `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts`:
  - Extended `HydrateContext` with `headlessImports`, `headlessInstanceDefs`, `headlessInstanceCounter`, `headlessCoordinateCounters`, `insideFastForEach`, `coordinatePrefix`
  - Updated `buildRenderContext()` to pass through headless fields
  - Added headless instance detection in `renderHydrateElement()` (before conditional check)
  - Implemented `renderHydrateHeadlessInstance()` (~200 lines):
    - Compiles adopt inline template with `adoptElement`/`adoptText` + `withHydrationChildContext`
    - For forEach: generates TWO component definitions (adopt + create)
    - For conditionals: wraps in `hydrateConditional` with adopt + create callbacks
    - Handles coordinate key computation matching element target
  - Updated `renderHydrate()` to emit headless instance definitions at module level
  - Updated forEach/slowForEach item contexts to set `insideFastForEach`, `headlessCoordinateCounters`, `coordinatePrefix`
- `packages/compiler/compiler-jay-html/test/jay-target/generate-element-hydrate.test.ts` — 5 new tests

**New fixture files:**
- `test/fixtures/contracts/page-using-counter/generated-element-hydrate.ts`
- `test/fixtures/contracts/page-with-headless-instance/generated-element-hydrate.ts`
- `test/fixtures/contracts/page-with-headless-in-foreach/generated-element-hydrate.ts`
- `test/fixtures/contracts/page-with-headless-in-slow-foreach/generated-element-hydrate.ts`
- `test/fixtures/contracts/page-with-headless-mixed/generated-element-hydrate.ts`

**Phase 3 review fixes:**
- **Bug fix (critical)**: Fast conditional create path was using adopt component (`adoptElement`/`adoptText`). Now generates a Create component with element APIs (`e()`/`dt()`) for conditionals, same as forEach. Changed condition from `isInsideForEach` to `isInsideForEach || !!ifCondition` for create version generation.
- **Bug fix (critical)**: forEach create callback used `refAR2()` (undefined) instead of `refAR1()`. Fixed by giving the create callback a fresh `RefNameGenerator` so it produces the same ref names as the adopt callback.
- **Bug fix (high)**: Server-element didn't force coordinates on inline template root elements, causing coordinate mismatch with hydrate target. Fixed by passing `forceCoordinate = true` when rendering inline template root children in `renderServerHeadlessInstance()`.
- **Code cleanup**: Removed `if (isInsideForEach || true)` hack, replaced with proper `if (ifCondition)` check.

- **Bug fix (critical)**: forEach generated duplicate type/function identifiers (`_HeadlessProductCard0Element`, `_headlessProductCard0Render`). Root cause: `renderHydrateHeadlessInstance` generated a create version, AND the forEach handler's create callback re-rendered the headless instance via the element target's `renderHeadlessInstance()`. Fix: forEach create version is now generated ONLY by the element target (via `renderNode()`), not by `renderHydrateHeadlessInstance`. Conditional create version is still generated by `renderHydrateHeadlessInstance` (since there's no separate create callback handler for conditionals). The `headlessInstanceCounter` is not reset for the create callback, so the element target gets counter=1 (adopt used 0) — unique names, no conflicts.

**Tests: 577/577 passing (all fixtures regenerated, 4 skipped)**
