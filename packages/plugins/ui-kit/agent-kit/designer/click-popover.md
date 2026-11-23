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

Style with `:popover-open` for transitions. `display` and `overlay` need `allow-discrete` so the exit transition runs before the popover leaves the top layer, and `@starting-style` gives the entry transition its start value:

```css
[popover] {
  opacity: 0;
  transition:
    opacity 0.2s,
    display 0.2s allow-discrete,
    overlay 0.2s allow-discrete;
}
[popover]:popover-open {
  opacity: 1;
}
@starting-style {
  [popover]:popover-open {
    opacity: 0;
  }
}
```

## Accessibility

The Popover API gives you light dismiss (click outside), Escape-to-close, and returning focus to the invoking button when the popover closes. It does **not** trap focus: a popover is non-modal, and Tab moves on to the rest of the page. `popovertarget` works only on a `<button>` (or `<input type="button">`) and is keyboard-accessible (Enter/Space); the browser exposes the expanded state, so do not add `aria-expanded` yourself. For a modal layer that must contain focus, use `<dialog>` + `showModal()` (see `focus-and-dialogs.md`, shipped by `@jay-framework/a11y-validator`).
