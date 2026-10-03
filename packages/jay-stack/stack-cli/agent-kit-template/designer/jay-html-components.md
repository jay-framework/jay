# Jay-HTML Component Imports

## Headless Components

`Headless components provide data and interactions with no UI of their own. The page (or a consuming component) provides the template. **Every component a Jay Stack page composes is headless** — imported with `application/jay-headless`.

The page can supply that template two ways: **write the `<jay:X>` body by hand**, or **flatten one the component ships** — a _design-system element_. **Prefer flattening a shipped template** when the component provides one: a component can offer one or more `.jay-html` templates, so add `template=` to the import and run `jay-stack sync` to copy a chosen one into your page, then edit the copy. You get UI that stays consistent across pages and upgrades in one step, with `jay-stack validate` tracking drift from the source and `jay-stack sync` re-flattening it. Hand-author the `<jay:X>` body only when no template is shipped. See [design-system-guide.md](design-system-guide.md) for the full model.

### Pattern 1: Key-Based Import

Data merged into parent ViewState under a key. Use when you have **one instance** of a component per page.

Declare in `<head>` with a `key` attribute:

```html
<head>
  <script
    type="application/jay-headless"
    plugin="wix-stores"
    contract="product-page"
    key="productPage"
  ></script>
</head>
```

Access data and refs with the key prefix:

```html
<h1>{productPage.productName}</h1>
<span>{productPage.price}</span>
<button ref="productPage.addToCartButton">Add to Cart</button>

<!-- Nested repeated sub-contracts -->
<div forEach="productPage.options" trackBy="_id">
  <h3>{name}</h3>
  <div forEach="choices" trackBy="choiceId">
    <button ref="choiceButton">{name}</button>
  </div>
</div>
```

Key-based imports are only available in **pages** (not in shared full-stack components).

**Important:** Do NOT use `<jay:keyName>` for key-based imports. The key is for ViewState access (`{key.field}`), not for inline elements. `<jay:>` tags use the **contract name**, not the key.

### Pattern 2: Instance-Based (jay: prefix)

Multiple instances with props and inline templates. Use when you need **multiple instances** or need to pass **props**.

Declare in `<head>` **without** a `key`:

```html
<head>
  <script
    type="application/jay-headless"
    plugin="product-widget"
    contract="product-widget"
  ></script>
</head>
```

Use `<jay:contract-name>` tags with props:

```html
<!-- Static props — each instance renders independently -->
<jay:product-widget productId="prod-1">
  <h3>{name}</h3>
  <div>${price}</div>
  <button ref="addToCart">Add</button>
</jay:product-widget>

<jay:product-widget productId="prod-2">
  <h3>{name}</h3>
  <button ref="addToCart">Add</button>
</jay:product-widget>
```

**With bindings from page data** (props from keyed components or page ViewState):

```html
<!-- p is a keyed headless component providing product data -->
<jay:category-products categorySlug="{p.categorySlug}" limit="4">
  <div class="product-card">
    <h3>{name}</h3>
    <span>{price}</span>
  </div>
</jay:category-products>
```

Use `{path}` syntax to bind props to values from the page's ViewState. The binding is resolved at render time — works with both slow and fast phase data.

**With forEach** (dynamic props from parent data):

```html
<div forEach="featuredProducts" trackBy="_id">
  <jay:product-widget productId="{_id}">
    <h3>{name}</h3>
    <div>${price}</div>
    <button ref="addToCart">Add</button>
  </jay:product-widget>
</div>
```

Inside `<jay:...>`, bindings resolve to **that instance's** contract tags (not the parent).

### Choosing between patterns

| Need                                                   | Pattern        | Key?            | Tag?                                         |
| ------------------------------------------------------ | -------------- | --------------- | -------------------------------------------- |
| One component per page, data across the whole template | Key-based      | `key="product"` | No `<jay:>` — use `{product.field}` bindings |
| Multiple instances, each with own props and template   | Instance-based | No key          | `<jay:contract-name prop="...">`             |
| One instance but with custom inline template           | Instance-based | No key          | `<jay:contract-name>`                        |

**Never combine both:** a component imported with `key` cannot also be used as `<jay:>`. These are mutually exclusive patterns.

### Prop binding summary

| Syntax                            | Resolves to          | Example                   |
| --------------------------------- | -------------------- | ------------------------- |
| `prop="literal"`                  | Literal string value | `productId="prod-1"`      |
| `prop="{field}"`                  | Page ViewState field | `slug="{p.categorySlug}"` |
| `prop="{field}"` (inside forEach) | ForEach item field   | `productId="{_id}"`       |

### Prop phase constraints

Contract props can declare a `phase` (defaults to `slow`). The binding source must be available at that phase:

- A **slow** prop (default) must bind to a literal, a route param, or a slow-phase tag
- A **fast** prop can also bind to fast-phase tags

If a slow prop binds to a fast-phase field, `jay-stack validate` flags an error — the component's slow render would receive an empty value.

```yaml
# In the component's contract:
props:
  - name: categorySlug
    type: string
    phase: slow # Must be available at build time
  - name: filter
    type: string
    phase: fast # Only needs to be available at request time
