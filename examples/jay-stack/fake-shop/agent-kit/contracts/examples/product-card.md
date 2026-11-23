# Example: Product Card

A medium-complex contract designed as a reusable sub-contract. Shows linked sub-contracts, variants for conditional rendering, and multiple interactive element types.

```yaml
name: product-card
description: Single product card with image, price, and quick-add. Used in product grids and search results.
tags:
  - { tag: _id, type: data, dataType: string }
  - { tag: name, type: data, dataType: string, required: true }
  - { tag: slug, type: data, dataType: string }
  - { tag: productUrl, type: data, dataType: string }
  - { tag: productLink, type: interactive, elementType: HTMLAnchorElement }

  # Media — inline sub-contract for the card thumbnail
  - tag: thumbnail
    type: sub-contract
    tags:
      - { tag: url, type: data, dataType: string, meta: { mediaType: wix-image } }
      - { tag: altText, type: data, dataType: string }
      - { tag: width, type: data, dataType: number }
      - { tag: height, type: data, dataType: number }

  # Pricing — fast+interactive because it changes with variant selection
  - { tag: price, type: data, dataType: string, phase: fast+interactive }
  - { tag: strikethroughPrice, type: data, dataType: string, phase: fast+interactive }
  - { tag: hasDiscount, type: variant, dataType: boolean }

  # Inventory — inline sub-contract with enum variant
  - tag: inventory
    type: sub-contract
    tags:
      - tag: availabilityStatus
        type: variant
        dataType: enum (IN_STOCK | OUT_OF_STOCK | PARTIALLY_OUT_OF_STOCK)

  # Quick-add — linked sub-contracts for option selection
  - tag: quickAddType
    type: variant
    dataType: enum (SIMPLE | SINGLE_OPTION | COLOR_AND_TEXT_OPTIONS | NEEDS_CONFIGURATION)

  - { tag: quickOption, type: sub-contract, link: ./product-options }
  - { tag: secondQuickOption, type: sub-contract, link: ./product-options }

  - { tag: addToCartButton, type: interactive, elementType: HTMLButtonElement }
  - { tag: isAddingToCart, type: variant, dataType: boolean, phase: fast+interactive }
  - { tag: cardContainer, type: interactive, elementType: HTMLElement }
```

## Why these choices

- **No props or params** — this is a sub-contract, not a standalone component. Data flows from the parent (search results, related products).
- **`link: ./product-options`** — the option/choice structure is shared with the product page, so it's extracted into its own file.
- **`quickAddType` enum** — drives which quick-add UI to show. The designer uses `if="quickAddType===SIMPLE"` etc.
- **`cardContainer` is `HTMLElement`** — not a button or link, just a generic element for mouseenter preloading.
- **Inline `thumbnail` sub-contract** — only used here, so no need to extract.

## Jay-HTML usage

```html
<a ref="productLink" class="product-card" ref="cardContainer">
  <img src="{thumbnail.url}" alt="{thumbnail.altText}" />
  <h3>{name}</h3>
  <div class="price">
    <span if="hasDiscount" class="original">{strikethroughPrice}</span>
    <span>{price}</span>
  </div>
  <button if="quickAddType===SIMPLE" ref="addToCartButton">Add to Cart</button>
</a>
```
