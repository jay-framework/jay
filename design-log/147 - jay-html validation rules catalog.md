# Design Log #147 — Jay-HTML Validation Rules Catalog

## Background

DL#145 introduced pluggable jay-html validation — a mechanism for plugins to provide validation rules that run against parsed jay-html templates during `jay-stack validate`. Three validator plugins now exist:

- **wix-media** — Wix-specific media optimization rules (external package)
- **seo-validator** — SEO best practices (`packages/plugins/seo-validator`)
- **a11y-validator** — WCAG accessibility rules (`packages/plugins/a11y-validator`)

This design log catalogs all validation rules across all plugins as a single reference.

## Validator Plugins

### wix-media / media-optimization

Package: `@jay-framework/wix-media` (external, dev dependency)

| Rule                                   | Severity | Element                        | What it checks                                                                            |
| -------------------------------------- | -------- | ------------------------------ | ----------------------------------------------------------------------------------------- |
| Hardcoded Wix URL without optimization | error    | `<img>`, `<video>`, `<source>` | Static URLs from `static.wixstatic.com/media/` missing `/v1/` transform params            |
| Wix-image binding without optimization | error    | `<img>`, `<video>`, `<source>` | Template bindings to tags with `meta.mediaType: wix-image` without `/v1/` suffix appended |
| Local image reference                  | error    | `<img>`, `<video>`, `<source>` | Local file paths (`/images/*.png`) that should be uploaded to Wix Media Manager           |

All three rules check `src` and `poster` attributes. Rule B uses `walkElements` + `resolveBinding` to resolve bindings through contracts and headless imports.

### seo-validator / seo

Package: `@jay-framework/seo-validator` (monorepo, dev dependency)

| Rule                     | Severity | Element       | What it checks                                                                    |
| ------------------------ | -------- | ------------- | --------------------------------------------------------------------------------- |
| Image missing alt        | warning  | `<img>`       | No `alt` attribute (hurts SEO and accessibility)                                  |
| Image missing dimensions | warning  | `<img>`       | No `width`/`height` attributes, inline style dimensions, or `srcset` — causes CLS |
| Image missing loading    | warning  | `<img>`       | No `loading` attribute — should use `loading="lazy"` or `loading="eager"`         |
| Empty anchor             | warning  | `<a>`         | Anchor with `href` but no visible text, no `aria-label`, and no child `<img>`     |
| Missing h1               | warning  | `<h1>`        | Page has no `<h1>` element                                                        |
| Multiple h1              | warning  | `<h1>`        | Page has more than one `<h1>` element                                             |
| Skipped heading level    | warning  | `<h2>`–`<h6>` | Heading level skips (e.g., `<h1>` followed by `<h3>`)                             |
| Missing main landmark    | warning  | `<main>`      | Page body has no `<main>` element                                                 |
| Missing fetchpriority    | warning  | `<img>`       | Page has images but none with `fetchpriority="high"` — LCP image should be prioritized |
| Missing title            | warning  | `<title>`     | No `<title>` in `<head>` (via `ctx.head`)                                         |
| Missing meta description | warning  | `<meta>`      | No `<meta name="description">` in `<head>`                                        |
| Missing canonical        | warning  | `<link>`      | No `<link rel="canonical">` in `<head>`                                           |
| Noindex robots           | warning  | `<meta>`      | `<meta name="robots">` contains `noindex`                                         |

The dimensions rule accepts three forms of sizing: `width`/`height` attributes, inline `style` with `width:` and `height:`, or `srcset` (responsive images).

The head metadata rules use `ctx.head` — a parsed representation of the `<head>` section added to the validation context.

### a11y-validator / accessibility

Package: `@jay-framework/a11y-validator` (monorepo, dev dependency)

| Rule                           | Severity | Element                             | WCAG  | What it checks                                                                        |
| ------------------------------ | -------- | ----------------------------------- | ----- | ------------------------------------------------------------------------------------- |
| Image missing alt              | error    | `<img>`                             | 1.1.1 | No `alt` attribute                                                                    |
| Form input without label       | error    | `<input>`, `<select>`, `<textarea>` | 1.3.1 | No `<label for>`, no wrapping `<label>`, no `aria-label`/`aria-labelledby`            |
| Button without accessible name | error    | `<button>`                          | 4.1.2 | No text, no `aria-label`, no `aria-labelledby`, no child `<img alt>`                  |
| Media autoplay without muted   | error    | `<video>`, `<audio>`                | 1.4.2 | `autoplay` attribute present without `muted`                                          |
| Invalid ARIA role              | error    | any                                 | 4.1.2 | `role` attribute value not in WAI-ARIA role list                                      |
| Viewport disables zoom         | error    | `<meta>`                            | 1.4.4 | `user-scalable=no` or `maximum-scale` < 2 in viewport meta (via `ctx.head`)           |
| Positive tabindex              | warning  | interactive + `[role]`              | 2.4.3 | `tabindex` > 0 disrupts natural tab order                                             |
| Focusable without role         | warning  | non-interactive                     | 4.1.2 | `<div tabindex="0">` or similar without `role` — screen readers don't know what it is |

The form label rule skips `type="hidden"`, `type="submit"`, `type="button"`, and `type="reset"` inputs.

## Rule Overlap

**Image alt** is checked by both SEO (warning) and a11y (error). This is intentional:

- Different severity reflects different impact framing
- A project using both plugins sees both findings — the fix is the same
- Projects may use only one of the two plugins

No other rules overlap between plugins.

## Validation Context: Head Metadata

The `JayHtmlValidationContext` includes a `head?: JayHtmlHeadMeta` field parsed from the jay-html `<head>` section:

```typescript
interface JayHtmlHeadMeta {
  title?: string;
  meta: Array<{ name?: string; property?: string; content: string }>;
  links: Array<{ rel: string; href: string; [key: string]: string }>;
}
```

This enables validators to check `<title>`, `<meta>`, and `<link>` tags without needing raw HTML access.

## What's NOT statically checkable

These are common accessibility/SEO concerns that can't be validated from jay-html templates:

- **`<html lang>`** — outside jay-html scope (on the `<html>` element in the page shell)
- **Color contrast** — requires computed styles, not available at template level
- **Keyboard traps** — requires runtime interaction testing
- **Focus management** — requires runtime behavior analysis
