# DL#203 — CSS `@scope (…) to (…)` donut for region isolation

Status: **DESIGN — ready for review; implementation following.** Promoted from DL#201 Item 2. The user
confirmed full browser support can be assumed.

Related: #196 (flatten / `@scope` wrapping / CSS coalescing / scope-anchor class), #201 (Item 2).

---

## Decisions for the Implementer (TL;DR)

- **Emit the donut form `@scope (.<ref>) to (<direct-child-region-anchors>) { … }`** so a region's
  CSS stops at the boundary of each **direct** nested `<jay:X>` child region. Full browser support is
  assumed, so no build-time fallback (`:not()` guard / hoist) is needed.
- **The `to (…)` list is the scope-anchor classes of the region's _direct_ child regions** — exactly
  what `directRegions(region)` (`materialise.ts:173-184`) returns (it already stops at region
  boundaries). Build it in `fillRegions` right after `region.set_content(filled)` (line 144), reading
  each direct child's `ref` attribute (`.` + ref). If a region has no child regions, emit plain
  `@scope (.<ref>) { … }` (no `to`).
- **Coalescing key must include the `to` list.** Today `coalesceCss` keys only on `templatePath`
  (`materialise.ts:84-107`), assuming same-template ⇒ identical block. With donuts, two instances of
  the _same_ template can have **different** direct children (one has a `<jay:badge>` filled in, the
  other doesn't) → **different `to` lists** → they must **not** coalesce. New key =
  `templatePath + '\0' + sortedToAnchors.join(',')`. Add the `to` list to `CssContribution`
  (`materialise.ts:55-59`) and pass it to `scopeWrap`.
- **Non-materialisable child regions get no `to` entry.** A `<jay:X>` without a resolvable template is
  never flattened, so its `ref` is never stamped as a DOM class (`stampScopeAnchor` runs only in the
  fill path) — a `to (.ref)` would match nothing. Omit such children from the `to` list (document it);
  they are rare and already warn elsewhere.
- **Teach every `@scope` parser about the optional `to (…)` segment.** The scope-start regexes assume
  `@scope (…)` is immediately followed by `{`. They appear in **three** files and must tolerate an
  optional ` to (…)` before `{`:
  - `compiler-jay-html`-adjacent `scope-css.ts` — `tokenizeCss` header regex (`:50`) and
    `scopeInnerBody` strip (`:94`).
  - `stack-cli/lib/validate.ts` — `scopeBody` strip (`:1327`) and the block-extraction used by
    `checkRegionCssScoping` / `checkRegionCssDrift`.
  - `stack-cli/lib/run-sync.ts` — `narrowScopeBlock` scope-start rewrite (`:183`) must **preserve**
    the `to (…)` tail.
- **Validation canonical shape updates.** `checkRegionCssScoping` (`validate.ts:989-1035`): the
  `CSS-SCOPE-NOT-COALESCED` key (`template + scopeBody`, `:1021`) must also fold in the `to` list, or
  it will false-positive and tell the author to coalesce two blocks that legitimately differ by
  boundary. `CSS-SCOPE-MIXED-TEMPLATE` (`:1012`) is unaffected (keys on template identity).
- **CSS body diff is unaffected.** `to (…)` is header-only; `scopeReadyCss` / `:scope` rewrite
  (`materialise.ts:227-246`) and body-equality comparisons stay as-is — once the strip regexes ignore
  the `to (…)` tail.

---

## Background

The materialiser wraps each region's CSS in `@scope (.<ref>)` (DL#196, `scopeWrap`
`materialise.ts:195-197`). A plain `@scope (.ref)` matches **all** descendants — including the roots
and interiors of **nested** `<jay:X>` child regions flattened inside it. So a parent region's
descendant selectors bleed into a child region's DOM, breaking "each region owns its styles" and
complicating coalescing.

CSS has a purpose-built tool for exactly this — the **scoping limit** (donut):
`@scope (.parent) to (.child) { … }` styles the subtree **except** the islands rooted at the `to`
selectors.

## Problem

Region isolation currently relies on authors not writing descendant selectors that reach into child
regions. That is a convention, not a guarantee: a parent `.ds-card p { … }` will style a `<p>` inside a
nested `<jay:badge>` region. We want isolation to be **structural**.

## Prior Art / Adjacent Mechanisms

