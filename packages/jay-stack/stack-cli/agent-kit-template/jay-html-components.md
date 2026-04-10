# Jay-HTML Component Imports

## Headless Components

Headless components provide data and interactions with no UI. The page or headfull component provides the template.

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

Key-based imports are only available in **pages** (not in headfull FS components).

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

## Headfull Full-Stack Components

Headfull components own their UI and can be made full-stack by adding a `contract` attribute.

### Import Declaration

```html
<head>
  <script
    type="application/jay-headfull"
    src="../components/shared-header"
    names="SharedHeader"
    contract="../components/shared-header/shared-header.jay-contract"
  ></script>
</head>
```

**Attributes:**

- `src` — Path to the component module
- `names` — Component name to import
- `contract` — Path to the contract file (makes the component full-stack with SSR)

### Usage

Same as client-only headfull, with props:

```html
<jay:SharedHeader logoUrl="/logo.png" />
```

Without `contract`, the component is client-only. With `contract`, it participates in slow/fast/interactive phases and is server-side rendered. Use headfull full-stack components for reusable UI with fixed layout that needs SSR (headers, footers, sidebars).

### Headfull FS Component Structure

A headfull FS component has its own `.jay-html` file with the same structure as a page:

```html
<!-- components/header/header.jay-html -->
<html>
  <head>
    <script type="application/jay-data">
      data:
          logoUrl: string
    </script>
  </head>
  <body>
    <header>
      <img src="{logoUrl}" />
      <nav>Navigation here</nav>
    </header>
  </body>
</html>
```

## Nesting Components

### Headfull Inside Headfull

A layout component imports a header component:

```html
<!-- layout/layout.jay-html -->
<html>
  <head>
    <script
      type="application/jay-headfull"
      src="../header/header"
      contract="../header/header.jay-contract"
      names="header"
    ></script>
    <script type="application/jay-data">
      data:
          sidebarLabel: string
    </script>
  </head>
  <body>
    <div class="layout">
      <jay:header logoUrl="/logo.png" />
      <aside>{sidebarLabel}</aside>
    </div>
  </body>
</html>
```

### Headless Inside Headfull

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

Nesting depth is unlimited. Circular imports are detected as errors. Key-based headless imports (`key="..."`) are not allowed inside headfull FS components — use instance-based imports instead.

## Nesting Rules

| Parent component | Can import headfull FS? | Can import headless (instance)? | Can import keyed headless? |
| ---------------- | ----------------------- | ------------------------------- | -------------------------- |
| **Page**         | Yes                     | Yes                             | Yes                        |
| **Headfull FS**  | Yes (recursive)         | Yes (in its own head)           | No                         |
| **Headless**     | No (no template)        | No (no template)                | No (no template)           |

## Complete Example

A homepage with key-based, instance-based, and headfull components:

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
      type="application/jay-headfull"
      src="../components/shared-header"
      names="SharedHeader"
      contract="../components/shared-header/shared-header.jay-contract"
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
    <jay:SharedHeader logoUrl="/logo.png" />
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
