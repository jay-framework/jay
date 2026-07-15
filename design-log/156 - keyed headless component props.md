# Design Log #156 — Keyed Headless Component Props

## Background

Jay Stack has three mechanisms for passing data into headless components, each covering a different case:

1. **Route params** via `<script type="application/jay-params">` (DL#113) — static YAML values that flow as `pageParams` to all components. Used for static route overrides like `/products/ceramic-flower-vase` providing `{ slug: 'ceramic-flower-vase' }`.

2. **Instance props** via `<jay:component-name attrName="value">` — attributes on inline instances, resolved against the page's binding context. Used for per-instance configuration.

3. **Keyed headless components** via `<script type="application/jay-headless" key="name">` — no props mechanism. The component receives only `pageProps` (route params). Its ViewState merges into the page namespace.

### Related

- DL#84 — Headless component props and repeater support
- DL#113 — Explicit route params for static overrides
- DL#124 — Contract props and params consistency
- DL#152 — Phase-aware contract props
- DL#155 — Markdown plugin (motivating use case)

## Problem

Keyed headless components cannot receive per-component configuration from the page. The `markdown-pages` component (DL#155) needs a `contentDir` prop to know which directory to scan. Today, the only way to pass data is through route params (`jay-params`), but those are page-wide — not scoped to a specific component.

### Current mechanisms side by side

```
                        jay-params           instance props          keyed headless
Where declared:         <script> in head     <jay:xxx attr="val">    <script> in head
Scope:                  page-wide            per-instance            per-component (but no props)
Format:                 YAML body            HTML attributes         —
Flows to component as:  pageParams           normalizedProps         pageProps only
```

The gap: keyed headless components (`key="name"`) have no way to receive component-specific props.

### Observation: jay-params is a special case of headless props

`jay-params` provides static values for route param matching. But conceptually it's the same as "static props for the page component." If keyed headless components had props, `jay-params` would be the props for the page component itself (which is implicitly keyed).

## Questions & Answers

**Q1: Should we add a `props` attribute to `<script type="application/jay-headless">`, or extend `jay-params` to be per-component?**

A1: Extend the headless script tag with a YAML body for props. This mirrors `jay-params` (YAML in a script tag) and `jay-data` (YAML contract in a script tag). The YAML body is more readable than a JSON attribute for multi-line values.

**Q2: Should we consolidate `jay-params` into this mechanism?**

A2: Yes. `jay-params` becomes props on the page's implicit headless component. Instead of a separate `<script type="application/jay-params">`, the params are declared directly in `<script type="application/jay-data">` (the page's contract script tag), or we keep `jay-params` as sugar for backward compatibility but treat it as page-level props internally.

**Q3: What about the contract's `props` section — how does it validate?**

A3: The contract already has a `props` section that declares expected prop names and types. The validate command (DL#124) should check that props provided in the headless script tag match the contract's declaration.

## Design

### Props on keyed headless components via YAML body

Add YAML body support to `<script type="application/jay-headless">`:

```html
<script
  type="application/jay-headless"
  plugin="@jay-framework/markdown"
  contract="markdown-pages"
  key="post"
>
  contentDir: ./content
</script>
```

The YAML body contains prop values. These flow to the component's `withSlowlyRender` / `withFastRender` as part of `props`.

**Multi-value example:**

```html
<script
  type="application/jay-headless"
  plugin="@jay-framework/markdown"
  contract="markdown-pages"
  key="post"
>
  contentDir: ./content/blog
  defaultAuthor: Jane Doe
  dateFormat: YYYY-MM-DD
</script>
```

### Consolidating jay-params

The page component has its own `page.ts` — it doesn't need external values from the template.

The only components that need template-provided values are **reusable headless components** — they're generic and can't hardcode per-page configuration. This includes both props (like `contentDir` for the markdown plugin) and params (like `slug` for a product page override).

`jay-params` (DL#113) was a page-wide mechanism, but the values it provides actually belong to a specific headless component. A static override page at `/products/ceramic-flower-vase/` provides `slug: ceramic-flower-vase` for the `wix-stores/product-page` component — not for the page itself.

**Before (jay-params — page-wide, no component association):**

```html
<script type="application/jay-params">
  slug: ceramic-flower-vase
</script>
<script
  type="application/jay-headless"
  plugin="@jay-framework/wix-stores"
  contract="product-page"
  key="productPage"
></script>
```

**After — values on the component that needs them:**

```html
<script
  type="application/jay-headless"
  plugin="@jay-framework/wix-stores"
  contract="product-page"
  key="productPage"
>
  slug: ceramic-flower-vase
</script>
```

**Props example — same mechanism:**

```html
<script
  type="application/jay-headless"
  plugin="@jay-framework/markdown"
  contract="markdown-pages"
  key="post"
>
  contentDir: ./content
</script>
```

One mechanism: YAML body in the headless script tag provides static values (params and props) for that specific component. No `page.ts` or separate script tag needed.

### Migration: jay-params validator rule

Add a jay-html validation rule that detects `<script type="application/jay-params">` and tells the agent how to migrate:

```
⚠ <script type="application/jay-params"> is deprecated.
  Move the values into the YAML body of the headless component that uses them:
  <script type="application/jay-headless" plugin="..." contract="..." key="...">
    slug: ceramic-flower-vase
  </script>
```

The validator should identify which headless component on the page has a contract with matching param names, and include that in the suggestion.

**Implementation:** Add to the core jay-stack validation rules (not a plugin validator) since this is a framework-level concern.

### Route scanner changes

The route scanner currently reads `jay-params` to extract `inferredParams`. After this change:

1. Remove `jay-params` parsing from `route-scanner.ts`
2. Instead, read the YAML body of `jay-headless` script tags
3. Extract param values from the headless component whose contract declares matching params

### Parser changes

**File:** `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-parser.ts`

In `parseHeadlessImports()` (line 622):

1. After extracting `plugin`, `contract`, and `key` attributes, also extract the script tag's text content
2. If non-empty, parse as YAML → `Record<string, string>`
3. Store as `headlessProps` on the `JayHeadlessImports` result
4. If no text content, `headlessProps` is empty (backward compatible)

```typescript
// In parseHeadlessImports:
const propsYaml = element.textContent?.trim();
let headlessProps: Record<string, string> = {};
if (propsYaml) {
  headlessProps = yaml.load(propsYaml) as Record<string, string>;
}
```

**File:** `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-source-file.ts`

Add `headlessProps?: Record<string, string>` to `JayHeadlessImports` interface.

### Runtime changes

**File:** `packages/jay-stack/stack-server-runtime/lib/slowly-changing-runner.ts`

When running slow render for keyed headless components, pass `headlessProps` merged with `pageProps`:

```typescript
// Currently (line ~46):
const slowResult = await comp.slowlyRender({ ...pageProps, ...pageParams });

// After:
const slowResult = await comp.slowlyRender({ ...pageProps, ...pageParams, ...headlessProps });
```

The headless props override page props for the same key, allowing per-component customization.

### Validation changes

**File:** `packages/jay-stack/plugin-validator/lib/check-component-contract.ts`

Extend `checkComponentPropsAndParams` to also validate keyed headless props against the contract's `props` section. If the contract declares `props: [{ name: contentDir, kind: required }]`, the headless script tag must provide `contentDir`.

**File:** `packages/jay-stack/stack-cli/lib/validate.ts`

In the validation pipeline, when validating headless imports, check that provided props match the contract's `props` declarations.

### Data flow after this change

```
                        instance props          keyed headless body
Where declared:         <jay:xxx attr="val">    YAML body in <script jay-headless>
Scope:                  per-instance            per-component
Format:                 HTML attributes         YAML body
Flows to component as:  normalizedProps         merged into props
Validated against:      contract props          contract props
```

Both provide values to reusable headless components — instance props for inline instances, YAML body for keyed page-level components. The page component itself needs neither.

## Implementation Plan

### Phase 1: Parser

1. Update `parseHeadlessImports` to extract YAML body from headless script tags
2. Add `headlessProps` to `JayHeadlessImports` interface
3. Pass props through to the stack-cli validation context

### Phase 2: Remove jay-params

1. Remove `jay-params` parsing from route scanner
2. Update route scanner to read params from headless script tag YAML bodies
3. Migrate existing pages that use `jay-params` — move values into the relevant headless script tag

### Phase 3: Runtime

1. Update `slowly-changing-runner.ts` to pass headless props to component
2. Update fast render runner similarly
3. Update client hydration to receive props

### Phase 4: Validation

1. Update `checkComponentPropsAndParams` for keyed headless prop validation
2. Update `validate.ts` to check headless props against contract
3. Add jay-html validation rule that flags `<script type="application/jay-params">` with migration instructions

### Phase 5: Smoke test

1. Add an example page in `examples/jay-stack/smoke-test/` that uses a keyed headless component with props via YAML body
2. Verify props flow through to the component's slow render
3. Verify the dev server renders the page correctly

### Phase 6: Migration

1. Update existing pages that use `jay-params` to use `jay-data` body
2. Update agent-kit documentation

## Trade-offs

| Approach                         | Pro                                                       | Con                                           |
| -------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| YAML body in script tag (chosen) | Consistent with jay-params/jay-data, readable, multi-line | Requires parser change                        |
| JSON `props` attribute           | Simple, single attribute                                  | Hard to read for multi-value, escaping issues |
| Plugin setup config              | No parser change                                          | Per-plugin, not per-page; less flexible       |

## Verification Criteria

1. `<script type="application/jay-headless" key="x">contentDir: ./blog</script>` parses correctly
2. Props flow to component's `slowlyRender` as part of `props` parameter
3. Empty body (no props) continues to work unchanged
4. Contract `props` validation catches missing required props
5. `<script type="application/jay-params">` produces a validation warning with migration instructions
6. Smoke test in `examples/jay-stack/smoke-test/` demonstrates a keyed headless component receiving props via YAML body, rendering correctly in the dev server

---

## Implementation Results

### Files changed

**Parser:**
- `compiler-jay-html/lib/jay-target/jay-html-source-file.ts` — added `headlessProps?: Record<string, string>` to `JayHeadlessImports`
- `compiler-jay-html/lib/jay-target/jay-html-parser.ts` — `parseHeadlessImports()` extracts YAML body via `dedentYaml`, parses with `js-yaml`, stores as `headlessProps`. Error message includes contract name for actionability.

**Runtime (dev server):**
- `stack-server-runtime/lib/load-page-parts.ts` — added `headlessProps` to `DevServerPagePart` interface; passed from `headlessImport` when creating parts
- `stack-server-runtime/lib/slowly-changing-runner.ts` — merges `part.headlessProps` into `partProps` for slow render
- `stack-server-runtime/lib/fast-changing-runner.ts` — same merge for fast render

**Runtime (production server):**
- `production-server/lib/builder/load-production-parts.ts` — added `headlessProps` to `HeadlessModuleInfo`, `PagePartsConfig`, `loadProductionPageParts()`, `buildPagePartsConfig()`, and `loadPagePartsFromConfig()`. Props serialize through `page-parts.json` and reconstruct at serve time.

**Route scanner:**
- `route-scanner/lib/route-scanner.ts` — replaced `parseJayParams()` with `parseHeadlessProps()`. Reads YAML bodies from `<script type="application/jay-headless">` tags, merges into `inferredParams`. Emits deprecation warning when `<script type="application/jay-params">` is detected.

**Validation:**
- `stack-cli/lib/validate.ts` — replaced `extractJayParams()` with `extractHeadlessPropsParamNames()` which reads from `parsedFile.headlessImports[].headlessProps`. Updated `checkRouteParams()` signature (removed `jayHtmlContent` param). Added `jay-params` deprecation warning in validation pipeline with pointer to `agent-kit/developer/routing.md`.

**Tests:**
- `compiler-jay-html/test/jay-target/parse-jay-file.unit.test.ts` — 3 new tests: YAML body parsing, empty body, invalid YAML. All 670 compiler tests pass.
- `stack-cli/test/validate.test.ts` — replaced `extractJayParams` tests with `extractHeadlessPropsParamNames` tests. Updated route param warning message. Updated static override test to expect warning (deprecated fixture).
- `route-scanner/test/route-scanner.test.ts` — updated test names and fixture files to use headless script tag bodies instead of jay-params.

**Smoke test:**
- `examples/jay-stack/smoke-test/src/pages/headless-props/page.jay-html` — new page with keyed headless component receiving `itemId: from-props` via YAML body
- `examples/jay-stack/smoke-test/src/pages/page.jay-html` — added link to headless-props page
- `examples/jay-stack/smoke-test/test/smoke.test.ts` — added test in dev and production sections verifying "Widget from-props" renders

**Agent-kit docs:**
- `stack-cli/agent-kit-template/developer/routing.md` — replaced jay-params section with headless component props documentation
- `stack-cli/agent-kit-template/designer/routing.md` — same

### Deviations from design

- Client hydration (Phase 3, item 3) was not needed — headless props are static values consumed at slow/fast render time. The interactive phase accesses them through the existing `props` parameter from the builder chain.
- Contract props validation for keyed headless (Phase 4, items 1-2) deferred — the existing `checkRouteParams` covers param availability. Full props-vs-contract validation for keyed headless can be added incrementally.
- Phase 6 migration was trivial — no existing pages used `jay-params` in code (only in agent-kit documentation, which was updated).
