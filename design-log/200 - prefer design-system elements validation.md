# DL#200 — Prefer design-system elements (validation + minimal guidance)

Status: **DRAFT (for review)** — 2026-10-01
Related: #196 (validated inline composition — the flatten/drift/sync model), #198 (free refs), plugin
`design-system-validator`.

## Decisions for the Implementer (TL;DR)

- **Problem being solved:** agents consume headless components by hand-authoring the `<jay:X>` body instead of
  flattening a shipped template as a **design-system element**, and authors ship components with no template at
  all. The preference is currently un-enforced; stating it across the agent-kit is costly and weakly followed.
- **Primary mechanism = core `validate` rules + suppress**, per the project prevention ordering
  (Validation → Agent-kit guide → Framework feature). Not a new framework feature, not scattered docs.
- **Four rules, all warnings, all suppressible, build never fails on them:**
  1. **`REGION-NOT-LINKED`** (per region) — a `<jay:X>` region whose import has **no `template=`** _while a
     template exists for the same contract_ → warn, suggest `template=` + `jay-stack sync`.
  2. **`COMPONENT-NO-TEMPLATE`** (per component) — a headless component that ships **no `.jay-html` template at
     all** → warn, suggest creating a reusable design-system template (distinct message; suppress for genuinely
     UI-less, data-only components).
  3. **`REGION-OVERRIDE-NON-CONTENT`** (per linked region) — a region with `template=` carrying **any**
     non-content override → warn, suggest a **second template** (a new design-system variant). No threshold: one
     fires it. **Content** (never fires): text / `src` / `alt`, and **net-new DOM made only of content tags** (a
     tunable allowlist: `span`, `strong`, `em`, `a`, `img`, `ul`/`li`, `table`, `p`, `h1`–`h6`, … — subsumes
     enriching text with bold/span/icon/image). **Non-content** (fires): style/class changes, **or net-new DOM
     with any non-allowlisted tag** (`div`, `section`, layout wrappers, custom components).
  4. **`NO-DESIGN-SYSTEM`** (project summary, once) — project has **zero** design-system elements; two messages
     by whether regions exist at all (see Design).
- **Availability is keyed by contract (Q2 resolved):** templates and components share the same `.jay-contract`,
  so "a template exists for this contract" is decidable for **both** local (sibling `.jay-html`) and plugin
  (plugin-advertised template) components. No local-only limitation.
- **Suppression is on the import (Q1 resolved):** suppress per **region type** with a `jay-validations=` attribute
  on the `application/jay-headless` script tag (scopes to that contract/region type naturally). Alternative/addition:
  a **list** keyed by contract in the `application/jay-validations` script (`allow-inline-region: [Card, ...]`).
- **Two templates vs. conditional (new, documented):** **two templates = two different design-system elements**
  (author-time variants, chosen at composition); **conditional (`if`/`variant`) = runtime changes** within one
  element. `REGION-OVERRIDE-NON-CONTENT` points authors to the _two-templates_ axis, not to conditionals.
- **Validate is project-scoped (Q5 resolved):** `jay-stack validate` runs over the whole project, so
  `NO-DESIGN-SYSTEM` is emitted **once in the run summary**, not per file.
- **Default-on (Q4 resolved).** All four ship on as warnings.
- **Docs shrink, not grow:** one authoritative "Prefer design-system elements" section in
  `designer/design-system-guide.md`; the validator messages carry the rest at point-of-use.

## Background

