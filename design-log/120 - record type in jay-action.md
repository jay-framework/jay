# Design Log 120 — `record(T)` Type in Jay-Action

## Background

Jay-actions need to express `Record<string, T>` as output types. A real use case: `VariantStockMap` — variant IDs → option IDs → in-stock booleans (`Record<string, Record<string, boolean>>`). The existing type notation had no way to express typed record/map types. Empty objects `{}` produce `Record<string, unknown>`, but there was no notation for typed values.

## Design

Add `record(T)` keyword to the compact type notation, following the `enum(a | b | c)` pattern. Supports nesting and all existing inner types via recursive parsing.

```yaml
outputSchema:
  stock: record(boolean) # Record<string, boolean>
  variants: record(record(boolean)) # Record<string, Record<string, boolean>>
  labels: record(string) # Record<string, string>
  items: record(productCard) # Record<string, ProductCardViewState>
```

## Implementation

### Changes

1. **`compiler-shared/lib/jay-type.ts`** — Added `record` to `JayTypeKind`, `JayRecordType` class (mirrors `JayArrayType`), `isRecordType()` guard, `equalJayTypes()` case
2. **`compiler-shared/lib/jay-type-to-json-schema.ts`** — Added `additionalProperties` to `JsonSchemaProperty`, record → `{ type: 'object', additionalProperties: ... }` conversion
3. **`compiler-jay-html/lib/action/action-parser.ts`** — `record(...)` detection in `resolveStringType()` with recursive inner type parsing
4. **`compiler-jay-html/lib/action/action-compiler.ts`** — `renderType()` renders `Record<string, T>`, `collectImportedAliases()` recurses into record items
5. **Documentation** — Added `record(T)` row to type notation tables in `server-actions.md`, `plugins.md`, `contracts-and-plugins.md`

### Test Results

- compiler-shared: 108/108 passing (including 2 new record JSON Schema tests)
- compiler-jay-html actions: 35/35 passing (including 5 new parser + 4 new compiler tests)
