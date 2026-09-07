# Component Refs

Refs provide access to DOM elements declared as `interactive` in the contract. They are the second parameter of the interactive constructor.

## Single Refs

A ref maps to one DOM element:

```yaml
# Contract
- tag: addToCart
  type: interactive
  elementType: HTMLButtonElement
```

```typescript
// Component
.withInteractive(function MyComp(props, refs) {
    refs.addToCart.onClick(() => {
        // handle click
    });
})
```

### Ref Methods

Refs provide type-safe access to the DOM element:

```typescript
refs.submitButton.onClick(() => {
  /* ... */
});

// exec$ gives direct access to the element and current ViewState.
// Only use exec$ inside event handlers — never at top-level component
// creation or in effects, because elements don't exist yet at that point.
refs.submitButton.onclick(() => {
  refs.submitButton.exec$((element, viewState) => {
    element.disabled = viewState.isSubmitting;
  });
});
```

## Collection Refs

When an interactive tag is inside a `repeated` sub-contract, the ref becomes a collection. In jay-html, collection refs use the `$` suffix:

```html
<div forEach="items" trackBy="id">
  <button ref="itemButton$">Click</button>
</div>
```

The `$` is stripped from the name in the contract and component code:

```yaml
# Contract
- tag: items
  type: sub-contract
  repeated: true
  trackBy: id
  tags:
    - tag: id
      type: data
      dataType: string
    - tag: itemButton
      type: interactive
      elementType: HTMLButtonElement
```

### Collection Ref Methods

```typescript
// Map over all items in the collection
const labels = refs.itemButton.map((proxy, viewState, coordinate) => {
  return viewState.name;
});

// Find a specific item
const target = refs.itemButton.find((viewState) => viewState.id === 'target-id');

// Find by coordinate
const target = refs.itemButton.find((viewState, coordinate) =>
  sameCoordinate(coordinate, ['item-2', 'itemButton']),
);
```

## Element Types

Common element types for interactive tags:

| Element Type          | Use For               |
| --------------------- | --------------------- |
| `HTMLButtonElement`   | Buttons, clickable    |
| `HTMLAnchorElement`   | Links                 |
| `HTMLInputElement`    | Text inputs, checkbox |
| `HTMLSelectElement`   | Dropdowns             |
| `HTMLTextAreaElement` | Multi-line text       |
| `HTMLFormElement`     | Forms                 |
| `HTMLDivElement`      | Generic containers    |

Multiple element types (when the same ref may bind to different elements):

```yaml
- tag: trigger
  type: interactive
  elementType: HTMLButtonElement | HTMLAnchorElement
```

## Data + Interactive

A tag can be both data and interactive:

```yaml
- tag: quantityInput
  type: [data, interactive]
  dataType: number
  elementType: HTMLInputElement
```

This generates both a ViewState field and a ref.

## DOM access rules (Jay Stack pages)

Refs are the **only supported path** from TypeScript to elements Jay renders. Direct `document` access bypasses the framework and can break rendering, updates, and performance.

`jay-stack validate` warns on `document.querySelector`, `document.getElementById`, `document.createElement`, and `document.addEventListener` in page and component `.ts` files. Suppress with `// jay-dom: allow` on the same line when an exception is genuinely needed.

### Do

- Declare elements in **jay-html** with `ref="..."`.
- Drive overlays, lists, and visibility with **ViewState** (`if`, `forEach`, signal-backed bindings).
- Attach handlers with ref APIs: `refs.myRef.onclick`, `oninput`, `onkeydown`, etc.
- Use `refs.myRef.exec$((element, viewState) => …)` **inside handlers** for focus, scroll, measure, or native APIs.
- For drags: `setPointerCapture` on the ref element that received `pointerdown`, then listen on that element.

### Avoid

- `document.querySelector` / `getElementById` to find template elements — use refs
- `document.createElement` + `appendChild` for UI that belongs in jay-html — use `forEach` with ViewState
- `document.addEventListener` for global events — use the root ref pattern (below)

## Root ref pattern — replacing `document.addEventListener`

Wrap the page content in a shell element with a ref. Use capture-phase listeners on the shell to intercept events before they reach children — functionally equivalent to `document.addEventListener`.

### Setup

```html
<!-- jay-html -->
<div ref="shell" class="page-shell">... entire page content ...</div>
```

```yaml
# Contract
- tag: shell
  type: interactive
  elementType: HTMLDivElement
```

### Global keyboard navigation

Instead of `document.addEventListener('keydown', ...)`:

```typescript
.withInteractive(function Page(_props, refs) {
    let keyboardNav = false;

    refs.shell.onkeydown(({ event }) => {
        if (event.key === 'Tab') keyboardNav = true;
    });

    refs.shell.onmousedown(() => {
        keyboardNav = false;
    });
})
```

Events bubble up from children to the shell — a handler on the shell sees all keyboard and mouse events from the entire page.

Use `refs.shell.addEventListener(type, handler, { capture: true })` only when you need to intercept events _before_ children handle them (e.g., preventing default on specific keys).

### Focus management (scroll into view)

Instead of `document.addEventListener('focusin', ...)`:

```typescript
refs.shell.onfocusin(({ event }) => {
  if (!keyboardNav) return;
  const el = event.target as HTMLElement;
  refs.shell.exec$(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
});
```

### Detecting pointer leaving the page

Instead of `document.addEventListener('mouseleave', ...)`:

```typescript
refs.shell.onpointerleave(({ event }) => {
  // Pointer left the shell — equivalent to leaving the viewport
  // if the shell covers the full viewport
});
```

Ensure the shell has no margin/padding gap so it covers the full viewport. `pointer-events: auto` (the default) is sufficient.

### Finding elements by class → use refs

Instead of `document.querySelector('.site-header')`:

```html
<!-- jay-html -->
<header ref="siteHeader" class="site-header">...</header>
```

```typescript
refs.siteHeader.onclick(() => {
  /* ... */
});

refs.siteHeader.exec$((el) => {
  el.classList.add('is-hidden');
});
```

### Dynamic lists → use forEach

Instead of creating elements with `document.createElement` in a loop:

```html
<!-- jay-html -->
<div forEach="cards" trackBy="id" class="card-grid">
  <div class="card">
    <img src="{imageUrl}" alt="{title}" />
    <span>{title}</span>
  </div>
</div>
```

Update the ViewState to add/remove cards — the framework handles DOM creation.

### Using `exec$` for native DOM APIs

For DOM operations that refs don't wrap (scroll, focus, measurements), use `exec$` inside an event handler:

```typescript
refs.myInput.onclick(() => {
  refs.myInput.exec$((el) => {
    el.focus();
    el.select();
  });
});

refs.scrollContainer.exec$((el) => {
  el.scrollTo({ top: 0, behavior: 'smooth' });
});
```

### Rare `document` exceptions

Use only when no ref can exist, with `// jay-dom: allow` to suppress the validation warning:

| Case                   | Example                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| Offscreen processing   | `document.createElement('canvas') // jay-dom: allow` for image export |
| Coordinate hit-testing | `document.elementFromPoint(...) // jay-dom: allow` during drag        |
| Tests                  | `document.dispatchEvent // jay-dom: allow` in Vitest                  |
