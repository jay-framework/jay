# Design Log #196 — Validated inline composition

Status: **DESIGN — for review, not implemented.** Supersedes the composition model of DL#181, #187,
#193 and #194. Read DL#195 (retrospective) first — it supplies the evidence this design argues from.

> Revision note (post-review with yoav): the model is simpler than the first draft. Sync is a
> **two-way "equal-to-source-unless-override"** rule, not a three-way merge; there is **no content
> hash and no stored substitution map**; provenance lives on the existing **`application/jay-*`
> script tag**; component **CSS is copied and `@scope`-wrapped**; and flattening is **fully
> transitive with per-region validation**. Each of these rests on a mechanism that already exists in
> the tree — see "Framework support — verified".

## Decisions for the Implementer (TL;DR)

**The proposal in one sentence: a headfull component's `.jay-html` stops being a compile-time input
at the usage site and becomes a _source template_ that the usage site flattens into itself, owns, and
is _validated against_.**

1. **A component's `.jay-html` is materialised (flattened) into the page file.** Not injected by the
   compiler at build time — physically present in `page.jay-html`, authored by whoever composed the
   page (human, agent, or design tool). Flattening is **transitive**: if `card.jay-html` contains
   `<jay:Button>`, the page gets Card's markup _and_ Button's markup. The `<jay:X>` tags remain as
   **region boundaries** (they already carry `jc="<contract>"`, `jay-html-parser.ts:878`); each
   region is validated against its _own_ source, so a Button change is a Button-region concern, never
   an ancestor diff (this is what defuses the diamond problem, not one-level copying).

2. **Materialised content compiles through one of two _existing_ mechanisms, chosen by
   `hasCodeFile`** — no new codegen path, no new runtime primitive:
   - **Component has a `.ts` → it is a headless component** (Q1: yes). The flattened body is its
     **inline template**, exactly as DL#84 already defines and `renderHeadlessInstance`
     (`jay-html-compiler.ts:1093`) already compiles. Bindings resolve against the component's
     ViewState; contract-declared refs are handed to the component's own code
     (`headless-instance-context.ts:164-169`). This mechanism ships today.
   - **Component has no `.ts` → the flattened copy is plain page markup.** The `<jay:X>` tag is erased
     at compile; bindings resolve at page scope; refs are page refs. No boundary, no projection.

3. **Drift is a two-way validation concern, not a compile concern.** `jay-stack validate` compares
   each materialised region against its source _as it is now_ (no recorded base) with a **DOM-level
   diff** (Q3). Unmarked structural deviation is a **warning**; the page still builds. A deviation is
   resolved by (a) `jay-stack sync`, or (b) marking the node `@jay:override` with a reason — after
   which that node's value survives sync and is no longer reported.

4. **Sync is re-flatten, not merge.** `jay-stack sync` re-flattens from the current source and keeps
   `@jay:override` nodes. There is **no merge base, no content hash, no conflict resolution**: a
   materialised copy is _by definition_ equal to its source except at `@jay:override` islands. This
   is the whole model — "all instances equal the source unless explicitly overridden."

5. **Multiple source templates per component are just multiple files.** Provenance names the chosen
   file. No `jay-html="C"` variant vocabulary is needed.

6. **`<override>`, `slot`, Tier 2 inlining, ref forwarding and `__parentContext` are all deleted.**
   You do not override a copy through a separate vocabulary — you edit the copy and mark the edited
   node `@jay:override`. See "What is removed".

**Non-obvious constraints:**

- **This does not remove the runtime boundary for coded components — it makes the boundary honest.**
  A headless component's inline template binds its ViewState _because that is the data the component
  produces_. DL#195 V6 stands: a `.ts` owns its own reactive graph (`component.ts:148`) and cannot be
  inlined. What is removed is the _headfull_ pattern, where a component supplied both markup and code
  and the usage site had to reach across the seam to touch either.
- **The differ is DOM-level and the only genuinely new hard problem.** Both sides already parse to an
  HTMLElement tree, so the diff is structural per-node. The subtle part is the binding rule, which
  **differs by case** (§3): for coded components a changed binding expression is drift; for no-code
  components the binding is a page-owned fill and only _structural_ change is drift. Build the differ
  first (Phase 1), before deleting anything.
- **An un-materialised `<jay:X>` is a hard error** (Q2/Q3 consequence). A bare provenance tag with no
  flattened body cannot compile — `renderHeadlessInstance` already errors on an empty inline body
  (`jay-html-compiler.ts:1170-1178`, "must have inline template content"). The compiler directs the
  author to run `jay-stack add`; it does not auto-materialise silently.
