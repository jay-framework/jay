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
   site, how do we reach the inner button to attach `onClick`? Complicated by the button
   possibly sitting under a `forEach` inside the composite (→ collection refs).

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
the parent scope. This is the natural place to also carry **parent** viewState (issue 3 in
event handlers) and it is what forwarding must re-base correctly (issue 1).

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

- **(A) Parent-data reachability.** A binding in a child scope must read *live* parent data.
  This is NOT free on any target: `dt`/`da` closures and refs only ever see the current scope's
  viewState, and keyed list reuse makes any lexically-captured or snapshot parent stale
  (Examples §A). The carrier is the existing **`ConstructContext` made live** — add a `parent`
  pointer + in-place `update` so leaf helpers (which already retain their context) read
  `context.parent.currData` (Q7; resolves the standing TODO at element.ts:413). The sandbox/bridge
  target re-attaches parent on the receiving side.
- **(B) Forwarded refs.** Issues 1 & 2 are a different mechanism: the inner/override RefsTree
  must be *surfaced* to the outer scope and the passthrough/override component must *forward* the
  child refs through its public API (the existing `DELEGATE_REFS_TO_COMP_TRAP` already forwards
  member access at runtime).

The three features draw on these in different combinations:

| Feature | Parent-data (A) | Forwarded refs (B) |
| --- | --- | --- |
| 1. Pure-component inner refs | no | **yes** |
| 2. Overrides — bind outer data | **yes** (or splice-at-outer-scope) | — |
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

**Event handlers** get it off the same context — the ref reads `context.parent?.currData` and
`formatEvent` surfaces it as `parentViewState`:

```ts
// today the handler event carries the ref's own scope viewState:
refs.removeBtn.onclick(({ event, viewState /* item */ }) => remove(viewState.id));
// context.parent.currData surfaced as parentViewState:
refs.removeBtn.onclick(({ event, viewState, parentViewState }) => remove(viewState.id, parentViewState.listTitle));
```

So issue 3 is a **compiler + runtime** change, but a **single, unified** one: text/attr and
event-handler parent access share one carrier, no two-channel split (Q6), and no user data is
mutated. Runtime change: `ConstructContext` gains `parent` + `update`; the scope-switch updates
(`mkUpdateCollection`, `mkUpdateWithData`, `forAsync`/`resolved`) call `parentContext.update`.
Cost is **O(scopes)** writes per cascade, not O(items). Secure/bridge re-attaches parent on the
receiving side. This also settles Q3-option-a: reactive outer bindings inside an inner `forEach`
reuse this same carrier.

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
    cta: ButtonRef<PageViewState>;        // forwarded from inside Card, re-based to page VS
}

// page.ts usage:
refs.signupCard.cta.onClick(() => navigate('/signup'));
```

**Runtime nuance — event viewState re-basing.** The forwarded `cta` ref lives inside `Card` and
its `RefImpl.viewState` is `Card`'s scope. But the type `ButtonRef<PageViewState>` promises the
usage site's viewState in the event. Forwarding must therefore re-base what `formatEvent`
delivers so `cta.onClick(({ viewState }) => …)` gets the **page** viewState, not `Card`'s inner
one — either by constructing the forwarded ref against the usage-site scope, or by mapping the
event as it crosses the boundary. This is exactly the live-viewState channel from the
architecture note, seen from the other side.

**Under a `forEach` inside the composite** (the case the user flagged) — the forwarded ref
becomes a collection, matching the existing single-vs-collection machinery:

```html
<!-- card.jay-html -->
<div forEach="rows" trackBy="id">
  <jay:Button ref="rowCta">{label}</jay:Button>
</div>
```

```ts
export interface CardRefs {
    // repeated=true → collection type, nested under the forEach scope:
    rowCta: ButtonRefs<RowViewState>;     // ComponentCollectionProxy & OnlyEventEmitters
}

// page.ts usage — same API as a locally-declared collection ref:
refs.signupCard.rowCta.onClick((e) => remove(e.viewState.id));   // event across all rows
refs.signupCard.rowCta.find((r, vs) => vs.id === '3');           // reach one row
```

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

**What must be generated for the page** (override compiled against the **outer** ViewState/Refs,
per Q3-option-a):

```ts
export interface PageElementRefs {
    save: HTMLElementProxy<PageViewState, HTMLButtonElement>;   // override ref grafted to outer tree
}
export interface PageViewState { documentName: string; /* ... */ }

