# Spring button hover

Bouncy hover on buttons (and button-like controls) using CSS `linear()` easing — no JavaScript or animation libraries.

## When to use

- Primary CTAs, icon buttons, and pill buttons where a subtle spring feels on-brand
- **Do not** apply to large cards or layout blocks unless the user explicitly asked — prefer buttons and `role="button"` elements

## Usage in jay-html

Add the class to each **button** (or `<a>` styled as a button) the user indicated in the change request:

```html
<button class="ui-kit-spring-hover" ref="...">Add to cart</button>
```

For links used as buttons:

```html
<a class="ui-kit-spring-hover btn" href="/cart">View cart</a>
```

Optional modifier for a stronger pop (scale 1.15 instead of 1.1):

```html
<button class="ui-kit-spring-hover ui-kit-spring-hover--strong">Buy now</button>
```

## CSS

Put styles in the page `<style>` block or the project stylesheet. Prefer **one shared rule** per page — do not duplicate the easing curve on every button.

```css
.ui-kit-spring-hover {
  transition:
    transform 800ms linear(0, 0.7 10%, 1.2 20%, 0.9 40%, 1.05 70%, 1),
    background-color 800ms linear(0, 0.7 10%, 1.2 20%, 0.9 40%, 1.05 70%, 1),
    color 800ms linear(0, 0.7 10%, 1.2 20%, 0.9 40%, 1.05 70%, 1),
    border-color 800ms linear(0, 0.7 10%, 1.2 20%, 0.9 40%, 1.05 70%, 1),
    box-shadow 800ms linear(0, 0.7 10%, 1.2 20%, 0.9 40%, 1.05 70%, 1);
}

.ui-kit-spring-hover:hover {
  transform: scale(1.1);
}

.ui-kit-spring-hover--strong:hover {
  transform: scale(1.15);
}

@media (prefers-reduced-motion: reduce) {
  .ui-kit-spring-hover,
  .ui-kit-spring-hover--strong {
    transition:
      transform 0.01ms,
      background-color 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }
  .ui-kit-spring-hover:hover,
  .ui-kit-spring-hover--strong:hover {
    transform: none;
  }
}

@supports not (transition-timing-function: linear(0, 1)) {
  .ui-kit-spring-hover,
  .ui-kit-spring-hover--strong {
    transition:
      transform 0.25s ease-out,
      background-color 0.25s ease-out,
      color 0.25s ease-out,
      border-color 0.25s ease-out,
      box-shadow 0.25s ease-out;
  }
}
```

## How it works

The `linear()` stops above `1` (e.g. `1.2 20%`) overshoot the end state; stops below `1` (`0.9 40%`) undershoot — that reads as a spring when combined with `:hover` `transform: scale(...)`.

Animate **`transform`** (and colors if needed), not `width` / `height` / `margin`, to avoid layout jank.

## Accessibility

- Respect `prefers-reduced-motion` (see CSS above).
- Spring is decorative; do not rely on motion alone to convey state.
- Keep focus styles visible; do not remove `:focus-visible` outlines when adding the class.

## AIditor change requests

1. Apply **only** to elements the user marked or named in the request (Q3 — unused attachment must not be implemented).
2. Add `ui-kit-spring-hover` to those buttons in `page.jay-html`.
3. Add the CSS block once on that page (or to shared styles if the project already centralizes button styles).
