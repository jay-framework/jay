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
<script type="application/jay-headless"
  plugin="@jay-framework/markdown"
  contract="markdown-pages"
  key="post">
  contentDir: ./content
</script>
```

The YAML body contains prop values. These flow to the component's `withSlowlyRender` / `withFastRender` as part of `props`.

**Multi-value example:**

```html
<script type="application/jay-headless"
  plugin="@jay-framework/markdown"
  contract="markdown-pages"
  key="post">
  contentDir: ./content/blog
  defaultAuthor: Jane Doe
  dateFormat: YYYY-MM-DD
</script>
```

### Consolidating jay-params

`jay-params` currently provides route params for static override routes:

```html
<!-- Before: separate tag -->
<script type="application/jay-params">
  slug: ceramic-flower-vase
</script>
```

After consolidation, route params are expressed as props on the page's data script tag or as a `params` section in a headless component:

**Option A — Keep jay-params as syntactic sugar:**

`jay-params` continues to work unchanged. Internally, its values merge into the page component's props (same pipeline). No migration needed.

**Option B — Move params into the contract script:**

```html
<script type="application/jay-data" contract="./page.jay-contract">
  slug: ceramic-flower-vase
</script>
```

The `jay-data` script tag already has a YAML body for inline data structure. Extend it to also accept params when used with a contract reference.

**Recommendation:** Option A. Keep `jay-params` for backward compatibility and clarity. The mental model is simpler: params are about routing, props are about component configuration. Internally they share the same mechanism.

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
                        jay-params           instance props          keyed headless props
Where declared:         <script> in head     <jay:xxx attr="val">    YAML body in <script>
Scope:                  page-wide            per-instance            per-component
Format:                 YAML body            HTML attributes         YAML body
Flows to component as:  pageParams           normalizedProps         merged into props
Validated against:      contract params      contract props          contract props
```

## Implementation Plan

### Phase 1: Parser

1. Update `parseHeadlessImports` to extract YAML body from headless script tags
2. Add `headlessProps` to `JayHeadlessImports` interface
3. Pass props through to the stack-cli validation context

### Phase 2: Runtime

1. Update `slowly-changing-runner.ts` to pass headless props to component
2. Update fast render runner similarly
3. Update client hydration to receive props

### Phase 3: Validation

1. Update `checkComponentPropsAndParams` for keyed headless prop validation
2. Update `validate.ts` to check headless props against contract

### Phase 4: Tests

1. Parser tests with YAML body in headless script tags
2. Runtime tests with props flowing to slow render
3. Validation tests for missing/extra props

## Trade-offs

| Approach | Pro | Con |
|---|---|---|
| YAML body in script tag (chosen) | Consistent with jay-params/jay-data, readable, multi-line | Requires parser change |
| JSON `props` attribute | Simple, single attribute | Hard to read for multi-value, escaping issues |
| Plugin setup config | No parser change | Per-plugin, not per-page; less flexible |

## Verification Criteria

1. `<script type="application/jay-headless" key="x">contentDir: ./blog</script>` parses correctly
2. Props flow to component's `slowlyRender` as part of `props` parameter
3. Empty body (no props) continues to work unchanged
4. Contract `props` validation catches missing required props
5. `jay-params` continues to work unchanged
6. Example markdown-pages component receives `contentDir` prop correctly
