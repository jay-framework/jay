# Design Log #166 — A11y Form and Label Validation Rules

## Background

`@jay-framework/a11y-validator` (DL#145, DL#147) already checks that text-like inputs, selects, and textareas have an associated label via `<label for>`, wrapping `<label>`, `aria-label`, or `aria-labelledby`.

Gaps remain for common form/accessibility mistakes that AI agents and designers make in jay-html:

- `checkbox` / `radio` are skipped by `LABELABLE_INPUTS`
- empty `aria-label=""` and unresolved `aria-labelledby` pass as “labeled”
- multiple form controls inside one `<label>` are accepted
- duplicate `id` values are not flagged
- orphan `<label for="...">` pointing at a missing `id` is not flagged

## Problem

Static validation under-reports WCAG 1.3.1 / 4.1.2 form naming issues. Agents self-correct only when findings include actionable `suggestion` text.

## Questions and Answers

### Q1: One PR or several?

**A:** One PR for the whole form/label scope. Nesting of interactive elements, `lang`, and runtime axe stay out of scope.

### Q2: Severity?

**A:**

| Finding | Severity |
| ------- | -------- |
| Missing label (incl. checkbox/radio) | error |
| Empty `aria-label` | error |
| `aria-labelledby` with missing/empty id refs | error |
| Duplicate `id` | error |
| Multiple labelable controls in one `<label>` | warning |
| Orphan `label[for]` (no matching `id`) | warning |

### Q3: Does wrapping `<label>` still count for checkbox/radio?

**A:** Yes — same association rules as other inputs. Explicit `for`/`id` preferred when multiple controls share a visual group; `fieldset`/`legend` is not required in this PR.

### Q4: How does `aria-labelledby` resolve?

**A:** Split on whitespace; every token must match an element `id` in the same jay-html file. Missing any token → error. Empty attribute → error.

### Q5: Version bump in the PR?

**A:** No. Maintainers bump `@jay-framework/a11y-validator` on release (currently `0.22.2`).

## Design

### Rules (additions / tightenings)

1. **Extend labelable inputs** — add `checkbox`, `radio` to `LABELABLE_INPUTS`. Still skip `hidden`, `submit`, `button`, `reset`.

2. **Empty `aria-label`** — if attribute is present and `trim()` is empty → error (do not treat as labeled).

3. **Broken `aria-labelledby`** — if present: empty / only whitespace → error; any id token not found in the document → error. If all ids resolve, treat as labeled (skip “no label” finding).

4. **Multiple controls in one `<label>`** — count labelable descendants (`input` except ignored types, `select`, `textarea`). If count > 1 → warning on `<label>`.

5. **Duplicate `id`** — collect all `id` attributes; any value used more than once → error per duplicate occurrence after the first (or one finding listing the id).

6. **Orphan `label[for]`** — if `for` is non-empty and no element has that `id` → warning.

### Implementation approach

Single pre-pass over the DOM:

- `Set` / `Map` of all `id` → count
- `Set` of existing ids for ARIA/`for` lookup
- for each `<label>`, count labelable descendants and check `for`

Then existing `walkElements` + tightened `checkLabel`.

### Examples

✅ Good:

```html
<label for="email">Email</label>
<input type="email" id="email" />

<label><input type="checkbox" /> Agree</label>

<input type="radio" id="a" aria-labelledby="opt-a" />
<span id="opt-a">Option A</span>
```

❌ Bad:

```html
<input type="checkbox" />
<input aria-label="" />
<input aria-labelledby="missing" />
<label>From <input type="date" /> To <input type="date" /></label>
<div id="x"></div>
<span id="x"></span>
<label for="nope">Name</label>
```

## Implementation Plan

### Phase 1: Design log + index

1. This document + `design-log/index.md` entry under validation/plugins.

### Phase 2: Tests

2. Vitest cases for each rule (pass + fail). No `toContain` on code files.

### Phase 3: Implementation

3. Update `a11y-validator.ts` helpers and `validate`.
4. Run package tests.

### Phase 4: Catalog + results

5. Append new rows to DL#147 a11y table.
6. Append Implementation Results here.

## Verification Criteria

1. checkbox/radio without association → error
2. `aria-label=""` → error; non-empty → passes label check
3. `aria-labelledby` missing target → error
4. two inputs in one label → warning
5. duplicate ids → error
6. `label for` without matching id → warning
7. Existing label/`alt`/button/tabindex tests still pass

## Trade-offs

| Decision | Benefit | Cost |
| -------- | ------- | ---- |
| Per-file id uniqueness only | Matches jay-html validation model | Won't catch cross-file collisions |
| No fieldset/legend rule yet | Keeps PR focused | Radio groups still weak without legend |
| Warning for multi-control label | Avoids hard break on legacy templates | Agents may ignore warnings |

## Out of Scope

- Nested interactive (`<a>` in `<a>`)
- `<html lang>`
- Runtime axe / focus / toast timing
- Color-only / contrast (design-system-validator)

## Implementation Results

### Phase 2–3: Tests + code

- Extended `LABELABLE_INPUTS` with `checkbox` / `radio`
- Tightened `checkLabel` for empty `aria-label` and resolved `aria-labelledby` tokens against file ids
- Pre-pass: duplicate `id` counts, orphan `label[for]`, multi-control `<label>`
- Tests added in `a11y-validator.test.ts`

### Test results

`packages/plugins/a11y-validator`: **54/54 passing**

### Catalog

Updated DL#147 a11y rules table with the new rows.

### Deviations from design

None material. Multi-control warning message wording uses “contains N form controls” (same intent as designed).
