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
<jay:category-products categorySlug="{p.categorySlug}"> ... </jay:category-products>
```

The `category-products` component has `slowlyRender(props)` that queries the database by `categorySlug`. But `p.categorySlug` is only available after the page's fast render. During slow render:

1. `slowRenderInstances` resolves `{p.categorySlug}` → `p` has no `categorySlug` yet → returns `""`
2. Component's `slowlyRender({ categorySlug: "" })` queries with empty slug → wrong/empty results
3. Fast render later resolves correctly, but the slow data is already cached with wrong results

No error or warning is produced. The designer has no way to know that this binding won't work at slow time.

## Questions & Answers

**Q1:** Should props have a `phase` annotation like tags?

**A1:** Yes. Same system as tags.

**Q2:** What phases make sense for props? Tags use `slow`, `fast`, `fast+interactive`. Props are inputs from the template, not rendered outputs — do the same phases apply?

**A2:** Same phases as tags. `slow` (default), `fast`, `fast+interactive`. In practice `fast` === `fast+interactive` because interactive-phase props can change on the client.

**Q3:** Should the phase on a prop indicate when the VALUE is expected to be available, or when the component USES it?

**A3:** These are the same thing — the expectation that a value is available is defined by when the component uses it.

**Q4:** How should the framework validate that a prop binding provides data at the right phase?

**A4:** The binding's source tag phase must be ≤ the prop's phase. A slow tag can bind to a fast prop. A fast tag cannot bind to a slow prop.

**Q5:** Should this be a compile-time validation error, a runtime warning, or both?

**A5:** Compile error, like any other tag phase mismatch.

**Q6:** What about literal props like `limit="4"` — are they always available at all phases?

**A6:** Yes. Literal values and route params are always available at all phases.

## Design

### Prop Phase Annotation

Add a `phase` field to contract prop definitions, following the same rules as tag phases:

```yaml
props:
  - name: categorySlug
    type: string
    phase: slow # Default — must be available at build time
    description: Category slug to filter products by

  - name: productId
    type: string
    phase: fast # Only needs to be available at request time
    description: Product ID to exclude from results
```

Phase values for props (same as tags):

| Phase              | Default | Meaning                   | Binding source must be                               |
| ------------------ | ------- | ------------------------- | ---------------------------------------------------- |
| `slow`             | Yes     | Available at build time   | Literal, route param, or slow-phase tag              |
| `fast`             | No      | Available at request time | Any of above, or fast-phase tag                      |
| `fast+interactive` | No      | Can also change on client | Same as fast (fast === fast+interactive in practice) |

**Default is `slow`** — same as tags. This means existing contracts without `phase` on props will now be validated as slow, which may surface binding mismatches that were previously silent. This is a **regression fix** — the empty-prop-at-slow-time bug was always there, just undetected.

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

Compile-time error in `jay-stack validate`, same as tag phase mismatches.

When a `<jay:component>` instance has a prop binding, the validator:

1. Resolves the binding path (e.g., `p.categorySlug`)
2. Finds the source tag in the page's contract or keyed component's contract
3. Checks: source tag phase must be ≤ prop phase

Phase ordering: `slow` < `fast` ≤ `fast+interactive`

A slow source can bind to any prop phase. A fast source cannot bind to a slow prop.

```
❌ <jay:category-products> prop "categorySlug" (phase: slow) bound to
   {p.categorySlug} which is phase: fast+interactive.
   Suggestion: Use a slow-phase binding, a route param, or a literal value.
```

Literal values and route params are always considered `slow` (always available).

### Default Behavior

Props default to `phase: slow`, same as tags. Existing contracts without explicit `phase` on props will now be validated — bindings to fast-phase fields that were silently producing empty values at slow render will surface as compile errors.

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

1. Add `phase` field to `ContractProp` type in compiler-shared (defaults to `slow`)
2. Update contract parser to accept `phase` on props
3. Update `validate-plugin` to validate phase values

### Phase 2: Compile-time validation

4. In `jay-stack validate`, when processing `<jay:component>` instances with `{binding}` props:
   - Resolve the binding path to the source contract tag
   - Compare source tag phase vs prop phase (source must be ≤ prop)
   - Flag mismatches as errors

### Phase 3: Documentation

5. Update designer guide with phase-aware prop examples and binding rules
6. Update plugin developer contract guide
7. Update agent-kit contract authoring guide

## Trade-offs

| Approach                                    | Pros                                                  | Cons                                                            |
| ------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| **Phase annotation on props (this design)** | Explicit, validates at compile time, documents intent | New concept for plugin developers to learn                      |
| **Infer from component usage**              | No schema change needed                               | Can't validate without analyzing component source code          |
| **Runtime-only warning**                    | Simple, no schema change                              | Catches issues late (at build/serve time, not at validate time) |
| **No validation**                           | Zero effort                                           | Silent bugs — empty props at slow render with no feedback       |
