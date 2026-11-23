# 241 — Dark mode and theme-adaptive controls

**Status:** [Design] — review rounds 1–3 resolved; awaiting next review round and product approval. No production code yet.

## Decisions for the Implementer (TL;DR)

1. **Validators first.** One new validator entry, `color-scheme`, in the existing `design-system-validator`
   plugin (`lib/validators/design-color-scheme.ts`). It reports **five rule ids** (table below). All are
   **warnings**, all **page-only**, none needs a `DESIGN.md`.
2. **Quiet by default.** Every rule fires only on a **dark-capable** page (its CSS has a dark theme).
   Light-only pages never get a finding.
3. **One shared query** `findDarkThemeSignals(css)` (postcss + `postcss-selector-parser`) decides
   dark-capable and collects toggle rules. Toggle tokens are matched with the selector parser, never by
   substring (`.darker` is not `.dark`). A token is a theme signal **only in the selector's first compound
   or on a `:root`/`html`/`body` compound** — `.btn.dark` is a component variant, not a theme (Q2).
4. **`fixed-control-colors` reads raw declarations**, not `ResolvedStyle.value` — the cascade substitutes
   `var()` values (see Prior Art). It does not use DOM matching for toggle overrides (see Design).
5. **Controls checked:** `input` (except `type=submit|button|reset|checkbox|radio|range|color|image|hidden`),
   `select`, `textarea`. **Buttons are excluded in v1.** Properties: `color`, `background-color`,
   `background` (colour part only). No borders.
6. **Agent-kit guide second:** plugin guide `agent-kit/designer/dark-mode-patterns.md`; every suggestion
   ends with `See agent-kit/designer/dark-mode-patterns.md`. 3-line pointer in `jay-html-styling.md`.
7. **No framework feature**, and the toggle TS (`localStorage`, `storage` sync, system option) is
   **guide only**.

8. **Suppression keys follow the existing `allow-<rule-id>` pattern** (`allow-viewport-height`,
   `allow-font-no-fallback`): e.g. `design-system: { allow-fixed-control-colors: true }`.
9. **New dependency:** `postcss-value-parser` `^4.2.0` added to the plugin's `dependencies` in P4 (already
   in the lockfile transitively). The plugin's own `version` is **not** bumped.

| Rule id                            | Suppression key                          | Catches                                                                                             |
| ---------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `no-color-scheme-meta`             | `allow-no-color-scheme-meta`             | Dark-capable page, no `<meta name="color-scheme">` in `<head>`                                      |
| `color-scheme-meta-light-only`     | `allow-color-scheme-meta-light-only`     | Meta exists but its `content` does not enable dark                                                  |
| `dark-toggle-without-color-scheme` | `allow-dark-toggle-without-color-scheme` | A toggle token (`.dark`, `[data-theme="dark"]`, …) never sets `color-scheme: dark` — once per token |
| `light-dark-without-color-scheme`  | `allow-light-dark-without-color-scheme`  | `light-dark()` used, but nothing enables dark — dark branch is dead                                 |
| `fixed-control-colors`             | `allow-fixed-control-colors`             | A text control gets a literal colour that no dark rule overrides                                    |

## Background

Article point #6 ("Top 10 things AI gets wrong in web dev", Chrome DevRel):

- No `<meta name="color-scheme" content="light dark">` → white flash for dark users before CSS loads.
- Custom dark colours without `color-scheme` → native scrollbars and form controls stay light.
- `light-dark()` skipped for theme tokens.
- Binary light/dark toggle saved to `localStorage`, no "system" option; no `storage` listener for other tabs.

Jay has nothing for this today. Only DL#151 mentions `prefers-color-scheme` (breakpoint check ignores it,
`151 - design system validator plugin.md:546`).

## Problem

An agent's dark-theme page _looks_ right in a screenshot but (a) flashes white, (b) shows light native
inputs/scrollbars on a dark surface, or (c) has a `light-dark()` token that never turns dark. All three
are visible in the page source, so `jay-stack validate` can catch them.

## Prior Art / Adjacent Mechanisms (traced)

