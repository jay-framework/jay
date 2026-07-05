# Design Log #151 — Design System Validator Plugin

## Background

We want a build-time linting plugin that enforces UI conformity against a design system specification. The plugin validates `.jay-html` files against defined design tokens (colors, typography, spacing, radii) and structural rules.

An initial spec proposed using Happy DOM + `getComputedStyle()` via a Vite `transform` hook to validate computed styles against tokens. This design log evaluates that approach and proposes an alternative.

### Related

- DL#145 — Pluggable jay-html validation (existing system)
- DL#147 — Jay-html validation rules catalog
- `packages/plugins/a11y-validator/` — Reference validation plugin
- `packages/plugins/seo-validator/` — Reference validation plugin

## Problems with the Happy DOM Approach

### 1. Happy DOM doesn't compute CSS

`getComputedStyle()` in Happy DOM returns inline styles or empty strings. It does not:
- Resolve external/internal stylesheets
- Apply CSS cascade or specificity
- Evaluate CSS custom properties (`var(--token)`)
- Process media queries
- Compute layout (flexbox, grid)

This is the foundation of the proposed architecture, and it doesn't work. Resizing `window.innerWidth` also won't trigger media query re-evaluation — Happy DOM doesn't implement a layout engine.

To get real computed styles you'd need a full browser engine (Playwright/Puppeteer), which is too slow for a build-time linter and requires a running dev server.

### 2. Wrong integration point

