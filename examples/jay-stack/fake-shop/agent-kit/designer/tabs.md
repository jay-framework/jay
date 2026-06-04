# Tabs

Switch between content panels with tab buttons. Pure CSS using radio inputs, no component needed.

## Usage

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

## CSS

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

## Accessibility

The radio+label pattern is natively keyboard-accessible (arrow keys switch tabs). For screen reader semantics, add ARIA roles:

```html
<nav class="tab-bar" role="tablist">
  <label for="tab-details" class="tab-label" role="tab">Details</label>
  <label for="tab-reviews" class="tab-label" role="tab">Reviews</label>
</nav>
<div class="tab-panels">
  <div class="panel" id="panel-details" role="tabpanel">...</div>
</div>
```

All panel content is in the DOM — search engines see everything regardless of which tab is active.
