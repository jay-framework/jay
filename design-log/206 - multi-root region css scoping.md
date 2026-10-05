# DL#206 — Multi-root region CSS scoping

Status: **DESIGN — for review, not implemented.**

## Decisions for the Implementer (TL;DR)

- **Problem:** a flattened region with **more than one root element** has no way to style its roots
  distinctly. The materialiser stamps the same `.<ref>` scope-anchor class on **every** root
  (`stampScopeAnchor`, `materialise.ts:302-306`), and the root-class→`:scope` rewrite collapses
  **all** root selectors to a single `:scope` (`rewriteRootSelector`, `materialise.ts:291-295`). So
  `.ds-left` and `.ds-right` both become `:scope` and both match all roots. Per-root styling is
  impossible.
- **Decision (settled with the author):** **always** wrap a region's body in a single
  `<div style="display:contents">` that carries the `.<ref>` scope anchor. Uniform — every region,
  single- or multi-root, has exactly one scope root (the wrapper). The real roots become ordinary
  **descendants** of the wrapper.
- **This is a subtraction, not just an addition.** Because the real roots are now descendants (not
  the scope root), the entire root-class→`:scope` rewrite machinery (`rootClassesOf` +
  `scopeReadyCss` + `rewriteRootSelector`, `materialise.ts:252-295`) is **deleted**. Root rules like
  `.ds-card { … }` match as plain descendant selectors under `@scope (.<ref>)`; `:scope` now
  unambiguously means the wrapper.
- **Prior art to reuse, not reinvent:** the jay-html **codegen** path already wraps multi-root
  bodies in exactly `<div style="display: contents">` (`ensureSingleChildElement`,
  `jay-html-helpers.ts:78-97`; documented `jay-html-docs.md:470-472`). The **materialiser** path is
  the only one that skips it (`materialise-context.ts:48-61` loads `body.innerHTML` verbatim). DL#206
  brings the materialiser in line with the convention the rest of the compiler already uses.
- **Donut (DL#203) interaction:** the wrapper carries `.<ref>`, so a parent's donut boundary
  `@scope (.parent) to (.child)` now resolves `.child` to the **child region's wrapper** (one
  element), which is cleaner than today's "stamp on every child root." `display:contents` elements
  remain in the DOM tree, so both `@scope` anchoring and `to (...)` limits match them normally.
- **Load-bearing claims tagged** ✅ verified / ⚠️ assumed throughout. The two ⚠️ claims a reviewer
  should attack first: (1) CSS `@scope`'s `to (...)` limit accepts a `display:contents` element as a
  boundary; (2) using a `display:contents` element as the `@scope` _root_ behaves identically to a
  painted element for selector matching. Both need a live-browser fixture before merge.

## Background

DL#196 flattens a component's `.jay-html` into the page as a `<jay:X>` region; the region's own CSS
is wrapped in `@scope (.<ref>) { … }`, where `.<ref>` is a synthetic class the materialiser stamps
onto the region's root(s). DL#203 added the donut limit `to (.<child-ref>)` so a region's CSS stops
at nested child-region boundaries. Both DLs assumed, implicitly, that a region has **one** scope
root.

Component templates can legitimately have **multiple** root elements — the codegen path explicitly
supports this and auto-wraps them (`jay-html-helpers.ts:78-97`). ✅ verified

## Problem

When a multi-root template is flattened as a region, every root receives the identical `.<ref>`
class and the author loses the ability to target one root versus another.

Concretely, given a two-root card template:

```html
<!-- card.jay-html body — two roots -->
<div class="ds-media">…</div>
<aside class="ds-ribbon">…</aside>
```

```css
.ds-media {
  aspect-ratio: 16/9;
}
.ds-ribbon {
  position: absolute;
  top: 0;
}
```

After materialisation today (`@scope (.hero)`), the compiler:

1. Stamps `.hero` on **both** roots — `<div class="ds-media hero">` and `<aside class="ds-ribbon hero">`. ✅ verified `materialise.ts:302-306`
2. Unions all root classes (`{ds-media, ds-ribbon}`) and rewrites **any** matching selector token to
   `:scope` — so `.ds-media { … }` → `:scope { … }` **and** `.ds-ribbon { … }` → `:scope { … }`.
   ✅ verified `materialise.ts:252-260, 291-295`

