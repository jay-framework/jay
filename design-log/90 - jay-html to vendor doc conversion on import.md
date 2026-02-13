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

### What Gets Tested (End-to-End)

The test exercises the full pipeline that runs in production:

1. **Compiler parsing** (`parseJayFile`) — validates the jay-html structure, extracts data declarations, resolves imports
2. **Import resolution** (`JAY_IMPORT_RESOLVER`) — resolves links, loads contracts, resolves plugins
3. **DOM → Figma conversion** (`convertJayHtmlToFigmaDoc`) — style mapping, element conversion, Jay attribute extraction

### Test Cases to Cover

Each fixture targets a specific aspect of the conversion. Examples:

| Fixture | Tests |
|---------|-------|
| `hello-world` | Basic: static text in a flex column, font styles, color |
| `wix-store-product-page` | Real-world: complex layout, many nested elements, bindings |
| *(future)* text-styles | Font family, weight, size, alignment, decoration, line-height |
| *(future)* layout-modes | Flex row/column, justify, align, gap, padding |
| *(future)* bindings | `{expression}` in text, `forEach`, `if`, `ref` attributes |
| *(future)* images | `<img>` elements with src, alt, bound src |
| *(future)* nested-sections | `<section>` with `data-page-url`, headless pluginData |
| *(future)* border-radius | Uniform and per-corner radius |
| *(future)* overflow-scroll | `overflow: hidden/auto/scroll` → clipsContent/overflowDirection |
| *(future)* headless-imports | Jay-html with `<script type="application/jay-headless">` — real plugin resolution |
