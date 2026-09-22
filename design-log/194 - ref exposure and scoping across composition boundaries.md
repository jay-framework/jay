# 194 - Ref exposure and scoping across composition boundaries (slot model)

Status: **Phase A implemented** (slot contract tag + validation). Phases B–C pending. See
Implementation Results.

Extracted from DL#193 (which grew to cover binding + Phases 1–4 + two ref refinements). This log owns
the **single question**: when component A composes/overrides component B, _which_ of B's refs become
visible to A, and _in which ViewState scope_ are they typed and delivered.

It replaces the earlier `hasCodeFile`-only "two cases + suppression" draft with a **contract-declared
`slot` tag** model. The `slot` tag makes override targets **explicit** instead of inferred, which (a)
protects coded components from having ref-type assumptions broken by arbitrary overrides, and (b) gives
the compiler a first-class signal for _which scope a ref belongs to_.

**Central simplification (this revision): a Tier 2 composite is _fully inlined_ into the parent scope.**
A no-code component has no independent reactivity — its ViewState is a pure compile-time projection of
usage-site data. So instead of giving it a runtime boundary and _bridging_ refs back to the parent (the
DL#193 `__parentContext` / `parentDataChain` / `(vs,_p1)=>_p1` machinery), the compiler splices the
component's template into the usage site, **substitutes contract-ViewState bindings with the usage-site
prop expressions**, and constructs its refs in the **parent's** `ReferencesManager`. Refs are then
external-scope _by construction_ — no forwarding, no re-basing, no `__parentContext`. Tier 2 slots become
plain compile-time template composition (default content and override fragment both inline in parent
scope). The parent-bound render-function injection (higher-order constructor) is needed **only for
Tier 3**, whose `.ts` is a genuine boundary you must inject across.

Related: DL#181 (override — its **content-replace** is subsumed by slots and `remove` is dropped; its
**attribute/style merge** is retained on any ref), DL#187 (three-tier
headfull model), DL#162 (structural components), DL#193 (`$parent` binding + Phase-3 ref forwarding).

## Decisions for the Implementer (TL;DR)

**A slot is a scopeless compile-time hole.** It has no ViewState scope of its own. The **jay-html
fragment the parent places into it (the override) carries the parent's scope — for both ViewState
bindings and refs.** Default content (authored by the component in its own template) carries the
component's **own** scope. Slots are **compile-time artifacts, not runtime** — they carry **no phase**
(treated as `slow`), unlike `interactive` tags which are implicitly `fast+interactive`.

**Ref surfaces, by contract tag type:**

| What                     | `interactive` (existing)                                                                   | `slot` (**new**)                                               |
| ------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **What it is:**          | the component's **own** ref                                                                | a declared **override target**                                 |
| **Scope of its refs:**   | Tier 3 → **own**; <br> Tier 2 → **external** (inlined)                                     | override fragment → **parent**; <br> default content → **own** |
| **Overridable:**         | attribute/style merge only (any ref; presentation-safe)                                    | **content fill — the only content-override target**            |
| **Exposed to consumer:** | contract-declared → **yes**; <br> internal (jay-html-only) → Tier 3 **no**, Tier 2 **yes** | injected refs **yes** <br> (parent scope, keyed by slot name)  |

1. **`slot` is a new `ContractTagType`** (`contract.ts:3`), alongside `data`/`interactive`/`variant`/
   `subContract`. It declares a named region a **parent may override**; the injected refs are
   surfaced on the parent, keyed under the slot name, in the parent's (external) scope. Slots may carry
   **default content** (rendered when not overridden). Slots work at **all tiers**, carry **no phase**,
   and (v1) take **no type constraint** on injected content.

