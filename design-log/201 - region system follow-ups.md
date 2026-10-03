# DL#201 — Region system follow-ups (backlog, for review)

Status: **OPEN — not started.** A todo/design holding pen for four follow-ups raised while reviewing DL#196
(validated inline composition) + DL#200 (prefer design-system elements). Each item is captured with its
background, the decision to make, a tentative lean, and prior art. **Nothing here is implemented; review and
split into their own DLs (or fold into #196/#200) before building.**

Related: #196 (flatten / drift / sync), #200 (prefer design-system elements validation), #85 (plugins-index),
#197 (why jay-stack is headless-only / regions over components).

## Item 1 — Should content edits require an `override` marker? (likely: no)

**Background.** Today `checkRegionDrift` (DL#196, validate.ts) reports **every** unmarked facet that differs
from source — including a `children` facet that is only a text edit or inline-content enrichment. To silence
it the author must mark `override="children"`. DL#200 then separately classifies overrides as content vs
non-content (the `CONTENT_TAGS` allowlist) for `REGION-OVERRIDE-NON-CONTENT`. So the two rules disagree on the
same edit: DL#200 says "editing text / enriching with `<strong>`/`<img>` is expected and fine," while DL#196
drift still nags for an `override="children"` marker on exactly that edit.

**Decision to make.** Should a drift that is **purely content** (text / `src` / `alt`, or net-new DOM made
only of `CONTENT_TAGS` — the same classifier DL#200 added) be **accepted without an `override` marker** — i.e.
not reported by `checkRegionDrift` at all?

**Tentative lean: yes, don't require markers for content.** Content edits are the whole point of flattening;
making them silent removes marker noise and aligns the two rules. **But** it changes `sync` semantics: today an
unmarked facet is re-flattened (overwritten) by `sync`; if content edits become "accepted + unmarked," `sync`
must **preserve** them instead — otherwise `sync` silently reverts the author's text. That is the crux: the
DL#196 invariant is "unmarked ⇒ sync overwrites." Breaking it only for content means `sync` needs a content
classifier too, or content edits need an implicit/auto override.

**Options.**

- (a) Keep current (content drift warns, needs `override="children"`). Simplest; noisy.
- (b) Suppress content drift in `checkRegionDrift` **and** teach `sync` to preserve content facets (reuse
  `addedElementTags` + `CONTENT_TAGS` on both sides). Consistent, more work, must re-verify the sync invariant.
- (c) Auto-mark: on `sync`/first-fill, stamp `override="children"` wherever content legitimately diverges.
  Keeps the invariant literally true but clutters markup.

**Prior art / constraints.** DL#196 §5 "sync = overwrite-with-holes, holes = marked facets"; the invariant
"validate-clean ⇔ sync-clean." `addedElementTags` + `CONTENT_TAGS` already exist (DL#200) and are the natural
classifier to share. **Must trace one content edit through `applyOverrides`/`fillRegions` in `materialise.ts`
before committing** — this is exactly the runtime path where the invariant could break.

## Item 2 — Scope a region's CSS with `@scope (.from) to (.to)` to exclude child regions

**Background.** The materialiser wraps each region's CSS in `@scope (.<ref>)` (DL#196). A plain `@scope (.ref)`
matches **all** descendants — including the roots and interiors of **nested** `<jay:X>` child regions
flattened inside it. So a parent region's descendant selectors can bleed into a child region's DOM, which
breaks the "each region owns its styles" story and complicates coalescing.

**Decision to make.** Should region CSS use the CSS **scoping limit** (donut) form —
`@scope (.<ref>) to (<child-region-anchors>)` — so a region's styles stop at the boundary of each nested
child region?

**Tentative lean: yes, if browser support is acceptable.** `to (…)` is the purpose-built mechanism for "style
this subtree but not these inner islands." The `to` selector list would be the scope-anchor classes of the
region's **direct** child regions (we already stamp each region's `ref` as a class on its root — DL#196 §"the
ref is a real class"). This makes region isolation structural rather than relying on authors not writing
bleeding selectors.

**Open sub-questions.**

- Browser support / target baseline for `@scope … to`. If insufficient, is a build-time transform (hoist/limit
  rewrite) viable, or do we fall back to `:not()` guards?
- `to` needs the **child** region anchors known at materialise time — we have them (nested `<jay:X>` roots),
  but the `to` list must be recomputed on `sync` when nesting changes, and `checkRegionCssScoping` must learn
  the new canonical shape (it currently enforces `@scope (.ref) { … }`).
- Interaction with coalescing (DL#196 §4): same-template regions coalesce into one selector-list block — the
  `to` list would differ per region if their child nesting differs, which could **prevent** coalescing. Need a
  rule for when `to` lists are compatible.

**Prior art.** `materialise.ts` + `diff-css.ts` already parse and emit `@scope`; `scopeReadyCss` rewrites root
selectors to `:scope`. The child-region anchors are the same classes Item-1/DL#196 rely on.

## Item 3 — Blog post: "From a component system to a region system"

**Background.** DL#196/#197 landed a real thesis worth writing up publicly: **regions** (flatten a template
into the consuming file, own the copy, validate/sync against source) vs. the classic **component** system
(reference a component, pass props, pre-build override hooks).

**Thesis / talking points (from the user).** Both approaches solve the same two problems — **logic
encapsulation** and a **design system** — but regions add:

- **Locality of concerns** — markup, its bindings, and its per-instance edits all live **in the same file**,
  not split across a component definition + N call sites.
- **Flexibility without pre-planning** — no need to **pre-design override points** and thread **override props**
  through the component API for every tweak a consumer might want; the consumer edits the flattened copy
  directly, and `validate`/`sync` keep it honest against the source.
- Trade-off to be honest about: page files grow and copies duplicate source — which is exactly what drift
  (`validate`) and re-flatten (`sync`) exist to manage.

**Decision to make.** Scope/outline, audience (framework authors vs. app devs), and how much to lean on #196's
flatten/drift/sync diagrams. **Deliverable is prose, not code** — lowest risk; can be drafted anytime.

## Item 4 — A region / design-system index in the agent-kit

**Background.** Agents choosing a `<jay:X>` to flatten have no catalog of **which components ship templates**
and **what each template is for**. The agent-kit already generates `plugins-index.yaml` (DL#85) listing plugin
contracts/actions/services, but it does **not** list templates.

**Decision to make.** Add a **region / design-system index** — either as new fields on the existing
`plugins-index` entries or a sibling index — that lists, for every headless component (local + plugin): its
contract, and **each `.jay-html` template** it ships (there can be several variants per contract — DL#200
Item: "two templates = two design-system elements").

**Tentative design.**

- Extend `PluginContractEntry` (`stack-server-build/lib/contract-materializer.ts:39`) with
  `templates?: { path: string; title?: string; description?: string }[]`, **or** emit a parallel
  `design-system-index.yaml`.
- **Use the template jay-html `<title>` as the region's description** so an agent can pick the right variant
  ("Compact card" vs. "Feature card"). (If `<title>` is empty, fall back to the contract description.)
- Cover **local** components (sibling `.jay-html` next to the contract — the DL#200 availability heuristic
  `hasTemplateForContractFile`) **and** plugin-advertised templates.
- Feeds both the designer agent-kit (which template to flatten) and DL#200's `REGION-NOT-LINKED` suggestion
  (name the exact `template=` path instead of a placeholder).

**Prior art.** `run-agent-kit.ts` (`listContracts`, `PluginsIndex` printing); `contract-materializer.ts`
(`PluginsIndexEntry` / `PluginContractEntry`); DL#200's availability check already locates sibling templates —
this index is the generalized, catalogued form of that same lookup.

## Suggested next step

Review each item; promote Items 1, 2, 4 to their own DLs (they touch runtime/compiler/index generation and
need the usual prior-art + runtime-trace rigor). Item 3 is a writing task, not a design. Items 1 and 2 both
touch `materialise.ts`/`sync` invariants — trace them through the real runtime before committing.
