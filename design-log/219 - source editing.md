# Design Log #219 — Source Editing (edit contract-bound data at its source)

Status: **[Design]**

## Decisions for the Implementer (TL;DR)

1. **Dev-mode only.** When a user points at content, the agent decides: **static** (unbound) → edit `page.jay-html`; **bound** → edit at the source via the region's plugin.
2. **Inspector** = dev-only, embed-mode postMessage API. A point or a rectangle resolves to a **jay-html source fragment + a structural stack** (not a pre-resolved binding list). The agent reads the fragment to decide static-vs-bound and to find the binding expression.
3. **Editing is one primitive: a per-contract guide** (markdown) shipped by the region's plugin. It is the single entry point; it references `devOnly` actions (to write, and/or a URL-returning action to open a window) and may offer the agent options. No `editing:` contract block; no reserved action names.
4. **Validation (prevention-first):** each contract declares its editing story — a guide, or explicit `readonly`.
5. **No new framework syntax.** Reuse: freeze-style postMessage, agent-kit guides, `actions[].devOnly`, and a coverage validation rule.

## Why

For `{productPage.productName}` the agent can find the tag in the jay-html but not which **record** it is, what the **write path** is, or where the **editor URL** is. Editing the jay-html would hard-code content the contract owns. So the runtime does the one thing only it can — map a pixel to its jay-html source node and structural context — and the agent does what it is good at: read that source, decide static-vs-bound, and (if bound) follow the plugin's guide. Everything bound-specific lives in the plugin as docs + ordinary actions, so there is no declarative editing grammar to maintain and nothing for the inspector to keep in sync with the template syntax.

## Prior Art / Adjacent Mechanisms

