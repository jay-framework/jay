# Design System Demo (DL#196 + DL#200)

A jay-stack example that exercises **validated inline composition** (Design Log #196) with a small but
realistic design system: nested design-system regions, multiple instances of the same region, and three
pages that each demonstrate a different override/drift situation. It also showcases the **"prefer
design-system elements" validation warnings** (Design Log #200) — see
[DL#200 — prefer design-system element warnings](#dl200--prefer-design-system-element-warnings).

This example is deliberately built to **exercise the machinery end-to-end and expose its rough
edges** — see [Issues this example exposes](#issues-this-example-exposed).

## The design system

Four design-system components under `src/components/`, composed as a nested hierarchy:

```
section  ─┐  (ds-section: title + gallery)
          └─ gallery  ─┐  (ds-gallery: heading + N cards → "gallery of cards")
                       └─ card  ─┐  (ds-card: heading, body, CTA)
                                 └─ button  (ds-button)
```

Each component is a headless contract (`*.jay-contract`) + a source template (`*.jay-html`) that carries
its own markup and CSS. A page pulls the whole hierarchy in with a single `<jay:section>` region; the
compiler flattens `section → gallery → card → button` transitively, and each component's CSS is wrapped in
`@scope (.<ref>)` and merged into the page's `<style>`.

**CSS coalescing.** A page with several instances of the _same_ component through the _same_ template (the
two cards, `cardStarter` + `cardPro`) does not emit one identical `@scope` block per instance — `sync`
coalesces them into a single selector-list block `@scope (.cardStarter, .cardPro) { … }`. An instance that
owns a CSS facet (`/* jay:override */`) keeps its own block and drops out of the list; instances flattened
from _different_ templates never coalesce. `validate` enforces this canonical form
(`CSS-SCOPE-MISSING` / `-MIXED-TEMPLATE` / `-NOT-COALESCED`), so a `validate`-clean page is one `sync`
leaves unchanged. See DL#196 "Refinement — CSS instance duplication".

Two mechanics worth calling out:

- **Every transitive `template=` import lives on the page.** Transitive flatten resolves each nested
  `<jay:X>` through the _page's_ import map, so a page that flattens `section` also declares `template=`
  imports for `gallery`, `card`, and `button`. See the `<head>` of any page.
- **Scope-anchor class.** A jay `ref` is never emitted to the DOM, so the materialiser stamps the ref name
  as a real class on the flattened region root (e.g. `<div class="ds-card cardStarter">`) to give
  `@scope (.cardStarter)` something to anchor to. The drift checker ignores this synthetic class.
- **Root-block rule → `:scope`.** Inside `@scope (.<ref>) { … }`, scoped selectors match _descendants_ of
  the scope root only; the root element itself is reachable solely via `:scope`. So the materialiser rewrites
  a component's own root-block rule to `:scope` — the card template's `.ds-card { border … }` is emitted as
  `:scope { border … }`, while descendant rules (`.ds-card__heading`, `.ds-button`) keep their class
  selectors. Without this, the card's own border/padding would never apply to its root. See DL#196
  "Refinement — `@scope` root-matching".

## The three pages

| Route      | File                              | Demonstrates                                                                            |
| ---------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| `/`        | `src/pages/page.jay-html`         | **Pristine** — flattened straight from source, no overrides, no drift.                  |
| `/branded` | `src/pages/branded/page.jay-html` | **With overrides** — page-owned facets marked `override=`; `validate` reports no drift. |
| `/drifted` | `src/pages/drifted/page.jay-html` | **Unmarked deviations** — hand edits with no `override=`; `validate` reports drift.     |

The branded page owns four facets across the nesting levels:

- section `<h1>` → `override="class"` (a `--brand` modifier)
- Starter card `<h3>` → `override="class"`
- Pro card `<p>` → `override="style.color"` (inline `color`)
- Pro card `<button>` → `override="class"` (a `--gold` modifier)

The drifted page carries two **unmarked** edits: the Starter card `<h3>` text and the Pro card
`<button>` class.

## Try it

```bash
# Re-flatten every region from its source template, preserving override= facets.
yarn sync

# Report drift (unmarked deviations) and other validation issues.
yarn validate            # add --json for machine-readable output

# Run the dev server.
yarn dev
```

Expected `validate` result: **valid (zero errors), with warnings**. The pristine and branded pages are
clean (the branded page's overrides suppress their facets at every nesting level). The remaining pages each
raise a deliberate warning:

- `/drifted` — two DL#196 **drift** warnings (unmarked h3 text + button class), and because the button's
  unmarked `class` edit is a _non-content_ change, one DL#200 `REGION-OVERRIDE-NON-CONTENT` warning.
- `/not-linked`, `/variant`, and `src/components/badge` — one DL#200 warning each (see below).

All are warnings, never errors — the project always builds.

## DL#200 — prefer design-system element warnings

Beyond DL#196 drift, `jay-stack validate` nudges you to **reuse UI through design-system elements** rather
than hand-authoring the same markup everywhere. These are warnings (default-on, suppressible, never blocking).
Three dedicated artifacts each trigger exactly one of them:

| Artifact                                  | Warning                       | Why it fires                                                                                                                                                             |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/pages/not-linked/page.jay-html`      | `REGION-NOT-LINKED`           | The `<jay:card>` import carries only `contract=` (no `template=`), yet a design-system template exists for Card. The region is hand-authored where it could be _linked_. |
| `src/pages/variant/page.jay-html`         | `REGION-OVERRIDE-NON-CONTENT` | The card **is** linked, but adds net-new layout DOM (`<div class="ds-card__ribbon">`) the source template never had — a structural change, i.e. a different design.      |
| `src/components/badge/badge.jay-contract` | `COMPONENT-NO-TEMPLATE`       | A UI component that ships **no** `badge.jay-html`, so every consumer would hand-author its markup instead of flattening a shared template.                               |

The fourth DL#200 rule, `NO-DESIGN-SYSTEM` (a once-per-project nudge), is intentionally **silent** here —
the project flattens real design-system elements (`template=` imports exist), which is exactly what it asks for.

**Resolution paths** (each warning's `suggestion` spells these out):

- `REGION-NOT-LINKED` → add `template="…/card.jay-html"` to the import and run `jay-stack sync`; or, for a
  deliberate one-off, suppress on the import with `jay-validations="REGION-NOT-LINKED"` (or list the contract
  under `allow-inline-region`).
- `REGION-OVERRIDE-NON-CONTENT` → make a **second** card template (a new variant) and link this region to it,
  instead of piling structure onto one copy; or accept it with `jay-validations="REGION-OVERRIDE-NON-CONTENT"`.
  (Content edits — text, `src`/`alt`, inline markup — never fire this rule; that is what flattening is for.)
- `COMPONENT-NO-TEMPLATE` → author a `badge.jay-html` beside the contract; or, if the component is genuinely
  data/logic-only, suppress project-wide with `jay-stack: allow-no-template: [Badge]`.

> **Component source templates are exempt from `REGION-NOT-LINKED`.** A composite like `section.jay-html`
> hand-authors its child `<jay:gallery>` / `<jay:card>` / `<jay:button>` with contract-only imports **by
> design** — it is the flatten _source_, and the transitive `template=` always lives on the consuming page
> (DL#196). So the rule is page-scoped; it never fires on the component templates under `src/components/`.
> (This false positive was surfaced by this example and fixed in `stack-cli/lib/validate.ts` — see DL#200
> Implementation Results.)

## Issues this example exposed

Building this example surfaced real gaps in the DL#196 implementation. All three are now fixed.

### 1. `sync` did not preserve overrides inside a nested region — FIXED

`validate` correctly suppresses `override=` facets at every nesting depth, but `jay-stack sync` used to
round-trip overrides only on the page's **outermost** region's own body — overrides buried inside a nested
region were silently discarded on re-sync (only the section `<h1 override="class">` survived; the three
overrides inside the `<jay:card>` / `<jay:button>` regions were lost).

Fixed in `mergeOverrides` (`compiler-inline-composition`): at a nested region boundary it now keeps the
template's region tag but carries the page's region body across, so the transitive re-flatten merges the
deep facets in at each child region's own level — mirroring how the differ stops at the boundary while
`checkRegionDrift` visits each region separately. An override deep inside a nested region is preserved
without marking the parent `<jay:X>` inclusion. Verify:

```bash
yarn sync                                     # re-flatten every page
git diff src/pages/branded/page.jay-html      # no diff — all four overrides survive
```

### 2. `sync` scanned the whole project root — FIXED

The first `yarn sync` after a build swept in the flattened page copies under `build/` and failed on their
`template=` provenance. `sync` now scopes discovery to the config's `pagesBase` + `componentsBase`, like
`validate`.

### 3. `prettifyHtml` dropped a space when reflowing wrapped text — FIXED

Running `sync` on a page whose body has a `<p>` spanning two source lines reflowed the text and joined two
words across the wrap boundary ("… jay-stack validate reports …" → "… jay-stack validatereports …"). The
prettifier pre-normalized author line-wrapping by joining trimmed lines with `''`, which welded the words
on either side of a wrapped text node — a newline inside a text node is significant HTML whitespace that
renders as one space.

Fixed in `prettifyHtml` (`compiler-shared`): the line-collapse now inserts a single space **only** where
the wrap boundary sits between two text characters; at any boundary touching a tag it still joins with
nothing (so element-to-element spacing is unchanged). The same fix also stopped corrupting
`<script type="application/jay-data">` YAML — that block is now swapped for a placeholder and restored
verbatim, so its indentation/nesting survives formatting.