| What                                                                                                                                                                        | Where                                                                                           | Effect on this design                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validator ctx: `body`, merged `css`, `head.meta`, `validationOverrides`, `headlessImports[].providedHeadTags: string[]`                                                     | ✅ `compiler-shared/lib/plugin-validators.ts:25-55`                                             | Inputs to every rule                                                                                                                                                                                      |
| `head.meta` = every `<meta>` with `name`/`property` and `content`                                                                                                           | ✅ `jay-html-parser.ts:1051-1072`                                                               | Color-scheme meta arrives as `{name:'color-scheme', content}`                                                                                                                                             |
| `css` = local stylesheets (+`@import`) + head `<style>`; external `http(s)://` links skipped                                                                                | ✅ `jay-html-parser.ts:1143-1184`                                                               | Missing CSS can only hide a finding, never create one (all rules need a positive dark signal)                                                                                                             |
| `providedHeadTags` filled from plugin `headTags`                                                                                                                            | ✅ `stack-cli/lib/validate.ts:1855-1881`                                                        | Used by Q3                                                                                                                                                                                                |
| **Cascade substitutes `var()`**: `resolveCascade` / `resolveCascadeByBreakpoint` rewrite `ResolvedStyle.value` via `resolveVarReferences` using `:root`/`html` custom props | ✅ `css-cascade.ts:261-262`, `:316-318`, props collected `:75-79`                               | `input{background:var(--bg)}` would arrive as `#fff`. **So `fixed-control-colors` does not read cascade values**; it walks postcss declarations itself (raw `decl.value`, as `parseRules` reads at `:89`) |
| **`html`/`:root` aliased to the body root**; other selectors matched with `querySelectorAll` on the static tree                                                             | ✅ `css-cascade.ts:144-156`                                                                     | `[data-theme="dark"] input` / `.dark input` never match (the attribute is set by JS at runtime). **So toggle overrides are not DOM-matched** (Design → override rule)                                     |
| Breakpoint map: base rules + rules whose media string equals that breakpoint                                                                                                | ✅ `css-cascade.ts:284-310`                                                                     | Not used for overrides; we classify media ourselves (N4)                                                                                                                                                  |
| `/* design-system: allow */` detection `hasAllowComment(decl)`                                                                                                              | ✅ `css-cascade.ts:24`, `:38-50`                                                                | Reuse (export it) for per-line suppression                                                                                                                                                                |
| `getMediaQuery(rule)` walks parents for `@media`                                                                                                                            | ✅ `css-cascade.ts:53-62`                                                                       | Reuse to classify dark media                                                                                                                                                                              |
| Page-only gate (inline `filePath` check) + page-level `allow-*` suppression                                                                                                 | `design-viewport-height.ts:45-53`                                                               | Extract the gate into a **new** helper `isPageFile(filePath)` in `lib/validators/page-file.ts` (no such helper exists today); viewport-height keeps its inline check (no refactor in this log)            |
| `postcss-value-parser`                                                                                                                                                      | **not** a dependency of this package (`package.json` deps: postcss, postcss-selector-parser, …) | Added in P4 (TL;DR 9)                                                                                                                                                                                     |
| Test harness `makeContext`                                                                                                                                                  | `a11y-validator/test/validators/a11y-validator.test.ts:14-22`                                   | Same pattern                                                                                                                                                                                              |
| Guide pointer constant                                                                                                                                                      | `a11y-validator.ts:8`                                                                           | `DARK_MODE_GUIDE`                                                                                                                                                                                         |
| Suppression docs                                                                                                                                                            | `stack-cli/agent-kit-template/designer/validation-guide.md:91-130`                              | Add five keys                                                                                                                                                                                             |

**Why `design-system-validator`:** it already owns postcss, the selector parser, the `design-system:`
suppression namespace and the page-only gate. `a11y-validator` has no CSS tooling.

## Q&A

**Q1. Isn't the meta enough?** For a `prefers-color-scheme` theme, yes. For a _toggle_ theme the user can
pick dark while the OS is light; only `color-scheme: dark` on the toggle selector flips controls. So
`dark-toggle-without-color-scheme` checks toggle tokens only, never media.

**Q2. What counts as "dark-capable"?** Any of:

- a rule inside an `@media` whose query contains `prefers-color-scheme: dark` (also combined, e.g.
  `screen and (prefers-color-scheme: dark)`);
- a rule whose selector contains a **toggle token** — class `.dark`, `.dark-mode`, `.theme-dark`, or
  attribute `[data-theme="dark"]`, `[data-color-scheme="dark"]`, `[data-mode="dark"]` (closed list, one
  constant). Matched as parsed selector nodes: class name equal, or attribute name equal + operator `=` +
  value equal (case-sensitive; a flagged attribute such as `[data-theme="dark" i]` does **not** count).
  **Position:** a token counts only if it sits (a) on a compound with `:root`, `html` or `body`
  (`html.dark`, `:root[data-theme="dark"]`), or (b) in the selector's **first compound** with nothing else
  but an optional element type (`.dark .x`, `[data-theme="dark"] input`, `div.dark`). Anything else is a
  component variant and **not** a signal: `.btn.dark`, `.card.dark`, `.navbar .dark`.
  Where else it sits: **inside `:not()` never counts** (`:root:not(.dark)` is the light
  branch); **inside `:is()`/`:where()` counts** (`:is(.dark, [data-theme="dark"]) input` is two dark uses).
  `.darker`, `[data-theme="dark-blue"]`, `[data-theme^="dark"]` do **not** count;
