# Deep Merge View States with Track-By

## Problem

Currently, in `dev-server.ts` line 117, we perform a shallow merge of slow and fast view states:

```typescript
viewState = { ...renderedSlowly.rendered, ...renderedFast.rendered };
```

This shallow merge has several issues:

1. **Nested objects are overwritten entirely** - If slow rendering produces `{ user: { name: "John", age: 30 } }` and fast rendering produces `{ user: { status: "online" } }`, the result is `{ user: { status: "online" } }` (age and name are lost).

2. **Arrays cannot be partially updated** - Arrays from fast phase completely replace arrays from slow phase, even when they represent the same items with different properties updated.

3. **Loss of type safety guarantees** - The phase-based type system (Design Log #50) ensures slow properties are set in slow phase and fast properties in fast phase, but shallow merge breaks this structure.

## Why This Matters

The rendering phase model (Design Logs #34, #50) splits ViewState properties across phases:

- **Slow phase**: Static data set at build time (e.g., product name, SKU, static images)
- **Fast phase**: Dynamic data set per request (e.g., pricing, inventory, user-specific data)

For deeply nested ViewState structures (common in real applications), we need to **combine** these partial ViewStates correctly, preserving properties from both phases.

### Example: Product Page

```typescript
// Slow render produces:
{
  name: "Widget",
  sku: "W-123",
  images: [
    { id: "1", url: "/img1.jpg", alt: "Front view" },
    { id: "2", url: "/img2.jpg", alt: "Side view" }
  ],
  discount: {
    type: "percentage"
  }
}

// Fast render produces:
{
  price: 29.99,
  inStock: true,
  images: [
    { id: "1", loading: false },
    { id: "2", loading: false }
  ],
  discount: {
    amount: 5
  }
}

// Desired merged result:
{
  name: "Widget",        // from slow
  sku: "W-123",          // from slow
  price: 29.99,          // from fast
  inStock: true,         // from fast
  images: [
    { id: "1", url: "/img1.jpg", alt: "Front view", loading: false },  // merged
    { id: "2", url: "/img2.jpg", alt: "Side view", loading: false }    // merged
  ],
  discount: {
    type: "percentage",  // from slow
    amount: 5            // from fast
  }
}
```

## Solution: Deep Merge with Track-By

### 1. Add `trackBy` to Jay Contract Repeated Sub-Contracts

Extend the `.jay-contract` format to require a `trackBy` attribute for repeated sub-contracts. This matches the same concept from jay-html's `forEach` directive (see `/docs/core/jay-html.md`).

**Contract Syntax:**

```yaml
name: ProductPage
tags:
  - tag: images
    type: repeated
    phase: slow
    trackBy: id  # NEW: Required for repeated sub-contracts
    tags:
      - tag: id
        type: data
        dataType: string
      - tag: url
        type: data
        dataType: string
        phase: slow
      - tag: alt
        type: data
        dataType: string
        phase: slow
      - tag: loading
        type: variant
        dataType: boolean
        phase: fast
```

**Key Points:**

- `trackBy` is **required** for all repeated sub-contracts
- The `trackBy` property must reference a `data` tag within the sub-contract
- The referenced property must be of type `string` or `number` (identity types)
- This metadata enables:
  1. **Array merging by object identity** (this design log)
  2. **Editor integration** - design tools can track which items are being modified (future)
  3. **Efficient DOM updates** - runtime uses trackBy for minimal re-renders (existing in forEach)

### 2. Deep Merge Algorithm

Implement a deep merge function in `dev-server.ts` that:

1. **For primitive values**: Fast value overwrites slow value (existing behavior)
2. **For objects**: Recursively merge properties from both slow and fast
3. **For arrays**: Merge by object identity using `trackBy` metadata

**Algorithm Pseudocode:**

```typescript
function deepMerge(
  slow: object,
  fast: object,
  contract: Contract // Contains trackBy metadata
): object {
  const result = {};
  
  // Merge all keys from both objects
  const allKeys = new Set([...Object.keys(slow), ...Object.keys(fast)]);
  
  for (const key of allKeys) {
    const slowValue = slow[key];
    const fastValue = fast[key];
    const contractTag = contract.getTag(key);
    
    if (fastValue === undefined) {
      // Only in slow
      result[key] = slowValue;
    } else if (slowValue === undefined) {
      // Only in fast
      result[key] = fastValue;
    } else if (contractTag.type === 'repeated') {
      // Array: merge by trackBy
      result[key] = mergeArraysByTrackBy(
        slowValue,
        fastValue,
        contractTag.trackBy,
        contractTag.subContract
      );
    } else if (typeof slowValue === 'object' && typeof fastValue === 'object') {
      // Nested object: recurse
      result[key] = deepMerge(slowValue, fastValue, contractTag.subContract);
    } else {
      // Primitive or conflicting types: fast wins
      result[key] = fastValue;
    }
  }
  
  return result;
}

function mergeArraysByTrackBy(
  slowArray: any[],
  fastArray: any[],
  trackBy: string,
  itemContract: Contract
): any[] {
  // Build index of slow items by trackBy key
  const slowByKey = new Map(
    slowArray.map(item => [item[trackBy], item])
  );
  
  // Build index of fast items by trackBy key
  const fastByKey = new Map(
    fastArray.map(item => [item[trackBy], item])
  );
  
  // Merge: Start with slow array order, merge matching fast items
  const result = slowArray.map(slowItem => {
    const key = slowItem[trackBy];
    const fastItem = fastByKey.get(key);
    
    if (fastItem) {
      // Item exists in both: deep merge
      return deepMerge(slowItem, fastItem, itemContract);
    } else {
      // Item only in slow
      return slowItem;
    }
  });
  
  // Add items that only exist in fast (should be rare based on phase semantics)
  for (const [key, fastItem] of fastByKey) {
    if (!slowByKey.has(key)) {
      result.push(fastItem);
    }
  }
  
  return result;
}
```

### 3. Implementation Location

**Primary Change:**

- `packages/jay-stack/dev-server/lib/dev-server.ts` (line 117)
  - Replace shallow merge with `deepMerge(renderedSlowly.rendered, renderedFast.rendered, pageContract)`

**Supporting Changes:**

- `packages/compiler/compiler-jay-html/lib/contract/contract.ts`
  - Add `trackBy?: string` to `RepeatedContractTag` type
  - Add validation: `trackBy` is required for repeated contracts

- `packages/compiler/compiler-jay-html/lib/contract/contract-parser.ts`
  - Parse `trackBy` attribute from YAML
  - Validate that `trackBy` references a valid data tag

- `packages/jay-stack/dev-server/lib/view-state-merger.ts` (new file)
  - Implement `deepMerge()` function
  - Implement `mergeArraysByTrackBy()` function
  - Export for use in dev-server

### 4. Future Benefits

Beyond solving the immediate merge problem, `trackBy` metadata enables:

1. **Editor Integration** (out of scope for this task)
   - Design tools can track item identity across design iterations
   - Enables fine-grained updates to array items without losing identity
   - Example: Reorder images in design tool without breaking developer's property overrides

2. **Optimized Runtime Updates**
   - Jay runtime already uses `trackBy` in `forEach` for efficient DOM updates
   - Contract-level `trackBy` ensures consistency across all tooling

3. **Type Safety**
   - Compiler can validate that merged ViewStates maintain type structure
   - Runtime can assert that trackBy keys are unique within arrays

## Validation Rules

When parsing contracts, validate:

1. ✅ `trackBy` is required for all `repeated` sub-contracts
2. ✅ `trackBy` must reference a tag within the sub-contract
3. ✅ Referenced tag must have `type: data`
4. ✅ Referenced tag's `dataType` must be `string` or `number`
5. ✅ Referenced tag must be in the `slow` phase (identity is static)

**Error Examples:**

```yaml
# ❌ Missing trackBy
- tag: items
  type: repeated
  tags:
    - tag: id
      type: data
      dataType: string
# Error: repeated sub-contract 'items' requires trackBy attribute

# ❌ trackBy references non-existent tag
- tag: items
  type: repeated
  trackBy: key  # 'key' doesn't exist
  tags:
    - tag: id
      type: data
      dataType: string
# Error: trackBy 'key' not found in sub-contract

# ❌ trackBy references variant tag
- tag: items
  type: repeated
  trackBy: selected
  tags:
    - tag: id
      type: data
      dataType: string
    - tag: selected
      type: variant
      dataType: boolean
# Error: trackBy must reference a data tag, not variant

# ✅ Valid trackBy
- tag: items
  type: repeated
  trackBy: id
  phase: slow
  tags:
    - tag: id
      type: data
      dataType: string
      phase: slow
    - tag: name
      type: data
      dataType: string
      phase: slow
    - tag: selected
      type: variant
      dataType: boolean
      phase: fast
```

## Edge Cases

### Array Length Differs Between Phases

**Scenario:** Slow phase defines 5 items, fast phase only returns 3 items.

**Behavior:** Merge all 5 items, using slow-only data for items missing in fast.

**Rationale:** Array structure is defined in slow phase. Fast phase may partially update items.

### TrackBy Key Missing in One Phase

**Scenario:** Item exists in slow but trackBy key is undefined.

**Behavior:** Warning in dev mode, skip merge for that item.

**Rationale:** Contract violation - trackBy property should always be defined.

### Duplicate TrackBy Keys

**Scenario:** Two items have the same trackBy value.

**Behavior:** Error during merge, fail fast.

**Rationale:** Identity violation - trackBy must be unique within array.

## Migration Path

### Existing Contracts Without TrackBy

Make `trackBy` optional initially with:

1. **Warning Mode**: Log warning if repeated contract lacks `trackBy`
2. **Fallback Behavior**: Use array index for merging (current shallow behavior)
3. **Timeline**: Make required in next major version

### Updating Contracts

For existing repeated contracts, identify identity property:

```yaml
# Before
- tag: todos
  type: repeated
  tags:
    - tag: id
      type: data
      dataType: string
    - tag: title
      type: data
      dataType: string

# After
- tag: todos
  type: repeated
  trackBy: id  # Add this
  tags:
    - tag: id
      type: data
      dataType: string
    - tag: title
      type: data
      dataType: string
```

## Testing Strategy

1. **Unit Tests for `deepMerge`**
   - Primitive values
   - Nested objects (2-3 levels deep)
   - Arrays with matching trackBy keys
   - Arrays with missing items
   - Mixed nested structures

2. **Integration Tests**
   - Dev server with sample page
   - Slow render → Fast render → Verify merged ViewState
   - Edge cases: empty arrays, null values, undefined properties

3. **Contract Validation Tests**
   - Missing trackBy
   - Invalid trackBy reference
   - Wrong trackBy type
   - Duplicate trackBy values (runtime)

## Summary

**Problem:** Shallow merge of slow/fast ViewStates loses nested properties.

**Solution:** 
1. Add `trackBy` attribute to repeated sub-contracts in jay-contract format
2. Implement deep merge algorithm that uses `trackBy` for array merging
3. Enable future editor integration with item identity tracking

**Benefits:**
- Correctly combines multi-phase ViewStates
- Maintains type structure across phases
- Enables editor tools to track item identity
- Consistent with existing `forEach trackBy` concept

**Next Steps:**
1. Update contract parser to support `trackBy` attribute
2. Add validation for `trackBy` requirements
3. Implement deep merge algorithm in dev-server
4. Add comprehensive tests
5. Document in jay-contract format guide

