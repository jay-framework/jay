# Design Log #118 — jay-html-compiler.ts Refactor

## Background

`jay-html-compiler.ts` is 4,813 lines containing 5 compilation targets (element, bridge, hydrate, server, sandbox) mixed together with shared utilities. The file is difficult to navigate and — more critically — contains duplicated algorithms across targets that drift out of sync when features are added.

## Problem

Two interrelated problems:

1. **File size**: 4,813 lines in a single file makes navigation and ownership difficult
2. **Cross-target duplication**: Similar algorithms are copy-pasted across targets with subtle inconsistencies already present (e.g., missing validation in server slowForEach, inconsistent null-safety in child filtering)

The duplication means adding a new directive or feature requires updating 3-4 places with no compiler enforcement that they stay consistent.

## Duplicated Patterns Identified

| Pattern                                              | Occurrences | Example inconsistency                                                                |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| Child node filtering (remove whitespace text)        | 14x         | Element uses `_.innerText.trim()`, hydrate/server use `(_.innerText \|\| '').trim()` |
| Accessor validation (parse → JayUnknown → isArray)   | 8x          | —                                                                                    |
| Attribute skip list                                  | 4x          | Server adds `data-jay-dynamic`, others don't                                         |
| forEach setup (validate + child vars + fragment)     | 4x          | —                                                                                    |
| Headless instance setup (find import, names, coords) | 3x          | —                                                                                    |
| Contract type replacement (2→5 param)                | 3x          | Definition file uses string match, others use regex                                  |
| renderNestedComponent                                | 2x          | Element has secureChildComp branch, bridge doesn't                                   |
| Headless coordinate extraction                       | 3x          | Nearly identical across element, hydrate, server                                     |
| Headless ref map building (collectContractRefs)      | 2x          | Identical in element and hydrate                                                     |

## Design

Extract shared algorithms into reusable helpers FIRST (small, safe steps), then split the file by target. Each step is independently testable — run `yarn test` in the package after each.

### Shared helpers to extract

All go into `jay-html-compiler-shared.ts`:

**a) `filterContentNodes(nodes)`** — replaces 14 occurrences of the child-filtering pattern. Uses the safe `(_.innerText || '').trim()` variant everywhere.

**b) `isDirectiveAttribute(attrCanonical)`** — replaces the 4 skip-list checks. Returns `true` for `if`, `forEach`, `trackBy`, `ref`, `slowForEach`, `jayIndex`, `jayTrackBy`, `jay-coordinate-base`, `data-jay-dynamic`, and the async directives. Each call site can pass an optional `extra` set for target-specific additions.

**c) `validateForEachAccessor(forEach, variables)`** — replaces the 4 forEach validation blocks. Returns `{ accessor, variables, fragment, error? }`.

**d) `validateSlowForEachAccessor(arrayName, variables)`** — replaces the 2 slowForEach validation blocks (and adds the missing validation to server target).

**e) `validateAsyncAccessor(property, variables)`** — replaces the 2 async validation blocks.

**f) `replaceContractType(renderedElement, baseName, jayFile)`** — replaces the 3 contract-type replacement blocks.

**g) `resolveHeadlessImport(contractName, headlessImports)`** — replaces the 3 "find import or return error" blocks.

**h) `generateHeadlessTypeNames(contractName, idx)`** — replaces the 3 blocks that compute pascal, componentSymbol, renderFnName, type names.

**i) `extractHeadlessCoordinate(element, contractName)`** — replaces the 3 blocks that read `jay-coordinate-base`, split segments, extract suffix.

**j) `buildContractRefMap(refsTree)`** — replaces the 2 identical `collectContractRefs` implementations.

## Implementation Plan

### Phase 1: Extract leaf helpers (no structural changes)

Each step: extract one helper, replace all call sites, run tests.

**Step 1: `filterContentNodes`**

- Create `jay-html-compiler-shared.ts` with this function
- Replace all 14 occurrences
- Fix inconsistency: use safe `(_.innerText || '').trim()` everywhere
- Validate: `yarn test`

