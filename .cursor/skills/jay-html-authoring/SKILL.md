---
name: jay-html-authoring
description: Create and edit jay-html template files with data binding, headless components, conditional rendering, loops, and styling. Also covers directory-based routing in jay-stack. Use when creating pages, editing templates, or setting up routes.
---

# Jay-HTML Authoring & Routing

## Jay-HTML File Structure

A `.jay-html` file is standard HTML with jay-specific extensions for data binding, conditions, loops, and headless component integration.

```html
<html>
  <head>
    <!-- Page contract (optional) -->
    <script type="application/jay-data" contract="./page.jay-contract"></script>

    <!-- Headless component imports -->
    <script type="application/jay-headless" plugin="..." contract="..." key="..."></script>

    <!-- Styles -->
    <style>
      /* inline CSS */
    </style>
    <link rel="stylesheet" href="../../styles/theme.css" />
  </head>
  <body>
    <!-- Template with data bindings -->
    <h1>{title}</h1>
  </body>
</html>
```

## Data Binding

Use `{expression}` to bind contract data:

```html
<h1>{productName}</h1>
<!-- simple binding -->
<span>{product.price}</span>
<!-- nested via key -->
<div style="color: {textColor}">{msg}</div>
<!-- in attributes and style -->
<a href="/products/{slug}">{name}</a>
<!-- in attribute values -->
```

## Conditional Rendering

Use the `if` attribute:

```html
<span if="inStock">In Stock</span>
<span if="!inStock">Out of Stock</span>
<div if="type===physical">Ships to your door</div>
<div if="type===virtual">Instant download</div>
```

For variant tags (enum): `if="tagName===value"` (no quotes around value).
Negation: `if="!tagName"` for boolean, `if="tagName!==value"` for enum.

## Loops (forEach / trackBy)

Iterate over repeated sub-contracts:

```html
<li forEach="products" trackBy="id">
  <a href="/products/{slug}">
    <div>{name}</div>
    <div>{price}</div>
  </a>
</li>
```

