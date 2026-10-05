# DL#209 — Region ships CSS but has no `ref` (sync silently drops it)

Status: **IMPLEMENTED — severity decided: error (user).**

## Decisions for the Implementer (TL;DR)

- **Problem:** a flattened region whose backing `template=` ships CSS but whose `<jay:X>` tag has
  **no `ref`** loses its CSS on `sync`. The materialiser emits that CSS **unscoped/global**
  (no `.ref` to scope to); `mergeScopeCss` then re-emits **only `@scope` blocks**, so the unscoped
  block is never carried back into the page `<style>`. The styling silently vanishes. ✅ verified
- **Root cause is structural, not a sync bug:** without a `ref` there is no scope anchor, so the CSS
  _cannot_ be scoped, and unscoped region CSS is exactly what sync is designed to drop (it only owns
  `@scope` blocks it generated). So the fix is **not** "make sync copy it" — copying unscoped region
  CSS would leak the region's styles globally. The fix is **validation**: tell the author to add a
  `ref` so the CSS can be scoped and survive. Prevention-first (CLAUDE.md), not a framework change.
- **New rule (proposed name `REGION-CSS-NO-REF`):** for every top-level `<jay:X>` region whose
  resolved `template=` ships non-empty `<style>` CSS **and** whose element has no `ref=`, emit a
  diagnostic: "This region's template ships CSS, but the region has no `ref`, so its CSS cannot be
  scoped and `sync` will drop it. Add `ref="…"`."
