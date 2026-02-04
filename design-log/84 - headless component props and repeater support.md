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

**Answer:** Link to separate files, not inline.

Action descriptions can be large (especially for agents). Storing them inline in `plugin.yaml` would bloat the file and consume agent context when reading plugin configuration.

```yaml
# plugin.yaml - lightweight references
actions:
  - name: searchProducts
    description: ./actions/search-products.md   # Link to detailed description
    handler: ./actions/search-products.ts
    input:
      - name: query
        type: string
      - name: limit
        type: number
        default: 10
```

```markdown
# ./actions/search-products.md
# Search Products Action

Search for products by query string. Returns matching products with their IDs,
names, and prices. Use this to discover valid `productId` values for the 
`product-card` component.

## Input
- `query` (string, required): Search query text
- `limit` (number, optional, default: 10): Maximum results to return

## Output
Array of product objects:
- `_id`: Product identifier (use as `productId` prop)
- `name`: Product display name  
- `price`: Product price

## Example
jay-stack action wix-stores/searchProducts --query="blue shirt"
```

#### Q5c: What format standard should action descriptions follow?

**Options:**

A) **MCP Tool format** - Aligns with Model Context Protocol for AI agents
B) **OpenAPI/JSON Schema** - Industry standard for API descriptions
C) **Custom markdown format** - Simple, human-readable, agent-friendly
D) **Combination** - Structured schema in YAML + markdown description file

**Answer:** [TBD - need input]

**Considerations:**
- MCP: Native format for Cursor/Claude agents, but may evolve
- OpenAPI: Well-established, tooling support, but verbose
- Markdown: Simple for agents to read, easy to write
- Combination: Best of both - schema for validation, markdown for context

**Agent usage via MCP or CLI:**

```bash
jay-stack action wix-stores/searchProducts --query="blue shirt"
# Returns: [{"_id": "prod-123", "name": "Blue Shirt", ...}, ...]
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

#### Source: page.jay-html

```html
<html>
<head>
  <script type="application/jay-data" contract="./page.jay-contract"></script>
  <script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>
  <script type="application/jay-headless" plugin="wix-stores" contract="product-list" key="catalog"></script>
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
      <jay:product-card productId={_id}>
        <article class="product-tile">
          <img src={imageUrl} alt={name} />
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

#### Compiled Output: page.ts

```typescript
import { makeJayStackComponent, partialRender } from '@jay-framework/fullstack-component';
import { makeJayComponent, createSignal } from '@jay-framework/runtime';
import { productCard } from '@wix/stores';
import { productList } from '@wix/stores';
import type { PageContract } from './page.jay-contract';

// Type for the hero product-card instance
interface HeroProductCardViewState {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
}

// Compiled interactive component for hero product-card inline template
const HeroProductCardInteractive = makeJayComponent<
  { viewState: Signals<HeroProductCardViewState>; carryForward: HeroCarryForward },
  { buyNow: HTMLButtonElement }
>((props, refs) => {
  const { viewState } = props;
  
  refs.buyNow.onclick(() => {
    // Interactive behavior here
    console.log('Buy now:', viewState.name());
  });
  
  return {
    render: () => ({
      // Reactive bindings from viewState signals
      name: viewState.name(),
      description: viewState.description(),
      price: viewState.price(),
    }),
  };
});

// Compiled interactive component for catalog item inline template
const CatalogItemInteractive = makeJayComponent<
  { viewState: Signals<HeroProductCardViewState>; carryForward: CatalogCarryForward },
  { addToCart: HTMLButtonElement }
>((props, refs) => {
  const { viewState, carryForward } = props;
  
  refs.addToCart.onclick(() => {
    // Interactive behavior - could call server action
    console.log('Add to cart:', carryForward.productId);
  });
  
  return {
    render: () => ({
      name: viewState.name(),
      price: viewState.price(),
      imageUrl: viewState.imageUrl(),
    }),
  };
});

// Page component definition
export const page = makeJayStackComponent<PageContract>()
  .withProps<PageProps>()
  .withServices(PRODUCTS_SERVICE)
  .withSlowlyRender(async (props, productsService) => {
    // 1. Render page-level slow data
    const pageData = { pageTitle: 'Our Products' };
    
    // 2. Render hero product-card (static productId)
    const heroProduct = await productCard.slowlyRender(
      { productId: 'prod-hero' },
      productsService
    );
    
    // 3. Render catalog list
    const catalogData = await productList.slowlyRender({}, productsService);
    
    // 4. Render each catalog item's product-card
    const catalogItems = await Promise.all(
      catalogData.items.map(item => 
        productCard.slowlyRender({ productId: item._id }, productsService)
      )
    );
    
    return partialRender({
      ...pageData,
      _hero: heroProduct,           // Namespaced for hero instance
      catalog: catalogData,
      _catalogItems: catalogItems,  // Array of product-card ViewStates
    }, {
      heroProductId: 'prod-hero',
      catalogItemIds: catalogData.items.map(i => i._id),
    });
  })
  .withFastRender(async (props, carryForward, productsService) => {
    // Fast phase for hero
    const heroFast = await productCard.fastRender(
      { productId: carryForward.heroProductId },
      carryForward,
      productsService
    );
    
    // Fast phase for each catalog item
    const catalogItemsFast = await Promise.all(
      carryForward.catalogItemIds.map(id =>
        productCard.fastRender({ productId: id }, carryForward, productsService)
      )
    );
    
    return partialRender({
      _hero: heroFast,
      _catalogItems: catalogItemsFast,
    }, carryForward);
  })
  .withInteractive((props, refs, contexts) => {
    // Hero product-card interactive instance
    const heroInstance = HeroProductCardInteractive({
      viewState: props._hero,  // Signals for hero ViewState
      carryForward: contexts.carryForward,
    }, refs.hero);
    
    // Catalog item interactive instances (one per item)
    const catalogInstances = props._catalogItems.map((itemViewState, index) => 
      CatalogItemInteractive({
        viewState: itemViewState,
        carryForward: { 
          ...contexts.carryForward,
          productId: contexts.carryForward.catalogItemIds[index],
        },
      }, refs.catalogItems[index])
    );
    
    return {
      render: () => ({
        pageTitle: props.pageTitle(),
        _hero: heroInstance.render(),
        catalog: props.catalog(),
        _catalogItems: catalogInstances.map(i => i.render()),
      }),
    };
  });
```

#### Key Points from the Compilation

1. **Import the headless component** - `productCard` from plugin provides `slowlyRender`, `fastRender`

2. **Each instance gets its own namespace** - Hero uses `_hero`, catalog items use `_catalogItems[]`

3. **Inline template compiles to `makeJayComponent`** - With ViewState signals and refs from template

4. **Props resolution:**
   - Static props (`productId="prod-hero"`) - resolved at compile time
   - Dynamic props (`productId={_id}`) - resolved from parent context (repeater item)

5. **Phase coordination:**
   - Page's `slowlyRender` calls each headless component's `slowlyRender`
   - Page's `fastRender` calls each headless component's `fastRender`
   - Page's `withInteractive` instantiates compiled inline templates

6. **Repeater handling:**
   - `forEach` items collected in slow phase
   - Each item's product-card rendered in parallel
   - Interactive instances created for each item

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