| Mechanism                                | Verdict                                                         |
| ---------------------------------------- | --------------------------------------------------------------- |
| `jay-coordinate` (DL#103/#106/#126)      | DOM position only, conditionally emitted → insufficient alone   |
| `runtime-automation` `getPageState()`    | ViewState + refs only; no bound text/images → extend, not reuse |
| Freeze postMessage (DL#128)              | **Reuse pattern** for the inspector                             |
| Plugin `actions[]` / `actions[].devOnly` | **Reuse** as the write/URL path and the dev-only gate           |
| `plugins-index.yaml` / agent-kit (#85)   | **Reuse** as the discovery channel for per-contract guides      |
| DL#215 (MCP/REST = plugin space)         | Constrains: no core MCP in v1                                   |

**Null hypothesis checked:** match the pointed element's text against ViewState values (no inspector) — rejected (duplicates like `price`=`salePrice`, images, `forEach` ambiguity). A source-node marker is cheap and exact.

## Design

### 1. Inspect — point/rect → jay-html source fragment

Dev-only, embed-mode postMessage. Input coordinates are in the iframe's native CSS-pixel space.

```
// jay:inspectPoint { x, y, requestId }  → jay:inspectResult     { requestId, result:  InspectResult }
// jay:inspectRect  { x, y, w, h, requestId } → jay:inspectRectResult { requestId, results: InspectResult[] }

InspectResult {
  file,                             // source file for this frame (AIditor hosts several files/frames)
  lines:  { from, to },             // 1-based line range of the matched element in `file`
  rect:   { x, y, width, height },  // matched element's box
  scroll: { x, y },                 // iframe scroll offset at measure time
  node?:  "<jay-html of the matched element + ~1 level of children>",  // OPTIONAL — see How Part 1
  ancestors: [                      // innermost → outermost; FULL nested stack, forEach/region/if interleaved, any depth
    { lines, kind: "forEach", collection: "{products}", itemId: "sku-123" },        // itemId = runtime trackBy
    { lines, kind: "region",  name: "jay:card", props: { productId: "3" } },        // props = primitive props only
    { lines, kind: "forEach", collection: "{sections}", itemId: "hero" },           // nesting is arbitrary
    { lines, kind: "if",      condition:  "{isOnSale}" },
  ],
  params,                           // route params of the current page
  // rect results only:
  containment: "full" | "partial",  // "full" = wholly inside the rect
  coverage:    0..1,                // self-coverage: area(el ∩ rect) / area(el)
}
```

- `node` is the **source** fragment (expressions, `if`, `forEach` intact) — the DOM has lost them. It is **optional**: `file` + `lines` locate it, and the agent reads it from `page.jay-html` (filesystem access). See How — Part 1.
- `ancestors` is the full nested stack (`forEach` / `region` / `if`, any depth, interleaved), innermost → outermost. Each entry carries `lines`. **Runtime fields** come from DOM markers: `forEach` `itemId` (trackBy) and `region` `props` (primitive props only). **Static fields** (`kind`, `collection`, `condition`, region `name`) the agent reads from source at each entry's `lines`; `name` resolves to a contract via the import (§2).

**Rect selection rule.** Metric is **self-coverage** = `area(el ∩ rect) / area(el)` (how much of _the element_ is selected) — not rect-coverage, which would re-select the whole page.

```
hits = elements where self-coverage ≥ 0.8        (full containment is the 100% case)
if hits:  return the SHALLOWEST hits — a hit whose PARENT is not a hit — in document order
else:     return the single tightest element that ENCLOSES the rect
```

This excludes the page/section (low self-coverage when partially grabbed), auto-collapses N children to their parent (the parent becomes the shallowest hit), and handles a small marquee inside one block (the `else` branch). All elements are source-mapped, so it is purely geometric.

**Coordinate contract — the page is zoom/scroll-agnostic.** Everything crossing postMessage is in the iframe's native CSS-pixel space (`elementFromPoint` / `getBoundingClientRect`). **AIditor owns zoom and scroll:** it un-applies zoom (and maps to iframe coords) on the way in, re-applies zoom to `rect` on the way out. `scroll` is returned so AIditor can convert the viewport-relative `rect` to content space once and keep the selection pinned across subsequent scroll without a round-trip.

### 2. Resolve — region name → contract + code

The runtime does not resolve `region.name`. The region's **import statement in `page.jay-html`** links the name (e.g. `jay:card`) to its contract and code files, so the agent resolves it via that import. (With regions, a frame's sources are all in one `page.jay-html`.)

### 3. Edit — the per-contract guide

Decision rule: static text → edit `page.jay-html` at `lines`. Bound → resolve the region → contract → its **editing guide**.

The guide (markdown, shipped by the plugin, surfaced via `plugins-index.yaml` / agent-kit) is the **single entry point**. It tells the agent what to do — call an action to **write** the source, call an action that returns a URL and **open a window**, or offer **several options** and let the agent choose. Any action it names is ordinary (`getEditUrl` is not reserved; the framework knows nothing of it).

The guide is **per-contract** because record identity differs per contract. Example — `wix-stores`:

| Contract         | Record key (from inspect result) | guide instructs                           |
| ---------------- | -------------------------------- | ----------------------------------------- |
| `product-page`   | `slug` (route param)             | `getEditUrl(slug)` → fetch slug→productId |
| `product-search` | `productId` (`forEach` `itemId`) | `getEditUrl(productId)`                   |

Both open the same editor; only the key/translation differs. The guide documents which key to pull from the inspect result, so guide + actions are a self-documenting per-contract pair. `siteId` is fetched internally by the action.

**Dev-only.** Editing actions (write, URL-returning) are `actions[].devOnly: true`: handlers in the `./tools` entry (`lib/tools.ts`), registered by the dev server, **excluded from production** (`validate-plugin` leak-scans for compiler imports in prod). ✅ `agent-kit-template/plugin/actions-guide.md:10-13`.

### 4. Validate — per-contract coverage

Each contract provided by a plugin must declare its editing story as exactly one of: an **editing guide**, or explicit **`readonly`** (+ reason). So read-only is intentional, the agent always has an answer (edit here / open a window / read-only because X), and there are no silent gaps. A guide is opaque prose referencing ordinary actions — no bespoke write-schema validation.

## How — Part 1: Dev-mode markers

What the inspector needs is produced by a small set of **dev-mode-only, self-contained** DOM markers. Grounded in the live dev output (fake-shop): dev already emits `jay-coordinate` (= `jay-coordinate-base`), an `S<scope>/<path>` **source-positional** path that opens a new scope per `forEach`/headless (`assign-coordinates.ts:121`) — but it is emitted **conditionally** (static-only subtrees like `<h1>Products</h1>` get none) and is **shared across list items** (every `<li>` is `S0/0/1/0`), so it cannot anchor an arbitrary pixel or identify a record.

### Decouple from `jay-coordinate`

`jay-coordinate` is the SSR↔hydration contract (DL#103/#106/#126) and keeps evolving for hydration reasons; pinning source editing to its format is fragile. Use a dedicated marker set. We may reuse the `assign-coordinates` **traversal** (it already visits every source node and knows each one's scope kind) to emit our markers — but not its coordinate **format**.

### The markers (source-editing dev mode only)

On every source-derived element:

- **`jay-dev-src="from:to"`** — line range into `page.jay-html`. The pixel→source anchor and the `lines` value in one. (`node-html-parser` nodes carry `range: [number, number]` offsets → lines. ✅ API exists; ⚠️ confirm it is populated under our parse options.)

Runtime-identity markers, only where the renderer knows what the source cannot:

- **`jay-dev-item="<trackById>"`** on each `forEach` item root — the live record id (the shared coordinate cannot distinguish items).
- **`jay-dev-prop-<name>="<value>"`** — one attribute per **primitive prop** (string/number/boolean) on each region/headless instance root; the inspector reassembles them into `{name: value}`. (Per-prop rather than one JSON blob so each is a clean single binding — see How — Part 2.)

### Regions have props, not a key

A region has zero-to-many data props, bound from parent values and possibly updated by interactive inputs; a prop may be any JS object (e.g. a coded region taking a product list). **Assumption: only primitive props are identities relevant to data editing** — so we stamp primitives only and skip objects/arrays. The region's name/import is read from source at its `jay-dev-src` lines; the runtime supplies the live primitive prop values (e.g. `productId="3"`). Because the props are emitted as **bound** attributes (How — Part 2), the value is always current at inspect time with no re-stamping — the compiler's reactivity keeps it live. ⚠️ revisit if a non-primitive prop is ever the only available identity.

### The full nested stack

`forEach` and regions nest arbitrarily and interleave, and the whole chain matters. The inspector **walks up the DOM** from `elementFromPoint`, collecting each ancestor's `jay-dev-src` (→ `lines`), `jay-dev-item` (→ `forEach` `itemId`), and `jay-dev-prop-*` (→ region `props`), innermost → outermost, with no depth limit. Each level contributes its runtime identity; the agent reads each level's static role (collection / region name / `if` condition) from source at its `lines`.

### Client-only inspector; agent reads the fragment

Because the markers are self-contained, the inspector runs **entirely in the browser** — no AST at inspect time, no dev-server round-trip, no embedded source-map table: `elementFromPoint` → read `jay-dev-src` / walk up → measure `rect`/`scroll` → read `params` from the page's hydration JSON. The source fragment need not be shipped; `file` + `lines` locate it and the agent reads it from disk. Hence `node` is optional in `InspectResult`.

### Staleness

Markers drift only if source changes without a re-render; dev HMR re-renders on edit, so markers match the live source within any inspect→edit cycle. Dev-only, so the added attributes are acceptable noise.

## How — Part 2: Dev-mode source transform (single seam)

**One dev-only source-to-source transform injects all three markers into the jay-html; the existing compiler then carries them to every target and keeps the bound ones live.** No per-target runtime stamps, no server codegen, no `window.__JAY_DEV_MARKERS__` runtime flag — the earlier three-mechanism design is dropped. The markers become ordinary jay-html: `jay-dev-src` a static attribute, `jay-dev-item`/`jay-dev-prop-*` **bound** attributes. A bound value is, by definition, available for binding in whichever phase renders it, so slow/fast/interactive and reactive updates are all covered for free.

### Why not the vite-plugin loader

The natural "loader" (the `jayRuntime` `transform` hook, `rollup-plugin/lib/runtime/runtime-compiler.ts:115-130`, cached once at `get-jay-file-structure.ts:53`) is **too late for `jay-dev-src`**: the hydrate target imports `page.jay-html?jay-hydrate` pointing at the **pre-rendered** file (`generate-ssr-response.ts:584`), and the SSR server element parses the pre-rendered content too (`generate-ssr-response.ts:425`) — both are the slow-render **re-serialized** output (`slow-render-transform.ts:505/816/936`), where `.range` offsets map to transformed markup, not the author's file. It would also miss SSR entirely (no `?jay-server` branch — SSR bypasses the plugin). The transform must run on the **original on-disk source, before slow-render**, which is read in exactly one place.

### The seam: dev-server pre-render input

`dev-server.ts` reads the original source once (`:1290` `fs.readFile(route.jayHtmlPath)`), then `slowRenderTransform` (`:1306`) → `assignCoordinatesToJayHtml` (`:1332`) → `preRenderedJayHtml` (`:1324`), cached and consumed by **both** the hydrate client (plugin compiles the pre-rendered file) and the SSR server element. Insert `injectDevMarkers(originalJayHtml): string` **immediately after the read, before `slowRenderTransform`**. Everything downstream inherits the markers; the transform is inherently dev-only (this is the dev-server pipeline — the prod SSG build uses a separate entry). Gating is "did the dev-server run the transform," so no plugin/runtime flag is needed. ⚠️ confirm every dev page render funnels through this pre-render (no fast path that skips it); ⚠️ confirm `slowRenderTransform` passes unknown bound attributes through untouched rather than trying to resolve `{id}`/`{expr}` as slow bindings.

### `jay-dev-src="from:to"` — static, in `injectDevMarkers`

Parse the original source, convert each element's `.range` → `{from,to}` lines against the raw text (`.range` on every `node-html-parser` node, `html.d.ts:65`), `setAttribute`. Because offsets are taken against the original file, line values are on-disk-accurate; they ride through slow-render / coordinates / all compilers as a plain attribute.

✅ **Passthrough is free — no allowlist edit.** All targets render attributes via a **deny-list** (`DIRECTIVE_ATTRIBUTES`, `jay-html-compiler-shared.ts:120-137`) plus a generic `else` emitting any remaining attribute verbatim: element `renderAttributes` else (`jay-html-compiler.ts:240-246`), server `renderServerAttributes` else (`jay-html-compiler-server.ts:460-476`), hydrate via SSR for adopted nodes + `renderAttributes` for created forEach/if nodes (`shared.ts:258-308`). `jay-dev-*` are none of {directive, class, style, `propertyMapping`}, so they fall through. **The one rule: never add `jay-dev-*` to `DIRECTIVE_ATTRIBUTES`** — that set is exactly why `jay-coordinate-base`/`jay-scope` get stripped-and-renamed to `jay-coordinate`; a dev attr wants the opposite.

### `jay-dev-item="{<trackBy>}"` — bound, in `injectDevMarkers`

On each `forEach` element (which _is_ the item root, `assign-coordinates.ts:171`), inject `jay-dev-item="{<trackByProp>}"` bound to the item-scope trackBy property. The compiler emits it as a dynamic attribute on every target and re-evaluates it per item and on list updates — no runtime stamp. Reuse the `trackBy` attribute already present on the element for the property name.

### `jay-dev-prop-*="{<expr>}"` — bound, in `assign-coordinates` (not the loader)

The hard case. Region props are **not** HTML attributes: on `<jay:card title="{p.name}" price="{p.price}">` they are component-prop bindings (`renderChildCompProps`), and the region's rendered root is the **synthesized** `display:contents` wrapper that `assign-coordinates` creates (`:238`) — which does not exist yet at `injectDevMarkers` time. So props can't be a pure loader output.

→ Handle them in **`assign-coordinates`**, the single shared pre-processor that already (a) runs for all targets, (b) identifies regions, and (c) creates the wrapper. When it wraps a region, copy each scalar-looking prop binding onto the wrapper as a **separate** bound attribute `jay-dev-prop-<name>="{<expr>}"`. Per-prop attributes (vs. one JSON blob) keep each a clean single binding — no fragile JSON-with-interpolations escaping — and each stays live in the parent scope where `{p.name}` is valid. The inspector reassembles `{name: value}` from the `jay-dev-prop-*` attributes on the region root.

- **Change to Part 1:** `jay-dev-props='{…}'` (one JSON attr) → **`jay-dev-prop-<name>="{expr}"`** (one bound attr per primitive prop). Rationale above.
- ⚠️ **Primitiveness without types:** `assign-coordinates` has the binding _expression_, not the contract _type_, so it can't prove a prop is primitive. Options: (a) include all single-expression prop bindings and let the inspector drop values that render as `[object Object]`; (b) feed the region's contract types into the coordinate pass to filter to primitives. (a) is simpler and client-correct; decide at implementation.

### Inspector + enabling the markers in the dev-server client script

The markers are static DOM; the inspector is pure client code. Host it in the injected inline module — `generate-client-script.ts` `buildFreezeScript` (`:178-258`) / `buildAutomationWrap` (`:260`), reused by the SSR/hydrate page via `generate-ssr-response.ts` (`:581-602`), where `_jay_embed` gating already lives (`:183-186`). Add the `jay:inspectPoint` / `jay:inspectRect` handlers: `elementFromPoint` → read `jay-dev-src`, walk ancestors for `jay-dev-item`/`jay-dev-prop-*`, measure `rect`/`scroll`, read `params`, apply the rect rule. (The markers themselves are already in the DOM from the transform — the client script only _reads_ them.)

### Summary of changes

| Marker           | injected where                        | kind   | targets covered via                   |
| ---------------- | ------------------------------------- | ------ | ------------------------------------- |
| `jay-dev-src`    | `injectDevMarkers` (pre-render input) | static | pre-rendered jay-html → hydrate + SSR |
| `jay-dev-item`   | `injectDevMarkers` (pre-render input) | bound  | compiler dynamic attr, all targets    |
| `jay-dev-prop-*` | `assign-coordinates` (wrapper create) | bound  | compiler dynamic attr, all targets    |

Net vs. the dropped design: **two code sites** (`injectDevMarkers` + a few lines in `assign-coordinates`) instead of per-target runtime stamps in `element.ts`/`hydrate.ts` and server codegen, and **no runtime flag**.

## Implementation Plan

Ordered so each phase is independently testable (compiler fixtures / runtime tests) before the inspector consumes it. **Part A** is this DL's scope (runtime / dev-server emission); **Part B** is the consumer side, mostly its own DLs.

### Part A — Dev-mode source transform + inspector

**Phase A1 — `injectDevMarkers` (static `jay-dev-src` + bound `jay-dev-item`).**

- New dev-only string→string transform: parse the original jay-html, `setAttribute('jay-dev-src', 'from:to')` from `.range` on every element, and `setAttribute('jay-dev-item', '{<trackBy>}')` on every `forEach` element (reusing its `trackBy` attr for the property name).
- Wire it into the dev-server pre-render **immediately after the source read (`dev-server.ts:1290`) and before `slowRenderTransform` (`:1306`)**, so offsets are on-disk-accurate and the markers flow into `preRenderedJayHtml` → hydrate + SSR. Inherently dev-only (dev-server pipeline); no flag.
- No `DIRECTIVE_ATTRIBUTES` edit (✅ passthrough confirmed). Add a guard test that fails if `jay-dev-*` is ever added to that set.
- ⚠️ Verify first: `.range` populated under the parse options; `slowRenderTransform` leaves unknown bound attrs (`{id}`) untouched; every dev render funnels through this pre-render.
- Fixtures (`toEqual` + `prettifyHtml`): hydrate + SSR dev output carry accurate `jay-dev-src` lines and a `jay-dev-item` bound to trackBy on `forEach` roots; `jay-dev-item` re-evaluates per item and on list update.

**Phase A2 — `jay-dev-prop-*` in `assign-coordinates`.**

- Where `assign-coordinates` wraps a region (`:238`), copy each single-expression prop binding from the `<jay:…>` tag onto the wrapper as `jay-dev-prop-<name>="{<expr>}"` (bound, parent scope).
- Primitiveness: start with option (a) — include all single-expression bindings, inspector drops `[object Object]`; revisit feeding contract types if needed.
- Runs for all targets via the shared pass; fixtures assert the bound prop attrs on the region root across hydrate + SSR and that they update on interactive prop change.

**Phase A3 — inspector in the dev-server client script.**

- Add `jay:inspectPoint` / `jay:inspectRect` handlers in `buildFreezeScript` / `buildAutomationWrap` (`generate-client-script.ts:178-260`), reusing the existing `_jay_embed` gating — fully client-side: `elementFromPoint` → read `jay-dev-src`, walk ancestors for `jay-dev-item`/`jay-dev-prop-*`, measure `rect`/`scroll`, read `params`, implement the rect rule. No AST/source at inspect time.
- Wire per-target injection in `dev-server.ts` (`generateClientScript` `:1040/:1135`, `generateSSRPageHtml` `:1106`).

#### Unit tests — the transforms are pure `string → string`

`injectDevMarkers` and the `assign-coordinates` prop step are both source-to-source, so they get full fixture coverage **without** the dev-server, compiler, or a browser. Per testing standards: fixtures under `test/fixtures/dev-markers/` as `*.input.jay-html` / `*.expected.jay-html`, compared with `toEqual(prettifyHtml(...))`; one test file per module; **no `toContain`**.

`injectDevMarkers` (`compiler-jay-html`) cases:

- **Line accuracy (the point of the pre-pass):** `jay-dev-src="from:to"` maps to the **original** file lines — including indented, blank-line-separated, and multi-line-open-tag elements. Assert the exact ranges, not just presence.
- **Nesting:** every element gets its own range; a parent's range spans its children.
- **Non-elements untouched:** comments and text nodes get no marker; `<head>`/`<script type="application/jay-data">` are out of scope.
- **`forEach`:** the `forEach` element gets `jay-dev-item="{<trackBy>}"` (property read from its `trackBy` attr) **plus** `jay-dev-src`; nested `forEach` each get their own `jay-dev-item`.
- **Region tag:** `<jay:card …>` gets `jay-dev-src` only here; its prop attributes are left untouched (props are Phase A2's job).
- **Conditionals:** an `if="…"` element still gets `jay-dev-src` (static attr survives even when the branch is later slow-resolved).
- **Preservation + idempotency:** existing attributes/order preserved; running twice does not double-inject.
- **Directive guard:** a unit assertion that `jay-dev-src`/`jay-dev-item`/`jay-dev-prop-*` are **absent** from `DIRECTIVE_ATTRIBUTES` (fails loudly if anyone adds them, which would silence passthrough).

`assign-coordinates` prop step cases (extend the existing `assign-coordinates` fixtures):

- Region with primitive prop bindings → wrapper carries `jay-dev-prop-<name>="{expr}"` for each, in the parent scope.
- Region with an object/array prop → under option (a), still emitted (fixture documents the accepted behavior that the inspector drops `[object Object]`).
- Ref-less vs explicit-ref region, and a region inside a `forEach` → prop attrs land on the correct wrapper without disturbing coordinate/scope assignment.

### Part B — Consumers (separate DLs / later)

**B1.** Per-contract editing guides + `devOnly` actions in the prototype plugin (`wix-stores`, own repo DL); agent-kit surfaces them via `plugins-index.yaml`.
**B2.** Coverage validation in `jay-stack validate` (stack-cli / plugin-validator): each contract has a guide or is `readonly`.
**B3.** Agent-kit guide `source-editing.md` (designer + plugin roles): the decision rule, region→contract resolution, guide discovery.
**B4.** Live example (onsko-shop): edit a product name via the guide's write action; deep link when the guide offers a URL action.
**B5.** Companion DL in the aiditor repo (marker → inspect → "Bound data" prompt block → confirm UI).

## Scope — not handled

Production-mode editing (dev only); rich-text field kinds (defer to the guide's prose); per-call auth/permissions on write actions (DL#215); Wix write actions themselves (wix repo DL); composed/computed bindings beyond returning the fragment (the agent reads all contributing bindings from `node`); **type-accurate primitiveness for `jay-dev-prop-*`** — deliberately deferred: ship option (a) (emit all single-expression prop bindings, inspector drops `[object Object]`); upgrade to contract-type filtering only if a real case needs it.

## Verification

- Compiler/transform fixtures (`toEqual` + `prettifyHtml`): dev output carries accurate `jay-dev-src` lines, `jay-dev-item` bound to trackBy on `forEach` roots, and `jay-dev-prop-*` on region roots — across hydrate + SSR; bound markers re-evaluate on list/prop update.
- Dev-server tests: `jay:inspectPoint` and `jay:inspectRect` on text, image, `forEach` item, nested region — asserting `node`/`lines`/`ancestors`/`rect`/rect-rule results.
- Validation tests: a contract with no guide and no `readonly` fails; guide-only and `readonly` pass.
- Live: onsko-shop product name edited via guide action; deep link returned when the guide offers a URL action.

## Trade-offs

Dev-only markers add dev DOM noise for exact resolution. Emitting them as a single dev-mode source transform (markers as jay-html attributes/bindings) rather than per-target runtime stamps keeps all phase/update behavior on the existing compiler + reactivity — at the cost of one subtlety: `jay-dev-prop-*` can't be pure loader output (region props aren't HTML attrs, the root is synthesized), so it lives in `assign-coordinates`. Moving editing into plugin guides + ordinary `devOnly` actions costs validation-of-internals (a guide is prose) but gains unbounded expressiveness (text/image/URL flows) with zero new framework surface. The rect rule's `0.8` threshold is a tunable constant.

## Claims

✅ verified: freeze postMessage pattern; `jay-coordinate` is source-positional, scoped per forEach/headless, and emitted conditionally (`assign-coordinates.ts`; fake-shop dev output); `actions[].devOnly` dev-only/prod-exclusion (`actions-guide.md:10-13`); `node-html-parser` nodes expose `range` offsets (`html.d.ts:65`); **attribute rendering is deny-list based — unknown attributes pass through verbatim on all three targets** (element `jay-html-compiler.ts:240-246`, server `jay-html-compiler-server.ts:460-476`, hydrate `shared.ts:258-308` + `renderAttributes`), so `jay-dev-*` reach output with no allowlist edit, provided they are NOT added to `DIRECTIVE_ATTRIBUTES` (`shared.ts:120-137`); **the original on-disk source is read once in dev, at the pre-render input (`dev-server.ts:1290`, before `slowRenderTransform` `:1306`)**, and both hydrate (`?jay-hydrate` of the pre-rendered file, `generate-ssr-response.ts:584`) and SSR (`parseJayFile` of pre-rendered content, `:425`) consume the resulting `preRenderedJayHtml` — so a single transform there covers all dev targets; the vite-plugin `transform` hook sees only the pre-rendered (slow-render re-serialized, `slow-render-transform.ts:505/816/936`) jay-html, so it is too late for accurate `jay-dev-src` lines; `assign-coordinates` is the shared pre-processor that creates the region wrapper (`:238`) and runs for all targets.
⚠️ assumed (verify before implementing): `node-html-parser` `range` is populated under the parse options used by `injectDevMarkers`; `slowRenderTransform` passes unknown bound attributes (`jay-dev-item="{id}"`) through untouched (does not try to resolve them as slow bindings); every dev page render funnels through the `dev-server.ts:1290` pre-render (no fast path skipping it); region prop bindings on `<jay:…>` can be read in `assign-coordinates` and primitiveness filtered there (option (a): render-then-drop `[object Object]`, or feed contract types); `region.name` is read from source at the region's `jay-dev-src` lines for import resolution.

## Implementation Results

### Phase A1 — `injectDevMarkers` (done)

- **New transform** `compiler-jay-html/lib/jay-target/inject-dev-markers.ts`: pure `string → string`, recurses `<body>` only, stamps `jay-dev-src="from:to"` (1-based line range from `.range`, idempotent) on every element and `jay-dev-item="{<trackBy>}"` on `forEach` roots. Exports `DEV_SRC_ATTR` / `DEV_ITEM_ATTR` / `DEV_PROP_ATTR_PREFIX` from the package index.
- **Verified assumptions:** `.range` is populated under the parse options used (ran a live check); `slowRenderTransform` passes `jay-dev-item="{id}"` through untouched; markers reach element/hydrate/SSR via the deny-list passthrough (no `DIRECTIVE_ATTRIBUTES` edit). Confirmed live against fake-shop pages (`products/page.jay-html` `<main>`→`8:19`, `<li foreach trackby="id">`→`11:17` with `jay-dev-item="{id}"`; head/script/meta not marked).
- **Tests:** 14 unit tests in `test/jay-target/inject-dev-markers.test.ts` (line ranges, scope, `jay-dev-item` lowercase/camelCase/nested, region src-only, conditionals, preservation + idempotency, directive-attribute guard). Full `compiler-jay-html` suite green (745 passed, 4 skipped). Note: unit tests use `doc(...lines)` fixtures inline rather than `*.input.jay-html` files — line numbers are the assertion target, so they read clearer co-located with the expected ranges.

### Deviation — gated behind a `sourceEditing` option (was: "no flag")

The DL's recorded decision (Part 2 / Phase A1) was **"inherently dev-only (dev-server pipeline); no flag"** — gating is "did the dev-server run the transform." That gate proved **too coarse**: injecting on _every_ dev render changes SSR output for all dev work, which broke the 68 SSR-fixture assertions in `dev-server/test/hydration.test.ts` (and would surprise every normal dev session with marker noise).

**Resolution:** added `DevServerOptions.sourceEditing?: boolean` (default `false`), threaded through `defaults()` → `handlePreRenderRequest` → `preRenderJayHtml`, which calls `injectDevMarkers` only when the flag is on (`dev-server.ts`, `dev-server-options.ts`). Markers are now emitted **only for AIditor / source-editing sessions**, not normal dev renders. With the gate off, all 711 hydration tests pass.

### Phase A2 — `jay-dev-prop-*` DROPPED (design refuted by runtime trace)

The planned Phase A2 (copy region prop bindings onto the `display:contents` wrapper as `jay-dev-prop-<name>="{expr}"`) is **unviable**. A runtime trace (element/hydrate/server compilers) refuted the ⚠️-assumed claim that region props "can be read in `assign-coordinates` and primitiveness filtered there":

- A **bound attribute resolves in the scope of the element carrying it** — `renderAttributes` feeds the current-scope `variables` to the expression parser (`jay-html-compiler.ts:214-255`); `resolveAccessor` roots every accessor at the current scope's view state and has no implicit parent climb (`expression-compiler.ts:131-193`).
- The wrapper div created at `assign-coordinates.ts:238` is **child-scoped** — `renderHeadlessInstance` renders the instance's children with `componentVariables` (the CHILD scope, `jay-html-compiler.ts:870`).
- Region props (`{p.name}`) are **parent-scoped** — read by `renderChildCompProps` against the parent context and emitted as the `getProps` getter rooted at the parent var (`jay-html-compiler.ts:1064-1070`).
- Therefore `jay-dev-prop-title="{p.name}"` on the wrapper makes the compiler resolve `p` in the _child_ contract → hard validation error `the data field [p.name] not found in Jay data` (`expression-compiler.ts:182-189`). Not silently wrong — it breaks compilation.
- `$parent` would climb but is **unsupported in the server (SSR) and React targets** (`expression-compiler.ts:524-537`), so it can't ride all three targets.
- **There is no parent-scoped rendered DOM element for a region**: `<jay:card>` is a directive compiled to a `childComp(...)` call; the only parent-rooted channel is the `getProps` getter, not an attribute on a DOM element. Nothing to hang a parent-scoped DOM attribute on.

**Decision (user-approved):** drop `jay-dev-prop-*` entirely. The inspector resolves region data from what A1 already provides — `jay-dev-src` yields the **source fragment** (`<jay:card title="{p.name}">`, i.e. contract name + binding expressions), `jay-dev-item` yields the enclosing record id, and the inspector reads the element's **rendered text content** directly for the live value. No new framework surface; the `getProps`/scope boundary stays untouched. The "type-accurate primitiveness" deferral in Scope is now moot (there is no prop marker to make primitive). Removed the dead `DEV_PROP_ATTR_PREFIX` constant/export and its Phase-A1 mention above is superseded by this note.

### Phase A2 (revised) — move the static `jay-dev-src` onto the region wrapper div

The drop above left a gap: a region's own `jay-dev-src` never reaches the DOM. `injectDevMarkers` stamps it on the `<jay:card>` tag, but that tag is a directive — on the element target it survives only as a **spurious extra component prop** `"jay-dev-src": '4:4'` handed to the real component (harmless, type-checks, but noise — ✅ verified by probe: element output `childComp(_HeadlessProductCard0, (vs) => ({productId:'prod-hero', "jay-dev-src":'4:4'}), …)`; `validations = []`); on the server target it vanishes (region rendered from `__headlessInstances`). Either way the inspector has no DOM element carrying the region's source location.

**Fix (user suggestion):** the region already gets a rendered DOM root — the `display:contents` wrapper div synthesized in `assignHeadlessInstance` (`assign-coordinates.ts:238-246`). **Move** `jay-dev-src` from the `<jay:card>` tag onto that wrapper at creation. This is safe where the bound `jay-dev-prop-*` was not: `jay-dev-src` is a **static string** (a line range), so the child-scope of the wrapper is irrelevant — no accessor is resolved. "Move" (not copy) also strips the attribute off the `<jay:card>` tag, eliminating the spurious element-target prop.

- **Location:** `assignHeadlessInstance`, at/after the wrapper-creation block (`assign-coordinates.ts:238-246`). Read `element.getAttribute('jay-dev-src')`; if present, `wrapper.setAttribute('jay-dev-src', …)` and `element.removeAttribute('jay-dev-src')`.
- **Idempotency:** `assignCoordinates` runs more than once on a tree. The move happens only inside the wrapper-creation branch (guarded by `!alreadyWrapped`); on a later pass the wrapper exists (keeps its `jay-dev-src`) and the tag no longer carries the attr, so it's a no-op.
- **Ref-less single-child region:** no wrapper is created (`:238` wraps only when `explicitRef || children > 1`). There we still `removeAttribute('jay-dev-src')` from the `<jay:card>` tag (kill the spurious prop); the region's source stays recoverable from the single child's own `jay-dev-src`. Accepted edge case.
- **A1 unchanged:** `injectDevMarkers` keeps stamping `jay-dev-src` on `<jay:card>` (it is the source `assign-coordinates` moves it _from_). The A1 region test (`src(card) === '4:4'`) still holds for the transform's output; the move is a later, compiler-side step.
- **Tests:** extend `coordinate-preprocess.test.ts` — a region with `jay-dev-src` on the `<jay:...>` tag yields a wrapper div carrying that `jay-dev-src` and a tag with none; idempotent across two `assignCoordinates` runs; ref-less single-child region strips the tag's attr and leaves the child's intact.

**Implemented.** `assign-coordinates.ts` (`assignHeadlessInstance`) now imports `DEV_SRC_ATTR`, sets it on the wrapper at creation (`!alreadyWrapped` branch), and `removeAttribute`s it from the `<jay:…>` tag in all cases. 3 tests added to `coordinate-preprocess.test.ts` (17 pass); full `compiler-jay-html` suite green (748 passed, 4 skipped). The move applies in real compilation because all three targets call this same `assignCoordinates` pass; an end-to-end compiled-output assertion (wrapper carries `jay-dev-src`, no component prop) is folded into the A3 live test.

## Phase A3 design — the inspector protocol

Pinned before implementing (DL methodology; the return shape is a contract the AIditor companion, B5, consumes). Anchors re-verified against real code (the earlier plan's `generate-client-script.ts:178-260` / "dev-server.ts" cites were imprecise):

- **Home:** `packages/jay-stack/stack-server-build/lib/generate-client-script.ts`. The embed/freeze client script is `buildFreezeScript(routePattern)` (`:178`), composed into `buildAutomationWrap(options, 'client' | 'hydrate')` (`:260`) which both dev client (`dev-server.ts:1043`) and hydrate (`:1138`) paths emit. The inspector is a sibling block in the **embed-mode branch** (`__jayEmbedMode`, `generate-client-script.ts:234-241`), reusing the existing `window.addEventListener('message', …)` listener and `window.parent.postMessage` reply channel (same pattern as `jay:requestFreeze` → `jay:freeze`).
- **Gate (decided):** always emit the inspector block within the embed-mode branch — no `sourceEditing` plumbing into `GenerateClientScriptOptions`. It is harmless without markers (`elementFromPoint` finds no `jay-dev-src` → reply `node: null`), and keeping it off the options path avoids threading a flag through two more call sites. The markers themselves remain gated by `sourceEditing` (A1), so inspect only returns real data in source-editing sessions.

### Messages

Request (parent → iframe), handled in the embed-mode `message` listener:

- `{ type: 'jay:inspectPoint', requestId, x, y }` — viewport coords of a click/hover.
- `{ type: 'jay:inspectRect', requestId, x, y, width, height }` — a drag-selected rectangle (viewport coords).

Reply (iframe → `window.parent`):

```
{ type: 'jay:inspectResult', requestId,
  node:  { src, tag, text, attrs } | null,   // src = "from:to" line range; text = trimmed rendered textContent (truncated); attrs = value-bearing only (src/href/value) when present
  stack: [ { tag, src?, item?, region?, ref? }, … ],  // target → root; item = jay-dev-item record id; region+ref on display:contents wrappers
  route, routePattern,                        // agent maps route+pattern → jay-html file + params
  rect:  { x, y, width, height } }            // target's getBoundingClientRect, for parent overlay
```

The reply carries **source locators, not resolved bindings** (per TL;DR #2): `node.src` + `route`/`routePattern` let the agent read the exact jay-html lines (incl. the enclosing `<jay:card …>` tag → contract + prop bindings); `stack[].item` gives the enclosing forEach record id(s); `node.text`/`attrs` are the live rendered values for correlation (replacing the dropped `jay-dev-prop-*`).

### Resolution algorithm

`inspectPoint(x, y)`:

1. `el = document.elementFromPoint(x, y)`; if null → reply `node: null`.
2. Walk `el` → document root. For each element frame record `{ tag, src: getAttribute('jay-dev-src') || undefined, item: getAttribute('jay-dev-item') || undefined, region, ref }` where `region = true` + `ref = class` when the element is a `display:contents` wrapper (detect by inline style).
3. `node` = nearest frame at/above `el` that has `src` (the deepest marked element); fill `tag`, `text`, `attrs`.
4. `stack` = frames from that node up to root.
5. `rect` = node element's `getBoundingClientRect()`.

`inspectRect(x, y, w, h)` — **the rect rule** (pick the element the drawn box means):

- Candidates = marked elements (`[jay-dev-src]`) intersecting the selection.
- For each, `overlap = intersectionArea(elRect, sel) / elRect.area` (**decided:** denominator is the element's own area — "the box mostly encloses this element"). Choose the **deepest** candidate with `overlap ≥ 0.8`. If none clears 0.8, fall back to `inspectPoint(center)`.
- `0.8` is a tunable constant (noted in Trade-offs).
- Reply shape identical to `inspectPoint`, for the chosen element.

### A3 verification

- Dev-server/browser test (Playwright, like `hydration.test.ts`) with `sourceEditing: true`: post `jay:inspectPoint` over a text node, an image, a `forEach` item, and a region; assert the `jay:inspectResult` `node.src`, `stack` (forEach `item` id present, region `ref` present), and `rect`.
- `inspectRect` over a box tightly around one card returns that card; a sloppy box returns the center fallback.
- Inspector block absent when `sourceEditing` is off.

### Phase A3 — implemented, with an architecture correction

**Correction — the A1 "single seam" claim was wrong (post-DL#144).** The design (and the A1 Claims) assumed SSR consumes the pre-rendered jay-html, so one injection in `preRenderJayHtml` would cover all dev targets. ✅ now refuted by tracing the live dev render: **SSR compiles from the _original_ jay-html** (`dev-server.ts` `sendResponse`, "compile from original jay-html with merged ViewState (DL#144)"), while **hydrate/client imports the _pre-rendered_ file** (`generate-ssr-response.ts:473`). Two different sources. The verification: the on-disk pre-rendered file carried the markers, `generateServerElementFile` kept them, but the served SSR HTML had none — because `compileAndLoadServerElement` was handed the original content.

**Fix — inject at both read sites, from the same original.** Markers are now injected (a) in `preRenderJayHtml` (feeds the pre-rendered file → hydrate) and (b) in `sendResponse` right after the original is read (→ SSR), both gated on `options.sourceEditing`. Both callers of `sendResponse` pass the original path and `injectDevMarkers` is deterministic + idempotent, so the two sides get identical `jay-dev-src` line ranges → **no hydration mismatch**. Accurate lines come for free (both derive from the original, not the slow-render re-serialization — which is exactly why the vite-plugin loader was rejected). ✅ verified live: `/foreach` SSR now carries `jay-dev-src` on every element and `jay-dev-item` resolved per record (`"s1"`, `"s2"`, `"f1"`…); post-hydration DOM carries the same markers.

**Wiring.** `sourceEditing` threads `.jay` `devServer.sourceEditing` → `config.ts` → `server.ts` → `mkDevServer` → `defaults()` → `preRenderJayHtml` / `sendResponse`. Enabled in `examples/jay-stack/smoke-test/.jay`.

**Inspector.** Implemented in `generate-client-script.ts` `buildFreezeScript`: `__jayResolveElement` / `__jayInspectPoint` / `__jayInspectRect` + an extended embed-mode `message` listener replying `jay:inspectResult`. Always present in embed mode (decided). Note: `dev-server` **bundles** `stack-server-build` at build time — rebuild dev-server after touching the inspector.

**Rect-rule change (decided → corrected during testing).** The design said "deepest candidate ≥ 0.8". Live testing showed a section-sized box then returns the section's _first child_. Changed to **largest element area among candidates with overlap/elementArea ≥ 0.8**: a tight box only clears the threshold for the small element; a big box clears it for the container, and largest-area returns the container. ✅ verified: box around `section.fast-section` → the `<section>` (not `li`); point on a `.slow-item` → that `<li>` with `item:"s1"`.

**Live example — `/what-is-this.html`.** `examples/jay-stack/smoke-test/public/what-is-this.html` (served same-origin): a page selector + an `<iframe>` with a transparent overlay that captures hover/drag, posts `jay:inspectPoint`/`jay:inspectRect` into the iframe, and renders the `jay:inspectResult` as a human summary + raw JSON, drawing the returned `rect` as a highlight. Smoke-test chosen over fake-shop — it has dedicated pages per case (foreach, headless region, nested, dynamic params, phases). Run: `cd examples/jay-stack/smoke-test && yarn dev`, open `http://localhost:3300/what-is-this.html`.

**Tests/regression.** A Playwright round-trip confirmed point + rect + record-id + region traversal + params across `/foreach`, `/headless`, `/dynamic/item-a`. All 711 `hydration.test.ts` tests still pass (markers off by default), compiler-jay-html 748 pass, all changed packages type-check.

### Stack scope — significant frames only (refinement)

Initial `stack` included every ancestor element (plain `<div>`/`<section>` wrappers and all). Refined to carry **only the semantically significant enclosing frames** — forEach item roots (`jay-dev-item` → record id) and region/headless boundaries (`display:contents` wrapper → `ref`) — innermost → outermost, each tagged `kind: 'forEach' | 'region'`. Rationale: those are the only frames that change what the agent edits (which record, which contract); the plain wrapper chain is noise the agent can reconstruct from the source file via `node.src`. Verified: list item → `stack: [{ tag:'ul', src:'10:12', item:'s1', kind:'forEach' }]`; a `<section>` outside any scope → `stack: []`.

### Final `InspectResult` shape — reconciled (supersedes the §1 sketch and the A3 draft)

The §1 original sketch (`file` / `lines:{from,to}` / `ancestors[]` with `kind`/`collection`/`name`/`props`/`condition`) and the first A3 implementation (`node.src` string / `stack` of `{tag,src,item,region,ref}`) had drifted apart. Settled, implemented shape:

```
InspectResult {
  file,                                                    // project-relative page jay-html path (where the lines live)
  route, routePattern,                                     // agent derives route params from these
  node: { lines: {from,to}, tag, html, rect, contentFromBinding? } | null,  // the clicked element: source loc, one-level html, on-screen box
  stack: [                                                 // significant enclosing scopes, innermost → outermost
    { kind: 'forEach', lines: {from,to}, itemId },         // itemId = runtime trackBy record id
    { kind: 'region',  lines: {from,to}, name, props? },   // name = contract; props = static primitive props
  ],
}
```

Decisions that shaped it:

- **`lines: {from,to}`** everywhere (was `src:"from:to"` string) — matches the §1 intent; the client parses the `jay-dev-src` attribute into the object.
- **`rect` lives under `node`** (was top-level) — it is the matched element's on-screen box, so it belongs with the element it describes.
- **`file` at top level** — the page's jay-html path (project-relative), threaded from the dev server (`sendResponse` / client-only path → `GenerateClientScriptOptions.sourceFile` → `buildFreezeScript`). All `node`/`stack` `lines` are in this file; the agent edits it. (`route`/`routePattern` stay too — the agent derives route params from them.)
- **Split runtime vs source fields** (as §1 intended): the reply carries what only the runtime knows — `itemId` (forEach record), region `name` + **static** `props` — and the line ranges. Everything else the agent reads from source at those lines: the `forEach` collection expression, bound prop expressions, `if` conditions, contract import resolution.
- **`if` frames dropped from the stack.** An `if` is conditional visibility, not a data-identity scope; it never changes which record/contract is edited. The clicked element still reports its own `lines`; the agent reads the `if` condition from source if needed.
- **`node.html` is the single content field (no `text`, no `attrs`).** A one-level rendering of the clicked element carries its tag, authored attributes (so `src`/`href`/`value` ride along), and inline text — bounded (grandchildren → empty tags, inner text truncated). It subsumes the former `text` and `attrs`; dropping them removes redundancy and caps payload for long content. See the bound-content section below for the full rationale.

✅ verified live: `/foreach` `.slow-item` → `file:"src/pages/foreach/page.jay-html"`, `node:{lines:{11,11},tag:'li',html:"<li class=\"slow-item\">Slow Item 1</li>",rect:{…}}`, `stack:[{kind:'forEach',lines:{10,12},itemId:'s1'}]`.

### Region identity in the stack (`name` + static `props`) — issue fix

A region only appeared in the stack when it had a `display:contents` wrapper, and even then carried no contract name or key. Two gaps fixed:

1. **Ref-less single-child regions had no wrapper** (DL#206 only wraps explicit-ref or multi-child), so `<jay:test-widget itemId="alpha">` produced no region frame at all. `assign-coordinates` now **also synthesizes the wrapper when a region dev-marker is present** (i.e. source-editing is on) — prod behavior unchanged (no marker → no extra wrap). The wrapper is `display:contents` (no layout effect) and both SSR + hydrate produce it, so no mismatch.
2. **No contract name / key.** `injectDevMarkers` now stamps `jay-dev-region="<contract>"` and `jay-dev-region-props="<url-encoded JSON of static props>"` on the `<jay:…>` tag; `assign-coordinates` moves both onto the wrapper (alongside `jay-dev-src`). The inspector reports `{ kind:'region', lines, name, props }`.
   - **Static props only.** Bound props (`itemId="{x}"`) are parent-scoped and can't resolve on the child-scoped wrapper (the Phase A2 wall) — they stay source-only; the agent reads the expression. Static props (`itemId="alpha"`) are the common identity case and are surfaced live.
   - **URL-encoded, not raw JSON.** A raw `{` in the attribute value makes the compiler treat it as a binding and run `doParse` on the JSON → `doParse is not a function` + SSR fallback. Caught live on `/headless`; fixed by `encodeURIComponent(JSON.stringify(props))` (client `JSON.parse(decodeURIComponent(...))`). `jay-dev-item="{trackBy}"` keeps its braces on purpose — that one _is_ meant to be a binding.

✅ verified live: `/headless` `.widget-label` → `node: span (15:15)`, `stack: [{ kind:'region', lines:{13,19}, name:'test-widget', props:{itemId:'alpha'} }]`. Unit tests added for both the region markers (`inject-dev-markers.test.ts`) and the ref-less wrap + marker move (`coordinate-preprocess.test.ts`); compiler-jay-html 750 pass.

#### Correction — the ref-less wrap broke nested-region coordinates; markers now ride the existing root

The "synthesize a wrapper for ref-less single-child regions" above was **wrong**: the extra `display:contents` level it added (only when `sourceEditing` is on) desynced SSR vs hydrate coordinates for **nested** regions — `/nested-composition` then threw `[jay hydration] adoptText coordinate "S2/0/0" not found in DOM` (the card region's scope gained a level on one target but not the other). ✅ reproduced: crashes with `sourceEditing` on, clean with it off.

**Revised (no new DOM level):** `assign-coordinates` no longer wraps ref-less regions. Region markers attach to the region's **existing** rendered root — the scope-anchor wrapper when one already exists (explicit-ref / multi-child, per DL#206), otherwise the single rendered child — via three attributes: `jay-dev-region` (name), `jay-dev-region-props` (static props), and **`jay-dev-region-src`** (the `<jay:…>` tag's line range, kept separate from the root element's own `jay-dev-src` since a ref-less region's child uses both). The inspector reads region-frame `lines` from `jay-dev-region-src`. Coordinates are now identical with and without source-editing → no hydration drift. ✅ verified live: `/nested-composition` hydrates clean with markers on (data threads through section→card→button); `/headless` still reports the `test-widget` region frame with `itemId:'alpha'`; hydration suite 711 pass.

### Pre-existing bug found (not DL#219) — `nested-composition` hydration

`/nested-composition` (4-level nested **passthrough** regions, `<jay:section>` → `<jay:card>` → `<jay:button>`) throws `compCreator is not a function` at `childComp` during client hydration. **Reproduces with `sourceEditing` off** (SSR renders, client hydrate crashes) — so it is independent of DL#219 (DL#196 passthrough-region territory). Flagged for a separate fix.

**Root-caused and fixed in [DL#221](221%20-%20html%20tag%20component%20name%20collision.md).** The component contracts are named `section`/`button`, which collide with the plain `<section>`/`<button>` HTML tags in the same template: `getComponentName`'s legacy bare-tag syntax matched them as components → `childComp(section, …)` where `section` is a `JayStackComponentDefinition`. Fix guards the legacy branch with `htmlElementTagNameMap`.

### Bound / html-string content — `node` = the clicked element + `contentFromBinding` + one-level `node.html`

A value rendered as rich HTML (`html-string`, e.g. `<div class="md">{post.content}</div>` from the markdown plugin) renders as **innerHTML**: the resulting `<h1>`/`<p>`/`<pre>`/`<span class="token …">` are generated at runtime and carry **no `jay-dev-src`** (only authored elements do).

**`node` describes the ACTUAL clicked element, not the source anchor.** `__jayResolveElement` splits two roles:

- **source anchor** = nearest ancestor (incl. the clicked el) with `jay-dev-src` → supplies `node.lines`.
- **node identity** (`tag`, `html`, `rect`) = the element the pointer actually hit (`elementFromPoint`) / the rect chose.

For authored content these coincide (the clicked element has its own `jay-dev-src`). For generated content they differ: clicking the `'hello'` token returns `node: { tag:'span', html:"<span class=\"token string\">'hello'</span>", lines:{18,18}, contentFromBinding:true }` — the clicked element, with lines pointing to the enclosing binding (the editable source). (An earlier version collapsed `node` to the binding container and listed the container's children — wrong: it then included **siblings** of what was clicked.)

- **`node.html` is the single content field** (replaced `text` and `attrs`). A one-level HTML of the clicked element: open tag with authored attrs (`jay-*` stripped, so `src`/`href`/`value` ride along), direct children as empty tags (grandchildren elided with `…`), inline text (truncated). It carries tag + attributes + value in one bounded string — so it subsumes the former always-present `text` and the `src/href/value` `attrs`, with no unbounded long-text payload. (`text` + `html` were redundant for the common leaf case; `html` dominates — it adds the tag/attrs `text` lacked.)
- **`contentFromBinding`** (client-side, no contract types): set when the clicked element has no `jay-dev-src` of its own, **or** when all its element children are unmarked (you clicked the binding container itself). Authored children always carry `jay-dev-src`, so authored content never trips it.

Decision rule for the agent: `contentFromBinding` → the content is a bound value; read the binding at `node.lines` (`{post.content}`) and resolve it to its source (here the markdown-pages plugin, keyed `post` → the `.md` file in `contentDir` by route param) rather than editing the rendered markup. Finer pixel→markdown-line mapping would need the plugin to emit its own source-map markers (out of scope).

✅ verified live: `/markdown/hello` click on the `'hello'` code token → `node.tag:'span'`, `node.html:"<span class=\"token string\">'hello'</span>"`, `contentFromBinding:true`, `lines:{18,18}`; authored `/foreach` `.slow-item` → `node.html:"<li class=\"slow-item\">Slow Item 1</li>"`, no flag, its own `lines:{11,11}`.
