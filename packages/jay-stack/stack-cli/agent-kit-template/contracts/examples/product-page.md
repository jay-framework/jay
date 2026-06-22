# Example: Product Page

A complex page contract with params, nested repeated sub-contracts, linked sub-contracts, and multiple rendering phases.

```yaml
name: product-page
description: Full product detail page with variants, options, media gallery, and add-to-cart.
params:
  slug: string
  prefix: string?
  category: string?
tags:
  - { tag: _id, type: data, dataType: string }
  - { tag: productName, type: data, dataType: string, required: true }
  - { tag: description, type: data, dataType: html-string }
  - { tag: brand, type: data, dataType: string }
  - { tag: ribbon, type: data, dataType: string }
  - { tag: productType, type: variant, dataType: 'enum (PHYSICAL | DIGITAL)' }

  # Linked sub-contract for the media gallery
  - tag: mediaGallery
    type: sub-contract
    phase: fast+interactive
    link: ./media-gallery

  # Pricing — per-variant, changes on client
  - { tag: sku, type: data, dataType: string, phase: fast+interactive }
  - { tag: price, type: data, dataType: string, phase: fast+interactive }
  - { tag: strikethroughPrice, type: data, dataType: string, phase: fast+interactive }
  - {
      tag: stockStatus,
      type: variant,
      dataType: 'enum (OUT_OF_STOCK | IN_STOCK)',
      phase: fast+interactive,
    }

  # Quantity controls — dual-type tag (data + interactive)
  - tag: quantity
    type: sub-contract
    tags:
      - { tag: decrementButton, type: interactive, elementType: HTMLButtonElement }
      - { tag: incrementButton, type: interactive, elementType: HTMLButtonElement }
      - {
          tag: quantity,
          type: [data, interactive],
          dataType: number,
          elementType: HTMLInputElement,
        }

  # Call to action
  - { tag: addToCartButton, type: interactive, elementType: HTMLButtonElement, required: true }
  - { tag: buyNowButton, type: interactive, elementType: HTMLButtonElement, required: true }
  - { tag: actionsEnabled, type: variant, dataType: boolean, phase: fast+interactive }

  # Options — nested repeated sub-contracts (options → choices)
  - tag: options
    type: sub-contract
    repeated: true
    trackBy: _id
    tags:
      - { tag: _id, type: data, dataType: string }
      - { tag: name, type: data, dataType: string }
      - {
          tag: optionRenderType,
          type: variant,
          dataType: 'enum (TEXT_CHOICES | COLOR_SWATCH_CHOICES)',
        }
      - { tag: textChoice, type: interactive, elementType: HTMLSelectElement }

      - tag: choices
        type: sub-contract
        repeated: true
        trackBy: choiceId
        tags:
          - { tag: choiceId, type: data, dataType: string }
          - { tag: name, type: data, dataType: string }
          - { tag: colorCode, type: data, dataType: string }
          - { tag: inStock, type: data, dataType: boolean }
          - { tag: isSelected, type: variant, dataType: boolean, phase: fast+interactive }
          - { tag: choiceButton, type: interactive, elementType: HTMLButtonElement }

  # Info sections — repeated content blocks
  - tag: infoSections
    type: sub-contract
    repeated: true
    trackBy: _id
    tags:
      - { tag: _id, type: data, dataType: string }
      - { tag: title, type: data, dataType: string }
      - { tag: plainDescription, type: data, dataType: html-string }
```

## Why these choices

- **`params`** — this is a page contract with dynamic route segments (`/products/[slug]`).
- **`link: ./media-gallery`** — the gallery is complex enough to warrant its own file and is reusable.
- **Options are inline** — despite being complex, they're specific to the product page and not reused elsewhere.
- **`html-string` for description** — the product description contains HTML formatting from the CMS.
- **`[data, interactive]` for quantity** — the input both displays the current value and accepts user input.
- **No phase on product name** — available at all phases (SSG, SSR, and client).
- **`fast+interactive` on pricing** — prices change when a variant is selected on the client.
- **Nested `repeated`** — options contain choices, both with their own `trackBy` for efficient diffing.

## Jay-HTML usage

```html
<h1>{productName}</h1>
<div class="price">
  <span>{price}</span>
  <span if="stockStatus===OUT_OF_STOCK" class="out-of-stock">Out of Stock</span>
</div>

<div forEach="options" trackBy="_id">
  <h3>{name}</h3>
  <div if="optionRenderType===COLOR_SWATCH_CHOICES">
    <div forEach="choices" trackBy="choiceId">
      <button ref="choiceButton" style="background: {colorCode}" class="swatch" if="isSelected">
        selected
      </button>
    </div>
  </div>
</div>

<button ref="addToCartButton">Add to Cart</button>
```
