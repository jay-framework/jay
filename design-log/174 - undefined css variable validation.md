# Design Log #174 — Undefined CSS Variable Validation

## Background

The design-system-validator plugin validates CSS values against DESIGN.md tokens. It uses `css-cascade.ts` to resolve styles per element, and `token-matcher.ts` to check values against tokens.

Currently, every `matchColor`, `matchSpacing`, `matchRounded`, etc. function in `token-matcher.ts` has a guard:

```ts
if (value.startsWith('var(')) return { matches: true };
```

And `resolveVarReferences()` in `css-cascade.ts` resolves `var(--name)` against `:root`-defined custom properties. If a variable isn't defined, the `var()` expression passes through unresolved — and the token matchers accept it unconditionally.

This means `var(--color-that-doesnt-exist)` passes validation silently.

### CSS available to validators

The jay-html parser (`jay-html-parser.ts:extractCss`) already collects CSS from **both** sources into `ctx.css`:

- `<style>` tags in `<head>`
- `<link rel="stylesheet">` tags pointing to local files (resolved relative to the jay-html file, with `@import` resolution)

External URLs (`http://`, `https://`, `//`) are skipped. So the validator sees all locally-available CSS.

## Problem

In `jay-website/src/pages/aiditor-intro/page.jay-html`, the CSS uses `var(--color-surface-tint)`. This variable is referenced in DESIGN.md as a token name but never defined as a CSS custom property in any `<style>` block or linked stylesheet. The page renders with no color where one was intended.

The validator should catch undefined CSS variable references.

## Design

### New validator: `design-undefined-vars`

Add a 6th validator to the design-system-validator plugin that scans all CSS in a page for `var(--name)` references and reports any that are not defined as custom properties in the page's CSS.

#### What counts as "defined"

A CSS custom property `--name` is defined if it appears as a declaration (`--name: value`) in **any** rule within the page's CSS (both inline `<style>` and linked local stylesheets). This includes `:root`, `html`, scoped selectors (`.dark { --color-bg: ... }`), and media queries.

Rationale: if a variable is declared anywhere in the page's CSS, the author has defined it. Whether it's `:root`-scoped or conditionally scoped (`.dark`, `@media`) — the definition exists. The validator's job is to catch typos and missing definitions, not to do element-level scope analysis.

#### What counts as "used"

Any `var(--name)` or `var(--name, fallback)` occurrence in any CSS declaration value.

#### Severity

- `warning` — same as other design-system findings.

#### Fallback handling

`var(--name, fallback)` has a fallback, so the missing definition is less severe but still worth flagging — the intent was clearly to use the variable, not the fallback. Report it as a warning with a note that a fallback exists.

#### Suppression

Use the same `/* design-system: allow */` comment mechanism that works for other design-system warnings. When a `var()` reference is in a declaration followed by the allow comment, skip it.

Since this validator works at the CSS level (not per-element cascade), the implementation scans raw PostCSS declarations. If a declaration using `var(--undefined)` has the allow comment, that usage is excluded from the "used" set.

#### What NOT to validate

- Variables set via JavaScript — not statically determinable.
- Variables defined in external CDN stylesheets — not available to the parser.

### Implementation approach

The validation is a standalone pass over the raw CSS text — it doesn't need the cascade or element resolution. It:

1. Parses CSS with PostCSS
2. Collects all `--*` declarations from all rules → `definedVars: Set<string>`
3. Walks all declarations, extracts `var(--name)` references (skipping `/* design-system: allow */` declarations) → `usedVars: Map<string, {selector, property, hasFallback, fallbackValue}>`
4. Reports `usedVars` entries not in `definedVars`

### Message format

Without fallback:

```
CSS variable "--color-surface-tint" is used but never defined
```

With fallback:

```
CSS variable "--color-surface-tint" is used but never defined (falls back to "red")
```

Suggestion (always):

```
Define --color-surface-tint in a :root block, or replace with a DESIGN.md token value directly.
To suppress: add /* design-system: allow */ after the declaration.
See agent-kit/designer/design-system.md for usage guide.
```

### Integration

- New file: `validators/design-undefined-vars.ts`
- Export from `index.ts`
- Register in `plugin.yaml` as 6th validator
- Update `agent-kit/designer/design-system.md` with the new validation error example
- Test file: `test/validators/design-undefined-vars.test.ts`

## Implementation Plan

### Phase 1: Validator implementation

1. Create `lib/validators/design-undefined-vars.ts` with `validateUndefinedVars: JayHtmlValidatorFn`
2. Use PostCSS to parse `ctx.css`, collect all `--*` declarations as defined vars, collect `var(--name)` references (excluding suppressed declarations)
3. Report findings for used-but-not-defined vars

### Phase 2: Wire up

1. Export from `lib/index.ts`
2. Add to `plugin.yaml` validators list

### Phase 3: Tests

1. Create `test/validators/design-undefined-vars.test.ts` following the pattern from `design-tokens.test.ts`
2. Test cases:
   - Flags `var(--x)` when `--x` not defined anywhere
   - Passes when `--x` defined in `:root`
   - Passes when `--x` defined in `html`
   - Passes when `--x` defined in a scoped selector (`.dark { --x: ... }`)
   - Passes when `--x` defined inside a `@media` query
   - Notes fallback when present: `var(--x, red)`
   - Multiple undefined vars
   - No findings when no `var()` used
   - No findings when no CSS
   - Suppression with `/* design-system: allow */`
   - Var defined by one declaration, used by another — passes
   - Var referencing another var: `--a: var(--b)` — both `--a` and `--b` must be defined

### Phase 4: Agent-kit guide update

1. Add "Undefined CSS variable" section to `agent-kit/designer/design-system.md` under Validation Errors

## Verification Criteria

1. Running `jay-stack validate` on a project with `var(--color-surface-tint)` (undefined) produces a warning
2. Running on a project with all vars defined produces no warnings from this validator
3. Suppression via `/* design-system: allow */` silences the warning
4. All existing tests continue to pass (this is additive — no changes to existing validators)
