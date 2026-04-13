# Page Contracts

A page can have its own contract (`page.jay-contract`) defining page-level data, alongside headless plugin contracts.

## When to Use a Page Contract

- The page has its own data that isn't provided by a plugin
- The page component (`page.ts`) renders data into ViewState
- You want type-safe bindings between the page component and its jay-html template

If the page only uses plugin headless components and has no page-level data, a page contract is optional.

## Basic Page Contract

```yaml
name: home-page
tags:
  - tag: heroTitle
    type: data
    dataType: string
    phase: slow
  - tag: heroSubtitle
    type: data
    dataType: string
    phase: slow
  - tag: featuredCount
    type: data
    dataType: number
    phase: fast
```

Place as `page.jay-contract` next to `page.jay-html`:

```
src/pages/
├── page.jay-html
├── page.jay-contract
└── page.ts
```

## Page Contract with Params

If the page has a dynamic route, declare `params` in the contract:

```yaml
name: product-page
description: Product detail page
params:
  slug: string
tags:
  - tag: title
    type: data
    dataType: string
    phase: slow
  - tag: price
    type: data
    dataType: number
    phase: fast+interactive
```

The route must have matching dynamic segments:

```
src/pages/products/[slug]/
├── page.jay-html
├── page.jay-contract
└── page.ts
```

## Page Contract with Props

Pages rarely use props (they're top-level), but page contracts can declare them for reusable page patterns:

```yaml
name: category-page
props:
  - name: categoryId
    type: string
    required: true
tags:
  - tag: categoryName
    type: data
    dataType: string
```

## Combining with Plugin Contracts

A page can have both a page contract and headless plugin contracts. The page contract covers page-owned data; plugins cover their own domains:

```html
<!-- page.jay-html -->
<html>
  <head>
    <script
      type="application/jay-headless"
      plugin="wix-stores"
      contract="product-page"
      key="product"
    ></script>
  </head>
  <body>
    <!-- Page contract data -->
    <h1>{heroTitle}</h1>

    <!-- Plugin contract data (prefixed with key) -->
    <div>{product.name}</div>
    <div>{product.price}</div>
  </body>
</html>
```

## Contract Format Reference

See the plugin [contracts-guide.md](../plugin/contracts-guide.md) for the full contract format: tag types, phases, sub-contracts, async data, and validation rules.
