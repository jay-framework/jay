# Design Log #127 — Unfolded Variant View

## Background

The editor needs a view that renders a page "unfolded" — showing all variant states side by side instead of only the active branch. This helps designers see every visual state without toggling variants manually.

A page with a variant `stockStatus: enum(IN_STOCK | OUT_OF_STOCK)` currently renders ONE branch. The unfolded view renders both branches side by side, labeled by their variant value.

This is recursive: if variant branch A contains another variant with 2 values, that branch expands further horizontally (tree expansion layout).

Related design logs: #50 (rendering phases), #75 (slow render conditionals), #112 (hydration ViewState consistency).

## Problem

Designers working on jay-html pages need to see all variant states to ensure the UI handles every case. Today they must:

1. Change the ViewState data manually to see each variant
2. Reload the page for each variant
3. Remember which combinations they've checked
4. Hope they didn't miss an edge case

This is error-prone, especially with nested variants (e.g., product card with `stockStatus` inside a forEach with `optionType`).

## Questions

1. **Q: What data should the unfolded view use?**

   **A:** Start with slow + fast rendered ViewState. But we also need to support interactive ViewState — some visual states are only reachable on the client (e.g., showing the current cart, a modal after a click). The solution: a "save ViewState" operation on a live page that captures the current state. The unfolded view can then load a saved ViewState by name.

2. **Q: How should forEach items with nested variants be handled?**

   **A:** Show the forEach with actual data. For variants inside forEach items, show ONE representative item's variants on the side — don't multiply every item by every variant.

3. **Q: Where does the unfolded view live?**

   **A:** Dev-server route. For fast ViewState, a URL parameter works: `?_jay_unfold=true`. For interactive ViewState, use a saved ViewState name: `?_jay_unfold=<savedName>`. The save operation stores a snapshot of the page's ViewState at any point during interaction.

4. **Q: Should it be interactive?**

   **A:** No — static rendering. It's a visual snapshot for inspection.

5. **Q: Should boolean variants (`if="inStock"` / `if="!inStock"`) be unfolded?**

   **A:** Yes. Boolean conditions are unfolded as two branches (true/false). Each branch is labeled with the condition expression (e.g., `inStock = true`, `inStock = false`).

6. **Q: How to handle multiple top-level variants?**

   **A:** Depends on whether the variants are in the same conditional region. If two variants control different parts of the page (different `if` conditions in different locations), each unfolds independently in its own section — no cross-product. If they're combined in the same condition (e.g., `if="a && b"`), they render together.

7. **Q: Should the URL accept parameters to control which variants to unfold?**

   **A:** Probably not needed, especially with saved ViewState names in the URL.

## Design

### Saved ViewState

The automation API already exposes `getPageState().viewState` on live pages. To support unfolding from interactive states:

1. **Save operation**: On a live page, call `window.__jay.automation.getPageState()` → serialize the full ViewState → store it on the dev-server under a name (e.g., `POST /_jay/save-viewstate/:name`)
2. **Load for unfolding**: `?_jay_unfold=<savedName>` loads the saved ViewState as the base for unfolding
3. **Default**: `?_jay_unfold=true` uses slow+fast ViewState (no saved state needed)

### Variant Discovery

Walk the `Contract` tag tree recursively. At each level, collect variant tags with their enum values. Track forEach boundaries to distinguish page-level from item-level variants.

```
Contract analysis result:

  Page-level variants:
    - stockStatus: [IN_STOCK, OUT_OF_STOCK]    (at <div if="stockStatus===IN_STOCK">)
    - productType: [PHYSICAL, DIGITAL]          (at <section if="productType===PHYSICAL">)

  forEach "items" variants:
    - itemState: [active, inactive]

  forEach "items" > forEach "options" variants:
    - optionType: [TEXT, COLOR]
```

Use `parseIsEnum()` / `parseEnumValues()` from `compiler-jay-html/lib/expressions/expression-compiler.ts` to extract values. Boolean variants are 2-value: `[true, false]`.

### Partial Unfolding

Key insight: **don't duplicate the whole page per variant**. Only the conditional region (the `if` block and its siblings) is unfolded. The rest of the page renders once.

```html
<!-- Original page -->
<div>
  <h1>{title}</h1>
  <!-- rendered once -->
  <div if="stockStatus===IN_STOCK">...</div>
  <!-- unfolded -->
  <div if="stockStatus===OUT_OF_STOCK">...</div>
  <p>{description}</p>
  <!-- rendered once -->
</div>
```

The unfolded view renders the page once, but at each conditional region, shows ALL branches side by side with labels:

