# Popover Menu

Dropdown menu that opens on hover. Headless component — requires import. For click-triggered popups, use `click-popover.md` instead (pure HTML).

## Import

```html
<head>
  <script type="application/jay-headless"
          plugin="@jay-framework/ui-kit"
          contract="popover-menu"
  ></script>
</head>
```

## Usage

```html
<jay:popover-menu>
  <div class="nav-item">
    <a ref="trigger" class="nav-link">Products &#x25BE;</a>
    <div popover ref="popover" class="dropdown-menu">
      <a href="/products/shoes">Shoes</a>
      <a href="/products/bags">Bags</a>
    </div>
  </div>
</jay:popover-menu>
```

**Required refs:** `trigger` (the hover target), `popover` (must have `popover` attribute)

## CSS

Position the popover below the trigger using CSS Anchor Positioning. The component handles `showPopover()` on hover and provides a JS fallback for browsers without anchor support.

```css
/* Anchor the trigger */
.nav-link {
  anchor-name: --menu-trigger;
}

/* Position popover below the trigger */
.dropdown-menu {
  position-anchor: --menu-trigger;
  position: absolute;
  inset: unset;
  margin: 0;
  top: anchor(bottom);
  left: anchor(left);

  /* Styling */
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #ddd;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  opacity: 0;
  transition: opacity 0.2s;
}
.dropdown-menu:popover-open {
  opacity: 1;
}
```

**Multiple menus:** Each trigger needs a unique `anchor-name`. Use different names per menu:

```css
.products-trigger { anchor-name: --products-menu; }
.checkout-trigger { anchor-name: --checkout-menu; }
.products-dropdown { position-anchor: --products-menu; }
.checkout-dropdown { position-anchor: --checkout-menu; }
```

**Browser support:** CSS Anchor Positioning works in Chrome 125+. The component automatically falls back to JS-based `position: fixed` positioning in browsers without support.
