# Relocate Deep Merge for Stack-Client-Runtime

## Context

Design Log #56 introduced `deepMergeViewStates` in `dev-server/lib/view-state-merger.ts` to merge slow and fast view states using `trackByMap` metadata from contracts. This works correctly on the server side.

## Problem

In `stack-client-runtime/lib/composite-component.ts` (lines 64-74), the render function uses **shallow merge**:

```typescript
render: () => {
    let viewState = defaultViewState;
    instances.forEach(([key, instance]) => {
        if (key)
            viewState[key] = {
                ...defaultViewState[key],            // shallow
                ...materializeViewState(instance.render()),  // shallow
            };
        else viewState = { ...viewState, ...instance.render() };
    });
    return viewState;
},
```

This has the same issue as before: nested objects and arrays are overwritten instead of merged.

## Proposed Solution

Move `deepMergeViewStates` to a shared location so both dev-server and stack-client-runtime can use it.

## Questions & Answers

### 1. Where should the merge algorithm live?

**Option A: json-patch library**
- Pros: Already handles JSON transformations
- Cons: json-patch is about RFC 6902 operations (diff/apply). This merge is semantically different - it's about combining two partial objects with identity-based array merging.

**Option B: New shared library (e.g., `packages/runtime/view-state-merge`)**
- Pros: Clear single responsibility, clean dependency
- Cons: Another package to maintain

**Option C: Move to `@jay-framework/component` or existing runtime package**
- Pros: No new package
- Cons: May not be the right conceptual fit

**✅ Answer:** Option B - new shared library. Clean separation of concerns.

### 2. How does trackByMap get to the client?

Currently `generateClientScript` passes `defaultViewState` and `fastCarryForward` to the client:

```typescript
const viewState = ${JSON.stringify(defaultViewState)};
const fastCarryForward = ${JSON.stringify(fastCarryForward)};
const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, ${compositeParts})
```

To use deep merge on the client, we'd need to also pass `trackByMap`. Is this acceptable?

**✅ Answer:** Yes, the client will also need the trackByMap.

### 3. Is trackByMap even needed on the client?

In dev-server, we merge slow + fast view states **before** sending to client. On the client, `composite-component.ts` merges `defaultViewState` (which is already the merged slow+fast) with `instance.render()` results.

**Question:** What is `instance.render()` returning? Is it the interactive component's state updates? If so, does it also need trackBy-aware merging, or is the shallow merge acceptable for interactive updates?

**✅ Answer:** Yes, `instance.render()` returns the interactive part of the view state, which can be partial nested objects. We need trackByMap for proper identification of nested objects in arrays.

### 4. Alternative: Generate merged view state with trackBy metadata embedded?

Instead of passing `trackByMap` separately, could the contract compiler embed trackBy info into the generated code for the client component? This would avoid runtime lookups.

**✅ Answer:** The `generate-client-script` in stack-server-runtime can embed the trackByMap for the client and pass it to `makeCompositeJayComponent`.

## Implementation Plan

1. **Create new library:** `packages/runtime/view-state-merge`
   - Move `deepMergeViewStates` and `mergeArraysByTrackBy` from `dev-server/lib/view-state-merger.ts`
   - Export as `@jay-framework/view-state-merge`

2. **Update dev-server:**
   - Import `deepMergeViewStates` from new library
   - Remove local implementation

3. **Update generate-client-script:**
   - Add `trackByMap` parameter
   - Embed in generated HTML: `const trackByMap = ${JSON.stringify(trackByMap)};`
   - Pass to `makeCompositeJayComponent`

4. **Update stack-client-runtime:**
   - Import `deepMergeViewStates` from new library
   - Modify `makeCompositeJayComponent` to accept `trackByMap` parameter
   - Replace shallow merge in render function with `deepMergeViewStates`