```

## Full-Stack Shared Components (Headless)

A shared UI section with its own logic — a site header, a footer, a side nav — is a **headless full-stack
component**: logic authored with `makeJayStackComponent` against a `.jay-contract`, with its template
provided by the consuming page. It supports server rendering (slow/fast/interactive phases). Like every
Jay Stack component, it is imported with `application/jay-headless` — **not** `application/jay-headfull`
(see [Headfull components are not for Jay Stack](#headfull-components-are-not-for-jay-stack) below).

Each lives in its own subdirectory under `src/components/` with three files: `.ts`, `.jay-html` (its
source template), and `.jay-contract`. The production build only discovers server-side component modules
from `src/components/` and `src/plugins/`. Placing them inside page directories works in dev mode but
fails in production.

### Import Declaration

Import it like any coded headless component — `src=` for the logic, `contract=` for the data shape, and
`template=` so its markup can be flattened into your page:

```html
<head>
  <script
    type="application/jay-headless"
    src="../components/shared-header/shared-header"
    contract="../components/shared-header/shared-header.jay-contract"
    template="../components/shared-header/shared-header.jay-html"
  ></script>
</head>
```

**Attributes:**

- `src` — path to the component logic (include the filename, not just the directory)
- `contract` — path to the component's `.jay-contract` file
- `template` — path to the component's source `.jay-html`, so `jay-stack sync` can flatten its markup
  into the region

### Usage

Place a `<jay:X>` region (the tag is the contract's `name:`) and run `jay-stack sync` to flatten its body:

```html
<jay:SharedHeader ref="header" logoUrl="/logo.png" />
```

After sync the region carries a flattened, editable copy of the component's template. See
[design-system-guide.md](design-system-guide.md) for drift, facet-marking, and upgrades.

> **Route params:** instance-based components do not receive route params directly. To pass a route param,
> expose it through the page's ViewState and bind it as a prop: `<jay:SideNav activePage="{activePage}" />`.
> See [routing.md](routing.md) for the full pattern.

### Component Structure

Each shared full-stack component needs three files in its subdirectory under `src/components/`:

**`.jay-contract`** — declares props. Tags are optional (use `tags: []` or omit for structural components):

```yaml
# components/site-header/site-header.jay-contract
name: SiteHeader
props:
  - name: logoUrl
    type: string
    required: true
```

**`.ts`** — component code. Must use `makeJayStackComponent` with `.withProps()` matching the contract props:

```typescript
// components/site-header/site-header.ts
import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { SiteHeaderContract, SiteHeaderProps } from './site-header.jay-html';

export const siteHeader = makeJayStackComponent<SiteHeaderContract>()
  .withProps<SiteHeaderProps>()
  .withFastRender(async (props) => phaseOutput({ logoUrl: props.logoUrl }, {}));
```

For a structural component with only props and no data logic, `.withFastRender` passes props through as ViewState.

**`.jay-html`** — the template:

```html
<!-- components/site-header/site-header.jay-html -->
<html>
  <head>
    <script type="application/jay-data" contract="./site-header.jay-contract"></script>
  </head>
  <body>
    <header>
      <img src="{logoUrl}" />
      <nav>Navigation here</nav>
    </header>
  </body>
</html>
```

### Headfull components are not for Jay Stack

`application/jay-headfull` is the **lower-level Jay** component model: logic bundled with its _own_ template
via `makeJayComponent`, imported with `src=` + `names=` and **no** `contract=`. It has no server rendering,
so **it is never used directly in a Jay Stack page**. A `jay-headfull` import that carries a `contract=`
attribute is a **hard build error** (DL#196) — declare the component with `application/jay-headless` and
flatten it into a `<jay:X>` region instead. Reach for `makeJayComponent` / headfull only in standalone,
client-only Jay apps, never in Jay Stack.

## Customizing Component Markup — flatten, then edit

To reuse a component but tweak **this one instance** — a label, an image, whether a paragraph appears, a
container's children — you **flatten** (copy) its template into your page and edit the copy. There is no
`<override>` tag; you edit real markup and mark the parts you own.

Give the import a `template=` provenance marker, place the region, and run `jay-stack sync` to fill it:

```html
<head>
  <script
    type="application/jay-headless"
    contract="./components/pricing-card/pricing-card.jay-contract"
    template="./components/pricing-card/pricing-card.jay-html"
  ></script>