2. **Two `<override>` forms, split by the addressing attribute** (chosen: reuse `<override>`, not a new
   tag). The form is selected by **`ref=` vs `slot=`**, not by presence of children.
   - **Attribute form** — `<override ref="X" style=… class=… attr=… />` merges attributes onto the
     _existing_ element, per-key (`style` per-CSS-property via cascade). **Allowed on any `ref`, all
     tiers.** Safe by construction: element identity and type are preserved, so a coded component's
     `refs.X` still resolves to the same element of the same type. This is the _only_ part of DL#181
     retained — the efficient "restyle a composite without externalizing design props" model.
   - **Content form** — `<override slot="X">…children…</override>` fills declared slot `X` (a `type: slot`
     tag; else **compile error**, prevention-first). Rationale (the user's): a coded component's `.ts`
     assumes each ref's element/component type; replacing content at an arbitrary ref silently breaks
     that. A slot is the author's explicit "this location is safe to replace." An **empty**
     `<override slot="X"></override>` renders the slot with nothing — the clean replacement for DL#181
     `remove`.
   - `ref=` addresses a template _element_ (the universal anchor, DL#181 A2); `slot=` names a _declared
     slot_. Keeping `ref` for the template marking and splitting only the usage-site verb keeps one
     addressing mechanism in templates.

3. **Own-ref exposure & scope, by `hasCodeFile`** (`jay-html-parser.ts:1242`):
   - **Tier 3 (coded).** The component's **contract-declared** `interactive` refs are its **public Refs
     API** — exposed, in the component's **own** scope (the component computes/emits them). Its
     **internal** (jay-html-only, not in contract) refs are **encapsulated**. Override-content refs are
     **added** to this Refs type (see 4).
   - **Tier 2 (no-code design composite).** No `.ts`, no independent reactivity → the composite is
     **fully inlined** into the parent scope. Contract-ViewState bindings are substituted with the
     usage-site prop expressions at compile time; **all** own `interactive` refs (contract-declared _and_
     jay-html-only) are constructed in the **parent** `ReferencesManager`, so they are **external** scope
     _by construction_ — no forwarding, no `__parentContext`, no `(vs,_p1)=>_p1` re-basing. A no-code
     component that references **itself** (directly or transitively) can't be inlined → **compile error:
     add a `.ts` (make it Tier 3)**. Inlining is the **Tier 2-only** concern (it replaces the earlier
     "forwarding" phase and subsumes the Tier-1 removal).

4. **Tier 3 Refs type extends the original component Refs.** The generated Refs for a coded component
   with slots **extends** its contract-derived Refs (declared events/functions, own scope) and **adds**
   the override-content refs **keyed by slot name** (parent scope). E.g.
   `interface _CodedCardRefs extends CardRefs { body: { cta: CounterRef<AppViewState> } }`.

5. **No "suppression" heuristic, no provenance markers.** The replaceable location **is** the slot, by
   declaration — its default content is replaced by the override by definition. Scope is read from the
   tag type, so DL#193's `OVERRIDE_INJECTED_MARKER` and the earlier "suppress the overridden ref" rule
   are both **gone**.

**Two tiers only (Tier 1 removed).** A `<jay:X>` whose component has no contract is treated as **Tier 2
with an empty contract** — the DL#162 no-contract/empty unwrap is deleted, no structural special-case,
no warning machinery (Q5).

**Parent-facing exposed set, per tier:**

- **Tier 2 (jay-html + contract, no `.ts`) — inlined:** own `interactive` refs (contract-declared +
  jay-html) at external scope; + slot refs at external scope, keyed by slot name. All refs are just the
  parent's own refs (the composite has no boundary); grouping under the usage-site key is a naming
  convenience, not a scope boundary.
- **Tier 3 (jay-html + contract + `.ts`) — real boundary:** contract-declared Refs (own scope) +
  slot-injected refs (parent scope, keyed by slot name). Internal jay-html refs encapsulated. Own refs
  are **not** forwarded — the `.ts` owns them.

Non-obvious constraints:

- "External scope" = the ViewState at the composite's **usage site** — page scope for a root instance,
  `forEach`-item scope for a repeated instance. **Tier 2 refs** reach external scope _by construction_:
  the composite is inlined and its refs register in the parent `ReferencesManager` — no re-basing
  selector, no `__parentContext`. **Tier 3 slot-injected refs** (§5) also get external scope
  structurally — their render function is built in and bound to the parent `ReferencesManager`. Neither
  path uses the DL#193 `(vs,_p1)=>_p1` re-basing selector; DL#194 no longer needs `__parentContext` for
  ref scoping (its general handler-offset role in DL#193 is out of this log's scope).
- **Two independent axes — do not conflate.** (1) **Template data bindings** (`<h3>{heading}</h3>`)
  resolve against the component's **own** ViewState — for Tier 2 that ViewState is the compile-time
  projection substituted from the usage site; for Tier 3 it is computed by the `.ts`. (2) **Exposed refs**
  scope per the table above. Scope rules here govern (2) only, never (1).

## Background

DL#187 defines three headfull tiers by **file presence**: (1) jay-html only, (2) jay-html + contract
("pure headfull", no code), (3) jay-html + contract + `.ts` (coded). DL#162's structural components are
Tier 2's degenerate (empty-tags) case. DL#181 let a usage site override a component's markup at _any_
`ref` anchor. DL#193 Phase 3 forwards a structural component's inner **component** refs to the usage
site; refinement 1 re-based **override-injected** refs to the outer scope while keeping **owned** refs at
composite scope.

## Problem

Two defects in the pre-slot model:

1. **Coded-component safety.** DL#181 lets a consumer override _any_ ref. But a coded component's `.ts`
   is written against specific ref types (`refs.cta` is a `CounterRef`, `refs.title` an
   `HTMLElementProxy`). A consumer override that swaps a ref's element/component type silently breaks
   those assumptions. No author opt-in, no compile-time guard.

2. **Wrong scope for a no-code component's own refs.** A no-code card with its own
   `<jay:Counter ref="cardCounter">` typed the ref `CounterRef<CardViewState>` — the card's internal
   scope. But the card has no `.ts`; whoever wires `cardCounter` works at the **usage site** in the
   **external** scope (`AppViewState`), not `CardViewState`.

The slot model fixes (1) by making override an explicit, author-declared extension point, and (2) by
**inlining** a no-code component so its own `interactive` refs are the parent's, at external scope, by
construction.

## Prior Art / Adjacent Mechanisms

- **`ContractTagType`** (`contract.ts:3`) — enum `data | interactive | variant | subContract`. Adding
  `slot` is a clean fifth member; the parser (`contract-parser.ts:119-122`) maps YAML `type:` strings.
- **`interactive` tag handling** — requires `elementType` (`contract-parser.ts:180`), implicitly
  `fast+interactive` (`contract-phase-validator.ts:22`), excluded from ViewState / routed to Refs
  (`contract-phase-validator.ts:57`). `slot` reuses "Refs, not ViewState" but is **phaseless/slow** and
  requires **no** `elementType`.
- **`hasCodeFile`** (`jay-html-parser.ts:1242`) — the existing discriminator for own-ref encapsulation
  (Tier 3) vs inlining (Tier 2).
- **DL#193 `__parentContext` / `$parent` / `parentDataChain`** — delivered external scope into a composite
  _while keeping a runtime boundary_. This revision removes the Tier 2 boundary entirely, so the bridge is
  unnecessary for Tier 2 and the `(vs,_p1)=>_p1` re-basing selector is **not emitted**. Tier 3 slots are
  parent-bound via a render function (§5), not this selector. DL#194 therefore needs neither `__parentContext`
  nor `parentDataChain` for ref scoping.
- **`filterToComponentRefs` / `hasNamedComponentRefs`** (`jay-html-compile-refs.ts:56,68`) limited
  forwarding to component refs. With Tier 2 inlined, element refs are parent-native — no ref-kind filtering
  is needed for exposure.
- **`getForwardedInnerRef`** (`node-reference.ts:273`) is ref-kind-agnostic and does **no** re-basing
  (line 270); it stays on the collection path but is no longer the DL#194 exposure mechanism.
- **DL#181 override** — the `<override>` element and `ref` anchoring are reused. Its **attribute/style
  merge** form is retained verbatim (safe: preserves element type; `style` per-property via cascade,
  `jay-html-overrides.ts` `applyOverrides`). Its **content-replace** form is subsumed by slots (content
  now must target a `type: slot` ref); its `remove` operation is dropped.
- **DL#162 empty-contract unwrap** (`jay-html-parser.ts:1245-1254`) — **deleted** under this model. A
  no-contract `<jay:X>` becomes **Tier 2 with an empty contract** (empty ViewState, own `interactive`
  refs parent-native via inlining, no slots) — no unwrap, no structural special-case. Inlining a Tier 2
  _is_ the modern form of DL#162 force-inline, now restricted to the no-code tier (Tier 3 keeps its
  boundary).

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
  - tag: body # ← the override target
    type: slot
    required: false # true → the parent MUST override it (else compile error)
```

Template side reuses DL#181's `ref` anchoring: the element whose `ref` matches a `slot` tag **is** the
slot; its children are the **default content**. At the usage site the slot is filled with
`<override slot="body">…</override>` (§2) — `slot=`, not `ref=`.

```html
<!-- card.jay-html -->
<div class="card">
  <h3>{heading}</h3>
  <!-- data binding: card's own scope -->
  <div ref="body">
    <!-- slot `body` (scopeless hole) -->
    <p>Default body</p>
    <!-- default content: card's own scope; replaced by an override -->
  </div>
</div>
```

Validation (compiler, prevention-first):

- `<override slot="X">` **must** resolve `X` to a `type: slot` tag → else
  `"<override slot=\"body\"> — no slot \"body\" in <contract>. Declare it as type: slot, or use
<override ref=\"body\" …/> to restyle an existing element."`
- `<override ref="X" … />` (attribute form) is allowed on **any** ref (contract-declared, slot, or
  override-only) — it never changes element type. Children under a `ref=` override → compile error
  ("use `slot=` to fill a slot").
- `required: true` slot with no `<override slot=…>` at a usage site → compile error.
- `remove` is no longer a keyword — it is not recognized specially and is treated as an ordinary
  attribute. Dropped; use an empty `<override slot="X"></override>`. (On the attribute form it would
  merge as a `remove` attribute; on the slot form any attributes are already a compile error.)

### 2. Two `<override>` forms: attribute (any ref) vs content (slots only)

`<override>` keeps DL#181's two forms, now split by safety:

- **Attribute form** (`<override ref="X" style=… class=… />`, no children): merges attributes onto the
  existing element — per-key, `style` per-CSS-property via CSS cascade so the component's stylesheet
  stays a black box (DL#181 A5). Allowed on **any** ref because it preserves element identity/type. Any
  `{binding}` in a value resolves at the **parent** scope (DL#193 §C), like slot content.
- **Content form** (`<override slot="X">…children…</override>`): fills declared slot `X` (a `type: slot`
  tag). The structural, type-changing operation that needs author opt-in. The form is chosen by the
  **addressing attribute** (`slot=` here vs `ref=` above), not by presence of children — so an **empty**
  `<override slot="X"></override>` unambiguously means "render the slot with nothing."

DL#181's `remove` is dropped — an empty slot fill (or `if`/variant) replaces it.

### 3. Scope rules (read from the tag type)

- **Slot is scopeless.** The **override fragment** the parent places carries the **parent (external)**
  scope for both ViewState bindings and refs. For **Tier 2** this is automatic — the whole composite is
  inlined into the parent, so the fragment is already parent-scope template. For **Tier 3** it is achieved
  structurally (§5): the fragment's render function is built in the parent scope and bound to the parent
  `ReferencesManager` + `eventWrapper`, so its refs are parent-owned by construction (no re-basing
  selector). **Default content** (author-placed) carries the component's **own** scope (Tier 3) / the
  substituted projection scope (Tier 2, inlined).
- **`interactive` ref scope by `hasCodeFile`:** Tier 3 → own scope, handled by `.ts`; Tier 2 →
  external scope, parent-native via inlining (Phase B) — the consumer wires them like its own refs.

### 4. Default content

A slot renders its template children when the usage site gives no `<override>`; an override **replaces**
them. Default content compiles in the component's own scope; an override compiles in the parent scope. For
**Tier 2** both are inlined directly (compile-time template composition); for **Tier 3** the override is a
parent-bound render function passed in place of the default when present (§5).

### 5. How slots are filled — inline (Tier 2) vs render-function injection (Tier 3)

The two tiers fill slots by fundamentally different mechanisms, because only Tier 3 has a runtime boundary
to inject across.

#### 5a. Tier 2 — inline (no boundary, no injection)

A no-code composite is spliced into the parent at compile time. The component's template becomes parent
template; its contract-ViewState bindings are **substituted** with the usage-site prop expressions; the
slot's default content and any `<override slot="X">` fragment are placed inline at the `[ref="X"]` anchor.
Everything ends up in parent scope, so refs — the component's own `interactive` refs _and_ any override
refs — register in the parent `ReferencesManager` directly.

```html
<!-- usage site: card is Tier 2 (no .ts); body slot filled with a Counter -->
<jay:Card heading="{item.title}">
  <override slot="body"><jay:Counter ref="cta" /></override>
</jay:Card>
```

compiles (conceptually) to the card body inlined into the parent render, with `{heading}` → `{item.title}`:

```js
// parent render, item scope — NO childComp for the card, NO makeHeadlessInstanceComponent
e(
  'div',
  { class: 'card' },
  [
    e('h3', {}, [dt((vs) => vs.item.title)]), // {heading} substituted → item.title
    e(
      'div',
      { class: 'card-body' },
      [
        childComp(Counter, () => ({ initialValue: 0 }), refCta()), // refCta ∈ PARENT ref manager
      ],
      refBody(),
    ),
  ],
  refCard(),
);
```

- No `childComp(makeCardWithSlots(…))`, no `__parentContext`, no `(vs,_p1)=>_p1`. The card's refs
  (`refCard`, `refBody`) and the override's (`refCta`) are all the parent's.
- **Recursion guard:** a Tier 2 that references itself directly or transitively can't be inlined →
  compile error asking the author to add a `.ts` (promote to Tier 3, which introduces a real boundary).

**Why substitution is forced (not one option among several).** A ref captures its `viewState` and
`coordinate` from the **single** live `currentConstructionContext().currData` at construction
(references-manager.ts:57-68, node-reference.ts:335-342); template bindings read that _same_ `currData`
(element.ts:583-602). One scope, one `currData` — refs and bindings can't sit in different scopes within
one fragment. The only thing that ever split them was the child boundary + `__parentContext` forwarding.
So the fragment must render at **one** scope, and since refs must be **external** (the DL's core
requirement), that scope is the parent's — which forces the card's own bindings to be rewritten to
parent-scope expressions. Scope-switching to the projection instead (e.g. via the existing `withData`
primitive, element.ts:400-410 / context.ts `forAsync`) would make bindings trivial but push refs into the
projection scope, re-requiring the very re-basing machinery we are removing. Dead end. Substitution is the
price of deleting the boundary, not a stylistic choice.

**What "substitution" concretely is (and is not).** It is **not** textual find-replace. The mapping
`heading := item.title` is exactly the `getProps` projection the compiler **already emits** for today's
`childComp` (element.ts:42-56) — inlining relocates it from a runtime child-prop into the binding
accessors. Bindings compile to coordinate-free `(vs) => …` accessors (`dt`/`da`/`dp`/`ba`, element.ts:94-97),
so the transform is: **in each card binding accessor, replace every reference that resolves to a card
_root_ ViewState field with that field's usage-site prop expression** (`root.heading` → `root.item.title`;
chained access keeps the suffix — `root.heading.length` → `root.item.title.length`). **Implementation seam — an alias map on `Variables`, resolved in `resolveAccessor` (no grammar change).**
Every accessor in the PEG grammar funnels through the single method `Variables.resolveAccessor`
(expression-parser.pegjs:528,547,649,672,685,691), which _already_ hosts two "resolve against a remapped
scope without rewriting the text" mechanisms: `$parent` climbing and `withParentShift`
(expression-compiler.ts:175-245). DL#193 already uses that seam for override content
(`remapOverrideBindingsToParent` + `PARENT_SCOPE_PRAGMA` → `withParentShift(1)`,
jay-html-overrides.ts:84, expression-compiler.ts:464). Tier-2 substitution is the same idea generalized
from "shift up N levels" to "map each root field to an arbitrary parent accessor":

1. Resolve each usage-site prop expression against the **parent** `Variables`
   (`parseAccessor("item.title", parentVars)`) → an `Accessor` (its `rootVar`/`terms`/`parentLevel` are
   already correct for the inlining site).
2. Build a card-root `Variables` seeded with the card contract type **and** `aliases: Record<string, Accessor>`
   (one per contract data field, from step 1). Seed one for every contract field; a missing usage-site prop
   is the existing "required prop not passed" validation.
3. In `resolveAccessor`, before the default field walk, if `accessor[0]` matches an alias, return the alias
   `Accessor` with the remaining terms appended (and its `resolvedType` walked for those terms) — exactly
   parallel to the `$parent` branch. Compile the whole card template against this scope.

**Static/literal props (refinement, found in implementation).** A usage-site prop is not always a
dynamic `{expr}` — it is frequently a **static literal** (`label="Live Status"`, `status="success"`,
`count="42"`, bare `featured`). Under `childComp` these were coerced to the declared dataType
(`coerceStaticComponentProp`: `Status.success` / `42` / `true` / quoted string) and passed as props;
inlined, the same coercion must reach the card bindings. So the alias value covers **two** shapes:
(a) **dynamic** — a single-accessor prop (`{item.title}`), seeded via `parseAccessor` against the parent
scope (DL#187 restricts a structural component to scalar/enum props, so a dynamic prop is always a single
accessor, never a template); (b) **static** — a **literal `Accessor`** carrying the coerced literal as a
render override plus the declared prop type as `resolvedType` (so a card-internal enum comparison
`status == success` still renders `Status.success` on the RHS). `Accessor.render()` returns the literal
directly when present, and a literal is scope-independent so a `$parent` climb that lands on it is returned
as-is (no `_pN` wrapping). This keeps a single seam (`aliases` on `Variables`) for both prop kinds.

Because it lives in `resolveAccessor`, it inherits the machinery DL#193 already built
(`lexicallyInScope` / `parentDepth`, expression-compiler.ts:108-149,503-517) and is **unit-testable in
isolation** (expression-compiler.unit.test.ts): construct a `Variables` with aliases, parse a binding,
assert the rendered accessor string — no element/DOM codegen needed.

- **Card-internal nested scopes** (a `forEach`/`if`/`withData` _inside_ the card template) are respected
  for free: child scopes are built from the _resolved_ (aliased) accessor's type via `childVariableFor`,
  so an inner loop var resolves in the item scope (not aliased), while `$parent` from inside climbing to a
  card-root field still hits the alias through the preserved `.parent` chain.
- **Usage-site depth is automatic.** The prop expressions (`item.title`) are resolved against the parent
  scope, so the aliased accessor already sits at the correct depth — inlining is in-place, no extra `_pN`
  plumbing.
- **`$parent` climbing to/above the card _root_** (a Tier 2 reaching _past_ itself into its consumer)
  is the one case aliasing can't express in v1 — it needs a _downward_ depth shift the current
  `withParentShift` (upward only) doesn't provide. **v1 restriction (prevention-first): a Tier 2 template
  may not use a root-level `$parent`** — compile error directing the author to add a `.ts`. (Card-_internal_
  `$parent` to card-root fields is fine — it resolves via the aliased parent chain.) Lifting the root-level
  case is future work.

#### 5b. Tier 3 — parent-bound render-function injection

A coded component is a real runtime boundary (its `.ts` owns render + scope), so the slot content can't be
inlined — it must be **injected** as a render function _created in the parent scope_ and handed to the
component. No new runtime primitive: it uses `saveContext`/`restoreContext` (context.ts:119-136) plus the
existing `ReferencesManager` `eventWrapper` (references-manager.ts:135).

```js
childComp(
  makeCardWithSlots({                                  // higher-order constructor: slot fns → child ctor
    body: withParentContext(parentCtx, () =>
      childComp(Counter, () => ({ initialValue: 0 }), refCta())   // refCta ∈ PARENT ref manager
    ),
  }),
  (vs) => ({ heading: 'Sign up' }),                   // props only — no __parentContext needed
  refSignupCard(),
)

function makeCardWithSlots(slots) {
  return makeJayStackComponent(                        // Tier 3 inner ctor: .ts-owned render
    (options) => cardRender(options, slots),           // render factory receives the slot fns
    cardComponentDef, coordinateKey,
  );
}
// inside the .ts-owned cardRender, at the slot anchor:
e('div', { class: 'card-body' }, [ slots.body ? slots.body() : /* default content, own scope */ ], refBody())
```

- **In:** the parent builds `slots.body` as a render function bound to itself — closing over the parent
  ref constructors + the parent's `eventWrapper`, wrapped by `withParentContext` so its refs register
  with the parent manager and capture parent data/coordinates at invocation. The child invokes it at the
  `[ref="body"]` anchor; absent → the component's own default content (own scope).
- **Out:** the injected fragment's refs are **already** the parent's, surfaced **keyed by slot name** —
  `refs.card.body.cta` — at parent scope, with **no `(vs,_p1)=>_p1` re-basing**.

For Tier 3 the generated Refs **extends** the component's contract-derived Refs and **adds** the
slot-keyed override refs:

```ts
interface _CodedCardRefs extends CardRefs {
  // CardRefs = declared events/functions, own scope
  body: { cta: CounterRef<AppViewState> }; // override content, parent scope, keyed by slot
}
```

The coded component stays imported (`.ts`-owned render); the slot fns are the only thing the parent
injects. This answers Q1: the "slots prop" is a set of parent-bound render functions, and the ref-return
channel falls out for free because the refs were never the child's to begin with. The higher-order
constructor + `withParentContext` are **Tier-3-only** — Tier 2 needs none of it (5a).

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
2. Validation: `<override slot=…>` must resolve to a slot; the `<override ref=… />` attribute form is
   allowed on any ref; children under a `ref=` override are a compile error; `required` slot
   must be filled. In `applyOverrides` (`jay-html-overrides.ts`), keep the attribute/style merge (now
   `ref=`), route content by `slot=` to a slot target, and drop the `remove` branch entirely (`remove`
   is no longer a keyword). Fixture-based tests with clear error strings.

Phase B — Tier 2 inlining (fixes `cardCounter`; subsumes Tier-1 removal): 3. For a **Tier 2** (no-code) composite, **stop emitting a `childComp` boundary**. Instead splice the
component template into the parent render: (a) **binding substitution via an alias map** — add
`aliases: Record<string, Accessor>` to `Variables`; seed it by resolving each usage-site prop expression
against the parent scope; handle it in `resolveAccessor` (before the default field walk) exactly like the
existing `$parent`/`withParentShift` branches, so card-root field accessors resolve to the parent
expression and card-internal scopes are respected for free (§5a). No PEG grammar change. (b) construct
the component's own `interactive` refs (contract-declared + jay-html-only) in the **parent**
`ReferencesManager`, so they are external scope by construction — **no** `__parentContext`, **no**
`(vs,_p1)=>_p1`, **no** `filterToComponentRefs` forwarding. Element and hydrate targets both. Slots on a
Tier 2 are inlined the same way (default content + `<override slot="X">` fragment placed at the
`[ref="X"]` anchor, §5a).
**Unit tests first** (expression-compiler.unit.test.ts): alias resolution for a plain field
(`heading` → `vs.item.title`), chained access (`heading.length`), a card-internal `forEach` whose inner
var is _not_ aliased, and a card-internal `$parent` to a card-root field that _is_ aliased — asserting
rendered accessor strings, no element codegen. 4. **Recursion validation** (prevention-first): a no-code component that references itself directly or
transitively → compile error ("`<jay:X>` recurses; add an `X.ts` to make it Tier 3"). Detect during
the compile-time inline expansion (cycle in the inlined-component graph).
4b. **Root-level `$parent` validation** (prevention-first): a Tier 2 template using a **root-level**
`$parent` (reaching past the composite into its consumer) needs a downward depth shift aliasing can't
express in v1 → compile error directing the author to add a `.ts` (Tier 3). Card-_internal_ `$parent`
to card-root fields is allowed. Lifting the root-level case is future work. 5. **Remove Tier 1**: a `<jay:X>` with no contract is Tier 2 with an empty contract → inlined by the same
path; delete the DL#162 empty/no-contract unwrap and its structural special-case, no warning machinery.
Update DL#162/#187/#193 tests. 6. Regenerate the `override-ref-forwarding` example: `cardCounter` → `CounterRef<AppViewState>` (now via
inlining, not forwarding). Fixtures: Tier 2 card with own ref + slot (default + overridden, single +
forEach) showing distinct external vs projection scopes.

Phase C — Tier 3 slot injection via a parent-bound render function + default content: 7. For a **Tier 3** (coded) composite only, compile each `<override slot="X">` fragment into a **render
function created in the parent scope**, closing over the parent ref constructors + the parent's
`eventWrapper`, wrapped with a compiler helper `withParentContext` (`saveContext()` at creation /
`restoreContext()` at invocation, context.ts:119-136) so its refs register with the **parent**
`ReferencesManager` and capture parent data/coordinates even though the child invokes it. Pass the slot
fns to a **higher-order component constructor** —
`makeCardWithSlots(slots) → makeJayStackComponent((options) => render(options, slots), …)`. The child
render invokes `slots.X()` at the `[ref="X"]` anchor, falling back to the component's own default
content (own scope) when absent. Surface injected refs on the parent, keyed by slot name
(`refs.card.X.cta`). **No `(vs,_p1)=>_p1` re-basing for slot refs** — they are parent-owned by
construction _and_ on update. Validate the update path: the slot fragment updates from the **parent's**
reaction (parent context read live, element.ts:593-595), never fed child viewState (the child positions
the slot DOM + mount/unmount; the parent owns the slot data update). Fixtures: Tier 3 card with a slot
(default + overridden, single + forEach).

## Examples

No-code card (Tier 2, **inlined**) — contract declares a `body` slot; card owns `cardCounter`. The card is
spliced into the page render, so both refs are the page's own refs at external scope (grouped under the
usage-site key for naming only — no runtime boundary):

```ts
// app.jay-html.d.ts (generated at the usage site)
export interface _HeadlessCard0Refs {
  cardCounter: CounterRef<AppViewState>; // own interactive ref, inlined → parent-native, external scope
  body: { cta: CounterRef<AppViewState> }; // slot content inlined at [ref="body"] → external scope
}
```

Coded card (Tier 3) — same `body` slot; card's `.ts` handles internal refs and exposes declared events:

```ts
export interface _CodedCardRefs extends CardRefs {
  // CardRefs = declared events/functions (own scope)
  body: { cta: CounterRef<AppViewState> }; // only slot-injected refs added, external scope
  // internal (non-contract) refs are encapsulated
}
```

Override forms (prevention-first):

```html
<!-- ✅ attribute form (ref=): restyle ANY element, identity/type preserved -->
<jay:Card><override ref="hero" style="border-radius: 16px" class="featured" /></jay:Card>

<!-- ❌ children under a ref= override → compile error (use slot=) -->
<jay:Card
  ><override ref="title"><h3>Hi</h3></override></jay:Card
>

<!-- ✅ content form (slot=): fill a declared slot -->
<jay:Card
  ><override slot="body"><jay:Counter ref="cta" /></override
></jay:Card>

<!-- ✅ empty slot fill = the old `remove` -->
<jay:Card><override slot="body"></override></jay:Card>
```

## Trade-offs

- **Author cooperation for content overrides (vs DL#181).** _Content_ overrides now need a declared
  slot — costs "replace any content" flexibility, buys type safety and a clear, designer-facing
  extension surface. _Attribute/style_ overrides stay free on any ref (safe), preserving DL#181's
  efficient restyle-without-design-props model. `remove` is dropped.
- **New contract surface.** `slot` is genuinely new (null-hypothesis: no existing tag encodes
  "parent-scope, overridable, default-content-bearing region" — `interactive` is own-scope,
  non-overridable, phased). Justified: it _removes_ two inferred mechanisms (provenance markers,
  overridden-ref suppression) and makes Tier 3 override tractable via render-function injection.
- **Tier 2 inlining removes runtime surface (net subtraction).** No `childComp` boundary, no
  `__parentContext`, no `parentDataChain`, no `(vs,_p1)=>_p1` re-basing, no element-ref forwarding for the
  no-code tier. The ViewState projection becomes a compile-time binding substitution. Cost: a Tier 2 can't
  recurse (must add a `.ts`) — a rare case, caught at compile time with a clear message.
- **Breaking:** narrows DL#181 override targets, removes the DL#162 unwrap, and drops the Tier 2 component
  boundary; existing outputs/tests change. Acceptable per the project's "no backward compatibility" stance.

## Verification Criteria

- No-code card (inlined): `cardCounter` (own interactive) and `body.cta` (slot content) both external
  scope; `onChange`/`find`/`map` payload viewState is the external item; generated output has **no**
  `childComp(makeCard…)` boundary, `__parentContext`, or `(vs,_p1)=>_p1` for the card.
- A no-code card that references itself → compile error asking for a `.ts` (recursion guard).
- A no-code card whose template uses a **root-level** `$parent` → compile error asking for a `.ts` (v1
  restriction). Card-internal `$parent` to card-root fields resolves via the aliased parent chain.
- Binding substitution (alias map in `resolveAccessor`) respects card-internal `forEach`/`if` scopes: an
  inner-scope var is not aliased; only card-root ViewState fields resolve to the usage-site prop
  expressions. Covered by `expression-compiler.unit.test.ts` alias-resolution unit tests.
- Coded card: Refs extends the contract-derived Refs (own scope); internal refs absent; `body.cta`
  present at external scope, keyed by slot name; injected via the higher-order constructor.
- `<override ref=…>` (attribute form) merges onto any ref (per-key; `style` per-property), element type
  unchanged. `<override slot=…>` fills a declared slot (empty = renders nothing). `slot=` on a non-slot,
  children under a `ref=` override, or content on a `ref=` override → compile error; `required` slot
  unfilled → error. (`remove` is no longer a keyword — treated as an ordinary attribute.)
- Slot with no override renders default content; with an override renders (and surfaces refs of) the
  fragment keyed by slot name (Tier 2: inlined; Tier 3: injected render function).
- No-contract `<jay:X>` compiles as Tier 2 with an empty contract (inlined, own interactive refs external
  scope, no slots so not content-overridable); the DL#162 unwrap is gone and no warning is emitted.
- All four targets consistent (element, main-sandbox, hydrate; server = ref no-op). Fixtures use
  distinct external vs projection viewStates so a regression to composite scope fails.

## Questions and Answers

**Q1. Tier 3 slot channel — generated shape?** Prop name/signature for the slot render function and the
ref-return typing that surfaces injected refs (keyed by slot name) at external scope. Requires a trace
of `childComp` construction + the override compile path (`applyHeadfullOverrides`,
`parseHeadfullFSImports`) and the coded-component ref boundary before committing.
_Answer (finalized — see §5b): **Tier 3 only.** The "slots prop" is a set of **parent-bound render
functions** keyed by slot name, injected via a compiler-generated **higher-order component constructor**
(`makeCardWithSlots(slots) → makeJayStackComponent((options) => render(options, slots), …)`). Each slot fn
is built in the parent scope and bound (via `withParentContext` = `saveContext`/`restoreContext`) to the
parent `ReferencesManager` + `eventWrapper`, so the ref-return channel needs no explicit wiring — the
injected refs are the parent's by construction and surface keyed by slot name. No new runtime primitive;
the update path is validated by having the parent own the slot fragment's update (child positions the DOM
only). **Tier 2 does not use this** — it is inlined (§5a), so slot content is plain compile-time template
composition in parent scope._

**Q2. Type constraint on a slot?** _Answer: not required. No `elementType` on slots in v1. (Future
slot props — §6 — may add typed inputs, but not a constraint on injected content.)_

**Q3. Keying of injected refs.** _Answer: slot-override refs are keyed by the **slot name** in the
component Refs type (`refs.card.body.cta`), added to (Tier 3: extending) the component's Refs. A slot
name colliding with a declared ref name → compile error._

**Q4. Repeated / list slots?** _Answer: single region for v1. Repeated slots require slot props (§6) —
the item data is passed to the slot-content render function — so they land in phase 2, together with
slot props. This also resolves the earlier slots-under-`forEach` constraint._

**Q5. Tier 1 (no-contract) handling.** _Answer (revised): **Tier 1 is removed.** A `<jay:X>` whose
component has no contract is treated as **Tier 2 with an empty contract** — same compile path, empty
ViewState, own `interactive` refs parent-native via inlining. The DL#162 empty/no-contract unwrap is
deleted; no structural special-case, no build warning. (An empty contract simply declares no slots, so
such a component still can't be content-overridden — but that falls out of the Tier 2 rules, not a
separate tier.)_

**Q6. Why inline Tier 2 instead of keeping a boundary + forwarding?** _Answer (this revision): a no-code
component has no independent reactivity — its ViewState is a pure projection of usage-site data, so the
runtime boundary buys nothing and forces a bridge (`__parentContext` / `parentDataChain` / `(vs,_p1)=>_p1`)
to pull refs back to external scope. Inlining makes the projection a compile-time binding substitution and
lands refs in the parent `ReferencesManager` directly — strictly less machinery (null-hypothesis: the
boundary was never needed for the no-code tier). Confirmed safe: (1) jay-html is never sandboxed, so
inlining can't defeat isolation; (2) there is no need to keep a usage-site ref to the Tier 2 instance;
(3) recursion is disallowed for no-code components (add a `.ts` → Tier 3). Tier 3 keeps its boundary
because its `.ts` is real code that can't be inlined._

**Q7. Is the `{heading} → {item.title}` binding substitution tractable, or is it a fragile rewrite?**
_Answer (traced — see §5a): tractable, and it is **forced**, not a fragile textual rewrite. (a) Refs and
bindings read the same single `currentConstructionContext().currData` (references-manager.ts:57-68,
element.ts:583-602), so a fragment can't split "bindings at projection scope, refs at external scope"
without the boundary+forwarding we're deleting — the fragment must render at parent scope, forcing binding
substitution. (b) The mapping is exactly the `getProps` projection the compiler already emits for
`childComp` (element.ts:42-56) — inlining relocates it into the binding accessors, it is not new. (c)
Bindings are coordinate-free `(vs)=>…` accessors (element.ts:94-97), so substitution is done as an
**alias map on `Variables`, resolved in `resolveAccessor`** — the single seam every grammar accessor
funnels through (expression-parser.pegjs:528,547,649,672,685,691), which already hosts `$parent` and
`withParentShift`. DL#193 already uses that seam for override content
(`remapOverrideBindingsToParent`/`PARENT_SCOPE_PRAGMA`); Tier-2 aliasing generalizes it. This makes the
transform **unit-testable in isolation** (parse a binding against an aliased `Variables`, assert the
rendered accessor — no element codegen). Card-internal `forEach`/`if` scopes are respected automatically
via `childVariableFor`. (d) `withData` (element.ts:400-410) can render a fragment against a derived view
state without a boundary, but it scope-switches refs too → would re-require forwarding, so it is **not**
used here. Two v1 restrictions keep it bounded: no self-recursion and no root-level `$parent` in a Tier 2
template (both → "add a `.ts`")._

## Implementation Results

### Phase A — `slot` contract tag + validation (complete)

Prevention-first, no runtime changes. All work is in `compiler-jay-html`; 788 tests pass
(4 pre-existing skips).

**1. `slot` contract tag.**

- `contract.ts` — added `ContractTagType.slot` (5th member): scopeless, phaseless (treated as
  slow), no `elementType`, no `dataType`, contributes no ViewState.
- `contract-parser.ts` — `parseType` maps `type: slot`; `parsePhase` rejects an explicit phase on a
  slot; `parseTag` rejects slot mixed with other types, and rejects `dataType`/`elementType` on a slot.
- `contract-phase-validator.ts` — `isTagInPhase` returns `false` for slots (never in ViewState).
- `contract-to-view-state-and-refs.ts` — `traverseTag` returns `{}` for a slot (no ViewState member,
  no ref of its own in Phase A; injected refs surface in Phase C/E).

**2. Two `<override>` forms + validation** (`jay-html-overrides.ts`):

- `OverrideSpec` fields: `ref`, `slot`, `attributes`, `content`, `hasContent`. Addressing attribute
  (`ref=` vs `slot=`) selects the form.
- **Attribute form** (`ref=`): merges attributes/style onto any ref (contract, slot, or override-only);
  content on this form → compile error.
- **Content form** (`slot=`): fills a declared `type: slot` region; `slot=` on a non-slot → compile
  error; attributes on this form → compile error; slot target resolved via `[ref="slotName"]`.
- Neither/both addressing attributes → compile error.
- `applyOverrides`/`applyHeadfullOverrides` take a `slotNames?: Set<string>`; `jay-html-parser.ts`
  builds it from the loaded contract's slot tags at the compile call site.

### Deviations from the plan

- **`remove` fully removed as a keyword** (per user request — no backward compat, still in a branch).
  The plan said "`remove` → compile error"; instead `remove` is not recognized at all and is treated as
  an ordinary attribute. On the attribute form it would merge as a `remove` attribute; on the slot form,
  attributes are already a compile error, so `<override slot="X" remove>` still errors (via the
  "cannot also set attributes" path). Design-log §1/§2, Implementation Plan, and Verification Criteria
  updated to match.
- **Deleted the `page-with-override-unwrap-parent-binding` fixture + its 3 tests** (element/server/
  hydrate). Under the DL#194 model an `<override>` on an empty-contract (Tier 1) component is rejected,
  which is the correct new behavior; the old unwrap fixture exercised the dropped path. (No-contract →
  Tier 2 empty contract, inlined, is folded into Phase B.)

### Fixture migrations (zero output change)

- `page-with-override-parent-binding` and `page-with-override-forwarded-ref`: added `type: slot` tags to
  the card contracts and switched `<override ref=…>` content forms to `<override slot=…>`. Slot content
  splicing (`set_content` on `[ref="slot"]`) is byte-identical to the old ref-content path, so the
  generate-* outputs are unchanged.

### Tests

- `contract-parser.test.ts` — 6 new slot-tag tests (parse optional/required, reject
  dataType/elementType/phase/mixed).
- `jay-html-overrides.unit.test.ts` — rewritten to the two-form model (parse + apply, error strings).
- `parse-jay-file.unit.test.ts` — `header` contract/jay-html gained a `body` slot; 3 override tests
  rewritten to the slot / attribute forms.

### Phase B — Tier 2 inlining (in progress)

**Step 3a — alias substitution mechanism (complete).** The binding-substitution seam the whole tier
depends on, built first and unit-tested in isolation (no codegen yet), per the plan.

- `expression-compiler.ts` — `Variables` gained a private `aliases: Record<string, Accessor>` (8th
  constructor param, defaults `{}`). `resolveAccessor` resolves a contract-field accessor through the
  alias map _before_ the default field walk: `heading` → the seeded usage-site accessor `item.title`;
  chained access (`author.name`) appends the remaining terms onto the alias and walks its resolved
  type; the alias's own `rootVar`/`parentLevel` are preserved so a card-internal `$parent` climb that
  lands on the card-root scope composes automatically (climb wraps the alias result's `parentLevel`).
  Aliases are preserved across `asLexical`/`withParentShift` (same-scope reconstructions) but **not**
  propagated to `childVariableFor`/`childVariableForWithData` child scopes — only card-root contract
  fields are projected, so a card-internal `forEach` item var resolves against the (aliased) array's
  real usage-site item type and is never itself aliased. No PEG grammar change.
- `expression-compiler.unit.test.ts` — new `Tier 2 alias substitution (DL#194)` describe block:
  `resolveAccessor` (plain field → usage-site accessor; chained access; forEach item not aliased;
  `$parent` climb composes with alias at parentLevel 1) + codegen (`{heading}` → `dt(vs => vs.item?.title)`,
  chained, and a card-internal `{$parent.heading}` → `dt((vs1, _p1) => _p1.item?.title)`). 226/226 pass.

**Step 3b — inline codegen across all four targets (complete).** A Tier 2 composite (jay-html +
contract, no `.ts`; `structural: true` on `JayHeadlessImports`) no longer emits a
`childComp`/`__headlessInstances` boundary. Its template is spliced directly into the parent render:
bindings resolve through the alias overlay (step 3a), and the composite's own refs are constructed in
the **parent** `ReferencesManager`, nested under the usage-site ref name (`nestRefs([camelCase(refName)], …)`).
No `__parentContext`, no `(vs,_p1)=>_p1` identity, no `filterToComponentRefs` forwarding.

- **Alias build** — `buildInlineAliases(element, parentVariables, contractProps)` (jay-html-compiler.ts)
  maps each usage-site attribute to an `Accessor`: dynamic `{expr}` → `parseAccessor(stripped, parentVariables)`;
  static → `coerceStaticComponentProp` (DL#187 enum/number/boolean coercion) wrapped in a literal
  `Accessor`. Static enum members are **widened** to the base enum type (`(Status.success as Status)`)
  only in this inline path — the value is substituted directly into the composite's
  `alias === Status.warning` comparisons, and a narrowed `Status.success` literal makes `tsc` flag every
  other branch as a no-overlap error (TS2367). The real-boundary child-comp prop path
  (`coerceStaticComponentProp` via `renderChildCompProps`) is left unwidened.
- **Element + hydrate** — `renderInlinedStructuralInstance` (jay-html-compiler.ts). Direct DOM splicing
  is coordinate-safe under the DL#126 flat-map model (pre-assigned `jay-coordinate` attributes; no
  re-indexing on splice). `inlinedRoot` (Variables) + `insideInlinedComposite` (RenderContext/HydrateContext)
  suppress DL#193 override-injected re-basing at the spliced root.
- **Server** — `renderServerInlinedStructuralInstance` (jay-html-compiler-server.ts), added this step to
  reach the four-target consistency the design requires. Same alias/coordinate model; static text emitted
  literally; `if=` on the composite tag wrapped via `parseServerCondition`. Import collection filters out
  the composite's own root/refs type names (`!headless.structural`), keeping only enum types actually
  referenced by inlined bindings.
- **Sandbox/bridge** — `emittedForwardedRefHelpers: new Set()` added to both context literals in
  jay-html-compiler-bridge.ts (RenderContext gained the field this branch).

  _Fixture note:_ the inlined `?jay-mainSandbox` component import is unresolvable to `tsc`; the
  `// @ts-expect-error Cannot find module` line above it is added manually to fixtures (matching the
  existing component-in-component sandbox fixtures) and is stripped by `prettify`'s `removeComments` on
  fixture read, so comparison tests are unaffected while `build:check-types` compiles the raw file.

- **Fixtures** — 6 contract fixtures cover element/hydrate/server (+ main-sandbox where applicable):
  page-with-structural-badge (static props incl. widened enum), page-with-override-parent-binding,
  page-with-forwarded-ref, page-with-forwarded-ref-foreach, page-with-forwarded-ref-multi,
  page-with-override-forwarded-ref.
- **Verification** — full package suite green (798 passed, 4 skipped) and `yarn build:check-types` clean.

**Step 4 — recursion validation (complete).** A no-code (Tier 2) composite that references itself
directly or transitively via `<jay:X>` is a cycle in the inlined-component graph, caught during the
compile-time inline expansion in `parseHeadfullFSImports` (jay-html-parser.ts).

- **Ancestry, not global-visited.** The prior DL#123 guard used one global `visited` set and reported
  _any_ re-encounter as "circular", which conflates a true cycle with a **diamond** (a shared no-code
  dependency reached via two independent paths). Split into two sets: `ancestry` (the sources on the
  current DFS path — a hit is a real cycle → `headfullRecursionError(name)`) and `visited` (cross-path
  dedup — a hit is a diamond → silently skip re-expansion, no error). `ancestry` is extended
  (`new Set(ancestry).add(resolvedSrc)`) only on the nested-expansion call, so it unwinds per branch.
- **Tier-scoped by construction.** Tier 3 recursion uses the `<recurse>` tag, never a `<jay:X>`
  self-import, so a `<jay:X>` cycle is unambiguously a Tier 2 mistake. The message
  (jay-html-helpers.ts `headfullRecursionError`) directs the author to add an `X.ts` (promote to Tier 3,
  a real boundary that can recurse at runtime).

**Step 4b — root-level `$parent` validation (complete).** This was already a compile error _by
construction_ — `Variables.forInlinedComponent` sets `parent: undefined`, so any `$parent` climb from an
inlined composite's own template fails regardless of where the composite is used (page root or nested).
The only gap was the message. `resolveAccessor` (expression-compiler.ts) now emits
`rootParentInInlinedCompositeError()` (directing the author to add a `.ts`) instead of the generic
"no parent scope" text **when the exhausted scope is an `inlinedRoot`**; non-composite pages keep the
generic diagnostic. Because a Tier 2 composite has no card-internal nested scopes (forEach is banned,
conditionals reuse the current scope), _every_ `$parent` in its template is root-level — so this catches
all of them.

- **Fixtures** — `page-tier2-recursion` (card self-imports card) and `page-tier2-root-parent` (card
  template uses `{$parent.pageTitle}`).
- **Tests** — `generate-element.test.ts`: recursion asserts `readAndParseJayFile(...).validations` equals
  `[headfullRecursionError('card')]` (parse-time); root-parent asserts the element file `.validations`
  equals `[rootParentInInlinedCompositeError()]` (codegen-time).
- **Verification** — full package suite green (800 passed, 4 skipped) and `yarn build:check-types` clean.

### Phase C — Tier 3 slot injection (compiler + runtime complete; runtime-DOM verification via smoke tests #9/#10)

**Mechanism refinement — "Fork C" (deviates from §5b; §5b left intact as the original design record).**
§5b proposed filling a Tier 3 slot with a **parent-bound render function** passed to a higher-order
component constructor, where the child _invokes_ `slots.X()` at the anchor (with a default-content
fallback inside the `.ts`-owned render), and the fragment is bound to the parent via a new compiler
helper `withParentContext` (`saveContext`/`restoreContext`). During the runtime trace two problems
surfaced:

1. **Update ownership.** If the child invokes the slot fn, the fragment is constructed inside the
   _child's_ `ConstructContext`, so its refs and bindings capture the **child's** `currData` — exactly
   the scope split §5a proves is impossible within one fragment. Re-basing the slot's bindings back to
   the parent would re-require the `(vs,_p1)=>_p1` machinery the DL set out to remove.
2. **No new primitive available.** `withParentContext` (saveContext-at-create / restoreContext-at-invoke)
   would be genuinely new runtime surface, contradicting the null-hypothesis-first rule.

**Fork C** keeps the same _observable contract_ (§5b's `refs.card.X.cta` external-scope keying, no
`(vs,_p1)=>_p1`) but changes the mechanism to use only existing primitives:

- The **parent** builds each `<override slot="X">` fragment inline in its own render (inside the page's
  `ConstructContext.withRootContext`), with ordinary `(vs) => vs.field` bindings and its refs registered
  in a **parent-owned nested slot ref manager** — so refs _and_ bindings capture the parent `currData` by
  construction. No `_p1`, no re-basing, no `withParentContext`.
- The fragment is passed to the child two ways: (a) into the child's inline render, which mounts it at the
  `[ref="X"]` anchor via a new tiny runtime primitive **`foreignChild(fragment)`** — DOM + mount/unmount
  passthrough, **no-op `update`** — so the child positions the DOM but never feeds it child viewState; and
  (b) as a new 5th `slots` argument to **`childComp`**, whose update loop drives each slot fragment's
  `.update` from the **parent's** reaction. The child cascade excludes the fragment (foreignChild's no-op
  update); the parent cascade owns it.
- Ref surfacing: the instance ref name (`richCard`) collides — it is both a component ref (the child) and
  a pre-seeded nested slot ref manager. `ReferencesManager.mkRefsOfType` now attaches the slot manager to
  the `ComponentRefsImpl` (`setSlotRefManager`), and a new `DELEGATE_SLOT_REF_TRAP` surfaces
  `refs.richCard.body.cta` alongside the child's own `refs.richCard.cardAction` (via the existing
  `DELEGATE_REFS_TO_COMP_TRAP`).

Net surface vs §5b: **`foreignChild`** (4-line passthrough) + a `slots` param on `childComp` +
`setSlotRefManager`/`DELEGATE_SLOT_REF_TRAP` on the ref system, and **no** `withParentContext`, **no**
higher-order `makeCardWithSlots` invoking-with-default at runtime (the default-vs-override choice is made
at **compile time**: an un-overridden slot emits its default content inline in the child render; an
overridden slot emits `foreignChild(slots.X)`).

**Step (runtime) — complete.** `element.ts` (`childComp` 5th `slots` param + update loop; `foreignChild`),
`node-reference.ts` (`setSlotRefManager`/`getSlotRef`/`DELEGATE_SLOT_REF_TRAP`),
`references-manager.ts` (collision merge in `mkRefsOfType`). Runtime unit test
`packages/runtime/runtime/test/lib/slot-content.test.ts` (5 tests) asserts: slot DOM mounts inside the
child at the anchor; slot updates from the **parent** view state; child data binding unaffected;
`refs.richCard.cardAction` (child ref) and `refs.richCard.body.cta` (slot ref) both resolve. Full runtime
suite green (291 passed, 3 skipped).

**Step (compiler, element target) — complete.** `renderHeadlessInstance` (jay-html-compiler.ts) splits
the injected body into template nodes (compiled in CHILD scope, filled slot anchors emit
`foreignChild(slots.X)`) and `<override slot="X">` fragments (compiled in PARENT scope into a shared
`<ref>Slots` const, materialized in the page render root context). The instance ref carries the slot
refs as a nested manager (`refs.<instance>.<slot>.<ref>`). `assign-coordinates.ts` excludes `<override>`
from the multi-child `display:contents` wrap. Element fixture `page-with-tier3-slot` + test green.

**Step (parser) — complete.** The Tier 3 branch (jay-html-parser.ts) injects the default body via
`applyHeadfullOverrides` (so ATTRIBUTE-form overrides `<override ref="X" class="…"/>` merge onto child
elements), then re-clears each FILLED slot anchor: removes its `ref`, marks it `jay-foreign-slot="X"`,
empties its content, and appends the `<override slot="X">` elements verbatim as siblings so codegen can
split them out and compile in PARENT scope.

**Design — SSR / hydrate coordinate model for Fork C slots (derived, forced by Fork C + DL#126).**
The browser reference DOM (element target) is: the filled slot anchor is _replaced_ by the parent-owned
fragment — the card `<div class="card">` directly contains `[h2, cardAction-button, fragment-button]`,
with **no** anchor `<div>` and **no** `<override>` tag. SSR and hydrate must produce/adopt that same DOM.

- **Coordinates.** Bindings are coordinate-free in the browser (element.ts), but SSR/hydrate are driven
  entirely by `jay-coordinate-base` attributes from `assign-coordinates.ts` (hydrate reads `COORD_ATTR`
  at jay-html-compiler-hydrate.ts:1229; server at renderServerOpenTag). The slot fragment is authored in
  `<override slot="X">` (a child of `<jay:card>`) but **owned and built by the PAGE render**, so its
  content gets **page-scope** coordinates rooted at `${instanceCoord}/${slotName}` (e.g.
  `S0/0/card:richCard/body/0`). This key is globally unique (instanceCoord unique × slot name) and lives
  in the page's flat coordinate map (`buildCoordinateMap` queries the whole subtree, context.ts:469, so
  it finds the fragment even though it physically nests inside the child's `S2` DOM).
- **assign-coordinates.ts.** `assignHeadlessInstance` walks template (non-override) children in the CHILD
  scope as before; `walkChildren` skips `<override>` nodes; each override's content is walked via
  `walkChildren(overrideNode, `${instanceCoord}/${slotName}`, parentScopeId, …)` → page-scope coords.
- **Server.** `renderServerHeadlessInstance` splits overrides out; renders template children in child
  scope; when it reaches a `jay-foreign-slot="X"` anchor it renders the matching override's CONTENT in
  the PAGE context (page `vs`, page coords) _in place of_ the anchor element (no anchor `<div>`), and
  never renders the `<override>` sibling.
- **Hydrate.** `renderHydrateHeadlessInstance` mirrors the element target: the child adopt render emits
  `foreignChild(slots.X)` at the anchor (child does NOT adopt the fragment); the page hydrate render
  builds the `<ref>Slots` const via `adoptElement` on the page coordinate map (`${instanceCoord}/${slot}`)
  and passes it to `_makeHeadless…(slots)` + `childCompHydrate(…, slots)`.
- **Runtime-verification (SSR done; DOM-hydration via build).** The smoke-test `/combined` route
  (tasks #9/#10) exercises a Tier 3 slotted component (`richCard`, real `.ts` boundary) **and** a Tier 2
  slotted component (`promoCard`) on one page, both with page-scope `{pageTitle}` slot bindings. Real SSR
  (HTTP fetch, dev + production self-hosted modes) confirms the Tier 3 `body` slot renders the
  parent-scope override (`Body for Combined Page`), suppresses default content (`Default body`), and the
  Tier 2 `cta` slot resolves page scope (`CTA for Combined Page`). The hydrate/client/server targets all
  **build** for the page (codegen compiles + bundles). Still not covered by an executed test: the
  browser-level hydration hand-off itself (`adoptElement` on the page map → `foreignChild` forwarding the
  adopted dom/mount at the anchor) — the smoke suite has no headless-browser step, so DOM hydration is
  verified only insofar as the generated hydrate bundle builds.

**Step (compiler, server target) — complete.** `renderServerHeadlessInstance` (jay-html-compiler-server.ts)
splits `<override>` nodes out of the instance's children, builds a `slotOverrides` map keyed by slot name,
and threads it (plus the PAGE `ServerContext` as `slotPageContext`) into the instance context. When
`renderServerElement` reaches a `jay-foreign-slot="X"` anchor it renders the matching override's CONTENT
using the page context (page `vs`, page coordinates) IN PLACE of the anchor element, and never emits the
`<override>` sibling. Verified output: the override `<button>` replaces the anchor `<div>` at page
coordinate `S0/0/card:richCard/body/0`, reads `vs.pageTitle` (page scope). Fixture
`generated-server-element.ts` + test green.

**Step (compiler, hydrate target) — complete.** `renderHydrateHeadlessInstance` (jay-html-compiler-hydrate.ts)
mirrors the element target: splits template vs `<override slot>` nodes; the child adopt render emits
`foreignChild(slots.X)` at the anchor (child does NOT adopt the fragment); each override fragment compiles
in the PAGE HydrateContext (so its `adoptElement`/`adoptText` calls use the page coordinate map key
`${instanceCoord}/${slot}/…`); the slotted render fn takes `(options, slots)` and is wrapped in a
higher-order `_makeHeadless${idx}(slots)` constructor; the page `hydrate()` render materializes the
`<ref>Slots` const in its root context (via a new `slotPreambles` accumulator on `HydrateContext`) and
passes it to both `_makeHeadless${idx}(slots)` and `childCompHydrate(…, slots)`. The instance ref carries
the slot refs nested (`refs.richCard.body.cta`). The synthetic `_Headless${idx}Refs`/`Slots` types come
from the shared refs section (element pass), reused by the hydrate file. Fixture
`generated-element-hydrate.ts` + test green.

**Bridge/sandbox target — out of scope.** Headless component instances are unsupported in sandbox mode
(jay-html-compiler-bridge.ts:131–133 returns an empty fragment). No headless-instance page has a bridge
fixture and the bridge test suite covers only component-based (`page-using-counter`) pages, so a Tier 3
slot page needs no bridge fixture. (A pre-existing `generateElementBridgeFile`-on-headless-instance
`undefined` failure is unrelated to this work and stays out of scope.)

**Slots type index signature.** The generated `_Headless${idx}Slots` interface carries both the named
per-slot members (`body: BaseJayElement<PageVS>`) **and** an index signature
(`[slot: string]: BaseJayElement<PageVS>`). The index signature is required so the const typed as
`_Headless${idx}Slots` is assignable to the runtime `slots?: Record<string, BaseJayElement<ParentVS>>`
param on `childComp`/`childCompHydrate` — a named interface without an index signature is not assignable
to `Record`. The named members preserve author-facing per-slot type checks. (`build:check-types` caught
this; vitest does not type-check.)

**Verification (Phase C compiler).** compiler-jay-html full suite green (803 passed, 4 pre-existing
skips) and `build:check-types` clean after rebuilding the runtime dist (so `foreignChild` + the 5th
`slots` param are visible to the fixtures). Element / hydrate / server targets each have a
`page-with-tier3-slot` fixture + test asserting the full generated file via `toEqual(prettify(...))`.

**Two hydrate-target regressions found + fixed when running full `yarn confirm`** (both surfaced only
in the dev-server Playwright hydration suite, which vitest fixture tests do not exercise):

1. **`jc` prop dropped from headless-instance props (26 failures, all headfull FS pages 8a–8m).**
   Phase C had added `attrCanonical === 'jc'` to the skip list in `renderChildCompProps`
   (`jay-html-compiler.ts`). But `jc: '<contractName>'` is an established DL#123 prop that
   `makeHeadlessInstanceComponent` consumes — on `main` it flows through `renderChildCompProps`
   unfiltered. Removing that one skip restored it for every real childComp boundary (element +
   hydrate share `renderChildCompProps`, so the element target already carried `jc`; only the skip
   was wrong). `buildInlineAliases` keeps its `jc` skip — Tier 2 inlining passes no props. Tier 3
   fixtures (`page-with-tier3-slot`) updated to include `jc: 'card'`.

2. **Non-interactive conditional guard dropped the inline-alias overlay in the hydrate target
   (test 8n, `if="featured"` where `featured` is a static Tier 2 prop, 4 failures).** The hydrate
   guard rebuilt `guardVariables` as `new Variables(currentType, undefined, 0, 'viewState')` to root
   the guard at the render-fn `viewState` param — but that fresh scope has empty `aliases`, so an
   inlined composite's contract field (`featured` → literal `true`) failed to resolve
   ("data field [featured] not found"). `status` (fast+**interactive**) resolved because interactive
   conditionals take a different path that keeps `context.variables`. Fix: new
   `Variables.withRootVarName(name)` reconstructs the scope with a custom root var **preserving
   `aliases` + `inlinedRoot`**; the guard uses it when `insideInlinedComposite`. Non-inlined path
   unchanged. (8n was committed on this branch with the message "yarn confirm still fails" and had no
   `expected-hydrate.ts` — its hydration was never green until this fix.)

**Verification (full repo).** `yarn confirm` exits 0 — rebuild (72 packages) + `build:check-types` +
all tests + format. dev-server suite 741/741 (8n now green), compiler-jay-html 803/803, smoke-test
66/66.

## Post-Phase-C review feedback (3 issues)

User feedback on the smoke-test examples after Phase C. Decisions confirmed with the user.

### Issue 3 (correctness) — dev-server pre-render splices Tier 3 into Tier 2 shape

**Symptom.** The combined page (`/combined`: a Tier 3 `richCard` with `<override slot="body">` + a
Tier 2 `promoCard`) fails hydration in the dev server:
`[jay hydration] adoptText coordinate "S0/0/richcard:richCard/body/0" not found in DOM`. The SSR DOM
carries physical coords (`…S1/0/2/0`) while the client hydrate adopts at the Fork C parent-scoped
`S0/0/richcard:richCard/body/0`.

**Root cause (traced through the runtime).** Direct-compiling the _original_ `page.jay-html` through
both the server-element and hydrate targets produces **identical** Fork C coords — the compiler is
correct and the two targets agree (proven; not a cache). The divergence is a second, older, **non
tier-aware** copy of the template-injection logic that only the dev server runs:

- `injectHeadfullFSTemplates` / `injectHeadfullFSTemplatesRecursive`
  (`jay-html-parser.ts:862`, `:887`) is the dev-server pre-render inliner. Its per-`<jay:X>` loop
  (was `:936-950`) always called `applyHeadfullOverrides` (Tier-2 splice) for any component with
  overrides — **including Tier 3 coded ones** — splicing `<override slot="body">` inline into
  `<div ref="body">…</div>` (ref kept, no `jay-foreign-slot` anchor).
- `dev-server.ts` `sendResponse` (`:963`) runs `injectHeadfullFSTemplates` on the original, then
  compiles the **SSR server-element from that flattened content** → physical `S1/0/2/0`. The
  `?jay-hydrate` module compiles from the raw original via the parser's tier-aware branch
  (`jay-html-parser.ts:1251`, `hasCodeFile → Fork C`) → `S0/0/richcard:richCard/body/0`. DOM ≠ hydrate.

The parser's _real_ compile path (`parseHeadfullFSImports`, loop at `:1248-1326`) already branches by
`hasCodeFile` (Tier 3 Fork C vs Tier 2 splice). The pre-render helper was a duplicate that never got
the DL#194 tier-awareness.

**Fix (confirmed: shared helper — subtract-first).** Extract the per-`<jay:X>` tier-aware injection
(Tier 3: default body + `FOREIGN_SLOT_MARKER` anchors on filled slots + verbatim `<override slot>`
tail; Tier 2: `applyHeadfullOverrides`) into one helper used by **both** `parseHeadfullFSImports` and
`injectHeadfullFSTemplatesRecursive`. The pre-render caller loads the contract (for `slotNames`) and
computes `hasCodeFile` the same way, then defers to the shared helper (with `display: contents` still
applied). One source of truth removes the drift.

### Issue 1 (prevention) — component instance with overrides must declare `ref`

An override/slot-bearing instance with no `ref=` gets an auto-name (`refs.ar0.cta`). Confirmed:
add a **validation error** requiring an explicit `ref="…"` on a `<jay:X>` that carries `<override>`
children, so the ref path is author-controlled and stable. Prevention-first (no fragile auto-names).

### Issue 2 (examples) — combine `/override` + `/promo`

Confirmed: merge the two overlapping example pages into one that exercises both override _types_ and
_binding-in-overrides_, converting one card to a coded (Tier 3) component. (`/combined` already
covers Tier2+Tier3; consolidate the demo surface accordingly.)

### Implementation results (all three issues)

**Issue 3 — shared helper (done).** Extracted `injectComposableTemplateIntoTag`
(`jay-html-parser.ts`) as the single tier-aware per-`<jay:X>` injector (Tier 3 Fork C:
`FOREIGN_SLOT_MARKER` anchors + verbatim `<override slot>` tail; Tier 2: `applyHeadfullOverrides`),
with a `setDisplayContents` flag. Both the compile path (`parseHeadfullFSImports`) and the
dev-server pre-render path (`injectHeadfullFSTemplatesRecursive`) now call it — the pre-render caller
loads `slotNames` from the contract and computes `hasCodeFile` the same way. Verified: `/combined`
SSR now emits Fork C coords (`S0/0/richcard:richCard/body/0`) matching the hydrate; the physical
`S1/0/2/0` divergence is gone. Smoke test (62) passes SSR + hydrate.

**Issue 1 — require explicit ref (done).** New validation
`overrideRequiresExplicitRefError` (`jay-html-helpers.ts`), wired into the `parseHeadfullFSImports`
loop: a `<jay:X>` carrying `<override>` children with no trimmed `ref` is a compile error. New
fixture `contracts/page-override-no-ref` + a `generate-element.test.ts` case assert the exact
message. Affected inputs updated to comply: the `page-with-override-parent-binding` fixture (ref
`card`, expected outputs regenerated), the `combined` page (`promoCard`/`overrideCard` refs), and the
four `<jay:header>` override cases in `parse-jay-file.unit.test.ts`. The `/combined` d.ts now surfaces
`refs.promoCard.cta` / `refs.overrideCard.cta` instead of the auto-named `refs.ar0.cta`.

**Issue 2 — combined example (done).** `/override` and `/promo` pages removed; their coverage folded
into `/combined`, which now composes a Tier 3 `richCard` (Fork C slot with a nested ref +
page-scope binding), a Tier 2 `promoCard` (binding-in-override + own prop), and a Tier 2
`overrideCard` (full override vocabulary: content replace, attribute/style merge on an element ref,
slot removal, container replace). `combined/page.ts` wires interactive handlers through the stable
refs (`refs.richCard.body.cta`, `refs.promoCard.cta`, `refs.overrideCard.cta`). Both smoke-test
blocks (SSR + hydrate) updated; all 62 smoke tests pass.
