# Contract Authoring Guide

Contracts (`.jay-contract` files) are the source of truth for a component's data shape. Define the contract before implementing the component.

## Basic Structure

```yaml
name: ProductCard
description: Displays a single product with price and add-to-cart. Use for product grids and featured sections.
props:
  - name: productId
    type: string
    required: true
    description: The product to display
params:
  slug: string
tags:
  - tag: name
    type: data
    dataType: string
    phase: slow
```

## Tag Types

### `data` — Read-only values

```yaml
- tag: productName
  type: data
  dataType: string # string (default), number, boolean, date
  required: true # optional, defaults to false
  phase: slow # slow, fast, or fast+interactive
  description: Display name
```

### `variant` — Enum/boolean for conditionals

```yaml
- tag: status
  type: variant
  dataType: enum (AVAILABLE | OUT_OF_STOCK | PREORDER)
  phase: fast+interactive
```

### `interactive` — Element refs for user interaction

```yaml
- tag: addToCart
  type: interactive
  elementType: HTMLButtonElement # HTMLAnchorElement, HTMLInputElement, HTMLSelectElement, etc.
```

Interactive tags are always `fast+interactive` — do not specify a phase.

A tag can be both data and interactive:

```yaml
- tag: quantityInput
  type: [data, interactive]
  dataType: number
  elementType: HTMLInputElement
```

### `sub-contract` — Nested objects

Inline:

```yaml
- tag: pricing
  type: sub-contract
  tags:
    - tag: amount
      type: data
      dataType: number
    - tag: currency
      type: data
      dataType: string
```

Linked (reference another contract file):

```yaml
- tag: author
  type: sub-contract
  link: ./author.jay-contract # relative path (same package)
```

For dynamic/materialized contracts linking to static contracts in a plugin package, use the package path:

```yaml
- tag: gallery
  type: sub-contract
  link: '@my-org/my-plugin/media-gallery' # package path (cross-directory)
```

### `sub-contract` with `repeated: true` — Arrays

```yaml
- tag: items
  type: sub-contract
  repeated: true
  trackBy: id # Required: identifies each item
  phase: fast
  tags:
    - tag: id
      type: data
      dataType: string
    - tag: name
      type: data
      dataType: string
```

`trackBy` must reference a `data` tag with `string` or `number` type within the same sub-contract.

## Async Data

Wrap any tag in `Promise<T>` with `async: true`:

```yaml
- tag: reviews
  type: data
  async: true
  dataType: string # Compiles to Promise<string>

- tag: relatedProducts
  type: sub-contract
  repeated: true
  trackBy: id
  async: true # Compiles to Promise<Array<...>>
  tags:
    - tag: id
      type: data
      dataType: string
```

## Rendering Phases

Each tag has a phase that determines when its data is available:

| Phase              | When               | Use For                                 |
| ------------------ | ------------------ | --------------------------------------- |
| `slow`             | Build time (SSG)   | Static content, SEO data, product names |
| `fast`             | Request time (SSR) | Per-request data, live pricing, stock   |
| `fast+interactive` | Request + client   | Data that also updates on the client    |

**How to choose:**

- Can the data be known at build time? Use `slow`
- Does it change per request (user, time, session)? Use `fast`
- Does it also update on the client after interaction? Use `fast+interactive`
- Interactive tags (refs) are always `fast+interactive`

**Phase rules for arrays:** Child phases must be >= parent phase. If the array is `fast`, all children must be `fast` or later.

## Props vs Params

### Props — Component configuration

Props are passed by the parent component or jay-html template. Use for component inputs like IDs, configuration flags, display options.

```yaml
props:
  - name: productId
    type: string
    required: true
    description: The product to display
  - name: showPricing
    type: boolean
    default: 'true'
```

### Params — URL route segments

Params come from dynamic route segments (`[slug]`, `[[lang]]`, `[...path]`). Use for page-level routing data.

```yaml
params:
  slug: string # required — from [slug]
  lang: string? # optional — from [[lang]]
  path: string[] # catch-all — from [...path]
```

## Description Field

Always include a `description` at the contract level explaining when to use this contract:

```yaml
name: product-search
description: Product listing with filters, sorting, and pagination. Use for search results and category pages.
```

## Validation Rules

- Tag names must be unique at each level
- `repeated: true` requires `trackBy`
- `trackBy` must reference a `data` tag with `string` or `number` type
- Interactive tags cannot have an explicit `phase`
- Sub-contracts must have either `tags` (inline) or `link` (external), not both
- Array children must have phase >= parent phase
- Prop names must be unique
