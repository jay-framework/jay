# DL#202 — Template-side `jay-content` marker (content edits without an override)

Status: **DESIGN — ready for review; implementation following.** Promoted from DL#201 Item 1. The user
chose a template-side mechanism over the three options originally sketched in DL#201.

Related: #196 (flatten / drift / sync; the "unmarked ⇒ sync overwrites" invariant), #200 (prefer
design-system elements; `CONTENT_TAGS`, `REGION-OVERRIDE-NON-CONTENT`), #201 (Item 1).

---

## Decisions for the Implementer (TL;DR)

- **New marker `jay-content`, authored on a node in the design-system _template_ `.jay-html`.** It
  declares: "this node's children are a content slot — a consumer editing them is expected, not
  drift." It lives on the **template/source** side (unlike page-side `override=`), which is what makes
  it **resilient to future template changes**: as long as the marker stays on the template, content
  edits stay silent; remove it and the region falls back to the normal override model.
- **Name is `jay-content`, not `content`.** A bare `content` attribute is a real HTML attribute
  (`<meta content>`); prefixing matches `jay-scope` / `jay-coordinate-base` and avoids collision.
- **Effect on `validate` (drift):** in `diffChildren`, if the **source** (template) node carries
  `jay-content`, do **not** emit the `children` facet — no `override="children"` needed. (Today
  suppression is read only from the _region_ node via `parseOverride`; this adds a source-side check.)
