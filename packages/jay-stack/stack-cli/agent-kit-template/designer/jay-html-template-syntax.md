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

    <!-- SEO head tags (support {binding} syntax) -->
    <title>{productPage.name} | My Store</title>
    <meta name="description" content="{productPage.description}" />
    <link rel="canonical" href="https://mystore.com/products/{productPage.slug}" />

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

## Head Tag Bindings

`<title>`, `<meta>`, and `<link>` in `<head>` support `{binding}` syntax — the same expressions used in `<body>`. Bindings resolve against the merged ViewState at SSR time.

```html
<head>
  <title>{productPage.name} | My Store</title>
  <meta name="description" content="{productPage.description}" />
  <link rel="canonical" href="https://mystore.com/products/{productPage.slug}" />
</head>
```

If a headless component also provides head tags via `phaseOutput({ headTags })`, the **template wins** — template head tags override component-provided ones. This lets you customize the head while components provide defaults.

Canonical URLs must be absolute (`https://...`). The `{binding}` syntax can be used for the dynamic part (e.g., slug).

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

## Boolean Attributes

HTML boolean attributes (`disabled`, `checked`, `hidden`, `readonly`) can be bound to contract data:

```html
<button disabled="isSubmitting">Submit</button>
<!-- disabled when isSubmitting is true -->
<button disabled="!inStock">Add to Cart</button>
<!-- disabled when inStock is false -->
<input type="checkbox" checked="isSelected" />
<!-- checked when isSelected is true -->
<div hidden="!isVisible">Content</div>
<!-- hidden when isVisible is false -->
```

- Set the attribute value to a **boolean tag name** — the attribute is present when true, absent when false
- Use `!` prefix to negate: `disabled="!enabled"` means disabled when enabled is false
- Without a value (`disabled` alone), the attribute is always present (standard HTML behavior)

## Conditional Rendering

Use the `if` attribute to conditionally show elements.

### Boolean

```html
<span if="inStock">In Stock</span> <span if="!inStock">Out of Stock</span>
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

### String Comparison

For string-typed tags, the right side of `===`/`!==` resolves as a **field reference**. Use quotes for string literals:

```html
<!-- Field-to-field comparison -->
<a if="url === currentPath" class="active">Current page</a>

<!-- Literal comparison (use quotes) -->
<div if="status === 'pending'">Pending approval</div>
```

For enum-typed tags, the right side remains a variant literal (no quotes needed) — see Enum Variant above.

### Starts With (`^=`)

Check if a string starts with a prefix — useful for section-level highlighting in navigation:

```html
<a if="jay.url.path ^= '/docs/designer'" class="section-active">Designer</a>
<a if="currentPath ^= sectionUrl" class="active">{label}</a>
```

Works with both field references and quoted literals.

### Built-in Bindings (`jay.`)

The `jay.` prefix provides framework values in page templates:

| Binding        | Value                          | Example                  |
| -------------- | ------------------------------ | ------------------------ |
| `jay.params.X` | Route param from `[X]` segment | `jay.params.slug`        |
| `jay.url.path` | Current URL pathname           | `/docs/designer/routing` |

Available at all render phases (slow, fast, interactive). Use in text bindings, prop bindings, and conditionals:

```html
<h1>Current: {jay.url.path}</h1>
<jay:Sidebar activePage="{jay.params.slug}" currentPath="{jay.url.path}" />
<a if="jay.url.path ^= '/docs'" class="docs-active">Docs</a>
```

`jay.` bindings are available in **page templates only** — headfull components receive this data via props.

### Choosing the Right Condition Type

The contract determines how conditions work. Choose the data type based on the use case:

| Use case                      | Contract type    | Condition syntax     | Example                    |
| ----------------------------- | ---------------- | -------------------- | -------------------------- |
| Show/hide a section           | `boolean`        | `if="flag"`          | `if="inStock"`             |
| Switch between known states   | `variant` (enum) | `if="tag === value"` | `if="status === active"`   |
| Compare against another field | `string`         | `if="a === b"`       | `if="url === currentPath"` |
| Compare against a literal     | `string`         | `if="a === 'text'"`  | `if="role === 'admin'"`    |
| Match URL prefix              | `string`         | `if="a ^= b"`        | `if="path ^= '/docs'"`     |
| Threshold / range             | `number`         | `if="a > n"`         | `if="count > 0"`           |

**Boolean** — best for simple on/off states. The contract declares `type: variant, dataType: boolean`. Most conditions are booleans.

**Enum** — best when there's a fixed set of known values (e.g., `active | inactive | pending`). The compiler validates that the value exists in the enum. Use for mutually exclusive states where each value maps to different UI.

**String** — best for dynamic comparison where values aren't known at contract time (URLs, slugs, user input). The right side of `===` resolves as a field reference; use quotes for literals. Also supports `^=` for prefix matching.

### Rules Summary

- Boolean: `if="flag"` / `if="!flag"`
- Enum: `if="tag === value"` / `if="tag !== value"` (no quotes around value)
- String field: `if="url === currentPath"` (bare identifier = field)
- String literal: `if="url === '/about'"` (quoted = literal)
- Starts with: `if="path ^= prefix"` / `if="path ^= '/docs'"`
- Numeric: `if="count > 0"`, `if="price <= budget"`
- Field comparison: `if="available >= required"`
- Logical: `if="a && b"`, `if="a || b"`, `if="(a || b) && c"`
- Negation: `!` prefix on booleans

### Expression limits (important)

Jay-html expressions resolve **contract or page tag names only**. They are **not** JavaScript — even when the syntax looks similar (`===`, `&&`, `> 0`).

❌ **Invalid** — property access, indexing, or method calls:

```html
<p if="items.length===0">No items</p>
<!-- looks for a tag named "items.length" -->
<span>{user.name.split(' ')[0]}</span>
<!-- no method calls or bracket indexing -->
```

✅ **Valid** — expose derived state in the contract or in `page.ts` ViewState:

```html
<p if="!hasItems">No items</p>
<span if="itemCount > 0">You have {itemCount} items</span>
```

| Need            | Contract / ViewState tag     | Jay-HTML             |
| --------------- | ---------------------------- | -------------------- |
| Empty list hint | `hasItems: boolean` variant  | `if="!hasItems"`     |
| Count-based UI  | `itemCount: number` data tag | `if="itemCount===0"` |

See [contracts/examples/category-list.md](../contracts/examples/category-list.md) (`hasCategories`).

### Common Errors

Invalid expressions produce a visible `[INVALID: expression]` marker in the page instead of crashing. The validation message includes the parse error and a pointer to this guide.

| Error                          | Cause                                                                | Fix                                                      |
| ------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------- |
| `Expected "." or identifier`   | Curly braces in non-expression context (e.g., CSS in body `<style>`) | Move `<style>` to `<head>` or use body styles per DL#164 |
| `unexpected operator "^="`     | Using `^=` with an older framework version                           | Update framework or use `===` instead                    |
| `Unknown enum value "X"`       | Comparing against a value not in the enum                            | Check the contract for valid enum values                 |
| `the data field [X] not found` | Referencing a field not in the contract                              | Check the contract tags for available fields             |

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
- **Do not combine `if` and `forEach` on the same element.** Use a wrapper: `<div if="..."><div forEach="...">...</div></div>`

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

## Page-Level Contract

A page can define its own data contract:

```html
<script type="application/jay-data" contract="./page.jay-contract"></script>
```

Tags from the page contract are bound directly (no key prefix).
