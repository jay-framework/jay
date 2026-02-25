# Design Log #95 — Contract References and Compact Notation in .jay-action Files

## Background

Design Log #92 introduced `.jay-action` files as metadata descriptors for server actions, using JSON Schema-style inline definitions for input/output types. Two problems emerged:

1. **Contract duplication**: Action outputs often reference types from `.jay-contract` files (e.g., `ProductCardViewState`), but the schema is duplicated inline — incomplete and fragile.
2. **Verbose format**: The JSON Schema notation is verbose compared to the compact type notation already used in jay-html data scripts and contract files.

## Problem

The `.jay-action` format should:

- Reference contract ViewState types instead of duplicating them
- Use the same compact type notation as jay-html (`string`, `number`, `enum(...)`, arrays as YAML lists, `?` for optional)
- Reuse existing infrastructure: `resolveType`, JayType system, enum parsing

## Design

### Revised `.jay-action` format

Replace JSON Schema with the compact jay-type notation. Add `import:` block for contract references.

#### Before (JSON Schema — current)

```yaml
name: searchProducts
description: Search products...

inputSchema:
  type: object
  required:
    - query
  properties:
    query:
      type: string
      description: Search query text
    filters:
      type: object
      properties:
        minPrice:
          type: number
        maxPrice:
          type: number
        collectionIds:
          type: array
          items:
            type: string
    sortBy:
      type: string
      enum: [relevance, price_asc, price_desc]
    page:
      type: number
    pageSize:
      type: number

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
        type: object
        properties:
          _id:
            type: string
          name:
            type: string
          # ... 20 more lines of duplicated contract schema
    totalCount:
      type: number
    hasMore:
      type: boolean
```

#### After (compact jay-type notation)

```yaml
name: searchProducts
description: Search products...

import:
  productCard: product-card.jay-contract

inputSchema:
  query: string
  filters?:
    minPrice?: number
    maxPrice?: number
    collectionIds?: string[]
  sortBy?: enum(relevance | price_asc | price_desc | name_asc | name_desc | newest)
  page?: number
  pageSize?: number

outputSchema:
  products:
    - productCard
  totalCount: number
  currentPage: number
  totalPages: number
  hasMore: boolean
  priceAggregation:
    minBound: number
    maxBound: number
    ranges:
      - rangeId: string
        label: string
        minValue?: number
        maxValue?: number
        isSelected: boolean
```

### Type notation rules

| Notation                      | Meaning                | Example                      |
| ----------------------------- | ---------------------- | ---------------------------- |
| `string`, `number`, `boolean` | Primitives             | `name: string`               |
| `enum(a \| b \| c)`           | Enum type              | `sortBy?: enum(asc \| desc)` |
| `propName?:`                  | Optional property      | `filters?: ...`              |
| YAML list `- ...`             | Array of objects       | `items: \n- id: string`      |
| `- importedName`              | Array of imported type | `products: \n- productCard`  |
| `importedName`                | Imported contract type | `product: productCard`       |
| `importedName?`               | Nullable imported type | `outputSchema: productCard?` |
| Nested object                 | Inline object type     | `media: \n  url: string`     |

### `import:` block

```yaml
import:
  localAlias: contract-subpath.jay-contract
```

- Key is a local alias used in type expressions
- Value is the contract subpath (same format as `plugin.yaml` and `package.json` exports)
- The compiler resolves the import to generate a TS import statement
- At runtime (AI agent), the contract schema is inlined by the materializer

### Nullable types

For top-level nullable outputs (e.g., `getProductBySlug` returning `ProductCardViewState | null`):

```yaml
outputSchema: productCard?
```

Generates: `export type GetProductBySlugOutput = ProductCardViewState | null`

### Generated `.d.ts` example

From the compact notation above:

```typescript
import { ProductCardViewState } from '../contracts/product-card.jay-contract';

export interface SearchProductsInput {
  query: string;
  filters?: {
    minPrice?: number;
    maxPrice?: number;
    collectionIds?: string[];
  };
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'newest';
  page?: number;
  pageSize?: number;
}

export interface SearchProductsOutput {
  products: Array<ProductCardViewState>;
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  priceAggregation: {
    minBound: number;
    maxBound: number;
    ranges: Array<{
      rangeId: string;
      label: string;
      minValue?: number;
      maxValue?: number;
      isSelected: boolean;
    }>;
  };
}
```

