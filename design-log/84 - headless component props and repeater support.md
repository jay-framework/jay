# Headless Component Props and Repeater Support

**Date:** February 4, 2026  
**Status:** Draft  
**Related:** Design Logs #50, #58, #60, #80

## Background

Jay Stack supports headless components from plugins that provide data contracts for page rendering. Currently, headless components are imported once per page via `<script type="application/jay-headless">` tags:

```html
<script
  type="application/jay-headless"
  plugin="wix-stores"
  contract="product-list"
  key="products"
></script>
```

The component renders once per page, with its data bound to the `key` attribute (e.g., `{products.items}`).

## Problem Statement

We need to support scenarios where the same headless component is used multiple times on a page with **different configuration/props**:

1. **Multiple instances with different IDs**: A page showing 3 product cards for featured products, each with a different `productId`

2. **Repeater/forEach usage**: A product grid where each cell is a product card component bound to an item from a list

3. **Static vs dynamic props**: Props that are:
   - Static (known at build time): `productId="prod-123"`
   - Dynamic from page data: `productId={featuredProducts[0]._id}`
   - From repeater context: `productId={_id}` inside a `forEach`

### Example Scenarios

**Scenario A: Multiple featured products**

```html
<!-- Current: Cannot do this -->
<div class="featured">
  <product-card productId="prod-123" />
  <product-card productId="prod-456" />
  <product-card productId="prod-789" />
</div>
```

**Scenario B: Product grid with repeater**

```html
<!-- Current: Cannot do this -->
<div class="product-grid" forEach="products.items" trackBy="_id">
  <product-card productId="{_id}" />
</div>
```

**Scenario C: Agent discovering available product IDs**

- Agent needs to know valid `productId` values to generate meaningful pages
- Plugin should expose discoverable data sources

## Questions and Answers

### Q1: How should props be passed to headless component instances?

**Options:**

A) **Extended script tag with props attribute**

```html
<script
  type="application/jay-headless"
  plugin="wix-stores"
  contract="product-card"
  key="featured1"
  props='{"productId": "prod-123"}'
></script>
```

B) **Web component style with custom element**

```html
<wix-stores-product-card productId="prod-123" key="featured1" />
```

C) **Named instances with inline props**

```html
<script
  type="application/jay-headless"
  plugin="wix-stores"
  contract="product-card"
  key="featured"
></script>

<!-- Later in template -->
<jay-headless use="featured" productId="prod-123" />
```

D) **Import once, instantiate with data binding**

```html
<script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>

<!-- Use with props and inline template -->
<jay:product-card productId="prod-123">
  <h1>{name}</h1>
  <span class="price">{price}</span>
</jay:product-card>

<jay:product-card productId="prod-456">
  <article class="compact">{name} - ${price}</article>
</jay:product-card>
```

**Answer:** Option D - Import once, instantiate with data binding.

The inline template for the headless component is placed within the instance tag. Each instance:

- Gets its own props (e.g., `productId`)
- Creates a local data context (bindings resolve against component's ViewState)
- Can have different inline templates (different presentation for same data)

**Considerations:**

- Option A keeps existing pattern but gets verbose
- Option B is most web-like but requires component registration mechanism
- Option C separates import from usage (like ES modules)
- Option D makes the namespace/component relationship explicit

#### Q1b: What element name should be used for component instances?

Given import:

```html
<script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>
```

**Options:**

A) **Namespaced with `jay:` prefix**

```html
<jay:product-card productId="prod-123">
  <h1>{name}</h1>
</jay:product-card>
```

B) **Plain element name (contract name)**

```html
<product-card productId="prod-123">
  <h1>{name}</h1>
</product-card>
```

C) **Namespaced with `contract:` prefix**

```html
<contract:product-card productId="prod-123">
  <h1>{name}</h1>
</contract:product-card>
```

**Answer:** Option A - Use `jay:` prefix for consistency.

Headful components currently use plain element names (Option B style). We should migrate headful components to also use the `jay:` prefix for consistency. This is a breaking change requiring test updates, but creates a unified element syntax across the framework.

**Considerations for agent usage:**

- Option A (`jay:`): Clear framework namespace, greppable, 4 extra chars
- Option B (plain): Simplest, but could conflict with HTML custom elements, no namespace isolation
- Option C (`contract:`): Semantically accurate, self-documenting, 9 extra chars

#### Prerequisite: Migrate Headful Components to `jay:` Prefix

Before implementing headless component instances, we should migrate existing headful components to use the `jay:` prefix. This:

1. Creates unified syntax for all Jay components (headful and headless)
2. Simplifies compiler implementation (one pattern for component detection)
3. Avoids potential conflicts with HTML custom elements

**Migration scope:**

- Update compiler to recognize `<jay:component-name>` for headful components
- Update all existing templates and tests
- Deprecate (then remove) plain element name support

### Two Ways to Use Headless Components

After this design, headless components can be used in **two distinct ways**:

#### 1. Top-Level Import with `key` Attribute

```html
<script
  type="application/jay-headless"
  plugin="wix-stores"
  contract="product-list"
  key="catalog"
></script>

<!-- Data bound via key name -->
<h1>{catalog.title}</h1>
<div forEach="catalog.items">...</div>
```

