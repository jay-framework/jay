# Design Log 184 — a11y adjacent-identical-text false positive on forEach siblings

Status: **Bug report — awaiting fix**

## Background

The a11y-validator (DL#145 pluggable validation, catalog in DL#147) includes a rule
`checkDuplicateAdjacentText` that warns when two **adjacent element siblings** have
identical visible text — the classic "screen reader announces it twice" pattern
(e.g. a decorative icon next to a label repeating the same word).

Source: `packages/plugins/a11y-validator/lib/validators/a11y-validator.ts`
- `checkDuplicateAdjacentText` — lines 558–590
- `getVisibleText` — lines 553–556

The rule compares `getVisibleText(current) === getVisibleText(next)` where
`getVisibleText` returns `el.textContent` (minus elements whose *own* `aria-hidden === "true"`).

## Problem

The rule fires **false positives** on the framework's own documented slow+fast list
pattern (DL#08 in the wix repo / `loadedItems` sub-contract). A list page renders two
**adjacent `forEach` loops** into the same grid — one over build-time `items`, one over
client-appended `loadedItems`:

```html
<div class="recipes-grid">
  <article class="recipe-card" forEach="recipes.items" trackBy="_id"> ... </article>
  <article class="recipe-card" forEach="recipes.loadedItems" trackBy="_id"> ... </article>
</div>
```

Because both `<article>` templates are byte-identical, `getVisibleText` returns the same
string for each (the raw template text, including `{binding}` placeholders such as
`"{title} ⏱️ {preparationTime} 👥 {serving..."`). The rule reports:

```
⚠ Adjacent <article> and <article> have identical text "{title} ⏱️ {preparationTime}..."
  — screen readers will announce it twice
```

This is wrong: at **runtime** the two loops render different collections (different
records), so there is no repeated DOM node and no double announcement. The duplication
is an artifact of comparing *unexpanded template* text.

### Reproduction (wix examples repo)

Both are the intended `items` + `loadedItems` pattern; both emit the false positive:

- `examples/cms/src/pages/recipes/page.jay-html`
  - `.recipes-grid` at line 244
  - `<article forEach="recipes.items">` at line 246
  - `<article forEach="recipes.loadedItems">` at line 275
- `examples/cms/src/pages/food-service-product-lines/page.jay-html`
  - `.product-lines-grid` at line 230
  - `<article forEach="productLines.items">` at line 232
  - `<article forEach="productLines.loadedItems">` at line 244

These are the last remaining validate warnings in the `cms` example after all genuine
a11y/SEO/wix-media warnings were fixed. There is currently **no way to silence them**:
the a11y-validator has no suppression mechanism (unlike wix-media/SEO which honor
`<script type="application/jay-validations">`), and neither `aria-hidden` nor text
differentiation is appropriate for a legitimate, distinct-content dynamic list.

## Root Cause

`checkDuplicateAdjacentText` treats the static jay-html template as if it were final DOM,
and `getVisibleText` (`a11y-validator.ts:553-556`) **collapses each element's entire
subtree** to one `textContent` string before comparing. That is only meaningful for
**simple, static** elements. The moment an element's subtree contains a dynamic construct —
`forEach`/`slowForEach` (repeats into N distinct records) or `if`/`when-resolved`/
`when-loading`/`when-rejected` (may not render at all, or renders per-item-scoped
`{binding}` text) — the collapsed static template text no longer represents the runtime DOM,
so the equality test is comparing artifacts, not what a screen reader will announce.

The rule was designed for the narrow, genuine case: two adjacent **leaf-ish static text
elements** that announce the same word twice (a decorative icon next to its label). It has
no business comparing two *complex* subtrees at all.

## Proposed Fix

Reframe the rule around its actual intent: **only compare two elements when both are
"simple" (fully static) subtrees; bail if either is complex.** An element is *complex* when
its subtree (itself or any descendant) carries a dynamic directive — `forEach`,
`slowForEach`, `if`, `when-resolved`, `when-loading`, `when-rejected`. This single guard
replaces the earlier "skip when the element *itself* has `forEach`" idea, which was too
narrow: it missed the very common case of two `<div>`s whose `forEach`/`if` lives on a
**child** (see DL#185), forcing ancestor/descendant-walking and `{binding}` heuristics that
are more machinery than this rule warrants.

```ts
const DYNAMIC_DIRECTIVES = ['forEach', 'slowForEach', 'if',
    'when-resolved', 'when-loading', 'when-rejected'];

// true if el or any descendant carries a dynamic directive → flattened text is unreliable
function isDynamicSubtree(el: any): boolean {
    if (DYNAMIC_DIRECTIVES.some((d) => el.getAttribute?.(d) != null)) return true;
    return (el.childNodes ?? [])
        .filter((n: any) => n.nodeType === 1)
        .some((child: any) => isDynamicSubtree(child));
}

// ...inside the pair loop, before the currentText === nextText check (~line 567):
if (isDynamicSubtree(current) || isDynamicSubtree(next)) continue;
```

`el.getAttribute?.(...)` is the same element-model accessor already used elsewhere
(`packages/compiler/compiler-shared/lib/validator-utils.ts:83`), so it is available here.

**Scope the check to the subtree (self + descendants), NOT ancestors.** A shared `forEach`
**ancestor** with two simple, same-scope siblings (`<label>{name}</label>` next to
`<span>{name}</span>`) *does* render identical text every iteration — a real duplicate the
rule should still catch. Only self/descendant dynamics make the flattened text unreliable.

### Alternatives considered

1. **Skip only when the element *itself* has `forEach`** (the original narrow guard).
   Rejected: misses child-`forEach` and `if`-container cases (DL#185 Shapes A/B), which are
   the majority of real-world hits.
2. **Ignore `{binding}` placeholders in `getVisibleText`** (treat any text with a binding as
   non-comparable). Rejected: over-suppresses genuine duplicates where two adjacent
   **same-scope** `{name}` elements *do* render identically at runtime. The "is the subtree
   dynamic" test is more precise about *why* the text is unreliable.
3. **Add a suppression mechanism to the a11y-validator** (honor
   `<script type="application/jay-validations">` like the other validators). Worth doing
   regardless (see below), but it shifts the burden onto every author of a correct
   dynamic layout, so it should not be the *only* fix.

### Secondary recommendation

Independently, consider giving the a11y-validator the same rule-level suppression support
the wix-media and SEO validators already have (`application/jay-validations`), so
edge-case false positives across *all* a11y rules can be acknowledged per-page. DL#147
documents the catalog; this rule currently has no escape hatch.

## Verification

1. Add the `isDynamicSubtree` guard (self + descendants; the dynamic-directive set).
2. Rebuild the a11y-validator plugin.
3. Run `npm run validate` in `examples/cms` — the two `recipes` /
   `food-service-product-lines` list pages report **0 warnings** with no template changes.
4. Run `npm run validate` in the product `[slug]` examples from **DL#185**
   (`jay-onsko-shop`, `jay-studio-store`, `misprint-goods-jay`, `jay-store-light`) — the
   options/modifiers pages (child-`forEach` and `if`-container cases) also report **0**
   adjacent-identical-text warnings, confirming this single guard subsumes DL#185's cases.
5. Regression — a genuine adjacent duplicate in a **fully static** subtree (two static
   `<span>★</span>` icons, or a visible label repeating an adjacent control's static text,
   with **no** `forEach`/`if`/`when-*` anywhere in either subtree) must **still warn**.
   Confirm against the existing a11y-validator unit tests / fixtures.
6. Regression (ancestor scope) — two simple, same-scope siblings under a shared `forEach`
   **ancestor** whose text renders identically each iteration must **still warn** (the guard
   checks subtree, not ancestors).

## Notes

- This DL's fix (bail when either compared element has a dynamic subtree) **supersedes**
  DL#185's guard-broadening (child/ancestor `forEach` walking + `{binding}` regex): all of
  DL#185's Shape A/B cases bail here because one element's subtree is dynamic. DL#185's
  **`getVisibleText` descendant-`aria-hidden`** fix and the suppression recommendation
  remain independently valid — see DL#185.
- The wix examples were fully de-warned around these two files; once the validator is
  fixed, no `cms` template changes are needed.
- Related a11y logs: DL#185 (scoped-binding false positives — same rule), DL#166 (form/label
  rules), DL#167 (nested interactive), DL#147 (rules catalog).
