# Scroll Carousel (headless component)

Prev/next buttons for a CSS scroll-snap container. Tracks scroll position for disabling buttons at edges.

## Import

```html
<head>
  <script type="application/jay-headless"
          plugin="@jay-framework/ui-kit"
          contract="scroll-carousel"
  ></script>
</head>
```

## Usage

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

## CSS

The container must have scroll-snap:

```css
.carousel-track {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  gap: 16px;
}
.slide {
  scroll-snap-align: start;
  flex: 0 0 100%; /* one slide per view, or adjust */
}
```
