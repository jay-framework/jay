# Plugin Contract Guide

For the full contract syntax, decision tree, and examples, see the shared [Contract Authoring Guide](../contracts/GUIDE.md).

This file covers plugin-specific contract concerns. Contracts (`.jay-contract` files) are the source of truth for a component's data shape. Define the contract before implementing the component.

> **Interactive components need a `./client` export.** If a component built from this contract declares
> an interactive phase (`.withInteractive(...)`) — or the plugin declares `contexts` — the package
> must expose a `./client` export (`./dist/index.client.js`) for browser hydration. `validate-plugin`
> detects interactivity by scanning the built server bundle and errors if `./client` is missing.
> Server-only (slow/fast) component plugins need no `./client`. See
> [plugin-structure.md](plugin-structure.md).

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
  dataType: string # string (default), html-string, number, boolean, date
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
    phase: fast # slow (default), fast, or fast+interactive
    description: The product to display
  - name: showPricing
    type: boolean
    default: 'true'
```

#### Prop phases — declare the phase you consume the prop

A prop has a `phase` just like a tag, and it declares **when your component reads that prop**. The binding at the usage site must have a source phase ≤ the prop's phase (validated at build; see [validation.md](validation.md)).

| Prop phase         | Resolved at       | At `slow` it is…   | Read it in                                      | At interactive it is…              |
| ------------------ | ----------------- | ------------------ | ----------------------------------------------- | ---------------------------------- |
| `slow` (default)   | build             | present            | `slowlyRender`, `fastRender`, `withInteractive` | a signal `() => T`, constant value |
| `fast`             | request           | `undefined` / `''` | `fastRender`, `withInteractive`                 | a signal `() => T`, constant value |
| `fast+interactive` | request (initial) | `undefined` / `''` | `fastRender`, `withInteractive`                 | a **reactive** signal `() => T`    |

Two rules to internalize:

- **A `fast` / `fast+interactive` prop is `undefined` (or `''` for a string binding) during `slow`.** Never read such a prop in `slowlyRender` — declare the prop at the phase where you actually consume it (the same phase your render function runs at). `markdown-content` reads `props.markdown` at slow → `slow`; `markdown-live` reads it at fast and as a signal at interactive → `fast+interactive`.
- **At the interactive phase every prop arrives as a signal (`() => T`)** — the same shape for all phases, reactive only for `fast+interactive`. Type interactive props as `() => T` in the `.ts` (matching client-only Jay), regardless of phase.

The prop type stays a single in-code declaration (`.withProps<T>()`) — the framework does not generate per-phase prop types. It is the author's job (backed by validation) not to read a `fast` prop at slow.

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

## Tag Metadata

Tags can carry a `meta` field — a free-form key-value map for plugin validators. The framework ignores `meta`; only validators read it.

```yaml
- tag: heroImage
  type: data
  dataType: string
  meta:
    vendor: wix-image
    defaultTransform: w_800,h_400,q_80
```

Use `meta` to attach semantic meaning that goes beyond the data type — e.g., marking a `string` tag as a URL that requires specific formatting. See [validation.md](validation.md) for writing validators that consume `meta`.

## Validation Rules

- Tag names must be unique at each level
- `repeated: true` requires `trackBy`
- `trackBy` must reference a `data` tag with `string` or `number` type
- Interactive tags cannot have an explicit `phase`
- Sub-contracts must have either `tags` (inline) or `link` (external), not both
- Array children must have phase >= parent phase
- Prop names must be unique