- **Single instance** per page for this contract
- Data accessed via `{key.property}` bindings
- No inline template - component doesn't render visible UI
- Used for **data providers** (lists, configurations, page-level data)

#### 2. Component Instances with `jay:` Element

```html
<script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>

<!-- Multiple instances with inline templates -->
<jay:product-card productId="prod-123">
  <h1>{name}</h1>
  <!-- Resolved from component ViewState -->
</jay:product-card>

<jay:product-card productId="prod-456">
  <h1>{name}</h1>
  <!-- Different instance, different data -->
</jay:product-card>
```

- **Multiple instances** allowed (different props)
- Each instance creates a **new data context** (ViewState)
- **Inline template** defines the presentation
- Props passed to configure each instance
- Used for **reusable widgets** (cards, tiles, interactive elements)

**Both can coexist:**

```html
<head>
  <!-- Data provider (top-level with key) -->
  <script
    type="application/jay-headless"
    plugin="wix-stores"
    contract="product-list"
    key="allProducts"
  ></script>
  <!-- Widget (imported, used as instances) -->
  <script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>
</head>
<body>
  <!-- Use list data to drive forEach -->
  <div forEach="allProducts.items" trackBy="_id">
    <!-- Use product-card as widget for each item -->
    <jay:product-card productId="{_id}">
      <article>{name} - ${price}</article>
    </jay:product-card>
  </div>
</body>
```

### Q2: How do headless components work inside `forEach`?

**Options:**

A) **Implicit context binding**: Component automatically receives repeater item as props

```html
<div forEach="products.items" trackBy="_id">
  <jay:product-card />
  <!-- Receives current item as props -->
</div>
```

B) **Explicit prop binding from repeater context**

```html
<div forEach="products.items" trackBy="_id">
  <jay:product-card productId="{_id}" name="{name}" price="{price}" />
</div>
```

C) **Spread operator for all item props**

```html
<div forEach="products.items" trackBy="_id">
  <jay:product-card {.} />
</div>
```

**Answer:** Support both Option B and Option C.

- Option B: Explicit prop binding for selective/renamed props
- Option C: Spread operator `{.}` passes all properties of the current forEach item (note: we use `{.}` not `{...item}` since forEach items don't have explicit names)

**Considerations:**

- Option A: Magic/implicit - component may expect specific shape
- Option B: Explicit and type-safe - verbose but clear
- Option C: Convenient for matching shapes - less type safety

### Q3: Where does the headless component render its output?

Currently: Component output bound to `key` (e.g., `{products.name}`)

**New question:** With multiple instances, how is data accessed?

**Options:**

A) **Each instance has unique key**

```html
<jay:product-card productId="prod-123" as="featured1" />
<jay:product-card productId="prod-456" as="featured2" />

<h1>{featured1.name}</h1>
<h1>{featured2.name}</h1>
```

B) **Component is self-contained (slot-based)**

```html
<jay:product-card productId="prod-123">
  <template slot="name"><h1>{name}</h1></template>
  <template slot="price"><span>{price}</span></template>
</jay:product-card>
```

C) **Component provides render template**

```html
<jay:product-card productId="prod-123">
  <h1>{name}</h1>
  <span class="price">{price}</span>
</jay:product-card>
```

D) **Component has fixed rendering**

- Component controls its own HTML
- Props configure behavior, not layout

**Answer:** Option C - Component creates a new data context.

The headless component instance creates a **new data context** based on its ViewState. Template bindings inside the component tag resolve against the component's ViewState, not the parent page's ViewState.

```html
<jay:product-card productId="prod-123">
  <h1>{name}</h1>
  <!-- resolved from component ViewState -->
  <span class="price">{price}</span>
  <!-- resolved from component ViewState -->
</jay:product-card>
```

- `{name}` and `{price}` resolve against the `product-card` component's ViewState
- `productId="prod-123"` is a static prop passed to the component
- `productId={someValue}` would resolve `someValue` from the **parent** ViewState before passing to component

#### Note on `as` Attribute

With Option C (local data context), the `as` attribute is **not needed**. Earlier examples showed:

```html
<jay:product-card productId="prod-123" as="featured1" />
<h1>{featured1.name}</h1>
<!-- This pattern is NOT used -->
```

With inline templates and local data context, this becomes:

```html
<jay:product-card productId="prod-123">
  <h1>{name}</h1>
  <!-- Data accessed inside component scope -->
</jay:product-card>
```

Refs are handled by the compiler: `childComp` requires a ref parameter, and the compiler auto-generates refs for all component instances. No explicit `as` attribute needed.

### Q4: What props should a product-card headless component accept?

Example contract extension for props:

```yaml
# product-card.jay-contract
name: ProductCard

# Props the component accepts (input)
props:
  - name: productId
    type: string
    required: true
    description: 'The ID of the product to display'

# Data the component provides (output)
tags:
  - tag: name
    type: data
    dataType: string
    phase: slow
  - tag: price
    type: data
    dataType: number
    phase: fast
  - tag: inStock
    type: data
    dataType: boolean
    phase: fast
```

**Answer:** Yes, extend the contract format to include a `props` section.

The example format above captures the key elements:

- `name`: prop identifier
- `type`: data type (string, number, boolean, enum, etc.)
- `required`: whether the prop must be provided
- `description`: human-readable description for agents/documentation
- `default`: optional default value

### Q5: How can agents discover valid prop values?

