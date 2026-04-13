# Design Log #124 — Contract Props and Params Consistency

## Background

Contracts are the source of truth for the shape of a component. When a component accepts props (e.g., `productId`) or params (e.g., `slug`), these must be declared in the `.jay-contract` file. Without this, the agent-kit and validate tools cannot verify correctness, and AI agents generating pages may omit or mismatch props/params.

Related design logs: #38 (Contract File), #84 (headless props), #113 (explicit route params).

## Problem

Components in consumer projects (e.g., the Wix mono repo) have contracts that are missing `props` and `params` declarations, even though the component implementation requires them. The agent-kit template already documents how to read and declare props/params in contracts, so the gap is in validation — nothing enforces consistency.

### Concrete example: wix-stores-v1

```typescript
// lib/components/product-page.ts
export interface ProductPageParams extends UrlParams { slug: string; }

export const productPage = makeJayStackComponent<ProductPageContract>()
    .withProps<PageProps>()
    .withLoadParams(loadProductParams)  // yields ProductPageParams[]
    ...
```

```yaml
# product-page.jay-contract — NO params section!
name: product-page
tags:
  - { tag: productName, type: data, ... }
```

The component uses `.withLoadParams()` with `{ slug: string }`, but the contract has no `params`. The agent-kit doesn't know about `slug`, so AI-generated pages may not provide it.

### Gap: Validate commands don't check component-contract consistency for props/params

- `jay-stack validate` checks contract→route (does the route provide what contracts need), but not route→contract (are route params declared in some contract)
- `jay-stack validate-plugin` validates almost nothing about the component
- Neither checks that `.withProps<>()` / `.withLoadParams<>()` usage matches contract declarations

**Files**:

- `packages/jay-stack/stack-cli/lib/validate.ts`
- `packages/jay-stack/plugin-validator/lib/validate-plugin.ts`

## Questions

1. **Q: What level of validation is feasible?**

   **A:** Static checks at two levels: (a) jay-html attributes vs contract props, and (b) single-file AST analysis of component source to detect `.withProps<>()` / `.withLoadParams<>()` usage. The AST approach is proven by existing analyzers like `source-file-binding-resolver.ts`.

2. **Q: Should validate-plugin check that the contract's props match the component's TypeScript signature?**

   **A:** Yes — single-file AST check using `typescript-bridge`. This is the most important check (Phase 3). Detect builder method calls and extract type parameters to compare against contract.

3. **Q: Are there cases where a component has props but intentionally omits them from the contract?**

   **A:** No. Props must be in the contract. The `props="{.}"` pass-through pattern in client-only jay is not a prop declaration — the validator should skip `props` as an attribute name.

## Design

### Phase 1: Route→contract param consistency (`checkRouteToContractParams`)

**What:** If a page is on a dynamic route, check that for each route param, at least one contract on the page (page-level or any keyed headless) declares it. One param might be consumed by the page contract, another by a headless component.

**Rule:** Collect all route params from the path. Collect all declared params from all contracts (page + headless). For each route param not in the combined set → warning.

**Edge cases:**

- No contract on the page at all → skip (nothing to check against)
- No contracts declare any params → warn for all route params

### Phase 2: Jay-html→contract prop consistency (`checkHeadlessInstanceProps`)

**What:** When a `<jay:xxx>` instance passes attributes, check that the resolved contract declares matching props. Also check that required contract props are present on the instance.

**Skip attributes:** `if`, `forEach`, `trackBy`, `ref`, `slowForEach`, `jayIndex`, `jayTrackBy`, `jay-coordinate-base`, `jay-scope`, `when-resolved`, `when-loading`, `when-rejected`, `accessor`, `props`, `key`

### Phase 3: Component source→contract consistency (`checkComponentPropsAndParams`)

**What:** In validate-plugin, parse the component's TypeScript source and check:

1. If it calls `.withProps<T>()` with custom props → contract must declare `props`
2. If it calls `.withLoadParams(...)` → contract must declare `params`
3. Individual property names match between interface and contract

**AST patterns to detect:**

```
Builder chain:
  makeJayStackComponent<ContractType>()
    .withProps<PropsType>()           ← detect this
    .withLoadParams(loadFn)           ← detect this
    ...
```

**Props type resolution:**

