# Design Log #176 — Validation Warning Suppression Audit

## Background

DL#174 introduced `<script type="application/jay-validations">` as a page-level mechanism for suppressing validation warnings. The rule: every warning must have a way to suppress it. If it can't be suppressed, it should be an error (the developer can't intentionally override it).

## Audit Results

Three suppression mechanisms exist:

1. **Fix the issue** — add the missing attribute (e.g., `alt=""`, `loading="lazy"`) — this resolves rather than suppresses
2. **Inline suppression** — `/* design-system: allow */` CSS comment, `jay-design="allow"` attribute, `// jay-dom: allow` JS comment
3. **Page-level override** — `<script type="application/jay-validations">` with plugin-keyed YAML

### Warnings that should become errors

These represent correctness issues — a developer can't intentionally choose to break these:

| Current warning                         | Validator | Reason                                       |
| --------------------------------------- | --------- | -------------------------------------------- |
| `<jay:X> is missing required prop "Y"`  | core      | Missing required prop causes runtime failure |
| `<jay:X> prop phase ordering violation` | core      | Binding source unavailable at consume time   |

### Warnings already suppressible (no changes needed)

| Warning                                                                  | Mechanism                                            |
| ------------------------------------------------------------------------ | ---------------------------------------------------- |
| Design token mismatches (color, spacing, rounded, typography, animation) | `/* design-system: allow */` or `jay-design="allow"` |
| Design component style mismatches                                        | Same                                                 |
| Design contrast ratio                                                    | Same                                                 |
| Undefined CSS variables                                                  | Same                                                 |
| No LCP image                                                             | `jay-validations: seo: { no-lcp-image: true }`       |
| Direct DOM access                                                        | `// jay-dom: allow`                                  |

### Warnings that are "fix it" — resolved by adding the right attribute

These don't need a separate suppression because the fix IS the suppression. Adding the attribute removes the warning and is always the right action:

| Warning                                      | Fix                                                |
| -------------------------------------------- | -------------------------------------------------- |
| Image missing `alt`                          | Add `alt="description"` or `alt=""` for decorative |
| Image missing dimensions                     | Add `width`/`height` or use CSS sizing             |
| Image without `loading`                      | Add `loading="lazy"` or `loading="eager"`          |
| Anchor without text/aria-label               | Add visible text or `aria-label`                   |
| Page has no `<h1>` / multiple `<h1>`         | Fix heading structure                              |
| Page has no `<main>`                         | Add `<main>` landmark                              |
| Page has no `<title>` / `<meta description>` | Add meta tags                                      |
| Canonical URL not absolute                   | Make it absolute                                   |
| External stylesheet without preconnect       | Add `<link rel="preconnect">`                      |
| Font stylesheet missing display=swap         | Add `&display=swap`                                |
| Heading level skipped                        | Fix heading hierarchy                              |
| A11Y: positive tabindex                      | Remove or set to 0                                 |
| A11Y: focusable without role                 | Add role                                           |
| A11Y: label/for mismatch                     | Fix the id reference                               |
| A11Y: label with multiple controls           | Restructure                                        |
| A11Y: adjacent duplicate text                | Add `aria-hidden="true"` to duplicate              |

### Warnings that need `jay-validations` suppression added

These are cases where the "fix" may be intentionally wrong for the page:

| Warning                                              | Plugin key    | Rule name                | Why suppression needed                              |
| ---------------------------------------------------- | ------------- | ------------------------ | --------------------------------------------------- |
| `<meta name="robots" content="noindex">`             | seo           | allow-noindex            | Intentional for admin/draft pages                   |
| `@media breakpoint not in DESIGN.md`                 | design-system | allow-custom-breakpoints | One-off or container-query breakpoints              |
| `Page uses animations but no prefers-reduced-motion` | design-system | allow-no-reduced-motion  | Very subtle animations that don't need the override |
| `Font missing metric-matched fallback`               | design-system | allow-font-no-fallback   | Intentional when CLS is acceptable                  |
| CSS `@import` of external URL                        | seo           | allow-css-import         | Intentional external dependency                     |

### Informational warnings (not errors, not suppressible, keep as-is)

| Warning                            | Reason to keep                         |
| ---------------------------------- | -------------------------------------- |
| `public/robots.txt not found`      | Project-level reminder, not per-page   |
| `site.baseUrl not configured`      | Project-level reminder                 |
| `deprecated jay-params`            | Migration guidance                     |
| Contract param mismatches          | Developer feedback, not a style choice |
| `<jay:X> passes unknown attribute` | Developer feedback                     |
| Primary button count exceeded      | Structural design rule                 |

## Implementation Plan

### Phase 1: Promote to errors

1. In `validate.ts`, change missing-required-prop and phase-ordering-violation from `warnings` to `errors`

### Phase 2: Add `jay-validations` suppression to SEO

Add `isSuppressed` checks for:

- `seo: { allow-noindex: true }` — suppress noindex warning
- `seo: { allow-css-import: true }` — suppress CSS @import warning

### Phase 3: Add `jay-validations` suppression to design-system

Add `jay-validations` support to the design-system validators for:

- `design-system: { allow-custom-breakpoints: true }` — suppress non-standard breakpoint warning
- `design-system: { allow-no-reduced-motion: true }` — suppress prefers-reduced-motion warning
- `design-system: { allow-font-no-fallback: true }` — suppress font fallback warning

### Phase 4: Update suggestion messages

Every warning that has `jay-validations` suppression should mention it in the suggestion, pointing at `agent-kit/designer/validation-guide.md`.