**Problem:** An agent generating a page with `<product-card productId="???">` needs to know valid product IDs.

**Options:**

A) **Plugin exposes data discovery endpoint**

```yaml
# plugin.yaml
contracts:
  - name: product-card
    contract: ./contracts/product-card.jay-contract
    component: ./components/product-card

data_sources:
  - name: products
    description: 'Available products for product-card component'
    endpoint: ./data/get-products.ts # Returns list of valid productIds
```

B) **Contract declares related list source**

```yaml
# product-card.jay-contract
name: ProductCard
props:
  - name: productId
    type: string
    source:
      plugin: wix-stores
      contract: product-list
      path: items[*]._id
```

C) **Separate discovery contract/command**

```bash
# Agent runs this to discover available data
jay-stack discover wix-stores/product-card/productId
# Returns: ["prod-123", "prod-456", "prod-789", ...]
```

D) **Materialized data index (similar to contracts-index.yaml)**

```yaml
# build/materialized-data/data-index.yaml
data_sources:
  - plugin: wix-stores
    prop_source: productId
    contract: product-card
    values_path: ./build/materialized-data/wix-stores/product-ids.json
```

**Answer:** Leverage existing plugin actions.

Plugins already define **actions** (e.g., "search products" in wix-stores) in `plugin.yaml`. These actions can be:

1. Described with metadata for agent understanding
2. Exposed via MCP server for agent invocation
3. Callable via CLI command for scripted discovery

This aligns with the existing plugin architecture - actions already exist, we just need to make them discoverable and invocable by agents.

#### Q5b: How should action descriptions be stored?

**Answer:** Single file per action with two parts: MCP-based schema (YAML) + markdown description.

````yaml
# ./actions/search-products.action.yaml

# Part 1: MCP-based schema
name: searchProducts
handler: ./search-products.ts

inputSchema:
  type: object
  properties:
    query:
      type: string
      description: Search query text
    limit:
      type: number
      default: 10
      description: Maximum results to return
  required:
    - query

outputSchema:
  type: array
  items:
    type: object
    properties:
      _id:
        type: string
      name:
        type: string
      price:
        type: number

---
# Part 2: Markdown description (after YAML frontmatter separator)

# Search Products Action

Search for products by query string. Returns matching products with their IDs,
names, and prices. Use this to discover valid `productId` values for the
`product-card` component.

## When to Use

Call this action when you need to:
- Find valid product IDs for `<jay:product-card productId="...">`
- Display search results to users
- Populate product grids or carousels

## Example

```bash
jay-stack action wix-stores/searchProducts --query="blue shirt"
````

Returns:

```json
[
  { "_id": "prod-123", "name": "Blue Cotton Shirt", "price": 29.99 },
  { "_id": "prod-456", "name": "Blue Denim Shirt", "price": 49.99 }
]
```

````

```yaml
# plugin.yaml - references action files
actions:
  - ./actions/search-products.action.yaml
  - ./actions/get-product.action.yaml
````

**Agent usage:**

The `.action.yaml` file contains both the schema (for validation/MCP) and the description (for agents). The CLI invocation is derived from the schema:

```bash
# CLI format: jay-stack action <plugin>/<action-name> [--param value]...
jay-stack action wix-stores/searchProducts --query="blue shirt" --limit=5

# Returns JSON to stdout:
[
  {"_id": "prod-123", "name": "Blue Cotton Shirt", "price": 29.99},
  {"_id": "prod-456", "name": "Blue Denim Shirt", "price": 49.99}
]
```

**Parameter passing:**

- Required params: `--query="value"` (error if missing)
- Optional params with defaults: `--limit=10` (uses default if omitted)
- Boolean flags: `--includeOutOfStock` or `--includeOutOfStock=false`

**MCP exposure:**
The same `.action.yaml` schema can be used to register actions as MCP tools:

```typescript
// jay-stack exposes actions as MCP tools
{
  name: "wix-stores/searchProducts",
  description: "Search for products...", // from markdown section
  inputSchema: { /* from inputSchema in yaml */ },
}
```

**Considerations:**

- Option A: Plugin-defined, but requires API at build time
- Option B: Declarative relationship - agent follows the source
- Option C: CLI command for exploration - explicit but separate step
- Option D: Pre-materialized like dynamic contracts - fits existing pattern

### Q6: Should props be validated at compile time or runtime?

**Answer:** Compile time.

Props are validated against the contract schema at compile time. This provides:

- Early error detection before runtime
- Type safety for static props
- Better agent feedback when generating pages

## Design

### Key Insight: Headless + Inline Template = Headful Component

The jay-runtime library already supports headful components with a similar pattern. A **headless component with an inline template** should be treated as a **headful component** during compilation.

```html
<jay:product-card productId="prod-123">
  <article class="card">
    <h1>{name}</h1>
    <span class="price">{price}</span>
    <button ref="addToCart">Add to Cart</button>
  </article>
</jay:product-card>
```

This compiles to a `makeJayComponent` call with the headless component's data providing the context.

### Compilation by Phase

**Slow Phase:**

- Transform the inline template using the headless component's slow ViewState
- Props are resolved and passed to the headless component's `slowlyRender`
- Output: Static HTML with slow-phase data bindings resolved

**Fast Phase:**

