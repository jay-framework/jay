# Design Log #132 — UI Kit: Headless Primitives

## Background

Jay separates visual design (jay-html + CSS) from component logic (headless components). Most UI patterns can be built with pure HTML and CSS — modern CSS has `scroll-snap`, `overflow: auto`, `:hover`, `details/summary`, and the Popover API covers most interactive needs.

But some patterns need a thin JS shim — one or two lines that bridge between a user event and a CSS/HTML state change. These are not "components" in the traditional sense; they're micro-interactions that complete what HTML/CSS can almost do alone.

Other patterns need **no JS at all** — they're pure CSS/HTML techniques that designers may not know about. These are documented as **skills** (agent-kit guides) rather than implemented as components.

This plugin (`@jay-framework/ui-kit`) provides:

1. **Headless components** for the patterns that genuinely need JS
2. **Designer skills** (agent-kit guides) for patterns that are pure CSS/HTML

## Problem

Designers building jay-html pages need common UI patterns. Some need a developer to write JS; others are achievable with pure HTML/CSS but the techniques aren't widely known:

**Needs JS (headless component):**

1. **Popover menus** — Popover API requires `el.showPopover()` for hover triggers
2. **Scroll carousels** — CSS scroll-snap handles snapping, but prev/next buttons need `el.scrollBy()`
3. **Copy-to-clipboard** — `navigator.clipboard.writeText()` is the only option

**Pure CSS/HTML (skill / guide only):** 
4. **Tabs** — radio inputs + `:checked` selector + CSS sibling combinators 
5. **Accordions** — `<details>` / `<summary>` with CSS transitions 
6. **Tooltips** — CSS `:hover` + `::after` pseudo-elements or Popover API with `popovertarget` (click-triggered) 
7. **Responsive navigation** — checkbox toggle + CSS media queries

## Design Principles

### What becomes a headless component

- HTML/CSS handles **90%+** of the behavior
- The remaining JS gap is **small and generic**
- The component adds **no DOM elements** — only attaches behavior to designer-provided refs

### What becomes a skill (guide)

- The pattern is **achievable with pure HTML/CSS**
- Designers may not know the technique
- The guide teaches the HTML structure + CSS needed, no component required

### What does NOT belong

- Components with business logic (cart, search, auth)
- Components that generate markup
- Patterns that are trivial and well-known

## Headless Components

### 1. Popover Menu (`popover-menu`)

**HTML/CSS reality:** The Popover API (`popover` attribute) provides light-dismiss (click outside to close), top-layer rendering, and `::backdrop`. CSS `:popover-open` handles show/hide transitions. `popovertarget` works for click triggers. But **hover triggers** require JS — `showPopover()`.

**What the component does:**

- On trigger mouseenter → `popover.showPopover()`
- Light-dismiss handles closing (click outside) — no JS needed for that

**Contract:**

```yaml
name: popover-menu
tags:
  - tag: trigger
    type: interactive
    elementType: HTMLElement
    description: Element that opens the popover on hover

  - tag: popover
    type: interactive
    elementType: HTMLElement
    description: Element with popover attribute to show/hide
```

**Designer's jay-html:**

```html
<jay:popover-menu>
  <nav>
    <a href="/products" ref="trigger">Products</a>
    <div popover ref="popover" class="submenu">
      <a href="/products/shoes">Shoes</a>
      <a href="/products/bags">Bags</a>
    </div>
  </nav>
</jay:popover-menu>
```

**Interactive code:**

```typescript
refs.trigger.onmouseenter(() => {
  refs.popover.exec$((el) => el.showPopover());
});
```

### 2. Scroll Carousel (`scroll-carousel`)

**HTML/CSS reality:** CSS `scroll-snap-type`, `overflow-x: auto`, and `scroll-snap-align` handle snapping. CSS `scroll-behavior: smooth` handles animation. But prev/next buttons need `container.scrollBy()`.

**What the component does:**

- Prev button → `container.scrollBy({ left: -containerWidth, behavior: 'smooth' })`
- Next button → `container.scrollBy({ left: containerWidth, behavior: 'smooth' })`
- Tracks `atStart` / `atEnd` for disabling buttons

**Contract:**

```yaml
name: scroll-carousel
tags:
  - tag: container
    type: interactive
    elementType: HTMLElement
    description: Scrollable container with overflow-x auto and scroll-snap

  - tag: prev
    type: interactive
    elementType: HTMLButtonElement
    description: Scroll to previous item

  - tag: next
    type: interactive
    elementType: HTMLButtonElement
    description: Scroll to next item

  - tag: atStart
    type: [data, interactive]
    dataType: boolean
    phase: fast+interactive
    description: True when scrolled to the beginning

  - tag: atEnd
    type: [data, interactive]
    dataType: boolean
    phase: fast+interactive
    description: True when scrolled to the end
```

**Designer's jay-html:**

```html
<jay:scroll-carousel>
  <div class="carousel">
    <button ref="prev" disabled="atStart" class="carousel-btn prev">&#8249;</button>
    <div ref="container" class="carousel-track">
      <img src="/img/1.jpg" />
      <img src="/img/2.jpg" />
      <img src="/img/3.jpg" />
    </div>
    <button ref="next" disabled="atEnd" class="carousel-btn next">&#8250;</button>
  </div>
</jay:scroll-carousel>
```

