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

---

## Issue: TrackBy Identity Fields Must Be Present in Both Phases

### The Problem

**Critical Issue Discovered During Implementation:**

The `trackBy` field (e.g., `id`) must be present in **both** slow and fast view states for the merge algorithm to work. However, our current phase system only allows a tag to belong to **one** phase:

- `phase: slow` → Only in `SlowViewState`
- `phase: fast` → Only in `FastViewState`
- `phase: fast+interactive` → In both `FastViewState` and `InteractiveViewState`

**Why This is a Problem:**

The merge algorithm needs to build maps of items by their identity:

```typescript
// In mergeArraysByTrackBy:
const slowByKey = new Map(
  slowArray.map(item => [item[trackBy], item])  // ❌ Needs item[trackBy]
);

const fastByKey = new Map(
  fastArray.map(item => [item[trackBy], item])  // ❌ Needs item[trackBy]
);
```

If `id` has `phase: slow`, it won't be in `FastViewState`, so `fastArray` items won't have the `id` field. If `id` has `phase: fast`, it won't be in `SlowViewState`, so `slowArray` items won't have the `id` field.

**Example of the Problem:**

```yaml
- tag: images
  type: repeated
  trackBy: id
  phase: slow
  tags:
    - tag: id
      type: data
      dataType: string
      phase: slow  # ❌ Only in slow phase!
    - tag: url
      type: data
      dataType: string
      phase: slow
    - tag: loading
      type: variant
      dataType: boolean
      phase: fast
```

Generated types:
```typescript
SlowViewState = {
  images: Array<{ id: string, url: string }>  // ✅ Has id
}

FastViewState = {
  images: Array<{ loading: boolean }>  // ❌ No id field!
}
```

When merging, we can't match items because `fastArray` items don't have `id`.

### Proposed Solutions

#### Option 1: Implicit Requirement (Simple, Immediate Fix)

**Approach:** Mandate that `trackBy` fields are automatically included in **all phases** where the array appears.

**Contract Syntax (Unchanged):**
```yaml
- tag: images
  type: repeated
  trackBy: id
  phase: slow
  tags:
    - tag: id
      type: data
      dataType: string
      phase: slow  # Declared phase, but actually in all phases
    - tag: url
      type: data
      dataType: string
      phase: slow
    - tag: loading
      type: variant
      dataType: boolean
      phase: fast
```

**Generated Types:**
```typescript
// Slow phase: id explicitly included
SlowViewState = {
  images: Array<{ id: string, url: string }>
}

// Fast phase: id implicitly added because it's the trackBy field
FastViewState = {
  images: Array<{ id: string, loading: boolean }>
}

// Interactive phase: id implicitly added
InteractiveViewState = {
  images: Array<{ id: string, loading: boolean }>
}
```

**Implementation:**
- In type generator, when processing a repeated sub-contract with `trackBy`
- Always include the `trackBy` field in all phase ViewStates for that array
- Validation: The `trackBy` field should have `phase: slow` (or default) to indicate it's the canonical identity

**Pros:**
- Simple to implement
- No contract syntax changes
- Clear semantic: identity fields are always present
- Minimal impact on existing code

**Cons:**
- Implicit behavior (not visible in contract)
- The declared phase on the `trackBy` field is somewhat misleading
- Developers might be confused why `id` appears in fast phase when marked as slow

#### Option 2: Explicit Multi-Phase Marker

**Approach:** Add explicit syntax to mark tags as belonging to multiple phases.

**Option 2a: `allPhases` attribute:**
```yaml
- tag: images
  type: repeated
  trackBy: id
  phase: slow
  tags:
    - tag: id
      type: data
      dataType: string
      allPhases: true  # NEW: Explicitly in all phases
    - tag: url
      type: data
      dataType: string
      phase: slow
    - tag: loading
      type: variant
      dataType: boolean
      phase: fast
```

**Option 2b: Multiple phases syntax:**
```yaml
- tag: images
  type: repeated
  trackBy: id
  phase: slow
  tags:
    - tag: id
      type: data
      dataType: string
      phase: [slow, fast, fast+interactive]  # NEW: Array of phases
    - tag: url
      type: data
      dataType: string
      phase: slow
    - tag: loading
      type: variant
      dataType: boolean
      phase: fast
```

**Option 2c: Special `identity` phase:**
```yaml
- tag: images
  type: repeated
  trackBy: id
  phase: slow
  tags:
    - tag: id
      type: data
      dataType: string
      phase: identity  # NEW: Special phase meaning "all phases"
    - tag: url
      type: data
      dataType: string
      phase: slow
    - tag: loading
      type: variant
      dataType: boolean
      phase: fast
```

**Pros:**
- Explicit and clear
- Self-documenting contract
- No surprising implicit behavior

**Cons:**
- More verbose
- Requires contract syntax extension
- More complex validation rules

#### Option 3: Identity Tag Attribute (Inferred TrackBy)

**Approach:** Instead of `trackBy` on the repeated contract, mark the identity tag itself and infer which field is the trackBy.

**Contract Syntax:**
```yaml
- tag: images
  type: repeated
  phase: slow
  tags:
    - tag: id
      type: data
      dataType: string
      identity: true  # NEW: This is the identity field
    - tag: url
      type: data
      dataType: string
      phase: slow
    - tag: loading
      type: variant
      dataType: boolean
      phase: fast
```

**Implementation:**
- No `trackBy` on repeated contract
- System looks for `identity: true` within the sub-contract tags
- Validation: Exactly one tag must have `identity: true` in a repeated sub-contract
- Identity fields are automatically in all phases

**Pros:**
- Single source of truth (the tag itself declares it's an identity)
- Semantic meaning is clear
- No redundancy (`trackBy: id` + tag named `id`)

**Cons:**
- Breaking change from current implementation
- Validation is more complex (must find the identity tag)
- Less explicit at the repeated contract level

### Recommended Approach

**Recommendation: Option 1 (Implicit Requirement)**

**Rationale:**

1. **Minimal Breaking Changes**: Works with current syntax, just changes type generation behavior
2. **Clear Semantics**: Identity fields being in all phases makes semantic sense - you always need the identity to reference an item
3. **Simple Implementation**: Small change to type generator, no parser changes needed
4. **Consistent with forEach**: In jay-html runtime, `trackBy` is always available regardless of phase
5. **Practical**: Solves the immediate problem without complex new syntax

**Implementation Details:**

1. **Type Generator Change** (`phase-type-generator.ts`):
   - When generating phase-specific ViewStates for a repeated sub-contract
   - Always include the `trackBy` field regardless of its declared phase
   - This ensures both `SlowViewState` and `FastViewState` include the identity field

2. **Validation Rule** (add to existing validation):
   - The `trackBy` field should be a `data` tag (already validated)
   - The `trackBy` field should have `phase: slow` or no phase (defaults to slow)
   - Rationale: Identity is conceptually slow-changing data

3. **Documentation**:
   - Clearly document that `trackBy` fields are implicitly included in all phases
   - Explain why: identity is needed for merging across phases

**Alternative Consideration for Future:**

If implicit behavior proves confusing, we can later add Option 2c (`phase: identity`) as syntactic sugar that makes the behavior explicit, while still maintaining backward compatibility with Option 1.

### Action Items

1. ✅ Add note to existing validation rules that trackBy fields are in all phases (implicit)
2. ⏳ Update type generator to include trackBy fields in all phase ViewStates
3. ⏳ Add test cases verifying trackBy field appears in all phases
4. ⏳ Document the implicit behavior in contract format guide
5. ⏳ Add warning if trackBy field has `phase: fast` (should be slow)