### Reuse of existing infrastructure

| Component                             | Existing                      | Reuse for `.jay-action`                                 |
| ------------------------------------- | ----------------------------- | ------------------------------------------------------- |
| `resolvePrimitiveType()`              | `compiler-shared`             | Resolve `string`, `number`, `boolean` → `JayAtomicType` |
| `parseIsEnum()` / `parseEnumValues()` | `expression-compiler.ts`      | Parse `enum(...)` → `JayEnumType`                       |
| `JayObjectType`                       | `compiler-shared/jay-type.ts` | Objects with properties                                 |
| `JayArrayType`                        | `compiler-shared/jay-type.ts` | Array wrapping                                          |
| `JayImportedType`                     | `compiler-shared/jay-type.ts` | Contract references (alias + nullable)                  |
| `JayOptionalType` (**new**)           | `compiler-shared/jay-type.ts` | Wrap any type to mark optional                          |

New code:

- **`JayOptionalType`** in `compiler-shared/jay-type.ts` — wrapper type for optional properties
- **`resolveActionType()`** in `action-parser.ts` — parses compact notation into JayType (handles `?`, imports, `type[]`)
- **Action compiler** in `action-compiler.ts` — renders JayType → TypeScript with contract imports, inline objects, union enums
- **Compact → JSON Schema** in `action-metadata.ts` (runtime) — converts compact notation to JSON Schema at materialization time

## Implementation Plan

### Phase 1: Update parser and compiler

1. Rewrite `action-parser.ts` to parse compact notation with `import:`, `?` optional, and YAML-based types
2. Rewrite `action-compiler.ts` to emit TypeScript from JayType (with import statements for contracts)
3. Add JayType → JSON Schema utility for runtime use
4. Update tests

### Phase 2: Migrate `.jay-action` files

1. Convert all existing `.jay-action` files (gemini-agent, wix-data, wix-stores, wix-stores-v1) to the new format
2. Verify generated `.d.ts` files match expected output

### Phase 3: Runtime integration

1. Update action metadata resolution to parse compact format
2. Convert to JSON Schema at materialization time for AI agent tool descriptions

## More Examples

### ✅ Simple action with no imports

```yaml
name: getCategories
description: Get store categories

inputSchema: {}

outputSchema:
  categories:
    - _id: string
      slug: string
      title: string
      itemCount: number
```

### ✅ Nullable contract return

```yaml
name: getProductBySlug
description: Get product by slug

import:
  productCard: product-card.jay-contract

inputSchema:
  slug: string

outputSchema: productCard?
```

### ✅ Mixed inline and contract types

```yaml
name: searchProducts
description: Search products

import:
  productCard: product-card.jay-contract

inputSchema:
  query: string
  pageSize?: number

outputSchema:
  products:
    - productCard
  totalCount: number
  hasMore: boolean
```

### ✅ Array output (no wrapper object)

```yaml
name: getCollections
description: Get collections

inputSchema: {}

outputSchema:
  - _id: string
    name: string
    slug: string
    productCount: number
```

## Trade-offs

| Aspect                 | Pro                                                   | Con                                                    |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Compact notation       | Much shorter files, consistent with jay-html          | Breaking change to format just introduced              |
| JayType reuse          | Single type system across framework                   | Added `JayOptionalType` to shared types                |
| Contract imports       | Single source of truth for ViewState types            | Coupling between action and contract files             |
| JSON Schema at runtime | Clean separation (define compact, export JSON Schema) | Extra conversion step                                  |
| `?` for optional       | More ergonomic than `required` arrays                 | Slightly extends the notation vs jay-html data scripts |

## Implementation Results

### What was implemented

**Phase 1 — Parser & Compiler** (compiler-jay-html)

