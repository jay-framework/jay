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

| Mechanism                               | Verdict                                                           |
| --------------------------------------- | ---------------------------------------------------------------- |
| `jay-coordinate` (DL#103/#106/#126)     | DOM position only, conditionally emitted → insufficient alone    |
| `runtime-automation` `getPageState()`   | ViewState + refs only; no bound text/images → extend, not reuse  |
| Freeze postMessage (DL#128)             | **Reuse pattern** for the inspector                              |
| Plugin `actions[]` / `actions[].devOnly`| **Reuse** as the write/URL path and the dev-only gate            |
| `plugins-index.yaml` / agent-kit (#85)  | **Reuse** as the discovery channel for per-contract guides        |
| DL#215 (MCP/REST = plugin space)        | Constrains: no core MCP in v1                                    |

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

| Contract         | Record key (from inspect result) | guide instructs                          |
| ---------------- | -------------------------------- | ---------------------------------------- |
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
- **`jay-dev-props='{…}'`** on each region/headless instance root — the region's **primitive props** (string/number/boolean) as name→value, serialized.

### Regions have props, not a key

A region has zero-to-many data props, bound from parent values and possibly updated by interactive inputs; a prop may be any JS object (e.g. a coded region taking a product list). **Assumption: only primitive props are identities relevant to data editing** — so we stamp primitives only and skip objects/arrays. The region's name/import is read from source at its `jay-dev-src` lines; the runtime supplies the live primitive prop values (e.g. `{ "productId": "3" }`). Because props can change interactively, the stamped value must reflect the **current** value at inspect time — keeping it live is a how-detail (re-stamp on prop update, or read from the live component instance). ⚠️ revisit if a non-primitive prop is ever the only available identity.

### The full nested stack

`forEach` and regions nest arbitrarily and interleave, and the whole chain matters. The inspector **walks up the DOM** from `elementFromPoint`, collecting each ancestor's `jay-dev-src` (→ `lines`), `jay-dev-item` (→ `forEach` `itemId`), and `jay-dev-props` (→ region `props`), innermost → outermost, with no depth limit. Each level contributes its runtime identity; the agent reads each level's static role (collection / region name / `if` condition) from source at its `lines`.

### Client-only inspector; agent reads the fragment

Because the markers are self-contained, the inspector runs **entirely in the browser** — no AST at inspect time, no dev-server round-trip, no embedded source-map table: `elementFromPoint` → read `jay-dev-src` / walk up → measure `rect`/`scroll` → read `params` from the page's hydration JSON. The source fragment need not be shipped; `file` + `lines` locate it and the agent reads it from disk. Hence `node` is optional in `InspectResult`.

### Staleness

Markers drift only if source changes without a re-render; dev HMR re-renders on edit, so markers match the live source within any inspect→edit cycle. Dev-only, so the added attributes are acceptable noise.

## How — Part 2: Runtime / dev-server emission

Where each marker is stamped, per target. Two gates: a **compile-time dev flag** (threaded to the jay-html compilers / pre-render, precedent `GenerateClientScriptOptions.enableAutomation` "default true in dev" — `generate-client-script.ts:40-56`) and a **runtime global flag** set by the dev-server-injected script (e.g. `window.__JAY_DEV_MARKERS__`), for the two markers whose values are only known while rendering.

### `jay-dev-src` (line range) — compile-time, all targets via the template

`.range` is populated on every `node-html-parser` node (`node.d.ts:11`), **but** the markup that reaches `assignCoordinates` is frequently the slow-render **re-serialized** string (`slow-render-transform.ts:505/816/936`) — offsets there map to transformed markup (reordered attrs, synthesized `display:contents` wrappers at `assign-coordinates.ts:~239`), not the author's file. So lines captured at that stage would be wrong.

→ **Stamp `jay-dev-src` in a dev-only pre-pass on the raw on-disk `page.jay-html`, before any transform:** parse the raw source, convert each element's `.range` → `{from,to}` against the raw text, `setAttribute('jay-dev-src', 'from:to')`, re-serialize, feed downstream. Because offsets are taken against the raw file, the **values are correct on-disk lines**, and they ride through slow-render / `assignCoordinates` / all three compilers as an ordinary attribute (surviving nodes keep it; synthetic wrappers simply lack it).

✅ **Passthrough is free — no allowlist edit.** All three targets render attributes via a **deny-list** (`DIRECTIVE_ATTRIBUTES`, `jay-html-compiler-shared.ts:120-137`) plus a generic `else` that emits any remaining attribute verbatim: element `renderAttributes` else (`jay-html-compiler.ts:240-246`), server `renderServerAttributes` else (`jay-html-compiler-server.ts:460-476`, mirror `:721-733`), hydrate via SSR for adopted nodes (`renderDynamicAttributes` intentionally skips re-setting static attrs, `shared.ts:258-308`) and via `renderAttributes` for created forEach/if nodes. Since `jay-dev-*` are none of {directive, `class`, `style`, `propertyMapping` entry}, they hit the `else` and pass through unchanged. **The one rule: do NOT add `jay-dev-*` to `DIRECTIVE_ATTRIBUTES`** — that set is exactly why `jay-coordinate-base`/`jay-scope` are stripped-and-renamed to `jay-coordinate` (`shared.ts:248-260`, server open-tag `:386`); a dev attr wants the opposite (verbatim passthrough), so it just stays out of the set.

### `jay-dev-item` (trackBy value) — render-time, per target

trackBy is in scope at the item-root emission in all three targets:

- **element:** runtime `element.ts` `mkUpdateCollection` — item built at `:483` `child.elemCreator(item, id)` (`id` = trackBy); stamp on `created.dom` behind the runtime flag.
- **hydrate:** runtime `hydrate.ts` `hydrateForEach` — adopt path `itemDom` at `:530`, create path at `:607` (`id` = trackBy); stamp behind the runtime flag.
- **server (SSR string):** compiler `jay-html-compiler-server.ts` forEach branch — `trackByExpr` at `:164`, open tag at `:172` (`renderServerOpenTag` / coordinate append `:175-177`); inject `jay-dev-item="${itemVar}.${trackBy}"` into the open tag behind the compile flag.

(Alternative for element/hydrate: inject a dynamic attr `item[trackBy]` in the compiler `renderForEach`/`createBody` codegen instead of a runtime stamp. Runtime stamp is more central and keeps codegen untouched; chosen as primary.)

### `jay-dev-props` (primitive props) — render-time, per target

Props = `getProps(context.currData)`; instance root = `childComp.element.dom`. Serialize **primitives only** (skip objects/arrays) to JSON.

- **element:** runtime `element.ts` `childComp` — props at `:63`, root at `:91`; stamp on `childComp.element.dom` behind the runtime flag. Props are reactive here, so **re-stamp on update** to keep the value live (addresses the interactive-prop concern from How — Part 1).
- **hydrate:** runtime `hydrate.ts` `childCompHydrate` — props at `:685`, root at `:713`; same.
- **server (SSR string):** compiler `jay-html-compiler-server.ts` `renderServerHeadlessInstance` (`:209-316`, root-child open tag ~`:291-316`); emit a render-time snapshot behind the compile flag (client re-stamps on hydrate/update).

A small `primitivesOnly(props)` helper (new) is shared by the runtime sites; the compile site emits the equivalent for the known primitive inputs.

### Inspector + flag in the dev-server client script

The injected inline module script is the host — `generate-client-script.ts` `buildFreezeScript` (`:178-258`) / `buildAutomationWrap` (`:260`), reused by the SSR/hydrate page via `generate-ssr-response.ts` (`:581-602`). Embed gating (`_jay_embed` URL param → cookie, `__jayEmbedMode`) already lives there (`:183-186`). Add, alongside freeze: (a) set `window.__JAY_DEV_MARKERS__` when dev/embed, and (b) the `jay:inspectPoint` / `jay:inspectRect` handlers (fully client-side — walk `jay-dev-src`/`jay-dev-item`/`jay-dev-props`, measure `rect`/`scroll`, read `params`). Dev-server wiring that picks the target and injects per route: `dev-server.ts` (`generateClientScript` at `:1040/:1135`, `generateSSRPageHtml` at `:1106`).

### Summary of changes

| Marker          | element            | hydrate             | server (SSR)             | gate          |
| --------------- | ------------------ | ------------------- | ------------------------ | ------------- |
| `jay-dev-src`   | dev pre-pass (template-wide, all targets) |                     |                          | compile       |
| `jay-dev-item`  | `element.ts:483`   | `hydrate.ts:530/607`| compiler `server.ts:172` | runtime / compile |
| `jay-dev-props` | `element.ts:63/91` | `hydrate.ts:685/713`| compiler `server.ts:~291`| runtime / compile |

## Implementation Plan

Ordered so each phase is independently testable (compiler fixtures / runtime tests) before the inspector consumes it. **Part A** is this DL's scope (runtime / dev-server emission); **Part B** is the consumer side, mostly its own DLs.

### Part A — Runtime / dev-server emission

**Phase A1 — `jay-dev-src` compile-time pre-pass.**
- Add a dev-only pre-pass (`compiler-jay-html`) that parses the raw on-disk `page.jay-html`, converts each element's `.range` → `{from,to}` lines against the raw text, `setAttribute('jay-dev-src', 'from:to')`, re-serializes, and feeds the stamped string downstream — **before** slow-render / `assignCoordinates`, so offsets are on-disk-accurate.
- Thread a compile-time dev flag (precedent `enableAutomation`, `generate-client-script.ts:40-56`) to gate it; wire the call into the stack pre-render pipeline.
- No `DIRECTIVE_ATTRIBUTES` edit — passthrough is automatic (✅ confirmed). Add a guard test that would fail if `jay-dev-*` were ever added to that set.
- Fixtures (`toEqual` + `prettifyHtml`): element/hydrate/server dev output carries `jay-dev-src` on every source element; slow-resolved/removed branches leave surviving nodes with correct on-disk lines; synthetic `display:contents` wrappers carry none.

**Phase A2 — runtime stamps (`jay-dev-item`, `jay-dev-props`) for element + hydrate.**
- Add a runtime dev-marker flag accessor in `@jay-framework/runtime` (reads `window.__JAY_DEV_MARKERS__`); all stamps below are no-ops when false (prod-safe).
- `jay-dev-item`: stamp the trackBy id on the item root in `element.ts` `mkUpdateCollection` (`:483`) and `hydrate.ts` `hydrateForEach` adopt (`:530`) + create (`:607`).
- `jay-dev-props`: new shared `primitivesOnly(props)` helper; stamp `JSON.stringify(...)` on the instance root in `element.ts` `childComp` (`:63/:91`) and `hydrate.ts` `childCompHydrate` (`:685/:713`); **re-stamp on reactive update** so the value stays live across interactive prop changes.

**Phase A3 — server (SSR string) codegen for `jay-dev-item`, `jay-dev-props`.**
- Gated by the compile-time dev flag; emits a render-time snapshot (client re-stamps on hydrate/update).
- `jay-dev-item`: inject into the item-root open tag in `jay-html-compiler-server.ts` forEach branch (`:172`).
- `jay-dev-props`: inject primitive-props JSON into the instance-root open tag in `renderServerHeadlessInstance` (`~:291`).

**Phase A4 — dev-server flag + inspector host.**
- Set `window.__JAY_DEV_MARKERS__` in `buildFreezeScript` / `buildAutomationWrap` (`generate-client-script.ts:178-260`) when dev/embed; reuse the existing `_jay_embed` gating.
- Add `jay:inspectPoint` / `jay:inspectRect` postMessage handlers (fully client-side): `elementFromPoint` → read `jay-dev-src`, walk ancestors for `jay-dev-item`/`jay-dev-props`, measure `rect`/`scroll`, read `params`, implement the rect rule. No AST/source at inspect time.
- Wire per-target injection in `dev-server.ts` (`generateClientScript` `:1040/:1135`, `generateSSRPageHtml` `:1106`).

### Part B — Consumers (separate DLs / later)

**B1.** Per-contract editing guides + `devOnly` actions in the prototype plugin (`wix-stores`, own repo DL); agent-kit surfaces them via `plugins-index.yaml`.
**B2.** Coverage validation in `jay-stack validate` (stack-cli / plugin-validator): each contract has a guide or is `readonly`.
**B3.** Agent-kit guide `source-editing.md` (designer + plugin roles): the decision rule, region→contract resolution, guide discovery.
**B4.** Live example (onsko-shop): edit a product name via the guide's write action; deep link when the guide offers a URL action.
**B5.** Companion DL in the aiditor repo (marker → inspect → "Bound data" prompt block → confirm UI).

## Scope — not handled

Production-mode editing (dev only); rich-text field kinds (defer to the guide's prose); per-call auth/permissions on write actions (DL#215); Wix write actions themselves (wix repo DL); composed/computed bindings beyond returning the fragment (the agent reads all contributing bindings from `node`).

## Verification

- Compiler fixtures: dev output carries the node-identity marker + `forEach` ids across element/server/hydrate targets (`toEqual` + `prettifyHtml`).
- Dev-server tests: `jay:inspectPoint` and `jay:inspectRect` on text, image, `forEach` item, nested region — asserting `node`/`lines`/`ancestors`/`rect`/rect-rule results.
- Validation tests: a contract with no guide and no `readonly` fails; guide-only and `readonly` pass.
- Live: onsko-shop product name edited via guide action; deep link returned when the guide offers a URL action.

## Trade-offs

Dev-only markers add dev DOM noise for exact resolution. Moving editing into plugin guides + ordinary `devOnly` actions costs validation-of-internals (a guide is prose) but gains unbounded expressiveness (text/image/URL flows) with zero new framework surface. The rect rule's `0.8` threshold is a tunable constant.

## Claims

✅ verified: freeze postMessage pattern; `jay-coordinate` is source-positional, scoped per forEach/headless, and emitted conditionally (`assign-coordinates.ts`; fake-shop dev output); `actions[].devOnly` dev-only/prod-exclusion (`actions-guide.md:10-13`); `node-html-parser` nodes expose `range` offsets (`html.d.ts:65`); **attribute rendering is deny-list based — unknown attributes pass through verbatim on all three targets** (element `jay-html-compiler.ts:240-246`, server `jay-html-compiler-server.ts:460-476`, hydrate `shared.ts:258-308` + `renderAttributes`), so `jay-dev-*` reach output with no allowlist edit, provided they are NOT added to `DIRECTIVE_ATTRIBUTES` (`shared.ts:120-137`); the slow-render re-serialization caveat (`slow-render-transform.ts:505/816/936`) is the reason `jay-dev-src` is stamped in a raw-source pre-pass rather than from the coordinate pass.
⚠️ assumed (verify before implementing): `node-html-parser` `range` is populated under the pre-pass parse options (not currently read in our code); `forEach` trackBy value is reachable at the stamp sites (`element.ts:483`, `hydrate.ts:530/607`, server `:172`); region **primitive props** are a sufficient editing identity (non-primitive props excluded); region props can be re-stamped live on reactive update (`element.ts childComp`, `hydrate childCompHydrate`); `region.name` is read from source at the region's `jay-dev-src` lines for import resolution.
