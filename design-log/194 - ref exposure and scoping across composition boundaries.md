# 194 - Ref exposure and scoping across composition boundaries (slot model)

Status: **DESIGN — for review, not yet implemented.**

Extracted from DL#193 (which grew to cover binding + Phases 1–4 + two ref refinements). This log owns
the **single question**: when component A composes/overrides component B, *which* of B's refs become
visible to A, and *in which ViewState scope* are they typed and delivered.

It replaces the earlier `hasCodeFile`-only "two cases + suppression" draft with a **contract-declared
`slot` tag** model. The `slot` tag makes override targets **explicit** instead of inferred, which (a)
protects coded components from having ref-type assumptions broken by arbitrary overrides, and (b) gives
the compiler a first-class signal for *which scope a ref belongs to*.

Related: DL#181 (override — its "override any `ref`" is **superseded** here), DL#187 (three-tier
headfull model), DL#162 (structural components), DL#193 (`$parent` binding + Phase-3 ref forwarding).

## Decisions for the Implementer (TL;DR)

**A slot is a scopeless compile-time hole.** It has no ViewState scope of its own. The **jay-html
fragment the parent places into it (the override) carries the parent's scope — for both ViewState
bindings and refs.** Default content (authored by the component in its own template) carries the
component's **own** scope. Slots are **compile-time artifacts, not runtime** — they carry **no phase**
(treated as `slow`), unlike `interactive` tags which are implicitly `fast+interactive`.

**Ref surfaces, by contract tag type:**

| What                     | `interactive` (existing)                                                                     | `slot` (**new**)                                               |
|--------------------------|----------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| **What it is:**          | the component's **own** ref                                                                  | a declared **override target**                                 |
| **Scope of its refs:**   | Tier 3 → **own**; <br> Tier 1/2 → **external**                                               | override fragment → **parent**; <br> default content → **own** | 
| **Overridable:**         | No                                                                                           | **Yes — the only override target**                             |
| **Exposed to consumer:** | contract-declared → **yes**; <br> internal (jay-html-only) → Tier 3 **no**, Tier 1/2 **yes** | injected refs **yes** <br> (parent scope, keyed by slot name)  |

1. **`slot` is a new `ContractTagType`** (`contract.ts:3`), alongside `data`/`interactive`/`variant`/
   `subContract`. It declares a named region a **parent may override**; the parent's injected refs are
   forwarded to the parent, keyed under the slot name, in the parent's (external) scope. Slots may carry
   **default content** (rendered when not overridden). Slots work at **all tiers**, carry **no phase**,
   and (v1) take **no type constraint** on injected content.

2. **Overrides target slots only.** `<override ref="X">` is valid **if and only if** `X` is declared
   `type: slot` in the target's contract. Otherwise → **compile error** (prevention-first). This
   **supersedes DL#181's "override any `ref` anchor"**. Rationale (the user's): a coded component's `.ts`
   assumes each ref's element/component type; letting a parent swap an arbitrary ref's type silently
   breaks those assumptions. A slot is the author's explicit "this location is safe to replace."

3. **Own-ref exposure & scope, by `hasCodeFile`** (`jay-html-parser.ts:1242`):
   - **Tier 3 (coded).** The component's **contract-declared** `interactive` refs are its **public Refs
     API** — exposed, in the component's **own** scope (the component computes/emits them). Its
     **internal** (jay-html-only, not in contract) refs are **encapsulated**. Override-content refs are
     **added** to this Refs type (see 4).
   - **Tier 1/2 (no-code design composites).** No `.ts` to handle any ref, so **all** own `interactive`
     refs (contract-declared *and* jay-html-only) **forward** to the consumer in the **external** scope.

4. **Tier 3 Refs type extends the original component Refs.** The generated Refs for a coded component
   with slots **extends** its contract-derived Refs (declared events/functions, own scope) and **adds**
   the override-content refs **keyed by slot name** (parent scope). E.g.
   `interface _CodedCardRefs extends CardRefs { body: { cta: CounterRef<AppViewState> } }`.

5. **No "suppression" heuristic, no provenance markers.** The replaceable location **is** the slot, by
   declaration — its default content is replaced by the override by definition. Scope is read from the
   tag type, so DL#193's `OVERRIDE_INJECTED_MARKER` and the earlier "suppress the overridden ref" rule
   are both **gone**.

**Parent-facing exposed set, per tier:**

