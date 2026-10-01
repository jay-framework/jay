# Design Log #196 — Validated inline composition

Status: **DESIGN — for review, not implemented.** Supersedes the composition model of DL#181, #187,
#193 and #194. Read DL#195 (retrospective) first — it supplies the evidence this design argues from.

> Revision note (post-review with yoav). Two rounds of simplification:
>
> - **Round 1:** sync is a **two-way "equal-to-source-unless-override"** rule, not a three-way merge;
>   **no content hash, no stored substitution map**; provenance on the existing `application/jay-*`
>   script tag; component CSS copied and `@scope`-wrapped; flattening fully transitive with per-region
>   validation.
> - **Round 2 (this revision):** **one uniform case.** Both coded and no-code components compile
>   through the _same_ headless-instance path; `hasCodeFile` only chooses a real `.ts` component vs. a
>   synthesized **passthrough** (`makePassthroughInstanceComponent`, `passthrough-component.ts`).
>   Data flows in via **props on the tag**; the flattened body is the component's inline template in
>   both cases and is copied **verbatim**. Consequences: the differ has **one** rule (no coded/no-code
>   split), `application/jay-headfull` is **deprecated** (everything is `application/jay-headless`),
>   and `jc` is **compiler-injected**, never authored.

## Decisions for the Implementer (TL;DR)

**The proposal in one sentence: a component's `.jay-html` stops being a compile-time input at the
usage site and becomes a _source template_ that the usage site flattens into itself, owns, and is
_validated against_ — compiling, in every case, through the existing headless-instance path.**

1. **A component's `.jay-html` is materialised (flattened) into the page file.** Not injected by the
   compiler at build time — physically present in `page.jay-html`, authored by whoever composed the
   page (human, agent, or design tool). Flattening is **transitive**: if `card.jay-html` contains
   `<jay:Button>`, the page gets Card's markup _and_ Button's markup. The `<jay:X>` tag itself is the
   **region boundary**; the parser re-derives `jc="<contract>"` (`jay-html-parser.ts:878`) internally,
   so each region validates against its _own_ source and a Button change is a Button-region concern,
   never an ancestor diff (this defuses the diamond problem, not one-level copying).

