# Focus and Dialogs in Jay-HTML

Keyboard focus, modal dialogs, popovers and scroll lock, and how to fix each a11y-validator focus warning.

Every warning below can be suppressed for one page when it is a deliberate choice:

```html
<script type="application/jay-validations">
  a11y:
    allow-custom-modal: true
</script>
```

The key is always `allow-<rule-id>`.

## Pick the right layer

| You need                                               | Use                                               | Why                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A modal (blocks the page until closed)                 | `<dialog>` + `showModal()`                        | Focus is contained, Escape closes it, the rest of the page becomes inert, it renders in the top layer |
| A non-modal panel (page stays usable)                  | `<dialog>` + `show()`, or the `popover` attribute | No focus trap, by design                                                                              |
| A menu, tooltip or picker that closes on click outside | `popover` + `<button popovertarget>`              | Light dismiss, Escape, focus returns to the button                                                    |

`<dialog open>` in HTML is a valid **non-modal** dialog. Only `showModal()` makes it modal.

## Opening and closing a dialog through refs

```html
<button type="button" class="btn" ref="openCart">Open cart</button>
<dialog ref="cart" aria-labelledby="cart-title">
  <h2 id="cart-title">Cart</h2>
  <button type="button" class="btn" ref="closeCart">Close</button>
</dialog>
```

```ts
refs.openCart.onclick(() => refs.cart.exec$((dialog) => dialog.showModal()));
refs.closeCart.onclick(() => refs.cart.exec$((dialog) => dialog.close()));
```

When the dialog closes, the browser returns focus to the element that had it before (`openCart`). Do not write a Tab-key trap in TS — `showModal()` already contains focus.

`aria-modal="true"` on a `<dialog>` is redundant with `showModal()`, and a **false signal** with `show()`: assistive tech is told the background is unavailable while it is still interactive. Leave it out.

## Moving and restoring focus

- **New view or step:** after you render it, move focus to its heading (`tabindex="-1"` on the heading) with `refs.stepHeading.exec$((el) => el.focus())`.
- **Closing a custom panel that is not a `<dialog>` or popover:** keep a ref to the trigger and focus it again on close.
- **Removing the focused element** (deleting a list row): focus the next row, or the list heading.

## `inert` for custom layouts

If a layout must keep a non-modal overlay but take the rest of the page out of the tab order (for example a full-screen mobile nav), put `inert` on the sibling content while it is open. Prefer `<dialog>` + `showModal()`, which does this for you.

## Roving tabindex (toolbars, tab lists, grids)

A toolbar is **one** tab stop. The active item has `tabindex="0"`, all others `tabindex="-1"`; arrow keys move focus and swap the values. Drive the values from ViewState:

```html
<div role="toolbar" aria-label="Text formatting">
  <button forEach="tools" trackBy="id" type="button" ref="tool" tabindex="{isActive ? 0 : -1}">
    {label}
  </button>
</div>
```

Never use a positive `tabindex`.

## Scroll lock

`showModal()` makes the background inert but does **not** stop the page from scrolling. Lock scroll in CSS, scoped to an open modal:

```css
html:has(dialog:modal) {
  overflow: hidden;
}
```

Do not set `document.body.style.overflow` from TS — it gets out of sync when a dialog closes another way (Escape, form submit, navigation). `overscroll-behavior: contain` on the dialog only stops scroll _chaining_; it is not a lock.

## Back gesture

A modal `<dialog>` closes on the Android back gesture where `CloseWatcher` exists (Chromium). Elsewhere back navigates. A `popstate` fallback can be correct, but routers also use `popstate` — only add one when you own the history entry.

## Entry and exit transitions (top layer)

```css
dialog {
  opacity: 0;
  transition:
    opacity 0.2s,
    display 0.2s allow-discrete,
    overlay 0.2s allow-discrete;
}
dialog[open] {
  opacity: 1;
}
dialog::backdrop {
  background-color: transparent;
  transition:
    background-color 0.2s,
    display 0.2s allow-discrete,
    overlay 0.2s allow-discrete;
}
dialog[open]::backdrop {
  background-color: rgb(0 0 0 / 0.4);
}
@starting-style {
  dialog[open] {
    opacity: 0;
  }
  dialog[open]::backdrop {
    background-color: transparent;
  }
}
```

`allow-discrete` on `display` and `overlay` keeps the element in the top layer until the exit transition ends; `@starting-style` gives the entry its start value. No class toggling, `requestAnimationFrame`, `transitionend` or `setTimeout` needed. The same pattern works for `[popover]` with `:popover-open`.

## Focus rings

Hide the ring only for pointer focus, never for keyboard focus:

```css
.btn:focus:not(:focus-visible) {
  outline: none;
}
.btn:focus-visible {
  outline: 2px solid #1a56db;
  outline-offset: 2px;
}
```

The ring needs **at least 3:1 contrast** against the colour next to it (WCAG 1.4.11). The validator cannot check this — check it yourself, also in dark mode.

## Warnings

### `custom-modal`

`<div aria-modal="true">`, `role="dialog"` or `role="alertdialog"` on an element that is not a `<dialog>`. A hand-rolled modal does not contain focus, ignores Escape and leaves the background interactive. Fix: use `<dialog>` + `showModal()` (modal) or `<dialog>` + `show()` / `popover` (non-modal). Dynamic values (`role="{kind}"`) are not checked.

### `dialog-name`

A `<dialog>` with no `aria-label` / `aria-labelledby`. A heading inside does **not** name a dialog. Fix: `aria-labelledby` pointing at the heading's `id`.

### `outline-without-focus-visible`

A `:focus` rule removes the outline (`outline: none | 0`, `outline-style: none`) and nothing replaces it: no `box-shadow` or visible border in the same rule, and no `:focus-visible` rule with a visible outline for the same selector (a bare `:focus-visible` covers all). Fix: `:focus:not(:focus-visible)`, or add the `:focus-visible` rule. The message starts with where the rule is: `[style#1 line 3]` (first body `<style>`), `[./styles.css line 12]`, or `[head style]`.

### `outline-none-unconditional`

`outline: none` on a focusable selector with no `:focus` at all (`button`, `a`, `input`, `[tabindex]`, `*`, with classes or attributes) — every focus ring disappears. Also fires on an inline `style="outline: none"` on a focusable element, which no `:focus-visible` rule can override. `dialog` and `[popover]` are exempt (their container focus ring is commonly hidden). Fix: remove it, or scope it to `:focus:not(:focus-visible)`.

### `autofocus-outside-dialog`

`autofocus` outside a `<dialog>`/`[popover]` moves focus on page load, so screen-reader users skip everything before it. Allowed: a single `autofocus` on the form field the page exists for (a search page). Inside a dialog or popover, `autofocus` applies when it opens — that is the right place for it.

### `body-style-overflow` (reported by `jay-stack validate` on `page.ts`)

`document.body.style.overflow` / `document.documentElement.style.overflow` in a component. Fix: CSS `html:has(dialog:modal) { overflow: hidden }` (see **Scroll lock**). Suppress with `// jay-dom: allow` on the same line.
