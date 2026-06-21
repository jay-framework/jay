# Page Contracts

A page contract (`page.jay-contract`) defines page-level data for a route, alongside any headless plugin contracts the page imports.

## When to Use

- The page has its own data that isn't provided by a plugin
- The page component (`page.ts`) renders data into ViewState
- You want type-safe bindings between the page component and its jay-html template

If the page only uses plugin headless components and has no page-level data, a page contract is optional.

## File Placement

```
src/pages/
  page.jay-html
  page.jay-contract
  page.ts
```

For dynamic routes:

```
src/pages/products/[slug]/
  page.jay-html
  page.jay-contract
  page.ts
```

## Params for Dynamic Routes

Declare `params` matching the route's dynamic segments:

```yaml
name: product-page
params:
  slug: string       # required — from [slug]
  prefix: string?    # optional — from [[prefix]]
  category: string?  # optional
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

## Combining with Plugin Contracts

A page can have both a page contract and headless plugin contracts. The page contract covers page-owned data; plugins cover their own domains:

```html
<html>
  <head>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
    <script type="application/jay-headless"
      plugin="wix-stores" contract="product-page" key="product"
    ></script>
  </head>
  <body>
    <h1>{heroTitle}</h1>
    <div>{product.name}</div>
    <div>{product.price}</div>
  </body>
</html>
```
