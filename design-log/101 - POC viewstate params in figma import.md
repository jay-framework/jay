# Design Log 101: POC — ViewState Query Params in Figma Import

> POC to integrate the dev server's `vs.*` viewstate query parameters into the Figma import pipeline for accurate per-variant computed style extraction.

## Background

Two features developed in parallel:
1. **ViewState Query Params** (`viewstate_query_params` branch, Design Log #96) — Dev server overrides viewState values via URL parameters (`?vs.name=Test+Product`), rendering the page with different contract values.
2. **Figma Import Pipeline** (`import_from_jay_html` branch) — Converts jay-html to a FigmaVendorDocument via an Intermediate Representation (IR), using Playwright to extract computed CSS styles.

The import pipeline had a gap: the computed style enricher only rendered the **default state**. Elements behind `if` conditions that were false in the default state had no accurate styles. The variant synthesizer created Figma COMPONENT_SET variants structurally, but each variant got the same default styles.

## Problem

1. **Single rendering** — The enricher renders one scenario (default). Elements behind `if="isSearching"` (which defaults to false) are never rendered visibly.
2. **Blind variant styles** — The variant synthesizer produces correct Figma structure (COMPONENT_SET → COMPONENT per if branch), but every variant receives the merged default styles regardless of which state it represents.
3. **Missing information bridge** — The contract defines which tags exist and their types (boolean, enum). The template's `if` conditions define which tag values matter. Neither side alone determines the needed scenarios — the intersection does.

## Design: Condition-Driven Scenario Generation

### Key Insight

The template's `if` conditions **are** the variants that will become Figma components. Each `if` condition tells us exactly which `vs.*` values to override. We don't need combinatorial explosion of all tag values — only the combinations the template actually checks.

### Three Strategies Compared

| Strategy | Scenarios for 3 booleans + 2 enums(3 values each) | Accuracy |
|---|---|---|
| **Linear** (one value per tag) | 2+2+2+3+3 = 12 | Missing compound conditions |
| **Combinatorial** (all permutations) | 2×2×2×3×3 = 72 | Accurate but wasteful |
| **Condition-driven** (one per `if`) | = number of distinct `if` conditions | Exact match to template needs |

### How It Works

```
Jay-HTML Template                    Contract (tags + types)
      │                                      │
      ▼                                      ▼
  scanForIfAttributes()              findEditorProtocolTag()
      │                              parseDataTypeString()
      │                                      │
      └──────────┬───────────────────────────┘
                 │
                 ▼
       tokenizeCondition(ifExpr)
                 │
                 ▼
       tokenToOverrideValue(token, contractTags)
                 │
                 ▼
       Build VariantScenario {
           id: "tagPath=value&tagPath2=value2"
           queryString: "?vs.tagPath=value&vs.tagPath2=value2"
           contractValues: { tagPath: "value", ... }
       }
```

### Condition → Scenario Mapping

| Condition | Tokens | Scenario override |
|---|---|---|
| `if="isSearching"` | truthy(isSearching) → boolean:true | `?vs.isSearching=true` |
| `if="!isSearching"` | negated(isSearching) → boolean:false | `?vs.isSearching=false` |
| `if="mediaType == IMAGE"` | eq(mediaType, IMAGE) | `?vs.mediaType=IMAGE` |
| `if="mediaType != IMAGE"` | neq → pick first non-IMAGE enum value | `?vs.mediaType=VIDEO` |
| `if="isSearching && hasResults"` | truthy(isSearching) + truthy(hasResults) | `?vs.isSearching=true&vs.hasResults=true` |
| `if="brand.name"` | truthy(brand.name) → string:"Sample" | `?vs.brand.name=Sample` |
| `if="!imageUrl"` | negated(imageUrl) → string:"" (empty) | `?vs.imageUrl=` |
| `if="itemCount > 0"` | gt(itemCount, 0) → number:1 | `?vs.itemCount=1` |
| `if="quantity >= 5"` | gte(quantity, 5) → number:5 | `?vs.quantity=5` |
| `if="stock < 10"` | lt(stock, 10) → number:9 | `?vs.stock=9` |
| `if="itemCount == 0"` | eq(itemCount, 0) | `?vs.itemCount=0` |
| `if="itemCount"` | truthy(itemCount) → number:1 | `?vs.itemCount=1` |

All patterns found in real jay-html templates (store-light, whisky-store, cart-webmcp, fake-shop) are handled.

### Deduplication

- Same `if` condition appearing on multiple elements → one scenario
- Scenario ID is deterministic: sorted `key=value` pairs joined by `&`
- `maxScenarios` cap (default 16) prevents runaway generation

## Implementation

### Files Modified

#### `computed-style-enricher.ts`

- **`tokenToOverrideValue(token, contractTags)`** — New function. Given a condition token and the contract, determines the `vs.*` value that makes the token evaluate to true. Handles: boolean truthy/negated, `==`, `!=` (picks alternative enum value). Skips: string truthy, expression operators (`>`, `<`).

- **`generateVariantScenarios(bodyDom, pageContract, maxScenarios)`** — Refactored from dimension-based linear generation to condition-driven. Now:
  1. Scans all `if` attributes in the DOM
  2. Tokenizes each condition
  3. Resolves each token to an override value using the contract
  4. Builds one scenario per condition with all needed overrides
  5. Deduplicates by sorted ID
  6. Logs: which conditions mapped to which scenarios

- **`enrichWithComputedStyles()`** — Returns `EnricherResult` with both `merged` (union of all scenarios) and `perScenario` (separate `ComputedStyleMap` per scenario), plus the scenario list.

#### `computed-style-types.ts`

- **`ScenarioStyleMaps`** — `Map<scenarioId, ComputedStyleMap>` for per-scenario style data.
- **`EnricherResult`** — `{ merged, perScenario, scenarios }` replaces the previous plain `ComputedStyleMap` return.

#### `jay-html-to-import-ir.ts`

- **`findScenarioForCondition(condition, perScenarioMaps, scenarios)`** — Matches a node's `if` condition to the right scenario's style map. Uses exact match on the deterministic ID, then falls back to superset match (for compound scenarios) and single-key match.

- **`buildNodeFromElement()` callback for variant children** — When processing a node inside a variant group, looks up the scenario-specific `ComputedStyleMap` for that variant's condition. Falls back to the merged map if no specific scenario matches.

#### `index.ts` (Figma import orchestrator)

- Destructures `EnricherResult` and passes `perScenarioMaps` + `scenarios` to `buildImportIR`.
- Writes debug files: `import-variant-scenarios.json` and `import-per-scenario-styles.json`.

### Data Flow

```
convertFromJayHtml()
   │
   ├─ enrichWithComputedStyles()
   │    ├─ generateVariantScenarios(bodyDom, contract)
   │    │    └─ For each if condition → tokenize → resolve → VariantScenario
   │    │
   │    ├─ For each scenario:
   │    │    └─ Playwright: navigate to baseUrl + scenario.queryString
   │    │       └─ Extract computed styles → per-scenario ComputedStyleMap
   │    │
   │    └─ Return { merged, perScenario, scenarios }
   │
   ├─ buildImportIR(html, contract, merged, perScenario, scenarios)
   │    ├─ For regular elements: use merged styles
   │    └─ For variant children (if elements):
   │         └─ findScenarioForCondition(condition) → scenario-specific styles
   │
   └─ adaptIRToFigmaVendorDoc()
```

## Test Results

### Unit Tests: `variant-scenario-generation.test.ts` — 30/30 passing

- `parseDataTypeString`: boolean, string, number, enum, unknown
- Boolean: truthy, negated
- Enum: equality, `!=` (alternative picking)
- String: truthy → `"Sample"`, negated → `""`
- Number: truthy → `1`, `> 0` → `1`, `>= 5` → `5`, `< 10` → `9`, `<= 0` → `0`, `== 0` → `0`
- Compound: `&&` with booleans, `&&` with mixed enum+enum, `&&` with boolean+negated, `&&` with negated+comparison
- Dedup, independent conditions, maxScenarios, nested paths
- Real-world test: store-light product page with 14 distinct conditions → 14 scenarios + default

### Integration Tests: `figma-import/` — 195/195 passing

No regressions to existing fixture tests, style resolution, variant synthesis, or condition tokenizer.

## Key Decisions

1. **Condition-driven, not linear or combinatorial** — One scenario per `if` condition. Only renders what the template actually checks. Compound conditions produce multi-value scenarios.

2. **All data types handled** — Boolean (`true`/`false`), enum (exact value), string (truthy → `"Sample"`, negated → `""`), number (truthy → `1`, comparison → value satisfying operator). Every pattern found in real templates generates a scenario.

3. **Comparison operators resolved** — `> N` → `N+1`, `>= N` → `N`, `< N` → `N-1`, `<= N` → `N`. Produces the simplest integer that satisfies the condition.

4. **`!=` picks first alternative** — `if="mediaType != IMAGE"` → override to `VIDEO` (first enum value that isn't IMAGE). Imperfect but sufficient for style extraction.

5. **Scenario ID = sorted overrides** — `hasResults=true&isSearching=true` is deterministic regardless of condition token order. Enables exact matching in the IR builder.

6. **Multi-strategy matching in `findScenarioForCondition`** — (1) Exact ID match for simple operators, (2) tag-path exact-count match for complex operators, (3) superset match, (4) single-path prefix fallback. The IR matcher doesn't need contract info — it matches by tag paths since the generator already computed the right values.

7. **Default max 16 scenarios** — The condition-driven approach generates fewer scenarios than linear (no redundant "all values" generation), but compound conditions can push the count.

## Trade-offs

| Decision | Benefit | Cost |
|---|---|---|
| Condition-driven | Precise, no waste | More parsing complexity |
| String truthy → "Sample" | Covers `if="brand.name"` patterns | Placeholder value, not real data |
| Comparison → simplest int | Covers `if="count > 0"` patterns | Doesn't test boundary behavior |
| Single `!=` alternative | Simple | Not perfectly accurate if multiple alternatives differ |
| Per-scenario style maps | Variant-accurate styles | More memory, more Playwright navigations |
| Tag-path matching fallback | Works without contract info on match side | Less precise than exact ID for complex operators |

## What's Missing (Future Work)

1. **`||` condition handling** — `if="isAdmin || isModerator"` currently generates two overrides (both true) in one scenario. Should ideally generate multiple scenarios — one per disjunct branch.
2. **Nested variant interactions** — `if="isSearching"` wrapping `if="hasSuggestions"` — the inner condition needs the outer condition to also be true. Current compound handling works if both appear in one `if`, but not for structurally nested separate `if` elements.
3. **ForEach data scenarios** — Repeaters need actual data arrays, not just boolean/enum overrides. Out of scope for this POC.
4. **Demo script** — A CLI script to trigger the import on a demo page and dump all debug artifacts for inspection without needing the Figma plugin.

## Verification Criteria

- [x] Boolean truthy/negated → true/false scenarios
- [x] Enum equality → one scenario per value
- [x] String truthy → "Sample" value, negated → empty string
- [x] Number truthy → "1", comparison operators → correct boundary value
- [x] Compound `if="a && b"` → single scenario with all needed overrides
- [x] Compound with mixed types (enum+enum, boolean+negated, boolean+comparison)
- [x] Duplicate conditions → deduplicated
- [x] Nested paths (`product.inStock`) → correct `vs.product.inStock=` query string
- [x] `!=` operator → picks alternative enum value
- [x] Real-world store-light page pattern (14 conditions, including string truthy and compound)
- [x] All existing import tests still pass (195/195)
