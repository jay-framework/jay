# Design System Demo (DL#196)

A jay-stack example that exercises **validated inline composition** (Design Log #196) with a small but
realistic design system: nested design-system regions, multiple instances of the same region, and three
pages that each demonstrate a different override/drift situation.

This example is deliberately built to **exercise the DL#196 machinery end-to-end and expose its rough
edges** — see [Issues this example exposes](#issues-this-example-exposes).

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

Two mechanics worth calling out:

- **Every transitive `template=` import lives on the page.** Transitive flatten resolves each nested
  `<jay:X>` through the _page's_ import map, so a page that flattens `section` also declares `template=`
  imports for `gallery`, `card`, and `button`. See the `<head>` of any page.
- **Scope-anchor class.** A jay `ref` is never emitted to the DOM, so the materialiser stamps the ref name
  as a real class on the flattened region root (e.g. `<div class="ds-card cardStarter">`) to give
  `@scope (.cardStarter)` something to anchor to. The drift checker ignores this synthetic class.

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

Expected `validate` result: **valid, with exactly two drift warnings — both on `/drifted`**. The pristine
and branded pages are clean (the branded page's overrides suppress their facets at every nesting level).

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