- any `light-dark(` value;
- any `color-scheme` declaration that **enables dark** (below).

**"Enables dark"** (for the meta and the property): the value's keywords include `dark`.
`light dark`, `dark`, `dark light` → yes. `only light`, `light` → no (light-only). `normal` → no signal at
all (neither dark-capable nor satisfying).

**Q3. Meta from somewhere else?** A plugin `headTags` entry. If any `providedHeadTags` string matches
`/<meta\b[^>]*\bname\s*=\s*["']?color-scheme\b/i`, skip both meta rules. Any other `<meta>` does not count.
JS-set meta: not supported; suppress.

**Q4. Component files?** Skip (as `design-viewport-height.ts:45`).

**Q5. What is a "literal" colour?** Hex, `rgb/rgba/hsl/hsla/hwb/lab/lch/oklab/oklch()`, named colours.
Not literal: `transparent`, `currentColor`, `inherit`, `initial`, `unset`, `revert`, CSS system colours
(`Canvas`, `CanvasText`, `Field`, `FieldText`, …), and any value containing `var(` or `light-dark(`.
Named colours come from **one** constant, `CSS_NAMED_COLORS` (the 148 CSS Color 4 names), in a new
`lib/validators/css-color-keywords.ts`, beside `CSS_SYSTEM_COLORS`. All keyword comparisons (named, system,
`currentColor`, …) are **case-insensitive** (`canvastext`, `FIELD` are system colours).

**Q6. Brand buttons that are the same in both themes? (resolved)** **Exclude buttons entirely in v1**:
`button` and `input[type=submit|button|reset]` are never checked. A button with its own colour pair is
usually intentional; the guide covers the rest. Revisit only if real pages show dark-unaware buttons.

**Q7. `background` shorthand vs `background-color`?** Both checked. For `background`, the value is split
with `postcss-value-parser`; flag only if a top-level word/function is a literal colour (Q5). `url()`,
gradients and keywords like `none` are ignored. For overrides, `background` and `background-color` are
the same bucket: a dark rule setting either one overrides a base rule setting either one.

**Q8. Why not flag duplicated `:root`/dark blocks?** They work; `light-dark()` is nicer, not a fix. Guide only.

**Q9. Error or warning?** Warning for all — runtime JS we can't see may fix any of them, and errors are
unsuppressible (`validation-guide.md:27`).

## Design

### Rule definitions

**Meta rules** (`no-color-scheme-meta`, `color-scheme-meta-light-only`): read `head.meta` entry with
`name === 'color-scheme'`. Dynamic content (any non-text `TemplatePart`) → no meta findings.

**Selector lists.** Every rule's selector is split on top-level commas (selector parser) and each selector
is handled on its own — for signals, for "satisfied", and for the `fixed-control-colors` finding key.
`h1, .dark{color-scheme:dark}` satisfies `.dark`; `input, textarea{background:#fff}` gives one finding per
matching selector.

**`dark-toggle-without-color-scheme`** — reporting unit is the **toggle token**, not the rule:

1. Collect every toggle token that counts as a signal (Q2 position rule).
2. A token is **satisfied** if some rule has a selector whose _subject compound_ is exactly that token, or
   `:root`/`html`/`body` + that token (not under `:not()`) (`.dark`, `html.dark`, `:root[data-theme="dark"]`, `body.dark`) and
   it declares `color-scheme` that enables dark.
3. Each unsatisfied token → **one** finding, naming the token and the first rule that used it.

**`light-dark-without-color-scheme`**: some value contains `light-dark(`, and there is no dark-enabling meta,
no dark-enabling `color-scheme` declaration anywhere, and no matching `providedHeadTags` meta. One finding
(first use).

**`fixed-control-colors`** — walks postcss directly (no `ResolvedStyle`):

1. **Base rules** = rules not inside any `@media` containing `prefers-color-scheme` and whose selector has no
   toggle token. (Other media like `min-width` count as base — we only ask "is there a dark answer".)
2. For each base declaration of `color` / `background-color` / `background` with a **literal raw value**
   and no allow comment: find body elements matched by the selector (`querySelectorAll`, html/`:root`
   aliasing as in `css-cascade.ts:150`) that are checked controls (TL;DR 5).
