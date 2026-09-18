# 194 - Ref exposure and scoping across composition boundaries (slot model)

Status: **DESIGN — for review, not yet implemented.**

Extracted from DL#193 (which grew to cover binding + Phases 1–4 + two ref refinements). This log owns
the **single question**: when component A composes/overrides component B, *which* of B's refs become
visible to A, and *in which ViewState scope* are they typed and delivered.

It replaces the earlier `hasCodeFile`-only "two cases + suppression" draft of this log with a
**contract-declared `slot` tag** model. The `slot` tag makes override targets **explicit and typed**
instead of inferred, which (a) protects coded components from having ref-type assumptions broken by
arbitrary overrides, and (b) gives the compiler a first-class signal for *which scope a ref belongs to*.

Related: DL#181 (override — its "override any `ref`" is **superseded** here), DL#187 (three-tier
headfull model), DL#162 (structural components), DL#193 (`$parent` binding + Phase-3 ref forwarding).

## Decisions for the Implementer (TL;DR)

**Two orthogonal ref surfaces, distinguished by contract tag type:**

| Tag type | Meaning | Scope | Overridable? | Exposed to consumer? |
|---|---|---|---|---|
| `interactive` (existing) | the component's **own** ref | **own** scope | No | **Tier 1/2**: yes (external scope). **Tier 3**: no (encapsulated). |
| `slot` (**new**) | a declared **override target** / extension point | **parent (external)** scope | **Yes — the only overridable thing** | Always (its content's refs, external scope) |

1. **`slot` is a new `ContractTagType`** (`contract.ts:3`), alongside `data`/`interactive`/`variant`/
   `subContract`. It declares a named region of the template that a **parent may override** and whose
   injected refs are **forwarded to the parent, in the parent's (external) scope**. Slots may carry
   **default content** (rendered when not overridden). Slots work at **all tiers**.

2. **Overrides target slots only.** `<override ref="X">` is valid **iff** `X` is declared `type: slot`
   in the target's contract. Otherwise → **compile error** (prevention-first). This **supersedes DL#181's
   "override any `ref` anchor"**: override is now an author-sanctioned extension point, not an arbitrary
   consumer reach-in. Rationale (the user's): a coded component's `.ts` assumes each ref's element/
   component type; letting a parent swap an arbitrary ref's type silently breaks those assumptions. A
   slot is the author's explicit "this location is safe to replace."

3. **Own-ref exposure is by `hasCodeFile`** (`jay-html-parser.ts:1242`):
   - **Tier 1/2 (no-code design composites)** have no `.ts` to handle their own `interactive` refs, so
     they **forward** them to the consumer, typed/delivered in the **external** scope.
   - **Tier 3 (coded)** handles its own `interactive` refs in its own `.ts`, so they are
     **encapsulated** — never exposed.

4. **Slot-content refs are always external scope, at every tier.** Whether a slot renders its default
   content or a parent's override, the refs inside it belong to the **parent** (the parent authored the
   override; the default content, if unhandled at Tier 1/2, is likewise the consumer's to wire). For
   Tier 3 the *default* content is the author's and handled internally; the *overriding* content's refs
   forward to the parent. See "Design — scope rules".

5. **No "suppression" heuristic.** The earlier draft suppressed "a ref overridden at this site." With
   slots, the replaceable location **is** the slot, by declaration — a slot's default content is replaced
   by the override by definition. There is nothing to infer or suppress.

**Parent-facing exposed set, per tier:**

- **Tier 1 (jay-html only, no contract):** own `interactive` refs → external scope. **No slots**
  (can't declare them without a contract) → **cannot be overridden**. Structural boundary (no unwrap).
- **Tier 2 (jay-html + contract, no `.ts`):** own `interactive` refs → external scope; slot-content
  refs (default or injected) → external scope.
- **Tier 3 (jay-html + contract + `.ts`):** own `interactive` refs **encapsulated**; only slot-**injected**
  refs → external scope.

**Why the slot tag also unblocks Tier 3 (was the hard "Case 1").** A coded component is *imported and
rendered as `childComp(Import, props, ref)`* — not inlined — so the old draft had no compile-time splice
point for override content. A **declared slot is a declared prop + ref channel**: the compiler emits (a)
a slot/children prop the parent fills with an external-scope render function, and (b) a ref-return
channel surfacing the injected refs back on the instance ref at external scope. No force-inline needed.

Non-obvious constraints:

- "External scope" = the ViewState at the composite's **usage site** — page scope for a root instance,
  `forEach`-item scope for a repeated instance. Delivered by DL#193's `__parentContext` / `$parent`
  wiring; the ref selector reads `parentDataChain(context)`.
- **Two independent axes — do not conflate.** (1) **Template data bindings** (`<h3>{heading}</h3>`)
  resolve against the component's **own** ViewState (its contract fields). (2) **Exposed refs** (own
  `interactive` at Tier 1/2, and all slot content) re-base to the **external** ViewState. Scope rules
  here govern (2) only, never (1).
- `interactive` tags require an `elementType` (`contract-parser.ts:180`) and are implicitly
  `fast+interactive` (`contract-phase-validator.ts:22`); `slot` follows the same "goes into Refs, not
  ViewState" treatment (`contract-phase-validator.ts:57`).

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
   is written against specific ref types (`refs.cta` is a `CounterRef`, `refs.title` is an
   `HTMLElementProxy`). A consumer override that swaps a ref's element/component type silently breaks
   those assumptions. There is no author opt-in and no compile-time guard.

2. **Wrong scope for a no-code component's own refs.** A no-code card with its own
   `<jay:Counter ref="cardCounter">` typed the ref as `CounterRef<CardViewState>` — the card's internal
   scope. But the card has no `.ts`; whoever wires `cardCounter` works at the **usage site** in the
   **external** scope (`AppViewState`), not `CardViewState`. Internal-scoped exposure merges the
   component's internals into the parent and types them against a ViewState the consumer doesn't own.

The slot model fixes (1) by making override an explicit, typed, author-declared extension point, and
(2) by forwarding a no-code component's own `interactive` refs at external scope.

## Prior Art / Adjacent Mechanisms

- **`ContractTagType`** (`contract.ts:3`) — enum `data | interactive | variant | subContract`. Adding
  `slot` is a clean fifth member; the parser (`contract-parser.ts:119-122`) maps YAML `type:` strings.
- **`interactive` tag handling** — requires `elementType` (`contract-parser.ts:180`), implicitly
  `fast+interactive` (`contract-phase-validator.ts:22`), excluded from ViewState / routed to Refs
  (`contract-phase-validator.ts:57`). `slot` reuses this "Refs, not ViewState" path with parent-scope
  semantics.
- **`hasCodeFile`** (`jay-html-parser.ts:1242`) — the exact existing discriminator for own-ref
  encapsulation (Tier 3) vs forwarding (Tier 1/2). No new classification needed.
- **DL#193 `__parentContext` / `$parent` / `parentDataChain`** — already delivers external scope into an
  inlined composite. Refinement 1's optional `childComp` ref-viewState selector `(vs, _p1) => _p1`
  already re-bases a forwarded ref; generalizing = apply it to all forwarded (own `interactive` +
  slot-content) refs at external scope.
- **`filterToComponentRefs` / `hasNamedComponentRefs`** (`jay-html-compile-refs.ts:56,68`) currently
  limit forwarding to component refs. Element-ref forwarding (for own `interactive` element refs and
  slot-content element refs) is the missing piece.
- **`getForwardedInnerRef`** (`node-reference.ts:273`) is ref-kind-agnostic and does **no** re-basing
  (line 270); the collection runtime path needs no change once element refs are exposed and re-based at
  construction.
- **DL#181 override anchor** — the ref-anchored `<override>` *syntax* is reused verbatim; only its
  *target validity* narrows (must be a declared slot).
- **DL#162 empty-contract unwrap** (`jay-html-parser.ts:1245-1254`) — a no-contract `<jay:>` is inlined
  into page scope with no boundary. Under this model Tier 1 stays a **structural boundary** (no unwrap):
  its own `interactive` refs forward at external scope; it has no slots and cannot be overridden.

## Design

### 1. The `slot` contract tag

Add `slot` to `ContractTagType` and the parser. A slot tag declares a named, overridable region:

```yaml
# card.jay-contract
name: Card
tags:
  - tag: heading
    type: data
    dataType: string
  - tag: body            # ← the override target
    type: slot
    elementType: [HTMLElement]   # optional constraint on what may be injected; omitted = any
    required: false              # true → the parent MUST override it (else compile error)
```

Template side reuses DL#181's `ref` anchoring: the element whose `ref` matches a `slot` tag **is** the
slot; its children are the **default content**.

```html
<!-- card.jay-html -->
<div class="card">
  <h3>{heading}</h3>
  <div ref="body">            <!-- slot: `body` -->
    <p>Default body</p>       <!-- default content, replaced by an override -->
  </div>
</div>
```

Validation (compiler, prevention-first):
- A `ref` used as an `<override>` target **must** resolve to a `type: slot` tag → else
  `"<override ref=\"body\"> targets \"body\", which is not a slot. Declare it as type: slot in <contract>."`
- An `interactive` ref used as an override target → the same error (interactive refs are not slots).
- `required: true` slot with no override at a usage site → compile error.

### 2. Override targets slots only (supersedes DL#181 "override any ref")

`<override ref="X">` is legal iff `X` is a declared slot. This is uniform across tiers. It trades
DL#181's "consumer can override without author cooperation" for author-sanctioned, type-safe extension
points — the deliberate safety choice from the Problem section.

### 3. Scope rules

Scope is read from the tag type, not from override provenance markers:

- **`slot` content → parent (external) scope, always.** The parent authors the override, so its refs
  and bindings resolve against the parent's ViewState (DL#193 §C). Injected refs are forwarded to the
  parent at external scope.
- **`interactive` ref scope by `hasCodeFile`:**
  - Tier 3 (coded): **own** scope, handled by the component's `.ts`, **not exposed**.
  - Tier 1/2 (no-code): no handler exists → **forwarded** to the parent, **external** scope.
- **Slot default content at Tier 3:** authored by the component, handled by its `.ts` in **own** scope
  (not exposed) — unless overridden, in which case the override's refs forward to the parent. At
  Tier 1/2 the default content, like any no-code ref, forwards to the parent at external scope.

### 4. Default content

A slot renders its template children when the usage site provides no `<override>` for it; an override
**replaces** them. This mirrors web-component `<slot>`. Compilation: the default children compile in the
component's own scope (Tier 3 handles them; Tier 1/2 forwards them); an override compiles in the parent
scope and, when present, is spliced/passed in place of the default.

### 5. Parent-facing exposed set (summary)

- **Tier 1:** own `interactive` refs (external scope). No slots; not overridable. Structural boundary.
- **Tier 2:** own `interactive` refs (external scope) + slot content refs (external scope).
- **Tier 3:** slot-**injected** refs only (external scope). Own `interactive` refs and slot **default**
  refs encapsulated.

### 6. Tier 3 splice via the slot prop/ref channel

Because a coded component is imported (`childComp(Import, props, ref)`), the declared slot becomes a
two-way channel generated from the contract:

- **In:** the component's generated props gain an optional slot entry — a render function bound to the
  **external** scope — that the parent fills with the override fragment. The coded component renders it
  at the slot anchor (falling back to default content when absent).
- **Out:** the injected fragment's refs are collected and surfaced back on the instance ref
  (`refs.card.<injectedRef>`) at **external** scope.

This is the clean replacement for the old draft's "force-inline the coded body" — the slot declaration
gives an explicit, typed prop + ref channel, so the coded component stays imported. Exact generated
shape (prop name, render-fn signature, ref-return typing) is Q1.

## Implementation Plan

Phase A — `slot` contract tag + validation (prevention-first, no runtime yet):
1. Add `ContractTagType.slot`; parse `type: slot`; require nothing beyond optional `elementType`;
   route to Refs (not ViewState) like `interactive`.
2. Validation: `<override ref>` must resolve to a slot; `required` slot must be overridden; interactive
   refs are not valid override targets. Fixture-based tests with clear error strings.

Phase B — Tier 1/2 own-`interactive` forwarding at external scope (fixes `cardCounter`):
3. Emit the DL#193 ref-viewState selector `(vs, _p1) => _p1` for every forwarded own `interactive` ref
   of a no-code composite (element target + hydrate). Extend forwarding beyond `filterToComponentRefs`
   to include element refs (`HTMLElementProxy<ExternalVS, …>`).
4. Regenerate the `override-ref-forwarding` example: `cardCounter` → `CounterRef<AppViewState>`.

Phase C — slot content forwarding + default content (Tier 1/2):
5. Compile slot default content in composite scope; forward its refs at external scope; splice an
   override fragment (external scope) in its place when present. Fixture: no-code card with a slot
   (default + overridden usage sites) asserting external-scope refs both ways.

Phase D — Collapse Tier 1 into a structural boundary (no unwrap):
6. Remove the DL#162 empty/no-contract unwrap; route Tier 1 through the structural path (empty
   ViewState, own `interactive` refs external scope, no slots). Update DL#162/#187/#193 tests.

Phase E — Tier 3 slot channel (pending Q1):
7. Generate the slot prop + ref-return channel; parent fills it with an external-scope render fn; the
   coded component renders it at the anchor; injected refs surface at external scope; own refs stay
   encapsulated. Fixture asserts own refs absent, injected `cta` present at external scope.

## Examples

No-code card (Tier 2) — contract declares a `body` slot; card owns `cardCounter`:

```ts
// app.jay-html.d.ts (generated at the usage site)
export interface _HeadlessCard0Refs {
  cardCounter: CounterRef<AppViewState>,   // own interactive ref, no code to handle → external scope
  cta: CounterRef<AppViewState>            // injected into `body` slot → external scope
}
```

Coded card (Tier 3) — same `body` slot; card's `.ts` handles `cardCounter`:

```ts
export interface _CodedCardRefs {
  cta: CounterRef<AppViewState>            // only the slot-injected ref, external scope
  // cardCounter is encapsulated — absent here
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

- **Author cooperation required (vs DL#181).** Overrides now need a declared slot. Costs some
  flexibility ("override anything") but buys type safety and a clear, designer-facing extension surface.
  Deliberate, per the coded-component safety motivation.
- **New contract surface.** `slot` is genuinely new syntax/type (the null-hypothesis test: no existing
  tag encodes "parent-scope, overridable, default-content-bearing region" — `interactive` is own-scope
  and non-overridable). Justified because it *removes* two inferred mechanisms (provenance markers,
  overridden-ref suppression) and makes Tier 3 override tractable without force-inlining.
- **Breaking:** narrows DL#181 override targets and removes the DL#162 unwrap; existing outputs/tests
  change. Acceptable per the project's "no backward compatibility" stance.

## Verification Criteria

- No-code card: `cardCounter` (own interactive) and `cta` (slot-injected) both typed/delivered in
  external scope; `onChange`/`find`/`map` payload viewState is the external item.
- Coded card: own interactive refs absent from exposed refs; slot-injected `cta` present at external
  scope; own refs still wired in internal scope by the card's `.ts`.
- `<override>` on a non-slot ref → compile error with a clear message; `required` slot unfilled → error.
- Slot with no override renders default content; with an override renders (and forwards refs of) the
  injected fragment.
- Tier 1 (no contract) inlines as a structural boundary (no unwrap); its own interactive refs forward
  at external scope; it cannot be overridden.
- All four targets consistent (element, main-sandbox, hydrate; server = ref no-op). Fixtures use
  distinct external vs composite viewStates so a regression to composite scope fails.

## Questions and Answers

**Q1. Tier 3 slot channel — generated shape?** What is the prop name/signature for the slot render
function, and the ref-return typing that surfaces injected refs back at external scope? Requires a trace
of `childComp` construction + the override compile path (`applyHeadfullOverrides`,
`parseHeadfullFSImports`) and the coded-component ref boundary before committing.
*Recommended: an optional `slots` prop of external-scope render functions keyed by slot name, plus a
ref-return channel surfacing injected refs on the instance ref.* _Answer:_

**Q2. `elementType` on a slot — enforce or advisory?** Should the compiler reject an override whose
injected root doesn't match a slot's `elementType`, or is it documentation only? *Recommended: enforce
when present (type safety); omitted = any.* _Answer:_

**Q3. Multiple refs inside one override.** An override fragment may contain several refs. Confirm all are
forwarded at external scope and namespaced under the instance (`refs.card.<name>`); collision with an
own `interactive` ref name → compile error. _Answer:_

**Q4. Should a slot be allowed to be `repeated` / carry sub-structure**, or is it strictly a single
replaceable region? *Recommended: single region for v1; revisit if list-slots are needed.* _Answer:_

**Q5. Tier 1 overridability.** Confirmed a no-contract component cannot be overridden (no slot
declaration possible). Is a build-time hint desirable ("add a contract with a slot to make this
overridable")? *Recommended: yes, as a validation note.* _Answer:_

## Answered (settled with the user)

- **All overrides require a declared `slot`, all tiers** — supersedes DL#181's override-any-ref.
- **Own-ref exposure is tier-dependent:** Tier 1/2 forward their own `interactive` refs to the parent
  (external scope); Tier 3 encapsulates them.
- **Slots support default content** (web-component-like).
