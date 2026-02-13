# Design Log #92 - Converting Jay-HTML `if` Conditions to Figma Component Sets and Variants

## Background

Design Log #90 introduced `convertJayHtmlToFigmaDoc` — the reverse conversion from jay-html to
Figma vendor document. Currently, the converter treats every element with an `if` attribute as a
plain FRAME with the condition stored in `pluginData['if']`. It does not produce Figma component
sets, component variants, or instances.

In Figma, variant-driven UI is modeled as:
- **COMPONENT_SET**: A container that groups variant components
- **COMPONENT**: One variant — named `PropertyName=Value` (e.g., `Media Type=IMAGE`)
- **INSTANCE**: A usage of a component set, bound to a specific variant

The forward conversion (Figma → jay-html, in `converters/variants.ts`) already converts these
into `if` conditions:
```html
<div data-figma-type="variant-container" style="...">
  <div if="path.tag == VALUE_A"><!-- variant A content --></div>
  <div if="path.tag == VALUE_B"><!-- variant B content --></div>
</div>
```

The reverse converter must reconstruct COMPONENT_SET/COMPONENT/INSTANCE from `if` conditions.

## Problem

Given a jay-html file (which may or may not have originated from Figma), the converter must:

1. **Detect** which `if` conditions represent variant groups (vs. standalone conditional rendering)
2. **Group** related `if` siblings that check the same tag(s) on different values
3. **Produce** proper Figma COMPONENT_SET → COMPONENT → INSTANCE structure
4. **Derive** variant property metadata (`componentPropertyDefinitions`, `variantProperties`) from
   contract data and parsed `if` conditions

## Key Insight: Not All `if` Is a Variant

Jay-html uses `if` for multiple purposes. The converter must distinguish:

### Variant `if` — Groups of siblings checking the same tag on different values

```html
<!-- Enum variant: same tag, different values, sibling elements -->
<div if="inventory.availabilityStatus == IN_STOCK">In Stock</div>
<div if="inventory.availabilityStatus == OUT_OF_STOCK">Out of Stock</div>

<!-- Boolean variant: same tag, true/false, sibling elements -->
<span if="!isAddingToCart">Add to Cart</span>
<span if="isAddingToCart">Adding...</span>

<!-- Multi-property variant: compound conditions, same tag set -->
<div if="media.mediaType == IMAGE && selected == selected">...</div>
<div if="media.mediaType == IMAGE && selected == notSelected">...</div>
<div if="media.mediaType == VIDEO && selected == selected">...</div>
<div if="media.mediaType == VIDEO && selected == notSelected">...</div>
```

These should become COMPONENT_SET with COMPONENT children.

### Standalone `if` — NOT a variant

```html
<!-- Single condition, no sibling with the same tag -->
<span class="badge" if="hasRibbon">{ribbon.name}</span>

<!-- Compound condition mixing different tags -->
<div if="cartPage.isEmpty && !cartPage.isLoading">empty cart</div>
```

These stay as FRAME with `pluginData['if']` (current behavior).

## Questions and Answers

### Q1: How do we detect variant groups without `data-figma-type="variant-container"`?

Jay-html files created from scratch (e.g., `cart/page.jay-html`) have no `data-figma-type` marker.
We must detect variant patterns purely from the `if` conditions and contract data.

**Answer**: We do NOT rely on `data-figma-type`. Instead we analyze sibling elements under the same
parent and group them by the tags they check. If multiple siblings check the same tag with different
values (and the contract confirms `type: variant`), they form a variant group. The
`data-figma-type="variant-container"` attribute, when present, is an additional confirmation but not
required.

### Q2: How do we name variant properties?

In Figma, variant properties have human-readable names (e.g., "Media Type") derived from the
`property` field in `jay-layer-bindings`. On the reverse path, we don't have `jay-layer-bindings`.

**Answer**: Use the **tag name** from the jay-html / contract as the variant property name. For
example, `if="inventory.availabilityStatus == IN_STOCK"` → property name is `availabilityStatus`.
The tag name is always available from the parsed `if` condition. In testing, we compare structural
equivalence (same number of properties, same value sets) rather than exact property names, since
the forward path uses human-readable names that may differ from tag names.

### Q3: What Figma structure should the converter produce?

The Figma plugin deserializer (`deserializer.ts`) creates component sets by:
1. Creating each COMPONENT child
2. Calling `figma.combineAsVariants()` to produce a COMPONENT_SET
3. Creating an INSTANCE of the component set

