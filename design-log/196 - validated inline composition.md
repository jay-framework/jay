# Design Log #196 — Validated inline composition

Status: **DESIGN — for review, not implemented.** Supersedes the composition model of DL#181, #187,
#193 and #194. Read DL#195 (retrospective) first — it supplies the evidence this design argues from.

## Decisions for the Implementer (TL;DR)

**The proposal in one sentence: a headfull component's `.jay-html` stops being a compile-time input
at the usage site and becomes a _source template_ that the usage site copies, owns, and is _validated
against_.**

1. **A component's `.jay-html` is materialised into the page file.** Not injected by the compiler at
   build time — physically present in `page.jay-html`, authored by whoever composed the page (human,
   agent, or design tool). The `<jay:X>` tag remains, carrying **provenance** (source path +
   content hash), not indirection.

2. **Materialised content compiles through one of two _existing_ mechanisms, chosen by
   `hasCodeFile`** — no new codegen path, no new runtime primitive:
   - **Component has a `.ts` → it is a headless component.** The copied body is its **inline
     template**, exactly as DL#84 already defines. Bindings resolve against the component's
     ViewState; contract-declared refs are handed to the component's own code
     (`headless-instance-context.ts:164-169`, `interactiveConstructor(signalProps, refs, …)`).
     This mechanism ships today and is untouched.
   - **Component has no `.ts` → the copy is plain page markup.** The `<jay:X>` tag is erased at
     compile; bindings resolve at page scope; refs are page refs. No boundary, no projection.

3. **Drift is a validation concern, not a compile concern.** `jay-stack validate` compares each
   materialised body against its source and reports deviations. A deviation is resolved by (a)
   syncing to source, or (b) marking it `@jay:override` with a reason. Unmarked drift is a
   **warning**, not an error — the page still builds.

4. **Deviations are fixable in bulk.** `jay-stack sync` performs a three-way merge (base = source at
   the recorded hash, theirs = source now, mine = the local copy) across one site or all N sites of a
   component.

5. **Multiple source templates per component are just multiple files.** The recorded provenance names
   the file; the hash names the revision. No `jay-html="C"` variant vocabulary is needed.

6. **`<override>`, `slot`, Tier 2 inlining, ref forwarding and `__parentContext` are all deleted.**
   You do not override a copy — you edit it. See "What is removed".

**Non-obvious constraints:**

- **This does not remove the runtime boundary for coded components — it makes the boundary honest.**
  A headless component's inline template binds its ViewState _because that is the data the component
  produces_. DL#195 V6 stands: a `.ts` owns its own reactive graph (`component.ts:148`) and cannot be
  inlined. What is removed is the _headfull_ pattern, where a component supplied both markup and code
  and the usage site had to reach across the seam to touch either.
- **Provenance must survive the parser.** The copy's identity is a compile-time-erased marker; where
  it lives (attribute on `<jay:X>` vs. comment) is **Q4**, and comments are not obviously preserved.
