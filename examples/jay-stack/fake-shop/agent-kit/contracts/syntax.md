# Contract Syntax Reference

## Basic Structure

```yaml
name: ProductCard
description: What this contract does and when to use it.
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
  dataType: string
  required: true
  phase: slow
  description: Display name
```

Data types: `string` (default), `html-string`, `number`, `boolean`, `date`.

### `variant` — Conditionals (enum or boolean)

```yaml
- tag: status
  type: variant
  dataType: enum (AVAILABLE | OUT_OF_STOCK | PREORDER)
  phase: fast+interactive
```

Use in jay-html: `if="status===AVAILABLE"` or `if="isActive"` for booleans.

### `interactive` — Element refs for user interaction

```yaml
- tag: addToCart
  type: interactive
  elementType: HTMLButtonElement
```

Element types: `HTMLButtonElement`, `HTMLAnchorElement`, `HTMLInputElement`, `HTMLSelectElement`, `HTMLElement`, etc.

Interactive tags are always `fast+interactive` — do not specify a phase.

### Dual-type tags — Both data and interactive

```yaml
- tag: quantityInput
  type: [data, interactive]
  dataType: number
  elementType: HTMLInputElement
```

Use when an element both displays a value and accepts user input.

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
  link: ./author # relative path, resolves to author.jay-contract
```

### `sub-contract` with `repeated: true` — Arrays

```yaml
- tag: items
  type: sub-contract
  repeated: true
  trackBy: id
  phase: fast
  tags:
    - tag: id
      type: data
      dataType: string
    - tag: name
      type: data
      dataType: string
```

`trackBy` must reference a `data` tag with `string` or `number` type within the sub-contract.

## Rendering Phases

| Phase              | When               | Use for                                      |
| ------------------ | ------------------ | -------------------------------------------- |
| `slow`             | Build time (SSG)   | Static content, SEO data, product names      |
| `fast`             | Request time (SSR) | Per-request data, live pricing, stock status |
| `fast+interactive` | Request + client   | Data that also updates on the client         |
| _(no phase)_       | All phases         | Available everywhere                         |

**How to choose:**

- Known at build time? Use `slow`
- Changes per request (user, time, session)? Use `fast`
- Also updates on client after interaction? Use `fast+interactive`
- Interactive tags (refs) are always `fast+interactive`

**Phase rule for arrays:** Child phases must be >= parent phase.

## Props — Component configuration

Props are passed by the parent. Use for component inputs like IDs, configuration flags, display options.

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

## Params — URL route segments

Params come from dynamic route segments. Use for page-level routing.

```yaml
params:
  slug: string # required — from [slug]
  lang: string? # optional — from [[lang]]
  path: string[] # catch-all — from [...path]
```

## Async Data

Wrap any tag in `Promise<T>` with `async: true`:

```yaml
- tag: reviews
  type: data
  async: true
  dataType: string
```

## Tag Metadata

Free-form key-value map for plugin validators. The framework ignores `meta`; only validators read it.

```yaml
- tag: heroImage
  type: data
  dataType: string
  meta:
    vendor: wix-image
    defaultTransform: w_800,h_400,q_80
```

## Validation Rules

- Tag names must be unique at each level
- `repeated: true` requires `trackBy`
- `trackBy` must reference a `data` tag with `string` or `number` type
- Interactive tags cannot have an explicit `phase`
- Sub-contracts must have either `tags` (inline) or `link` (external), not both
- Array children must have phase >= parent phase
- Prop names must be unique
