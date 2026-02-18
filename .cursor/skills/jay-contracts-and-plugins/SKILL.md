---
name: jay-contracts-and-plugins
description: Read plugin.yaml files and materialized contracts from the agent-kit to understand available components, data shapes, and rendering phases. Use when you need to discover what plugins/contracts exist or understand a contract's tags before creating jay-html.
---

# Contracts and Plugins Discovery

## Setup

Run `jay-stack agent-kit` first to generate indexes and materialize dynamic contracts:

```bash
yarn jay-stack agent-kit
```

This writes to `agent-kit/materialized-contracts/`.

## Reading the Plugins Index

**File:** `agent-kit/materialized-contracts/plugins-index.yaml`

```yaml
materialized_at: "2026-02-09T..."
jay_stack_version: "1.0.0"
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

**Fields:**
- `name` — plugin name (use in `plugin="..."` attributes)
- `path` — path to plugin root (relative to project root)
- `contracts[].name` — contract name (use in `contract="..."` attributes)
- `contracts[].type` — `static` (defined in source) or `dynamic` (generated at runtime)
- `contracts[].path` — path to the `.jay-contract` file

## Reading the Contracts Index

**File:** `agent-kit/materialized-contracts/contracts-index.yaml`

```yaml
materialized_at: "2026-02-09T..."
jay_stack_version: "1.0.0"
contracts:
  - plugin: wix-stores
    name: product-page
    type: static
    path: ./node_modules/@wix/stores/lib/contracts/product-page.jay-contract
  - plugin: wix-stores
    name: product-search
    type: static
    path: ./node_modules/@wix/stores/lib/contracts/product-search.jay-contract
```

Use the `path` field to read the actual contract file.

## Reading a Plugin's plugin.yaml

Located at the plugin's root (the `path` from plugins-index). Structure:

```yaml
name: wix-stores
contracts:
  - name: product-page
    contract: product-page.jay-contract    # path to contract file (relative to plugin)
    component: productPage                 # exported component name
    description: Complete headless product page
  - name: product-search
    contract: product-search.jay-contract
    component: productSearch
    description: Headless product search page
actions:
  - searchProducts
  - getProductBySlug
  - getCategories
```

**Key fields:**
- `contracts[].name` — contract name for `contract="..."` in jay-html
- `contracts[].description` — what the component does
- `actions[]` — action names for `jay-stack action <plugin>/<action>`

## Reading a .jay-contract File

Contracts define the data shape (ViewState), interaction points (Refs), and rendering phases.

### Tag Types

| Type | Purpose | Jay-HTML Usage |
|------|---------|---------------|
| `data` | Read-only data value | `{tagName}` binding |
| `variant` | Enum or boolean for conditions | `if="tagName===value"` |
| `interactive` | Element ref for user interaction | `ref="tagName"` |
| `[data, interactive]` | Both data and interactive | `{tagName}` + `ref="tagName"` |
| `sub-contract` | Nested object | `{parent.child}` |
| `sub-contract` + `repeated: true` | Array for loops | `forEach="tagName" trackBy="..."` |

### Phases

| Phase | When | Example |
|-------|------|---------|
| `slow` | Build time (SSG) | Product name, description, static content |
| `fast` | Request time (SSR) | Live pricing, stock status |
| `fast+interactive` | Request + client updates | Price that updates on variant selection |
| *(no phase)* | All phases | Available everywhere |

### Props

Components that accept props declare them:

```yaml
props:
  - name: productId
    type: string
    required: true
    description: The ID of the product to display
```

Use in jay-html: `<jay:contract-name productId="value">`.

### Params

Page components with dynamic routes declare params:

```yaml
params:
  slug: string
```

Params are always strings (URL params). Discover values with `jay-stack params`.

### Contract Examples

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

**Complex page with sub-contracts and loops:**

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
  - tag: stockStatus
    type: variant
    dataType: "enum (OUT_OF_STOCK | IN_STOCK)"
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

**Linked sub-contract** (references another contract file):

```yaml
- tag: mediaGallery
  type: sub-contract
  phase: fast+interactive
  link: ./media-gallery        # refers to media-gallery.jay-contract in same dir
```

## From Contract to Jay-HTML

### Step-by-step

1. **Read the contract** — identify tags, their types, and phases
2. **Map `data` tags** → `{tagName}` bindings in HTML
3. **Map `variant` tags** → `if="tagName===value"` conditions
4. **Map `interactive` tags** → `ref="tagName"` on appropriate elements (`HTMLButtonElement` → `<button>`, `HTMLInputElement` → `<input>`, `HTMLAnchorElement` → `<a>`, `HTMLSelectElement` → `<select>`)
5. **Map `sub-contract` with `repeated: true`** → `forEach="tagName" trackBy="..."` loops
6. **Map nested `sub-contract`** → dotted paths (`{parent.child}`) or nested context inside forEach
7. **Respect phases** — don't bind fast-only data in slow-rendered static content

### Quick mapping table

| Contract Tag | Jay-HTML |
|-------------|----------|
| `{tag: title, type: data}` | `<h1>{title}</h1>` |
| `{tag: isActive, type: variant, dataType: boolean}` | `<span if="isActive">Active</span>` |
| `{tag: status, type: variant, dataType: "enum (A \| B)"}` | `<div if="status===A">...</div>` |
| `{tag: btn, type: interactive, elementType: HTMLButtonElement}` | `<button ref="btn">Click</button>` |
| `{tag: link, type: interactive, elementType: HTMLAnchorElement}` | `<a ref="link">Go</a>` |
| `{tag: input, type: interactive, elementType: HTMLInputElement}` | `<input ref="input" value="{val}" />` |
| `{tag: items, type: sub-contract, repeated: true, trackBy: id}` | `<div forEach="items" trackBy="id">...</div>` |
| `{tag: detail, type: sub-contract}` | `{detail.field}` |
