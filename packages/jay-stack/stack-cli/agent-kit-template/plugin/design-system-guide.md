# Shipping a Design-System Element

A classic plugin component is **headless**: it ships a contract (and usually code) and provides _no UI_ —
the project designer writes the template. A **design-system element** is the opposite end of the same
mechanism: your plugin also ships a **template** (`.jay-html`), and the designer _flattens_ (copies) it into
their page rather than authoring the markup from scratch. The designer then owns the copy and tweaks it;
when you release a new version of the template, they pull your changes with `jay-stack sync`.

Use this when your component has an opinionated look you want to _provide_ (a pricing card, a product tile,
a callout) while still letting each project edit individual instances.

## What you ship

A design-system element ships three things — the template is what makes it a design-system element:

| File            | Required? | Purpose                                                                |
| --------------- | --------- | ---------------------------------------------------------------------- |
| `.jay-contract` | Yes       | Data shape, props, refs — the source of truth (as for any component)   |
| `.ts`           | Optional  | Logic (`makeJayStackComponent`). Omit for a pure-markup element        |
| `.jay-html`     | **Yes**   | The template the designer flattens — its `<body>` markup and `<style>` |

> **You ship a template, not a running UI.** The `.jay-html` is a _source to copy from_, not a live
> component that renders itself at the usage site. The designer's flattened copy is what compiles and
> renders. This is why upgrades flow through `sync` (below) rather than automatically — the project owns
> its copy.

### The template file

An ordinary `.jay-html`: a `<head>` declaring the contract, a `<body>` with the markup, and an optional
`<style>`. Bind `{…}` against your own contract tags/props.

```html
<!-- pricing-card/pricing-card.jay-html -->
<html>
  <head>
    <script type="application/jay-data" contract="./pricing-card.jay-contract"></script>
  </head>
  <body>
    <div class="pricing-card">
      <h3 class="plan">{planName}</h3>
      <p class="price">{price}</p>
      <button class="cta">{ctaLabel}</button>
    </div>
  </body>
  <style>
    .plan {
      font-weight: 600;
    }
    .cta {
      background: var(--brand, #2b6cb0);
    }
  </style>
</html>
```

The component's CSS is copied alongside the markup and `@scope`-wrapped by the region's `ref` at the usage
site, so it never leaks into the project's other selectors.

## How the designer consumes it

The designer imports the component with a `template=` provenance marker pointing at your shipped `.jay-html`,
places the region, and runs `jay-stack sync` to flatten it:

```html
<script
  type="application/jay-headless"
  plugin="my-plugin"
  contract="pricing-card"
  template="./node_modules/@my-org/my-plugin/lib/components/pricing-card/pricing-card.jay-html"
></script>
```

```html
<jay:pricing-card ref="pro" planName="Pro">…flattened copy, edited freely…</jay:pricing-card>
```

They edit the copy, marking any facet they want to keep with `override` (see the designer guide,
`designer/design-system-guide.md`). `jay-stack validate` reports unmarked edits as drift.

## Upgrades flow through `sync`

Because the designer owns a _copy_, a change you ship in the template does **not** reach their page
automatically. To pull your update, the designer runs:

```bash
jay-stack sync
```

Sync re-flattens every region from the current source template, **preserving the facets the project marked
`override`** and overwriting the rest. It is a deterministic overwrite-with-holes — no merge base, no
conflict resolution — so an upgrade can never silently mis-merge project edits with your changes.

### Design your template for clean upgrades

- **Keep structural churn low between versions.** Sync preserves a marked facet by matching nodes
  positionally; large structural rewrites force the project to re-mark and re-review. Prefer additive,
  localized changes.
- **Name meaningful hooks with `class`.** Projects override at the facet level (`class`, a style property,
  `children`). Stable class names make their `override` marks survive your edits.
- **Version your template with your package.** The template ships from your package path; a project's
  `jay-stack sync` reads whatever version is installed, so a normal dependency bump + `sync` is the whole
  upgrade path.
- **Document the intended override points** in the contract `description` — tell projects which parts are
  meant to be customized versus left to reconcile.

## Design-system element vs. headless component

|                               | Headless component              | Design-system element                |
| ----------------------------- | ------------------------------- | ------------------------------------ |
| Ships a `.jay-html` template? | No                              | **Yes**                              |
| Who writes the markup?        | The project designer            | You (project copies & edits it)      |
| Import marker                 | `contract=` (+ optional `key=`) | `contract=` **and** `template=`      |
| Upgrades                      | Automatic (code is imported)    | Via `jay-stack sync` (copy is owned) |
| Drift-checked / synced        | No                              | Yes                                  |

Both can be server-only or interactive, and both use the same `.jay-contract`. The only additional thing a
design-system element ships is the template — and the only additional thing the project runs is `sync`.
