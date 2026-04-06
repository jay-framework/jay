# Design Log #122 — Enum Name Collision Across Linked Contracts

## Background

In jay-html, headless contracts define enums via `dataType: enum(A | B)`. The compiler generates a TypeScript enum name using `pascalCase(tag)` — e.g., tag `optionRenderType` → `OptionRenderType`. When a page transitively imports multiple contracts that define enums with the same tag name but different values, the generated imports collide.

### Related Design Logs

- #93 — Client hydration
- #118 — Hydrate compilation target extraction

## Problem

### Reproduction

Page `products/kitan/[[category]]/page.jay-html` imports `product-search` contract (key: `search`). The linking chain:

```
product-search
├── filters.optionFilters.optionRenderType: enum(TEXT_CHOICES | SWATCH_CHOICES)
└── searchResults (link: ./product-card)
    └── quickOption, secondQuickOption (link: ./product-options)
        └── optionRenderType: enum(TEXT_CHOICES | COLOR_SWATCH_CHOICES)
```

Both enums produce `OptionRenderType` via `pascalCase('optionRenderType')` in `contract-parser.ts:78`.

### Generated output (broken)

```typescript
// page.jay-html.d.ts
import { ..., OptionRenderType, ... } from ".../product-search.jay-contract";
import { OptionRenderType, ChoiceType, OptionRenderType, ChoiceType } from ".../product-options.jay-contract";
```

**Three bugs visible:**

1. **Shadowing**: two `import { OptionRenderType }` from different modules; second shadows first at runtime
2. **Duplicate within import**: `product-card` links `product-options` twice (for `quickOption` and `secondQuickOption`), so `OptionRenderType, ChoiceType` appear twice in the same import
3. **Validation false-negative**: compiler validates `SWATCH_CHOICES` against the correct enum (product-search's, via the type tree), raises no error, but at runtime `OptionRenderType` is the product-options version which doesn't have `SWATCH_CHOICES`

### Root cause trace

1. `contract-parser.ts:78` — `new JayEnumType(pascalCase(tag), parseEnumValues(dataType))` derives name solely from tag name, no scoping by contract or path
2. `contract-to-view-state-and-refs.ts:92,103` — enums from linked sub-contracts bubble up via `enumsToImport` without deduplication
3. `jay-html-parser.ts:657-701, 951-992` — enum import links are built without collision detection; same enum can appear multiple times from multiply-linked contracts
4. `jay-html-compile-imports.ts:22-25` — `renderImports` generates `import {symbols}` using `symbol.name`, producing duplicate bindings
5. `expression-parser.pegjs:570` — `enumCondition` uses `head.resolvedType.name` for code generation; the type tree correctly resolves to the right enum, but the generated identifier matches the wrong runtime object due to shadowing

### Why validation doesn't catch it

The expression parser resolves `optionRenderType` via `Variables.resolveAccessor`, which walks the type tree: `search → filters → optionFilters[] → optionRenderType`. This correctly lands on the product-search JayEnumType with values `[TEXT_CHOICES, SWATCH_CHOICES]`. Validation passes. But the generated code references `OptionRenderType.SWATCH_CHOICES`, and at runtime `OptionRenderType` is the product-options version (due to import shadowing) which has `[TEXT_CHOICES, COLOR_SWATCH_CHOICES]`.

## Design

### Approach: Import-level aliasing with JayEnumType.alias

Keep `JayEnumType.name` as the canonical contract-defined name (used in `.d.ts` generation). Add an optional `alias` field that the expression parser checks first. Import uses `import { Name as Alias }`.

### Generated output (fixed)

```typescript
import { ..., OptionRenderType } from './product-search.jay-contract';
import { OptionRenderType as OptionRenderType$1, ChoiceType } from './product-options.jay-contract';
```

Expression for `search.filters.optionFilters`:
→ `vs1.optionRenderType === OptionRenderType.SWATCH_CHOICES` ✓

Expression for `search.searchResults.quickOption` (if used):
→ `vs1.optionRenderType === OptionRenderType$1.COLOR_SWATCH_CHOICES` ✓

## Implementation Plan

### Step 1: Add `alias` field to JayEnumType

**File:** `packages/compiler/compiler-shared/lib/jay-type.ts`

Add `public alias?: string` to `JayEnumType`. This is a page-local override — set only when a collision is detected during page compilation. Contract `.d.ts` generation is unaffected (never sets alias).

### Step 2: Use alias in expression parser

**File:** `packages/compiler/compiler-jay-html/lib/expressions/expression-parser.pegjs`

In the `enumCondition` rule (line 566-575), replace `head.resolvedType.name` with `(head.resolvedType.alias || head.resolvedType.name)`.

Rebuild parser (`yarn build` regenerates `expression-parser.cjs`).

### Step 3: Deduplicate enums within a single headless import

**File:** `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-parser.ts`

In both enum collection blocks (lines ~679-701 and ~970-992), deduplicate `enumsFromOtherContracts` by `(declaringModule, type.name)` before building `enumImportLinks`. Fixes the `{X, Y, X, Y}` duplication from multiply-linked sub-contracts.

### Step 4: Resolve cross-contract collisions in parseJayFile

**File:** `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-parser.ts`

After `allHeadlessImports` is assembled (line ~1254), before `parseTypes` is called:

1. Collect all enum-typed `JayImportName` entries from all `contractLinks` across all headless imports
2. Group by `name`
3. For groups with >1 entry from different modules:
   - First occurrence: unchanged
   - Subsequent: set `enumType.alias = name + '$' + counter`, set `importName.as = alias`
4. Always alias across different modules — even same values in different order would produce different numeric indices

Must happen before `parseTypes` because the type tree is built from the same JayEnumType instances — the alias field propagates automatically.

## Verification

1. `cd packages/compiler/compiler-jay-html && yarn vitest run` — all tests pass
2. Golf page `.d.ts` has no duplicate OptionRenderType imports
3. Expression output uses aliased name for the colliding enum
