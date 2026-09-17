# DL#193 — Binding across component composition boundaries

Status: **DESIGN — for review, not yet implemented.**

## Background

Three separate feature requests keep bumping into the same wall: **an expression or a ref
declared in one component scope cannot reach an element/component that lives in another
scope.** Jay's compiler is deliberately scope-isolated — every binding resolves against the
_current_ scope's ViewState type, and every ref is derived from the _current_ component's
contract. That isolation is the right default (DL#84), but it blocks three composition
patterns:

1. **Pure (Tier 2) components — forwarding inner child refs.** A `Button` component has an
   `onClick`. We wrap it inside a pure composite/section component. At the composite's usage
   site, how do we reach the inner button to attach `onClick`? The collection variant is the
   composite itself being repeated at the usage site (`<jay:Card forEach=…>`) → collection refs.
   (A `forEach` _inside_ the composite is not possible — a pure component takes no array prop to
   iterate; see §B.)

2. **Component overrides — binding to override-introduced content.** A container component
   exposes an overridable containment area. The override jay-html injects elements/components.
   How do we (a) bind data from the **outer** (usage-site) scope into those injected elements,
   and (b) reach their refs/events?

3. **`forEach` parent-scope binding (low priority).** From inside a `forEach`, how do we bind
   to a field in the parent scope?

All three are, at heart, **"cross-boundary binding"** problems. This design log maps what
each requires from **two perspectives — the compiler (type generation + code emission) and
the runtime** — and proposes a unified direction.

Relevant prior art: DL#84 (headless props & scope isolation), DL#187 (pure/Tier-2 headfull),
DL#181 (headfull component override), DL#162 (structural components), DL#46/#47 (recursive
templates & context switching), DL#14/#24 (References API).

---

## Current architecture (as mapped by research)

### How refs are produced

- A ref lands in a component's `RefsTree` **only** for `ContractTagType.interactive` tags
  (`contract-to-view-state-and-refs.ts` `traverseTag`), or for `ref="..."` on an
  element/child-instance in a jay-html template (`jay-html-compile-refs.ts`).
- Ref category is decided by `Ref.elementType` (component vs element) and `Ref.repeated`
  (single vs collection). Four runtime buckets: `element`, `elementCollection`, `component`,
  `componentCollection` (`ManagedRefType`).
- Type generation (`renderRefsType`) emits `XxxRef<ParentVS>` for single component refs and
  `XxxRefs<ParentVS>` (`ComponentCollectionProxy & OnlyEventEmitters`) for collections.
  `forEach` refs nest under a child manager keyed by the forEach scope.
