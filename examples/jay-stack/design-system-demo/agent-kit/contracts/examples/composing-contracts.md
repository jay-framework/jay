# Example: Composing Contracts

How contracts link together into a reusable hierarchy. This example shows the wix-stores composition pattern.

## The Hierarchy

```
media.jay-contract                  ← Trivial: url + mediaType
  ↑
media-gallery.jay-contract          ← Links to media, adds thumbnail navigation
  ↑
product-page.jay-contract           ← Links to media-gallery, adds options, pricing

product-options.jay-contract        ← Reusable option/choice structure
  ↑
product-card.jay-contract           ← Links to product-options for quick-add
  ↑
product-search.jay-contract         ← Links to product-card for search results
```

## Level 1: Leaf contract

The simplest building block. No sub-contracts, no links.

```yaml
# media.jay-contract
name: media
description: Single media item.
tags:
  - { tag: url, type: data, dataType: string, meta: { mediaType: wix-image } }
  - { tag: mediaType, type: variant, dataType: 'enum (IMAGE | VIDEO)' }
```

## Level 2: Composing leaves

Links to a leaf contract and adds its own structure.

```yaml
# media-gallery.jay-contract
name: mediaGallery
description: Image/video gallery with thumbnail navigation.
tags:
  - tag: selectedMedia
    type: sub-contract
    link: ./media

  - tag: availableMedia
    type: sub-contract
    repeated: true
    trackBy: mediaId
    tags:
      - { tag: mediaId, type: data }
      - { tag: media, type: sub-contract, link: ./media }
      - tag: selected
        type: [variant, interactive]
        dataType: enum(selected | notSelected)
        elementType: HTMLImageElement | HTMLDivElement
```

## Level 3: Page contract composing everything

The product page links to the gallery (which links to media) and adds its own options, pricing, and actions.

```yaml
# product-page.jay-contract (abbreviated)
name: product-page
params:
  slug: string
tags:
  - { tag: productName, type: data, dataType: string }
  - { tag: mediaGallery, type: sub-contract, phase: fast+interactive, link: ./media-gallery }
  - { tag: price, type: data, dataType: string, phase: fast+interactive }
  # ... options, actions, etc.
```

## Parallel composition

The same `product-options.jay-contract` is linked by both the product page (inline options) and the product card (quick-add):

```yaml
# In product-card.jay-contract
- { tag: quickOption, type: sub-contract, link: ./product-options }
# In product-page.jay-contract — options are defined inline because they have
# page-specific additions (text choice dropdown, modifier support)
```

## When to extract vs inline

| Extract into a linked file                                 | Keep inline                             |
| ---------------------------------------------------------- | --------------------------------------- |
| Used by 2+ contracts                                       | Used by only one contract               |
| Complex enough to be its own concept (media, product-card) | Simple nested object (pricing, summary) |
| Has its own identity that designers/developers reference   | Just a grouping of related fields       |

## Benefits of composition

- **Single source of truth** — change `media.jay-contract` once, all galleries update
- **Readability** — each file stays focused on one concept
- **Reusability** — `product-card` is used in search, related products, and category pages
- **Independent testing** — each contract level can be validated independently