- **The differ is the only genuinely new hard problem.** Everything else is subtraction. Build it
  first (Phase 1), before deleting anything.

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
| Tier 2 alias overlay (DL#194 Phase B)            | `expression-compiler.ts:148`, `jay-html-compiler.ts:523`                                                          | **No longer needed.** It exists to project contract fields onto usage-site expressions. If the author writes the usage-site expression directly, there is nothing to project. |
| `<override>` (DL#181/#194)                       | `jay-html-overrides.ts`                                                                                           | **Superseded.** You edit the copy.                                                                                                                                            |
| `slot` contract tag (DL#194)                     | `contract.ts:13`                                                                                                  | **Superseded.** The whole body is editable; there is no need to declare which region is.                                                                                      |
| `$parent` carrier (DL#193 Capability A)          | `context.ts:178,214,222`; `element.ts:468`                                                                        | **Independent** — see Q8.                                                                                                                                                     |
| Component CSS collection                         | `jay-html-parser.ts:1262-1263`, `:1559`                                                                           | **Partially.** Component CSS is already merged into the page today. Whether it keeps travelling from the source file or is copied too is **Q5**.                              |
| `checkHeadlessInstanceProps` + validation host   | `stack-cli/lib/validate.ts`                                                                                       | **Yes, as the home for the drift rule** — the validator is already the prevention-first surface (DL#145/#147/#166/#167).                                                      |
| `prettifyHtml`                                   | `compiler-shared`                                                                                                 | **Partially** — gives syntactic normalisation for the differ; semantic equivalence is still ours to define (**Q3**).                                                          |

**Net new surface proposed: a differ, a materialiser, a sync tool, and two markers.** All in
`stack-cli` / the validator. **No runtime change, no codegen change, no per-target derivation.**

## Questions and Answers

**Q1. Does a coded (`.ts`-bearing) component stop shipping UI?** This is the load-bearing decision.
Under this design a coded component is a **headless** component: contract + code, UI supplied by the
usage site. Its `.jay-html`, if it has one, is a _starter template_ the usage site copies — not a
runtime artifact. This is what makes DL#195 V6 (a `.ts` cannot be inlined) a non-problem rather than
a Fork C.

Cost, stated plainly: a **plugin can no longer ship UI that updates on upgrade**. DL#39/#60 plugins
currently deliver working headfull components; under this design they deliver a contract, code, and a
template you copy. On upgrade, your copies _warn_ instead of changing. That is arguably the correct
behaviour — a plugin bump silently redesigning your pages is not obviously desirable — but it is a
product decision, not a compiler simplification.
_**OPEN — needs explicit approval before anything else is decided.** Recommendation: yes. It is the
only answer that actually removes the seam, and it matches the existing, working headless model._

**Q2. Does materialisation flatten transitively?** If `card.jay-html` contains `<jay:Button>`, does
the copy in the page contain Button's markup too, or the `<jay:Button>` tag?
_Answer: **copy one level; keep nested `<jay:X>` tags as tags.** Each nested tag is itself a
materialisation site with its own provenance, materialised on demand. Flattening transitively would
make a change in a shared leaf component propagate a diff into every ancestor's copy (the diamond
problem, loudly), and would make the differ's base ambiguous. One level keeps each diff local to one
source file._

**Q3. What exactly is the equivalence relation the differ uses?** Two materialised copies of the same
source will legitimately differ in whitespace, attribute order, and quoting. They will also
legitimately differ in **bindings**, because the copy binds page data where the source bound contract
fields.
_Answer (partial): normalise syntax with `prettifyHtml`, then compare the tree structurally. Bindings
are compared **modulo the substitution map recorded in the provenance** (see Design §3). Open
sub-questions: `ref` renaming (**Q6**), and whether a changed `class` is drift or styling._
_**OPEN in detail — this is the risky core and Phase 1 exists to de-risk it.**_

**Q4. Where does provenance live?** It must survive the jay-html parser, be invisible in rendered
output, and be editable by hand and by tools.
_Recommendation: **attributes on the existing `<jay:X>` tag** — `jay-source` (path) and `jay-rev`
(content hash) — following the `jc` precedent (`jay-html-parser.ts` injects `jc="<contract>"` on
inlined instances, and DL#186 added it to the validator skip list). HTML comments are the obvious
alternative but their preservation through the parser is unverified._
_**OPEN — verify comment handling before choosing.**_

**Q5. Where does the component's CSS come from?** Today the parser collects a headfull component's
CSS and merges it into the page (`jay-html-parser.ts:1262-1263`, `:1559`), keeping the component's
stylesheet a black box (DL#181 A5). If the markup is copied but the CSS is not, the copy references
classes the page does not define.
_Options: (a) keep collecting CSS from the source file via the `<jay:X>` provenance — markup is
owned, styling is still referenced; (b) copy the CSS too, into the page's `<style>` or a sibling
file. (a) preserves the black box and keeps upgrades flowing for styling; (b) is consistent with
"you own the copy" but multiplies CSS across pages._
_**OPEN. Recommendation: (a)** — it is strictly less change, and DL#181 A5's per-property cascade
argument (never read or modify the component's stylesheet) still holds._

**Q6. Ref name collisions.** Twenty copies of `card` on one page each carry `ref="cta"`. Today the
composite boundary namespaced them (`refs.signupCard.cta`).
_Recommendation: the `<jay:X ref="signupCard">` wrapper keeps namespacing for the **coded** case (it
is a real headless instance, refs nest under it as today). For the **no-code** case the tag is erased,
so refs land flat in page scope and collide. Either require a `ref` on the wrapper and nest under it
(consistent with DL#194's `overrideRequiresExplicitRefError`, `jay-html-parser.ts:1367`), or require
the author to rename. **Recommendation: keep the wrapper `ref` and nest** — same author-facing shape
in both cases, and the mechanism already exists as a compile-time utility (`nestRefs`,
`compiler-shared/lib/render-fragment.ts:66`; already used to nest an inline body under a usage ref
name at `jay-html-compiler.ts:1082`)._
_**OPEN — confirm the no-code nesting is worth keeping the wrapper element in the ref tree.**_

**Q7. Is there a case that genuinely still needs a runtime headfull boundary?** (DL#195 Q4.)
Recursion is the known one — DL#194 already forbids it for Tier 2 and directs the author to add a
`.ts`. Under this design, a recursive component is a coded component using the existing `<recurse>`
mechanism (DL#46/#47), which is untouched.
_Answer: **recursion is covered; no other case identified.** If review surfaces one, it is an
escape-hatch question, not a model question._

**Q8. Does DL#193 Capability A (`$parent` inside `forEach`) survive?** It is the only piece of the
crossing machinery with standalone author value, and it has a working dual regular/secure example.
Nothing in this design needs it: copied content is page-native, so there is no compiler-internal
`$parent`.
_Recommendation: **keep it, decoupled.** It costs `context.ts:178,214,222`, the `dependsOnParent`
gates (`element.ts:468,488,501`) and the grammar — roughly 51 grep hits — and it answers a real
author question ("bind a page field from inside a list") that this design does not otherwise address.
Dropping it returns `ConstructContext` to a construction-time snapshot, which is a further
simplification if you would rather not carry it._
_**OPEN — a judgement call, not a blocker either way.**_

**Q9. What triggers materialisation?** A CLI command (`jay-stack add card`), an editor/design-tool
action, or an agent following the agent-kit?
_Recommendation: **all three, over one library function.** The CLI is the testable surface; the
editor (DL#42) and the Designer agent-kit call the same function. Do not let three implementations
of "copy and stamp provenance" exist._

**Q10. Is unmarked drift an error or a warning?** Prevention-first (CLAUDE.md) argues error; but a
copy the author deliberately edited is the _normal_ case, not a mistake.
_Answer: **warning.** The page builds. Drift is information, not breakage — the error case is a
provenance reference that does not resolve (missing source file), which is genuinely broken._

**Q11. Does `/nested-composition`'s enclosing-instance-scope fix (`ccf62d14`) survive?**
_Open (DL#195 Q3). Headless instances can still nest under this design, so the fix may be
independently correct. Trace before discarding._

## Design

### 1. Component definition — unchanged in shape

```
components/card/
  card.jay-contract     # the contract (unchanged)
  card.ts               # optional. Present → headless component (makeJayStackComponent)
  card.jay-html         # source template(s) — authoring artifact, not a build input at usage sites
  card-compact.jay-html # a second variant is just a second file (Q1 of DL#181's #6 request)
```

### 2. Usage site — materialised, with provenance

**No-code component** (no `card.ts`) — the tag is provenance only and is erased at compile:

```html
<!-- page.jay-html -->
<jay:card ref="signupCard" jay-source="../components/card/card.jay-html" jay-rev="a3f9c1">
  <div class="card">
    <h3>{item.title}</h3>
    <!-- page scope, written directly — no {heading} projection -->
    <div class="card-body">
      <jay:Counter ref="cta" />
      <!-- nested tag stays a tag (Q2) -->
    </div>
  </div>
</jay:card>
```

Compiles as plain page markup. `item.title` resolves at page scope. `refs.signupCard.cta` is a page
ref (Q6). No alias overlay, no `__parentContext`, no re-basing.

**Coded component** (`card.ts` present) — the tag is a real headless instance, the body is its inline
template (DL#84, unchanged):

```html
<jay:card ref="signupCard" jay-source="../components/card/card.jay-html" jay-rev="a3f9c1">
  <div class="card">
    <h3>{heading}</h3>
    <!-- card's ViewState — correct: the card computes it -->
    <button ref="cta">{ctaLabel}</button>
    <!-- contract ref → card.ts consumes it -->
  </div>
</jay:card>
```

The binding scope here is _not_ a compromise: `{heading}` is card's data because card produces it.
This is the distinction DL#195 L1 was missing — the old model made the usage site reach _across_ a
seam; this model puts the usage-site-authored content _inside_ the seam by construction, which is
what the headless mechanism has always done.

### 3. Provenance and the substitution map

`jay-rev` is the content hash of the source template at copy time — the **merge base**. For the
no-code case the copy's bindings were rewritten from contract fields to page expressions at
materialisation, so the substitution map must be recorded too:

```html
<jay:card
  jay-source="../components/card/card.jay-html"
  jay-rev="a3f9c1"
  jay-bind="heading={item.title}; status=success"
></jay:card>
```

This is the same `heading := item.title` projection `buildInlineAliases`
(`jay-html-compiler.ts:523`) computes today — **relocated from codegen into provenance metadata.**
The differ replays it to compare copy against source. (Shape of `jay-bind` is a detail; it may be
simpler to keep the props as ordinary attributes on the tag and derive the map, as today.)

### 4. Drift validation

A new rule in the validator (`stack-cli/lib/validate.ts`, DL#145-style pluggable):

For each `<jay:X jay-source jay-rev>`: load the source, normalise both sides, apply the substitution
map, diff structurally. Report per deviating node:

```
warning  page.jay-html:14  <jay:card> content differs from ../components/card/card.jay-html
  · <h3> text changed        "{heading}" → "{item.title} — on sale"
  · <p ref="disclaimer">     removed
  Source has also changed since jay-rev=a3f9c1 (now b71e02).
  Run `jay-stack sync page.jay-html#signupCard` to merge, or mark the node @jay:override.
```

Suppression, per node:

```html
<h3 @jay:override="page-specific headline">{item.title} — on sale</h3>
```

### 5. Sync — three-way merge

`jay-stack sync [<target>] [--all]`:

- **base** = source at `jay-rev`, **theirs** = source now, **mine** = the materialised copy.
- Nodes unchanged in _mine_ take _theirs_ and `jay-rev` advances.
- Nodes changed in both are conflicts, reported for resolution; `@jay:override` nodes are kept and
  not reported.
- `--all` applies across every site of a component in the project. This is the answer to "100
  instances with the same copied content".

### 6. What is removed

In dependency order (Phase 4):

| Removed                                                                                                                                             | Source DL        |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `jay-html-overrides.ts` in full — both `<override>` forms, pragma, markers                                                                          | #181, #193, #194 |
| `slot` contract tag, slot validation, slot fill paths                                                                                               | #194             |
| Fork C: `foreignChild`, `childComp`'s `slots` param, slot ref managers + two traps, `slotPreambles`                                                 | #194             |
| Tier 2 inlining: `aliases`/`inlinedRoot`/`withRootVarName` on `Variables`, `buildInlineAliases`, `renderInlinedStructuralInstance`, its server twin | #194             |
| Ref forwarding: `getForwardedInnerRef`, `hasForwardedInnerRef`, collection trap, `childComp`'s `refViewState`, `emittedForwardedRefHelpers`         | #193             |
| `__parentContext` / `withSyntheticParentContext` / `PARENT_CONTEXT_PROP`                                                                            | #193             |
| `withParentShift` / `PARENT_SCOPE_PRAGMA` / `lexicallyInScope` / `asLexical`                                                                        | #193             |
| Tier 2 runtime: `structural-coercions.ts`, `passthrough-component.ts`, the `structural` flag (~106 sites), the empty-contract unwrap                | #162, #187       |
| Tier 2 restrictions: recursion guard, root-`$parent` guard                                                                                          | #194             |
| Compile-time headfull template injection at usage sites                                                                                             | #111             |

Retained unchanged: DL#189, #190, #192, the class-names utility, the headless-instance props channel
(DL#195 V4), `<recurse>` (DL#46/#47), and — pending Q8 — Capability A.

## Implementation Plan

**Phase 1 — the differ (de-risk first, delete nothing).** Build normalisation + structural diff +
substitution replay + `@jay:override` suppression as a standalone library in `stack-cli`, unit-tested
against fixture pairs (source template, materialised copy, expected diagnostics). **Prove it against
the existing Tier 2 usage sites on this branch** — they already inline, so their generated output is a
known-good oracle. Nothing else starts until this is green. _This is the only part whose difficulty
is unknown; everything after it is subtraction._

**Phase 2 — provenance + materialiser.** Settle Q4 (marker location, verify parser preservation) and
Q5 (CSS). One library function, exposed as `jay-stack add`; editor and agent-kit call the same
function. Validation rule wired into `stack-cli/lib/validate.ts` and surfaced in the dev build
through `stack-cli/lib/run-validate.ts:36` `surfaceValidationIssues` — reuse DL#189's shape,
including its Rollup dead-code gotcha (return a boolean; the `process.exit(1)` stays at the call
site, `run-production.ts:73-78`).

**Phase 3 — sync / three-way merge.** Per-site and `--all`. Conflict reporting with exact messages
(tested by string equality, per CLAUDE.md).

**Phase 4 — deletion.** In the order of the table above, each as its own labelled commit so the diff
documents the model. Run the full `yarn confirm` between groups; the 803 compiler / 291 runtime / 741
dev-server / 66 smoke tests are the regression oracle.

**Phase 5 — examples and smoke migration.** `/combined`, `/foreach-composite`, `/nested-composition`,
`examples/jay/override-ref-forwarding`, `examples/jay/ref-forwarding` all rewrite to materialised
copies. `/nested-composition` is the interesting one — it becomes flat page markup and its `it.fails`
SSR assertion should either pass or the page should cease to exist (resolve Q11 here).

**Phase 6 — agent-kit.** Designer guide: how to materialise, what drift warnings mean, when to mark
`@jay:override` vs sync. Plugin guide: your component ships a contract, code, and a template — not a
running UI (Q1's consequence).

Per CLAUDE.md: fixtures first, full `toEqual`, never `toContain` on code.

## Examples

**✅ Materialise, then edit freely** — no `<override>` vocabulary:

```html
<jay:card ref="promo" jay-source="../components/card/card.jay-html" jay-rev="a3f9c1">
  <div class="card featured">
    <!-- class edited; drift warning unless marked -->
    <h3 @jay:override="promo headline">Half price this week</h3>
    <div class="card-body"><jay:Counter ref="cta" /></div>
  </div>
</jay:card>
```

**✅ The old `remove`** — just delete the node from your copy (and mark it, or sync will restore it).

**✅ The old attribute/style merge** — edit the attribute in your copy.

**❌ Provenance that does not resolve** — hard error, not a warning (Q10):

```html
<jay:card jay-source="../components/gone/gone.jay-html" jay-rev="a3f9c1">…</jay:card>
<!-- error: jay-source does not resolve -->
```

## Trade-offs

| Approach                                                         | Pro                                                                                                                                                                                                                                                                               | Con                                                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Materialise + validate (chosen)**                              | Removes the seam and everything downstream of it (DL#195 root cause); content is page-native so it gets ordinary compile-time validation on all four targets; worst failure is a wrong warning, not a wrong pixel; concept count collapses to "page markup + headless components" | The differ + sync are real work (likely a LOC wash); copies drift; page files grow; plugin UI no longer auto-upgrades (Q1)           |
| Reference-based composition (#181/#187/#193/#194, being retired) | Single source of truth; no duplication; no staleness                                                                                                                                                                                                                              | The entire crossing apparatus; ten silent-render defects; four-target re-derivation; a ref-scope rule table the author must memorise |
| Keep the boundary, add copy-drift on top                         | Incremental                                                                                                                                                                                                                                                                       | Worst of both — Fork C survives _and_ drift arrives. Explicitly rejected.                                                            |
| Inline-by-default with opt-in boundary                           | Rare cases keep a real component                                                                                                                                                                                                                                                  | Two models to maintain forever; saves no code, since the boundary machinery must still exist. Rejected.                              |
| Materialise but keep `<override>` for small edits                | Familiar; small diffs stay small                                                                                                                                                                                                                                                  | Two ways to express the same edit, and `<override>` is precisely what needs the crossing machinery. Rejected.                        |

**Note on DL#181's rejection of this approach.** Its trade-off table dismissed "materialized/copied
instance with drift reconciliation" as adding "a 3-way-merge-shaped reconciliation problem and file
duplication for no corresponding benefit." That judgement was made against a baseline of
_reference-based override alone_. The benefit is now measurable: ~4,900 lines of `lib/` change and
ten defects (DL#195). The 3-way merge is real and is Phase 3; the claim under review is that it is
cheaper than what it replaces, and **concentrated in one tool with a benign failure mode.**

## Verification Criteria

1. A materialised no-code component compiles as page markup: bindings resolve at page scope, refs
   surface at the page, generated output contains **no** `childComp` for the component, no
   `__parentContext`, no `(vs,_p1)=>_p1`, no alias overlay — asserted by full `toEqual` fixtures on
   element, hydrate and server targets.
2. A materialised coded component compiles through the existing headless-instance path with
   **byte-identical** output to an equivalent hand-written inline template — proving no new codegen.
3. An unedited copy validates clean. An edited copy produces a warning naming the deviating node and
   the change, and the page still builds.
4. A copy whose source has changed since `jay-rev` reports it, and `jay-stack sync` merges
   non-conflicting changes, advances `jay-rev`, preserves `@jay:override` nodes, and reports
   conflicts.
5. `sync --all` updates N sites of one component in one run; sites with `@jay:override` nodes keep
   them.
6. A `jay-source` that does not resolve is a hard error (contrast criterion 3).
7. Every mechanism in "What is removed" is absent from `lib/`, and `yarn confirm` exits 0 — including
   the dev-server hydration suite, which is where DL#194's target-drift defects surfaced.
8. The DL#195 orthogonal set (DL#189/#190/#192, class-names) is behaviourally unchanged: their tests
   pass without modification.
9. The differ has no runtime and no codegen dependency — it is exercised entirely by `stack-cli` unit
   tests plus the validation path.

---

**Predecessors:** DL#195 (retrospective), DL#181, #187, #193, #194.
**Blocking:** Q1 (coded components become headless) must be answered before Phase 1.
