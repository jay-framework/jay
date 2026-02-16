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

| Notation                      | Meaning                |  Example                     |
|-------------------------------|------------------------|------------------------------|
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

| Component | Existing | Reuse for `.jay-action` |
|-----------|----------|------------------------|
| `resolveType()` | `jay-html-parser.ts` | Parse compact notation → JayType |
| `resolvePrimitiveType()` | `compiler-shared` | Resolve `string`, `number`, etc. |
| `parseIsEnum()` / `parseEnumValues()` | `expression-compiler.ts` | Parse `enum(...)` |
| JayType hierarchy | `compiler-shared/jay-type.ts` | Internal type representation |
| JayType → TypeScript | `contract-compiler.ts` | Generate `.d.ts` output |

New code needed:
- **Action parser**: Parse the `import:` block and `?` optional markers, then delegate to `resolveType`-like logic
- **Action compiler**: Handle contract imports, generate import statements, emit TypeScript from JayType
- **JayType → JSON Schema converter**: For AI agent runtime (materialization time), convert JayType to JSON Schema for Gemini function declarations

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

| Aspect | Pro | Con |
|--------|-----|-----|
| Compact notation | Much shorter files, consistent with jay-html | Breaking change to format just introduced |
| JayType reuse | Single type system across framework | Need to add optional/nullable to JayType if not present |
| Contract imports | Single source of truth for ViewState types | Coupling between action and contract files |
| JSON Schema at runtime | Clean separation (define compact, export JSON Schema) | Extra conversion step |
| `?` for optional | More ergonomic than `required` arrays | Slightly extends the notation vs jay-html data scripts |
