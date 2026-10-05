# DL#207 — Design-system coverage metrics (gamification)

Status: **DESIGN — for review, not implemented.**

## Decisions for the Implementer (TL;DR)

- **Goal:** give an AI agent (and humans) two numbers to **optimize** when building a page against a
  design system, turning "prefer design-system elements" (DL#200) from a pass/fail nudge into a
  measurable score:
  - **(a) Coverage %** — how much of a page's markup is design-system regions.
  - **(b) Reuse factor** — how many design-system templates are used **more than once** across the
    project (a design system whose templates are each used once isn't a design system).
  - The healthy target: **most of a page is composed of design-system elements, and each element is
    reused more than once.**
- **Decision (settled with the author):** **report-only scorecard.** `validate` prints the two
  figures; it **never fails the build** and emits **no new warnings**. Agents read the scorecard and
  optimize. (This is intentionally _not_ the DL#200/DL#176 suppressible-warning model — these are
  metrics, not violations.)
- **Coverage basis (settled):** **DOM element count.**
  `coverage = (elements inside <jay:X> regions) / (total elements in page body)`. Count descendants
  of **top-level** regions only, to avoid double-counting nested regions. ✅ data available.
- **Where it's computed:** entirely inside the existing per-file loop of `validateJayFiles`
  (`validate.ts:1992`, right where `regionsSeen`/`templateImportsSeen` are already tallied). Both
  inputs are already in scope — `parsedFile.val!.body` is a full node-html-parser tree
  (`jay-html-source-file.ts:46`) supporting `querySelectorAll('*')`, and `collectRegionElements(body)`
  (`validate.ts:793-805`) already enumerates regions. ✅ verified
- **Reuse map:** accumulate `Map<templatePath, count>` across pages in the same loop, keyed by each
  region's resolved `imp.template` (the `validate.ts:1264` import-matching pattern). "Reused > 1" =
  entries with count ≥ 2. Cross-reference the template universe from `buildDesignSystemIndex` /
  `listTemplatesForContractFile` (`design-system-index.ts:95,174`). ✅ verified data is reachable; no
  such counting exists today.
- **New output surface:** add fields to `ValidationResult` (`validate.ts:91-99`, returned `:2186`) —
  they serialize automatically under `--json` (`:2199`); render them in the console summary
  (`:2301-2329`). Today `validate` has **no** metrics/score channel — this is genuinely new output.
- **Prevention-first ordering (CLAUDE.md):** this is the _validation/visibility_ rung, not a new
  framework feature. It reuses existing walks and the existing results object; zero runtime, zero
  syntax.

## Background

DL#200 shipped four default-on `validate` warnings enforcing "prefer design-system elements"
(`REGION-NOT-LINKED`, `COMPONENT-NO-TEMPLATE`, `REGION-OVERRIDE-NON-CONTENT`, `NO-DESIGN-SYSTEM`).
They catch _individual_ anti-patterns but give no sense of _how well_ a page uses the design system
overall. DL#204 generates `agent-kit/design-system-index.yaml` cataloging available components +
template variants — but it **never scans pages**, so it carries **no usage counts**
(`design-system-index.ts:174-227`). ✅ verified

An agent building a page has the catalog of what _could_ be used, and point warnings for specific
misuse, but no single signal for "is this page actually built from the design system, and is the
design system actually being reused?" DL#207 adds that signal.

## Problem

Two healthy-design-system properties are currently invisible:

1. **Coverage** — a page should be mostly composed of design-system regions, not hand-rolled markup.
   Nothing measures the ratio.
2. **Reuse** — a design system earns its name only when its templates are used many times. A template
   used once is really a one-off; nothing flags the "zoo of single-use templates" failure mode.
   `NO-DESIGN-SYSTEM` is a single boolean-ish aggregate (`templateImportsSeen` scalar,
   `validate.ts:1992-1995`) — it cannot express per-template reuse. ✅ verified

## Prior Art / Adjacent Mechanisms

| Mechanism                                                 | Where                              | Solves? / Constrains?                                                                            |
| --------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| DL#200 region/DS warnings                                 | `validate.ts:1255-1411` ✅         | Point violations, not an aggregate score; reuse their region/import matching                     |
| `collectRegionElements(root)`                             | `validate.ts:793-805` ✅           | Enumerates all `<jay:X>` (incl. nested) — the coverage numerator source; **must dedupe nested**  |
| `directChildRegions`                                      | `validate.ts:812-824` ✅           | Top-level-only enumeration → avoids double-counting                                              |
| `regionsSeen` / `templateImportsSeen` tally               | `validate.ts:1992-1995` ✅         | The exact loop to extend; scalar today                                                           |
| `parsedFile.val!.body` = node-html-parser `HTMLElement`   | `jay-html-source-file.ts:46` ✅    | `querySelectorAll('*')` gives total element count — the denominator                              |
| `ValidationResult` + `printJayValidationResult`           | `validate.ts:91-99, 2197-2330` ✅  | The results object + both renderers to extend; **no metrics field today**                        |
| `ContractCoverage` (tag coverage)                         | `validate.ts:77-343` ✅            | A _different_ "coverage" (contract tags used) — do **not** conflate; name the new one distinctly |
| `listTemplatesForContractFile` / `buildDesignSystemIndex` | `design-system-index.ts:95,174` ✅ | The template universe to compute "N of M templates reused > 1"                                   |

**Null hypothesis — does anything already produce these numbers?** No. The only existing "coverage"
is contract-**tag** coverage (`ContractCoverage`), a different notion. DL#204's index has no usage
counts. So the metrics are new, but every **input** already exists in the validate loop — the work is
accumulation + rendering, not new parsing or new runtime. ✅ verified

## Questions and Answers

**Q1. Report-only, or warnings with thresholds?**
A. **Report-only** (author decision). These are optimization signals, not violations; a low score on
a deliberately-simple page is not a bug. Keeping them out of `warnings[]` avoids threshold-tuning and
suppression churn (DL#176). Revisit only if agents ignore the scorecard.

**Q2. Coverage denominator — DOM elements, top-level blocks, or leaf weight?**
A. **DOM element count** (author decision): `elements-in-regions / total-elements`. Intuitive
("how much of the markup is design-system"). Count descendants of **top-level** regions only
(`directChildRegions`) so a nested region isn't counted twice. Text nodes excluded (elements only,
`querySelectorAll('*')`).

**Q3. Do we count any `<jay:X>`, or only `template=`-backed regions?**
A. **Only `template=`-backed regions** count as "design-system" coverage — consistent with DL#200's
strict definition (a hand-authored `<jay:X>` without `template=` is _not yet_ design-system; it fires
`REGION-NOT-LINKED`). This makes "raise coverage" and "fix REGION-NOT-LINKED" pull in the same
direction. ✅ decidable from `imp.template` (`validate.ts:1264-1268`).

**Q4. Reuse — counted how, and across what scope?**
A. Per **template path** (`imp.template`), across **all pages** in the project (the files
`validateJayFiles` already iterates). Reuse factor reported two ways: the count per template
(`card ×4`), and the headline **"K of M catalogued templates used > 1"** (M from the design-system
index). Multiple instances of one template _on one page_ count as multiple uses. ⚠️ assumed: whether
same-page repeats "count" for reuse — yes by default (a carousel of 6 cards is real reuse); open to
"distinct pages only" if the author prefers.

**Q5. What's the single-number "score"?**
A. Keep it legible: report the two raw figures prominently; an optional coarse letter/grade is
cosmetic. Do **not** over-engineer a weighted composite — the two numbers are the product. (The
mock shows `Score: B` as flavor; it can be dropped.)

**Q6. Components vs pages?**
A. Compute coverage for **pages** only (files under `pagesBase`), matching where DL#200's
page-scoped region warnings run (`validate.ts:1999`). Components are the design-system _source_;
scoring their internal coverage would be circular.

## Design

Extend `validateJayFiles` — no new files, no new walks:

1. **Per page, in the existing loop (`validate.ts:1992`):**
   - `total = parsedFile.val!.body.querySelectorAll('*').length`
   - `covered = Σ over directChildRegions(body) that are template=-backed of region.querySelectorAll('*').length + 1` (the region element itself + its descendants). Dedupe by node identity if a top-level region nests another.
   - `coverage% = covered / total` (guard `total === 0`).
   - Push `{ file, coveragePct, covered, total }` into a new `designSystemCoverage[]`.
2. **Project-wide reuse, same loop:** for each region, resolve its import (existing
   `validate.ts:1264` pattern) and `reuse.set(imp.template, (reuse.get(imp.template) ?? 0) + 1)`.
   After the loop, compute `reusedMoreThanOnce = [...reuse].filter(([,n]) => n >= 2)` and, using the
   index template universe, `catalogued = M`, `reusedOfCatalogued = K`.
3. **Results object:** add `designSystemCoverage: FileCoverage2[]` and
   `designSystemReuse: { perTemplate: Record<path,count>, catalogued: number, reusedMoreThanOnce: number }`
   to `ValidationResult` (`validate.ts:91-99`), populated before the return (`:2186`).
4. **Render:** in `printJayValidationResult` — JSON branch is automatic (`:2199`); add a "Design-system
   scorecard" block to the console summary (`:2301-2329`) listing per-page coverage (flagging low with
   a `⚠` glyph, informational only) and the reuse line.

### Scorecard mock

```
Design-system scorecard
  Coverage:  pages/home    72%  (28/39 elements)
             pages/about   31%  ⚠ low   (12/38 elements)
  Reuse:     card ×4   hero ×1 ⚠ single-use   feature-card ×2
             5 of 7 catalogued templates reused > 1
```

## Implementation Plan

- **Phase 1 — coverage.** Steps 1, 3 (coverage half), 4. Fixture pages with known element counts
  (a mostly-region page → high %, a mostly-hand-authored page → low %). Assert exact `covered/total`
  via a results-object test (**not** string matching — and never `toContain` on code).
- **Phase 2 — reuse.** Steps 2, 3 (reuse half), 4. Multi-page fixture project: one template used
  4×, one used once, one used 2×; assert the reuse map and the "K of M" headline.
- **Phase 3 — docs/agent-kit.** Document the two metrics and the "raise coverage, reuse templates"
  goal in the relevant agent-kit designer guide so agents optimize them deliberately (prevention rung
  two). Link from DL#200.

## Scope Pre-mortem (what this does NOT handle)

- **Thresholds / build-gating.** Deferred by decision (Q1). If needed later, that's its own DL (a
  `DESIGN-SYSTEM-COVERAGE-LOW` suppressible warning), not a quiet addition here.
