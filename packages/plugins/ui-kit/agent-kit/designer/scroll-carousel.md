# Scroll Carousel

Horizontal slider with CSS scroll snap. Headless component — requires import.

Two layout patterns: **arrow navigation** (prev/next buttons with edge detection) and **snap-to-center gallery** (swipe/drag with centered active item).

## Import

```html
<head>
  <script
    type="application/jay-headless"
    plugin="@jay-framework/ui-kit"
    contract="scroll-carousel"
  ></script>
</head>
```

## Pattern 1: Arrow Navigation

Prev/next buttons scroll the track. ViewState disables buttons at edges.

```html
<jay:scroll-carousel>
  <div class="carousel">
    <button ref="prev" disabled="atStart" class="btn-prev">&#8249;</button>
    <div ref="container" class="carousel-track">
      <div class="slide">Slide 1</div>
      <div class="slide">Slide 2</div>
      <div class="slide">Slide 3</div>
    </div>
    <button ref="next" disabled="atEnd" class="btn-next">&#8250;</button>
  </div>
</jay:scroll-carousel>
```

**Required refs:** `container` (scrollable element), `prev`, `next` (buttons)

**ViewState:** `atStart` (boolean), `atEnd` (boolean) — use for disabling buttons or hiding arrows

### CSS

Slides snap to the left edge. Adjust `flex` to control how many slides are visible.

```css
.carousel-track {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain; /* an over-swipe must not trigger browser back/forward */
  scroll-behavior: smooth;
  gap: 16px;
}
.slide {
  scroll-snap-align: start;
  flex: 0 0 100%; /* one slide per view, or adjust */
}
```

## Pattern 2: Snap-to-Center Gallery

Swipe/drag gallery where the active item snaps to center. Side items bleed off-screen, hinting at more content. Works with touch, trackpad, and mouse drag natively.

```html
<jay:scroll-carousel>
  <div ref="container" class="gallery">
    <div class="gallery-item">Item 1</div>
    <div class="gallery-item">Item 2</div>
    <div class="gallery-item">Item 3</div>
    <div class="gallery-item">Item 4</div>
    <div class="gallery-item">Item 5</div>
  </div>
</jay:scroll-carousel>
```

**Required refs:** `container` (the scrollable gallery element)

A pure swipe gallery still needs a **keyboard path**: add real prev/next `<button>`s (`ref="prev"`, `ref="next"`) that scroll the track, or make the track itself focusable with `tabindex="0"` plus an `aria-label` (arrow keys then scroll it). Slides that contain links are reachable too. `jay-stack validate` warns (`SWIPE-CAROUSEL-KEYBOARD`) when it finds no keyboard path — but it accepts _any_ nearby button, so make sure yours really are the prev/next controls.

### CSS

Container padding lets the first and last items center without hitting a hard edge. Adjust `padding` and item `flex` to control spacing and visible item width.

```css
.gallery {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain; /* an over-swipe must not trigger browser back/forward */
  gap: 20px;
  padding: 40px 25%;
  box-sizing: border-box;

  /* hide scrollbar */
  scrollbar-width: none; /* Firefox */
}
.gallery::-webkit-scrollbar {
  display: none; /* Chrome, Safari */
}

.gallery-item {
  scroll-snap-align: center;
  flex: 0 0 80%; /* 80% of visible width — sides bleed */
  border-radius: 12px;
}
```

## Accessibility

Label the carousel region and navigation buttons:

```html
<div class="carousel" role="region" aria-label="Product gallery">
  <button ref="prev" disabled="atStart" aria-label="Previous slide">&#8249;</button>
  <div ref="container" class="carousel-track">...</div>
  <button ref="next" disabled="atEnd" aria-label="Next slide">&#8250;</button>
</div>
```

All slides remain in the DOM (CSS scroll, not JS hide/show), so screen readers and search engines see all content.

Use `role="region"` + `aria-label` on the wrapper. If you add `aria-roledescription="carousel"`, it needs that explicit role — on a plain `<div>` it is not announced.

Swipe, overscroll, `touch-action` and keyboard rules for any swipe UI: see `swipe-gestures.md` (shipped by `@jay-framework/a11y-validator`).
