# Jay-HTML Styling

## Inline Styles

Add `<style>` blocks in `<head>`:

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

## Styling a design-system region (`@scope` + `:scope`)

CSS for a `<jay:X>` **design-system element** (a region with `template=` provenance) is not written as plain
page rules — it lives in an `@scope (.<ref>)` block, and the component's own root rule must target `:scope`,
not its block class (inside `@scope`, a class selector matches descendants of the scope root only). This has
its own rules and is covered in full in
[design-system-guide.md → The shape of a region's CSS](design-system-guide.md#the-shape-of-a-regions-css).
The plain-`<style>` patterns on this page apply to ordinary page markup.

## External Stylesheets

Link external CSS files:

```html
<link rel="stylesheet" href="../../styles/theme.css" />
```

## Dynamic Style Bindings

Use `{expression}` inside `style` attribute values:

```html
<div style="color: {textColor}; width: {width}px">styled</div>
<div style="margin: 10px; color: {color}; padding: 20px">mixed static and dynamic</div>
<div style="background-color: {bgColor}; font-size: {fontSize}px">with units</div>
```

## Class Binding

### Static Classes

```html
<div class="button primary">Click me</div>
```

### Dynamic Class Value

Bind a contract value as a class name:

```html
<div class="button {variant}">Click me</div>
```

### Conditional Class

Add a class only when a condition is true:

```html
<div class="{isActive ? active}">Tab</div>
<div class="{hasItems ? has-items}">Cart</div>
```

### Ternary Class

Switch between two classes based on a condition:

```html
<div class="{isPrimary ? primary : secondary}">Button</div>
<div class="{isExpanded ? expanded : collapsed}">Panel</div>
```

### Combined Classes

Mix static, dynamic, and conditional classes:

```html
<div class="button {isPrimary ? primary : secondary}">Click me</div>
<a class="cart-indicator {hasItems ? has-items} {isLoading ? is-loading}">Cart</a>
<div class="first-class {bool1 ? main : second} {!bool1 ? third : forth}">mixed</div>
```

### With Enum Conditions

```html
<div class="{status === active ? highlighted}">Item</div>
```

### Class Binding Rules

- Static classes are always present: `class="button"`
- `{value}` inserts the contract value as a class name
- `{condition ? class}` adds `class` when condition is truthy
- `{condition ? classA : classB}` switches between two classes
- `{!condition ? class}` uses negation
- Multiple bindings can be combined in one `class` attribute

## Viewport Height & Google Search Console

Googlebot's Web Rendering Service does **not** render at a normal phone height. To capture lazy-loaded and
below-the-fold content in one pass, it renders the page once into a **very tall viewport**
(~9,000–12,000px). Any element sized to a fraction of viewport height resolves against that tall value:

```css
.hero {
  min-height: 100vh;
} /* phone: ~800px.  Googlebot: ~12,000px. */
```

On a **top-level container** (`<html>`/`<body>`/`<main>`, or a direct child of `<body>`/`<main>`) that
makes the section enormous in the crawler's render — distorting Search Console screenshots and mobile
usability / layout signals. The `design-viewport-height` validator flags unbounded viewport-height units
(`vh`, `svh`, `lvh`, `dvh`, `vmax`) on these containers.

**Swapping the unit is NOT a fix.** `svh`/`lvh`/`dvh` all resolve against the same tall viewport under
Googlebot (there is no browser chrome to differentiate them), so `vh → dvh` changes nothing here.

Choose the fix by what the container holds:

- **Text-heavy section** — don't force full-viewport height at all. Let content determine height, or chain
  from a bounded ancestor:

  ```css
  main {
    min-height: 100%;
  } /* inherits a real height, not the viewport */
  ```

- **Hero / visual section** that genuinely wants a full-screen feel — cap it, and scope the viewport height
  to a real screen via a media query so it never applies to Googlebot's tall canvas:

  ```css
  .hero {
    max-height: 900px;
  }
  @media (min-width: 480px) {
    .hero {
      min-height: 100vh;
    }
  }
  ```

  A `max-height` in an **absolute** unit (`px`/`rem`, or `%` of a bounded ancestor) clears the warning. A
  `max-height` that also uses a viewport unit (`max-height: 100vh`) does **not** — it caps against the same
  ~12,000px viewport.

- **Overlay / modal / drawer** that is out of flow (`position: fixed/absolute/sticky`) — this is safe (it
  doesn't expand the document canvas) and the validator already ignores it. If a false positive slips
  through, suppress it per-page (see `validation-guide.md`):

  ```html
  <script type="application/jay-validations">
    design-system:
      allow-viewport-height: true
  </script>
  ```
