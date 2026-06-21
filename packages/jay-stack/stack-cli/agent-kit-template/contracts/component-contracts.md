# Headfull Component Contracts

Headfull components in Jay Stack are full-stack and must have a contract. The contract defines the data the component provides to its template.

## When to Use

Use a headfull component contract for shared UI sections that appear across multiple pages: headers, footers, sidebars, navigation menus.

## File Structure

Each headfull component lives in its own subdirectory under `src/components/`:

```
src/components/site-header/
  site-header.ts             # makeJayStackComponent logic
  site-header.jay-html       # template
  site-header.jay-contract   # contract (required)
```

## Contract with Props

Headfull components use `props` (not `params`) for configuration passed by the parent page:

```yaml
name: site-header
description: Site-wide header with navigation and cart indicator.
props:
  - name: logoUrl
    type: string
    description: URL for the site logo
  - name: showSearch
    type: boolean
    default: 'true'
    description: Whether to show the search bar
tags:
  - tag: siteName
    type: data
    dataType: string
    phase: slow
  - tag: navLinks
    type: sub-contract
    repeated: true
    trackBy: _id
    tags:
      - tag: _id
        type: data
        dataType: string
      - tag: label
        type: data
        dataType: string
      - tag: navLink
        type: interactive
        elementType: HTMLAnchorElement
```

## Importing in jay-html

The import must include the `contract` attribute:

```html
<script type="application/jay-headfull"
  src="../components/site-header/site-header"
  names="SiteHeader"
  contract="../components/site-header/site-header.jay-contract"
></script>
```

Usage in the page body:

```html
<jay:SiteHeader logoUrl="/logo.png" />
```

## Component Contract vs Page Contract

| | Page contract | Component contract |
|---|---|---|
| **Location** | `src/pages/.../page.jay-contract` | `src/components/<name>/<name>.jay-contract` |
| **Params** | Yes (from route segments) | No (components don't own routes) |
| **Props** | Rarely | Yes (configured by parent) |
| **Import** | `<script type="application/jay-data">` | `<script type="application/jay-headfull">` with `contract` attribute |
