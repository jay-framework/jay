# @jay-framework/compiler-inline-composition

Implements **DL#196 — Validated inline composition**. A component's `.jay-html` is _flattened_
(materialised) into the page as a source-owned region; this package validates that a materialised
region still equals its source template, resolves per-facet `override` ownership, and (later) re-flattens
on `sync`.

## Status

- **Phase 1 (this build): the differ.** `diffMarkup` / `diffBodies` (markup) and `diffCss` (CSS) compare
  a region against its source template and return **facet-addressable** `DiffEntry[]` — one addressing
  scheme shared by reporting, `override` suppression, and (Phase 3) sync. Unit-tested; **not yet wired
  to stack-cli**.
- **Deferred:** the materialiser/flattener (Phase 2) and `jay-stack sync` (Phase 3).

## What the differ compares

The region body is copied **verbatim** from source (page data enters as props on the `<jay:X>` tag, not
rewritten into the body), so the rule is uniform — a facet is drift iff it differs from source:

| Facet               | Drift when …                                          | Owned via                    |
| ------------------- | ----------------------------------------------------- | ---------------------------- |
| `attribute`         | an element gains / loses / changes an attribute       | `override="<name>"`          |
| `style-declaration` | one inline-style property changes                     | `override="style.<prop>"`    |
| `children`          | an element's child sequence diverges (count/tag/text) | `override="children"`        |
| `css-rule`          | a copied CSS rule is added / removed                  | `/* jay:override */`         |
| `css-declaration`   | one declaration within a shared rule changes          | `/* jay:override: <prop> */` |

Rules that keep the differ honest:

- **Bindings are compared modulo formatting** (`{ a.b }` == `{a.b}`); genuinely different expressions
  still differ.
- **Structural child divergence stops descent** — one `children` facet on the parent, not a cascade.
- **Nested `<jay:X>` regions are never descended into** (each validates against its own source — Q2).
- **`page-scope` subtrees are excluded** from comparison (page-owned — §7, deferred).
- **`override` markers suppress exactly their named facet** — unlisted siblings still report.

## API

```ts
import {
  diffMarkup,
  overrideSpecFor,
  facetLabel,
} from '@jay-framework/compiler-inline-composition';

const drift = diffMarkup(sourceBody, regionBody); // DiffEntry[] (markup)
const cssDrift = diffCss(sourceCss, regionCss); // DiffEntry[] (CSS)
for (const entry of [...drift, ...cssDrift]) {
  console.log(facetLabel(entry.facet), entry.change); // diagnostic
  overrideSpecFor(entry.facet); // the `override` marker (or CSS pragma) that would suppress / preserve it
}
```