| Mechanism                                             | Where                             | Solves / Constrains                                                                        |
| ----------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `scopeWrap` (string concat of `@scope (sel) { css }`) | `materialise.ts:195-197`          | The single emit point; append ` to (…)` here.                                              |
| `directRegions` (boundary-stopping child walk)        | `materialise.ts:173-184`          | Exactly the direct-child enumeration for the `to` list — reuse as-is.                      |
| `stampScopeAnchor` (ref → real class on region roots) | `materialise.ts:253-257`          | Why the `to` targets exist as DOM classes; also why non-materialisable children have none. |
| `scopeReadyCss` / root→`:scope` rewrite               | `materialise.ts:227-246`          | Body rewrite; unaffected by `to`.                                                          |
| `coalesceCss` (key = `templatePath`)                  | `materialise.ts:84-107`           | Must extend key with the `to` list.                                                        |
| `CssContribution` type                                | `materialise.ts:55-59`            | Add the `to` list field.                                                                   |
| `tokenizeCss` / `splitScopeBlocks` / `scopeInnerBody` | `scope-css.ts:47-94`              | Header regex must tolerate `to (…)`.                                                       |
| `checkRegionCssScoping` / `scopeBody`                 | `validate.ts:989-1035, 1325-1331` | NOT-COALESCED key folds `to`; strip regex tolerates `to`.                                  |
| `mergeScopeCss` / `narrowScopeBlock`                  | `run-sync.ts:111-183`             | Block identity + scope-start rewrite must preserve `to`.                                   |

**Null hypothesis (why not keep plain `@scope` + author discipline):** The bleed is a real
correctness gap that no existing primitive closes without author vigilance. `to (…)` is the
standard, declarative fix and we already compute its inputs (`directRegions` + stamped anchors), so
the new surface is a single header segment, not a new mechanism.

## Questions and Answers

**Q: Where do the `to` anchors come from, and are they available at emit time?**
A: `directRegions(region)` after `region.set_content(filled)` (`fillRegions`, between `:144` and the
CSS wrap at `:146-165`). The filled body already contains the nested `<jay:X ref>` elements; read each
`ref`. The child's own `.ref` **class** is stamped later (when that child is itself filled), but within
the same `materialise` run it always will be, so `to (.childRef)` resolves. (Per the trace.)

**Q: What breaks coalescing?**
A: Two instances of the same template with different child nesting produce different `to` lists; a
single coalesced `@scope (.a, .b) to (…)` can't be correct for both. Fix: fold the sorted `to` list
into the coalescing key so they split into separate blocks automatically. Instances with matching
template **and** matching child-anchor set still coalesce.

**Q: Non-materialisable child region as a boundary?**
A: It has no stamped class, so `to (.ref)` would match nothing. Omit it from the `to` list and
document. (These are uncommon and surfaced by other warnings.)

**Q: Does `to` affect CSS body equality / drift?**
A: No. It is header-only. Once the strip/parse regexes ignore the `to (…)` tail, `scopeBody` /
`scopeInnerBody` / `normalizeCssBody` compare the same bodies as before.

**Q: What about `checkRegionCssScoping`'s canonical-shape enforcement?**
A: MIXED-TEMPLATE keys on template identity (unaffected). NOT-COALESCED keys on `template + body` and
must also include the `to` list, else it demands coalescing of boundary-distinct blocks. MISSING
(in `checkRegionCssDrift`) is about presence of a block for `.ref`, unaffected.

## Design

### `CssContribution` + emit (`materialise.ts`)

```ts
interface CssContribution {
  key: string;
  selector: string | null;
  css: string;
  to?: string[];
}
function scopeWrap(css: string, selector: string, to?: string[]): string {
  const limit = to && to.length ? ` to (${to.join(', ')})` : '';
  return `@scope (${selector})${limit} {\n${css}\n}`;
}
```

In `fillRegions`, after `region.set_content(filled)` (`:144`):

```ts
const toAnchors = directRegions(region)
  .map((c) => readAttr(c, 'ref'))
  .filter((r): r is string => !!r && /* materialisable */ true)
  .map((r) => `.${r}`);
// push contribution { key: `${templatePath}\0${[...toAnchors].sort().join(',')}`, selector, css, to: toAnchors }
```

### Coalescing (`coalesceCss`)

Key already comes from `contribution.key` — just ensure it includes the sorted `to` list (above).
`scopeWrap(g.css, g.selectors.join(', '), g.to)` — the `to` list is identical across a group by
construction (same key), so any member's `to` is correct for the group.

### Parser tolerance (shared pattern)

