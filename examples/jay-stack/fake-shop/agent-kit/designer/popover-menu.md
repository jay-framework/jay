# Popover Menu

Dropdown menu that opens on hover. Headless component — requires import. For click-triggered popups, use `click-popover.md` instead (pure HTML).

## Import

```html
<head>
  <script
    type="application/jay-headless"
    plugin="@jay-framework/ui-kit"
    contract="popover-menu"
  ></script>
</head>
```

## Usage

```html
<jay:popover-menu>
  <nav class="main-nav">
    <a ref="trigger" class="nav-link">Products &#x25BE;</a>
    <div popover ref="popover" class="dropdown-menu">
      <a href="/products/shoes">Shoes</a>
      <a href="/products/bags">Bags</a>
    </div>
  </nav>
</jay:popover-menu>
```

**Required refs:** `trigger` (the hover target), `popover` (must have `popover` attribute)

## CSS

Style with `:popover-open` for show/hide transitions:

```css
.dropdown-menu {
  opacity: 0;
  transition: opacity 0.2s;
}
.dropdown-menu:popover-open {
  opacity: 1;
}
```