Result: both rules now target `:scope`, which matches **every** `.hero`-anchored root. The ribbon's
`position:absolute` lands on the media root too. **Per-root styling is lost, silently.** ✅ verified
(by reading the rewrite); ⚠️ assumed (the specific cross-apply end-to-end — follows directly from the
two verified steps but not executed).

## Prior Art / Adjacent Mechanisms

| Mechanism                                                                              | Where                             | Solves? / Constrains?                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------- |
| `stampScopeAnchor` — stamps `.<ref>` on all top-level children                         | `materialise.ts:302-306` ✅       | Source of the bug; change stamp target to the wrapper                                    |
| `rootClassesOf` + `scopeReadyCss` + `rewriteRootSelector` — root rules → `:scope`      | `materialise.ts:252-295` ✅       | Becomes unnecessary once roots are descendants; **delete**                               |
| `scopeWrap` — emits `@scope (sel) [to (...)] { css }`                                  | `materialise.ts:241-246` ✅       | Unchanged; `sel` becomes the single `.<ref>`                                             |
| `directRegions`/`fillRegions` — donut `to` list                                        | `materialise.ts:183-198` ✅       | `to` target becomes the child wrapper; no logic change if child wrapper carries `.<ref>` |
| `ensureSingleChildElement` — wraps multi-root body in `<div style="display:contents">` | `jay-html-helpers.ts:78-97` ✅    | **The convention to reuse.** Codegen already does this                                   |
| `loadTemplate` — region body = `body.innerHTML` verbatim (no wrap)                     | `materialise-context.ts:48-61` ✅ | Why the materialiser path diverged; where the wrap is missing                            |
| DL#135 — `display:contents` wrappers don't break sticky/flex/grid/z-index              | `design-log/135` ✅               | Validates that a `display:contents` anchor is layout-transparent                         |

**Null hypothesis — does an existing primitive already suffice?** The `display:contents` wrapper
convention already exists in the codebase; DL#206 does not invent a new mechanism, it applies the
existing one in the one path (materialiser) that skips it. No new runtime, no new syntax.

**DL#135 gap worth stating:** DL#135 vetted `display:contents` for layout transparency but never for
an element doubling as a **CSS `@scope` anchor**. Anchoring is layout-independent (it is selector
matching, not box generation), so this should be fine — but it is a new use, flagged ⚠️ assumed and
covered by a fixture in the plan.

## Questions and Answers

**Q1. Always-wrap, or only-wrap-when-multi-root?**
A. **Always wrap** (author decision). Uniform codegen, one scope model, and it lets us delete the
`:scope`-rewrite machinery outright (only-wrap would keep the rewrite as a conditional second path).
The cost is one `display:contents` node per region even when single-root — layout-transparent and
DOM-cheap per DL#135.