- `forEach` — the repeated tag name
- `trackBy` — stable unique key for each item (must match contract's `trackBy`)
- Inside the loop, bindings resolve to the **current item's** tags

**Nested loops:**

```html
<div forEach="options" trackBy="_id">
  <h3>{name}</h3>
  <div forEach="choices" trackBy="choiceId">
    <button ref="choiceButton">{name}</button>
  </div>
</div>
```

## Refs (Interactions)

Map elements to contract `interactive` tags using `ref`:

```html
<button ref="addToCart">Add to Cart</button> <input value="{quantity}" ref="quantityInput" />
```

**Key-based headless refs** — prefix with the key:

```html
<button ref="rating.submitButton">Submit</button> <button ref="mt.happy">+1 Happy</button>
```

**Refs inside forEach:**

```html
<div forEach="options" trackBy="_id">
  <div forEach="choices" trackBy="choiceId">
    <button ref="choiceButton">{name}</button>
  </div>
</div>
```

## Headless Components

### Pattern 1: Key-Based Import

Data merged into parent ViewState under a key. Use when you have **one instance** of a component per page.

```html
<head>
  <script
    type="application/jay-headless"
    plugin="wix-stores"
    contract="product-page"
    key="productPage"
  ></script>
</head>
<body>
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
</body>
```

### Pattern 2: Instance-Based (jay: prefix)

Each instance has its own props and inline template. Use when you have **multiple instances** or need to pass **props**.

First, declare the headless import **without** a `key`:

```html
<head>
  <script
    type="application/jay-headless"
    plugin="product-widget"
    contract="product-widget"
  ></script>
</head>
```

Then use `<jay:contract-name>` tags with props:

```html
<!-- Static props -->
<jay:product-widget productId="prod-1">
  <h3>{name}</h3>
  <div>${price}</div>
  <button ref="addToCart">Add</button>
</jay:product-widget>

<!-- Multiple instances -->
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

### Headfull Components

Import a local component (with its own rendering logic):

```html
<script type="application/jay-headfull" src="./todo" names="TodoComponent"></script>
<jay:TodoComponent props="{todoProps}"></jay:TodoComponent>
```

## Styling

**Inline `<style>`:**

```html
<head>
  <style>
    .product-card {
      border: 1px solid #ccc;
      padding: 16px;
    }
    .price {
      font-weight: bold;
      color: #2d7d2d;
    }
  </style>
</head>
```

**External stylesheets:**

```html
<link rel="stylesheet" href="../../styles/theme.css" />
```

**Dynamic style bindings:**

```html
<div style="color: {textColor}; width: {width}px">styled</div>
```

## Page-Level Contract

A page can define its own data contract in `page.jay-contract`:

```html
<script type="application/jay-data" contract="./page.jay-contract"></script>
```

This declares the page's own ViewState. Tags are bound directly (no key prefix).

---

## Directory-Based Routing

### Route Structure

Pages live under `src/pages/`. Directory names become URL segments.

```
src/pages/
├── page.jay-html                    → /
├── about/
│   └── page.jay-html                → /about
├── products/
│   ├── page.jay-html                → /products
│   └── [slug]/
│       └── page.jay-html            → /products/:slug
├── blog/
│   ├── page.jay-html                → /blog
│   └── [[slug]]/
│       └── page.jay-html            → /blog/:slug  (optional param)
└── files/
    └── [...path]/
        └── page.jay-html            → /files/*  (catch-all)
```

### Dynamic Routes

| Syntax       | Meaning            | Example                                 |
| ------------ | ------------------ | --------------------------------------- |
| `[param]`    | Required parameter | `[slug]` → `/products/:slug`            |
| `[[param]]`  | Optional parameter | `[[slug]]` → `/blog` or `/blog/my-post` |
| `[...param]` | Catch-all          | `[...path]` → matches any sub-path      |

### Route Priority

Static routes match before dynamic routes:

1. **Static** segments (exact match) — highest priority
2. **`[param]`** — required dynamic param
3. **`[[param]]`** — optional param
4. **`[...param]`** — catch-all — lowest priority

You can create a static override alongside a dynamic route:

```
src/pages/products/
├── [slug]/page.jay-html              # dynamic: /products/:slug
└── ceramic-flower-vase/page.jay-html # static override: /products/ceramic-flower-vase
```

### Page Files

Each page directory can contain:

| File                | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `page.jay-html`     | Template (required for rendering)                |
| `page.jay-contract` | Page-level data contract                         |
| `page.conf.yaml`    | Configuration — which headless components to use |

**`page.conf.yaml` example:**

```yaml
used_components:
  - plugin: '@jay-framework/wix-stores'
    contract: product-page
    key: productPage
```

### Dynamic Route with Load Params

For SSG with dynamic routes, the plugin component provides a `loadParams` generator. Discover available params:

```bash
yarn jay-stack params wix-stores/product-page
# Output: [{"slug": "blue-shirt"}, {"slug": "red-hat"}, ...]
```

The contract may declare params:

```yaml
name: product-page
params:
  slug: string
tags:
  - tag: productName
    type: data
    dataType: string
```

## Complete Example

A product page at `src/pages/products/[slug]/page.jay-html`:

```html
<html>
  <head>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
    <script
      type="application/jay-headless"
      plugin="product-rating"
      contract="product-rating"
      key="rating"
    ></script>
    <link rel="stylesheet" href="../../../styles/product.css" />
  </head>
  <body>
    <h1>{name}</h1>
    <h2>${price}</h2>
    <p>{sku}</p>

    <div if="type===physical">Shipping available</div>
    <div if="type===virtual">Digital download</div>
    <div if="!inStock">Out of stock</div>

    <div if="inStock">
      <button ref="add-to-cart">Add to Cart</button>
    </div>

    <!-- Headless rating widget (key-based) -->
    <div>
      <span>★ {rating.rating} ({rating.totalReviews} reviews)</span>
      <button ref="rating.star1">★</button>
      <button ref="rating.star2">★</button>
      <button ref="rating.star3">★</button>
      <button ref="rating.star4">★</button>
      <button ref="rating.star5">★</button>
      <p>Your rating: {rating.userRating}</p>
      <button ref="rating.submitButton">Submit</button>
    </div>
  </body>
</html>
```