</head>
<body>
  <!-- after `jay-stack sync` fills the body, edit it freely -->
  <jay:pricing-card ref="hero">
    <button class="cta">Start free trial</button>
    <!-- text rewritten; mark the facet you own so sync keeps it -->
  </jay:pricing-card>
</body>
```

- **Replace content:** rewrite the element's text/children in the copy; mark the element `override="children"`.
- **Change an attribute:** edit it; mark `override="<attr>"` (e.g. `override="src"`). Others reconcile.
- **Change one style property:** edit it; mark `override="style.<prop>"`. Other props reconcile.
- **Remove an element:** delete it and mark the parent `override="children"` (else `sync` restores it).
- **Own a whole node:** mark it with a bare `override`.

`{binding}` expressions inside the region resolve against the **component's own** contract, exactly as its
source template does. `jay-stack validate` reports any unmarked edit as drift, and `jay-stack sync`
re-flattens from the current source while preserving your marked facets.

**See [design-system-guide.md](design-system-guide.md)** for the full model: creating design-system
elements, reading drift warnings, the complete facet-marking vocabulary (markup `override` + CSS
`jay:override`), and upgrading with `sync`.

## Nesting Components

Components nest by importing other headless components in their own `<head>` and composing them in their
template.

### A shared component composing another shared component

A layout component flattens a header component:

```html
<!-- layout/layout.jay-html -->
<html>
  <head>
    <script
      type="application/jay-headless"
      src="../header/header"
      contract="../header/header.jay-contract"
      template="../header/header.jay-html"
    ></script>
    <script type="application/jay-data">
      data:
          sidebarLabel: string
    </script>
  </head>
  <body>
    <div class="layout">
      <jay:header ref="header" logoUrl="/logo.png" />
      <aside>{sidebarLabel}</aside>
    </div>
  </body>
</html>
```

### A shared component using a plugin widget

A header component uses a headless plugin widget:

```html
<!-- header/header.jay-html -->
<html>
  <head>
    <script type="application/jay-headless" plugin="my-plugin" contract="cart-indicator"></script>
    <script type="application/jay-data">
      data:
          logoUrl: string
    </script>
  </head>
  <body>
    <header>
      <img src="{logoUrl}" />
      <jay:cart-indicator>
        <span class="count">{itemCount}</span>
      </jay:cart-indicator>
    </header>
  </body>
</html>
```

Nesting depth is unlimited. Circular imports are detected as errors. Key-based headless imports
(`key="..."`) are only allowed in pages — inside a shared component use instance-based (`<jay:X>`) imports.

## Nesting Rules

| Parent component            | Can compose full-stack components? | Can import instance headless? | Can import keyed headless? |
| --------------------------- | ---------------------------------- | ----------------------------- | -------------------------- |
| **Page**                    | Yes                                | Yes                           | Yes                        |
| **Full-stack component**    | Yes (recursive)                    | Yes (in its own head)         | No                         |
| **Keyed / plugin headless** | No (consumer owns the template)    | No                            | No                         |

## Complete Example

A homepage with key-based, instance-based, and shared full-stack components — all headless:

```html
<html>
  <head>
    <script
      type="application/jay-headless"
      plugin="mood-tracker"
      contract="mood-tracker"
      key="mt"
    ></script>
    <script
      type="application/jay-headless"
      plugin="product-widget"
      contract="product-widget"
    ></script>
    <script
      type="application/jay-headless"
      src="../components/shared-header/shared-header"
      contract="../components/shared-header/shared-header.jay-contract"
      template="../components/shared-header/shared-header.jay-html"
    ></script>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
    <style>
      .section {
        margin: 20px 0;
        padding: 10px;
      }
      .product-card {
        border: 1px solid #ccc;
        padding: 10px;
        display: inline-block;
      }
    </style>
  </head>
  <body>
    <jay:SharedHeader ref="header" logoUrl="/logo.png" />
    <h1>Homepage</h1>

    <!-- Key-based: mood tracker -->
    <div class="section">
      <div>Happy: {mt.happy} <button ref="mt.happy">more</button></div>
      <span if="mt.currentMood === happy">:)</span>
      <span if="mt.currentMood === sad">:(</span>
    </div>

    <!-- Instance-based: static product widgets -->
    <div class="section">
      <jay:product-widget productId="1">
        <h3>{name}</h3>
        <div>${price}</div>
        <span if="inStock">In Stock</span>
        <button ref="addToCart">Add</button>
      </jay:product-widget>
    </div>

    <!-- Instance-based: dynamic from forEach -->
    <div class="section">
      <div forEach="featuredProducts" trackBy="_id">
        <div class="product-card">
          <jay:product-widget productId="{_id}">
            <h3>{name}</h3>
            <div>${price}</div>
            <button ref="addToCart">Add</button>
          </jay:product-widget>
        </div>
      </div>
    </div>
  </body>
</html>
```
