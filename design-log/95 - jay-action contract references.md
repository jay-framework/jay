# Design Log #95 — Contract References in .jay-action Files

## Background

Design Log #92 introduced `.jay-action` files as metadata descriptors for server actions. These files define input/output schemas using inline JSON Schema, which generates TypeScript `.d.ts` interfaces.

However, many action outputs reference types that already exist as `.jay-contract` ViewState types. For example, in `wix-stores-v1`:

```typescript
// stores-v1-actions.ts
export interface SearchProductsOutput {
    products: ProductCardViewState[];  // ← from product-card.jay-contract
    totalCount: number;
    // ...
}

export const getProductBySlug = makeJayQuery(...)
    .withHandler(async (...): Promise<ProductCardViewState | null> => { ... });
```

Currently the `.jay-action` file duplicates a subset of the contract schema inline, which is:
- **Incomplete** — misses most fields from the ViewState
- **Fragile** — contract changes aren't reflected
- **Redundant** — same schema defined in two places

## Problem

How do we reference an existing contract's ViewState type from within a `.jay-action` file?

Sub-questions:
- Top-level or nested references? (e.g., `products: ProductCardViewState[]` vs `products.thumbnail: ThumbnailViewState`)
- Same-package vs cross-package contracts?
- How does this affect the compiler (`.d.ts` generation)?
- How does this affect the AI agent runtime (schema resolution for LLM context)?

## Questions and Answers

**Q1: Do we need nested type references (e.g., referencing just the `mainMedia` sub-contract)?**

A: Probably not for now. Actions typically return the full ViewState or a list of them. We can reference the top-level contract and get all sub-types included. If needed later, we could support `contract: product-card.jay-contract#mainMedia` syntax.

**Q2: How should the contract path be expressed?**

Options:
- a) Relative path: `../contracts/product-card.jay-contract`
- b) Export subpath: `product-card.jay-contract` (same as in plugin.yaml)

Option (b) is consistent with how contracts are referenced in `plugin.yaml` and resolved via `package.json` exports. It also works for cross-package references if we ever need them.

**Q3: What TypeScript type name should be generated?**

Contracts generate a `ViewState` type (e.g., `ProductCardViewState` from `product-card.jay-contract`). The compiler already knows how to derive this name from the contract filename. We should import and use the same type.

**Q4: What about nullable returns (e.g., `ProductCardViewState | null`)?**

We need a way to mark a contract reference as nullable. Could use `nullable: true` alongside the `contract` field.

## Design

### New `contract` field in ActionSchemaProperty

Add an optional `contract` field to any schema property. When present, it replaces the inline type with a reference to the contract's ViewState type.

```yaml
# In a .jay-action file
outputSchema:
  type: object
  required:
    - products
    - totalCount
    - hasMore
  properties:
    products:
      type: array
      items:
        contract: product-card.jay-contract    # ← new field
    totalCount:
      type: number
    hasMore:
      type: boolean
```

For a top-level contract return:

```yaml
outputSchema:
  contract: product-card.jay-contract
  nullable: true    # generates: ProductCardViewState | null
```

### Resolution rules

The `contract` value is a subpath that matches the pattern used in `plugin.yaml` and `package.json` exports:
- Same package: resolved relative to the package root (e.g., `product-card.jay-contract` → `./contracts/product-card.jay-contract` via the same lookup used for contracts)
- The compiler needs to generate an import path. Since the `.jay-action.d.ts` is co-located with the action, and contracts are in a known location, we resolve the relative path at compile time.

### Compiler changes (`action-compiler.ts`)

When a property has `contract` field:

1. **Parser** (`action-parser.ts`): Allow `contract` and `nullable` fields on `ActionSchemaProperty`
2. **Compiler** (`action-compiler.ts`):
   - Collect all contract references from the schema
   - Generate import statements for each unique contract
   - Use the ViewState type name instead of an inline type

Generated output example:

```typescript
import { ProductCardViewState } from '../contracts/product-card.jay-contract';

export interface SearchProductsOutput {
  products: Array<ProductCardViewState>;
  totalCount: number;
  hasMore: boolean;
}
```

For nullable:
```typescript
export type GetProductBySlugOutput = ProductCardViewState | null;
```

### Import path resolution

The compiler needs to resolve the import path from the `.jay-action.d.ts` location to the contract. Since both are in the same package:

1. The compiler knows the project root (passed to `jayDefinitions`)
2. Contract files are discovered by glob (`**/*.jay-contract`)
3. Given a contract subpath like `product-card.jay-contract`, find the matching file
4. Compute relative path from the action's directory to the contract file

### AI agent runtime changes

The action metadata resolver (in `stack-server-runtime`) needs to:
1. When a `contract` reference is found in a `.jay-action`, resolve it to the full contract schema
2. Inline the contract's tags as the schema for the AI agent's context
3. This happens at materialization time, not compile time

## Implementation Plan

### Phase 1: Parser + Compiler support
1. Add `contract` and `nullable` fields to `ActionSchemaProperty`
2. Update `action-compiler.ts` to:
   - Collect contract references during compilation
   - Accept a contract resolver function (maps subpath → relative import path)
   - Generate import statements
   - Emit contract ViewState type names instead of inline types
3. Update `definitions-compiler.ts` (rollup plugin) to pass a contract resolver to the compiler
4. Add tests

### Phase 2: Update .jay-action files
1. Update wix-stores, wix-stores-v1, wix-data `.jay-action` files to use contract references
2. Verify generated `.d.ts` files import and use the correct ViewState types

### Phase 3: Runtime resolution (if needed)
1. Update action metadata resolution in `stack-server-runtime` to resolve contract references
2. Inline contract schemas when building AI agent tool descriptions

## Examples

### ✅ Array of contract items
```yaml
outputSchema:
  type: object
  required: [products, totalCount]
  properties:
    products:
      type: array
      items:
        contract: product-card.jay-contract
    totalCount:
      type: number
```
→ Generates: `products: Array<ProductCardViewState>`

### ✅ Nullable contract return
```yaml
outputSchema:
  contract: product-card.jay-contract
  nullable: true
```
→ Generates: `export type GetProductBySlugOutput = ProductCardViewState | null`

### ✅ Contract alongside other properties
```yaml
outputSchema:
  type: object
  required: [product, relatedCategories]
  properties:
    product:
      contract: product-card.jay-contract
    relatedCategories:
      type: array
      items:
        type: object
        properties:
          id:
            type: string
          name:
            type: string
```

### ❌ Nested sub-contract reference (not supported initially)
```yaml
# NOT supported in v1
outputSchema:
  type: object
  properties:
    media:
      contract: product-card.jay-contract#mainMedia
```

## Trade-offs

| Aspect | Pro | Con |
|--------|-----|-----|
| Single source of truth | Contract changes automatically reflected | Adds coupling between action and contract files |
| Import generation | Clean TypeScript with proper types | Compiler needs contract resolution logic |
| AI agent context | Can inline full contract schema | More complex materialization step |
| Simplicity | Only top-level ViewState references | Can't reference sub-contracts directly |