- `.withProps<PageProps>()` → `PageProps` is the framework base type (`{ language, url }`). No custom props. Skip.
- `.withProps<ProductCardProps>()` → custom props. Find `interface ProductCardProps { productId: string }` in same file. Each property must be in contract `props`.
- `.withProps<PageProps & CustomProps>()` → intersection. Strip `PageProps`, extract `CustomProps` properties.

**Params type resolution:**

- `.withLoadParams(loadProductParams)` → find the function → look for the params interface it yields (e.g., `ProductPageParams extends UrlParams { slug: string }`)
- Extract properties from the params interface (excluding inherited `UrlParams` fields)
- Each property must be in contract `params`

**Framework types to skip:**

- `PageProps` — framework base type, not component props
- `UrlParams` — base for params, provides inherited fields like `Record<string, string>`
- `RequestQuery` — fast-phase only, not user-defined

## Implementation Plan

### Phase 1: `checkRouteToContractParams`

**File:** `packages/jay-stack/stack-cli/lib/validate.ts`

1. Add `checkRouteToContractParams(parsedFile, filePath, pagesBase)`:
   - Extract route params via `extractRouteParams`
   - If no route params → return `[]`
   - Collect all declared params from page contract + all headless import contracts
   - If no contracts exist at all → return `[]`
   - For each route param not in the combined declared set → emit warning
2. Call from `validateJayFiles` after existing `checkRouteParams`
3. Add test fixtures + tests

### Phase 2: `checkHeadlessInstanceProps`

**File:** `packages/jay-stack/stack-cli/lib/validate.ts`

1. Add `HEADLESS_SKIP_ATTRS` set (union of directive attrs + `props`, `key`)
2. Add `checkHeadlessInstanceProps(jayHtml, file)`:
   - Walk body tree, find `<jay:xxx>` elements
   - Match to headless import by contract name
   - Collect non-skip attributes → check each exists in `contract.props` by name
   - Check each required `contract.props` entry has a matching attribute on the element
3. Call from `validateJayFiles` after `checkRefElementTypes`
4. Add test fixtures + tests

### Phase 3: `checkComponentPropsAndParams`

**File:** `packages/jay-stack/plugin-validator/lib/check-component-contract.ts` (new)

1. Parse the component source with `ts.createSourceFile()` (single-file, no program needed)
2. Walk AST top-level statements:
   - Collect all `interface` declarations by name (for later property extraction)
   - Find exported variable declarations with `makeJayStackComponent` call chains
3. Walk the builder call chain:
   - `.withProps<T>()` → extract type argument name
   - `.withLoadParams(fn)` → mark that params are used, find function to extract params type
4. Resolve types to interfaces:
   - If props type is `PageProps` alone → skip (framework type)
   - If props type is intersection `PageProps & CustomProps` → extract `CustomProps`
   - Find the matching interface in the file → extract property names
   - For params: find the function, look for the params interface (extends UrlParams)
5. Compare against contract:
   - Props: each interface property → must exist in `contract.props[].name`
   - Params: each interface property → must exist in `contract.params[].name`
   - Reverse: contract prop/param not in interface → warning (contract is over-declared)
6. Return errors for mismatches

**Integrate into `validate-plugin`:**

1. In `validateComponent()`, resolve the component source file path from `module` field + component name
2. Load and parse the contract (already done)
3. Call `checkComponentPropsAndParams(sourcePath, parsedContract)`
4. Add results as errors

**File resolution for component source:**

- Local plugins: `pluginPath + module` field → directory or file → find `.ts` file exporting the component name
- NPM packages: look for `lib/` directory (source may be available alongside dist)

### Phase order

Phase 3 is the most important — implement first. Phases 1 and 2 add complementary checks for the consumer side (page validation).

## Trade-offs

- **Phase 1:** Straightforward — reuses `extractRouteParams`, adds combined param collection
- **Phase 2:** Uses same tree-walking pattern as existing `checkRefElementTypes`
- **Phase 3:** Single-file AST approach (no type checker needed) — lightweight but can't resolve cross-file types. Properties from imported types won't be checked, only interfaces defined in the same file. This covers the common case (component defines its own props/params interfaces).

## Verification Criteria

