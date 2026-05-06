# Accordion

Collapsible sections using native `<details>` / `<summary>`. Pure HTML, no component needed.

## Usage

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

## CSS

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
summary::marker {
  content: '+ ';
}
details[open] summary::marker {
  content: '- ';
}
```

## Single-open accordion

Use the `name` attribute — same name means only one section open at a time:

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

## Collapsible text (single section)

A standalone `<details>` works as a "read more" / "show details" toggle — no wrapper needed:

```html
<details>
  <summary>Read more</summary>
  <p>Extended content that's hidden by default...</p>
</details>
```
