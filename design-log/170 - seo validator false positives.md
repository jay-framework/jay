# DL#170 — SEO Validator False Positives

## Background

The SEO validator (`@jay-framework/seo-validator`) validates each `.jay-html` file independently for page-level SEO rules: headings, images, meta tags, landmarks. It doesn't distinguish between pages and headfull components, and it can't see inside dynamic content bindings like `{post.content}`.

This produces false positives on the jay-website, reported by the designer agent.

### Related Design Logs

- DL#145 — Pluggable jay-html validation
- DL#147 — Jay-html validation rules catalog
- DL#162 — Structural headfull components

## Problem

Four categories of false positives:

### 1. Component-level page warnings

Headfull components (`site-header.jay-html`, `site-footer.jay-html`, `docs-sidebar.jay-html`) are flagged with:

- `Page has no <h1> element`
- `Page has no <main> landmark`
- `Page has no <title> element`
- `Page has no <meta name="description">`
- `No image has fetchpriority="high"`

These elements belong to the host page, not the component fragment.

### 2. Heading level skip — real issue, not false positive

Template has `<h1>` then sidebar uses `<h3>`. This is a **real issue** — the sidebar should use `<h2>`, not `<h3>`. A page can have multiple `<h2>` elements. The validator correctly caught the heading skip. The fix is in the jay-website sidebar template, not the validator.

### 3. Image warnings when page has no static images

Pages with zero static `<img>` elements get warned about missing `loading` attribute. If the page has no static images (only dynamic content via html-string bindings), there's nothing for the designer to fix.

### 4. fetchpriority on pages with no static images

Pages with zero static `<img>` elements (only dynamic content or `<video>`) get warned about missing `fetchpriority="high"`. Nothing to add the attribute to.

## Design

### Fix 1: Skip page-level rules for headfull components

The validator receives a context (`ctx`) with the parsed jay-html. Detect if the file is a headfull component:

- **Headfull component indicators:** file is in `src/components/` directory, OR the jay-html has `<script type="application/jay-data">` but the file is imported via `<script type="application/jay-headfull">` in other files
- **Simpler heuristic:** if the jay-html has no `<title>` tag in `<head>` and no page-level contract with `params`, it's likely a component

The simplest approach: the validation context (`ctx`) should include a flag indicating whether the file is a page or a component. The compiler/dev-server knows this — it can pass the flag.

If a flag isn't available, use path-based detection: files under `src/components/` are components. Skip page-level rules (`h1`, `main`, `title`, `meta`, `fetchpriority`) for components.

### Fix 2: Image loading only for static images

Only warn about missing `loading` attribute on `<img>` elements that are static in the template. If the page has zero static `<img>` elements, suppress the warning entirely — the designer has no images to add the attribute to.

Note: heading level skip (h1 → h3) on the jay-website is a real issue in the sidebar template, not a validator false positive. The sidebar should use `<h2>` instead of `<h3>`.

### Fix 3: fetchpriority only when static images exist

Only warn about missing `fetchpriority="high"` when the template has at least one static `<img>` element. Don't count images inside html-string bindings or `<video>` elements.

### Fix 4: Video-only pages

Don't warn about `fetchpriority` on pages where the LCP candidate is `<video>` (no `<img>` at all). `fetchpriority` on `<video>` has limited browser support and different semantics.

## Questions

1. ~~Should the ctx include a `isComponent` flag from the compiler?~~ Yes — cleanest approach.

2. ~~Should html-string suppression be per-rule or global?~~ Not needed — the fix is simpler: only warn about image loading when static images exist.

3. ~~Suppress duplicate-adjacent-text a11y rule for components?~~ Not for now.

## Implementation Plan

### Phase 1: Component detection

**`packages/plugins/seo-validator/lib/validators/seo-validator.ts`**:

- Add path-based component detection: if `ctx.filePath` contains `/components/` or matches a component pattern, set `isComponent = true`
- Skip page-level rules when `isComponent`: h1, main, title, meta description, fetchpriority

### Phase 2: Image loading for static images only

- Count static `<img>` elements in the template body
- Only warn about missing `loading` attribute if count > 0
- Don't suppress heading rules — heading issues are real (fix in the template)

### Phase 3: fetchpriority fix

- Count static `<img>` elements in the template
- Only warn about missing fetchpriority if count > 0
- Exclude `<video>` from fetchpriority checks

### Phase 4: Tests

- Add test cases for component detection (path-based)
- Add test cases for html-string suppression
- Add test for fetchpriority with no images
- Verify existing rules still fire on actual pages

### Phase 5: Update DL#147 validation catalog

- Document the suppression rules in the catalog
- Note which rules are page-only vs universal

### Phase 6: Verify

- `yarn confirm`
- Test with jay-website to verify false positives are gone

## Trade-offs

| Choice                             | Pro                                            | Con                                  |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------ |
| Path-based component detection     | Simple, no framework change                    | Fragile if project structure differs |
| ctx.isComponent flag from compiler | Accurate, project-structure-independent        | Requires framework change            |
| html-string suppression            | Eliminates false positives for dynamic content | May hide real issues in static parts |
| Suppress all rules for components  | No false positives                             | May miss real issues in components   |

## Implementation Results

**Component detection** (`seo-validator.ts`):

- `isComponent()` checks if `filePath` contains `/components/`
- Page-level rules (h1, main, title, meta description, fetchpriority) skipped for components
- Element-level rules (img alt, heading hierarchy, anchor text) still run on components
- Head metadata checks short-circuit with `if (isComp) return findings`

**fetchpriority fix:**

- Variable renamed from `hasImage` to `hasStaticImage`
- Only warns when static `<img>` exists in template — pages with only dynamic content or `<video>` are not flagged

**Heading skip:**

- Confirmed as a real issue in the jay-website sidebar (uses `<h3>` instead of `<h2>`)
- No validator change needed — the validator correctly identifies it

**Tests:** 8 new tests (52 total):

- Component skips: h1, main, title, meta description, fetchpriority
- Component still checks: img alt
- No fetchpriority warning: text-only page, video-only page
