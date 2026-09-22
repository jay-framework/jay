# Design Log #195 — Learnings from the composition-boundary work (DL#181 / #187 / #193 / #194)

Status: **RETROSPECTIVE.** No implementation. Written while DL#181/#187/#193/#194 are all still in the
tree (branch `DL195-196-composition-rethink`, HEAD `ccf62d14`), so every citation below resolves
against live code. Read this before DL#196, which proposes replacing the model these logs built.

## Learnings for the Implementer (TL;DR)

1. **L1 — Everything built in #181/#193/#194 exists to cross one seam: the component runtime
   boundary.** Not four features with four mechanisms; one obstacle with four workarounds. Every
   entry in the inventory below is a data-crossing or ref-crossing device.
2. **L2 — Refs and bindings inside one fragment cannot live in different scopes.** A ref captures
   `currentConstructionContext().currData` at construction (`references-manager.ts:142-144`, into
   the base ref constructor at `node-reference.ts:367-374`); bindings read the same
   `currData` (`element.ts:613,654`). One
   fragment, one scope. DL#194 §5a proved this; it is the hard constraint that forced every design
   choice, and it will still be true under any replacement.
3. **L3 — Removing the boundary subtracted code; keeping it added code.** DL#194 removed the Tier 2
   boundary and deleted `__parentContext`, `parentDataChain` re-basing, and ref forwarding for that
   tier. It kept the Tier 3 boundary and had to invent Fork C. The two halves of the same design log
   are the controlled experiment.
4. **L4 — Boundary-crossing fails silently.** Every defect in the catalogue below rendered wrong
   output rather than failing to compile. None was caught by a type, a validation, or a unit test;
   all were caught by an example, a smoke test, or a user clicking.
5. **L5 — Four render targets multiply every crossing.** Element, hydrate, server, main-sandbox each
   need their own derivation of the same crossing, and drift between them is undetectable except by
   cross-target fixtures. Issue 3 (dev-server pre-render) was exactly this drift, live for days.
