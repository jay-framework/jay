# Swipe and Touch Gestures in Jay-HTML

Build swipeable tabs, carousels and galleries with CSS scroll snap, and how to fix each `SWIPE-…` warning.

Suppress a warning for one page only when the pattern is deliberate:

```html
<script type="application/jay-validations">
  a11y:
    allow-snap-overscroll: true
</script>
```

Keys: `allow-snap-overscroll`, `allow-snap-blocked`, `allow-carousel-keyboard`. The TS rule uses `// jay-gesture: allow` on the same line.

## 1. Let the browser do the physics — scroll snap, not touch listeners (`SWIPE-TOUCH-LISTENER`)

A swipe built from `touchstart`/`touchmove`/`touchend` (or `pointermove`) with JS physics runs on the main thread, fights the browser's own scrolling, and breaks for keyboard and trackpad users. A scroll-snap row gets momentum, snapping and accessibility for free.

```css
/* ✅ */
.track {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
}
.track > * {
  scroll-snap-align: start;
  flex: 0 0 100%;
}
```

React to the result, not the gesture: use the `scrollend` event (through a ref) to know which slide is showing. Swipe-to-dismiss can be a snap row with an empty snap point.

For a real drag (a slider thumb, a resizable panel) use pointer events with `setPointerCapture` on the ref and `touch-action` on that element — see `component-refs.md` (developer) → Gestures.

## 2. Stop over-swipes from navigating back (`SWIPE-SNAP-OVERSCROLL`)

At the end of a horizontal scroller, an over-swipe chains to the page — and on many browsers that is the back/forward gesture. Add to the **same rule** as the snap:

```css
.track {
  overscroll-behavior-x: contain;
}
```

`none` also works; an explicit `auto` is accepted as a deliberate choice. Vertical snap is not checked.

## 3. Don't block the swipe (`SWIPE-SNAP-BLOCKED`)

- `touch-action: none` or `pan-y` on the snap row disables native horizontal panning — usually added "to stop the page scrolling" for a JS swipe. Remove it, or use `pan-x`.
- `overflow: visible` (or `clip`) on both axes means the element is not a scroll container, so snap never happens. Use `overflow-x: auto`.

## 4. Keyboard and screen readers (`SWIPE-CAROUSEL-KEYBOARD`)

Every swipe region needs a keyboard path:

- real prev/next `<button>`s that scroll the track (ui-kit `scroll-carousel` `prev`/`next` refs) — **not just any button nearby**; the validator cannot tell an "Add to cart" button from a "Next" button, so check it yourself; or
- `tabindex="0"` + `aria-label` on the track, so arrow keys scroll it; or
- slides that contain links or other focusable controls.

Name the carousel and give it a role. `aria-roledescription` is ignored on an element whose role is generic (`div`, `span`, …), so add `role="region"` (or `"group"`):

```html
<div class="carousel" role="region" aria-roledescription="carousel" aria-label="Product gallery">
  <button ref="prev" aria-label="Previous slide">&#8249;</button>
  <div ref="container" class="track">…</div>
  <button ref="next" aria-label="Next slide">&#8250;</button>
</div>
```

The check matches simple selectors only (`.track`, `#id`, `tag`, or compounds of these); a complex selector (`.wrap > .track`) is skipped rather than guessed.

## 5. Progress indicators without JS scroll handlers

Dots or progress bars that follow the swipe can use scroll-driven animations (`animation-timeline: scroll(x)` / `view()`), not `onscroll` callbacks writing styles. Gate the motion behind `prefers-reduced-motion` like any other animation.

## 6. Don't disable zoom

`user-scalable=no` or `maximum-scale` below 2 in the viewport meta is already an **error** (WCAG 1.4.4). Pinch-zoom must keep working on swipeable pages.
