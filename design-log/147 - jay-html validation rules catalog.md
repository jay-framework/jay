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

| Rule                     | Severity | Element       | What it checks                                                                         |
| ------------------------ | -------- | ------------- | -------------------------------------------------------------------------------------- |
| Image missing alt        | warning  | `<img>`       | No `alt` attribute (hurts SEO and accessibility)                                       |
| Image missing dimensions | warning  | `<img>`       | No `width`/`height` attributes, inline style dimensions, or `srcset` — causes CLS      |
| Image missing loading    | warning  | `<img>`       | No `loading` attribute — should use `loading="lazy"` or `loading="eager"`              |
| Empty anchor             | warning  | `<a>`         | Anchor with `href` but no visible text, no `aria-label`, and no child `<img>`          |
| Missing h1               | warning  | `<h1>`        | Page has no `<h1>` element                                                             |
| Multiple h1              | warning  | `<h1>`        | Page has more than one `<h1>` element                                                  |
| Skipped heading level    | warning  | `<h2>`–`<h6>` | Heading level skips (e.g., `<h1>` followed by `<h3>`)                                  |
| Missing main landmark    | warning  | `<main>`      | Page body has no `<main>` element                                                      |
| Missing fetchpriority    | warning  | `<img>`       | Page has images but none with `fetchpriority="high"` — LCP image should be prioritized |
| Missing title            | warning  | `<title>`     | No `<title>` in `<head>` (via `ctx.head`)                                              |
| Missing meta description | warning  | `<meta>`      | No `<meta name="description">` in `<head>`                                             |
| Missing canonical        | warning  | `<link>`      | No `<link rel="canonical">` in `<head>`                                                |
| Noindex robots           | warning  | `<meta>`      | `<meta name="robots">` contains `noindex`                                              |

| Missing preconnect | warning | `<link>` | External stylesheet `<link>` without a preceding `<link rel="preconnect">` for that domain |
| Font missing display=swap | warning | `<link>` | Google Fonts / Typekit stylesheet URL missing `display=swap` parameter |

The dimensions rule accepts three forms of sizing: `width`/`height` attributes, inline `style` with `width:` and `height:`, or `srcset` (responsive images).

The head metadata rules use `ctx.head` — a parsed representation of the `<head>` section added to the validation context.

### Render-blocking resource rules (added DL#147a)

**Missing preconnect:** For each `<link rel="stylesheet" href="https://...">` in `ctx.head`, extract the origin (scheme + host). If no `<link rel="preconnect" href="https://that-host">` exists earlier in `ctx.head.links`, flag it. Only applies to external origins (different from the page's own domain). Suggestion: `Add <link rel="preconnect" href="https://fonts.googleapis.com"> before the stylesheet`.

**Font missing display=swap:** Match stylesheet `href` against known font service domains (`fonts.googleapis.com`, `use.typekit.net`). If the URL doesn't contain `display=swap` (Google) or equivalent, flag it. Suggestion: `Add &display=swap to the Google Fonts URL to avoid render-blocking text`.

### a11y-validator / accessibility

Package: `@jay-framework/a11y-validator` (monorepo, dev dependency)

| Rule                           | Severity | Element                             | WCAG  | What it checks                                                                        |
| ------------------------------ | -------- | ----------------------------------- | ----- | ------------------------------------------------------------------------------------- |
| Image missing alt              | error    | `<img>`                             | 1.1.1 | No `alt` attribute                                                                    |
| Form input without label       | error    | `<input>`, `<select>`, `<textarea>` | 1.3.1 | No `<label for>`, no wrapping `<label>`, no usable `aria-label`/`aria-labelledby`     |
| Empty `aria-label`             | error    | labelable controls                  | 4.1.2 | `aria-label` present but empty/whitespace (DL#161)                                    |
| Broken `aria-labelledby`       | error    | labelable controls                  | 1.3.1 | Empty `aria-labelledby` or id token(s) missing in file (DL#161)                       |
| Duplicate `id`                 | error    | any                                 | 4.1.1 | Same `id` value used more than once in the file (DL#161)                              |
| Button without accessible name | error    | `<button>`                          | 4.1.2 | No text, no `aria-label`, no `aria-labelledby`, no child `<img alt>`                  |
| Media autoplay without muted   | error    | `<video>`, `<audio>`                | 1.4.2 | `autoplay` attribute present without `muted`                                          |
| Invalid ARIA role              | error    | any                                 | 4.1.2 | `role` attribute value not in WAI-ARIA role list                                      |
| Viewport disables zoom         | error    | `<meta>`                            | 1.4.4 | `user-scalable=no` or `maximum-scale` < 2 in viewport meta (via `ctx.head`)           |
| Positive tabindex              | warning  | interactive + `[role]`              | 2.4.3 | `tabindex` > 0 disrupts natural tab order                                             |
| Focusable without role         | warning  | non-interactive                     | 4.1.2 | `<div tabindex="0">` or similar without `role` — screen readers don't know what it is |
| Multiple controls in `<label>` | warning  | `<label>`                           | 1.3.1 | More than one labelable control nested in one label (DL#161)                          |
| Orphan `label[for]`            | warning  | `<label>`                           | 1.3.1 | `for` points to an `id` that does not exist in the file (DL#161)                      |
| Adjacent duplicate text        | warning  | any                                 | —     | Adjacent siblings with identical visible text (screen readers announce twice)         |

The form label rule skips `type="hidden"`, `type="submit"`, `type="button"`, and `type="reset"` inputs. Labelable inputs include `checkbox` and `radio` (DL#161). Empty `aria-label` / unresolved `aria-labelledby` do not count as an accessible name.

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
