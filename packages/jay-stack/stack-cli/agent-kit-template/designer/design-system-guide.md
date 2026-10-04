# Design-System Elements (Materialise, Drift, Sync)

A **design-system element** is a component whose template you flatten (copy) into your page and then own
the copy of. You edit the copy freely; `jay-stack validate` tells you where your copy has drifted from the
source; `jay-stack sync` re-flattens from the current source while keeping the edits you marked. This is
Jay's answer to "reuse a shared component but tweak this one instance" — with no runtime cost and no hidden
composition machinery.

**As a designer you both _create_ and _use_ design systems — this is your job, not only a plugin author's.**
A design-system element can be one you author from scratch, one you copy from a plugin into your project and
adapt, or one you link straight from a plugin. This guide covers **both sides**: [creating a design-system
element](#creating-a-design-system-element) (authoring the template + contract) and [using
one](#using-a-design-system-element-link--flatten) (linking, flattening, editing, syncing).

> Replaces the old `<override>` tag. If you have seen `<override ref="…">` in older pages, that mechanism
> is gone — its job is now done by editing the flattened copy and marking the edited **facet** (see
> [Marking what you own](#marking-what-you-own-facets)).

## The three component models — only one is a design-system element

| Model                     | How it is imported                                 | Template? | Validate / sync? |
| ------------------------- | -------------------------------------------------- | --------- | ---------------- |
| **Keyed headless**        | `<script … key="cart">`, used via `{cart.field}`   | No        | No               |
| **Nested (no template)**  | `<jay:card>` with an inline body you wrote by hand | No        | No               |
| **Design-system element** | `<jay:card>` whose import carries `template="…"`   | **Yes**   | **Yes**          |

Only a `<jay:X>` region whose `application/jay-headless` import carries a `template=` attribute is a
design-system element. That `template=` is the **provenance marker**: it records where the flattened body
came from, so validate can diff it and sync can re-flatten it. Nothing else — a keyed import, a nested
region you hand-authored, a plain instance — is ever drift-checked or synced.

## Prefer design-system elements

Reuse UI through design-system elements, not by hand-authoring the same markup in each page. Three
preferences — `jay-stack validate` nudges you toward each (warnings, never blocking, each suppressible):

1. **Create _and_ consume templates as design-system elements.** When a component renders UI, ship a
   `.jay-html` template for it, and link it from the page with `template=` + `jay-stack sync` rather than
   hand-writing the `<jay:X>` body. (Rules: `COMPONENT-NO-TEMPLATE` on the authoring side,
   `REGION-NOT-LINKED` on the consuming side.)
2. **When one instance needs extensive restyling or structural change, make _another_ template** for the same
   component — a second design-system variant — instead of piling style/class/structure overrides onto one
   flattened copy. (Rule: `REGION-OVERRIDE-NON-CONTENT`.)
3. **Hand-author an inline region only for a genuinely one-off usage** — a region used once, where no shared
   template exists or would help.

### Two templates vs. a conditional — different axes

These solve different problems; do not substitute one for the other:

- **Two templates = two design-system elements.** Different _designs_ chosen **at composition time** (a
  compact card vs. a feature card). You pick which template a region links to. This is the axis
  `REGION-OVERRIDE-NON-CONTENT` points you to when an instance's _look or structure_ diverges.
- **A conditional (`if` / variant) = one element, runtime change.** Same design, a branch driven by
  **runtime state** (logged-in vs. not). Use conditionals for state, not to fork a design.

A restyle or net-new layout DOM on one instance is a _second design_ — reach for a second template, not a
conditional.

### What counts as drift worth a new variant

`REGION-OVERRIDE-NON-CONTENT` fires only on **non-content** changes to a linked region:

- **Content (fine — this is what flattening is for):** editing text, image `src`/`alt`, and enriching text
  with inline content markup (`<strong>`, `<span>`, `<img>`, a `<ul>`/`<li>` list, a `<table>`, headings…).
- **Non-content (make a new variant):** changing `class` or inline/scoped CSS, or adding net-new layout DOM
  (`<div>`/`<section>` wrappers, custom components) — a different look or structure.

## Creating a design-system element

Authoring a design-system element is just authoring a **component**: a `.jay-contract` (its data shape,
props, refs) and a `.jay-html` template (its markup + optional `<style>`). You can start it three ways:

- **From scratch** — write the contract and template yourself for a reusable piece of your UI (a card, a
  hero, a callout).
- **From a plugin, copied in** — copy a plugin's shipped `.jay-html` (and its `.jay-contract`) into your own
  `src/components/…`, then adapt it. Point pages at _your_ copy; it is now project-owned, so you edit the
  source directly — no `override` marks and no upstream `sync`.
- **From an existing project component** — add a `.jay-html` template to a component that only had a
  contract, so pages can flatten it.

### 1. Put it under `src/components/`

A project-owned element lives beside your pages:

```
src/components/card/
  card.jay-contract   # data shape, props, refs
  card.jay-html       # the template pages flatten from
```

(A plugin's element lives in its package; you link it by a `template=` path into `node_modules/…`. Same
mechanics — only the path differs.)

### 2. Write the contract

The contract is the component's API — the props an instance is configured with and the tags the template
binds. Keep it to what varies per use. See the [Contract Authoring Guide](../contracts/GUIDE.md).

```yaml
# card.jay-contract
name: Card
props:
  - { name: heading, type: string, required: true }
  - { name: body, type: string, required: true }
tags:
  - { tag: heading, type: data, dataType: string }
  - { tag: body, type: data, dataType: string }
```

**A pure presentational element can have an (almost) empty contract.** If the element binds no data and
needs no code — static markup and styles only — the contract still has to exist (it names the element and is
what the page's `contract=` import resolves), but it needs **nothing but a name**:

```yaml
# hero-banner.jay-contract — a pure design element, no data, no code
name: HeroBanner
tags: [] # no data to bind
```

### 3. Write the template

An ordinary `.jay-html`: a `<head>` declaring its contract, a `<body>` of markup binding `{…}` against the
component's **own** tags, and an optional `<style>` of **plain component CSS**.

```html
<!-- card.jay-html -->
<html>
  <head>
    <script type="application/jay-data" contract="./card.jay-contract"></script>
  </head>
  <body>
    <div class="ds-card">
      <h3 class="ds-card__heading">{heading}</h3>
      <p class="ds-card__body" jay-content>{body}</p>
    </div>
  </body>
  <style>
    .ds-card {
      border: 1px solid #e2e8f0;
      padding: 20px;
    }
    .ds-card__heading {
      font-size: 1.15rem;
    }
  </style>
</html>
```

> **Author plain CSS here, not `@scope`.** In the template you write ordinary class rules
> (`.ds-card { … }`). When a page flattens the element, `sync` copies this CSS into the page and rewrites it
> into the canonical `@scope (.<ref>)` / `:scope` form for you — that scoped shape is a _page-side_ concern
> (see [The shape of a region's CSS](#the-shape-of-a-regions-css)); you don't write it in the template.

### 4. Choose the right axis of variation

Decide _how_ each instance is allowed to differ, and encode it in the element — this is the core design
skill:

| The instance varies by…                              | Encode it as…                                 | Example                          |
| ---------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| **data** (same design, different values)             | a **contract prop/tag**, bound `{…}`          | `{heading}`, `{price}`           |
| **content** (per-page text/media the consumer fills) | a **content slot** — `jay-content` (optional) | a body paragraph, a hero `<img>` |
| **runtime state** (same design, a branch)            | a **conditional** (`if` / variant)            | logged-in vs. not                |
| **design / structure** (a different look)            | a **separate template** (a second element)    | compact card vs. feature card    |

Prefer props for anything that is really just data. Use `jay-content` to pre-open the content a page is meant
to fill (optional — it spares the consumer an `override`; see [Content
slots](#content-slots--jay-content-an-optional-helper)). Fork a **second template**, not a conditional, when
the _look or structure_ differs — see [Two templates vs. a conditional](#two-templates-vs-a-conditional--different-axes).

### 5. Compose other elements inside it

A template may nest other design-system elements (`<jay:button>`). Declare their contract import in the
template `<head>`; when a page flattens this element, the nested regions flatten **transitively** (the page
must also carry a `template=` import for each nested element so it resolves). See
[jay-html-components.md](jay-html-components.md).

Once the element exists, pages consume it exactly as below.

## Using a design-system element (link + flatten)

### 1. Declare the import with `template=`

```html
<head>
  <script
    type="application/jay-headless"
    contract="./components/card/card.jay-contract"
    template="./components/card/card.jay-html"
  ></script>
</head>
```

- `contract=` — the component's contract (data shape, refs, props), as for any headless import.
- `template=` — the source `.jay-html` to flatten from. Resolved **relative to the page directory**.

A `template=` that does not resolve is a **hard error**, not a warning — fix the path or remove the
attribute.

### 2. Place the region and flatten it

Write the tag, then let `sync` fill its body from the source template:

```html
<body>
  <jay:card ref="promo" heading="{title}"></jay:card>
</body>
```

```bash
jay-stack sync
```

After sync the region carries a flattened copy of the source body, plus the component's CSS copied into
the page's `<style>`, `@scope`-wrapped by the region's `ref`:

```html
<jay:card ref="promo" heading="{title}">
  <div class="card promo">
    <h3 class="card-heading">{heading}</h3>
    <p class="card-body">Default body</p>
  </div>
</jay:card>
```

```css
@scope (.promo) {
  :scope {
    border: 1px solid #ccc;
    padding: 16px;
  }
  .card-heading {
    color: black;
  }
}
```

Note two things sync did to the CSS — both required for the styles to actually apply. **Write region CSS in
this shape yourself**; the rules are below in [The shape of a region's CSS](#the-shape-of-a-regions-css).

> A bare `<jay:X>` with **no** flattened body is a hard error at build time — flatten it with `jay-stack
sync` (first-fill is just the no-edits case of sync; there is no separate `add` command).

### 3. Edit the copy freely

The flattened body is yours. Rewrite text, change classes, add/remove children, edit the scoped CSS. Bind
`{…}` expressions against the component's own contract — inside `<jay:card>`, `{heading}` is the card's
`heading` prop, not the page's. What you may change without prompting a "make a new variant" nudge is the
[content vs. non-content](#what-counts-as-drift-worth-a-new-variant) distinction above.

### 4. Two variants of one component on a page — `as=`

A `<jay:X>` region tag is derived from the imported contract's name, so importing one contract twice would
make **both** imports back the same `<jay:card>` tag — an ambiguous collision (`REGION-TAG-COLLISION`, a
hard error). To flatten **two [design variants](#two-templates-vs-a-conditional--different-axes) of one
contract** side by side (e.g. a default card and a feature card — same data shape, different design), give
the second import its own region tag with `as=`:

```html
<head>
  <!-- default card → <jay:card> -->
  <script
    type="application/jay-headless"
    contract="./components/card/card.jay-contract"
    template="./components/card/card.jay-html"
  ></script>
  <!-- feature card (same contract, different template) → <jay:feature-card> -->
  <script
    type="application/jay-headless"
    contract="./components/card/card.jay-contract"
    template="./components/card/card.feature.jay-html"
    as="feature-card"
  ></script>
</head>

<body>
  <jay:card ref="starter" heading="Starter"></jay:card>
  <jay:feature-card ref="pro" heading="Pro"></jay:feature-card>
</body>
```

- `as=` must be a **kebab-case region tag** (`[a-z][a-z0-9-]*`), e.g. `as="feature-card"` → `<jay:feature-card>`.
- Both imports share the same contract, so both regions bind the **same props/refs** — only the design
  (template + CSS) differs. Each region flattens and drifts independently from its own `template=`.
- `as=` composes at every nesting level: a template may alias the nested regions it uses (two
  `<jay:button>`s as `<jay:main-cta>` / `<jay:secondary-cta>`), as long as the page carries a matching
  aliased import for each.
- Write a second variant only when the difference is [non-content](#what-counts-as-drift-worth-a-new-variant)
  (class / CSS / structure). A difference that is just **runtime state** (same design, a branch) is a
  conditional inside **one** element, not a second import.

## The shape of a region's CSS

A region's CSS is the component's own CSS, copied into the page `<style>` and rewritten into a canonical
form. `sync` produces this form and `validate` enforces it — but when you **hand-write or edit** a region's
CSS, write it this way directly:

### 1. Wrap the component's rules in `@scope (.<ref>)`

All of a region's rules live inside one `@scope` block keyed by the region's `ref`:

```css
@scope (.promo) {
  /* …the card's rules… */
}
```

This isolates the component's styles to that region — rules inside never leak out, and page rules outside
never bleed in.

### 2. The `ref` is a real class on the region root (scope-anchor)

A jay `ref` is not emitted to the DOM, so `@scope (.promo)` would have nothing to match. The region root
therefore carries the ref **as an actual class** — `<div class="card promo">` above. Keep that class on the
root when you edit markup; it is what anchors the scope. (validate's drift check ignores this synthetic
class, so it never shows up as drift.)

### 3. The component's own root rule targets `:scope`, not its block class

This is the one that trips people up. **Inside `@scope (.<ref>) { … }`, a scoped selector matches
_descendants_ of the scope root only — the scope root element itself is reachable solely through `:scope`.**
So a rule for the region's own root element must be written as `:scope`, _not_ as the root's class:

```css
@scope (.promo) {
  :scope {
    border: 1px solid #ccc;
  } /* ✅ styles the region root (<div class="card promo">) */
  .card {
    border: 1px solid #ccc;
  } /* ❌ never matches — .card IS the scope root, not a descendant */
  .card-heading {
    color: black;
  } /* ✅ descendant — plain class selector is correct */
}
```

Rule of thumb: the component's **root block class** → `:scope`; keep compounds and descendants on that
class (`.card.active` → `:scope.active`, `.card .card-heading` → `:scope .card-heading`), and leave every
**descendant/element** selector as its ordinary class.

### 4. Instances of the same component coalesce into one block

When a page holds several regions flattened from the _same_ template, they share one `@scope` block with a
selector list — never one duplicated block per `ref`:

```css
@scope (.cardStarter, .cardPro) {
  :scope {
    border: 1px solid #ccc;
  }
  .card-heading {
    color: black;
  }
}
```

Regions from _different_ templates stay in separate blocks. If you add a second instance by hand, fold its
ref into the existing block's selector list rather than copying the block.

## Drift: what `jay-stack validate` tells you

Because the copy has a known source (its `template=`), `jay-stack validate` diffs the two and reports each
place your copy differs — at **facet** granularity (one attribute, one style declaration, a subtree, one
CSS rule or declaration), not "this node changed":

```
<jay:card> region differs from source template "./components/card/card.jay-html":
<h3> children changed ("{heading}" → "On sale now").
To keep the page's version, mark the node override="children";
to discard it and re-flatten from source, run `jay-stack sync`.
```

Every drift is a **warning**, and the page still builds. A warning is a decision point, not a failure:

- **Keep your edit** → mark the facet (below). It will no longer be reported, and `sync` will preserve it.
- **Discard your edit** → run `jay-stack sync` to re-flatten that facet from source.

An unedited copy validates clean. A `template=` that cannot be read, and a template that (transitively)
includes itself, are **hard errors**.

## Marking what you own (facets)

To keep an edit, mark the exact facet you own. Everything you do not mark still reconciles with source, so
you get the source's future fixes for free on the parts you did not touch.

### Markup facets — the `override` attribute

| You own…                        | Mark it                     | Effect                                                 |
| ------------------------------- | --------------------------- | ------------------------------------------------------ |
| one attribute                   | `override="class"`          | your `class` is kept; other attributes reconcile       |
| one inline-style declaration    | `override="style.color"`    | your `color` is kept; other style props reconcile      |
| this element's children/subtree | `override="children"`       | your subtree is kept; the element's attrs reconcile    |
| several facets at once          | `override="class children"` | space- **or** comma-separated list; each facet is kept |
| the whole node                  | `override` (bare) or `*`    | the entire node is kept verbatim                       |

`override` is a **facet list**: list the facets you own, separated by spaces or commas (`override="class, style.color"`). A bare `override` (or `override="*"`) is the shorthand for "the whole node is mine." Anything not listed still reconciles with source.

```html
<jay:card ref="promo" heading="{item.title}">
  <div class="card featured" override="class">
    <!-- class is page-owned; the rest of this div still reconciles -->
    <h3 override="children">Half price this week</h3>
    <p class="card-body">Default body</p>
  </div>
</jay:card>
```

- **Removing a child:** delete it and mark the parent `override="children"` — otherwise `sync` restores it.
- **Attribute / style tweak:** edit the value and mark that facet (`override="href"`,
  `override="style.color"`), leaving siblings to reconcile.

### CSS facets — the `jay:override` pragma

A comment has no element to hang an attribute on, so scoped CSS uses a pragma placed immediately before (or
inside) the rule:

```css
@scope (.promo) {
  /* jay:override: color */
  .card-heading {
    color: red; /* kept across sync */
    font-weight: bold; /* still reconciles with source */
  }
  /* jay:override */
  .card-badge {
    /* the whole rule is page-owned */
  }
}
```

- `/* jay:override: <prop> */` — the page owns that one declaration.
- `/* jay:override */` — the page owns the whole rule.

### Content slots — `jay-content` (an optional helper)

`override` lives on the **page** and is per-instance. `jay-content` is its mirror on the **template** side —
and because you [author templates too](#creating-a-design-system-element), it is a tool you reach for when
_creating_ an element, not something only plugin authors use. Put it on a template node to pre-declare a
**content slot**: "this part is meant to be filled per page." Edits to a marked facet are then expected by
design — `validate` never reports them as drift, and `sync` keeps the consumer's version — **without** any
page-side `override`.

```html
<!-- in a template you author or own: -->
<p jay-content>{body}</p>
<img jay-content="src alt" src="placeholder.png" alt="" />
```

```html
<!-- in each flattened page, just edit — no override needed: -->
<p>Everything your team needs, in one place.</p>
<img src="/hero.png" alt="Our team at work" />
```

**`jay-content` is optional, not required.** It is purely a convenience that removes the need to mark
`override` on the slot. Unlike slot/children mechanisms in other frameworks, you do **not** have to annotate
every variable spot — an unmarked content edit still works; it just shows up as drift until you either mark
it (`override` on the page, or `jay-content` on the template) or `sync` it away. Reach for `jay-content` when
a node is _meant_ to vary across pages and you'd rather not repeat an `override` on every instance.

It is a **template-side** marker — it lives on the source template and is stripped from the flattened page
(so it is stated once, and resilient to template edits). It uses the **same facet-list grammar** as
`override` (`children`, `style.<prop>`, attribute names, `*` — see
[_Marking what you own_](#marking-what-you-own-facets)), with one difference: a **bare** `jay-content` means
**children** (the common text slot), whereas a bare `override` means the whole node.

## Upgrading: `jay-stack sync`

When the source template changes (a component upgrade, a design fix), re-flatten:

```bash
jay-stack sync                       # every design-system region in the project
jay-stack sync src/pages/home.jay-html   # one page
jay-stack sync --all                 # explicit "all pages"
```

Sync is **re-flatten, not merge**: it overwrites everything from the current source **except** the facets
you marked `override`, which it preserves verbatim. There is no merge base, no hash, no conflict prompt —
your region is by definition equal to its source except at your marked facets, so sync is deterministic
overwrite-with-holes. It can never silently combine two edited versions into wrong markup. A synced region
validates clean.

CSS reconciles the same way as markup — drift is overwritten, marked facets are kept:

- A region block **equal** to the canonical form (or missing) is (re-)emitted as the canonical
  `@scope (.<ref>)` block, coalesced with its same-template siblings.
- A block that **diverges but carries a `/* jay:override */` pragma** is preserved verbatim — your pragma is
  never rewritten.
- A block that **diverges without any pragma** is unmarked CSS drift: `sync` overwrites it back to the
  canonical form, exactly as it re-flattens unmarked markup. (This is what lets `sync` _migrate_ a page to a
  new canonical form — e.g. an older `.card { … }` root rule is rewritten to `:scope { … }`.)

So after one `sync` a page's CSS is in canonical form, and a `validate`-clean page is one `sync` leaves
unchanged. To keep a hand-edit through `sync`, mark it with a `jay:override` pragma.

## Suppressing the preference warnings

Each "prefer design-system elements" warning is suppressible for the legitimate case:

| Rule                          | Suppress                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REGION-NOT-LINKED`           | `jay-validations="REGION-NOT-LINKED"` on the `application/jay-headless` import (per region type), or list the contract under `allow-inline-region` (below) |
| `REGION-OVERRIDE-NON-CONTENT` | `jay-validations="REGION-OVERRIDE-NON-CONTENT"` on the import                                                                                              |
| `COMPONENT-NO-TEMPLATE`       | `allow-no-template: [Contract]` (a data-only component has no `.jay-html` to host an attribute)                                                            |
| `NO-DESIGN-SYSTEM`            | `allow-no-design-system: true`                                                                                                                             |

Per-region-type suppression lives on the import; put multiple rules in one attribute:

```html
<script
  type="application/jay-headless"
  contract="./components/card/card.jay-contract"
  jay-validations="REGION-NOT-LINKED REGION-OVERRIDE-NON-CONTENT"
></script>
```

Project-wide / list suppression lives in the page's validations script:

```html
<script type="application/jay-validations">
  jay-stack:
    allow-inline-region: [Card, HeroBanner] # contract names — allow hand-authored regions
    allow-no-template: [MetricsProvider] # data-only components with no UI
    allow-no-design-system: true # project intentionally shares no design system
</script>
```

## Why copy instead of reference?

Flattening removes the composition "seam": the region compiles through the ordinary headless-instance path,
so there is **no runtime crossing machinery** and no per-component ref-scope rules. The cost is that page
files grow and a copy duplicates its source — which is exactly what `validate` (drift) and `sync`
(re-flatten) exist to manage. Design edits stay in the page; the source stays reusable.
