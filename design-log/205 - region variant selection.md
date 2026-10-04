# DL#205 — Region variant selection (two design variants of one contract on one page)

Status: **IMPLEMENTED** (see Implementation Results)

## Decisions for the Implementer (TL;DR)

- **Problem:** A page cannot flatten **two design variants of the same contract** (e.g. `card.jay-html`
  and `card.feature.jay-html`, both `contract="…/card.jay-contract"`) because every resolution keys by the
  **region tag name, which is derived from the contract name**. `materialise-context.ts:42`
  (`nameToPath.set(contractName, …)`) — the second import overwrites the first; the drift matcher
  (`validate.ts:893`, `find((i) => i.contractName === name)`) and the materialiser (`materialise.ts:147`,
  `resolveTemplate(name)`) both resolve a `<jay:card>` region to a **single** template. DL#200/#204
  introduced *variants* (two `.jay-html` per contract) and DL#200 says they are "chosen at composition" —
  but **the composition-side selector was never built.**
- **Chosen mechanism — an `as=` alias on the import.** The region tag name is already just `contractName`
  on the import (`jay-html-parser.ts:775,868`). Let an `application/jay-headless` import **name its own
  tag** with `as="feature-card"`; the region is then written `<jay:feature-card>`. Two imports of one
  contract get **two distinct tags** instead of colliding. **The entire resolution machinery is
  unchanged** — it already keys by tag name; aliasing just makes the key unique.

  ```html
  <script type="application/jay-headless" contract="…/card.jay-contract"
    template="…/card.jay-html"></script>                               <!-- <jay:card> (default) -->
  <script type="application/jay-headless" contract="…/card.jay-contract"
    template="…/card.feature.jay-html" as="feature-card"></script>      <!-- <jay:feature-card> -->
  ```

- **Backward compatible:** an import without `as=` still derives its tag from the contract name — existing
  pages are unchanged.
- **Surface added:** one optional attribute on the import (`as=`) + validations (alias is a valid
  kebab tag identifier; the resolved tag-name set across a page's imports is unique). **No `resolveTemplate`
  signature change, no per-region lookup, no new region/prop attribute.**
- **Example:** add `src/components/card/card.feature.jay-html` (a Card variant with a "Most popular"
  ribbon) and a page that flattens `<jay:card>` (default) and `<jay:feature-card>` (featured) **side by
  side** — the first demo page exercising two variants of one contract at once. Catalogued by DL#204 as
  two variants of `Card`.

## Background

DL#196 made a component's `.jay-html` a **source template** flattened into the page as a `<jay:X>`
region, with `template=` provenance on the `application/jay-headless` head import. DL#200 added the
`REGION-OVERRIDE-NON-CONTENT` warning whose remedy is "make a second design-system **variant**" and
documented **two templates (design variants) vs. conditional (runtime)**. DL#204 built the
design-system **index**, cataloging each contract's `.jay-html` **variants** (`X.jay-html`,
`X.<variant>.jay-html`), associated by the template's declared `contract=` reference.

So *variants* exist as an author-time + catalog concept. What is missing is the **page-side selector**:
how a region says "flatten me from *this* variant" when the page also uses another variant of the same
contract.

## Problem

A `<jay:X>` region's tag name is derived from the **contract name** (kebab) at
`jay-html-parser.ts:775` (`contractTagName = paramCase(loadedContract.name)`) and carried as
`JayHeadlessImports.contractName` (`:868`). Two variants share one contract → one tag name → ambiguous.
Every resolution path keys by that tag name:

| Site | Code | Keyed by |
| --- | --- | --- |
| Materialise map | `materialise-context.ts:39–42` | tag name (2nd import overwrites 1st) |
| Materialise fill | `materialise.ts:147` | `resolveTemplate(name)` |
| Drift matcher | `validate.ts:893` | `find((i) => i.contractName === name)` |

Put two `<script application/jay-headless contract="card" template="…">` imports on one page and the
behaviors diverge (validate uses the *first*, sync uses the *last*), and **every** `<jay:card>` region
gets the same template. Two variants of one contract on one page is therefore not expressible.

