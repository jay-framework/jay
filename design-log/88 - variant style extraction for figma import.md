# Design Log 88: Variant Style Extraction for Figma Import

## Background

The Figma import pipeline extracts computed CSS styles for each element using Playwright. Currently it operates in "direct HTML mode" — rendering the raw jay-html via `page.setContent()` with the page's CSS. This captures styles for all elements in their default state.

The enricher has a `VariantScenario` type and a `generateVariantScenarios()` stub that returns `[]`. The variant-synthesizer converts `if` elements to Figma COMPONENT_SET variants structurally, but those variants have no computed styles.

Related: `jay-desktop-poc/docs/design-log/jay-playground-variant-style-extraction.md` (original broader design — playground deferred to separate design)

## Problem

1. **Single scenario** — Only the default state is rendered. Elements behind `if` conditions that are false in the default state get styles from the CSS file, but those styles may not reflect their intended visible state (e.g., a loading overlay that should be `display: flex` when active is never rendered that way).
2. **No variant-specific styles** — When the variant-synthesizer creates Figma variants for `if` conditions, each variant needs the correct styles for its state. Currently all variants get the same default styles.
3. **ForEach sections need data** — `forEach` repeaters render as a single template element in direct HTML mode. The dev server with real data would show actual repeated items with computed layout.

## Questions

**Q1: Can the dev server's viewState be overridden via query params?**

The dev server passes `req.originalUrl` (including query params) as `pageProps.url` into the render pipeline. `pageParams` comes from `req.params` only. Need to verify: can we intercept after the slow/fast render and deep-merge overrides into the viewState before sending the response?

**Q2: Does the Jay runtime update the DOM reactively when viewState changes?**

Affects whether variant rendering requires full page reloads or can patch values in-place. For Playwright extraction, page reloads are fine — this question only matters for a future interactive playground (out of scope here).

## Design

### Approach: Dev Server Variant Mode

Add a `?_jay=variant` query param mode to the dev server. When present, the dev server renders the page with viewState overrides from query params. Playwright navigates to each scenario URL, extracts styles, and merges them.

```
Enricher                          Dev Server
   │                                  │
   │  GET /products?_jay=variant      │
   │─────────────────────────────────>│  render with default viewState
   │  <── styles for default ─────────│
   │                                  │
   │  GET /products?_jay=variant      │
   │      &isSearching=true           │
   │─────────────────────────────────>│  render with isSearching=true
   │  <── styles for searching ───────│
   │                                  │
   │  (merge all scenario styles)     │
```

### Element Key Matching

**Start with Option B (class-path matching):**

- In the browser, key each element by its class chain: `div.collection-page > header.site-header > nav`
- In the IR builder, generate the same key from the source DOM
- Handles ~90% of elements (those with classes). Falls back to index-based for classless elements.
- Zero compiler changes.

**Option A (compiler `data-jay-src`) deferred** until Option B proves insufficient. The compiler emits JS (not HTML), so adding source-tracking attributes requires compiler → runtime → DOM changes across three layers — too much investment until we know it's needed.

### Variant Scenario Generation

Implement `generateVariantScenarios()` from contract tags:

```typescript
// Input: contract tags with dataType
// { tag: "isSearching", dataType: "boolean" }
// { tag: "hasResults", dataType: "boolean" }
// { tag: "mediaType", dataType: "enum (IMAGE | VIDEO)" }

// Output: bounded scenario list (one per value, linear not combinatorial)
[
  { id: 'default', queryString: '?_jay=variant' },
  { id: 'isSearching', queryString: '?_jay=variant&isSearching=true' },
  { id: 'hasResults-t', queryString: '?_jay=variant&hasResults=true' },
  { id: 'hasResults-f', queryString: '?_jay=variant&hasResults=false' },
  { id: 'mediaType-IMG', queryString: '?_jay=variant&mediaType=IMAGE' },
];
```

Strategy: one scenario per boolean value + one per enum value. No combinatorial explosion. Bounded by `maxScenarios` (default 12).

### ViewState Override Middleware

In `dev-server.ts`, intercept `?_jay=variant` requests:

1. Run normal slow/fast render pipeline → base viewState
2. Parse query params → override map (e.g. `{ isSearching: true }`)
3. Deep-merge overrides into viewState (use existing `deepMergeViewStates` pattern)
4. Render with merged viewState
5. No panel injection — clean page for Playwright

### Style Merging

Each scenario produces a `ComputedStyleMap`. The enricher merges all maps:

- If an element appears in multiple scenarios, use the styles from the scenario where it's visible (not `display: none`)
- Elements that appear in only one scenario get those styles
- The variant-synthesizer receives per-scenario style maps to assign correct styles per variant

## Implementation Plan

### Step 0: Answer Q1 (half day)

Investigate the dev server render pipeline. Determine where viewState can be intercepted and overridden after slow/fast render. This gates everything.

Files to read: `dev-server/lib/dev-server.ts`, `full-stack-component/lib/server-rendering.ts`

### Step 1: Dev server `?_jay=variant` middleware (1 day)

- Detect `?_jay=variant` in `dev-server.ts`
- Parse remaining query params as tag overrides
- Deep-merge into viewState after slow/fast render
- Files: `dev-server/lib/dev-server.ts`

### Step 2: Implement `generateVariantScenarios()` (half day)

- Parse contract tags to extract boolean and enum dimensions
- Generate one scenario per value, bounded by maxScenarios
- Files: `stack-cli/lib/vendors/figma/computed-style-enricher.ts`

### Step 3: Class-path key matching (1 day)

- In the enricher's browser extraction: key elements by tag + class chain
- In the IR builder: generate matching keys from the source DOM
- Fallback to index-based for classless elements
- Files: `computed-style-enricher.ts`, `jay-html-to-import-ir.ts`, `id-generator.ts`

### Step 4: Multi-scenario extraction and merge (half day)

- Switch enricher to URL navigation mode for variant extraction
- Loop over scenarios, navigate to each, extract styles
- Merge ComputedStyleMaps across scenarios
- Pass per-scenario maps to variant-synthesizer
- Files: `computed-style-enricher.ts`

**Total: 3-4 days**

## Out of Scope (Deferred)

- **Interactive playground panel** — separate design log when needed
- **Compiler `data-jay-src` injection** — only if class-path matching proves insufficient
- **Sample data for forEach** — follow-up after variant extraction works
- **Combinatorial scenario explosion** — single-dimension scenarios only for now

## Trade-offs

| Decision          | Chosen                            | Alternative                    | Why                                                                                                  |
| ----------------- | --------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Key matching      | Class-path (Option B)             | Compiler injection (Option A)  | Zero compiler changes; handles 90% of cases; can upgrade later                                       |
| Scenario strategy | One per value (linear)            | All combinations (exponential) | 5 booleans = 10 scenarios (linear) vs 32 (exponential). Linear is sufficient for style capture       |
| Import mode       | Switch to dev server for variants | Stay on direct HTML            | Dev server gives real compiled output with runtime styles; direct HTML misses runtime-applied styles |
| Scope             | Variant extraction only           | Variant + playground           | Playground is a separate feature for a different user. Ship the import fix first                     |
