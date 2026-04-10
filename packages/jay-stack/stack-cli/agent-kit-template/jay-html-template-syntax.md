# Jay-HTML Template Syntax

## File Structure

A `.jay-html` file is standard HTML with jay-specific extensions.

```html
<html>
  <head>
    <!-- Page contract (optional — defines page-level data) -->
    <script type="application/jay-data" contract="./page.jay-contract"></script>

    <!-- Explicit route params (for static override routes) -->
    <script type="application/jay-params">
      slug: ceramic-flower-vase
    </script>

    <!-- Headless component imports -->
    <script type="application/jay-headless" plugin="..." contract="..." key="..."></script>

    <!-- Headfull component imports -->
    <script type="application/jay-headfull" src="..." names="..." contract="..."></script>

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

Use the `if` attribute to conditionally show elements.

### Boolean

```html
<span if="inStock">In Stock</span>
<span if="!inStock">Out of Stock</span>
```

### Enum Variant

No quotes around the value:

```html
<div if="type===physical">Ships to your door</div>
<div if="type!==physical">Not a physical product</div>
<div if="status===active">Active</div>
```

### Numeric Comparisons

Compare against numbers or other fields:

```html
<span if="count > 0">You have {count} items</span>
<span if="count <= 0">No items</span>
<button if="currentPage <= 1" disabled>Previous</button>
<span if="price <= budget">Affordable</span>
<span if="available >= required">In stock</span>
```

Operators: `>`, `<`, `>=`, `<=`, `==`, `!=`

### Logical AND / OR

Combine conditions with `&&` and `||`:

```html
<div if="inStock && hasDiscount">Great deal!</div>
<span if="isPromoted || hasDiscount">Has offer</span>
```

Use parentheses for complex expressions:

```html
<div if="(inStock && hasDiscount) || isPromoted">Buyable</div>
<div if="inStock && price > 0">Purchasable</div>
<button if="count <= 0 || isLoading" disabled>Checkout</button>
```

### Rules Summary

- Boolean: `if="flag"` / `if="!flag"`
- Enum: `if="tag===value"` / `if="tag!==value"` (no quotes around value)
- Numeric: `if="count > 0"`, `if="price <= budget"`
- Field comparison: `if="available >= required"`
- Logical: `if="a && b"`, `if="a || b"`, `if="(a || b) && c"`
- Negation: `!` prefix on booleans

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
<button ref="rating.submitButton">Submit</button>
<button ref="mt.happy">+1 Happy</button>
```

**Refs inside forEach** — use the tag path from the contract:

```html
<div forEach="options" trackBy="_id">
  <div forEach="choices" trackBy="choiceId">
    <button ref="choiceButton">{name}</button>
  </div>
</div>
```

## Page-Level Contract

A page can define its own data contract:

```html
<script type="application/jay-data" contract="./page.jay-contract"></script>
```

Tags from the page contract are bound directly (no key prefix).
