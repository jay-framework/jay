# Design Log 92: Pillar 1 — Compute Styles

Companion: [Master Plan](../../jay-desktop-poc/docs/parallel-pillars-master-plan.md) | [Design Log 88](./88%20-%20variant%20style%20extraction%20for%20figma%20import.md) | [Playground/Variant Design (jay-desktop-poc)](../../jay-desktop-poc/docs/design-log/jay-playground-variant-style-extraction.md)

---

## Background

The dev server renders jay-html pages with real data from headless components (slow + fast render pipeline). There is no way to render a page with **custom data values** — you see whatever the services return. Elements behind false `if` conditions are invisible. `forEach` sections are empty when services return empty arrays.

Design Log 88 scoped the variant extraction piece for Figma import and deferred the playground. This design log covers the full Pillar 1: all three features — query param rendering, playground UI, and compute styles — as defined in the master plan.

### What Exists Today

| Component | File | Status |
|-----------|------|--------|
| Page route handler | `dev-server/lib/dev-server.ts` `mkRoute()` (line 154) | Parses `req.params` only. `req.query` available but unused for rendering. |
| ViewState merge | `dev-server.ts` `handleDirectRequest()` (line 652) | `deepMergeViewStates(slow, fast, trackByMap)` — merge point exists. |
| `VariantScenario` type | `stack-cli/.../computed-style-types.ts` | Defined with `id`, `contractValues`, `queryString`. |
| `generateVariantScenarios()` | `stack-cli/.../computed-style-enricher.ts` | Returns `[]`. Has `scanForIfAttributes()` but no scenario output. |
| `enrichWithComputedStyles()` | Same file | Playwright navigation loop exists. Iterates scenarios but gets `[]`. |
| `buildImportIR()` | `stack-cli/.../jay-html-to-import-ir.ts` | Looks up styles by `figmaId` or `buildDomPath()` key. |
| `/_jay/actions/*` | `dev-server/lib/action-router.ts` | Pattern for adding API endpoints via Vite middleware. |
| `/_jay/health`, `/_jay/shutdown` | `stack-cli/lib/server.ts` | Pattern for Express routes on the `app` object. |
| Contract parsing | `compiler-jay-html/lib/contract/` | Full contract parser — tags, dataTypes, headless imports. |
| Demo projects | `jay-desktop-poc/demo-projects/demo-3-all-features/` | Product page with `if`, `forEach`, headless plugin, refs. |

---

## Problem

Three capabilities are missing:

1. **No custom data rendering** — Developers, designers, and PMs cannot preview a page with specific values (e.g., product name = "Blue Sneaker", mediaType = VIDEO). You must wire up real data or see nothing.

2. **No interactive exploration** — There is no UI for toggling contract tags (boolean switches, enum dropdowns, text inputs) to see how variants, repeaters, and data bindings look with different states.

3. **No computed styles for variants** — The Figma import enricher renders only the default scenario. Elements behind false `if` conditions get no computed styles. Variant COMPONENT_SET nodes in Figma have incorrect or missing styles.

---

## Questions

**Q1: Does the Jay runtime update the DOM reactively when viewState changes?**

Yes — the runtime uses signals (`createSignal`) and dynamic attributes (`da()`). When the client-side viewState is patched, elements with dynamic bindings re-render. This means the playground can patch viewState in-place for live updates without full page reloads.

**Q2: Can we intercept viewState after slow/fast render and deep-merge overrides?**

Yes. In `handleDirectRequest()` (line 652–662), the merge point is:
```typescript
viewState = deepMergeViewStates(renderedSlowly.rendered, renderedFast.rendered, serverTrackByMap);
```
We can deep-merge query param overrides **after** this line, before `sendResponse()`. Same pattern for `handleCachedRequest()` and `handlePreRenderRequest()` — merge into the final viewState before sending.

**Q3: For `forEach` items, what sample data should the playground provide?**

Three sample items per repeater, with values derived from sub-tag names:
- String → `"Sample {tagName}"` (e.g., `"Sample label"`)
- Number → `42`
- Boolean → `true`
- Enum → first declared value

This gives repeaters visible content without requiring real service data.

**Q4: Playground route: `?_jay=playground` vs `/__playground/<route>`?**

`/__playground/<route>` (master plan convention). Reasons:
- Cleaner separation from normal page rendering
- The playground page is a full HTML page with an iframe — it's not an overlay on the existing page
- Follows the `/_jay/*` namespace convention already used for health, shutdown, actions
- Doesn't pollute page route query params

**Q5: Should the playground be a separate package or live in `dev-server`?**

Separate package: `packages/jay-stack/dev-playground/`.

The playground is the foundation of the **Jay developer tools UI** — a non-Figma interface for developers to interact with their Jay projects. The tag editor in Pillar 1 is the first tool; more tools will be added over time (diagnostics, contract explorer, route map, etc.). This growth trajectory justifies a dedicated package from day one — the packaging overhead (package.json, tsconfig.json, workspace registration) is amortized across a growing surface area.

