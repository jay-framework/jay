# Click Popover

Popup dialog on button click with auto-dismiss on click outside. Pure HTML using `popovertarget`, no component needed.

For **hover** triggers, use the `popover-menu` headless component instead.

## Usage

```html
<button popovertarget="info-popup">Show Info</button>
<div id="info-popup" popover>
  <p>This popup closes on click outside (light-dismiss).</p>
</div>
```

## CSS

```css
[popover] {
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #ddd;
}
```

Style with `:popover-open` for transitions:

```css
[popover] {
  opacity: 0;
  transition: opacity 0.2s;
}
[popover]:popover-open {
  opacity: 1;
}
```
