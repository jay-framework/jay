# Design Log #90 - Jay-HTML to Vendor Doc Conversion on Import

## Background

The editor protocol supports importing vendor documents (e.g., `page.figma.json`) back to the design tool plugin. Currently, `onImport` only reads an existing vendor JSON file. If the file doesn't exist, import fails.

However, a page may have only a `page.jay-html` file (created manually, by AI generation, or by another tool) without a corresponding vendor JSON file. In this case, the vendor should be able to generate its document format from the jay-html.

## Problem

When a design tool plugin (e.g., Figma) calls import for a page that has a `page.jay-html` file but no `page.<vendorId>.json` file, the import fails with "file not found" instead of converting the jay-html to the vendor format.

## Design

### Vendor Interface Extension

Add an optional `convertFromJayHtml` method to the `Vendor` interface.
The method receives a **compiler-parsed** `JayHtmlSourceFile` (not raw HTML), giving the vendor
access to the full parsed body DOM, resolved headless imports, contracts, and CSS:

```typescript
import type { JayHtmlSourceFile } from '@jay-framework/compiler-jay-html';

export interface Vendor<TVendorDoc = any> {
    vendorId: string;

    convertToBodyHtml(vendorDoc: TVendorDoc, ...): Promise<VendorConversionResult>;

    // NEW: Reverse conversion - parsed jay-html to vendor doc
    convertFromJayHtml?(
        parsedJayHtml: JayHtmlSourceFile,
        pageUrl: string,
        projectPage: ProjectPage,
        plugins: Plugin[],
    ): Promise<TVendorDoc>;
}
```

**Why `JayHtmlSourceFile` instead of raw HTML:** The handler (`onImport`) already has all the
context needed to call `parseJayFile` (tsConfigPath, projectRoot, JAY_IMPORT_RESOLVER). Parsing
at the handler level and passing the result gives the vendor access to the compiler's rich output:

- `body`: Parsed DOM tree (HTMLElement) with all Jay directives
- `headlessImports`: Resolved headless component references (plugin, contract, key)
- `contract`: The page's contract data
- `css`: Extracted CSS content
- `namespaces`, `headLinks`, etc.

### Updated Import Flow

```
onImport(vendorId, pageUrl)
  ├─ page.<vendorId>.json exists? → Read & return (existing flow)
  └─ page.jay-html exists?
     ├─ Parse via parseJayFile (compiler infrastructure)
     ├─ Vendor has convertFromJayHtml? → Convert parsed result & return
     └─ No → Error: no vendor doc or jay-html found
```

After successful conversion, the generated vendor doc is saved as `page.<vendorId>.json` for future imports.

### Figma Implementation

Walk the compiler-parsed body DOM and create a `FigmaVendorDocument` tree:

- HTML elements → FRAME nodes (with styles parsed from inline `style` attributes)
- Text content → TEXT nodes
- `<img>` → FRAME nodes with image fills
- Jay attributes (`forEach`, `if`, `ref`, `{binding}`) → preserved as pluginData
- Headless imports from parsed source → preserved in section pluginData
- Wraps everything in a SECTION node with `jpage='true'`

**This is a lossy conversion** - Figma-specific data (exact fills, effects, component properties) cannot be fully reconstructed from HTML. But it provides a structural starting point that the plugin can work with.

### Style Parsing

CSS inline styles are reverse-mapped to Figma properties:

- `position: absolute; left: Xpx; top: Ypx` → `x`, `y`
- `width: Xpx; height: Ypx` → `width`, `height`
- `display: flex; flex-direction: column` → `layoutMode: 'VERTICAL'`
- `background-color: rgb(...)` → `fills`
- `border-radius: Xpx` → `cornerRadius`
- `font-size`, `font-family`, `font-weight` → text properties

## Implementation Plan

### Phase 1: Vendor Interface & Import Handler

1. Add `convertFromJayHtml` (accepting `JayHtmlSourceFile`) to `Vendor` interface
2. Update `onImport` in `editor-handlers.ts` to parse via `parseJayFile` and pass result

### Phase 2: Figma Conversion

1. Create `packages/jay-stack/stack-cli/lib/vendors/figma/converters/from-jay-html.ts`
2. Walk compiler-parsed body DOM and create FigmaVendorDocument tree
3. Implement CSS-to-Figma style mapping
4. Implement Jay attribute extraction (bindings, refs, forEach, if)
5. Preserve headless import metadata from compiler output

## Trade-offs

**Lossy conversion**: Jay-HTML doesn't contain all Figma-specific information (gradients, effects, etc.). The generated vendor doc is a structural approximation.