1. Existing validate tests still pass
2. Phase 1: warns when route provides params no contract declares
3. Phase 2: warns on undeclared props and missing required props
4. Phase 3: detects `.withProps<>()` / `.withLoadParams<>()` and validates against contract
5. Run against wix-stores-v1 → should flag missing `params` on product-page and category-page contracts
6. `yarn vitest run` in `packages/jay-stack/stack-cli` and `packages/jay-stack/plugin-validator` pass

## Implementation Results

### Test Results

- stack-cli: 104 passed (7 test files), including 6 new tests for Phases 1 and 2
- plugin-validator: 13 passed (1 test file), all new for Phase 3

### Files Modified

| File                                                                | Change                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `plugin-validator/lib/check-component-contract.ts`                  | **New.** Single-file AST checker using typescript-bridge              |
| `plugin-validator/lib/validate-plugin.ts`                           | Added `checkComponentContractConsistency`, source/contract resolution |
| `plugin-validator/lib/types.ts`                                     | Added `'component-contract-mismatch'` error type                      |
| `plugin-validator/lib/index.ts`                                     | Export `checkComponentPropsAndParams`                                 |
| `plugin-validator/package.json`                                     | Added `@jay-framework/typescript-bridge` dependency                   |
| `plugin-validator/test/check-component-contract.test.ts`            | **New.** 13 tests for Phase 3                                         |
| `stack-cli/lib/validate.ts`                                         | Added `checkRouteToContractParams` and `checkHeadlessInstanceProps`   |
| `stack-cli/test/validate.test.ts`                                   | Added 6 integration tests for Phases 1 and 2                          |
| `stack-cli/test/fixtures/validate/route-to-contract-missing/`       | **New fixture**                                                       |
| `stack-cli/test/fixtures/validate/headless-props-undeclared/`       | **New fixture**                                                       |
| `stack-cli/test/fixtures/validate/headless-props-missing-required/` | **New fixture**                                                       |

### Deviations from Design

1. **Phase 3 uses `parseContract` from compiler-jay-html** rather than raw YAML parsing, to get proper `ContractProp[]` and `ContractParam[]` types with all fields (required, kind, etc.).

2. **Types imported from `.jay-contract` files are skipped** in Phase 3 — if a component uses `.withProps<WidgetProps>()` where `WidgetProps` is imported from the contract's generated `.d.ts`, the check is skipped because the types match by definition.

3. **Phase 3 integrated into `validateComponent()`** in validate-plugin.ts, calling `checkComponentContractConsistency()` which resolves the source file and contract file independently.

### Post-implementation improvements

4. **Contract file resolution via `package.json` exports chain.** The original `validateContract` guessed contract file locations (`dist/`, `lib/`, root). This failed for wix-stores where plugin.yaml says `contract: product-page.jay-contract` and `package.json` exports maps it to `./dist/contracts/product-page.jay-contract`. Added `resolveContractFile()` which first checks `package.json` exports for `"./<contractSpec>"` → follows the mapped path → falls back to guessing.

5. **Component source resolution via `index.ts` export chain.** The original design guessed source file locations. This failed for wix-stores where components are re-exported from `lib/index.ts` (e.g., `export { productPage } from './components/product-page'`). Added `resolveComponentSourcePath()` which parses the entry module's AST, finds the re-export matching the component name, and follows the module path to the actual `.ts` file. Also handles `export * from './module'` by parsing each star-exported module to check if it exports the component name.

6. **Error messages prefixed with `[contractName]`.** All error/warning messages from Phase 3 now start with `[contract-name]` (e.g., `[product-page] component uses .withLoadParams()...`) to identify which component the error relates to when validating plugins with multiple contracts.

7. **Vite build externals.** Added `@jay-framework/typescript-bridge`, `module`, and `typescript` to the plugin-validator's `vite.config.ts` rollup externals. Without this, Vite tried to bundle `typescript-bridge` (which uses `createRequire` from Node's `module` builtin) and failed with a browser compatibility error.

### Verified against real plugins

Running `validate-plugin` against wix-stores:

- `[product-page]` — flagged missing `params` (component uses `.withLoadParams()`)
- `[product-search]` — flagged missing `props` (`{category, subcategory}`) and missing `params`
- `[category-list]` — flagged missing `props` (`{parentCategory}`)

Running against wix-stores-v1:

- `[product-page]` — flagged missing `params`
- `[category-page]` — flagged missing `params`