- Headless component's `fastRender` produces fast ViewState
- Create `carryForward` data to hand over to interactive phase
- Output: HTML with fast-phase data bindings resolved

**Interactive Phase:**

- Compile the inline template into a `makeJayComponent` call
- Two special contexts are injected:
  1. `Signals<FastViewState>` - Reactive signals for the component's ViewState
  2. `FastCarryForward` - Data carried from fast phase
- Refs from the inline template (e.g., `ref="addToCart"`) are wired up
- Event handlers and reactive updates work within the component's data context

```typescript
// Conceptual compilation output
const ProductCardInstance = makeJayComponent({
  // Injected from headless component
  viewState: productCardViewStateSignals,
  carryForward: productCardCarryForward,

  // From inline template
  template: compiledInlineTemplate,
  refs: { addToCart: buttonRef },
});
```

### Detailed Compilation Example

The key insight: The headless component plugin provides a **constructor function** (from `makeJayStackComponent`). The compiler produces a `jay-html.ts` file that combines:

1. The page's compiled template
2. The inline component template (compiled)
3. The constructor function from the plugin

#### Source: page.jay-html

```html
<html>
  <head>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
    <script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>
    <script
      type="application/jay-headless"
      plugin="wix-stores"
      contract="product-list"
      key="catalog"
    ></script>
  </head>
  <body>
    <h1>{pageTitle}</h1>

    <!-- Single headless component instance with static prop -->
    <section class="hero">
      <jay:product-card productId="prod-hero">
        <article class="hero-card">
          <h2>{name}</h2>
          <p class="desc">{description}</p>
          <span class="price">${price}</span>
          <button ref="buyNow">Buy Now</button>
        </article>
      </jay:product-card>
    </section>

    <!-- Headless components in a repeater -->
    <section class="catalog">
      <div class="grid" forEach="catalog.items" trackBy="_id">
        <jay:product-card productId="{_id}">
          <article class="product-tile">
            <img src="{imageUrl}" alt="{name}" />
            <h3>{name}</h3>
            <span class="price">${price}</span>
            <button ref="addToCart">Add to Cart</button>
          </article>
        </jay:product-card>
      </div>
    </section>
  </body>
</html>
```

#### Plugin provides: product-card component

```typescript
// @wix/stores - product-card.ts
import { makeJayStackComponent, Signals } from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import type { ProductCardContract, ProductCardFastViewState } from './product-card.jay-contract';

interface ProductCardProps {
  productId: string;
}

interface ProductCardCarryForward {
  productId: string;
}

// Plugin's interactive constructor
// Note: refs type is generic - comes from inline template, not defined by plugin
function ProductCardConstructor<TRefs>(
  props: Props<ProductCardProps>,
  refs: TRefs,
  fastViewState: Signals<ProductCardFastViewState>,
  fastCarryForward: ProductCardCarryForward,
) {
  // Plugin provides data-related interactive logic
  // The inline template handles ref wiring
  return {
    render: () => ({
      // ViewState values to render
    }),
  };
}

export const productCard = makeJayStackComponent<ProductCardContract>()
  .withProps<ProductCardProps>()
  .withServices(PRODUCTS_SERVICE)
  .withSlowlyRender(async (props, productsService) => {
    const product = await productsService.getProduct(props.productId);
    return {
      viewState: {
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
      },
      carryForward: { productId: props.productId },
    };
  })
  .withFastRender(async (props, carryForward, productsService) => {
    const inventory = await productsService.getInventory(carryForward.productId);
    return {
      viewState: {
        price: inventory.price,
        inStock: inventory.quantity > 0,
      },
      carryForward,
    };
  })
  .withInteractive(ProductCardConstructor);
```

#### Compiled Output: page.jay-html.ts

Following the actual compilation pattern from `generated-element-main-trusted.ts`:

