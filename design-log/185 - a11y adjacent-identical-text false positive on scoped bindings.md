# Design Log 185 — a11y adjacent-identical-text false positive on scoped bindings (label/select, options/modifiers)

Status: **Bug report — awaiting fix**

> Follow-on to **DL#184 (a11y adjacent-identical-text false positive on forEach siblings)**.
> DL#184 fixed the case where the two adjacent elements are _themselves_ `forEach` loops
> (`items` / `loadedItems`). The examples below hit the **same rule** but through two paths
> its proposed fix does **not** cover: (a) adjacent plain elements whose text comes from a
> **child** `forEach`/scope (`<label>{name}</label>` next to `<select><option forEach>{name}</option></select>`),
> and (b) adjacent `if`-guarded container `<div>`s whose text **aggregates** from descendant
> `forEach` loops (`product-options` next to `product-modifiers`). It also surfaces a
> separate defect in `getVisibleText` (descendant `aria-hidden` is ignored).

## Background

The a11y-validator rule `checkDuplicateAdjacentText` warns when two **adjacent element
siblings** have identical visible text ("screen reader announces it twice").

Source: `packages/plugins/a11y-validator/lib/validators/a11y-validator.ts`

- `checkDuplicateAdjacentText` — lines 558–590 (compares `getVisibleText(current) === getVisibleText(next)`)
- `getVisibleText` — lines 553–556 (`el.textContent`, minus the element's **own** `aria-hidden`)

DL#184 added (or proposes) a guard: skip the pair when **either element itself** carries a
`forEach` attribute. That is correct but narrow — it only matches when the repeating element
_is_ the loop.

## Problem

The product-detail pages in the design-to-code examples embed a standard Wix-stores options
UI: for each product **option** (and each **modifier**), a label/title plus a `<select>` of
choices. This produces two false-positive shapes the DL#184 guard misses.

### Shape A — label adjacent to a select whose options loop a _child_ collection

```html
<!-- one option group -->
<div class="option-group" forEach="productPage.options" trackBy="_id">
  <label class="option-label" for="option-{_id}">{name}</label>
  <!-- option-group name, e.g. "Size" -->
  <select id="option-{_id}" class="select" if="optionRenderType == TEXT_CHOICES" ...>
    <option forEach="choices" trackBy="choiceId" value="{choiceId}">{name}</option>
    <!-- choice name, e.g. "Small" -->
  </select>
</div>
```

`getVisibleText(<label>)` = `"{name}"`; `getVisibleText(<select>)` = `"{name}"` (the child
`<option>`'s text). They are adjacent siblings and **neither element itself** has a `forEach`
attribute (the loop is on the parent `option-group`; the option loop is a _descendant_ of the
`<select>`). So the DL#184 `forEach`-on-self guard does not fire, and the rule warns:

```
⚠ Adjacent <label> and <select> have identical text "{name}" — screen readers will announce it twice
```

At runtime the two `{name}` bindings resolve in **different scopes** — `productPage.options[i].name`
("Size") vs `choices[j].name` ("Small") — so nothing is announced twice. The identity is purely
an artifact of comparing unexpanded template tokens.

### Shape B — adjacent `if`-guarded containers whose text aggregates from descendant loops

```html
<div class="product-options" if="productPage.options">... forEach="productPage.options" ...</div>
<div class="product-modifiers" if="productPage.modifiers">
  ... forEach="productPage.modifiers" ...
</div>
```

`getVisibleText` on each `<div>` returns its whole subtree's `textContent`, which collapses to
`"{name} {name}"` (option-title `{name}` + option `{name}`) for **both** divs. They are adjacent,
and neither `<div>` itself carries `forEach` (they carry `if`; the loops are descendants). The
rule warns:

```
⚠ Adjacent <div> and <div> have identical text "{name} {name}" — screen readers will announce it twice
```

Again false: `productPage.options` and `productPage.modifiers` are different collections.

### Secondary defect — `getVisibleText` ignores _descendant_ `aria-hidden`

`jay-store-light` already applies the documented remediation — it uses a non-`<label>`
title and marks it `aria-hidden`:

```html
<div class="options-section" if="productPage.options">
  <div class="option-block" forEach="productPage.options" trackBy="_id">
    <div class="option-title" aria-hidden="true">{name}</div>
    <!-- decorative duplicate, hidden -->
    <select class="select" ... aria-label="{name}">
      <option forEach="choices">{name}</option>
    </select>
    ...
  </div>
</div>
```

It **still** gets the Shape-B `<div> and <div>` warning, because `getVisibleText`
(a11y-validator.ts:554) only returns `''` when **the element passed in** has
`aria-hidden="true"` — it does **not** strip `aria-hidden` descendants from the aggregated
`textContent`. So the author's `aria-hidden="true"` on `option-title` is disregarded when the
parent `options-section` divs are compared. The author has done everything right and cannot
silence the warning.

## Reproduction (design-to-code examples repo)

Shape A + Shape B (uses `<label>`):

- `jay-onsko-shop/src/pages/product/[slug]/page.jay-html`
  - `<div class="product-options" if="productPage.options">` — line 307
  - `<label class="option-label" for="option-{_id}">{name}</label>` — line 309
  - `<select id="option-{_id}" ...>` with `<option forEach="choices">{name}</option>` — lines 312–317
  - `<div class="product-modifiers" if="productPage.modifiers">` — line 334 (adjacent to product-options)
- `jay-studio-store/src/pages/products/[slug]/page.jay-html` — same options/modifiers pattern
- `misprint-goods-jay/src/pages/product/[slug]/page.jay-html` — same options/modifiers pattern

Shape B only, with the `aria-hidden` remediation already applied (secondary defect):

- `jay-store-light/src/pages/products/ceramic-flower-vase/page.jay-html`
  - `<div class="options-section" if="productPage.options">` — line 450
  - `<div class="option-title" aria-hidden="true">{name}</div>` — line 452 (ignored by getVisibleText)
  - `<div class="options-section" if="productPage.modifiers">` — line 475 (adjacent)

These are the last remaining a11y warnings in all four examples after every genuine
a11y/SEO/wix-media/design-system warning was fixed. As DL#184 notes, the a11y-validator has
**no suppression mechanism**, and neither `aria-hidden` nor text differentiation is
appropriate for legitimate, distinct-content dynamic UI.

## Root Cause

`checkDuplicateAdjacentText` treats the static jay-html template as final DOM. The DL#184
guard only inspects `forEach` on the two compared elements themselves. But the repeating /
scoping binding is frequently on a **child** (`<option forEach>`, swatch buttons) or an
**ancestor** (`option-group forEach`), and the compared element carries only `if` or nothing.
Comparing collapsed template text across different binding scopes is meaningless.

Separately, `getVisibleText` only checks `aria-hidden` on the passed element, so
`aria-hidden` on any descendant is not honored — the aggregated `textContent` used for
container-vs-container comparison still includes hidden decorative text.

## Proposed Fix

> **Update:** fix 1 below is now handled by **DL#184's revised rule** — skip the pair when
> either compared element's **subtree** (self or any descendant) carries a dynamic directive
> (`forEach`/`slowForEach`/`if`/`when-*`). Both Shape A (the `<select>` has a `forEach`
> descendant) and Shape B (the `<div>`s carry `if` and contain `forEach` descendants) bail
> under that single guard — no separate `{binding}` regex or ancestor-walk is needed. This
> section is kept for the reproduction record; **fix 2 (descendant `aria-hidden`) and fix 3
> (suppression) remain the distinct contributions of this log.**

1. **(Superseded by DL#184.)** ~~Broaden the guard to descendants/ancestors via a
   `{binding}` regex + subtree/ancestry `forEach` walk.~~ DL#184's `isDynamicSubtree(current)
|| isDynamicSubtree(next)` guard already covers every Shape A/B case here. Note DL#184
   deliberately scopes the check to **subtree, not ancestors**: two simple same-scope
   siblings under a shared `forEach` ancestor render identical text each iteration and should
   still warn — so the ancestor-walk originally proposed here would have wrongly suppressed a
   real duplicate.

2. **Fix `getVisibleText` to honor descendant `aria-hidden`.** Instead of raw
   `el.textContent`, walk the subtree and drop the text of any node with
   `aria-hidden="true"`. This makes the author's remediation (`aria-hidden` on the decorative
   duplicate) actually reduce the compared text, and matches how assistive tech computes the
   accessible name.

3. **Add a suppression mechanism** to the a11y-validator (honor
   `<script type="application/jay-validations">` as wix-media/SEO already do), as DL#184's
   secondary recommendation notes — an escape hatch for residual edge cases across all a11y
   rules.

Fix 1 lands as part of DL#184 (the unified dynamic-subtree guard). Fix 2 is this log's own
change and is independent; fix 3 is the safety net.

## Verification

1. DL#184's `isDynamicSubtree` guard is in place; apply the `getVisibleText`
   descendant-`aria-hidden` fix (fix 2) here.
2. Rebuild the a11y-validator plugin.
3. `npm run validate` in each of `jay-onsko-shop`, `jay-studio-store`, `misprint-goods-jay`,
   `jay-store-light` — the product-detail options/modifiers pages report **0** a11y
   adjacent-identical-text warnings, with **no template changes**.
4. Regression: a genuine adjacent duplicate with **static** text and **no** loop scope
   (e.g. two static `<span>★</span>`, or a visible label duplicating an adjacent control's
   static text) must still warn. Confirm against existing a11y-validator unit tests.
5. Regression for fix 2: a decorative descendant marked `aria-hidden="true"` is excluded from
   the compared text (a container whose only "duplicate" text is inside an `aria-hidden`
   descendant does not warn).

## Notes

- The four examples need **no** template changes once the validator is fixed; the
  `for`/`id` label↔select association added in `jay-onsko-shop` (a genuine a11y improvement)
  is orthogonal and stays.
- Related: **DL#184** (forEach-sibling case + suppression recommendation — this log extends
  it), DL#147 (a11y rules catalog), DL#145 (pluggable validation), DL#166 (form/label rules).

## Implementation Results (2026-09-08)

**Status: implemented** (in `packages/plugins/a11y-validator/lib/validators/a11y-validator.ts`,
alongside DL#184).

- **Fix 1 (guard broadening)** — landed as DL#184's unified `isDynamicSubtree` guard; both Shape A (the
  `<select>` has a `forEach` descendant) and Shape B (the `if`-divs contain `forEach` descendants) now bail
  under it. No separate `{binding}` regex or ancestor-walk was added.
- **Fix 2 (descendant `aria-hidden`)** — `getVisibleText` now delegates to a recursive
  `collectVisibleText(node)` that returns `''` for any node (or subtree) with `aria-hidden="true"`, then
  trims/normalizes whitespace. Previously it only checked `aria-hidden` on the passed element.
- **Fix 3 (suppression)** — implemented, not deferred. The plumbing was trivial and per-validator: the
  `<script type="application/jay-validations">` YAML is parsed centrally
  (`compiler-jay-html/jay-html-parser.ts:parseValidationOverrides`) and delivered on
  `ctx.validationOverrides`. Added `isSuppressed(ctx, rule)` reading a new `a11y:` namespace
  (`ctx.validationOverrides?.a11y?.[rule] === true`), mirroring the seo/design-system shape, and wired it
  into this one rule via `allow-adjacent-duplicate-text` (early-return when set). Selective, matching how
  seo/design-system apply suppression per-rule. Extending the `a11y:` namespace to other rules is a
  mechanical follow-up if wanted.

**Tests** (`test/validators/a11y-validator.test.ts`; no `toContain`): duplicate only inside an
`aria-hidden` descendant → 0; visible duplicate alongside an `aria-hidden` decorative node → still flags;
`allow-adjacent-duplicate-text: true` → 0; override absent → still flags.

**Results:** a11y-validator suite 75/75 (combined with DL#184); `tsc` clean; monorepo `yarn confirm`
green.
