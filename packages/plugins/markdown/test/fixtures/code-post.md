---
title: Code Examples
---

# Code Examples

## JavaScript

```javascript
function greet(name) {
    return `Hello, ${name}!`;
}
const result = greet("world");
```

## HTML

```html
<div class="container">
    <h1>Title</h1>
    <p>Content here</p>
</div>
```

## CSS

```css
.container {
    display: flex;
    gap: 1rem;
    padding: 16px;
    background: #f0f0f0;
}
```

## YAML

```yaml
name: my-plugin
version: 1.0.0
# A comment
tags:
  - tag: title
    type: data
```

## Python

```python
def fibonacci(n):
    """Calculate fibonacci number."""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

result = fibonacci(10)
```