```typescript
import {
  JayElement,
  element as e,
  dynamicText as dt,
  RenderElement,
  ReferencesManager,
  ConstructContext,
  HTMLElementProxy,
  RenderElementOptions,
  childComp,
  forEach,
} from '@jay-framework/runtime';
import { makeJayComponent, Props, createSignal } from '@jay-framework/component';
import { productCard } from '@wix/stores';  // Headless component from plugin

// ============================================================
// TYPES FROM PRODUCT-CARD CONTRACT (ViewState provided by plugin)
// ============================================================

interface ProductCardViewState {
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  inStock: boolean;
}

// ============================================================
// COMPILED INLINE TEMPLATE: Hero Product Card
// Source: <jay:product-card productId="prod-hero"> ... </jay:product-card>
// ============================================================

interface HeroProductCardRefs {
  buyNow: HTMLElementProxy<ProductCardViewState, HTMLButtonElement>;
}

// Compiled render function (same pattern as generated-element-main-trusted.ts)
function heroProductCardRender(options?: RenderElementOptions) {
  const [refManager, [refBuyNow]] = ReferencesManager.for(
    options,
    ['buyNow'],
    [],
    [],
    [],
  );

  const render = (viewState: ProductCardViewState) =>
    ConstructContext.withRootContext(viewState, refManager, () =>
      e('article', { class: 'hero-card' }, [
        e('h2', {}, [dt((vs) => vs.name)]),
        e('p', { class: 'desc' }, [dt((vs) => vs.description)]),
        e('span', { class: 'price' }, [dt((vs) => `$${vs.price}`)]),
        e('button', {}, ['Buy Now'], refBuyNow()),
      ]),
    );

  return [refManager.getPublicAPI() as HeroProductCardRefs, render] as const;
}

// Use the plugin's interactive constructor directly - no need to inline it
// productCard.withInteractive provides the constructor
export const HeroProductCard = makeJayComponent(
  heroProductCardRender,
  productCard.interactiveConstructor,  // From plugin's makeJayStackComponent
);

// ============================================================
// COMPILED INLINE TEMPLATE: Catalog Item (forEach - REUSABLE)
// Source: <jay:product-card productId={_id}> ... </jay:product-card>
// ============================================================

interface CatalogItemRefs {
  addToCart: HTMLElementProxy<ProductCardViewState, HTMLButtonElement>;
}

// forEach: Compiled render function - extracted ONCE, reused for all items
// This works because forEach items have IDENTICAL template structure
function catalogItemRender(options?: RenderElementOptions) {
  const [refManager, [refAddToCart]] = ReferencesManager.for(
    options,
    ['addToCart'],
    [],
    [],
    [],
  );

  const render = (viewState: ProductCardViewState) =>
    ConstructContext.withRootContext(viewState, refManager, () =>
      e('article', { class: 'product-tile' }, [
        e('img', { src: dt((vs) => vs.imageUrl), alt: dt((vs) => vs.name) }, []),
        e('h3', {}, [dt((vs) => vs.name)]),
        e('span', { class: 'price' }, [dt((vs) => `$${vs.price}`)]),
        e('button', {}, ['Add to Cart'], refAddToCart()),
      ]),
    );

  return [refManager.getPublicAPI() as CatalogItemRefs, render] as const;
}

// For forEach: Component defined ONCE, reused for all items via childComp
export const CatalogItem = makeJayComponent(
  catalogItemRender,  // Same render function for all items
  productCard.interactiveConstructor,  // From plugin
);

// ============================================================
// slowForEach: SEPARATE TEMPLATE PER ITEM
// Each item may have different template structure due to conditionals
// ============================================================

// slowForEach items are compiled individually - cannot reuse templates
// Example: item 0 might have `if={hasVariants}` resolve to true,
// item 1 might have it resolve to false - different HTML!

// Generated at slow-render time for item[0]
function catalogItemRender_0(options?: RenderElementOptions) {
  // This item HAS variants (conditional resolved to true)
  const [refManager, [refAddToCart]] = ReferencesManager.for(options, ['addToCart'], [], [], []);
  const render = (viewState: ProductCardViewState) =>
    ConstructContext.withRootContext(viewState, refManager, () =>
      e('article', { class: 'product-tile' }, [
        e('h3', {}, [dt((vs) => vs.name)]),
        e('div', { class: 'variants' }, [/* variant options */]),  // EXISTS
        e('button', {}, ['Add to Cart'], refAddToCart()),
      ]),
    );
  return [refManager.getPublicAPI(), render] as const;
}

// Generated at slow-render time for item[1]
function catalogItemRender_1(options?: RenderElementOptions) {
  // This item does NOT have variants (conditional resolved to false)
  const [refManager, [refAddToCart]] = ReferencesManager.for(options, ['addToCart'], [], [], []);
  const render = (viewState: ProductCardViewState) =>
    ConstructContext.withRootContext(viewState, refManager, () =>
      e('article', { class: 'product-tile' }, [
        e('h3', {}, [dt((vs) => vs.name)]),
        // NO variants div - different structure!
        e('button', {}, ['Add to Cart'], refAddToCart()),
      ]),
    );
  return [refManager.getPublicAPI(), render] as const;
}

// slowForEach: each item gets its own compiled template + component instance
export const slowForEachCatalogItems = [
  makeJayComponent(catalogItemRender_0, productCard.interactiveConstructor),
  makeJayComponent(catalogItemRender_1, productCard.interactiveConstructor),
  // ... one per slow-rendered item
];

// ============================================================
// PAGE-LEVEL TEMPLATE
// ============================================================

// Item type within the page's catalog (before component hydration)
interface CatalogItemViewState {
  _id: string;
  // Other fields passed through from slow render...
}

interface PageViewState {
  pageTitle: string;
  catalog: {
    items: CatalogItemViewState[];
  };
}

interface PageRefs {
  heroProductCard: /* component ref */;
  catalogItems: /* collection ref */;
}

function pageRender(options?: RenderElementOptions) {
  const [refManager, [refHeroProductCard, refCatalogItems]] = ReferencesManager.for(
    options,
    [],
    [],
    ['heroProductCard'],  // Single component ref
    ['catalogItems'],     // Collection ref for forEach
  );

  const render = (viewState: PageViewState) =>
    ConstructContext.withRootContext(viewState, refManager, () =>
      e('div', {}, [
        e('h1', {}, [dt((vs) => vs.pageTitle)]),
        e('section', { class: 'hero' }, [
          // Static headless component - rendered via childComp
          childComp(
            HeroProductCard,
            (vs: PageViewState) => ({ /* props mapped from page viewState */ }),
            refHeroProductCard(),
          ),
        ]),
        e('section', { class: 'catalog' }, [
          e('div', { class: 'grid' }, [
            // forEach items - same component, different data per item
            forEach(
              (vs: PageViewState) => vs.catalog.items,
              (itemVs: CatalogItemViewState) =>
                childComp(
                  CatalogItem,  // Same component for all items
                  (vs: CatalogItemViewState) => ({ productId: vs._id }),
                  refCatalogItems(),
                ),
              '_id',  // trackBy key
            ),
          ]),
        ]),
      ]),
    );

  return [refManager.getPublicAPI() as PageRefs, render] as const;
}

export { pageRender as render };
```

