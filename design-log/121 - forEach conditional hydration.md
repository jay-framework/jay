# Design Log #121 — forEach Conditional Hydration

## Background

In jay-html, `j-if`/`j-else` conditions inside a `forEach` render correctly during SSR but fail to toggle after hydration. The condition update is silently ignored.

### Related Design Logs

- #93 — Client hydration
- #99 — Hydration coordinate alignment bugs
- #100 — Hydrate conditional creation fallback
- #106 — Hydrate dynamic elements with Kindergarten

## Problem

Given this template:

```html
<div class="item" forEach="items" trackBy="_id">
  <span class="name">{name}</span>
  <span class="badge" if="isActive">Active</span>
  <span class="badge-off" if="!isActive">Inactive</span>
  <button ref="toggleButton">Toggle</button>
</div>
```

Initial SSR render is correct — items with `isActive=true` show "Active", others show "Inactive". But clicking "Toggle" does nothing. The condition never updates.

### Root Cause

`hydrateConditional` needs a `KindergartenGroup` (set via `_setGroup`) to insert/remove DOM nodes when the condition changes. This group is assigned by `adoptDynamicElement`, which creates a Kindergarten and iterates children, calling `_setGroup` on dynamic ones.

But forEach items bypass `adoptDynamicElement`. The compiler generates either:

1. **Flat array** (no item adoption needed): `() => [hydrateConditional(...), hydrateConditional(...)]`
2. **`adoptElement`** (item has dynamic attrs/ref): `() => [adoptElement("", attrs, [hydrateConditional(...)])]`

Neither `hydrateForEach`'s flat-array handling (hydrate.ts:462-476) nor `adoptElement` (hydrate.ts:218-220) creates a Kindergarten or calls `_setGroup`. The conditional's `group` stays `null`, and updates bail out at `if (!group) return;` (hydrate.ts:360).

For comparison, regular elements with conditional children use `adoptDynamicElement` (compiler detects `hasInteractiveChildren` at line 963 and switches at line 1039).

### Reproduction

Test 10c (`packages/jay-stack/dev-server/test/10c-nested-conditional/`) now includes a toggle button and interactive phase. SSR disabled mode passes (element target handles conditionals correctly). SSR modes fail on interactivity — the toggle has no effect.

## Design

### Approach: Generate `adoptDynamicElement` for forEach items with interactive children

The compiler already generates `adoptDynamicElement` with `STATIC` sentinels for regular elements with interactive children (jay-html-compiler-hydrate.ts lines 1039-1092). Apply the same pattern to forEach item adoption.

**File:** `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler-hydrate.ts`

In the forEach adopt body generation (lines 296-334):

1. Compute `itemHasInteractiveChildren` — same check as line 963-972: any direct child is an interactive conditional or a nested forEach
2. When true, generate `adoptDynamicElement("", attrs, [STATIC, hydrateConditional(...), hydrateConditional(...), STATIC])` — the item wrapper creates a Kindergarten and calls `_setGroup` on dynamic children
3. When `needsItemAdoption` without interactive children — keep `adoptElement` (existing path)
4. When neither — keep flat array (existing path)

When both `itemHasInteractiveChildren` and `needsItemAdoption` are true, `adoptDynamicElement` handles everything (it calls `adoptBase` internally, which handles dynamic attrs and refs).

### Generated Code Example

Before (broken):

```javascript
hydrateForEach(vs => vs.items, '_id',
    () => [
        adoptText('0/0', vs1 => vs1.name),
        hydrateConditional(vs1 => vs1.isActive, () => adoptElement('0/1', {}), ...),
        hydrateConditional(vs1 => !vs1.isActive, () => adoptElement('0/2', {}), ...),
    ],
    (item, id) => { ... },
)
```

After (fixed):

```javascript
hydrateForEach(vs => vs.items, '_id',
    () => [
        adoptDynamicElement("", {}, [
            STATIC,
            hydrateConditional(vs1 => vs1.isActive, () => adoptElement('0/1', {}), ...),
            hydrateConditional(vs1 => !vs1.isActive, () => adoptElement('0/2', {}), ...),
            STATIC,
        ]),
    ],
    (item, id) => { ... },
)
```

The `STATIC` sentinels mark the `<span class="name">` and `<button>` positions so the Kindergarten can compute correct insertion offsets.

## Implementation Plan

1. In the forEach adopt body generation, add `itemHasInteractiveChildren` check
2. When true, build children array with `STATIC` / dynamic child classification (same pattern as lines 1039-1078)
3. Generate `adoptDynamicElement` call wrapping the children
4. Add `Import.adoptDynamicElement` and `Import.STATIC` to imports
5. Update expected-hydrate.ts and expected-ssr.html fixtures for test 10c
6. Run tests

## Verification

1. `cd packages/jay-stack/dev-server && yarn vitest run test/hydration.test.ts -t "10c"` — all pass including SSR interactivity
2. `cd packages/jay-stack/dev-server && yarn vitest run` — full suite passes
3. `cd packages/compiler/compiler-jay-html && yarn vitest run` — all pass