**Save on conversion**: After converting, we save the vendor doc to avoid re-converting on subsequent imports. This means the first import after jay-html creation is slower but subsequent ones are instant.

**Compiler dependency in vendor interface**: The `Vendor` interface now imports `JayHtmlSourceFile` from the compiler package. This is acceptable since the vendor types are internal to `stack-cli` which already depends on `compiler-jay-html`.

## Testing

### Approach

End-to-end fixture-based tests that exercise the real system — no mocks for parsing or import resolution.
Each test reads a valid `input.jay-html`, parses it through the real `parseJayFile` + `JAY_IMPORT_RESOLVER`
(same code path as the production import flow in `editor-handlers.ts`), runs `convertJayHtmlToFigmaDoc`,
and compares the result against an `expected.figma.json` snapshot.

### Test Location

```
packages/jay-stack/stack-cli/test/vendors/figma/
├── from-jay-html.test.ts                      # Test runner (auto-discovers fixtures)
└── from-jay-html-fixtures/
    ├── hello-world/                            # Minimal: static text, flex layout
    │   ├── input.jay-html
    │   └── expected.figma.json
    ├── wix-store-product-page/                 # Real-world: complex page with many elements
    │   ├── input.jay-html
    │   └── expected.figma.json
    └── <new-fixture>/                          # Add more here
        ├── input.jay-html
        ├── expected.figma.json
        └── meta.json                           # (optional)
```

### How to Run

```bash
# From packages/jay-stack/stack-cli/
npx vitest run test/vendors/figma/from-jay-html.test.ts

# Watch mode (re-runs on file changes)
npx vitest test/vendors/figma/from-jay-html.test.ts
```

### How to Add a New Fixture

1. Create a new folder under `from-jay-html-fixtures/` (name = test case name)
2. Add `input.jay-html` — must be a **valid jay-html file** with:
   - `<html>`, `<head>`, `<body>` structure
   - `<script type="application/jay-data">` with data declaration
   - Body content with the HTML to convert
3. Add `expected.figma.json` — the expected `FigmaVendorDocument` output
   - Tip: run the test once without it, copy `actual-output.figma.json` after verifying correctness
4. Optionally add `meta.json` for test-specific parameters:
   ```json
   { "pageUrl": "/products/:slug" }
   ```
5. For fixtures with headless/headfull imports, add real plugin files under the fixture
   directory (it acts as `projectRoot` for the resolver)

On mismatch, the test writes `actual-output.figma.json` to the fixture folder for easy diff/debugging.

### Test Comparison Decisions

**Root node `x`, `y` — ignored.** The root SECTION's `x`/`y` is its position on the Figma canvas.
This is a placement decision made by the plugin when it puts the section on the stage — it cannot
be derived from jay-html and is irrelevant to the conversion. Inner node `x`/`y` values ARE compared
since they represent position within the parent frame and affect layout.

### Open Issue: Property Comparison Strategy for Lossy Conversion

**Status: Needs design decision — see Design Log #91.**

The `expected.figma.json` in roundtrip test fixtures (like `wix-store-product-page`) is the
**original Figma export** — the source of truth for what the page should look like. The converter
output will never be 1:1 with this because some properties are Figma-specific and can't be
derived from HTML. But the goal is to be **as close as possible**.

The core question: how should the test compare the converter output against the original
Figma export, given that some properties are acceptable losses?

Three categories of properties were identified:

1. **Convertible** — derivable from CSS, the converter SHOULD produce them (layout, dimensions,
   colors, fonts, padding, radius, etc.). Mismatches here mean the converter needs fixing.
2. **Figma-only** — cannot be derived from HTML, acceptable losses (`parentId`, `parentType`,
   `locked`, `visible`, `blendMode`, `boundVariables`, `effects`, component variant definitions,
   vector paths, etc.)
3. **Future improvements** — could potentially be derived but aren't yet (gradients, individual
   stroke weights, text auto-resize, etc.)

See Design Log #91 for the full design of the comparison strategy.

### What Gets Tested (End-to-End)

The test exercises the full pipeline that runs in production:

1. **Compiler parsing** (`parseJayFile`) — validates the jay-html structure, extracts data declarations, resolves imports
2. **Import resolution** (`JAY_IMPORT_RESOLVER`) — resolves links, loads contracts, resolves plugins
3. **DOM → Figma conversion** (`convertJayHtmlToFigmaDoc`) — style mapping, element conversion, Jay attribute extraction

### Test Cases to Cover

Each fixture targets a specific aspect of the conversion. Examples:

