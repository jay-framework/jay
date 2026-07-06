# Design System (DESIGN.md)

The project uses a `DESIGN.md` file to define design tokens — colors, typography, spacing, rounded corners, and component specs. The validator enforces these tokens across all `.jay-html` pages.

## How It Works

Place a `DESIGN.md` alongside your pages. It applies to that route and all child routes unless a child has its own `DESIGN.md`.

```
src/pages/
  DESIGN.md              ← applies to all routes
  products/
    DESIGN.md            ← overrides for /products and children
  admin/
    DESIGN.md            ← separate system for /admin
```

## Token Format

DESIGN.md uses YAML frontmatter following the [DESIGN.md spec](https://github.com/google-labs-code/design.md):

```yaml
---
colors:
  primary: '#2563eb'
  text: '#0f172a'
  background: '#ffffff'
  surface: '#f8fafc'

typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 2.5rem
    fontWeight: 700
    lineHeight: 1.2
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6

spacing:
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem

rounded:
  sm: 0.25rem
  md: 0.5rem
  full: 9999px

components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.background}'
    rounded: '{rounded.md}'
  jay:product-card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.md}'

animations:
  fade-in:
    duration: 300ms
    easing: cubic-bezier(0, 0, 0.2, 1)
  slide-up:
    duration: 500ms
    easing: cubic-bezier(0.4, 0, 0.2, 1)
  micro:
    duration: 150ms
    easing: ease-in-out

rules:
  max-font-weights: 3
  max-primary-buttons: 1
  require-contrast-aa: true
---
```

Values use `{path.to.token}` references — e.g., `{colors.primary}` resolves to `"#2563eb"`.

## Using Tokens in CSS

Use the token values directly in your `<style>` blocks:

```css
.card {
  background-color: #f8fafc; /* matches {colors.surface} ✓ */
  border-radius: 0.5rem; /* matches {rounded.md} ✓ */
  padding: 1rem; /* matches {spacing.md} ✓ */
  color: #0f172a; /* matches {colors.text} ✓ */
  transition: opacity 300ms cubic-bezier(0, 0, 0.2, 1); /* matches fade-in preset ✓ */
}
```

CSS custom properties (`var(--name)`) are always accepted.

## Component Specs

The `components` section defines expected styles for HTML elements (matched by class) and jay headless components (matched by `jay:` prefix):

- `button-primary` → validates elements with class `.button-primary`
- `jay:product-card` → validates the inline template inside `<jay:product-card>`

## Exceptions

When a value intentionally breaks the design system, exempt it:

**In CSS** — add a comment after the declaration:

```css
.hero {
  padding: 7.5rem 0; /* design-system: allow */
}
```

**On elements** — add the `jay-design="allow"` attribute:

```html
<div style="margin-top: 7.5rem" jay-design="allow"></div>
```

## Validation Errors

These are the errors the validator produces. Use them to align your CSS with the design system.

**Hardcoded color:**

```
⚠ Hardcoded color "#ff0000" for color not in design system
  Suggestion: Use token {colors.error} ("#dc2626") or add to DESIGN.md
```

**Off-scale spacing:**

```
⚠ padding value "13px" not in spacing scale
  Suggestion: Use a spacing token: {spacing.md} ("1rem"), {spacing.lg} ("1.5rem")
```

**Off-scale border-radius:**

```
⚠ border-radius "10px" not in rounded scale
  Suggestion: Use a rounded token: {rounded.md} ("0.5rem"), {rounded.full} ("9999px")
```

**Component mismatch:**

```
⚠ <jay:product-card> inline template: background-color should be "#f8fafc"
  per jay:product-card component spec, found "#ffffff"
```

**Too many font weights:**

```
⚠ 4 unique font-weight values found (max: 3)
  Suggestion: Reduce to 3 font-weight values from the typography tokens
```

**Animation duration not in presets:**

```
⚠ transition-duration "200ms" not in animation presets
  Suggestion: Use an animation preset duration: fade-in (300ms), slide-up (500ms), micro (150ms)
```

**Animation easing not in presets:**

```
⚠ transition-timing-function "ease" not in animation presets
  Suggestion: Use an animation preset easing: fade-in (cubic-bezier(0, 0, 0.2, 1)), micro (ease-in-out)
```

**Missing reduced-motion media query:**

```
⚠ Page uses transitions/animations but has no @media (prefers-reduced-motion) override
  Suggestion: Add @media (prefers-reduced-motion: reduce) { * { transition-duration: 0s !important; animation-duration: 0s !important; } }
```

**Low contrast:**

```
⚠ Contrast ratio 2.8:1 below WCAG AA (4.5:1) for color "#94a3b8"
  on background "#f8fafc"
  Suggestion: Darken text color or lighten background
```
