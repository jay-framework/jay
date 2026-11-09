# Design Log #233 — Semantic rule verification (`designSystemOnly`, `from-template`, `sync`)

Status: **[Design]**. Follows DL#231 (editing-policy engine), which ships these three rule-values as a conservative default. Builds on DL#151 (design-system token analysis), DL#196/#202/#205 (regions, content slots, variants).

## 1. Decisions for the Implementer (TL;DR)

1. **A verification pass in the compare engine, not a richer classifier.** The classifier stays coarse (it emits `design` / `create`); when the resolver reaches one of the three conservative cases it calls a **verifier** that re-reads the two trees for that one change and may upgrade the finding. The classifier is not touched.
2. **Upgrade-only, never less safe.** DL#231 resolves these three to `review` today. DL#233 only ever turns a `review` into _allowed_ (→ possibly PUBLISH) **when it can prove it**; any uncertainty (no `DESIGN.md`, unresolvable template, parse failure) keeps today's `review`. Nothing becomes less strict.
3. **Parse jay-html with the compiler, never raw `node-html-parser`.** `regions.ts` uses `parseJayFile` from `@jay-framework/compiler-jay-html` (✅ `index.ts:32`) → `JayHtmlSourceFile` (`body`, `headlessImports[].template` provenance, `css`). Only the compiler parser understands `<jay:X>` region tags, `template=`, and headless imports correctly. `editing-policy` adds a dep on `compiler-jay-html`. (This is forward-looking for DL#233; the DL#231 signature classifier keeps its own `node-html-parser` diff — see §9.)
4. **New module `lib/semantic/` in `editing-policy`:** `regions.ts` (parse → regions + provenance + a facet-level design diff), `verify-design-system-only.ts`, `verify-from-template.ts`, `verify-sync.ts`. Reuse, don't rebuild: DL#151 `token-matcher` (`matchColor`/`matchSpacing`/`isColorProperty`/…) + `parseDesignMd`/`findDesignMd` — **add them to `design-system-validator`'s `./tools` export** and take a dep (readiness ⚠️ from DL#231 §12). `@jay-framework/compiler-inline-composition` (already a dep) for `materialise`/`mergeOverrides`/`diffBodies`/`isRegionTag`.
5. **`designSystemOnly` = additive + token-only (Q1 — decided: option a).** A `design` change passes iff every changed facet is either (a) an **added** `<jay:X>` region, or (b) an **added** element/class/style whose class/style values are all design-system tokens — and it does **not** restructure or re-theme a pre-existing element. Added regions pass **without** needing `DESIGN.md` (a region is a design-system element by construction); only token-valued facets need `DESIGN.md` (Q4).
6. **`from-template`** passes iff the new page/section contains ≥1 region whose `template=` resolves to a component matching the policy's `templates` globs; markup **outside** template regions in the new page is judged by the role's `design`/`content` rules (reuses the §5 verifier).
7. **`sync`** passes iff the candidate region, diffed against its re-materialised current template source, is empty (a pure re-flatten) — allowed for any role (DL#231 Q10). Checked **before** `design` so a re-flatten never reads as a design violation.
8. **No change to the policy format, `Change`, `Finding`, or `CompareResult` shapes.** Verification happens inside `decide()`; findings that get upgraded simply don't appear.

## 2. Background

DL#231 §13 shipped the engine with three rule-values resolved conservatively (always `review`): `design: designSystemOnly`, `create`/`overrideRoute: from-template`, and `sync` (never detected — a re-flatten reads as `design`). This is safe (fails toward review, never wrongly PUBLISH) but imprecise: a client's legitimate design-system-token edit, a real from-template page, and a re-flatten all route to the admin instead of publishing. DL#231's readiness table (§12) flagged the two missing pieces: the DL#151 `token-matcher` is not exported from `./tools`, and there is no region/template-aware analysis in the compare path.

## 3. Problem

Three of the fourteen rule-values cannot be decided from the coarse `Change` the classifier emits — they need semantic analysis of _what_ changed and _against what_:

| Rule-value                 | Needs to know                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `design: designSystemOnly` | which classes/styles/elements changed, and whether each is a design-system token/element |
| `create: from-template`    | whether a new page/section is built from a `templates`-matching region                   |
| `sync`                     | whether a changed region equals its current template source (a re-flatten)               |

## 4. Prior Art / Adjacent Mechanisms

| Mechanism                                                                                                                                                                                                   | Solves                                                                       | Constrains                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| DL#151 `token-matcher` (✅ `design-system-validator/lib/token-matcher.ts`: `matchColor`/`matchSpacing`/`matchRounded`/`isColorProperty`…) + `parseDesignMd`/`findDesignMd` (✅ `parse-design-md.ts:95,130`) | "is this value a design-system token?" + loading `DESIGN.md`                 | ⚠️ **not exported from `./tools`** (✅ read `design-system-validator/lib/tools.ts`) — must be added or deep-imported |
| `compiler-inline-composition` (✅ index exports `materialise`, `mergeOverrides`, `diffBodies`, `diffCss`, `isRegionTag`, `isContentSlot`, `DiffEntry`/`Facet`)                                              | re-flatten a template (sync) + facet-granular region diff + region detection | region-vs-template semantics (correct for sync; not for page-vs-page — DL#231 deviation #1)                          |
| `JayHeadlessImports.template` (✅ `jay-html-source-file.ts:25`)                                                                                                                                             | `template=` provenance of a region                                           | reading it needs the jay-html parse of the page                                                                      |
| DL#231 classifier (coarse `design`/`create`)                                                                                                                                                                | detects _that_ a change happened + section attribution                       | does not carry _what_ changed — the verifier recomputes it for the flagged file                                      |
| DL#231 `decide()` resolver                                                                                                                                                                                  | per-rule most-specific resolution + `onViolation`                            | the verifier plugs in here; no new resolution surface                                                                |

Null hypothesis — could the classifier just emit richer changes and skip a verifier? Rejected: semantic detail is only needed for the ≤3 flagged changes per compare, and computing design-system/template/sync facts for _every_ change (including the majority that are plain yes/no) wastes work and couples the classifier to the design system. A targeted verifier on flagged changes is smaller and keeps the classifier pure.

## 5. Questions and Answers

- **Q1. What exactly does `designSystemOnly` permit?** A. **Decided: option a** — additive + token-only: add design-system regions/elements and design-system-token classes/styles; no restructuring or re-theming of pre-existing elements. (Rejected: "regions only" too strict; "any resulting values are tokens" too loose — would let a client re-theme existing elements.)
- **Q2. Where does the verifier live?** A. In `editing-policy` (`lib/semantic/`). It is engine logic, not a validator; it belongs with `compare`. It imports token primitives from `design-system-validator/tools` and region primitives from `compiler-inline-composition`.
- **Q3. Does `editing-policy` depend on `design-system-validator`?** A. Yes — add `@jay-framework/design-system-validator` as a dependency and export `token-matcher` + `parseDesignMd`/`findDesignMd` from its `./tools`. Alternative (deep-import `dist/…`) rejected: brittle, bypasses the package's public surface.
- **Q4. What if `DESIGN.md` is absent?** A. Partial verification still applies: a `design` change that is **only added `<jay:X>` regions** passes (regions are design-system elements, no tokens to check). A change that adds/edits **token-valued** classes/styles is `unknown` without `DESIGN.md` → `review`. `from-template` and `sync` never need `DESIGN.md`.
- **Q5. `sync` granularity.** A. Whole-region: a region is `sync` iff its entire body re-flattens to the current template with no residual facet. A partial re-flatten is not `sync` (it is a `design`/`content` change judged normally). Matches DL#231 "equal to its current template source".
- **Q6. Order of checks in `decide()`.** A. `sync` (any role) → `from-template` (for `create`) → `designSystemOnly` (for `design`). A re-flatten must win over a `design: no`/`designSystemOnly` finding.
- **Q7. New-page inner markup (DL#231 §13 item 4).** A. Handled by `from-template`: the verifier splits a new page into template regions (allowed) and non-region markup (judged by the role's `design`/`content` via the §5 facet verifier). No separate classifier change.

## 6. Design

### 6.1 Resolver integration (`compare/resolve.ts`)

`decide()` gains an optional verification step. The engine passes a `SemanticContext` (`{ baseline, candidate, projectRoot, templatesGlobs, designTokens? }`) built once per `comparePolicy` call. When `decide()` would return a conservative finding:

```ts
// sync — any role, before the design rule
if (change.kind === 'design' && verifySync(change, ctx))
  return { allowed: true, ruleId: 'sync', onViolation };

// design: designSystemOnly
if (value === 'designSystemOnly') {
  const verdict = verifyDesignSystemOnly(change, ctx); // 'pass' | 'fail' | 'unknown'
  if (verdict === 'pass')
    return { allowed: true, ruleId: 'design:designSystemOnly', selector, onViolation };
  return { allowed: false, ruleId: 'design:designSystemOnly', selector, onViolation: 'review' }; // fail/unknown → review
}

// create / overrideRoute: from-template
if (value === 'from-template') {
  const verdict = verifyFromTemplate(change, ctx);
  if (verdict === 'pass')
    return { allowed: true, ruleId: `${rule}:from-template`, selector, onViolation };
  return { allowed: false, ruleId: `${rule}:from-template`, selector, onViolation: 'review' };
}
```

`unknown` (no DESIGN.md / unresolvable template / parse error) collapses to `review` — identical to today. Pure functions; `SemanticContext` carries the two `Tree`s so verifiers read on demand (DL#231 lazy-tree model).

### 6.2 `lib/semantic/regions.ts`

- `parsePage(content, path, projectRoot): JayHtmlSourceFile` — wraps `parseJayFile` from `@jay-framework/compiler-jay-html` (**not** raw `node-html-parser`): gives `body` (parsed DOM), `headlessImports[].template` provenance, and `css`. One parse per flagged file; the verifiers operate on its `body`.
- `designFacetDiff(baseBody, candBody): { addedRegions, addedElements, changedExisting, addedClassValues, addedStyleDecls }` — a facet-level design diff over the parsed bodies (added vs edited-existing), using `compiler-inline-composition` helpers (`isRegionTag` to tag region additions). This is the "what changed" the classifier deliberately omits.

### 6.3 `verify-design-system-only.ts`

`verifyDesignSystemOnly(change, ctx): 'pass' | 'fail' | 'unknown'`:

1. `designFacetDiff` the changed subtree (the marked section, or the file).
2. `changedExisting.length > 0` (a pre-existing element restructured/re-themed) ⇒ `fail` — independent of `DESIGN.md`.
3. Added `<jay:X>` regions always pass (design-system elements) — independent of `DESIGN.md` (Q4).
4. For token-valued facets (added class/style values on added elements): if `findDesignMd(path, projectRoot)` returns no tokens ⇒ `unknown` (keep `review`); else `isColorProperty`/`matchColor`/… against the tokens — all match ⇒ `pass`, any miss ⇒ `fail`. A change with no token-valued facets (regions/structure only) skips this step.

### 6.4 `verify-from-template.ts`

`verifyFromTemplate(change, ctx): 'pass' | 'fail' | 'unknown'`:

1. Parse the new page (`candidate.read(change.path)`); `parseRegions`.
2. No region resolves to a `templatesGlobs`-matching component ⇒ `fail`.
3. Else the page is template-based; non-region markup is run through `verifyDesignSystemOnly`-style facet checks → any non-additive/non-token markup ⇒ `fail`, else `pass`. (A page that is _only_ template regions ⇒ `pass`.)

### 6.5 `verify-sync.ts`

`verifySync(change, ctx): boolean` — for a `design` change attributed to a region:

1. Resolve the region's `template=` provenance; unresolved ⇒ `false`.
2. `materialise` the candidate's current template source for that region; `diffBodies(materialised, candidateRegion)`.
3. Empty diff ⇒ `true` (a pure re-flatten).

## 7. Implementation Plan

1. **P0 — deps + exports.** Add `token-matcher` (`matchColor`/`matchSpacing`/`matchRounded`/`matchTypographyProperty`/`is*Property`) + `parseDesignMd`/`findDesignMd` to `design-system-validator/lib/tools.ts`; `editing-policy` takes deps on `@jay-framework/design-system-validator` and `@jay-framework/compiler-jay-html`. Unit test: import round-trips.
2. **P1 — `lib/semantic/regions.ts`** (`parsePage` via `parseJayFile`, `designFacetDiff`) with unit tests on small jay-html strings (added region, added tokenised element, edited existing class, structural add).
3. **P2 — the three verifiers** with unit tests (pass/fail/unknown each), then wire into `decide()` behind a `SemanticContext`.
4. **P3 — compare fixtures (extend the DL#231 §9.1 on-disk matrix).**
   - `baseline/` gains a `DESIGN.md` (tokens) and keeps `src/components/templates/card` as a real template.
   - a new `candidate-semantic/` tree with five changes, each targeting one verifier branch: (1) a design-system-**token** class on **new** content → `designSystemOnly` PASS; (2) a **re-theme of a pre-existing** element → `designSystemOnly` FAIL; (3) a **new page from a `templates/` region** → `from-template` PASS; (4) a **new hand-authored page** → `from-template` FAIL; (5) a **region re-flattened** to its current template → `sync` PASS.
   - a new `policies/semantic.md` where the client has `design: designSystemOnly`, `create: from-template`, `publish: direct` — **`direct` so a verified upgrade is observable as REVIEW→PUBLISH** (under the existing `main` policy's `publish: review`, an allowed change still lands on REVIEW and the upgrade would be invisible).
   - golden `expected/semantic.client.json`: the three PASS changes carry no finding (→ PUBLISH), the two FAIL changes carry a `review` finding. Regenerate via `GEN_GOLDENS=1`; the golden diff vs the conservative baseline is the proof. `semantic × admin` stays PUBLISH.
5. **P4 — live example** on `examples/jay-stack/design-system-demo` (DL#231 §13 item 5): a committed `jay-policy.md` + a small candidate overlay, run through the `compare` bin in a test, asserting the disposition — exercises real `parseJayFile` regions, `template=` provenance, and `DESIGN.md` tokens end-to-end.

## 8. Examples

```html
<!-- designSystemOnly: PASS — added a design-system-token class to NEW content -->
<p class="text-muted">New note</p>
<!-- text-muted ∈ DESIGN.md -->

<!-- designSystemOnly: FAIL — re-themed a pre-existing element -->
<h3 class="card-heading featured">…</h3>
<!-- existing <h3>, class edited -->

<!-- from-template: PASS — new page flattens a templates/ region -->
<jay:card template="src/components/templates/card">…</jay:card>

<!-- sync: PASS — region body == re-materialised template (no residual facet) -->
```

## 9. Trade-offs

- **Upgrade-only keeps it safe** but means a misconfigured DESIGN.md silently yields `review` (not an error). Acceptable — the design-system-validator already validates DESIGN.md; the policy engine should not duplicate that.
- **`editing-policy` → `design-system-validator` dependency** couples two plugins. Justified: the token vocabulary is one concept; duplicating `token-matcher` would drift. The alternative (a shared `design-tokens` package) is more surface than the coupling saves today.
- **Verifier recomputes a facet diff** the classifier already walked past. Bounded (≤3 flagged changes per compare) and keeps the classifier pure (DL#231 deviation #1 stands).

## 10. Scope pre-mortem (not handled)

- Token _contrast_/_a11y_ checks (design-system-validator's job, not policy).
- Cross-file design-system drift (a token renamed in DESIGN.md) — out of scope; this verifies a change against the current tokens.
- `designSystemOnly` on CSS files (external `.css`) — this DL covers jay-html facets; a `.css` edit stays a `css` change under the `css` rule.

## 11. Verification criteria

1. A client design change using only DESIGN.md tokens on new content → PUBLISH (was REVIEW); re-theming an existing element → REVIEW with a `design:designSystemOnly` finding.
2. A new page built from a `templates/` region → PUBLISH under `create: from-template`; a hand-authored new page → REVIEW.
3. A candidate region re-flattened to its current template → `sync`, PUBLISH for every role.
4. No DESIGN.md / unresolvable template / parse error → identical to DL#231 today (REVIEW), never PUBLISH.
5. The DL#231 matrix goldens are unchanged except the intended upgrades; `compare(X,X)` stays PUBLISH.

```

## 12. Implementation Results (2026-11-09)

**Status: P0–P3 implemented and green; P4 (design-system-demo overlay) deferred — the `compare-semantic` fixture covers the same end-to-end path.**

- **P0 — deps + exports.** `design-system-validator` gains a side-effect-free `./design-tokens` subpath (`lib/design-tokens.ts` re-exporting `token-matcher` + `parse-design-md`), its own vite entry, and a `typesVersions` map so the subpath's `.d.ts` resolves under the base tsconfig's classic `node` moduleResolution (editing-policy is the first static subpath type-importer). **Deviation from §1.4:** a dedicated `./design-tokens` subpath instead of `./tools` — `./tools` imports the settings-page component (side-effectful at import); the subpath is clean. `editing-policy` deps: `@jay-framework/design-system-validator` + `@jay-framework/compiler-jay-html`.
- **P1 — `lib/semantic/regions.ts`.** `parsePage` wraps `parseJayFile` (compiler parser, per the user's instruction — never raw node-html-parser); resolves `template=` provenance to root-relative. `designDiff` is a position-independent **multiset** diff (added vs removed/changed by element signature) — avoids the NodePath alignment DL#231 flagged as fragile.
- **P2 — `lib/semantic/verify.ts` + `compare.ts`.** `verifyDesignSystemOnly` (additive + token-only, Q1=a; added regions pass without DESIGN.md, Q4), `verifyFromTemplate` (≥1 region whose `template=` matches the `templates` globs), `verifySync` (`diffBodies(template, region)` empty = re-flatten). `comparePolicy` is now **async** and takes optional `baselineRoot`/`candidateRoot`; an **upgrade-only** pass (`applySemanticUpgrades`) runs after the conservative `decide()` loop and drops a finding when its verifier proves the change safe (sync → designSystemOnly → from-template order). Roots absent → no upgrades (DL#231 behavior). Callers updated (bin passes the dirs; the compare-fixtures test awaits).
- **P3 — fixtures/tests.** `test/fixtures/compare-semantic/` (baseline+candidate+`DESIGN.md`+`components/templates/card`+`policies/semantic.md` with `publish: direct`) exercises all three verifiers through real `comparePolicy`: one candidate with five changes → golden `semantic.client.json` shows **2 surviving findings** (re-theme `designSystemOnly` fail, hand-authored `from-template` fail) while **sync-card, ds-add (token), and offers (from-template) were upgraded** — the observable REVIEW-with-2 vs the conservative REVIEW-with-more. Plus `semantic.test.ts` units (designDiff, the three verifiers). The DL#231 `compare/` matrix goldens are **unchanged** (verifiers fall back to conservative there — no DESIGN.md / no template imports).

Tests: editing-policy **79/79**; build + `validate-plugin` pass (serve entry stays compiler-free — the semantic imports live in `api`/`tools`/`compare`, DL#179 leak scan clean).

**Deviations / deferred:**
1. `./design-tokens` subpath instead of `./tools` (above) — cleaner, no behavior cost.
2. **P4 `examples/jay-stack/design-system-demo` live overlay deferred** — `compare-semantic` is a realistic mini-project exercising the identical end-to-end path (compiler parse, real regions/`template=`, real `DESIGN.md`); the demo overlay would be a near-duplicate. Follow-up if a runnable demo is wanted.
3. `designSystemOnly` v1: an added plain element carrying **class names** is `unknown`→review (class→token membership via `matchComponent` is a v2 refinement); added **inline-style token values** verify precisely today. `from-template` v1 passes on ≥1 template region without re-checking the non-region markup (Q7 v2). Both are upgrade-only-safe.

**Follow-ups (post-review):**
- **Report line ranges** (DL#231 §13): findings/changes on a `jay-policy`-marked part carry `lines:[start,end]` (node-html-parser `.range`), shown in the report; file-level changes have none.
- **Verdict-accurate messages:** a surviving `designSystemOnly`/`from-template` finding is reworded by the upgrade pass to what the verifier actually found — `fail` → "is not design-system-only (re-themes/restructures an existing element or uses a non-token value)" / "is not built from a template"; `unknown` → "could not be confirmed …"; verification not run (no roots / unparsable page) → the conservative "cannot be auto-verified". (Needs the candidate page to parse — a page with no `<head>`/data script yields `unknown`.)
```
