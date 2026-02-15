# Layout Sizing Mismatch Report: wix-store-product-page Fixture

**Date:** 2025-02-15  
**Fixture:** `wix-store-product-page`  
**Files compared:** `actual-output.figma.json` (reverse converter) vs `expected.figma.json` (Figma export)

---

## Executive Summary

The mismatches stem from **information loss in the forward converter** (Figma→jay-html), not from the reverse converter. The forward converter's `getNodeSizeStyles` has a special case for SECTION children that always outputs `width: 100%` and `height: ${height}px`, discarding `layoutSizingHorizontal` (FIXED vs FILL) and `layoutSizingVertical` (HUG vs FIXED). The reverse converter correctly interprets the jay-html it receives.

---

## 1. layoutSizingHorizontal: FIXED vs FILL Mismatches

### Node 424:366 (Page frame)

| Property | expected.figma.json | actual-output.figma.json |
|----------|---------------------|---------------------------|
| layoutSizingHorizontal | **FIXED** | **FILL** |
| width | 1099 | (omitted – FILL derives from parent) |

### Input jay-html for 424:366

```html
<div data-figma-id="424:366" data-name="Page" data-figma-type="frame" 
     style="...width: 100%;height: 760.6785278320312px;...">
```

### Root Cause Analysis

1. **Forward converter (Figma→HTML)**  
   `getNodeSizeStyles` in `utils.ts` (lines 239–248):

   ```typescript
   if (parentType === 'SECTION') {
       const height = node.height !== undefined ? node.height : 0;
       return `width: 100%;height: ${height}px;`;
   }
   ```

   For direct children of SECTION, it always returns `width: 100%` and `height: ${height}px`, ignoring `layoutSizingHorizontal` and `layoutSizingVertical`. So FIXED with width 1099 is turned into `width: 100%`.

2. **Reverse converter (HTML→Figma)**  
   `stylesToFigmaProps` in `from-jay-html.ts` (lines 496–498):

   ```typescript
   if (widthStr === '100%') {
       props.layoutSizingHorizontal = 'FILL';
   }
   ```

   `width: 100%` is correctly mapped to FILL.

### Recommendation

**Fix the forward converter.** Update `getNodeSizeStyles` (and `getFrameSizeStyles` if used for SECTION children) so that SECTION children preserve layout sizing:

- `layoutSizingHorizontal === 'FIXED'` → `width: ${width}px`
- `layoutSizingHorizontal === 'FILL'` → `width: 100%`
- `layoutSizingHorizontal === 'HUG'` → `width: fit-content`

Same pattern for vertical sizing.

---

## 2. layoutSizingVertical: HUG vs FIXED Mismatches

### Node 424:366 (Page frame)

| Property | expected.figma.json | actual-output.figma.json |
|----------|---------------------|---------------------------|
| layoutSizingVertical | **HUG** | **FIXED** |
| height | 760.6785278320312 | 760.6785278320312 |

### Input jay-html for 424:366

```html
style="...height: 760.6785278320312px;..."
```

### Root Cause Analysis

1. **Forward converter**  
   The same SECTION special case in `getNodeSizeStyles` always outputs `height: ${height}px` (the computed height), regardless of `layoutSizingVertical`. HUG should map to `height: fit-content`, but that information is dropped.

2. **Reverse converter**  
   `stylesToFigmaProps` (lines 504–506, 535–536):

   - `height: fit-content` → `layoutSizingVertical = 'HUG'`
   - `height: 760.6785278320312px` → `props.height` is set, and the fallback sets `layoutSizingVertical = 'FIXED'`

   So the reverse converter correctly treats an explicit pixel height as FIXED.

### Recommendation

**Fix the forward converter.** For SECTION children, respect `layoutSizingVertical`:

- `layoutSizingVertical === 'HUG'` → `height: fit-content`
- `layoutSizingVertical === 'FIXED'` → `height: ${height}px`
- `layoutSizingVertical === 'FILL'` → `height: 100%`

---

## 3. textAutoResize: HEIGHT vs WIDTH_AND_HEIGHT

### Finding: No Mismatches in This Fixture

Both `expected.figma.json` and `actual-output.figma.json` use `textAutoResize: "WIDTH_AND_HEIGHT"` for all TEXT nodes. There are no nodes where expected has HEIGHT and actual has WIDTH_AND_HEIGHT.

### buildTextDefaults Behavior

In `from-jay-html.ts` (lines 1061–1084):

```typescript
function buildTextDefaults(textProps: FigmaTextProps): Record<string, unknown> {
    // ...
    defaults.textAutoResize = 'WIDTH_AND_HEIGHT';  // Always hardcoded
    return defaults;
}
```

`textAutoResize` is always set to `WIDTH_AND_HEIGHT` and never derived from CSS.

### Potential Future Improvement

For TEXT nodes with explicit pixel width and no explicit height (or `height: fit-content`), `textAutoResize` should be `HEIGHT` (fixed width, auto height). The reverse converter could infer this from:

- `width: Npx` (explicit pixel width)
- `height: fit-content` or no explicit height

### Recommendation

- **This fixture:** No change needed; expected and actual already match.
- **Future:** Extend `buildTextDefaults` (or `stylesToTextProps`) to set `textAutoResize: 'HEIGHT'` when width is explicit and height is fit-content/auto.

---

## Summary of Recommendations

| Category | Root Cause | Recommendation |
|----------|------------|----------------|
| layoutSizingHorizontal FIXED vs FILL | Forward converter SECTION special case always outputs `width: 100%` | Fix `getNodeSizeStyles` and `getFrameSizeStyles` in `utils.ts` to preserve layout sizing for SECTION children |
| layoutSizingVertical HUG vs FIXED | Forward converter SECTION special case always outputs `height: ${height}px` | Same fix as above |
| textAutoResize HEIGHT vs WIDTH_AND_HEIGHT | N/A for this fixture | No action; consider inferring HEIGHT when width is explicit and height is fit-content |

---

## Code Locations

| File | Function | Lines |
|------|----------|-------|
| `packages/jay-stack/stack-cli/lib/vendors/figma/utils.ts` | `getNodeSizeStyles` | 239–248 |
| `packages/jay-stack/stack-cli/lib/vendors/figma/utils.ts` | `getFrameSizeStyles` | 586–594 |
| `packages/jay-stack/stack-cli/lib/vendors/figma/converters/from-jay-html.ts` | `stylesToFigmaProps` | 493–536 |
| `packages/jay-stack/stack-cli/lib/vendors/figma/converters/from-jay-html.ts` | `buildTextDefaults` | 1061–1084 |