2. **One compile path for all composed components: the headless instance** (`renderHeadlessInstance`,
   `jay-html-compiler.ts:1093`). `hasCodeFile` chooses only _which component backs it_:
   - **Component has a `.ts` → a real headless component** (Q1: yes). Its code produces the ViewState
     and consumes contract refs (`headless-instance-context.ts:164-169`).
   - **Component has no `.ts` → a synthesized passthrough** (`makePassthroughInstanceComponent`) whose
     ViewState _is_ the props, split per phase. It ships today (dev server, production build, server).

   In both cases the flattened body is the component's **inline template** (DL#84, unchanged): it
   binds the component's ViewState, and **page data enters as props on the `<jay:X>` tag** through the
   existing headless props channel (DL#195 V4). No inlining, no alias overlay, no `__parentContext`.

3. **Drift is a two-way validation concern, not a compile concern.** `jay-stack validate` compares
   each materialised region against its source _as it is now_ (no recorded base) with a **DOM-level
   diff** (Q3). Because the body is copied verbatim, the rule is uniform: any structural or
   binding-expression change is drift. Unmarked drift is a **warning**; the page still builds. Resolve
   by (a) `jay-stack sync`, or (b) marking the affected **facet** `override` — an attribute, one
   inline-style declaration, the subtree, or a CSS rule/declaration (§4). Suppression is per-facet,
   not per-node: unlisted facets of the same node still reconcile.

4. **Sync is re-flatten, not merge.** `jay-stack sync` re-flattens from the current source and keeps
   `override` **facets**. **No merge base, no hash, no conflict resolution** — a materialised copy
   is by definition equal to its source except at `override` facets. "All instances equal the
   source unless explicitly overridden."

5. **Multiple source templates per component are just multiple files.** Provenance (`template=`) names
   the chosen file. No `jay-html="C"` variant vocabulary is needed.

6. **`<override>`, `slot`, Tier 2 _inlining_, ref forwarding, `__parentContext`, and the
   `application/jay-headfull` declaration are all deleted.** You do not override a copy through a
   separate vocabulary — you edit it and mark the node `override`. See "What is removed". The
   passthrough component is **retained** (it is now the no-code runtime).

**Non-obvious constraints:**

- **There is one honest runtime boundary: the headless instance.** A component (real or passthrough)
  owns its ViewState; the inline body binds it; page data enters via props — the supported direction,
  never a crossing. DL#195 V6 stands: a `.ts` owns its reactive graph (`component.ts:148`) and is not
  inlined. What is removed is the _headfull_ pattern (markup + code shipped together, usage site
  reaching across the seam).
- **`jc` is compiler-injected, never authored.** The author writes `<jay:card ref="signupCard">`; the
  parser resolves it to its contract and stamps `jc` (`:878`, DL#186 added it to the validator skip
  list). Region boundaries in the page file are the `<jay:X>` tags themselves.
- **`override` and `page-scope` are bare directives, not prefixed.** They follow the existing
  attribute convention (`if`, `forEach`, `trackBy`, `ref`, `slot` — all bare, `assign-coordinates.ts:154`),
  so no `@`/`jay:` prefix. Both must be added to the parser/validator skip-list (as `jc` was, `:878`)
  so they are neither bound nor rendered. The **CSS** marker keeps a `jay:` sentinel
  (`/* jay:override */`) because a raw CSS comment has no element namespace to disambiguate it from an
  ordinary note.
- **The differ is DOM-level and the only genuinely new hard problem — but now with one uniform rule.**
  Both sides parse to an HTMLElement tree; the body is verbatim, so a node is drift iff its tag,
  attributes, static text, or binding expression differ. No coded/no-code split. Build it first
  (Phase 1).
- **An un-materialised `<jay:X>` is a hard error.** A bare provenance tag with no flattened body
  cannot compile — `renderHeadlessInstance` already errors on an empty inline body (`:1170-1178`,
  "must have inline template content"). Direct the author to `jay-stack sync` (filling an empty region
  is the degenerate, no-override case of re-flatten — §5) or the design tool; never auto-materialise
  silently at build time.
- **Deletion collapses `renderHeadlessInstance` to a single path.** The `structural` branch (`:1106`)
  and the Fork-C slot block (`:1254-1288`) are removed, leaving the one inline-template path that both
  real and passthrough components share.

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
`parentDataChain` re-basing and ref forwarding. The same log kept the boundary for coded components
and had to invent `foreignChild`, a `slots` channel on `childComp`, two more ref traps and a per-item
preamble sink. One design log, two halves, opposite cost signs. This design keeps a single, honest
boundary (the headless instance) and moves customisation out of the runtime entirely, into a copy the
page owns and the validator checks.

## Prior Art / Adjacent Mechanisms — null hypothesis first

Before proposing anything, what already exists?

| Mechanism                                        | Location                                                                                                          | Does it suffice?                                                                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Headless component + inline template** (DL#84) | `jay-html-compiler.ts:1093` `renderHeadlessInstance`, `mergeContractStubRefs` (`jay-html-compiler-shared.ts:294`) | **Yes — the single compile path for every composed component.** Usage site supplies the UI (the flattened body), component supplies the ViewState and consumes contract refs.   |
| **`makePassthroughInstanceComponent`** (DL#187)  | `stack-server-runtime/lib/passthrough-component.ts:42`                                                            | **Yes — the no-code runtime.** Identity component: ViewState = props, split per phase. Already used by dev server, production build, and server. Makes no-code a real instance. |
| `jc="<contract>"` region marker                  | `jay-html-parser.ts:878`                                                                                          | **Yes — the flatten boundary, compiler-injected.** Re-derived from the tag at parse; the author never writes it. Delimits each component's region for per-region validation.    |
| `application/jay-headless` script tag            | `jay-html-parser.ts:687,1271`; stripped at `:1587`                                                                | **Yes — the single provenance home (Q4).** Carries `contract`/`src`; add `template=`. `application/jay-headfull` is deprecated — one declaration for all composed components.   |
| Component CSS collection                         | `jay-html-parser.ts:1257-1264` (`extractCss` → `cssParts`)                                                        | **Yes — the CSS materialisation point (Q5).** Already merges component CSS into the page; wrap the copied block in `@scope` so it cannot poison the page and can be validated.  |
| Headless props channel (per-phase, coerced)      | DL#189, DL#190; `normalizeAndResolveInstanceProps`                                                                | **Yes — how page data reaches a region.** Props on the `<jay:X>` tag fill the component's ViewState; the passthrough echoes them per phase. Retained (V4).                      |
| Tier 2 alias overlay / inlining (DL#194 Phase B) | `expression-compiler.ts:148`, `jay-html-compiler.ts:523,1006`                                                     | **No longer needed.** It existed to splice a no-code body _without_ a boundary. No-code now uses the passthrough instance + props channel, so the inlining is deleted.          |
| `<override>` (DL#181/#194)                       | `jay-html-overrides.ts`                                                                                           | **Superseded.** You edit the copy and mark the node `override`.                                                                                                                 |
| `slot` contract tag (DL#194)                     | `contract.ts:13`                                                                                                  | **Superseded.** The whole body is editable; no need to declare which region is.                                                                                                 |
| `$parent` carrier (DL#193 Capability A)          | `context.ts:178,214,222`; `element.ts:468`                                                                        | **Independent — kept** (Q8).                                                                                                                                                    |
| `checkHeadlessInstanceProps` + validation host   | `stack-cli/lib/validate.ts`                                                                                       | **Yes, the home for the drift rule** — the validator is already the prevention-first surface (DL#145/#147/#166/#167).                                                           |
| `prettifyHtml`                                   | `compiler-shared`                                                                                                 | **Only for output** — the differ works on the parsed tree, not on strings (Q3).                                                                                                 |

**Net new surface proposed: a DOM differ, a materialiser/flattener, a re-flatten `sync`, an `@scope`
CSS wrap, and one marker (`override`).** All in `stack-cli` / the validator. **No runtime
change, no codegen change, no per-target derivation** — no-code reuses the passthrough runtime that
already ships.

### Framework support — verified

Each mechanism the model rests on was checked against the tree at `ccf62d14` (the "make sure we
support it before we build" gate):

1. **One provenance home (Q4).** `application/jay-headless` scripts already carry `contract`/`src`
   (`:687,1271`) and every `application/jay-*` script is stripped from output (`:1587`). Adding
   `template=` needs no parser change beyond reading it. `application/jay-headfull` (`:953`) becomes
   dead once coded components are headless (Q1) and no-code are passthrough instances (Q13).
2. **No-code as a passthrough instance (Q13).** `makePassthroughInstanceComponent`
   (`passthrough-component.ts:42`) synthesizes an identity component (ViewState = props, per phase). It
   is already live across dev/build/server, so no-code becomes a real instance with **no new runtime**.
3. **`jc` is compiler-injected** (`:878`) — the region boundary is derived, not authored.
4. **CSS copy + `@scope` (Q5).** `extractCss` collects component CSS into `cssParts` with a
   `/* Component: <name> */` banner (`:1257-1264`); `@scope`-wrapping it is a localized transform.
   Scope root = the `<jay:X ref>` wrapper (nesting is automatic — it is a real instance).
5. **DOM-level compare (Q3).** Source template and flattened region both parse to an HTMLElement tree
   (`parse()` → `renderNode`); the differ reuses that AST on both sides.
6. **The inline-template path is expressive enough.** `renderHeadlessInstance` compiles arbitrary
   children against the component ViewState via `renderNode` (`:1214`) and merges contract stub refs
   (`:1291`); nesting, refs and forEach already work.

## Questions and Answers

**Q1. Does a coded (`.ts`-bearing) component stop shipping UI? — ANSWERED: yes.** A coded component
is a **headless** component: contract + code, UI supplied by the usage site. Its `.jay-html`, if it
has one, is a _source template_ the usage site flattens — not a runtime artifact.
Cost, plainly: a **plugin can no longer ship UI that updates on upgrade**. Under this design it ships
a contract, code, and a template you flatten. On upgrade, `jay-stack sync` re-flattens non-overridden
regions — styling and structure _do_ flow, through an explicit reviewable command, not silently at
build time. Correct trade: a plugin bump cannot silently redesign your pages, but is one command away.

**Q2. Does materialisation flatten transitively? — ANSWERED: yes, flatten all.** The page contains
`<jay:Card>` _and_ `<jay:Button>` and both their markup. The tags remain (as boundaries); the parser
re-derives `jc`. **Validation of Card excludes Button** — the Button region validates against Button's
source, always. This keeps the diamond problem out: a change to Button's source is drift in the Button
region only, at every site, never a diff in Card's region.

**Q3. What is the differ's equivalence relation? — ANSWERED: DOM-level, one uniform rule.** Walk both
trees structurally (not stringified). Because the flattened body is copied **verbatim** from source
(page data lives in props on the tag, not rewritten into the body — Q13), a node is **drift** iff its
tag, attributes, static text, or **binding expression** differ from source. Same rule for coded and
no-code — the Round-1 coded/no-code split is gone. Nested `<jay:X>` regions are not descended into
(Q2). No stored substitution map: bodies match source, so there is nothing to project or replay.

**Q4. Where does provenance live? — ANSWERED: one `application/jay-headless` script, file only, no
hash.** Add `template=` naming the chosen source `.jay-html`; `src=` present ⇒ coded, absent ⇒
passthrough. **No content hash** — the model is "equal to source _now_ unless overridden", so there is
no merge base. Multiple templates ⇒ `template=` names the chosen one. **`application/jay-headfull` is
deprecated** — there is a single declaration for every composed component.

**Q5. Where does the component's CSS come from? — ANSWERED: copied and `@scope`-wrapped.** The
materialiser copies the component's CSS into the page (as `extractCss` routes it, `:1257-1264`) wrapped
in `@scope (<wrapper-ref-selector>) { … }` so it cannot poison page styles and the validator can
confirm it is present and unchanged except at overrides. The source `.jay-html` is **not** a build
input for anything — markup and CSS are both flattened.

**Q6. Ref collisions and page-usable refs. — ANSWERED: real-instance nesting; page refs via §7.**
`<jay:X ref="signupCard">` is a real headless instance in both cases, so refs nest under it
(`refs.signupCard.*`) automatically — no artificial wrapper handling. Contract refs go to the backing
component: a real `.ts` consumes them; a passthrough ignores them. A ref the **page's own code** wants
to use is therefore the Q12 gap in both cases, resolved uniformly by the §7 pass-through.

**Q7. Any case that genuinely needs a _new_ runtime boundary? — ANSWERED: no.** Recursion is covered
by coded components using `<recurse>` (DL#46/#47), untouched. The one boundary that exists (the
headless instance) is honest and pre-existing.

**Q8. Does DL#193 Capability A (`$parent` in `forEach`) survive? — ANSWERED: keep it, decoupled.**
Nothing here needs it, but it answers a real author question and has a working dual regular/secure
example. Costs `context.ts:178,214,222`, the `dependsOnParent` gates (`element.ts:468,488,501`) and the
grammar (~51 grep hits).

**Q9. What is materialisation, and what triggers it? — ANSWERED.** _Materialisation_ = flatten a
component's source template **and** its `@scope`-wrapped CSS transitively into the page, keeping the
`<jay:X>` tags as boundaries and recording `template=` on the `application/jay-headless` marker. The
flattened body is the component's inline template (binds its ViewState); page data is wired as props on
the tag. It is **one library function** (the materialiser: "flatten and stamp provenance"), called by
three surfaces: the **editor/design-tool** (DL#42, the primary authoring path — you place a component
in a layout), the **Designer agent-kit** (generates the flattened markup), and the **CLI via
`jay-stack sync`** — first-fill of an empty region is the degenerate, no-override case of re-flatten
(§5), so **no separate `add` command is introduced**. Choosing the component and writing the `<jay:X>`
tag + script marker (`template=`) is _scaffolding_, done by the editor or agent; `sync` fills and
re-fills it.

**Q10. Is unmarked drift an error or a warning? — ANSWERED: warning.** The page builds. The **error**
case is a `template=` that does not resolve.

**Q11. Does `/nested-composition`'s enclosing-instance-scope fix (`ccf62d14`) survive?** Headless
instances still nest (a flattened region can contain another region), so the per-enclosing-instance
prop-scoping fix may be independently correct. **Open — trace before discarding, decided in Phase 5.**

**Q12. Can a region add page-supplied bindings and page-used refs? — KNOWN GAP; direction: a
pass-through channel.** With Round 2 this gap is **uniform** across coded and no-code (both are real
instances whose body binds the component's ViewState). Precisely:

- A binding of **page** data inside a region's body has nothing to resolve against (the body is in the
  component's scope) — _unless_ the value is passed as a **prop** on the tag, which covers most cases.
- A **ref** the page's own code wants to use is created against the component's `currData` (DL#195 L2)
  and goes to the backing component (consumed by a real `.ts`, ignored by a passthrough) — never to the
  page. This is the part props cannot cover.

_Direction (deferred — Design §7): a page-declared `page-scope` subtree that compiles in **page**
scope, whose refs nest under the wrapper ref, mounted into the region's DOM via a minimal one-direction
pass-through. The Fork-C lesson (why it stays cheap): **page-declared, position-based, un-typed by
contract** — the opposite of slots and of provenance-keyed ref-forwarding. The component neither
declares nor sees it._
_**Deferred. v1 ships without pass-through and detects the gap** — a page-scoped binding or page-owned
ref inside a region (not passed as a prop, not in a `page-scope` subtree) is a **compile error**
naming `page-scope` (prevention-first: a clear diagnostic, not a silent wrong-render — DL#195
L4)._

_**Update (post-review, 2026-09-27): the ref half of Q12 is now resolved, not merely detected** — see §8
below and **[DL#198](<198 - free refs as boundary event sources.md>)** (the design of record). A free ref
(element ref in a region body not declared by the contract) is automatically exposed as a boundary **event
source** (`refs.<regionRef>.<freeRef>.<domEvent>`), carrying the region's `viewState` + accumulated
`coordinate` as event data. This reuses `createEvent`-shaped surface, is secure-mode-native, and handles the
`forEach`-in-region case §7 could not. §7's page-scope DOM injection stays deferred/possibly dropped; the
page-**binding** half is still covered by props (or a future diagnostic)._

**Q13. Does a no-code component erase to page markup, or stay a (passthrough) instance? — ANSWERED:
stay an instance.** A no-code component keeps its `<jay:X>` tag and is backed by
`makePassthroughInstanceComponent` (props → ViewState, per phase). Its flattened body is its inline
template, copied verbatim and binding the contract ViewState; page data enters as props on the tag.

_Why (over "erase to markup"): it collapses the design to **one** case — one compile path
(`renderHeadlessInstance`, `hasCodeFile` picks real vs passthrough), one differ rule (verbatim body),
one four-target derivation, and it still deletes the Tier 2 inlining (no-code stops inlining, becomes a
passthrough instance). The "equal-to-source-unless-override" invariant holds trivially because bodies
are verbatim and page data lives in props, not in the body._
_**Trade-off (the veto point):** a no-code region is no longer page-native, so page data flows through
props and a page-owned ref needs §7 (Q12) — the same as coded. "Erase to markup" would make no-code
refs/bindings free but reintroduces a second compile path and a split differ rule. Recommendation:
adopt the passthrough (uniformity), accept the uniform Q12 gap._

## Design

### 1. Component definition — unchanged in shape

```
components/card/
  card.jay-contract     # the contract (unchanged)
  card.ts               # optional. Present → real headless component; absent → passthrough
  card.jay-html         # source template(s) — authoring artifact, not a build input at usage sites
  card-compact.jay-html # a second variant is just a second file
```

### 2. Usage site — one shape for both cases

Provenance on a single `application/jay-headless` script in the head; `src=` present ⇒ coded, absent ⇒
passthrough:

```html
<!-- page head: coded -->
<script
  type="application/jay-headless"
  contract="../components/card/card.jay-contract"
  src="../components/card/card.ts"
  template="../components/card/card.jay-html"
></script>

<!-- page head: no-code (passthrough) — same tag, no src -->
<script
  type="application/jay-headless"
  contract="../components/promo/promo.jay-contract"
  template="../components/promo/promo.jay-html"
></script>
```

The usage site is identical in shape — a real instance, body = inline template, page data as props on
the tag. `jc` is **not** written by the author; the parser injects it. Nested `<jay:Counter>` is its
own flattened region.

```html
<!-- coded: card.ts produces {heading}; page data passed as the `heading` prop -->
<jay:card ref="signupCard" heading="{item.title}">
  <div class="card">
    <h3>{heading}</h3>
    <!-- component ViewState -->
    <button ref="cta">{ctaLabel}</button>
    <!-- contract ref → card.ts consumes it -->
    <jay:Counter ref="counter"> … flattened Counter region … </jay:Counter>
  </div>
</jay:card>

<!-- no-code: passthrough echoes props as ViewState; {heading} = the `heading` prop -->
<jay:promo ref="promo" heading="{item.title}">
  <div class="promo">
    <h3>{heading}</h3>
  </div>
</jay:promo>
```

The body binds the component's ViewState in both cases; page data enters as props (`heading=…`). No
inlining, no alias overlay, no `__parentContext`, no re-basing.

### 3. The differ — DOM-level, per-region, one rule

For each region (bounded by its `<jay:X>` tag): load the source template (`template=`), parse both
sides, walk them structurally. The flattened body is verbatim, so a node is **drift** iff its tag,
attributes, static text, or binding expression differ from source. The comparison is
**facet-granular** — per attribute, per inline-style declaration, and per child subtree — so every
deviation is attributable to a specific facet and an override can be scoped to exactly that facet
(§4). Nested `<jay:X>` regions are not descended into (validated against their own source). No
substitution map, no coded/no-code split.

### 4. Drift validation

A new rule in the validator (`stack-cli/lib/validate.ts`, DL#145-style pluggable). For each region,
run the §3 differ against the current source and report per deviating node:

```
warning  page.jay-html:14  <jay:card> region differs from ../components/card/card.jay-html
  · <h3> text changed        "{heading}" → "on sale"
  · <p ref="disclaimer">     removed
  Run `jay-stack sync page.jay-html#signupCard`, or mark the node override.
```

**Suppression is per-facet, not per-node.** `override` names exactly which parts of a node the
page owns; everything else in the node still reconciles against source. A named facet is neither
reported as drift nor touched by `sync` (§5) — whether the page changed, added, or removed it. Bare
whole-node suppression remains, but is the coarse option, used only when the node was rewritten
wholesale.

| Marker on a node                         | What the page owns (survives sync, not reported)           |
| ---------------------------------------- | ---------------------------------------------------------- |
| `override` or `override="*"`             | the whole node — every attribute and the subtree           |
| `override="class"` (any attribute name)  | that one attribute (added, changed, or removed)            |
| `override="style.color"`                 | one inline-style declaration; other declarations reconcile |
| `override="children"`                    | the element's child nodes (its subtree)                    |
| `override="class style.margin children"` | each listed facet; unlisted facets still reconcile         |

CSS (inside the copied `@scope` block, §5/Q5) uses a comment pragma immediately before a rule:

| Pragma before a rule                | What the page owns                                      |
| ----------------------------------- | ------------------------------------------------------- |
| `/* jay:override */`                | that whole rule — selector and all declarations         |
| `/* jay:override: color, margin */` | only those declarations in the rule; the rest reconcile |

```html
<!-- only the class is page-owned; text, other attributes and subtree still reconcile -->
<div class="card featured" override="class">
  <!-- keep our color; margin and everything else sync from source -->
  <h3 style="color:#b00; margin:0" override="style.color">{heading}</h3>
  <!-- we rewrote the body; this element's own attributes still reconcile -->
  <div class="card-body" override="children">…page content…</div>
</div>
```

```css
@scope (.signupCard) {
  /* jay:override */
  .card {
    border: 2px solid gold;
  } /* whole rule is page-owned */

  /* jay:override: color */
  .card h3 {
    color: #b00;
    font: inherit;
  } /* only color survives; font syncs */
}
```

A `children` override marks the subtree page-owned; any nested `<jay:X>` region inside it is still its
own region and validates against its own source (Q2).

### 5. Sync — re-flatten, not merge

`jay-stack sync [<target>] [--all]`:

- Re-flatten the region(s) from the **current** source template. An **empty** region (a bare `<jay:X>`
  - `template=`) is the degenerate case — no override facets to preserve — so `sync` is also the
    first-fill / materialisation command (Q9); there is no separate `add`.
- Keep every `override` **facet** verbatim (a whole node, one attribute, one style declaration, a
  subtree, or a CSS rule/declaration); re-flatten everything else. Facet matching rides on the same
  node matching the differ already performs (§3).
- No merge base, no hash, no conflict resolution — a region is by definition equal to its source
  except at `override` facets, so sync is deterministic overwrite-with-holes.
- `--all` applies across every site of a component in one run: they are all identical to source, so one
  command updates them all; the only per-site variation is the override facets, preserved.

No ambiguous auto-merge can silently produce wrong markup — sync never _combines_ two edited versions,
it replaces the non-overridden part outright.

### 6. What is removed

In dependency order (Phase 4). "Surgery" rows are branches _inside_ surviving functions.

| Removed                                                                                                                                                       | Kind    | Source DL        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------- |
| `jay-html-overrides.ts` in full — both `<override>` forms, pragma, markers                                                                                    | file    | #181, #193, #194 |
| `slot` contract tag, slot validation, slot fill paths                                                                                                         | file+   | #194             |
| Fork C: `foreignChild`, `childComp`'s `slots` param, slot ref managers + two traps, `slotPreambles`                                                           | mixed   | #194             |
| Fork-C slot block **and** the `structural` branch inside `renderHeadlessInstance` (`:1106,:1254-1288`) and its hydrate/server twins — collapse to one path    | surgery | #194             |
| Tier 2 **inlining**: `renderInlinedStructuralInstance` + server/hydrate twins, `aliases`/`inlinedRoot`/`withRootVarName` on `Variables`, `buildInlineAliases` | mixed   | #194             |
| Ref forwarding: `getForwardedInnerRef`, `hasForwardedInnerRef`, collection trap, `childComp`'s `refViewState`, `emittedForwardedRefHelpers`                   | mixed   | #193             |
| `__parentContext` / `withSyntheticParentContext` / `PARENT_CONTEXT_PROP`                                                                                      | mixed   | #193             |
| `withParentShift` / `PARENT_SCOPE_PRAGMA` / `lexicallyInScope` / `asLexical`                                                                                  | mixed   | #193             |
| `application/jay-headfull` declaration + its parser paths (`:953,1033,1085,1288,1411,1921,2080`); compile-time headfull template injection                    | mixed   | #111, #187       |
| Tier 2 restrictions: recursion guard, root-`$parent` guard, `forEachInsidePureComponentError`                                                                 | mixed   | #194             |

**Retained** (unchanged): DL#189, #190, #192, the class-names utility, the headless props channel
(V4), `<recurse>` (DL#46/#47), Capability A (Q8), and — now load-bearing —
**`passthrough-component.ts`** (the no-code runtime, Q13) with whatever `structural-coercions.ts` prop
coercion the passthrough needs. The `structural` flag shrinks from a compile fork to a single bit:
"back this instance with a passthrough vs. an imported component".

**One survivor is conditional on §7.** Fork C's DOM-passthrough _anchor_ (`element.ts:100`
`foreignChild`) is the single primitive the pass-through (Q12 / §7) reuses. If §7 ships, a slimmed,
page-declared version survives; otherwise it is deleted with the rest of Fork C. Either way the parts
that made Fork C expensive — the `slot` vocabulary, two-form `<override>`, provenance-keyed ref traps,
`slotPreambles`, the name-keyed `slots` channel — are removed unconditionally.

### 7. Pass-through — the escape hatch (deferred, uniform across coded and no-code)

The gap (Q12): a region's body binds the component's ViewState, so it cannot host page-supplied
_refs_ (page data is covered by props). The direction, kept minimal by inverting each choice that made
Fork C costly:

| Dimension     | Fork C (retired)                                 | Pass-through (§7)                                         |
| ------------- | ------------------------------------------------ | --------------------------------------------------------- |
| Who declares  | the **component contract** (`slot` tag)          | the **page** (`page-scope` on a subtree)                  |
| Addressing    | named slots + provenance markers                 | position (the marker's place in the body)                 |
| Binding scope | mixed, decided by a ref-scope rule table (L6)    | always **page** scope — no table                          |
| Refs          | provenance-keyed forwarding + two Proxy traps    | ordinary page refs, nested under the wrapper (`nestRefs`) |
| Direction     | two-way (data in, refs out) across a live chain  | one-way DOM mount into the region at an anchor            |
| Runtime       | `slots` channel + `foreignChild` + slot managers | `foreignChild` anchor only                                |

Sketch:

```html
<jay:card ref="signupCard" heading="{item.title}">
  <div class="card">
    <h3>{heading}</h3>
    <!-- component ViewState -->
    <div page-scope>
      <span>{promoCode}</span>
      <!-- page ViewState -->
      <button ref="claim">Claim</button>
      <!-- page ref: refs.signupCard.claim, wired by page code -->
    </div>
  </div>
</jay:card>
```

The `page-scope` subtree compiles in the page render (page `currData`, page ref manager) and is
mounted into the region's DOM at its position via the retained `foreignChild` anchor. The component
does not declare or see it. Applies identically to coded and passthrough-backed regions.

**Constraints (from DL#195), before it is built:**

- **V2 — cross-target fixtures.** A runtime crossing, so element/hydrate/server/main-sandbox each get a
  `toEqual` fixture; DL#194 defects 3/5/10 were target drift on this path.
- **V5 — compile-time failure.** Page-declared, so the validator checks it: a page binding/ref outside a
  `page-scope` subtree (and not a prop) is a compile error; a `page-scope` subtree binding
  _component_ data is a compile error. No runtime scope guessing.
- **V3 — stable coordinates.** The anchor participates in `assign-coordinates.ts` / DL#126's flat map.

This is intentionally the _only_ place the retired boundary-crossing survives, reduced to its
irreducible core and made explicit and checkable rather than implicit and silent.

> **Superseded for the ref case by §8 (post-review, 2026-09-27).** The ref half of Q12 is resolved by
> exposing free refs as boundary **event sources**, not by injecting page-owned DOM into a region. §7's
> DOM-injection ambition has no current use case and stays deferred/possibly dropped. Read §8.

### 8. Free refs as boundary event sources — chosen Q12 resolution (moved to DL#198)

_Decided post-review with yoav, 2026-09-27._ The ref half of Q12 is resolved by exposing an un-contracted
region-body ref (a "free ref") as an automatic, typed **event source** on the region boundary —
`refs.<regionRef>.<freeRef>.<domEvent>` — carrying the region's `viewState` and an accumulated `coordinate`
path. It reuses `createEvent`-shaped surface, is secure-mode-native, and handles the forEach-in-region case
§7 could not. §7's page-scope DOM injection stays deferred/possibly dropped.

**This grew into its own feature with its own implementation plan — see [DL#198 — Free refs as boundary
event sources](<198 - free refs as boundary event sources.md>).** DL#198 is the design of record; it
carries the grounding, the two settled decisions (composed-array coordinate; `makeHeadlessInstanceComponent`

- passthrough-forward attach point), the nested-region deferral, and Phases A–E.

## Implementation Plan

**Phase 1 — the DOM differ (de-risk first, delete nothing).** Build the structural + expression diff
and `override` suppression as a standalone `stack-cli` library, unit-tested against **fixture
triples** (source template, flattened region, expected diagnostics) — the differ's own oracle.

_Acceptance for Phase 1 — the diff must be **facet-addressable**, not node-granular._ Sync (§5) is
built on the same output, so a diff entry must name the exact facet, not merely "node changed":

- **attribute** — element + attribute name (present / added / removed / value-or-binding changed);
- **inline-style declaration** — element + style property (within the `style` attribute);
- **child subtree** — element whose child-node list differs;
- **CSS** — selector for a rule, and property for a declaration within a rule.

Each entry must round-trip to the `override` facet spec that suppresses it (`override="class"`,
`="style.color"`, `="children"`; `/* jay:override */`, `/* jay:override: <prop> */`) and to the sync
operation that preserves it — so suppression, reporting, and sync all consume one addressing scheme.
A node-level "changed / unchanged" verdict is **not** sufficient and fails this phase.

_Separately_, the existing Tier 2 usage sites are the **compile** oracle for criteria 1–2 (a flattened
no-code region must compile to the same output the passthrough path produces); do not conflate them.
Nothing else starts until both are green.

**Phase 2 — provenance + materialiser.** Read `template=` on the `application/jay-headless` tag (parser
support present, `:687,1271`; verify the read path). Implement transitive flatten (parser injects `jc`)
and `@scope` CSS copy (Q5) as **one library function** (the materialiser); the editor (DL#42) and
agent-kit call it directly, and the CLI reaches it through `jay-stack sync` (Phase 3) — first-fill is
the no-override case, so no separate `add` command (Q9). Wire the validation rule into
`stack-cli/lib/validate.ts`, surfaced through
`stack-cli/lib/run-validate.ts:36` `surfaceValidationIssues` — reuse DL#189's shape and its Rollup
dead-code gotcha (return a boolean; `process.exit(1)` stays at `run-production.ts:73-78`). Bare tag with
no body is a hard error (`jay-html-compiler.ts:1170`).

**Phase 3 — sync (re-flatten).** Per-site and `--all`. Deterministic overwrite-with-`override`-holes
(§5), and first-fill of an empty region (the materialiser's CLI surface — no separate `add`, Q9). No
three-way merge. Exact CLI messages tested by string equality (per CLAUDE.md).

**Phase 4 — deletion.** In table order, each a labelled commit so the diff documents the model. The
surgery collapses `renderHeadlessInstance` (and its hydrate/server twins) to the single inline-template
path shared by real and passthrough components; do it under full `toEqual` fixtures on
element/hydrate/server. As the crossing machinery goes, add the **Q12 gap diagnostic** in its place
(page-scoped binding/ref inside a region → compile error naming `page-scope`) so the capability is
_refused clearly_, not silently mis-compiled. Run `yarn confirm` between groups (803 compiler / 291
runtime / 741 dev-server / 66 smoke tests).

**Phase 5 — examples and smoke migration.** `/combined`, `/foreach-composite`, `/nested-composition`,
`examples/jay/override-ref-forwarding`, `examples/jay/ref-forwarding` rewrite to flattened copies.
`/nested-composition` resolves Q11: nested regions or a single region; its `it.fails` SSR assertion
should pass or the page cease to exist.

**Phase 6 — agent-kit.** Designer guide: how to materialise, what drift warnings mean, when to mark
`override` vs `sync`. Plugin guide: your component ships a contract, code (optional), and a
template — not a running UI (Q1); upgrades flow through `sync`.

Per CLAUDE.md: fixtures first, full `toEqual`, never `toContain` on code.

## Examples

**✅ Materialise, then edit freely** — no `<override>` vocabulary, each edited facet marked:

```html
<jay:card ref="promo" heading="{item.title}">
  <div class="card featured" override="class">
    <!-- class is page-owned; the rest of this div still reconciles -->
    <h3 override="children">Half price this week</h3>
    <!-- text rewritten -->
    <div class="card-body"><jay:Counter ref="cta"> … </jay:Counter></div>
  </div>
</jay:card>
```

**✅ The old `remove`** — delete the child and mark the parent `override="children"`, or sync
restores it.

**✅ The old attribute/style merge** — edit the attribute or style declaration in your copy; mark that
facet (`override="href"`, `override="style.color"`), leaving siblings to reconcile.

**❌ Provenance that does not resolve** — hard error, not a warning (Q10):

```html
<script type="application/jay-headless" template="../components/gone/gone.jay-html"></script>
<!-- error: template= does not resolve -->
```

## Trade-offs

| Approach                                                             | Pro                                                                                                                                                                                                                                                                                                                                              | Con                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flatten + validate + re-flatten sync, one instance path (chosen)** | Removes the seam and everything downstream (DL#195 root cause); **one** compile path, **one** differ rule, one four-target derivation; sync is deterministic overwrite-with-holes (no silent mis-merge); no-code reuses the existing passthrough runtime, so no new runtime; concept count collapses to "headless instances you own the body of" | The DOM differ + flattener are real work; copies duplicate source; page files grow; page-owned refs need §7 (Q12); plugin UI upgrades flow through `sync`, not automatically (Q1) |
| No-code erases to page markup (Round 1)                              | No-code refs/bindings are page-native and free                                                                                                                                                                                                                                                                                                   | A second compile path and a **split differ rule**; two four-target derivations. Rejected for uniformity (Q13).                                                                    |
| Reference-based composition (#181/#187/#193/#194, being retired)     | Single source of truth; no duplication                                                                                                                                                                                                                                                                                                           | The entire crossing apparatus; ten silent-render defects; four-target re-derivation; a ref-scope rule table                                                                       |
| Three-way merge sync (Round 1 draft)                                 | Handles copies that diverge arbitrarily                                                                                                                                                                                                                                                                                                          | A structural 3-way merge can mis-merge silently — DL#195's wrong-pixel class in the tool. Rejected for equal-unless-override.                                                     |
| Materialise but keep `<override>` for small edits                    | Familiar                                                                                                                                                                                                                                                                                                                                         | Two ways to express one edit, and `<override>` is exactly what needs the crossing machinery. Rejected.                                                                            |

**Note on DL#181's rejection of this approach.** Its trade-off table dismissed "materialized/copied
instance with drift reconciliation" as "a 3-way-merge-shaped reconciliation problem and file
duplication for no corresponding benefit." Two things changed: the benefit is measurable (~4,900 lines
of `lib/` and ten defects, DL#195), and the reconciliation is **not** 3-way — it is
equal-to-source-unless-override, with no merge base and no ambiguous resolution.

## Verification Criteria

1. A materialised no-code region compiles through the **headless-instance path backed by
   `makePassthroughInstanceComponent`**: body binds ViewState, page data arrives as props, generated
   output contains **no** `__parentContext`, no `(vs,_p1)=>_p1`, no alias overlay,
   no `renderInlinedStructuralInstance` — asserted by full `toEqual` fixtures on element, hydrate and
   server targets.
2. A materialised coded region compiles through the same path with **byte-identical** output to an
   equivalent hand-written inline template — proving no new codegen, and that coded/no-code differ only
   by the backing component.
3. An unedited copy validates clean. An edited node (structural or binding-expression) produces a
   warning naming the node, the **facet**, and the change, and the page still builds.
4. `jay-stack sync` re-flattens from current source, preserves `override` **facets**, overwrites
   the rest — no merge base, no conflict prompt. A synced region validates clean.
5. `sync --all` updates N sites of one component in one run; sites with `override` facets keep them.
   5b. Facet-scoped suppression is exact: `override="class"` (attribute), `="style.color"` (one
   inline-style declaration), `="children"` (subtree), and the CSS `/* jay:override */` /
   `/* jay:override: <prop> */` pragmas each suppress **only** the named facet; an unlisted sibling
   change in the same node/rule still warns; `sync` preserves the named facet and re-flattens the rest.
6. A `template=` that does not resolve is a hard error; a bare `<jay:X>` with no flattened body is a
   hard error (contrast criterion 3).
7. Component CSS is copied and `@scope`-wrapped so it does not alter page selectors; the validator flags
   CSS drift; the source `.jay-html` is **not** read at page build time.
8. Every mechanism in "What is removed" is absent from `lib/` (including `application/jay-headfull` and
   Tier 2 inlining), and `yarn confirm` exits 0 — including the dev-server hydration suite.
9. The DL#195 orthogonal set (DL#189/#190/#192, class-names) and `passthrough-component.ts` are
   behaviourally unchanged: their tests pass without modification.
10. The differ has no runtime and no codegen dependency — exercised entirely by `stack-cli` unit tests
    plus the validation path.
11. In v1 (no §7), a page-scoped binding/ref inside a region (not a prop, not in `page-scope`) is a
    **compile error** naming `page-scope` — not a silent wrong-render (Q12), uniform across coded
    and no-code.

---

**Predecessors:** DL#195 (retrospective), DL#181, #187, #193, #194.
**Resolved blockers:** Q1 (coded → headless) — yes. Q13 (no-code → passthrough instance) — yes.
**Open:** Q11 (traced in Phase 5); Q12 (page-owned refs — v1 detects-and-errors, §7 deferred).

---

## Implementation Results

### Phase 1 — differ (complete)

Built as a standalone compiler package `@jay-framework/compiler-inline-composition`
(`packages/compiler/compiler-inline-composition`), dependency-light: `node-html-parser` (the same tree
the compiler walks) for markup and `postcss` for CSS. No runtime, no codegen dependency — exercised
entirely by unit tests, matching verification criterion 10 and the "unit-test the logic before wiring to
stack-cli" acceptance item.

**Modules (`lib/`):**

- `facet.ts` — the single addressing scheme. `Facet` union
  (`attribute` | `style-declaration` | `children` | `css-rule` | `css-declaration`), `NodePath`,
  `DiffEntry`, `facetKey` (stable id), `facetLabel` (human-readable), and `overrideSpecFor` — which
  round-trips any facet back to the `override` marker (or CSS pragma) that would suppress exactly it.
- `override.ts` — `META_ATTRS = ['jc','override','page-scope']` (compiler-injected / directive, never
  drift), `parseOverride` (bare/`*` → whole node; `children` → subtree; `style.<prop>` / `<attr>`
  tokens → named facets), `isPageScope`, `isRegionTag`.
- `normalize.ts` — binding/whitespace normalization so formatting-only differences are never drift.
- `style.ts` — inline-style parser that respects `()` and `{...}` depth (no false splits on `:`/`;`
  inside `url()` or a binding).
- `diff-markup.ts` — `diffMarkup(source, region)` / `diffBodies(parent, parent)`. Facet-granular:
  a diverged child sequence emits one `children` facet on the parent and does **not** descend; an
  aligned sequence descends and compares attributes + style declarations per matched element; nested
  `<jay:X>` regions are never descended into (Q2); `page-scope` subtrees are excluded (§7); `override`
  markers suppress exactly their named facet.
- `diff-css.ts` — `diffCss(source, region)`. Selector-keyed, facet-granular at rule and declaration
  level. Parses with **postcss** — the same parser the `design-system-validator` cascade resolver uses
  (`css-cascade.ts`), so this package reuses a vetted, in-tree CSS parser rather than depending on that
  plugin (or adding css-tree). `@scope` wrappers are transparent (a wrapped region aligns with unwrapped
  source); other at-rule context (`@media`, `@supports`) is folded into the reported selector so like
  compares with like and facet keys stay unique. The `/* jay:override */` and `/* jay:override: <prop> */`
  pragmas (before or inside a rule) own the whole rule / one declaration respectively. v1 limitation:
  a whole-rule _removal_ is reported but not independently ownable (there is no region rule to carry a
  pragma) — the page keeps such a rule by re-adding it, or owns it at sync.

**Tests:** 50/50 passing across 5 files (`diff-markup` 16, `diff-css` 14, `override` 8, `facet` 7,
`style` 5). Fixture strings serve as the differ's own oracle; full `toEqual` comparisons (no `toContain`).
`yarn confirm` in-package: clean build, type-check, and tests green; repo `yarn format` clean.

**Deviations from design:** none. Facet-scoped suppression, bare `override` directive, and the removal
of the invented `jay-stack add` (folded into `sync`) are all reflected above and in §3–§5.

**Not yet wired:** the differ is not connected to `stack-cli/lib/validate.ts` — that is Phase 2, which
loads regions via the existing `parseJayFile` and feeds `diffBodies`.

### Phase 2/3 — materialiser engine (complete); wiring blocked on a parser gap

The **materialiser** — the single source-to-source engine behind first-fill and sync (§5) — is built
and unit-tested in the same package (`lib/materialise.ts`, 13 tests; package total 63/63 green):

- `materialise(pageHtml, opts) → { html, css, errors }` flattens every resolvable `<jay:X>` region
  transitively, wraps each component's CSS in `@scope (.<ref>)` (Q5), detects template-inclusion cycles,
  and hard-errors on an unresolvable `template=` (criterion 6). Dependency-light and pure: template
  loading, the contract→template map, the scope selector, and the prettifier are all injected, so the
  editor (DL#42), agent-kit, and the CLI share one engine.
- `preserveOverrides: true` is the sync path: `mergeOverrides(templateBody, existingBody)` re-flattens
  from source but carries every `override` facet the page owns — attribute, `style.<prop>`, `children`,
  and whole-node — re-attaching the markers so holes persist across future syncs. Node matching rides on
  the differ's content-child **alignment**; unmarked structural divergence re-flattens (template wins),
  matching §5's "deterministic overwrite-with-holes, no merge base."

**Correction to Phase 2's parser-state assumption (verified against source).** Phase 2 above says "Read
`template=` on the `application/jay-headless` tag (parser support present, `:687,1271`; verify the read
path)." Verified — that citation is wrong and `template=` is not read anywhere. The accurate map of the
current parser (`jay-html-parser.ts`):

- **Headless is plugin-only, logic-only.** `parseHeadlessImports` (`:640`) requires `plugin=` (`:663`)
  and `contract=` (`:668`), resolves via `importResolver.resolvePluginComponent` (`:693`), reads **no**
  `src` and **no** `template`. (`:687` is only a YAML-parse error string mentioning `contract=`.)
- **Local components go through `application/jay-headfull`, not headless.** With a `contract=` attribute
  they route to `parseHeadfullFSImports` (`:1092`), resolved by file path (`readJayHtml`/`resolveLink`),
  and this is the path that **inlines** the component body into the page: `injectComposableTemplateIntoTag`
  (`:865`) / `injectHeadfullFSTemplates(Recursive)` (`:947`,`:972`), Tier 2 vs Tier 3 by `hasCodeFile`
  (`:1345`). The element/hydrate/server inlining consumers are `renderInlinedStructuralInstance`
  (`jay-html-compiler.ts:1006`) + its hydrate (`…-hydrate.ts:687`) / server mirrors,
  `structural-coercions.ts`, and `Variables.forInlinedComponent`.
- So §2's single plugin-less `application/jay-headless` carrying file-path `contract=` + optional `src=`
  - `template=` is a **target shape, not the current one.**

**Approved direction (design owner, 2026-09-23).** Resolve the gap by the Phase-4 collapse rather than by
adding a parallel path: post-DL the parser **stops inlining components** and imports only (a) component
**logic** — from a plugin **or** the local components folder — and (b) **templates** from the components
folder. Local components unify onto logic-only `application/jay-headless` (gaining a local file-path
branch alongside the plugin branch; `src=` present ⇒ coded, absent ⇒ passthrough; `template=` names the
source to flatten). `application/jay-headfull`'s template-**inlining** apparatus
(`injectComposableTemplateIntoTag`, `injectHeadfullFSTemplates*`, `renderInlinedStructuralInstance` +
mirrors, `structural-coercions`, `forInlinedComponent`) is removed — flattening is now the materialiser's
job at build/sync time, and the page already contains the flattened body at compile time.

**Consequence for sequencing.** The engine (differ + materialiser) is complete in isolation. Wiring
`validate` + `sync` and reaching Phase 5 SSR now folds the parser change forward: extend headless to the
local file-path/passthrough branch + `template=` provenance, and delete the inlining apparatus, under the
Phase-4 acceptance (labelled commits, full `toEqual` on element/hydrate/server, `yarn confirm`).

**The collapse is mostly subtraction — the passthrough already exists at load time.** Tracing the real
runtime path (per CLAUDE.md): `load-page-parts.ts:176-185` (and the production twins
`production-{build,server}/lib/builder/load-production-parts.ts`) already synthesize
`makePassthroughInstanceComponent(contract.tags)` for any `headlessImport` flagged `structural` (no
`.ts`), keyed off `codeLink`/`contract`. So a no-code region does **not** need a new runtime — criterion
1's backing already ships. The collapse is therefore:

1. **Parser (add):** a local, plugin-less headless branch in `parseHeadlessImports` — file-path
   `contract=` via `importResolver.loadContract` (reusing `parseHeadfullFSImports`'s resolution,
   `:1202-1248`), `src=` present ⇒ coded `codeLink` via `resolveLink`, absent ⇒ `structural: true`
   (loader supplies the passthrough). `template=` recorded on the import for validate/sync; the region
   **body is already inline in the page**, so compile needs no template read.
2. **Compiler (remove, ×3 targets):** delete the `if (headlessImport.structural) return
renderInlinedStructuralInstance(...)` branch (`jay-html-compiler.ts:1106`, + hydrate/server mirrors)
   so **every** headless instance — coded or passthrough-backed — compiles through the one real-instance
   path. No-code and coded then differ only by the backing component (criteria 1–2).
3. **Parser + codegen (delete):** the inlining apparatus —
   `injectComposableTemplateIntoTag`/`injectHeadfullFSTemplates*` (`jay-html-parser.ts:865,947,972`),
   `parseHeadfullFSImports`' injection loop, `renderInlinedStructuralInstance` +
   hydrate/server mirrors, `structural-coercions.ts`, and `Variables.forInlinedComponent`.

This keeps the null-hypothesis discipline (§Prior Art): no new runtime, no new codegen — the design is a
net removal plus one additive parser branch.

### Phase 4a — parser local-headless branch (landed, additive)

`parseHeadlessImports` (`jay-html-parser.ts`) now resolves a `<script type="application/jay-headless">`
**without** `plugin=` as a local component: file-path `contract=` via `importResolver.loadContract`;
`src=` present ⇒ coded (resolve the single exported `JayComponentType` via `resolveLink` +
`analyzeExportedTypes`, error on 0 or >1); `src=` absent ⇒ `structural: true`; `template=` recorded on
the import (`JayHeadlessImports.template`) for validate/sync. `options: ResolveTsConfigOptions` is threaded
into `parseHeadlessImports` (+ both call sites). The plugin branch is unchanged. Type-check clean;
`parse-jay-file.unit.test.ts` 78/78 green. **This is additive only** — no deletion, no compiler change
yet, so the tree stays green.

**Scope reckoning (inventory).** A full sweep found the removal's real blast radius is much larger than
"manageable": 12 contract-bearing-headfull compiler fixtures (~26 generated snapshots) + 4 error
fixtures; 8 test files across compiler / stack-cli / dev-server / runtime; 14 dev-server fixture dirs
(`8a`–`8n`); 5 smoke pages + ~12 components + 4 `examples/jay` apps (lib + lib-secure); 8 external source
files (dev-server, production-build ×2, production-server, stack-server-build, stack-cli) plus the runtime
half (`resolve-instance-props.ts` `coerceInstancePropValue`, `passthrough-component.ts`). Two entanglements
change the plan: (a) the inlining removal reaches the **dev-server / production-build pre-render pipeline**
(`injectHeadfullFSTemplates` is called there — that pre-render step exists _because_ components were
inlined at build; post-DL the body is already materialised into the page, so the step is removed, not just
the codegen); (b) the no-code client path needs a **client passthrough constructor** that does not exist
(server has `makePassthroughInstanceComponent`; the client twin is a small **new runtime primitive**,
contradicting this DL's "no new runtime"). Because of the size + the DL-contradicting primitive, the
remaining collapse is being staged as reviewable, always-green increments rather than one push.

**Decisions (2026-09-23):** (1) add the client passthrough primitive and record the deviation here
(chosen over forbidding no-code on the client); (2) land the collapse as always-green increments,
each ending on a passing build/tests.

### Phase 4b — client passthrough primitive (landed, additive) — DL deviation

**Deviation from §Prior Art ("no new runtime").** The server had `makePassthroughInstanceComponent`
(load-time synthesis) so no-code regions render transparently server-side. The client/hydrate target
imports each instance's logic and calls `makeHeadlessInstanceComponent(render, logic, coord)` — there
was **no** passthrough path, so a no-code (structural) region had no way to compile as a real instance
on the client. The "no new runtime" claim did not hold for the client target.

**Resolution (minimal).** Added `makePassthroughHeadlessInstanceComponent(preRender, coordinateKey)`
in `stack-client-runtime/lib/headless-instance-context.ts` (auto-exported via `lib/index.ts`'s `*`).
It is a thin wrapper over the existing `makeHeadlessInstanceComponent`: an identity `comp`
(`render: () => ({})`, so the merged render output is exactly the fast ViewState resolved from the
`HEADLESS_INSTANCES` context by coordinate) plus `clientDefaults: (props) => ({ viewState: props })`
echoing props when no server data is present — mirroring the server passthrough's per-phase echo. All
coordinate lookup, suffix fallback, and hydration gating are inherited unchanged. No new context, no
new codegen contract; type-check clean, existing tests green. Codegen for a no-code region on the
client/hydrate target will call this instead of `makeHeadlessInstanceComponent` (no logic import).

**Settled design details (design owner, 2026-09-23) that scope the blast radius.**

1. **`application/jay-headfull` is kept for regular (client-only) jay, forbidden in jay-stack.** Regular
   headfull — `application/jay-headfull` **without** `contract=`, resolved by `parseHeadfullImports` with
   `names=`, rendered as a real nested component (`renderNestedComponent`) — is a `makeJayComponent`
   (template+logic) construct and is **untouched**. What is removed is the **contract-bearing** headfull
   path (`parseHeadfullFSImports`) — this is the jay-stack Tier 2/3 **inlining** path, and it is exactly
   what the new model replaces. So: a `<script type="application/jay-headfull" contract="…">` is now a
   **validation error** directing the author to `application/jay-headless`. The `contract=` attribute
   already discriminates the two, so no new stack-vs-regular flag is needed. This keeps the deletion's
   blast radius to the jay-stack composition path only.
2. **jay-stack local components use plugin-less `application/jay-headless`, no `names=`.** `src=` present ⇒
   coded: the parser resolves the single exported Jay(Stack) component from `src=` (via `resolveLink` +
   `analyzeExportedTypes`; 0 or >1 exported component ⇒ error) and builds the instance **inline** —
   the inline page body is compiled to the render function and bound to the imported logic (the same
   `renderHeadlessInstance` real-instance path coded plugin headless already uses). `makeJayStackComponent`
   separates template from logic, so no `makeJayComponent` const and no `names=` is authored. `src=`
   absent ⇒ `structural: true` (loader supplies the passthrough).
3. **Every component region requires a `ref`; the framework generates one when absent** (reusing today's
   ref-generation) so the materialiser's `@scope (.<ref>)` always has an anchor — the "emit unscoped"
   fallback in the current engine is replaced. Component CSS is therefore always `@scope`-isolated
   (criterion 7).

### Phase 4c — first concept-A codegen path proven (Increment 2, green)

The strangler-fig split (temporary `legacyInlined?: boolean` on `JayHeadlessImports`, set only by
`parseHeadfullFSImports`) is in on all three targets. A no-code (structural, **non**-legacy) region now
compiles through the DL#196 model — flattened body → inline render fn → `childComp` mount — while
concept-B (`legacyInlined`) still inlines unchanged.

Proof fixture: `contracts/page-with-structural-badge` migrated from `application/jay-headfull` to
plugin-less `application/jay-headless` (`contract=` + `template=`, no `src=` ⇒ `structural`). Generated
output across targets:

- **element:** `const _HeadlessBadge0 = makePassthroughHeadlessInstanceComponent(_headlessBadge0Render, 'S0/0/badge:AR0');`
  then `childComp(_HeadlessBadge0, propsGetter, refAr0())`. Static props coerced to declared types
  (enum→member, number/boolean→literal). Region now surfaces a ref (`ar0: BadgeRefs`) where the old
  inlined model exposed none.
- **hydrate:** same const via `makePassthroughHeadlessInstanceComponent`, mounted with `childCompHydrate`.
- **server:** the existing concept-A coercion branch (reads `vs.__headlessInstances['S0/0/badge:AR0']`,
  casts `as BadgeViewState`) — no early-return inlining.

**Codegen fixes required to reach green (all three targets had DL#194-era import filters that assumed
structural ⇒ inlined):**

- **hydrate `generateElementHydrateFile`** — the Phase-B drop of structural contract `…Refs` /
  ViewState imports was gated to `legacyInlined`; concept-A keeps `…Refs` + `InteractiveViewState`
  (referenced by the `childComp` ref type) and drops only the unused bare `…ViewState`.
- **hydrate ref block** — was gated to `legacyInlined` for the early-return; the passthrough const +
  `Import.makePassthroughHeadlessInstanceComponent` path is additive for concept-A.
- **server `generateServerElementFile`** — the `usedTypeNames` skip of the structural rootType
  ViewState was gated to `legacyInlined`; concept-A keeps `…ViewState` (the coercion cast imports it).
- **parser** — the local (plugin-less) branch stores `contractName = paramCase(loadedContract.name)`
  (the `<jay:tag>` name) rather than the `contract=` file path, so `resolveHeadlessImport` matches.
  (`change-case` in this workspace exports `paramCase`, not `kebabCase`.)

Result: `compiler-jay-html` 807 pass / 4 skip; workspace `build:check-types` clean (generated fixtures
type-check as real TS). Remaining concept-B fixtures still migrate family-by-family before the legacy
path (`parseHeadfullFSImports`, `renderInlinedStructuralInstance` + mirrors, `structural-coercions`,
`legacyInlined`) is deleted.

### Phase 4d — forwarded-ref / override family removed (Increment, green)

Per §6 ("`<override>`, `slot`, ref forwarding, `__parentContext` are all deleted") and the design-owner
decision (2026-09-23) that the DL#193/#194 ref-forwarding & override-injection patterns do not survive
the collapse, these six concept-B fixtures were **deleted** (design owner chose deletion over
converting each to an error fixture — the eventual parser deletion of `parseHeadfullFSImports` removes
the code paths that would raise such errors anyway):

- `page-with-forwarded-ref`, `page-with-forwarded-ref-foreach`, `page-with-forwarded-ref-multi`
- `page-with-override-forwarded-ref`, `page-with-override-parent-binding`, `page-override-no-ref`

Removed their `it(...)` blocks across `generate-element` (trusted + main-sandbox), `generate-element-
hydrate`, and `generate-server-element` tests, plus the now-orphaned `overrideRequiresExplicitRefError`
import in the element test (the helper itself stays — still referenced by `parseHeadfullFSImports` until
the legacy path is deleted).

Still on the legacy (`legacyInlined`) path, retained until their own increments: the Tier-2 validation
fixtures (`page-with-foreach-in-pure-composite`, `page-tier2-recursion`, `page-tier2-root-parent`) and
the Tier-3 slot fixtures (`page-with-tier3-slot`, `page-with-tier3-slot-foreach`).

Result: `compiler-jay-html` 787 pass / 4 skip; workspace `build:check-types` clean.

### Phase 4e — Tier-2 validation fixtures removed; recursion moves to `validate` (Increment, green)

Design-owner decisions (2026-09-23) on the DL#194 Tier-2 validation family, all of which existed only
because of Tier-2 _inlining_ constraints the passthrough model removes:

- **`page-with-foreach-in-pure-composite` + `page-tier2-root-parent` — deleted.** With a no-code region
  backed by the passthrough (its ViewState = props), there is no inlining scope to constrain: neither a
  `forEach` inside the region nor a root-level `$parent` is a special compile-time case anymore.
  Removed both fixtures and their `it(...)` blocks (element trusted + hydrate for the forEach case,
  element for the root-parent case), plus the now-orphaned `forEachInsidePureComponentError` /
  `rootParentInInlinedCompositeError` imports in the tests. **The helper functions stay in `lib`** —
  still referenced by `parseHeadfullFSImports` / the inlining path until the legacy path is deleted.
- **`page-tier2-recursion` — recursion detection moves to `jay-stack validate`.** A `<jay:X>` self-cycle
  is a cycle in the _flatten_ graph, not the (now-deleted) compile-time inline-expansion graph, so it is
  no longer a parser concern. Removed the parse-time test (`readAndParseJayFile` +
  `headfullRecursionError`) from `compiler-jay-html`. **Debt owed by the validate engine (Phase 2):**
  region/flatten-graph validation must detect a materialised region whose source transitively contains
  its own `<jay:X>` and report it (the un-materialised `<jay:X>` degenerate case is already a hard error
  in `renderHeadlessInstance`). `headfullRecursionError` stays in `lib` until then.

Result: `compiler-jay-html` 783 pass / 4 skip; workspace `build:check-types` clean.

**Remaining concept-B fixtures:** only the Tier-3 slot family (`page-with-tier3-slot`,
`page-with-tier3-slot-foreach`). Decision (2026-09-23): **migrate to `src=` coded regions** — the parser
local branch already resolves `src=` to a single exported component (`jay-html-parser.ts:758-771`). This
is the last migration before `parseHeadfullFSImports` + the inlining path + `legacyInlined` can be
deleted; because `slot` vocabulary is removed (§6), the migration re-authors slot content inline in the
region body rather than via `<override slot>`.

### Phase 4f — Tier-3 slot family migrated to coded `src=` regions (Increment, green)

Both Tier-3 fixtures re-authored (2026-09-23) as DL#196 coded regions; this retires the last concept-B
fixture family. No new framework code — the parser local `src=` branch and `makeHeadlessInstanceComponent`
codegen (proven in 4c/4a) already handle it. Per-fixture:

- **`page-with-tier3-slot`** (two static instances) and **`page-with-tier3-slot-foreach`** (one instance
  repeated under `forEach`/`trackBy`): script tag `application/jay-headfull … names="card"` →
  `application/jay-headless src="./card/card" contract="./card/card.jay-contract"` (no `names=`). Each
  `<jay:card>` now carries the card body as source-owned markup inline; `<override slot="body">` removed.
- **`card.jay-contract`** (both fixtures): dropped the `- tag: body / type: slot` entry — the card body is
  ordinary owned markup, so there is no slot tag. `card.jay-html` lost `ref="body"` on its body `<div>`.
  `card.ts` / `card.jay-contract.d.ts` were already slot-free (no `body` ref) — unchanged.

Regenerated all 6 snapshots (element / hydrate / server × 2 fixtures), 0 validation errors. Verified
codegen: element imports `{card}` + `makeHeadlessInstanceComponent`, emits one flattened `renderFn` per
distinct region and `makeHeadlessInstanceComponent(renderFn, card, coord)` + `childComp(...)`. Under
`forEach` the render fn is hoisted once and the `childComp(_HeadlessCard0, …, refRichCards())` + keyed
coordinate function `(dataIds) => [...dataIds, 'card:richCards'].toString()` live inside the item callback.
The bare `CardViewState` import is unused in element/hydrate (used only in server casts) — this matches the
pre-existing coded-instance convention (`page-with-headless-instance` imports `ProductCardViewState`
identically) and there is no `noUnusedLocals` in the workspace, so it is left as-is, not special-cased.
Test `it(...)` descriptions across the three targets rewritten from DL#194 slot semantics to DL#196.

Result: `compiler-jay-html` 783 pass / 4 skip; workspace `build:check-types` clean.

**No remaining concept-B fixtures.** The inlining path (`parseHeadfullFSImports`, `legacyInlined`, the
`renderInlined*` mirrors, Fork-C slot codegen, `jay-html-overrides.ts`, and the now-orphaned
`forEachInsidePureComponentError` / `rootParentInInlinedCompositeError` / `headfullRecursionError` helpers)
is now dead for fixtures and can be deleted as its own increment (design-owner decision: **separate
increment**). Recursion detection remains owed to `jay-stack validate` (Phase 2).

### Phase 4g — coded `src=` regions wired through the dev-server pre-render (Increment, green)

Migrating the first dev-server fixture (`8a-page-headfull-fs-static`) from the legacy
`application/jay-headfull … names="header"` form to a DL#196 coded region
(`application/jay-headless src="./header/header" contract="./header/header.jay-contract"`, header body
flattened inline) exposed that the **local coded `src=` path had never run through the dev-server
pre-render pipeline** — only plugin-based headless imports (e.g. `14a`, `plugin="test-spotlight"`) and
compiler-only unit fixtures (`card`) had. Three gaps, each fixed by extending an existing mechanism (no
new surface):

1. **Two-step builders undetectable.** `analyzeExportedTypes` recognised `makeJayStackComponent` only
   when the exported call's root identifier _was_ `makeJayStackComponent`. Real components split the
   chain across a variable (`const builder = makeJayStackComponent()…; export const header =
builder.withInteractive(…)`), whose root identifier is `builder`. The old headfull path never
   analysed (it trusted `names=`); the coded `src=` path resolves the single exported component, so it
   hit this. Fix: `chainRootsAtMakeJayStackComponent` follows an intermediate builder variable's
   initializer transitively (`compiler-analyze-exported-types/lib/analyze-exported-types.ts`). New unit
   fixture `stack-header-two-step` + test.
2. **Pre-render left the headless `contract=` relative.** `resolveRelativePaths` (pre-render) already
   absolutizes jay-data `contract`, jay-headless `src`, links, and plain scripts — but not jay-headless
   `contract`. So the pre-rendered file (parsed from `build/dev/pre-rendered/`) resolved `./header/…`
   against the wrong dir → ENOENT. Fix: absolutize jay-headless `contract` alongside `src`
   (`compiler-jay-html/lib/slow-render/slow-render-transform.ts`). Plugin contracts (bare names like
   `spotlight`) are not relative paths, so they are untouched. **This is the absolutize-during-pre-render
   strategy, deliberately chosen over threading `sourceDir` into `parseHeadlessImports` — the latter is
   the legacy-headfull mechanism being deleted.**
3. **`resolveLink` couldn't resolve the now-absolute `src`.** After (2), `src` reaches the parser as an
   absolute, extensionless path (`/abs/header/header`); `resolveLink` sent anything non-`.` to
   `require.resolve`, which fails without an extension. Fix: return absolute paths (`link[0] === '/'`)
   as-is so `analyzeExportedTypes`' `autoAddExtension` appends `.ts`; reserve `require.resolve` for bare
   module specifiers (`compiler-jay-html/lib/jay-target/jay-import-resolver.ts`).

**Constraint reaffirmed (design-owner, 2026-09-24):** _no templates from plugins._ "We do not support
headfull components from plugins" now reads as "we do not support a template from a plugin" — plugins
ship contract + code only; the template is always page-owned (flattened inline). Local coded components
keep a reference `.jay-html` (e.g. `header/header.jay-html`) as the materialiser's re-flatten source,
matching the `card` fixture.

Fixture `8a` re-authored + snapshots regenerated (`UPDATE_FIXTURES=1`). The hydrate diff is the DL#196
win: `childCompHydrate` props dropped the old wrapper cruft (`style: 'display: contents'`, `jc: 'header'`)
to just the real prop `{ logoUrl: '/logo.png' }`, and the SSR `<header>` is the region root with no
wrapper element. Result: dev-server `709 + 32` pass (0 regressions), analyzer `6` pass, `compiler-jay-html`
`783 / 4 skip`. Remaining dev-server `8b–8n` fixtures migrate next by the same recipe.

### Phase 4h — remaining dev-server fixtures `8b–8n` migrated (Increment, green)

All fourteen `8x` dev-server fixtures now use the flattened headless form; snapshots regenerated with
`UPDATE_FIXTURES=1` then `yarn format` (regeneration writes unformatted output — the committed form is
prettier-normalised, so the format pass reverts the whitespace-only churn across the untouched fixtures
and leaves only the genuinely-changed `8x` expected files). Migrated in three commits by shape:

- **Batch 1 — simple single-header (`8b`–`8g`, `8l`).** One `<jay:header>` region, body flattened inline;
  `if=`/`forEach=`/`trackBy=` stay on the page wrappers, two instances keep distinct props. Every
  `childCompHydrate` reduced from `{ itemId, style: 'display: contents', jc: 'header' }` to just the real
  prop(s).
- **Batch 2 — special forms (`8h`, `8k`, `8n`).**
  - `8h` (component CSS): body flattened; the component's `<style>` moved into the page `<head>` (the page
    now owns it). Note: dev-server snapshots do **not** capture CSS, and the `@scope`-wrapped materialiser
    output (Q5) needs a wrapper-ref selector these bare fixtures lack — that is a `stack-cli`/validator
    concern, not exercised here.
  - `8k` (separate dirs / tag rename): `names="TestHeader"` dropped; the region tag now derives from the
    **contract name** (`Header` → `<jay:header>`), so coordinates rename `testheader` → `header` while the
    imported symbol keeps its export name (`TestHeader`).
  - `8n` (passthrough, no `badge.ts`): `application/jay-headless contract=…` **without `src=`**; badge body
    flattened into both `<jay:badge>` instances. Codegen emits `makePassthroughHeadlessInstanceComponent`
    with correctly typed props (`Status` enum, numbers, booleans). Added an `expected-hydrate.ts` (`8n`
    previously had SSR-only coverage; the hydrate comparison only runs when the fixture file exists).
- **Batch 3 — nested regions (`8i`, `8m`, `8j`).** The parser no longer reads component templates
  (post-DL#196 it imports logic + templates only), so a nested `<jay:X>` inside a flattened region must
  have its import declared in the **page** head:
  - `8i` / `8m`: coded header nesting a plugin `<jay:widget>` — page declares **both** the header `src=`
    import and the plugin widget import; `8m` additionally has a two-root-child header body and a
    multi-child conditional widget slot.
  - `8j`: headfull-in-headfull (page → Layout → header) — page declares **both** headless imports (the
    header path rebased `../header` → `./header`); produces `_HeadlessHeader` nested inside
    `_HeadlessLayout` with clean `layout:AR0` → `header:AR0` coordinates. The Layout component's own
    `layout.jay-html` was also migrated to the flattened form so it is a valid re-flatten source (not
    parsed by the dev-server — coded components import types from `.jay-contract`, not templates).

Result: full dev-server `711` hydration tests pass (the count rose from 709 because `8n` gained a hydrate
fixture) + `32` dev-server/action-router. (Vitest intermittently marks the hydration _file_ "failed" while
all 711 tests pass — a pre-existing dev-server teardown race, orthogonal to these fixture-only changes; a
clean re-run of any subset is green.)

**Not yet migrated (deliberately deferred to pair with the legacy-path deletion):** the two remaining
`application/jay-headfull contract=` pages outside dev-server —
`production-build/.../basic-project/.../featured/page.jay-html` and the identical `production-server`
copy (both: coded `siteHeader` nesting a plugin `cart-badge`, structurally like `8i`). Their tests are
**behavioural** (route/instance counts, `page-parts.json` config shape) and currently pass **via the
still-present legacy inlining path** (`production-build` `build.test.ts` 33/33 green). Migrating them now,
before the legacy path is deleted, would be premature — the instance-count/config assertions must change
in the _same_ commit that removes inlining. So these two fixtures + their assertions move together with
the Phase 4 legacy-`contract=` deletion.

### Phase 5 — example/smoke migration + drift-validation wiring (Increment, green)

**Featured production fixtures migrated (deviation from the deferral note above).** The
`production-build` and `production-server` `basic-project` `featured/page.jay-html` pages were migrated to
the flattened headless form (coded `site-header` region — `src=…/site-header/index` — nesting a
passthrough `cart-badge` plugin region). `build.test.ts` (33/33) stays green; test _names_ updated
("headfull FS" → "flattened headless region"). This moved ahead of the legacy deletion because the
assertions were content-based, not instance-count-based, so they did not need to change in lockstep.

**Smoke pages migrated / dropped.** `/nested`, `/headfull`, `/nested-composition` migrated to flattened
regions (Q11 resolved for `/nested-composition` = nested `section` → `card` → `button` regions; its SSR
button-label assertion now passes without `it.fails`). `/combined` and `/foreach-composite` — which
exercised the **retired** `<override slot>` / Fork-C vocabulary and the deferred §7 page-owned-binding
case — were **dropped** (pages, tests, and the three now-unused components `rich-card`, `promo-card`,
`override-card`) rather than re-authored, since the per-facet `override` directive that would replace that
vocabulary is a validate/sync-time concern with no distinct SSR output to smoke-test.

**Compensation for the dropped pages — the drift validator is now wired (Phase 2 debt paid).** Per the
design owner's requirement ("compensate with at least one smoke test that verifies our validation work …
with the overrides and without"), the Phase-1 differ is connected to `jay-stack validate`:

- **`checkRegionDrift(jayHtml, loadTemplate)`** (`stack-cli/lib/validate.ts`, `@internal`) — for each
  headless import carrying `template=` provenance, it collects the page's `<jay:X>` region elements
  (`isRegionTag`), loads the source template via the injected reader, and runs `diffBodies` (the exact
  wiring the module docstring anticipated: "Phase 2 wiring feeds these after loading via `parseJayFile`").
  Each `DiffEntry` becomes a **warning** (the page still builds — Q10) formatted with `facetLabel` +
  `overrideSpecFor` so the message names the drifted facet and the exact `override="…"` / `jay-stack sync`
  remedy. Template loading is injected (CLI supplies a filesystem reader resolving `template=` relative to
  the page dir) so the function is pure and unit-tested. A region without `template=` has no provenance and
  is not checked, so the (provenance-less) migrated smoke pages are unaffected.
- **Fixtures + tests.** A dedicated fixture flattens one `<jay:card>` source template into two regions —
  region A edits the `<h3>` class but marks it `override="class"` (page-owned → silent); region B rewrites
  the `<h3>` text with no marker (→ reported). One `validate --json` run proves **both** suppression and
  detection: `valid: true`, exactly one drift warning on region B, none on region A. Covered by a smoke
  test (`examples/jay-stack/smoke-test`, via the real CLI, 65/65) **and** three `checkRegionDrift` unit
  tests (`stack-cli/test/validate.test.ts` — reported/suppressed, no-`template=` clean, unreadable-template
  warning; package 86/86). `@jay-framework/compiler-inline-composition` added as a `stack-cli` dependency.

**Still owed (Phase 3 / Phase 4):** `jay-stack sync` (the differ's materialiser is built but has no CLI
surface yet); CSS drift (`diffCss`) is not yet wired (markup drift only); and the legacy
`application/jay-headfull contract=` inlining apparatus is not yet deleted.

### Phase 4 — legacy `application/jay-headfull contract=` inlining deleted (Increment, green)

The string-inlining apparatus behind `application/jay-headfull … contract=` (concept B) is removed.
`application/jay-headfull … contract=` is now a **hard validation error** directing the author to
`application/jay-headless` + a flattened `<jay:X>` region (`jay-stack sync`). **Retained:** regular
headfull (`names=`, no `contract=`) via `parseHeadfullImports`; the concept-A no-code `structural`
passthrough region; the DL#196 `application/jay-headless` path.

**Removed (parser / compiler / expression compiler).**

- `jay-html-parser.ts`: `parseHeadfullFSImports`, `injectHeadfullFSTemplates(+Recursive)`,
  `injectComposableTemplateIntoTag`, the `HeadfullFSParseResult` interface (~720 lines). `parseJayFile`
  now splits `script[type="application/jay-headfull"]` into (a) any with `contract` → push the DL#196
  removal error, (b) the rest → `parseHeadfullImports` unchanged. FS css / linkedCss merges and
  `headfullFSResult.componentImports` dropped; `allLinkedComponentFiles` is now empty.
- `jay-html-compiler.ts` / `-hydrate.ts` / `-server.ts`: the legacy branch in `renderHeadlessInstance`,
  `renderInlinedStructuralInstance` (+ hydrate/server twins), `buildInlineAliases` (×3 targets), and the
  `insideInlinedComposite` context field + its reads. `guardVariables` collapses to the non-inlined form;
  `isOverrideInjected` simplifies to the marker check. **Kept:** `buildStructuralCoercions` +
  `FOREIGN_SLOT_MARKER` (concept-A), `mergeContractStubRefs`, `withParentShift`.
- `expression-compiler.ts`: the inlining-only alias overlay — `aliases` / `inlinedRoot` /
  `withRootVarName` / `forInlinedComponent`, the `resolveAccessor` alias branch, and the
  `rootParentInInlinedCompositeError`. **Kept:** the shared `withParentShift` / `asLexical` /
  `childVariableFor(WithData)` / `parentShiftLevels` / `lexicallyInScope` core.
- `jay-html-source-file.ts`: the `legacyInlined?` flag on `JayHeadlessImports` (kept `template?`).

**External call sites cleaned.** `dev-server.ts` (3 `injectHeadfullFSTemplates` calls + import),
`stack-server-build/load-page-parts.ts`, `production-build/load-production-parts.ts`,
`production-build/server-element-compile.ts` all now pass the jay-html through unchanged
(`resolveJayHtmlPaths` where path-rebasing was already needed) instead of pre-inlining.

**Tests migrated.** `parse-jay-file.unit.test.ts`: the 854-line "headfull full-stack imports" describe
replaced with a compact block — one test asserts the removal error fires on `contract=`, one asserts the
error is **absent** for a regular no-`contract` headfull import. `expression-compiler.unit.test.ts`: the
alias-substitution describe (removed 9-arg `Variables` overlay) deleted. The `page-with-tier3-slot`
generated fixtures now reflect the single-path codegen (verified by the green `generate-element` /
`-hydrate` / `-server-element` suites).

**Examples.** `ref-forwarding` and `override-ref-forwarding` example projects dropped (they exercised the
deleted ref-forwarding/override vocabulary). The **smoke** `section.jay-html` / `card.jay-html`
components migrated from `application/jay-headfull contract=` to `application/jay-headless` with their
`<jay:X>` regions flattened transitively (section now declares both the no-code `card` — contract only,
passthrough-backed — and the coded `button` — `src` + `contract` — because its flattened body transitively
contains `<jay:button>`). `section.ts` never used `refs.card`, so no ref survives on the region tags,
matching the fully-flattened page form.

**One incidental fix.** `compiler-analyze-exported-types` fixture `stack-header-two-step.ts` called
`makeJayStackComponent().withSlowlyRender(…)` without `.withProps()`; a stale `fullstack-component`
`.d.ts` had masked it. The current builder only exposes `withSlowlyRender` after `.withProps()`, so
`.withProps<{}>()` was inserted (the AST-based `analyzeExportedTypes` assertion — `[]` refs — is
unchanged).

**Deviation from the deferral note.** Phase 4h deferred migrating the two production `featured/page.jay-html`
fixtures to "move together with the legacy deletion". Phase 5 had already migrated them (content-based
assertions, no lockstep needed), so this increment only had to delete the apparatus — no fixture-count
assertions changed.

**Verification.** Full repo green: `yarn build` (71 packages), `yarn build:check-types` (exit 0),
`yarn test` (72 packages) — including `compiler-jay-html` 759, `dev-server` 743, `production-build` 87,
`stack-server-build` 51, `stack-cli` 86, `compiler-inline-composition` 63, and the smoke suite 65 (the
DL#196 region-drift CLI test among them). Global grep confirms zero remaining references to any deleted
symbol.

**Still owed after this increment:** `jay-stack sync` CLI surface; CSS drift (`diffCss`) wiring;
validate-engine recursion detection; agent-kit docs (Phase 6); optional smoke vocab rename (test/label
strings still say "Tier 2 / DL#194").

### Phase 4i — Fork-C runtime + emission + orphaned lib helpers deleted (§6 complete, green)

The final §6 increment: everything earlier phases left "in `lib` until the legacy path is deleted" is
now gone. With the parser inlining path and every concept-B fixture already removed (Phases 4d–4h, 4),
these symbols had zero remaining callers and were deleted outright — the compiler emits one
`renderHeadlessInstance` path, and the runtime keeps only `childComp(compCreator, getProps, ref?)`.

**Runtime primitives removed.**

- `runtime/lib/element.ts`: `foreignChild` (the Fork-C DOM anchor) and `childComp`'s `slots` (#194) +
  `refViewState` (#193) params, with the slot-update loop and the provenance-shifted ref branch —
  `childComp` collapses to `mkRef`.
- `runtime/lib/hydrate.ts`: `childCompHydrate`'s `slots` param and its slot-update loop.
- `runtime/lib/node-reference.ts`: `slotRefManager` (+`set`/`getSlotRef`) on both `ComponentRefsImpl`
  and `ComponentCollectionRefImpl`; the collection's `forwardedInnerListeners`, `addRef` replay
  override, `hasForwardedInnerRef`, `getForwardedInnerRef`; and the three get-traps
  `DELEGATE_SLOT_REF_TRAP`, `DELEGATE_COLLECTION_SLOT_REF_TRAP`, `DELEGATE_COLLECTION_INNER_REF_TRAP` —
  `ComponentRefProxy` is now `[EVENT_TRAP, DELEGATE_REFS_TO_COMP_TRAP]`, the collection proxy just
  `[EVENT_TRAP]`.
- `runtime/lib/references-manager.ts`: the slot-collision block in `mkRefsOfType` (the only
  `setSlotRefManager` caller) — a colliding `childRefManager` no longer special-cases component refs.
- `runtime/lib/context.ts`: `pendingSyntheticParent`, `withSyntheticParentContext`,
  `consumePendingSyntheticParent`, and the `if (syntheticParent) context.parent = …` adoption in
  `withRootContext` + `withHydrationChildContext`.
- `runtime/lib/index.ts`: the `withSyntheticParentContext` re-export (`foreignChild` fell out with
  `export * from './element'`).
- `component/lib/component.ts`: `PARENT_CONTEXT_PROP` (`__parentContext`), the synthetic-parent build
  from that prop, the reaction's `syntheticParent.update(...)`, and the `withSyntheticParentContext`
  render wrap — first render is now a plain `renderWithContexts(...)`. Its `ConstructContext` /
  `withSyntheticParentContext` imports dropped.

**Compiler emission collapsed to one path.** The Fork-C slot machinery in `renderHeadlessInstance` and
its hydrate/server twins is gone: synthetic single/repeated ref types, `slotPreambles`,
`emittedForwardedRefHelpers`, the `foreignChild(slots.X)` mount branch, the `__parentContext` prop
emission, and the server/hydrate `foreign-slot` anchor branch. `renderHeadlessInstance` now reads
`filterContentNodes(childNodes)` directly and emits `childComp(sym, getProps, ref?)`.
`assign-coordinates.ts` loses the `<override>` split (node partition + page-scope override-coordinate
walk); `assignHeadlessInstance` drops its now-unused `parentScopeId` param. `jay-html-compiler-bridge.ts`
drops the two dead context fields.

**Files deleted.** `jay-html-overrides.ts` (both `<override>` forms, pragma, `OVERRIDE_INJECTED_MARKER`,
`FOREIGN_SLOT_MARKER`) and its `jay-html-overrides.unit.test.ts`.

**Orphaned `lib` helpers deleted** (`jay-html-helpers.ts`): `hasForEachDescendant`,
`forEachInsidePureComponentError`, `findForEachInsidePureComposite`, `headfullRecursionError`,
`overrideRequiresExplicitRefError` — the Tier-2 inlining/recursion diagnostics whose call sites Phases
4d/4e removed. `Import.foreignChild` dropped from `compiler-shared/lib/imports.ts`.

**Expression-compiler parent-shift core removed** (supersedes Phase 4's "Kept"): `withParentShift`,
`parentShiftLevels`, `PARENT_SCOPE_PRAGMA` — the #193 cross-boundary shift seam. **Retained and now
sole survivors of the #193 scope work:** `asLexical` / `lexicallyInScope` / `childVariableFor(WithData)`
(server Capability A `$parent`, one-function render), and the runtime `parentDataChain` / `parentDepth`
chain (Capability A `$parent` within `forEach` / `withData`).

**Tests deleted** (exercised removed features): `runtime/test/lib/slot-content.test.ts`,
`runtime/test/lib/ref-forwarding.test.ts`, `component/test/parent-context.test.ts`.

**Deviation from §6's conditional survivor.** §6 kept `foreignChild` "if §7 (page-scope pass-through)
ships." §7 is deferred, so `foreignChild` is deleted **unconditionally** — if §7 is later built, it
reintroduces its own slimmed, page-declared anchor rather than inheriting the Fork-C one. The
`page-with-tier3-slot` / `-foreach` fixtures survive but no longer exercise slots (already re-authored to
plain inline composition in Phase 4f); their names are now cosmetic (covered by the deferred vocab
rename).

**Verification.** Full repo green: `yarn build` (71 packages), `yarn build:check-types` (exit 0),
`yarn test` (72 packages) — `runtime` 278/3-skip, `component` 58, `compiler-jay-html` 714/4-skip,
`compiler-inline-composition` 63, `secure` 106, smoke 65 included. A global grep for every §6 removal
symbol (`foreignChild`, `slotRefManager`, `forwardedInnerListeners`, `getForwardedInnerRef`,
`withSyntheticParentContext`, `PARENT_CONTEXT_PROP`, `withParentShift`, `parentShiftLevels`,
`FOREIGN_SLOT_MARKER`, `refViewState`, `forEachInsidePureComponentError`, …) returns zero source hits.
§6 is complete.

### Phase 4j — passthrough interactive render made reactive (bug fix, green)

**Symptom.** On the smoke test's `/headfull` page, clicking `ref=cycleButton` re-drove the second badge's
`status="{currentStatus}"` binding, but the badge never updated. The props reached the badge instance, yet
after the prop update the reactive's `batchedReactionsToRun` was empty — no reaction depended on the props.

**Root cause.** The client/hydrate passthrough (`makePassthroughHeadlessInstanceComponent`,
`stack-client-runtime/lib/headless-instance-context.ts`) defined its identity interactive constructor as
`comp: () => ({ render: () => ({}) })`. The merged instance render is `{ ...resolvedFastVS, ...originalRender() }`
(headless-instance-context.ts:208-213); with `originalRender()` returning a static `{}` and `resolvedFastVS`
fixed at construction (server fast VS, or the `clientDefaults` props snapshot), **nothing was read reactively
inside the render reaction.** So a prop update — `propsProxy.update()` → `_setProps()` inside `batchReactions`
(component.ts:262-272) — had no dependent reaction to schedule. The region was frozen at its construction-time
ViewState. This is a no-code region's whole contract (ViewState = props, live), so the identity render must
actually _read_ the props signal.

**Fix (one line).** `comp: (signalProps) => ({ render: () => signalProps.props() })`. Reading
`signalProps.props()` inside render registers a reactive dependency on the props signal (`_props` in
`makePropsProxy`, component.ts:281), so a parent prop update re-runs the reaction; the merge then overlays the
live props onto `resolvedFastVS`. Same mechanism for both branches (server fast VS vs `clientDefaults`) — only
the base object differs. `clientDefaults` (the props echo) is retained: it still seeds `resolvedFastVS` /
`signalVS` and the pre-hydration first render for the no-server-data case.

**Regression test (additive).** `stack-client-runtime/test/passthrough-headless-instance.test.ts` drives a
passthrough via `childComp` inside a parent whose ViewState feeds the instance's props (the vs → prop → vs
chain), then asserts the rendered `#badge-status` text follows `page.update(...)`. Confirmed it fails against
the pre-fix `render: () => ({})` (badge frozen at `success`) and passes after. The package's `test` script was
`echo 'no tests'`, so neither this test nor the existing `action-caller` test ran in CI — repointed to
`vitest run` (21 tests: 19 action-caller + 2 passthrough).

**Verification.** `stack-client-runtime` `yarn test` (21) + `build:check-types` (exit 0) green; smoke
`test:smoke` (65) green (SSR path unaffected — it does not exercise client click reactivity, which is why this
escaped earlier).

### Phase 4k — smoke `/headfull` retitle + tier vocabulary retired repo-wide (rename, green)

The deferred "smoke test / label vocab rename" is done, extended to the whole tree (comments, JSDoc, and test
`describe`/`it` titles only — no logic, identifiers, or asserted strings changed; the design logs keep the
historical tier/DL#187/DL#194 terms).

**Vocabulary (region-based).** `Tier 2` / "pure headfull component" → **no-code structural passthrough region**;
`Tier 3` (coded) → **coded region** / **coded (headless) component**; the general concept → **inline
composition**. `DL#187` and `DL#194` citations that labelled _current_ behavior → `DL#196` (DL#196 supersedes
both). Files touched span `compiler-jay-html` (`jay-html-compiler.ts`, `structural-coercions.ts`,
`jay-html-compile-refs.ts`, `jay-html-compiler-server.ts`, `slow-render-transform.ts`), `stack-server-runtime`
(passthrough-component, resolve-instance-props, types, instance-slow-render, slowly/fast-changing-runner),
`stack-server-build`, `production-build`/`production-server` loaders, `stack-cli` (`validate.ts`/`validate.test.ts`),
`stack-client-runtime`, `dev-server` (`hydration.test.ts`), and the smoke example (`smoke.test.ts`, `section.ts`,
`button.ts`).

**`/headfull` page retitled.** `pageTitle` → **"Inline Composition"** (it composes a coded `banner`, a no-code
structural `info-box`, and two structural passthrough `badge` regions); its `page.jay-contract` comment and the
`smoke.test.ts` `/headfull` titles updated to match. Route/folder `headfull` kept — the _page_ is genuinely a
headfull page.

**Fixtures renamed** (`git mv`, `compiler-jay-html/test/fixtures/contracts/`): `page-with-tier3-slot` →
**`page-with-coded-region`**, `page-with-tier3-slot-foreach` → **`page-with-coded-region-foreach`** (dirs +
`.jay-html` files). Because the generated element type prefix derives from the jay-html filename, the golden
`generated-element*.ts` files were regenerated (`PageWithTier3Slot*` → `PageWithCodedRegion*`) and the six
`folder = 'contracts/page-with-tier3-slot*'` references in the three `generate-*.test.ts` updated. (These
fixtures no longer exercise slots — re-authored to plain inline composition back in Phase 4f — so the old name
was doubly stale.)

**Verification.** `compiler-jay-html` generate suites (element/hydrate/server, 132) green with regenerated
goldens; `stack-client-runtime` (21), smoke (65) green; repo-wide `build:check-types` exit 0; a repo-wide grep
for the tier/DL#187/DL#194 vocab and the old fixture names returns zero hits outside `design-log/`.

### Phase 2/3/6 — the four remaining debts closed (`sync` CLI, CSS drift, recursion, agent-kit docs)

The four items owed since Phase 5 (§1183) are done, all in `stack-cli`. All new logic is pure and
unit-tested; template loading is injected exactly as the engine expects.

**Shared filesystem wiring — `lib/materialise-context.ts`.** `buildMaterialiseOptions(pageDir, jayHtml,
readFile, extra)` builds the engine's `{resolveTemplate, loadTemplate}` from the page's `template=` imports
(a global contract-name→path map, resolved relative to the page dir), so `sync` and recursion detection
resolve provenance identically. Only design-system elements (imports carrying `template=`) resolve — a
template-less nested/keyed region returns `null` and is left as authored.

**`@scope` extraction — `lib/scope-css.ts`.** `extractScopeBlock(css, selector)` (brace-matched, respects
nested `@media`/`@supports`) and `splitScopeBlocks(css)` — dependency-free, so `stack-cli` needs no postcss.

**Item 2 — CSS drift wired.** `checkRegionCssDrift(jayHtml, loadTemplate)` isolates each region's
`@scope (.<ref>)` block from the page CSS and diffs it against the source template's `<style>` CSS via
`diffCss` (`@scope` transparent). Reported as warnings through the same `formatRegionDrift` formatter as
markup drift. A region without a `ref` (no CSS was scoped) is skipped. Wired at the page loop next to
`checkRegionDrift`.

**Item 3 — recursion detection wired.** `checkRegionRecursion(pageHtml, pageDir, jayHtml, readFile)` runs
`materialise` as a dry-run and lifts its `template inclusion cycle: …` errors (from `fillRegions`'
per-branch stack) to hard validation errors — repaying the Phase 4e debt (the removed parse-time
`headfullRecursionError`). Other materialise errors (unreadable template) stay owned by `checkRegionDrift`,
so cycles are the only class lifted here.

**Item 1 — `jay-stack sync`.** `lib/run-sync.ts` + `cli.ts` command `sync [target] [--all]`. Pure core
`syncPageContent(rawPage, pageDir, jayHtml, readFile)` runs `materialise` with `preserveOverrides: true`
(the `mergeOverrides` re-flatten), merges the aggregated `@scope` CSS into the page `<style>`
**non-destructively** (a selector the page already scopes is left for the author / CSS drift check —
`mergeOverrides` governs markup facets, not CSS pragmas, so sync never rewrites marked CSS), prettifies,
and reports `changed` by comparing prettified forms (so pure reformatting is not a change; a synced page is
idempotent). Exact CLI messages (`✓ synced N region(s) in <path>`, `Synced N region(s) across M file(s).`,
`Nothing to sync.`) per §566.

**Deviation — `#ref` per-region targeting not implemented (v1).** §366's `sync page.jay-html#signupCard`
form is not supported: narrowing `resolveTemplate` to one contract would break transitive fill of nested
design-system elements re-introduced by the re-flatten (leaving a bare `<jay:Y>` in the output). `sync`
takes a page path or `--all`; a `#ref` suffix logs a notice and syncs the whole page. Whole-page sync is
safe because it is deterministic overwrite-with-holes. Full per-region targeting is deferred.

**Item 4 — agent-kit docs (Phase 6).** Designer: new `designer/design-system-guide.md` (the three
component models, `template=` provenance, materialise/first-fill via `sync`, drift warnings, the full
`override` facet + CSS `jay:override` vocabulary, upgrades) — this also folds in the user-requested
"how to create and use a design system" guidance. The stale `<override>`-tag section in
`designer/jay-html-components.md` (removed in Phase 4d) is replaced with the flatten-and-mark model;
`designer/cli-commands.md` gains a `jay-stack sync` section; INSTRUCTIONS index updated. Plugin: new
`plugin/design-system-guide.md` (ship contract + optional code + template — not a running UI, Q1; upgrades
flow through `sync`; design-for-clean-upgrades guidance) linked from `plugin/INSTRUCTIONS.md`. Repo-wide the
only remaining `<override` mentions are the two guides explaining that the tag is gone.

**Verification.** `stack-cli` type-check exit 0; `stack-cli` tests 91/91 green — new: `validate.test.ts`
`checkRegionCssDrift` (declaration drift, exact message) and `checkRegionRecursion` (cycle detected via
self-including template fixture; clean page reports none); `run-sync.test.ts` `syncPageContent`
(re-flattens unmarked drift, preserves `override="class"`, injects `@scope` CSS; second sync idempotent).
New fixtures under `test/fixtures/validate/region-css-drift`, `region-recursion`, `region-sync`.

### Fix — `@scope (.<ref>)` needs a real DOM anchor (scope-anchor class stamping)

**Bug.** Q5 / §5 chose to `@scope`-wrap each region's copied CSS with `.<ref>` (`@scope (.signupCard)`),
believing the `<jay:X ref>` region is "a real instance" whose ref surfaces as a class-selectable element
(§167). It does not: a jay `ref` is consumed by the reference/coordinate system and **never emitted to the
DOM** as a `class` or any attribute (`jay-html-compiler.ts:433-434` returns early for `ref`), and the
compiler emits `@scope` verbatim (no rewrite into descendant selectors — it is only transparent to the
_differ_, `diff-css.ts`). So `@scope (.promo)` matched **no scope root** and the entire copied CSS block
was **inert** at runtime.

**Fix (chosen — smallest change, keeps the `.<ref>` selector).** The materialiser now **stamps the ref as
a real class on the flattened region's top-level element(s)** so the `@scope (.<ref>)` block has an anchor.
`<jay:card ref="promo">` flattens to `<div class="card promo">…`; `@scope (.promo)` roots at that `.card`
div, and `.card-heading` inside is a descendant. The stamp is derived fresh from the ref on every
(re-)flatten, so it is idempotent and survives `override="class"` (re-applied after `mergeOverrides`).

**Companion — the differ must ignore the synthetic class.** The stamped `promo` token is materialiser-
injected, not author content (analogous to `jc`); the markup differ (`diff-markup.ts`) strips the region's
ref-anchor class from the `class` attribute on both sides before comparing, so the anchor is never reported
as drift. `diffBodies` reads the ignore-class from the region tag's `ref`; the string-based `diffMarkup`
path (no `<jay:X>` wrapper) ignores nothing. CSS drift is unaffected — `extractScopeBlock` already isolates
the `@scope (.<ref>)` block by selector.

**Alternative rejected.** A dedicated synthetic attribute (`data-jay-scope="promo"` + `@scope
([data-jay-scope=promo])`) would be ignored by the differ for free (via `isMetaAttr`) and never touch the
author's `class`, but it abandons the `.<ref>` selector the design and docs already use; the class approach
was chosen for continuity.

### Refinement — drift remediation moves to the `suggestion` field

`ValidationWarning` already carries a `suggestion?` field that the CLI renders on its own `Suggestion:`
line (and the `--json` output exposes as a distinct key), but `formatRegionDrift` crammed the whole
"To keep the page's version, … run `jay-stack sync`." remediation into `message`. `formatRegionDrift`
now returns `{ message, suggestion }` — `message` is the factual drift
(`<jay:X> region differs from source template "…": <h3> children changed (…).`) and `suggestion` is the
remediation — and `checkRegionDrift` / `checkRegionCssDrift` return `RegionDriftFinding[]` so the two
consumers push both fields. Same for the unreadable-template warning ("… could not be read." + suggestion
"Fix the path or remove the attribute."). No message text changed, only where each half lives.

## Issues exposed by the `design-system-demo` example

`examples/jay-stack/design-system-demo` was built (2026-09) to exercise DL#196 end-to-end against a
realistic, deeply nested design system — `section → gallery → card → button`, with two `card` instances and
a `button` inside each. Three pages exercise the pristine / overridden / drifted states. Building it
surfaced three real gaps — all three are now **fixed**. The example's smoke test (`test/smoke.test.ts`)
asserts the drift-validation behaviour end-to-end.

### Issue 1 — `sync` does not preserve `override=` inside a nested region

`checkRegionDrift` is recursive (`collectRegionElements` walks _every_ region, nested included) so
`validate` correctly suppresses `override=` facets at any depth. But `jay-stack sync` only round-trips
overrides on the **outermost** region's own body. Overrides buried inside a nested region are silently
discarded on re-sync.

Reproduce (from the example dir):

```bash
yarn sync src/pages/branded/page.jay-html
git diff src/pages/branded/page.jay-html
```

The section `<h1 override="class">` (direct child of the outer `<jay:section>` body) survives; the three
overrides living inside the `<jay:card>` / `<jay:button>` subtrees (`ds-card__heading--brand`,
`style.color`, `ds-button--gold`) are gone.

**Root cause.** `mergeOverrides` (materialise.ts) returns early at nested region tags —
`if (isRegionTag(te)) return` — the Q2 decision "a nested region's own source governs it." When the outer
`<jay:section>` re-flattens from `section.jay-html`, the whole deep subtree is regenerated from the source
templates, and the page's deep override markers go with it. Q2 was written assuming a nested region on a
page is _thin_ (its body governed by its own source); it did not account for a page overriding a facet that
lives structurally inside a nested region's flattened body.

**Fix direction (deferred, for review).** `sync` needs the same recursive descent `checkRegionDrift`
already has: when re-flattening the outer region, carry the page's per-facet `override=` markers down into
the nested subtree and re-apply them after each nested re-flatten — i.e. `mergeOverrides` should descend
into region tags for the _override-preservation_ pass even though drift attribution stops at the region
boundary. Validate and sync must share one recursive override-collection walk so "validate says clean" and
"sync keeps it" cannot diverge.

**Resolution (implemented).** The fix is smaller than the direction above and needs no new recursive walk —
the transitive re-flatten (`fillRegions`) is _already_ recursive; the bug was only that `mergeOverrides`
**discarded** the page's nested-region body before that recursion could see it. `mergeElement`'s region-tag
branch changed from `return` (discard, leaving the parent template's copy of the nested body) to
`te.set_content(ee.innerHTML)` — keep the template's region **tag** (its `ref` + props stay
parent-template-governed), but carry the page's region **body** across. `fillRegions` then re-flattens that
region from its own template with the page body as the merge input, so `mergeOverrides` runs again at the
child's level and preserves its facets — recursively, to any depth. This is the exact mirror of the
validate side: the differ (`diffBodies`) stops at the region boundary (`if (isRegionTag) continue`) while
`checkRegionDrift` visits each region separately via `collectRegionElements`. So the two now share one
model — per-region, override-per-facet, stop-at-boundary, recurse-by-region — and cannot diverge: a facet
marked `override=` is suppressed by validate **and** kept by sync; an unmarked deviation is reported by
validate **and** reconciled by sync, at every nesting depth. An override deep inside a nested region is
preserved **without** marking the parent's `<jay:X>` inclusion (the requirement). Landed in
`materialise.ts`; tests in `materialise.test.ts` › "sync preserves overrides inside nested regions
(Issue 1)" (single-level preserve, single-level reconcile-unmarked, two-level section→card→button
preserve). Verified end-to-end on the example: `yarn sync` leaves `branded/page.jay-html` byte-identical
(all four overrides survive) and reconciles both unmarked deep deviations in `drifted/page.jay-html`.

### Issue 2 — `prettifyHtml` drops a space when reflowing wrapped text (FIXED)

Running `sync` on a page whose body has a `<p>` spanning two source lines reflowed the text and joined the
two words across the wrap boundary (`… jay-stack validate reports …` → `… jay-stack validatereports …`).
A text-node whitespace-collapse bug in the prettifier, surfaced by the sync write-back path (independent of
the composition machinery — it bit any sync that reflowed wrapped prose).

**Root cause.** `prettifyHtml` (`compiler-shared/lib/prettify.ts`) pre-normalized the author's line
wrapping before handing markup to `js-beautify` by joining trimmed lines with `''`. A newline inside a text
node is significant HTML whitespace that renders as one space, so the empty join welded the words on either
side of a wrap boundary (`validate\nreports` → `validatereports`). The pre-collapse is deliberate — it makes
`prettifyHtml` a strong normalizer, which sync's change detection relies on (it compares
`prettifyHtml(merged) !== prettifyHtml(rawPage)` as **strings**, so both sides must normalize incidental
whitespace identically).

**Fix (implemented).** The line-collapse now inserts a single space **only** where the wrap boundary sits
between two text characters (prev char ≠ `>` and next char ≠ `<`); at any boundary touching a tag it still
joins with nothing, so element-to-element spacing is byte-identical to before (zero regressions across the
compiler/jay-html/inline-composition/stack-cli/stack-server-build suites). While fixing this we found the
same pre-collapse **also** corrupted `<script type="application/jay-data">` YAML — collapsing its lines
flattened the nesting (and the new space made `data:\n title:` → `data: title:`, invalid YAML). So jay-data
blocks are now swapped for an empty-`<script>` placeholder before formatting and restored **verbatim**
after, leaving their indentation/nesting intact (JS `<script>` and `<style>` are still beautified as
before). Landed in `prettify.ts`; tests in `compiler-shared/test/prettify.test.ts`. Verified end-to-end:
`yarn sync` on `drifted/page.jay-html` leaves the wrapped `<p>` byte-identical and touches only the two
intended drift reconciliations.

> Note — sync change detection is a **string** compare (`prettifyHtml(a) !== prettifyHtml(b)`), which is
> why a prettifier whitespace bug surfaces here. This is distinct from the DL#196 **drift differ**
> (`diffBodies`/`diffMarkup`, used by `validate`), which is a **DOM-model**, facet-granular compare (Q3).

### Issue 3 — `sync` scanned the whole project root, sweeping in `build/` copies (FIXED)

The first `yarn sync` after a dev/build run failed on the flattened page copies the build emits under
`build/dev/pre-rendered/**/page.jay-html`: their `template=` provenance resolves against the build tree
(`build/dev/pre-rendered/components/section/section.jay-html`), which does not exist, so each errored with
`cannot resolve template … for <jay:section>`. Root cause: `resolveTargets` globbed
`${projectRoot}/**/*.jay-html` — the entire project — whereas `validate` scopes discovery to the config's
`pagesBase` + `componentsBase`.

**Fix (landed).** `runSync` now loads `.jay` config and scans only `pagesBase` + `componentsBase`
(resolved against the project root), mirroring `validate`. Build output, `dist/`, and `node_modules/` are
never touched. Regression test: `run-sync.test.ts` › `resolveTargets — discovery scoping` (a fixture with a
`build/dev/pre-rendered/page.jay-html` proves it is excluded).

## Refinement — CSS instance duplication: coalesce identical `@scope` blocks (§4/§5)

**Status: DESIGN — awaiting approval before implementation.**

### Problem

The materialiser wraps each region's copied CSS in `@scope (.<ref>)`, keyed on the region's `ref`
(`materialise.ts:102-114`). When a page holds several instances of the same component, each instance emits
its own block — byte-identical except for the scope selector. The design-system-demo `branded` route CSS
shows it: two `card` instances (`cardStarter`, `cardPro`) yield two identical copies of the whole
`.ds-card` / `.ds-card__heading` / `.ds-card__body` / `.ds-button` rule set, differing only in
`@scope (.cardStarter)` vs `@scope (.cardPro)`:

```css
@scope (.cardStarter){.ds-card{…}.ds-card__heading{…}.ds-card__body{…}.ds-button{…}}
@scope (.cardPro)    {.ds-card{…}.ds-card__heading{…}.ds-card__body{…}.ds-button{…}}
```

Most instances carry **no** CSS override, so this is pure duplication that grows linearly with instance
count. But when an instance _does_ own a CSS facet (`/* jay:override */`), per-instance scoping is exactly
what lets its block diverge — so we cannot simply scope by component and drop the ref.

### Constraint from the drift model (answers "top-level scoped vs. effective CSS?")

The CSS drift compare is **per-region, block-for-block, and structural — it does not resolve the cascade**.
`checkRegionCssDrift` (`validate.ts:931-936`) isolates a region's CSS by pulling its own top-level
`@scope (.<ref>)` block out of the page's aggregated CSS (`extractScopeBlock(pageCss, `.${ref}`)`) and hands
that block to `diffCss`, which compares its declared rules/declarations against the source template's
`<style>` selector-by-selector, treating `@scope` as transparent (`diff-css.ts:157-170`). It never computes
"what CSS effectively applies to the region's elements." The model rests on one invariant:

> **one region ↔ one top-level, ref-keyed `@scope` block that holds that region's complete CSS.**

Any dedup that splits a region's CSS across a shared block + a per-instance delta breaks this invariant and
forces the differ to compute effective (cascaded) CSS — a mechanism that deliberately does not exist today.

### Options (null hypothesis first)

**A — shared base block + per-instance delta (layered `@scope`).** Emit the component CSS once under a
shared component class; per instance emit only the overridden declarations and rely on cascade order for
the delta to win. Maximally deduped even under partial overrides. **Rejected for v1:** it breaks the
invariant above — `extractScopeBlock(.<ref>)` no longer returns the region's full CSS, so the drift checker
would need cascade resolution (base ⊕ delta), plus a shared-class stamping pass and a source-order/
specificity guarantee. Large new surface to optimise the _rare_ partial-override case.

**B — coalesce blocks by (template, overrides) into one selector-list `@scope` (chosen).** Keep emitting
per-instance, but at aggregation merge the `@scope` blocks of regions that share the **same source template
and the same override set** into a single block whose scope-start is the union of their selectors (`@scope`
accepts a `<forgiving-selector-list>`):

```css
@scope (.cardStarter, .cardPro){.ds-card{…}.ds-card__heading{…}.ds-card__body{…}.ds-button{…}}
```

The coalescing key is the region's **`template=` provenance path**, not the block's byte content:

- Same component, **same template**, no overrides → coalesce (the common case; the `branded` route above
  should emit one `.cardStarter, .cardPro` block, not two identical ones).
- Same component, **different templates** → **do not** coalesce, even if the two bodies happen to be
  byte-identical today: they are independent sources that can diverge on the next `sync`, and each must keep
  its own block so its drift check tracks its own template.
- Same template, **different override sets** → **do not** coalesce: an instance that owns a CSS facet has a
  different effective body, so it keeps its own block.

This **preserves the invariant**: every region's CSS is still one contiguous block body equal to its
effective CSS; the differ stays block-for-block with no cascade resolution. It is a serialization-layer
optimisation, not a change to the composition or drift model. Chosen on the minimise-new-surface principle.

Trade-off (accepted): dedup is all-or-nothing per instance — a single override re-duplicates that
instance's whole block. Overrides are the exception, so this is the right cost/benefit; Option A is the
future escape hatch if partial-override duplication ever becomes the dominant cost.

### Where the CSS lives (single source point)

The route CSS is not a separate artifact — `generate-ssr-response.ts:498-501` writes `parsedJayFile.css`
(the page's parsed `<style>`, aggregated by the parser at `jay-html-parser.ts:1115`) verbatim to the route
`.css` file. So the page `<style>` **is** the canonical CSS: `sync`/materialise produce it, `validate` reads
the same `jayHtml.css`, and the build inherits it. Coalescing therefore lands at exactly one point (the page
`<style>`), and its canonical form is what `validate` enforces and the build emits — no separate build-path
change is needed.

### Design (Option B)

1. **Coalesce in the materialiser aggregation** so the coalesced form is the single canonical output of
   `materialise` (both the page `<style>` / route-CSS path and `sync` consume it). Group the collected
   `cssBlocks` by **coalescing key = (template provenance path, override-set)**, preserving first-seen
   order; for each group emit one `@scope (<comma-joined selectors>) { <body> }`. Blocks with no `@scope`
   wrapper (a ref-less region, `materialise.ts:112`) are passed through unchanged.
2. **`scope-css.ts` becomes selector-list aware.** `splitScopeBlocks` must return, for a coalesced block,
   the _set_ of member selectors (or be consumed per-member); `extractScopeBlock(css, `.<ref>`)` must match
   when `.<ref>` is **one member** of a block's scope-start list, not only when it is the sole selector
   (today's regex assumes a single selector, `scope-css.ts:16-18`). This keeps `checkRegionCssDrift`
   unchanged — it still asks for "the block for `.<ref>`" and gets that region's full body.
3. **`sync`'s `mergeScopeCss` stays per-ref granular** (`run-sync.ts:94-115`). Its non-destructive rule is
   "append a region's block only if the page does not already scope that selector." For a coalesced
   materialiser block covering `{a, b}`: check each member against the page's existing `<style>`
   independently; append a block scoped to just the **missing** members (re-narrowing the selector list),
   so a page that already hand-scopes `.a` still gets `.b` added, and neither is duplicated.

### Validation phase (the main effort)

Coalescing only pays off if `sync`'s assumptions are guaranteed to hold on the pages `sync` will touch. Per
the prevention order (validation first), the real work is a `validate` rule set that enforces the canonical
CSS form up front — so a validate-clean page is one where every region's CSS is scoped exactly per template
and overrides, which is precisely what `sync` relies on. New rules in `checkRegionCssDrift`
(`validate.ts:903-939`), each keyed to the region walk over `collectRegionElements(jayHtml.body)`:

- **`CSS-SCOPE-MISSING`** — a region whose template carries CSS has no `@scope` block that contains its ref.
  Today `extractScopeBlock` returning `undefined` is silently skipped; make it an error so a dropped region
  block is reported rather than passing as "no drift."
- **`CSS-SCOPE-MIXED-TEMPLATE`** — a single `@scope (…)` block's selector-list mixes refs that resolve to
  **different templates or different override sets**. That block violates the coalescing key (its body cannot
  be correct for all members at once), so `sync` could not have produced it and its members' drift checks are
  ambiguous. Report it and point each offending ref at its own template.
- **`CSS-SCOPE-NOT-COALESCED`** — two or more blocks share the same coalescing key (same template, same
  overrides) but are emitted separately. This is the duplication the refinement removes; flag it so the page
  is brought to canonical form. (Warning, not error: it is redundant, not incorrect.)
- **content drift (existing `diffCss`)** — unchanged: for each region, diff the extracted block against its
  source template CSS; unmarked deviations remain drift, `/* jay:override */`-marked facets are suppressed.

Each rule's remediation `suggestion` is **run `jay-stack sync`**, which re-materialises the canonical form.
This establishes the invariant **validate-clean ⇔ sync-clean** for CSS (mirroring the Issue 1 fix
philosophy): if `validate` reports no CSS findings, a subsequent `sync` is a no-op; if `sync` would change
the CSS, `validate` names exactly why.

### Resolved questions

1. **Coalesce across different components, or only instances of the same one?** — Coalesce by **template**
   provenance (+ override set), not by body. Instances of the same component through the **same** template
   merge (the stated problem); the same component through **different** templates, or with different
   overrides, stay separate — even if byte-identical today — because they are independent sources that can
   diverge on the next `sync` and each must track its own template's drift.
2. **Byte-identical or normalized bodies?** — Body equality is not the key at all; the key is
   (template path, override set). Within a coalesced group the bodies are byte-identical on the materialiser
   output by construction (same source template CSS, only the selector differs), so no body normalisation is
   needed.
3. **Canonical form / round-trip.** — The model is deliberately simple: **exactly one scoped block per
   (template, overrides) group** — i.e. per region, or per group of regions sharing template _and_
   overrides. This canonical form is a **requirement enforced by `validate`** (rules above), not merely
   tolerated by the read helpers, so `sync` may assume it. A page hand-split into separate per-ref blocks of
   the same group is reported by `CSS-SCOPE-NOT-COALESCED` and normalised by `sync`; the read helpers still
   accept either form so validate/sync can operate on a not-yet-canonical page to fix it.

### Verification criteria

- A page with N override-free instances of a component **through the same template** emits **one**
  `@scope (…)` block (selectors comma-joined), not N — asserted on the design-system-demo `branded` route
  CSS. Two instances through different templates keep two blocks.
- An instance that owns a CSS facet (`/* jay:override */`) keeps its **own** block; `validate` still reports
  zero drift for it and drift for an unmarked deviation — unchanged from today, at every nesting depth.
- `validate` reports `CSS-SCOPE-MISSING` for a region whose block was deleted, `CSS-SCOPE-MIXED-TEMPLATE`
  for a hand-merged block spanning two templates, and `CSS-SCOPE-NOT-COALESCED` for same-group duplicate
  blocks — each with `suggestion: run jay-stack sync`.
- **validate-clean ⇔ sync-clean:** on a canonical page `sync` is a no-op; running `sync` on any page that
  `validate` flagged for CSS produces a page that `validate` then reports clean.
- `extractScopeBlock(pageCss, `.<ref>`)` returns the region's full body whether that ref is coalesced or
  standalone; `checkRegionCssDrift` content-drift output is identical before/after coalescing for the same
  logical CSS.

### Implementation results (CSS coalescing)

Landed. All target suites green: `compiler-inline-composition` (73), `stack-cli` (100), design-system-demo
smoke (5). Files: `materialise.ts` (coalesce by template key), `scope-css.ts` (selector-list awareness +
tokenizer/normalizer), `run-sync.ts` (`mergeScopeCss` reconciliation), `validate.ts`
(`checkRegionCssScoping` + `CSS-SCOPE-MISSING`).

**Deviation from Design point 3 — `mergeScopeCss` is a reconciliation, not append-only.** The design said
sync stays "per-ref granular… append a region's block only if the page does not already scope that selector."
That is insufficient: a page that already carries **separate** per-ref blocks (a legacy sync, or hand
authoring) would never be collapsed, so `sync` could not fix a `CSS-SCOPE-NOT-COALESCED` finding and the
**validate-clean ⇔ sync-clean** invariant would break (proven on the example: all three pages were flagged
NOT-COALESCED and append-only left them flagged). `mergeScopeCss` now reconciles the page `<style>` against
the materialiser's canonical output: for each region block it keeps only the members whose CSS **diverges**
from canonical (an override or unmarked drift — detected via `normalizeCssBody`, which is whitespace/`;`- and
comment-tolerant so a prettified block still matches raw template CSS), drops members equal to canonical, and
re-emits one coalesced block per template group for the non-overridden members. Raw and unrelated CSS is
preserved in place. This still never rewrites an override, is idempotent (re-sync of a canonical page is a
no-op after prettify), and it _does_ satisfy the invariant — verified end-to-end (`validate` clean after one
`sync`; `sync` reports "already in sync" on re-run for the two non-drifted pages).

Everything else landed as designed: coalesce keyed by template path (`materialise.ts`), selector-list-aware
`extractScopeBlock`/`splitScopeBlocks` (`scope-css.ts`), and the three validate rules
(`CSS-SCOPE-MISSING` inside `checkRegionCssDrift`; `CSS-SCOPE-MIXED-TEMPLATE` + `CSS-SCOPE-NOT-COALESCED` in
the new `checkRegionCssScoping`), all with `suggestion: Run jay-stack sync`.

## Refinement — `@scope` root-matching: route a component's root-block rule through `:scope`

**Status: IMPLEMENTED.**

### Problem

Reported from the `design-system-demo`: a flattened component's **own root-block rule does not style the
region's root element.** On the pristine page the `.ds-card` rule (border, padding, background, radius) had no
effect on `<div class="ds-card cardStarter">` — the element at the root of the `@scope`.

### Root cause

Inside `@scope (.<ref>) { … }`, scoped selectors match **proper descendants of the scope root only** — the
scope root element itself is matchable **solely via `:scope`** (verified empirically in Chromium via
Playwright, not just from spec memory). So `.ds-card { … }` inside `@scope (.cardStarter)` never matches the
`.ds-card` element that _is_ the scope root. The ref is stamped as a scope-anchor class on that same root
element (`.cardStarter`), which is exactly what makes it the scope root and therefore unreachable by its own
block class.

### Fix — `scopeReadyCss` (shared emit/validate transform)

Before wrapping a component's CSS in `@scope`, rewrite every selector class-token equal to one of the
template body's **root-block classes** to `:scope`:

- `.ds-card` → `:scope`
- `.ds-card.active` → `:scope.active` (compound preserved)
- `.ds-card .ds-card__heading` → `:scope .ds-card__heading` (only the root token rewritten)
- `.ds-card__heading`, `.ds-button` (descendants) → unchanged

Implemented in `compiler-inline-composition/lib/materialise.ts` as `scopeReadyCss(templateBody, css)` +
`rootClassesOf(templateBody)` (postcss selector walk; malformed CSS emitted verbatim, matching `diffCss`
resilience). The root-block class set is derived from the top-level elements of the template body, so it is
BEM-agnostic. The transform is applied **only** on the scoped branch (ref present) and **before** coalescing,
so same-template instances still produce byte-identical bodies and merge.

**Consistency requirement:** `diffCss` keys rules by selector, so the identical transform must run on both
sides of the diff. `validate.ts checkRegionCssDrift` now runs `scopeReadyCss` on the raw template CSS (via the
template body) before diffing, so a correctly flattened `:scope`-form region reports no drift. Ref-less /
global CSS keeps plain class selectors (no `@scope`, nothing to rewrite).

Verified end-to-end: after migration, the card root computes `border: 1px solid`, `padding: 20px`,
`background: #fff`, `border-radius: 10px` in the browser (previously all defaults).

### Follow-on — sync must migrate _unmarked_ CSS drift (invariant fix)

Switching emission to `:scope` exposed a pre-existing gap: `mergeScopeCss` preserved **any** divergent block,
so it treated a page's old `.ds-card`-form block as a divergence and never migrated it — leaving `validate`
flagging CSS drift that `sync` could not resolve (a direct violation of **validate-clean ⇔ sync-clean**: the
page was sync-stable yet validate-dirty). Root cause: "diverges from canonical" conflated an intentional
marked override with unmarked drift.

Fix (`run-sync.ts mergeScopeCss`): a divergent region block is preserved **only if it carries a
`/* jay:override … */` pragma** (`hasOverrideMarker`). A block that diverges **without** a marker is unmarked
drift — overwritten back to the canonical coalesced block, exactly as markup drift is re-flattened on sync.
This makes `sync` able to _migrate_ a page to a new canonical form and restores the invariant. The example's
three pages migrated to `:scope` form with a single `sync`; `validate` then reports only the two intended
markup drifts on `/drifted` and no CSS drift.

**Limitation (documented, not a bug):** `sync` cannot migrate a block that both diverges and is marked
`/* jay:override */` — a marked block is owned by the author and always preserved verbatim. Such a block must
be hand-migrated. No example page carries a CSS override marker, so all three migrated automatically.

### Tests

- `compiler-inline-composition/test/materialise.test.ts` — root-block → `:scope` rewrite, incl. compound/
  descendant preservation (74/74).
- `stack-cli/test/run-sync.test.ts` — new `two-cards-stale-css` fixture asserts an unmarked stale `.card`-form
  block is overwritten to the canonical `:scope` coalesced block; the marked `two-cards-one-scoped` override is
  still preserved (8/8).
- `stack-cli/test/validate.test.ts` + full suite (101/101); `design-system-demo` smoke (5/5).
