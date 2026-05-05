# Pure CSS/HTML Patterns — No Component Needed

These patterns are achievable with HTML and CSS alone. Use them directly in jay-html without a headless component.

## Tabs (Radio-Based)

Hidden radio inputs drive tab switching via CSS `:checked` selectors.

```html
<div class="tabs">
  <input type="radio" name="tab" id="tab-details" checked hidden />
  <input type="radio" name="tab" id="tab-reviews" hidden />
  <input type="radio" name="tab" id="tab-specs" hidden />

  <nav class="tab-bar">
    <label for="tab-details" class="tab-label">Details</label>
    <label for="tab-reviews" class="tab-label">Reviews</label>
    <label for="tab-specs" class="tab-label">Specs</label>
  </nav>

  <div class="tab-panels">
    <div class="panel" id="panel-details">
      <p>Product details go here...</p>
    </div>
    <div class="panel" id="panel-reviews">
      <p>Customer reviews go here...</p>
    </div>
    <div class="panel" id="panel-specs">
      <p>Technical specifications go here...</p>
    </div>
  </div>
</div>
```

```css
/* Hide all panels by default */
.panel {
  display: none;
}

/* Show panel matching the checked radio */
#tab-details:checked ~ .tab-panels #panel-details {
  display: block;
}
#tab-reviews:checked ~ .tab-panels #panel-reviews {
  display: block;
}
#tab-specs:checked ~ .tab-panels #panel-specs {
  display: block;
}

/* Active tab styling */
.tab-label {
  cursor: pointer;
  padding: 8px 16px;
  border-bottom: 2px solid transparent;
}
#tab-details:checked ~ .tab-bar label[for='tab-details'],
#tab-reviews:checked ~ .tab-bar label[for='tab-reviews'],
#tab-specs:checked ~ .tab-bar label[for='tab-specs'] {
  border-bottom-color: #333;
  font-weight: bold;
}
```

**How it works:** Clicking a `<label>` checks its associated radio input. CSS `:checked` sibling selectors (`~`) show the matching panel.

## Accordion (`<details>` / `<summary>`)

Native HTML accordion with no JS. Each section opens independently.

```html
<div class="accordion">
  <details>
    <summary>Shipping Information</summary>
    <div class="accordion-content">
      <p>Free shipping on orders over $50...</p>
    </div>
  </details>

  <details>
    <summary>Return Policy</summary>
    <div class="accordion-content">
      <p>30-day return policy...</p>
    </div>
  </details>

  <details>
    <summary>Size Guide</summary>
    <div class="accordion-content">
      <p>Measurements for each size...</p>
    </div>
  </details>
</div>
```

```css
.accordion details {
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 8px;
}

summary {
  padding: 12px 16px;
  cursor: pointer;
  font-weight: bold;
}

.accordion-content {
  padding: 0 16px 12px;
}

/* Marker customization */
summary::marker {
  content: '+ ';
}
details[open] summary::marker {
  content: '- ';
}
```

**Single-open accordion:** Use the `name` attribute (same name = only one open at a time):

```html
<details name="faq">
  <summary>Question 1</summary>
  <p>Answer 1</p>
</details>
<details name="faq">
  <summary>Question 2</summary>
  <p>Answer 2</p>
</details>
```

## Tooltip (CSS-Only)

Hover tooltip using `::after` pseudo-element and `data-` attribute.

```html
<span class="has-tooltip" data-tooltip="Ships in 2-3 business days"> Shipping info &#9432; </span>
```

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

## Click-Triggered Popover (No JS)

For click-triggered popovers (not hover), use `popovertarget` — pure HTML, no component needed:

```html
<button popovertarget="info-popup">Show Info</button>
<div id="info-popup" popover>
  <p>This popup closes on click outside (light-dismiss).</p>
</div>
```

Style with `:popover-open`:

```css
#info-popup {
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #ddd;
}
```

No JS required — `popovertarget` handles the toggle. Use the `popover-menu` headless component only when you need **hover** triggers.
