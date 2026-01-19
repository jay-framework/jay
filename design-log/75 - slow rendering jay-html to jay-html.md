# Slow Rendering: Jay-HTML to Jay-HTML

## Background

Jay Stack has three rendering phases (see Design Logs #34, #50):

1. **Slow (build-time)**: Static data rendered at build time or data-change time
2. **Fast (request-time)**: Dynamic data rendered per HTTP request (SSR)
3. **Interactive (client-side)**: Client-side interactivity and state management

Currently, all three phases execute at runtime:

- The dev server runs slow → fast → interactive on each request
- Production could pre-render at build time, but the mechanism isn't defined

This design log proposes a **jay-html to jay-html transformation** for the slow phase:

- Input: Original `*.jay-html` file with bindings for all phases
- Output: Pre-rendered `*.jay-html` file with slow data "baked in"

The generated jay-html can then be used for faster rendering in both dev server and production.

## Problem Statement

### Current Behavior

Every page request runs the full rendering pipeline:

```
Request → Load jay-html → Run slow render → Run fast render → Send HTML
                              ↓
                         (same work repeated every time)
```

For pages with slow-phase data (static product info, categories, etc.), this is wasteful.

### Desired Behavior

Pre-render slow data once, reuse for every request:

```
Build Time:
  jay-html → slow render → pre-rendered jay-html (with slow data embedded)

Request Time:
  pre-rendered jay-html → fast render → Send HTML
                              ↓
                         (skip slow render)
```

### Use Cases

1. **Production builds**: Generate pre-rendered jay-html files during build
2. **Dev server**: Generate on first request, watch for changes, regenerate as needed
3. **Incremental regeneration**: When slow data changes, regenerate specific pages

## Questions & Answers

### Q1: What exactly gets "baked in" to the output jay-html?

**A:** Properties marked as `phase: slow` in the contract:

- Text content: `{productName}` → literal value
- Attributes: `href="{productUrl}"` → literal value
- Conditionals: `if="isOnSale"` → either present or removed
- Loops: `forEach="images"` → unrolled to concrete elements

### Q2: How do we identify which bindings are slow vs fast/interactive?

**A:** From the contract's phase annotations (Design Log #50):

```jay-contract
contract ProductPage
  - {tag: name, type: data, dataType: string, phase: slow}
  - {tag: price, type: data, dataType: number, phase: fast}
  - {tag: quantity, type: variant, dataType: number, phase: fast+interactive}
```

The compiler already generates `SlowViewState`, `FastViewState`, and `InteractiveViewState` types.

### Q3: How do we handle arrays (`forEach`) in slow phase?

**A:** Two scenarios:

**Slow array (structure frozen at build time):**

```html
<!-- Input -->
<ul>
  <li forEach="images" trackBy="id">
    <img src="{url}" alt="{alt}" />
  </li>
</ul>

<!-- Output (unrolled) -->
<ul>
  <li data-track-by="img1">
    <img src="/hero.jpg" alt="Hero image" />
  </li>
  <li data-track-by="img2">
    <img src="/detail.jpg" alt="Detail view" />
  </li>
</ul>
```

**Fast array (structure set at request time):**
The `forEach` is preserved, only child properties with `phase: slow` are baked in.

### Q4: What about conditionals (`if`) in slow phase?

**A:**

**Slow conditional:**

```html
<!-- Input -->
<span class="badge" if="isOnSale">On Sale!</span>

<!-- Output (condition evaluated) -->
<span class="badge">On Sale!</span>
<!-- or element removed if false -->
```

**Fast conditional:**
The `if` attribute is preserved for runtime evaluation.

### Q5: How do we handle nested components (headless/headful)?

**A:**

**Headful components:** Each component's jay-html is transformed separately. The component reference stays, but the referenced jay-html is pre-rendered.

**Headless components:** The component's slot content may have slow bindings that get baked in. The component structure itself is preserved.

### Q6: What's the output file naming/location?

**A:** With `loadParams`, a single jay-html can generate **multiple pre-rendered files** - one for each combination of URL parameters.

**Example**: `/products/[slug]/page.jay-html` with:

```typescript
loadParams: async () => [{ slug: 'widget-a' }, { slug: 'widget-b' }, { slug: 'gadget-pro' }];
```

Generates:

```
.jay/pre-rendered/
  products/
    widget-a/
      page.jay-html
    widget-b/
      page.jay-html
    gadget-pro/
      page.jay-html
```

**Storage Structure**:

```
.jay/pre-rendered/
  <resolved-route-path>/
    page.jay-html
    metadata.json  # { params, renderedAt, sourceHash }
```

**Options**:

- **Production builds**: `.jay/pre-rendered/` directory with param-resolved paths
- **Dev server**: In-memory cache keyed by `(jayHtmlPath, params)`

**Recommendation**:

- Production: File-based storage in `.jay/pre-rendered/` with resolved paths
- Dev server: In-memory cache, no file writes

### Q7: How do we preserve fast/interactive bindings in the output?

**A:** Bindings for fast/interactive phases remain as template syntax:

```html
<!-- Input -->
<div>
  <h1>{productName}</h1>
  <!-- slow -->
  <span class="price">{price}</span>
  <!-- fast -->
  <button>{addToCartText}</button>
  <!-- interactive -->
</div>

<!-- Output (slow rendered) -->
<div>
  <h1>Awesome Widget</h1>
  <!-- baked in -->
  <span class="price">{price}</span>
  <!-- preserved -->
  <button>{addToCartText}</button>
  <!-- preserved -->
</div>
```

### Q8: What about CSS/style bindings?

**A:** Same rules apply:

```html
<!-- Input -->
<div style:background-color="{bgColor}">
  <!-- slow -->

  <!-- Output -->
  <div style="background-color: #ff0000;"><!-- baked in --></div>
</div>
```

### Q9: How do we handle refs in slow-rendered elements?

**A:** Refs are preserved - they're for interactive phase only:

```html
<!-- Input -->
<button ref="addToCart">{buttonText}</button>

<!-- Output -->
<button ref="addToCart">Add to Cart</button>
<!-- ref preserved, text baked in -->
```

### Q10: What happens when slow data changes?

**A:** Different strategies for different environments:

**Dev server**:

- **No need to watch data sources** - simplifies dev experience
- **Watch jay-html and component files** - invalidate cache when template changes
- On file change: Clear cached pre-render, regenerate on next request
- Developers can manually refresh to get fresh slow data

**Production builds**:

- Full rebuild regenerates all pre-rendered files
- Incremental rebuild possible if dependency tracking is implemented

**Production runtime (ISR-like)**:

- Webhook/API to trigger regeneration of specific pages
- Time-based revalidation (optional, configurable per page)

### Q11: How does this interact with the existing dev server?

**A:**

**Current dev server flow:**

```
Request → Vite loads jay-html → Run slow render → Run fast render → Respond
```

**New dev server flow:**

```
First Request (for given params):
  jay-html + params → slow render → cache pre-rendered jay-html (keyed by path+params)

Subsequent Requests (same params):
  cached pre-rendered jay-html → fast render → Respond

On jay-html/Component File Change:
  Invalidate affected cache entries → regenerate on next request

On Data Source Change:
  (no automatic invalidation - developer refreshes manually)
```

**Cache Key**: `(jayHtmlPath, params)` tuple - each param combination cached separately

### Q12: What metadata needs to be preserved in the output?

**A:**

- Contract reference (for fast/interactive type checking)
- Phase information (which bindings are fast vs interactive)
- Track-by keys for arrays (for client-side reconciliation)
- Refs for interactive elements
- Component imports (for nested components)

## Design

### Core Transformation

The slow-render transformation takes:

- **Input**: Original jay-html + SlowViewState data
- **Output**: Pre-rendered jay-html with slow bindings resolved

```typescript
interface SlowRenderInput {
  jayHtmlPath: string;
  slowViewState: object;
  contract: ContractMetadata;
}

interface SlowRenderOutput {
  preRenderedJayHtml: string;
  metadata: {
    originalPath: string;
    slowViewState: object;
    timestamp: number;
  };
}
```

### Transformation Rules

#### Rule 1: Text Bindings

```html
<!-- Slow binding -->
<span>{productName}</span>
<!-- → -->
<span>Awesome Widget</span>

<!-- Fast binding (preserved) -->
<span>{price}</span>
<!-- → -->
<span>{price}</span>
```

#### Rule 2: Attribute Bindings

```html
<!-- Slow binding -->
<a href="{productUrl}">Link</a>
<!-- → -->
<a href="/products/awesome-widget">Link</a>

<!-- Fast binding (preserved) -->
<span class="{priceClass}">...</span>
<!-- → -->
<span class="{priceClass}">...</span>
```

#### Rule 3: Style Bindings

```html
<!-- Slow binding -->
<div style:background-color="{bgColor}">
  <!-- → -->
  <div style="background-color: #ff0000;">
    <!-- Fast binding (preserved) -->
    <div style:opacity="{fadeLevel}">
      <!-- → -->
      <div style:opacity="{fadeLevel}"></div>
    </div>
  </div>
</div>
```

#### Rule 4: Conditionals

```html
<!-- Slow condition (evaluated) -->
<span if="isOnSale">On Sale!</span>
<!-- → if true: -->
<span>On Sale!</span>
<!-- → if false: (element removed) -->

<!-- Fast condition (preserved) -->
<span if="inStock">In Stock</span>
<!-- → -->
<span if="inStock">In Stock</span>
```

#### Rule 5: Loops (forEach)

```html
<!-- Slow array (unrolled, forEach replaced with slowForEach) -->
<li forEach="images" trackBy="id">
  <img src="{url}" alt="{alt}" />
</li>
<!-- → -->
<li slowForEach="images" trackBy="id" jayIndex="0" jayTrackBy="img1">
  <img src="/hero.jpg" alt="Hero image" />
</li>
<li slowForEach="images" trackBy="id" jayIndex="1" jayTrackBy="img2">
  <img src="/detail.jpg" alt="Detail view" />
</li>

<!-- Fast array (preserved) -->
<li forEach="products" trackBy="id">
  <span>{name}</span>
</li>
<!-- → (unchanged) -->
<li forEach="products" trackBy="id">
  <span>{name}</span>
</li>
```

**Attribute semantics**:

- `slowForEach="arrayName"` - indicates this is an unrolled slow array item (replaces `forEach`)
- `trackBy="propertyName"` - preserved from original (property name used for tracking)
- `jayIndex="N"` - index of this item in the array
- `jayTrackBy="value"` - the actual track-by value for this item

**Important**: Slow arrays preserve metadata via attributes so that:

- Fast rendering can match fast properties to the correct array items
- Interactive rendering can identify items for updates
- Client-side reconciliation works correctly

#### Rule 6: Mixed Phase in Arrays

When a slow array has mixed-phase child properties:

```html
<!-- Slow array with fast child properties -->
<li forEach="products" trackBy="id">
  <span>{name}</span>
  <!-- slow: baked in -->
  <span>{price}</span>
  <!-- fast: preserved as binding -->
</li>

<!-- → (unrolled with metadata, bindings remain item-scoped) -->
<li slowForEach="products" trackBy="id" jayIndex="0" jayTrackBy="prod1">
  <span>Widget A</span>
  <span>{price}</span>
</li>
<li slowForEach="products" trackBy="id" jayIndex="1" jayTrackBy="prod2">
  <span>Widget B</span>
  <span>{price}</span>
</li>
```

**Key points**:

- `forEach` replaced with `slowForEach` to indicate pre-rendered array
- Fast bindings remain item-scoped (`{price}` not `{products[0].price}`)
- `slowForEachItem` runtime function changes context to the array item
- `jayIndex` tells the runtime which item to use from the fast ViewState array

#### Rule 7: Recursive Regions

For recursive structures (see Design Log #46):

```html
<div ref="treeNode">
  <span>{name}</span>
  <!-- slow: baked in -->
  <ul if="open">
    <!-- could be slow or fast -->
    <li forEach="children" trackBy="id">
      <recurse ref="treeNode" />
    </li>
  </ul>
</div>

<!-- If entire structure is slow → fully unrolled -->
<!-- If children array is fast → recursion preserved -->
```

### Output Jay-HTML Format

The output must be a valid jay-html that can be processed by the fast/interactive phases.

```html
<html>
  <head>
    <!-- Contract reference preserved -->
    <script type="application/jay-contract" src="./page.jay-contract"></script>

    <!-- Optional: Metadata about pre-rendering -->
    <script type="application/jay-prerender-meta">
      {
        "source": "./page.jay-html",
        "renderedAt": "2026-01-19T10:00:00Z",
        "slowViewState": { ... }
      }
    </script>

    <!-- Component imports preserved -->
    <script type="application/jay-headless" src="@wix/stores" names="ProductCard"></script>
  </head>
  <body>
    <!-- Pre-rendered content with fast/interactive bindings -->
    <h1>Awesome Widget</h1>
    <span class="price">{price}</span>
    <button ref="addToCart">{addToCartText}</button>
  </body>
</html>
```

### Type Generation for Pre-Rendered Jay-HTML

The pre-rendered jay-html generates types for remaining phases:

```typescript
// Original: All three phase types
interface ProductPageViewState {
  name;
  sku;
  price;
  quantity;
}
interface ProductPageSlowViewState {
  name;
  sku;
}
interface ProductPageFastViewState {
  price;
}
interface ProductPageInteractiveViewState {
  quantity;
}

// Pre-rendered: Only fast + interactive
interface ProductPagePreRenderedViewState {
  price;
  quantity;
}
interface ProductPagePreRenderedFastViewState {
  price;
}
interface ProductPagePreRenderedInteractiveViewState {
  quantity;
}
```

### Integration Points

#### 1. Build-Time Pre-Rendering

```typescript
// In build script
async function preRenderPage(pagePath: string) {
  const component = await loadComponent(pagePath);
  const slowViewState = await component.withSlowlyRender(props, services);

  const preRenderedJayHtml = await slowRenderJayHtml({
    jayHtmlPath: pagePath,
    slowViewState: slowViewState.render,
    contract: component.contract,
  });

  await writeFile(pagePath.replace('.jay-html', '.pre-rendered.jay-html'), preRenderedJayHtml);
}
```

#### 2. Dev Server Integration

```typescript
// Cache key includes params for multi-param pages
type CacheKey = `${string}:${string}`; // `jayHtmlPath:JSON.stringify(params)`
const preRenderCache = new Map<CacheKey, PreRenderedJayHtml>();

async function getJayHtml(pagePath: string, params: Record<string, string>) {
  const cacheKey: CacheKey = `${pagePath}:${JSON.stringify(params)}`;

  if (preRenderCache.has(cacheKey)) {
    return preRenderCache.get(cacheKey);
  }

  const preRendered = await preRenderPage(pagePath, params);
  preRenderCache.set(cacheKey, preRendered);
  return preRendered;
}

// Watch jay-html and component files (NOT data sources)
watcher.on('change', (changedPath) => {
  // Invalidate all cached pre-renders that depend on the changed file
  const affectedPages = findDependentPages(changedPath);
  for (const pagePath of affectedPages) {
    // Clear all param variants of this page
    for (const key of preRenderCache.keys()) {
      if (key.startsWith(`${pagePath}:`)) {
        preRenderCache.delete(key);
      }
    }
  }
});

// Note: No watching of data sources - developers refresh to get fresh slow data
```

#### 3. Request-Time Rendering

```typescript
// Fast render uses pre-rendered jay-html
async function handleRequest(req: Request) {
  const preRenderedJayHtml = await getJayHtml(route.pagePath);

  // Fast render only needs to fill in fast-phase bindings
  const html = await fastRender(preRenderedJayHtml, fastViewState);

  return html;
}
```

## Implementation Plan

### Phase 1: Core Transformation Engine

1. Create `slow-render-transform.ts` in compiler
2. Implement binding resolution for each rule (text, attr, style, if, forEach)
3. Handle phase detection from contract metadata
4. Generate valid jay-html output

**Tests:**

- Text binding resolution (slow → literal, fast → preserved)
- Attribute binding resolution
- Style binding resolution
- Conditional evaluation (slow conditions resolved, fast preserved)
- Basic forEach → slowForEach transformation
- Mixed bindings in same element

### Phase 2: Array Handling

1. Implement slow array unrolling with `slowForEach` attribute
2. Handle mixed-phase arrays (slow structure, fast properties)
3. Preserve trackBy and add jayIndex, jayTrackBy attributes
4. Keep bindings item-scoped (no rewriting to indexed access)

**Tests:**

- Pure slow array unrolling
- Mixed-phase array (slow structure, fast child properties)
- Nested arrays
- Array with conditionals inside
- trackBy value extraction

### Phase 3: Runtime Support for slowForEach

1. Update jay-html parser to recognize `slowForEach` attribute
2. Implement `slowForEachItem` runtime function that:
   - Uses `jayIndex` to access `viewState[arrayName][index]`
   - Sets up data context for child bindings (like `forEach`)
   - Provides correct item context for events
3. Ensure client reconciliation works with jayTrackBy

**Tests:**

- Fast render with slowForEach elements
- Context switching (bindings use item scope)
- Interactive updates to fast properties in slow arrays
- Event handling with correct item context
- Client hydration with slowForEach

### Phase 4: Component Handling

1. Handle nested component references
2. Recursive region support
3. Headless component slot content

### Phase 5: Dev Server Integration

1. Add pre-render cache to dev server
2. Integrate with file watcher for invalidation (jay-html and component files)
3. Lazy pre-render on first request
4. Cache keyed by (jayHtmlPath, params)

### Phase 6: Production Build (Future)

> **Note**: Production build not yet supported. Skip for now.

1. Pre-render all pages that have slow phase data (no configuration needed)
2. Generate pre-rendered jay-html files in `.jay/pre-rendered/`
3. Handle loadParams to generate multiple files per route

### Phase 7: Incremental Regeneration (Future)

1. API/webhook for triggering regeneration
2. Dependency tracking (which pages depend on which data)
3. Partial regeneration support

## Examples

### Example 1: Product Page

**Input (page.jay-html):**

```html
<html>
  <head>
    <script type="application/jay-contract" src="./page.jay-contract"></script>
  </head>
  <body>
    <article class="product">
      <h1>{name}</h1>
      <p class="sku">SKU: {sku}</p>
      <span class="price">{formattedPrice}</span>
      <span class="stock" if="inStock">In Stock</span>
      <div class="quantity">
        <button ref="decrease">-</button>
        <span>{quantity}</span>
        <button ref="increase">+</button>
      </div>
      <ul class="images">
        <li forEach="images" trackBy="id">
          <img src="{url}" alt="{alt}" />
        </li>
      </ul>
    </article>
  </body>
</html>
```

**Contract (page.jay-contract):**

```yaml
contract ProductPage
tags:
  - {tag: name, type: data, dataType: string, phase: slow}
  - {tag: sku, type: data, dataType: string, phase: slow}
  - {tag: formattedPrice, type: data, dataType: string, phase: fast}
  - {tag: inStock, type: data, dataType: boolean, phase: fast}
  - {tag: quantity, type: variant, dataType: number, phase: fast+interactive}
  - {tag: images, type: repeated, phase: slow}
    - {tag: id, type: data, dataType: string}
    - {tag: url, type: data, dataType: string}
    - {tag: alt, type: data, dataType: string}
```

**SlowViewState:**

```typescript
{
  name: "Awesome Widget",
  sku: "AW-12345",
  images: [
    { id: "1", url: "/images/hero.jpg", alt: "Hero shot" },
    { id: "2", url: "/images/detail.jpg", alt: "Detail view" }
  ]
}
```

**Output (page.pre-rendered.jay-html):**

```html
<html>
  <head>
    <script type="application/jay-contract" src="./page.jay-contract"></script>
    <script type="application/jay-prerender-meta">
      {"source": "./page.jay-html", "renderedAt": "2026-01-19T10:00:00Z"}
    </script>
  </head>
  <body>
    <article class="product">
      <h1>Awesome Widget</h1>
      <p class="sku">SKU: AW-12345</p>
      <span class="price">{formattedPrice}</span>
      <span class="stock" if="inStock">In Stock</span>
      <div class="quantity">
        <button ref="decrease">-</button>
        <span>{quantity}</span>
        <button ref="increase">+</button>
      </div>
      <ul class="images">
        <li slowForEach="images" trackBy="id" jayIndex="0" jayTrackBy="1">
          <img src="/images/hero.jpg" alt="Hero shot" />
        </li>
        <li slowForEach="images" trackBy="id" jayIndex="1" jayTrackBy="2">
          <img src="/images/detail.jpg" alt="Detail view" />
        </li>
      </ul>
    </article>
  </body>
</html>
```

### Example 2: Category Page with Mixed-Phase Array

**Input:**

```html
<ul class="products">
  <li forEach="products" trackBy="id">
    <span class="name">{name}</span>
    <!-- slow -->
    <span class="price">{price}</span>
    <!-- fast -->
    <button if="inStock">Add</button>
    <!-- fast condition -->
  </li>
</ul>
```

**Contract:** `products` array is `phase: slow` but `price` and `inStock` are `phase: fast`

**Output:**

```html
<ul class="products">
  <li slowForEach="products" trackBy="id" jayIndex="0" jayTrackBy="prod1">
    <span class="name">Widget A</span>
    <span class="price">{price}</span>
    <button if="inStock">Add</button>
  </li>
  <li slowForEach="products" trackBy="id" jayIndex="1" jayTrackBy="prod2">
    <span class="name">Widget B</span>
    <span class="price">{price}</span>
    <button if="inStock">Add</button>
  </li>
</ul>
```

**Key points:**

- `slowForEach="products"` + `jayIndex` tell the runtime which array item to use
- Bindings remain item-scoped (`{price}` not `{products[0].price}`)
- Runtime's `slowForEachItem` changes context to the correct array item

## TypeScript Code Generation

This section shows how pre-rendered jay-html compiles to TypeScript, validating that the runtime can handle the new constructs.

### Key Insight: Context Switching

`slowForEachItem` works like `forEach` by **changing the data context** to the array item. This means:

- Bindings inside use item-scoped access (`vs.price`) not indexed access (`vs.products[0].price`)
- Events get the correct item coordinates and data
- The transformation is simpler - no need to rewrite bindings with indexes
- Consistent with how `forEach` works

### Example: slowForEach Compilation

**Pre-rendered jay-html:**

```html
<ul class="products">
  <li slowForEach="products" trackBy="id" jayIndex="0" jayTrackBy="prod1">
    <span class="name">Widget A</span>
    <span class="price">{price}</span>
  </li>
  <li slowForEach="products" trackBy="id" jayIndex="1" jayTrackBy="prod2">
    <span class="name">Widget B</span>
    <span class="price">{price}</span>
  </li>
</ul>
```

**Generated TypeScript:**

```typescript
import { element as e, dynamicText as dt, slowForEachItem } from '@jay-framework/runtime';

// FastViewState item type (only fast/interactive fields)
interface ProductFastItem {
  price: number;
  inStock: boolean;
}

export function render() {
  return e('ul', { class: 'products' }, [
    // slowForEachItem: changes context to vs.products[0]
    slowForEachItem(
      'products', // array name for context lookup
      0, // jayIndex - which item in the array
      'prod1', // jayTrackBy value
      e('li', {}, [
        e('span', { class: 'name' }, ['Widget A']), // static text (pre-rendered)
        e('span', { class: 'price' }, [
          dt((vs: ProductFastItem) => vs.price), // item-scoped binding (not indexed!)
        ]),
      ]),
    ),
    slowForEachItem(
      'products',
      1,
      'prod2',
      e('li', {}, [
        e('span', { class: 'name' }, ['Widget B']),
        e('span', { class: 'price' }, [
          dt((vs: ProductFastItem) => vs.price), // same binding, different context
        ]),
      ]),
    ),
  ]);
}
```

**How it works:**

1. `slowForEachItem('products', 0, ...)` sets the data context to `viewState.products[0]`
2. Inside the item, bindings use `vs.price` (item-scoped, like in regular `forEach`)
3. The runtime's update function knows to get `viewState.products[0]` and pass it to child bindings
4. Events fire with the correct array item context

### Example: Mixed Bindings with Conditionals

**Pre-rendered jay-html:**

```html
<li slowForEach="products" trackBy="id" jayIndex="0" jayTrackBy="prod1">
  <span class="name">Widget A</span>
  <span class="price">{price}</span>
  <button if="inStock">Add to Cart</button>
</li>
```

**Generated TypeScript:**

```typescript
slowForEachItem('products', 0, 'prod1',
  e('li', {}, [
    e('span', { class: 'name' }, ['Widget A']),
    e('span', { class: 'price' }, [
      dt((vs) => vs.price),  // item-scoped
    ]),
    conditional(
      (vs) => vs.inStock,  // item-scoped conditional
      () => e('button', {}, ['Add to Cart']),
    ),
  ]),
)
```

### Example: Pure Slow Array (No Fast Properties)

When all array item properties are slow:

**Pre-rendered jay-html:**

```html
<ul class="images">
  <li slowForEach="images" trackBy="id" jayIndex="0" jayTrackBy="1">
    <img src="/hero.jpg" alt="Hero shot" />
  </li>
  <li slowForEach="images" trackBy="id" jayIndex="1" jayTrackBy="2">
    <img src="/detail.jpg" alt="Detail view" />
  </li>
</ul>
```

**Generated TypeScript:**

```typescript
e('ul', { class: 'images' }, [
  slowForEachItem('images', 0, '1',
    e('li', {}, [
      e('img', { src: '/hero.jpg', alt: 'Hero shot' }),  // fully static
    ]),
  ),
  slowForEachItem('images', 1, '2',
    e('li', {}, [
      e('img', { src: '/detail.jpg', alt: 'Detail view' }),
    ]),
  ),
])
```

**Note**: Even with no fast bindings, `slowForEachItem` sets up the context for events and potential interactive updates.

### Runtime Function Signature

```typescript
/**
 * Wraps a pre-rendered array item from slow phase.
 * Sets the data context to viewState[arrayName][index] for child bindings.
 * 
 * @param arrayName - Name of the source array in parent ViewState
 * @param index - Index of this item (used to access viewState[arrayName][index])
 * @param trackByValue - The track-by value for client reconciliation
 * @param element - The pre-rendered element (bindings are item-scoped)
 */
function slowForEachItem<ParentVS, ItemVS>(
  arrayName: keyof ParentVS,
  index: number,
  trackByValue: string,
  element: JayElement<ItemVS>,
): JayElement<ParentVS>;
```

### Comparison: forEach vs slowForEachItem

| Aspect            | `forEach`                     | `slowForEachItem`                |
|-------------------|-------------------------------|----------------------------------|
| Structure         | Dynamic (rendered at runtime) | Static (pre-rendered)            |
| Item count        | Determined at runtime         | Fixed at slow-render time        |
| Context switching | Yes                           | Yes                              |
| Bindings          | Item-scoped (`vs.price`)      | Item-scoped (`vs.price`)         |
| Track-by          | Computed at runtime           | Baked in as attribute            |
| Add/remove items  | Supported                     | Not supported (frozen structure) |

## Trade-offs

### Advantages

1. **Performance**: Skip slow render on every request
2. **Caching**: Pre-rendered jay-html is highly cacheable
3. **Consistency**: Same pre-render output used across dev and production
4. **Debugging**: Pre-rendered files can be inspected

### Disadvantages

1. **Complexity**: Additional transformation step
2. **Staleness**: Pre-rendered data can become stale
3. **Build time**: Initial build is slower
4. **Mixed-phase arrays**: Complex handling for fast bindings in slow arrays

### Alternatives Considered

1. **Full HTML pre-rendering**: Pre-render to final HTML

   - Rejected: Loses flexibility for fast-phase rendering

2. **Virtual DOM approach**: Keep structure in memory

   - Rejected: Doesn't persist across server restarts

3. **JSON snapshot**: Store slow data as JSON, apply at runtime
   - Rejected: Still requires runtime template processing

## Verification Criteria

1. Pre-rendered jay-html is valid and parseable
2. Fast/interactive bindings are preserved correctly
3. Unrolled arrays maintain track-by keys
4. Dev server correctly invalidates cache on changes
5. Production build generates correct pre-rendered files
6. Type generation works for pre-rendered jay-html
7. Performance improvement is measurable (skip slow render)

## Resolved Questions

1. **Partial pre-rendering**: No - all slow bindings are pre-rendered together.

2. **CDN integration**: Not applicable - pre-rendered jay-html files are not fully rendered pages and cannot be served directly from CDN. Future consideration: complete rendering at the edge.

3. **Syntax for unrolled arrays**: Use `slowForEach` attribute instead of wrapping elements. This is consistent with the existing `forEach` attribute syntax:

   - `forEach="array"` → `slowForEach="array"` (indicates pre-rendered slow array)
   - Same `trackBy` attribute preserved
   - Added `jayIndex` and `jayTrackBy` attributes for item identification

4. **Fast ViewState array structure**: Fast ViewState only includes fast/interactive phase fields, consistent with the phase-specific type generation (Design Log #50). For unrolled slow arrays with mixed phases:

   ```typescript
   // SlowViewState (already rendered, baked into jay-html)
   {
     products: [{ name: 'Widget A' }, { name: 'Widget B' }];
   }

   // FastViewState (provided at request time)
   {
     products: [
       { price: 29.99, inStock: true },
       { price: 19.99, inStock: false },
     ];
   }
   ```

   The `slowForEachItem` runtime function uses `jayIndex` to access the correct item from the fast ViewState array and sets up the data context. Bindings remain item-scoped (e.g., `{price}` not `{products[0].price}`).

---

## Related Design Logs

- **#34 - Jay Stack**: Original architecture and rendering phases
- **#50 - Rendering Phases in Contracts**: Phase annotations in contracts
- **#52 - Client-Server Code Splitting**: Separating client/server code
- **#46 - Recursive Jay-HTML**: Recursive region handling