3. **Overridden** if any **dark-context rule** sets the same property bucket (Q7) and matches that element.
   **Every** dark-context selector goes through root-compound stripping (described below) before matching:
   - dark media rule (any media containing `prefers-color-scheme: dark`): match its selector after
     root-compound stripping (`:root input` → `input`, `html input` → `input`);
   - toggle rule: **remove the toggle token** from its selector, then match the remainder against the same
     element. If the token was the whole first compound (`[data-theme="dark"] input`) drop that compound and
     its combinator → `input`; if it is attached, drop just the token (`html.dark input` → `html input`,
     `input.dark` → `input`). **Then, if the first compound is now bare `html`, `:root` or `body`, drop it
     and its combinator** — the same root-compound stripping used for dark media rules
     (`html input` → `input`, `:root[data-theme="dark"] input` → `input`): the static
     tree is body-rooted and html/`:root` aliasing exists only for whole selectors
     (`selectorTargetsRoot`, `css-cascade.ts:147-151`). If the token is inside `:is()`/`:where()`, remove
     that branch (an emptied `:is()` is dropped). No DOM attribute is required.
   - Accepted false negative: a **base** rule `html input{background:#fff}` never matches (same aliasing
     limit), so it is not flagged.
   - Specificity is ignored: any dark answer counts (we catch "forgot dark", not cascade fights).
4. **Every `querySelectorAll` / selector-parser call is wrapped per selector in try/catch**; a throw
   (unsupported pseudo-class, bad syntax) means that selector yields no match — never a finding, never a crash.
5. One finding per (single selector from the list, property, element tag) — not per element instance.

### Messages (exact)

All suggestions end with ` See agent-kit/designer/dark-mode-patterns.md`.

| Rule                               | message                                                                                                                                                                     | suggestion                                                                                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `no-color-scheme-meta`             | `Page has a dark theme (<signal>) but no <meta name="color-scheme"> in <head>. The meta is read before any CSS loads, so without it dark-mode users can see a white flash.` | `Add <meta name="color-scheme" content="light dark"> to <head>. Suppress: design-system: { allow-no-color-scheme-meta: true }.`                                                                                    |
| `color-scheme-meta-light-only`     | `<meta name="color-scheme" content="<value>"> does not enable dark, but the page has a dark theme (<signal>).`                                                              | `Use content="light dark". Suppress: design-system: { allow-color-scheme-meta-light-only: true }.`                                                                                                                 |
| `dark-toggle-without-color-scheme` | `Dark theme "<token>" (first used in "<selector>") never sets color-scheme: dark. Native inputs, selects and scrollbars stay light.`                                        | `Add a rule "<token> { color-scheme: dark; }". Suppress: design-system: { allow-dark-toggle-without-color-scheme: true }.`                                                                                         |
| `light-dark-without-color-scheme`  | `light-dark() is used (<selector> { <prop> }) but nothing enables a dark color-scheme, so it always resolves to the light value.`                                           | `Add <meta name="color-scheme" content="light dark"> or color-scheme: light dark on :root. Suppress: design-system: { allow-light-dark-without-color-scheme: true }.`                                              |
| `fixed-control-colors`             | `<tag> gets <prop>: <value> from "<selector>" on a page with a dark theme, and no dark rule overrides it.`                                                                  | `Use a theme token (var(--…)), light-dark(), or Field/FieldText, or add a dark override. Suppress one line with /* design-system: allow */, or the page with design-system: { allow-fixed-control-colors: true }.` |

`<signal>` = first dark signal found, e.g. `@media (prefers-color-scheme: dark)` or `[data-theme="dark"]`.

**N2 decision:** an inline `:root { color-scheme: light dark }` does **not** exempt `no-color-scheme-meta`.
The meta is the earliest signal (parsed before any stylesheet, external CSS included); the message says
exactly that, so it stays true when the property exists.

### Shape (pseudocode)

```ts
export const validateColorScheme: JayHtmlValidatorFn = (ctx) => {
  if (!ctx.css || !isPageFile(ctx.filePath)) return [];
  const signals = findDarkThemeSignals(ctx.css);
  if (!signals.isDarkCapable) return [];
  return [
    ...checkColorSchemeMeta(ctx, signals),
    ...checkToggleTokens(signals),
    ...checkLightDarkEnabled(ctx, signals),
    ...checkControlColors(ctx, signals),
  ].filter(
    (finding) => ctx.validationOverrides?.['design-system']?.[`allow-${finding.ruleId}`] !== true,
  );
};

// inside checkControlColors / override matching — one selector at a time:
function matchControls(body: HTMLElement, selector: string): HTMLElement[] {
  try {
    return body.querySelectorAll(selector).filter(isCheckedControl);
  } catch {
    return []; // unsupported pseudo-class or unparseable selector → no finding
  }
}
```

`DarkThemeSignals = { isDarkCapable, firstSignal, toggleTokens: Map<token, {firstSelector, satisfied}>,
lightDarkUses[], hasDarkColorSchemeDecl, darkMediaRules[], toggleRules[] }`. `ruleId` is stripped before
returning (the finding type has no rule field — `plugin-validators.ts:3-9`).

### plugin.yaml

```yaml
- name: color-scheme
  handler: validateColorScheme
  description: Dark-theme pages must declare color-scheme (meta + property) so native controls follow the theme
```

### Agent-kit guide `dark-mode-patterns.md` (plugin, designer role)

