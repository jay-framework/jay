# Design Log #198 — Free refs as boundary event sources

Status: **DESIGN REVISED (2026-09-27b) — composition model is now the design of record; the branded
event-source model of Phase A is superseded (see "## Design Revision" below).** Builds on DL#196 (validated
inline composition) and is adjacent to DL#197 (`makeJayComponent` as a headless component). Resolves the
**ref half of DL#196 Q12** (`design-log/196 …` §Q12/§7), replacing the deferred `page-scope` pass-through
for refs with a boundary ref model.

> **Read this first.** The original design below (§Decisions … §Implementation Results/Phase A) delivered a
> _branded event-source_ boundary (`createRefEvents` + `REF_EVENT_SOURCE`/`BIND_REF_EVENTS` symbols +
> `freeRefEventSource` deferring proxy + `isFreeRef` gating + `RefDeclaration` object form). On review
> (yoav, 2026-09-27) we concluded this re-invents a tree node the **ref-manager composition** already
> provides: `refs.region.dismiss` should just _be_ a real `HTMLElementRefImpl`, reached by composing the
> region's ref manager under the page's region ref — the same way `refs.child.refName1` already works
> (`ref-operations.test.ts:358-389`). The composition model is a **net subtraction** of surface and is the
> design of record. It is captured in "## Design Revision" and supersedes the branded decisions/results.
> The branded content is retained as history (and is what currently exists in the tree).

> Origin: post-review with yoav (2026-09-27) while picking up DL#196's deferred §7. §7's page-scope
> pass-through (page injects its own DOM/refs into a region) proved both unnecessary for the motivating
> case and incoherent in secure mode. This DL is the cheaper, secure-mode-native answer to the actual
> need.

## Decisions for the Implementer (TL;DR)

**One sentence: an element ref inside a region body that the region's contract does not declare (a "free
ref") is automatically re-emitted on the region boundary as a typed event source, reachable from the page
as `refs.<regionRef>.<freeRef>.<domEvent>`, carrying the region's `viewState` and an accumulated
`coordinate` path as event data.**

1. **Free ref = a body element ref not in the contract.** The compiler already computes both sets at
   `jay-html-compiler.ts:942` (`mergedRefs = mergeContractStubRefs(inlineBody.refs, headlessImport.refs)`):
   free refs = `inlineBody.refs − contract refs`.

2. **Today it is silently orphaned** (the defect this fixes). At runtime a body ref binds to the
   **region's** construction context (`references-manager.ts:64-66` reads `currData`/`coordinate` from the
   active context); at the type level the usage site casts region refs to the contract type
   `... as ${pascal}Refs` (`jay-html-compiler.ts:1001`, nesting `:1030-1045`). So a free ref is
   runtime-live yet reachable by nobody — neither the component `.ts` (contract-typed) nor the page. This
   is a DL#195 L4 silent-wrong-render.

3. **The mechanism is `createEvent`, one element down (null hypothesis).** Jay refuses callback props and
   surfaces inner interactivity via **returned event emitters** (`createEvent`, `component/lib/hooks.ts:165`).
   Component-returned members already reach the parent through the component ref
   (`refs.<regionRef>.<member>`; `wrappedConstructor` returns `compCore` verbatim,
   `headless-instance-context.ts:216`). Ref events already carry `viewState` + `coordinate`
   (`node-reference.ts:26-27`, dispatched `handler(publicAPI, viewState, coordinate)` `:101`). Events
   already cross the secure/sandbox bridge (`secure/lib/sandbox/sandbox-refs.ts`, `main/main-bridge.ts`).
   So this is reuse, not new boundary machinery: **no `foreignChild`, no page-scope compile path.**

4. **Attach point: `makeHeadlessInstanceComponent`, driven by a compiler-supplied name list.** Both coded
   and no-code regions route through it (`generated-element.ts:78-82`). It gains a `freeRefNames: string[]`
   parameter; its `wrappedConstructor` already holds `refs` (line 106) and `compCore` (line 165), so it
   does `compCore[name] = createRefEvents(refs[name], coordinateKey)` for each free ref.
   `makePassthroughHeadlessInstanceComponent` forwards the list. The author's
   `makeJayComponent`/`makeJayStackComponent` is **untouched** — it cannot know page-materialised free refs.
   Compiler emits only the list: `makeHeadlessInstanceComponent(_headlessCard0Render, card, 'S0/0/card:plainCard', ['claim'])`.

5. **Typed (yoav decision).** The compiler generates the instance component's **return type** so the page
   sees `refs.<regionRef>.<freeRef>` typed by the element (e.g. button → `HTMLButtonElement` events). Free
   refs are usage-site-specific, so the augmented return type is generated at the **page** compile, not
   from the contract.

