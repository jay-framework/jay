# UI Kit — Headless Components

These components add minimal JS behavior to HTML/CSS patterns. They add zero DOM — the designer owns all markup and styling.

## Import

Add headless component imports in the jay-html `<head>` via `<script type="application/jay-headless">`:

```html
<head>
  <script
    type="application/jay-headless"
    plugin="@jay-framework/ui-kit"
    contract="popover-menu"
  ></script>
</head>
```

For keyed components (when you need to reference their ViewState from the page), add a `key`:

```html
<script
  type="application/jay-headless"
  plugin="@jay-framework/ui-kit"
  contract="scroll-carousel"
  key="carousel"
></script>
```

Then use `<jay:contract-name>` (or `<jay:contract-name key="...">`) in the body.

## Popover Menu

Opens a popover on hover. Light-dismiss (click outside) handles closing.

```html
<head>
  <script
    type="application/jay-headless"
    plugin="@jay-framework/ui-kit"
    contract="popover-menu"
  ></script>
</head>
<body>
  <jay:popover-menu>
    <nav class="main-nav">
      <a ref="trigger" class="nav-link">Products &#x25BE;</a>
      <div popover ref="popover" class="dropdown-menu">
        <a href="/products/shoes">Shoes</a>
        <a href="/products/bags">Bags</a>
      </div>
    </nav>
  </jay:popover-menu>
</body>
```

**Required refs:** `trigger` (the hover target), `popover` (must have `popover` attribute)

**CSS:** Style with `:popover-open` for show/hide transitions:

```css
.dropdown-menu {
  opacity: 0;
  transition: opacity 0.2s;
}
.dropdown-menu:popover-open {
  opacity: 1;
}
```

## Scroll Carousel

Prev/next buttons for a CSS scroll-snap container. Tracks scroll position for button disabling.

```html
<head>
  <script
    type="application/jay-headless"
    plugin="@jay-framework/ui-kit"
    contract="scroll-carousel"
    key="carousel"
  ></script>
</head>
<body>
  <jay:scroll-carousel key="carousel">
    <div class="carousel">
      <button ref="carousel.prev" disabled="carousel.atStart">&#8249;</button>
      <div ref="carousel.container" class="carousel-track">
        <div class="slide">Slide 1</div>
        <div class="slide">Slide 2</div>
        <div class="slide">Slide 3</div>
      </div>
      <button ref="carousel.next" disabled="carousel.atEnd">&#8250;</button>
    </div>
  </jay:scroll-carousel>
</body>
```

**Required refs:** `container` (scrollable element), `prev`, `next` (buttons)

**ViewState:** `atStart` (boolean), `atEnd` (boolean) — use for disabling buttons or hiding arrows

**CSS:** The container must have scroll-snap:

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

## Clipboard Copy

Copies text to clipboard with a brief "Copied!" feedback state.

```html
<head>
  <script
    type="application/jay-headless"
    plugin="@jay-framework/ui-kit"
    contract="clipboard-copy"
    key="clip"
  ></script>
</head>
<body>
  <jay:clipboard-copy key="clip" text="{shareUrl}">
    <button ref="clip.copyBtn" class="copy-btn">
      <span if="!clip.copied">Copy Link</span>
      <span if="clip.copied">Copied!</span>
    </button>
  </jay:clipboard-copy>
</body>
```

**Required refs:** `copyBtn`

**Props:** `text` — the string to copy (bound from page ViewState)

**ViewState:** `copied` (boolean) — true for 2 seconds after copy
