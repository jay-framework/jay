# Jay-HTML Syntax Reference

## File Structure

A `.jay-html` file is standard HTML with jay-specific extensions.

```html
<html>
  <head>
    <!-- Page contract (optional — defines page-level data) -->
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
<!-- simple -->
<span>{product.price}</span>
<!-- nested via key -->
<div style="color: {textColor}">{msg}</div>
<!-- in attributes -->
<a href="/products/{slug}">{name}</a>
<!-- interpolated in attr values -->
```

## Conditional Rendering

Use the `if` attribute:

```html
<span if="inStock">In Stock</span>
<span if="!inStock">Out of Stock</span>
<div if="type===physical">Ships to your door</div>
<div if="type===virtual">Instant download</div>
```

Rules:

- Boolean: `if="tagName"` / `if="!tagName"`
- Enum variant: `if="tagName===value"` / `if="tagName!==value"` (no quotes around value)
- Negation: `!` prefix

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

- `forEach` — the repeated tag name from the contract
- `trackBy` — stable unique key for each item (must match contract's trackBy)
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
<button ref="addToCart">Add to Cart</button>
<input value="{quantity}" ref="quantityInput" />
<a ref="productLink" href="/products/{slug}">{name}</a>
<select ref="sizeSelector">
  ...
</select>
```

Match the element type to the contract's `elementType`:

- `HTMLButtonElement` → `<button>`
- `HTMLInputElement` → `<input>`
- `HTMLAnchorElement` → `<a>`
- `HTMLSelectElement` → `<select>`

**Key-based headless refs** — prefix with the key:

```html
<button ref="rating.submitButton">Submit</button> <button ref="mt.happy">+1 Happy</button>
```

**Refs inside forEach** — use the tag path from the contract:

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

## Page-Level Contract

A page can define its own data contract:

```html
<script type="application/jay-data" contract="./page.jay-contract"></script>
```

Tags from the page contract are bound directly (no key prefix).

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

## Complete Example

A homepage with key-based and instance-based headless components:

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