6. **L6 — Concept count grew faster than capability.** The author-facing model is now a table of
   ref-scope rules keyed by tier × provenance × ref-kind (DL#194 TL;DR). That is a memorisation cost
   on every page author and every agent.
7. **L7 — Prevention-first worked wherever it could be applied, and could never be applied to the
   boundary itself.** Validation catches contract/prop/enum mistakes at build time. It cannot catch
   "this ref captured the wrong `currData`", because that is a runtime property of a runtime seam.
8. **L8 — DL#181 rejected the materialised-copy alternative against the wrong baseline.** Its
   trade-off table weighed copy-and-reconcile against _reference-based override alone_. The real
   comparison is against #181+#187+#193+#194 combined — roughly 4,900 lines of `lib/` change. The
   rejection should be re-litigated, not inherited. DL#196 does that.

**Non-obvious constraint for any replacement:** the `currData` single-source rule (L2) is not a
current-implementation artifact. Any model that wants refs at one scope and bindings at another
inside one rendered fragment must either introduce a scope switch (which moves the refs too — DL#194
Q7(d) on `withData`) or reintroduce a boundary plus a bridge. There is no third option.

## Background

Four design logs, 2026-09-09 → 2026-09-22, all addressing "how does a usage site customise and reach
into a composed headfull component":

| DL   | Question it answered                                                  | Status                            |
| ---- | --------------------------------------------------------------------- | --------------------------------- |
| #181 | How does a usage site override part of a component's markup?          | Implemented, **merged to `main`** |
| #187 | Can a headfull component exist without a `.ts`? (three-tier model)    | Implemented on branch             |
| #193 | How does a binding or ref in one scope reach another scope?           | Phases 1–4 implemented            |
| #194 | Which refs are exposed, in which scope? (slot model, Tier 2 inlining) | Phases A–C implemented            |

DL#189, #190 and #192 were written in the same period but are **not** part of this story — see
"What is orthogonal" below.

## Problem this retrospective addresses

The four logs each concluded soundly and each superseded part of its predecessor:

- #193 §C superseded #181 Q6/VC#5 (override binding scope).
- #193 Phase 3 refinement 1 superseded #193 Phase 3's scope rule.
- #194 superseded #193 refinement 1 **and** refinement 2, and deleted #162's unwrap.
- #194's Fork C deviated from its own §5b before implementation began.

Four supersessions in thirteen days, each locally correct. That pattern is the symptom. This log
names the cause, inventories what it cost, and states what any replacement must preserve — so DL#196
is argued from evidence rather than from fatigue.

## Prior Art / Adjacent Mechanisms — the inventory

Everything below is live code on this branch. Grouped by the seam each item crosses.

### A. Compile-time template splicing (DL#181, #111)

| Mechanism                                | Location                                                   |
| ---------------------------------------- | ---------------------------------------------------------- |
| `<override>` parse / apply (328 lines)   | `jay-html-overrides.ts`                                    |
| Attribute + per-CSS-property style merge | `jay-html-overrides.ts:217` `applyOverrides`               |
| Tier-aware per-tag injector              | `jay-html-parser.ts:865` `injectComposableTemplateIntoTag` |
| Compile path / pre-render path callers   | `jay-html-parser.ts:1092`, `:972`                          |

### B. Override data crossing the boundary (DL#193 Phase 2a/2c)

| Mechanism                        | Location                                                                  |
| -------------------------------- | ------------------------------------------------------------------------- |
| `@jay:parent ` pragma injection  | `jay-html-overrides.ts:94` `remapOverrideBindingsToParent`, `:101`        |
| Pragma strip + scope shift       | `expression-compiler.ts:233` `withParentShift`                            |
| Reserved `__parentContext` prop  | `component.ts` `PARENT_CONTEXT_PROP`                                      |
| Synthetic parent context handoff | `context.ts:152` `withSyntheticParentContext`, consumed at `:367`, `:405` |
| SSR lexical-ancestor variant     | `expression-compiler.ts:137` `lexicallyInScope`, `:189` `asLexical`       |

### C. The `$parent` runtime carrier (DL#193 Phase 1, Capability A)

| Mechanism                          | Location                                           |
| ---------------------------------- | -------------------------------------------------- |
| Live parent pointer on the context | `context.ts:214` `parent`                          |
| Parent chain read by leaf helpers  | `context.ts:178` `parentDataChain`                 |
| `forScope` liveness fix            | `context.ts:222` `_liveDataSource`, set at `:308`  |
| Update-gate weakening              | `element.ts:468`, `:488`, `:501` `dependsOnParent` |
| Leaf helpers threading the chain   | `element.ts:613`, `:654`, `:178`                   |

### D. Ref crossing the boundary (DL#193 Phase 3 + refinements)

| Mechanism                                 | Location                                                |
| ----------------------------------------- | ------------------------------------------------------- |
| Forwarded inner-ref lookup                | `node-reference.ts:290`, `:306`                         |
| Collection forwarding trap                | `node-reference.ts:586`                                 |
| Per-ref re-basing selector on `childComp` | `element.ts:52` `refViewState`, used at `:70-78`        |
| Override provenance marker                | `jay-html-overrides.ts:50` `OVERRIDE_INJECTED_MARKER`   |
| Ref type selection by provenance          | `jay-html-compiler.ts:582` `renderChildCompRef`, `:636` |
| File-level helper dedup                   | `jay-html-compiler.ts:165` `emittedForwardedRefHelpers` |

### E. Tier 2 inlining — the boundary _removed_ (DL#194 Phase B)

| Mechanism                                    | Location                                                              |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Alias overlay on `Variables`                 | `expression-compiler.ts:148` `aliases`, `:156` `inlinedRoot`          |
| Alias construction from usage site           | `jay-html-compiler.ts:523` `buildInlineAliases`                       |
| Inline codegen (element/hydrate)             | `jay-html-compiler.ts:1006` `renderInlinedStructuralInstance`         |
| Inline codegen (server)                      | `jay-html-compiler-server.ts` `renderServerInlinedStructuralInstance` |
| Root-var preservation for guards             | `expression-compiler.ts:212` `withRootVarName`                        |
| Recursion guard                              | `jay-html-parser.ts:1157` `headfullRecursionError`                    |
| Passthrough / coercion (Tier 2 pre-inlining) | `structural-coercions.ts` (76 lines), `passthrough-component.ts`      |

### F. Tier 3 slots — the boundary _kept_ (DL#194 Phase C, Fork C)

| Mechanism                         | Location                                                     |
| --------------------------------- | ------------------------------------------------------------ |
| `slot` contract tag               | `contract.ts:13`                                             |
| Foreign-slot anchor marker        | `jay-html-overrides.ts:60` `FOREIGN_SLOT_MARKER`             |
| DOM passthrough with no-op update | `element.ts:100` `foreignChild`                              |
| `slots` channel on `childComp`    | `element.ts:53`, update loop at `:61-68`                     |
| Slot ref manager (single)         | `node-reference.ts:186`, `:190`; trap at `:535`              |
| Slot ref manager (collection)     | `node-reference.ts:246`, `:250`; trap at `:602`              |
| Per-item slot fragment sinks      | `jay-html-compiler.ts:161` `slotPreambles`, `:886`           |
| Explicit-ref requirement          | `jay-html-parser.ts:1367` `overrideRequiresExplicitRefError` |

## Root cause — one seam, traced

A page composes `<jay:Card>`. The compiler mounts the card as `childComp(...)` (`element.ts:42`).
That call creates a new `ConstructContext` whose `parent` is deliberately unset — `withRootContext`
(`context.ts:367`) makes a parent-less root, attributed to DL#84 data isolation.

From that single decision, in order:

1. The card's template binds against the card's `currData`, not the page's. → an override authored in
   the page reads the wrong data. → **B** (pragma, shift, `__parentContext`).
2. `__parentContext` is a prop, and props only re-fire the child reaction; the parent context object
   must be mutated in place to stay live. → **C** (`parent` pointer, in-place `update`).
3. In-place update alone is insufficient: `element.ts:468` and `wrapWithModifiedCheck`
   (`context.ts:188`) short-circuit on reference equality before the leaf runs. → **C**
   (`dependsOnParent` gate weakening).
4. A ref constructed inside the card captures the card's `currData` (L2). → the page cannot wire it
   meaningfully. → **D** (forwarding, then per-ref re-basing selectors, then provenance markers to
   decide which refs re-base).
5. Deciding _which_ refs re-base needs a rule. Provenance (#193 refinement 1) proved wrong for plain
   elements (#193 refinement 2), so #194 replaced it with declaration (`slot`). → **F**.
6. Any override fragment that must render in the page scope but mount in the child DOM needs a DOM
   carrier with no update coupling. → **F** (`foreignChild`, `slots`, two more ref traps).
7. All of 1–6 must be re-derived for element, hydrate, server and main-sandbox. → the multiplier.

And the counterfactual, from the same design log: for Tier 2, DL#194 deleted step 0. Everything from
1 to 7 then became unnecessary for that tier — replaced by one alias overlay in `resolveAccessor`
(**E**), which is unit-testable without any DOM.

**The seam is the cause. Not the override syntax, not the ref model, not the tiers.**

## Evidence — the defect catalogue

Every one of these is recorded in DL#193/#194 "Implementation Results". Every one produced wrong
rendered output while type-checking and passing the unit suite.

| #   | Defect                                                                                         | Found by                        | Class            |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------- | ---------------- |
| 1   | `hasForwardedInnerRef` used `in`, bypassing the Proxy trap → ref `undefined`                   | example, manual click           | ref crossing     |
| 2   | Collection trap exclusion-list caught real impl members → `listeners.filter is not a function` | example                         | ref crossing     |
| 3   | Slot ref manager overwritten for repeated Tier 3 instances → `.body` undefined                 | smoke page `/foreach-composite` | ref crossing     |
| 4   | Slot fragment const hoisted out of `forEach` → only item 1 wired its handler                   | manual click, per item          | codegen scope    |
| 5   | Dev-server pre-render spliced Tier 3 into Tier 2 shape → hydration coordinate mismatch         | hydration error at runtime      | target drift     |
| 6   | `jc` prop dropped from instance props → 26 dev-server hydration failures                       | full `yarn confirm`             | target drift     |
| 7   | Alias overlay lost in the hydrate conditional guard → "data field not found"                   | full `yarn confirm` (8n)        | target drift     |
| 8   | Pragma leaked into static attribute values → `href="@jay:parent /docs"`                        | smoke `/override`               | crossing marker  |
| 9   | `forScope` snapshot made `$parent` stale under hydration                                       | example, manual                 | carrier liveness |
| 10  | Nested Tier 3 prop binding dropped on SSR only (`/nested-composition`)                         | purpose-built smoke page        | target drift     |

Four are ref-crossing, four are target drift, one is carrier liveness, one is a marker leak. **All
ten are downstream of the seam.** None would exist in a model with no seam to cross.

Note the discovery mechanism: two by full-repo `yarn confirm`, five by examples/smoke pages written
specifically to stress composition, three by manual clicking. Zero by the type system. Zero by
validation. This is L4 and L7 stated as data.

## Cost accounting

Measured on `main..HEAD` (`main` = `2c4e55ca`, which already contains DL#181):

```
302 files changed, 18789 insertions(+), 660 deletions(-)
lib/ only: 61 files, +4884 -450
```

Plus, already on `main`: `jay-html-overrides.ts` (328 lines) and its parser wiring.

Grep footprint of the crossing mechanisms across all `lib/` (approximate, symbol-name based):

| Mechanism family                                        | hits |
| ------------------------------------------------------- | ---- |
| `structural` (Tier 2 concept)                           | ~106 |
| `makeHeadlessInstanceComponent` / `__headlessInstances` | ~77  |
| `aliases` / `buildInlineAliases` / `inlinedRoot`        | ~73  |
| `__parentContext`                                       | ~36  |
| `parentDataChain`                                       | ~28  |
| `slotPreambles`                                         | ~27  |
| `withParentShift` / `PARENT_SCOPE_PRAGMA`               | ~25  |
| `dependsOnParent`                                       | ~23  |
| `foreignChild`                                          | ~20  |
| slot ref manager / traps                                | ~20  |
| `jay-foreign-slot`                                      | ~16  |
| `lexicallyInScope`                                      | ~14  |
| `jay-from-override`                                     | ~9   |

The three largest compiler files absorbed most of it: `jay-html-compiler.ts` (+772),
`jay-html-compiler-hydrate.ts` (+497), `expression-compiler.ts` (+396).

**Capability delivered:** override a component's content and attributes from the usage site; reach
refs inside a composed component; bind page data into an override; `$parent` inside `forEach`.

## Invariants any replacement must preserve

Stated as constraints on DL#196, derived from the above rather than asserted:

1. **V1 — One fragment, one scope** (L2). Non-negotiable; it is a property of `ConstructContext`,
   not of these designs.
2. **V2 — Cross-target agreement must be mechanically checked.** Four targets, and drift is
   invisible at runtime until hydration fails. Any replacement needs fixtures per target, or a model
   where the four targets share one derivation.
3. **V3 — Coordinates must be stable across SSR and hydrate.** `assign-coordinates.ts` + DL#126's
   flat map. Defects 3, 5 and 10 were all coordinate/scope alignment.
4. **V4 — The real headless-instance channel must keep working.** `<jay:markdown-content>` and every
   plugin component still resolve props through `__headlessInstances`, per-phase (DL#189), coerced
   (DL#190), enum-validated (DL#192). A replacement for _headfull_ composition must not disturb it.
5. **V5 — Failures must be compile-time.** The whole catalogue argues this. Prefer a model whose
   worst failure is a wrong diagnostic over one whose worst failure is a wrong pixel.
6. **V6 — Tier 3 code is not inlinable.** A `.ts` owns its own reactive graph
   (`component.ts:148`, `const reactive = mkReactive()` inside `makeJayComponent`, declared at
   `:131`). Any model claiming to remove the boundary must say explicitly what happens
   to coded components — DL#194 could not, and that is why Fork C exists.

## What is orthogonal — keep regardless of DL#196

Written in the same window, entangled in the same commits, but independent of the seam:

| Work                                             | Why it survives                                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **DL#189** phase-aware prop resolution           | Operates on real headless instances; the props channel exists in every model (V4)                                                        |
| **DL#190** instance prop type coercion           | Same; fixes a pre-existing bug affecting coded instances too                                                                             |
| **DL#192** enum value validation                 | Same; and its value _increases_ in a validation-first model                                                                              |
| **class-names utility**                          | `runtime/lib/class-names.ts` + ssr-runtime + jay-4-react — unrelated to composition                                                      |
| **DL#193 Capability A** (`$parent` in `forEach`) | Author-facing parent binding is useful on its own; but it exists only because overrides needed it — **keep-or-drop is an open question** |

Entanglement note: DL#189 and #187 share commit `7c41a1a4` (51 files); DL#192 and class-names share
`f560c97e`/`153e648e`. Any attempt to replay these onto `main` is a manual split — which is why the
new branch starts from `ccf62d14` and subtracts (see DL#196's implementation plan).

## Questions

**Q1. Is Capability A (`$parent` in `forEach`) kept?** It is the one piece of the crossing machinery
with standalone author value, and the only one with a runnable example
(`examples/jay/parent-binding`, regular + secure). Keeping it retains `context.ts:214/:222`,
`parentDataChain`, and the `dependsOnParent` gates (~51 grep hits + the grammar). Dropping it returns
`ConstructContext` to a construction-time snapshot.
_Recommendation: decide in DL#196, not here — it depends on whether the new model has any other need
for a live parent chain._

**Q2. Should DL#181 be reverted on `main`, or deleted forward on the new branch?** `main` is 8
commits ahead of `origin/main` and includes DL#181. Deleting forward keeps one linear story;
reverting on main makes `main` a clean base for unrelated work.
_Recommendation: delete forward. `main` is unpushed and will be superseded either way._

**Q3. Does the `/nested-composition` enclosing-instance-scope fix (`ccf62d14`) survive?** It resolves
each discovered instance's props against its enclosing instance's resolved ViewState rather than the
page's. Under a flat model there are no nested headfull instances to scope — but _headless_ instances
can still nest, so the fix may be independently correct (V4).
_Open — needs a trace against the DL#196 model before it is discarded._

**Q4. Is there a case that genuinely requires a runtime headfull boundary?** Recursion is the known
one (DL#194 forbids it for Tier 2, directing authors to add a `.ts`). Are there others — a component
whose markup structure depends on data only it can fetch?
_Open. This is the question that decides whether DL#196 can be complete or must keep an escape
hatch._

## Trade-offs (of the model being retired)

| Property                              | Value delivered                                                 | Cost                                                                       |
| ------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Component as single source of truth   | Redesign propagates to all usage sites automatically            | Redesign changes N pages with no review surface                            |
| Reference-based override (no copying) | No staleness, no drift reconciliation                           | Requires the whole crossing apparatus to make the reference reachable      |
| Declared slots (#194)                 | Coded components safe from arbitrary content replacement        | New contract surface; two `<override>` forms; per-tier fill mechanisms     |
| Tier 2 inlining (#194)                | Removed a boundary; alias overlay is unit-testable in isolation | Two v1 restrictions (no recursion, no root `$parent`); SSR nested-prop gap |
| Four-target parity                    | Same output everywhere                                          | Every crossing derived four times; drift invisible until hydration fails   |

## Verification criteria (for this log)

1. Every inventory citation resolves to the named symbol at the named file (checked against
   `ccf62d14`).
2. Every defect in the catalogue traces to a "Implementation Results" entry in DL#193 or DL#194.
3. The orthogonal set is complete — no work in `main..HEAD` outside the inventory and the orthogonal
   table is left unclassified.
4. The invariants V1–V6 are each grounded in a code citation or a catalogued defect, not in opinion.

---

**Successor:** DL#196 — validated inline composition.