Structure:
```
packages/jay-stack/dev-playground/
    lib/
        index.ts              — exports: createPlaygroundRoutes()
        playground-route.ts   — /__playground/* handler, registers internal jay-html page
        contract-api.ts       — /_jay/api/contract handler
    pages/
        playground/
            page.jay-html     — playground UI template (built with Jay)
            page.ts           — playground component (fetches contract data, handles refs)
            page.jay-contract — playground's own contract
            playground.css    — playground styles
    test/
        playground-route.test.ts
        contract-api.test.ts
    package.json
    tsconfig.json
```

Dependencies: `@jay-framework/compiler-jay-html` (parseContract), `express` (types). Route information and Vite instance passed in via factory function.

The `query-override.ts` (Feature 1) stays in `dev-server` — it modifies core request handling, not playground-specific.

**Q6: Should Features 1+2 branch from `main` instead of `import_from_jay_html`?**

Yes. Analysis of the branch divergence:

| Area | Divergence (main → import_from_jay_html) | Impact on Pillar 1 |
|------|------------------------------------------|---------------------|
| `dev-server.ts` | -196 lines, +15 lines (cleanup: removed forEach instance handling, global plugin logic) | Feature 1 touches the viewState merge point — identical pattern on both branches. Manageable merge. |
| `server.ts` | 7 lines (logging format) | Trivial — Feature 2 adds route registration lines. No conflict. |
| `figma/` vendor | **+4,138 lines** (16 new files) | Feature 3 ONLY — all enricher/IR/synthesizer files only exist on `import_from_jay_html`. |

**Decision: Split Pillar 1 into two tracks.**

```
Track A (from main):     Feature 1 (query param) + Feature 2 (playground)
                         → merge to main
                         → branch: pillar/compute-styles-devtools

Track B (from import_from_jay_html, rebased on main after Track A merges):
                         Feature 3 (compute styles for Figma import)
                         → stays on import_from_jay_html branch
                         → branch: pillar/compute-styles (as planned)
```

Why this is better:
1. **Features 1+2 ship to ALL developers immediately** — preview states, explore variants — regardless of the Figma import work.
2. **Smaller, cleaner PRs.** The `dev-playground` package is entirely new files — zero merge conflict risk on any branch.
3. **`import_from_jay_html` stays focused** on Figma import pipeline changes. It only picks up the `?_jay=variant` capability after rebasing on `main`.
4. **Feature 3 naturally uses Feature 1.** After `main` has `?_jay=variant`, the enricher on `import_from_jay_html` navigates to `?_jay=variant&tag=value` URLs — the dependency flows cleanly.

Risk: The `dev-server.ts` modification for Feature 1 (on `main`) and the cleanup changes on `import_from_jay_html` could conflict at rebase time. The conflict is at the `handleDirectRequest` function — localised and easy to resolve.

**Q7: Should the playground UI be built with Jay (the framework itself)?**

Yes. The playground's UI requirements map directly to Jay primitives:
- List of tag controls from contract data → `forEach="contractTags"`
- Different control per dataType → `if="dataType == boolean"`, `if="dataType == enum"`
- Form interactions → `ref="tagInput"`, `ref="resetButton"`
- Contract data as input → headless component that reads contracts from disk

Benefits:
1. **Dog-fooding** — If Jay can't build a dynamic, interactive tool like the playground, that exposes framework limitations worth fixing. If it can, the playground is a showcase.
2. **Exercises the full feature set** — the playground uses `forEach`, `if`, `ref`, headless components, data bindings. It IS the demo.
3. **Consistency** — everything else in the ecosystem is jay-html.

