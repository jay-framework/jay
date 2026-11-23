# Reduced motion

Some people get dizzy or sick from motion on screen (vestibular disorders). They turn on
"reduce motion" in their OS, and the page sees `prefers-reduced-motion: reduce`.

Reduced motion does **not** mean "no animation". It means **no movement**:

| Kind     | Examples                                                                                                           | Under reduce                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Movement | `transform`/`translate`/`scale`/`rotate`, smooth scroll, parallax, zoom, scroll-driven animation, view transitions | Remove it, or replace it with a fade                        |
| Fades    | `opacity`, `color`, `background`, `box-shadow`                                                                     | **Keep** — they show state changes and do not move anything |

The `design-reduced-motion` validator checks page CSS (pages only, no `DESIGN.md` needed). The
`reduced-motion-js` project validator checks `src/**` scripts.

## Two patterns

**1. Opt in (default).** Write the calm version first; add movement only for users who did not ask for less.

```css
.card {
  transition: opacity 200ms ease;
}
@media (prefers-reduced-motion: no-preference) {
  .card {
    transition:
      opacity 200ms ease,
      transform 300ms ease;
  }
  .card:hover {
    transform: translateY(-4px);
  }
}
```

**2. Override per selector.** Keep the moving rule, and turn off the movement for that selector under `reduce`.

```css
.lift {
  transition: transform 200ms;
}
.lift:hover {
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .lift {
    transition: none;
  }
  .lift:hover {
    transform: none;
  }
}
```

ui-kit examples: `spring-button-hover.md`, `sticky-header-scroll.md`.

A fade alone needs no gate and gets no warning:

```css
.dropdown {
  opacity: 0;
  transition: opacity 0.15s;
}
```

## ❌ The `*` reset

```css
/* ❌ reduced-motion/blanket-reset */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

It also kills the fades that tell users something changed, and JS waiting for `transitionend` or
`animationend` may never run. Reduce motion per element instead.

## Smooth scroll

```css
html {
  scroll-behavior: smooth;
} /* ❌ */
@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
} /* ✅ */
```

Setting `scroll-behavior: smooth` inside `reduce` is not a fix; `scroll-behavior: auto` for the same selector is.

## Scroll-driven animation

```css
/* ❌ reduced-motion/scroll-timeline */
.bar {
  animation: grow linear;
  animation-timeline: scroll();
}

/* ✅ */
@media (prefers-reduced-motion: no-preference) {
  .bar {
    animation: grow linear;
    animation-timeline: scroll();
  }
}
/* or: @media (prefers-reduced-motion: reduce) { .bar { animation: none; } } */
```

## View transitions

```css
@view-transition {
  navigation: auto;
} /* ❌ */
@media (prefers-reduced-motion: no-preference) {
  @view-transition {
    navigation: auto;
  } /* ✅ */
}
```

## Carousels and hover transforms (`transform-kept`)

Removing the transition is not enough: the transform still applies, so the item **jumps**. Reset
`transform: none` on the **selector that sets the transform**, after it in the CSS:

```css
.slide {
  transition: transform 300ms;
}
.slide:hover {
  transform: scale(1.1);
}
@media (prefers-reduced-motion: reduce) {
  .slide {
    transition: none;
  }
  .slide:hover {
    transform: none;
  } /* ✅ .slide { transform: none } would lose to .slide:hover */
}
```

Or keep `.slide:hover { transform }` inside `no-preference`.

## JS motion

`scrollTo`/`scrollBy`/`scrollIntoView({ behavior: 'smooth' })` and `element.animate()` ignore CSS
media queries. Check the preference yourself, inside `exec$`:

```ts
refs.track.exec$((el) => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollBy({ left: el.clientWidth, behavior: reduce ? 'instant' : 'smooth' });
});
```

Use `'instant'`, never `'auto'`: `'auto'` defers to CSS `scroll-behavior`, which may still be `smooth`.
Skip `element.animate()` (or use a fade) when `reduce` is true.

`reduced-motion/js-motion` reports a file that uses `behavior: 'smooth'` or `.animate(` and never
mentions `prefers-reduced-motion`. It has **no** suppression key: checking the preference in that file
is both the fix and the way to silence it.

## Suppression keys

In `<script type="application/jay-validations">` under `design-system:`:

| Key                            | Rule                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `allow-no-reduced-motion`      | `reduced-motion/missing` — the page moves elements and has no `prefers-reduced-motion` block at all |
| `allow-blanket-motion-reset`   | `reduced-motion/blanket-reset`                                                                      |
| `allow-smooth-scroll`          | `reduced-motion/smooth-scroll`                                                                      |
| `allow-scroll-animation`       | `reduced-motion/scroll-timeline`                                                                    |
| `allow-view-transition`        | `reduced-motion/view-transition`                                                                    |
| `allow-transform-under-reduce` | `reduced-motion/transform-kept`                                                                     |
