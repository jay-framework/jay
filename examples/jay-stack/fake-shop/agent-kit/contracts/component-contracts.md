# Full-Stack Component Contracts

Shared full-stack components in Jay Stack are **headless** — logic + a contract, with their template
provided by the consuming page. The contract defines the data the component provides to that template.

## When to Use

Use a full-stack component contract for shared UI sections that appear across multiple pages: headers,
footers, sidebars, navigation menus.

## File Structure

Each component lives in its own subdirectory under `src/components/`:

```
src/components/site-header/
  site-header.ts             # makeJayStackComponent logic
  site-header.jay-html       # source template (flattened into the page)
  site-header.jay-contract   # contract (required)
```

## Contract with Props

Full-stack components use `props` (not `params`) for configuration passed by the parent page:

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

Import it as a headless component — `src=` for the logic, `contract=` for the data shape, and `template=`
so `jay-stack sync` can flatten the component's markup into the page:

```html
<script
  type="application/jay-headless"
  src="../components/site-header/site-header"
  contract="../components/site-header/site-header.jay-contract"
  template="../components/site-header/site-header.jay-html"
></script>
```

Usage in the page body — place the region and run `jay-stack sync` to flatten its body:

```html
<jay:SiteHeader ref="header" logoUrl="/logo.png" />
```

> `application/jay-headfull` with a `contract=` attribute is a hard build error (DL#196). `jay-headfull` is
> the lower-level Jay model (`makeJayComponent`, no server rendering) and is never used in a Jay Stack page.
> See [jay-html-components.md](../designer/jay-html-components.md#headfull-components-are-not-for-jay-stack).

## Templates and the sync / validate pair

A headless component has **no bound template of its own** — but it can **ship one or more `.jay-html`
templates** alongside its logic and contract, for pages to flatten. Each is a self-contained template over
the same contract; a page chooses which one to flatten with `template=`:

```
src/components/site-header/
  site-header.ts                 # logic (makeJayStackComponent)
  site-header.jay-contract       # contract (required)
  site-header.jay-html           # default template
  site-header-compact.jay-html   # an alternative template (optional)
```

Flattening copies the chosen template's markup into the page, where you own and edit the copy. This is a
**design-system element** — and the `sync` / `validate` pair keeps the copy honest:

- `jay-stack validate` diffs the page's flattened region against its source `template=` and reports drift
  (at facet granularity) as warnings.
- `jay-stack sync` re-flattens from the current source, preserving the facets you marked `override`.

See [design-system-guide.md](../designer/design-system-guide.md) for the full drift / facet / sync model.

## Component Contract vs Page Contract

|              | Page contract                          | Component contract                                                   |
| ------------ | -------------------------------------- | -------------------------------------------------------------------- |
| **Location** | `src/pages/.../page.jay-contract`      | `src/components/<name>/<name>.jay-contract`                          |
| **Params**   | Yes (from route segments)              | No (components don't own routes)                                     |
| **Props**    | Rarely                                 | Yes (configured by parent)                                           |
| **Import**   | `<script type="application/jay-data">` | `<script type="application/jay-headless">` with `contract` attribute |