| Fixture                     | Tests                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| `hello-world`               | Basic: static text in a flex column, font styles, color                           |
| `wix-store-product-page`    | Real-world: complex layout, many nested elements, bindings                        |
| _(future)_ text-styles      | Font family, weight, size, alignment, decoration, line-height                     |
| _(future)_ layout-modes     | Flex row/column, justify, align, gap, padding                                     |
| _(future)_ bindings         | `{expression}` in text, `forEach`, `if`, `ref` attributes                         |
| _(future)_ images           | `<img>` elements with src, alt, bound src                                         |
| _(future)_ nested-sections  | `<section>` with `data-page-url`, headless pluginData                             |
| _(future)_ border-radius    | Uniform and per-corner radius                                                     |
| _(future)_ overflow-scroll  | `overflow: hidden/auto/scroll` → clipsContent/overflowDirection                   |
| _(future)_ headless-imports | Jay-html with `<script type="application/jay-headless">` — real plugin resolution |

---

## Ongoing: Style Conversion Research (2026-02-13)

### Problem: Forward ↔ Reverse CSS Pattern Mismatch

The forward conversion (Figma→jay-html in `utils.ts`) produces CSS patterns that the reverse converter
(`from-jay-html.ts`) does not handle. This means styles are lost in the roundtrip even when they
are perfectly representable.

#### Critical mismatch: Background fills

**Forward export produces:**

```css
background-image: linear-gradient(rgba(255, 255, 255, 1), rgba(255, 255, 255, 1));
background-size: 100% 100%;
background-position: center;
background-repeat: no-repeat;
```

**Reverse converter looks for:**

```typescript
const bgColor = styles.get('background-color') || styles.get('background');
```

Result: **every background color is lost** because the forward export uses `background-image` with
`linear-gradient()`, not `background-color`.

#### Other mismatches between forward export and reverse converter

| Forward export CSS                                                          | Reverse converter handling                      | Status      |
| --------------------------------------------------------------------------- | ----------------------------------------------- | ----------- |
| `background-image: linear-gradient(rgba(...))`                              | Only checks `background-color`/`background`     | **BROKEN**  |
| `background: transparent`                                                   | Tries to parse as color, fails                  | **BROKEN**  |
| `border-color: rgb(...)` + `border-width` + `border-style` (separate props) | Only handles shorthand `border: 1px solid #000` | **PARTIAL** |
| `flex-grow: 1`                                                              | Not mapped                                      | **MISSING** |
| `align-self: stretch/center/...`                                            | Not mapped                                      | **MISSING** |
| `width: fit-content` / `height: fit-content`                                | Not mapped                                      | **MISSING** |
| `box-shadow: ...`                                                           | Not mapped                                      | **MISSING** |
| `filter: blur(...)`                                                         | Not mapped                                      | **MISSING** |
| `backdrop-filter: blur(...)`                                                | Not mapped                                      | **MISSING** |
| `transform: rotate(Ndeg)`                                                   | Not mapped                                      | **MISSING** |
| `min-width/max-width/min-height/max-height`                                 | Not mapped                                      | **MISSING** |

### Approaches Considered

#### Approach A: Fix converter for our own export patterns (SELECTED)

Since we control the forward conversion, we know exactly what CSS patterns it produces. Fix the
reverse converter to handle those exact patterns.

**Pros:** No new dependencies, fast, deterministic, handles the roundtrip case perfectly.
**Cons:** Only works for CSS produced by our own exporter. Hand-written or AI-generated jay-html
might use different CSS patterns.

#### Approach B: Render in headless browser (Puppeteer/Playwright)

Render jay-html in a browser, use `getComputedStyle()` + `getBoundingClientRect()` to get resolved
styles and layout.

**Pros:** Handles any CSS (classes, `<style>` blocks, inheritance, shorthand).
**Cons:** Heavy dependency, slow, loses layout "intent" (e.g. `flex-grow: 1` becomes computed `width: 347px`,
losing the info that it should be `FILL` in Figma).

#### Approach C: Hybrid (future enhancement)

Parse inline styles directly (Approach A) for known patterns, optionally use browser for:

- Resolving dimensions for auto-sized elements
- Handling jay-html not generated by our export (AI-generated, hand-written)
- Inheriting font/color from parent elements

### Decision: Approach A first, Approach C later

1. **Phase 1 (now)**: Fix the reverse converter to correctly parse all CSS patterns our forward export produces
2. **Phase 2 (future)**: Add optional browser rendering for non-roundtrip jay-html

Key insight: the browser computed styles approach loses layout "intent":

| CSS (intent)         | Computed style | Figma property needed            |
| -------------------- | -------------- | -------------------------------- |
| `flex-grow: 1`       | `width: 347px` | `layoutSizingHorizontal: 'FILL'` |
| `width: fit-content` | `width: 200px` | `layoutSizingHorizontal: 'HUG'`  |
| `width: 100%`        | `width: 800px` | `layoutSizingHorizontal: 'FILL'` |