1. Baseline: meta `light dark` + `:root { color-scheme: light dark; }`.
2. Tokens with `light-dark()` instead of duplicated blocks.
3. Toggle themes: `[data-theme="dark"] { color-scheme: dark }` / `[data-theme="light"] { color-scheme: light }`.
4. Form controls: inherit tokens or `Field`/`FieldText`; `accent-color` for checkboxes/radios.
5. Toggle behaviour (developer pointer): system / light / dark; "system" clears the stored key; `storage`
   event sync; `matchMedia` change while in system; set the attribute before first paint.
6. Known blind spots: external CSS, theme names outside the list, controls inside child components.
7. The five rule ids and their `allow-*` suppression keys.

Also: "Dark mode" pointer in `stack-cli/agent-kit-template/designer/jay-html-styling.md`; five `allow-*` keys in
`validation-guide.md`.

### Null hypothesis — why no framework feature

| Option                                | Verdict                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| Compiler auto-injects the meta        | Rejected: silent output change; hides the lesson. A one-line fix is cheaper. |
| Theme syntax / runtime theme service  | Rejected: CSS + a few lines of TS suffice.                                   |
| Toggle as a ui-kit headless component | Out of scope.                                                                |

### Examples

❌ Flags `no-color-scheme-meta` and `dark-toggle-without-color-scheme` (once):

```html
<head>
  <style>
    :root {
      --bg: #fff;
    }
    [data-theme='dark'] {
      --bg: #111;
    }
    [data-theme='dark'] .card {
      border-color: #333;
    }
  </style>
</head>
```

✅ Clean:

```html
<head>
  <meta name="color-scheme" content="light dark" />
  <style>
    :root {
      color-scheme: light dark;
      --bg: light-dark(#fff, #111);
    }
    [data-theme='dark'] {
      color-scheme: dark;
    }
    [data-theme='light'] {
      color-scheme: light;
    }
    input {
      background: var(--bg);
    }
  </style>
</head>
```

❌ `fixed-control-colors`:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111;
  }
}
input {
  background: #fff;
}
```

✅ Overridden by a toggle (no DOM match needed):

```css
input {
  background: #fff;
}
[data-theme='dark'] input {
  background: #222;
}
[data-theme='dark'] {
  color-scheme: dark;
}
```

## Scope pre-mortem — what this will not handle

| Gap                                                                          | Decision                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------- |
| Dark theme in external CSS (CDN)                                             | Accepted false negative; guide                |
| Theme names outside the closed list (`.night`)                               | Accepted false negative; list is one constant |
| Controls rendered inside `jay:` child components (not in the page body tree) | Accepted false negative; guide                |
| `::part()`, `::-webkit-scrollbar`, other pseudo-elements                     | Don't match elements → no finding; fine       |
| Complex selectors the matcher can't parse                                    | Catch → no finding                            |
| Buttons with dark-unaware colours                                            | Out of v1 (Q6)                                |
| Shared layout stylesheet makes every page dark-capable                       | Correct: each page head needs the meta        |
| Toggle TS checks                                                             | Guide only                                    |

## Implementation Plan

| Phase                   | Work                                                                                                                                                                                            | Done when               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| P0 red tests            | `test/validators/design-color-scheme.test.ts`, fixtures in `test/fixtures/color-scheme/`                                                                                                        | compile, all red        |
| P1 signals + meta rules | `findDarkThemeSignals`, `checkColorSchemeMeta`, `checkLightDarkEnabled`                                                                                                                         | their tests green       |
| P2 toggle rule          | `checkToggleTokens`                                                                                                                                                                             | green                   |
| P3 control colours      | `checkControlColors` (postcss walk + token + root-compound stripping on all dark rules, per-selector try/catch; new `css-color-keywords.ts`; export `hasAllowComment`; new `isPageFile` helper) | green                   |
| P4 wire + docs          | `plugin.yaml`, `lib/index.ts`, guide, styling pointer, validation-guide `allow-*` keys, add `postcss-value-parser@^4.2.0` to `dependencies`, CHANGELOG `## Unreleased` (no version bump)        | `yarn confirm` green    |
| P5 demo                 | Demo plan                                                                                                                                                                                       | video at workspace root |
| P6 close                | Implementation Results, index → [Implemented]                                                                                                                                                   | —                       |

### Red-tests-first test plan

Each test asserts the **correct full findings array**. **Meta**: `none` = no color-scheme meta; otherwise the
meta's `content`. **Dark page** = CSS also contains `@media (prefers-color-scheme: dark){ :root{--bg:#111} }`.
Findings are written `rule-id(detail)`.

