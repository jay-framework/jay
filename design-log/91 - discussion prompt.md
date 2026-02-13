# Discussion Prompt: Figma Property Comparison Strategy for Roundtrip Testing

## One-liner

How should we compare the output of `convertJayHtmlToFigmaDoc` against the original Figma export, given that the conversion is inherently lossy?

## Context

We have a conversion pipeline: **Figma → jay-html → Figma** (roundtrip).

- **Forward** (Figma → jay-html): The Figma plugin exports a page to jay-html. This works and is shipped.
- **Reverse** (jay-html → Figma): `convertJayHtmlToFigmaDoc` in `from-jay-html.ts` converts a parsed jay-html file back to a `FigmaVendorDocument` JSON structure that the Figma plugin can import.

The reverse conversion is **lossy by nature** — jay-html/CSS doesn't carry all Figma-specific properties (blend modes, variable bindings, effects, component variants, vector paths, etc.).

We have end-to-end tests that:
1. Parse a real `input.jay-html` through the actual compiler (`parseJayFile` + `JAY_IMPORT_RESOLVER`)
2. Run `convertJayHtmlToFigmaDoc` on the parsed result
3. Compare the output against an `expected.figma.json`

For roundtrip test fixtures, the `expected.figma.json` is the **original Figma export** — the same document the jay-html was generated from. We want to keep it unmodified on disk as the source of truth.

## The Problem

Simple `deepEqual` comparison fails with thousands of differences because:
- Some properties are acceptable losses (e.g. `effects`, `blendMode`, `boundVariables`, `locked`, `visible`)
- Some properties the converter should produce but currently doesn't (e.g. gradient fills, per-corner radius)
- Node IDs differ (converter generates `jay-import:N`, original has `424:366` style IDs)
- Some structural differences exist (converter adds a "Content" wrapper frame)
- Sub-properties on fills/strokes differ (Figma adds `blendMode`, `visible`, `boundVariables` to each fill)

## What I Need

A comparison strategy that:
1. **Catches real converter bugs** — if layout mode is wrong, padding is missing, a color is off, the test should fail
2. **Ignores acceptable losses** — properties that HTML/CSS simply cannot represent
3. **Is explicit** — there's a clear list of what's stripped/ignored, not a fuzzy comparison
4. **Keeps expected unmodified** — the original Figma export stays on disk; stripping happens at comparison time
5. **Is easy to evolve** — as the converter improves, properties move from "ignored" to "compared"

## Property Categories

### Must match (converter is responsible)
`width`, `height`, `layoutMode`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `itemSpacing`,
`paddingLeft/Right/Top/Bottom`, `cornerRadius`, `fills` (type + color + opacity), `strokes`,
`strokeWeight`, `opacity`, `clipsContent`, `overflowDirection`, `layoutSizingHorizontal/Vertical`,
`fontSize`, `fontWeight`, `fontName`, `textAlignHorizontal`, `characters`, `letterSpacing`,
`lineHeight`, `textDecoration`, `textCase`, `pluginData`, `name`, `type`

### Acceptable loss (Figma-only, no CSS equivalent)
`parentId`, `parentType`, `locked`, `visible`, `blendMode` (on fills), `boundVariables`,
`effects`, `COMPONENT_SET`/`COMPONENT` nodes and their properties, `vectorPaths`,
`fillGeometry`, `strokeGeometry`, `dashPattern`, `rotation`, `scrollBehavior`,
`layoutPositioning`, `layoutGrow`, `layoutAlign`, root SECTION `x`/`y`

### Future improvements (could be derived but aren't yet)
`fills` from `linear-gradient(...)`, individual stroke weights, `textAutoResize`,
`textTruncation`, `textAlignVertical`, per-corner radius from CSS shorthand

## Open Questions

1. **Fill comparison granularity**: When comparing fills, should we strip Figma-only sub-properties (`blendMode`, `visible`, `boundVariables`) from the expected and only compare `type`, `color`, `opacity`? Or should the converter produce the full Figma structure with defaults?

2. **Node matching**: Converter generates different IDs than the original. Should we match nodes by tree position/structure, or should the converter preserve original IDs from `data-figma-id`?

3. **Structural wrapper**: The converter wraps body content in a "Content" FRAME not present in the original. Should we fix the converter or account for this in the test?

4. **Component nodes**: The Figma export has COMPONENT_SET/COMPONENT sibling nodes. The jay-html doesn't have these. Silently ignore, or explicitly verify absence?

5. **Root SECTION dimensions**: Converter uses default 1440×900. Original has real dimensions (2013×1704). Should the converter compute this from content?

## Relevant Files

- **Converter**: `packages/jay-stack/stack-cli/lib/vendors/figma/converters/from-jay-html.ts`
- **Test**: `packages/jay-stack/stack-cli/test/vendors/figma/from-jay-html.test.ts`
- **Design Log**: `design-log/90 - jay-html to vendor doc conversion on import.md`
- **Full design log for this issue**: `design-log/91 - figma property comparison strategy for roundtrip testing.md`
- **Fixture (complex)**: `packages/jay-stack/stack-cli/test/vendors/figma/from-jay-html-fixtures/wix-store-product-page/`
