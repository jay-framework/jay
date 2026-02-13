# Design Log #91 - Figma Property Comparison Strategy for Roundtrip Testing

## Background

Design Log #90 introduced `convertJayHtmlToFigmaDoc` — the reverse conversion from jay-html to
`FigmaVendorDocument`. End-to-end tests were built that parse real jay-html through the compiler
and compare the converter output against an `expected.figma.json` file.

For **roundtrip test fixtures** (e.g. `wix-store-product-page`), the expected file is the
**original Figma export** — the same document the jay-html was generated from. The goal is to
verify the roundtrip: Figma → jay-html → Figma produces a result as close to the original as
possible.

The converter output will never be 1:1 with the original because some Figma properties have no
HTML/CSS equivalent. But it should be structurally close, with correct layout, dimensions, colors,
fonts, and Jay bindings.

## Problem

The current test uses exact deep equality (`toEqual`), which fails because:

1. The expected has ~44K lines of Figma properties, many of which the converter can't produce
2. The converter adds structural elements (e.g. a "Content" wrapper frame) not in the original
3. Node IDs differ (converter generates `jay-import:N`, original has Figma IDs like `424:366`)
4. Some properties are structurally different (e.g. converter produces simple fills, Figma fills
   have `blendMode`, `boundVariables`, `visible` sub-properties)

We need a comparison strategy that:
- Catches **real bugs** in the converter (wrong layout mode, missing padding, wrong color)
- Ignores **acceptable losses** (Figma editor metadata that can't come from HTML)
- Is **explicit** about what's ignored (not a loose "anything goes" comparison)
- Keeps the expected file as the **unmodified Figma export** on disk (source of truth)

## Three Categories of Properties

### Category 1: Convertible — MUST match

Properties derivable from CSS/HTML that the converter is responsible for producing correctly.
Mismatches here indicate a converter bug.

| Property | Derived from |
|----------|-------------|
| `width`, `height` | CSS `width`, `height` |
| `layoutMode` | CSS `display: flex` + `flex-direction` |
| `primaryAxisAlignItems` | CSS `justify-content` |
| `counterAxisAlignItems` | CSS `align-items` |
| `itemSpacing` | CSS `gap` |
| `paddingLeft/Right/Top/Bottom` | CSS `padding` |
| `cornerRadius`, per-corner radius | CSS `border-radius` |
| `fills` (color, type, opacity) | CSS `background-color` / `background` |
| `strokes` (color, type) | CSS `border` / `border-color` |
| `strokeWeight` | CSS `border-width` |
| `opacity` | CSS `opacity` |
| `clipsContent` | CSS `overflow: hidden` |
| `overflowDirection` | CSS `overflow: auto/scroll` |
| `layoutSizingHorizontal/Vertical` | CSS `width: 100%` / `height: 100%` |
| `fontSize`, `fontWeight` | CSS `font-size`, `font-weight` |
| `fontName` (family, style) | CSS `font-family`, `font-style` |
| `textAlignHorizontal` | CSS `text-align` |
| `characters` | Text content |
| `letterSpacing` | CSS `letter-spacing` |
| `lineHeight` | CSS `line-height` |
| `textDecoration` | CSS `text-decoration` |
| `textCase` | CSS `text-transform` |
| `pluginData` (Jay bindings) | Jay attributes (`forEach`, `if`, `ref`, `data-figma-id`, etc.) |
| `name` | `data-name`, `aria-label`, or tag name |
| `type` | Element type mapping (FRAME, TEXT, SECTION) |

### Category 2: Figma-only — acceptable loss

Properties that have no HTML/CSS equivalent. These should be stripped from the expected before
comparison.

- `parentId`, `parentType` — Figma tree navigation metadata
- `locked` — editor lock state
- `visible` — editor visibility (exported nodes are visible by definition)
- `blendMode` (on fills/strokes) — Figma compositing mode
- `boundVariables` (on fills/strokes) — Figma variables system
- `effects` — Figma-specific (drop shadow, blur, etc.)
- `COMPONENT_SET`, `COMPONENT` nodes — Figma component/variant system
- `componentPropertyDefinitions`, `componentSetId`, `componentSetName`
- `mainComponentId`, `mainComponentName`, `componentProperties`
- `variantProperties`, `variants`
- `vectorPaths`, `fillGeometry`, `strokeGeometry` — Figma vector data
- `dashPattern` — stroke dash pattern
- `rotation` — node rotation
- `scrollBehavior` — Figma scroll behavior
- `parentLayoutMode`, `parentOverflowDirection`, `parentNumberOfFixedChildren`, `parentChildIndex`
- `layoutPositioning`, `layoutGrow`, `layoutAlign`, `layoutWrap`
- `hasMissingFont`, `hyperlinks`
- Root SECTION `x`, `y` — canvas placement (already handled)

### Category 3: Future improvements — not yet convertible

Properties that could potentially be derived from jay-html but the converter doesn't handle yet.
These should be tracked and moved to Category 1 as the converter improves.

- `fills` from CSS `linear-gradient(...)` — currently only solid colors
- `strokeTopWeight`, `strokeBottomWeight`, etc. — individual stroke weights
- `textAutoResize`, `textTruncation`, `maxLines`, `maxWidth` — text overflow behavior
- `textAlignVertical` — vertical text alignment
- `topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius` when CSS uses shorthand

## Questions

1. **Fill sub-properties**: When comparing fills, should we strip `blendMode`, `visible`,
   `boundVariables` from each fill object in the expected, and only compare `type`, `color`,
   `opacity`? Or should the converter produce the full Figma fill structure with default values
   (`blendMode: "NORMAL"`, `visible: true`)?

2. **Node IDs**: The converter generates `jay-import:N` IDs. The expected has original Figma IDs
   like `424:366`. Some nodes preserve the original ID via `data-figma-id`. Should the comparison
   match nodes by tree position (ignoring IDs) or should the converter use `data-figma-id` when
   available (it already does for some nodes)?

3. **Structural wrapper**: The converter wraps body content in a "Content" FRAME. The original
   doesn't have this wrapper. Should the converter be changed to not wrap, or should the test
   account for this structural difference?

4. **COMPONENT_SET nodes**: The original Figma export has component variant definitions as siblings
   of the main content frame. These don't exist in jay-html. Should they be silently ignored, or
   should the test explicitly verify they're absent in the converter output?

5. **Width/height of root SECTION**: The converter uses default 1440×900. The original has the
   real dimensions (e.g. 2013×1704). Should the converter try to compute dimensions from the
   content, or is this an acceptable loss?

---

## Ongoing: Style Conversion Gap Analysis (2026-02-13)

Investigation revealed that the comparison strategy discussion is blocked on a more fundamental
issue: the reverse converter **loses styles that it should be able to handle** because it doesn't
recognize the CSS patterns produced by our own forward export.

See Design Log #90 "Ongoing: Style Conversion Research" section for the full gap analysis and
approach decision. The priority is to fix the converter to handle our own export patterns before
revisiting the comparison strategy.

Once the converter correctly handles all forward-export CSS patterns, the comparison strategy
becomes more tractable — the "must match" list from this log will actually be achievable.