- **Weighting by rendered/visual area.** Rejected for v1 (leaf-weight option) — too complex to
  explain; DOM count is the agreed basis. Own DL if ever wanted.
- **Cross-project / plugin-template reuse.** Reuse is counted within the scanned project only.
  Plugin-provided templates still count per `imp.template`; a plugin's _internal_ reuse is out of
  scope.
- **Historical trend / scoring over time.** Out of scope; the scorecard is per-run.
- **Nested-region double-count.** Explicitly handled (Q2, dedupe) — called out so it isn't
  rediscovered as a bug.

## Verification Criteria

- On a fixture page that is 100% one design-system region, coverage reports 100% (± the wrapper/root
  accounting, which must be defined and tested exactly).
- On a hand-authored page with no `template=` regions, coverage reports 0% and reuse is empty.
- A template used 4× across three pages reports `×4` and is counted in "reused > 1"; a once-used
  template is flagged single-use.
- `validate` exit code is **unchanged** by the metrics (report-only); `--json` includes the new
  fields.

## Trade-offs

- **+** Turns a vague "use the design system" into two optimizable numbers agents can hill-climb;
  pure reuse of existing walks and the existing results object; no runtime, no syntax, no new failure
  mode.
- **−** New output surface to keep stable (JSON consumers); a coverage number can be gamed (wrap junk
  in a region) — mitigated because DL#200 warnings still police _what_ is in a region and
  `REGION-OVERRIDE-NON-CONTENT` flags abuse.