- **Fills a real gap** — no existing rule covers the _top-level_ ref-less CSS region:
  - `checkRegionCssDrift` **skips ref-less regions** (`validate.ts:984-985`), so it never flags this.
  - `checkNestedRegionRefs` (DL#203) only covers a ref-less region **nested inside** a CSS-shipping
    parent — not a top-level ref-less CSS region. ✅ verified (research pass)
- **Where/how (mirror `checkNestedRegionRefs`, `validate.ts:1102-1146`):** iterate
  `collectRegionElements(jayHtml.body)`; resolve the import (the `validate.ts:1264` pattern); fire when
  `templateShipsCss(imp.template)` (reuse the closure at `1111-1119`: `extractStyleCss(content).trim()
!== ''`) is true **and** `region.getAttribute('ref')` is absent. Template bytes come from the
  injected `readTemplateRel` reader (`validate.ts:1981-1987`). ✅ verified data is reachable.
- **OPEN DECISION (for the author): warning or error?** See Q1. Default proposal below is **error**,
  because unlike a drift or a missing-reuse nudge, this one **silently deletes authored styling** —
  but it is listed as the open question the user flagged.

## Background

DL#196 flattens a component `.jay-html` into a page as a `<jay:X>` region: markup plus its CSS,
re-emitted into the page `<style>` as an `@scope (.ref) { … }` donut (DL#203). The `.ref` is the
scope anchor — it's what ties the region's CSS to the region's DOM subtree without leaking to the rest
of the page. DL#206 further guarantees that anchor exists as a `display:contents` wrapper whenever a
region emits scoped CSS.

The anchor is derived from the region's `ref=` attribute: `defaultScopeSelector` returns `.${ref}` or
`null` when there is no ref (`materialise.ts:242-245`). No ref ⇒ no selector ⇒ no `@scope`.

## Problem

A region with `template=` CSS but **no `ref`** is a dead end for that CSS:

1. **Materialiser emits it unscoped.** `fillRegions` takes the `selector === null` branch and pushes
   `{ key, selector: null, css }` (`materialise.ts:202-204`); `coalesceCss` emits a null-selector
   group as bare CSS with **no `@scope` wrapper** (`materialise.ts:107-110, 125-128`). The DL#206
   wrapper gate is `ref && (scoped || parentScoped)` (`materialise.ts:216`) — ref-less ⇒ no wrapper.
   ✅ verified
2. **Sync drops it.** `syncPageContent` → `mergeScopeCss(html, css)` (`run-sync.ts:66-68`).
   `mergeScopeCss` builds its groups via `splitScopeBlocks(aggregatedCss)` (`run-sync.ts:122`), which
   keeps **only `type === 'scope'` segments** (`scope-css.ts:93-97`). The unscoped ref-less block is a
   `raw` segment, never indexed into `groups`, so it is never appended to the page `<style>`. ✅
   verified

Net: **the region's CSS silently disappears on first sync.** There is no diagnostic today — it's an
invisible, silent styling loss, exactly the failure class the design-log methodology says to catch at
validation time.

Note we deliberately do **not** fix this by making sync carry the unscoped CSS: that would inject the
region's raw selectors into page-global scope, re-introducing the descendant-bleed that `@scope`
(DL#203) exists to prevent. The correct state is "scoped CSS or no CSS," and the way to get scoped CSS
is a `ref`. Hence validation, not a serializer change.

## Prior Art / Adjacent Mechanisms

| Mechanism                         | Where                                                    | Solves? / Constrains?                                                                                                               |
| --------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `checkRegionCssDrift`             | `validate.ts:967-1023` ✅                                | **Skips ref-less regions** (`984-985`) — so it is blind to this case; its `CSS-SCOPE-MISSING` sub-case only fires when a ref exists |
| `checkNestedRegionRefs` (DL#203)  | `validate.ts:1102-1146` ✅                               | Only the **nested-child** ref-less case; does not cover a top-level ref-less CSS region. **Exact structure to mirror**              |
| `templateShipsCss` closure        | `validate.ts:1111-1119` ✅                               | Reusable "backing template has non-empty CSS" test (`extractStyleCss(content).trim() !== ''`)                                       |
| `extractStyleCss`                 | `validate.ts:947-953` ✅                                 | Concatenates every `<style>` in a template's raw HTML                                                                               |
| `collectRegionElements`           | `validate.ts:821-833` ✅                                 | Enumerates all `<jay:X>` regions (the iteration source)                                                                             |
| import matching (`imp.template`)  | `validate.ts:1264` ✅                                    | Resolves a region tag → its backing template path                                                                                   |
| `readTemplateRel` injected reader | `validate.ts:1981-1987` ✅                               | Loads template bytes; already passed to the sibling region rules                                                                    |
| warnings vs errors wiring         | `validate.ts:2017-2026` (warn) / `1962, 2078` (error) ✅ | The two severity channels to choose between (Q1)                                                                                    |

**Null hypothesis — does an existing rule already catch this?** No. `checkRegionCssDrift` explicitly
`continue`s on ref-less regions and `checkNestedRegionRefs` only handles the nested case. The gap is
real and uncovered. ✅ verified (research pass).

## Questions and Answers

**Q1. Warning or error? (OPEN — user decision.)**
Options:

- **(a) Error** _(author's lean)_ — this silently **deletes authored CSS** on sync with no other
  signal; that's a correctness loss, not a style nudge. An error forces the `ref` before the styling
  is lost. Mirror `errors.push({ file, message, stage: 'generate' })` (`validate.ts:1962/2078`).
- **(b) Warning** — consistent severity with the sibling region-CSS rules (`checkRegionCssDrift`,
  `checkNestedRegionRefs` all `warnings.push`), suppressible like the rest of the DL#200/#176 family.
  Risk: a warning among many may be ignored and the CSS still vanishes.
- **Recommendation:** **error**, because the consequence (silent data loss) is categorically worse
  than the drift/reuse warnings. If the author prefers uniformity with the other region rules, (b) is
  a one-line change of channel. **Decision pending.**

**Q2. Top-level only, or nested regions too?**
A. **All regions** returned by `collectRegionElements` (which includes nested). A ref-less CSS-shipping
region loses its CSS regardless of nesting depth. (DL#203's `checkNestedRegionRefs` already nudges
ref-less _nested_ regions for a _different_ reason — scope-anchor stamping — but does not condition on
the child's **own** template shipping CSS, so there is no duplicate diagnostic for the same fix; both
resolve by adding a `ref`, so at worst the author adds the ref once and both quiet.) ⚠️ assumed: verify
in implementation that the two messages don't double-fire confusingly on the same element; if they do,
prefer this rule's message (names the data-loss) and skip the nested nudge when CSS is shipped.

**Q3. Does this duplicate "region not linked" (`REGION-NOT-LINKED`)?**
A. No. `REGION-NOT-LINKED` fires when there is **no `template=`** at all. This rule fires when there
**is** a `template=` _and_ it ships CSS _and_ there's no `ref`. Disjoint preconditions.

**Q4. What about a ref-less region whose template ships NO css?**
A. Not flagged by this rule — there's nothing to lose. (DL#203's nested nudge may still apply for its
own anchor reason.) Keeping this rule narrowly "ships CSS + no ref" avoids false positives on
pure-markup regions.

## Design

New function `checkRegionCssNoRef(jayHtml, loadTemplate)` in `validate.ts`, a near-copy of
`checkNestedRegionRefs`:

```
for region in collectRegionElements(jayHtml.body):
    contractName = region.tagName.substring(4)          // strip "jay:"
    imp = importsWithTemplate.find(matches contractName) // validate.ts:1264 pattern
    if !imp?.template: continue
    if region.getAttribute('ref'): continue              // has an anchor → CSS can be scoped
    if !templateShipsCss(imp.template): continue          // nothing to lose
    push finding:
       message: `Region <jay:${contractName}> flattens template="${imp.template}" which ships CSS, `
              + `but the region has no ref, so its CSS cannot be scoped and sync will drop it.`
       suggestion: `Add ref="…" to <jay:${contractName}> so sync can scope and preserve its CSS.`
```

Wire it in `validateJayFiles` next to the other region checks (near `validate.ts:2017-2026`), pushing
to **`errors`** (Q1-(a)) or **`warnings`** (Q1-(b)) per the severity decision. Reuse the existing
`readTemplateRel` reader and the cached `templateShipsCss` helper (lift it to module scope or
re-inline the closure).

## Implementation Plan

- **Phase 1 — rule + wiring.** Add `checkRegionCssNoRef`; wire into `validateJayFiles` at the chosen
  severity. Reuse `extractStyleCss` / `templateShipsCss` / `readTemplateRel`.
- **Phase 2 — fixtures + tests.** Fixture project: (a) region with CSS-shipping template + **no ref**
  → fires; (b) same template **with ref** → silent; (c) ref-less region whose template ships **no CSS**
  → silent; (d) `REGION-NOT-LINKED` region (no template) → this rule silent. Assert on the result
  object's `errors`/`warnings` array (full-object equality), **never `toContain` on code**.
- **Phase 3 — agent-kit.** One line in the designer guide: "a region that flattens a CSS-shipping
  template must have a `ref` or its CSS is dropped." Link from DL#200 and DL#203.

## Scope Pre-mortem (what this does NOT handle)

- **Auto-fixing** (synthesizing a `ref`): out of scope — the author should name the anchor.
- **Making sync carry unscoped CSS:** explicitly rejected (would leak styles globally; defeats DL#203).
- **Partial CSS** (template ships CSS that targets only `:scope`-less global selectors): still flagged;
  the remediation (add a ref) is the same.
- **De-duplication with DL#203's nested nudge:** flagged as Q2 ⚠️ — resolve during implementation.

## Verification Criteria

- A page with a ref-less region flattening a CSS-shipping template produces the new diagnostic; adding
  `ref=` clears it and `sync` then preserves the CSS as a scoped `@scope` block.
- A ref-less region whose template ships no CSS produces **no** diagnostic.
- `REGION-NOT-LINKED` and this rule never both fire on the same element.
- `--json` includes the finding in the chosen channel; exit code reflects the severity decision.

## Trade-offs

- **+** Converts a silent styling-loss into a build-time diagnostic with an obvious one-token fix;
  pure validation, zero runtime/syntax, reuses existing walks and template reader.
- **−** If shipped as an **error**, it can block a build on a page that was "fine" before the author
  added CSS to a shared template — but that build was silently losing CSS, so the error is surfacing a
  real regression, not inventing one.
- **−** Severity inconsistency risk: the sibling region-CSS rules are warnings; an error here is
  justified by the data-loss consequence but breaks uniformity (Q1).

## Pointers

- Materialiser ref-less path: `compiler-inline-composition/lib/materialise.ts:202-204, 107-110,
125-128, 242-245, 216`
- Sync drop site: `stack-cli/lib/run-sync.ts:66-68, 122`; `stack-cli/lib/scope-css.ts:93-97`
- Rule to mirror: `stack-cli/lib/validate.ts:1102-1146`; wiring `:2017-2026`; error form `:1962, 2078`
- Helpers: `extractStyleCss` `:947-953`; `templateShipsCss` `:1111-1119`; `readTemplateRel` `:1981-1987`;
  `collectRegionElements` `:821-833`; import match `:1264`
- Related DLs: DL#196 (regions), DL#203 (scope donut), DL#206 (display:contents anchor), DL#200
  (region validation family), DL#176 (suppressible warnings)

## Implementation Results

Status: **implemented as an error (Q1 decided by the user: error, because it silently deletes authored CSS).**

### What changed

- `stack-cli/lib/validate.ts` — added `checkRegionCssNoRef(jayHtml, loadTemplate)`, a near-copy of
  `checkNestedRegionRefs`: iterate `collectRegionElements(jayHtml.body)`, match each `<jay:X>` to its
  `importsWithTemplate` entry by `contractName`, skip when the region has a `ref` or its template ships no
  CSS (reusing the `templateShipsCss` + `extractStyleCss` cache pattern), and push a finding otherwise.
- Wired into `validateJayFiles` next to the DL#203 nested-ref check, pushing to **`errors`** with
  `stage: 'generate'` (not `warnings`) — the finding's `suggestion` rides along on `ValidationError`
  (`validate.ts:66`). This is the severity decision: an error, because the consequence is silent styling
  loss, not drift.

### Tests (all `toEqual`/`toHaveLength` on the finding objects — never `toContain`)

- New fixture tree `test/fixtures/validate/region-css-no-ref/`: a CSS-shipping `card` component, a
  CSS-less `plain` component, and three pages — `page-no-ref` (ref-less `<jay:card>` → fires),
  `page-with-ref` (`ref="promo"` → silent), `page-no-css` (ref-less `<jay:plain>`, no template CSS →
  silent).
- New `describe('checkRegionCssNoRef (DL#209 …)')` in `validate.test.ts` — 3 tests (fires once; two
  silent cases). `validate.test.ts` 84 → 87; full stack-cli suite 131 → 134, all passing.

### Deviations / Q2 resolution

- **Q2 (nested double-fire):** not observed in practice — `checkNestedRegionRefs` fires on the _parent_
  naming a ref-less _child_ for a different reason (donut boundary), and conditions on the child being
  materialisable; the two messages address the same remedy (add a `ref`) and did not collide on the test
  fixtures. Left both as-is; no de-dup needed.
- Rule iterates **all** regions (`collectRegionElements`), not top-level only (per Q2 design) — a ref-less
  CSS region loses its CSS at any depth.

### Agent-kit docs updated (Phase 3)

- `agent-kit-template/designer/design-system-guide.md` — "The shape of a region's CSS" now documents
  `REGION-CSS-NO-REF` as a hard error (a CSS-shipping region must carry a `ref`; unsuppressible).
- `agent-kit-template/designer/validation-guide.md` — noted it under "Errors vs Warnings" as the one
  design-system rule that is an error, with the add-a-`ref` remedy.
