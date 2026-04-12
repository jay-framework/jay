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
