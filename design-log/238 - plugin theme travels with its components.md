# 238 — Plugin theme travels with its components

**Status:** [Implemented] (Phases 1–4; Later phase pending) — direction approved by product owner (2026-11-17); details approved via the independent review loop at the product owner's request ("please fix it").
**Related:** DL #237 (share plugin, "page-wide plugin CSS field" deferred to its own DL; TL;DR #13, Q5/Q11), DL #145 (plugin validators), DL #196/#206 (template `<style>` travels via materialisation), DL #85/#204 (plugins / design-system indexes), DL #130 (plugin routes `css`).

## Decisions for the Implementer (TL;DR)

1. **New `plugin.yaml` field `styles: string[]`** — page-wide stylesheets (tokens on `:root`, `@font-face`, font `@import`). Local plugin: path relative to the plugin folder. NPM plugin: export subpath (same resolution as `routes[].css`, `plugin-resolution.ts:99-102`). No separate fonts field: fonts live in the stylesheet (supersedes DL #237's planned `SHARE-FONT-MISSING` + fonts field).
2. **Transport = the existing page CSS pipeline, not head links.** `extractCss` (`jay-html-parser.ts:1140-1196`) already reads local linked CSS into `parsedJayFile.css`, which dev/SSR (`generate-ssr-response.ts:482-507`, `cssHref`) and prod (`server-element-compile.ts:90-99`) all emit. Plugin styles are **prepended** to `cssParts` there. Zero changes to the runtime, the SSR response, or the prod builder.
3. **Trigger:** a page gets a plugin's `styles` iff it has ≥1 headless import with `plugin="<x>"` (key-bound contract or `<jay:…>` instance, `jay-html-parser.ts:644,727`) **in the page itself** — nothing else in Phase 1. `global: true` plugins (`plugin-resolution.ts:52-54`) do **not** get their `styles` in Phase 1; they move to the Later phase together with headfull-child recursion. Attribution: new `JayHeadlessImports.pluginName?: string` (`jay-html-source-file.ts:13-27`), set in the `plugin=` branch (`jay-html-parser.ts:727`). Plugin names are deduped, in first-import order; files deduped by absolute path. Plugin use inside headfull child components (`parseHeadfullImports`, `jay-html-parser.ts:578`, never reads the child) is **not** collected in Phase 1 — Later phase; `DS-THEME-VIA-CHILD` warns instead.
4. **Order:** hoisted `@import`s (all top-level `@import` rules from plugin stylesheets, page linked CSS and page `<head><style>`, deduped by exact text, original relative order, plugin imports first) → plugin styles → page local `<link rel=stylesheet>` CSS (`cssParts.push`, `jay-html-parser.ts:1175`) → page `<head><style>` (`:1190`). Remote (`http(s)://`) links are not in `cssParts` (`:1155-1161`), and component template CSS is not either. **Site overrides win regardless of order**, because plugin tokens are declared under `:where(:root)` (specificity 0, see #10).
5. **Dedupe/migration:** if the page also hand-links the same file, the hand link is skipped through the existing `skipPaths` param (`jay-html-parser.ts:1143,1167`). It has **no caller today**; the call at `jay-html-parser.ts:1388` now passes `skipPaths` = the resolved plugin style paths. `ExtractCssResult` (`:1117-1120`) gains `duplicateLinks: string[]` (skipped paths), which feeds the `DS-THEME-HAND-LINKED` hint. `extractCss`'s signature is otherwise unchanged.
6. **Never fail the compile because of plugin CSS.** A missing styles file is a `console.warn` + skip (not a `validations` entry — any entry makes `parseJayFile` return `undefined`, `jay-html-parser.ts:1397`). `detectCssNameCollisions` (`:1207`) runs on the page CSS **before** plugin parts are prepended; a theme-vs-page name clash is a validate warning only.
7. **Public API for previews:** `PluginsIndexEntry.styles?: string[]` (project-relative paths, `contract-materializer.ts:77-91`) in `plugins-index.yaml`, plus a `resolvePluginStyles(projectRoot, pluginName): string[]` export (absolute paths) from `compiler-shared`. A preview host links these for **any** component of the plugin, used or not.
8. **Validation = framework, in `packages/plugins/design-system-validator/lib/validators/`** (not `SHARE-*`; applies to every local plugin). Warning only, located:
   - `DS-TOKEN-NO-FALLBACK`: `var(--x)` without a fallback in a local plugin's component template `<style>` (checked per plugin source, standalone), unless `--x` is defined in that plugin's `styles`. No overlap with `design-undefined-vars.ts`: that rule checks the **page** CSS, which now already contains the theme, so it stays unchanged.
   - `DS-THEME-MISSING`: a plugin template uses `--<plugin>-*` but the plugin declares no `styles`.
   - `DS-THEME-FILE-MISSING`: a declared `styles` file does not exist.
   - `DS-THEME-NAME-CLASH`: a `@keyframes`/`@font-face` family name in a used plugin's `styles` is also defined in the page CSS.
   - `DS-THEME-HAND-LINKED` (hint): a page `<link>`s a file that is already in a used plugin's `styles`.
   - `DS-THEME-VIA-CHILD`: a page uses a headfull child whose jay-html imports `plugin="x"` and x has `styles`, but the page itself has no `plugin="x"` import → "theme of x not loaded on this page; import a component from x on the page".
   - `DS-THEME-ROOT-SPECIFICITY`: a plugin `styles` file declares `--*` on plain `:root` instead of `:where(:root)`.
   - **Scope:** all `DS-*` rules apply to **local plugins only**. NPM plugins are not checked; the `styles` field itself still works for them.
9. **Agent-kit:** tokens + fonts go in the plugin stylesheet, declared in `styles`, never hand-linked; the QA-era hand-link advice is removed.
10. **Precedence rule:** plugin stylesheets declare tokens under `:where(:root) { … }` (specificity 0), so any site `:root` override wins wherever it is emitted (page or layout CSS). Taught in agent-kit; enforced as warning by `DS-THEME-ROOT-SPECIFICITY`.

## Background

DL #237 v1 put tokens as `var(--<plugin>-x, fallback)` in each template and left fonts and page-wide tokens to a manual `<link>`. QA showed that design-system plugins keep their look in `src/plugins/<x>-ds/theme.css`. That look only shows up when someone hand-links the file, so previews of components that no page uses render unstyled.

## Problem

A component should bring its design-system look with it, the way Figma libraries, Material, and Polaris do, and a site should still be able to override tokens on purpose. Today nothing links the theme for the page or for previews, and nothing flags tokens that render empty.

## Prior Art / Adjacent Mechanisms

| Mechanism                             | Where                                                                             | Use here                             |
| ------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------ |
| Page linked CSS inlined into page CSS | ✅ `jay-html-parser.ts:1149-1182`, nested `@import` via `resolveNestedCssImports` | **Reused** as the transport          |
| `skipPaths` in `extractCss`           | ✅ `jay-html-parser.ts:1143,1167` (no caller today)                               | **Reused** for dedupe                |
| Page CSS → dev/SSR `cssHref` link     | ✅ `generate-ssr-response.ts:242-244,482-497`                                     | unchanged                            |
| Page CSS → prod hashed file           | ✅ `server-element-compile.ts:90-99`                                              | unchanged                            |
| Runtime `injectHeadLinks`             | `runtime/lib/element.ts:854`                                                      | Rejected: client-only, FOUC, not SSR |
| `routes[].css` in plugin.yaml         | ✅ `plugin-resolution.ts:99-102`                                                  | Naming + resolution pattern          |
| Template `<style>` materialisation    | DL #196, ✅ `materialise.ts:172-203`                                              | Component CSS stays there            |
| `global: true` plugins                | ✅ `plugin-resolution.ts:52-54`                                                   | Not used in Phase 1 (Later)          |
| Plugins index                         | ✅ `contract-materializer.ts:77-98`                                               | Preview API                          |

**Null hypothesis:** "the site hand-links `theme.css`" works for pages, but it is manual, easy to forget, and gives previews no way to find the file. A `@import` inside each template `<style>` would repeat the theme per component, and the file paths would break on materialisation. Both fall short, so we add one manifest field. We add no new transport.

## Q&A

- **Q1 Why not `injectHeadLinks`?** It runs on the client after hydration, so the page flashes unstyled and SSR is skipped. The CSS pipeline already covers all three modes.
- **Q2 Contract-only use (key binding, no instance)?** It counts. Its data renders with the plugin's markup conventions.
- **Q3 NPM plugins?** Same field, resolved as an export subpath. Page-wide, plugin-shipped CSS is the same need whether the plugin is local or on NPM.
- **Q4 Fonts?** `@import url(https://fonts…)` or `@font-face` inside the stylesheet. Hoisting is specified in Design → Page compile step 4.
- **Q5 Does the site override still work with the token fallbacks from DL #237?** Yes. Precedence: site `:root` > plugin `:where(:root)` > inline fallback. Because the plugin rule has specificity 0, a site override wins even when it comes from a layout stylesheet emitted before the page CSS (the earlier caveat is gone).
- **Q6 Pages that don't use the plugin?** No change. They get no plugin CSS (VC).
- **Q7 Decisions (architect, 2026-11-17; product owner may overrule):** `styles` is supported for local **and** NPM plugins, but `DS-*` rules check local plugins only; plugin use inside a headfull child component does **not** trigger inclusion in Phase 1 (`parseHeadfullImports` never reads the child; recursion is a Later phase) — `DS-THEME-VIA-CHILD` warns instead; `global` plugins' `styles` are also deferred to that Later phase (Phase 1 triggers only on the page's own `plugin="x"` imports); plugin tokens use `:where(:root)`; a theme-vs-page name clash is a warning, never a build failure; per-page theme duplication in prod is acceptable for now.

## Design

### `plugin.yaml`

```yaml
name: brand-ds
styles: [theme.css] # local: relative to src/plugins/brand-ds/
contracts: [...]
```

`PluginManifest.styles?: string[]` (`plugin-resolution.ts:48`). Unknown keys are already tolerated (`:174-186`), so older tooling does not break. A missing file: compile warns (`console.warn`) and skips it; validate reports `DS-THEME-FILE-MISSING`.

### Page compile (`parseJayFile`, `jay-html-parser.ts:1388`)

1. After the headless imports resolve, collect `pluginName` from the page's own headless imports; dedupe. `global` plugins are not added and headfull children are not walked (both Later).
2. `resolvePluginStyles` maps each to `{path, css}` (absolute path, file read, nested imports resolved via `resolveNestedCssImports`); missing files are warned and dropped.
3. `extractCss(root, filePath, skipPaths?: Set<string>)` — signature unchanged; `ExtractCssResult` gains `duplicateLinks: string[]`. The caller (`jay-html-parser.ts:1388`, today `extractCss(root, filePath)`) now passes `skipPaths` = the plugin style paths; a skipped path is still pushed to `linkedCssFiles` (`:1165-1167`, good for watch) and to `duplicateLinks` (for the hint). Prepending plugin CSS is not `extractCss`'s job; `parseJayFile` does it in step 4.
4. `parseJayFile` runs `detectCssNameCollisions` (`:1403`) on the page CSS alone, then builds the final CSS: (a) from **every** part — each plugin stylesheet, each page linked-CSS part and each page `<head><style>` part — remove the leading top-level `@import url(...)` / `@import "..."` statements (regex anchored to the start of the part, after comments/`@charset`); this must run per part, before parts are joined, because a page `@import` that ends up after prepended plugin rules is ignored by browsers; (b) emit all removed imports first, deduped by exact text, in original relative order (plugin imports first, then page imports); (c) then each plugin part with a `/* Plugin CSS: brand-ds/theme.css */` header; (d) then the page parts. Consequence: `extractCss` returns its page parts unjoined (or the import strip happens inside it per part) — the implementer picks one; the output order above is the contract. Prod preload extracts only `https://` imports (`server-element-compile.ts:268-279`); hoisting does not change that — hoisted https imports get preloaded, relative ones were already inlined by `resolveNestedCssImports`.
5. Plugin style paths are added to `linkedCssFiles`, so dev watch picks up edits to `theme.css`.

### Override precedence (documented)

```css
/* plugin theme.css */
:where(:root) {
  --brand-ds-primary: #2563eb;
} /* specificity 0 */
/* site page / layout CSS */
:root {
  --brand-ds-primary: #b91c1c;
} /* wins: higher specificity, any order */
.page-pricing {
  --brand-ds-primary: #f59e0b;
} /* scoped override */
```

### Preview API

- `plugins-index.yaml` entry: `styles: [src/plugins/brand-ds/theme.css]`.
- `resolvePluginStyles(projectRoot, pluginName)` is exported from `@jay-framework/compiler-shared`.
- Rule for hosts: when rendering any component of plugin X, include X's styles before the component CSS.

### Validators (design-system-validator, DL #145 hook)

Template `<style>` comes from the plugin's component `.jay-html` files. The check parses `var()` with postcss (the package already depends on it, `css-cascade.ts`). The defined-variable set is every custom property declared in the plugin's `styles`. All findings are warnings with file:line and are suppressible via `jay-validations` / `validationOverrides` as the package already allows.

## Implementation Plan

- **Phase 1 — field + transport (compiler-shared, compiler-jay-html).** Fixtures first (red): a page using `plugin="brand-ds"` gets theme CSS before its own CSS; a page without it gets nothing; a headfull-child-only use does **not** pull it in; a hand-linked duplicate appears once; a `global` plugin not imported on the page gets **no** theme (Later); a page font `@import` still applies after plugin CSS is prepended; a missing file warns and the page still compiles; a theme `@keyframes` clashing with page CSS does not fail. Then implement `JayHeadlessImports.pluginName`, the plugin-name collection, the `extractCss` params, and `@import` hoisting (TL;DR #1-6).
- **Phase 2 — index + API (stack-server-build).** `PluginsIndexEntry.styles`, `resolvePluginStyles` export, and a test.
- **Phase 3 — validators.** Seven rules (local plugins only), a red fixture per rule, assertion of warning severity and validate exit 0.
- **Phase 4 — agent-kit.** `design-system-guide.md` (designer), `share-guide.md` (~L121 hand-link example replaced), `contracts-and-plugins.md` (field reference). Remove the "link theme.css in the page head" advice.
- **Phase 5 — live check** (`/demo-feature`).
- **Later — recursive collection** through headfull children (read child jay-html in `parseHeadfullImports`), plus `global` plugins' `styles`; retires `DS-THEME-VIA-CHILD`.

## Verification Criteria

- [P1] A page with `<jay:button plugin="brand-ds">` renders with theme colours in dev, SSR (view-source shows the theme CSS in the page stylesheet), and the prod build. Plugin CSS comes before page CSS in the emitted file.
- [P1] A page that does not use `brand-ds` has no theme rules.
- [P1] A site `:root { --brand-ds-primary }` overrides the plugin value (computed style check).
- [P1] Hand-linked `theme.css` plus plugin use → theme CSS appears once.
- [P1] Editing `theme.css` in dev updates the page (watch).
- [P1] A page whose only plugin use is inside a headfull child component gets **no** theme CSS; [P3] validate reports `DS-THEME-VIA-CHILD` on it as a warning.
- [P1] A site `:root` token override in a **layout** stylesheet emitted before the page CSS still wins over the plugin's `:where(:root)` value (computed style).
- [P1] A missing `styles` file: the page compiles (no `undefined` parse result) and a warning is logged; validate reports `DS-THEME-FILE-MISSING`.
- [P1] A theme `@keyframes` name also defined in page CSS: build succeeds; validate reports `DS-THEME-NAME-CLASH` as a warning.
- [P1] A plugin `@import url(https://…)` appears once, at the start of the emitted CSS.
- [P1] Page font `@import` still applies when plugin CSS is prepended: a page `<head><style>` / linked CSS starting with `@import url(https://fonts…)` emits that import before all plugin rules (after plugin imports), and the font's computed `font-family` resolves.
- [P1] A `global: true` plugin with `styles` that the page does not import adds no theme CSS (Phase 1).
- [P2] `plugins-index.yaml` lists `styles`, and `resolvePluginStyles` returns absolute paths.
- [P3] Each rule fires on its fixture with the correct location, as a warning, and `jay-stack validate` exits 0. `var(--x)` defined in `styles` → no warning. `:root { --x }` in a plugin stylesheet → `DS-THEME-ROOT-SPECIFICITY`; `:where(:root)` → none. An NPM plugin → no `DS-*` findings.
- [P5] **Live:** for a used component and an unused component of the same plugin, the page and preview colours match (same computed `background-color`/`font-family`), and both match the plugin theme. With a site override, both reflect the override where the preview host includes site CSS. SSR view-source shows the theme rules in the page stylesheet before page rules, and a prod build of the same page renders the same computed colours.

## Examples

✅ `plugin.yaml: styles: [theme.css]`; the page only imports components.
❌ `<link rel="stylesheet" href="../plugins/brand-ds/theme.css">` in a page → still works, deduped, `DS-THEME-HAND-LINKED` hint.
❌ `.btn { color: var(--brand-ds-primary); }` with no fallback and no `styles` → `DS-THEME-MISSING` + `DS-TOKEN-NO-FALLBACK`.

## Trade-offs

| Choice                                      | Pro                                                    | Con                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inline into page CSS                        | One stylesheet, SSR-correct, no FOUC, no new transport | Theme duplicated across per-page CSS files in prod (cacheable only per page); accepted for now by product owner                                                                     |
| Usage-based inclusion                       | Unused plugins cost nothing                            | A component injected at runtime by code outside the page template would not pull the theme (accepted; import a component from the plugin on the page; `global` support comes Later) |
| No fonts field                              | One place for the look                                 | Font loading cannot be validated separately                                                                                                                                         |
| Page-only trigger (no recursion) in Phase 1 | Small, no child reads                                  | Child-only and `global`-only use need a page import; flagged by `DS-THEME-VIA-CHILD`                                                                                                |
| Framework validator, not `SHARE-*`          | Covers all local plugins                               | Also touches the design-system-validator package                                                                                                                                    |

## Agent feedback loop (jay-feedback decision)

- **Validation:** yes. `DS-TOKEN-NO-FALLBACK`, `DS-THEME-MISSING`, `DS-THEME-FILE-MISSING`, `DS-THEME-NAME-CLASH`, `DS-THEME-HAND-LINKED`, `DS-THEME-VIA-CHILD`, `DS-THEME-ROOT-SPECIFICITY` (warnings, local plugins only).
- **Agent-kit:** yes. The designer guide and share guide teach "tokens + fonts in the plugin stylesheet, declare `styles`, define tokens under `:where(:root)`, don't hand-link, override in site CSS."
- **Framework feature:** the `styles` field. It is justified because no existing primitive reaches previews or links the theme automatically.

## Scope pre-mortem

- _"Prod CSS order differs from dev"_: both read the same `parsedJayFile.css`. A P1 VC covers all three modes.
- _"External font `@import` dropped because it is not first"_: hoisting is a P1 task with a fixture.
- _"Large theme bloats every page"_: accepted. A shared, cacheable plugin stylesheet file is a Later optimisation with no API change.
- _"Scope creep into the preview host"_: out of scope. This log ships only the index field and the resolver.
- _"Headfull (non-plugin) components"_: out of scope. They already carry their CSS in their template.

## Review history

- Round 1 (NEEDS-WORK) → revised.
- Round 2 (NEEDS-WORK) → revised.
- Round 3 (NEEDS-WORK) → revised.
- Round 4 → READY-FOR-DEVELOPMENT, with two final notes (remote `@import`s hoisted from anywhere in each part after `resolveNestedCssImports`; `DS-THEME-VIA-CHILD` reads the child jay-html itself).

## Implementation Results (2026-11-17)

**Phase 1 — compiler.** `PluginManifest.styles`; `JayHeadlessImports.pluginName` (set only in the `plugin=` branch, not for the built-in error contract). New `compiler-jay-html/lib/jay-target/page-css.ts`: `collectUsedPluginNames`, `loadPluginStyleParts` (dedupe by path, `console.warn` + skip on a missing file), `assemblePageCss` (hoists **every** remote `@import` from **anywhere** in each part — final note a — deduped by text, plugin parts first), and `resolveNestedCssImports` (moved). `extractCss` now returns unjoined `cssParts` + `duplicateLinks`; `parseJayFile` passes the plugin paths as `skipPaths`, runs `detectCssNameCollisions` on page CSS only, and adds plugin paths to `linkedCssFiles`.
**Phase 2.** `resolvePluginStyles(projectRoot, pluginName)` + `pluginStylePaths(dir, manifest, packageName?)` in `compiler-shared`; `PluginsIndexEntry.styles` (materialize and `--list`).
**Phase 3.** `design-system-validator`: project validator `plugin-themes` (`DS-THEME-MISSING`, `DS-THEME-FILE-MISSING`, `DS-THEME-ROOT-SPECIFICITY`, `DS-TOKEN-NO-FALLBACK`) and page validator `plugin-theme-usage` (`DS-THEME-HAND-LINKED`, `DS-THEME-NAME-CLASH`, `DS-THEME-VIA-CHILD`, which reads the child jay-html — final note b). Warnings only; local plugins only.
**Phase 4.** Agent-kit: designer `design-system-guide.md`, `contracts-and-plugins.md` (`styles` field), plugin `design-system-guide.md`, share `share-guide.md` (hand-link advice removed).

### Deviations

- Plugin-level rules run as a **project validator** (DL#232), not per page: plugin templates under `src/plugins/` are not in the per-file pass, and per-page runs would repeat them.
- The page validator reads the page source (links, `plugin=` imports, headfull `src=`) instead of extending `JayHtmlValidationContext`.
- Plugin CSS header uses the file basename (`/* Plugin CSS: brand-ds/theme.css */`).
- Page CSS parts are now trimmed after import hoisting (small formatting change for all pages).
- A page that imports a local plugin's contract **by file path** (`contract="../plugins/x/…jay-contract"`, no `plugin=`) does not trigger inclusion, as designed. The live site A used that form and had to switch to `plugin="x"`. Follow-up: a validation for path-imports into `src/plugins/`.
- `jay-stack-cli` and `dev-server` bundle the materializer, so both had to be repacked for the index field.
- New CSS fixtures are listed in `.prettierignore` (exact-text expected output).

### Tests

New: compiler-jay-html `plugin-styles.test.ts` 9/9 (hand-written expected CSS fixtures, red first), compiler-shared `resolvePluginStyles` 4/4, stack-server-build index `styles` 2/2, design-system-validator `design-plugin-themes.test.ts` 5/5. `yarn confirm`: 4756 passed / 0 failed / 11 skipped.

### Live check (P5, a QA site with a design-system plugin, dev server)

`styles: [theme.css]` added, tokens moved to `:where(:root)`, hand link removed, Button import switched to `plugin=`. `agent-kit` lists `styles: [src/plugins/share-qa-a-ds/theme.css]`. The page stylesheet starts with the plugin CSS (offset 3, page rules at 2471). Used Button: page `rgb(5, 150, 105)` = panel card `rgb(5, 150, 105)`. Unused Card (`rgb(255, 255, 255)` / `rgb(17, 24, 39)`), Badge (`rgb(254, 243, 199)` / `rgb(146, 64, 14)`) and the outline/secondary Button variants are themed from the plugin's `styles` in the panel. Not run: prod build, layout-override VC, dev watch on `theme.css`.

### QA — theme travels between sites (2026-11-17)

Driven through a visual editor in two dev projects (A owns the plugin, B imported it from the shared branch).

- A: panel cards for the used Button and the unused Card, Badge, outline and secondary variants are all themed; page Button = card `rgb(5, 150, 105)`. Pass.
- A: Publish changes → share commit + push → Published. Pass.
- B: Check for updates → Update (dialog: "2 file(s) change", code files: `plugin.yaml`; `theme.css` counted as a non-code file) → Updated. Pass.
- B: agent removed the hand-written theme link (import already used `plugin=`). Page Button `rgb(5, 150, 105)`; cards match A exactly (Card `rgb(255,255,255)`/`rgb(17,24,39)`, Badge `rgb(254,243,199)`/`rgb(146,64,14)`, secondary `rgb(224,231,255)`). Page CSS starts with the plugin CSS (offset 3, page rules at 2471). Pass.
- B: a site `:root { --share-qa-a-ds-color-primary: #dc2626 }` override in the page style wins on the page and in the card (`rgb(220, 38, 38)`); A stays green. Pass.
- Production build (`jay-stack build --no-minify`, site A copy without the starter's demo pages): built route CSS starts with `/* Plugin CSS: share-qa-a-ds/theme.css */`, page rules start at line 55, no link to the theme. Pass.

No bugs found. Notes: `jay-stack build` stops on the starter's 13 existing demo-page validation errors (unrelated); a prettier-only reformat of B's plugin `theme.css` (from an earlier format run) blocked Update with "Publish your changes first" as designed — it was stashed in the plugin's git, not discarded.
