# Design Log #93 - Figma Export Cleanup: Remove Unused Metadata from Serializer

**Related:** Design Log #90 (import conversion), #91 (comparison strategy), #91.1 (gaps inventory, node naming guidance)

## Background

The Figma plugin serializer (`jay-desktop-poc/pluginsCommon/lib/serialization/`) exports many properties from Figma nodes into the `FigmaVendorDocument` JSON. Several of these properties are pure Figma metadata that no downstream consumer reads. They bloat the serialized JSON, complicate test fixtures, and create noise in the roundtrip comparison.

Design Log #91.1 Category B research revealed which properties are actually consumed vs ignored.

## Problem

The serializer exports properties that nothing uses:

- **`absoluteRenderBounds`** — computed by Figma's layout engine. Not read by the forward converter (Figma JSON -> jay-html) or the deserializer (Figma JSON -> Figma nodes).
- **`isMask`** — always `false` in practice. Not read by forward converter or deserializer.
- **`parent*` properties** (`parentId`, `parentType`, `parentLayoutMode`, `parentOverflowDirection`, `parentChildIndex`, `parentNumberOfFixedChildren`) — used by the forward converter but NOT by the deserializer. The forward converter should derive these from the tree walk instead.

Additionally, the section fill serializer has an inconsistency: it raw-copies fill objects from the Figma API (including `blendMode`, `boundVariables`) while the frame serializer explicitly constructs clean fill objects.