**Step 2: `isDirectiveAttribute`**

- Add to shared module
- Replace 4 skip-list blocks
- Validate: `yarn test`

**Step 3: `validateForEachAccessor`**

- Add to shared module
- Replace 4 forEach validation blocks
- Validate: `yarn test`

**Step 4: `validateSlowForEachAccessor`**

- Add to shared module
- Replace 2 slowForEach validation blocks
- Validate: `yarn test`

**Step 5: `validateAsyncAccessor`**

- Add to shared module
- Replace 2 async validation blocks
- Validate: `yarn test`

**Step 6: `replaceContractType`**

- Add to shared module
- Replace 3 contract-type replacement blocks
- Validate: `yarn test`

**Step 7: Headless helpers (`resolveHeadlessImport`, `generateHeadlessTypeNames`, `extractHeadlessCoordinate`, `buildContractRefMap`)**

- Add all 4 to shared module
- Replace call sites in element, hydrate, server targets
- Validate: `yarn test`

### Phase 2: Extract phase helpers

**Step 8: `jay-html-compiler-phase.ts`**

- Move `buildInteractivePaths`, `textHasInteractiveBindings`, `extractConditionIdentifiers`, `conditionIsInteractive`, `simplifyConditionForHydrate`
- Update imports in main file
- Validate: `yarn test`

### Phase 3: Split by target

Each step: move one target's functions to its own file, update imports, keep public API in main file.

**Step 9: Extract server target → `jay-html-compiler-server.ts`**

- Move: `ServerContext`, `getCoordinateExpr`, `w`, `renderServerNode`, `renderServerElement`, `renderServerHeadlessInstance`, `renderServerElementContent`, `renderServerOpenTag`, `renderServerAttributes`, `renderServerNodeAsString`, `renderServerElementAsString`, `renderServerForEachAsString`, `renderServerAttributesAsString`, `collectAsyncGroups`, `renderServerAsyncGroup`, `hasDynamicAttributeBindings`, `hasInteractiveChildElements`, `hasMixedContentDynamicText`, `hasMixedContentDynamicTextInteractive`, `mergeServerFragments`, `voidElements`
- Keep `generateServerElementFile` in main file (thin orchestrator) or move with it
- Validate: `yarn test`

**Step 10: Extract hydrate target → `jay-html-compiler-hydrate.ts`**

- Move: `HydrateContext`, `mergeHydrateFragments`, `renderHydrateNode`, `buildRenderContext`, `renderHydrateElement`, `renderHydrateHeadlessInstance`, `renderHydrateElementContent`, `renderHydrate`
- Keep `generateElementHydrateFile` in main file or move with it
- Validate: `yarn test`

**Step 11: Extract bridge/sandbox target → `jay-html-compiler-bridge.ts`**

- Move: `renderElementBridgeNode`, `renderBridge`, `renderSandboxRoot`
- Keep `generateElementBridgeFile`, `generateSandboxRootFile` in main file or move with it
- Validate: `yarn test`

**Step 12: Extract element target → `jay-html-compiler-element.ts`**

- Move: `renderNode` (with nested functions), `renderFunctionImplementation`, `generatePhaseSpecificTypes`, `generateRecursiveFunctions`
- Keep `generateElementFile`, `generateElementDefinitionFile` in main file or move with it
- Validate: `yarn test`

**Step 13: Thin main file**

- `jay-html-compiler.ts` becomes a thin orchestrator: public API functions + re-exports
- All internal logic lives in the target-specific modules
- Validate: `yarn test`

### Phase 4: Full validation

**Step 14: Full project validation**

- `yarn confirm` from root (rebuild + type check + test + format)

## Verification Criteria

1. All existing tests pass without modification at every step
2. Public API unchanged — `index.ts` exports remain the same
3. No duplicated algorithm remains across target files — shared patterns live in shared module
4. Each target file is self-contained: one file per compilation target
5. `yarn confirm` passes at the end

## Trade-offs