For layout properties we need the **declared** CSS value, not the **computed** value.

---

## Implementation Results: Approach A — Forward Export Pattern Handling (2026-02-13)

### What was done

Updated `from-jay-html.ts` to handle all CSS patterns that our forward export (`utils.ts`) produces.
The converter now correctly parses styles that were previously lost in the roundtrip.

### Changes to `from-jay-html.ts`

#### New parsing functions added

| Function                        | Purpose                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `parseBackgroundImageToFills()` | Parses `background-image: linear-gradient(rgba(...), rgba(...))` → solid fills |
| `parseBoxShadowToEffects()`     | Parses `box-shadow` → `DROP_SHADOW` / `INNER_SHADOW` effects                   |
| `parseBlurFromFilter()`         | Parses `filter: blur(Npx)` → `LAYER_BLUR` effects                              |
| `splitOutsideParens()`          | Splits CSS values on commas outside parentheses (for multi-shadow parsing)     |
| `parseRotationFromTransform()`  | Parses `transform: rotate(Ndeg)` → `rotation`                                  |

#### Updated `stylesToFigmaProps()` — new CSS → Figma mappings

| CSS pattern                                                 | Figma property                           | Status                  |
| ----------------------------------------------------------- | ---------------------------------------- | ----------------------- |
| `background-image: linear-gradient(rgba(...))`              | `fills`                                  | **FIXED** (was broken)  |
| `background: transparent`                                   | no fills (leave undefined)               | **FIXED** (was broken)  |
| `border-color` + `border-width` + `border-style` (separate) | `strokes` + `strokeWeight`               | **FIXED** (was partial) |
| Multi-value `border-width: T R B L`                         | `strokeWeight` (max)                     | **NEW**                 |
| `width: fit-content` / `height: fit-content`                | `layoutSizingHorizontal/Vertical: 'HUG'` | **NEW**                 |
| `flex-grow: 1` + `width: 0`                                 | `layoutSizingHorizontal: 'FILL'`         | **NEW**                 |
| `align-self: stretch/center/...`                            | `layoutAlign`                            | **NEW**                 |
| `box-shadow: ...`                                           | `effects` (DROP_SHADOW / INNER_SHADOW)   | **NEW**                 |
| `filter: blur(Npx)`                                         | `effects` (LAYER_BLUR)                   | **NEW**                 |
| `backdrop-filter: blur(Npx)`                                | `effects` (BACKGROUND_BLUR)              | **NEW**                 |
| `transform: rotate(Ndeg)`                                   | `rotation`                               | **NEW**                 |
| `min-width/max-width/min-height/max-height`                 | `minWidth/maxWidth/minHeight/maxHeight`  | **NEW**                 |
| `flex-wrap: wrap`                                           | `layoutWrap: 'WRAP'`                     | **NEW**                 |

#### Updated node converters

All node converters (`convertFrameElement`, `convertTextElement`, `convertImageElement`) now pass
through the new properties: `rotation`, `effects`, `layoutAlign`, `layoutWrap`, `minWidth`,
`maxWidth`, `minHeight`, `maxHeight`.

### Test results

- `hello-world` fixture: **PASSES** (2/2 tests)
- `wix-store-product-page` fixture: **FAILS** — but this is the pre-existing comparison strategy
  issue (Design Log #91). The converter output now contains 41 fill entries (previously 0 for
  backgrounds), 103 layout sizing properties, and effects/blur data. The failure is due to
  structural differences (COMPONENT_SET nodes, bindingData, IDs) not style conversion.

### What's still not handled

These remain as future work:

| CSS                                          | Figma               | Reason                                              |
| -------------------------------------------- | ------------------- | --------------------------------------------------- |
| CSS classes / `<style>` block                | Various             | No CSS cascade resolution (would need Approach B/C) |
| Inherited styles (color, font) on child text | `fills`, `fontName` | No CSS inheritance resolution                       |
| `rem`, `em`, `vh`, `vw` units                | Various             | Only `px` and `%` parsed                            |
| `calc()` expressions                         | Various             | Would need CSS expression evaluator                 |
| `hsl()`/`hsla()` colors                      | fills/strokes       | Only `rgb()`/`rgba()`/hex supported                 |
| Named colors (`red`, `blue`)                 | fills/strokes       | Only numeric colors supported                       |

### Next steps