Replace `@scope\s*\(\s*([^)]+?)\s*\)\s*\{` with a form that accepts an optional limit:
`@scope\s*\(\s*([^)]+?)\s*\)(?:\s*to\s*\(\s*([^)]+?)\s*\))?\s*\{`, capturing the `to` list as group 2.
Apply in `scope-css.ts:50`, `scopeInnerBody` `:94`, `validate.ts:1327`, and `run-sync.ts:183` (and any
sibling `@scope\s*\([^)]*\)\s*\{` strippers). `narrowScopeBlock` must re-emit the captured `to` tail.

### Validation key (`checkRegionCssScoping`)

NOT-COALESCED key becomes `` `${templates[0]} ${scopeBody(block)} ${toListOf(block)}` `` where
`toListOf` reads the (now-captured) sorted `to` members.

## Runtime trace (card with a nested badge)

Template `card.jay-html` flattens a nested `<jay:badge ref="badge">`. Page has two cards: `cardA` (with
the badge) and `cardB` (badge empty/absent).

1. `fillRegions` fills `cardA`; `directRegions(cardA)` → `[<jay:badge ref=badge>]` → `to=['.badge']`;
   contribution key `card.jay-html\0.badge`.
2. `fillRegions` fills `cardB`; no child region → `to=[]`; key `card.jay-html\0`.
3. `coalesceCss`: different keys → **two** blocks: `@scope (.cardA) to (.badge) { … }` and
   `@scope (.cardB) { … }`. Correct — `cardA`'s `.ds-card p` no longer reaches into the badge; `cardB`
   has nothing to exclude. ✓
4. If both had the badge: same key `card.jay-html\0.badge` → coalesced
   `@scope (.cardA, .cardB) to (.badge) { … }`. ✓
5. `validate` re-parses the page `<style>`; header regex captures `.cardA`/`.cardB` and `.badge` as the
   `to` list; NOT-COALESCED key includes `.badge`, so the two single-instance blocks in step 3 are
   **not** flagged for coalescing. ✓
6. `sync` (`mergeScopeCss` → `narrowScopeBlock`) re-emits each block preserving its `to (…)` tail;
   body equality unchanged → page `<style>` stable (validate-clean ⇔ sync-clean). ✓

## Implementation Plan

1. `materialise.ts` — `CssContribution.to`; `scopeWrap` limit; compute `to` in `fillRegions`; fold
   into the coalescing key.
2. `scope-css.ts` — header regex + `scopeInnerBody` strip tolerate `to (…)`; expose the `to` list from
   `tokenizeCss`/`splitScopeBlocks` where the validator needs it.
3. `validate.ts` — `scopeBody` strip tolerates `to`; NOT-COALESCED key folds the `to` list.
4. `run-sync.ts` — `narrowScopeBlock` preserves the `to` tail; `mergeScopeCss` block identity folds it.
5. **Tests** (fixture-based, `toEqual` / `prettifyHtml`; never `toContain`):
   - `materialise` unit: nested child region ⇒ `@scope (.ref) to (.child) { … }`; no child ⇒ plain
     block; two same-template instances with **differing** children ⇒ two blocks (not coalesced);
     with **matching** children ⇒ one coalesced `to` block.
   - `scope-css` unit: tokenizer round-trips a `to (…)` block (selectors + `to` list + body).
   - `validate` unit: canonical donut page is clean; a hand-coalesced block whose instances differ by
     boundary is flagged NOT-COALESCED correctly; `sync` leaves a canonical donut page unchanged.

## Trade-offs

- **Coalescing is slightly less aggressive.** Same-template instances with different child nesting no
  longer share a block. Correct by construction; the extra bytes compress well and are bounded by the
  number of distinct nesting shapes.
- **Regex surface across three files.** The `@scope` parsing is duplicated (postcss on the materialiser
  side, regex/brace on the stack-cli side). All scope-start matchers must learn `to (…)` or sync/
  validate silently corrupt blocks. Mitigated by centralizing the header regex where possible and by
  the round-trip tokenizer test.

## Verification criteria

1. A region with a direct child region emits `@scope (.<ref>) to (.<child>) { … }`; a leaf region emits
   plain `@scope (.<ref>) { … }`.
2. Same-template instances coalesce **iff** their direct-child-anchor sets match.
3. A parent region's descendant selector no longer styles DOM inside a nested child region (structural
   isolation).