#### page.ts - Wiring headless component data with compiled templates

```typescript
import { makeJayStackComponent, PageProps, Signals } from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import { render as pageRender, HeroProductCard, CatalogItem } from './page.jay-html';
import { productCard, productList } from '@wix/stores';
import type {
  PageContract,
  PageRefs,
  PageSlowViewState,
  PageFastViewState,
} from './page.jay-contract';

interface PageCarryForward {
  heroProductId: string;
  catalogItemIds: string[];
}

async function renderSlowlyChanging(props: PageProps) {
  // 1. Get data from headless components
  const heroData = await productCard.slowlyRender({ productId: 'prod-hero' });
  const catalogData = await productList.slowlyRender({});

  return {
    viewState: {
      pageTitle: 'Our Products',
      // Hero component's slow ViewState
      heroProduct: heroData.viewState,
      // Catalog list data
      catalog: catalogData.viewState,
    },
    carryForward: {
      heroProductId: 'prod-hero',
      catalogItemIds: catalogData.viewState.items.map((i) => i._id),
    },
  };
}

async function renderFastChanging(props: PageProps, carryForward: PageCarryForward) {
  // Fast data for hero
  const heroFast = await productCard.fastRender(
    { productId: carryForward.heroProductId },
    { productId: carryForward.heroProductId },
  );

  // Fast data for each catalog item
  const catalogItemsFast = await Promise.all(
    carryForward.catalogItemIds.map((id) =>
      productCard.fastRender({ productId: id }, { productId: id }),
    ),
  );

  return {
    viewState: {
      heroProduct: heroFast.viewState,
      catalogItems: catalogItemsFast.map((f) => f.viewState),
    },
    carryForward,
  };
}

function PageConstructor(
  props: Props<PageProps>,
  refs: PageRefs,
  fastViewState: Signals<PageFastViewState>,
  fastCarryForward: PageCarryForward,
) {
  // HeroProductCard is already makeJayComponent(heroProductCardRender, HeroProductCardConstructor)
  // It receives ViewState from productCard's phases via the render props

  // For catalog: createCatalogItem(productId) creates component per item
  // Each uses the same catalogItemRender (template reuse for forEach)

  return {
    render: () => ({}),
  };
}

export const page = makeJayStackComponent<PageContract>()
  .withProps<PageProps>()
  .withSlowlyRender(renderSlowlyChanging)
  .withFastRender(renderFastChanging)
  .withInteractive(PageConstructor);
```

#### Key Points

1. **Plugin provides the component constructor** - `productCard` from `@wix/stores` includes `slowlyRender`, `fastRender`, and `withInteractive`

2. **Compiler extracts inline templates** - Each `<jay:product-card>` block's content is compiled into a template object

3. **`makeJayComponent` combines both:**

   - `component`: The plugin's component definition (data + services)
   - `template`: The compiled inline template (presentation)
   - `interactive`: Merges plugin's interactive + inline template's refs

4. **Props resolution:**

   - Static: `productId="prod-hero"` → compiled directly into props
   - Dynamic: `productId={_id}` → factory function receives value from forEach

5. **Template is just presentation** - The inline template only controls HTML structure; the plugin controls data fetching and business logic

6. **Refs bridge both worlds:**
   - Plugin can provide refs for its functionality
   - Inline template can add refs for page-specific behavior
   - Both are wired up in the interactive phase

### Template Reuse: slowForEach vs forEach

**Critical distinction for repeated items:**

#### `forEach` (fast/interactive phase)

- Template structure is **identical** for all items
- Only data bindings differ between items
- **Define component once, render via `childComp` in forEach**

```typescript
// forEach: Single compiled render function
function catalogItemRender(options?: RenderElementOptions) {
  // Compiled ONCE
  const [refManager, refs] = ReferencesManager.for(options, ['addToCart'], [], [], []);
  const render = (viewState) =>
    e('article', {}, [
      /* ... */
    ]);
  return [refManager.getPublicAPI(), render] as const;
}

// Component defined ONCE - makeJayComponent creates the prototype, not instance
export const CatalogItem = makeJayComponent(
  catalogItemRender,
  productCard.interactiveConstructor, // From plugin
);

// In page template: forEach uses childComp to render each item
forEach(
  (vs: PageViewState) => vs.catalog.items,
  (itemVs: CatalogItemViewState) =>
    childComp(
      CatalogItem, // Same component definition for all items
      (vs) => ({ productId: vs._id }), // Props from item viewState
      refCatalogItems(),
    ),
  '_id', // trackBy key
);
```

#### `slowForEach` (slow phase)

- Each item may produce **different template structure**
- Conditionals, visibility, nested loops resolve per-item at slow time
- **Each item gets its own compiled template**