| #   | Meta                                                                          | Input                                                                                                                       | Expected                                                                                                                 |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | none                                                                          | Light-only CSS                                                                                                              | `[]`                                                                                                                     |
| 2   | none                                                                          | `@media (prefers-color-scheme: dark){ :root{--bg:#111} }`                                                                   | `[no-color-scheme-meta(signal = that media)]`                                                                            |
| 3   | `light dark`                                                                  | Test 2 CSS                                                                                                                  | `[]`                                                                                                                     |
| 4   | `light`                                                                       | Test 2 CSS                                                                                                                  | `[color-scheme-meta-light-only]`                                                                                         |
| 5   | `only light`                                                                  | Test 2 CSS                                                                                                                  | `[color-scheme-meta-light-only]`                                                                                         |
| 6   | none                                                                          | `:root{color-scheme: normal}` only                                                                                          | `[]` (normal = no signal)                                                                                                |
| 7   | `light dark`                                                                  | `[data-theme="dark"]{--bg:#111}`, no `color-scheme`                                                                         | `[dark-toggle-without-color-scheme([data-theme="dark"])]`                                                                |
| 8   | `light dark`                                                                  | Test 7 + `color-scheme: dark` in `[data-theme="dark"]`                                                                      | `[]`                                                                                                                     |
| 9   | `light dark`                                                                  | `.dark .x1{…}` … `.dark .x5{…}`, no `color-scheme`                                                                          | `[dark-toggle-without-color-scheme(.dark, first ".dark .x1")]`                                                           |
| 10  | `light dark`                                                                  | `html.dark{color-scheme:dark}` + `.dark .x{color:#eee}`                                                                     | `[]`                                                                                                                     |
| 11  | none                                                                          | Only `.darker{…}` and `[data-theme="dark-blue"]{…}`                                                                         | `[]` (no signal)                                                                                                         |
| 12  | none                                                                          | `:root{--bg: light-dark(#fff,#111)}`, no `color-scheme`                                                                     | `[no-color-scheme-meta, light-dark-without-color-scheme]`                                                                |
| 13  | none                                                                          | Test 12 + `:root{color-scheme: light dark}`                                                                                 | `[no-color-scheme-meta]`                                                                                                 |
| 14  | `light dark`                                                                  | Dark page + `input{background:#fff}`                                                                                        | `[fixed-control-colors(input, background, #fff, "input")]`                                                               |
| 15  | `light dark`                                                                  | Test 14 + `@media (prefers-color-scheme: dark){ input{background:#222} }`                                                   | `[]`                                                                                                                     |
| 16  | `light dark`                                                                  | Test 14 + `@media screen and (prefers-color-scheme: dark){ input{background-color:#222} }`                                  | `[]` (combined media, same bucket)                                                                                       |
| 17  | `light dark`                                                                  | `input{background:#fff}` + `[data-theme="dark"] input{background:#222}` + `[data-theme="dark"]{color-scheme:dark}`          | `[]` (no DOM match needed)                                                                                               |
| 18  | `light dark`                                                                  | Test 14 with `/* design-system: allow */` on the declaration                                                                | `[]`                                                                                                                     |
| 19  | `light dark`                                                                  | Dark page + `:root{--bg:#fff}` + `input{background:var(--bg)}` + `textarea{color:Field}` + `select{background:transparent}` | `[]` (raw values, non-literals)                                                                                          |
| 20  | `light dark`                                                                  | Dark page + `input{background: url(x.png) no-repeat}`                                                                       | `[]`                                                                                                                     |
| 21  | `light dark`                                                                  | Dark page + `input{border:1px solid #ccc}`                                                                                  | `[]` (borders not checked)                                                                                               |
| 22  | `light dark`                                                                  | Dark page + `button{color:#000}` + `input[type=submit]{background:#fff}`                                                    | `[]` (buttons excluded)                                                                                                  |
| 23  | none                                                                          | Test 2 CSS, component file path                                                                                             | `[]`                                                                                                                     |
| 24  | none                                                                          | Test 12 CSS with one `allow-<rule-id>` key at a time                                                                        | test 12's array minus that rule's finding                                                                                |
| 25  | dynamic `{theme}`                                                             | Test 2 CSS                                                                                                                  | `[]`                                                                                                                     |
| 26  | none; `providedHeadTags: ['<meta name="color-scheme" content="light dark">']` | Test 2 CSS                                                                                                                  | `[]`                                                                                                                     |
| 27  | none; `providedHeadTags: ['<meta name="description" content="x">']`           | Test 2 CSS                                                                                                                  | `[no-color-scheme-meta]`                                                                                                 |
| 28  | `light dark`                                                                  | `input{background:#fff}` + `html.dark input{background:#222}` + `html.dark{color-scheme:dark}`                              | `[]`                                                                                                                     |
| 29  | `light dark`                                                                  | `input{background:#fff}` + `:root[data-theme="dark"] input{background:#222}` + `[data-theme="dark"]{color-scheme:dark}`     | `[]`                                                                                                                     |
| 30  | none                                                                          | Only `:root:not(.dark){--bg:#fff}`                                                                                          | `[]` (`:not()` is not a signal)                                                                                          |
| 31  | `light dark`                                                                  | `:is(.dark) .x{color:#eee}`, no `color-scheme`                                                                              | `[dark-toggle-without-color-scheme(.dark)]`                                                                              |
| 32  | none                                                                          | `@media (prefers-color-scheme: dark) and (min-width: 600px){ :root{--bg:#111} }`                                            | `[no-color-scheme-meta]`                                                                                                 |
| 33  | `light dark`                                                                  | Dark page + `input:unknown-pseudo{background:#fff}`                                                                         | `[]`, no throw                                                                                                           |
| 34  | none                                                                          | `.btn.dark{background:#000}` + `.card.dark{color:#fff}` + `.navbar .dark{color:#fff}`                                       | `[]` (component variants)                                                                                                |
| 35  | `light dark`                                                                  | `input{background:#fff}` + `@media (prefers-color-scheme: dark){ :root input{background:#222} }`                            | `[]` (root stripping on dark media)                                                                                      |
| 36  | none                                                                          | Only `[data-theme="dark" i]{--bg:#111}`                                                                                     | `[]` (flagged attribute is not a token)                                                                                  |
| 37  | `light dark`                                                                  | `h1, .dark{color-scheme:dark}` + `.dark .x{color:#eee}`                                                                     | `[]` (list split per selector)                                                                                           |
| 38  | `light dark`                                                                  | Dark page + `input, textarea{background:#fff}`                                                                              | `[fixed-control-colors(input, background, #fff, "input"), fixed-control-colors(textarea, background, #fff, "textarea")]` |
| 39  | `light dark`                                                                  | Dark page + `input{color:WHITE}` + `textarea{color:canvastext}`                                                             | `[fixed-control-colors(input, color, WHITE, "input")]` (case-insensitive keywords)                                       |

