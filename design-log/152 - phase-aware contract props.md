# Design Log #152 — Phase-Aware Contract Props

## Background

Headless component contracts define `props` — typed inputs passed via `<jay:component prop="value">` attributes. Unlike `tags` (which have explicit `phase` annotations like `slow`, `fast+interactive`), props have no phase information. The framework doesn't know when a prop value needs to be available.

PR #182 added support for resolving `{binding}` expressions in instance props — e.g., `<jay:category-products categorySlug="{p.categorySlug}">`. The binding is resolved against the page's ViewState at render time. But there's a gap: if the binding references a fast-phase field, the slow render receives an empty string.

### Related

- DL#84 — Headless component props and repeater support
- DL#124 — Contract props and params consistency
- DL#50 — Rendering phases in contracts
- PR #182 — Resolve jay params values for headless instances

## Problem

```yaml
# category-products.jay-contract
props:
  - name: categorySlug
    type: string
```

```html
<!-- Page uses a keyed component `p` that provides categorySlug at fast phase -->
<jay:category-products categorySlug="{p.categorySlug}">
  ...
</jay:category-products>
```

The `category-products` component has `slowlyRender(props)` that queries the database by `categorySlug`. But `p.categorySlug` is only available after the page's fast render. During slow render:

1. `slowRenderInstances` resolves `{p.categorySlug}` → `p` has no `categorySlug` yet → returns `""`
2. Component's `slowlyRender({ categorySlug: "" })` queries with empty slug → wrong/empty results
3. Fast render later resolves correctly, but the slow data is already cached with wrong results

No error or warning is produced. The designer has no way to know that this binding won't work at slow time.

## Questions & Answers

**Q1:** Should props have a `phase` annotation like tags?

**Q2:** What phases make sense for props? Tags use `slow`, `fast`, `fast+interactive`. Props are inputs from the template, not rendered outputs — do the same phases apply?

**Q3:** Should the phase on a prop indicate when the VALUE is expected to be available, or when the component USES it?

**Q4:** How should the framework validate that a prop binding provides data at the right phase?

**Q5:** Should this be a compile-time validation error, a runtime warning, or both?

**Q6:** What about literal props like `limit="4"` — are they always available at all phases?

## Design

### Prop Phase Annotation

Add an optional `phase` field to contract prop definitions:

```yaml
props:
  - name: categorySlug
    type: string
    phase: slow              # This prop must be available at slow render time
    description: Category slug to filter products by

  - name: productId
    type: string
    phase: fast              # This prop only needs to be available at fast render time
    description: Product ID to exclude from results
```

Phase values for props:

| Phase | Meaning | Available at |
|-------|---------|-------------|
| `slow` | Required at build time | Slow render and later |
| `fast` | Required at request time | Fast render and later |
| (none) | No constraint | Any phase (no validation) |

`interactive` doesn't apply to props — props are server-side inputs from the template, not reactive client values.

### What Can Provide Slow-Phase Props

A `phase: slow` prop binding must resolve to a value available during slow render:

- **Literal values** — always available: `categorySlug="best-sellers"` 
- **Route params** — always available: `categorySlug="{category}"` (from URL segments)
- **Slow-phase keyed ViewState** — available if the keyed component has `slowlyRender`: `categorySlug="{p.categorySlug}"` where `p.categorySlug` is a slow tag
- **Page slow ViewState** — available: `slug="{pageSlug}"` where `pageSlug` has `phase: slow`

A `phase: slow` prop binding to a fast-phase field should produce a validation error.

### What Can Provide Fast-Phase Props

A `phase: fast` prop can bind to anything available at request time — slow or fast ViewState, route params, query params, literals.

### Validation

#### Compile-time (jay-stack validate)

When a `<jay:component>` instance has a prop with `phase: slow`, and the binding references a field from the page's contract:

1. Resolve the binding path (e.g., `p.categorySlug`)
2. Find the source tag in the page's contract or keyed component's contract
3. Check the source tag's phase — if it's `fast` or `fast+interactive` and the prop requires `slow`, flag an error

```
❌ <jay:category-products> prop "categorySlug" requires phase: slow,
   but binding {p.categorySlug} resolves to a fast+interactive field.
   The component's slowlyRender will receive an empty value.
   Suggestion: Use a slow-phase binding, a route param, or a literal value.
```

#### Runtime (slow render)

If a `phase: slow` prop resolves to an empty string during `slowRenderInstances`, log a warning:

```
⚠ [SlowRender] category-products prop "categorySlug" is empty at slow render time.
  The prop is declared as phase: slow — check that the binding provides a slow-phase value.
```

### Default Behavior

When `phase` is omitted from a prop, no validation is performed — this preserves backward compatibility. Existing contracts continue to work as before.

### Contract Example

```yaml
name: category-products
description: Shows products filtered by category

props:
  - name: categorySlug
    type: string
    phase: slow
    required: true
    description: Category slug — must be available at build time for SSG

  - name: productId
    type: string
    description: Product to exclude (no phase — works at any time)

  - name: limit
    type: number
    description: Max products to show (no phase — literal value)

tags:
  - tag: products
    type: sub-contract
    repeated: true
    phase: fast+interactive
    trackBy: _id
    tags:
      - tag: name
      - tag: price
        dataType: number
```

## Implementation Plan

### Phase 1: Contract schema

1. Add optional `phase` field to `ContractProp` type in compiler-shared
2. Update contract parser to accept `phase` on props
3. Update `validate-plugin` to validate phase values

### Phase 2: Compile-time validation

4. In `jay-stack validate`, when processing `<jay:component>` instances with bindings:
   - Resolve the binding path to the source contract tag
   - Compare source tag phase vs prop phase
   - Flag mismatches

### Phase 3: Runtime warning

5. In `slowRenderInstances`, after resolving props:
   - Check if any `phase: slow` prop resolved to empty
   - Log a warning with the prop name and binding

### Phase 4: Documentation

6. Update designer guide with phase-aware prop examples
7. Update plugin developer contract guide
8. Update agent-kit contract authoring guide

## Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| **Phase annotation on props (this design)** | Explicit, validates at compile time, documents intent | New concept for plugin developers to learn |
| **Infer from component usage** | No schema change needed | Can't validate without analyzing component source code |
| **Runtime-only warning** | Simple, no schema change | Catches issues late (at build/serve time, not at validate time) |
| **No validation** | Zero effort | Silent bugs — empty props at slow render with no feedback |