```html
<!-- slowForEach: conditionals resolve differently per item -->
<div slowForEach="products" trackBy="_id">
  <jay:product-card productId="{_id}">
    <h3>{name}</h3>
    <span class="price" if="{hasPrice}">{price}</span>
    <!-- may/may not exist -->
    <span class="badge" if="{isNew}">NEW</span>
    <!-- may/may not exist -->
    <div if="{hasVariants}" forEach="variants">
      <!-- nested structure varies -->
      <span>{variantName}</span>
    </div>
  </jay:product-card>
</div>
```

```typescript
// slowForEach: Separate compiled template per item
// Item 0: has variants, has badge
function catalogItemRender_0(options?: RenderElementOptions) {
  const [refManager, [refAddToCart]] = ReferencesManager.for(options, ['addToCart'], [], [], []);
  const render = (viewState: ProductCardViewState) =>
    ConstructContext.withRootContext(viewState, refManager, () =>
      e('article', {}, [
        e('h3', {}, [dt((vs) => vs.name)]),
        e('span', { class: 'badge' }, ['NEW']), // Exists for this item
        e('div', { class: 'variants' }, [
          /* ... */
        ]), // Exists for this item
        e('button', {}, ['Add to Cart'], refAddToCart()),
      ]),
    );
  return [refManager.getPublicAPI(), render] as const;
}

// Item 1: no variants, no badge - different structure!
function catalogItemRender_1(options?: RenderElementOptions) {
  const [refManager, [refAddToCart]] = ReferencesManager.for(options, ['addToCart'], [], [], []);
  const render = (viewState: ProductCardViewState) =>
    ConstructContext.withRootContext(viewState, refManager, () =>
      e('article', {}, [
        e('h3', {}, [dt((vs) => vs.name)]),
        // NO badge, NO variants - different structure!
        e('button', {}, ['Add to Cart'], refAddToCart()),
      ]),
    );
  return [refManager.getPublicAPI(), render] as const;
}

// Each item is a separate component with its own template
const slowForEachItems = [
  makeJayComponent(catalogItemRender_0, productCard.interactiveConstructor),
  makeJayComponent(catalogItemRender_1, productCard.interactiveConstructor),
];
```

#### Compilation Strategy Summary

| Repeater Type | Template Extraction            | Why                              |
| ------------- | ------------------------------ | -------------------------------- |
| `forEach`     | ✅ One render function, reused | Same structure, different data   |
| `slowForEach` | ❌ Separate render per item    | Conditionals resolve differently |

**Implications:**

- **Bundle size**: `forEach` = one template; `slowForEach` = N templates
- **Build time**: `forEach` compiles once; `slowForEach` compiles per item
- **Interactive logic**: Both use plugin's `interactiveConstructor` from `makeJayStackComponent`

### Proposed Contract Format with Props

```yaml
# product-card.jay-contract
name: ProductCard

# Props the component accepts (configuration input)
props:
  - name: productId
    type: string
    required: true
    description: 'The product ID to display'

  - name: showPrice
    type: boolean
    required: false
    default: true
    description: 'Whether to show price'

  - name: variant
    type: enum
    values: [compact, full, featured]
    default: compact

# Output data provided by the component
tags:
  - tag: name
    type: data
    dataType: string
    phase: slow
  - tag: price
    type: data
    dataType: number
    phase: fast
```

### Proposed Usage Syntax

```html
<html>
  <head>
    <!-- Import the component (makes it available) -->
    <script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>

    <!-- Import a list for the repeater -->
    <script
      type="application/jay-headless"
      plugin="wix-stores"
      contract="product-list"
      key="allProducts"
    ></script>
  </head>
  <body>
    <!-- Static props - multiple instances -->
    <section class="featured">
      <jay:product-card productId="prod-hero" variant="featured">
        <h1 class="hero-title">{name}</h1>
      </jay:product-card>
    </section>

    <!-- Dynamic props from repeater -->
    <section class="catalog">
      <div class="grid" forEach="allProducts.items" trackBy="_id">
        <jay:product-card productId="{_id}" variant="compact">
          <article class="card">
            <h2>{name}</h2>
            <span class="price">{price}</span>
          </article>
        </jay:product-card>
      </div>
    </section>
  </body>
</html>
```

### Proposed Data Discovery for Agents

```yaml
# plugin.yaml
name: wix-stores
module: '@wix/stores'

contracts:
  - name: product-card
    contract: ./contracts/product-card.jay-contract
    component: ./components/product-card

# NEW: Data sources that agents can discover
discoverable_data:
  - name: product-ids
    description: 'Available product IDs for product-card'
    generator: ./data/product-ids-generator.ts
    for_props:
      - contract: product-card
        prop: productId
```

```typescript
// ./data/product-ids-generator.ts
import { makeDataGenerator } from '@jay-framework/fullstack-component';
import { PRODUCTS_SERVICE } from '../services';

export const generator = makeDataGenerator()
  .withServices(PRODUCTS_SERVICE)
  .generateWith(async (productsService) => {
    const products = await productsService.getAllProducts();
    return products.map((p) => ({
      value: p._id,
      label: p.name, // Human-readable label
      preview: p.imageUrl, // Optional preview for agent/IDE
    }));
  });
```

**Materialized output:**

```yaml
# build/discoverable-data/wix-stores/product-ids.yaml
generator: product-ids
for_contract: product-card
for_prop: productId
generated_at: '2026-02-04T10:00:00Z'
values:
  - value: 'prod-123'
    label: 'Classic Blue T-Shirt'
    preview: 'https://...'
  - value: 'prod-456'
    label: 'Red Running Shoes'
    preview: 'https://...'
```

