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
  `<jay:X>` through the *page's* import map, so a page that flattens `section` also declares `template=`
  imports for `gallery`, `card`, and `button`. See the `<head>` of any page.
- **Scope-anchor class.** A jay `ref` is never emitted to the DOM, so the materialiser stamps the ref name
  as a real class on the flattened region root (e.g. `<div class="ds-card cardStarter">`) to give
  `@scope (.cardStarter)` something to anchor to. The drift checker ignores this synthetic class.

## The three pages

| Route      | File                          | Demonstrates                                                        |
| ---------- | ----------------------------- | ------------------------------------------------------------------ |
| `/`        | `src/pages/page.jay-html`         | **Pristine** — flattened straight from source, no overrides, no drift. |
| `/branded` | `src/pages/branded/page.jay-html` | **With overrides** — page-owned facets marked `override=`; `validate` reports no drift. |
| `/drifted` | `src/pages/drifted/page.jay-html` | **Unmarked deviations** — hand edits with no `override=`; `validate` reports drift. |

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

## Issues this example exposes

Building this example surfaced real gaps in the current DL#196 implementation. They are **left unfixed on
purpose** so the example can drive the fix discussion.

### 1. `sync` does not preserve overrides inside a nested region

`validate` correctly suppresses `override=` facets at every nesting depth, but `jay-stack sync` only
round-trips overrides on the page's **outermost** region's own body. Overrides buried inside a nested
region are silently discarded on re-sync.

Reproduce:

```bash
yarn sync src/pages/branded/page.jay-html
git diff src/pages/branded/page.jay-html
```

The section `<h1 override="class">` (direct body of the outer `<jay:section>`) survives, but the three
overrides inside the `<jay:card>` / `<jay:button>` regions are gone.

Root cause: `mergeOverrides` deliberately does not descend into nested region tags (DL#196 Q2 — "a nested
region's own source governs it"). When the outer `<jay:section>` re-flattens from `section.jay-html`, the
entire deep subtree is regenerated from the templates, taking the page's deep override markers with it.

### 2. `prettifyHtml` can drop a space when reflowing wrapped text

Running `sync` on the branded page reflows the intro `<p>` and joins two words across the wrap boundary
("… jay-stack validate reports …" → "… jay-stack validatereports …"). A text-node whitespace-collapse bug
in the prettifier, surfaced by the sync write-back path.