// page.ts usage:
refs.save.onclick(() => store.save());
```

Today none of this is generated: override provenance is dropped from the AST, so the compiler
can neither graft `save` into `PageElementRefs` nor resolve `{documentName}` against the page
scope (it currently resolves against the **inner** Panel scope and would error/miscompile).

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
visible."
> _Answer:_

**Q3. Overrides — bind-at-outer vs parent-pointer (issue 2-data).** Two designs:
(a) **Splice-at-outer-scope:** persist override provenance on the AST node and compile the
override fragment against the **outer** ViewState/Refs (the scope where `<jay:Container>` is
written). Natural — the override author is writing in the outer file. Static outer bindings
need no runtime change; but reactive outer bindings that land inside an inner `forEach` hit the
same staleness wall as issue 3 (Examples §A), so this shares Capability A's runtime work there.
(b) **Parent-pointer:** keep compiling override against inner scope, add `$parent` to reach
outer data (reuses Capability A directly).
**Recommendation: (a)** — it matches author intuition (the author writes the override in the
outer file, so bindings resolving to outer scope is least surprising). Where an override lands
inside the inner component's `forEach`, its reactive outer bindings reuse Capability A's live
`ConstructContext` carrier (no separate mechanism). Flag: interaction with inner `forEach` mount
points still needs design in Phase 2.
> _Answer:_

**Q4. Reactive parent bindings need runtime work on _all_ targets (revised).** The
"free on client" assumption was wrong (Examples §A): `dynamicText.update` gets only the item, so
parent data must be carried down by making `ConstructContext` live (Q7). Client/hydrate share
that carrier; the sandbox/bridge target needs its own re-attach on the receiving side. Do we
phase secure/bridge behind client, or land both together?
**Recommendation: make `ConstructContext` live once, enable client + hydrate first, follow with
secure/bridge** (which needs the extra receiving-side re-attach).
> _Answer:_

**Q5. Priority / sequencing.** Issue 1 (pure refs) and issue 2 (overrides) are the
user-driving features; issue 3 (forEach parent) is explicitly low priority but is the
*simplest* and shares runtime-A with issue 2a. Suggested order: **3 → 2 → 1** (build the
cheap parent-data primitive first, then overrides on top, then the refs-forwarding work).
> _Answer:_

**Q6. Do we ship both binding kinds together?** With the live-`ConstructContext` carrier chosen
(Q7), event-handler and text/attribute parent access share **one** mechanism (`context.parent`,
updated each cascade), so the earlier "two channels, two costs" split no longer forces a phasing decision —
both fall out of the same runtime change. Remaining choice is only about **scope of the first
cut**: enable both immediately, or land the carrier + event-handler path first (covers "click
in a row, act on the list") and add the text/attr compile path in the same phase once fixtures
exist. **Recommendation: one runtime carrier, enable both; sequence text/attr fixtures right
after the event-handler ones.**
> _Answer:_

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

**Recommendation — (c-live): reuse `ConstructContext` (parent pointer + in-place `update`), one
carrier for BOTH locations.** It rides the existing top-down cascade without touching user data
and without a parallel structure:
- **text/attr:** the helper passes parent data into the closure; binding compiles to
  `dt((vs, p) => p.listTitle)` where `p = context.parent?.currData`.
- **event handlers:** the ref reads `context.parent?.currData`; `formatEvent` surfaces it as
  `parentViewState`.

`WeakMap` (b') / holder (b'') remain as fallbacks if we'd rather not make `ConstructContext.data`
mutable. Reject **(a)** (variadic/invasive), **(b)** (mutates user data), and **(c-snapshot)**
(stale). Injection sites for the in-place `parentContext.update(newData)`: `mkUpdateCollection`
(element.ts, the existing TODO at line 413), `mkUpdateWithData`, and `forAsync`/`resolved`.
Secure/bridge re-attaches parent on the receiving side regardless of carrier.

**Note — this expands `ConstructContext`'s role.** Today `ConstructContext` is a
**construction-time-only** object: it supplies *initial* data when new elements are created
(`currData` read by `dt`/`da`/refs at construction) and is never consulted again. Adding
`update` makes it a **persistent, live per-scope state carrier** used at both construction and
update. That is a deliberate, reasonable promotion (it becomes "more complete" — the natural home
for scope state), but worth stating explicitly since it changes the object's lifecycle contract
and means its `data` is now mutable state, not an immutable snapshot.
> _Answer:_

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
- **Leaf helpers** already retain their context (`dynamicText` line 540). `dynamicText` /
  `dynamicAttribute` pass parent data (`context.parent?.currData`, chained for deeper levels)
  into the binding closure as extra params → `dt((vs, p) => p.foo)`.
- **event handlers:** `RefImpl` reads `context.parent?.currData`; `formatEvent` adds
  `parentViewState` (`{ event, viewState, parentViewState, coordinate }`). Type side re-bases via
  `MapEventEmitterViewState`.
- **secure/bridge:** context is runtime structure (not serialized), so the main side works
  uniformly; the bridge target re-attaches parent on the receiving side.

**Files:** `expression-parser.pegjs` (+ `.cjs` rebuild + prettier), `expression-compiler.ts`
(`resolveAccessor`, `Accessor`), `context.ts` (`parent` + `update`), `element.ts`
(`mkUpdateCollection`/`mkUpdateWithData`/async — set parent context live; `dynamicText`/
`dynamicAttribute` — pass parent to closures; `RefImpl`/`formatEvent`), and the jay/hydrate
codegen. Deferred to Phase 4: `jay-html-compiler-bridge.ts`, `jay-html-compiler-server.ts`.

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
3. **Type-gen** (`jay-html-compiler.ts` `renderHeadlessInstance` ref-type selection;
   `jay-html-compile-refs.ts` `renderRefsType`/`renderReferenceManager`): compose the forwarded
   sub-tree into the usage site's Refs type. `optimizeRefs`/`graftTemplateOnlyRefs` already
   know how to graft imported sub-trees — the forwarded refs must actually populate the tree.
4. **forEach-inside-composite:** a forwarded ref that sits under a `forEach` in the composite
   is `repeated=true` → surfaces as `XxxRefs<ItemVS>` (collection) nested under the forEach
   child manager, exactly like a locally-declared collection ref. This is the "collection
   refs" case the user anticipated; the existing single-vs-collection machinery covers it once
   the tree carries the forwarded ref.

**Issue 2 — override-introduced refs.** Requires persisting override provenance on the AST
node (re-introduce `overrides: OverrideDeclaration[]` on the `<jay:Name>` node) so the injected
elements/components can (a) be compiled with a ref surface and (b) be grafted into the outer
RefsTree. Files: `jay-html-overrides.ts`, `jay-html-parser.ts` injection sites,
`jay-html-compile-refs.ts` (`graftTemplateOnlyRefs`), `contract-to-view-state-and-refs.ts`,
`jay-html-compiler-shared.ts`.

**Runtime (B):** `references-manager.ts` (`mkRefs`/`mkManagedRef`) and `node-reference.ts`
(`ComponentRefsImpl`, `DELEGATE_REFS_TO_COMP_TRAP`) already forward member access to a mounted
instance's public API. The new requirement is that the passthrough/override component's public
API *carries* the child refs — mostly a compiler-emission change, minimal runtime change.

### Issue 2 — override data binding (2a, recommended option-a)

Compile the override fragment against the **outer** ViewState/Refs (splice-at-outer-scope),
persisting provenance so the compiler knows which scope each override node belongs to. Client:
no runtime change (outer vars are lexically available at the injection call site if we emit the
mount there). The open risk is the inner component's own `forEach`/conditional mount points —
if the override lands inside an inner `forEach`, outer bindings and inner-item bindings
coexist, which pulls in Capability A (`$parent`) as the disambiguator. **This is the strongest
argument for building A first (Q5).**

---

## Implementation plan (phased, pending answers)

- **Phase 0 (this DL):** approve direction + answer Q1–Q5.
- **Phase 1 — Capability A (issue 3):** grammar `$parent`, `resolveAccessor` parent walk,
  type tests, fixtures **plus** the runtime primitive — `ConstructContext` parent pointer +
  parent-aware binding helper (Examples §A). Client + hydrate first. Unblocks 2a disambiguation.
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

## Trade-offs

- **`$parent` weakens scope isolation** (DL#84's deliberate default). Mitigation: explicit
  opt-in sigil, not implicit fall-through; keep `resolveAccessor` erroring on unknown members.
- **Ref forwarding crosses DL#187's "Tier 2 has no refs" line.** It adds *no code* to the
  Tier 2 component but does make it a ref surface. Needs an explicit decision (Q2); may warrant
  a one-line amendment to DL#187.
- **Splice-at-outer-scope for overrides** is the most intuitive for authors but couples the
  override to the inner component's mount lifecycle; nested inner `forEach` is the sharp edge.
- **Parent bindings cost a `ConstructContext` parent pointer on all targets** (Examples §A) —
  the "free on client via lexical capture" shortcut is unsafe (stale on keyed reuse). This is a
  small but real shared runtime primitive; building it once is cheaper than a client-only
  special case that later needs redoing.

## Verification criteria

1. From inside a `forEach`, `$parent.field` compiles to a type-safe binding on the parent var
   (client) with a full-fixture `toEqual` match; unknown parent member → validation error.
2. A pure composite wrapping `<jay:Button ref="cta">` exposes `cta` at the usage site with the
   correct `ButtonRef<VS>` type; the same button under a composite `forEach` exposes
   `ButtonRefs<ItemVS>`.
3. An override injecting `<button ref="x">` into a container exposes `x` to the outer scope and
   binds outer data into injected elements; events fire to the outer component.
4. Unsupported target/phase combinations produce a clear validation error, not a silent
   miscompile.