**Answer**: The converter should produce a structure the deserializer can consume:
- A **COMPONENT_SET** node containing COMPONENT children (one per variant permutation)
- An **INSTANCE** node that references the COMPONENT_SET and has `componentPropertyDefinitions`
  and `variants` array (matching the serialization format from `instanceNode.ts`)

In practice, the serialized format used in `expected.figma.json` embeds the component set data
directly on the INSTANCE node (with `componentSetId`, `componentPropertyDefinitions`, and `variants`
array). The COMPONENT_SET itself also appears as a sibling node. The converter should match this
format.

### Q4: How do we determine variant values?

**Answer**: Two sources, used together:

1. **Parsed `if` conditions**: Extract the tag path and compared value from each `if` expression
   (e.g., `availabilityStatus == IN_STOCK` → tag=`availabilityStatus`, value=`IN_STOCK`).
   For booleans: `isSelected` → tag=`isSelected`, value=`true`; `!isSelected` → value=`false`.

2. **Contract data**: The contract defines the full value set via `dataType`. For example:
   ```yaml
   - tag: availabilityStatus
     type: variant
     dataType: enum (IN_STOCK | OUT_OF_STOCK | PARTIALLY_OUT_OF_STOCK)
   ```
   The contract may define values that don't appear in the jay-html `if` conditions (e.g.,
   `PARTIALLY_OUT_OF_STOCK` has no corresponding `if` in the category page). The converter should
   use the **union** of values from both sources — the `if` conditions provide the variants that
   have content, the contract provides the complete value space for `componentPropertyDefinitions`.

### Q5: How do we group related `if` siblings?

This is the core grouping challenge. Consider:

```html
<button if="quickAddType == SIMPLE">Add to Cart</button>
<div if="quickAddType == SINGLE_OPTION">quick options...</div>
<a if="quickAddType == NEEDS_CONFIGURATION">View Options</a>
```

These three elements are siblings, all checking `quickAddType` with different values.
They should be grouped into one variant group.

**Answer**: The grouping algorithm:

1. Walk children of each parent element
2. For each child with an `if` attribute, parse the condition to extract tag-value pairs
3. Group children that share the **same set of tag paths** (e.g., all checking `quickAddType`)
4. A group with 2+ members = a variant group
5. A lone `if` child whose tag has no other sibling checking the same tag = standalone conditional

For compound conditions (`tag1 == A && tag2 == B`), group by the full set of tag paths.
All siblings must check the **same tag set** to belong to the same group.

### Q6: Should the variant detection be a pre-pass, post-pass, or integrated?

**Answer (from discussion)**: The question is really pre-pass vs. post-pass vs. integrated with the
main conversion.

#### Approach A: Pre-pass (before DOM-to-Figma conversion)

Analyze the HTML DOM before converting. Identify variant groups, annotate them, then let the main
converter use these annotations to produce proper Figma structures.

**Pros**:
- The HTML DOM has richer context (tag names, attributes, parent-child relationships are explicit)
- Contract resolution is already done at this point (from `JayHtmlSourceFile`)
- Grouping sibling `if` elements is natural in the DOM
- Clean separation: variant detection is a distinct, testable step
- The main converter sees pre-analyzed groups and directly emits the right Figma structure

**Cons**:
- Requires passing variant analysis results to the converter (additional context parameter)
- Two-phase approach adds some structural complexity

#### Approach B: Post-pass (after DOM-to-Figma conversion)

Convert everything to flat FRAMEs first (current behavior), then scan the output for groups of
sibling FRAMEs with related `if` conditions in pluginData, and restructure them into
COMPONENT_SET/COMPONENT/INSTANCE.

**Pros**:
- Doesn't change the existing converter at all initially
- Incrementally addable

**Cons**:
- We'd be creating FRAME nodes just to tear them down and restructure into COMPONENT/INSTANCE
- The `if` conditions are now just strings in pluginData — we'd need to re-parse them
- Restructuring a tree after creation is messy (moving children, recomputing parent references)
- Loses HTML-level context that makes grouping easier (original DOM structure, attributes)
- Style computation done for FRAME nodes may not apply to COMPONENT_SET/COMPONENT

#### Approach C: Integrated (during DOM-to-Figma conversion)

Detect variant patterns during the main conversion walk. When processing children of a parent node,
group sibling `if` elements and emit COMPONENT_SET/COMPONENT/INSTANCE structures directly.

**Pros**:
- Single pass, clean output
- Natural place for the decision (while processing children, we see all siblings)
- Has access to both DOM context and contract data simultaneously