- **More files**: 7 files instead of 1 — but each is 250-1300 lines and focused
- **Import overhead**: Target files import from shared module — but this is standard module organization
- **Shared helpers may over-abstract**: We keep helpers concrete (return the same types, use the same signatures) rather than introducing generic abstractions
- **Phase 1 helpers are the real win**: Even without the file split, extracting shared algorithms prevents cross-target drift

## Implementation Results

### What was done

**Phase 1 (Steps 1-7): Shared helper extraction** — all completed.

| Helper                        | Occurrences replaced | Notes                                                                                                                  |
| ----------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `filterContentNodes`          | 14                   | Fixed null-safety inconsistency (element target used `_.innerText.trim()`, now all use `(_.innerText \|\| '').trim()`) |
| `isDirectiveAttribute`        | 5                    | Accepts `...extra` for target-specific additions (e.g. `'data-jay-dynamic'` in server)                                 |
| `validateForEachAccessor`     | 5                    | (not 4 — `renderServerForEachAsString` had one too)                                                                    |
| `validateSlowForEachAccessor` | 3                    | Added missing validation to server target (was skipping JayUnknown/isArrayType checks)                                 |
| `validateAsyncAccessor`       | 2                    |                                                                                                                        |
| `expandContractType`          | 4                    | Unified definition file's string-match approach with the regex approach                                                |
| `resolveHeadlessImport`       | 3                    |                                                                                                                        |
| `extractHeadlessCoordinate`   | 2                    | (element target uses different coordinate logic, not extracted)                                                        |
| `buildContractRefMap`         | 2                    |                                                                                                                        |
| `generateHeadlessTypeNames`   | skipped              | The 3 targets diverge enough that a shared helper would be forced                                                      |

Also moved to shared: `textEscape`, `propertyMapping`, `PROPERTY`, `BOOLEAN_ATTRIBUTE`, `attributesRequiresQuotes`, `COORD_ATTR`.

**Phase 2 (Step 8): Phase helpers** — completed. Extracted to `jay-html-compiler-phase.ts`.

**Phase 3 (Steps 9-11): Target extraction** — completed for server, hydrate, and bridge.

| Target         | New file                       | Lines |
| -------------- | ------------------------------ | ----- |
| Server         | `jay-html-compiler-server.ts`  | 1,235 |
| Hydrate        | `jay-html-compiler-hydrate.ts` | 1,300 |
| Bridge/Sandbox | `jay-html-compiler-bridge.ts`  | 294   |

**Steps 12-13: Element target extraction** — skipped. `renderNode` uses deeply nested closures that capture outer function scope. Extracting it would require restructuring the function itself, not just moving code. The main file at 1,784 lines is manageable.

**Step 14: Full validation** — `yarn confirm` passes.

### Deviations from design

1. `generateServerElementFile` moved to the server file (not kept in main). `index.ts` imports directly from `jay-html-compiler-server.ts`.
2. `generateElementHydrateFile`, `generateElementBridgeFile`, `generateSandboxRootFile` kept in main file — they share `renderFunctionImplementation` and other helpers with `generateElementFile`.
3. `isValidationError` made generic (`<T>(result: T | RenderFragment)`) to work with all union return types.
4. Two `itemType` accesses needed explicit cast to `JayPromiseType` after validation (the helper returns `Accessor` which loses the type narrowing from `isPromiseType`).

### Final file structure

```
jay-html-compiler.ts          1,784 lines  Element target + shared renderers + public generators
jay-html-compiler-shared.ts     284 lines  Shared utilities (filtering, validation, constants)
jay-html-compiler-phase.ts       97 lines  Phase-aware helpers (interactive path detection)
jay-html-compiler-bridge.ts     294 lines  Bridge/sandbox compilation target
jay-html-compiler-hydrate.ts  1,300 lines  Hydrate compilation target
jay-html-compiler-server.ts   1,235 lines  Server compilation target
```

### Verification

- All 617 tests pass (23 test files, 4 skipped)
- Zero type errors in lib/ files
- `yarn confirm` passes (rebuild + type check + test + format)
- Public API unchanged — `index.ts` exports the same symbols
