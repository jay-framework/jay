# Figma to Jay HTML Converter Migration Plan

This plan outlines the steps required to bring the new `FigmaToJayConverter` (`jay/packages/jay-stack/vendors/figma/adapter/lib/converter.ts`) to parity with the legacy implementation (`jay-desktop-poc/plugin/src/jPage2Jhtml.ts`).

## Phase 1: Data Model Enhancements

**Goal**: Ensure `InterchangeNode` and related interfaces carry all necessary data from Figma.
**File**: `jay/packages/jay-stack/vendors/figma/interchange/lib/index.ts`

1.  **Update `InterchangeFrame` and `LayoutMixin`**:

    - Add `layoutSizingHorizontal`: `'FIXED' | 'HUG' | 'FILL'`
    - Add `layoutSizingVertical`: `'FIXED' | 'HUG' | 'FILL'`
    - Add `primaryAxisAlignItems`: `'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN'` (and map to flex properties).
    - Add `counterAxisAlignItems`: `'MIN' | 'MAX' | 'CENTER' | 'BASELINE'`.
    - Add constraint properties (`minWidth`, `maxWidth`, `minHeight`, `maxHeight`).
    - Add `overflowDirection`: `'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'BOTH'` (to support scrolling).

2.  **Update `InterchangeText`**:

    - Replace `// ... font props` with actual properties matching Figma's text node:
      - `fontFamily`: string
      - `fontStyle`: string
      - `fontWeight`: number
      - `fontSize`: number
      - `letterSpacing`: number | string
      - `lineHeight`: number | string | { value: number, unit: string }
      - `textDecoration`: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH'
      - `textAlignHorizontal`: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
      - `textAlignVertical`: 'TOP' | 'CENTER' | 'BOTTOM'

3.  **Update `InterchangeInstance`**:
    - Ensure it includes variant properties and component set ID if not already present, to support variant logic.

## Phase 2: Core Converter Architecture

**Goal**: Refactor `FigmaToJayConverter` to manage global state (fonts, imports) and output a full document.
**File**: `jay/packages/jay-stack/vendors/figma/adapter/lib/converter.ts`

1.  **State Management**:

    - Add private class properties to track resources during `process()`:
      - `private usedFontFamilies: Set<string>;`
      - `private componentImports: Set<string>;` (for Jay components)
      - `private syntheticTags: Set<string>;` (for generated CSS classes)
      - `private overlayPopovers: Map<string, string>;`
    - Initialize/Reset these in the `process` method before starting traversal.

2.  **Output Structure**:
    - Modify `process(node)` to return a full HTML document string instead of just the node fragment.
    - Implement a `generateFullDocument(bodyContent: string): string` helper that:
      - Generates `<!DOCTYPE html><html lang="en">`.
      - Generates `<head>` section.
      - Injects Google Fonts links (iterating over `this.usedFontFamilies`).
      - Injects Jay Component scripts (iterating over `this.componentImports`).
      - Injects Global styles (CSS reset, scrollbar styling from `jPage2Jhtml.ts`).
      - Injects Generated CSS for variants (`this.syntheticTags`).
      - Generates `<body>` containing the `bodyContent`.

## Phase 3: Layout & Styling Parity

**Goal**: Match the precise CSS generation of the legacy converter.
**File**: `jay/packages/jay-stack/vendors/figma/adapter/lib/converter.ts`

1.  **Responsive Sizing (Hug/Fill)**:

    - Refactor `getSizeStyle` to check `layoutSizingHorizontal` / `layoutSizingVertical`.
    - **Logic**:
      - `FIXED`: Use `width`/`height` px values.
      - `HUG`: Use `width: fit-content; height: fit-content;`.
      - `FILL`: Use `width: 100%; height: 100%;` (or `flex: 1` depending on parent context, but `100%` is often the safe direct mapping in the legacy code).

2.  **Auto Layout Alignment**:

    - Update `getAutoLayoutStyles` to handle alignment.
    - **Map** `primaryAxisAlignItems` to `justify-content` (MIN->flex-start, MAX->flex-end, CENTER->center, SPACE_BETWEEN->space-between).
    - **Map** `counterAxisAlignItems` to `align-items` (MIN->flex-start, MAX->flex-end, CENTER->center).

3.  **Scrolling & Overflow**:

    - Implement `getOverflowStyles(node)` method.
    - If `overflowDirection` indicates scrolling, add `overflow-x: auto` / `overflow-y: auto`.