The key observation: the resolution is already **tag-name-keyed**, and the tag name is **derived**, not
intrinsic. If the import can *name* its tag, the collision disappears with no change to any resolver.

## Prior Art / Adjacent Mechanisms

- **`contractName` is already the tag key** (`jay-html-parser.ts:775,868`) — `as=` overrides the one line
  that sets it. Nothing downstream changes.
- **`key=` on the import** (`jay-html-parser.ts:645`) — an existing import attribute that namespaces the
  component's contribution to **page ViewState** (an identifier). It is *orthogonal* to the tag name:
  `key` affects type/ViewState merging (`validate.ts:755`, `jay-html-parser.ts:867`), `as` affects the
  region tag. A variant import may carry both. We do **not** overload `key` for this (its identifier is a
  camelCase JS name used in binding paths; the tag is kebab) — see Q4.
- **DL#196 `template=` on the import** — per-import provenance; each aliased import carries its own,
  so `nameToPath` gets `{card → card.jay-html, feature-card → card.feature.jay-html}` for free.
- **DL#204 contract↔template association** — the add-menu (`design-system.md`) can emit the full aliased
  import + `<jay:feature-card>` snippet per variant; `variant: card.feature` → suggested `as="feature-card"`.
- **ES module aliasing (`import { x as y }`)** — the mental model: import the same source under a new local
  name. `as=` reads naturally to any developer.
- **Null hypothesis — does an existing primitive already suffice?**
  - *Separate contracts per variant* (`card` + `card-featured`) — works today, but that is **two
    components**, not two variants of one contract; contradicts DL#204's shared-contract variant model and
    loses the "same contract / same props" guarantee. Rejected.
  - *Conditional (`if`/`variant`) inside one template* — a **runtime** switch, not two author-time
    designs; DL#200 routes "different design" to the two-templates axis. Does not solve it.
  - *Reuse `key=` as the tag alias* — conflates ViewState namespacing with the region tag; different
    casing and purpose. Rejected (Q4).
  - *A `template=` attribute on the `<jay:card>` region* (the prior draft of this DL) — also works, but
    requires `resolveTemplate(name, region)`, threading the region through the materialiser, a new
    region/prop skip-attr, and a per-region lookup in three validators. `as=` is strictly less surface and
    more legible at the call site, and composes just as well (Q8). Rejected in favor of `as=`.

## Questions and Answers

**Q1. Why alias at the import rather than select per region?**
The variant↔name binding is stated **once** at the import and reused by every `<jay:feature-card>` on the
page; the call sites stay terse and self-documenting. And because resolution is already tag-name-keyed,
aliasing needs **zero** change to the resolvers — only the one line that derives the tag name.

**Q2. What stops two imports from producing the same tag?**
A new validation `REGION-TAG-COLLISION`: the set of resolved tag names across a page's headless imports
(derived or aliased) must be unique. Two same-contract imports without `as=` → error naming the fix
("add `as=` to one of them"). An alias that collides with another contract's derived tag → same error.

**Q3. What must `as=` look like?**
A valid kebab region-tag identifier (`^[a-z][a-z0-9-]*$`), matching how `<jay:X>` tags are lowercased and
read (`validate.ts:892`). Invalid alias → validation error (mirrors the `key=` identifier check at
`jay-html-parser.ts:647`).

**Q4. Why not reuse `key=`?**
`key=` is a camelCase JS identifier that namespaces the component's ViewState contribution and appears in
binding paths (`validate.ts:755`). The region **tag** is a kebab name consumed by the DOM/differ. They are
orthogonal — a variant import may legitimately have both a `key` and an `as`. Overloading `key` would tie
the DOM tag to the JS binding name. Keep them separate.

**Q5. Props and types for the aliased region?**
Unchanged. Props/refs/ViewState are derived from `loadedContract` (Card) regardless of the tag name; the
region's props are validated against that contract through the matched import. `<jay:feature-card>` has the
exact same prop surface as `<jay:card>`.

