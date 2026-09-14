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

The three problems split cleanly along **one axis: does the target reach the parent scope
lexically or through `ConstructContext`?**

- **Client/trusted target** already has the parent var in lexical scope. Cross-boundary
  *data* binding there is mostly a **compiler** problem (grammar + resolution + type), with
  **no runtime change**.
- **Bridge/server (data-id) targets** drop parent data in `ConstructContext`. Cross-boundary
  binding there needs a **runtime** change (parent back-pointer) **and** compiler threading.
- **Refs** across boundaries (issues 1 & 2) are a different mechanism entirely: they need the
  inner/override RefsTree to be *surfaced* to the outer scope and the passthrough/override
  component to *forward* the child refs through its public API.

So this is really **two runtime capabilities** — (A) *parent-data reachability* and (B)
*forwarded refs* — that the three features draw on in different combinations:

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
changes, so a *lexically captured* parent var would be **stale**. Therefore reactive
`$parent` needs the update path to carry parent data on **every** target, not just
bridge/server. Two viable runtime shapes:

```ts
// Option A1 — a parent-aware binding helper that reads parent data from the construction context
e('button', {}, [`Remove from `, dtp((vs1, p: PageViewState) => p.listTitle)])
//                                 ^ new helper: closure gets (item, parent)

// Option A2 — item element update receives a {self, parent} envelope
update: (d: { self: Item; parent: PageViewState }) => { ... d.parent.listTitle ... }
```

This makes issue 3 a **compiler + runtime** change (small, but not zero-runtime as first
mapped). It also means Q3-option-a ("splice override at outer scope, no runtime change") only
holds for **static/one-shot** outer bindings; reactive outer bindings inside an inner
`forEach` hit the same staleness wall.

**But parent access in _event handlers_ is much cheaper** — because refs already hold a live,
updated scope viewState (Current architecture §"Refs carry a live scope viewState"). A ref
inside a `forEach` already delivers the current item viewState to its handler; extending
`RefImpl` to also hold the parent viewState (and `formatEvent` to include it) is a localized
change to one already-live channel:
```ts
// today the handler event carries the ref's own scope viewState:
refs.removeBtn.onclick(({ event, viewState /* item */ }) => remove(viewState.id));
// parent-in-event goal — piggyback on the ref's live viewState field, add a parent slot:
refs.removeBtn.onclick(({ event, viewState, parentViewState }) => remove(viewState.id, parentViewState.listTitle));
```
So issue 3 splits by binding kind: **text/attribute** parent bindings need the `dt`/`da`
staleness fix above; **event-handler** parent access rides the ref channel with a smaller,
already-live extension. Worth deciding (Q1/Q6) whether we support both or start with events.

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
> _Answer:_

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
outer data (needs runtime A).
**Recommendation: (a)** — it matches author intuition and avoids a runtime back-pointer for
the common client case. Flag: interaction with inner component's `forEach` mount points.
> _Answer:_

**Q4. Reactive parent bindings need runtime work on _all_ targets (revised).** The
"free on client" assumption was wrong (Examples §A): `dynamicText.update` gets only the item,
so parent data must be threaded through `ConstructContext` + a parent-aware binding helper on
every target. Given that, do we still phase secure/server behind client, or build the
`ConstructContext` parent back-pointer once and enable all targets together?
**Recommendation: build the `ConstructContext` parent pointer once (shared primitive), enable
client + hydrate first, follow with secure/server** — the runtime cost is paid regardless, so
splitting buys little.
> _Answer:_

**Q5. Priority / sequencing.** Issue 1 (pure refs) and issue 2 (overrides) are the
user-driving features; issue 3 (forEach parent) is explicitly low priority but is the
*simplest* and shares runtime-A with issue 2a. Suggested order: **3 → 2 → 1** (build the
cheap parent-data primitive first, then overrides on top, then the refs-forwarding work).
> _Answer:_

**Q6. Parent access — event handlers vs text/attribute bindings (surfaced by the ref
channel).** Parent access in **event handlers** is cheap: refs already hold a live, updated
scope viewState (Examples §A), so it's a localized `RefImpl`/`formatEvent` extension. Parent
access in **text/attribute** bindings needs the `dt`/`da` staleness fix (new parent-aware
helper + `ConstructContext` pointer). Do we support both, or ship **event-handler parent access
first** (covers most real cases: "click in a row, act on the list") and defer text/attr?
**Recommendation: event-handler first** — smaller, rides an already-live channel; add text/attr
parent bindings only if a concrete need appears.
> _Answer:_

---

## Design

### Capability A — parent-scope data access (issues 3, and 2a option-b)

**Compiler (type generation):**
1. **Grammar** (`expression-parser.pegjs`): recognize a parent sigil in `accessor` /
   `propertyAccessor`, dispatched like the existing `jay`→`__jay` special case. Applies to the
   slow/dotted accessor rules too, for parity.
2. **`Variables.resolveAccessor`** (`expression-compiler.ts`): on a parent token, walk
   `this.parent` N levels, resolve remaining terms against `parent.currentType`, and return an
   `Accessor` whose `rootVar` is the parent's `currentVar` (e.g. `vs` from inside a `vs1`
   body). Type-safety flows automatically because `resolvedType` comes from the parent chain.
   `Accessor.render()` already honors `rootVar` verbatim → emits valid `vs.foo`.
3. `Accessor` may need to record the climbed level (or just bake the resolved `rootVar`).

**Runtime (revised — see Examples §A):** the initial map assumed the client target needs no
runtime change because the parent var is lexically in scope. **That is wrong for reactive
bindings:** `dynamicText.update(newData)` receives only the current item, and keyed list reuse
makes any lexically-captured parent var stale. So **all** targets need the update path to carry
parent data:
- Add `parent?: ConstructContext` to `ConstructContext`; set it in
  `forItem`/`forAsync`/`forScope`/`withHydration*`; expose parent `currData`.
- Add a parent-aware binding helper (e.g. `dtp`/`dap`) whose closure receives `(item, parent)`
  — or thread a `{self, parent}` envelope through item `update` (Examples §A, A1/A2).
- Only truly-static outer bindings (no reactivity) could skip this; not worth a separate path.

**Two channels, two costs (Q6):** the above is the **text/attribute** path. **Event-handler**
parent access is cheaper because refs already thread a live scope viewState: extend `RefImpl`
to also hold the parent viewState (fed by the same per-ref `update`) and have `formatEvent`
include it (`{ event, viewState, parentViewState, coordinate }`). The type side already has the
re-basing vehicle (`MapEventEmitterViewState`). Recommend shipping the ref/event path first.

**Files:** `expression-parser.pegjs` (+ `.cjs` rebuild + prettier), `expression-compiler.ts`
(`resolveAccessor`, maybe `Accessor`), no client runtime change. Deferred: `context.ts`,
`element.ts`, `jay-html-compiler-bridge.ts`, `jay-html-compiler-server.ts`.

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