4.  **Min/Max Constraints**:
    - Implement `getMinMaxConstraintStyles(node)` to apply `min-width`, `max-width`, etc., if those properties exist on the node.

## Phase 4: Text & Fonts

**Goal**: Correctly render text styles and collect font usage.
**File**: `jay/packages/jay-stack/vendors/figma/adapter/lib/converter.ts`

1.  **Text Styling**:
    - Create `getTextStyles(node: InterchangeText): string` method.
    - Generate CSS for `font-family`, `font-size`, `font-weight`, `letter-spacing`, `line-height`, `text-align`, `color`.
    - **Critical**: Inside this method, add the `node.fontFamily` to `this.usedFontFamilies` set.

## Phase 5: Components & Variants

**Goal**: Support Jay Component imports and Figma Variants.
**File**: `jay/packages/jay-stack/vendors/figma/adapter/lib/converter.ts`

1.  **Jay Components**:

    - In `convertNode` (or specific `INSTANCE` case), check metadata (e.g., `node.jayData.componentImport`) to see if it's a Jay Component.
    - If yes:
      - Construct the `<script>` tag for import and add to `this.componentImports`.
      - Render the custom element tag (e.g., `<my-component ...></my-component>`).

2.  **Variants & Pseudo-states**:
    - Implement detection for variant sets (or check if `InterchangeNode` structure implies it).
    - Port `detectAutomaticPseudoVariants` logic if possible, or support `jayData.pseudoStyles`.
    - If pseudo-styles exist, generate a unique class name, add CSS rules to `this.syntheticTags` (or a CSS string builder), and apply the class to the element.

## Phase 6: Vectors & Optimization

**Goal**: Optimize vector rendering.
**File**: `jay/packages/jay-stack/vendors/figma/adapter/lib/converter.ts`

1.  **Composite SVG**:
    - Implement `shouldExportAsCompositeSvg(node)`: check if a Frame/Group contains _only_ vector children.
    - If true, instead of recursively converting children to HTML divs/imgs, render the whole subtree as a single `<svg>` element.
    - _Note_: This requires the input data to potentially provide the composite SVG string, or the converter to be able to merge vector paths. If the Interchange format doesn't support "composite SVG content" for Frames, this might require backend/plugin changes.
    - _Fallback_: If data isn't available, ensure individual vectors are rendered correctly (which seems to be the current state), but flag this optimization as pending data availability.

## Phase 7: Interactions

**Goal**: Support prototyping features.
**File**: `jay/packages/jay-stack/vendors/figma/adapter/lib/converter.ts`

1.  **Overlays/Popovers**:

    - In `convertNode`, check if a node is flagged as an overlay (e.g., via `jayData` or prototype links).
    - If it is an overlay, **do not** render it in the normal flow.
    - Instead, render it to a string and store in `this.overlayPopovers`.
    - In `generateFullDocument`, append all popover HTML strings at the end of the `<body>` (or inside the main wrapper).

2.  **Prototype Linking**:
    - Ensure `wrapWithLink` handles targets correctly.
    - If the link target is an overlay, ensure the `href` or `onclick` handler triggers the overlay (matching legacy behavior).

## Phase 8: Data Patterns & Recursion

**Goal**: Support recursive repeaters for tree-like data structures.
**File**: `jay/packages/jay-stack/vendors/figma/adapter/lib/converter.ts`

1.  **Recursive Repeater**:
    - Identify nodes marked as recursive repeaters (likely via `jayData.semanticTag` or specific hint in metadata).
    - Implement logic similar to `convertRecursiveRepeaterToHtml` from the legacy code:
      - Instead of just processing children, generate a self-referential structure (e.g., calling a template recursively).
      - If the new Jay runtime handles recursion differently (e.g. via components), ensure the converter outputs the correct component usage or template structure.

## Implementation Order

1.  **Phase 1** (Types) - Prerequisite for code changes.
2.  **Phase 2** (Architecture) - Sets up the skeleton for full document generation.
3.  **Phase 4** (Text) - Low hanging fruit, easy to implement once architecture is there.
4.  **Phase 3** (Layout) - Core visual fidelity.
5.  **Phase 7** (Interactions) - Depends on architecture (popovers).
6.  **Phase 5** (Components) - Advanced features.
7.  **Phase 8** (Data Patterns) - Complex logic.
8.  **Phase 6** (Vectors) - Optimization.
