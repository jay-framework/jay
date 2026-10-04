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
| `.jay-contract` | Yes\*     | Data shape, props, refs — the source of truth (as for any component)   |
| `.ts`           | Optional  | Logic (`makeJayStackComponent`). Omit for a pure-markup element        |
| `.jay-html`     | **Yes**   | The template the designer flattens — its `<body>` markup and `<style>` |

> **You ship a template, not a running UI.** The `.jay-html` is a _source to copy from_, not a live
> component that renders itself at the usage site. The designer's flattened copy is what compiles and
> renders. This is why upgrades flow through `sync` (below) rather than automatically — the project owns
> its copy.

> \* **The contract can be empty for a pure presentational element.** It must exist (it names the element
> and is what the consumer's `contract=` import resolves), but if the element binds no data and ships no
> `.ts`, the contract needs nothing but a name — `name: HeroBanner` plus `tags: []`.

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

## Declaring content slots — `jay-content`

`override` is the designer's tool, applied **per page, per instance**, to keep an edit you did not
anticipate. `jay-content` is **your** tool: put it on a template node to declare up front "this is the
consumer's to fill." Edits to a marked facet are then expected by design — `validate` never reports them as
drift, and `sync` keeps the consumer's version — **without** the designer marking anything. It is the
source-of-truth way to say "fill this in" for the parts of your template that are meant to vary.

It lives on the **source template only**. It is never copied onto the flattened page (sync strips it), so it
is stated **once** and is resilient to your future template edits: as long as the marker stays, consumer
content stays silent; remove it and that node falls back to the normal override model.

**It is optional, not required.** Unlike slot syntax in other frameworks, you do not have to annotate every
variable node — an unmarked spot still works, it just surfaces as drift until the consumer marks `override`
or runs `sync`. Add `jay-content` only where it earns its keep: a node genuinely meant to vary, where you'd
rather spare every consumer from repeating the same `override`.

### Options (same facet-list grammar as `override`)

| You declare consumer-owned…      | Write                        | Typical use                                      |
| -------------------------------- | ---------------------------- | ------------------------------------------------ |
| the children (text/markup)       | `jay-content` (bare)         | a body copy / heading slot — **the default**     |
| specific attributes              | `jay-content="src alt"`      | a media `<img>` the consumer supplies            |
| one inline-style declaration     | `jay-content="style.color"`  | a themeable color the consumer sets              |
| children **and** some attributes | `jay-content="children src"` | a figure whose image and caption are both theirs |
| the whole node                   | `jay-content="*"`            | an entirely consumer-authored region             |

Facets are space- or comma-separated (`jay-content="src, alt"`). The grammar is identical to `override`
with **one** difference: a **bare** `jay-content` means **children** (the common text slot), whereas a bare
`override` means the whole node. Use `*` when you really mean the whole node.

```html
<!-- card.jay-html (your template) -->
<div class="ds-card">
  <h3 class="ds-card__heading">{heading}</h3>
  <p class="ds-card__body" jay-content>{body}</p>
  <img class="ds-card__media" jay-content="src alt" src="placeholder.png" alt="" />
</div>
```

The consumer flattens this and edits the `<p>` text and the `<img>` `src`/`alt` with no `override` marks;
`validate` stays clean and `sync` preserves their copy. The `class` on each node is **not** a slot, so it
still reconciles with your source on every upgrade.

### `jay-content` vs. `override` — which to reach for

- **You (template author)** declare the parts meant to vary with `jay-content`, once, on the source. This
  is the preferred path for intended variation — it needs no per-page marks and survives your edits.
- **The designer** uses `override` on their page for an edit you did **not** declare a slot for (an
  unanticipated tweak they want to keep through `sync`). Prefer giving them a `jay-content` slot over
  leaving them to `override` the same spot on every instance.

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
