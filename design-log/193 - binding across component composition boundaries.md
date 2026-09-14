# DL#193 — Binding across component composition boundaries

Status: **DESIGN — for review, not yet implemented.**

## Background

Three separate feature requests keep bumping into the same wall: **an expression or a ref
declared in one component scope cannot reach an element/component that lives in another
scope.** Jay's compiler is deliberately scope-isolated — every binding resolves against the
*current* scope's ViewState type, and every ref is derived from the *current* component's
contract. That isolation is the right default (DL#84), but it blocks three composition
patterns:

1. **Pure (Tier 2) components — forwarding inner child refs.** A `Button` component has an
   `onClick`. We wrap it inside a pure composite/section component. At the composite's usage
   site, how do we reach the inner button to attach `onClick`? The collection variant is the
   composite itself being repeated at the usage site (`<jay:Card forEach=…>`) → collection refs.
   (A `forEach` *inside* the composite is not possible — a pure component takes no array prop to
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
keeps the *inner* component's scope viewState; we deliberately do NOT re-base it to the usage-site
scope (see §B).

**Event handlers do NOT need parent viewState threaded in (decided).** An earlier draft proposed
adding `parentViewState` to `JayEvent`. That is unnecessary: the handler is written in the
component `.ts` that **already owns the full top-level ViewState** (the same component declares
both the `forEach` list and the parent fields), and every ref delivers a `coordinate` (the
trackBy id chain) identifying which item fired. So `refs.removeBtn.onclick(({ viewState,
coordinate }) => remove(viewState.id))` can read any parent field directly from the component's
own state — no `formatEvent`/`JayEvent` change. Parent-data reachability (Capability A) is
therefore needed **only for reactive text/attribute bindings** (`{$parent.field}` rendered in the
DOM), which have no component code to reach up. Overrides *might* be the one exception (handler in
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
  `{$parent.field}` in a child scope must read *live* parent data. This is NOT free on any target:
  `dt`/`da` closures only ever see the current scope's viewState, and keyed list reuse makes any
  lexically-captured or snapshot parent stale (Examples §A). The carrier is the existing
  **`ConstructContext` made live** — add a `parent` pointer + in-place `update` so leaf helpers
  (which already retain their context) read `context.parent.currData` (Q7; resolves the standing
  TODO at element.ts:413). The sandbox/bridge target re-attaches parent on the receiving side.
  **Event handlers are out of scope for (A)** — the owning component already holds parent data +
  `coordinate` (see architecture note), so no `JayEvent` change.
- **(B) Forwarded refs.** Issues 1 & 2 are a different mechanism: the inner/override RefsTree
  must be *surfaced* to the outer scope and the passthrough/override component must *forward* the
  child refs through its public API (the existing `DELEGATE_REFS_TO_COMP_TRAP` already forwards
  member access at runtime). **Forwarding is pure passthrough — no event re-basing:** a surfaced
  ref keeps the scope it was compiled in (inner `CardViewState` for §B; the specialization's
  `Panel$1ViewState` for overrides, §C), so there is nothing to map across the boundary and no
  `formatEvent` change (§B, §C).

The three features draw on these in different combinations:

| Feature | Parent-data (A) | Forwarded refs (B) |
| --- | --- | --- |
| 1. Pure-component inner refs | no | **yes** |
| 2. Overrides — bind outer data | only inside inner `forEach` | via inheritance (§C) |
| 2. Overrides — reach injected refs | — | **yes** |
| 3. forEach parent binding | **yes** | no |

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
updates are driven by the item viewState *passed as the closure argument*, not by any parent:

```ts
forEach(
    (vs: PageViewState) => vs.items,
    (vs1: Item) => {
        return e('div', {}, [
            e('span', {}, [dt((vs1) => vs1.name)]),
            e('button', {}, [`Remove from `, /* {$parent.listTitle} goes here */], refRemoveBtn()),
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
changes, so a *lexically captured* parent var would be **stale**. Several carriers were weighed
(Q7) and rejected: variadic `update(vs, parentVs, …)` (too invasive) and `vs[SymbolParent]`
(mutates user-provided array members → spread/freeze/shared-ref footguns).

**Chosen carrier — reuse `ConstructContext` (Q7): add a `parent` pointer + in-place `update`.**
Today `ConstructContext` supplies only *initial* data at element construction and is never
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
    signupCard: CardRefs;                 // the composite instance
}
export interface CardRefs {
    cta: ButtonRef<CardViewState>;        // forwarded AS-IS, keeps Card's scope — no re-basing
}

// page.ts usage:
refs.signupCard.cta.onClick(() => navigate('/signup'));
```

**No event re-basing (decided — the simpler model).** The forwarded `cta` ref lives inside `Card`
and its `RefImpl.viewState` is already `Card`'s scope. We surface it **as-is**, typed
`ButtonRef<CardViewState>` — we do *not* re-base its event to `PageViewState`. Two reasons:
- **It's less code.** `RefImpl` already carries its own scope viewState and `formatEvent` already
  delivers it; forwarding is then pure passthrough (the existing `DELEGATE_REFS_TO_COMP_TRAP`),
  with nothing to map across the boundary.
- **`CardViewState` is the *correct* data, not a lossy substitute.** Everything the button was
  rendered against is, by construction, part of `CardViewState` (a pure component's only data is
  its own ViewState = its contract tags, DL#187). So `cta.onClick(({ viewState }) => …)` receives
  exactly the data the button displayed. Re-basing to `PageViewState` would hand the handler data
  the button was *never* bound against — more work for a worse result.

**No `forEach` *inside* a pure composite.** A pure (Tier 2) component gets data only through
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
    cards: CardRefs;                      // collection of Card instances (nested under the forEach)
}
export interface CardRefs {
    cta: ButtonRefs<CardViewState>;       // one cta per card — still Card's own scope, no re-basing
}

// page.ts usage — same API as a locally-declared collection ref:
refs.cards.cta.onClick((e) => navigate(e.viewState.ctaLabel));   // event across all cards
refs.cards.cta.find((r, vs) => vs.ctaLabel === 'Sign up');       // reach one card
```

The single-vs-collection distinction is decided by the **usage-site** `forEach`, not by anything
inside the pure component — so the existing collection machinery covers it once the forwarded ref
is in the tree.

### C. Override-introduced refs & data — issue 2

**Container** `panel.jay-html` exposes an overridable area; **override** at the usage site
injects a button and binds **outer** data into it:

```html
<!-- usage: page.jay-html -->
<jay:Panel>
  <jay:override name="body">
    <button ref="save">Save {documentName}</button>   <!-- documentName is OUTER (page) data -->
  </jay:override>
</jay:Panel>
```

**What must be generated — an override *specialization* by inheritance (recommended, Q3-option-c).**
The override turns `Panel` into a per-usage-site specialization `Panel$1` whose ViewState and Refs
**inherit** the base component's and **add** the override's members:

```ts
// generated for the Panel$1 specialization (one per override site):
interface Panel$1ViewState extends PanelViewState {
    documentName: string;                 // hoisted from the override's outer-data references
}
interface Panel$1Refs extends PanelRefs {
    save: HTMLElementProxy<Panel$1ViewState, HTMLButtonElement>;   // override ref, Panel$1 scope
}

// page.ts usage — the specialization instance's forwarded ref surfaces at the page:
refs.panel.save.onclick(({ viewState }) => store.save(viewState.documentName));
```

Three properties, all consistent with §B:
- **Events carry `Panel$1ViewState` (no re-basing).** `Panel$1ViewState extends PanelViewState`,
  so the event is a `PanelViewState` plus the override's added members — the same *keep the inner
  scope* rule as forwarded pure-component refs. (Correction to the first sketch: the ref is typed
  `HTMLElementProxy<Panel$1ViewState, …>`, **not** `<PageViewState, …>` — events carry the
  specialized Panel's view state, per the "no re-basing" rule.)
- **Bindings pass through, like a pure component.** `{documentName}` resolves against
  `Panel$1ViewState.documentName`, exactly as a pure component's template reads its own ViewState.
- **Outer data flows down the normal channel.** The override's free outer references (here
  `documentName`) are *hoisted* into `Panel$1ViewState` as added members, typed by resolving them
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
free-variable capture. The override fragment is *authored in `page.jay-html`*, so its bindings
belong to the **outer (page) scope** — exactly like every other binding in that file. So:
- `{documentName}` resolves against the page scope **because that is where it is written** — no
  `$parent`, no declaration on `<jay:Panel>`.
- The compiler scans the override fragment for the outer identifiers it references (a free-variable
  scan) and *that set is* the added members of `Panel$1ViewState`. The author never lists them —
  it is **capture, not declaration**. Mental model: the override is a *closure over the outer
  scope*, and `Panel$1ViewState` is its automatically-computed capture record.
- `$parent` stays **compiler-internal**. The author never types it in an override; the compiler
  only emits a parent-access when it splices the override inside `Panel`'s own `forEach` to reach
  the hoisted top-level member from the item scope (the sub-case below). This is why option-b's
  author-facing `$parent.` (noisy) is rejected for overrides — the same primitive is used, but
  under the hood.

This keeps DL#84 intact: DL#84 bans a component's *own* template from reaching up into its parent.
The override fragment is **not** Panel's own template — it is page-authored content injected into
Panel, so resolving its bindings against the page scope is lexically correct, not an isolation
breach. (Edge case to validate: an outer reference whose name collides with an existing
`PanelViewState` member of a *different* type makes `Panel$1ViewState extends PanelViewState`
ill-typed — report it. Reaching Panel's *own* internal data from an override is a separate
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
*ref surface* — crossing that line (without adding code to it). Do we:
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
override's added data members and refs are *added* to the base via inheritance; the override's
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
compiler's free-variable scan of the fragment *is* the capture list that becomes
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
   This one is *correct* for us: given the chance to run, it recomputes and, reading the now-live
   `context.parent.currData`, produces the new content.

The problem: when the **parent** changes but the item array/item references do **not** (the common
keyed-reuse case), gates 1 and 2 both short-circuit *before* gate 3 ever runs — so calling
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
the earlier "O(scopes) writes per cascade" claim: parent-*context* updates stay O(scopes), but a
parent change forces O(items) leaf **recomputation** for each parent-dependent scope — inherent
and unavoidable, since each item's `$parent` binding genuinely may now differ.

**Precedent in the reactive core — `createDerivedArray` (checked per review request).** The same
"re-map an item even though its own reference is unchanged" problem is already solved one layer
down, in `packages/runtime/component/lib/hooks.ts`. `createDerivedArray` maps an array through a
per-item cache (`WeakMap<T, MappedItemTracking>`) and decides re-mapping with an explicit predicate
(`mapItem`, hooks.ts:98-127):
```ts
const needToMap =
    force ||                                             // <- MeasureOfChange.FULL propagated in
    !cached ||
    item !== cached.item ||                              // item reference changed (our gate 2)
    (index !== cached.index && cached.usedIndex) ||      // index changed AND the mapper read index
    (length !== cached.length && cached.usedLength);      // length changed AND the mapper read length
```
Two ideas transfer directly and *validate* the Q4a design rather than replacing it:

1. **`force` = our `dependsOnParent` + `parentModified`.** `force` comes from
   `MeasureOfChange.FULL` (`reactive.ts:1-6`: `NO_CHANGE | PARTIAL | FULL`) propagating down a
   signal cascade. It is exactly the "an outer thing changed, so re-evaluate this item even though
   its own reference didn't" escape hatch we need — the reactive layer already treats "recompute
   despite unchanged item reference" as a first-class, cascade-propagated condition. Our
   `dependsOnParent` gate branch is the DOM-runtime analogue of `force`; this is the established
   idiom, not a new hack.

2. **`usedIndex`/`usedLength` dependency tracking is a sharper gate than a static flag.** Note
   `mapItem` does **not** blindly re-map on any index/length change — it re-maps only when the
   value changed *and the mapper actually read it* (`trackableGetter`, hooks.ts:87-96, records
   `wasUsed`). The parallel for us: re-run an item's leaves only when the parent changed *and* that
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
> _Answer:_

**Q5. Priority / sequencing.** Issue 1 (pure refs) and issue 2 (overrides) are the
user-driving features; issue 3 (forEach parent) is explicitly low priority but is the
*simplest* and shares runtime-A with issue 2a. Suggested order: **3 → 2 → 1** (build the
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
  keyed by object identity, so the *same* object reference used as an item in two scopes gets
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
  My earlier rejection of (c) was wrong: it conflated "context isn't updated *today*" with
  "context *can't* be updated." The context does not need to be *reconstructed* on the cascade
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
**construction-time-only** object: it supplies *initial* data when new elements are created
(`currData` read by `dt`/`da`/refs at construction) and is never consulted again. Adding
`update` makes it a **persistent, live per-scope state carrier** used at both construction and
update. That is a deliberate, reasonable promotion (it becomes "more complete" — the natural home
for scope state), but worth stating explicitly since it changes the object's lifecycle contract
and means its `data` is now mutable state, not an immutable snapshot.
> _Answer: ok — reuse `ConstructContext` (parent pointer + in-place `update`). **Ship with the Q4a
> gate-weakening** so the live parent context actually reaches the leaves._

**Q8. How does pass-through data reach a component *with code* (Tier 3)?** For Tier 2 (pure),
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
the override's refs *added* (typed against `Panel$1ViewState`, not the outer VS — §C). The added
refs graft into the specialization's RefsTree and forward up exactly like §B pure-component refs
(same `DELEGATE_REFS_TO_COMP_TRAP` passthrough, no re-basing). Files: `jay-html-overrides.ts`,
`jay-html-parser.ts` injection sites, `jay-html-compile-refs.ts` (`graftTemplateOnlyRefs`),
`contract-to-view-state-and-refs.ts`, `jay-html-compiler-shared.ts`.

**Runtime (B):** `references-manager.ts` (`mkRefs`/`mkManagedRef`) and `node-reference.ts`
(`ComponentRefsImpl`, `DELEGATE_REFS_TO_COMP_TRAP`) already forward member access to a mounted
instance's public API. The new requirement is that the passthrough/override component's public
API *carries* the child refs — mostly a compiler-emission change, minimal runtime change.
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
- **Phase 3 — Issue 1 (pure-component ref forwarding):** parser discovers inner refs;
  passthrough forwards them; type-gen composes forwarded (single + collection) sub-trees.
- **Phase 4 (Q4):** extend Capability A's parent pointer to secure/bridge/server code
  generators (the runtime `ConstructContext` field lands in Phase 1; this threads it through
  the remaining emitters).

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

  | # | parent data | items array ref | item member | expected |
  | --- | --- | --- | --- | --- |
  | 1 | changed | unchanged (keyed reuse) | unchanged | `$parent` leaf **updates** — the regression case |
  | 2 | changed | changed | — | `$parent` + item leaves both correct |
  | 3 | unchanged | unchanged | changed (one item) | item leaf updates; `$parent` leaf no DOM write |
  | 4 | unchanged | unchanged | unchanged | **no** DOM writes at all |
  | 5 | unchanged | reordered (same refs) | unchanged | keyed reuse intact, `$parent` unchanged |

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
- **Ref forwarding crosses DL#187's "Tier 2 has no refs" line.** It adds *no code* to the
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
