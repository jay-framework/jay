# Font Fallback Patterns

## Why metric-matched fallbacks matter

When a web font loads via `font-display: swap`, the browser renders a system fallback font first. Differences in vertical metrics (ascent, descent, line-gap) and horizontal metrics (character width) between the web font and fallback cause visible layout jumps — known as Flash of Unstyled Text (FOUT) — and degrade Cumulative Layout Shift (CLS).

A metric-matched fallback `@font-face` overrides the system font's metrics to match the web font, so the swap is visually seamless.

## Using the action

Generate a fallback `@font-face` for any known Google Font or system font:

```bash
npx jay-stack-cli action design-system-validator/fontFallback --input '{"primary":"Inter","fallback":"Arial"}'
```

This outputs the CSS you need:

```css
@font-face {
  font-family: 'Inter Fallback';
  src: local('Arial'), local('ArialMT');
  ascent-override: 90.44%;
  descent-override: 22.52%;
  line-gap-override: 0%;
  size-adjust: 107.12%;
}
```

Then add the fallback to your `font-family` stack:

```css
body {
  font-family: 'Inter', 'Inter Fallback', sans-serif;
}
```

## Where to place the fallback CSS

- **DESIGN.md**: If your design system defines fonts in the frontmatter, add the fallback `@font-face` to the page's `<style>` block or a shared stylesheet
- **Page `<head>` styles**: For per-page fonts, place the `@font-face` in the page's `<style>` tag

## Common font pairs

| Web font         | Fallback | Category   |
| ---------------- | -------- | ---------- |
| Inter            | Arial    | sans-serif |
| Roboto           | Arial    | sans-serif |
| Open Sans        | Arial    | sans-serif |
| Playfair Display | Georgia  | serif      |
| Merriweather     | Georgia  | serif      |
| Lora             | Georgia  | serif      |

## Manual pattern

If the action doesn't support your font, you can write the fallback manually. The key CSS properties are:

- `size-adjust` — scales the fallback to match the web font's character width
- `ascent-override` — matches the space above the baseline
- `descent-override` — matches the space below the baseline
- `line-gap-override` — matches the inter-line spacing

```css
@font-face {
  font-family: 'MyFont-Fallback';
  src: local('Arial');
  size-adjust: <value>%;
  ascent-override: <value>%;
  descent-override: <value>%;
  line-gap-override: <value>%;
}
```

## Validation

The `font-fallbacks` validator detects `@font-face` rules that load from a URL without a companion metric-matched fallback. It checks both page CSS and DESIGN.md typography tokens.

To suppress a false positive, use the standard `/* design-system: allow */` comment after the `font-family` declaration.
