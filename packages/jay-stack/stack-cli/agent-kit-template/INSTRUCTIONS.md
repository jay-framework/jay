# Jay Stack Agent Kit

This folder contains everything you need to create jay-html pages for a jay-stack application.

## What is Jay Stack?

Jay Stack is a full-stack framework where:
- **Plugins** provide headless components (data + interactions, no UI)
- **Contracts** define the data shape and interaction points of each component
- **jay-html** templates provide the UI that binds to contract data
- **Rendering phases** determine when data is available (build-time, request-time, client-side)

Your job is to create `.jay-html` pages that bind to the data and interactions defined by contracts.

## Rendering Phases

| Phase | When | Use For |
|-------|------|---------|
| **slow** | Build time (SSG) | Static content, SEO data, pre-rendered lists |
| **fast** | Request time (SSR) | Per-request data (prices, stock, personalization) |
| **fast+interactive** | Request + client | Data that also updates on the client |

There is no standalone "interactive" phase. Any tag with `type: interactive` (refs/interactions) is automatically `fast+interactive`. Tags without an explicit phase are available in all phases.

## Workflow

1. **Read this file** for overview and workflow
2. **Discover plugins** — read `materialized-contracts/plugins-index.yaml` to see available plugins and their contracts. Read `materialized-contracts/contracts-index.yaml` for the full contract list.
3. **Read plugin.yaml** — for each plugin, read its `plugin.yaml` (at the path from plugins-index) to see contract descriptions and available **actions** (e.g., `searchProducts`, `getCategories`).
4. **Read contracts** — read the `.jay-contract` files to understand data shapes, tag types, phases, and props.
5. **Discover data** — run `jay-stack params <plugin>/<contract>` for SSG route params, `jay-stack action <plugin>/<action>` for data discovery (action names come from plugin.yaml).
6. **Create pages** — write `.jay-html` files under `src/pages/` following directory-based routing.
7. **Validate** — run `jay-stack validate` to check for errors.
8. **Test** — run `jay-stack dev --test-mode` and verify pages render.

## Reference Docs

| File | Topic |
|------|-------|
| [project-structure.md](project-structure.md) | Project layout, styling patterns (CSS themes, design tokens), configuration files |
| [jay-html-syntax.md](jay-html-syntax.md) | Jay-HTML template syntax: data binding, conditions, loops, headless components |
| [routing.md](routing.md) | Directory-based routing: page structure, dynamic routes, route priority |
| [contracts-and-plugins.md](contracts-and-plugins.md) | Reading contracts, plugin.yaml, and the materialized indexes |
| [cli-commands.md](cli-commands.md) | CLI commands: validate, params, action, dev server |

## Quick Start

### 1. Discover plugins and contracts

Read `materialized-contracts/plugins-index.yaml`:

```yaml
plugins:
  - name: wix-stores
    path: ./node_modules/@wix/stores
    contracts:
      - name: product-page
        type: static
        path: ./node_modules/@wix/stores/lib/contracts/product-page.jay-contract
```

### 2. Read a contract

The `.jay-contract` file at the path from the index defines the data shape:

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
  - tag: inStock
    type: variant
    dataType: boolean
    phase: fast+interactive
  - tag: addToCart
    type: interactive
    elementType: HTMLButtonElement
```

### 3. Create a page

Create `src/pages/page.jay-html`:

```html
<html>
<head>
  <script type="application/jay-headless" plugin="wix-stores" contract="product-page" key="product"></script>
</head>
<body>
  <h1>{product.name}</h1>
  <span if="product.inStock">In Stock</span>
  <button ref="product.addToCart">Add to Cart</button>
</body>
</html>
```

### 4. Validate and run

```bash
jay-stack validate
jay-stack dev
```
