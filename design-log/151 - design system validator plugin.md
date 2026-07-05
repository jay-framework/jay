# Design Log #151 — Design System Validator Plugin

## Background

We want a build-time linting plugin that enforces UI conformity against a [DESIGN.md](https://github.com/google-labs-code/design.md) specification. The plugin validates `.jay-html` files and their CSS against defined design tokens (colors, typography, spacing, rounded, components) and structural rules.

An initial spec proposed using Happy DOM + `getComputedStyle()` via a Vite `transform` hook. This design log evaluates that approach, identifies its problems, and proposes an alternative based on static CSS analysis with cascade resolution.

### Related

- DL#145 — Pluggable jay-html validation (existing system)
- DL#147 — Jay-html validation rules catalog
- [DESIGN.md spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)
- `packages/plugins/a11y-validator/` — Reference validation plugin
- `packages/plugins/seo-validator/` — Reference validation plugin

## Problems with the Happy DOM Approach

### 1. Happy DOM doesn't compute CSS

`getComputedStyle()` in Happy DOM returns inline styles or empty strings. It does not resolve stylesheets, cascade, specificity, CSS custom properties, or media queries. Resizing `window.innerWidth` won't trigger media query re-evaluation either — there is no layout engine.

To get real computed styles you'd need a full browser engine (Playwright/Puppeteer), which is too slow for a build-time linter.

### 2. Wrong integration point

Jay-html files go through the jay-html compiler, not Vite's `transform` hook. Jay already has a pluggable validation system (DL#145) with `JayHtmlValidatorFn`, parsed DOM tree, contract data, `walkElements()` utility, and agent-friendly error reporting.

### 3. Static analysis with cascade resolution covers the real use cases

Design token validation is primarily about checking that resolved CSS values match a known set. With `postcss` for parsing and `@csstools/selector-specificity` for specificity calculation, we can resolve the cascade statically — no browser needed.

## Questions & Answers

**Q1:** The DESIGN.md spec uses `{path.to.token}` variable references (e.g., `{colors.primary-60}`, `{rounded.md}`). Should we support this syntax?

**A1:** Yes. The token parser must resolve `{path.to.token}` references to their final values before validation. This is required by the spec and used heavily in the `components` section.

**Q2:** Where should DESIGN.md files live? Project root only, or per-route?

**A2:** DESIGN.md lives alongside pages. If more than one exists, it takes effect on the route it is placed in and on all child routes, unless a child route also has its own DESIGN.md (which overrides). This lets different sections of a site have different design systems.

**Q3:** How do we handle exceptions — cases where a value intentionally breaks the design system (e.g., a one-off padding)?

**A3:** CSS comment directive `/* design-system: allow */` on the declaration, or `jay-design="allow"` attribute on elements for inline styles. Same pattern as ESLint/Stylelint disable comments.

**Q4:** Can we validate CSS inside headless component inline templates (inside `<jay:component-name>` blocks)?

**A4:** Yes. Elements inside `<jay:component-name>` blocks are part of the DOM tree the validator receives. They are validated the same as any other elements — the walker doesn't distinguish.

**Q5:** Jay-html allows linking external CSS files via `<link rel="stylesheet">`. Should we parse and validate those too?

**A5:** Yes. Resolve paths relative to the jay-html file and parse alongside `<style>` blocks. Linked files participate in cascade resolution with source-order priority.

**Q6:** Can we support CSS cascade resolution without a browser engine? The original assessment said we can't, but with PostCSS + `@csstools/selector-specificity` we can.

**A6:** Yes. PostCSS parses CSS into rules with selectors and declarations. `@csstools/selector-specificity` computes specificity per selector. `node-html-parser` (already available) matches selectors to elements. Combine these to resolve which value wins per element — no browser needed.

## Design

### DESIGN.md Format

Following the [DESIGN.md spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md):

```yaml
---
name: Onsko Clean Beauty

colors:
  primary: "#2563eb"
  primary-hover: "#1d4ed8"
  secondary: "#64748b"
  text: "#0f172a"
  text-muted: "#64748b"
  background: "#ffffff"
  surface: "#f8fafc"
  border: "#e2e8f0"
  error: "#dc2626"
  success: "#16a34a"

typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 2.5rem
    fontWeight: 700
    lineHeight: 1.2
  headline-md:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.3
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  label-sm:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.5

spacing:
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2rem
  2xl: 3rem
  3xl: 4rem

rounded:
  none: 0
  sm: 0.25rem
  md: 0.5rem
  lg: 0.75rem
  full: 9999px

components:
  # HTML elements — matched by CSS selector
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.lg}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"

  # Jay headless components — matched by <jay:component-name>
  jay:login-indicator:
    textColor: "{colors.text}"
    typography: "{typography.label-sm}"
  jay:cart-indicator:
    textColor: "{colors.text}"
    typography: "{typography.label-sm}"
  jay:product-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"

rules:
  max-font-weights: 3
  max-primary-buttons: 1
  require-contrast-aa: true
---

# Onsko Design System

Brand guidelines and usage instructions...
```

### DESIGN.md Scoping (Route Hierarchy)

DESIGN.md files are placed alongside pages:

```
src/pages/
  DESIGN.md                   # applies to all routes
  page.jay-html
  products/
    DESIGN.md                 # overrides for /products and children
    page.jay-html
    [[category]]/
      page.jay-html           # inherits products/DESIGN.md
  admin/
    DESIGN.md                 # separate design system for /admin
    page.jay-html
```

Resolution: walk up from the page's directory to the project root, use the first DESIGN.md found. This mirrors how CSS cascades — closest wins.

### Exception Mechanism

Sometimes a value intentionally breaks the design system. Similar to `jay-script="allow"` for script tags, use a CSS comment directive:

```css
.hero-banner {
  padding: 7.5rem 0; /* design-system: allow */
}
```

And for inline styles on elements:

```html
<div style="margin-top: 7.5rem" jay-design="allow">
```

The validator skips any declaration or element marked with these directives. This is the same pattern used by ESLint (`eslint-disable`), Stylelint (`stylelint-disable`), and Prettier (`prettier-ignore`).

### Plugin Architecture

Standard Jay validation plugin (DL#145 pattern):

```
packages/plugins/design-system-validator/
  lib/
    validators/
      design-tokens.ts        # Token conformance (colors, spacing, rounded, typography)
      design-components.ts    # Component conformance
      design-structure.ts     # Structural rules (max weights, primary buttons)
      design-contrast.ts      # WCAG AA color contrast
    parse-design-md.ts        # DESIGN.md parser + token resolution
    css-cascade.ts            # CSS cascade resolver (postcss + selector-specificity)
    token-matcher.ts          # CSS value → token matching
  plugin.yaml
  package.json
```

`plugin.yaml`:
```yaml
name: design-system
validators:
  - name: design-tokens
    handler: validateTokens
    description: Validates CSS values against DESIGN.md tokens
  - name: design-components
    handler: validateComponents
    description: Validates component styles against DESIGN.md component specs
  - name: design-structure
    handler: validateStructure
    description: Enforces structural design rules
  - name: design-contrast
    handler: validateContrast
    description: Checks WCAG AA color contrast compliance
```

### CSS Cascade Resolution (The Engine)

Instead of a browser engine, build a lightweight cascade resolver using existing libraries:

**Libraries:**
- [`postcss`](https://github.com/postcss/postcss) — Parse CSS into AST with rules, selectors, and declarations
- [`postcss-selector-parser`](https://github.com/postcss/postcss-selector-parser) — Parse selectors into AST nodes
- [`@csstools/selector-specificity`](https://github.com/csstools/postcss-plugins/tree/main/packages/selector-specificity) — Compute specificity from `postcss-selector-parser` AST nodes
- `node-html-parser` — Already available in validation context; supports `querySelectorAll` for selector matching

**Algorithm:**

```
1. Collect all CSS sources:
   - <style> blocks in the jay-html
   - Linked CSS files (<link rel="stylesheet">)
   - Inline style="" attributes on elements

2. Parse CSS into rules:
   For each CSS source → postcss.parse() → walk rules → (selector, declarations[])
   For each selector → postcss-selector-parser → AST → selectorSpecificity()

3. For each element in the jay-html DOM:
   a. Find all matching CSS rules (use node-html-parser's selector matching)
   b. Compute specificity for each matching rule (via @csstools/selector-specificity)
   c. Sort by: (source order for same specificity, specificity for different)
   d. Apply cascade: later/higher-specificity wins, inline styles win all
   e. Result: resolved property→value map for this element

4. Validate resolved values against design tokens
```

**What this handles:**
- Multiple selectors targeting the same element (cascade)
- Class, ID, attribute, and pseudo-class specificity
- Source order tiebreaking
- Inline style override
- `!important` declarations
- Media query blocks (each breakpoint validated independently)

**What this does NOT handle (acceptable limitations):**
- Inherited values from parent elements (e.g., `color` inheriting through the tree) — would require walking up the DOM for each inheritable property; possible as a future enhancement
- `calc()`, `min()`, `max()` expressions — flag as "cannot validate statically"
- Values set by JavaScript at runtime — out of scope
- CSS custom properties defined outside the validated files — flag as unresolvable

### Validation Rules

#### 1. Token conformance (design-tokens validator)

For each element's resolved CSS values:
- **Colors** (`color`, `background-color`, `border-color`, `outline-color`, etc.) — flag hardcoded values not in the token map; suggest the closest token
- **Spacing** (`padding`, `margin`, `gap`, `top`, `right`, `bottom`, `left`) — check values against spacing scale
- **Rounded** (`border-radius`) — check against rounded tokens
- **Typography** (`font-size`, `font-weight`, `line-height`, `letter-spacing`, `font-family`) — check combinations against typography tokens

CSS custom property references (`var(--name)`) are checked for existence in the token map but not resolved further.

#### 2. Component conformance (design-components validator)

Elements matching component selectors (defined in DESIGN.md `components` section) are validated as a composite — all specified properties must match the component spec simultaneously.

Two kinds of component targets:

- **HTML components** (e.g., `button-primary`, `card`) — matched by CSS class or selector against DOM elements
- **Jay headless components** (e.g., `jay:login-indicator`, `jay:product-card`) — matched by the `<jay:component-name>` tag. The validator checks the resolved styles on the inline template root element(s) inside the `<jay:...>` block

The `jay:` prefix in the components section maps directly to jay-html headless component tags. This lets the design system define style expectations for any headless component — page-level instances, nested instances, plugin components.

#### 3. Structural rules (design-structure validator)

Uses the parsed DOM tree:
- **Max font weights**: Collect unique `font-weight` values across the page, warn if exceeding `rules.max-font-weights`
- **Max primary buttons**: Count distinct primary action buttons by (ref, text content) pairs — the same button appearing multiple times (same ref, same text) counts as one
- **Custom structural rules**: Extensible for project-specific checks

#### 4. Contrast checking (design-contrast validator)

For elements where both foreground color and background color are statically determinable:
- Compute WCAG 2.1 relative luminance for each color
- Calculate contrast ratio
- Flag pairs below 4.5:1 (AA normal text) or 3:1 (AA large text)
- Skip elements where colors are dynamic bindings or inherited from unknown ancestors

#### 5. Responsive breakpoint validation

Parse media query blocks in the CSS. For each breakpoint:
- Run the same token/component/structural validation on the rules within that media query
- Report findings grouped by breakpoint
- No visual/layout checking — purely token conformance per breakpoint

### External CSS Files

Jay-html supports `<link rel="stylesheet" href="...">`. The validator resolves these paths relative to the jay-html file and parses them alongside `<style>` blocks. All rules from linked files participate in cascade resolution with lower priority than inline `<style>` blocks (per CSS source order).

### Integration with Existing Validators

The design-system validator complements existing validators:
- **a11y-validator** → structural accessibility (alt text, ARIA, form labels)
- **seo-validator** → SEO metadata and semantics
- **design-system-validator** → visual conformity to design tokens and component specs

### Designer Role Guide

The plugin should include an agent-kit designer guide (`agent-kit/designer/design-system.md`) that:

1. Explains how DESIGN.md works — tokens, `{references}`, components section
2. Shows how to use tokens in CSS (via custom properties or direct values)
3. Lists the validation errors the designer will encounter and how to fix them
4. Explains the exception mechanism (`/* design-system: allow */`)

Example validation errors the guide should document:

```
⚠ Hardcoded color #ff0000 not in design system
  Suggestion: Use token {colors.error} ("#dc2626") or add to DESIGN.md

⚠ Padding "13px" not in spacing scale
  Suggestion: Use {spacing.md} ("1rem") or {spacing.lg} ("1.5rem"),
  or add /* design-system: allow */ to exempt this value

⚠ border-radius "10px" not in rounded scale
  Suggestion: Use {rounded.lg} ("0.75rem") or {rounded.full} ("9999px")

⚠ <jay:product-card> inline template: backgroundColor does not match
  component spec. Expected "{colors.surface}" (#f8fafc), found "#ffffff"
  Suggestion: Update background-color to match DESIGN.md
  jay:product-card component definition

⚠ 4 unique font-weight values found (max: 3)
  Suggestion: Reduce to 3 font-weight values from the typography tokens

⚠ Contrast ratio 2.8:1 below WCAG AA (4.5:1) for text "{colors.text-muted}"
  on background "{colors.surface}"
  Suggestion: Darken text color or lighten background
```

The guide should be concise — the validation errors themselves are the primary teaching tool, with the guide providing the mental model for why tokens matter.

## Implementation Plan

### Phase 1: Token parser + basic CSS validation (no cascade)

1. `parse-design-md.ts` — parse YAML frontmatter, resolve `{path.to.token}` references, DESIGN.md route-scoping resolution
2. `token-matcher.ts` — match CSS values against token scales (color normalization, unit conversion)
3. `design-tokens` validator — parse `<style>` blocks, validate values against tokens, support `/* design-system: allow */` exceptions
4. Register as Jay validation plugin

### Phase 2: Cascade resolver

5. `css-cascade.ts` — parse CSS with `postcss`, compute specificity with `@csstools/selector-specificity`, resolve cascade per element
6. Support linked external CSS files
7. Support inline `style=""` attributes with `jay-design="allow"` exceptions
8. Update token validator to use resolved cascade values instead of raw declarations

### Phase 3: Component + structural validation

9. `design-components` validator — composite component spec matching
10. `design-structure` validator — font weight count, primary button count (by ref+text identity)

### Phase 4: Contrast + responsive

11. `design-contrast` validator — WCAG AA contrast ratio on static color pairs
12. Responsive breakpoint validation — per-media-query token conformance

### Phase 5: Designer guide

13. `agent-kit/designer/design-system.md` — tokens, usage, validation errors, exceptions

## Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| **Static CSS + cascade resolver (this design)** | Fast, deterministic, works in CI, handles cascade | No inheritance; complex expressions skipped |
| **Happy DOM computed styles** | Theoretically checks cascade | Doesn't work — Happy DOM doesn't compute CSS |
| **Playwright/browser rendering** | Real computed styles, real media queries | Slow, requires running server, flaky in CI |
| **Stylelint custom rules** | Mature CSS linting ecosystem | No jay-html structure awareness, no contracts |

## Verification Criteria

1. Plugin loads via standard `plugin.yaml` registration
2. `jay-stack validate` runs design-system rules alongside a11y and seo validators
3. DESIGN.md scoping resolves correctly (child route inherits, override replaces)
4. Hardcoded colors in CSS produce warnings with closest token suggestion
5. Spacing/rounded values outside the scale produce warnings
6. `/* design-system: allow */` and `jay-design="allow"` suppress findings
7. Cascade resolver correctly determines winning value when multiple selectors match
8. Component conformance validates composite specs from DESIGN.md components section
9. Primary button count uses (ref, text) identity — duplicates don't count
10. Contrast violations flagged on statically determinable color pairs
11. Media query blocks validated independently per breakpoint