## Verification Criteria

- All 39 tests green; existing `design-system-validator` tests unchanged and green; `yarn confirm` green.
- `jay-stack validate` on every example project: **no new warnings on pages without a dark theme**.
- `jay-stack validate` on at least one example (or demo page) **with a correct dark theme** (meta, toggle
  `color-scheme`, token-based controls, toggle overrides): **zero findings**. Any finding there is a false
  positive → fix the rule before closing.
- Every suggestion contains `agent-kit/designer/dark-mode-patterns.md`, and the file exists after
  `jay-stack agent-kit` in a fresh `create-jay` project.

## Demo plan (`demo-feature`)

1. `yarn build`. Scratch project at the workspace root (`create-jay`, default plugins); page from the ❌
   example with an `<input>` and a toggle button.
2. `jay-stack validate` → show the warnings.
3. Dev server; Playwright `colorScheme: 'dark'`: record the light input/scrollbar and the toggle leaving
   controls light.
4. Apply the fixes; re-validate → clean; reload → controls follow dark; toggle to light flips them.
5. Save `<workspace>/dark-mode-validators-<date>.webm` (never inside the repo).

## Trade-offs

- **Warnings, not errors**: less force, no unsuppressible false positives.
- **Closed token list, parser-matched**: misses some themes, never invents one.
- **Own postcss walk for controls** instead of the cascade: a little duplicate matching code, but correct
  for `var()` and runtime toggles; the cascade API stays unchanged.
- **Specificity ignored for overrides**: may miss a dark rule that loses the cascade; accepted.
- **One validator entry, five ids**: one CSS parse per page.

## Agent feedback loop (jay-feedback answer)

- _Never possible again (validation):_ the five rules.
- _Agents should learn (guide):_ `dark-mode-patterns.md` — `light-dark()`, three-state toggle, `storage`
  sync, pre-paint script, known blind spots.

## Review history

- **Round 1** — fixed-control-colors now reads raw declarations (cascade substitutes `var()`) and matches
  toggle overrides by stripping the toggle token (static tree never has the runtime attribute); toggle rule
  reports once per parser-matched token with a precise "satisfied" definition; buttons excluded, borders
  dropped, `background` shorthand defined; `only light`/`normal` semantics; `providedHeadTags` must be a
  color-scheme meta; meta message reworded (earliest signal, no exemption for inline property); dark
  breakpoints defined (incl. combined media); pre-mortem adds child components and pseudo-elements;
  verification adds a zero-false-positive dark example. Tests 17 → 27.
- **Round 2** — toggle stripping also drops a leading bare `html`/`:root`/`body` compound (body-rooted
  tree; base `html input` is an accepted false negative); `postcss-value-parser@^4.2.0` added as a
  dependency in P4 (no package version bump); suppression keys renamed to the `allow-<rule-id>` pattern
  everywhere; `isPageFile` declared as a new helper; `:not()` tokens never count, `:is()`/`:where()` do;
  per-selector try/catch shown in pseudocode. Tests 27 → 33.
