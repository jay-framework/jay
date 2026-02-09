# Contracts and Plugins

## Discovery: Plugins Index

After running `jay-stack agent-kit`, read `materialized-contracts/plugins-index.yaml`:

```yaml
materialized_at: '2026-02-09T...'
jay_stack_version: '1.0.0'
plugins:
  - name: wix-stores
    path: ./node_modules/@wix/stores
    contracts:
      - name: product-page
        type: static
        path: ./node_modules/@wix/stores/lib/contracts/product-page.jay-contract
      - name: product-search
        type: static
        path: ./node_modules/@wix/stores/lib/contracts/product-search.jay-contract
```

Fields:

- `name` — plugin name (use in `plugin="..."` attributes in jay-html)
- `path` — path to plugin root (relative to project root)
- `contracts[].name` — contract name (use in `contract="..."` attributes)
- `contracts[].type` — `static` (defined in source) or `dynamic` (generated at runtime)
- `contracts[].path` — path to the `.jay-contract` file you can read

## Discovery: Contracts Index

`materialized-contracts/contracts-index.yaml` lists all contracts across all plugins:

```yaml
contracts:
  - plugin: wix-stores
    name: product-page
    type: static
    path: ./node_modules/@wix/stores/lib/contracts/product-page.jay-contract
```

## Reading plugin.yaml

Each plugin has a `plugin.yaml` at its root (the `path` from plugins-index):

```yaml
name: wix-stores
contracts:
  - name: product-page
    contract: product-page.jay-contract
    component: productPage
    description: Complete headless product page with server-side rendering
  - name: product-search
    contract: product-search.jay-contract
    component: productSearch
    description: Headless product search page
actions:
  - searchProducts
  - getProductBySlug
  - getCategories
```

Key fields:

- `contracts[].name` — use in `contract="..."` in jay-html
- `contracts[].description` — what the component does (helps you decide which to use)
- `actions[]` — action names you can run with `jay-stack action <plugin>/<action>`

## Reading .jay-contract Files

Contracts define the data shape (ViewState), interaction points (Refs), and rendering phases.

### Tag Types

| Type                              | Purpose                          | Jay-HTML Usage                    |
| --------------------------------- | -------------------------------- | --------------------------------- |
| `data`                            | Read-only data value             | `{tagName}` binding               |
| `variant`                         | Enum or boolean for conditions   | `if="tagName===value"`            |
| `interactive`                     | Element ref for user interaction | `ref="tagName"`                   |
| `[data, interactive]`             | Both data and interactive        | `{tagName}` + `ref="tagName"`     |
| `sub-contract`                    | Nested object                    | `{parent.child}`                  |
| `sub-contract` + `repeated: true` | Array for loops                  | `forEach="tagName" trackBy="..."` |

### Phases

| Phase              | When                     | Example                                   |
| ------------------ | ------------------------ | ----------------------------------------- |
| `slow`             | Build time (SSG)         | Product name, description, static content |
| `fast`             | Request time (SSR)       | Live pricing, stock status                |
| `fast+interactive` | Request + client updates | Price that updates on variant selection   |
| _(no phase)_       | All phases               | Available everywhere                      |

### Props

Components that accept props:

```yaml
props:
  - name: productId
    type: string
    required: true
    description: The ID of the product to display
```

Use in jay-html: `<jay:contract-name productId="value">`.

### Params

Page components with dynamic routes:

```yaml
params:
  slug: string
```

Params are always strings. Discover values with `jay-stack params`.

### Linked Sub-Contracts

A sub-contract can reference another contract file:

```yaml
- tag: mediaGallery
  type: sub-contract
  phase: fast+interactive
  link: ./media-gallery # refers to media-gallery.jay-contract in same directory
```

Read the linked file to see the nested tags.

## Contract Examples

**Simple component with props:**

```yaml
name: ProductWidget
props:
  - name: productId
    type: string
    required: true
tags:
  - tag: name
    type: data
    dataType: string
    phase: slow
  - tag: price
    type: data
    dataType: number
    phase: slow
  - tag: inStock
    type: variant
    dataType: boolean
    phase: fast+interactive
  - tag: addToCart
    type: interactive
    elementType: HTMLButtonElement
```

**Page with nested loops:**

```yaml
name: product-page
tags:
  - tag: productName
    type: data
    dataType: string
  - tag: price
    type: data
    dataType: string
    phase: fast+interactive
  - tag: addToCartButton
    type: interactive
    elementType: HTMLButtonElement
  - tag: options
    type: sub-contract
    repeated: true
    trackBy: _id
    tags:
      - tag: _id
        type: data
        dataType: string
      - tag: name
        type: data
        dataType: string
      - tag: choices
        type: sub-contract
        repeated: true
        trackBy: choiceId
        tags:
          - tag: choiceId
            type: data
            dataType: string
          - tag: name
            type: data
            dataType: string
          - tag: isSelected
            type: variant
            dataType: boolean
            phase: fast+interactive
          - tag: choiceButton
            type: interactive
            elementType: HTMLButtonElement
```

## From Contract to Jay-HTML

### Step by step

1. **Read the contract** — identify tags, their types, and phases
2. **Map `data` tags** → `{tagName}` bindings
3. **Map `variant` tags** → `if="tagName===value"` conditions
4. **Map `interactive` tags** → `ref="tagName"` on appropriate element types
5. **Map `sub-contract` + `repeated: true`** → `forEach="tagName" trackBy="..."` loops
6. **Map nested `sub-contract`** → dotted paths or nested context inside forEach
7. **Respect phases** — don't assume fast-only data is available at build time

### Quick mapping

| Contract Tag                                                     | Jay-HTML                                      |
| ---------------------------------------------------------------- | --------------------------------------------- |
| `{tag: title, type: data}`                                       | `<h1>{title}</h1>`                            |
| `{tag: active, type: variant, dataType: boolean}`                | `<span if="active">Active</span>`             |
| `{tag: status, type: variant, dataType: "enum (A \| B)"}`        | `<div if="status===A">...</div>`              |
| `{tag: btn, type: interactive, elementType: HTMLButtonElement}`  | `<button ref="btn">Click</button>`            |
| `{tag: link, type: interactive, elementType: HTMLAnchorElement}` | `<a ref="link">Go</a>`                        |
| `{tag: input, type: interactive, elementType: HTMLInputElement}` | `<input ref="input" value="{val}" />`         |
| `{tag: sel, type: interactive, elementType: HTMLSelectElement}`  | `<select ref="sel">...</select>`              |
| `{tag: items, type: sub-contract, repeated: true, trackBy: id}`  | `<div forEach="items" trackBy="id">...</div>` |
| `{tag: detail, type: sub-contract}`                              | `{detail.fieldName}`                          |