Technical requirement: **internal pages.** The dev server currently discovers pages by scanning `pagesRootFolder` (user's `src/pages/`). The playground page lives inside `dev-server/lib/playground/pages/`, not the user's project. The route handler must create a virtual `JayRoute` pointing to these files. This is feasible — `mkRoute()` works with any `JayRoute` object; the route scanner just generates them. The dev server can compile jay-html from any path Vite can see.

```typescript
const playgroundRoute: JayRoute = {
    jayHtmlPath: path.resolve(__dirname, 'playground/pages/playground/page.jay-html'),
    compPath: path.resolve(__dirname, 'playground/pages/playground/page.ts'),
    segments: ['__playground'],
    rawRoute: '/__playground/*',
    inferredParams: {},
};
```

---

## Design

### Feature 1: Query Param Data Injection (`?_jay=variant`)

**Trigger:** Any page request with `?_jay=variant` in the query string.

**Behavior:**
1. Dev server detects `_jay=variant` in `req.query`
2. Remaining query params are parsed as tag overrides: `?_jay=variant&product.name=Sneaker&product.mediaType=VIDEO`
3. Normal slow/fast render pipeline runs (services provide base data)
4. Override map is deep-merged into the final viewState:
   ```typescript
   // After slow+fast merge:
   viewState = deepMergeViewStates(slowVS, fastVS, trackByMap);
   // Apply overrides:
   viewState = applyQueryOverrides(viewState, req.query);
   ```
5. Page renders with overridden values. No panel injected — clean HTML.
6. When no `?_jay` param present, behavior is 100% unchanged.

**Override parsing rules:**
- Dotted paths map to nested objects: `product.name=Sneaker` → `{ product: { name: "Sneaker" } }`
- Boolean strings: `isSearching=true` → `true`, `hasResults=false` → `false`
- Numbers: `product.price=99` stays string (ViewState text bindings are strings)
- Arrays: `product.options=[{"id":"1","label":"Size","value":"M"}]` → JSON-parsed
- Missing tags fall back to the pipeline's original value (no crash)

**ViewState path mapping for headless components:**

The override insertion point is **after** the slow+fast merge (line 652) and **after** `__headlessInstances` are merged (line 665). At this point the viewState structure is:

```typescript
viewState = {
    // Page-contract tags (no key): top-level
    pageTag: "value",

    // Key-based headless (key="product"): nested under the key
    product: { name: "...", price: "...", mediaType: "IMAGE", options: [...] },

    // Instance-based headless (<jay:component>): nested under __headlessInstances
    __headlessInstances: { "componentName:0": { ... } },
}
```

The dotted-path scheme maps naturally:
- `product.name=Sneaker` → merges into `viewState.product.name` (key-based headless — **common case**)
- `pageTag=value` → merges into `viewState.pageTag` (page-contract tags)
- `__headlessInstances` tags are an edge case (explicit `<jay:component>` instances). These are not expected to be overridden via playground in Phase 2. If needed later, the override path would be `__headlessInstances.componentName:0.tag=value`.

**Caching interaction:**
- `?_jay=variant` requests should bypass the slow render cache (`dontCacheSlowly = true` for these requests) to ensure overrides apply to a fresh viewState
- Alternative: always use `handleDirectRequest` path when `_jay=variant` is present

**New function:**

```typescript
function applyQueryOverrides(
    viewState: object,
    query: Record<string, string>,
): object
```

Located in a new file: `dev-server/lib/query-override.ts`

### Feature 2: Developer Playground (`/__playground/<route>`)

**Architecture:**

```
GET /__playground/product
    │
    ▼
Express route: /__playground/*
    │
    ├─► Resolve page route from URL path ("/product")
    ├─► Load page contract + headless contracts (parseContract, loadPageParts)
    ├─► Extract all tags with dataType metadata
    │
    ▼
Serve playground HTML page:
    ┌──────────────────────────────────────────────────────────┐
    │  Playground Shell (full HTML page served by dev server)  │
    │                                                          │
    │  ┌──────────────────────────┐  ┌─────────────────────┐  │
    │  │                          │  │   Tag Editor Panel   │  │
    │  │   <iframe>               │  │                      │  │
    │  │   src="/product?         │  │  product.name: [___] │  │
    │  │     _jay=variant         │  │  product.price: [__] │  │
    │  │     &product.name=..."   │  │  mediaType: [▼ IMG]  │  │
    │  │                          │  │  options: [+ Add]    │  │
    │  │   (live page preview)    │  │                      │  │
    │  │                          │  │  [Reset to defaults] │  │
    │  └──────────────────────────┘  └─────────────────────┘  │
    └──────────────────────────────────────────────────────────┘
```

**How it works:**
1. `/__playground/*` route registered on the Express app (in `server.ts`, alongside `/_jay/health`)
2. Route handler resolves the page path, loads contracts, extracts tags
3. Returns a self-contained HTML page with:
   - Left: `<iframe>` pointing to the real page with `?_jay=variant&...` params
   - Right: Tag editor panel with inputs generated from contract metadata
4. Client-side JS: when a tag value changes, update the iframe `src` with new query params → iframe reloads with new data
5. Contract data served via API: `GET /_jay/api/contract?page=/product`

**Tag editor controls by dataType:**

| dataType | Control | Default Value |
|----------|---------|---------------|
| `string` | Text input | `"Sample {tagName}"` |
| `number` | Number input | `42` |
| `boolean` | Toggle switch | `false` |
| `enum (A \| B \| C)` | Dropdown | First value |
| Array (forEach) | List editor with add/remove | 3 sample items |
| `Date` | Date input | `"2025-01-01"` |

**Contract API endpoint:**

```
GET /_jay/api/contract?page=/product
→ {
    pageName: "product",
    tags: [
      { path: "product.name", dataType: "string", source: "headless:product" },
      { path: "product.price", dataType: "string", source: "headless:product" },
      { path: "product.mediaType", dataType: "enum (IMAGE | VIDEO)", source: "headless:product" },
      { path: "product.options", dataType: "array", subTags: [...], source: "headless:product" },
    ],
    refs: ["addToCart", "toggleMedia"],
  }
```

**Playground UI implementation — built with Jay (see Q7):**

The playground page is a jay-html page living inside the dev-server package at `lib/playground/pages/playground/`. It uses a headless component for contract data and refs for interactivity.

```html
<!-- page.jay-html (simplified) -->
<html>
<head>
  <script type="application/jay-data" contract="./page.jay-contract"></script>
  <script type="application/jay-headless"
          plugin="playground-data"
          contract="playground"
          key="playground"></script>
  <link rel="stylesheet" href="./playground.css" />
</head>
<body>
  <div class="playground-shell">
    <iframe ref="preview" src="{playground.previewUrl}" class="playground-preview"></iframe>
    <div class="playground-panel">
      <h2>Contract Tags</h2>
      <div forEach="playground.tags" trackBy="path">
        <div if="dataType == string" class="tag-control">
          <label>{path}</label>
          <input ref="tagInput" type="text" value="{defaultValue}" data-path="{path}" />
        </div>
        <div if="dataType == boolean" class="tag-control">
          <label>{path}</label>
          <input ref="tagToggle" type="checkbox" data-path="{path}" />
        </div>
        <div if="dataType == enum" class="tag-control">
          <label>{path}</label>
          <select ref="tagSelect" data-path="{path}">
            <option forEach="enumValues" trackBy="value" value="{value}">{value}</option>
          </select>
        </div>
      </div>
      <div ref="resetButton" class="reset-button">Reset to defaults</div>
    </div>
  </div>
</body>
</html>
```

The headless component (`playground-data`) reads contracts from disk and returns tags with metadata as viewState. The client-side component listens to ref events and updates the iframe `src` with new `?_jay=variant&...` query params.

**Package boundary:**
- Lives in `packages/jay-stack/dev-playground/` (see Q5) — a dedicated package that will grow into the main Jay developer tools UI
- Exports a factory: `createPlaygroundRoutes(routeTable, pagesRootFolder, projectRootFolder, vite)` → returns Express handlers
- `stack-cli/lib/server.ts` imports from `@jay-framework/dev-playground` and registers routes
- Vite compiles the playground's jay-html on-the-fly, same as user pages
- The `query-override.ts` (Feature 1) stays in `dev-server` — different concern, different package

### Feature 3: Compute Styles for Figma Import

**This feature connects Features 1 and 2 to the Figma import pipeline.**

**Flow:**

```
Figma Import triggered (editor-server onImport handler)
    │
    ▼
convertFromJayHtml() (figma/index.ts)
    │
    ├─► generateVariantScenarios(bodyDom, contract, 12)
    │       → [default, mediaType=IMAGE, mediaType=VIDEO, ...]
    │
    ├─► enrichWithComputedStyles({ pageRoute, devServerUrl, scenarios })
    │       │
    │       └─► For each scenario:
    │           page.goto("/product?_jay=variant&mediaType=IMAGE")
    │           → extractComputedStyles(page, scenario.id)
    │           → ComputedStyleMap keyed by element DOM path
    │
    ├─► Merge all scenario ComputedStyleMaps
    │
    └─► buildImportIR(body, url, name, { computedStyleMap })
            │
            └─► resolveStyle(inline, classes, css, enrichedStyles)
                → Enriched styles override static CSS
```

**Scenario generation (implementing the stub):**

```typescript
function generateVariantScenarios(
    bodyDom: HTMLElement,
    pageContract: Contract | undefined,
    maxScenarios: number = 12,
): VariantScenario[] {
    // 1. Scan all `if` attributes from the DOM
    const ifConditions = scanForIfAttributes(bodyDom);

    // 2. Extract unique tag paths and their value sets
    //    "product.mediaType == IMAGE" → { path: "product.mediaType", values: ["IMAGE", "VIDEO"] }
    //    Boolean conditions → { path: "isSearching", values: [true, false] }

    // 3. Generate one scenario per unique value (linear, not combinatorial)
    //    Bounded by maxScenarios

    // 4. Return scenarios with queryString format
}
```

**Key matching strategy (from Design Log 88):**

Start with class-path matching (Option B). Zero compiler changes. Handles ~90% of elements. The enricher generates keys from `tag.className` chains in the browser. The IR builder generates matching keys from the source DOM.

**Style merging across scenarios:**
- Each scenario produces a `ComputedStyleMap`
- Merge strategy: for each element, use styles from the scenario where it is **visible** (`display !== "none"`)
- The variant-synthesizer receives per-scenario maps to assign correct styles per Figma variant

---

## File-Level Change List

### Track A: from `main` branch (Features 1 + 2)

#### dev-server package (Feature 1 — query param rendering)

| # | File | Change |
|---|------|--------|
| 1 | `packages/jay-stack/dev-server/lib/dev-server.ts` | **Modify**: detect `?_jay=variant` in `mkRoute` handler; bypass slow cache; apply overrides before `sendResponse()`. ~30 lines added. |
| 2 | `packages/jay-stack/dev-server/lib/query-override.ts` | **New**: `applyQueryOverrides(viewState, query)` — parse dotted paths, booleans, arrays; deep-merge into viewState. |
| 3 | `packages/jay-stack/dev-server/lib/index.ts` | **Modify**: export `applyQueryOverrides` if needed externally. |
| 4 | `packages/jay-stack/dev-server/test/query-override.test.ts` | **New**: unit tests for override parsing. |

#### dev-playground package (Feature 2 — playground UI) — **NEW PACKAGE**

| # | File | Change |
|---|------|--------|
| 5 | `packages/jay-stack/dev-playground/package.json` | **New**: package manifest. Deps: `@jay-framework/compiler-jay-html`, `express` (types). |
| 6 | `packages/jay-stack/dev-playground/tsconfig.json` | **New**: TypeScript config (follows existing package pattern). |
| 7 | `packages/jay-stack/dev-playground/lib/index.ts` | **New**: exports `createPlaygroundRoutes()` factory. |
| 8 | `packages/jay-stack/dev-playground/lib/playground-route.ts` | **New**: `/__playground/*` handler — creates virtual JayRoute, compiles jay-html, serves page. |
| 9 | `packages/jay-stack/dev-playground/lib/contract-api.ts` | **New**: `/_jay/api/contract?page=` handler — returns tags with dataType, source, subTags. |
| 10 | `packages/jay-stack/dev-playground/pages/playground/page.jay-html` | **New**: playground UI template — two-panel layout with iframe and tag editor, built with Jay. |
| 11 | `packages/jay-stack/dev-playground/pages/playground/page.ts` | **New**: playground component — headless contract data fetcher + client-side ref handlers for iframe URL updates. |
| 12 | `packages/jay-stack/dev-playground/pages/playground/page.jay-contract` | **New**: playground's own contract (target page route, etc.). |
| 13 | `packages/jay-stack/dev-playground/pages/playground/playground.css` | **New**: playground styles (two-panel layout, tag editor controls). |
| 14 | `packages/jay-stack/dev-playground/test/playground-route.test.ts` | **New**: tests for playground route and contract API. |

#### stack-cli (route registration)

| # | File | Change |
|---|------|--------|
| 15 | `packages/jay-stack/stack-cli/lib/server.ts` | **Modify**: import `createPlaygroundRoutes` from `@jay-framework/dev-playground`; register routes on `app`. ~10 lines added. |
| 16 | `packages/jay-stack/stack-cli/package.json` | **Modify**: add `@jay-framework/dev-playground` dependency. |

### Track B: from `import_from_jay_html` branch (Feature 3, after rebase on main)

| # | File | Change |
|---|------|--------|
| 17 | `packages/jay-stack/stack-cli/lib/vendors/figma/computed-style-enricher.ts` | **Modify**: implement `generateVariantScenarios()` — parse `if` conditions, generate bounded scenario list. Update scenario navigation to use `?_jay=variant` URLs. |
| 18 | `packages/jay-stack/stack-cli/lib/vendors/figma/id-generator.ts` | **Modify**: add `buildClassPath()` for class-path key matching. |
| 19 | `packages/jay-stack/stack-cli/lib/vendors/figma/jay-html-to-import-ir.ts` | **Modify**: look up styles by class-path key in addition to domPath/figmaId. |
| 20 | `packages/jay-stack/stack-cli/lib/vendors/figma/variant-synthesizer.ts` | **Modify**: accept per-scenario style maps; assign correct styles per variant. |
| 21 | `packages/jay-stack/stack-cli/test/vendors/figma/computed-style-enricher.test.ts` | **New or Modify**: tests for scenario generation, class-path matching. |

### Files NOT Changed (explicit out-of-scope)

| File | Why Not |
|------|---------|
| `compiler-jay-html/lib/jay-target/jay-html-compiler.ts` | No `data-jay-src` injection (using class-path matching instead). Deferred per Design Log 88. |
| `NewPluginIn/JayFrameworkPlugin/*` | No Figma plugin UI changes in Pillar 1. |
| `editor-protocol/` | No new protocol messages in Pillar 1. |
| `editor-server/` | Import handler already calls `convertFromJayHtml()` which calls the enricher. No new handler code. |

---

## Implementation Plan

### Track A: Developer Tools (from `main` branch)

**Branch:** `pillar/compute-styles-devtools` (forked from `main`)
**Repos:** jay only (no jay-desktop-poc changes)

#### Phase 1: Query Param Rendering → Demo P1-1

**Goal:** `?_jay=variant&tag=value` renders the page with overridden values.

**Steps:**

1. **Create `dev-server/lib/query-override.ts`** — `applyQueryOverrides(viewState, query)` function
   - Parse dotted paths into nested objects
   - Handle booleans (`"true"` → `true`), JSON arrays, strings
   - Deep-merge into viewState (non-destructive; missing params keep pipeline values)

2. **Modify `dev-server.ts` `mkRoute` handler** — detect `_jay=variant` in `req.query`
   - If present: force `handleDirectRequest` path (skip slow cache)
   - In `handleDirectRequest`: after viewState merge (line 662), call `applyQueryOverrides(viewState, req.query)`
   - Strip `_jay` from the override map (it's the mode flag, not a tag)

3. **Write tests for `query-override.ts`**
   - Dotted path expansion: `product.name=X` → `{ product: { name: "X" } }`
   - Boolean coercion: `isSearching=true` → `true`
   - Array override: `options=[{...}]` → parsed array
   - Missing tags: viewState unchanged
   - Nested headless keys: `product.mediaType=VIDEO` under headless prefix

4. **Test with demo-3-all-features**
   - `http://localhost:3000/product?_jay=variant&product.name=Blue+Sneaker&product.price=$99`
   - `http://localhost:3000/product?_jay=variant&product.mediaType=VIDEO`

**Demo P1-1 Exit Criteria** (from master plan):
- [ ] String data values render via query params
- [ ] Attribute bindings (`src="{imageUrl}"`) resolve with query param values
- [ ] Variant conditions (`if="product.mediaType == VIDEO"`) evaluate correctly
- [ ] Repeater data can be passed (JSON array format)
- [ ] Missing query params fall back to template placeholder (no crash)
- [ ] Existing dev server behavior unchanged when no query params present

> **Master plan delta:** The master plan demo script shows bare query params (`/product?product.name=...`). This design adds the `_jay=variant` trigger flag (`/product?_jay=variant&product.name=...`) to ensure zero behavior change on existing URLs. The master plan demo script should be updated to include the flag. Not a blocker — the flag is the right design choice.

**Estimated effort:** 1.5 days

---

#### Phase 2: Developer Playground → Demo P1-2

**Goal:** `/__playground/product` serves an interactive UI for exploring data states.

**Steps:**

1. **Create `dev-playground` package** — `packages/jay-stack/dev-playground/`
   - `package.json` with deps: `@jay-framework/compiler-jay-html`, `express` (types)
   - `tsconfig.json` following existing package pattern

2. **Create `contract-api.ts`** — `GET /_jay/api/contract?page=/product`
   - Load page's contract file (`page.jay-contract`)
   - Load headless plugin contracts (parse jay-html for `<script type="application/jay-headless">` tags, resolve their contracts)
   - Return JSON: `{ pageName, tags: [...], refs: [...] }`
   - Each tag: `{ path, dataType, source, subTags? }`

3. **Create the playground jay-html page** — `pages/playground/`
   - `page.jay-contract` — defines the playground's own data shape (target page route, contract tags array)
   - `page.ts` — headless component: receives target page route as prop, calls contract API, returns tags as viewState. Client-side component: ref handlers for form inputs, rebuilds iframe `src` on value change.
   - `page.jay-html` — two-panel layout using `forEach` for tag controls, `if` for control type switching, `ref` for interactivity (see Design section for template)
   - `playground.css` — styles for the two-panel layout and tag editor controls

4. **Create `playground-route.ts`** — internal page registration
   - Create a virtual `JayRoute` pointing to the playground's jay-html and page.ts
   - Parse target page route from URL (e.g., `/__playground/product` → `/product`)
   - Verify target page exists in route table
   - Use `mkRoute` machinery to compile and serve the playground page via Vite
   - Pass target page route as a page param so the headless component knows which contracts to load

5. **Create factory `index.ts`**
   ```typescript
   export function createPlaygroundRoutes(options: {
       routeTable: DevServerRoute[];
       pagesRootFolder: string;
       projectRootFolder: string;
       vite: ViteDevServer;
   }): { playgroundHandler: RequestHandler; contractApiHandler: RequestHandler }
   ```

6. **Register routes in `stack-cli/lib/server.ts`**
   - Import `createPlaygroundRoutes` from `@jay-framework/dev-playground`
   - `app.get('/_jay/api/contract', contractApiHandler)`
   - `app.get('/__playground/*', playgroundRouteHandler)`
   - Register **before** page routes

7. **Write tests**
   - Contract API returns correct tags for demo-3 product page
   - Playground route compiles and serves the jay-html page
   - Playground renders correct controls by dataType (forEach + if)
   - Iframe src updates when form values change

**Demo P1-2 Exit Criteria** (from master plan):
- [ ] Playground page auto-discovers all contract tags (data, variant, repeater)
- [ ] Text inputs for string tags, number inputs for number tags
- [ ] Dropdown for variant tags showing possible values
- [ ] Array editor for repeater tags with add/remove
- [ ] Live preview updates when any value changes (iframe src update)
- [ ] Reset button restores defaults
- [ ] Works with page-contract-only pages AND headless-plugin pages
- [ ] Playground URL follows `/__playground/<page-route>` convention
- [ ] No changes to existing page rendering

**Estimated effort:** 2–3 days

**After Phase 2:** Merge `pillar/compute-styles-devtools` → `main`. Then rebase `import_from_jay_html` on `main`.

---

### Track B: Compute Styles for Import (from `import_from_jay_html`, after rebase)

**Branch:** `pillar/compute-styles` (forked from `import_from_jay_html` after rebase on `main`)
**Prerequisite:** Track A merged to `main`, `import_from_jay_html` rebased.

#### Phase 3: Compute Styles for Import → Demo P1-3

**Goal:** The enricher renders multiple variant scenarios and produces accurate per-variant computed styles.

**Steps:**

1. **Implement `generateVariantScenarios()` in `computed-style-enricher.ts`**
   - Scan `if` attributes from the DOM (existing `scanForIfAttributes()`)
   - Parse conditions via `tokenizeCondition()` (existing in `condition-tokenizer.ts`)
   - For each unique tag path, collect all compared values
   - Also check contract tags: boolean → `[true, false]`, enum → parse enum values
   - Generate one scenario per value (linear): `{ id, contractValues, queryString }`
   - Append `_jay=variant` to each queryString
   - Bound by `maxScenarios` (default 12)

2. **Update `enrichWithComputedStyles()` scenario navigation**
   - Currently: `page.goto(devServerUrl + pageRoute + scenario.queryString)`
   - Update: ensure queryString includes `?_jay=variant&` prefix
   - Add `waitUntil: 'networkidle'` (already present)
   - Store scenario `id` alongside each element's styles for per-variant assignment

3. **Implement class-path key matching in `id-generator.ts`**
   - New function: `buildClassPath(element, root)` → `div.product-card > div.media-section > img`
   - Used in both browser extraction and IR builder
   - Fallback to index-based `buildDomPath()` when element has no classes

4. **Update `jay-html-to-import-ir.ts` style lookup**
   - Try class-path key first, then domPath, then figmaId
   - Log when class-path produces a match that domPath wouldn't have

5. **Update `variant-synthesizer.ts` for per-scenario styles**
   - Accept `Map<scenarioId, ComputedStyleMap>` instead of single `ComputedStyleMap`
   - When building variant components, use the scenario-specific styles for each variant branch

6. **Write tests**
   - Scenario generation from boolean/enum contract tags
   - Class-path key generation and matching
   - Style merge across scenarios (visible element wins over hidden)

**Demo P1-3 Exit Criteria** (from master plan):
- [ ] Compute function renders page with headless browser for each variant scenario
- [ ] Computed styles extracted for all visible elements
- [ ] Variant scenarios auto-discovered from contract
- [ ] Results integrated into Import IR
- [ ] Performance: ≤5s for simple pages, ≤30s for complex pages
- [ ] Graceful fallback: if headless browser unavailable, static CSS still works
- [ ] All existing import tests pass (no regression)
- [ ] ~~Demo 5 (Wix Store) import fidelity improves measurably~~ — **Deferred.** Requires the wix-stores example project (Pillar 4) to be set up. Will be validated when Pillar 4 demos are available. Tracked as a cross-pillar integration check.

**Estimated effort:** 2–3 days

---

## Examples

### Developer browses playground

```
http://localhost:3000/__playground/product
```

```
┌──────────────────────────────────┬─────────────────────────┐
│                                  │  📋 Contract Tags       │
│  ┌────────────────────────────┐  │                         │
│  │  [iframe: /product?       │  │  product.name           │
│  │   _jay=variant             │  │  [Blue Sneaker_______]  │
│  │   &product.name=...]       │  │                         │
│  │                            │  │  product.price          │
│  │  Blue Sneaker    $99       │  │  [$99________________]  │
│  │                            │  │                         │
│  │  ┌────────────────────┐   │  │  product.mediaType      │
│  │  │  [product image]   │   │  │  [▼ IMAGE           ]   │
│  │  └────────────────────┘   │  │                         │
│  │                            │  │  product.options (×3)   │
│  │  SPECIFICATIONS            │  │  ┌ id: 1, label: Size  │
│  │  Size .......... M         │  │  │ value: M             │
│  │  Color ......... Blue      │  │  ├ id: 2, label: Color │
│  │  Material ...... Leather   │  │  │ value: Blue          │
│  │                            │  │  ├ [+ Add item]        │
│  │  [Add to Cart] [Toggle]   │  │  └─────────────────     │
│  └────────────────────────────┘  │                         │
│                                  │  [Reset to defaults]    │
└──────────────────────────────────┴─────────────────────────┘
```

Toggling `product.mediaType` to VIDEO:
- Iframe src updates to `?_jay=variant&product.name=Blue+Sneaker&...&product.mediaType=VIDEO`
- Iframe reloads → VIDEO variant visible (dark background with PLAY button)

### Playwright extracts variant styles

```typescript
// Scenario 1: default state
page.goto('http://localhost:3000/product?_jay=variant')
// → IMAGE variant visible (if product.mediaType defaults to IMAGE)

// Scenario 2: VIDEO variant
page.goto('http://localhost:3000/product?_jay=variant&product.mediaType=VIDEO')
// → VIDEO variant visible, IMAGE variant hidden

// Each scenario: extract styles for all visible elements
// Merge: element gets styles from the scenario where it's display !== "none"
```

### Query param rendering

```
# Default: page renders with service data (unchanged behavior)
http://localhost:3000/product

# Override name and price
http://localhost:3000/product?_jay=variant&product.name=Limited+Edition&product.price=$199

# Force VIDEO variant
http://localhost:3000/product?_jay=variant&product.mediaType=VIDEO

# Inject repeater data
http://localhost:3000/product?_jay=variant&product.options=[{"id":"1","label":"Size","value":"XL"},{"id":"2","label":"Color","value":"Red"}]
```

---

## Trade-offs

| Decision | Chosen | Alternative | Why |
|----------|--------|-------------|-----|
| Playground location | Separate `dev-playground` package | Subdirectory `dev-server/lib/playground/` | The playground is the seed of the Jay developer tools UI — more tools will be added beyond the tag editor (diagnostics, contract explorer, route map, etc.). Packaging overhead is justified by this growth trajectory. |
| Branch strategy | Split: F1+F2 from `main`, F3 from `import_from_jay_html` | All from `import_from_jay_html` | F1+F2 have zero dependency on the 4,138 lines of figma vendor code. Ships dev tools to all developers faster. Smaller PRs. Feature 3 naturally uses Feature 1 after rebase. |
| Playground route | `/__playground/<route>` | `?_jay=playground` (query param) | Cleaner separation; playground is a full page, not an overlay. Follows `/_jay/*` convention. |
| Playground implementation | Jay-html page (dog-fooding) | Vanilla HTML string template | The playground exercises forEach, if, ref, headless components — exactly the features Pillar 1 showcases. Dog-fooding validates the framework and keeps the codebase consistent. Requires "internal page" mechanism (virtual JayRoute). |
| Preview mechanism | iframe + query param reload | Live viewState patching via postMessage | iframe reload is simpler, guaranteed correct (uses real render pipeline). Future: optimize with postMessage for instant updates. |
| Key matching (F3) | Class-path matching (Option B) | Compiler `data-jay-src` (Option A) | Zero compiler changes. Handles 90% of elements. Can upgrade to Option A later if needed. |
| Scenario strategy | One per value (linear) | All combinations (exponential) | 5 booleans = 10 scenarios (linear) vs 32 (exponential). Linear is sufficient for style capture. |
| Override target | Final merged viewState | Slow-phase viewState only | Final merge point gives overrides the last word. Services can still provide base data for tags not overridden. |
| Cache bypass for variant mode | Skip slow render cache | Invalidate cache per override | Simpler — variant mode is dev/import tool, not hot path. No cache management overhead. |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ViewState override doesn't reach `if` evaluation | Medium | High — variants won't switch | Test with demo-3 product page `if="product.mediaType == VIDEO"` immediately. If the runtime evaluates `if` from the initial viewState and overrides come too late, we need to move the override earlier in the pipeline. |
| Class-path matching doesn't cover enough elements | Low | Medium — some elements get no enriched styles | Track match rate in logs. If <80%, implement `data-jay-src` compiler injection (Option A from Design Log 88). |
| Playground iframe reload latency | Medium | Low — dev tool, not UX-critical | Phase 2 uses iframe reload. Future: upgrade to postMessage viewState patching for instant updates. |
| Contract API misses headless plugin tags | Low | Medium — playground shows incomplete tags | `loadPageParts()` already discovers headless imports. Reuse that logic. |
| Enricher performance with 12 scenarios | Low | Medium — slow imports | Playwright is already the bottleneck. 12 navigations add ~12s at 1s/navigation. Bounded by `maxScenarios`. |
| Vite can't compile playground jay-html from dev-playground package | Low | Medium — playground won't render | Vite's `server.fs.allow` includes `node_modules` by default. The playground package is within the monorepo. If needed, add the package path to `server.fs.allow` explicitly. Validate early in Phase 2. |
| Internal page mechanism breaks normal page serving | Low | High — regression | The playground uses a virtual JayRoute — additive, never modifies the route scanner or existing page handling. Test that user pages still work after playground registration. |