1. Implement the comparison strategy (Design Log #91) to validate roundtrip accuracy
2. Consider Approach C (hybrid browser rendering) for non-roundtrip jay-html

---

## Ongoing: Complete Gap Inventory & Incremental Plan (2026-02-13)

### Discussion: Why not strip properties to make the test green?

The initial plan was to strip "Figma-only" properties from the expected output to make the roundtrip
test pass (Design Log #91). But this approach is problematic — if we ignore too many things, the test
passes while the actual Figma import still looks broken. The test becomes meaningless.

**Decision**: Instead of one big test with loose comparison, break down into **focused test fixtures**,
each targeting a specific converter capability. Each fixture has its own expected output that the
converter MUST match exactly. This way:

- Every test that passes means a real capability works
- Every test that fails means a specific gap we need to fix
- No properties are hidden or ignored

### Gap Inventory (from wix-store-product-page analysis)

Detailed comparison of `actual-output.figma.json` (converter output, 4927 lines, 263 nodes)
vs `expected.figma.json` (original Figma export, 44236 lines, 305 nodes).

#### Gap 1: Node type mapping — `data-figma-type` not used

**Problem**: The converter treats all elements as FRAME or TEXT. But the jay-html carries
`data-figma-type` attributes that specify the original Figma node type. The converter ignores them.

| `data-figma-type`   | Expected Figma type      | Current converter output |
| ------------------- | ------------------------ | ------------------------ |
| `frame`             | FRAME                    | FRAME (correct)          |
| `vector`            | VECTOR (with svgContent) | FRAME (wrong)            |
| `group`             | GROUP                    | FRAME (wrong)            |
| `frame-repeater`    | FRAME (with forEach)     | FRAME (correct)          |
| `variant-container` | INSTANCE                 | FRAME (wrong)            |

In the wix-store-product-page: 22 vector elements, 3 groups, 5 variant containers all become FRAMEs.

**Fix**: Read `data-figma-type` in `convertElement()` and dispatch to the correct node type.
For vectors, extract the inline SVG and set `svgContent`.

#### Gap 2: COMPONENT_SET / COMPONENT / INSTANCE — variant conversion

**Problem**: The expected has 5 COMPONENT_SET nodes (with 16 COMPONENT children) and 27 INSTANCE
nodes. The converter produces none — all `if` conditions become FRAMEs with `pluginData['if']`.

The jay-html has 5 variant groups (all with `data-figma-type="variant-container"` parent) containing
12 `if` conditions.

**Fix**: Implement Design Log #92 — detect variant groups from `if` conditions and produce
COMPONENT_SET/COMPONENT/INSTANCE structure.

#### Gap 3: Content wrapper frame

**Problem**: The converter wraps all body children in a "Content" FRAME that doesn't exist in the
original Figma export. The original has the content frame as a direct child of the SECTION.

Expected structure: `SECTION > FRAME("Page") + COMPONENT_SET(s)`
Actual structure: `SECTION > FRAME("Content") > FRAME("frame")`

**Fix**: When the jay-html body has a single `<section>` with `data-page-url`, use it directly
as the SECTION without adding a Content wrapper. The main content frame should be the first child
(reconstructed from the body content), and COMPONENT_SET nodes should be siblings at the section
level.

#### Gap 4: Node naming

**Problem**: The converter uses "frame" as the default name for FRAMEs. The expected has meaningful
names like "Page", "Frame 4", "Section".

Sources of names in order of priority:

1. `data-name` attribute (already used)
2. `aria-label` attribute (already used)
3. The original Figma node name from the `name` field in the serialized JSON
4. Semantic tag name

**Fix**: The forward export sets `data-name` on some elements but not all. The converter should
also read `data-figma-type` value and capitalize it, and use element content for text nodes.
Longer-term: the forward export could set `data-name` on more elements.

#### Gap 5: Root SECTION — name, dimensions, fills

**Problem**:

- Name: converter produces "Jay Page: Page", expected is "Product Page" (from Figma layer name)
- Dimensions: converter uses default 1440x900, expected is 2013x1704 (real content size)
- Fills: converter produces no fills, expected has a gray background
- pluginData: converter adds `headlessImports`, expected doesn't have it

**Fix**: The `<section data-page-url="...">` in jay-html doesn't carry the original section name
or dimensions. For roundtrip, the converter could read `data-name` on the section element.
For dimensions, compute from content bounds. For fills, the section background is not in the
jay-html CSS (sections don't have style attributes in our export).

#### Gap 6: Text nesting structure

**Problem**: The forward export wraps text in nested divs:

```html
<div data-figma-id="424:371" style="...font-size: 25px;...">
  <div style="font-size: 25px;...">FashionHub</div>
</div>
```

The outer div is the Figma text node's container (with layout positioning). The inner div has the
actual text. The converter sees the outer div as a FRAME (it has a child element, so `isTextElement`
returns false), and the inner div as a TEXT.

Result: an extra FRAME wrapper around every text node. Expected: just a TEXT node.

**Fix**: Detect when a div with `data-figma-id` contains only a single div child that is text-like.
In this case, merge them into a single TEXT node, combining layout props from the outer div and
text props from the inner div.

#### Gap 7: Font style mapping

**Problem**: The converter always sets `fontName.style` to "Regular" or "Italic" (from
`font-style`). But Figma uses combined weight+style names like "Extra Bold Italic", "Bold",
"Medium", "Semi Bold".

The forward export produces `font-weight: 800` and `font-style: italic`, which the converter
reads, but it maps to `fontName: { family: "Inter", style: "Italic" }` instead of
`fontName: { family: "Inter", style: "Extra Bold Italic" }`.

**Fix**: Build a weight→style name mapping: 100→Thin, 200→Extra Light, 300→Light, 400→Regular,
500→Medium, 600→Semi Bold, 700→Bold, 800→Extra Bold, 900→Black. Combine with italic when present.

#### Gap 8: Image handling

**Problem**: `<img>` elements become empty FRAMEs. The expected has RECTANGLE nodes with IMAGE fills
(containing `imageHash`, `imageUrl`, `scaleMode`).

The jay-html has 7 images:

- 1 static: `src="/images/424:387_FILL.png"` (the static image path in the project)
- 6 bound: `src="{productPage.mediaGallery.selectedMedia.url}"` etc.

**Decision (from discussion)**: Images are a special case. The dev server has the static images in
the project. In principle, we could:

1. For static images: set `imageUrl` to the src path, let the plugin resolve it
2. For bound images: store the binding, leave image empty (can't resolve at conversion time)

**For now**: Exclude image fill content from test comparison. The converter should still produce
the correct node type (RECTANGLE for images, not FRAME) and preserve the `semanticHtml: "img"`
plugin data and src binding. Image fill restoration is tracked as a future improvement.

#### Gap 9: Vector/SVG handling

**Problem**: Elements with `data-figma-type="vector"` contain inline `<svg>` in the jay-html.
The converter produces FRAMEs, the expected has VECTOR nodes with `svgContent`.

22 vector elements in the wix-store-product-page fixture.

**Fix**: When `data-figma-type="vector"`, extract the inner `<svg>` element's outerHTML and
set it as `svgContent` on a VECTOR node. The plugin deserializer already handles `svgContent`
via `figma.createNodeFromSvg()`.

#### Gap 10: bindingData reconstruction

**Problem**: The expected has `bindingData` at the root SECTION level containing 35 layer bindings
that connect Figma layer IDs to contract tag paths. The converter doesn't produce this.

The `bindingData` is used by the plugin's `rebuildBindingsAfterImport()` to restore the connection
between Figma layers and contract tags.

**Fix**: The jay-html already has the binding information as element attributes (`forEach`,
`trackBy`, `ref`, `src="{expr}"`, `if`). The converter already extracts some of this into
`pluginData`. The `bindingData` structure needs to be assembled from all these scattered
per-element bindings into the root-level format the plugin expects.

This is complex because `bindingData` format includes `jayPageSectionId`, `pageContractPath`,
and `tagPath` arrays that require understanding the contract structure. May need to be
reconstructed by the plugin after import rather than by the converter.

#### Gap 11: Fill sub-properties (visible, opacity, blendMode)

**Problem**: The converter produces minimal fills: `{ type, color, opacity? }`.
The Figma export includes `{ type, color, opacity, visible, blendMode, boundVariables }`.

**Fix**: Add default values: `visible: true`, `blendMode: "NORMAL"`. This is a small fix that
makes the fill structure match what the deserializer expects.

#### Gap 12: Figma-only metadata (truly ignorable)

These properties exist only in the Figma export and have no HTML equivalent. They are NOT
produced by the converter and do not affect the visual result when importing:

`parentId`, `parentType`, `parentLayoutMode`, `parentOverflowDirection`, `parentChildIndex`,
`absoluteRenderBounds`, `isMask`, `layoutGrow: 0` (default), `layoutPositioning: "AUTO"` (default),
`layoutAlign: "INHERIT"` (default), `layoutWrap: "NO_WRAP"` (default), `strokeAlign` (default),
per-side stroke weights (when equal to strokeWeight), `rotation: 0` (default), `locked: false`
(default), `visible: true` (default), `opacity: 1` (default), `scrollBehavior`.

**These are the ONLY properties safe to exclude from test comparison.** The test fixtures for
focused test cases won't include them. The wix-store-product-page roundtrip test can strip them.

### Incremental Test Plan

Break the big wix-store-product-page test into focused fixtures. Each fixture is small, tests one
specific capability, and has its own `expected.figma.json` that the converter must match exactly.

#### Phase 1: Style fidelity (current focus)

| #   | Fixture name         | Tests                                                                      | Status  |
| --- | -------------------- | -------------------------------------------------------------------------- | ------- |
| 1   | `hello-world`        | Basic flex layout, text with font/color                                    | PASSING |
| 2   | `background-fills`   | Solid fills from `linear-gradient()`, transparent                          | TODO    |
| 3   | `strokes-borders`    | `border-color` + `border-width` + `border-style`                           | TODO    |
| 4   | `text-styles`        | Font family/weight/size, alignment, decoration, line-height, color         | TODO    |
| 5   | `font-style-mapping` | Weight→style name (Regular, Bold, Extra Bold Italic, etc.)                 | TODO    |
| 6   | `layout-sizing`      | FILL (100%, flex-grow), HUG (fit-content), FIXED (px)                      | TODO    |
| 7   | `effects`            | box-shadow→DROP_SHADOW, filter→LAYER_BLUR, backdrop-filter→BACKGROUND_BLUR | TODO    |
| 8   | `overflow-clipping`  | overflow hidden/auto/scroll → clipsContent/overflowDirection               | TODO    |
| 9   | `rotation`           | transform: rotate(Ndeg) → rotation                                         | TODO    |
| 10  | `border-radius`      | Uniform and per-corner radius                                              | TODO    |

#### Phase 2: Node type mapping

| #   | Fixture name       | Tests                                                               | Status |
| --- | ------------------ | ------------------------------------------------------------------- | ------ |
| 11  | `node-type-vector` | `data-figma-type="vector"` with inline SVG → VECTOR with svgContent | TODO   |
| 12  | `node-type-group`  | `data-figma-type="group"` → GROUP node                              | TODO   |
| 13  | `node-type-image`  | `<img>` with static/bound src → image node with semanticHtml        | TODO   |
| 14  | `text-nesting`     | Outer div + inner text div → single TEXT node (merge)               | TODO   |
| 15  | `node-naming`      | data-name, aria-label, tag name → correct node name                 | TODO   |

#### Phase 3: Variant conversion (Design Log #92)

| #   | Fixture name            | Tests                                                     | Status |
| --- | ----------------------- | --------------------------------------------------------- | ------ |
| 16  | `variant-enum`          | `if` siblings checking same tag → COMPONENT_SET/COMPONENT | TODO   |
| 17  | `variant-boolean`       | `if`/`!if` pair → boolean variant                         | TODO   |
| 18  | `variant-multi-prop`    | Compound `if` (tag1 && tag2) → multi-property variant     | TODO   |
| 19  | `variant-container`     | `data-figma-type="variant-container"` → INSTANCE          | TODO   |
| 20  | `variant-standalone-if` | Lone `if` (no matching siblings) → FRAME with pluginData  | TODO   |

#### Phase 4: Bindings and structural

| #   | Fixture name         | Tests                                                                | Status |
| --- | -------------------- | -------------------------------------------------------------------- | ------ |
| 21  | `for-each`           | `forEach` + `trackBy` → repeater with pluginData                     | TODO   |
| 22  | `attribute-bindings` | `src="{expr}"`, dynamic attributes                                   | TODO   |
| 23  | `headless-imports`   | Headless component resolution → section pluginData                   | TODO   |
| 24  | `section-structure`  | Section with data-page-url → correct SECTION without Content wrapper | TODO   |

#### Phase 5: Roundtrip validation

| #   | Fixture name             | Tests                                                                               | Status  |
| --- | ------------------------ | ----------------------------------------------------------------------------------- | ------- |
| 25  | `wix-store-product-page` | Full roundtrip comparison (with Figma-only metadata stripped, image fills excluded) | FAILING |

### Implementation Order

The fixtures should be created and implemented in this order, based on impact and dependency:

**Sprint 1**: Fixtures 2-10 (style fidelity)
These are the easiest wins — the converter already handles most of these, we just need focused
tests to verify and catch regressions. Some may need small fixes (e.g., font style mapping #5).

**Sprint 2**: Fixtures 11-15 (node type mapping)
This requires reading `data-figma-type` and dispatching to the correct node type. The vector/SVG
handling (#11) is the most impactful. Text nesting merge (#14) is needed before the roundtrip
test can meaningfully compare text nodes.

**Sprint 3**: Fixtures 16-20 (variant conversion)
Implement Design Log #92. This is the biggest feature gap.

**Sprint 4**: Fixtures 21-24 (bindings and structure)
Requires understanding the binding data format and contract resolution.

**Sprint 5**: Fixture 25 (roundtrip validation)
After sprints 1-4, update the roundtrip test to strip only Gap 12 properties (truly ignorable
metadata) and exclude image fill content. At this point, the test should pass or nearly pass.

### Image handling decision

**For now**: Images are excluded from fill comparison in the roundtrip test. The converter
should still:

1. Produce the correct node type (RECTANGLE for `<img>`, not FRAME)
2. Preserve `semanticHtml: "img"` in pluginData
3. Preserve the `src` binding if dynamic (`src="{expr}"`)
4. Set `staticImageUrl` in pluginData if static src

**Future**: The dev server has static images at paths like `/images/424:387_FILL.png`. The
converter could set `imageUrl` to this path. The plugin could fetch and set the image fill
during import. This is a separate feature tracked for later.

---

## Implementation Results: Test Breakdown & Bug Fix (2026-02-13)

### Test breakdown

Created 12 focused test fixtures (Sprint 1 + Sprint 2), each testing a specific converter capability.

**All fixtures passing (14/15 total):**

| #   | Fixture              | What it tests                                                                      | Lines |
| --- | -------------------- | ---------------------------------------------------------------------------------- | ----- |
| 1   | `hello-world`        | Basic flex layout, text with font/color                                            | 13    |
| 2   | `background-fills`   | Solid fills from linear-gradient, transparent, rgb, rgba                           | 14    |
| 3   | `strokes-borders`    | Separate border-color/width/style, shorthand border                                | 12    |
| 4   | `text-styles`        | Font family/weight/size, color, alignment, decoration, line-height, letter-spacing | 16    |
| 5   | `font-style-mapping` | Weight 100-900 + italic combinations → fontName.style                              | 18    |
| 6   | `layout-sizing`      | FILL (100%, flex-grow), HUG (fit-content), FIXED (px), align-self                  | 13    |
| 7   | `effects`            | box-shadow (drop/inner), filter blur, backdrop-filter blur                         | 12    |
| 8   | `overflow-clipping`  | overflow hidden/auto, overflow-x/y combinations                                    | 14    |
| 9   | `border-radius`      | Uniform, zero, large (circle), per-corner                                          | 12    |
| 10  | `node-type-vector`   | data-figma-type="vector" with inline SVG (currently → FRAME, not VECTOR)           | 15    |
| 11  | `node-type-image`    | img tags with static/bound src                                                     | 10    |
| 12  | `text-nesting`       | Outer div + inner text div pattern (currently → FRAME wrapper + TEXT)              | 14    |
| 13  | `node-naming`        | data-name, aria-label, data-figma-type defaults                                    | 11    |

**Still failing (1/15):** `wix-store-product-page` — the full roundtrip test. This will be
addressed after the focused fixtures cover all gaps.

### Bug fix: linear-gradient parsing with nested parentheses

Discovered that `parseBackgroundImageToFills()` used regex `/linear-gradient\(([^)]+)\)/g` which
broke on nested parentheses inside `rgba(...)`. The `[^)]+` stopped at the first `)` inside the
rgba call, so:

```
linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))
                     ↑ [^)]+ stopped here ↑
```

**Fix**: Replaced regex with balanced-parenthesis extraction using a depth counter. Now correctly
handles arbitrary nesting.

### Fixtures that snapshot current behavior (will need expected updates later)

These fixtures pass today but their expected output represents the CURRENT converter behavior,
which has known gaps. When we implement each gap fix, we update the expected output FIRST (test
fails), then fix the converter (test passes):

| Fixture              | Known gap | What needs to change                                                              |
| -------------------- | --------- | --------------------------------------------------------------------------------- |
| `font-style-mapping` | Gap 7     | `fontName.style` should be "Bold", "Extra Bold Italic", etc. instead of "Regular" |
| `node-type-vector`   | Gap 9     | Should produce VECTOR with svgContent, not FRAME with nested svg/path FRAMEs      |
| `node-type-image`    | Gap 8     | Should produce correct image node type, not generic FRAME                         |
| `text-nesting`       | Gap 6     | Should merge outer+inner into single TEXT node, not FRAME wrapper                 |
| `node-naming`        | Gap 4     | Some names should be better (capitalize data-figma-type, etc.)                    |

### How to evolve a fixture when fixing a gap

1. Edit the fixture's `expected.figma.json` to reflect the CORRECT output
2. Run the test — it FAILS showing the exact diff
3. Fix the converter code
4. Run the test — it PASSES
5. Delete `actual-output.figma.json` if written

This approach ensures every fix is validated against a specific, readable expected output.
No properties are hidden or ignored.