**Q6. Two imports of the same contract — duplicate codegen?**
Both imports produce the same `codeLink` (passthrough `Card`, or the same coded component). The compiler
must **dedup identical code imports** so the module/type is imported once while each tag still compiles to
its own headless instance. (Instances are keyed by tag, so they stay distinct.) Covered in the plan.

**Q7. CSS coalescing / `@scope` donut?**
Both key by **template path** (`materialise.ts:195`, `cssBlocks[].key`), not tag name. Two variants have
two paths → two blocks; two instances of the *same* variant still coalesce. No change.

**Q8. Does `as=` compose for *nested* regions (two variants of a nested component inside one region)?**
Yes. `as=` is parsed in **every** jay-html head, templates included, and a flattened region body lives on
the page where its nested `<jay:X>` tags resolve against the **page's** import map (`materialise-context.ts`
builds `nameToPath` from the page's imports; `fillRegions` recurses into the inserted body,
`materialise.ts:212`). So a template can alias its nested regions distinctly and a consumer uses them
directly:

```html
<!-- card.feature.jay-html head: two button variants, distinct tags -->
<script type="application/jay-headless" contract="../button/button.jay-contract"
  template="../button/button.jay-html" as="main-cta"></script>
<script type="application/jay-headless" contract="../button/button.jay-contract"
  template="../button/button.secondary.jay-html" as="secondary-cta"></script>
<!-- …its body: -->
<jay:main-cta ref="primary" label="{ctaLabel}"> … </jay:main-cta>
<jay:secondary-cta ref="alt" label="{altLabel}"> … </jay:secondary-cta>
```

When the page flattens the card, `<jay:main-cta>` / `<jay:secondary-cta>` land in the page body and resolve
against the page's matching aliased `button` imports (the transitive-import rule of DL#196 — the page
carries the nested imports, now aliased). Each resolves to its own `template=`. The alias name is the shared
vocabulary between the template that emits the tag and the page that re-declares the import — the same
coupling that already exists for any nested `<jay:Y>`. The only unreachable case is a template that emits
**two nested regions under one tag** and wants them to differ — but the author simply aliases them, exactly
as above. So there is no practical nested limitation.

## Design

### Syntax

```html
<head>
  <script type="application/jay-data">data:</script>
  <!-- default variant: tag derived from contract name → <jay:card> -->
  <script type="application/jay-headless"
    contract="../components/card/card.jay-contract"
    template="../components/card/card.jay-html"></script>
  <!-- feature variant: same contract, own template, aliased tag → <jay:feature-card> -->
  <script type="application/jay-headless"
    contract="../components/card/card.jay-contract"
    template="../components/card/card.feature.jay-html"
    as="feature-card"></script>
  <script type="application/jay-headless"
    contract="../components/button/button.jay-contract"
    template="../components/button/button.jay-html"></script>
</head>
<body>
  <jay:card ref="cardStarter" heading="Starter" body="…" ctaLabel="Choose Starter"> … </jay:card>
  <jay:feature-card ref="cardPro" heading="Pro" body="…" ctaLabel="Choose Pro"> … </jay:feature-card>
</body>
```

### Touch points (small, mostly the parser)

1. **`jay-html-parser.ts`** — read `const asAttr = element.getAttribute('as')`; validate it as a kebab tag
   identifier; when present, set `contractTagName = asAttr` (overriding `:775`). `contractName` (`:868`)
   then carries the alias, and the `<jay:feature-card>` region matches it. Everything downstream is
   unchanged.
2. **Validation (`validate.ts` or parser)** — `REGION-TAG-COLLISION`: resolved tag-name set per page must
   be unique. (This also catches the pre-existing "two same-contract imports" footgun.)
3. **Compiler dedup (`jay-html-compiler*.ts`)** — dedup identical code/contract import links so an aliased
   second import of the same contract does not emit a duplicate `import` (Q6). Each tag still yields its
   own instance.
