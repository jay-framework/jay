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
because of Tier-2 *inlining* constraints the passthrough model removes:

- **`page-with-foreach-in-pure-composite` + `page-tier2-root-parent` — deleted.** With a no-code region
  backed by the passthrough (its ViewState = props), there is no inlining scope to constrain: neither a
  `forEach` inside the region nor a root-level `$parent` is a special compile-time case anymore.
  Removed both fixtures and their `it(...)` blocks (element trusted + hydrate for the forEach case,
  element for the root-parent case), plus the now-orphaned `forEachInsidePureComponentError` /
  `rootParentInInlinedCompositeError` imports in the tests. **The helper functions stay in `lib`** —
  still referenced by `parseHeadfullFSImports` / the inlining path until the legacy path is deleted.
- **`page-tier2-recursion` — recursion detection moves to `jay-stack validate`.** A `<jay:X>` self-cycle
  is a cycle in the *flatten* graph, not the (now-deleted) compile-time inline-expansion graph, so it is
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
