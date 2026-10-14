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
  node:   "<jay-html of the matched element + ~1 level of children>",  // SOURCE, not rendered DOM
  ancestors: [                      // innermost → outermost; only semantic wrappers
    { kind: "forEach", collection: "{products}", itemId: "sku-123" },
    { kind: "if",      condition:  "{isOnSale}" },
    { kind: "region",  name: "jay:card" },   // the tag as written; resolve via import
  ],
  params,                           // route params of the current page
  // rect results only:
  containment: "full" | "partial",  // "full" = wholly inside the rect
  coverage:    0..1,                // self-coverage: area(el ∩ rect) / area(el)
}
```

- `node` is the **source** fragment (expressions, `if`, `forEach` intact) — the DOM has lost them. `lines` index into `file`.
- `ancestors` carries only `forEach` / `if` / `region`; plain layout is elided. `forEach` `itemId`s come from live ViewState (the one runtime-data marker). `region.name` is the tag as written — resolved by the agent, not the runtime (see §2).

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

## Implementation Plan

1. Dev-mode **node-identity marker** (DOM element → source node) across element/hydrate/server targets, plus `forEach` `itemId` capture on rendered list items.
2. **Inspector** in the client script (embed mode only): slice the parsed jay-html for `node`/`lines`, walk ancestors, measure `rect`/`scroll`, implement the rect rule. (⚠️ verify the dev server retains the jay-html AST/source to slice.)
3. **Per-contract editing guides** + `devOnly` actions in the prototype plugin (`wix-stores`, own repo DL); agent-kit surfaces them via `plugins-index.yaml`.
4. **Coverage validation** in `jay-stack validate` (stack-cli / plugin-validator).
5. Agent-kit guide `source-editing.md` (designer + plugin roles): the decision rule, region→contract resolution, guide discovery.
6. Live example (onsko-shop): edit a product name via the guide's write action; get the deep link when the guide offers a URL action.
7. Companion DL in the aiditor repo (marker → inspect → "Bound data" prompt block → confirm UI).

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

✅ verified: freeze postMessage pattern; conditional `jay-coordinate`; `actions[].devOnly` dev-only/prod-exclusion (`actions-guide.md:10-13`).
⚠️ assumed (verify before implementing): `forEach` `itemId` recoverable from live list items in dev; hydrate target can carry the node-identity marker; dev server retains the jay-html AST/source to slice fragments; `region.name` is the right field exposed by regions for import resolution.