4. **Nothing else** — `materialise-context.ts`, `materialise.ts`, `run-sync.ts`, the three region drift
   checks, CSS coalescing, and DL#204's index generator are all already tag-name/path-keyed and need no
   change. (DL#204's add-menu *optionally* gains an `as=` suggestion — a doc nicety, not required.)

## Implementation Plan

1. Parser: parse + validate `as=`; override `contractTagName`. Unit-test tag derivation (aliased vs
   default) in `compiler-jay-html`.
2. `REGION-TAG-COLLISION` validation + test (two same-contract imports without `as=`; alias colliding with
   a derived tag).
3. Compiler: dedup identical import links; test that two Card imports (one aliased) compile to two
   instances with a single `Card` import.
4. Example: add `src/components/card/card.feature.jay-html` (ribbon variant, same `card.jay-contract`);
   add a page importing `card` (default) + `card` `as="feature-card"` and placing `<jay:card>` +
   `<jay:feature-card>` side by side; run `jay-stack sync` so both regions flatten verbatim from their own
   templates; run `jay-stack agent-kit` to confirm both variants appear under `Card` in
   `design-system-index.yaml` / `design-system.md` (DL#204, no generator change).
5. Demo smoke test: the two-variant page builds, validates clean (no drift, no
   REGION-OVERRIDE-NON-CONTENT, no REGION-TAG-COLLISION), and renders both the default card and the
   ribboned feature card.
6. Docs: `designer/design-system-guide.md` — "Using two variants of one component on a page" (import the
   contract twice, alias the second with `as=`, write `<jay:default>` / `<jay:aliased>`); note this is the
   mechanism DL#200's "second variant" remedy points to.

## Examples

`src/components/card/card.feature.jay-html` (new variant, same contract):

```html
<html>
<head>
  <script type="application/jay-data" contract="./card.jay-contract"></script>
  <script type="application/jay-headless" contract="../button/button.jay-contract"></script>
  <style> .ds-card--feature { … } .ds-card__ribbon { … } </style>
</head>
<body>
  <div class="ds-card ds-card--feature">
    <div class="ds-card__ribbon">Most popular</div>
    <h3 class="ds-card__heading">{heading}</h3>
    <p class="ds-card__body">{body}</p>
    <jay:button ref="cta" label="{ctaLabel}"><button class="ds-button">{label}</button></jay:button>
  </div>
</body>
</html>
```

`design-system-index.yaml` after `agent-kit` (DL#204, unchanged generator):

```yaml
components:
  - name: Card
    contractPath: ./src/components/card/card.jay-contract
    source: local
    templates:
      - { path: ./src/components/card/card.jay-html, variant: '', title: Card }
      - { path: ./src/components/card/card.feature.jay-html, variant: card.feature, title: Feature card }
```

`design-system.md` add-menu snippet for the feature variant (suggested `as=` derived from the variant id):

````md
## Card — A product card.

| Variant | Title | Template |
| --- | --- | --- |
| (default) | Card | ./src/components/card/card.jay-html |
| card.feature | Feature card | ./src/components/card/card.feature.jay-html |

```html
<script type="application/jay-headless"
  contract="./src/components/card/card.jay-contract"
  template="./src/components/card/card.feature.jay-html"
  as="feature-card"></script>

<jay:feature-card ref="featureCard"><!-- flattened copy; edit freely --></jay:feature-card>
```
````

## Trade-offs

- **Composes at every level (not a limitation).** `as=` works in template heads too, so nested-region
  variants are expressible: a template aliases its nested regions distinctly and the consuming page carries
  matching aliased imports (Q8). The only unreachable case — two nested regions emitted under one tag that
  must differ — is resolved by aliasing them in the template, so it does not arise in practice.
- **Two imports for one contract** — slightly more verbose than a single import with per-region selection,
  but each line is self-contained and the call sites (`<jay:feature-card>`) are clearer. Requires codegen
  import dedup (Q6).
- **No runtime change** — selection is a compile/flatten-time concern; both variants compile to the same
  contract-backed headless instance. Consistent with DL#196.

## Verification criteria

1. A page importing `card` (default) and `card` `as="feature-card"` (own `template=`) flattens each region
   from its **own** variant (`jay-stack sync` output differs per region) and `jay-stack validate` reports
   **no** drift, **no** `REGION-OVERRIDE-NON-CONTENT`, **no** `REGION-TAG-COLLISION`.
2. Existing demo pages (no `as=`) produce **byte-identical** sync output (regression guard).
3. Two same-contract imports **without** `as=` raise `REGION-TAG-COLLISION` naming the fix; an alias that
   is not a valid kebab tag raises a validation error.
4. The compiler emits a **single** `Card` import for two Card imports (one aliased) while generating two
   distinct instances.
5. DL#204 index lists both `Card` variants; `design-system.md` shows both with paste-ready snippets.
6. Demo smoke test (two-variant page) builds, validates clean, and renders both cards.

## Implementation Results

Implemented on the `DL195-196-composition-rethink` branch.

### What shipped

- **Parser (`compiler-jay-html/lib/jay-target/jay-html-parser.ts`)** — `parseHeadlessImports` now parses
  `as=`, validates it as a kebab region tag (`^[a-z][a-z0-9-]*$`), and overrides the contract-derived
  `contractTagName` when present. After the import loop, a `REGION-TAG-COLLISION` check counts imports per
  resolved tag and reports any tag claimed by more than one import (naming the `as=` fix). No resolver,
  materialiser, or validator changes were needed — all region resolution is already tag-name-keyed, as the
  design predicted.
- **Example** — added `examples/jay-stack/design-system-demo/src/components/card/card.feature.jay-html`
  (ribbon variant, same `card.jay-contract`) and `src/pages/variants/page.jay-html` importing `card`
  (default `<jay:card>`) + `card as="feature-card"` (`<jay:feature-card>`) side by side. `jay-stack sync`
  flattens each region from its own template; `jay-stack agent-kit` lists both variants under `Card`
  (DL#204, no generator change).
- **Tests** — parser unit tests for tag derivation (aliased vs default), `REGION-TAG-COLLISION` (two
  same-contract imports without `as=`, and an alias colliding with another derived tag), and invalid-`as=`
  rejection; demo smoke test `/variants` renders both the default card and the ribboned feature card.
- **Docs** — `designer/design-system-guide.md` §"Two variants of one component on a page — `as=`".

### Deviation — codegen import dedup was *not* free (revises Q6)

Q6 assumed importing one contract twice would "just work" in codegen. It did not: both generated targets
emitted the contract's type import **once per import link**, producing duplicate named imports from one
module (`import {CardViewState}` twice in the server element; `CardRefs` twice in the hydrate element). This
is a `Duplicate identifier` (TS2300) error that only escaped notice because generated files are transpiled,
not type-checked. Fixed by merging import links **by module** and deduping symbols in two places:

- `jay-html-compile-imports.ts` `renderImports` (hydrate / element / React targets).
- `jay-html-compiler-server.ts` contract-type import generation (server element target).

Both now group by module and dedup `(name, as)` pairs, preserving first-seen order so existing single-import
output is byte-identical. Verified in dev-generated TS: the server element imports `CardViewState` once; the
hydrate element imports `CardRefs, CardInteractiveViewState, FeatureCardInteractiveViewState, FeatureCardRefs`
in a single statement (`CardRefs` once). The region-tag-derived ViewState/Refs type names
(`FeatureCard*`) keep the two instances distinct.

### Verification

- `compiler-jay-html`: 725 passed / 4 skipped (24 files), including the new parser tests.
- `jay-stack-cli`: 127 passed (validate/sync/coverage unchanged).
- `stack-server-build`: 59 passed.
- `design-system-demo` smoke: 9 passed, including the new `/variants` case; `/drifted` and `/variant`
  drift/override assertions still green.
- Demo `yarn build` + dev-mode TS generation: no duplicate imports; both cards render from their own
  templates with per-variant `@scope` CSS.

Criteria 1–6 met. (Criterion 4 met *after* the codegen dedup fix above.)

### Note — `jay-stack sync` re-flattens the whole project

Running `sync` to first-fill the new `/variants` page also re-flattened the demo's deliberately *drifted*
showcase pages (`/drifted`, `/variant`), discarding their intentional deviations that the smoke test asserts.
Those two pages were restored from git. Not a DL#205 behavior change — just a reminder that `sync` is
project-wide; isolate intentional-drift fixtures or restore them after a global sync.