- **−** "Coverage" now names two things (contract-tag coverage vs DS element coverage) — must be
  labeled distinctly in output to avoid confusion.

## Implementation Results

Implemented in `packages/jay-stack/stack-cli/lib/validate.ts` (purely additive, report-only — no change
to `valid`/exit code, no new warnings). Status: **IMPLEMENTED.**

### Fields added to `ValidationResult`

```ts
export interface DesignSystemCoverage {
    file: string;        // project-relative page path
    coveragePct: number; // covered / total, or 0 when total === 0
    covered: number;
    total: number;
}
export interface DesignSystemReuse {
    perTemplate: Record<string, number>; // project-relative template path → region count
    catalogued: number;                  // M — size of the catalogued template universe
    reusedMoreThanOnce: number;          // used templates with count ≥ 2
    reusedOfCatalogued: number;          // K — catalogued templates with count ≥ 2 (the "K of M")
}
// on ValidationResult:
designSystemCoverage: DesignSystemCoverage[];
designSystemReuse: DesignSystemReuse;
```

Deviation from the design's `{ perTemplate, catalogued, reusedMoreThanOnce }`: added a fourth field
`reusedOfCatalogued` because the scorecard headline "K of M catalogued templates reused > 1" needs K
(catalogued templates with count ≥ 2) distinct from `reusedMoreThanOnce` (all used templates with
count ≥ 2). Both are reported.