6. **Coordinate = composed array (yoav decision).** `coordinate(refName) = [...coordinateBase, refName]`
   and `coordinateBase` is **per-scope, not accumulated** across nesting (DL#126, `context.ts:228-229,235-239`),
   so the leaf coordinate alone is ambiguous. Each boundary **prepends its own instance coordinate**
   (`coordinateKey`) to the payload, so the page receives the full path `[...regionPath, refName]`. Payload
   shape is a single composed `Coordinate` array (not a struct).

7. **Automatic (yoav decision).** The boundary always re-emits free-ref events — no author opt-in. Required
   for no-code (no code to write wiring); applied to coded regions too for uniformity (a coded component
   may instead consume a ref via its contract, leaving it non-free).

8. **v1 scope = single-region depth, three targets, events only.** Nested-region free-ref exposure is
   **deferred** (it needs a component-ref forwarding analog that DL#196 §6 removed). `exec$`/DOM access
   across the boundary is **deferred** (bridge `$func`, larger surface). Contract refs on no-code regions
   are out of scope (free refs only).

## Design Revision (2026-09-27d) — Design D: delegation, driven from the page `FreeReferenceManager` (design of record)

> Supersedes the branded event-source model (Phase A), the composition-in-`ComponentRefsImpl` model
> (Phase A′), and the two-parallel-trees model (Phase A″, revision 2026-09-27c). A′ was built and is in the
> tree; this revision replaces it. Revisions c and d agree that **free refs must be known page-side** (see
> "Why the page must know" below); they differ in _where the page-context `RefImpl` is minted_. Design D wins
> because it deletes `composeFreeRef`, the bespoke deferral, and the name gating outright.

**One sentence: the page creates a `FreeReferenceManager` per region (page scope → page `eventWrapper`), and at
region mount it _drives_ — it reaches into the region's own free refs, mints a page-context `RefImpl` on each
free-ref DOM node, and `addRef`s it to its own aggregate.** The region's free refs _delegate_ to the page
manager rather than being consumed in place. `refs.<regionRef>.<freeRef>` is then a real element ref whose
events already carry the page `eventWrapper` and a composed coordinate — with **no** wrapper-proxy transform,
**no** bespoke deferral, and **no** name gating.

### Why the page must know its regions' free refs (the pre-render constraint)

The blocker that killed the "outer scope knows nothing" framing of revision c: the page constructor subscribes
**before** the region renders (`component.ts:156` constructor runs before `:170-176` render/mount). So
`refs.region.dismiss.onclick(cb)` fires while no region instance exists. For `.dismiss` to be subscribable
pre-render it must resolve to _something defined_. Two candidates, both fatal without page-side names:

- Return a **deferring proxy for any unknown member** (revision c's "generic deferral"). This breaks existence
  checks that other code relies on — `refs.conditional.element` (condition false) and `refs.refName1.method`
  (pre-render) must be `undefined`, and a proxy is truthy. Verified: `nested-component.test` and
  `ref-ordering.test` both fail.
- **Gate deferral by a free-ref name set.** This works, but the names have to live page-side.

So the page **must** know the free-ref names. Design D accepts this and makes it clean: the page creates a
`FreeReferenceManager` for exactly those names, and its public-API keys _are_ the name set — the same object
does overlay lookup **and** gating, so there is no separate `isFreeRef`/`freeRefNameSet` and no generic
deferring proxy.

### Why Design D over revision c (two parallel trees)

Revision c had the _region_ build a second (free) manager and the page rebase every crossing with
`composeFreeRef` (a proxy that re-wraps `on<event>`/`addEventListener` to prepend the coordinate and apply the
page `eventWrapper`) plus a bespoke pre-render deferral inside `ComponentRefsImpl`. Design D moves the free
manager to the **page** scope, which dissolves both:

- **Rebase becomes native.** The driving `RefImpl` is minted by the _page_ manager, so `this.eventWrapper` is
  already the page's `batchReactions` (Q8) and `formatEvent` already uses the composed coordinate
  (`node-reference.ts:310-317` bake both at construction). `composeFreeRef` is **deleted**.
- **Deferral becomes the existing mechanism.** The page `FreeReferenceManager` exists before render, so
  `refs.region.dismiss.onclick(cb)` hits its _real_ aggregate → `PrivateRefs.addEventListener` stores the
  listener → replayed when the driver `addRef`s the bound `RefImpl` at mount (`node-reference.ts:59-66`). The
  bespoke `deferredSubs`/`deferredMember` are **deleted**.

### The model (design of record)

```
page (outer) scope:                              region (inner) scope:
  refManager        → refs (plain 'region')        refManager      → element.refs (contract refs)
  freeRefMgr        → drives the crossing          freeRefManager  → compCore.freeRefs (inert carriers)
  refs.region.dismiss → freeRefMgr aggregate,       (free-ref RefImpls hold {element, viewState,
    bound to region DOM at mount                     coordinate}; no listeners — nobody subscribes
                                                      region-side, free refs aren't in the contract)
```

1. **Page creates a `FreeReferenceManager` per region.** Page scope → constructed with the page
   `eventWrapper`. Its aggregate type matches the region's cardinality: `HTMLElementRefsImpl` for a single
   region, `HTMLElementCollectionRefImpl` for a `forEach` of regions (this is where the collection
   generalization falls out). The page's main `.for()` keeps `region` as a plain `'region'` string — nothing
   is added to the page ref tree.
2. **Region builds its own free manager** (contract manager for `element.refs` + free manager for the free
   refs) and renders the free-ref elements against the free manager, exactly as it renders any ref. Because
   free refs are not in the region's contract, the region's `.ts` cannot reference them — so region-side these
   `RefImpl`s carry **no listeners**; they are inert carriers of `{ element, viewState, coordinate }`. The
   region exposes the free manager as `compCore.freeRefs` (plain string key → carried onto the instance by the
   `for…in` copy at `component.ts:209-221`; a symbol key would be skipped).
3. **The page manager drives at mount.** In `childComp`, right after `compCreator` renders the region
   (`element.ts:54`) and the page-side region `ComponentRefImpl` is `set`/`mount`ed (`:58-59`), the page
   `FreeReferenceManager` iterates the region's exposed free-ref carriers and, for each, mints a **page-context
   `RefImpl`** — page `eventWrapper`, composed coordinate `[...regionCoordinate, ...localCoordinate]` — bound
   to the _same_ DOM node via `set`, then `addRef`s it to its own aggregate (replaying any pre-render page
   subscriptions). On region unmount it removes them.
4. **Overlay for lookup.** `refs.region` (the region `ComponentRefsImpl` / collection-item `ComponentRefImpl`)
   holds a reference to the page `FreeReferenceManager`. Member lookup: **component instance first**, else the
   free manager's public API. `dismiss` is in the free manager (defined, subscribable pre-render);
   `getItemSummary` / `conditional.element` are not → fall to the instance → `undefined` pre-render. Existence
   checks are preserved; no name gating, no deferring proxy.

### Sub-decisions (settled)

- **Carrier accessor.** The driver needs each region free-ref's `{ element, viewState, coordinate }`. `element`
  is `protected` on `RefImpl` today; add one read accessor so the page manager can bind its own `RefImpl` to
  the region DOM node.
- **Composed coordinate.** The driver mints with `['region', ...local]` (prepends the region ref's coordinate
  → `['region','dismiss']`), not region-relative `['dismiss']`. Keeps a globally-unique, page-meaningful
  coordinate in the event payload.

### This generalizes — collections and deep nesting fall out

- **Collection of regions** (`forEach` of `<jay:Card>`). The page `FreeReferenceManager`'s aggregate is an
  `HTMLElementCollectionRefImpl`; each region item's mount drives one page-context `RefImpl` bound to _that
  item's_ DOM node with _that item's_ coordinate (including its `dataId`). `refs.regions.map(r => r.dismiss…)`
  is per-item-correct because each item drove its own `RefImpl`.
- **Collection of free refs** (a free ref under a `forEach` _inside_ the region body). The region's free
  manager holds an `HTMLElementCollectionRefImpl`; it exposes one carrier per element, and the page manager
  drives one page-context `RefImpl` per element — the same per-node binding, just N nodes.
- **Deep nesting** (region within region). Each boundary is the same driver step; a region's `compCore.freeRefs`
  may itself contain refs the _next_ level up drives. The single-boundary rule applied per level.

v1 **implements** single-region + single free ref (element target) and lands the driver so the above are
additive.

### What is deleted (net subtraction vs. what is in the tree today)

- `composeFreeRef` (the wrapper-proxy boundary transform) → **gone**; rebase is native to the page-minted
  `RefImpl`.
- `ComponentRefsImpl.freeRefNameSet` / `isFreeRef` / `deferredSubs` / `deferredMember` / `member` fallback and
  the name-gated `freeRef`/`deferredFreeRef` → **gone**; replaced by the page `FreeReferenceManager` overlay +
  the existing `PrivateRefs` deferral.
- `RefDeclaration = string | {name, freeRefs}` object form → **gone**; page `.for()` `comp`/`compCollection`
  are plain `string[]`.
- Already gone earlier: the branded symbols (`REF_EVENT_SOURCE`, `BIND_REF_EVENTS`, `createRefEvents`,
  `refEventsProxy`).

**Added.** A `FreeReferenceManager` (a thin `ReferencesManager` specialization or plain use of it) created
page-side per region; a `RefImpl` `element` read accessor; a driver step in `childComp` (and its hydrate twin)
that binds the page manager to the region's free-ref carriers; the overlay reference on `ComponentRefsImpl` /
`ComponentRefImpl`. **Added cost:** the compiler emits, per region, the page-side `FreeReferenceManager` + the
driver wiring, and the region still splits its refs into contract + free managers and sets `compCore.freeRefs`.

### Trade-offs

- **+** Rebase is native (no proxy transform), deferral is the existing `PrivateRefs` mechanism (no bespoke
  code), and existence checks are preserved (the free manager's keys are the name set).
- **+** Page ref tree stays clean (`region` is a plain string); the free-ref knowledge the page provably needs
  lives in a _separate_ per-region manager, not smeared into the main tree.
- **+** Collections and deep nesting are the same driver step recursed.
- **−** The page must know its regions' free-ref names (irreducible — the pre-render constraint). A driver step
  runs at each region mount/unmount. The region still builds a free manager (as carriers).

### Revised implementation plan (supersedes the Phase A–E, A′, and A″ plans)

- **Phase D-1 — driver model, element target, single region + single free ref.** Runtime: add a `RefImpl`
  `element` accessor; add a page-side `FreeReferenceManager` + a driver that mints page-context `RefImpl`s on
  the region's free-ref DOM nodes at mount and removes them at unmount; wire the overlay reference into
  `ComponentRefsImpl` (instance-first, free-manager-fallback lookup); delete `composeFreeRef`, the bespoke
  deferral, and name gating; revert `RefDeclaration` to plain `string[]`. Region factory sets
  `compCore.freeRefs`. Compiler: emit the page-side `FreeReferenceManager` + driver wiring; region splits refs
  into contract + free managers. Tests: rewrite `runtime/test/lib/free-ref-event-source.test.ts` (real proxy,
  `['region','dismiss']`, page batching, `exec$`, pre-render deferral) + update the `page-with-free-ref` golden;
  keep `ref-ordering`/`ref-events`/`ref-operations`/`nested-component`/hydration green.
- **Phase D-2 — collection of regions** (`forEach` of a region): per-item driver via the collection aggregate.
- **Phase D-3 — collection of free refs** (`forEach` inside a region body): one carrier/driver per element.
- **Phase D-4 — hydrate + server target parity.**
- **Phase D-5 — deep nesting + validation/examples/agent-kit.** (Secure mode still deferred; regions no-op in
  the sandbox — `SecureReferencesManager` already models `childRefManagers` composition, so the driver shape is
  sandbox-native when picked up.)

### Verification criteria (additions/overrides)

- `refs.<regionRef>.<freeRef>` is a real element proxy: `onclick`, `onclick$`, `addEventListener`, and `exec$`
  all work and reach the region's DOM element; subscribing pre-render defers and fires after render.
- Coordinate `['region','dismiss']` and page-context single-flush batching are produced by the page-minted
  driver `RefImpl`; the region's own contract refs (`element.refs.cardAction`) keep region coordinate and
  region batching — asserted at the runtime layer.
- Existence checks are preserved: `refs.conditional.element` (condition false) and `refs.<region>.<method>`
  (pre-render) are `undefined`; `ref-ordering` / `nested-component` stay green.
- The page ref tree carries no free-ref object form: page `.for()` `comp` args are plain `string[]`;
  `composeFreeRef`, `RefDeclaration` object form, and `isFreeRef`/`freeRefNameSet` are gone (grep = zero source
  hits).
- Per-item correctness for a collection of regions (`refs.regions.map(r => r.dismiss …)` — Phase D-2) is
  designed such that each item's mount drives its own coordinate.

---

## Background

DL#196 collapsed all composition to one path: a region (`<jay:Contract>`) is a headless instance whose
body is the component's inline template, binding the component ViewState; page data enters as props on the
tag. `hasCodeFile` chooses the backing component — a real `.ts` (coded) or a synthesized passthrough
(no-code). See DL#196 §2 and Q13.

DL#196 Q12 identified a residual gap: a region body cannot host **page-owned** refs. The original
direction (§7) was a `page-scope` subtree compiled in page scope and DOM-mounted into the region via the
`foreignChild` anchor. That anchor was deleted in DL#196 §6 (the removal was unconditional once §7 stayed
deferred), and §7 was never built.

## Problem

An author (or the page) puts `<button ref="claim">` inside a region body, expecting the page to handle its
click. Today (grounded above): the ref binds to region scope and is cast away at the boundary — no page
access, no component access, **no diagnostic**. The page's real need is almost always to **react to an
event** from a region-owned element (the DL#196 motivating case was `refs.cycleButton.onclick`), not to
inject its own DOM.

Two constraints make the naive fixes wrong:

- **forEach inside a region.** A free ref under region-internal repetition has no page-side scope to bind
  to; its only coherent scope is the region item's ViewState. So "rebind to page scope" (§7) is
  unrepresentable there — but the **event payload carrying the item's `viewState`** answers "which item
  fired" as data.
- **Secure mode.** Region-relative coordinates and injected foreign DOM do not cross the sandbox bridge;
  the bridge target no-ops regions entirely (`jay-html-compiler-bridge.ts:131-133`). **Events do cross.**
  So an event-source boundary is the only design with a coherent secure-mode story.

## Prior Art / Adjacent Mechanisms — null hypothesis first

| Mechanism                                            | Where                                                                        | Solves / constrains                                                                                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createEvent`                                        | `component/lib/hooks.ts:165-181`                                             | **The model.** Component returns an emitter; parent subscribes via the component ref. `createRefEvents` is the same shape, sourced from an element ref's DOM events. |
| Ref event payload carries `viewState` + `coordinate` | `node-reference.ts:26-27,101`                                                | **Yes — the payload.** No new plumbing to know which item/element fired.                                                                                             |
| Component-returned members surface on the parent ref | `headless-instance-context.ts:216` (`wrappedConstructor` returns `compCore`) | **Yes — the delivery.** Extra members on `compCore` become `refs.<regionRef>.<member>`.                                                                              |
| `makeHeadlessInstanceComponent` shared factory       | `headless-instance-context.ts:82-217`                                        | **Yes — the attach point.** Holds `refs` + `compCore` + `coordinateKey`; both coded & no-code route through it.                                                      |
| Coordinate composition (DL#126)                      | `context.ts:228-229,235-249`                                                 | **Constrains — the reason for §6/#6.** `coordinateBase` is per-scope; must be accumulated at each boundary.                                                          |
| Events over the sandbox bridge                       | `secure/lib/sandbox/sandbox-refs.ts`, `main/main-bridge.ts`                  | **Yes — secure mode.** Events serialize across; coordinates/DOM do not.                                                                                              |
| `foreignChild` (deleted, DL#196 §6)                  | gone (`96e1c555`)                                                            | **Not reused.** The §7 anchor; deliberately not re-introduced.                                                                                                       |
| Component-inner-ref forwarding (deleted, DL#196 §6)  | gone                                                                         | **Constrains nested regions.** Its absence is why nested-region exposure is deferred (§Design/Nested).                                                               |

**Null hypothesis result:** every needed capability already exists except (a) a thin `createRefEvents`
helper and (b) compiler emission of the free-ref name list + augmented return type. No new runtime
boundary.

## Questions and Answers

**Q1. Automatic or opt-in? — ANSWERED: automatic.** No-code has no code to write wiring; coded gets it too
for uniformity. A coded component may still consume a ref via its contract (then it is not free).

**Q2. Typed or aggregated stream? — ANSWERED: typed.** The page gets `refs.<regionRef>.<freeRef>` typed by
element, generated at the page compile (free refs are usage-site-specific).

**Q3. Which factory carries the name list? — ANSWERED: `makeHeadlessInstanceComponent`** (+ forward from
`makePassthroughHeadlessInstanceComponent`). Not the author's `makeJayComponent`, which cannot know
page-materialised free refs. (If plain non-region client children ever need this, base `makeJayComponent`
is a superset — out of scope here.)

**Q4. Coordinate payload shape? — ANSWERED: single composed `Coordinate` array**, accumulated by prepending
each boundary's `coordinateKey`. Nesting simply lengthens it.

**Q5. `exec$`/full element API, or events only? — ANSWERED: events only for v1.** `exec$` across the bridge
uses `$func` (larger surface); deferred.

**Q6. Nested regions? — DEFERRED.** Accumulation only chains if the outer region re-exposes the inner
region's free-ref events, but an inner region is a **component** ref and component-inner-ref forwarding was
removed in DL#196 §6. v1 targets single-region depth; nested is a later increment with its own decision
(possibly a slim re-introduction of component-ref forwarding).

**Q7. forEach-repeated free ref (single region)? — IN SCOPE, verify with fixture.** The free ref becomes a
ref **collection** at the boundary; the collection event API (`find`/iterate, `node-reference.ts:105-107`)
must surface and carry per-item `viewState`. Pin with a Phase D fixture.

**Q8. Do free-ref events preserve the page's `batchReactions` wrapping? — MUST, and it is not free.**

_How batching is carried (yoav's framing, verified)._ Batching travels on the **`eventWrapper`**, threaded
`component preRender({ eventWrapper })` (`component.ts:149`) → the render's `RenderElementOptions.eventWrapper`
(`element-types.ts:67-68`) → `ReferencesManager.for(options)` (`references-manager.ts:135`) →
`mkManagedRef(currData, coordinate, this.eventWrapper)` (`references-manager.ts:66`) → the DOM listener
wrap `this.eventWrapper(listener, formatEvent(event))` (`node-reference.ts:273`). So **whichever
`ReferencesManager` mints a ref decides that ref's `eventWrapper`.** The page's `render(options)`/`hydrate(options)`
receives the **page** component's `eventWrapper` (page `batchReactions`, `component.ts:146-147`), so every
page-level ref batches on the page context — e.g. the `cycleButton` free ref in the smoke `/headfull` hydrate
output (`examples/…/headfull/page.jay-html?jay-hydrate.ts`, `ReferencesManager.for(options, ['cycleButton'], …)`)
is page-owned and Just Works. **Corollary:** if a free ref were minted by the _page's_ `ReferencesManager` it
would inherit the page `eventWrapper` for free — the fix is entirely about _which manager mints it_, not new
wrapping code.

_The gap for region-body refs._ A region is its **own** `makeJayComponent` (`headless-instance-context.ts:220`)
with its **own** `mkReactive()` and its **own** `eventWrapper` (`component.ts:136,146`). Its body render
(`_headlessCardNRender(options)`) is called by that region component, so its `ReferencesManager` mints body refs
with the **region's** `eventWrapper`. Correction to "the child reads the parent's `componentContext`/reactive":
it does **not** — `makeJayComponent` never reads the parent `COMPONENT_CONTEXT`, and `reactive.enablePairing`
runs only for explicitly _consumed_ context markers (`component.ts:152-153,160-163`); `HEADLESS_INSTANCES` is
read via `findContext` (`:115`), which does **not** pair reactives. So a region-body ref's handler runs under
`region.reactive.batchReactions`, and a **page-signal write inside it hits `page.reactive` with
`inBatchReactions === false`** → `ScheduleAutoBatchRuns()` (`reactive.ts:117,149`), an **async** auto-batch on
the next macrotask instead of the synchronous, single flush a native page `onclick` gets. Different timing,
possible extra render — a real defect, not cosmetic.

_Why normal component events don't have this gap._ They batch on the **consumer** side: the page subscribes
through the page-owned `ComponentRefImpl`, whose `addEventListener` wraps the handler in the **page's**
`eventWrapper` (`node-reference.ts:267-277`). It does **not** rely on any parent↔child reactive pairing.

_Requirement._ A free-ref handler the page registers must run under the **page's** `eventWrapper`, the same as
every other boundary event the page consumes. Two routes, decide in Phase A:

- (a) **Mint/register the free-ref source as a page-side ref** (nested under the region ref) so the page's
  `ReferencesManager` supplies the wrapper on registration — reuses `node-reference.ts:267-277` unchanged and
  keeps batching a property of the _consumer_. **Preferred.**
- (b) Thread the page's `eventWrapper` down into the region so `createRefEvents` wraps with it.
  The region's own `batchReactions` still legitimately wraps region-signal work; the page's must additionally
  wrap the page handler (nested wrappers on distinct reactives is already how component events behave —
  `emitter.emit` runs under the child batch while the page listener is separately page-wrapped).

## Design

### 1. `createRefEvents` — the runtime helper

A sibling to `createEvent` in `component/lib/hooks.ts`. Given an element ref and the region's
`coordinateKey`, it returns an object mirroring that element ref's **DOM event registration API**
(`onclick`, `oninput`, `onchange`, …, matching `HTMLElementRefsImpl`), where each registered page handler
is invoked when the underlying region-scoped element event fires, receiving a `JayEvent` whose:

- `viewState` is the region's (or region-item's) ViewState — as the source ref already provides;
- `coordinate` is `[...coordinateKey, ...sourceRefCoordinate]` — the boundary prepends its instance path.

```ts
// shape (illustrative)
declare function createRefEvents<ElementType, ViewState>(
  ref: HTMLElementRef<ViewState, ElementType>,
  coordinateBase: Coordinate,
): RefEventSource<ElementType, ViewState>; // onclick/oninput/… → register page handlers
```

For a **collection** free ref (forEach in region), it mirrors the collection event API instead
(`node-reference.ts` `HTMLElementCollectionRefImpl`), preserving per-item `viewState`.

### 2. Factory wiring

`makeHeadlessInstanceComponent(preRender, componentDef, coordinateKey, freeRefNames?: string[])`. In
`wrappedConstructor`, after `compCore` is produced (`:165`) and before `compCore.render` is rewrapped
(`:186`), attach:

```ts
for (const name of freeRefNames ?? [])
  (compCore as any)[name] = createRefEvents(refs[name], asCoordinate(coordinateKey));
```

`makePassthroughHeadlessInstanceComponent(preRender, coordinateKey, freeRefNames?)` forwards `freeRefNames`.
(`coordinateKey` may be a `string` or a `(dataIds) => string` factory for forEach regions; resolve it the
same way `wrappedConstructor` already does at `:118-121`.)

### 3. Compiler emission (per target)

In `renderHeadlessInstance` (and hydrate/server twins):

1. Compute `freeRefNames = inlineBody.refs − contract refs` (both already in hand at `:942`).
2. Emit the name array as the 4th argument to `makeHeadlessInstanceComponent` /
   `makePassthroughHeadlessInstanceComponent`.
3. Generate the instance component's **return type** augmented with the free refs, so the page's
   `refs.<regionRef>` exposes them typed by element. (Today the region ref type is `${pascal}Refs`
   `:1030-1045`; the augmentation intersects that with `{ <freeRef>: RefEventSource<…> }`.)
4. Keep the free refs in the region's `ReferencesManager` (they must exist at runtime for `refs[name]`);
   only their **exposure** changes.

### 4. Targets

- **element** (`jay-html-compiler.ts`) and **hydrate** (`jay-html-compiler-hydrate.ts`, delegates create to
  element) — full wiring.
- **server** (`jay-html-compiler-server.ts`) — renders once, no interactive events; the emitters no-op
  (present for type parity, never fire). Verify SSR output is unchanged by the presence of free refs.
- **sandbox/bridge** — regions already unsupported (`:131-133`); unchanged. Secure-mode support rides on
  the existing event-bridge once regions are supported there (out of scope).

### Nested regions (deferred — Q6)

`refs.<outer>.<inner>.<freeRef>` requires the outer region to re-expose the inner region's returned
event members. That is component-inner-ref forwarding, removed in DL#196 §6. Deferred to a later increment;
until then a free ref inside a **nested** region is still orphaned (add a diagnostic in Phase E if cheap).

## Implementation Plan

Fixtures first, full `toEqual`, never `toContain` on code (CLAUDE.md).

**Phase A — `createRefEvents` + no-code passthrough, element target (single region).** Add the helper;
add `freeRefNames` to `makeHeadlessInstanceComponent` + `makePassthroughHeadlessInstanceComponent`; emit
the list + augmented return type in the element target for the no-code path. **Decide the Q8 batching route
here** (prefer (a): register the free-ref source as a page-side ref so the page's `eventWrapper` wraps the
handler). Runtime test (extend `stack-client-runtime/test/passthrough-headless-instance.test.ts`): no-code
region with `<button ref="claim">` → `refs.region.claim.onclick(h)` fires `h` with region `viewState` and
composed `coordinate`; and a page handler writing two page signals flushes the page reactive context **once**
(batching parity, Q8 / criterion 7). Compiler `toEqual` fixture for the emitted element output.

**Phase B — coded path (element target).** Same emission for the coded branch (author component passed as
`componentDef`); the author `.ts` is untouched. Extend the `page-with-coded-region` fixture with a free
ref and assert element output + a runtime test through `card`.

**Phase C — hydrate + server targets.** Mirror emission; server emitters no-op. Cross-target `toEqual`
fixtures (V2 — DL#194 defects 3/5/10 were target drift on this path). Confirm SSR output identical whether
or not free refs are present.

**Phase D — forEach-repeated free ref (single region).** Collection event API + per-item `viewState`
(Q7). Fixture with a region-internal `forEach` and a free ref inside it.

**Phase E — validation + examples + agent-kit.** Diagnostic for a free ref inside a **nested** region
(deferred capability, Q6). Migrate a smoke example (candidate: the `/headfull` "Inline Composition" page —
expose a free ref and drive it from `page.ts`). Agent-kit note: how a region exposes free-ref events, and
that they carry region `viewState`/`coordinate`.

## Verification Criteria

1. **Reachability.** A no-code and a coded region each expose a free `<button ref="claim">` as
   `refs.<regionRef>.claim.onclick`, type-checked, firing the page handler on click. (Phases A–B)
2. **Payload correctness.** The handler receives the region's `viewState` and a composed `coordinate`
   `[...coordinateKey, 'claim']`. (Phase A)
3. **forEach-in-region.** With a region-internal `forEach`, each item's free ref fires with that item's
   `viewState`; the collection API distinguishes items. (Phase D)
4. **Cross-target parity.** element/hydrate agree; server output is byte-identical with vs. without free
   refs (emitters no-op at SSR). Full `toEqual` fixtures. (Phase C)
5. **No regression.** `yarn confirm` green; no free ref is silently orphaned — every one is either a
   contract ref, an exposed boundary event source, or (nested, deferred) a clear diagnostic. (Phase E)
6. **No new boundary.** `foreignChild` is not re-introduced; no `page-scope` compile path is added. Diff is
   `createRefEvents` + one factory parameter + compiler emission + types.
7. **Batching parity (Q8).** A page handler on a free-ref event that writes two page signals produces exactly
   one page-context reactive flush — identical to a native page `onclick` — asserted via effect run-count in a
   Phase A runtime test. The page's `eventWrapper` (`component.ts:146-149`) wraps the handler; the region's
   `batchReactions` does not swallow page-signal batching.

## Implementation Results

### Phase A — runtime + factory wiring + element-target emission (DONE)

Runtime, factory wiring, element-target compiler emission, and both tests are complete and verified.
Whole-workspace `build:check-types` exit 0; runtime suite 278 pass / 3 skip; `stack-client-runtime` suite
24 pass (incl. the new 3-test behavior file); `compiler-jay-html` suite 715 pass / 4 skip (incl. the new
element-emission fixture test). Hydrate + server emission remain Phase C (their per-fixture tests are not
wired for the new fixture yet, so nothing there regresses).

**Compiler emission (element target), as built.** In `renderHeadlessInstance` (`jay-html-compiler.ts`),
`freeRefNames = inlineBody.refs.refs` (top-level, non-component) `− contract refs` (recursive, camelCased).
It is emitted in three coordinated places:

1. the region factory call gains a free-ref array arg — `makeHeadlessInstanceComponent(render, logic,
coord, ['dismiss'])` / `makePassthroughHeadlessInstanceComponent(render, coord, ['dismiss'])`;
2. the page-side region ref carries `freeRefs` (new optional field on `Ref`/`mkRef` in `compiler-shared`),
   so `renderReferenceManager` emits the `comp` entry as `{ name: 'plainCard', freeRefs: ['dismiss'] }`
   instead of a bare string (plain refs are unchanged — zero churn on existing goldens);
3. the region's own render manager already lists the free ref as an element ref (`['cardAction',
'dismiss']`) because it is a template ref.
   Fixture: `test/fixtures/contracts/page-with-free-ref` (coded card region + free `<button ref="dismiss">`
   not in the card contract); golden `generated-element.ts`; test in `generate-element.test.ts`. The author
   `card.ts` is untouched — the free ref is page-materialized. v1 covers the region's top-level element refs;
   nested/forEach free refs are Phase D (Q6/Q7).

**Delivery + batching mechanism (concrete, as built).** A free ref is delivered as a _branded_ event
source, not a plain returned member, so batching can be injected at the consumer:

- `node-reference.ts` — `createRefEvents(sourceRef)` returns a `RefEventSource` proxy (branded
  `REF_EVENT_SOURCE`) that wraps the region's **aggregate element ref**. Subscribing (`.on<event>(h)`)
  forwards to `sourceRef.addEventListener`, composing the coordinate. It also answers `BIND_REF_EVENTS` →
  returns a _re-bound_ copy carrying a consumer `eventWrapper` + a `coordinateBase` to prepend.
- `RefImpl.bindRefEventSourceMember(member)` = `member[BIND_REF_EVENTS](this.eventWrapper, this.coordinate)`.
  The page-side region `ComponentRefImpl` is minted by the **page's** `ReferencesManager`, so its
  `eventWrapper` is the page's `batchReactions` and its `coordinate` is the page-side region path — exactly
  the two things the free-ref source needs. This is Q8 **route (a)**, realized as consumer-side binding.
- `makeHeadlessInstanceComponent` sets `compCore[name] = createRefEvents(refs[name])` for each free ref;
  `component.ts:220-222` copies the (non-function) source onto the component instance verbatim, so
  `getFromComponent(name)` returns it on the page side.

**Deferral (the timing blocker, resolved).** The page constructor subscribes before the region renders
(`childComp` runs during render), so at subscribe time the region instance does not exist. Resolved on the
page's `ComponentRefsImpl` aggregate, mirroring how `PrivateRefs` defers element listeners: `.on<event>(h)`
on a free-ref member records `{name, eventName, handler}` and `addRef` replays each recorded sub onto the
new region instance (`subscribeFreeRef` → `bindRefEventSourceMember` → `.on<event>`). Replay-on-`addRef`
also makes forEach-repeated regions work for free.

**Deviations from the Design section:**

1. **`createRefEvents` lives in `runtime/node-reference.ts`, not `hooks.ts`** — it must sit next to the
   ref proxies/traps it brands and binds through; there is no hook surface involved.
2. **No `coordinateBase` factory parameter on the author side.** The composed coordinate is assembled at
   _bind_ time from the page-side region `ComponentRefImpl.coordinate` (prepended to the region-relative
   ref coordinate), not threaded through a helper parameter. Payload for `refs.region.claim` is
   `coordinate: ['region', 'claim']` (verified by test), i.e. page-region path + region-relative path.
3. **Free-ref names are declared at the page's component-ref declaration**, not inferred at runtime. New
   `RefDeclaration = string | { name; freeRefs }` on `ReferencesManager` (`comp`/`compCollection` accept
   it; plain strings unchanged, so all existing emission is untouched). `ComponentRefsImpl(freeRefs)` gates
   which members resolve to a deferring event source — required so a _non_-free-ref member access stays
   `undefined` pre-render (preserves `ref-ordering.test.ts`). The Phase A compiler step must emit the object
   form for regions that have free refs.
4. **Secure target unchanged** — `SecureReferencesManager.mkManagedRef` keeps its 2-arg override (the 3rd
   param is optional); secure-mode free refs remain a later phase (v1 sandbox no-ops regions).

**Files touched (Phase A runtime):** `runtime/lib/node-reference.ts` (helper + symbols +
`bindRefEventSourceMember` + `ComponentRefsImpl` deferral/gating + two delegate traps),
`runtime/lib/references-manager.ts` (`RefDeclaration` threading), `runtime/lib/index.ts` (exports),
`stack-client-runtime/lib/headless-instance-context.ts` (`freeRefNames` param, forwarded from the
passthrough factory). Test: `stack-client-runtime/test/free-ref-event-source.test.ts` (reachability,
payload viewState + composed coordinate, batching parity).

**Runtime-package unit tests (added — the sensitive refs area must be tested where it lives).**
`runtime/test/lib/free-ref-event-source.test.ts` (10 tests) exercises the machinery directly, with no
compiler and no `@jay-framework/component` dependency (hand-built region fixture `runtime/test/lib/comps/card.ts`
mirrors `makeHeadlessInstanceComponent`: exposes its free ref as a branded `createRefEvents` member):
`ReferencesManager.for` with `{name,freeRefs}` → `ComponentRefsImpl.isFreeRef` true for free-ref names /
false otherwise, plain-string ref → no free refs; `createRefEvents` is branded (`REF_EVENT_SOURCE`) and
delivers the region-relative payload when unbound (`coordinate: ['dismiss']`); page reachability with
subscribe-before-render (deferral + `addRef` replay) and subscribe-after-render; payload carries region
`viewState` + composed coordinate `['region','dismiss']`; free-ref name gating (free-ref member is a branded
source pre-render while non-free members stay `undefined` pre-render and resolve to the instance after render);
consumer `eventWrapper` (batching hook) wraps the free-ref handler. Full runtime suite green (288 passing,
`ref-ordering.test.ts` preserved); `tsc` exit 0.

### Phase A′ — de-brand to composed refs (DONE)

Replaced the branded event-source layer with the composed-ref model (design of record above). No compiler or
golden changes — emission was already compatible.

**What changed (runtime):**

- `node-reference.ts` — deleted `REF_EVENT_SOURCE`, `BIND_REF_EVENTS`, `createRefEvents`, `refEventsProxy`,
  `RefEventSource`. Added the free function `composeFreeRef(regionRef, coordinateBase, eventWrapper)`: a Proxy
  over the region's **real** element proxy that transforms only `on<event>`/`addEventListener` (prepend
  `coordinateBase`, run under `eventWrapper`) and passes everything else — `exec$`, reads — straight through
  (function values bound to the region ref). `RefImpl.bindRefEventSourceMember` → `composeFreeRefMember(member)
= composeFreeRef(member, this.coordinate, this.eventWrapper)` (page-side region `ComponentRefImpl` supplies
  the page coordinate + page eventWrapper — Q8). `ComponentRefsImpl`: `freeRefEventSource` → `freeRef(name)`
  (returns the real composed ref once a region instance exists, else a `deferredFreeRef` proxy that records
  `on<event>`/`addEventListener` and replays on `addRef`); `subscribeFreeRef` now composes the region's raw
  ref instead of checking a brand. `DELEGATE_REF_TO_COMP_TRAP` reverted to a plain `getFromComponent`.
- `index.ts` — export `composeFreeRef` instead of the branded symbols.
- `headless-instance-context.ts` — the factory exposes each free ref **raw**: `compCore[name] = refs[name]`
  (was `createRefEvents(refs[name])`). `component.ts`'s for-in copy forwards it verbatim to the instance.

**Retained (honest delta):** `RefDeclaration` object form + `isFreeRef` name list on `ComponentRefsImpl`
(needed pre-render to distinguish a free ref → deferring proxy from a plain member → `undefined`), and the
coordinate/eventWrapper boundary transform (renamed, de-branded). Net win: fewer primitives (no symbols, no
`RefEventSource` object) and a fuller API — `exec$`, `on<event>$`, `addEventListener` all reach the region's
real ref.

**Rejected:** rebase-at-render (generalize `withHydrationChildContext` to the client render boundary).
`coordinateBase`/`eventWrapper` are per render context, not per ref, so rebasing the region's render context
would corrupt the region's **own** contract refs (`cardAction` would mint as `['region','cardAction']` under
the page's batch). The transform must be page-side and free-refs-only. `childComp`/the render boundary are
untouched → low blast radius.

**Verified:** branded symbols grep = 0 source hits. Runtime tests rewritten
(`runtime/test/lib/free-ref-event-source.test.ts`, 10 tests: `refs.region.dismiss` is a real proxy with
composed coordinate `['region','dismiss']`, `exec$` reaches the region `BUTTON`, page `eventWrapper` runs
once; region-relative `['dismiss']` when accessed directly on the region; gating preserved) +
`comps/card.ts` (`dismiss: refs.dismiss` raw). Green: runtime 288, `stack-client-runtime` 24 (its 3-test
page-level file passes unchanged), `compiler-jay-html/generate-element` 76 (emission unchanged);
`build:check-types` exit 0.

### Phase D-1 — Design D: driven-from-the-page `FreeReferenceManager`, element target, single region + single free ref (DONE)

Re-implemented the runtime to the driver model (design of record above), replacing Phase A′'s `composeFreeRef`

- bespoke deferral + name gating, and wired the element-target compiler + full-stack emission. Green: runtime
  suite 287 pass / 3 skip; `stack-client-runtime` 24 pass (its 3-test page-level file rewritten to Design D);
  `compiler-jay-html` 715 pass / 4 skip (element-emission fixture updated); whole-workspace `yarn build` (tsc)
  exit 0.

**Runtime, as built.**

- `node-reference.ts` — deleted `composeFreeRef` and `composeFreeRefMember`. `PrivateRef` gains
  `getBoundElement()` (RefImpl returns `this.element`). `PrivateRefs.getCarriers()` returns, per driven ref,
  `{ element, viewState, coordinate }` — the inert carriers the driver mints from. `ComponentRefsImpl` is now a
  pure **overlay**: `member(prop)` returns the region instance member first (`getInstance()` =
  `[...elements][0]?.getPublicAPI()`), else the page `FreeReferenceManager`'s public API (`freeRefManager` set
  via `setFreeRefManager`), else `undefined` — so unknown members stay `undefined` pre-render (existence checks
  preserved, no truthy deferring proxy). `DELEGATE_REFS_TO_COMP_TRAP` → `member(prop)`.
- `references-manager.ts` — `BaseReferencesManager.driveFreeRefsFrom(regionFreeManager, regionCoordinate)`: for
  each free-ref name this (page) manager owns, reads the region manager's carriers and mints a page-context
  `RefImpl` (page `eventWrapper`, composed coordinate `[...regionCoordinate, ...carrier.coordinate]`),
  `set`s the element, `mount`s it (replaying pre-render page subscriptions), returns an unmount thunk. Exposes
  `REF_MANAGER` symbol (see deviation 1).
- `element.ts` — `childComp` takes an optional 4th `freeRefManager` (a `FreeRefDriver`); at mount it calls
  `driveFreeRefsFrom(childComp.freeRefs, ref.coordinate)`, torn down at unmount. **Idempotency guard** (see
  deviation 2).

**Compiler emission (element target), as built.** `freeRefNames` is computed as before. The page now keeps the
region ref a **plain string** and wires the free refs separately:

1. region factory arg unchanged — `makeHeadlessInstanceComponent(render, logic, coord, ['dismiss'])` /
   `makePassthroughHeadlessInstanceComponent(render, coord, ['dismiss'])` (the free-ref names gate
   `compCore.freeRefs = refs[REF_MANAGER]`);
2. `renderReferenceManager` (`jay-html-compile-refs.ts`) emits, per region ref with free refs, a page-scoped
   `const [<ref>FreeRefManager] = ReferencesManager.for(options, ['dismiss'], [], [], []);` plus
   `(refManager.get('<ref>') as ComponentRefsImpl<any, any>).setFreeRefManager(<ref>FreeRefManager);` and adds
   the `ComponentRefsImpl` import;
3. the `childComp(...)` call gains the `<ref>FreeRefManager` 4th arg (`jay-html-compiler.ts`); the page render
   generator now merges `refsManagerImport` (previously discarded) so the new import lands.
   Fixture `page-with-free-ref/generated-element.ts` updated to the Design D page emission; the region's own render
   manager still lists the free ref as an element ref (`['cardAction', 'dismiss']`).

**Deviations from the Design section (Design D):**

1. **Single region manager, no `REF_MANAGER` symbol — the driver reads carriers off the region's refs public
   API.** The design had the region build a _separate_ free manager. As built, the region uses one combined
   `ReferencesManager` (contract + free refs as element refs). The full-stack factory exposes the region's
   **refs public API** directly as `compCore.freeRefs = refs` (`headless-instance-context.ts`), and
   `driveFreeRefsFrom(regionRefs, coord)` reads `regionRefs[name].getCarriers()` for only the free-ref names
   the page manager owns — non-free refs (contract refs) are ignored. This works because the aggregate proxy
   returned by `getPublicAPI()` exposes `getCarriers()` via the ref `GetTrapProxy` fallthrough
   (`return target[prop]`), so no back-reference from the public API to the manager is needed.
   (An earlier build introduced a non-enumerable `REF_MANAGER` symbol to recover the manager from `refs`; it
   was removed once we confirmed the public API already surfaces `getCarriers` — subtract-first.)
2. **The driver mount is idempotented.** A jay component element is mounted **twice** by design — once by
   `ConstructContext.withRootContext` at construction (`context.ts:356`), once by the component's mounted-signal
   reaction (`component.ts` `mkMounts`). DOM/ref mounts tolerate that; `driveFreeRefsFrom` mints a fresh
   `RefImpl` per call, so a second drive double-attaches the DOM listener (observed: handler fired twice). Fixed
   with a `teardown`-flag guard in `childComp` (skip if already driven; cleared at unmount so a real remount
   re-drives).

**Not yet done (later phases):** D-2 collection of regions; D-3 collection of free refs; D-4 hydrate + server
target parity (the free-manager emission is gated to `ReferenceManagerTarget.element`, so hydrate/server are
unaffected and unregressed); D-5 deep nesting + validation/examples/agent-kit.

### Phase D-2 + D-3 — runtime layer for collections (DONE; compiler layer pending)

Built and verified the **runtime** for both collection shapes ahead of the compiler, to prove the driver
generalizes and pin down exactly what the compiler must emit. Green: runtime suite 300 pass / 3 skip (22 in the
three free-ref files); whole-workspace `tsc` exit 0.

**Key finding — the driver already generalizes; the runtime gap was small.** The delivery machinery
(`getCarriers` + `driveFreeRefsFrom` + aggregate replay) needed _no_ change for either collection case. Only two
things were missing, and only one is runtime:

1. **Runtime (built):** the free-ref overlay lived only on `ComponentRefsImpl`, so `refs.<regionCollection>.<freeRef>`
   was unreachable for a collection of regions. Lifted `freeRefManager` + `setFreeRefManager` + a new
   `freeMember(prop)` helper onto the shared base `PrivateRefs` (`node-reference.ts`). `ComponentRefsImpl.member`
   now calls `freeMember` for the fall-through; `ComponentCollectionRefImpl` gained a
   `DELEGATE_COLLECTION_TO_FREE_TRAP` (added to `ComponentCollectionRefProxy`) that returns `freeMember(prop)` —
   so a free-ref name resolves to the page free manager's public API while `map`/`find`/events on the collection
   itself still fall through to the collection's own methods.
2. **Compiler (still pending):** emit the per-region-name free manager for `compCollection` refs (not just
   `comp`), and declare the page free ref as an **`elementCollection`** (not `element`) whenever there can be
   more than one bound node (collection of regions, or a free ref under a region-internal `forEach`).

**Case 1 — collection of regions (region under a page `forEach`).** ONE page `FreeReferenceManager` is shared
across all items; each item's `childComp` drives it at mount, minting a page-context `RefImpl` over that card's
free-ref node onto the shared aggregate with composed coordinate `[<cardId>, 'region', 'dismiss']`. A single
`refs.region.dismiss` subscription hears every card; `refs.region.dismiss.map(...)` enumerates the per-card
carriers, and `refs.region.map(...)` still reaches the region instances (overlay falls through). Test:
`free-ref-collection-of-regions.test.ts` (6).

**Case 2 — free ref inside a region-internal `forEach`.** The region declares the free ref as a **flat
`elementCollection`** — no manager nesting. Each item's `dismiss()` is constructed inside the item context, so
every carrier already holds the item's viewState and an item-relative coordinate (`[<itemId>, 'dismiss']`); the
driver reads all carriers at region mount and mints one page ref per item (composed
`['region', <itemId>, 'dismiss']`). This is why nesting is unnecessary: coordinate + viewState come from the
construction context, not the manager structure. Test: `free-ref-in-region-foreach.test.ts` (7).

**Runtime limitation (documented, not yet addressed):** the driver is a one-shot snapshot at region mount. If a
region-internal `forEach` adds/removes items _after_ mount, the page aggregate is not re-driven. Acceptable for
the initial-set delivery these phases target; dynamic reconciliation is deferred (would require the region's
collection aggregate to notify the page manager on add/remove).

**Compiler gaps now precisely known (next step):**

- `freeRefNames` collection must include region refs that are `compCollection` (Case 1) and free refs nested in a
  region-internal `forEach` (Case 2) — today it scans only top-level `inlineBody.refs.refs`.
- `renderReferenceManager` must emit the free manager for `compCollection` region refs and cast to
  `ComponentCollectionRefImpl` (Case 1); today it iterates only `comp` refs and casts to `ComponentRefsImpl`.
- The page free ref must be declared `elementCollection` (2nd `.for` arg) when multiplicity > 1; today it is
  always `element` (1st arg).
- The region's own free manager must declare the free ref as `elementCollection` for Case 2; `element` otherwise.

### Phase D-2 + D-3 — compiler layer for collections (DONE)

Closed all four compiler gaps above. Green: `compiler-jay-html` 717 pass / 4 skip (incl. two new fixtures),
`compiler-shared` 120, runtime 300 / 3 skip, whole-workspace `tsc` exit 0.

**What changed (minimal surface):**

1. **`Ref.freeRefs` enriched** (`compiler-shared/render-fragment.ts`): `string[]` → `FreeRefDecl[]`
   (`{ name, repeated }`). `repeated` is the per-free-ref multiplicity signal the emitter needs (a free ref
   inside the region's own `forEach` is `repeated`, so it must be an `elementCollection` even for a single region).
2. **Recursive free-ref collection** (`jay-html-compiler.ts`): the collector now walks the whole `inlineBody.refs`
   tree (not just top-level), skips component + contract refs, dedups by name, and records each free ref's
   `repeated`. This is what finds the Case 2 free ref nested under the region's `forEach` child manager.
3. **Hoist** (`compiler-shared/render-fragment.ts` `hoistFreeRefs`): before `renderReferenceManager`, free refs
   are hoisted out of any nested (forEach) child managers to the top level of the region's combined manager, and
   emptied children are dropped. The ref's `constName` is unchanged, so the body's `refDismiss()` invocation
   inside the `forEach` still resolves — only the manager _declaration_ and `getPublicAPI()` shape change. This is
   required because `makeHeadlessInstanceComponent` exposes the region's whole public API as `compCore.freeRefs`
   and the page-side driver reads it flat by name (`freeRefs['dismiss']`). A top-level free ref (D-1, Case 1) is
   already flat, so the hoist is a no-op there.
4. **`renderReferenceManager` free-manager emission** (`jay-html-compile-refs.ts`): now iterates **both**
   `compRefs` and `compCollectionRefs`. Multiplicity rule: the page free ref is an `elementCollection` when the
   region is a collection (Case 1) **or** the free ref is `repeated` (Case 2); otherwise `element` (D-1). Cast is
   `ComponentCollectionRefImpl` for a region collection, `ComponentRefsImpl` for a single region. Added the
   `ComponentCollectionRefImpl` import (`compiler-shared/imports.ts`).

**Emission summary (all three shapes):**

| Shape                               | Region combined manager (dismiss)  | `makeHeadless…` free arg | Page free manager                      | Cast                         |
| ----------------------------------- | ---------------------------------- | ------------------------ | -------------------------------------- | ---------------------------- |
| D-1 single, top-level               | `element`                          | `['dismiss']`            | `element` (`[...],[],[],[]`)           | `ComponentRefsImpl`          |
| Case 1 collection of regions        | `element`                          | `['dismiss']`            | `elementCollection` (`[],[...],[],[]`) | `ComponentCollectionRefImpl` |
| Case 2 free ref in region `forEach` | `elementCollection` (hoisted flat) | `['dismiss']`            | `elementCollection`                    | `ComponentRefsImpl`          |

**Fixtures (golden-first):** `page-with-free-ref-collection` (Case 1) and `page-with-free-ref-in-foreach`
(Case 2), each asserting the full `generated-element.ts` via `toEqual`/`prettify`. Case 1 reuses the D-1 card
(top-level free ref) under a page `forEach`; Case 2 uses a card whose contract declares a repeated `tags`
sub-contract and whose body renders `<button ref="dismiss">` inside `forEach="tags"`.

**Deviation from the D-2/D-3 runtime plan:** the runtime fixture for Case 2 used _two_ managers in the region
(a contract manager + a separate flat free manager). The compiler instead keeps the single combined manager and
**hoists** the free ref flat within it — same observable public API (`getPublicAPI().dismiss` is a flat
`elementCollection`), fewer emitted managers, and it unifies D-1/Case 1/Case 2 under one code path.

**Still deferred:** D-4 hydrate + server target parity (emission still gated to `ReferenceManagerTarget.element`;
hydrate/server unaffected and unregressed); D-5 deep nesting + validation/examples/agent-kit; and the documented
one-shot-driver limitation (post-mount forEach add/remove not re-driven).

### Phase D-4 — hydrate target parity (DONE)

The hydrate target (`jay-html-compiler-hydrate.ts`) now emits free-ref support identical to the element target,
so a hydrated page drives its regions' free refs at mount. Green: `compiler-jay-html` 720 pass / 4 skip, runtime
300 pass / 3 skip.

1. **Runtime — `childCompHydrate` gained a `freeRefManager?: FreeRefDriver` param** (`runtime/lib/hydrate.ts`),
   mirroring `childComp`'s D-1 mount/unmount drive block: at mount it calls
   `freeRefManager.driveFreeRefsFrom((childComp as any).freeRefs, ref.coordinate)` and stores the teardown; the
   drive is idempotent and torn down at unmount. `FreeRefDriver` is now exported from `runtime/lib/element.ts`.
2. **Compiler — hydrate free-ref collection + emission** (`jay-html-compiler-hydrate.ts`): the same recursive
   `collectFreeRefs` / `hoistFreeRefs` used by the element target now runs over `adoptInlineBody.refs`; the
   `freeRefsArg` (region factory names), `freeRefDecls` (page-side ref manager), and `${refConstName}FreeRefManager`
   argument are appended to `makeHeadlessInstanceComponent`, the page-level `ReferencesManager`, and to
   `childCompHydrate`/`childComp` respectively. The hydrate target already used `ReferenceManagerTarget.element` so
   the page free-manager block (`setFreeRefManager`) was never gated out — the only missing wiring was in
   `renderHeadlessInstance`.
3. **Server target — no change needed.** SSR is non-interactive: it renders the free-ref element as ordinary
   markup (see the example bodies below) and never drives an event source, so no free-ref emission belongs there.
4. **Fixtures:** `generated-element-hydrate.ts` goldens added for all three shapes (D-1, Case 1, Case 2), asserted
   full-file via `toEqual`/`prettify`.

### Phase D-5 (partial) — page-side type augmentation (design point 3) (DONE)

The page-side region ref type is now augmented with its free refs, so `refs.<regionRef>.<freeRef>` type-checks
without a cast — closing design point 3 (`§Design/3`). Applied to the element, hydrate, **and** definition (`.d.ts`)
targets (the dts target reuses `renderFunctionImplementation`, so the element-path change flows through it).

- **`freeRefsAugmentedRefType(contractRefType, freeRefs, regionIsCollection)`** (`compiler-shared/render-fragment.ts`)
  builds `${contractRefType} & { <freeRef>: <proxy>; … }`. Each free ref is `HTMLElementProxy<VS, El>`, or
  `HTMLElementCollectionProxy<VS, El>` when the region is a collection (Case 1) **or** the free ref is `repeated`
  (Case 2). `FreeRefDecl` gained optional `viewStateType` / `elementType` (populated from the collected `Ref`).
- The instance ref's `JayTypeAlias` now carries the augmented type; the proxy imports and the free ref's viewState
  type import are added to the emitted file.

| Shape                               | Page-side augmented region ref type                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| D-1 single, top-level               | `CardRefs & { dismiss: HTMLElementProxy<CardViewState, HTMLButtonElement> }`                   |
| Case 1 collection of regions        | `CardRepeatedRefs & { dismiss: HTMLElementCollectionProxy<CardViewState, HTMLButtonElement> }` |
| Case 2 free ref in region `forEach` | `CardRefs & { dismiss: HTMLElementCollectionProxy<TagOfCardViewState, HTMLButtonElement> }`    |

### Phase D-5 (partial) — full-stack examples (`examples/jay-stack/smoke-test`)

Three region pages exercise the feature end-to-end through the real jay-stack build (element + hydrate + server
compilation) and SSR:

- **`/free-ref`** (D-1): single coded region (`dismiss-card`) with a `dismiss` free ref; `page.ts` wires
  `refs.plainCard.dismiss.onclick(...)`. SSR renders the region incl. the free-ref button. ✅
- **`/free-ref-in-foreach`** (Case 2): coded region (`tag-card`) whose own template has an internal `forEach`;
  the `dismiss` free ref lives inside it, exposed flat as an elementCollection; `page.ts` wires
  `refs.region.dismiss.onclick(({ viewState }) => …)`. SSR renders every tag row incl. the free-ref button. ✅
- **`/free-ref-collection`** (Case 1): a collection of regions under a **page-level** `forEach`; `page.ts` wires
  `refs.cards.region.dismiss.onclick(({ coordinate }) => …)`. Element + hydrate + server compile correctly (the
  server element emits the per-item `__headlessInstances[id + ',dismiss-card:region']` lookup), `page.ts`
  type-checks, and SSR renders every card body incl. the free-ref button. ✅ (see Phase D-6 for the one runtime
  fix this required.)

> **Note on raw `tsc`.** These examples are validated through `jay-stack-cli build` + the vitest smoke suite, not
> through raw `tsc`. `tsc` cannot resolve `import … from './x.jay-contract'` (there is no ambient `*.jay-contract`
> module and no `.jay-contract.d.ts` is emitted to disk — only `page.jay-html.d.ts` is), so `yarn build:check-types`
> fails project-wide on every component that imports a contract (banner, button, section, …), independent of free
> refs. Page-side `page.ts` files import from `./page.jay-html` (which does have a generated `.d.ts`) and are fine.

### Phase D-6 — slow-only forEach region SSR population (DONE)

Case 1 initially rendered empty region bodies at SSR. Root cause was **not** discovery — forEach-region discovery
(`discoverHeadlessInstances` → `forEachInstances`) and the per-item `__headlessInstances` keying
(`computeForEachInstanceKey` → `"<trackBy>,<contract>:<ref>"`) were already wired end-to-end. The gap was in
`fast-changing-runner.ts`: the forEach-instance loop populated `__headlessInstances` **only inside**
`if (comp.compDefinition.fastRender)`. A region whose data is entirely slow (like `dismiss-card`, `heading` only)
has no `fastRender`, so nothing was populated and the server element's `if (vs_dismiss_card0)` guard rendered
nothing.

Unlike **static** instances (whose slow ViewState is baked at build time into `instancePhaseData.slowViewStates`),
**forEach** instances have no pre-baked slow ViewState — the array is only known per request — so `slowlyRender`
must run per item at request time. Fix: run `slowlyRender` per item unconditionally, then merge with `fastRender`
if present, else populate from the slow render alone:

```ts
let slowVS = {},
  cf = {};
if (comp.compDefinition.slowlyRender) {
  /* run per item → slowVS, cf */
}
if (comp.compDefinition.fastRender)
  instanceViewStates[coord] = { ...slowVS, ...fastResult.rendered };
else if (comp.compDefinition.slowlyRender) instanceViewStates[coord] = slowVS;
```

This is the general fix — a plain region-in-page-`forEach` (no free ref) with slow-only data hit the same gap.
Coverage: two runtime unit tests in `stack-server-runtime/test/fast-render-instances-bindings.test.ts` (slow-only
population; slow+fast merge) plus the `/free-ref-collection` smoke test (dev + production). All render correctly:
each card shows its per-item `heading` (from the `{title}` prop binding) and its free-ref button.
