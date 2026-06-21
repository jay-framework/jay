# Example: Mini Cart

A trivial contract with one variant and two interactive refs. Good starting point for understanding the basics.

```yaml
name: mini-cart
description: Drawer that auto-opens when a product is added to cart.

tags:
  - tag: isOpen
    type: variant
    dataType: boolean
    phase: fast+interactive
    description: Whether the mini-cart drawer is currently open

  - tag: openButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to manually open the mini-cart drawer

  - tag: closeButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to close the mini-cart drawer
```

## Why these choices

- **`isOpen` is `fast+interactive`** — the drawer state starts on the server (closed) and toggles on the client.
- **Interactive tags have no explicit phase** — they're always `fast+interactive`.
- **No props or params** — the mini-cart doesn't need configuration and doesn't own a route.

## Jay-HTML usage

```html
<div class="mini-cart-overlay" if="isOpen">
  <div class="mini-cart-drawer">
    <button ref="closeButton">Close</button>
    <!-- cart content here -->
  </div>
</div>
<button ref="openButton">Cart</button>
```