**Cons**:
- Makes the main converter more complex
- Harder to test variant detection in isolation
- Mixes analysis and conversion concerns

#### Recommendation: Approach A (Pre-pass) — analysis before conversion

The pre-pass approach separates variant detection from Figma conversion. The pre-pass doesn't
mutate the DOM — it produces a **variant analysis map** (keyed by parent element) that the converter
consults when processing children. This gives us:

- **Testable analysis**: We can unit-test variant detection independently
- **Clean converter**: The main converter checks the analysis map and branches to variant conversion
  when a group is found
- **DOM-level context**: The analysis runs on the original DOM where sibling relationships,
  `if` attributes, and contract data are all directly accessible
- **Why not post-pass**: After conversion to FigmaVendorDocument, we'd need to re-parse `if`
  strings from pluginData, re-discover sibling relationships, and restructure the tree — duplicating
  work that's trivial to do on the original DOM

## Data Flow

```
JayHtmlSourceFile (parsed jay-html + contracts)
  │
  ├─ Phase 1: Variant Analysis (pre-pass)
  │   ├─ Walk DOM, parse `if` conditions
  │   ├─ Resolve contract tags (type: variant, dataType)
  │   ├─ Group sibling `if` elements by shared tag paths
  │   └─ Output: VariantAnalysisMap (parent element → variant groups)
  │
  └─ Phase 2: DOM-to-Figma Conversion (existing, enhanced)
      ├─ Walk DOM elements, convert styles, text, images
      ├─ When processing children, check VariantAnalysisMap
      │   ├─ Variant group found → emit COMPONENT_SET + COMPONENTs + INSTANCE
      │   └─ No variant group → emit FRAME with pluginData['if'] (current behavior)
      └─ Output: FigmaVendorDocument
```

## Variant Group Detection Algorithm

```
for each parent element in DOM:
  collect all children that have an `if` attribute
  for each child with `if`:
    parse condition → extract list of (tagPath, value) pairs
    normalize: tag1 == VALUE → (tag1, VALUE)
               !boolTag      → (boolTag, false)
               boolTag       → (boolTag, true)
  group children by their set of tag paths
  for each group with 2+ members:
    verify at least one tag in the group has `type: variant` in the contract
    → this is a VariantGroup
  remaining ungrouped `if` children → standalone conditions (FRAME + pluginData)
```

### Contract validation

When a group of sibling `if` elements is found, the algorithm verifies against the contract:

- If the tag has `type: variant` → confirmed variant group
- If the tag has `type: variant` + `dataType: boolean` → boolean variant (true/false)
- If the tag has `type: variant` + `dataType: "enum (A | B | C)"` → enum variant with known values
- If the tag is NOT `type: variant` in the contract → still group them (the jay-html `if` pattern
  is the primary signal), but log a warning that the contract doesn't declare it as variant

This handles jay-html files written without a contract or with an incomplete contract.

## Examples

### Example 1: Enum variant (category page — stock status)

**Jay-HTML** (no `data-figma-type`):
```html
<div if="inventory.availabilityStatus == IN_STOCK">
  <span>In Stock</span>
</div>
<div if="inventory.availabilityStatus == OUT_OF_STOCK">
  <span>Out of Stock</span>
</div>
```

**Contract**:
```yaml
- tag: availabilityStatus
  type: variant
  dataType: enum (IN_STOCK | OUT_OF_STOCK | PARTIALLY_OUT_OF_STOCK)
```

**Expected Figma output**:
```json
{
  "type": "COMPONENT_SET",
  "name": "availabilityStatus",
  "children": [
    {
      "type": "COMPONENT",
      "name": "availabilityStatus=IN_STOCK",
      "variantProperties": { "availabilityStatus": "IN_STOCK" },
      "children": [{ "type": "TEXT", "characters": "In Stock" }]
    },
    {
      "type": "COMPONENT",
      "name": "availabilityStatus=OUT_OF_STOCK",
      "variantProperties": { "availabilityStatus": "OUT_OF_STOCK" },
      "children": [{ "type": "TEXT", "characters": "Out of Stock" }]
    }
  ]
},
{
  "type": "INSTANCE",
  "name": "availabilityStatus",
  "componentSetId": "<generated-id>",
  "componentPropertyDefinitions": {
    "availabilityStatus": {
      "type": "VARIANT",
      "variantOptions": ["IN_STOCK", "OUT_OF_STOCK", "PARTIALLY_OUT_OF_STOCK"],
      "defaultValue": "IN_STOCK"
    }
  },
  "variants": [/* same as COMPONENT_SET children */]
}
```