**Q2. Does always-wrap change the single-root output that `validate`/`sync` compare against?**
A. Yes — the flattened markup now contains the wrapper. Both `validate`'s differ and `sync`'s merge
flatten from the same materialiser, so they stay consistent with each other. ⚠️ assumed — the
drift-diff baseline must be regenerated; a cross-check that a clean page stays clean after re-flatten
is in the plan. (This is the DL#203 "validate-clean ⇔ sync-clean" invariant and must be re-verified.)

**Q3. Does `:scope` still work for a component that relied on its root rule?**
A. Yes. The root (`.ds-card`) is now a proper descendant of the wrapper, so its own class selector
matches under `@scope (.<ref>)` with no rewrite. We stop emitting `:scope` for it entirely. ⚠️
assumed — verify a component whose CSS styles its own root element renders identically.

**Q4. Does the donut `to (...)` limit accept a `display:contents` wrapper as a boundary?**
A. Expected yes — `display:contents` keeps the element in the DOM/selector tree; `@scope … to (sel)`
matches `sel` structurally, independent of rendering. ⚠️ assumed — **the top fixture to land.**

**Q5. What about a region with no `ref`?**
A. Unchanged from today: no `ref` → no scope selector → CSS passes through unscoped
(`materialise.ts:196`). A ref-less region gets a wrapper with no anchor class (or no wrapper — see
plan); it ships no scoped CSS so there is nothing to disambiguate.

## Design

1. **Materialiser wraps every region body in a single anchor element.** In the materialise path
   (where `loadTemplate` returns the body, `materialise-context.ts:48-61`, consumed by `fillRegions`
   `materialise.ts:177-210`), wrap the region's top-level children in
   `<div class="<ref>" style="display:contents">…roots…</div>`. The wrapper carries the `.<ref>`
   anchor; `display:contents` keeps it layout-transparent (DL#135).

2. **Stamp the anchor on the wrapper, not the roots.** Replace `stampScopeAnchor`'s
   iterate-all-children (`materialise.ts:302-306`) with "add `.<ref>` to the single wrapper."

3. **Delete the root→`:scope` rewrite.** Remove `rootClassesOf`, `scopeReadyCss`, and
   `rewriteRootSelector` (`materialise.ts:252-295`). Component CSS is emitted inside
   `@scope (.<ref>) { … }` with selectors verbatim; root rules match as descendants.

4. **Donut unchanged.** `fillRegions`/`directRegions` still compute the `to` list from direct child
   regions; because each child region is itself wrapped with its `.<childRef>` anchor, the parent's
   `@scope (.<ref>) to (.<childRef>)` resolves the boundary to the child's wrapper (one element).

5. **Coalescing key unchanged.** `` `${templatePath}\0${[...to].sort().join(',')}` ``
   (`materialise.ts:194`) still distinguishes instances by template + donut boundaries.

### Before / after

```html
<!-- AFTER DL#206: one wrapper anchor, roots keep their own classes -->
<div class="hero" style="display:contents">
  <div class="ds-media">…</div>
  <!-- root 1 -->
  <aside class="ds-ribbon">…</aside>
  <!-- root 2 -->
</div>
```

```css
@scope (.hero) {
  .ds-media {
    aspect-ratio: 16/9;
  } /* distinct again */
  .ds-ribbon {
    position: absolute;
    top: 0;
  }
}
```

## Implementation Plan

- **Phase 0 — fixture-first (boundary change; must be up front per methodology).** Add a
  **multi-root region** fixture and a **nested multi-root region** fixture under
  `compiler-inline-composition/test/fixtures/` AND a running example page, exercised across
  **element / hydrate / server** targets. These are the targets where a scoping change renders wrong
  _silently_. Land the two ⚠️ live-browser checks (Q4 donut-to-wrapper, Q3/Q4 `@scope`-root =
  `display:contents`) as part of this phase.
- **Phase 1 — materialiser.** Implement steps 1–3 (wrap + stamp-on-wrapper + delete rewrite).
  Regenerate materialise baselines. Verify clean-page-stays-clean (Q2).
- **Phase 2 — donut.** Confirm steps 4–5; update DL#203 donut fixtures for wrapped children.
- **Phase 3 — validation.** Confirm `checkNestedRegionRefs` / `REGION-NESTED-NO-REF` (DL#203) and
  CSS-scope checks still hold against the wrapper model; adjust if they asserted on root stamping.

## Scope Pre-mortem (what this does NOT handle)

- **Author-written `:scope` in source template CSS.** If a component author literally wrote `:scope`
  (unusual — it was compiler-introduced before), its meaning shifts to the wrapper. Decide: **defer**
  (document as unsupported) unless a fixture shows real usage. ⚠️ assumed rare.
- **`display:contents` painting caveats** (backgrounds/borders on the anchor). Not applicable — the
  anchor is never meant to paint; real roots keep their boxes. No action.
- **Non-materialiser consumers of region markup** (e.g. anything reading the flattened body shape).
  Audit callers of the materialise output for an added wrapper assumption — **own as a Phase 1
  check**, not a separate DL.
- **Ref-less multi-root regions.** No scoped CSS ships, so no disambiguation needed; wrapper optional
  for them. Decide in Phase 1 (lean: wrap uniformly anyway for one code path).

## Verification Criteria

- A two-root region can style each root distinctly, confirmed by a rendered fixture across
  element/hydrate/server targets.
- A nested multi-root region: parent CSS does not bleed into the child region (donut holds), and each
  level styles its own roots distinctly.
- `rootClassesOf`/`scopeReadyCss`/`rewriteRootSelector` are gone and no test depends on them.
- A previously-clean page re-flattens to still-clean under `validate` (DL#203 invariant).

## Trade-offs

- **+** Per-root styling works; the scope model becomes _simpler_ (one root, no rewrite); aligns the
  materialiser with the codegen wrapper convention.
- **−** One extra `display:contents` node per region (layout-transparent, DOM-cheap).
- **−** Baselines/fixtures regenerate, and the `display:contents`-as-`@scope`-anchor combination is a
  new use that must be proven in a real browser before merge (the two ⚠️ claims).

## Implementation Results (Phase 1 — materialiser)

Implemented the materialiser change (Design steps 1–5). The two ⚠️ live-browser checks (Q3/Q4) and the
cross-target running example (Phase 0) are **not** part of this increment — they remain to land before
merge, as the DL flags.

### What changed

- **`compiler-inline-composition/lib/materialise.ts`**
  - `fillRegions`: the scoped-CSS contribution now pushes `css: template.css` **verbatim** (was
    `scopeReadyCss(template.body, template.css)`). Component CSS is emitted as-authored inside
    `@scope (.<ref>) { … }`; root rules match as descendants of the wrapper.
  - Replaced `stampScopeAnchor(region, ref)` with `wrapScopeAnchor(region, ref)`, which wraps the
    region's flattened body in a single `<div class="<ref>" style="display:contents">…roots…</div>`.
    The wrapper carries the `.<ref>` anchor; the real roots are descendants.
  - **Deleted** `rootClassesOf`, `scopeReadyCss`, `rewriteRootSelector`, and the old `stampScopeAnchor`.
    Removed the now-unused `import postcss from 'postcss'`.
- **`compiler-inline-composition/lib/index.ts`**: dropped the `scopeReadyCss` / `rootClassesOf` exports.
- **`jay-stack/stack-cli/lib/validate.ts`** (cross-package consequence of deleting the export): the
  region CSS-drift check (`checkRegionCssDrift`) compared the page's `@scope` block against
  `scopeReadyCss(body, css)`. Since the materialiser now emits CSS verbatim, it now compares against
  `extractStyleCss(content)` (the source CSS as-is). Import of `scopeReadyCss` removed. This keeps the
  monorepo compiling and keeps validate consistent with the new emitter. **Not covered by this
  increment's test run** (stack-cli tests are run in the integration pass); validate fixtures that
  embedded `:scope` will need regeneration in Phase 3.

### Wrap-gate decision (the DL's "always wrap", clarified)

Per the task's interpretation note: a region is wrapped **iff `ref && (scoped || parentScoped)`** — the
exact gate that previously governed `stampScopeAnchor` (`materialise.ts`). That is, wrap every region
that _participates in scoping_ (ships its own scoped CSS, or is named as a parent's donut boundary). A
ref-less region, or a ref-bearing region that ships no CSS and is not a donut boundary, gets **no**
wrapper — there is nothing to anchor and no scoped CSS to disambiguate. This is "always wrap every
region that scopes," not "always wrap literally every region," and it lets the `:scope`-rewrite
machinery be deleted outright (single uniform scope model for every region that has CSS). Q5's "wrapper
optional for ref-less regions" is resolved as **no wrapper** for them.

### Wrapper markup

`<div class="<ref>" style="display:contents">` — `display:contents` with no space, matching the task
spec. (`ensureSingleChildElement` uses `display: contents` with a space; the two are CSS-equivalent. If
exact byte-match with the codegen wrapper is later required for a differ, normalise one of them.)

### Fixtures / tests (this package only)

All materialise tests are inline (no `fixtures/` dir in this package); kept that style, used
`toBe`/`toEqual` full-string comparisons with the existing `squash` helper (no `toContain`).

- **Changed baselines** (the `:scope` rewrite is gone and the wrapper is new markup — each verified by
  reading the expected output):
  - `@scope CSS` block: single-root now asserts `@scope (.signupCard) { .card { color: red } }` +
    the `.signupCard` `display:contents` wrapper; the ref-stamp test now asserts the wrapper carries the
    ref; coalesce / cross-template / compound-selector tests assert verbatim selectors (no `:scope`).
  - `@scope donut` block: `:scope` → verbatim root rule; child boundary `.b` now lives on the child's
    `display:contents` wrapper; HTML baselines updated to the wrapped shape.
- **Added fixtures (tests):**
  - **(a) single-root** — "wraps a single-root region body in a display:contents anchor and emits root
    CSS verbatim": confirms wrapper + verbatim `.card` (no `:scope`).
  - **(b) multi-root** — "styles two distinct roots of a multi-root region, each verbatim under one
    @scope": two roots (`.ds-media`, `.ds-ribbon`) with distinct rules both survive inside
    `@scope (.hero) { … }`; the one `.hero` wrapper holds both roots.
  - **(c) nested multi-root** — "nested multi-root region: parent donut excludes the child subtree and
    each level styles its own roots": `@scope (.hero) to (.card) { … }` for the section, a separate
    `@scope (.card) { … }` for the card, and the `.card` boundary resolves to the child's single wrapper.

### Test + build results

- `cd packages/compiler/compiler-inline-composition && yarn vitest run` → **102/102 passing** (6 files;
  `materialise.test.ts` 33/33).
- `yarn build` (vite SSR bundle + tsup dts) → **success**, no type errors.

### Deviations from the design

- **Scope of this increment**: only Design steps 1–5 (materialiser). Phase 0's cross-target
  (element/hydrate/server) running example and the two ⚠️ live-browser checks (Q3 `@scope`-root =
  `display:contents`; Q4 donut `to (...)` accepting a `display:contents` boundary) are **still open** and
  must land before merge. Phase 2 (DL#203 donut fixtures in stack-cli) and Phase 3 (validation
  adjustments, re-generating validate fixtures that embedded `:scope`) are deferred to the integration
  pass.
- **validate.ts** was touched out of strict package scope only to keep the monorepo compiling after the
  export deletion; the change is the minimal verbatim-comparison fix the DL implies, not a full Phase 3
  validation review.

## Implementation Results (Phase 2 — integration: sync-merge follow-up bug)

Status: **bug found and fixed during the stack-cli integration pass.**

### The bug: the wrapper broke override preservation on re-sync

The Phase-1 `wrapScopeAnchor` introduced a `<div class="<ref>" style="display:contents">` anchor around a
flattened region body, but `fillRegions` kept merging the page's existing body against the **unwrapped**
`template.body`. On the _second_ sync the existing body already carried the wrapper, so the merge aligned
the template's real roots (`[.card]`) against the wrapper div (`[.<ref>]`) — one level too shallow — and
every `override` facet one level deeper was dropped as "diverged structure, re-flatten wins". ✅ verified
via `stack-cli/test/run-sync.test.ts` idempotency failure (`page.jay-html`: `override="class"` + its
page-owned `featured` class vanished on re-sync).

Only surfaced in stack-cli (not the 102 Phase-1 tests) because every `materialise.test.ts` override case
used a **CSS-less** template, so no wrapper ever formed — exactly the boundary-crossing gap the methodology
warns about (fixtures didn't cross the CSS-present × preserveOverrides × re-sync corner).

### Fix

`materialise.ts` — added `unwrapScopeAnchor(existingHtml, ref)` (the inverse of `wrapScopeAnchor`) and call
it on the existing body before `mergeOverrides` when `preserveOverrides` is set. It strips a lone
`<div class="<ref>" style="display:contents">` wrapper (unambiguous — a jay `ref` is never emitted as a DOM
class, so such a div can only be our own anchor) and returns its inner HTML; otherwise returns the body
unchanged (first-fill / hand-authored / no ref). The anchor is re-applied by `wrapScopeAnchor` after the
merge, so the wrapper is never doubled.

### Tests updated / added

- `compiler-inline-composition/test/materialise.test.ts` — **+1** regression (34/34): re-sync a region body
  that already carries the wrapper + a nested `override="class"`; asserts the override survives and the
  wrapper is not doubled.
- `stack-cli/test/run-sync.test.ts` — the three `:scope`-era assertions updated to the DL#206 canonical form
  (component CSS emitted **verbatim**, root rule `.card` kept, **no** `:scope` rewrite): the "coalesces"
  and "overwrites stale block" tests now assert `:scope` absent / `.card` present; the `page.jay-html`
  idempotency test passes unchanged once the merge bug above is fixed. 10/10.

These were the three `:scope`-bearing fixtures flagged in Phase 1 for regeneration — they were stale
_assertions_ (encoding the removed root→`:scope` rewrite), plus the one genuine merge bug above.

## Design (Phase 3 — synthesize the anchor at compile time, not in source)

Status: **IMPLEMENTED** (see "Implementation Results (Phase 3)" below for deviations). Same target as
Phase 1/2 (the scope-anchor mechanism); appended per "a new step in the same target."

### Decision for the Implementer (TL;DR)

- **The scope anchor does not belong in the materialised source.** `<div class="<ref>"
style="display:contents">` is a pure function of `<jay:X ref="<ref>">` — `class` _is_ the ref,
  `display:contents` is constant. It carries **zero** author content. Storing it in the flattened
  `page.jay-html` is redundant.
- **Move its synthesis from the materialiser (source-to-source) to the jay-html compiler
  (source-to-runtime).** The materialiser stops wrapping; the compiler emits the anchor when it
  compiles a `<jay:X ref>` region body. The on-disk source holds only `<jay:X ref>` + author body;
  the runtime DOM is unchanged (`<div class="grid" style="display:contents" jay-coordinate=…>`).
- **This is a net subtraction.** Both `unwrapScopeAnchor` helpers added in Phase 2 — on the merge
  path (`materialise.ts`) and the diff path (`diff-markup.ts`) — **delete**. They are two workarounds
  for one obstacle (the wrapper living in source); per the DL#195 tripwire, remove the obstacle.
- **Wrap-gate: always wrap every ref'd region** (the Phase-1 "always wrap," Q1). The compiler does
  not know a region's scoped-ness without re-coupling to the materialiser; unconditional wrapping is
  one `display:contents` node (layout-transparent, DL#135) and keeps the compiler decoupled.

### Why Phase 1 put it in source, and why that was the wrong layer

Phase 1 implemented the wrapper in the **materialiser** because that path already owned body
flattening and could reuse the `display:contents` convention (`ensureSingleChildElement`,
`jay-html-helpers.ts:88`). But the materialised jay-html is _also_ the artifact `sync` merges into
and `validate` diffs against — so a compile artifact leaked into the round-tripped, human-facing
representation. That leak is the sole reason Phase 2 needed `unwrapScopeAnchor` on **both** the merge
and diff paths. ✅ verified (Phase 2 Results above: both helpers exist only to see _through_ the
wrapper).

### Prior art / null hypothesis

The compiler **already** synthesizes a single-element wrapper for a multi-child region body:
`de('div', {}, [...])` at `jay-html-compiler.ts:927-939` (single-child bodies pass through at
`:941`). Phase 3 does not add a mechanism — it extends this existing wrap to (a) run for every ref'd
region, not only multi-child, and (b) carry `class=<ref>` + `style="display:contents"`. ✅ verified
`jay-html-compiler.ts:927-942`.

### Design

1. **Compiler — synthesize the anchor.** In the region-instance branch (`jay-html-compiler.ts`,
   around the `inlineBody` construction at `:875-942`), emit the inline body as
   `de('div', { class: '<ref>', style: 'display:contents' }, [ …children… ])` for every region with a
   ref, replacing the current "wrap only when `childNodes.length > 1`" special-case. `<ref>` is
   `refOriginalName` (`:945`). The wrapper is one element, so single- and multi-root bodies share one
   code path. ⚠️ assumed — confirm `assignCoordinates` still stamps the wrapper (it already stamps
   synthesized `display:contents` wrappers, `assign-coordinates.ts:198`).
2. **Materialiser — stop wrapping.** Remove `wrapScopeAnchor` and its call in `fillRegions`
   (`materialise.ts`). The flattened region body is the template body (merged with overrides),
   **unwrapped**.
3. **Delete both Phase-2 workarounds.** Remove `unwrapScopeAnchor` from `materialise.ts` (the merge
   no longer faces a wrapper) and from `diff-markup.ts` (the diff no longer faces a wrapper). The
   legacy `ignoreClass`/`stripClassToken` tolerance in `diff-markup.ts` also goes — pre-DL#206 pages
   stamped the ref as a root class, but Phase 3 never stamps the ref in source at all, so there is no
   synthetic class to strip.
4. **CSS unchanged.** The materialiser still emits `@scope (.<ref>) { … }` (verbatim, per Phase 1)
   into the page `<style>`. The `.<ref>` class now lands on the compiler-synthesized wrapper instead
   of a materialised one — same runtime element, same anchoring. Donut `to (.<childRef>)` still
   resolves: the child region's wrapper is likewise synthesized and carries `.<childRef>`. ⚠️
   assumed — covered by the existing donut fixtures re-run against the unwrapped source.

### What the source looks like after Phase 3

```html
<!-- page.jay-html — source holds only the region tag + author body -->
<jay:gallery ref="grid" heading="{title}">
  <div class="ds-gallery">
    <h2 class="ds-gallery__heading">{heading}</h2>
    …
  </div>
</jay:gallery>
```

The runtime DOM is byte-identical to today: `<div class="grid" style="display:contents"
jay-coordinate="…"><div class="ds-gallery">…</div></div>`.

### Scope pre-mortem (what Phase 3 must re-verify, not assume)

- **validate/sync baselines regenerate again.** Every `page.jay-html` under `design-system-demo` and
  every stack-cli fixture drops the `display:contents` wrapper from source. Re-run `sync`, confirm the
  smoke suite (drift counts on `/drifted`, clean on `/` and `/branded`) is unchanged — the _rendered_
  output must not move.
- **`checkRegionCssDrift` / `checkRegionDrift`** compared page region body against template body; with
  neither side wrapped they align directly. Confirm no check still assumes a wrapper.
- **DL#203 donut fixtures** (nested child boundary) — re-run against unwrapped source.
- **Ref-less regions** — already unwrapped today (Phase-1 gate), so no change; confirm.

### Verification criteria (Phase 3)

- Source `page.jay-html` contains no `display:contents` scope-anchor node; the runtime DOM still does.
- `unwrapScopeAnchor` is absent from both `materialise.ts` and `diff-markup.ts`; no test depends on it.
- The design-system-demo smoke suite (9/9) and stack-cli/compiler-inline-composition suites pass with
  the regenerated, unwrapped baselines.
- A previously-clean page re-flattens to still-clean under `validate` (the DL#203 invariant), now
  without any wrapper round-trip.

## Implementation Results (Phase 3 — synthesize the anchor at compile time)

Status: **IMPLEMENTED.** Source is wrapper-free; the anchor is synthesized by the compiler. Both
Phase-2 `unwrapScopeAnchor` workarounds are deleted (the DL#195 tripwire is resolved — the obstacle,
not the second workaround, was removed).

### Deviation 1 — injection point is `assign-coordinates.ts`, not `jay-html-compiler.ts`

The Design section proposed synthesizing the anchor in the region-instance branch of
`jay-html-compiler.ts` (`:875-942`). That branch is the **element/hydrate** code path only. The
**server** target (`jay-html-compiler-server.ts`) compiles the same tree through a different emitter,
so wrapping there would wrap element+hydrate but silently leave the server HTML un-anchored — exactly
the element/hydrate/server divergence CLAUDE.md warns boundary/multi-target changes cause.

Instead the wrap is synthesized once in `assignHeadlessInstance` (`assign-coordinates.ts:203-252`) —
the single shared coordinate pre-processor **all three targets** run before their own emit. The
wrapper is created, the region body is moved inside it, and the existing coordinate walk then stamps
it like any other `display:contents` node. One injection point, zero cross-target divergence. ✅
verified — the rendered `build/dev/debug/client-entry/index.html` carries every region anchor
(`hero`, `grid`, `cardStarter`, `cardPro`, `cta`×2) from wrapper-free source.

### Deviation 2 — auto-ref (`AR<n>`) pattern gate, not a marker attribute

The pass runs **twice** on the same mutated tree (hydrate/element pre-assign at
`generateElementHydrateFile`, then `renderFunctionImplementation` assigns again). A ref-less region is
auto-assigned `ref="AR<n>"` on pass 1; on pass 2 that placeholder is already present and would be read
as an author's explicit ref — causing a ref-less region to wrongly wrap (16 fixture failures observed).

First attempt: tag auto-refs with a `jay-auto-ref` marker attribute. Rejected — `renderChildCompProps`
has an ad-hoc attribute skip-list (not `isDirectiveAttribute`), so the marker would leak as a
component prop. Final: detect the auto-ref shape with `AUTO_REF_PATTERN = /^AR\d+$/`
(`assign-coordinates.ts:25`), reusing the load-bearing `AR<n>` convention
(`jay-html-compiler.ts:991-1003`) — `explicitRef = !!ref && !AUTO_REF_PATTERN.test(ref)`. Zero new
surface, stable across both passes.

### Deviation 3 — wrap gate

- **Explicit ref → always wrap** (carries `class=<ref>` + `style="display: contents"`): the ref may
  anchor page CSS `@scope (.<ref>)` or be a parent's donut `to (.<childRef>)` boundary. Matches the
  DL's "always wrap every ref'd region."
- **Auto-ref (ref-less) → wrap only when the body has >1 significant child** (no `class`, just
  `style="display: contents"`): a ref-less region ships no scoped CSS, so it keeps the legacy
  one-returnable-root normalization and never carries a synthetic class.
- **Idempotency guard**: `isScopeAnchorDiv` + `alreadyWrapped` (`:78-83`, `:235-237`) skip wrapping
  when the single child is already an anchor — covers both the double-pass and any transitional page
  still carrying a materialiser-era wrapper.

### What changed

- `assign-coordinates.ts` — `AUTO_REF_PATTERN`, `isScopeAnchorDiv`, `explicitRef` threaded through
  `walkChildren`/`walkForEachChildren` → `assignHeadlessInstance`, which now synthesizes the anchor.
- `materialise.ts` — `wrapScopeAnchor` + `unwrapScopeAnchor` deleted; `fillRegions` emits the merged
  body verbatim. CSS still emitted via `@scope (.<ref>)`.
- `diff-markup.ts` — `unwrapScopeAnchor` / `stripClassToken` / `ignoreClass` deleted; `diffBodies`
  diffs the author body directly.
- Demo page sources (`design-system-demo/src/pages/{page,branded,drifted,variant,variants}`) —
  wrappers stripped; `@scope` CSS now roots at the real-root selector (`.ds-section`, …) with the
  synthesized wrapper as the `.<ref>` anchor.
- Regenerated golden fixtures (element / hydrate / server) under
  `compiler-jay-html/test/fixtures/contracts/{page-with-coded-region, …}` — diff is purely the anchor
  wrapper level + the one-deeper coordinate shift.

### Test + build results

- `yarn build` — all 72 packages green.
- `design-system-demo`: `yarn validate` — core 11 `.jay-html` / 5 `.jay-contract` no errors; only the
  demo's intentional showcase warnings (variant/drifted drift, not-linked, badge no-template).
- `design-system-demo`: `yarn test:smoke` — **9/9** (drift counts on `/drifted` + preference warnings
  unchanged; `/` and `/branded` clean).
- `compiler-jay-html` (728), `compiler-inline-composition` (102), `stack-cli` (134) — all pass.

### Verification criteria — met

- ✅ Source holds no `display:contents` anchor; rendered DOM does (confirmed in build output).
- ✅ `unwrapScopeAnchor` absent from both `materialise.ts` and `diff-markup.ts`; no test depends on it.
- ✅ Smoke 9/9 and all three package suites pass on the regenerated, unwrapped baselines.
- ✅ A clean page stays clean under `validate` with no wrapper round-trip.

### Agent-kit docs updated

The `display:contents` scope anchor is now compiler-synthesized, so the pre-DL#206 authoring model (stamp
the ref as a class on the real root; rewrite the root rule to `:scope`) is gone. Updated the designer guides
to the new model — page region CSS is the template's **plain class rules** wrapped in `@scope (.<ref>)`, no
ref class on markup, no `:scope`:

- `agent-kit-template/designer/design-system-guide.md` — "The shape of a region's CSS" rewritten; sync
  output example and migration note corrected.
- `agent-kit-template/designer/jay-html-styling.md` — "Styling a design-system region" section corrected.