- Added `JayOptionalType` to `compiler-shared/jay-type.ts` — a wrapper type (`JayOptionalType(innerType)`) that marks any `JayType` as optional. Optional properties in `JayObjectType.props` are wrapped: `{ limit: new JayOptionalType(JayNumber) }`.
- Rewrote `action-parser.ts` to produce JayType trees. Uses `resolvePrimitiveType()`, `parseIsEnum()`/`parseEnumValues()` from shared infra. New `resolveActionType()` handles `?` optional, contract imports (`JayImportedType`), and `type[]` array shorthand.
- Rewrote `action-compiler.ts` with `ContractResolver` interface. Walks JayType tree, collects `JayImportedType` nodes, resolves to ViewState names and import paths. Action-specific renderer: inline objects, union enums, `Array<primitive>`.
- Updated `definitions-compiler.ts` (rollup plugin) with contract resolver that searches sibling `contracts/` directory and parent directories for `.jay-contract` files. ESM-compatible (no `require()`/`glob`).

**Phase 1b — Runtime** (stack-server-runtime)

- Refactored `action-metadata.ts` to reuse the compiler's `parseAction()` from `compiler-jay-html` (which produces JayType trees), then convert to JSON Schema via `jayTypeToJsonSchema()` from `compiler-shared`. Eliminated the duplicate compact-to-JSON-Schema conversion logic.
- Added `jayTypeToJsonSchema()` converter in `compiler-shared/lib/jay-type-to-json-schema.ts` — walks JayType tree and produces JSON Schema properties. Handles atomic, enum, array, object, imported (→ `{ type: 'object', description: 'Contract: ...' }`), and optional (unwraps to inner type, excludes from `required`).

**Phase 2 — Migrated all 11 `.jay-action` files**

- `gemini-agent`: 2 files (send-message, submit-tool-results)
- `wix-data`: 3 files (query-items, get-item-by-slug, get-categories)
- `wix-stores`: 3 files (search-products, get-product-by-slug, get-categories)
- `wix-stores-v1`: 3 files (search-products, get-product-by-slug, get-collections)

### Deviations from design

1. **New `JayOptionalType` wrapper**: Added `JayOptionalType` to `compiler-shared/jay-type.ts` as a wrapper type — `JayOptionalType(innerType: JayType)`. Optional properties in `JayObjectType.props` are wrapped: `{ limit: new JayOptionalType(JayNumber) }`. The compiler unwraps to render `limit?: number`. This is cleaner than tracking optional as a side-channel `Set<string>` on the parent object — the optional marker lives with the type itself, composable like `JayArrayType` and `JayPromiseType`.

2. **Action-specific TypeScript renderer**: The existing `generateTypes()` / `renderInterface()` in `jay-html-compile-types.ts` renders enums as `export enum`, uses commas between properties, extracts child interfaces as separate named types, and doesn't support `Array<primitive>`. For actions we need inline union enums (`'a' | 'b'`), semicolons, inline objects, and array-of-primitive support. Wrote an action-specific renderer that consumes JayType but renders for action `.d.ts` output.

3. **No direct `resolveType()` reuse**: The existing `resolveType()` doesn't handle `?` optional keys, contract imports, or `type[]` array shorthand. Wrote a parallel `resolveActionType()` in the action parser that uses `resolvePrimitiveType()` and `parseIsEnum()`/`parseEnumValues()` from the shared infrastructure but adds action-specific features.

4. **Contract references via `JayImportedType`**: Used `JayImportedType(alias, JayUnknown, isOptional)` where `alias` is the import key (e.g., "productCard"), `JayUnknown` is a placeholder (the actual type is resolved at compile time via `ContractResolver`), and `isOptional` indicates nullable (`?`).

5. **Enum identifiers with hyphens**: The PEG grammar's `Identifier` rule doesn't support hyphens (e.g., `tool-calls`). Changed gemini-agent's `type` field from `enum(response | tool-calls)` to plain `string`. Non-breaking since the enum was only informational.

6. **Empty objects**: `{}` in YAML (e.g., `pageState: {}`, `filter: {}`) generates `Record<string, unknown>` in TypeScript. Consistent with how unknown-shape objects should be typed.

### Test results

- compiler-shared: 11 jayTypeToJsonSchema tests passing
- compiler-jay-html: 540 passed (20 test files), including 26 action tests
- stack-server-runtime: 89 passed (10 test files), including 13 action-metadata tests
- All wix packages build successfully with correct generated `.d.ts` files
- Contract import resolution verified: `import { ProductCardViewState } from '../contracts/product-card.jay-contract'`