- **Round 3** — toggle tokens count only on a `:root`/`html`/`body` compound or as the selector's whole
  first compound (`.btn.dark`, `.card.dark`, `.navbar .dark` are component variants); `[data-theme="dark" i]`
  does not count; root-compound stripping applies to every dark-context selector, dark media included;
  selector lists handled per comma-separated selector (signals, "satisfied", finding key); suppression
  filter inlined on `ctx.validationOverrides` (no `isSuppressed` helper exists); one `CSS_NAMED_COLORS`
  constant, case-insensitive keywords; every test states its meta and full expected array. Tests 33 → 39.

## Implementation Results

Status after implementation: **[Implemented]**. Branch stacked on the reduced-motion branch (DL#238), merged in first.

### What landed

| Area                                     | Files                                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validator `color-scheme` (five rule ids) | `design-system-validator/lib/validators/design-color-scheme.ts`                                                                                                                                         |
| Helpers                                  | new `lib/validators/page-file.ts` (`isPageFile`), new `lib/validators/css-color-keywords.ts` (`CSS_NAMED_COLORS`, 148 names; `CSS_SYSTEM_COLORS`); `hasAllowComment` exported from `lib/css-cascade.ts` |
| Registration                             | `lib/tools.ts`, `plugin.yaml`                                                                                                                                                                           |
| Dependency                               | `postcss-value-parser@^4.2.0` in the plugin's `dependencies` (no version bump)                                                                                                                          |
| Guides                                   | new plugin guide `agent-kit/designer/dark-mode-patterns.md`; "Dark Mode" pointer in `jay-html-styling.md`; five keys in `validation-guide.md`                                                           |

### Reviewer notes folded in (final review round)

1. **Signal text** in messages: a dark media rule → `@media <query>`; a toggle → the token (`[data-theme="dark"]`, `.dark`); a `light-dark()` value → `light-dark()`; a dark-enabling declaration → `color-scheme: <value>`. The first signal in source order wins (test 12/13: `light-dark()`).
2. **Suppression tests for all five keys** (test 24 is table-driven over every key, each asserting the remaining array).
3. **`.btn:is(.dark)` is not a dark signal**: an `:is()`/`:where()` counts only where the pseudo itself sits in a signal position; covered in test 34 and stated in the guide.
4. **Test 2's expected result is explicit**: `[no-color-scheme-meta]` with signal `@media (prefers-color-scheme: dark)`.

### Deviations

- **Demo on fake-shop, not a scratch `create-jay` project.** After DL#238 fake-shop already loads `design-system-validator`, so a transient `src/pages/dark-demo/page.jay-html` was used and removed after recording (not committed). The DL's video name `dark-mode-validators-<date>.webm` became `06-dark-mode-…` to match the workspace naming.
- **Example agent-kits are not regenerated** in this log (the DL does not ask for it); the committed fake-shop copy will gain `dark-mode-patterns.md` on its next `yarn agent-kit`. The copy path is the same one that delivered `reduced-motion.md` in DL#238, which covers the "file exists after `jay-stack agent-kit`" check.
- A `light-dark-without-color-scheme` check also skips when the meta is dynamic (a binding may enable dark), matching the meta rules' "dynamic → no findings".
- No CHANGELOG entry: the plugin has no CHANGELOG file.

### Verification

- Red first: 43/43 new tests failed before the validator was registered.
- design-system-validator: **237/237** (43 new `design-color-scheme` tests: 38 rows + 5 suppression cases covering all 39 table rows).
- `jay-stack validate` on fake-shop (the only example that loads the plugin; no example has a dark theme): `color-scheme` → no issues, so no new warnings on light-only pages.
- Demo page with the ❌ pattern (toggle `[data-theme="dark"]`, literal input/textarea colours, no meta): exactly `no-color-scheme-meta`, `dark-toggle-without-color-scheme`, and four `fixed-control-colors` (input/textarea × background/color). After the guide's fixes (meta, `:root { color-scheme: light dark }` + `light-dark()` tokens, toggle `color-scheme`, `Field`/`FieldText`): **zero findings**.
- Browser (Playwright, `colorScheme: 'dark'`, toggle via `data-theme`):

  | Run          | `data-theme="dark"`                                         | `data-theme="light"` |
  | ------------ | ----------------------------------------------------------- | -------------------- |
  | Before (red) | input/select `color-scheme: normal`, input background white | normal, white        |
  | After        | `dark`, input background rgb(59, 59, 59)                    | `light`, white       |

  Videos at the workspace root: `06-dark-mode-baseline-20261123.webm` (red), `06-dark-mode-20261123.webm` (fixed).
