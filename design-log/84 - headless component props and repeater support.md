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

<!-- Use with props -->
<jay:product-card productId="prod-123" as="featured1" />
<jay:product-card productId="prod-456" as="featured2" />
```

**Answer:** Option D - Import once, instantiate with data binding.

The template for the headless component is placed within the instance tag, separating import from usage (like ES modules).

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
<jay:product-card productId="prod-123" as="featured1" />
```

B) **Plain element name (contract name)**

```html
<product-card productId="prod-123" as="featured1" />
```

C) **Namespaced with `contract:` prefix**

```html
<contract:product-card productId="prod-123" as="featured1" />
```

**Answer:** Option A - Use `jay:` prefix for consistency.

Headful components currently use plain element names (Option B style). We should migrate headful components to also use the `jay:` prefix for consistency. This is a breaking change requiring test updates, but creates a unified element syntax across the framework.

**Considerations for agent usage:**

- Option A (`jay:`): Clear framework namespace, greppable, 4 extra chars
- Option B (plain): Simplest, but could conflict with HTML custom elements, no namespace isolation
- Option C (`contract:`): Semantically accurate, self-documenting, 9 extra chars

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
} from '@jay-framework/runtime';
import { makeJayComponent, Props, createSignal } from '@jay-framework/component';

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

// Inline template's interactive constructor (handles refs from THIS template)
function HeroProductCardConstructor(
  props: Props<{}>,
  refs: HeroProductCardRefs,
) {
  // Wire up refs defined in inline template
  refs.buyNow.onclick(() => {
    console.log('Buy now clicked');
  });
  
  return {
    render: () => ({}),
  };
}

// Combined: makeJayComponent(render, Constructor) - same pattern as counter.ts
export const HeroProductCard = makeJayComponent(
  heroProductCardRender,
  HeroProductCardConstructor,
);

// ============================================================
// COMPILED INLINE TEMPLATE: Catalog Item (forEach - REUSABLE)
// Source: <jay:product-card productId={_id}> ... </jay:product-card>
// ============================================================

interface CatalogItemRefs {
  addToCart: HTMLElementProxy<ProductCardViewState, HTMLButtonElement>;
}

// Compiled render function - extracted ONCE, reused for all forEach items
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

// Factory: creates constructor with productId in closure
function createCatalogItemConstructor(productId: string) {
  return function CatalogItemConstructor(
    props: Props<{}>,
    refs: CatalogItemRefs,
  ) {
    refs.addToCart.onclick(() => {
      console.log('Add to cart:', productId);
    });
    
    return {
      render: () => ({}),
    };
  };
}

// For forEach: same render function, different constructor per item
export function createCatalogItem(productId: string) {
  return makeJayComponent(
    catalogItemRender,  // Reused render function
    createCatalogItemConstructor(productId),  // Unique constructor with productId
  );
}

// ============================================================
// PAGE-LEVEL TEMPLATE
// ============================================================

interface PageViewState {
  pageTitle: string;
}

interface PageRefs {
  // Page-level refs if any
}

function pageRender(options?: RenderElementOptions) {
  const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
  
  const render = (viewState: PageViewState) =>
    ConstructContext.withRootContext(viewState, refManager, () =>
      e('div', {}, [
        e('h1', {}, [dt((vs) => vs.pageTitle)]),
        e('section', { class: 'hero' }, [
          // Hero product card placeholder - filled by page.ts
        ]),
        e('section', { class: 'catalog' }, [
          e('div', { class: 'grid' }, [
            // Catalog items placeholder - filled by page.ts forEach
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
import { 
  render as pageRender, 
  HeroProductCard, 
  createCatalogItem 
} from './page.jay-html';
import { productCard, productList } from '@wix/stores';
import type { PageContract, PageRefs, PageSlowViewState, PageFastViewState } from './page.jay-contract';

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
      catalogItemIds: catalogData.viewState.items.map(i => i._id),
    },
  };
}

async function renderFastChanging(
  props: PageProps,
  carryForward: PageCarryForward,
) {
  // Fast data for hero
  const heroFast = await productCard.fastRender(
    { productId: carryForward.heroProductId },
    { productId: carryForward.heroProductId },
  );
  
  // Fast data for each catalog item
  const catalogItemsFast = await Promise.all(
    carryForward.catalogItemIds.map(id =>
      productCard.fastRender({ productId: id }, { productId: id })
    )
  );
  
  return {
    viewState: {
      heroProduct: heroFast.viewState,
      catalogItems: catalogItemsFast.map(f => f.viewState),
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
- **Can extract and reuse the template** - compile once, instantiate many

```typescript
// forEach: Single compiled template, reused for all items
const catalogItemTemplate = compileTemplate(`
  <article class="product-tile">
    <h3>{name}</h3>
    <span class="price">{price}</span>
  </article>
`);

// Reuse same template for each item
viewState.catalog.items.forEach((item) => {
  catalogItemTemplate.render(item); // Same template, different data
});
```

#### `slowForEach` (slow phase)

- Each item may produce **different template structure**
- Conditionals, visibility, nested loops can resolve differently per item
- **Cannot extract and reuse** - each item may have unique HTML

```html
<!-- slowForEach: conditionals may differ per item -->
<div slowForEach="products" trackBy="_id">
  <jay:product-card productId="{_id}">
    <h3>{name}</h3>
    <span class="price" if="{hasPrice}">{price}</span>
    <!-- may or may not exist -->
    <span class="badge" if="{isNew}">NEW</span>
    <!-- may or may not exist -->
    <div if="{hasVariants}" forEach="variants">
      <!-- nested loop varies -->
      <span>{variantName}</span>
    </div>
  </jay:product-card>
</div>
```

```typescript
// slowForEach: Each item compiled separately
const renderedItems = await Promise.all(
  viewState.products.map(async (item) => {
    // Each item gets its own template instance
    // because conditionals resolve differently
    const itemViewState = await productCard.slowlyRender({ productId: item._id });

    // Template compiled with this specific item's resolved conditionals
    return compileSlowTemplate(itemViewState, inlineTemplate);
  }),
);
```

#### Compilation Strategy Summary

| Repeater Type | Template Extraction    | Why                              |
| ------------- | ---------------------- | -------------------------------- |
| `forEach`     | ✅ Extract once, reuse | Same structure, different data   |
| `slowForEach` | ❌ Compile per item    | Conditionals may differ per item |

This affects both:

- **Bundle size**: `forEach` produces smaller output (one template)
- **Performance**: `forEach` is faster (template parsed once)

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
      <jay:product-card productId="prod-hero" variant="featured" as="hero">
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

### Phase 1: Contract Props Definition

1. Extend `.jay-contract` format to support `props` section
2. Update contract parser to extract props schema
3. Generate TypeScript types for component props

### Phase 2: Component Instance Syntax

1. Define `<jay:component-name>` element syntax
2. Implement prop passing to component instances
3. Support `as` attribute for data binding key
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

1. [ ] Can render same headless component multiple times with different props
2. [ ] Can use headless component inside `forEach` with bound props
3. [ ] Props are validated at compile time against contract schema
4. [ ] Agents can discover valid prop values via materialized data files
5. [ ] Static and dynamic props both work correctly
6. [ ] Rendering phases (slow/fast/interactive) work with instances

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