Jay-html files don't go through Vite's `transform` hook — they go through the jay-html compiler. Jay already has a pluggable validation system (DL#145) with:
- `JayHtmlValidatorFn` interface
- Parsed DOM tree (node-html-parser)
- Contract data, headless imports, head metadata
- `walkElements()` utility with automatic scope tracking
- Agent-friendly error reporting with suggestions

The a11y-validator and seo-validator already use this system successfully.

### 3. Static analysis covers most use cases

Design token validation is primarily about checking that values used in CSS and attributes match a known set. This is a parsing problem, not a rendering problem:
- CSS custom properties → check `var(--token-name)` references exist in the token map
- Inline styles → parse and validate values
- Color literals → flag hardcoded colors that should use tokens
- Spacing/radius values → check against the scale

## Design

### DESIGN.md Format

A `DESIGN.md` file at the project root with YAML frontmatter defining tokens and rules:

```yaml
---
tokens:
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
    heading-1: { size: "2.5rem", weight: 700, lineHeight: 1.2 }
    heading-2: { size: "2rem", weight: 700, lineHeight: 1.3 }
    heading-3: { size: "1.5rem", weight: 600, lineHeight: 1.4 }
    body: { size: "1rem", weight: 400, lineHeight: 1.6 }
    small: { size: "0.875rem", weight: 400, lineHeight: 1.5 }

  spacing:
    - 0
    - 0.25rem
    - 0.5rem
    - 0.75rem
    - 1rem
    - 1.5rem
    - 2rem
    - 3rem
    - 4rem

  radii:
    none: "0"
    sm: "0.25rem"
    md: "0.5rem"
    lg: "0.75rem"
    full: "9999px"

rules:
  max-font-weights: 3
  max-primary-buttons: 1
  require-contrast-aa: true
---

# Onsko Design System

Design guidelines and usage instructions below...
```

**Question: should we support CSS custom property names in token values (e.g., `primary: "var(--color-primary)"`) so the validator can match either the var reference or the resolved value?**

**Question: should DESIGN.md live at project root, or should plugins be able to provide their own design system specs?**

### Plugin Architecture

Standard Jay validation plugin (DL#145 pattern):

```
packages/plugins/design-system-validator/
  lib/
    validators/
      design-tokens.ts      # Token conformance rules
      design-structure.ts   # Structural rules (max weights, primary buttons, etc.)
      design-contrast.ts    # Color contrast checking
    parse-design-md.ts      # DESIGN.md parser
    token-matcher.ts         # CSS value → token matching utilities
  plugin.yaml
  package.json
```

`plugin.yaml`:
```yaml
name: design-system
validators:
  - name: design-tokens
    handler: validate
    description: Validates CSS values against design system tokens
  - name: design-structure
    handler: validateStructure
    description: Enforces structural design rules
  - name: design-contrast
    handler: validateContrast
    description: Checks WCAG AA color contrast compliance
```

### Validation Approach — Static CSS Analysis

Instead of rendering HTML and reading computed styles, parse the CSS directly:

#### 1. Token matching (design-tokens validator)

Parse the `<style>` block from jay-html and validate property values:

```
Input CSS:
  .card { background: #ff0000; padding: 13px; border-radius: 0.5rem; }

Findings:
  ⚠ Hardcoded color #ff0000 — use a design token (e.g., var(--color-error))
  ⚠ Padding 13px not in spacing scale [0, 0.25rem, 0.5rem, ... 4rem]
  ✓ border-radius 0.5rem matches radii.md
```

**What to validate:**
- Color properties (`color`, `background-color`, `border-color`, etc.) — flag hardcoded hex/rgb values not in the token map
- Spacing properties (`padding`, `margin`, `gap`) — check values against the spacing scale
- Border-radius — check against radii tokens
- Typography — check `font-size`, `font-weight`, `line-height` combinations against typography tokens
- CSS custom property references — check `var(--name)` references resolve to known tokens

**What NOT to validate:**
- Computed/cascaded values (can't do statically)
- Values set by JavaScript at runtime
- Third-party CSS (only validate `<style>` blocks within jay-html)

#### 2. Structural rules (design-structure validator)

Use the parsed DOM tree (already provided by the validation context):

- **Max font weights**: Walk all elements, collect unique `font-weight` values from inline styles and CSS classes, warn if exceeding `rules.max-font-weights`
- **Max primary buttons**: Count elements matching primary button patterns (class-based or attribute-based), warn if exceeding `rules.max-primary-buttons`
- **Custom structural rules**: Extensible pattern for project-specific DOM structure checks

#### 3. Contrast checking (design-contrast validator)

For statically determinable color pairs:

- Parse CSS to build a map of element selectors → color/background-color values
- Where both foreground and background are known token values (or hardcoded colors), compute contrast ratio
- Use the WCAG 2.1 relative luminance formula (no DOM needed — it's a color math calculation)
- Skip elements where colors are dynamic bindings or inherited from unknown ancestors

**Limitations to document clearly:**
- Static analysis can't check inherited background colors through the cascade
- Dynamic colors (bindings like `style="color: {themeColor}"`) can't be validated
- Media-query-dependent color changes can't be checked

### CSS Parsing

Use a lightweight CSS parser (e.g., `css-tree` or `postcss`) to parse the `<style>` block:

```typescript
import { parse as parseCss } from 'css-tree';

function extractStyleValues(css: string): StyleDeclaration[] {
  const ast = parseCss(css);
  // Walk declarations, collect property → value pairs with selector context
}
```

This gives us structured access to all CSS declarations without needing a browser engine.

### Integration with Existing Validators

The design-system validator complements (doesn't replace) the existing validators:
- **a11y-validator** → structural accessibility (alt text, ARIA, form labels)
- **seo-validator** → SEO metadata and semantics
- **design-system-validator** → visual conformity to design tokens

### What About Responsive Validation?

Static CSS analysis CAN check media query breakpoint values (e.g., "all breakpoints use the defined set") and CAN validate that token usage is consistent within each media query block. It CANNOT verify that the rendered layout looks correct at each breakpoint — that requires visual regression testing, which is a different tool.

## Implementation Plan

### Phase 1: Token parser + CSS validation

1. Implement `parse-design-md.ts` — parse YAML frontmatter from DESIGN.md into token map
2. Implement `token-matcher.ts` — utilities to match CSS values against token scales
3. Implement `design-tokens` validator — parse `<style>` block, validate color/spacing/radius/typography against tokens
4. Register as Jay validation plugin via `plugin.yaml`

### Phase 2: Structural rules

5. Implement `design-structure` validator — DOM tree analysis for max font weights, primary button count, custom rules

### Phase 3: Contrast checking

6. Implement `design-contrast` validator — static color pair analysis with WCAG AA contrast ratio computation

### Phase 4: Inline style validation

7. Extend token validator to also check `style="..."` attributes on elements (not just `<style>` blocks)

## Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| **Static CSS analysis (this design)** | Fast, no external deps, works in CI, deterministic | Can't check cascade/inheritance, misses runtime styles |
| **Happy DOM computed styles** | Theoretically checks cascade | Doesn't actually work — Happy DOM doesn't compute CSS |
| **Playwright/browser rendering** | Real computed styles, real media queries | Slow, requires running server, flaky in CI |
| **Stylelint custom rules** | Mature CSS linting ecosystem | Doesn't understand jay-html structure, no contract awareness |

Static analysis is the right trade-off for a build-time linter. For visual regression testing (pixel-perfect responsive validation), that's a separate tool (e.g., Playwright screenshot comparison) — not a validation plugin.

## Verification Criteria

1. Plugin loads via standard `plugin.yaml` registration
2. `jay-stack validate` runs design-system rules alongside a11y and seo validators
3. Hardcoded colors in `<style>` blocks produce warnings with token suggestions
4. Spacing values outside the scale produce warnings
5. Structural rules (max font weights, max primary buttons) are enforced
6. Contrast violations on statically determinable color pairs are flagged
7. Agent-friendly suggestions reference the DESIGN.md token names
