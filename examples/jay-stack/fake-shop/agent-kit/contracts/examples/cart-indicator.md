# Example: Cart Indicator

A simple flat contract for a header widget. Shows phase choices and the difference between data, variant, and interactive tags.

```yaml
name: cart-indicator
description: Cart indicator showing item count, typically used in site header.

tags:
  - tag: itemCount
    type: data
    dataType: number
    phase: fast+interactive
    description: Total number of items in cart

  - tag: hasItems
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether cart has any items

  - tag: cartButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to open cart

  - tag: cartLink
    type: interactive
    elementType: HTMLAnchorElement
    description: Link to cart page

  - tag: isLoading
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether cart data is loading

  - tag: justAdded
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Briefly true after an item is added (for animation)
```

## Why these choices

- **Everything is `fast+interactive`** — cart data is per-session (not build-time), and updates live when items are added.
- **`hasItems` is a variant, not computed from `itemCount`** — the template can use `if="hasItems"` directly without comparing numbers.
- **`justAdded` is a transient variant** — the component briefly sets it to true for CSS animation, then resets it.
- **Both `cartButton` and `cartLink`** — gives the designer flexibility to use either a button (opens mini-cart) or a link (navigates to cart page).

## Jay-HTML usage

```html
<div class="cart-indicator">
  <a ref="cartLink" class="cart-icon">
    <span if="hasItems" class="badge">{itemCount}</span>
  </a>
</div>
```
