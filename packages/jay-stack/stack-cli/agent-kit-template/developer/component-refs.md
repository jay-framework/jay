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

### Do

- Declare elements in **jay-html** with `ref="..."`.
- Drive overlays, lists, and visibility with **ViewState** (`if`, `forEach`, signal-backed bindings).
- Attach handlers with ref APIs: `refs.myRef.onclick`, `oninput`, `onkeydown`, etc.
- Use `refs.myRef.exec$((element, viewState) => …)` **inside handlers** for focus, scroll, measure, or native APIs.
- For drags: `setPointerCapture` on the ref element that received `pointerdown`, then listen on that element.

### Avoid

- `document.querySelector` / `getElementById` to find template elements
- `document.createElement` + `appendChild` for UI that belongs in jay-html
- `document.addEventListener('mousemove'|'mouseup')` for drags (use pointer capture instead)

### Rare `document` exceptions

Use only when no ref can exist, with an inline comment:

| Case                   | Example                                               |
| ---------------------- | ----------------------------------------------------- |
| Offscreen processing   | `document.createElement('canvas')` for image export   |
| Coordinate hit-testing | `document.elementFromPoint` during cross-overlay drag |
| Tests                  | `document.dispatchEvent` in Vitest                    |

Global shortcuts or paste: prefer a root shell ref (`ref="appRoot"`) with capture listeners.

See also: `.cursor/skills/jay-dom-refs/SKILL.md` in the jay monorepo.
