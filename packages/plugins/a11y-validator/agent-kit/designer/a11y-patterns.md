# Accessible Patterns for Jay-HTML

Common accessibility patterns and how to fix validation errors. Each section corresponds to an a11y-validator rule.

## Images

Every `<img>` must have an `alt` attribute.

```html
<!-- Informative image -->
<img src="product.jpg" alt="Blue running shoes, side view" />

<!-- Decorative image (empty alt) -->
<img src="divider.svg" alt="" />
```

If the image is the only content of a link or button, the `alt` text becomes the accessible name.

## Form Labels

Every form control needs an accessible name. Three valid approaches:

```html
<!-- 1. Wrapping label (simplest) -->
<label>Email <input type="text" /></label>

<!-- 2. Explicit label with for/id -->
<label for="email">Email</label>
<input type="text" id="email" />

<!-- 3. aria-label (when no visible label) -->
<input type="search" aria-label="Search products" />
```

One label per control — don't nest multiple inputs in one `<label>`.

### Checkbox and Radio

Same rules apply:

```html
<label><input type="checkbox" /> I agree to the terms</label>

<!-- Or with for/id -->
<input type="radio" name="size" id="size-s" />
<label for="size-s">Small</label>
```

### ARIA Labeling

`aria-label` must not be empty. `aria-labelledby` must reference existing `id` values:

```html
<!-- Valid -->
<span id="search-label">Search</span>
<input type="text" aria-labelledby="search-label" />

<!-- Invalid: empty aria-label -->
<input type="text" aria-label="" />

<!-- Invalid: missing id -->
<input type="text" aria-labelledby="nonexistent" />
```

## Buttons

Buttons need an accessible name — text content, `aria-label`, or a child `<img>` with `alt`:

```html
<button>Add to Cart</button>
<button aria-label="Close dialog"><svg>...</svg></button>
<button><img src="close.svg" alt="Close" /></button>
```

## Nested Interactive Elements

Links and buttons cannot contain other interactive elements. Browsers restructure the DOM and screen readers announce ambiguous controls.

```html
<!-- Invalid: button inside link -->
<a href="/product">
  Product Name
  <button>Add to Cart</button>
</a>

<!-- Invalid: link inside link -->
<a href="/category">
  Category
  <a href="/subcategory">Subcategory</a>
</a>
```

### Pattern 1 — Separate the interactions

Place each interactive element as a sibling:

```html
<div class="product-card">
  <a href="/product">Product Name</a>
  <button>Add to Cart</button>
</div>
```

For nested links, flatten into a list:

```html
<nav>
  <a href="/category">Category</a>
  <a href="/subcategory">Subcategory</a>
</nav>
```

### Pattern 2 — Stretched link with `::after`

Makes the entire card clickable via CSS while the button stays independent:

```html
<article class="product-card">
  <img src="shoe.jpg" alt="Blue running shoe" />
  <h2>
    <a href="/product/123" class="stretched-link">Blue Runner X</a>
  </h2>
  <p>$89.99</p>
  <button type="button">Add to Cart</button>
</article>
```

```css
.product-card {
  position: relative;
}

.stretched-link::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
}

/* Raise button above the stretched overlay */
button {
  position: relative;
  z-index: 2;
}
```

The `::after` pseudo-element covers the card, making it clickable everywhere — except the button, which sits on a higher `z-index`. No nested interactive elements, fully accessible.

## Duplicate IDs

Each `id` must be unique in the document. Duplicate IDs break `<label for>`, `aria-labelledby`, and anchor links.

```html
<!-- Invalid -->
<label for="name">Name</label>
<input id="name" type="text" />
<input id="name" type="text" />
<!-- duplicate! -->

<!-- Fix: use unique ids -->
<input id="first-name" type="text" />
<input id="last-name" type="text" />
```

## Media Autoplay

Media with `autoplay` must also have `muted`:

```html
<video autoplay muted loop>
  <source src="hero.mp4" type="video/mp4" />
</video>
```

## ARIA Roles

Use valid WAI-ARIA roles. Common roles: `button`, `link`, `navigation`, `search`, `dialog`, `alert`, `status`, `tab`, `tabpanel`, `menu`, `menuitem`.

```html
<div role="navigation" aria-label="Main">...</div>
<div role="search">...</div>
```

Non-interactive elements with `tabindex="0"` must have a role:

```html
<!-- Invalid: focusable but no role -->
<div tabindex="0">Click me</div>

<!-- Fix: add a role -->
<div tabindex="0" role="button">Click me</div>
```

## Tabindex

Avoid positive `tabindex` — it disrupts natural tab order. Use `tabindex="0"` to add an element to the tab order, or `tabindex="-1"` for programmatic focus only.

```html
<!-- Avoid -->
<button tabindex="3">Third</button>

<!-- Prefer: let DOM order determine tab order -->
<button>First</button>
<button>Second</button>
```

## Viewport Zoom

Don't disable user zooming:

```html
<!-- Invalid -->
<meta name="viewport" content="user-scalable=no" />
<meta name="viewport" content="maximum-scale=1" />

<!-- Valid -->
<meta name="viewport" content="width=device-width, initial-scale=1" />
```