**Interactive code:**

```typescript
refs.prev.onclick(() => {
  refs.container.exec$((el) => {
    el.scrollBy({ left: -el.clientWidth, behavior: 'smooth' });
  });
});

refs.next.onclick(() => {
  refs.container.exec$((el) => {
    el.scrollBy({ left: el.clientWidth, behavior: 'smooth' });
  });
});

refs.container.exec$((el) => {
  const update = () => {
    setAtStart(el.scrollLeft <= 0);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  };
  el.addEventListener('scroll', update);
  update();
});
```

### 3. Clipboard Copy (`clipboard-copy`)

**What the component does:**

- On button click → copy text to clipboard
- Toggle `copied` state for visual feedback (auto-resets after 2s)

**Contract:**

```yaml
name: clipboard-copy
tags:
  - tag: text
    type: data
    dataType: string
    phase: fast+interactive
    description: Text to copy

  - tag: copied
    type: data
    dataType: boolean
    phase: fast+interactive
    description: True for a short period after copying

  - tag: copyBtn
    type: interactive
    elementType: HTMLButtonElement
    description: Button that triggers the copy
```

**Designer's jay-html:**

```html
<jay:clipboard-copy text="{shareUrl}">
  <button ref="copyBtn" class="copy-btn">
    <span if="!copied">Copy Link</span>
    <span if="copied">Copied!</span>
  </button>
</jay:clipboard-copy>
```

## Pure CSS/HTML Skills (guides, no components)

These are documented in the plugin's agent-kit as designer skills. The plugin ships the guides; the designer follows the pattern directly in jay-html.

### Tabs (radio-based)

Use hidden radio inputs + `:checked` + CSS sibling selectors:

```html
<div class="tabs">
  <input type="radio" name="tab" id="tab-details" checked hidden />
  <input type="radio" name="tab" id="tab-reviews" hidden />
  <input type="radio" name="tab" id="tab-specs" hidden />

  <nav class="tab-bar">
    <label for="tab-details">Details</label>
    <label for="tab-reviews">Reviews</label>
    <label for="tab-specs">Specs</label>
  </nav>

  <div class="tab-panels">
    <div class="panel" id="panel-details">Details content...</div>
    <div class="panel" id="panel-reviews">Reviews content...</div>
    <div class="panel" id="panel-specs">Specs content...</div>
  </div>
</div>
```

```css
.panel {
  display: none;
}
#tab-details:checked ~ .tab-panels #panel-details {
  display: block;
}
#tab-reviews:checked ~ .tab-panels #panel-reviews {
  display: block;
}
#tab-specs:checked ~ .tab-panels #panel-specs {
  display: block;
}
```

### Accordion (`<details>`)

```html
<details>
  <summary>Section Title</summary>
  <div class="content">Content here...</div>
</details>
```

CSS transitions can animate the open/close with `@starting-style` (Chrome 117+).

### Tooltip (CSS-only)

```html
<span class="tooltip-trigger" data-tooltip="Helpful text">Hover me</span>
```

```css
.tooltip-trigger {
  position: relative;
}
.tooltip-trigger::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  opacity: 0;
  transition: opacity 0.2s;
  /* styling */
}
.tooltip-trigger:hover::after {
  opacity: 1;
}
```

## Plugin-Contributed Agent-Kit Guides

The ui-kit plugin ships an `agent-kit/` folder with guides for both roles:

```
packages/plugins/ui-kit/
├── agent-kit/
│   └── designer/
│       ├── ui-kit-components.md    # How to use popover-menu, scroll-carousel, clipboard-copy
│       └── css-patterns.md         # Pure CSS tabs, accordions, tooltips — no component needed
```

These guides are merged into the project's agent-kit during `jay-stack agent-kit`, making the patterns discoverable for AI agents creating pages.

## Questions

1. **Q: Should this be one plugin or multiple?**

   A: One plugin (`@jay-framework/ui-kit`). Components are tiny, guides are related. Easier to discover as a collection.

2. **Q: Should components have props for configuration (e.g., scroll amount)?**

   A: Start minimal — no props. Defaults should work for 90% of cases.

3. **Q: What about accessibility (ARIA)?**

   A: Components set required ARIA attributes (e.g., `aria-expanded` on popover trigger). Pure CSS patterns include ARIA guidance in the skill guides.

## Implementation Plan

### Phase 1: Plugin scaffold + CSS skill guides

Create `packages/plugins/ui-kit/` with plugin.yaml, package.json, vite.config.ts. Write the CSS pattern guides (tabs, accordion, tooltip).

### Phase 2: popover-menu + scroll-carousel + clipboard-copy

Implement the three headless components. Add to fake-shop as a demonstration page.

### Phase 3: Agent-kit integration

Ensure designer guides are merged during `jay-stack agent-kit`.

## Trade-offs

- **Skills vs components**: Some patterns (tabs) could be either. The CSS-only approach avoids a runtime dependency but requires more designer knowledge. The skill guide bridges this gap.
- **Popover API support**: Chrome 114+, Firefox 125+, Safari 17+. Graceful degradation for older browsers.
- **No visual output**: Headless components add zero DOM. If a designer forgets a `ref`, nothing happens. The agent-kit guides document required refs clearly.