A separate but related issue: the forward converter (Figma JSON → jay-html) does NOT emit `data-name` attributes, so node names are lost during roundtrip. Original Figma names like "Hero Section" or "Content" become generic "Frame" or "div" after reimport. Three naming cases are functionally required (see Design Log #91.1 for full analysis):

- **Section name** — displayed in the plugin UI
- **"Content" frame** — `contractUiGenerator.ts` does a hardcoded `child.name === "Content"` lookup
- **COMPONENT_SET/COMPONENT names** — variant property names are encoded in these (e.g., `"buttonVariant=primary, isDisabled=false"`)

## Consumer Map

| Property                      | Serializer          | Forward Converter           | Deserializer              | Action                     |
| ----------------------------- | ------------------- | --------------------------- | ------------------------- | -------------------------- |
| `absoluteRenderBounds`        | `sceneNode.ts:67`   | Not used                    | Not used                  | **Remove from serializer** |
| `isMask`                      | `sceneNode.ts:63`   | Not used                    | Not used                  | **Remove from serializer** |
| `parentId`                    | `sceneNode.ts:19`   | Not used                    | Not used                  | **Remove from serializer** |
| `parentType`                  | `sceneNode.ts:20`   | `utils.ts:56,227,571`       | Not used                  | **Refactor then remove**   |
| `parentLayoutMode`            | `sceneNode.ts:24`   | `utils.ts:51,61,67,110,127` | Not used                  | **Refactor then remove**   |
| `parentOverflowDirection`     | `sceneNode.ts:29`   | `utils.ts:38`               | Not used                  | **Refactor then remove**   |
| `parentChildIndex`            | `sceneNode.ts:34`   | `utils.ts:42`               | Not used                  | **Refactor then remove**   |
| `parentNumberOfFixedChildren` | `sceneNode.ts:36`   | `utils.ts:40`               | Not used                  | **Refactor then remove**   |
| `visible`                     | `sceneNode.ts:13`   | Not used                    | **YES** `deserializer.ts` | Keep                       |
| `locked`                      | `sceneNode.ts:14`   | Not used                    | **YES** `deserializer.ts` | Keep                       |
| `blendMode` (node)            | `sceneNode.ts:60`   | Not used                    | **YES** `deserializer.ts` | Keep                       |
| Section fill (raw copy)       | `sectionNode.ts:26` | Used                        | **YES**                   | **Fix consistency**        |

## Implementation Plan

### Phase 1: Remove unused properties + fix section fills (no dependencies)

**Repo: `jay-desktop-poc`** — serializer changes only.

1. Remove `absoluteRenderBounds` serialization from `serializeSceneNode()` (sceneNode.ts:67-68)
2. Remove `isMask` serialization from `serializeSceneNode()` (sceneNode.ts:62-64)
3. Remove `parentId` serialization from `serializeSceneNode()` (sceneNode.ts:19) — nothing reads it
4. Fix `serializeSectionNode()` to explicitly serialize fills (like `serializeFrameNode()` does), instead of raw-copying `node.fills`

### Phase 2: Refactor forward converter to derive parent context from tree walk

**Repo: `jay`** — forward converter changes.

The forward converter (`utils.ts`) reads `parentType`, `parentLayoutMode`, `parentOverflowDirection`, `parentChildIndex`, `parentNumberOfFixedChildren` from each node. Instead, the tree walk should pass this as context.

1. Add `ParentContext` type:

```typescript
interface ParentContext {
  type: string;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  overflowDirection?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'BOTH';
  numberOfFixedChildren?: number;
  childIndex?: number;
}
```

2. Extend existing `ConversionContext` with `parent?: ParentContext`

3. Update `utils.ts` functions (`getPositionType`, `getPositionStyle`, `getAutoLayoutChildSizeStyles`, `getNodeSizeStyles`, `getFrameSizeStyles`) to accept and prefer `ParentContext` parameter over `node.parent*`

4. Update all callers (`convertNodeToJayHtml`, `convertRegularNode`, `convertGroupNode`, `convertRepeaterNode`, `convertVariantNode`, `convertTextNodeToHtml`, `convertImageNodeToHtml`, `convertRectangleToHtml`, `convertEllipseToHtml`, `convertVectorToHtml`) to build and pass parent context when recursing

5. Verify forward conversion tests still pass

### Phase 3: Remove parent\* from serializer + type

**Repo: `jay-desktop-poc`** — after Phase 2 is deployed.

1. Remove `parentType`, `parentLayoutMode`, `parentOverflowDirection`, `parentChildIndex`, `parentNumberOfFixedChildren` from `serializeSceneNode()`
2. Remove `parent*` properties from `FigmaVendorDocument` type in `editor-protocol`
3. Update all test expected.figma.json fixtures to not include parent\* properties

### Phase 4: Node naming — emit `data-name` on functionally required nodes

**Repo: `jay`** — forward converter changes.

Per Design Log #91.1 analysis, implement Option A (minimal): only emit `data-name` where the name is functionally required.

1. SECTION elements: emit `data-name="${name}"` with the original Figma section name
2. Content frame (direct child of SECTION): emit `data-name="${node.name}"` — critical for `contractUiGenerator.ts` lookup
3. Variant container: emit `data-name="${componentSetName || node.name}"` — preserves component set name encoding variant properties
4. All other nodes: no `data-name` (cosmetic only, default naming on reimport is fine)

Note: `data-figma-id` is already emitted on all nodes. The reverse converter already handles the `data-name` fallback chain: `data-name` → `aria-label` → `data-figma-type` → tag name → default. No reverse converter changes needed.

## Trade-offs

- **Phase 1 is safe** — removes properties nothing reads, fixes a serialization inconsistency.
- **Phase 2 is a refactor** — changes function signatures across 10+ files. Must be done carefully with tests.
- **Phase 3 depends on Phase 2** — can't remove parent\* from serializer until forward converter doesn't read them.
- **Backward compatibility**: Existing serialized `.figma.json` files in the wild will still have these properties. That's fine — the forward converter and deserializer will just ignore them. The `[key: string]: any` on the type allows this.
- **Node naming is Option A (minimal)** — only 3 functional cases get `data-name`. All other node names are cosmetic and get defaults on reimport. Option B (emit `data-name` on every node) is possible later if roundtrip fidelity matters more.

## Implementation Results

All phases implemented in a single pass.

### Phase 1 — Serializer cleanup (jay-desktop-poc)

**Files changed:**

- `pluginsCommon/lib/serialization/serializers/sceneNode.ts` — Removed `absoluteRenderBounds`, `isMask`, `parentId`, and all remaining `parent*` properties
- `pluginsCommon/lib/serialization/serializers/sectionNode.ts` — Replaced raw `node.fills` copy with explicit fill serialization matching `frameNode.ts` pattern

### Phase 2 — Forward converter refactor (jay)

**Files changed:**

- `packages/jay-stack/stack-cli/lib/vendors/figma/types.ts` — Added `ParentContext` interface and `buildParentContext()` helper, extended `ConversionContext` with `parent?: ParentContext`
- `packages/jay-stack/stack-cli/lib/vendors/figma/utils.ts` — Updated `getPositionType`, `getPositionStyle`, `getAutoLayoutChildSizeStyles`, `getNodeSizeStyles`, `getFrameSizeStyles` to accept optional `parent?: ParentContext` and prefer it over `node.parent*` properties
- `packages/jay-stack/stack-cli/lib/vendors/figma/index.ts` — Updated `convertRegularNode`, `convertNodeToJayHtml`, `convertToBodyHtml` to build and pass parent context during tree walk
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/text.ts` — Added `parent?: ParentContext` parameter
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/image.ts` — Added `parent?: ParentContext` parameter
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/rectangle.ts` — Added `parent?: ParentContext` parameter
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/ellipse.ts` — Added `parent?: ParentContext` parameter
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/vector.ts` — Added `parent?: ParentContext` parameter
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/group.ts` — Added parent context building during child iteration
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/repeater.ts` — Added parent context building for template child
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/variants.ts` — Added parent context building for variant children

### Phase 3 — Type + test cleanup (jay)

**Files changed:**

- `packages/jay-stack/editor-protocol/lib/vendors/figma.ts` — Removed `parentId`, `parentLayoutMode`, `parentType`, `parentOverflowDirection`, `parentNumberOfFixedChildren`, `parentChildIndex` from explicit type (still accessible via `[key: string]: any`)
- Updated all 5 forward converter fixture JSON files to remove parent\*, absoluteRenderBounds, isMask
- Updated all 5 expected.jay-html files to include correct position styles from tree-walked parent context

### Phase 4 — Node naming (jay)

**Files changed:**

- `packages/jay-stack/stack-cli/lib/vendors/figma/index.ts` — SECTION elements now emit `data-name="${name}"`; content frame (direct child of SECTION) now emits `data-name="${node.name}"`
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/variants.ts` — Variant container div now emits `data-name="${componentSetName || node.name}"`
- Updated all 5 expected.jay-html fixtures to include `data-name` on content frames and variant containers

### Test Results

- Forward converter fixtures: **6/6 passing**
- Reverse converter (from-jay-html): **19/21 passing** (2 failures are pre-existing Category B gaps from wix-store-product-page)

### Behavioral Changes

The tree-walked parent context is MORE correct than the fixture-serialized parent data:

- Content frames (children of SECTION) now correctly get `position: absolute; width: 100%`
- Auto-layout children now correctly get `position: relative`
- Variant component children now correctly get positioning from the variant's actual layoutMode, not the parent COMPONENT_SET

Node names are now preserved for the 3 functional cases through the roundtrip:

- Section name → `data-name` on `<section>` → reverse converter reads `data-name` → `name` in figma.json
- Content frame → `data-name="Content"` → reverse converter preserves it → deserializer finds it by name
- Variant container → `data-name="Button"` (componentSetName) → reverse converter preserves variant structure

## Complete File Change Summary

### Repo: `jay-desktop-poc` (serializer)

| File                                                         | Change                                                                                                                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pluginsCommon/lib/serialization/serializers/sceneNode.ts`   | Removed `absoluteRenderBounds`, `isMask`, `parentId`, `parentType`, `parentLayoutMode`, `parentOverflowDirection`, `parentChildIndex`, `parentNumberOfFixedChildren` |
| `pluginsCommon/lib/serialization/serializers/sectionNode.ts` | Replaced raw `node.fills` copy with explicit fill serialization (matching `frameNode.ts`)                                                                            |

### Repo: `jay` (forward converter + types)

| File                                                                     | Change                                                                                                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/jay-stack/editor-protocol/lib/vendors/figma.ts`                | Removed `parentId`, `parentLayoutMode`, `parentType`, `parentOverflowDirection`, `parentNumberOfFixedChildren`, `parentChildIndex` from `FigmaVendorDocument` type |
| `packages/jay-stack/stack-cli/lib/vendors/figma/types.ts`                | Added `ParentContext` interface, `buildParentContext()` helper, extended `ConversionContext` with `parent?`                                                        |
| `packages/jay-stack/stack-cli/lib/vendors/figma/utils.ts`                | 5 functions accept optional `parent?: ParentContext`, prefer it over `node.parent*`                                                                                |
| `packages/jay-stack/stack-cli/lib/vendors/figma/index.ts`                | Build/pass parent context during tree walk; emit `data-name` on SECTION and content frame                                                                          |
| `packages/jay-stack/stack-cli/lib/vendors/figma/converters/text.ts`      | Added `parent?: ParentContext` parameter                                                                                                                           |
| `packages/jay-stack/stack-cli/lib/vendors/figma/converters/image.ts`     | Added `parent?: ParentContext` parameter                                                                                                                           |
| `packages/jay-stack/stack-cli/lib/vendors/figma/converters/rectangle.ts` | Added `parent?: ParentContext` parameter                                                                                                                           |
| `packages/jay-stack/stack-cli/lib/vendors/figma/converters/ellipse.ts`   | Added `parent?: ParentContext` parameter                                                                                                                           |
| `packages/jay-stack/stack-cli/lib/vendors/figma/converters/vector.ts`    | Added `parent?: ParentContext` parameter                                                                                                                           |
| `packages/jay-stack/stack-cli/lib/vendors/figma/converters/group.ts`     | Build parent context during child iteration                                                                                                                        |
| `packages/jay-stack/stack-cli/lib/vendors/figma/converters/repeater.ts`  | Build parent context for template child                                                                                                                            |
| `packages/jay-stack/stack-cli/lib/vendors/figma/converters/variants.ts`  | Build parent context for variant children; emit `data-name` on variant container                                                                                   |

### Test fixtures updated

| Fixture                | JSON cleaned                                   | Expected HTML updated        |
| ---------------------- | ---------------------------------------------- | ---------------------------- |
| `basic-text`           | (no parent\* to remove)                        | `data-name`, position styles |
| `button-with-variants` | Removed parent\*, absoluteRenderBounds, isMask | `data-name`, position styles |
| `complex-page`         | (no parent\* to remove)                        | `data-name`, position styles |
| `plugin-product-card`  | Removed parent\*, absoluteRenderBounds, isMask | `data-name`, position styles |
| `repeater-list`        | (no parent\* to remove)                        | `data-name`, position styles |