```
┌──────────────────────────────────────────────────┐
│ <h1>Widget</h1>                                  │  ← rendered once
├──────────────────────────────────────────────────┤
│ stockStatus                                      │  ← label
├──────────────────────┬───────────────────────────┤
│ stockStatus=IN_STOCK │ stockStatus=OUT_OF_STOCK  │  ← condition labels
│ ┌──────────────────┐ │ ┌───────────────────────┐ │
│ │ [branch content] │ │ │ [branch content]      │ │  ← only the if-block
│ └──────────────────┘ │ └───────────────────────┘ │
├──────────────────────────────────────────────────┤
│ <p>Description</p>                               │  ← rendered once
└──────────────────────────────────────────────────┘
```

If two variants are in **different locations** on the page, each unfolds independently at its own position. No cross-product needed.

If a variant branch itself contains another variant, it recursively expands within its column.

### ViewState Manipulation

For each variant group, create ViewState copies with the variant value set:

```typescript
const baseVS = { stockStatus: 'IN_STOCK', productName: 'Widget', ... };
// For rendering each branch:
const branchVS = [
  { ...baseVS, stockStatus: 'IN_STOCK' },
  { ...baseVS, stockStatus: 'OUT_OF_STOCK' },
];
```

For forEach item-level variants, extract a representative item:

```typescript
const representativeItem = baseVS.items[0];
const itemVariants = [
  { ...representativeItem, itemState: 'active' },
  { ...representativeItem, itemState: 'inactive' },
];
```

### Rendering Approach

Two possible approaches for partial unfolding:

**Approach A — Compile-time (server element modification):**
Modify the server element compiler to emit ALL conditional branches when in unfold mode, wrapped in a side-by-side layout container. Each branch gets a label element above it with the condition expression.

**Approach B — Post-render composition:**
Render the page N times (once per variant value), extract just the conditional region from each render, and compose them into a single page. Simpler to implement but requires identifying which DOM region corresponds to each conditional.

Approach A is more precise (renders exactly the conditional block, not the whole page). Approach B is simpler (no compiler changes).

### forEach Item Isolation

For nested variants inside forEach, render ONE representative item's variant branches on the side. Don't re-render the entire forEach list per variant.

### Condition Labels

Each unfolded branch gets a label showing the condition in human-readable form:

- Enum: `stockStatus = IN_STOCK`
- Boolean: `inStock = true` / `inStock = false`
- Negated: `!inStock` → `inStock = false`

## Key Files

| Purpose                           | File                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| Contract types + variant tag type | `compiler-jay-html/lib/contract/contract.ts`                   |
| Contract parsing                  | `compiler-jay-html/lib/contract/contract-parser.ts`            |
| Enum helpers                      | `compiler-jay-html/lib/expressions/expression-compiler.ts`     |
| Dev-server route handler          | `dev-server/lib/dev-server.ts`                                 |
| Server element compiler           | `compiler-jay-html/lib/jay-target/jay-html-compiler-server.ts` |
| ViewState merge                   | `view-state-merge/lib/index.ts`                                |

## Implementation Plan

### Phase 1: Saved ViewState API

Add to the dev-server:

- `POST /_jay/save-viewstate/:name` — saves a serialized ViewState snapshot (from automation API)
- `GET /_jay/save-viewstate/:name` — retrieves a saved snapshot
- Storage: simple JSON files in `build/saved-viewstates/`
- Client-side: button/shortcut on dev pages to trigger save via `window.__jay.automation.getPageState()`

### Phase 2: Variant discovery utility

Walk a `Contract` tag tree and produce a structured variant map:

- Tag name, enum values, nesting path (page-level vs forEach-scoped)
- Boolean variants as 2-value `[true, false]`
- Linked sub-contracts (follow `link` references)
- Repeated sub-contracts with nested variants
- Track which `if` conditions in the jay-html correspond to which variant tags

### Phase 3: Partial unfold rendering

The core rendering change — show all conditional branches at their location in the page:

- Parse the jay-html to find all `if` conditions
- For each conditional group (same variant tag), render all branches side by side
- Label each branch with the condition expression
- Non-conditional content renders once (no duplication)

### Phase 4: Dev-server unfolded route

Add `?_jay_unfold=true` (or `?_jay_unfold=<savedName>`) handling:

- Load base ViewState (slow+fast, or saved snapshot)
- Discover variants from contract
- Render the page with partial unfolding
- Serve as a single HTML page with CSS grid layout

### Phase 5: forEach item isolation

For nested variants inside forEach, render one representative item's branches on the side.

## Trade-offs

- **Static only** — no interactivity in the unfolded view. Simplest, uses real rendering pipeline
- **Partial unfolding** — only the conditional region is duplicated, not the whole page. Avoids bloat and makes the output scannable
- **Saved ViewState** — enables unfolding from any interactive state, not just server-rendered state. Requires a save step on the live page
- **Representative item for forEach** — avoids exponential blowup (N items × M variants)
- **Requires renderable page** — the base ViewState must be obtainable (slow+fast succeeds, or a saved snapshot exists)
