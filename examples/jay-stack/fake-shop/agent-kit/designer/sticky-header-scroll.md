# Sticky header that “sticks” (scroll-driven)

A site header that stays `position: sticky` and **morphs on scroll**: padding compresses and a **wavy bottom edge** appears, driven by scroll-linked CSS (`animation-timeline: scroll()` + `clip-path: shape()`).

Based on [The Sticky Header that Sticks!](https://css-tip.com/sticky-header/) by Temani Afif ([@ChallengesCss](https://x.com/ChallengesCss/status/2046905873490903109)).

## When to use

- Top-of-page `<header>` / nav bar the user indicated in the change request
- Long pages where a compact sticky bar improves scroll UX
- **Not** for footers or mid-page sections unless the user explicitly asked

## Usage in jay-html

Wrap the page header (or add the class to an existing header element):

```html
<header class="ui-kit-sticky-header">
  <!-- logo, nav, etc. -->
</header>
```

Keep header content in normal document flow (do not use `position: fixed` for this pattern).

## CSS

Add once per page (or in shared layout CSS). Tune `--ui-kit-sticky-scroll-range` if the morph should happen over more or fewer pixels of scroll (default `45px`, matching the original tip).

```css
.ui-kit-sticky-header {
  --ui-kit-sticky-scroll-range: 45px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-sizing: border-box;
  background: var(--ui-kit-sticky-header-bg, #fff);
  animation: ui-kit-sticky-header-stick linear both;
  animation-timeline: scroll();
  animation-range: 0 var(--ui-kit-sticky-scroll-range);
}

@keyframes ui-kit-sticky-header-stick {
  0% {
    /* 30 + 30 = 60 — tall header */
    padding-block: 30px 30px;
    clip-path: var(--ui-kit-sticky-shape-flat);
  }
  to {
    /* 5 + 55 = 60 — same total block size, content shifts up */
    padding-block: 5px 55px;
    clip-path: var(--ui-kit-sticky-shape-wavy);
  }
}

/* Rectangle (wave size 0) — same point count as wavy for smooth interpolation */
:root {
  --ui-kit-sticky-shape-flat: shape(from 0 0, vline to 100%, hline to 0);
  /* Wavy bottom — granularity matches flat; depth ~25px (css-generators.com wavy-divider, bottom) */
  --ui-kit-sticky-shape-wavy: shape(
    from 0 0,
    vline to calc(100% - 25px),
    curve to 4.17% calc(100% - 15.5px) with 2.78% calc(100% - 15px),
    curve to 6.94% calc(100% - 9px) with 5.56% calc(100% - 16px),
    curve to 9.72% calc(100% - 20px) with 8.33% calc(100% - 2px),
    curve to 12.5% calc(100% - 44px) with 11.11% calc(100% - 38px),
    curve to 15.28% calc(100% - 27.5px) with 13.89% calc(100% - 50px),
    curve to 18.06% calc(100% - 20.5px) with 16.67% calc(100% - 5px),
    curve to 20.83% calc(100% - 23.5px) with 19.44% calc(100% - 36px),
    curve to 23.61% calc(100% - 10.5px) with 22.22% calc(100% - 11px),
    curve to 26.39% calc(100% - 5.5px) with 25% calc(100% - 10px),
    curve to 29.17% calc(100% - 9.5px) with 27.78% calc(100% - 1px),
    curve to 31.94% calc(100% - 11.5px) with 30.56% calc(100% - 18px),
    curve to 34.72% calc(100% - 20px) with 33.33% calc(100% - 5px),
    curve to 37.5% calc(100% - 23px) with 36.11% calc(100% - 35px),
    curve to 40.28% calc(100% - 28px) with 38.89% calc(100% - 11px),
    curve to 43.06% calc(100% - 24.5px) with 41.67% calc(100% - 45px),
    curve to 45.83% calc(100% - 25.5px) with 44.44% calc(100% - 4px),
    curve to 48.61% calc(100% - 44.5px) with 47.22% calc(100% - 47px),
    curve to 51.39% calc(100% - 31px) with 50% calc(100% - 42px),
    curve to 54.17% calc(100% - 26.5px) with 52.78% calc(100% - 20px),
    curve to 56.94% calc(100% - 23.5px) with 55.56% calc(100% - 33px),
    curve to 59.72% calc(100% - 13.5px) with 58.33% calc(100% - 14px),
    curve to 62.5% calc(100% - 26.5px) with 61.11% calc(100% - 13px),
    curve to 65.28% calc(100% - 41px) with 63.89% calc(100% - 40px),
    curve to 68.06% calc(100% - 28.5px) with 66.67% calc(100% - 42px),
    curve to 70.83% calc(100% - 7.5px) with 69.44% calc(100% - 15px),
    curve to 73.61% calc(100% - 12.5px) with 72.22% calc(100% - 0px),
    curve to 76.39% calc(100% - 27.5px) with 75% calc(100% - 25px),
    curve to 79.17% calc(100% - 28px) with 77.78% calc(100% - 30px),
    curve to 81.94% calc(100% - 27px) with 80.56% calc(100% - 26px),
    curve to 84.72% calc(100% - 34px) with 83.33% calc(100% - 28px),
    curve to 87.5% calc(100% - 28px) with 86.11% calc(100% - 40px),
    curve to 90.28% calc(100% - 31px) with 88.89% calc(100% - 16px),
    curve to 93.06% calc(100% - 37px) with 91.67% calc(100% - 46px),
    curve to 95.83% calc(100% - 23.5px) with 94.44% calc(100% - 28px),
    curve to 100% calc(100% - 25px) with 97.22% calc(100% - 19px),
    vline to 0,
    hline to 0
  );
}

@media (prefers-reduced-motion: reduce) {
  .ui-kit-sticky-header {
    animation: none;
    padding-block: 12px;
    clip-path: none;
  }
}

@supports not (animation-timeline: scroll()) {
  .ui-kit-sticky-header {
    animation: none;
    padding-block: 12px;
    clip-path: none;
  }
}
```

## How it works

1. **`position: sticky; top: 0`** — header stays at the top while scrolling.
2. **`animation-timeline: scroll()`** — keyframe progress follows page scroll, not time.
3. **`animation-range: 0 45px`** — morph completes in the first 45px of scroll.
4. **`padding-block`** — total vertical padding stays 60px; top shrinks, bottom grows so inner content moves up without changing overall block size.
5. **`clip-path: shape()`** — flat rectangle at scroll 0; wavy bottom at scroll end. Matching curve count lets the browser interpolate smoothly.

To customize the wave, regenerate shapes with the [wavy divider generator](https://css-generators.com/wavy-divider/) (bottom side, same granularity; size `0` for flat, non-zero for wavy).

## Browser support

- **Full effect:** Chrome 115+, Edge 115+, Safari 18.4+ (`scroll()` timeline + `shape()`).
- **Fallback:** static sticky header with normal padding (see `@supports` block).

## AIditor change requests

1. Apply **only** to the header/nav the user marked or named (Q3).
2. Add `ui-kit-sticky-header` on that element in `page.jay-html`.
3. Add the CSS block once on the page; set `--ui-kit-sticky-header-bg` to match the site header background if needed.