### Formulas as implemented

- **Coverage (pages only — files under `scanDir`, i.e. not in `componentJayHtmlFileSet`), per page:**
  - `total = parsedFile.val!.body.querySelectorAll('*').length` (elements only; the DL#206
    `display:contents` wrapper, if present, counts uniformly in both numerator and denominator).
  - `covered` = size of a `Set<HTMLElement>` built by, for each `directChildRegions(body)` region that
    is `template=`-backed (resolve `imp` by region contract name, require `imp.template`), adding the
    region element itself **plus** every `region.querySelectorAll('*')` descendant. The Set dedupes by
    node identity (a nested region inside a top-level region is never double-counted).
  - `coveragePct = total ? covered / total : 0`.
- **Reuse (accumulated project-wide from the same page-region walk):**
  - key = `path.resolve(pageDir, imp.template)` (absolute); `reuseByTemplate.set(key, prev+1)` per
    `template=`-backed region occurrence (same-page repeats count).
  - `perTemplate` = the map re-keyed to project-relative `./…` paths.
  - `catalogued` = count of distinct absolute template paths from `listTemplatesForContractFile` over
    the catalogued contract set = (every `.jay-contract` under `componentsBase`) ∪ (every
    `imp.contractPath` a page imports with `template=`). The union makes M complete even when the
    components root is not co-located with `cwd` (as in unit tests, where `path.resolve(componentsBase)`
    resolves against the test `cwd`, not `projectRoot`).
  - `reusedMoreThanOnce` = `[...reuseByTemplate.values()].filter(n => n >= 2).length`.
  - `reusedOfCatalogued` = catalogued template paths whose `reuseByTemplate` count ≥ 2.

### Render

Added a `📊 Design-system scorecard` block in `printJayValidationResult` before the summary: per-page
`Coverage: <file>  <pct>%  (<covered>/<total> elements)` (an informational `⚠ low` flag when `pct < 50`,
no exit-code effect), a `Reuse:` line of `path ×N` (`⚠ single-use` when `N < 2`), and the
`K of M catalogued templates reused > 1` headline. JSON (`--json`) serializes the new fields
automatically.

### Fixtures added (under `packages/jay-stack/stack-cli/test/fixtures/validate/`)

- `ds-coverage-high/` — a page that is mostly one `template=`-backed `<jay:card>` region plus a
  hand-authored `<footer>` → covered 4 / total 5 (80%).
- `ds-coverage-none/` — a hand-authored page with no `template=` regions → covered 0 / total 3 (0%),
  reuse empty, catalogued 0.
- `ds-reuse/` — two pages (`home`, `about`) + three components (card, hero, feature): card used 4×,
  feature 2×, hero 1× → `reusedMoreThanOnce = 2`, `catalogued = 3`, `reusedOfCatalogued = 2` ("2 of 3").

### Tests

New `test/validate-design-system-scorecard.test.ts` (4 tests) asserts exclusively on the result-object
fields with `toEqual`/`toBe` (no `toContain`, no console-string matching). All 4 pass.

Package run `yarn vitest run`: **128 passed, 3 failed (131 total)**. The 3 failures are all in
`test/run-sync.test.ts` and are **pre-existing DL#206 consequences** (confirmed: they also fail with
this DL's changes stashed) — the `:scope` / `.card`-form CSS-scoping assertions:

- `overwrites an unmarked stale .card-form block to the canonical :scope coalesced block` (line 77)
- `coalesces … to the canonical :scope coalesced block` (line 125)
- `is idempotent — a synced page reports no further change` (line 144)

These need fixture regeneration by the DL#206 orchestrator; they are untouched by DL#207. `yarn build`
(bundle + DTS type-check) succeeds.

### Agent-kit docs updated (Phase 3)

- `agent-kit-template/designer/validation-guide.md` — new "Design-system scorecard (metrics to optimize)"
  section documenting the two metrics (coverage %, reuse), the raise-coverage/reuse-templates goal, and that
  regular mode prints one-line totals while `-v` expands per-page detail.
- Console output refined: regular `validate` prints one-line **tag coverage** + **scorecard** totals plus a
  "Run validate -v for per-page details" hint; `-v` keeps the full per-page/per-contract breakdown
  (`validate.ts`). Per-page statistics are no longer shown by default.
