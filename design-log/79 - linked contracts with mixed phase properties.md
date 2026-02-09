# Design Log 79: Linked Contracts with Mixed Phase Properties

## Background

Jay contracts support **linked sub-contracts** via the `link` property, allowing contracts to reference reusable component contracts. For example:

```yaml
# category-page.jay-contract
- tag: products
  type: sub-contract
  repeated: true
  trackBy: _id
  link: ./product-card # Links to product-card.jay-contract
```

Jay also supports **rendering phases** (Design Log #50):

- `slow`: Build-time rendering
- `fast`: Request-time SSR
- `fast+interactive`: Client-side mutable

Design Log #50 establishes that **slow arrays can have fast/interactive child properties**:

> "Array's child properties can have **later phases** than the array itself"

## Problem Statement

When a slow array links to a contract that has fast/interactive properties, those properties are not properly handled:

### Example

```yaml
# category-page.jay-contract
- tag: products
  type: sub-contract
  repeated: true
  trackBy: _id
  link: ./product-card # No explicit phase = defaults to 'slow'

# product-card.jay-contract
- tag: name
  type: data
  dataType: string
  # phase: slow (default)

- tag: isAddingToCart
  type: variant
  dataType: boolean
  phase: fast+interactive # Fast/interactive property!
```

### Current Behavior (Broken)

1. **Type Generation**: `CategoryPageFastViewState` does NOT include `products`

   ```typescript
   // Generated - WRONG
   export type CategoryPageFastViewState = Pick<..., 'loadedProducts' | 'hasMore' | ...>;
   // Missing: products array with isAddingToCart
   ```

2. **Slow Render**: Array is unrolled correctly, but expressions like `{isAddingToCart ? is-adding}` reference undefined values at runtime

3. **Runtime Error**: `vs1.isAddingToCart` is undefined because the fast ViewState doesn't include the products array

### Expected Behavior (Per Design Log #50)

> "Array appears in phase where it's set AND all later phases"

So `products` should appear in:

- `SlowViewState`: with slow properties (`name`, `thumbnail.url`, etc.)
- `FastViewState`: with slow + fast properties (including `isAddingToCart`)
- `InteractiveViewState`: with all properties

## Root Cause Analysis

Two components don't follow linked contracts:

### 1. Phase Type Generator (`phase-type-generator.ts`)

```typescript
// extractPropertyPathsAndArrays only checks tag.tags
if (tag.type.includes(ContractTagType.subContract) && tag.tags) {
  // Processes inline nested tags
  // Does NOT handle tag.link!
}
```

### 2. Slow Render Transform (`slow-render-transform.ts`)

We just fixed this in the previous session - `buildPhaseMap` now follows `tag.link` via the import resolver. But the type generation still has the same gap.

## Questions

1. **Q: Should we resolve linked contracts at contract parse time or at usage time?**

   A: Usage time (lazy resolution) is better because:

   - Contracts may be used in different contexts
   - Avoids circular dependency issues
   - Consistent with how we just fixed slow render

2. **Q: How do we handle the runtime ViewState for slow arrays with fast properties?**

   A: The fast phase needs to provide the array with fast properties for each item. The runtime `slowForEachItem` already supports this - it gets the item from the array and uses it for bindings. The issue is the fast render function isn't being typed/validated to return the array.

3. **Q: What about the component's fast render function - does it need to return the full array?**

   A: Yes, if a slow array has fast properties, the fast render must return that array with the fast properties populated. The slow properties can be omitted (they're already rendered).

## Design

### Phase 1: Fix Type Generation

Modify `extractPropertyPathsAndArrays` in `phase-type-generator.ts` to resolve linked contracts:

```typescript
function extractPropertyPathsAndArrays(
  tags: ContractTag[],
  targetPhase: RenderingPhase,
  parentPath: string[] = [],
  parentPhase?: RenderingPhase,
  parentTrackBy?: string,
  importResolver?: JayImportResolver, // NEW
  contractDir?: string, // NEW
): { paths: PropertyPath[]; arrays: ArrayInfo[]; asyncProps: AsyncInfo[] } {
  // ...

  if (tag.type.includes(ContractTagType.subContract)) {
    let childTags: ContractTag[] = [];
    let childContractDir = contractDir;

    if (tag.tags) {
      // Inline nested tags
      childTags = tag.tags;
    } else if (tag.link && importResolver && contractDir) {
      // Linked contract - resolve and use its tags
      const linkedContract = loadLinkedContract(tag.link, contractDir, importResolver);
      if (linkedContract) {
        childTags = linkedContract.tags;
        childContractDir = getLinkedContractDir(tag.link, contractDir, importResolver);
      }
    }

    if (childTags.length > 0) {
      const result = extractPropertyPathsAndArrays(
        childTags,
        targetPhase,
        currentPath,
        effectivePhase,
        trackByForChildren,
        importResolver,
        childContractDir,
      );
      // ... rest of logic
    }
  }
}
```

### Phase 2: Update Contract Compiler Integration

Pass the import resolver to the phase type generator:

```typescript
// In contract-compiler.ts
const phaseTypes = generateAllPhaseViewStateTypes(
  contract,
  baseTypeName,
  importResolver, // NEW
  contractPath, // NEW
);
```

### Phase 3: Update Generated Types

After the fix, the generated types should be:

```typescript
export type CategoryPageSlowViewState = Pick<CategoryPageViewState, 'products' | ...> & {
    products: Array<Pick<CategoryPageViewState['products'][number], 'name' | 'thumbnail' | ...>>;
};

export type CategoryPageFastViewState = Pick<CategoryPageViewState, 'products' | 'loadedProducts' | ...> & {
    products: Array<Pick<CategoryPageViewState['products'][number], 'isAddingToCart'>>;
};

export type CategoryPageInteractiveViewState = Pick<CategoryPageViewState, 'products' | ...> & {
    products: Array<Pick<CategoryPageViewState['products'][number], 'isAddingToCart'>>;
};
```

## Implementation Plan

### Phase 1: Refactor Linked Contract Loading

- [ ] Extract `loadLinkedContract` helper to a shared location (currently in slow-render-transform.ts)
- [ ] Create `contract/linked-contract-resolver.ts` with shared logic

### Phase 2: Update Phase Type Generator

- [ ] Add `importResolver` and `contractDir` parameters to `extractPropertyPathsAndArrays`
- [ ] Handle `tag.link` by loading linked contract and processing its tags
- [ ] Update `generatePhaseViewStateType` to pass resolver
- [ ] Update `generateAllPhaseViewStateTypes` to pass resolver

### Phase 3: Update Contract Compiler

- [ ] Pass import resolver to phase type generation
- [ ] Pass contract path for resolving relative links

### Phase 4: Testing

- [ ] Add test for linked contract with mixed phases
- [ ] Verify generated types include slow arrays in fast ViewState when they have fast properties
- [ ] Test runtime behavior with whisky-store example

## Examples

### Before (Broken)

```typescript
// category-page.jay-contract.d.ts
export type CategoryPageFastViewState = Pick<
  CategoryPageViewState,
  'loadedProducts' | 'hasMore' | 'loadedCount' | 'isLoading' | 'hasProducts'
>;
// Missing: products!
```

### After (Fixed)

```typescript
// category-page.jay-contract.d.ts
export type CategoryPageFastViewState = Pick<
  CategoryPageViewState,
  'loadedProducts' | 'hasMore' | 'loadedCount' | 'isLoading' | 'hasProducts'
> & {
  products: Array<Pick<CategoryPageViewState['products'][number], 'isAddingToCart'>>;
};
```

## Trade-offs

### Approach A: Resolve at Parse Time (Not Recommended)

- **Pro**: Simpler type generator logic
- **Con**: Increases contract parse complexity
- **Con**: Potential circular dependency issues
- **Con**: Inconsistent with slow render approach

### Approach B: Resolve at Generation Time (Recommended)

- **Pro**: Consistent with slow render fix
- **Pro**: Lazy resolution avoids circular issues
- **Pro**: Import resolver already exists
- **Con**: Need to pass resolver through call chain

## Verification Criteria

1. **Type Generation**: `CategoryPageFastViewState` includes `products` with `isAddingToCart`
2. **Compile-time**: TypeScript error if fast render doesn't return products array
3. **Runtime**: `{isAddingToCart ? is-adding}` resolves correctly in slow-rendered arrays
4. **Test**: All existing tests pass + new test for linked contracts with mixed phases

## Related Design Logs

- **Design Log #50**: Rendering Phases in Contracts - establishes phase rules for arrays
- **Design Log #75**: Slow Rendering - documents slow render transformation
- **Design Log #78**: Unified Condition Parsing - documents expression evaluation during slow render

---

## Implementation Results

### Completed: 2026-01-28

All implementation phases completed successfully.

### Changes Made

1. **Created `linked-contract-resolver.ts`** (`lib/contract/linked-contract-resolver.ts`)

   - Extracted `loadLinkedContract` and `getLinkedContractDir` to shared location
   - Reused by both slow-render-transform and phase-type-generator

2. **Updated `phase-type-generator.ts`**

   - Added `LinkedContractContext` interface
   - Updated `extractPropertyPathsAndArrays` to accept and use import resolver
   - Handle `tag.link` by loading linked contract and processing its tags
   - Special case for recursive links (`$/`) - include property without recursing
   - Updated `generatePhaseViewStateType` and `generateAllPhaseViewStateTypes` to pass resolver

3. **Updated `contract-compiler.ts`**

   - Pass `jayImportResolver` and `contractFilePath` to `generateAllPhaseViewStateTypes`

4. **Updated `slow-render-transform.ts`**

   - Refactored to use shared `loadLinkedContract` and `getLinkedContractDir`

5. **Updated test fixtures**
   - `named-counter.jay-contract.d.ts`: Updated to reflect explicit Pick for linked contract properties
   - `repeated-with-link.jay-contract.d.ts`: Updated to show expanded linked contract properties
   - `contract-compiler.test.ts`: Updated 3 test expectations for linked sub-contracts

### Verified Output

After fix, `CategoryPageFastViewState` correctly includes `products` with fast+interactive properties:

```typescript
export type CategoryPageFastViewState = Pick<
  CategoryPageViewState,
  'hasMore' | 'loadedCount' | 'isLoading' | 'hasProducts'
> & {
  products: Array<
    Pick<CategoryPageViewState['products'][number], '_id' | 'isAddingToCart'> & {
      quickOption: {
        choices: Array<
          Pick<
            CategoryPageViewState['products'][number]['quickOption']['choices'][number],
            'choiceId' | 'inStock' | 'isSelected'
          >
        >;
      };
    }
  >;
  loadedProducts: Array<
    Pick<CategoryPageViewState['loadedProducts'][number], '_id' | 'isAddingToCart'> & {
      quickOption: {
        choices: Array<
          Pick<
            CategoryPageViewState['loadedProducts'][number]['quickOption']['choices'][number],
            'choiceId' | 'inStock' | 'isSelected'
          >
        >;
      };
    }
  >;
};
```

### Test Results

All 471 tests pass (4 skipped) in compiler-jay-html package.

### Deviations from Design

1. **Context object instead of separate parameters**: Used `LinkedContractContext` interface to bundle `importResolver` and `contractDir` for cleaner function signatures.

2. **Recursive link handling**: Added explicit handling for `$/` recursive references - these are included in phase ViewStates based on parent phase but not recursively processed (they reference the same type).