Note: `PARTIALLY_OUT_OF_STOCK` appears in `variantOptions` (from contract) but has no COMPONENT
(no corresponding `if` in the jay-html). The variant options list is the full value space.

### Example 2: Multi-value enum (category page — quickAddType)

**Jay-HTML**:
```html
<button if="quickAddType == SIMPLE">Add to Cart</button>
<div if="quickAddType == SINGLE_OPTION">quick options...</div>
<a if="quickAddType == NEEDS_CONFIGURATION">View Options</a>
```

These are siblings under the same parent. Despite being different element types (`button`, `div`,
`a`), they all check `quickAddType` → grouped as one variant.

**Contract**:
```yaml
- tag: quickAddType
  type: variant
  dataType: enum (SIMPLE | SINGLE_OPTION | NEEDS_CONFIGURATION)
```

### Example 3: Boolean variant (cart page — checkout button)

**Jay-HTML**:
```html
<span if="!cartPage.isCheckingOut">Proceed to Checkout</span>
<span if="cartPage.isCheckingOut">Processing...</span>
```

**Contract**:
```yaml
- tag: isCheckingOut
  type: variant
  dataType: boolean
```

Parsed conditions:
- `!cartPage.isCheckingOut` → tag=`isCheckingOut`, value=`false`
- `cartPage.isCheckingOut` → tag=`isCheckingOut`, value=`true`

Same tag, two values → variant group.

### Example 4: Multi-property variant (product page — media thumbnails)

**Jay-HTML**:
```html
<div if="media.mediaType == IMAGE && selected == selected">...</div>
<div if="media.mediaType == IMAGE && selected == notSelected">...</div>
<div if="media.mediaType == VIDEO && selected == selected">...</div>
<div if="media.mediaType == VIDEO && selected == notSelected">...</div>
```

Two tags: `media.mediaType` and `selected`. All four siblings check the same two tags.
→ One variant group with two properties: `mediaType` (IMAGE|VIDEO) and `selected`
(selected|notSelected). The COMPONENT_SET has 4 COMPONENTs (2×2 permutations).

### Example 5: Standalone `if` — NOT grouped

**Jay-HTML** (cart page):
```html
<span class="cart-item-variant" if="variantName">{variantName}</span>
<span class="cart-item-sku" if="sku">SKU: {sku}</span>
```

These check different tags (`variantName` and `sku`) and neither has a sibling checking the same
tag. → These remain standalone `if` conditions (FRAME with `pluginData['if']`).

## Testing Strategy

### Variant detection tests (unit)

Test the analysis pass independently:
- Input: DOM fragment + contract tags
- Output: VariantAnalysisMap (which elements form groups, property names, values)

### Comparison approach for roundtrip tests

Since the reverse converter uses tag names as property names (e.g., `availabilityStatus`) while
the original Figma export uses human-readable names (e.g., "Availability Status"), the test should
compare:

1. **Number of variant properties** on each component set matches
2. **Value sets** match (e.g., `["IN_STOCK", "OUT_OF_STOCK"]`)
3. **Number of COMPONENT children** matches the number of `if` siblings
4. **Structural content** of each variant COMPONENT matches the `if` branch content
5. **Property name comparison** is relaxed — tag name vs. human-readable name are both acceptable

## Open Questions

1. **Nested `if` inside variant**: What if a variant COMPONENT itself contains more `if` conditions?
   e.g., `quickAddType == SIMPLE` contains `if="!isAddingToCart"` / `if="isAddingToCart"`. Should
   these be nested component sets? The forward conversion does produce nested variants in Figma.

2. **`if` with `data-figma-type="variant-container"` parent**: When the parent wrapper div already
   has `data-figma-type="variant-container"`, the parent itself should become the INSTANCE (it has
   the styles/positioning). Should the analysis treat this as a hint to skip grouping detection and
   directly use all `if` children as the variant group?

3. **Variants inside repeaters**: When `if` elements are inside a `forEach` block, the tag paths
   are relative to the repeater context. How does this affect contract resolution? (The forward
   conversion already handles this — the repeater context determines which contract scope to use.)

4. **Empty variants**: If the contract defines values that have no `if` in the jay-html (e.g.,
   `PARTIALLY_OUT_OF_STOCK`), should we create empty COMPONENT nodes for them, or only create
   COMPONENTs for values that have actual content?

## Related Design Logs

- **Design Log #90**: Jay-HTML to vendor doc conversion on import (parent feature)
- **Design Log #91**: Figma property comparison strategy for roundtrip testing