- **Effect on `validate` (DL#200 non-content rule):** a `jay-content` node's `children` facet is
  treated as content, so `REGION-OVERRIDE-NON-CONTENT` never fires for it either — even for net-new
  structural DOM. The template author has explicitly opted this subtree into "owned by the consumer,"
  which is _broader_ than the `CONTENT_TAGS` allowlist, and intentionally so.
- **Effect on `sync` (`mergeOverrides`/`mergeElement`):** when the **template** node `te` carries
  `jay-content`, keep the **page** node's children (`ee.innerHTML`) instead of re-flattening from the
  template — the same behavior the page-side `override="children"` branch already has, but triggered
  from the template side and **without** requiring the page node to carry any marker. This is the
  crux: it inverts the "unmarked ⇒ overwrite" invariant _only_ under a template-marked node.
- **Compiler hygiene:** register `jay-content` in `DIRECTIVE_ATTRIBUTES`
  (`jay-html-compiler-shared.ts:120`) so the template's own compilation doesn't render it to the DOM,
  and in `META_ATTRS` (`override.ts:17`) so it's never itself diffed as a content attribute.
- **Drift message:** `formatRegionDrift`'s message for a `children` facet gains a second remediation
  path — "…or mark the node `jay-content` in the template if these children are a content slot."
- **Scope of the exemption = the marked node's whole `children` facet** (text and structure). Do
  **not** place a nested `<jay:X>` region under a `jay-content` node (the subtree becomes
  page-owned); flag that combination in `validate` as a follow-up note.

---

## Background

`checkRegionDrift` (DL#196) reports **every** unmarked facet that differs from the source template,
including a `children` facet that is only a text edit. To silence it the author marks
`override="children"`. Separately, DL#200's `REGION-OVERRIDE-NON-CONTENT` already says "editing text /
enriching with inline content is expected and fine." So the two rules disagree on the same edit:
DL#200 blesses content edits while DL#196 drift still nags for a marker.

DL#201 Item 1 listed three fixes (keep-as-is / suppress-in-differ-and-teach-sync /
auto-mark-on-sync). The user chose a fourth, cleaner mechanism: **mark the content slot on the
template once**, and let both rules honor it.

## Problem

An unmarked content edit produces noise (`validate` drift) that contradicts DL#200, and the only way
to silence it (`override="children"`) is **per-page, per-instance** and **fragile**: it is a page-side
assertion that must be repeated on every consumer and re-evaluated whenever the template changes. We
want a **single, source-side** declaration that a given node is a content slot.

## Prior Art / Adjacent Mechanisms

| Mechanism                                                                       | Where                                                  | Solves / Constrains                                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `parseOverride` / `Suppression` (`all`/`attributes`/`styleProps`/`children`)    | `compiler-inline-composition/lib/override.ts:42-91`    | The exact suppression model to mirror — but it reads the **region** node. `jay-content` adds a **source**-side read. |
| `META_ATTRS` (`jc`,`override`,`page-scope`)                                     | `override.ts:17`                                       | Attributes never diffed as content. `jay-content` joins this set.                                                    |
| `diffChildren` children-facet emit + `rSup.children` skip                       | `compiler-inline-composition/lib/diff-markup.ts:54-91` | The one spot to also consult the source parent.                                                                      |
| `mergeElement` `sup.children` branch (`te.set_content(ee.innerHTML)` keep-page) | `materialise.ts:305-307`                               | The exact "keep page children" behavior to trigger from the template side.                                           |
| `CONTENT_TAGS` / `isNonContentOverride`                                         | `validate.ts:1043-1134`                                | DL#200's content classifier; `jay-content` short-circuits it (whole subtree = content).                              |
| `DIRECTIVE_ATTRIBUTES` / `isDirectiveAttribute`                                 | `jay-html-compiler-shared.ts:120-141`                  | Where to register `jay-content` so the template doesn't leak it to the DOM.                                          |
| `formatRegionDrift` / `overrideSpecFor`                                         | `validate.ts:819-844`; `facet.ts:78-91`                | Where the drift message gains the "mark `jay-content`" hint.                                                         |

**Null hypothesis (why not reuse `override=`):** `override="children"` already silences the content
facet — but it is page-side, per-instance, and must be re-stated on every consumer and re-checked on
every template change. The whole value of `jay-content` is being **source-side and once**, so no
existing primitive suffices. It is a small, single-attribute addition that _removes_ per-page markers.

## Questions and Answers

**Q: Why template-side, not a validator that auto-classifies content (DL#201 option b)?**
A: Resilience and intent. A template author knows which nodes are content slots (`{body}`, a CTA
label) vs. which are fixed chrome. Encoding that once on the template is more precise than a global
tag-allowlist guess, and it survives template edits. Remove the marker and you're back to the
override model — a clean fallback.

**Q: Does `jay-content` exempt structural (non-`CONTENT_TAGS`) additions too?**
A: Yes, for the marked node's children. The marker is a stronger, explicit opt-in than the
`CONTENT_TAGS` heuristic: "the consumer owns this subtree." That is exactly a content slot. (Elsewhere
— unmarked nodes — `CONTENT_TAGS` still governs `REGION-OVERRIDE-NON-CONTENT`.)

**Q: What happens on `sync` to the author's content under a `jay-content` node?**
A: It is **preserved** (not overwritten). `mergeElement` keeps the page's children when the template
node is `jay-content`, the same way it keeps them today under page-side `override="children"` — but
without the page needing any marker. This is the one place the DL#196 "unmarked ⇒ overwrite"
invariant is deliberately inverted, and only under a template marker.

**Q: Nested regions under a content slot?**
A: Out of scope / discouraged. A `jay-content` node makes its whole subtree page-owned, which would
swallow a nested `<jay:X>`'s re-flatten. Add a `validate` note (follow-up) that flags a `<jay:X>`
inside a `jay-content` subtree.

**Q: Does the marker travel into the flattened page copy?**
A: No. It is a template-side directive; registered in `DIRECTIVE_ATTRIBUTES` it is not emitted when
the template compiles, and the drift/sync code reads it from the **template** body it loads, not from
the page. The page region stays clean (no `jay-content`, no `override`).

## Design

### Read helper (`override.ts`)

```ts
export const CONTENT_MARKER = 'jay-content';
// add CONTENT_MARKER to META_ATTRS
export function isContentSlot(el: HTMLElement): boolean {
  return readAttr(el, CONTENT_MARKER) !== undefined; // bare or valued
}
```

### `validate` drift skip (`diff-markup.ts` `diffChildren`)

The differ receives `(sourceParent, regionParent)`. Before emitting the `children` facet:

```ts
if (isContentSlot(sParent)) return; // template marked this node a content slot → not drift
```

placed alongside the existing `if (rSup.all || rSup.children) return;` (diff-markup.ts:63). Because
`diffChildren` already returns without descending, a content slot's entire subtree is exempt.

### DL#200 classifier (`validate.ts`)

`checkRegionOverrideNonContent` iterates the same `diffBodies` entries. Since `diffBodies` no longer
emits a `children` entry for a content-slot node, the non-content rule never sees it — **no extra code
needed** beyond the differ change. (Verify in the trace walk, below.)

### `sync` preserve (`materialise.ts` `mergeElement`)

```ts
// te = template node, ee = existing page node
if (isContentSlot(te)) {
  te.set_content(ee.innerHTML); // keep the consumer's content; do not re-flatten this subtree
  // carryOwnedAttributes/style still run for attribute/style facets on the node itself
} else if (sup.children) {
  te.set_content(ee.innerHTML);
} else {
  mergeChildren(te, ee);
}
```

The `jay-content` attribute is on `te` (the template) and re-emitted into the merged output as part of
the template node — but since first-fill/`set_content` writes template body verbatim and the attribute
is a directive, it is not rendered to the runtime DOM. The page body itself never carries it.

### Compiler hygiene

- `jay-html-compiler-shared.ts:120` — add `'jay-content'` to `DIRECTIVE_ATTRIBUTES`.
- `override.ts:17` — add `'jay-content'` to `META_ATTRS`.

### Drift message (`validate.ts` `formatRegionDrift`, children facet only)

Append to the suggestion: _"…or, if these children are a content slot, mark the node `jay-content` in
the template `<path>` so consumer edits are expected."_

## Runtime trace (one content edit, end to end)

Template `card.jay-html`: `<p class="ds-card__body" jay-content>{body}</p>`. A page flattens it and a
consumer edits the body to `Everything you need <strong>today</strong>.`

1. **validate** — `checkRegionDrift` (validate.ts:892) calls `diffBodies(templateBody, region)`.
   `diffChildren` reaches the `<p>` pair; `isContentSlot(sParent==<p template>)` is true →
   returns before pushing the `children` facet (diff-markup.ts, new guard). No drift warning. ✓
2. **DL#200** — `checkRegionOverrideNonContent` iterates `diffBodies` entries; the `<p>` `children`
   entry is absent, so `isNonContentOverride` never runs for it. No `REGION-OVERRIDE-NON-CONTENT`. ✓
3. **sync** — `run-sync.ts:66` → `materialise(preserveOverrides:true)` → `mergeOverrides` →
   `mergeElement(te=<p jay-content>, ee=<p> edited)`. New guard `isContentSlot(te)` →
   `te.set_content(ee.innerHTML)` keeps `Everything you need <strong>today</strong>.`. The template's
   `{body}` is **not** re-imposed. ✓ Page `<p>` stays marker-free. ✓
4. **Remove the marker** from the template → step 1's guard is false → the `children` facet is emitted
   again (drift), and `mergeElement` falls to `mergeChildren` (template wins). Clean fallback. ✓

## Implementation Plan

1. `override.ts` — `CONTENT_MARKER`, add to `META_ATTRS`, export `isContentSlot`.
2. `diff-markup.ts` — source-side guard in `diffChildren`.
3. `materialise.ts` — template-side guard in `mergeElement`.
4. `jay-html-compiler-shared.ts` — register `jay-content` in `DIRECTIVE_ATTRIBUTES`.
5. `validate.ts` — extend the children-facet drift suggestion text.
6. **Tests** (fixture-based, `toEqual`; never `toContain`):
   - `diff-markup` unit: content-slot source node ⇒ no `children` entry; without the marker ⇒ entry present.
   - `materialise`/`mergeOverrides` unit: content under a `jay-content` node is preserved on sync;
     without the marker it is overwritten by the template.
   - stack-cli `validate`: a page flattening a content-slot template with an edited body ⇒ zero drift
     and zero `REGION-OVERRIDE-NON-CONTENT`; removing the marker ⇒ drift reappears.
   - Extend the `design-system-demo` (optional): mark the card body `jay-content`, show an edited body
     on a page producing no warning.

## Trade-offs

- **Broader than `CONTENT_TAGS`.** A `jay-content` node exempts structural additions too. That is the
  point (explicit opt-in), but it means a template author can turn off structure-drift detection for a
  subtree. Acceptable: it is a deliberate, visible, source-side choice.
- **One inverted invariant.** `sync` now preserves unmarked page content under a template marker. The
  invariant becomes "unmarked ⇒ overwrite, _unless the template node is a content slot_." Documented
  and traced; the fallback (remove marker) restores the strict form.

## Verification criteria

1. A content edit under a `jay-content` template node yields **zero** `validate` warnings (no drift,
   no `REGION-OVERRIDE-NON-CONTENT`).
2. `sync` preserves that edit (page `.jay-html` unchanged by `sync`).
3. Removing `jay-content` from the template makes the same edit report drift again and `sync`
   overwrite it — the override model is the clean fallback.
4. The `jay-content` attribute never appears in compiled DOM output or in the flattened page body.

---

## Implementation Results

Implemented across the five planned sites; all tests green.

- `compiler-inline-composition/lib/override.ts` — `CONTENT_MARKER = 'jay-content'`, added to `META_ATTRS`,
  exported `isContentSlot`.
- `compiler-inline-composition/lib/diff-markup.ts` — source-side guard in `diffChildren`
  (`if (isElement(sParent) && isContentSlot(sParent)) return;`).
- `compiler-inline-composition/lib/materialise.ts` — `mergeElement` children branch now
  `if (sup.children || isContentSlot(te))`.
- `compiler-jay-html/.../jay-html-compiler-shared.ts` — `'jay-content'` added to `DIRECTIVE_ATTRIBUTES`.
- `stack-cli/lib/validate.ts` — `formatRegionDrift` appends the content-slot hint for `children` facets.

**Tests:** `compiler-inline-composition` 86/86 (was 78; +5 `diff-markup`, +3 `mergeOverrides`);
`stack-cli` 118/118 (updated one expected-suggestion assertion for the `children` drift).

### Deviations from the design

1. **The marker rides into the flattened page copy; it is not stripped.** The TL;DR said "the page
   region stays clean." In reality, first-fill copies the template body verbatim
   (`materialise.ts` first-fill / `mergeOverrides` output), so the page region's node carries
   `jay-content` too. This is **inert and correct**: the differ keys the exemption off the _source_
   template node (`sParent`/`te`), the page copy is never consulted for it, and `DIRECTIVE_ATTRIBUTES`
   stops it rendering. The resilience property is unchanged — remove the marker from the _template_ and
   drift resumes regardless of a stale page copy, because authority is the template. Not stripping it is
   the smaller change (no new strip pass) and keeps the page copy a faithful mirror of the template.
2. **Pre-existing `override=` / `page-scope` leakage noted, not fixed.** While wiring
   `DIRECTIVE_ATTRIBUTES` I confirmed `override=` currently renders into compiled output (it is neither a
   directive nor stripped — visible in `design-system-demo`'s built `route.server-element.js`).
   `jay-content` is correctly made a directive here; aligning `override`/`page-scope` is out of DL#202
   scope and left as a separate follow-up.

---

## Refinement (post-review) — `jay-content` is a facet list, like `override=`

The original design made `jay-content` a boolean (children-only slot). The reviewer asked: what about a
consumer owning a specific **attribute** — e.g. an `<img>`'s `src`/`alt` as the content, not its
children? Rather than special-case images, `jay-content` was **generalized into a facet list with the
exact grammar of `override=`**:

- **Tokens:** `children`, `style.<prop>`, or a bare attribute name (e.g. `src`, `alt`, `href`),
  comma- **or** space-separated. Bare `jay-content` (no value) = `children` (the DL#202 default).
  `jay-content="*"` = the whole node (all facets).
- **Read from the source (template) side**, mirroring `override=`'s page-side read. A facet is treated
  as consumer-owned — skipped by the differ, kept by `sync` — if **either** side owns it: the page's
  `override=` **union** the template's `jay-content`.
- **Null-hypothesis check:** no new grammar was invented — the existing `override=` token parser was
  factored into a shared `parseFacetTokens`, and `jay-content` reuses it. The only genuinely new
  surface is one attribute name and one union step.

Examples:

```html
<!-- template: the consumer supplies the image; everything else is design-system -->
<img jay-content="src alt" src="placeholder.png" alt="" class="ds-hero__img" />

<!-- template: the consumer owns the link target and the label text -->
<a jay-content="href children" class="ds-cta" href="#">Learn more</a>
```

---

## Implementation Results

**Status: IMPLEMENTED.** Tests green.

### What shipped

- **`override.ts`** — shared `emptySuppression()` + `parseFacetTokens()` (comma/space split; `children`,
  `style.<prop>`, bare attribute). `parseOverride` refactored onto them. **New** `parseContent(el)`
  reads `jay-content` with the same grammar (bare ⇒ `children`, `*` ⇒ whole node). **New**
  `unionSuppression(a, b)` ORs two `Suppression`s.
- **`diff-markup.ts`** — `diffChildren` and `diffElement` now suppress a facet when
  `unionSuppression(parseOverride(regionNode), parseContent(sourceNode))` owns it.
- **`materialise.ts`** — `mergeElement` keeps the page's children when the union owns `children`
  (template-side `jay-content` triggers the keep without any page-side marker).
- **`index.ts`** — exports `parseContent`, `unionSuppression`, `isContentSlot`, `CONTENT_MARKER`.

### Tests

- `override.test.ts` — facet-list slot: bare ⇒ children, `*` ⇒ whole node, named-attribute slot owns
  only that attribute (not children), combined `children src`.
- `diff-markup.test.ts` — `jay-content="src alt"` on an `<img>` is not drift; `jay-content="src"`
  exempts only `src` (a `class` change still drifts); comma-separated `src, alt`.
- `materialise.test.ts` — attribute-slot `jay-content` preserves `src`/`alt` on sync while still
  re-flattening children; children-slot keeps page children.
- Downstream: the demo's card-heading **children** drift suggestion now offers the `jay-content`
  template-side alternative (asserted in `design-system-demo` smoke).

## Refinement (post-review) — strip `jay-content` from the flattened page

**Q (review): is `jay-content`'s grammar identical to `override=`?** Almost. `*` ⇒ whole node and every
named facet (`children`, `style.<prop>`, attributes) parse identically — they share `parseFacetTokens`.
The **only** difference is the _bare_ form: bare `override` ⇒ whole node, bare `jay-content` ⇒ `children`.
This asymmetry is deliberate: a page author writing bare `override` is taking over the _whole_ node, while
a template author marking `<p jay-content>` wants the consumer to own the **text/markup** while the template
keeps governing the node's own class/structure — the content-slot default is children, not the whole node.
`*` remains the explicit "whole node is the consumer's" escape hatch on both sides.

**Q (review): should the flattened page retain `jay-content`?** No. `jay-content` is a **template-side**
marker — `materialise` (`parseContent(te)`) and the differ (`parseContent(sParent)`/`parseContent(se)`)
always read it from the _component source_, never from the page. A copy stamped onto the flattened page is
therefore never consulted; it is dead weight and misleading (it reads as if the _page_ were declaring the
slot). This is the exact inverse of `override=`/`page-scope`, which are **page-owned** provenance that
`carryMarkers` deliberately persists so the hole survives the next sync.

**Change.** `materialise.ts` gained `stripContentMarkers(root)`, called at the end of both `materialise`
(covers first-fill, where `filled = template.body` copies the marker verbatim, and transitive nested
regions) and `mergeOverrides` (covers the sync path and the exported-API unit tests). It removes every
`jay-content` attribute from the flattened output. Idempotent and safe: because suppression is re-derived
from the _source_ each sync, dropping the page copy changes no behaviour — only the emitted page is cleaner.
`materialise.test.ts` content-slot expectations updated to assert the marker is **absent** from the output.
