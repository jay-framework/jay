# Tooltip

Hover tooltip showing extra info. Pure CSS using `::after` pseudo-element, no component needed.

**Accessibility note:** CSS `::after` content is NOT read by most screen readers. Use `title` or `aria-label` for the accessible version of the tooltip text:

## Usage

```html
<span class="has-tooltip"
      data-tooltip="Ships in 2-3 business days"
      aria-label="Ships in 2-3 business days">
  Shipping info &#9432;
</span>
```

The `data-tooltip` drives the CSS visual tooltip. The `aria-label` makes the same text available to screen readers.

## CSS

```css
.has-tooltip {
  position: relative;
  cursor: help;
}
.has-tooltip::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 10px;
  background: #333;
  color: white;
  border-radius: 4px;
  font-size: 13px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}
.has-tooltip:hover::after {
  opacity: 1;
}
```