- **Tier 1 (jay-html only, no contract):** own `interactive` refs (external scope). **No slots**
  (can't declare them without a contract) → **cannot be overridden**. Structural boundary (no unwrap).
  Build warning suggests adding a contract (see Q5).
- **Tier 2 (jay-html + contract, no `.ts`):** own `interactive` refs (contract-declared + jay-html),
  external scope; + slot-injected refs (parent scope, keyed by slot name).
- **Tier 3 (jay-html + contract + `.ts`):** contract-declared Refs (own scope) + slot-injected refs
  (parent scope, keyed by slot name). Internal jay-html refs encapsulated.

Non-obvious constraints:

- "External scope" = the ViewState at the composite's **usage site** — page scope for a root instance,
  `forEach`-item scope for a repeated instance. Delivered by DL#193's `__parentContext` / `$parent`
  wiring; the ref selector reads `parentDataChain(context)`.
- **Two independent axes — do not conflate.** (1) **Template data bindings** (`<h3>{heading}</h3>`)
  resolve against the component's **own** ViewState. (2) **Exposed refs** re-base per the table above.
  Scope rules here govern (2) only, never (1).

## Background

DL#187 defines three headfull tiers by **file presence**: (1) jay-html only, (2) jay-html + contract
("pure headfull", no code), (3) jay-html + contract + `.ts` (coded). DL#162's structural components are
Tier 2's degenerate (empty-tags) case. DL#181 let a usage site override a component's markup at *any*
`ref` anchor. DL#193 Phase 3 forwards a structural component's inner **component** refs to the usage
site; refinement 1 re-based **override-injected** refs to the outer scope while keeping **owned** refs at
composite scope.

## Problem

Two defects in the pre-slot model:

1. **Coded-component safety.** DL#181 lets a consumer override *any* ref. But a coded component's `.ts`
   is written against specific ref types (`refs.cta` is a `CounterRef`, `refs.title` an
   `HTMLElementProxy`). A consumer override that swaps a ref's element/component type silently breaks
   those assumptions. No author opt-in, no compile-time guard.

2. **Wrong scope for a no-code component's own refs.** A no-code card with its own
   `<jay:Counter ref="cardCounter">` typed the ref `CounterRef<CardViewState>` — the card's internal
   scope. But the card has no `.ts`; whoever wires `cardCounter` works at the **usage site** in the
   **external** scope (`AppViewState`), not `CardViewState`.

The slot model fixes (1) by making override an explicit, author-declared extension point, and (2) by
forwarding a no-code component's own `interactive` refs at external scope.

## Prior Art / Adjacent Mechanisms

- **`ContractTagType`** (`contract.ts:3`) — enum `data | interactive | variant | subContract`. Adding
  `slot` is a clean fifth member; the parser (`contract-parser.ts:119-122`) maps YAML `type:` strings.
- **`interactive` tag handling** — requires `elementType` (`contract-parser.ts:180`), implicitly
  `fast+interactive` (`contract-phase-validator.ts:22`), excluded from ViewState / routed to Refs
  (`contract-phase-validator.ts:57`). `slot` reuses "Refs, not ViewState" but is **phaseless/slow** and
  requires **no** `elementType`.
- **`hasCodeFile`** (`jay-html-parser.ts:1242`) — the existing discriminator for own-ref encapsulation
  (Tier 3) vs forwarding (Tier 1/2).
- **DL#193 `__parentContext` / `$parent` / `parentDataChain`** — delivers external scope into an inlined
  composite. Refinement 1's optional `childComp` ref-viewState selector `(vs, _p1) => _p1` already
  re-bases a forwarded ref; generalizing = apply it to all external-scope refs.
- **`filterToComponentRefs` / `hasNamedComponentRefs`** (`jay-html-compile-refs.ts:56,68`) currently
  limit forwarding to component refs. Element-ref forwarding is the missing piece.
- **`getForwardedInnerRef`** (`node-reference.ts:273`) is ref-kind-agnostic and does **no** re-basing
  (line 270); the collection runtime path needs no change once element refs are exposed and re-based.
- **DL#181 override anchor** — the ref-anchored `<override>` *syntax* is reused verbatim; only its
  *target validity* narrows (must be a declared slot).
- **DL#162 empty-contract unwrap** (`jay-html-parser.ts:1245-1254`) — under this model Tier 1 stays a
  **structural boundary** (no unwrap); its own `interactive` refs forward at external scope; no slots.

## Design

### 1. The `slot` contract tag

Add `slot` to `ContractTagType` and the parser. A slot declares a named, overridable region — no phase,
no type constraint (v1):

```yaml
# card.jay-contract
name: Card
tags:
  - tag: heading
    type: data
    dataType: string
  - tag: body            # ← the override target
    type: slot
    required: false      # true → the parent MUST override it (else compile error)
```

Template side reuses DL#181's `ref` anchoring: the element whose `ref` matches a `slot` tag **is** the
slot; its children are the **default content**.

```html
<!-- card.jay-html -->
<div class="card">
  <h3>{heading}</h3>          <!-- data binding: card's own scope -->
  <div ref="body">           <!-- slot `body` (scopeless hole) -->
    <p>Default body</p>      <!-- default content: card's own scope; replaced by an override -->
  </div>
</div>
```

Validation (compiler, prevention-first):
- A `ref` used as an `<override>` target **must** resolve to a `type: slot` tag → else
  `"<override ref=\"body\"> targets \"body\", which is not a slot. Declare it as type: slot in <contract>."`
- An `interactive` ref used as an override target → the same error.
- `required: true` slot with no override at a usage site → compile error.

### 2. Override targets slots only (supersedes DL#181 "override any ref")

`<override ref="X">` is legal if and only if `X` is a declared slot. Uniform across tiers. Trades
DL#181's "consumer can override without author cooperation" for author-sanctioned, type-safe extension
points — the safety choice from the Problem section.

### 3. Scope rules (read from the tag type)

- **Slot is scopeless.** The **override fragment** the parent places carries the **parent (external)**
  scope for both ViewState bindings and refs (DL#193 §C). **Default content** (author-placed) carries
  the component's **own** scope.
- **`interactive` ref scope by `hasCodeFile`:** Tier 3 → own scope, handled by `.ts`; Tier 1/2 →
  external scope, handled by the consumer.

### 4. Default content

A slot renders its template children when the usage site gives no `<override>`; an override **replaces**
them. Default content compiles in the component's own scope (Tier 3 handles it; Tier 1/2 forwards it);
an override compiles in the parent scope and is spliced/passed in place of the default when present.

### 5. Tier 3 Refs type & the slot channel

Because a coded component is imported (`childComp(Import, props, ref)`), a declared slot becomes a
two-way channel generated from the contract:

- **In:** the component's generated props gain an optional `slots` entry — a render function bound to
  the **external** scope — that the parent fills with the override fragment. The coded component renders
  it at the slot anchor (falling back to default content when absent).
- **Out:** the injected fragment's refs are surfaced back on the instance ref, **keyed by slot name**
  (`refs.card.body.cta`), at **external** scope.

The generated Refs **extends** the component's contract-derived Refs and **adds** the slot-keyed
override refs:

```ts
interface _CodedCardRefs extends CardRefs {          // CardRefs = declared events/functions, own scope
  body: { cta: CounterRef<AppViewState> }            // override content, parent scope, keyed by slot
}
```

This is the clean replacement for "force-inline the coded body" — the slot declaration gives an
explicit, typed prop + ref channel, so the coded component stays imported. Exact generated shape is Q1.

### 6. Future: slot props (phase 2)

A slot may later declare **props** the component passes to the slot-content render function — e.g. a
product gallery with a `productCard` slot exposing a `productId` slot prop. This **solves the repeated
(forEach) slot constraint**: a repeated slot passes each item's data to the content render function
instead of the content reaching into `forEach` scope directly. Marked as a future extension; v1 slots
are single-region and prop-less (Q4).

## Implementation Plan

Phase A — `slot` contract tag + validation (prevention-first, no runtime yet):
1. Add `ContractTagType.slot`; parse `type: slot`; no `elementType` requirement; phaseless (slow);
   route to Refs (not ViewState).
2. Validation: `<override ref>` must resolve to a slot; `required` slot must be overridden; interactive
   refs are not valid override targets. Fixture-based tests with clear error strings.

Phase B — Tier 1/2 own-`interactive` forwarding at external scope (fixes `cardCounter`):
3. Emit the DL#193 ref-viewState selector `(vs, _p1) => _p1` for every forwarded own `interactive` ref
   of a no-code composite (element target + hydrate); extend forwarding beyond `filterToComponentRefs`
   to include element refs (`HTMLElementProxy<ExternalVS, …>`).
4. Regenerate the `override-ref-forwarding` example: `cardCounter` → `CounterRef<AppViewState>`.

Phase C — slot content forwarding + default content (Tier 1/2):
5. Compile slot default content in composite scope; forward slot-injected refs at external scope, keyed
   by slot name; splice an override fragment (external scope) in place of the default when present.
   Fixture: no-code card with a slot (default + overridden usage sites).

Phase D — Collapse Tier 1 into a structural boundary (no unwrap) + missing-contract warning:
6. Remove the DL#162 empty/no-contract unwrap; route Tier 1 through the structural path (empty
   ViewState, own `interactive` refs external scope, no slots). Emit a suppressible warning pointing at
   the agent-kit contract guide. Update DL#162/#187/#193 tests.

Phase E — Tier 3 slot channel (pending Q1):
7. Generate the `slots` prop + ref-return channel keyed by slot name; Refs extends contract-derived
   Refs; own scope for declared refs, external scope for slot-injected refs; internal refs encapsulated.

## Examples

No-code card (Tier 2) — contract declares a `body` slot; card owns `cardCounter`:

```ts
// app.jay-html.d.ts (generated at the usage site)
export interface _HeadlessCard0Refs {
  cardCounter: CounterRef<AppViewState>,   // own interactive ref, no code → external scope
  body: { cta: CounterRef<AppViewState> }  // injected into `body` slot → external scope, keyed by slot
}
```

Coded card (Tier 3) — same `body` slot; card's `.ts` handles internal refs and exposes declared events:

```ts
export interface _CodedCardRefs extends CardRefs {   // CardRefs = declared events/functions (own scope)
  body: { cta: CounterRef<AppViewState> }            // only slot-injected refs added, external scope
  // internal (non-contract) refs are encapsulated
}
```

Override validation (prevention-first):

```html
<!-- ❌ compile error: `title` is a data/interactive ref, not a slot -->
<jay:Card><override ref="title"><h3>Hi</h3></override></jay:Card>

<!-- ✅ `body` is declared `type: slot` -->
<jay:Card><override ref="body"><jay:Counter ref="cta" /></override></jay:Card>
```

## Trade-offs

- **Author cooperation required (vs DL#181).** Overrides now need a declared slot — costs "override
  anything" flexibility, buys type safety and a clear, designer-facing extension surface. Deliberate.
- **New contract surface.** `slot` is genuinely new (null-hypothesis: no existing tag encodes
  "parent-scope, overridable, default-content-bearing region" — `interactive` is own-scope,
  non-overridable, phased). Justified: it *removes* two inferred mechanisms (provenance markers,
  overridden-ref suppression) and makes Tier 3 override tractable without force-inlining.
- **Breaking:** narrows DL#181 override targets and removes the DL#162 unwrap; existing outputs/tests
  change. Acceptable per the project's "no backward compatibility" stance.

## Verification Criteria

- No-code card: `cardCounter` (own interactive) and `body.cta` (slot-injected) both external scope;
  `onChange`/`find`/`map` payload viewState is the external item.
- Coded card: Refs extends the contract-derived Refs (own scope); internal refs absent; `body.cta`
  present at external scope, keyed by slot name.
- `<override>` on a non-slot ref → compile error; `required` slot unfilled → error.
- Slot with no override renders default content; with an override renders (and forwards refs of) the
  injected fragment keyed by slot name.
- Tier 1 (no contract) inlines as a structural boundary (no unwrap); own interactive refs external
  scope; not overridable; missing-contract warning emitted (suppressible).
- All four targets consistent (element, main-sandbox, hydrate; server = ref no-op). Fixtures use
  distinct external vs composite viewStates so a regression to composite scope fails.

## Questions and Answers

**Q1. Tier 3 slot channel — generated shape?** Prop name/signature for the slot render function and the
ref-return typing that surfaces injected refs (keyed by slot name) at external scope. Requires a trace
of `childComp` construction + the override compile path (`applyHeadfullOverrides`,
`parseHeadfullFSImports`) and the coded-component ref boundary before committing.
*Answer: OK — proceed with an optional `slots` prop of external-scope render functions keyed by slot
name, plus a ref-return channel surfacing injected refs on the instance ref (keyed by slot name).
Confirm exact signatures during the Phase-E trace.*

**Q2. Type constraint on a slot?** *Answer: not required. No `elementType` on slots in v1. (Future
slot props — §6 — may add typed inputs, but not a constraint on injected content.)*

**Q3. Keying of injected refs.** *Answer: slot-override refs are keyed by the **slot name** in the
component Refs type (`refs.card.body.cta`), added to (Tier 3: extending) the component's Refs. A slot
name colliding with a declared ref name → compile error.*

**Q4. Repeated / list slots?** *Answer: single region for v1. Repeated slots require slot props (§6) —
the item data is passed to the slot-content render function — so they land in phase 2, together with
slot props. This also resolves the earlier slots-under-`forEach` constraint.*

**Q5. Tier 1 overridability.** *Answer: confirmed — a no-contract component cannot be overridden (no
slot declaration possible); it may still have jay-html `interactive` refs. Emit a **suppressible build
warning** for a Tier-1 (no-contract) component explaining what a contract enables (slots, typed refs)
and/or pointing at the agent-kit contract guide.*