4. `validate` on a canonical donut page is clean, and `sync` leaves it byte-identical
   (validate-clean ⇔ sync-clean holds with the `to` segment).

---

## Refinement (post-review) — require a `ref` on nested regions under scoped CSS

The design above omits a child region from the `to` list when it has no `ref` (nothing to anchor the
boundary on). That silently leaves the child **inside** the parent's scope — the parent's descendant
selectors bleed into it, the exact failure the donut exists to prevent. The reviewer chose **full
isolation**: a nested region under a CSS-shipping parent **must** be named, enforced by validation.

**Decision — require ref on nested regions (chosen over "best-effort donut").**

- **Rule `REGION-NESTED-NO-REF`** (`checkNestedRegionRefs`, `validate.ts`): for every region whose
  `template=` **ships CSS** and that has a `ref` (so it emits an `@scope (.<ref>)` block), every
  **materialisable** direct child region (`directChildRegions`) **must** carry a `ref`. A ref-less one
  is flagged — it cannot be stamped with a scope-anchor class, so the parent's donut cannot name it.
- **Non-materialisable children are out of scope.** A `<jay:Y>` imported without `template=` is never
  flattened or stamped, so it can never be a donut boundary; the rule skips it (it is nudged elsewhere
  by `REGION-NOT-LINKED`).
- **Consequence for the demo:** `.ds-button` CSS moved from `card.jay-html` into `button.jay-html`
  (region ownership), and every `<jay:button>` in the card/gallery/section templates gained
  `ref="cta"`. The card donut is now `@scope (.cardStarter, .cardPro) to (.cta)`, with the button's
  own styles in a separate `@scope (.cta)` block.

**No new validation for stale `to`.** Adding/removing a nested region changes the parent template's
markup, which is already **markup drift** caught by `checkRegionDrift`; `sync` then recomputes the `to`
list from the current children. So a `to` that no longer matches the nesting is never a distinct error
state — it is either drift (reported) or fixed by the next `sync`. The require-ref rule is the only new
validation this DL adds.

---

## Implementation Results

**Status: IMPLEMENTED.** All phases complete; tests green.

### What shipped (matches the plan)

1. **`materialise.ts`** — `CssContribution.to`; `scopeWrap(css, selector, to?)` appends ` to (…)`;
   `fillRegions` computes the deduped `to` list from `directRegions` and folds the sorted list into the
   coalescing key (`` `${templatePath}\0${[...to].sort().join(',')}` ``). Anchor stamping was decoupled
   from the region's own CSS and gated on `scoped || parentScoped`, so a child named by a parent's
   donut gets its `.<ref>` class even when it ships no CSS of its own.
2. **`scope-css.ts`** — `ScopeBlock.to`; `tokenizeCss` header regex captures the optional `to (…)`
   group; `scopeInnerBody` / `splitScopeBlocks` expose it.
3. **`validate.ts`** — `scopeBody` strip tolerates `to`; the NOT-COALESCED key folds the sorted `to`
   list (NUL-separated, matching the materialiser); **new** `checkNestedRegionRefs` +
   `directChildRegions`, wired into the run loop.
4. **`run-sync.ts`** — `narrowScopeBlock` preserves the `to (…)` tail on re-narrowing.

### Deviations

- **Selector + `to` de-duplication (new, not in the plan).** Two instances of one template that each
  nest a child sharing a `ref` (the demo: two cards each with a `ref="cta"` button) coalesced to
  `@scope (.cta, .cta)`. Fixed by de-duping both the coalesced selector list (`coalesceCss`) and the
  per-region `to` list (`fillRegions`). Found by the demo re-sync, not a unit test — now covered.
- **`narrowScopeBlock` exported** from `run-sync.ts` for a focused unit test of the `to`-preserving
  regex.

### Tests

- `compiler-inline-composition`: 100/100 (materialise donut emission, coalescing-by-boundary, dedup).
- `jay-stack-cli`: 127/127 — new `scope-css.test.ts` (tokenizer round-trips `to (…)`), new
  `checkNestedRegionRefs` fixtures (fires on a ref-less nested region, passes with a ref), new
  `narrowScopeBlock` `to`-preservation tests.
- `design-system-demo`: 8/8 smoke — the demo now flattens the full donut chain
  (`@scope (.hero) to (.grid)` → `(.grid) to (.cardStarter, .cardPro)` → `(.cardStarter, .cardPro) to
(.cta)` → `(.cta)`), and `validate` is clean of scoping / require-ref warnings.