DL#196 made a component's `.jay-html` a _source template_ that is **flattened** into the consuming page as a
`<jay:X>` region; `template=` on the headless import is the provenance marker, and `jay-stack validate` /
`jay-stack sync` keep the flattened copy reconciled with source. A region **without** `template=` is a plain
hand-authored instance — valid, but unmanaged. A region can be used **without code** — purely to flatten and
share a design-system template (passthrough; DL#196 `makePassthroughInstanceComponent`).

The agent-kit now _describes_ flattening but never says **prefer creating and consuming design-system
elements**. The preferences to make real:

1. Prefer creating **and** consuming nested component templates as design-system elements.
2. If extensive overrides are required, create **another** design-system template for the same component
   (rather than piling overrides onto one instance).
3. Use an inline template **without** a design-system template only for a **singular** component usage.

## Problem

Stating these across the agent-kit is high-maintenance and low-adherence. The cheaper, more reliable lever is
validation at the point of use: warnings the agent sees when it (a) hand-authors a region it could have linked,
(b) ships a component with no template, (c) piles style/class overrides onto one instance, or (d) builds a whole
project with no design system — each with a suppression for the legitimate case.

## Prior Art / Adjacent Mechanisms (null-hypothesis check)

- **`checkRegionDrift` / `checkRegionCssDrift` (validate.ts:845, 904)** — only act on regions that _already_
  carry `template=` (filtered at validate.ts:849). Regions **without** `template=` are entirely unchecked, and
  nothing nudges toward _becoming_ a design-system element, _authoring_ a template, or _adopting_ the pattern
  project-wide. → The gap is real.
- **`collectRegionElements` (validate.ts:783)** + match-by-`contractName` (validate.ts:857-859) — reuse to
  enumerate regions and find the backing import. The same `contractName` is the join key for availability.
- **Import classification (jay-html-source-file.ts:13-26; parser 645/660/691/765/871-872)** — `key` ⇒ keyed
  (skip), `template` ⇒ design-system (skip region rule, counts as present for project rule), `structural:true`
  w/o `template` ⇒ hand-authored instance (candidate), coded (`src=`) w/o `template` ⇒ candidate. Already parsed.
- **Override facets (DL#196):** `override` is per-facet — a single attribute, one inline-style member, a subtree,
  or a CSS rule/declaration. `REGION-OVERRIDE-NON-CONTENT` reads the per-facet override set the differ already
  computes. Content vs non-content is decided by a **content-tag allowlist** applied to the **tags of any added
  elements** (plus: style/class facets are always non-content; text/`src`/`alt` always content). The differ
  already reports which elements/tags were added, so **no new verdict field is needed** — the rule just inspects
  the added tag names. If the differ does not currently expose added-element tag names cleanly, a small read-only
  accessor is the only addition.
- **Suppression (`parseValidationOverrides`, parser 1016-1036; consumed e.g. validate.ts:1598)** — per-rule,
  per-page, `jay-stack` namespace. The **list** form reuses this. The **import-attribute** form is new parsing on
  the `application/jay-headless` script tag (small, additive — one attribute).
- **Severity** — core rules push to `errors[]`/`warnings[]` (validate.ts:1548-1591). All four push to
  `warnings[]`.

Conclusion: no new runtime, no new syntax in templates, no new diff verdict. One attribute on the headless import
for suppression, four `checkX`-style functions (three per-file/per-component, one aggregate), a content-tag
allowlist constant, reuse of the DL#196 override set and the contract join key. At most a small read-only accessor
if the differ doesn't already expose added-element tag names.

## Design

### Availability — "a template exists for this contract" (resolves Q2)

Templates and components share a contract, so availability is decidable by **contract identity**, not file
proximity:

- **Local component:** a sibling/companion `.jay-html` bound to the same `contract=` exists in the components
  tree. (Common case: `card.jay-contract` + `card.jay-html`.)
- **Plugin component:** the plugin advertises a template for that contract (via `plugins-index.yaml` / the
  contract). Since the contract is shared, the same join resolves it.
- If **no** template exists for the contract anywhere → `REGION-NOT-LINKED` does **not** fire (nothing to link);
  `COMPONENT-NO-TEMPLATE` is the relevant rule for the _authoring_ side instead.

### Rule 1 — `REGION-NOT-LINKED` (warning, per region)

For each `<jay:X>` region (via `collectRegionElements`):

1. Resolve its backing headless import by `contractName`.
2. **Skip** if the import has `key` (keyed) or already has `template` (it _is_ a design-system element).
3. **Candidate** = import without `template`.
4. **Fire** iff a template exists for the region's contract (availability above). Otherwise no warn.
5. **Message:** `<jay:{name}> is hand-authored, but a design-system template exists for contract "{contract}"
({path}). Prefer linking it: add template="{path}" and run \`jay-stack sync\`. For a one-off usage, suppress
   on the import (jay-validations="REGION-NOT-LINKED").`

### Rule 2 — `COMPONENT-NO-TEMPLATE` (warning, per component)

When validating a headless component (has a `.jay-contract` + code; in `src/components/` or a plugin) that ships
**no** `.jay-html` template for its contract:

- **Message:** `Component "{contract}" ships no .jay-html template. If it renders UI, create a reusable
design-system template so consumers flatten it (template= + jay-stack sync) instead of hand-authoring each
usage. If this component is intentionally UI-less (data/logic only), suppress with
jay-validations="COMPONENT-NO-TEMPLATE".`
- This is the _creating_ side of preference #1 at the authoring source. Distinct message from Rule 1 so the fix
  is unambiguous (here: _author_ a template; there: _link_ an existing one).

### Rule 3 — `REGION-OVERRIDE-NON-CONTENT` (warning, per linked region) — resolves Q3

Only on regions that **have** `template=`. Read the per-facet override set (DL#196) and classify each override as
**content** (fine) or **non-content** (fires). Classification uses a **content-tag allowlist** — the simple
approach:

- **Content overrides — never fire (expected; this is what flattening is for):**
  - text nodes, image `src`, `alt` (and equivalent per-element copy);
  - **net-new DOM made only of content tags** — if every added element is on the content-tag allowlist
    (`span`, `strong`/`b`, `em`/`i`, `u`, `small`, `mark`, `sub`/`sup`, `a`, `br`, `img`/`picture`/`svg`/icon,
    `ul`/`ol`/`li`, `dl`/`dt`/`dd`, `table`/`thead`/`tbody`/`tr`/`td`/`th`/`caption`, `p`, `h1`–`h6`, `blockquote`,
    `code`/`pre`, `figure`/`figcaption`, `time`, `abbr`, `cite`, `q` — tunable), the change is richer _content_,
    not a different design. This subsumes "enriching a bare text into text + bold/span/icon/image."
- **Non-content overrides — fire:**
  - **style/class overrides** — `class` attribute, inline-style members, CSS declarations (changes the _look_);
  - **net-new DOM with any non-content tag** — if any added element is **not** on the allowlist (`div`, `section`,
    `article`, `aside`, `header`, `footer`, `nav`, `main`, `form`, layout wrappers, custom components), that is
    structural/layout rework → a different design.

**Fire on the first non-content override** — no threshold (Q7). A single style/class change or a single non-content
element means the instance is becoming its own variant, so the nudge should appear immediately.

The **allowlist** is a single tunable constant; defaulting it broadly (above) keeps content enrichment quiet while
catching layout/structure rework. This replaces any need for the differ to decide "is this replacing a text node"
— the rule only needs **which tags were added**, which the diff already reports.

- **Message:** `<jay:{name}> changes its design-system template's look/structure (style, class, or net-new DOM) —
that's a different design, not a content tweak. Prefer a second design-system template (a new variant) for
contract "{contract}" and link this region to it. (Editing text/images, or enriching text with inline markup,
is fine; use conditionals only for runtime state changes, not for a different design.)`
- **Two templates vs. conditional:** the message makes the axis explicit — **two templates = two design-system
  variants** chosen at composition; **`if`/`variant` = runtime changes** inside one element. Overrides that are
  really a _second design_ (restyle or net-new structure) belong on the two-templates axis.

### Rule 4 — `NO-DESIGN-SYSTEM` (warning, project summary, once) — resolves Q5

`jay-stack validate` is project-scoped, so this is an aggregate emitted **once in the run summary**. After the
per-file pass, tally `regionsSeen` and `templateImportsSeen` (imports with `template=`) across the whole project:

- `templateImportsSeen > 0` → **no finding** (project has a design system).
- `templateImportsSeen === 0 && regionsSeen > 0` → `This project composes components but none are design-system
elements. Ship a .jay-html template with a reused component and flatten it (template= + jay-stack sync) so
pages share consistent, upgradable UI.`
- `templateImportsSeen === 0 && regionsSeen === 0` → `This project shares no UI through design-system elements.
Consider composing reusable sections as components with .jay-html templates — regions can be used without code,
purely to flatten and share a design system — see design-system-guide.md.`
- **Suppress:** `jay-stack: allow-no-design-system: true` (project-wide).

### Suppression (resolves Q1)

**Primary — on the import, per region type.** A `jay-validations=` attribute on the `application/jay-headless`
script tag suppresses the named rule(s) for _that contract / region type_:

```html
<script
  type="application/jay-headless"
  contract="./components/card/card.jay-contract"
  jay-validations="REGION-NOT-LINKED"
></script>
<!-- suppresses REGION-NOT-LINKED for every <jay:card> fed by this import -->
```

Value is a space/comma list of rule names (`REGION-NOT-LINKED`, `REGION-OVERRIDE-NON-CONTENT`, `COMPONENT-NO-TEMPLATE`).
Because the import _is_ the region type, this is the natural "allow inline for this component" switch.

**Alternative/addition — a list in the validations script**, keyed by contract (region type):

```html
<script type="application/jay-validations">
  jay-stack:
    allow-inline-region: [Card, HeroBanner]      # contract names
    allow-no-design-system: true
</script>
```

`NO-DESIGN-SYSTEM` has no import to hang on, so it uses the validations-script form only.

### Docs (shrink to one authoritative spot)

Add to `designer/design-system-guide.md` a short **"Prefer design-system elements"** section stating the three
preferences **plus** the two-templates-vs-conditional distinction, and point the four rules' `suggestion` text at
it. Keep the brief "prefer a design system" pointers already added across guides; let the validator + this one
canonical section carry the substance.

## Questions and Answers

**Q1. Where does suppression live?**
A: **On the import, per region type**, via a `jay-validations=` attribute on the `application/jay-headless` script
(space/comma list of rule names) — this scopes to the contract/region type. **Plus** a contract-keyed list in the
`application/jay-validations` script (`allow-inline-region: [Contract, …]`). Project-scope `NO-DESIGN-SYSTEM`
uses the validations-script form (`allow-no-design-system: true`) since it has no import.

**Q2. How do we know a template is available (incl. plugin components)?**
A: **Resolved — by contract identity.** Templates and components share the same `.jay-contract`; "a template
exists for this contract" is decidable for local (sibling `.jay-html`) and plugin (plugin-advertised) alike. No
local-only limitation. When no template exists for the contract, `REGION-NOT-LINKED` stays silent and
`COMPONENT-NO-TEMPLATE` covers the authoring side.

**Q3. Preference #2 (extensive overrides → new template) — rule or doc?**
A: **Rule — `REGION-OVERRIDE-NON-CONTENT`, by kind via a content-tag allowlist (no threshold).** **Content**
overrides never fire: text / `src` / `alt`, and **net-new DOM made only of content tags** (allowlist: `span`,
`strong`, `em`, `a`, `img`, `ul`/`li`, `table`, `p`, `h1`–`h6`, … — this subsumes enriching text with
bold/span/icon/image). **Non-content** fires: **style/class** changes, **or net-new DOM with any non-allowlisted
tag** (`div`, `section`, layout wrappers, custom components). On the first such override, warn and suggest a
**second design-system template** (a variant). Also documents two-templates (design variants) vs. conditional
(runtime) so authors pick the right axis.

**Q4. Default-on or opt-in?**
A: **Default-on**, all four as warnings (visible, non-blocking, suppressible).

**Q5. Project-level attach point / aggregate stage.**
A: **Resolved — validate is project-scoped**; `NO-DESIGN-SYSTEM` is emitted **once in the run summary** from a
reduce over the per-file tallies (`regionsSeen`, `templateImportsSeen`). No synthetic per-file target.

**Q6. Firing by multiplicity (≥2 instances)?**
A: **No.** Availability (contract match), not per-page count, is the `REGION-NOT-LINKED` trigger. Singular usage
is handled by (a) no template for the contract ⇒ no warn, or (b) suppress on the import.

**Q7. `REGION-OVERRIDE-NON-CONTENT` threshold.**
A: **Resolved — no threshold; classify by a content-tag allowlist.** Any style/class override, or any added
element whose tag is **not** on the allowlist, fires. Content edits (text / `src` / `alt`) and net-new DOM made
**only** of allowlisted content tags never fire. Deterministic, no magic percentage. **Remaining tuning (minor):**
the exact allowlist membership — the default (inline + list + table + heading/text semantics) is a starting point;
add/remove tags as the `design-system-demo` fixtures show false positives/negatives. The allowlist is a single
constant, trivially adjustable.

## Implementation Plan

1. **`REGION-NOT-LINKED`** `checkRegionNotLinked(...)` in `stack-cli/lib/validate.ts` beside `checkRegionDrift`
   (validate.ts:845). Reuse `collectRegionElements` + contractName match. Availability = template-for-contract
   resolver (local sibling + plugin-advertised). Push to `warnings[]`.
2. **`COMPONENT-NO-TEMPLATE`** per-component check: component has contract + code, no template for its contract →
   `warnings[]`.
3. **Content-tag allowlist** — a single tunable constant (default list in Rule 3). Ensure the differ exposes the
   **tags of added elements** per region (small read-only accessor if not already available); no new verdict field.
4. **`REGION-OVERRIDE-NON-CONTENT`** on `template=` regions: fire on the **first** non-content override (no
   threshold) — style/class facet, or an added element whose tag is not on the allowlist. `warnings[]`.
5. **`NO-DESIGN-SYSTEM`** aggregate: tally `regionsSeen` / `templateImportsSeen` during the per-file pass; emit
   zero/one finding in the **run summary** (two message variants).
6. **Suppression** — (a) parse `jay-validations=` attribute on `application/jay-headless` (rule-name list) in the
   parser's headless-import parse; filter per-rule for that region type. (b) read
   `validationOverrides['jay-stack']['allow-inline-region']` (contract-name list) and `['allow-no-design-system']`
   (bool).
7. **Docs** — "Prefer design-system elements" section (three preferences + two-templates-vs-conditional) in
   `designer/design-system-guide.md`; point all four rules' `suggestion` at it. Add the suppression keys to
   `designer/validation-guide.md` and `cli-commands.md` tables.
8. **Tests** — fixture-based under `stack-cli/test/fixtures/validate/`, full `toEqual` on the findings array (no
   `toContain`):
   - **R1:** region, template-for-contract exists, not linked → one `REGION-NOT-LINKED`; linked → clean;
     no-template-for-contract → clean; suppressed via import attr → clean; suppressed via `allow-inline-region`
     list → clean; keyed import → clean.
   - **R2:** component with contract+code, no template → one `COMPONENT-NO-TEMPLATE`; with template → clean;
     suppressed → clean.
   - **R3:** linked region, content-only overrides (text / `src` / `alt`) → clean; **net-new DOM of allowlisted
     tags only** (e.g. `<strong>`/`<span>`/`<img>`, or a `<ul><li>` list) → clean; **a single style/class**
     override → one `REGION-OVERRIDE-NON-CONTENT`; **net-new DOM with a non-allowlisted tag** (e.g. `<div>`
     wrapper, `<section>`) → one `REGION-OVERRIDE-NON-CONTENT`.
   - **R4:** project with regions, zero `template=` → one `NO-DESIGN-SYSTEM` (compose-variant message); project
     with no regions and zero `template=` → one `NO-DESIGN-SYSTEM` (adopt-regions message); project with ≥1
     `template=` → clean; suppressed → clean.

## Examples

❌ `REGION-NOT-LINKED` — a template exists for the contract but the region is hand-authored:

```html
<script type="application/jay-headless" contract="./components/card/card.jay-contract"></script>
...
<jay:card ref="promo"><div class="card">…hand-written…</div></jay:card>
<!-- warning: a design-system template exists for contract "Card" — add template= and jay-stack sync -->
```

✅ Linked as a design-system element:

```html
<script
  type="application/jay-headless"
  contract="./components/card/card.jay-contract"
  template="./components/card/card.jay-html"
></script>
<jay:card ref="promo"><div class="card promo">…flattened, editable copy…</div></jay:card>
```

✅ Accepted one-off — suppressed on the import (per region type):

```html
<script
  type="application/jay-headless"
  contract="./components/card/card.jay-contract"
  jay-validations="REGION-NOT-LINKED"
></script>
```

⚠️ `REGION-OVERRIDE-NON-CONTENT` — net-new DOM of content tags is fine; restyle or structural DOM is a variant:

```html
<!-- fine: text + image, and added inline content tags (strong/span/img are on the allowlist) -->
<jay:card ref="a"
  ><div class="card">
    <h3><strong>{title}</strong></h3>
    <img src="{img}" alt="{alt}" /></div
></jay:card>
<!-- warns: any style/class change → make card-feature.jay-html and link it -->
<jay:card ref="b"><div class="card card--feature huge dark gradient">…</div></jay:card>
<!-- warns: net-new DOM with non-allowlisted tags (div ribbon, footer) → structural rework, a new design -->
<jay:card ref="c"
  ><div class="card">
    <div class="ribbon">Sale</div>
    …
    <footer class="cta">…</footer>
  </div></jay:card
>
```

## Trade-offs

- **(+)** Enforcement at the four points of error beats N doc edits; each warning carries a runnable fix.
- **(+)** Reuses DL#196 override facets, the contract join key, and existing severity/suppression plumbing; new
  surface is one import attribute + one differ field.
- **(+)** Contract-keyed availability removes the local-only limitation — plugin components are covered.
- **(+)** `REGION-OVERRIDE-NON-CONTENT` is **deterministic by facet kind** (no threshold) — no magic-number tuning,
  no noise/silence trade-off; a style/class/structural change either exists or it doesn't.
- **(−)** Firing on the _first_ non-content override is strict; a one-line restyle warns. Justified: that is the
  moment a variant is being born, and suppression on the import documents the deliberate exception.
- **(−)** Two suppression forms (import attr + list) is slightly more surface than one; justified by per-region-
  type scoping that the page-wide form can't express.

## Verification Criteria

- A region whose contract has an available template but is hand-authored → exactly one `REGION-NOT-LINKED`;
  linking + `jay-stack sync` clears it; no template for the contract → no warning.
- A UI component shipping no template → one `COMPONENT-NO-TEMPLATE`; adding a template clears it; data-only
  component can suppress once.
- A linked region with only content overrides — including net-new DOM made entirely of allowlisted content tags —
  → no `REGION-OVERRIDE-NON-CONTENT`; a style/class override **or** any added non-allowlisted tag → exactly one,
  naming the suggested variant path.
- A project with zero design-system elements → exactly one `NO-DESIGN-SYSTEM` in the summary, with the message
  matching whether regions exist; one `template=` anywhere clears it.
- Import-attribute and list suppression both silence as specified; build never fails on any of the four rules.
- No regression in `checkRegionDrift`/CSS rules; existing validate fixtures stay green.

## Implementation Results (2026-10-01)

All four rules implemented and green. Status: **IMPLEMENTED**.

### What shipped

- **Differ (`compiler-inline-composition`)** — `DiffEntry.addedElementTags?: string[]` added to `facet.ts`;
  `diff-markup.ts` computes it (region-child element tags minus source, multiset) only on `children` facets.
  Empty for a text-only change; `['strong']` for text→inline enrichment; `['div']` for a net-new wrapper.
  No new verdict field, exactly as the null-hypothesis section predicted. 4 focused unit tests added.
- **Parser (`compiler-jay-html`)** — `JayHeadlessImports.suppressedValidations?: string[]`; `parseHeadlessImports`
  reads a `jay-validations="RULE RULE"` attribute on the `application/jay-headless` tag (space/comma list,
  upper-cased). `JayHeadlessImports` now exported from the package index. Also corrected
  `validationOverrides` type to `Record<string, Record<string, boolean | string[]>>` (it already stored
  `string[]` for `allow-unused-tags`).
- **Rules (`stack-cli/lib/validate.ts`)** — `CONTENT_TAGS` constant; `isNonContentOverride`,
  `regionContractName`, `isRegionRuleSuppressed`, `hasTemplateForContractFile` helpers; four exported
  `checkX` functions: `checkRegionNotLinked`, `checkRegionOverrideNonContent`, `checkComponentNoTemplate`,
  `checkNoDesignSystem`. Wired into `validateJayFiles`: region rules per-file (with project tallies
  `regionsSeen` / `templateImportsSeen`), component + project rules in the project-level block.
- **Docs** — "Prefer design-system elements" + "Suppressing the preference warnings" sections in
  `designer/design-system-guide.md`; a jay-stack-namespace suppression table in `designer/validation-guide.md`;
  a `validate` note in `designer/cli-commands.md`.
- **Tests** — `stack-cli/test/validate.test.ts` R1–R4 suites (full `toEqual` on findings, no `toContain`),
  fixtures under `test/fixtures/validate/design-system/`. stack-cli 118/118, inline-composition 78/78,
  compiler-jay-html 720/720 (+4 skipped) all green.

### Deviations from the design

1. **Rule 2 (`COMPONENT-NO-TEMPLATE`) suppression host.** The DL's Rule 2 message implied a
   `jay-validations="COMPONENT-NO-TEMPLATE"` attribute, but a data-only component has **no `.jay-html`** to
   host it (the open question flagged pre-implementation). Resolved by suppressing project-wide with a
   contract-keyed **`allow-no-template: [Contract]`** list in any page's `application/jay-validations` —
   mirroring how Rule 4 (`NO-DESIGN-SYSTEM`) has no import to hang on. Same mechanism family, no new surface.
2. **Availability check is the sibling-`.jay-html` heuristic** (`hasTemplateForContractFile`): any `.jay-html`
   in the contract's directory counts as a template for that contract. This covers the local
   `card.jay-contract` + `card.jay-html` convention and plugin components shipping a sibling template. Full
   plugin-index resolution (Q2's richer form) was not needed for the common case; the heuristic is the minimal
   correct check and is easily upgraded later if a plugin ships templates elsewhere.
3. **One finding per region type per page** (deduped by contract name) for the two region rules, to avoid N
   identical warnings when a page flattens the same component many times.
4. **`allow-inline-region` list scoped to `REGION-NOT-LINKED` only** (not `REGION-OVERRIDE-NON-CONTENT`), since
   the list name means "allow this region to be inline (unlinked)". Override suppression stays on the import.
5. **`REGION-NOT-LINKED` is page-scoped — component source templates are exempt** (added 2026-10-03, surfaced by
   `examples/jay-stack/design-system-demo`). Rule 1 as designed fires on _every_ `<jay:X>` region in any scanned
   file. But a DL#196 composite (e.g. `section.jay-html` → `gallery` → `card` → `button`) hand-authors its child
   regions with **contract-only** imports **by design**: the component template is the flatten _source_, and the
   transitive `template=` always lives on the consuming page, never in the component template. So the rule
   systematically false-positived on every nested design-system component. Fix: in `validateJayFiles`, skip
   `checkRegionNotLinked` for files under `componentsBase` (`componentJayHtmlFileSet`). The other region rules
   (`REGION-OVERRIDE-NON-CONTENT`, drift) already no-op on component templates because they require `template=`
   imports, which component sources never carry — so only Rule 1 needed the guard. Covered end-to-end by the
   demo's smoke test (`DL#200` block asserts the warning lands only on the consuming page, not the components).

### Verification against criteria

- Hand-authored region + available template → one `REGION-NOT-LINKED`; linked / no-template / suppressed
  (import attr, list) / keyed → clean. ✓ (R1, 6 cases)
- Linked region: content-only drift (text + inline enrichment) → clean; class/style → one finding; net-new
  non-allowlisted DOM → one finding; suppressed on import → clean. ✓ (R3, 4 cases)
- Component with no template → one `COMPONENT-NO-TEMPLATE`; template present / suppressed → clean. ✓ (R2)
- Zero design-system elements → one `NO-DESIGN-SYSTEM` (message by whether regions exist); ≥1 `template=` /
  suppressed → clean. ✓ (R4)
- No regression in `checkRegionDrift` / CSS rules; existing fixtures green. ✓