- **Deletion is surgery, not `rm`.** The `structural` branch (`:1106`) and the Fork-C slot block
  (`:1254-1288`) are _interleaved inside_ `renderHeadlessInstance`, the function that must survive as
  the coded path. Phase 4 carves them out; it is not a set of whole-file deletions.

## Background

DL#111 established headfull full-stack components: the compiler parses a component's `.jay-html` and
injects it at the `<jay:Name>` usage site. DL#181 added `ref`-anchored `<override>` so a usage site
could customise part of the injected markup. DL#187 added a three-tier model. DL#193 built the
machinery to let data and refs cross the resulting component boundary. DL#194 replaced #181's
override targets with declared `slot` tags, inlined Tier 2 entirely, and built "Fork C" to inject
slot content across the Tier 3 boundary.

DL#195 inventories the result: `main..HEAD` is `61 lib/ files, +4884 −450`, plus DL#181's 328-line
`jay-html-overrides.ts` already on `main`. Ten catalogued defects, all silent wrong-renders, all
downstream of one seam.

## Problem

**The usage site needs to customise a composed component's markup. Reference-based composition makes
that a boundary-crossing problem, and boundary-crossing in Jay is expensive and fails silently.**

The expense is structural, not incidental (DL#195 root-cause trace): refs and bindings in one
fragment read one `currData` (`element.ts:613,654`; base ref constructor
`node-reference.ts:367-374`), so any mechanism that puts page-authored content inside a component's
render must either move the content's scope (and its refs with it) or bridge the seam. Each bridge
must then be re-derived for element, hydrate, server and main-sandbox, and drift between the four is
invisible until a hydration coordinate fails to resolve.

The observation this log acts on: **DL#194 already proved the alternative works.** Its Tier 2
inlining deleted the boundary for no-code components and, with it, `__parentContext`,
`parentDataChain` re-basing and ref forwarding — replacing all of it with one alias overlay in
`resolveAccessor`. The same log kept the boundary for coded components and had to invent
`foreignChild`, a `slots` channel on `childComp`, two more ref traps and a per-item preamble sink.
One design log, two halves, opposite cost signs.

## Prior Art / Adjacent Mechanisms — null hypothesis first

Before proposing anything, what already exists?

| Mechanism                                        | Location                                                                                                          | Does it suffice?                                                                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Headless component + inline template** (DL#84) | `jay-html-compiler.ts:1093` `renderHeadlessInstance`, `mergeContractStubRefs` (`jay-html-compiler-shared.ts:294`) | **Yes — this is the whole mechanism for the coded case.** Usage site supplies the UI, component supplies the data and consumes the refs. Nothing new needed.                  |
| **Plain page markup**                            | the ordinary compile path                                                                                         | **Yes — this is the whole mechanism for the no-code case.** Page scope, page refs, all four targets already agree.                                                            |
| `jc="<contract>"` region marker                  | `jay-html-parser.ts:878`                                                                                          | **Yes — the flatten boundary.** Already stamped on inlined jay tags; delimits which nodes belong to which component's region for per-region validation (Q2).                  |
| `application/jay-*` script tags                  | `jay-html-parser.ts:687,953,1271`; stripped at `:1587`                                                            | **Yes — the provenance home (Q4).** Already carry `contract`/`src`; add `template=` for the chosen source file. Erased from output by the existing `application/jay-` filter. |
| Component CSS collection                          | `jay-html-parser.ts:1257-1264` (`extractCss` → `cssParts`)                                                        | **Yes — the CSS materialisation point (Q5).** Already merges component CSS into the page; wrap the collected block in `@scope` so it cannot poison the page and can be validated. |
| Tier 2 alias overlay (DL#194 Phase B)            | `expression-compiler.ts:148`, `jay-html-compiler.ts:523`                                                          | **No longer needed.** It projects contract fields onto usage-site expressions at codegen. When the author writes the page expression directly into the flattened copy, there is nothing left to project (§3). |
| `<override>` (DL#181/#194)                       | `jay-html-overrides.ts`                                                                                           | **Superseded.** You edit the copy and mark the node `@jay:override`.                                                                                                          |
| `slot` contract tag (DL#194)                     | `contract.ts:13`                                                                                                  | **Superseded.** The whole body is editable; there is no need to declare which region is.                                                                                      |
| `$parent` carrier (DL#193 Capability A)          | `context.ts:178,214,222`; `element.ts:468`                                                                        | **Independent — kept** (Q8).                                                                                                                                                  |
| `checkHeadlessInstanceProps` + validation host   | `stack-cli/lib/validate.ts`                                                                                       | **Yes, as the home for the drift rule** — the validator is already the prevention-first surface (DL#145/#147/#166/#167).                                                      |
| `prettifyHtml`                                   | `compiler-shared`                                                                                                 | **Only for output** — the differ works on the parsed tree, not on strings (Q3), so normalisation is structural rather than textual.                                          |

**Net new surface proposed: a DOM differ, a materialiser/flattener, a re-flatten `sync`, an `@scope`
CSS wrap, and one marker (`@jay:override`).** All in `stack-cli` / the validator. **No runtime
change, no codegen change, no per-target derivation.**

### Framework support — verified

The revised model rests on five existing mechanisms; each was checked against the tree at `ccf62d14`
before this design was finalised (the "make sure we support it before we build" gate):

1. **Provenance on a script tag (Q4).** `application/jay-headless` (`:687,1271`) and
   `application/jay-headfull` (`:953`) scripts already carry `contract`/`src` attributes, and every
   `application/jay-*` script is stripped from rendered output (`:1587`). A `template=` attribute
   fits the convention and needs no parser change beyond reading it.
2. **Transitive flatten with region boundaries (Q2).** `jc="<contract>"` is already set on inlined
   jay tags (`:878`); it is the region delimiter that lets validation scope Card's region and exclude
   the nested `<jay:Button>` subtree.
3. **CSS copy + `@scope` (Q5).** `extractCss` already collects component CSS into `cssParts` with a
   `/* Component: <name> */` banner (`:1257-1264`); `@scope`-wrapping that block is a localized text
   transform at a known point. Scope root = the `<jay:X ref>` wrapper element (Q6).
4. **DOM-level compare (Q3).** Both the source template and the flattened page region parse to an
   HTMLElement tree via `parse()` and are walked by `renderNode`; the differ reuses that AST on both
   sides, so structural + per-expression comparison is a tree walk, not string diffing.
5. **The coded inline-template path is expressive enough.** `renderHeadlessInstance` compiles
   arbitrary child nodes against the component ViewState via `renderNode` (`:1214`), merges contract
   stub refs (`:1291`), and already supports nesting, refs and forEach — so a flattened coded body is
   a first-class citizen, not a restricted subset.

## Questions and Answers

**Q1. Does a coded (`.ts`-bearing) component stop shipping UI? — ANSWERED: yes.** A coded component
is a **headless** component: contract + code, UI supplied by the usage site. Its `.jay-html`, if it
has one, is a _source template_ the usage site flattens — not a runtime artifact. This is what makes
DL#195 V6 (a `.ts` cannot be inlined) a non-problem rather than a Fork C.
Cost, stated plainly: a **plugin can no longer ship UI that updates on upgrade**. DL#39/#60 plugins
currently deliver working headfull components; under this design they deliver a contract, code, and a
template you flatten. On upgrade, `jay-stack sync` re-flattens the non-overridden regions — so
styling and structure _do_ flow on upgrade, they just flow through an explicit, reviewable command
instead of silently at build time. That is the correct trade: a plugin bump cannot silently redesign
your pages, but it is one command away from doing so where you have not overridden.

**Q2. Does materialisation flatten transitively? — ANSWERED: yes, flatten all.** The page contains
`<jay:Card>` _and_ `<jay:Button>` and both their markup. The `<jay:X>` tags remain as `jc`-marked
region boundaries. **Validation of Card does not include validation of Button** — the Button region
is validated against Button's source, always. This is what keeps the diamond problem out: a change to
Button's source is drift in the Button region only, at every site, and never appears as a diff in
Card's region. (This reverses the first draft's "copy one level"; per-region validation is the
mechanism that makes transitive flatten safe.)

**Q3. What exactly is the equivalence relation the differ uses? — ANSWERED: DOM-level compare.** Walk
both trees structurally (not stringified). For each matched node compare tag, attributes and static
text. Bindings are compared **per expression at the matched position**, which localises the question
to one node:
- **Coded component region:** the binding resolves against the component's ViewState, so the
  expression is part of the canonical template — a changed expression **is drift** (warn unless
  `@jay:override`).
- **No-code component region:** the binding is a **page-owned fill** (the contract field is a named
  slot, the page supplies the data), so a changed expression is **not drift**; only structural change
  (added/removed/reordered nodes, changed tag/attribute/static text) is drift.
This is why no stored substitution map is needed (contrast the first draft's `jay-bind`): the DOM
position carries the field↔fill correspondence, and the contract names the slots.

**Q4. Where does provenance live? — ANSWERED: on the `application/jay-*` script tag, file location
only, no hash.** The headless/headfull script already declares the component; add a `template=`
attribute naming the chosen source `.jay-html`. **No content hash** — the model is "equal to source
_now_ unless overridden", so there is no merge base to pin. If more than one template exists for a
component, `template=` names the chosen one (Q5 of DL#181's variant request, solved by file
selection, not vocabulary).

**Q5. Where does the component's CSS come from? — ANSWERED: copied and `@scope`-wrapped.** The
materialiser copies the component's CSS into the page (as `extractCss` already routes it,
`:1257-1264`) wrapped in `@scope (<wrapper-ref-selector>) { … }` so it cannot poison page styles
unintentionally, and so the validator can confirm it is present and unchanged except at overrides.
This resolves the first draft's contradiction (keeping CSS on the source would have kept the source a
build input): under this model the source is **not** a build input for anything — markup and CSS are
both flattened. Edited-in classes (`class="featured"` in an override) are the author's responsibility
in the page, consistent with "you own the copy".

**Q6. Ref name collisions. — ANSWERED: keep the wrapper and nest.** `<jay:X ref="signupCard">` keeps
namespacing in both cases: for coded it is a real headless instance (refs nest under it as today);
for no-code the wrapper remains in the ref tree so refs land under `refs.signupCard.*` instead of
colliding flat. Mechanism exists as a compile-time utility (`nestRefs`,
`compiler-shared/lib/render-fragment.ts:66`, already used at `jay-html-compiler.ts:1082`).

**Q7. Is there a case that genuinely still needs a runtime headfull boundary? — ANSWERED: no.**
Recursion is the known candidate; DL#194 already forbids it for Tier 2 and directs the author to add
a `.ts`. Under this design a recursive component is a coded component using the existing `<recurse>`
mechanism (DL#46/#47), untouched. If review surfaces another case it is an escape-hatch question, not
a model question.

**Q8. Does DL#193 Capability A (`$parent` inside `forEach`) survive? — ANSWERED: keep it, decoupled.**
Nothing in this design needs it (flattened content is page-native), but it answers a real author
question ("bind a page field from inside a list") that this design does not otherwise address, and it
has a working dual regular/secure example. It costs `context.ts:178,214,222`, the `dependsOnParent`
gates (`element.ts:468,488,501`) and the grammar (~51 grep hits).

**Q9. What is materialisation, and what triggers it? — ANSWERED.** _Materialisation_ = flatten a
component's source template **and** its `@scope`-wrapped CSS transitively into the page, keeping the
`<jay:X>` / `application/jay-*` script markers as `jc`-delimited validation-region boundaries and
recording the source `template=` on the marker. For a no-code component the tag is erased at compile
and bindings are the page author's fills; for a coded component the tag is a real headless instance
and the body is its inline template. It is triggered by **all three surfaces over one library
function** (Q9 original): the CLI (`jay-stack add`, the testable surface), the editor/design-tool
(DL#42), and the Designer agent-kit. Do not let three implementations of "flatten and stamp
provenance" exist.

**Q10. Is unmarked drift an error or a warning? — ANSWERED: warning.** The page builds; drift is
information, not breakage. The **error** case is a provenance `template=` that does not resolve
(missing source file), which is genuinely broken.

**Q11. Does `/nested-composition`'s enclosing-instance-scope fix (`ccf62d14`) survive?** Headless
instances can still nest under this design (a flattened coded region can contain another coded
region), so the per-enclosing-instance prop-scoping fix may be independently correct. **Open — trace
before discarding, decided in Phase 5.**

**Q12. Can a coded region add page-supplied bindings and page-used refs? — KNOWN GAP, "for now" no;
direction: a pass-through channel.** This is the one thing the retired model did that the flatten
model does not yet cover. Precise statement of the gap:

- It is **coded-only.** A no-code region is erased to page markup (bindings resolve at page scope,
  refs are page refs), so adding page content there already works. The gap exists **only** inside a
  coded region, whose flattened body compiles in _child scope_ (`renderHeadlessInstance` →
  `childContext.variables = componentVariables`, `jay-html-compiler.ts:1144,1188-1212`).
- Inside that child scope, a binding of **page** data has nothing to resolve against, and a **ref**
  the page's own code wants to use is created against the child's `currData` (DL#195 L2) and lands in
  the child ref manager, not the page's.
- This is **not** Q7. Q7 asks whether a component needs a _new_ runtime boundary (no). Q12 is about
  crossing the boundary a coded component _already has_ with narrow, page-owned content.

_Direction (deferred — see Design §7): a page-declared `@jay:page-scope` subtree that compiles in
**page** scope, whose refs nest under the wrapper ref (Q6), and which is mounted into the child DOM
through a minimal one-direction pass-through. The lesson from DL#194's Fork C is **why** this stays
cheap: make it **page-declared, position-based, un-typed by contract** — the opposite of slots
(contract-declared) and of DL#193 ref-forwarding (implicit + provenance-keyed). The component neither
declares nor knows about the passed content._
_**Deferred to a follow-up. v1 ships without pass-through and instead detects the gap** — a
page-scoped binding or a page-owned ref inside a coded region is a **compile error** with a message
pointing at `@jay:page-scope` (prevention-first, CLAUDE.md: a clear diagnostic, not a silent
wrong-render — the exact failure mode DL#195 L4 condemns)._

## Design

### 1. Component definition — unchanged in shape

```
components/card/
  card.jay-contract     # the contract (unchanged)
  card.ts               # optional. Present → headless component (makeJayStackComponent)
  card.jay-html         # source template(s) — authoring artifact, not a build input at usage sites
  card-compact.jay-html # a second variant is just a second file
```

### 2. Usage site — flattened, with provenance on the script marker

Provenance lives on the component's `application/jay-*` script declaration (head), naming the chosen
template file — no hash (Q4):

```html
<!-- page head -->
<script
  type="application/jay-headless"
  contract="../components/card/card.jay-contract"
  src="../components/card/card.ts"
  template="../components/card/card.jay-html"
></script>
```

**Coded component** (`card.ts` present) — the tag is a real headless instance, the flattened body is
its inline template (DL#84, unchanged), nested `<jay:Counter>` kept as a `jc`-marked region:

```html
<jay:card ref="signupCard" jc="card">
  <div class="card">
    <h3>{heading}</h3>
    <!-- card's ViewState — correct: the card computes it -->
    <button ref="cta">{ctaLabel}</button>
    <!-- contract ref → card.ts consumes it -->
    <jay:Counter ref="counter" jc="Counter"> … flattened Counter region … </jay:Counter>
  </div>
</jay:card>
```

`{heading}` is card's data because card produces it. The usage-site-authored content is _inside_ the
seam by construction — which is what the headless mechanism has always done — instead of reaching
_across_ it (DL#195 L1).

**No-code component** (no `card.ts`) — the tag is provenance only and is erased at compile; bindings
are page-scope fills:

```html
<jay:card ref="signupCard" jc="card">
  <div class="card">
    <h3>{item.title}</h3>
    <!-- page scope, written directly — no {heading} projection -->
    <div class="card-body"><jay:Counter ref="counter" jc="Counter"> … </jay:Counter></div>
  </div>
</jay:card>
```

Compiles as plain page markup. `refs.signupCard.counter` is a page ref nested under the wrapper (Q6).
No alias overlay, no `__parentContext`, no re-basing.

### 3. The differ — DOM-level, per-region, per-expression

For each `jc`-marked region: load the region's source template (`template=` on the marker), parse
both sides, walk them structurally. A node is **drift** when its tag, attributes, or static text
differ from source, or (coded region only) its binding expression differs. No-code binding
expressions are page-owned fills and are never drift. Nested `<jay:X jc>` regions are **not**
descended into — each is validated against its own source (Q2). This replaces `buildInlineAliases`'s
codegen projection entirely: there is no substitution map to record or replay, because the tree
position and the contract carry the correspondence.

### 4. Drift validation

A new rule in the validator (`stack-cli/lib/validate.ts`, DL#145-style pluggable). For each region,
run the §3 differ against the current source and report per deviating node:

```
warning  page.jay-html:14  <jay:card> region differs from ../components/card/card.jay-html
  · <h3> text changed        "{heading}" → "on sale"        (coded region: expression is drift)
  · <p ref="disclaimer">     removed
  Run `jay-stack sync page.jay-html#signupCard`, or mark the node @jay:override.
```

Suppression, per node — the node's value survives and is no longer reported or synced:

```html
<h3 @jay:override="page-specific headline">on sale</h3>
```

### 5. Sync — re-flatten, not merge

`jay-stack sync [<target>] [--all]`:

- Re-flatten the region(s) from the **current** source template.
- Keep every `@jay:override` node verbatim; overwrite everything else.
- No merge base, no hash, no conflict resolution — a materialised region is by definition equal to
  its source except at `@jay:override` islands, so "sync" is deterministic overwrite-with-holes.
- `--all` applies across every site of a component in the project. This is the answer to "100
  instances with the same flattened content": they are all identical to source, so one command
  updates them all; the only per-site variation is the override islands, which are preserved.

This is the simplification that removes the first draft's three-way merge and its whole risk surface:
there is no ambiguous auto-merge that can silently produce wrong markup, because sync never
_combines_ two edited versions — it replaces the non-overridden part outright.

### 6. What is removed

In dependency order (Phase 4). Note "surgery" rows: these are branches _inside_ surviving functions,
not whole-file deletions.

| Removed                                                                                                                                             | Kind    | Source DL        |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------- |
| `jay-html-overrides.ts` in full — both `<override>` forms, pragma, markers                                                                          | file    | #181, #193, #194 |
| `slot` contract tag, slot validation, slot fill paths                                                                                               | file+   | #194             |
| Fork C: `foreignChild`, `childComp`'s `slots` param, slot ref managers + two traps, `slotPreambles`                                                 | mixed   | #194             |
| Fork-C slot block inside `renderHeadlessInstance` (`:1254-1288`) and its hydrate/server twins                                                       | surgery | #194             |
| Tier 2 `structural` branch inside `renderHeadlessInstance` (`:1106`) and `renderInlinedStructuralInstance` + server/hydrate twins                    | surgery | #194             |
| Tier 2 inlining: `aliases`/`inlinedRoot`/`withRootVarName` on `Variables`, `buildInlineAliases`                                                     | mixed   | #194             |
| Ref forwarding: `getForwardedInnerRef`, `hasForwardedInnerRef`, collection trap, `childComp`'s `refViewState`, `emittedForwardedRefHelpers`         | mixed   | #193             |
| `__parentContext` / `withSyntheticParentContext` / `PARENT_CONTEXT_PROP`                                                                            | mixed   | #193             |
| `withParentShift` / `PARENT_SCOPE_PRAGMA` / `lexicallyInScope` / `asLexical`                                                                        | mixed   | #193             |
| Tier 2 runtime: `structural-coercions.ts`, `passthrough-component.ts`, the `structural` flag (~106 sites), the empty-contract unwrap                | mixed   | #162, #187       |
| Tier 2 restrictions: recursion guard, root-`$parent` guard, `forEachInsidePureComponentError`                                                       | mixed   | #194             |
| Compile-time headfull template injection at usage sites                                                                                             | mixed   | #111             |

Retained unchanged: DL#189, #190, #192, the class-names utility, the headless-instance props channel
(DL#195 V4), `<recurse>` (DL#46/#47), and Capability A (Q8).

**One survivor is conditional on §7.** Fork C's DOM-passthrough _anchor_ (`element.ts:100`
`foreignChild`) is the single primitive the pass-through (Q12 / §7) would reuse. If §7 ships, a
**slimmed, page-declared** version of it survives; if §7 is deferred indefinitely, it is deleted with
the rest of Fork C. Either way the parts that made Fork C expensive — the `slot` contract vocabulary,
the two-form `<override>`, the provenance-keyed ref traps, `slotPreambles`, the `slots` channel keyed
by slot name — are removed unconditionally.

### 7. Pass-through — the coded escape hatch (deferred)

The gap (Q12): a coded region cannot host page-supplied bindings/refs, because its body compiles in
child scope. The direction, kept minimal by inverting each choice that made Fork C costly:

| Dimension     | Fork C (retired)                                  | Pass-through (§7)                                          |
| ------------- | ------------------------------------------------- | --------------------------------------------------------- |
| Who declares  | the **component contract** (`slot` tag)           | the **page** (`@jay:page-scope` on a subtree)             |
| Addressing    | named slots + provenance markers                  | position (the marker's place in the flattened body)       |
| Binding scope | mixed, decided by a ref-scope rule table (L6)     | always **page** scope — no table                          |
| Refs          | provenance-keyed forwarding + two Proxy traps     | ordinary page refs, nested under the wrapper (`nestRefs`) |
| Direction     | two-way (data in, refs out) across a live chain   | one-way DOM mount into the child at an anchor             |
| Runtime       | `slots` channel + `foreignChild` + slot managers  | `foreignChild` anchor only                                |

Sketch:

```html
<jay:card ref="signupCard" jc="card">
  <div class="card">
    <h3>{heading}</h3>
    <!-- child scope: card's ViewState -->
    <div @jay:page-scope>
      <span>{promoCode}</span>
      <!-- page scope: page ViewState -->
      <button ref="claim">Claim</button>
      <!-- page ref: refs.signupCard.claim, wired by page code -->
    </div>
  </div>
</jay:card>
```

The `@jay:page-scope` subtree compiles in the page render (page `currData`, page ref manager), and is
mounted into the child DOM at its position via the retained `foreignChild` anchor. The component does
not declare or see it.

**Constraints this must honour (from DL#195), before it is built:**

- **V2 — cross-target fixtures.** It is a runtime crossing, so element/hydrate/server/main-sandbox
  each get a `toEqual` fixture; DL#194 defects 3/5/10 were target drift on exactly this path.
- **V5 — compile-time failure.** Because the region is _page-declared_, the validator can check it:
  a page binding/ref outside a `@jay:page-scope` subtree (in a coded region) is a compile error, and
  a `@jay:page-scope` subtree that binds _child_ data is a compile error. No runtime scope guessing.
- **V3 — stable coordinates.** The anchor participates in `assign-coordinates.ts` / DL#126's flat
  map like any mounted fragment.

This is intentionally the _only_ place the retired boundary-crossing survives, reduced to its
irreducible core (a coded component owns its reactive graph, V6, so page content must be mounted, not
inlined) and made explicit and checkable rather than implicit and silent.

## Implementation Plan

**Phase 1 — the DOM differ (de-risk first, delete nothing).** Build the structural + per-expression
diff and `@jay:override` suppression as a standalone library in `stack-cli`, unit-tested against
**fixture triples** (source template, flattened region, expected diagnostics) — this is the differ's
own oracle. _Separately_, the existing Tier 2 usage sites on this branch are the **compile** oracle
for verification criteria 1–2 (a flattened no-code region must compile to the same output Tier 2
inlining produces today); do not conflate the two — the Tier 2 sites de-risk the _compile_, the
fixture triples de-risk the _differ_. Nothing else starts until both are green. _This is the only
part whose difficulty is unknown; everything after it is subtraction._

**Phase 2 — provenance + materialiser.** Read `template=` on the `application/jay-*` script tag
(Q4 — parser support already present, `:687,1271`, verify the read path). Implement transitive
flatten with `jc` region markers (Q2) and `@scope` CSS copy (Q5). One library function, exposed as
`jay-stack add`; editor and agent-kit call the same function (Q9). Wire the validation rule into
`stack-cli/lib/validate.ts` and surface it in the dev build through
`stack-cli/lib/run-validate.ts:36` `surfaceValidationIssues` — reuse DL#189's shape, including its
Rollup dead-code gotcha (return a boolean; `process.exit(1)` stays at the call site,
`run-production.ts:73-78`). Bare-tag-with-no-body is a hard error here (`jay-html-compiler.ts:1170`).

**Phase 3 — sync (re-flatten).** Per-site and `--all`. Deterministic overwrite-with-`@jay:override`-holes
(§5). No three-way merge. Exact CLI messages tested by string equality (per CLAUDE.md).

**Phase 4 — deletion.** In the order of the table above, each as its own labelled commit so the diff
documents the model. The "surgery" rows carve branches out of `renderHeadlessInstance` and its
hydrate/server twins while keeping the coded inline-template path intact — do these under full
`toEqual` fixtures on element/hydrate/server. As the crossing machinery is removed, add the **Q12 gap
diagnostic** in its place (page-scoped binding/ref inside a coded region → compile error naming
`@jay:page-scope`), so the capability is _refused clearly_ rather than silently mis-compiled. Run
`yarn confirm` between groups; the 803 compiler / 291 runtime / 741 dev-server / 66 smoke tests are
the regression oracle.

**Phase 5 — examples and smoke migration.** `/combined`, `/foreach-composite`, `/nested-composition`,
`examples/jay/override-ref-forwarding`, `examples/jay/ref-forwarding` all rewrite to flattened copies.
`/nested-composition` resolves Q11: it becomes flat page markup (no-code) or nested coded regions
(coded); its `it.fails` SSR assertion should either pass or the page should cease to exist.

**Phase 6 — agent-kit.** Designer guide: how to materialise, what drift warnings mean, when to mark
`@jay:override` vs `sync`. Plugin guide: your component ships a contract, code, and a template — not a
running UI (Q1's consequence), and upgrades flow through `sync`.

Per CLAUDE.md: fixtures first, full `toEqual`, never `toContain` on code.

## Examples

**✅ Materialise, then edit freely** — no `<override>` vocabulary, edited nodes marked:

```html
<jay:card ref="promo" jc="card">
  <div class="card featured">
    <!-- class edited on a coded region → mark it, or sync restores it -->
    <h3 @jay:override="promo headline">Half price this week</h3>
    <div class="card-body"><jay:Counter ref="cta" jc="Counter"> … </jay:Counter></div>
  </div>
</jay:card>
```

**✅ The old `remove`** — delete the node from your copy and mark the parent `@jay:override`, or sync
restores it.

**✅ The old attribute/style merge** — edit the attribute in your copy; mark the node.

**❌ Provenance that does not resolve** — hard error, not a warning (Q10):

```html
<script type="application/jay-headless" template="../components/gone/gone.jay-html"></script>
<!-- error: template= does not resolve -->
```

## Trade-offs

| Approach                                                         | Pro                                                                                                                                                                                                                                                                               | Con                                                                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Flatten + validate + re-flatten sync (chosen)**               | Removes the seam and everything downstream of it (DL#195 root cause); content is page-native so it gets ordinary compile-time validation on all four targets; sync is deterministic overwrite-with-holes, so there is **no ambiguous merge that can silently mis-render**; concept count collapses to "page markup + headless components" | The DOM differ + flattener are real work; copies duplicate source; page files grow; plugin UI upgrades flow through `sync`, not automatically (Q1) |
| Reference-based composition (#181/#187/#193/#194, being retired) | Single source of truth; no duplication; no staleness                                                                                                                                                                                                                              | The entire crossing apparatus; ten silent-render defects; four-target re-derivation; a ref-scope rule table the author must memorise |
| Three-way merge sync (first draft of this DL)                   | Handles copies that diverge arbitrarily from source                                                                                                                                                                                                                               | A structural HTML 3-way merge can mis-merge silently — reintroducing DL#195's wrong-pixel failure class in the tool. **Rejected** in favour of equal-unless-override. |
| Keep the boundary, add copy-drift on top                        | Incremental                                                                                                                                                                                                                                                                       | Worst of both — Fork C survives _and_ drift arrives. Rejected.                                                                      |
| Materialise but keep `<override>` for small edits               | Familiar; small diffs stay small                                                                                                                                                                                                                                                  | Two ways to express the same edit, and `<override>` is precisely what needs the crossing machinery. Rejected.                        |

**Note on DL#181's rejection of this approach.** Its trade-off table dismissed "materialized/copied
instance with drift reconciliation" as adding "a 3-way-merge-shaped reconciliation problem and file
duplication for no corresponding benefit." Two things have changed: the benefit is now measurable
(~4,900 lines of `lib/` change and ten defects, DL#195), and the reconciliation is **not** 3-way — it
is equal-to-source-unless-override, which has no merge base and no ambiguous resolution. The remaining
cost is duplication and larger page files, against a benign, compile-time failure mode.

## Verification Criteria

1. A materialised no-code region compiles as page markup: bindings resolve at page scope, refs
   surface under the wrapper, generated output contains **no** `childComp` for the component, no
   `__parentContext`, no `(vs,_p1)=>_p1`, no alias overlay — asserted by full `toEqual` fixtures on
   element, hydrate and server targets.
2. A materialised coded region compiles through the existing headless-instance path with
   **byte-identical** output to an equivalent hand-written inline template — proving no new codegen.
3. An unedited copy validates clean. An edited node produces a warning naming the node and the change
   (coded: expression drift; no-code: only structural drift), and the page still builds.
4. `jay-stack sync` re-flattens from current source, preserves `@jay:override` nodes, and overwrites
   everything else — no merge base, no conflict prompt. A synced region validates clean.
5. `sync --all` updates N sites of one component in one run; sites with `@jay:override` nodes keep
   them.
6. A `template=` that does not resolve is a hard error; a bare `<jay:X>` with no flattened body is a
   hard error (contrast criterion 3's warning).
7. Component CSS is copied and `@scope`-wrapped so it does not alter page selectors, and the validator
   flags CSS drift; the source `.jay-html` is **not** read at page build time for anything.
8. Every mechanism in "What is removed" is absent from `lib/`, and `yarn confirm` exits 0 — including
   the dev-server hydration suite, where DL#194's target-drift defects surfaced.
9. The DL#195 orthogonal set (DL#189/#190/#192, class-names) is behaviourally unchanged: their tests
   pass without modification.
10. The differ has no runtime and no codegen dependency — it is exercised entirely by `stack-cli` unit
    tests plus the validation path.
11. In v1 (no §7 pass-through), a page-scoped binding or a page-owned ref inside a **coded** region is
    a **compile error** naming `@jay:page-scope` — not a silent wrong-render (Q12). No-code regions are
    unaffected.

---

**Predecessors:** DL#195 (retrospective), DL#181, #187, #193, #194.
**Resolved blockers:** Q1 (coded components become headless) — yes.
**Open:** Q11 (traced in Phase 5); Q12 (coded page-scoped content — v1 detects-and-errors, §7
pass-through deferred to a follow-up).