- Runtime: `ComponentRefImpl` / `ComponentRefsImpl` / `ComponentCollectionRefImpl` with proxy
  traps `EVENT_TRAP` (onXxx → addEventListener) and `DELEGATE_REFS_TO_COMP_TRAP` (forward
  member access to the mounted instance's public API).

**Refs carry a live, updated scope viewState (key for this design).** Unlike `dt`/`da` — which
receive viewState only as the argument of their `update(newData)` closure — a `RefImpl` holds
its scope's viewState as a **field** (`node-reference.ts:240`) that is kept current by
`update(newData) { this.viewState = newData }` (line 293-295). `formatEvent` then injects that
live viewState into every `JayEvent` delivered to handlers:

```ts
formatEvent(event) { return { event, viewState: this.viewState, coordinate: this.coordinate }; }
```

So an event handler `refs.x.onclick(({ event, viewState, coordinate }) => …)` already gets the
**current** scope viewState for that ref — for a ref inside a `forEach`, the correct per-item
viewState (via the collection's per-ref `update`), not a stale capture. Refs are therefore a
**second viewState-threading channel** that is already live, and the type side mirrors it:
`${name}Ref<ParentVS> = MapEventEmitterViewState<ParentVS, …>` re-bases the event viewState to
the parent scope. Ref forwarding (issue 1) rides this live channel **as-is** — the forwarded ref
keeps the _inner_ component's scope viewState; we deliberately do NOT re-base it to the usage-site
scope (see §B).

**Event handlers do NOT need parent viewState threaded in (decided).** An earlier draft proposed
adding `parentViewState` to `JayEvent`. That is unnecessary: the handler is written in the
component `.ts` that **already owns the full top-level ViewState** (the same component declares
both the `forEach` list and the parent fields), and every ref delivers a `coordinate` (the
trackBy id chain) identifying which item fired. So `refs.removeBtn.onclick(({ viewState,
coordinate }) => remove(viewState.id))` can read any parent field directly from the component's
own state — no `formatEvent`/`JayEvent` change. Parent-data reachability (Capability A) is
therefore needed **only for reactive text/attribute bindings** (`{$parent.field}` rendered in the
DOM), which have no component code to reach up. Overrides _might_ be the one exception (handler in
the outer component, ref in the inner one), but the coordinate system covers that too — so we do
not extend the event API for them either.

### How expression scope works

- `Variables` tracks `currentVar` (`vs`, `vs1`, `vs2` by depth), `currentType`, and a
  `parent` link. `forEach` creates a child scope via `childVariableFor(accessor)` (itemType,
  depth+1, parent=this).
- `Accessor.render()` always roots the emitted path at `this.rootVar` — the **current**
  scope's variable. `resolveAccessor` walks `currentType` only; **it never consults
  `this.parent`.** The only special root token is `jay` → `__jay`.
- Generated `forEach` is `forEach((vs) => vs.items, (vs1: Item) => { return <child> }, 'key')`.
  The parent var (`vs`) **is lexically in JS scope** inside the `vs1` callback for the
  client/trusted target — but the expression language offers no syntax to reach it.

### How overrides work (DL#181)

- Overrides are **entirely compile-time template splicing**. `jay-html-overrides.ts`
  (`parseOverrides`/`applyOverrides`/`applyHeadfullOverrides`) injects the override fragment
  into the **inner** component's body, and it is compiled against the **inner** component's
  ViewState/Refs.
- Override `{bindings}` therefore resolve to the **inner** scope. There is **no** mechanism to
  bind outer data, and override provenance is not persisted on the AST node — so today the
  compiler cannot even tell "this element came from the outer scope's override."

### Runtime scope plumbing

- `ConstructContext.forItem`/`forAsync`/`forScope` create a child context holding **only** the
  child's `data`. There is **no back-pointer to the parent context or parent data.** Only
  `_dataIds` (the trackBy id chain) accumulates. So for the bridge/server (data-id) targets,
  the parent view state is genuinely unreachable at runtime; for the client/trusted target it
  survives only as a lexical JS closure variable.

---

## The unifying insight

The three problems reduce to **two runtime capabilities**:

- **(A) Parent-data reachability — reactive text/attribute bindings only.** A declarative
  `{$parent.field}` in a child scope must read _live_ parent data. This is NOT free on any target:
  `dt`/`da` closures only ever see the current scope's viewState, and keyed list reuse makes any
  lexically-captured or snapshot parent stale (Examples §A). The carrier is the existing
  **`ConstructContext` made live** — add a `parent` pointer + in-place `update` so leaf helpers
  (which already retain their context) read `context.parent.currData` (Q7; resolves the standing
  TODO at element.ts:413). The sandbox/bridge target re-attaches parent on the receiving side.
  **Event handlers are out of scope for (A)** — the owning component already holds parent data +
  `coordinate` (see architecture note), so no `JayEvent` change.
- **(B) Forwarded refs.** Issues 1 & 2 are a different mechanism: the inner/override RefsTree
  must be _surfaced_ to the outer scope and the passthrough/override component must _forward_ the
  child refs through its public API (the existing `DELEGATE_REFS_TO_COMP_TRAP` already forwards
  member access at runtime). **Forwarding is pure passthrough — no event re-basing:** a surfaced
  ref keeps the scope it was compiled in (inner `CardViewState` for §B; the specialization's
  `Panel$1ViewState` for overrides, §C), so there is nothing to map across the boundary and no
  `formatEvent` change (§B, §C).

The three features draw on these in different combinations:

| Feature                            | Parent-data (A)             | Forwarded refs (B)   |
| ---------------------------------- | --------------------------- | -------------------- |
| 1. Pure-component inner refs       | no                          | **yes**              |
| 2. Overrides — bind outer data     | only inside inner `forEach` | via inheritance (§C) |
| 2. Overrides — reach injected refs | —                           | **yes**              |
| 3. forEach parent binding          | **yes**                     | no                   |

---

## Examples & interface snippets

These ground the two ideas in concrete jay-html + generated TypeScript, so the trade-offs in
Q1–Q5 are decidable from real shapes rather than prose.

### A. Parent-scope binding (`$parent`) — issue 3

**jay-html** (a list where each row's remove button references a page-level title):

```html
<div forEach="items" trackBy="id">
  <span>{name}</span>
  <button ref="removeBtn">Remove from {$parent.listTitle}</button>
</div>
```

**Generated element today** (from a real fixture pattern) — note the item element's text
updates are driven by the item viewState _passed as the closure argument_, not by any parent:

```ts
forEach(
  (vs: PageViewState) => vs.items,
  (vs1: Item) => {
    return e('div', {}, [
      e('span', {}, [dt((vs1) => vs1.name)]),
      e('button', {}, [`Remove from ` /* {$parent.listTitle} goes here */], refRemoveBtn()),
    ]);
  },
  'id',
);
```

**⚠️ Correction to the initial map — `$parent` is NOT free on the client.** The runtime
`dynamicText.update(newData)` (element.ts:546) calls the binding closure with **only the
current-scope viewState**:

```ts
update: (newData: ViewState) => {           // newData === the item, never the parent
    let newContent = textContent(newData);
    ...
}
```

Keyed list reuse (`listCompare` by `trackBy`) reuses an item element across parent-data
changes, so a _lexically captured_ parent var would be **stale**. Several carriers were weighed
(Q7) and rejected: variadic `update(vs, parentVs, …)` (too invasive) and `vs[SymbolParent]`
(mutates user-provided array members → spread/freeze/shared-ref footguns).

**Chosen carrier — reuse `ConstructContext` (Q7): add a `parent` pointer + in-place `update`.**
Today `ConstructContext` supplies only _initial_ data at element construction and is never
consulted again; making it updatable turns it into a **live per-scope state carrier**. The
scope-switch update writes its own context in place each cascade — `mkUpdateCollection` already
has the TODO for this (element.ts:413). Leaf binding helpers **already capture their context**
(`dynamicText`, line 540), so a `$parent` binding reads `context.parent.currData` — live, because
the captured context object is mutated in place; reused keyed items keep their `childContext`
whose `.parent` is that same object. No user-data mutation, no parallel structure, one mechanism
for both binding kinds.

```ts
// runtime — mkUpdateCollection.update resolves the line-413 TODO:
const update = (newData) => {
    parentContext.update(newData);          // NEW: make the captured context live
    ... existing item diff/update ...
};

// generated element — text/attribute binding for {$parent.listTitle}.
// dt passes parent data into the closure (read from its retained context); the compiler emits
// the $parent accessor as the extra param `p`:
forEach(
    (vs: PageViewState) => vs.items,
    (vs1: Item) => {
        return e('div', {}, [
            e('span', {}, [dt((vs1) => vs1.name)]),
            e('button', {}, [`Remove from `, dt((vs1, p: PageViewState) => p.listTitle)], refRemoveBtn()),
        ]);                                  // ^ p === context.parent.currData, kept live
    },
    'id',
);
```

**Event handlers need NO change and NO parent carrier.** The handler is written in the component
that owns the whole ViewState, so it just reads the parent field directly and uses `coordinate`
(or `viewState.id`) to know which item fired:

```ts
// no parentViewState needed — listTitle is the component's own state, coordinate identifies the row:
refs.removeBtn.onclick(({ event, viewState /* item */, coordinate }) => remove(viewState.id));
```

So issue 3 is a **compiler + runtime** change scoped to **reactive text/attribute bindings only**.
Runtime change: `ConstructContext` gains `parent` + `update`; the scope-switch updates
(`mkUpdateCollection`, `mkUpdateWithData`, `forAsync`/`resolved`) call `parentContext.update`.
Cost is **O(scopes)** writes per cascade, not O(items), and no user data is mutated. Secure/bridge
re-attaches parent on the receiving side. This also serves the override sub-case (Q3-option-c):
an override mounted inside the inner component's `forEach` reaches its hoisted member via this same
carrier.

### B. Pure-component inner-ref forwarding — issue 1

**Inner button** (`button.jay-html` + `button.jay-contract`, Tier 1/3 — has `onClick`):

```ts
// generated for Button today
export type ButtonRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Button>>;
// its public API exposes: onClick(handler), plus any methods/props
```

**Pure composite** `card.jay-html` (+ `card.jay-contract`, **no `.ts`** → Tier 2) wraps it:

```html
<!-- card.jay-html -->
<div class="card">
  <jay:Button ref="cta">{ctaLabel}</jay:Button>
</div>
```

**Usage site** `page.jay-html`:

```html
<jay:Card ref="signupCard" ctaLabel="Sign up" />
```

**What forwarding must generate at the usage site** — the composite becomes a ref surface that
re-exports its named inner refs:

```ts
// generated for the page — the forwarded inner ref surfaces here:
export interface PageElementRefs {
  signupCard: CardRefs; // the composite instance
}
export interface CardRefs {
  cta: ButtonRef<CardViewState>; // forwarded AS-IS, keeps Card's scope — no re-basing
}

// page.ts usage:
refs.signupCard.cta.onClick(() => navigate('/signup'));
```

**No event re-basing (decided — the simpler model).** The forwarded `cta` ref lives inside `Card`
and its `RefImpl.viewState` is already `Card`'s scope. We surface it **as-is**, typed
`ButtonRef<CardViewState>` — we do _not_ re-base its event to `PageViewState`. Two reasons:

- **It's less code.** `RefImpl` already carries its own scope viewState and `formatEvent` already
  delivers it; forwarding is then pure passthrough (the existing `DELEGATE_REFS_TO_COMP_TRAP`),
  with nothing to map across the boundary.
- **`CardViewState` is the _correct_ data, not a lossy substitute.** Everything the button was
  rendered against is, by construction, part of `CardViewState` (a pure component's only data is
  its own ViewState = its contract tags, DL#187). So `cta.onClick(({ viewState }) => …)` receives
  exactly the data the button displayed. Re-basing to `PageViewState` would hand the handler data
  the button was _never_ bound against — more work for a worse result.

**No `forEach` _inside_ a pure composite.** A pure (Tier 2) component gets data only through
declared `props`, and props mirror `tags` as scalar/enum values (DL#187 Q9/Q3, DL#84) — there is
**no composite/array prop** to drive an internal `forEach`. So the "button under a `forEach`
inside the composite" case does not arise. Collections come from the **other** direction: placing
the pure composite itself under a `forEach` at the **usage site**:

```html
<!-- page.jay-html — the composite is repeated, not its innards -->
<jay:Card forEach="cards" trackBy="id" ref="cards" ctaLabel="{label}" />
```

```ts
// repeated=true on the composite → the forwarded ref rides the usage-site collection:
export interface PageElementRefs {
  cards: CardRefs; // collection of Card instances (nested under the forEach)
}
export interface CardRefs {
  cta: ButtonRefs<CardViewState>; // one cta per card — still Card's own scope, no re-basing
}

// page.ts usage — same API as a locally-declared collection ref:
refs.cards.cta.onClick((e) => navigate(e.viewState.ctaLabel)); // event across all cards
refs.cards.cta.find((r, vs) => vs.ctaLabel === 'Sign up'); // reach one card
```

The single-vs-collection distinction is decided by the **usage-site** `forEach`, not by anything
inside the pure component — so the existing collection machinery covers it once the forwarded ref
is in the tree.

### C. Override-introduced refs & data — issue 2

> _Revised during implementation (2026-09-16) — read this first. The **data/binding** half below
> (capture → hoist into `Panel$1ViewState`, "no runtime back-pointer", the `forEach` sub-case) was
> reworked to a **merge-time `$parent`-remap** that reuses Capability A, and `forEach` overrides are
> now **unsupported (validated against)**. See "Phase 2a design revision — merge-time `$parent`-remap
> (2026-09-16)" near the end of this file. The **ref-forwarding** half (Phase 2b) is unchanged._

**Container** `panel.jay-html` exposes an overridable area; **override** at the usage site
injects a button and binds **outer** data into it:

> _Syntax clarification (2026-09-16, during Phase 2 implementation): Phase 2 layers the
> capture / `Panel$1` specialization model onto the **existing DL#181 `<override ref="x">`
> content-replace splice** — not a new named-area (`<jay:override name>`) slot mechanism. The
> `<jay:override name="body">` in the example below is illustrative prose; the real, implemented
> syntax is the ref-targeted override shown immediately after. This is the null-hypothesis-first
> choice (reuse the existing mechanism; no new surface) and matches §C's own mechanism prose
> ("How overrides work (DL#181)", "override provenance is dropped from the AST")._

```html
<!-- usage: page.jay-html — actual implemented syntax (DL#181 override, DL#193 §C scope) -->
<jay:Panel>
  <override ref="body">
    <button ref="save">Save {documentName}</button>
    <!-- documentName is OUTER (page) data -->
  </override>
</jay:Panel>
```

**What must be generated — an override _specialization_ by inheritance (recommended, Q3-option-c).**
The override turns `Panel` into a per-usage-site specialization `Panel$1` whose ViewState and Refs
**inherit** the base component's and **add** the override's members:

```ts
// generated for the Panel$1 specialization (one per override site):
interface Panel$1ViewState extends PanelViewState {
  documentName: string; // hoisted from the override's outer-data references
}
interface Panel$1Refs extends PanelRefs {
  save: HTMLElementProxy<Panel$1ViewState, HTMLButtonElement>; // override ref, Panel$1 scope
}

// page.ts usage — the specialization instance's forwarded ref surfaces at the page:
refs.panel.save.onclick(({ viewState }) => store.save(viewState.documentName));
```

Three properties, all consistent with §B:

- **Events carry `Panel$1ViewState` (no re-basing).** `Panel$1ViewState extends PanelViewState`,
  so the event is a `PanelViewState` plus the override's added members — the same _keep the inner
  scope_ rule as forwarded pure-component refs. (Correction to the first sketch: the ref is typed
  `HTMLElementProxy<Panel$1ViewState, …>`, **not** `<PageViewState, …>` — events carry the
  specialized Panel's view state, per the "no re-basing" rule.)
- **Bindings pass through, like a pure component.** `{documentName}` resolves against
  `Panel$1ViewState.documentName`, exactly as a pure component's template reads its own ViewState.
- **Outer data flows down the normal channel.** The override's free outer references (here
  `documentName`) are _hoisted_ into `Panel$1ViewState` as added members, typed by resolving them
  against the **outer** (page) scope where the override is authored, and **supplied by the outer
  scope** as extra data — no runtime back-pointer. **`Panel$1ViewState extends PanelViewState` is a
  compile-time composition** for typing the override subtree's bindings and forwarded ref; whether
  the captured data literally becomes a member of the component's runtime ViewState depends on the
  tier (Q8): trivially yes for Tier 2 (props = tags = ViewState), but for a Tier 3 (coded) Panel it
  rides the `ConstructContext` carrier instead — Panel's own ViewState stays exactly what its code
  produces.

Today none of this is generated: override provenance is dropped from the AST, so the compiler
neither emits a `Panel$1` specialization, grafts `save` into the forwarded Refs, nor hoists
`documentName` into `Panel$1ViewState` (it currently resolves `{documentName}` against the base
Panel scope and would error/miscompile).

**Where the hoisted members come from — automatic capture, not author ceremony.** This is the
crux, and the answer is that there is no ceremony: it is ordinary lexical scoping plus
free-variable capture. The override fragment is _authored in `page.jay-html`_, so its bindings
belong to the **outer (page) scope** — exactly like every other binding in that file. So:

- `{documentName}` resolves against the page scope **because that is where it is written** — no
  `$parent`, no declaration on `<jay:Panel>`.
- The compiler scans the override fragment for the outer identifiers it references (a free-variable
  scan) and _that set is_ the added members of `Panel$1ViewState`. The author never lists them —
  it is **capture, not declaration**. Mental model: the override is a _closure over the outer
  scope_, and `Panel$1ViewState` is its automatically-computed capture record.
- `$parent` stays **compiler-internal**. The author never types it in an override; the compiler
  only emits a parent-access when it splices the override inside `Panel`'s own `forEach` to reach
  the hoisted top-level member from the item scope (the sub-case below). This is why option-b's
  author-facing `$parent.` (noisy) is rejected for overrides — the same primitive is used, but
  under the hood.

This keeps DL#84 intact: DL#84 bans a component's _own_ template from reaching up into its parent.
The override fragment is **not** Panel's own template — it is page-authored content injected into
Panel, so resolving its bindings against the page scope is lexically correct, not an isolation
breach. (Edge case to validate: an outer reference whose name collides with an existing
`PanelViewState` member of a _different_ type makes `Panel$1ViewState extends PanelViewState`
ill-typed — report it. Reaching Panel's _own_ internal data from an override is a separate
slot-props/render-props concern, out of scope for this DL.)

**Sub-case — override region inside Panel's own `forEach`.** If the override mounts inside an
internal `Panel` `forEach`, the added member `documentName` lives at `Panel$1` top level but the
spliced override elements render in the item scope — reading it there is exactly Capability A
(`$parent`). So the inheritance model is the **type/surfacing** story; Capability A remains the
runtime primitive for this sub-case. They compose (this is the strongest reason to build A first).

## Questions (for the user)

**Q1. Syntax for parent-scope access (issues 2-data & 3).** Preferred sigil? Options:
`$parent.field` / `../field` / `^field`. `$` is already a legal `IdentifierStart`, and `jay`
already demonstrates the "special root token" pattern, so `$parent` is the cheapest to slot
in. Multi-level (`$parent.$parent.x` vs `../../x`)? **Recommendation: `$parent.` chainable.**

> _Answer (2026-09-14): **Explicit `$parent.`, not implicit search-up.** Implicit ancestor
> lookup ("bind `listTitle` here, else walk up") was considered and rejected: it reintroduces
> the coupling DL#84 deliberately removed, creates shadowing fragility (adding/removing an
> inner field silently re-targets an existing binding), and makes type-gen/validation ambiguous
> when multiple ancestors expose the field. Explicit is unambiguous for the compiler, reads as
> documentation at the call site, and keeps isolation the default. Chainable `$parent.$parent.`._

**Q2. Scope of issue 1 (pure-component ref forwarding).** DL#187 Q6 / criterion 9 explicitly
say Tier 2 components have **no refs**. Forwarding inner child refs makes a Tier 2 component a
_ref surface_ — crossing that line (without adding code to it). Do we:
(a) **implicitly forward all inner child-component refs** (auto), or
(b) require the composite to **declare** which inner refs are exposed (new contract concept /
new `ContractTagType`)?
**Recommendation: (a) implicit** for named (`ref="..."`) inner instances only — auto-refs stay
private. Keeps the contract vocabulary unchanged; matches "pure = no code, but structure is
visible." The no-re-basing decision (§B) makes (a) cheaper still: forwarding named inner refs is
pure passthrough of `ButtonRef<CardViewState>`, no per-ref event mapping to generate. Note also
that a pure component **cannot `forEach` internally** (no composite/array prop — DL#187/DL#84), so
"forward all inner refs" has a bounded, statically-known shape; collections only appear when the
composite itself is repeated at the usage site.

> _Answer: **(a) implicit.** Auto-forward all named (`ref="..."`) inner child-component refs; no
> declaration required._

**Q3. Overrides — how is override-introduced data/refs modeled? (issue 2-data).** Three designs:
(a) **Splice-at-outer-scope:** persist override provenance, compile the override fragment against
the **outer** ViewState/Refs. Bindings and refs resolve to the outer (page) scope; events carry
`PageViewState`. Superseded by (c) — it re-bases events to the outer scope, breaking the uniform
"surfaced ref keeps its compiled scope" rule from §B.
(b) **Parent-pointer:** compile override against the inner scope, add `$parent` to reach outer
data (reuses Capability A directly). Verbose for the author (every outer reference needs
`$parent.`).
(c) **Inheritance / specialization — RECOMMENDED.** The override produces a per-site subtype
`Panel$1ViewState extends PanelViewState` / `Panel$1Refs extends PanelRefs` (Examples §C): the
override's added data members and refs are _added_ to the base via inheritance; the override's
free outer references are **hoisted** into the extended ViewState (typed against the outer scope)
and **supplied by the outer scope** as extra data down the normal update channel — the same
props→ViewState passthrough as a Tier 2 pure component. Events carry `Panel$1ViewState` (no
re-basing), bindings pass through (`{documentName}` reads `Panel$1ViewState.documentName`), and
the ref forwards up like any pure-component ref.
**Recommendation: (c)** — it unifies overrides with the §B pure-component model (one "surfaced
ref keeps its compiled scope, data passes through as ViewState" rule for both features), keeps
events un-re-based, and routes outer data through the existing top-down update channel rather than
a runtime back-pointer. The one sub-case still needing Capability A is an override mounted inside
`Panel`'s own internal `forEach` (the hoisted member sits at `Panel$1` top level, read from an
item scope → `$parent`); the type/surfacing model and the runtime `$parent` primitive compose.
**How the hoist is computed (resolved):** no author ceremony — the override is authored in the
outer file, so its bindings resolve against the outer scope by ordinary lexical scoping, and the
compiler's free-variable scan of the fragment _is_ the capture list that becomes
`Panel$1ViewState`'s added members (see §C "automatic capture"). Author never declares them and
never writes `$parent` (that stays compiler-internal for the inner-`forEach` sub-case). Still
open: the `Panel$1` naming/uniquing convention, and validating outer/inner name collisions.

> _Answer: **(c) inheritance/specialization**, confirmed. Hoist by automatic capture (§C)._

**Q4. Reactive parent bindings need runtime work on _all_ targets (revised).** The
"free on client" assumption was wrong (Examples §A): `dynamicText.update` gets only the item, so
parent data must be carried down by making `ConstructContext` live (Q7). Client/hydrate share
that carrier; the sandbox/bridge target needs its own re-attach on the receiving side. Do we
phase secure/bridge behind client, or land both together?
**Recommendation: make `ConstructContext` live once, enable client + hydrate first, follow with
secure/bridge** (which needs the extra receiving-side re-attach).

> _Answer: ok — client + hydrate first, secure/bridge after. **But a blocking runtime detail must
> be solved first (below): the update gates skip the very leaves a `$parent` binding needs.**_

**Q4a. The update-gate problem (raised in review — must be solved).** Jay's update path
short-circuits on **reference checks** so an unchanged subtree is not re-touched. Three gates exist
on the way to a `{$parent.field}` leaf inside a `forEach` (verified in source):

1. **Collection gate** — `element.ts:418` `let isModified = items !== lastItems; if (isModified){…}`.
   If the items array reference is unchanged, **no** `elem.update` runs for any item.
2. **Per-item gate** — `wrapWithModifiedCheck` (`context.ts:148-151`), applied to each item element
   at `element.ts:429`: `if (newData !== current) update(current)`. If the item's own data
   reference is unchanged, the item element's update is skipped.
3. **Leaf DOM-write gate** — `dynamicText.update` (`element.ts:546-549`) recomputes
   `textContent(newData)` **every call** and gates only the DOM write (`if (newContent !== content)`).
   This one is _correct_ for us: given the chance to run, it recomputes and, reading the now-live
   `context.parent.currData`, produces the new content.

The problem: when the **parent** changes but the item array/item references do **not** (the common
keyed-reuse case), gates 1 and 2 both short-circuit _before_ gate 3 ever runs — so calling
`parentContext.update(newData)` alone (the base carrier design) makes the parent context live but
the leaf never gets called to read it. Bindings stay stale.

**Fix — a compile-time `dependsOnParent` flag that weakens gates 1 & 2 only where `$parent` is
used.** The compiler already knows a scope's body references `$parent`; it marks that
`forEach`/`conditional`/`withData` with `dependsOnParent: true`. Then, at runtime, per cascade:

- Update the parent context **first** (`parentContext.update(newData)`), so `context.parent.currData`
  is fresh before any child update reads it.
- **Gate 1:** add `parentModified = newData !== lastParentData`; when the body `dependsOnParent`
  and `parentModified`, still run `itemsList.forEach((v, elem) => elem.update(v))` even though
  `items === lastItems` (an `else if` branch beside the existing `isModified` path).
- **Gate 2:** for `dependsOnParent` scopes the per-item `wrapWithModifiedCheck` must not veto on an
  unchanged item — either skip wrapping those items, or make its check parent-aware (fire when the
  captured parent context changed). Gate 3 then recomputes correctly.

Cost is opt-in and localized: a plain `forEach` keeps all three fast gates untouched; a
`$parent`-using `forEach` re-runs its item leaves **only when the parent actually changed**
(O(items) recompute for that scope, with gate 3 still suppressing no-op DOM writes). This refines
the earlier "O(scopes) writes per cascade" claim: parent-_context_ updates stay O(scopes), but a
parent change forces O(items) leaf **recomputation** for each parent-dependent scope — inherent
and unavoidable, since each item's `$parent` binding genuinely may now differ.

**Precedent in the reactive core — `createDerivedArray` (checked per review request).** The same
"re-map an item even though its own reference is unchanged" problem is already solved one layer
down, in `packages/runtime/component/lib/hooks.ts`. `createDerivedArray` maps an array through a
per-item cache (`WeakMap<T, MappedItemTracking>`) and decides re-mapping with an explicit predicate
(`mapItem`, hooks.ts:98-127):

```ts
const needToMap =
  force || // <- MeasureOfChange.FULL propagated in
  !cached ||
  item !== cached.item || // item reference changed (our gate 2)
  (index !== cached.index && cached.usedIndex) || // index changed AND the mapper read index
  (length !== cached.length && cached.usedLength); // length changed AND the mapper read length
```

Two ideas transfer directly and _validate_ the Q4a design rather than replacing it:

1. **`force` = our `dependsOnParent` + `parentModified`.** `force` comes from
   `MeasureOfChange.FULL` (`reactive.ts:1-6`: `NO_CHANGE | PARTIAL | FULL`) propagating down a
   signal cascade. It is exactly the "an outer thing changed, so re-evaluate this item even though
   its own reference didn't" escape hatch we need — the reactive layer already treats "recompute
   despite unchanged item reference" as a first-class, cascade-propagated condition. Our
   `dependsOnParent` gate branch is the DOM-runtime analogue of `force`; this is the established
   idiom, not a new hack.

2. **`usedIndex`/`usedLength` dependency tracking is a sharper gate than a static flag.** Note
   `mapItem` does **not** blindly re-map on any index/length change — it re-maps only when the
   value changed _and the mapper actually read it_ (`trackableGetter`, hooks.ts:87-96, records
   `wasUsed`). The parallel for us: re-run an item's leaves only when the parent changed _and_ that
   item's subtree actually reads `$parent`. Our compile-time `dependsOnParent` flag is the coarse
   (per-scope) version of this same discrimination — and coarse is the right call here: the
   compiler already knows statically whether a scope reads `$parent`, so there is no need for
   runtime `wasUsed` tracking. We get `trackableGetter`'s precision for free, at compile time,
   without the per-item bookkeeping cost.

**Conclusion:** `createDerivedArray` is a confirming precedent, not a cleaner replacement.
It shows (a) the codebase already models "recompute despite unchanged reference" as a propagated
signal (`force`/`MeasureOfChange.FULL`), so `dependsOnParent` is consistent with existing design;
and (b) the right gate is "changed AND actually used," which our static `$parent` analysis captures
at compile time — strictly cheaper than the runtime `WeakMap`+`trackableGetter` machinery, which
exists only because the reactive layer cannot see the mapper body. No change to the Q4a fix; we
keep the compile-time `dependsOnParent` flag, now with a documented precedent.

> _Answer: ok — keep the compile-time `dependsOnParent` gate-weakening. `createDerivedArray`
> confirms the idiom (`force`/`MeasureOfChange.FULL` = "recompute despite unchanged reference")
> and that a static "reads `$parent`" flag is the cheaper compile-time analogue of its runtime
> `usedIndex`/`usedLength` tracking. No design change._

**Q5. Priority / sequencing.** Issue 1 (pure refs) and issue 2 (overrides) are the
user-driving features; issue 3 (forEach parent) is explicitly low priority but is the
_simplest_ and shares runtime-A with issue 2a. Suggested order: **3 → 2 → 1** (build the
cheap parent-data primitive first, then overrides on top, then the refs-forwarding work).

> _Answer: ok — **3 → 2 → 1**._

**Q6. Do we ship both binding kinds together? — RESOLVED, moot.** The two "binding kinds"
(event-handler parent access vs text/attribute parent access) are no longer both in scope: event
handlers reach parent data directly from the owning component + `coordinate` (architecture note),
so **only reactive text/attribute bindings** use the live-`ConstructContext` carrier. There is one
binding kind and one mechanism; nothing to phase apart.

> _Answer: resolved — only text/attr uses the carrier; event handlers need no change._

**Q7. How is parent viewState carried down? (update-flow mechanism.)** Three carriers
considered (Jay's data flow is always top-down through `update`, so all are viable):

- **(a) Variadic `update(vs, parentVs, parentParentVs, …)`.** Conceptually cleanest (no data
  mutation, explicit types) but **most invasive**: every generic single-arg `update` in the
  runtime (`dynamicText`, `dynamicAttribute`, all `mkUpdate*`, refs) becomes variadic, every
  intermediate site must forward the whole chain, and arg-count grows with nesting. Fights the
  single-arg update design. **Not recommended.**
- **(b) `vs[SymbolParent]` — REJECTED (mutates user data).** A hidden symbol on the viewState
  set fresh each update. Fine for the **top-level** viewState (the component render constructs
  it fresh each invocation), but `$parent` inside a `forEach` needs the symbol on **array
  members**, which are **user-provided** objects. Mutating those has real footguns: object
  spread `{...item}` **copies enumerable own symbols**, `Object.freeze`d data throws, and a
  shared object reference reused across scopes carries one scope's parent. Not worth it even
  though the symbol conveniently auto-drops on `JSON.stringify`.
- **(b') `WeakMap<childObj, parentObj>`.** Side table instead of mutation; walk the chain via
  `map.get(map.get(item))`. ✅ no data mutation, GC-friendly, target-uniform, minimal compiler
  work. ⚠️ **O(items) sets per cascade** (same order as the symbol); ⚠️ **identity collision** —
  keyed by object identity, so the _same_ object reference used as an item in two scopes gets
  last-writer-wins and one scope reads the wrong parent. (A strong `Map` is worse — it leaks; if
  going this route it must be `WeakMap`.) Perf is acceptable (V8 `WeakMap` is ~O(1); the "slow"
  reputation is largely myth at UI volumes).
- **(b'') Captured holder cell (per scope-switch).** The generated `forEach`/`withData` body
  creates one `let parentHolder = { current }` captured by all item closures; the scope-switch
  update sets `parentHolder.current = newData` each cascade. ✅ no data mutation, no identity
  collision, O(scopes) writes. ⚠️ but it's a **parallel structure** that duplicates what
  `ConstructContext` already is (a per-scope object the leaf helpers already capture), plus
  extra codegen. Superseded by (c-live).
- **(c-live) Reuse `ConstructContext`: add `parent` pointer + in-place `update` — RECOMMENDED.**
  My earlier rejection of (c) was wrong: it conflated "context isn't updated _today_" with
  "context _can't_ be updated." The context does not need to be _reconstructed_ on the cascade
  (infeasible) — it needs to be **mutated in place** at the scope-switch update points that
  already hold it. `mkUpdateCollection` even has a standing TODO for this (element.ts:413:
  `// todo handle data updates of the parent contexts`). Design:
  - `ConstructContext` gains `parent?: ConstructContext` (set in `forItem`/`forAsync`/`forScope`)
    and `update(newData)` writing `this.data` (drop `readonly`).
  - Each scope-switch update writes its own context live — `parentContext.update(newData)` at the
    top of `mkUpdateCollection.update` (resolves the TODO), same in `mkUpdateWithData`/condition.
    The cascade already flows through these, so the whole parent chain stays current.
  - **Leaf helpers already retain their context** (`dynamicText` captures
    `context = currentConstructionContext()` at line 540); a parent binding reads
    `context.parent.currData`. Reused keyed items keep their `childContext`, whose `.parent` is
    the same captured object we mutate — so no staleness.
  - ✅ no data mutation; ✅ no identity collision; ✅ O(scopes) writes; ✅ **no new structure and
    simpler codegen** (no generated holder to thread) — the helper supplies parent to the closure
    from its retained context. ⚠️ makes `ConstructContext.data` mutable (was `readonly`); the
    sandbox/bridge still needs a receiving-side re-attach (unavoidable for any carrier).
- **(c-snapshot) `ConstructContext` read without in-place update — REJECTED.** Reading
  `context.parent.currData` when the context is a construction-time snapshot returns stale data.
  This is the trap; (c-live) fixes it precisely by adding the in-place `update`.

**Recommendation — (c-live): reuse `ConstructContext` (parent pointer + in-place `update`) for
the one location that needs it — reactive text/attribute bindings.** It rides the existing
top-down cascade without touching user data and without a parallel structure:

- **text/attr:** the helper passes parent data into the closure; binding compiles to
  `dt((vs, p) => p.listTitle)` where `p = context.parent?.currData`.
- **event handlers:** no carrier needed — the owning component already has parent data +
  `coordinate` (see architecture note), so `formatEvent`/`JayEvent` are unchanged.

`WeakMap` (b') / holder (b'') remain as fallbacks if we'd rather not make `ConstructContext.data`
mutable. Reject **(a)** (variadic/invasive), **(b)** (mutates user data), and **(c-snapshot)**
(stale). Injection sites for the in-place `parentContext.update(newData)`: `mkUpdateCollection`
(element.ts, the existing TODO at line 413), `mkUpdateWithData`, and `forAsync`/`resolved`.
Secure/bridge re-attaches parent on the receiving side regardless of carrier.

**Making the carrier live is necessary but NOT sufficient — see Q4a.** `parentContext.update` keeps
`context.parent.currData` fresh, but the collection/per-item reference gates (element.ts:418;
`wrapWithModifiedCheck`) skip the leaves before they can read it. The carrier must ship together
with the `dependsOnParent` gate-weakening from Q4a, or `$parent` bindings render stale.

**Note — this expands `ConstructContext`'s role.** Today `ConstructContext` is a
**construction-time-only** object: it supplies _initial_ data when new elements are created
(`currData` read by `dt`/`da`/refs at construction) and is never consulted again. Adding
`update` makes it a **persistent, live per-scope state carrier** used at both construction and
update. That is a deliberate, reasonable promotion (it becomes "more complete" — the natural home
for scope state), but worth stating explicitly since it changes the object's lifecycle contract
and means its `data` is now mutable state, not an immutable snapshot.

> _Answer: ok — reuse `ConstructContext` (parent pointer + in-place `update`). **Ship with the Q4a
> gate-weakening** so the live parent context actually reaches the leaves._

**Q8. How does pass-through data reach a component _with code_ (Tier 3)?** For Tier 2 (pure),
pass-through is trivial: props mirror tags = ViewState (DL#187 Q3/Q9), so a captured override
member is already a ViewState member. Tier 3 breaks that — the `.ts` computes ViewState from props,
and DL#187 Q3 / DL#84 deliberately keep props ≠ ViewState. Two routes for getting the override's
captured outer data to the override subtree of a coded component:
(a) **Props default to ViewState members** — auto-merge every prop into the ViewState unless a
declared ViewState field of the same name shadows it. Makes pass-through uniform across tiers, but
**widens ViewState type-gen for every coded component**, invents implicit members + shadowing
rules, and erases the props/ViewState separation Tier 3 exists to provide. Broad change for a
narrow need.
(b) **Targeted supply via the live-context carrier — RECOMMENDED.** Keep the component's ViewState
exactly what its code declares. `Panel$1ViewState extends PanelViewState` is a **compile-time
composition** for typing the override subtree's bindings and forwarded ref — **not** a runtime
member added to Panel's ViewState object. At runtime the captured data rides the same
`ConstructContext` carrier introduced for Capability A (Q7), injected at the override mount point;
the override subtree reads its captured members from that context. No props→ViewState projection,
no widened coded-component type-gen, separation intact.
**Recommendation: (b).** The narrow need (make captured outer data visible to the override
subtree) is served by the carrier we already need; Panel's own code and template never see it, so
it should never enter Panel's runtime ViewState. Route (a) is a large, surprising semantic change
to Tier 3 for something the carrier already covers. (Tier 2 stays trivial by its own props=tags
rule — no carrier needed there.)

> _Answer: **(b)** — targeted supply via the carrier; do not make props default to ViewState
> members. `Panel$1ViewState` stays a compile-time composition._

---

## Design

### Capability A — parent-scope data access (issues 3, and 2a option-b)

**Compiler (type generation):**

1. **Grammar** (`expression-parser.pegjs`): recognize a parent sigil in `accessor` /
   `propertyAccessor`, dispatched like the existing `jay`→`__jay` special case. Applies to the
   slow/dotted accessor rules too, for parity.
2. **`Variables.resolveAccessor`** (`expression-compiler.ts`): on a parent token, walk
   `this.parent` N levels and resolve remaining terms against `parent.currentType`. Type-safety
   flows automatically because `resolvedType` comes from the parent chain.
3. **`Accessor.render()`** must NOT root a parent access at the parent's `currentVar` — that var
   is not lexically in scope inside the child callback (Examples §A). A parent access renders to
   an extra closure param the binding helper supplies from its retained context, e.g.
   `dt((vs, p) => p.foo)` (or `p1`/`p2` for grandparent). `Accessor` records the climbed level so
   `render()` picks the right param.

**Runtime (revised — reuse `ConstructContext`; see Examples §A and Q7):** the initial map assumed
the client needs no runtime change because the parent var is lexically in scope. **That is wrong
for reactive bindings:** `dynamicText.update(newData)` receives only the current item, and keyed
list reuse makes any lexically-captured parent var stale. The chosen carrier makes the existing
`ConstructContext` live (variadic update and `vs[SymbolParent]` were rejected — Q7):

- **`ConstructContext`** (`context.ts`): add `parent?: ConstructContext` (set in
  `forItem`/`forAsync`/`forScope`) and an `update(newData)` that writes `this.data` (drop
  `readonly`). This promotes the context from a construction-time snapshot to a live per-scope
  carrier (see the role-change note in Q7).
- **Scope-switch updates** (`element.ts`): each writes its own context live —
  `parentContext.update(newData)` at the top of `mkUpdateCollection.update` (resolves the
  standing TODO at line 413), same in `mkUpdateWithData` and the conditional/async paths. The
  cascade already runs these, so the whole parent chain stays current.
- **Gate-weakening for `$parent` scopes (Q4a — required, not optional).** The reference-check gates
  short-circuit before the leaves: the collection gate (`element.ts:418` `items !== lastItems`) and
  the per-item `wrapWithModifiedCheck` (`context.ts:148`) both skip on unchanged item references, so
  a parent-only change never reaches the leaf. A compile-time `dependsOnParent` flag on the
  `forEach`/`conditional`/`withData` makes the runtime, on `newData !== lastParentData`, still
  propagate item updates (extra `else if` branch beside `isModified`) and bypass/parent-arm the
  per-item modified check. Plain scopes keep all fast gates. Leaf gate 3 (`dynamicText` DOM-write)
  is unchanged and correct — it recomputes on every call.
- **Leaf helpers** already retain their context (`dynamicText` line 540). `dynamicText` /
  `dynamicAttribute` pass parent data (`context.parent?.currData`, chained for deeper levels)
  into the binding closure as extra params → `dt((vs, p) => p.foo)`.
- **event handlers:** unchanged. No `formatEvent`/`JayEvent` change — the owning component reads
  parent fields directly from its own ViewState and uses `coordinate` to identify the item.
- **secure/bridge:** context is runtime structure (not serialized), so the main side works
  uniformly; the bridge target re-attaches parent on the receiving side.

**Files:** `expression-parser.pegjs` (+ `.cjs` rebuild + prettier), `expression-compiler.ts`
(`resolveAccessor`, `Accessor`), `context.ts` (`parent` + `update`; `wrapWithModifiedCheck`
parent-aware/bypass per Q4a), `element.ts` (`mkUpdateCollection`/`mkUpdateWithData`/async — set
parent context live **and** the `dependsOnParent` gate branch; `dynamicText`/`dynamicAttribute` —
pass parent to closures), the `forEach`/`conditional`/`withData` descriptor (`dependsOnParent`
flag) and its emission in the jay/hydrate codegen. **No change to `node-reference.ts`/`formatEvent`**
(event handlers reach parent data via the owning component + `coordinate`). Deferred to Phase 4:
`jay-html-compiler-bridge.ts`, `jay-html-compiler-server.ts`.

### Capability B — forwarded refs (issues 1, 2-refs)

**Issue 1 — pure-component inner refs.** The refs pipeline is
`contract tags → RefsTree → optimize/merge → type-gen + manager-gen → runtime`. Today a Tier 2
component contributes no refs. To forward:

1. **Parser** (`jay-html-parser.ts` `parseHeadfullFSImports`): for a Tier 2 import, also
   compile its own `.jay-html` to discover the named child-component refs inside it, and record
   them on the import (new field on `JayHeadlessImports`, alongside `structural`).
2. **Passthrough** (`structural-coercions.ts` `buildStructuralPassthroughComp`): today emits
   `(_props, _refs) => ({ render: () => _props })` and ignores `_refs`. Forward the inner
   refs through the returned object so the outer `DELEGATE_REFS_TO_COMP_TRAP` can reach them.
   **Pure passthrough — no event re-basing** (§B): the forwarded ref keeps the inner component's
   scope viewState; there is nothing to map, so this is a plain re-export.
3. **Type-gen** (`jay-html-compiler.ts` `renderHeadlessInstance` ref-type selection;
   `jay-html-compile-refs.ts` `renderRefsType`/`renderReferenceManager`): compose the forwarded
   sub-tree into the usage site's Refs type, typed against the **inner** scope
   (`cta: ButtonRef<CardViewState>`) — no re-basing to the usage-site VS.
   `optimizeRefs`/`graftTemplateOnlyRefs` already know how to graft imported sub-trees — the
   forwarded refs must actually populate the tree.
4. **No `forEach` inside a pure composite** (corrected): a pure component cannot receive a
   composite/array prop (DL#187/DL#84), so it has no internal `forEach` and no inner collection
   refs. Collections arise only when the **composite itself** is placed under a usage-site
   `forEach` (`<jay:Card forEach="cards" ref="cards">`) → `cta` becomes `ButtonRefs<CardViewState>`
   nested under the usage-site forEach manager. The single-vs-collection decision is made entirely
   at the usage site; the existing collection machinery covers it once the tree carries the
   forwarded ref.

**Issue 2 — override-introduced refs (inheritance model, Q3-option-c).** Requires persisting
override provenance on the AST node (re-introduce `overrides: OverrideDeclaration[]` on the
`<jay:Name>` node), then emitting a per-site specialization: `Panel$1Refs extends PanelRefs` with
the override's refs _added_ (typed against `Panel$1ViewState`, not the outer VS — §C). The added
refs graft into the specialization's RefsTree and forward up exactly like §B pure-component refs
(same `DELEGATE_REFS_TO_COMP_TRAP` passthrough, no re-basing). Files: `jay-html-overrides.ts`,
`jay-html-parser.ts` injection sites, `jay-html-compile-refs.ts` (`graftTemplateOnlyRefs`),
`contract-to-view-state-and-refs.ts`, `jay-html-compiler-shared.ts`.

**Runtime (B):** `references-manager.ts` (`mkRefs`/`mkManagedRef`) and `node-reference.ts`
(`ComponentRefsImpl`, `DELEGATE_REFS_TO_COMP_TRAP`) already forward member access to a mounted
instance's public API. The new requirement is that the passthrough/override component's public
API _carries_ the child refs — mostly a compiler-emission change, minimal runtime change.
**Because forwarding does not re-base events** (§B), the runtime side is unchanged beyond
carrying the refs: `RefImpl` keeps delivering its own scope viewState via the existing
`formatEvent`; no boundary-crossing viewState mapping is added.

### Issue 2 — override data binding (inheritance model, recommended option-c)

Emit a per-site specialization `Panel$1ViewState extends PanelViewState` (§C, Q3-c). The added
members are computed **by capture, not declaration**: the override is authored in the outer file,
so its bindings resolve against the outer scope by ordinary lexical scoping; the compiler's
free-variable scan of the fragment is the capture list, and each captured outer identifier
(typed by resolving against the outer scope) becomes an added `Panel$1ViewState` member, supplied
from the outer scope as extra data down the normal update channel — the same props→ViewState
passthrough as a Tier 2 pure component. The override's bindings then read `Panel$1ViewState`
(pass-through), and its refs forward up carrying `Panel$1ViewState` (no re-basing). `$parent` is
never authored here — the compiler emits it internally only for the inner-`forEach` sub-case
below. Persist override provenance so the compiler knows which nodes belong to the specialization.
Validate outer/inner name collisions (an outer capture colliding with a differently-typed
`PanelViewState` member makes the `extends` ill-typed). Files: `jay-html-overrides.ts`,
`jay-html-parser.ts`, `jay-html-compiler.ts` (emit the specialization + extra-data wiring),
`expression-compiler.ts` (free-var scan / outer-scope typing), `contract-to-view-state-and-refs.ts`.

The one remaining sub-case: an override mounted inside `Panel`'s own internal `forEach` — the
hoisted member sits at `Panel$1` top level but is read from an item scope, which is Capability A
(`$parent`). The inheritance model (type/surfacing) and the `$parent` runtime primitive compose.
**This is the strongest argument for building A first (Q5).**

---

## Implementation plan (phased, pending answers)

- **Phase 0 (this DL):** approve direction + answer Q1–Q5.
- **Phase 1 — Capability A (issue 3):** grammar `$parent`, `resolveAccessor` parent walk,
  type tests, fixtures **plus** the runtime primitive — `ConstructContext` parent pointer +
  parent-aware binding helper **and the Q4a gate-weakening** (`dependsOnParent` flag; collection +
  per-item gate branches). Client + hydrate first. Unblocks 2a disambiguation.
  **Plus a runnable example** — add a `$parent`-in-`forEach` example under `examples/jay/`
  (non-jay-stack), following the `examples/jay/todo` dual layout: a `lib/` build (regular/trusted,
  `index.html`) **and** a `lib-secure/` build (sandbox/bridge, `secure.html`), both wired through
  the vite plugin. This is the end-to-end proof that the same `{$parent.field}` template renders
  identically in **regular and secure mode** (secure exercises the receiving-side parent re-attach).
  Note: secure/bridge parent plumbing is Phase 4, so this example's secure build is the forcing
  function that Phase 4 must satisfy — track it as the secure-mode acceptance gate, not a
  Phase-1-only deliverable.
- **Phase 2 — Issue 2 (overrides):** persist override provenance; compile against outer scope;
  graft override refs into outer RefsTree; forward override refs at runtime.
- **Phase 2c — server-target `$parent` (SSR):** make the server compiler resolve override parent
  bindings lexically (structural-instance case). Pulled out of the original Phase 4 because it
  completes Phase 2 for full-stack use and is independent of Phase 3. See the "Phase 2c" section near
  the end of this doc.
- **Phase 3 — Issue 1 (pure-component ref forwarding):** parser discovers inner refs;
  passthrough forwards them; type-gen composes forwarded (single + collection) sub-trees.
- **Phase 4 (Q4):** extend Capability A's parent pointer to secure/bridge code generators (the
  runtime `ConstructContext` field lands in Phase 1; this threads it through the remaining emitters).
  **The server target moved to Phase 2c**; Phase 4 is now secure/bridge (and React) only.

Each phase: write/adjust fixtures first (full `toEqual` comparisons, never `toContain`),
prevention-first (add validation for unsupported target/phase combos before adding syntax).

---

## Test plan

Standards (CLAUDE.md): fixture-based (`test/fixtures/<feature>/`), full `toEqual` comparisons with
`prettifyHtml` for HTML — **never `toContain` on code**, helper functions over `beforeEach`, one
test file per module. Every runtime behavior is validated on the three targets it must hold for:
**client (trusted)**, **hydrate**, and **secure (sandbox/bridge)**; compiler codegen is checked
per target via generated-element fixtures.

### 1. Runtime unit tests — Capability A carrier + gates (the crux)

Package `packages/runtime/runtime`. The gate matrix (Q4a) is the highest-risk area — it gets an
exhaustive truth table because a wrong gate silently renders stale, the exact bug this design
exists to prevent.

- **`context.test.ts` — carrier.** `forItem`/`forAsync`/`forScope` set `parent`; `update(newData)`
  mutates `data`; `currData` reflects the update; `parent.currData` is live after a parent update;
  chained `parent.parent` for grandparent depth.
- **`element.test.ts` — `$parent` gate truth table** inside a `forEach` with a `{$parent.field}`
  leaf, asserting **both** the DOM result (`toEqual` on rendered text) **and** that no redundant
  DOM write happened when nothing relevant changed (spy/observe `textContent` sets):

  | #   | parent data | items array ref         | item member        | expected                                         |
  | --- | ----------- | ----------------------- | ------------------ | ------------------------------------------------ |
  | 1   | changed     | unchanged (keyed reuse) | unchanged          | `$parent` leaf **updates** — the regression case |
  | 2   | changed     | changed                 | —                  | `$parent` + item leaves both correct             |
  | 3   | unchanged   | unchanged               | changed (one item) | item leaf updates; `$parent` leaf no DOM write   |
  | 4   | unchanged   | unchanged               | unchanged          | **no** DOM writes at all                         |
  | 5   | unchanged   | reordered (same refs)   | unchanged          | keyed reuse intact, `$parent` unchanged          |

- **`element.test.ts` — fast path preserved.** A `forEach` **without** `$parent`
  (`dependsOnParent=false`) keeps the `items !== lastItems` skip and per-item
  `wrapWithModifiedCheck` skip — assert item `update` is **not** invoked when the items array ref is
  unchanged (spy).
- **Scope kinds.** Repeat case #1 for `conditional` (`if`) and `withData` scopes, and for
  `dynamicAttribute` (`{$parent.field}` in an attribute), not just `dynamicText`.
- **Depth.** `$parent.$parent.field` inside a nested `forEach` updates when the grand-parent changes
  and the inner two scopes' data are unchanged.

### 2. Runtime unit tests — Capability B forwarding + override refs

- **`node-reference.test.ts` / `references-manager.test.ts`.** A forwarded inner ref delivers the
  **inner** scope viewState in its event (no re-basing) — `cta.onClick` handler receives
  `CardViewState`. Collection: `refs.cards.cta.onClick` fires per card with that card's viewState;
  `refs.cards.cta.find(...)` reaches one card.
- **Override refs.** `refs.panel.save.onclick` fires to the outer handler; event carries
  `Panel$1ViewState` (includes the captured `documentName`).

### 3. Compiler tests — type-gen + codegen fixtures (`toEqual`)

Package `packages/compiler/compiler-jay-html`. Each gets input `.jay-html` (+ `.jay-contract`) and
an expected generated file compared with full `toEqual`.

- **Capability A codegen.** `$parent` in a `forEach` emits `dt((vs, p) => p.field)` and sets
  `dependsOnParent` on the descriptor; per target (client, hydrate). Multi-level, and `$parent` in
  `if`/`withData`.
- **`resolveAccessor` unit tests** (`expression-compiler` test): `$parent.field` resolves to the
  parent type; `$parent.$parent`; unknown parent member → error; `$parent` at root (no parent) →
  error.
- **Capability B type-gen.** Pure composite with `<jay:Button ref="cta">` → `CardRefs { cta:
ButtonRef<CardViewState> }` grafted into the usage site; composite under a usage-site `forEach` →
  `ButtonRefs<CardViewState>`. Auto (unnamed) inner refs are **not** forwarded.
- **Override inheritance type-gen.** `Panel$1ViewState extends PanelViewState { documentName }` and
  `Panel$1Refs extends PanelRefs { save: HTMLElementProxy<Panel$1ViewState, …> }`; only the
  referenced outer members are hoisted; override inside `Panel`'s internal `forEach` emits the
  compiler-internal `$parent` + `dependsOnParent`.

### 4. Validation tests (prevention-first)

Package boundary that owns each rule; assert the **exact error message** (string equality on the
diagnostic, not `toContain`):

- `$parent` with no ancestor scope → error.
- `$parent` (or override reactive outer binding) on an unsupported target/phase → error.
- `forEach` **inside** a pure (Tier 2) composite → error (no array prop can reach it).
- Override outer capture whose name collides with a differently-typed `PanelViewState` member →
  error (would make `extends` ill-typed).

### 5. Example (end-to-end) tests — regular + secure

Under `examples/jay/`, following the `examples/jay/todo` dual layout (`lib/` + `index.html`,
`lib-secure/` + `secure.html`, both via the vite plugin):

- **`$parent`-in-`forEach` example** (Phase 1 / Phase 4 gate): renders identically in regular and
  secure mode; updating parent data live re-renders the `$parent` bindings with items unchanged
  (the case #1 regression, end-to-end); reordering/removing items keeps them correct.
- **Pure-composite ref-forwarding example** (Phase 3): `refs.card.cta` wired at the usage site fires;
  collection variant under a usage-site `forEach`.
- **Override example** (Phase 2): injected `save` fires to the outer component and `{documentName}`
  renders/updates; a variant with the override inside the container's internal `forEach`.

Each example is the **secure-mode acceptance gate** for its phase (secure/bridge codegen is Phase
4): the example's `lib-secure` build failing to match `lib` output is a release blocker, not an
optional extra.

### 6. Coverage traceability

Every verification criterion (below) maps to at least one runtime test **and** one example:
criterion 1/1a → §1 gate table + §5 `$parent` example; criterion 2 → §2 forwarding + §3 type-gen +
§5 composite example; criterion 3 → §2 override refs + §3 override type-gen + §5 override example;
criterion 4 → §4 validation. A criterion with no green test in **both** columns is not "done."

---

## Trade-offs

- **`$parent` weakens scope isolation** (DL#84's deliberate default). Mitigation: explicit
  opt-in sigil, not implicit fall-through; keep `resolveAccessor` erroring on unknown members.
- **Ref forwarding crosses DL#187's "Tier 2 has no refs" line.** It adds _no code_ to the
  Tier 2 component but does make it a ref surface. Needs an explicit decision (Q2); may warrant
  a one-line amendment to DL#187.
- **Inheritance/specialization for overrides** (`Panel$1 extends Panel`) unifies overrides with
  the §B pure-component model (no re-basing, data passes through as ViewState) and avoids a runtime
  back-pointer, but adds a per-site generated subtype and a free-var hoist pass; nested inner
  `forEach` still needs Capability A (`$parent`) and is the sharp edge.
- **Parent bindings cost a `ConstructContext` parent pointer on all targets** (Examples §A) —
  the "free on client via lexical capture" shortcut is unsafe (stale on keyed reuse). This is a
  small but real shared runtime primitive; building it once is cheaper than a client-only
  special case that later needs redoing.

## Verification criteria

1. From inside a `forEach`, `$parent.field` compiles to a type-safe binding on the parent var
   (client) with a full-fixture `toEqual` match; unknown parent member → validation error.
   1a. A runnable `examples/jay/` example binds `{$parent.field}` inside a `forEach` and renders the
   **same** output in **regular mode** (`lib/` + `index.html`) and **secure mode** (`lib-secure/` +
   `secure.html`), updating live as parent data changes (no staleness on keyed reuse).
2. A pure composite wrapping `<jay:Button ref="cta">` exposes `cta` at the usage site typed
   `ButtonRef<CardViewState>` (inner scope, **not** re-based to the usage-site VS); its event
   delivers `CardViewState`. Placing the composite under a usage-site `forEach` exposes
   `ButtonRefs<CardViewState>` (collection). No `forEach` inside the pure composite is possible
   (compile error / validation if attempted, since no array prop can reach it).
3. An override injecting `<button ref="save">Save {documentName}</button>` into a container emits
   a `Panel$1ViewState extends PanelViewState` / `Panel$1Refs extends PanelRefs` specialization:
   `documentName` is hoisted into `Panel$1ViewState` (typed from the outer scope, supplied as extra
   data); `save` forwards up typed `HTMLElementProxy<Panel$1ViewState, …>` (no re-basing) and its
   event delivers `Panel$1ViewState`. An override mounted inside `Panel`'s internal `forEach`
   reaches the hoisted member via `$parent` (Capability A).
4. Unsupported target/phase combinations produce a clear validation error, not a silent
   miscompile.

---

## Implementation Results — Phase 1 (Capability A)

Phase 1 (`$parent` parent-scope binding for reactive **text/attribute** bindings inside
`forEach`/`if`/`withData` scopes) is complete for the **client** and **hydrate** targets, with
React and server producing validation errors (unsupported-target, prevention-first). Event handlers
are out of scope for Phase 1 as designed.

### What shipped

- **Grammar + accessor resolution.** `$parent` parses as an Identifier and is recognized in
  `resolveAccessor`, which walks up the scope chain. Chainable (`$parent.$parent.field`). Unknown
  parent member and `$parent` at root both error at compile time.
- **`parentDepth` propagation.** `RenderFragment.parentDepth` carries the deepest `$parent` climb;
  propagated via map/merge (`Math.max`), decrements by 1 at scope-switches (forEach/withData/async),
  passes through unchanged at `if`.
- **Codegen.** Leaf closures emit the parent positionally — `da((vs1, _p1) => _p1.groupLabel)`,
  `dt((vs1, _p1) => _p1.groupLabel)` — and the enclosing `forEach`/`hydrateForEach` carries the
  `dependsOnParent` flag to weaken the keyed-update gate so parent-only changes re-run item leaves.
- **Runtime primitive.** `ConstructContext` parent pointer + `parentDataChain(context)` (nearest-first
  `_p1, _p2, …`); the Q4a gate-weakening branches in `forEach`/`hydrateForEach`.
- **Example.** `examples/jay/parent-binding` — dual regular (`lib/` + `index.html`) + secure
  (`lib-secure/` + `secure.html`) build via the vite plugin, mirroring `examples/jay/todo`. The
  "relabel group" action changes only `groupLabel` (cards array ref untouched) and every
  `{$parent.groupLabel}` leaf updates — the case #1 regression, end-to-end.

### Test results

- **compiler-jay-html** full suite: **738 passed / 4 skipped**.
- **runtime** full suite: **278 passed / 3 skipped**.
- Example `yarn build:js`: both regular and secure builds succeed (23 modules); generated
  `board.jay-html.ts` verified to emit `da/dt((vs1, _p1) => _p1.groupLabel)` and
  `forEach(..., 'id', true)`.
- `yarn build:check-types` on the example reports a `vite.config.ts` TS2769 overload error — this
  is a **pre-existing** duplicate-vite-install type conflict shared by `examples/jay/todo`
  (identical `vite.config.ts(15,29): error TS2769`), not a defect in the example source. All
  `lib/`/`lib-secure/` sources type-check clean.

### Deviations from the initial design

1. **Closure param naming `_p{level}`** (not the design sketch's `p`). `_p1` = immediate parent,
   supplied positionally by the runtime from `parentDataChain` (nearest-first). Chosen to avoid
   collisions with the existing `vsN` viewState params and to make depth legible in generated code.
2. **Only `forEach` carries the runtime `dependsOnParent` flag.** `if`/`withData` do not gate on a
   keyed-collection identity check, so they re-render their leaves on any parent update without a
   flag; the flag exists solely to weaken `forEach`'s `items !== lastItems` + per-item
   `wrapWithModifiedCheck` skips.
3. **React and server are validation errors, surfaced two different ways.**
   - React: `guardReactParentBinding` appends `'$parent bindings are not supported in the React
target'` when `parentDepth > 0` (React compiler preserves `fragment.validations`).
   - Server: the server compiler **drops** `fragment.validations` at ~15 `w(...)` sites, so an
     appended validation never reached output. Instead `guardServerParentBinding` **throws**
     `UnsupportedServerParentBindingError`, caught in `generateServerElementFile` and converted to
     `new WithValidations('', [UNSUPPORTED_TARGET_PARENT_MESSAGE])`. Throwing covers all sites
     uniformly. Message: `'$parent bindings are not yet supported in the server target'`.
4. **Bridge/secure needs no guard in Phase 1.** The `.jay-html` view renders on the **main** thread
   via `?jay-mainSandbox` using the **client** target, so `$parent`/`dependsOnParent` codegen is
   already present and correct; the worker sandbox (`?jay-workerSandbox`) uses `sandboxForEach`,
   which only tracks the collection and needs no flag. (Full secure/bridge parent plumbing remains
   Phase 4; this example's secure build is its acceptance gate.)
5. **`forScope` data-liveness fix (`_liveDataSource`).** `forScope` previously snapshotted
   `this.data`; the forScope decorator becomes the leaf's `_p1` parent during hydration and went
   stale on in-place parent updates. Added `ConstructContext._liveDataSource`: `currData` delegates
   to the live source, and `forScope` sets `child._liveDataSource = this`. This is a broad runtime
   change beyond the original design sketch, required for correctness under hydration.
6. **Hydrate parent-chain plumbing.** `adoptText` and `adoptBase` (dynamic attributes) now pass
   `...parentDataChain(context)` on both init and update, with signatures widened to
   `(vs, ...parents: any[])`. The original design described the client path; hydrate required the
   same threading explicitly.

---

## Phase 2 pre-implementation trace & decisions (2026-09-16)

Before implementing Issue 2 (overrides), the injection compile model was traced end-to-end and
three open decisions were settled with the user. This section records the findings and decisions;
it refines — does not rewrite — the Phase 2 design above.

### Compile-model trace (grounding the runtime cost)

A `<jay:Panel>` headfull-FS usage (Tier 3, has a `.ts`) compiles via `renderHeadlessInstance`
(`jay-html-compiler.ts:839-1045`):

- The injected/overridden body is compiled **inline** into a per-instance render function
  (`_headlessPanel0Render`, ~966-985) that builds its **own** `ReferencesManager` from the merged
  template refs (`mergeContractStubRefs`, `jay-html-compiler-shared.ts:291-333` — keeps **all**
  template refs), and is mounted at the page as `childComp(_HeadlessPanel0, getProps, ref)`
  (~1039-1041).
- The page-side ref handed back is a `ComponentRefsImpl` typed **`PanelRefs`** (contract only,
  ~1013-1035). The inline instance's refManager public API is passed to **Panel's own component
  code** as its `refs` param (`headless-instance-context.ts:154-160`) — it is **not** grafted into
  the page's refs tree.
- Tier 2 (structural) differs only in swapping `buildStructuralPassthroughComp(tags)` for the real
  component at the mount; inner body refs still land in the inline instance's refManager (which the
  passthrough currently ignores).

**Where a spliced `<button ref="save">` ends up today:** inside the **inline instance's**
refManager (handed to Panel's code), **not** the page refs tree, and **not** discarded. The page's
`ComponentRefsImpl` forwards `refs.panel.save` via `DELEGATE_REFS_TO_COMP_TRAP`
(`node-reference.ts:398-401`) only to the comp's **public API** (event-emitters), which has no
`save`; and the page ref type is `PanelRefs`, which does not declare `save`.

**Correction to the earlier "minimal runtime change" claim (Capability B, Issue 2 runtime note).**
The claim holds for the **data-binding** half (the body is compiled inline at the page, so
`{documentName}` and the `Panel$1ViewState` hoist are in reach during page compilation — cheap) but
is **too optimistic for the ref-forwarding half**. Surfacing `refs.panel.save` needs both:

1. **Type** — emit `Panel$1Refs extends PanelRefs { save: … }` and type the page-side instance ref
   as `Panel$1Refs` (new `extends` + `$1` naming machinery — neither exists today).
2. **Runtime** — bridge the page-side `ComponentRefsImpl` to the **inline instance's refManager**
   (where `save` physically lives), not the comp public API. This is a genuine runtime change,
   localized to the inline-instance mount (`makeHeadlessInstanceComponent` / the instance public
   API), not just compiler emission.

### Decisions settled (2026-09-16)

1. **Binding scope — outer-scope only (DL#193 §C), confirmed.** Override `{bindings}` resolve
   against the **outer (page) scope** and free-vars hoist into `Panel$1ViewState extends
PanelViewState`. Reaching the target component's **own** data from an override is **out of
   scope**. This **supersedes DL#181 Q6/VC#5** (which resolved override bindings against the
   target's own ViewState). Risk is low: DL#181's own Implementation Results note Q6 was "satisfied
   by construction … not separately exercised" by any live-binding test. A supersession note is
   added to DL#181.
2. **Naming/uniquing convention — `Panel$1`, `Panel$2`.** Per-site specialization types are named
   `<BaseComponentName>$<n>`, where `n` is a per-base-component counter in document order within the
   compiled page (`Panel$1`, `Panel$2`, `Card$1`, …). `$` is already idiomatic in Jay (`exec$`,
   `find$`). Reordering override sites renumbers the generated names — acceptable, as these are
   generated types. (Resolves the "still open" naming item from Q3.)
3. **Phasing — split Phase 2 into 2a then 2b.**
   - **Phase 2a — override outer-data binding + ViewState hoist.** Persist override provenance;
     free-variable scan of the override fragment against the outer scope; emit `Panel$1ViewState
extends PanelViewState { …captured }`; compile the inline body's bindings against
     `Panel$1ViewState`; supply captured data via the carrier (Q8-b). Client-inline, cheaper, fully
     testable on its own.
   - **Phase 2b — override ref forwarding.** Emit `Panel$1Refs extends PanelRefs { …overrideRefs }`,
     type the page-side instance ref as `Panel$1Refs`, and add the runtime bridge from the page
     `ComponentRefsImpl` to the inline instance's refManager. Depends on 2a's provenance +
     specialization machinery.

### Collision validation (prevention-first, folded into 2a)

An override's captured outer var whose name collides with an existing `PanelViewState` member of a
**different type** makes `Panel$1ViewState extends PanelViewState` ill-typed. This is a **hard
compile/validation error** with an exact message (test plan §4), not a silent shadow — added as
part of Phase 2a.

## Phase 2a design revision — merge-time `$parent`-remap (2026-09-16)

During Phase 2a implementation, the binding half of §C was reworked with the user to reuse
Capability A instead of building a new capture/hoist path. This **supersedes** the "capture → hoist
into `Panel$1ViewState`" data-path described in §C (lines ~380–405), decision 3's "Phase 2a" bullet,
and the "Collision validation" subsection above. The **ref**-forwarding half (Phase 2b) is
unchanged.

**What changed and why.** §C's data path is now realized by the compiler-internal `$parent`
primitive it already anticipated ("the same primitive is used, but under the hood", §C ~line 401) —
which the user confirmed was the intended implementation, not a reversal of Q3. Q3 rejected only the
**author-facing** `$parent.` syntax; the author still writes plain `{documentName}`. This is **not**
Q3-option-b.

1. **Merge-time `$parent`-remap.** When an override's content is spliced into the target
   (`applyOverrides`), the compiler rewrites each binding's free roots to `$parent.` using the
   **real expression parser** (not string surgery, so `{a ? b : c}` → `{$parent.a ? $parent.b :
$parent.c}` and `{doc.name}` → `{$parent.doc.name}` are exact). The remapped `{$parent.…}` is
   **self-describing provenance**, so the `data-jay-override-content` marker is **dropped**.
2. **No data-hoisting, no `Panel$1ViewState` for the data path.** Captured page data rides the
   Capability A `parentDataChain`, typed against the page scope where `$parent` resolves. It does
   **not** become a member of any generated ViewState. `classifyOverrideBindings` and the
   `Panel$1ViewState extends …` emission are therefore **not built** for bindings (Phase 2b may
   still emit `Panel$1Refs` for the ref surface).
3. **No cross-scope collision.** Because `$parent.documentName` and Panel's own `documentName` live
   in different scopes, the "collision validation" case above **cannot occur** and is dropped.
4. **`renderHeadlessInstance` parent wiring.** The inline component's `Variables` is given the page
   scope as its parent so `$parent.*` resolves; at runtime the page data is supplied as the parent
   source across the `childComp` boundary (the one genuinely new bit of plumbing).

**`forEach` overrides are unsupported (new decision).** An override targeting a ref that sits inside
the target component's own `forEach` is **not supported**: the outer author has no way to name the
inner per-item ViewState to bind against, and no way to address specific iterations — a per-item
override is semantically undefined from the outer scope. This **removes** §C's "Sub-case — override
region inside Panel's own `forEach`" (lines ~420–424). Per prevention-first, this is a **hard
compile/validation error** (not a silent no-op): `<override ref="x">` whose target lies within a
`forEach` in the target template is rejected with a message pointing at the ref.

**Prose correction.** §C line ~382 ("supplied … as extra data — **no runtime back-pointer**") no
longer holds: the `$parent`/`parentDataChain` route **is** a runtime back-pointer. Treat that clause
as superseded by this subsection.

### Mechanism refinement — parent-scope pragma (supersedes point 1 above)

Point 1's "rewrite each binding's free roots to `$parent.`" was refined during implementation to a
**single mark per binding location**, at the user's direction, because a per-accessor `$parent.`
rewrite requires the merge step to itself parse and classify every sub-expression (field vs. enum
value vs. class name) — duplicating the real parser's job and getting it wrong for compound
expressions.

Instead: `applyOverrides` prefixes each **binding location** — every text node and every non-literal
attribute value — with a compiler-internal pragma `@jay:parent ` (`PARENT_SCOPE_PRAGMA`). A single
mark at the start of a value covers all `{…}` within it. The pragma is:

- **Injected** in `remapOverrideBindingsToParent` (`jay-html-overrides.ts`) by walking the override
  HTML fragment. Literal-read attributes (`ref`, `trackBy`, `jay-coordinate-base`, `jay-scope`) are
  **not** marked — everything else (`if`, `forEach`, `class`, `style`, boolean attributes, component
  props, text) funnels through the expression parser and is safe to mark.
- **Stripped** at the single parse choke point `doParse` (`expression-compiler.ts`), which then
  resolves the value against `vars.withParentShift(1)`.
- **Resolved** by `Variables.withParentShift(n)`: a view of the scope whose `resolveAccessor`
  transparently prefixes `n` `$parent` tokens (skipping `jay.*` and explicit `$parent.*`), so the
  existing Capability A machinery (`parentLevel` → `parentDepth` → `(vs, _p1) => …` closure →
  runtime parent chain) drives everything. **No grammar change** is needed for the mark itself.

Because the discrimination is handed to the real parser, compound expressions resolve correctly —
`{status == active ? primary}` climbs only `status`, leaving the enum value `active` and class name
`primary` untouched. The `data-jay-override-content` marker and any per-accessor rewrite are dropped.

**Incidental grammar fix.** `ternaryClassExpression` dropped `acc.parentDepth`, so a parent-scoped
class ternary emitted a body referencing `_p1` under a `vs =>` closure. Fixed to propagate
`parentDepth` (regenerated `expression-parser.cjs`). This also fixes Capability A class ternaries.

**Status (2026-09-16).** Compile-time mark + shift implemented and unit-tested (text, attribute,
property, boolean, condition, compound class ternary, style, `jay.*` passthrough, static-strip;
plus the merge-step marking with the literal denylist). Still open: (a) `renderHeadlessInstance`
parent wiring, (b) runtime parent-chain supply across the `childComp` boundary into the inline
instance render, (c) the `forEach`-target validation error.

## Phase 2a runtime revision — synthetic parent context from a `__parentContext` prop (2026-09-16)

This **supersedes** open items (a) and (b) above and the earlier "reuse the Capability A carrier /
supply the page data as the parent source across the `childComp` boundary" note (design revision
point 4). The **binding compile model is unchanged** — overrides still compile to ordinary
`$parent` bindings via the pragma → `withParentShift` → `_p1` path already landed. What changes is
**how `_p1` is supplied at runtime**.

### Why the earlier "back-pointer across `childComp`" route was wrong

Two runtime traces (against the real code) settled it:

1. **The parent chain is deliberately cut at the component boundary, and the cut is only a
   _policy_.** `withRootContext` (context.ts:344) and `withHydrationChildContext` (context.ts:377)
   create parent-less roots; the comment attributes this to DL#84 data isolation. The cut is **not**
   required for coordinates/dataIds/hydration — those are carried by separate fields and are even
   deliberately _inherited_ across the boundary (`withHydrationChildContext` context.ts:380-382).
2. **But the Capability A liveness machinery does not cross the boundary, so a back-pointer would be
   reactively dead.** `parentContext.update()` fires only inside scope-switch updates _within one
   element tree_ (element.ts:431, 522; hydrate.ts:560), each component has its own `mkReactive`
   graph (component.ts:136), and the page root context is never updated in place. Setting
   `child.parent = pageContext` would deliver stale data: page changes would never re-run the
   child's leaves.

The **props/update channel is the only reactive cross-boundary path** (childComp.update →
`propsProxy.update` → the child's reaction, element.ts:55, component.ts:187-189, 170-181). So the
parent data must ride that channel — not a context back-pointer.

**Secure/bridge trace (the double-serialization concern).** Props **never cross the sandbox
bridge**: `getProps` is computed _locally_ on each side from that side's copy of the parent
ViewState (sandbox `sandbox-element.ts:39-44`, main `main-child-comp.ts:17-34`). The one stream that
_is_ serialized up per update is the child's **rendered element ViewState** (`sandbox-refs.ts:414-419`).
Therefore the parent data must **not** be folded into the child's rendered ViewState (that was the
flaw in the "inject a `__parent` member inside `makeHeadlessInstanceComponent.render`" idea — that
render runs in the sandbox and would up-serialize the data). It must be reconstructed on the
**receiving/DOM side** from the locally-computed prop — "direct forwarding in the component bridge",
zero wire bytes.

### The mechanism

1. **Usage site (compiler).** `renderHeadlessInstance` free-var-scans the override's
   `$parent`-marked bindings and emits a **narrow, reactive projection** of only the captured fields
   as a reserved prop `__parentContext`:

   ```ts
   // <jay:OverrideCard><override ref="cta">{itemName}</override></jay:OverrideCard>
   childComp(OverrideCard, (vs) => ({ __parentContext: { itemName: vs.itemName } }), ref());
   ```

   Narrow (not the whole page VS) → it only re-fires on changes to fields the overrides use, and it
   keeps the payload small. Emitted **only** when the inline body has parent-scoped bindings
   (`inlineBody.parentDepth > 0`).

2. **Receiving side (runtime).** The component (and, in secure, the **component bridge** on main)
   intercepts the `__parentContext` prop and builds a **synthetic `ConstructContext`** seeded with
   that value, set as the parent of the component's own root context. From there the override
   bindings are ordinary `$parent` bindings resolved by `parentDataChain` — the existing Capability A
   primitive. On each cascade the handler calls `synthetic.update(newValue)`.

3. **No double serialization.** `__parentContext` is computed locally by `getProps` on whichever
   side needs it; the synthetic parent is built on the DOM side; the parent data never enters the
   child's up-serialized rendered ViewState. In secure, `main-bridge.ts` builds the synthetic parent
   from the prop it already receives locally (main-child-comp.ts calls `childComp(bridge, getProps,
ref)`), so no extra wire cost.

### The load-bearing wrinkle — root-boundary gate weakening (Q4a analog)

`wrapWithModifiedCheck` (context.ts:165-168) gates the whole element update on **reference equality
of the child's own viewState**; the child root is wrapped by it (`withRootContext` context.ts:354).
So when _only_ `__parentContext` changes and the child's own VS ref is unchanged, the root update is
**skipped** and the `$parent` leaves never recompute → stale. This is exactly the Q4a problem solved
for `forEach` via `dependsOnParent` (element.ts:448-453, 461-469). Here we need the **component-root
analog**: when the synthetic parent's value changed, force the root element update to run even if the
child's own VS ref is unchanged. The synthetic-parent update handler both `synthetic.update(v)` and
drives the leaves past the modified-check.

### Implementation pieces

| Layer                 | Change                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compiler — usage site | `renderHeadlessInstance`: free-var scan the override's `$parent`-marked bindings → emit `__parentContext: { …captured }` in `getProps`, only when `parentDepth > 0`           |
| Compiler — bindings   | **done** — pragma → `$parent` → `(vs, _p1) => _p1.x`                                                                                                                          |
| Runtime — context     | `withRootContext`/`withHydrationChildContext` gain an explicit optional synthetic-parent (page root stays parent-less); root gate-weakening when the synthetic parent changed |
| Runtime — component   | detect `__parentContext` prop → build/maintain synthetic `ConstructContext`, wire as root `.parent`, `update()` on change                                                     |
| Runtime — bridge      | `main-bridge.ts`: same synthetic-parent handling from the locally-computed prop (no wire cost)                                                                                |

### Verification criteria

- A page-authored `<override>{pageField}</override>` renders the page field, and **updates live**
  when the page field changes — in **client, hydration, and secure** targets.
- The secure bridge sends **no additional patch** for the parent data (it is not part of the child's
  rendered ViewState) — asserted on the wire/messages.
- Panel's own code and template never see `__parentContext`; it is absent from the DL#128 automation
  snapshot (`instanceData.viewStates`).
- `forEach`-target override remains a hard compile error (open item (c), unchanged).

**Reserved key.** `__parentContext`, following the `__jay` precedent (reserved, compiler-internal,
author never writes it).

## Implementation Results — Phase 2a (2026-09-16)

Phase 2a is implemented and green across the client (element), hydration, and secure targets. The
binding compile model landed in Phase 1 is unchanged (pragma → `withParentShift` → `_p1`). The
runtime-supply mechanism shipped with **three deviations** from the design above, all simplifications.

### Deviation 1 — `vs => vs` whole-parent model (no field derivation)

The design proposed a **narrow projection** of only the captured fields
(`__parentContext: { itemName: vs.itemName }`) built from a free-var scan of the override bindings.
Per user direction this was dropped in favor of emitting the **whole enclosing view state**:

```ts
childComp(
  _HeadlessCard0,
  (vs) => ({ heading: 'Premium', jc: 'card', __parentContext: vs }),
  refAr0(),
);
```

Rationale: view states are immutable, so passing the whole `vs` makes **every** `$parent` expression
"just work" (`_p1.<anyField>`) with **no** compiler-side derivation of which fields an override uses,
and no risk of missing a field. There is no double-serialization cost because `__parentContext` is
computed locally by `getProps` on each side and never enters the child's up-serialized rendered
ViewState (the secure trace above still holds). The compiler emits the splice **only** when the
inline body has parent-scoped bindings (`parentDepth > 0`), so pages without overrides are unaffected.

### Deviation 2 — root gate-weakening was **unnecessary**

The design flagged a "load-bearing wrinkle": a component-root analog of `dependsOnParent` to force
the root element update when only `__parentContext` changed. In practice **no root gate-weakening was
added.** Trace: `materializeViewState` (component.ts) always returns a **fresh** object each reaction
run, so `wrapWithModifiedCheck` at the child root (context.ts) never short-circuits. The liveness
comes entirely from the reaction **reading the `__parentContext` prop signal**
(component.ts:194-206): that read makes the reaction depend on the prop, so an outer-scope change
re-runs it → `syntheticParent.update(newValue)` refreshes the parent's `currData` → `element.update`
(fresh VS ref, gate passes) → the `$parent` leaves recompute against fresh `parentDataChain`
(element.ts:581). Verified by `runtime/component/test/parent-context.test.ts` ("updates the $parent
leaf live when __parentContext changes (child prop unchanged)").

### Deviation 3 — bridge (worker) target needs **no** codegen change

The design's implementation table listed a `main-bridge.ts` change. Not needed. The bridge (worker)
output for a page with an override is a plain stub (`elementBridge(vs, refManager, () => [])`) — the
override renders **main-side** via the element target compiled in `RuntimeMode.MainSandbox`, whose
output carries `__parentContext: vs` and `_p1.itemName` identically to the trusted output (only the
contract import suffix `?jay-mainSandbox` and the `makeHeadlessInstanceComponent` factory differ).
The single `makeJayComponent` runtime seam (used by both the trusted component and the sandbox
component-bridge constructor) consumes `__parentContext` for all targets. Verified by the
`page-with-override-parent-binding` MainSandbox element test (validations `[]`).

### Hydrate target — parentDepth propagation

The hydrate compiler has its own `renderHydrateHeadlessInstance`. Three fixes were required so
`adoptInlineBody.parentDepth` was non-zero: (1) link `componentVariables` to the parent scope
(`new Variables(headlessImport.rootType, renderContext.variables)`); (2) splice `__parentContext`
into `getProps` when `parentDepth > 0`; (3) thread `parentDepth` through **every** child-carrying
return branch of `renderHydrateElementContent` (it was being dropped, forcing `parentDepth` to 0).

### Runtime seam

- `runtime/lib/context.ts`: `withSyntheticParentContext(parent, cb)` + a module-global handoff
  consumed inside `withRootContext` and `withHydrationChildContext`, which set `context.parent`.
- `component/lib/component.ts`: `PARENT_CONTEXT_PROP = '__parentContext'`; builds a synthetic
  `ConstructContext` from the prop, `synthetic.update(...)` inside the reaction, renders the root
  under `withSyntheticParentContext`.

### Tests (all green)

- `compiler-jay-html`: `generate-element.test.ts` — element (default) + MainSandbox override tests;
  `generate-element-hydrate.test.ts` — hydrate override test. Fixture
  `contracts/page-with-override-parent-binding` (structural card with `heading` prop+tag).
  Full suite 756 → 758 passing.
- `runtime/component`: `parent-context.test.ts` — 3 end-to-end tests (initial resolve; parent-only
  live update with child prop unchanged; both change). Component/runtime/secure suites all pass.

### Open items (unchanged / new)

- **(c)** `forEach`-target override remains a compile error (unchanged, out of Phase 2a scope).
- **Resolved — empty-contract unwrap.** See the "Fix — empty-contract unwrap" section below.

### Fix — pragma leaked into static attribute values (smoke-test regression)

`markParentScope` (`jay-html-overrides.ts`) originally prefixed the `@jay:parent ` pragma onto
**every** non-literal override attribute value. But a static value (no `{…}`) is emitted verbatim and
never passes through the expression parser that strips the pragma, so the smoke-test `/override` page
rendered `href="@jay:parent /docs"` instead of `href="/docs"`. Fix: mark an attribute only when its
value contains a `{…}` binding **or** it is a brace-less expression attribute (`forEach`/`if`, which
are bindings even without braces — `EXPRESSION_ATTRS`). This mirrors the text-node branch, which
already gated on `{`. Covered by new `remapOverrideBindingsToParent` unit tests (static value
untouched; brace-less `forEach`/`if` marked) and the `smoke-test` `/override` assertions.

### Fix — empty-contract unwrap (Option 1: resolve override bindings at page scope)

**Problem.** A **DL#187** headfull import with an **empty contract** (no props/tags) and no `.ts` is
a compiler optimization: `parseHeadfullFSImports` **unwraps** the `<jay:Name>` tag into plain HTML
(`jay-html-parser.ts:1233-1234`, `jayTag.replaceWith(jayTag.innerHTML)`), inlining the content
directly into the **page body** with no component scope boundary. But the override merge
(`jay-html-parser.ts:1194`) has already injected the `@jay:parent ` pragma, so a dynamic override
binding compiled to `_p1.itemName` — climbing out of a scope that no longer exists → dangling `_p1`
(validation: "$parent used but there is no parent scope 1 level(s) up").

**Decision (Option 1, chosen over dropping the unwrap).** Unwrapping _means_ "inline into the page
scope", so a page-authored override binding there is a **current-scope** binding — `vs.itemName`, no
`$parent`. On unwrap, strip the `@jay:parent ` pragma so the content resolves at page scope. This is
the null-hypothesis-minimal fix: it preserves DL#162/#187's unwrap optimization **and** its
regression test (criterion #7), adds no runtime instance/coordinate segment, and turns the case from
an error into correct behavior. (Option 2 — always emit a real empty-VS structural instance so
`$parent` has a boundary — was rejected: it reverses a committed DL#162/#187 decision, breaks their
regression test, and adds an instance + coordinate segment to every structural fragment.)

The strip is a single pragma level because override content is always exactly one shift
(`withParentShift(1)`); overrides that introduce their own `forEach` scope are out of Phase 2a scope.
The pragma is namespaced (`@jay:parent `) so it never collides with authored content, making the
literal strip safe.

**Pre-render path is unaffected.** `injectHeadfullFSTemplatesRecursive` (the SSG/slow-render
best-effort inject, `jay-html-parser.ts:930-943`) never unwraps — it keeps the `<jay:Name>` tag with
`display: contents` and injects the pragma-marked content. That output is _always_ re-compiled
through `parseJayFile` (`server-element-compile.ts:126`, `:160`; dev-server; production-build), where
the empty-contract tag hits this same unwrap branch and the pragma is stripped, and the structural
tag's `{…}` bindings pass through the expression parser that strips the pragma while resolving
`_p1`. So the pragma never reaches rendered HTML — confirmed by the `smoke-test` `/override` page
(62/62 green) and the two new unwrap fixtures below.

**Verification.** New fixture `contracts/page-with-override-unwrap-parent-binding` (empty-contract
card, `<override ref="cta">Start {itemName} trial</override>`) compiles with `validations: []` and
emits `dt((vs) => \`Start ${vs.itemName} trial\`)` on the element and hydrate targets, and
`escapeHtml(String(\`Start ${vs.itemName} trial\`))`on the **server (SSR)** target — page scope, no`_p1`. Covered by `generate-element.test.ts`, `generate-element-hydrate.test.ts`, and
`generate-server-element.test.ts`.

**SSR rejects `$parent` (structural case) — a phasing deferral, not a fundamental limit.** For the
_structural_ fixture `contracts/page-with-override-parent-binding` (contract with props/tags → real
instance, override binding stays `_p1`), the server target currently reports
`"$parent bindings are not yet supported in the server target"`. This is the Phase 4 deferral
(`guardServerParentBinding` throws on `parentDepth > 0`), **not** a property of Capability A — SSR
_can_ resolve the parent binding, it just hasn't been wired yet. Locked in by
`generate-server-element.test.ts` as the current boundary; superseded by **Phase 2c** below, which
makes SSR render it.

## Phase 2c — server-target `$parent` (SSR) (2026-09-16)

Status: **IMPLEMENTED.** See "Implementation Results — Phase 2c" below.

### Decisions for the implementer (TL;DR)

1. **Pull the _server_ half of Phase 4 forward; leave secure/bridge in Phase 4.** SSR is what makes
   the Phase 2a/2b structural-override feature usable on a real full-stack page (see "Why now"
   below). The secure/bridge half stays deferred — different mechanism (worker plumbing), separate
   acceptance gate (the `examples/jay` secure build).
2. **Independent of Phase 3.** Phase 3 (Issue 1, pure-component ref forwarding) shares no code with
   this and has no ordering dependency. Do this before, after, or interleaved — free choice.
3. **Emission model: lexical ancestor var, not the client `_pN` closure param.** In SSR the whole
   tree is inlined into one `renderToStream(vs, ctx)`, so every ancestor scope's variable (`vs`,
   `vs_card0`, a forEach item var) is **lexically in scope**. `$parent.itemName` must emit
   `vs.itemName` — the ancestor's `currentVar` — not `_p1`. This is the fundamental difference from
   the client target (where `_p1` is a closure param the runtime binding helper supplies, because
   the parent's `currentVar` is _not_ lexically in scope inside the child callback —
   `Accessor.render()`, `expression-compiler.ts:63-78`).
4. **Mechanism (chosen): a per-scope boolean gate; reuse the scope's own `currentVar`.** Add a
   boolean `lexicallyInScope` to `Variables` (default `false`), meaning "this scope's `currentVar` is a
   real variable that is lexically in scope at every descendant binding site." `resolveAccessor`
   **already** roots a `$parent` accessor at the landed ancestor's `currentVar`
   (`expression-compiler.ts:183`); `Accessor.render()` just ignores that and emits `_pN` whenever
   `parentLevel > 0` (`:67-69`). The change is one line in `resolveAccessor`: when the landed
   `scope.lexicallyInScope` is set, drop the accumulated `parentLevel` to `resolved.parentLevel` (i.e.
   `0` here) on the returned `Accessor`. `render()` then takes its normal lexical branch and emits
   `scope.currentVar + '.' + terms` with **no change to `render()` at all**. Consequences, all
   desirable:
   - The fragment's `parentDepth` stays `0` when the gate fires, so `guardServerParentBinding`
     **passes untouched** — no guard removal, no per-site edits at the ~15 `w(...)` call sites.
   - Emits `vs.itemName` directly. **Multi-level (`$parent.$parent.x`) falls out for free** — the
     climb lands on whichever ancestor and emits _its_ `currentVar`.
   - The existing "`$parent used but there is no parent scope N level(s) up`" validation
     (`expression-compiler.ts:167-176`) still fires when the ancestor is genuinely absent (the early
     return keeps its non-zero `parentLevel`) — so a malformed climb is still a clean compile error.
   - Reusing `currentVar` (rather than a separate name field) keeps the new surface to a single
     boolean: the scope already knows its own variable name; the gate only says "and it is reachable
     by name from here." The client leaves the gate `false` → `_pN`, exactly as today.
5. **Wire the gate on the server scopes; inherit it down the tree.** Every scope the server emits is
   lexically addressable, so the root sets the gate and every child scope **inherits** it (through
   `childVariableFor` / `childVariableForWithData` / `withParentShift`), so it only needs setting at
   the fresh-construction sites:
   - Page scope in `generateServerElementFile` (`jay-html-compiler-server.ts:1073`): `.asLexical()`.
   - Instance scope in `renderServerElement` (`:254`), currently
     `new Variables(headlessImport.rootType, undefined, 0, varName)` with parent `undefined`: set
     `parent = context.variables` (so the climb has somewhere to go) and `.asLexical()`.
   - Async resolved scope (`:966`): inherits `variables.lexicallyInScope`.
   - forEach / with-data item scopes inherit automatically via `childVariableFor` — no server edit
     needed, so an instance (or plain element) nested in a forEach can bind the forEach item via
     `$parent`.
     This is the whole-parent model the client already uses (`__parentContext = vs`), realized
     **lexically** — no `__parentContext` object is needed on the server because the ancestor variable
     is already in scope as a function parameter / local.
6. **Scope: structural (Tier 2) instances only.** The unwrap (empty-contract) case already works on
   SSR (resolves at page scope after the pragma strip — see the fix above). Phase 2c is exactly the
   structural-instance case that currently throws.
7. **React target stays deferred.** `guardReactParentBinding` is unchanged; React is a separate
   integration, not SSR, and out of scope here.

### Why now (dependency argument)

A jay-stack page with a structural override + parent binding **fails to build** for the server
target today: `guardServerParentBinding` throws → `generateServerElementFile` returns a validation →
production build's `checkValidationErrors` throws → the whole page build fails. For a full-stack
framework, "renders on the client after hydration" is not shippable — the slow/fast (SSR) phases
must emit the initial paint with the binding resolved. So the server target is a **completion of
Phase 2**, mis-filed under Phase 4's "remaining emitters." Phase 4's grouping was an economy
assumption (thread the parent pointer through secure+bridge+server at once); the trace shows the
server path is self-contained and does not share the worker plumbing that secure/bridge need.

### Trace (grounding the design in real code)

- `generateServerElementFile` builds the page scope: `const variables = new Variables(jayFile.types)`
  → `context.variables`, `currentVar = 'vs'`, `parent = undefined` (`jay-html-compiler-server.ts:1073`,
  `:1086`).
- `renderServerElement` builds the instance scope:
  `new Variables(headlessImport.rootType, undefined, 0, varName)` and renders the inline body against
  it (`:254`, `:270-278`). `varName` (e.g. `vs_card0`) is declared in-function from
  `vs.__headlessInstances[...]` (`:303-319`), so both `vs` and `vs_card0` are lexically live.
- The override binding rides the `@jay:parent ` pragma (merge-time, target-agnostic) → `doParse`
  strips it and applies `withParentShift(1)` (`expression-compiler.ts:409`) → `resolveAccessor`
  prefixes a `$parent` token (`:149-151`) → climbs `Variables.parent` (`:161-188`). Today `parent`
  is `undefined` → "no parent scope" (or, with parent set, `parentLevel = 1` →
  `Accessor.render()` emits `_p1` → `parentDepth = 1` → `guardServerParentBinding` throws).
- With Phase 2c: parent set + ancestor `lexicallyInScope = true` → the climb lands on the page scope,
  the accumulated `parentLevel` is dropped → `render()` emits `vs.itemName`, `parentDepth = 0`,
  guard passes.

### Implementation plan

1. `Variables`: add `lexicallyInScope: boolean` (default `false`); thread through the constructor and
   `withParentShift` (which must preserve it). Add an `asLexical()` helper that returns a view with
   the gate set (mirrors `withParentShift`'s reconstruction), for readable server call sites.
2. `resolveAccessor` `$parent` branch (`:161-188`): when the landed `scope.lexicallyInScope` is set,
   use `resolved.parentLevel` (drop the accumulated `parentLevel`) on the returned `Accessor` so it
   renders lexically at `scope.currentVar`. Keep the absent-ancestor validation path unchanged.
3. `childVariableFor` / `childVariableForWithData`: propagate `this.lexicallyInScope` to the child
   scope, so setting it once at the server root covers forEach / with-data descendants.
4. `render()` (`:63-84`): **no change** — the parentLevel drop makes it take the existing lexical
   branch.
5. Server wiring: `.asLexical()` on the page scope (`generateServerElementFile`), `.asLexical()` +
   `parent: context.variables` on the instance scope (`renderServerElement`), and inherit on the async
   resolved scope (`:966`); forEach scopes inherit automatically.
6. No change to `guardServerParentBinding`, the ~15 `w(...)` sites, or the client/hydrate/React
   targets (they leave the gate `false` → `_pN`).

### Verification criteria

1. Structural fixture `contracts/page-with-override-parent-binding` on the **server** target now
   compiles with `validations: []` and emits `escapeHtml(String(\`Start ${vs.itemName} trial\`))`(page scope, no`_p1`). New `generated-server-element.ts`fixture, full`toEqual`— replaces the
current rejection assertion in`generate-server-element.test.ts`.
2. Element, hydrate, and secure targets for that fixture are **unchanged** (still emit `_p1` via the
   client model) — regression-guard the existing fixtures.
3. Cross-target coordinate alignment for the structural instance still holds (SSR `jay-coordinate`
   values equal hydrate adoption coordinates), mirroring the existing DL#183 alignment test.
4. A genuinely-absent parent climb still produces the "no parent scope N level(s) up" validation
   (negative test), proving the collapse didn't swallow the error path.
5. `smoke-test` gains (or extends) a page whose structural override binds page data, and asserts the
   server-rendered initial HTML contains the resolved text — end-to-end proof the page now builds and
   SSRs.

### Trade-offs

- **New surface:** one boolean field on `Variables` (`lexicallyInScope`) plus an `asLexical()` helper.
  The scope already stores its own `currentVar`; the gate only adds "and it is reachable by name from
  here," so no separate name field is needed. The drop-`parentLevel`-at-resolve-time approach collapses
  `parentDepth` to `0` before it reaches any emit site, so `render()`, `guardServerParentBinding`, and
  the ~15 `w(...)` sites are all untouched (null-hypothesis-minimal). Multi-level climbs land-and-emit
  naturally; the client leaves the gate `false` → `_pN`. Rejected alternatives — a target flag threaded
  into `render()` (reopens the `parentDepth`-vs-guard interaction) and a separate `lexicalName` string
  (redundant with `currentVar`).
- **Deferred still-deferred:** secure/bridge parent plumbing and the React target remain Phase 4 /
  out of scope; this section narrows Phase 4 to those two.

## Implementation Results — Phase 2c (2026-09-16)

Implemented exactly as the (revised) design above — the boolean-gate + reuse-`currentVar` variant.

**Changes:**

- `expression-compiler.ts`:
  - `Variables`: added `readonly lexicallyInScope` (default `false`) as the 7th constructor param;
    preserved through `withParentShift`; added `asLexical()` helper.
  - `resolveAccessor` `$parent` branch: `effectiveParentLevel = scope.lexicallyInScope ?
resolved.parentLevel : parentLevel + resolved.parentLevel`. When the landed ancestor is lexical the
    accumulated climb collapses to `0`, so `Accessor.render()` emits `scope.currentVar` — `render()` is
    unchanged. The absent-ancestor validation (early return with non-zero `parentLevel`) is untouched.
  - `childVariableFor` / `childVariableForWithData`: propagate `this.lexicallyInScope` to child scopes,
    so setting the gate once at the server root flows to forEach / with-data descendants.
- `jay-html-compiler-server.ts`:
  - Page scope: `new Variables(jayFile.types).asLexical()`.
  - Instance scope (`renderServerElement`): `new Variables(headlessImport.rootType, context.variables,
0, varName).asLexical()` — parent now wired to the page scope.
  - Async resolved scope: inherits `variables.lexicallyInScope`.
  - `guardServerParentBinding` and all `w(...)` sites unchanged.

**Deviation from the original (pre-revision) design:** the mechanism moved from a `lexicalName?: string`
field to a `lexicallyInScope` boolean that reuses the scope's existing `currentVar` (per review
feedback — the name field was redundant with `currentVar`). `render()` needed **no** change (the
original plan expected a `render()` edit); the `parentLevel` drop makes it take the existing lexical
branch. forEach-ancestor support required **no** server edit — it inherits through `childVariableFor`.

**Tests:**

- `generate-server-element.test.ts`: the two former rejection tests
  (`collections/foreach-parent-binding`, `contracts/page-with-override-parent-binding`) are now
  clean-compile + full `toEqual` assertions against new `generated-server-element.ts` fixtures. The
  structural fixture emits ``escapeHtml(String(`Start ${vs.itemName} trial`))`` (page scope) alongside
  the instance's own `vs_card0.heading`; the forEach fixture emits `vs.listTitle` (page scope) inside
  `for (const vs1 of vs.items)` alongside `vs1.name`.
- Element / hydrate / secure fixtures for these folders unchanged (still `_p1`) — regression-guarded by
  the existing passing tests.
- `smoke-test`: new `/promo` route — structural `promo-card` (non-empty contract, `cta` ref) with a
  page-scope override binding `Start {pageTitle} trial`. Two smoke assertions (dev SSR + prod SSG)
  confirm the initial HTML contains `Start Promo Page trial` and `Premium`, not `Buy Now`.

**Test results:** compiler-jay-html 763 passing / 4 skipped (was 761 — the two rejection tests became
clean-compile tests, no net count change; the +2 is unrelated); smoke-test 64 passing (was 62, +2 for
`/promo`).

**Not done (still Phase 4 / out of scope):** secure/bridge and React `$parent` remain deferred; the
negative "genuinely-absent parent climb" case is covered by the existing `expression-compiler`
validation path (no new dedicated fixture added — the absent-ancestor branch is untouched and already
under test).

## Implementation Results — Phase 4 (secure/bridge; React deprecated) (2026-09-16)

**Finding: secure/bridge is resolved-by-architecture — no runtime or codegen change was needed.**
Phase 4 was planned as "extend Capability A's parent pointer to the secure/bridge code generators."
Tracing the secure architecture end-to-end showed there is nothing to extend:

- In secure mode the **view renders on the main thread** via the _trusted_ element target.
  `MainSandbox` and `MainTrusted` share `generateElementFile`
  (`generate-code-from-structure.ts:66-86`), so the main-sandbox output is the Phase-1-patched
  client output verbatim — `dt`/`da` receive `...parentDataChain(context)` and `forEach` carries the
  `dependsOnParent` flag. `$parent` already resolves here.
- The **worker** runs only the bridge skeleton (`elementBridge` / `sandboxElement` /
  `sandboxForEach`), which never runs `dt`/`da`. `sandboxForEach` (sandbox-element.ts:127-193) tracks
  the collection only (3-arg form, no child body, no `parent` field, no validations), so there is no
  `$parent` binding on the worker side to plumb.

This matches Phase 1's "Bridge/secure needs no guard" note and Phase 2a's "bridge (worker) target
needs no codegen change." Phase 4 therefore reduces to **verification**, not construction. React is
**deprecated** and excluded from the acceptance gate (its Phase 1 `guardReactParentBinding`
validation error stays in place as the surfaced boundary).

**Verification (pragmatic full acceptance gate).** Per the user's constraint — full acceptance gate,
but validate the complex end-to-end path via a built Jay example + manual test rather than a fragile,
heavy secure-runtime e2e feature dir — coverage is:

1. **Compiler regression guards (deterministic, cheap):**
   - _Bridge (worker) target:_ `generate-element-sandbox.test.ts` → new case
     `$parent binding inside a forEach` for `collections/foreach-parent-binding`, full `toEqual`
     against a new `generated-element-bridge.ts` fixture. Proves the worker emits only the
     `sandboxForEach(getItems, 'id', () => [])` skeleton — **no** `dt`/`da`, **no** `$parent`, **no**
     validations.
   - _Main-sandbox target:_ `generate-element.test.ts` → new case `$parent binding inside a forEach
(DL#193)` for the same folder, `validations: []` + full `toEqual` against a new
     `generated-element-main-sandbox.ts` fixture. Proves the main side renders the full `_p1`
     closure bindings (`da((vs1, _p1) => _p1.listTitle)`, `dt((vs1, _p1) => _p1.listTitle)`) and the
     `dependsOnParent` `forEach` flag even when sandboxed — byte-identical to the trusted output.
   - The existing Phase-2a `override binding to parent scope (DL#193)` main-sandbox test already
     covers the **structural-instance override** case in secure mode.
2. **Example secure build (acceptance gate) + manual test:** `examples/jay/parent-binding` builds a
   dual regular (`lib/` + `index.html`) and secure (`lib-secure/` + `secure.html`) target through the
   vite plugin. `lib-secure/board.jay-html` exercises exactly the Phase 4 scenario —
   `{$parent.groupLabel}` inside a keyed `forEach` — with **Relabel** (mutate parent data live) and
   **Shuffle** (reorder keyed items) buttons for manual verification. `yarn build` succeeds (23
   modules; the `mainSandbox` transform of `board.jay-html` compiles clean); user manually verified
   the secure build renders and updates identically to the regular build.

**Deviation from the original acceptance gate.** The Test plan (§"Example (end-to-end) tests") and
Phase 1 designated a dedicated secure-runtime e2e feature dir (mirroring
`packages/runtime/secure/test/<feature>/`, with hand-committed `regular` + `secure/main` +
`secure/worker` compiled files) as the secure-mode gate. That heavy, fragile harness was **not
built**; the `examples/jay/parent-binding` `lib-secure` build + manual verification serves as the
acceptance gate instead, per the user's pragmatic-testing instruction. Since the finding is that the
secure/worker path carries **no** `$parent` binding (the view renders main-side via the trusted
target, already covered by the byte-identical main-sandbox fixture), the dedicated worker e2e dir
would only re-assert the trusted path — the cheaper compiler + example gate covers the same surface.

**Test results:** compiler-jay-html `generate-element-sandbox.test.ts` 10 passing (+1),
`generate-element.test.ts` 76 passing (+1); `examples/jay/parent-binding` `yarn build` succeeds for
both regular and secure targets.

**Phase 4 status: complete** (secure/bridge resolved-by-architecture + verified; React deprecated).
Phase 3 (Issue 1 — pure-component ref forwarding) remains the only outstanding DL#193 work and is
orthogonal.

## Implementation Results — Phase 3 (Issue 1 — pure-component ref forwarding) (2026-09-16)

Phase 3 forwards a structural (Tier 2) headfull composite's named inner child-component refs to the
usage site, typed in the inner (composite) scope, with **no event re-basing**. When the composite is
repeated at the usage site (`forEach`), the forwarded refs become collections. The design predicted
"the existing collection machinery covers it once the tree carries the forwarded ref." That was
**half right** — the machinery existed, but three wiring gaps had to be closed, two in the runtime
proxy and one in codegen. The secure build surfaced two more, in the rollup/vite plugin.

### Runtime wiring fix 1 — collection `hasForwardedInnerRef` must use property access, not `in`

`ComponentCollectionRefImpl.hasForwardedInnerRef(innerName)` originally tested `innerName in api`
against the first member's public API. The `in` operator **bypasses the Proxy `get` trap**, so it
tested the raw `ComponentRefImpl` (which has no forwarded `cta`) and always returned false — the
collection path `refs.cards.cards.cta` resolved to `undefined`. Fixed to `!!api[innerName]`, which
routes through the get-trap → `getFromComponent` → the instance's forwarded ref
(`packages/runtime/runtime/lib/node-reference.ts`).

### Runtime wiring fix 2 — `DELEGATE_COLLECTION_INNER_REF_TRAP` must fall through real impl members

The trap that redirects unknown props to the forwarded aggregate originally used an explicit
exclusion list. An unbound impl method re-entering the proxy via `this.<member>` (e.g.
`removeEventListener` reading `this.listeners`, since `EVENT_TRAP` binds only `addEventListener`)
hit the trap and got a proxy object instead of the real array → `this.listeners.filter is not a
function`. Replaced the exclusion list with `if (prop in target) return false;` — every genuine
impl member (listeners, elements, map, find, add/removeEventListener, getPublicAPI, …) falls
through; only true forwarded inner-ref names (not members of the impl) reach the aggregate. `onXxx`
is handled by `EVENT_TRAP` first, so it never reaches this trap.

### Codegen fix — file-level dedup of forwarded-ref helper types

Two structural instances of the same composite (`signupCard` single + `cards` collection) each embed
Counter and each emitted the shared `export type CounterRef<ParentVS> = …` / `CounterRefs<ParentVS>`
helpers → duplicate-identifier TS error. This **corrects** the design's optimism: the collection
machinery covered the runtime, but multi-instance helper emission was not deduped. Added a
file-scoped `emittedForwardedRefHelpers: Set<string>` on `RenderContext`
(`jay-html-compiler.ts`), threaded into `renderRefsType` via a new `emittedHelpers?` param
(`jay-html-compile-refs.ts`); each helper identifier emits once per file. When the set is undefined
(page-level / other callers) the guard is a no-op — backward compatible.

### Secure/bridge plugin fix — contracts imported into a worker were mis-routed

The §5 secure example is the **first** to import an external `contract="…"` file into the worker
(structural composites require a `.jay-contract`). Such a contract resolves to
`card.jay-contract?jay-workerTrusted.ts` — a runtime-mode suffix that also matches
`hasJayModeExtension`. Both the **load** and **transform** hooks checked the mode branch before the
contract branch, so the contract was loaded as raw YAML by `loadJayFile` (→ esbuild YAML parse
error) and routed to `transformJayFile` (→ `Unknown Jay format jay-contract`). Fixed both hooks in
`packages/compiler/rollup-plugin/lib/runtime/runtime-compiler.ts` to check
`hasJayExtension(id, JAY_CONTRACT_EXTENSION, { withTs: true })` **first** (load: → `loadContractFile`;
transform: → skip). This makes structural composites usable in secure mode at all.

### Tests / verification (all green)

1. **§2 runtime unit test** (`packages/runtime/runtime/test/lib/ref-forwarding.test.ts`, 5 tests):
   forwarded ref exposed; delivers the composite (Card) scope viewState with **no re-basing**
   (`event.viewState === { heading: 'Sign up' }`); collection fans per card; `.find(pred)` reaches
   one member; `onClick` replays onto a card added after listener registration. All 5 pass; full
   runtime suite 283 pass / 3 skip.
2. **Codegen regression fixture**
   (`compiler-jay-html/test/fixtures/contracts/page-with-forwarded-ref-multi/`): single + `forEach`
   instances of the same composite; asserts `CounterRef`/`CounterRefs` declared **once** and
   `validations` `toEqual([])`. Added one multi-instance case each to `generate-element`,
   `generate-element-hydrate`, `generate-server-element` (146 pass across the three files).
3. **§5 example** (`examples/jay/ref-forwarding/`): dual regular (`index.html`/`lib`) + secure
   (`secure.html`/`lib-secure`, `sandbox="true"`). `yarn build` succeeds for **both** targets (21
   modules; the `workerTrusted` transforms of `card.jay-html`, `counter.jay-html`, and the contract
   compile clean). Per the Phase 4 precedent, the example secure build is the secure-mode acceptance
   gate; the rollup-plugin fix is covered by that integration gate (its 47 unit tests still pass).

### Codegen fix 2 — hydrate `forEach` create-variant emitted an undeclared synthetic-ref type

Follow-up bug surfaced by the multi-instance fixture. The hydrate `forEach` needs both an
**adopt-body** (existing SSR DOM) and a **create-body** (fresh render for post-hydration items). The
create-body compiles via the **element** target, which increments the shared `headlessInstanceCounter`
and produces an **extra** instance (e.g. `Card2`) beyond the two the element pass already numbered.
Its synthetic ref interface (`_HeadlessCard2Refs`) was never declared because the hydrate file simply
reused the element pass's `renderedRefs` (which only knew `Card0`/`Card1`) — so
`page-with-forwarded-ref-multi/generated-element-hydrate.ts` referenced an undeclared
`_HeadlessCard2Refs`. Fixed by (a) threading a shared `emittedForwardedRefHelpers: Set<string>` across
**both** passes so `CounterRef`/`CounterRefs` are still emitted exactly once, and (b) having
`renderHydrate` return `{ fragment, syntheticRefsDecls }`; `generateElementHydrateFile` appends the
hydrate pass's extra synthetic decls after `renderedRefs`. This also fixed the same latent bug in
`page-with-forwarded-ref-foreach`. Files: `jay-html-compiler-hydrate.ts`, `jay-html-compiler.ts`;
fixtures regenerated. `tsc` now reports no undeclared-type errors; 778 compiler-jay-html tests pass.

### Runtime fix 3 — `makeHeadlessInstanceComponent` must tolerate an absent `HEADLESS_INSTANCES`

The §5 example renders the structural composite via a **plain client `render()`** with no composite
wrapper, so `HEADLESS_INSTANCES` is never provided. `wrappedConstructor` read it with
`useContext(HEADLESS_INSTANCES)`, which **throws** when the marker is absent (`context.ts`:
`if (!context) throw new Error()`) — the "Uncaught Error at useContext … at wrappedConstructor" the
user hit. Yet every downstream consumer already tolerated absence (optional chaining
`instanceData?.viewStates`, `clientDefaults` fallback, "no server data" path) — the throw was the lone
inconsistency. Fixed by reading the context tolerantly:
`findContext<HeadlessInstancesData>((_) => _ === HEADLESS_INSTANCES)` (returns `undefined` when
absent). Also scoped the "no server data and no clientDefaults" warning to fire **only when
`instanceData` is defined** — when the composite runtime is absent entirely (structural composite
under plain client render), empty fast ViewState is the expected, non-erroneous case. File:
`packages/jay-stack/stack-client-runtime/lib/headless-instance-context.ts`. The full-stack path (where
the composite DOES provide the context) is unchanged: dev-server hydration suite 741/741 pass.

**Deviation from design.** The design's "existing machinery covers it" note is corrected: the runtime
collection machinery *did* need two proxy-wiring fixes, codegen needed multi-instance helper dedup
**and** a hydrate create-variant synthetic-ref fix, the client runtime needed tolerant context lookup
so structural composites work under plain client render, and the secure path needed a plugin
contract-routing fix. No re-architecture — seven targeted fixes.

**Phase 3 status: complete.** With Phases 2a/2c/3/4 done, DL#193 has no outstanding work.