## Implementation Plan

### Phase 0: Migrate Headful Components to `jay:` Prefix (Prerequisite)

1. Update compiler to recognize `<jay:component-name>` for existing headful components
2. Migrate all existing templates from `<counter>` to `<jay:counter>` style
3. Update all test fixtures and snapshots
4. Deprecate plain element name support (warning phase)
5. Remove plain element name support (cleanup phase)

This creates a unified syntax foundation before adding headless component instances.

### Phase 1: Contract Props Definition

1. Extend `.jay-contract` format to support `props` section
2. Update contract parser to extract props schema
3. Generate TypeScript types for component props

### Phase 2: Component Instance Syntax

1. Implement `<jay:component-name>` element syntax for headless components
2. Implement prop passing to component instances
3. Parse inline template content within component tags
4. Integrate with existing `forEach` binding

### Phase 3: Repeater Integration

1. Allow headless components inside `forEach` blocks
2. Bind props from repeater context
3. Handle rendering phase coordination (slow/fast/interactive)

### Phase 4: Data Discovery for Agents

1. Add `discoverable_data` to plugin.yaml schema
2. Implement data generator execution
3. Materialize to `build/discoverable-data/`
4. Add CLI command: `jay-stack discover`

## Trade-offs

### Advantages

1. **Flexible widget usage** - Same component, different data
2. **Repeater compatible** - Natural integration with `forEach`
3. **Agent-friendly** - Discoverable prop values enable AI generation
4. **Type-safe** - Props validated against contract schema

### Disadvantages

1. **Complexity** - More concepts to learn (props, instances, discovery)
2. **Multiple rendering** - Performance considerations for many instances
3. **Contract changes** - Need to update existing contracts

### Alternatives Considered

1. **No props, only page-level data** - Rejected: too limiting
2. **React-style components** - Rejected: different mental model
3. **No discovery, agent figures it out** - Rejected: poor DX

## Verification Criteria

**Phase 0: jay: prefix migration**

1. [x] Headful components compile with `<jay:component-name>` syntax
2. [x] All existing tests updated and passing with new syntax
3. [ ] Deprecation warning for old plain element names (deferred - both syntaxes supported)

**Headless component props and instances** 4. [ ] Can render same headless component multiple times with different props 5. [ ] Can use headless component inside `forEach` with bound props 6. [ ] Props are validated at compile time against contract schema 7. [ ] Agents can discover valid prop values via actions/CLI 8. [ ] Static and dynamic props both work correctly 9. [ ] Rendering phases (slow/fast/interactive) work with instances 10. [ ] `slowForEach` generates separate template per item 11. [ ] `forEach` reuses single template for all items

## Open Questions

1. How does caching work with parameterized components?

   - Each `(component, props)` tuple is a separate cache entry?
   - Props that affect slow-phase need cache key inclusion

2. How do we handle props that change at different phases?

   - `productId` is slow (set at build/request time)
   - `quantity` might be interactive

3. Should there be limits on instance count?

   - Performance implications of 100 product cards on a page
   - Lazy rendering / virtualization?

4. How does this interact with linked contracts (#79)?
   - Component with sub-contracts as props?

---

## Implementation Results

### Phase 0: jay: prefix migration (Completed)

**Date:** February 4, 2026

Successfully migrated headful components to use `jay:` prefix syntax.

#### Changes Made

**Compiler changes:**

1. Added helper functions in `jay-html-helpers.ts`:

   - `JAY_COMPONENT_PREFIX = 'jay:'`
   - `hasJayPrefix(tagName)` - checks for prefix
   - `extractComponentName(tagName)` - strips prefix
   - `getComponentName(tagName, importedSymbols)` - detects components (both new and legacy syntax)

2. Updated `jay-html-compiler.ts`:

   - Modified `renderHtmlElement` to use `getComponentName` for component detection
   - Updated `renderNestedComponent` to accept `componentName` parameter
   - Updated `renderChildCompRef` to accept `componentName` for correct type generation
   - Updated sandbox/bridge code paths similarly

3. Updated `jay-html-compiler-react.ts`:

   - Same pattern as main compiler

4. Updated `tag-to-namespace.ts`:
   - Fixed crash when colon-separated tag is not a known namespace (like `jay:` prefix)

**Test fixture updates:**

- Updated 37+ `.jay-html` files across compiler tests and examples
- All component usages changed from `<Counter>` to `<jay:Counter>` style

#### Verification

- **478/478 tests pass** in compiler-jay-html
- **252/252 tests pass** in compiler package
- All workspace tests pass

#### Backward Compatibility

Both syntaxes are currently supported:

- New: `<jay:Counter initialValue={count}/>`
- Legacy: `<Counter initialValue={count}/>` (deprecated)

Legacy syntax still works to allow gradual migration of external projects.

#### Files Modified

```
packages/compiler/compiler-jay-html/lib/jay-target/jay-html-helpers.ts
packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts
packages/compiler/compiler-jay-html/lib/jay-target/tag-to-namespace.ts
packages/compiler/compiler-jay-html/lib/react-target/jay-html-compiler-react.ts
+ 37 .jay-html test fixtures
```
