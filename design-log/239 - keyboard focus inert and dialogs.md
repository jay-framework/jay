# 239 — Keyboard focus, `inert` and dialogs

**Status:** [Implemented]
**Owner packages:** `packages/plugins/a11y-validator` (validators + guide), `packages/plugins/ui-kit` (guide fixes), `packages/jay-stack/stack-cli` (TS line scan + designer guide)

## Decisions for the Implementer (TL;DR)

1. **Validators first.** Add 5 rules in `a11y-validator` and 1 new check `body-style-overflow` in the core TS line scan. All are **warnings**, all suppressible, and every a11y message names the guide `agent-kit/designer/focus-and-dialogs.md`.
2. **The TS check is a second pattern table with its own messages** (`SCROLL_LOCK_PATTERNS`), not an entry in `DOCUMENT_ACCESS_PATTERNS` (whose message is fixed at `validate.ts:640-645`). "a11y-validator installed" is derived from one `scanPlugins` result hoisted to the top of `validateJayFiles` and shared with the two existing plugin passes (no extra scan): `[...scannedPlugins.values()].some((p) => p.packageName === '@jay-framework/a11y-validator')`. Compare `packageName` (the npm name, `packages/jay-stack/stack-server-runtime/lib/plugin-scanner.ts:37-38`), **not** `name`, which is the plugin.yaml name `a11y-validator` and would never match. The flag is then passed to `checkDirectDocumentAccess` as a parameter.
3. **One new guide**, shipped by a11y-validator: `packages/plugins/a11y-validator/agent-kit/designer/focus-and-dialogs.md` (roving tabindex, focus restore, `inert`, `<dialog>`, popover, scroll lock, top-layer transitions).
4. **Fix wrong advice in ui-kit (guide markup only, no component change)**: `popover-menu.md:86` says the Popover API "handles focus trapping" and `click-popover.md:40` says it "handles focus management"; both imply a focus trap. Popovers are non-modal and do not trap focus. `popover-menu.md:91` puts `popovertarget` on an `<a>`, where it does nothing.
5. **CSS rules read both `ctx.css` and body `<style>` elements**, because the parser only merges `head style` (`packages/compiler/compiler-jay-html/lib/jay-target/jay-html-parser.ts:1179-1180`).
6. **No framework feature.** Focus restore and roving tabindex happen at runtime, so they go in the guide.
7. **Rejected:** CSS `scroll-lock-overflow` (legit uses), `popstate-modal` (routing noise), focus-outline contrast, generic hand-rolled popover detection, `@starting-style` hints.

## Background

The Chrome article "Top 10 things AI gets wrong in web dev" lists, among others:

- **#1 Focus and `inert`:** focus is not moved into new views or restored to the trigger; manual JS tab traps and `aria-modal="true"` on custom modals; every toolbar item is its own tab stop (use a roving tabindex); custom `:focus-visible` outlines below 3:1 contrast.
- **#5 Dialogs and popovers:** `position: fixed` overlays with click-outside handlers (use `popover`); class toggling with rAF/`transitionend`/`setTimeout` for enter/exit animation (use `@starting-style` + `transition-behavior: allow-discrete`); hand-rolled scroll lock; `popstate` listeners for the Android back gesture.

Platform facts this log relies on:

| Fact                                                                                                                                  | Consequence                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `showModal()` makes the background inert, but does **not** stop the page scrolling. `overscroll-behavior` only stops scroll chaining. | The correct scroll lock is CSS `html:has(dialog:modal) { overflow: hidden }`. `overflow: hidden` on `html`/`body` is therefore not wrong by itself (app shells use `html { overflow-y: hidden }` too). |
| A modal `<dialog>` closes on the Android back gesture only where `CloseWatcher` exists (Chromium).                                    | A `popstate` fallback is not always wrong; routers also use `popstate`.                                                                                                                                |
| A heading inside a `<dialog>` does **not** name it (ARIA / HTML-AAM: `dialog` is not named from content).                             | `aria-label` or `aria-labelledby` is required.                                                                                                                                                         |
| `popovertarget` works only on `<button>` and `<input type=button\|submit\|reset\|image>`.                                             | ui-kit trigger markup must be a `<button>`.                                                                                                                                                            |

## Problem

Agents write custom modals and popovers that look correct but fail keyboard and screen-reader users. Jay already gets the jay-html DOM, local CSS and component `.ts` at validate time, so most of these patterns can be caught before the page ships.

## Prior Art / Adjacent Mechanisms

| What                        | Where                                                                                                                                                                                                                                                            | Relevance                                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Positive tabindex rule      | `packages/plugins/a11y-validator/lib/validators/a11y-validator.ts:233-250`                                                                                                                                                                                       | Pattern to copy (element walk + `pushFinding`)                                                                                                                                           |
| Tabindex without role       | `packages/plugins/a11y-validator/lib/validators/a11y-validator.ts:288-304`                                                                                                                                                                                       | Same                                                                                                                                                                                     |
| Guide suffix                | `packages/plugins/a11y-validator/lib/validators/a11y-validator.ts:8` (`A11Y_GUIDE`) appended by `pushFinding` `:19-27`                                                                                                                                           | New rules must name the new guide instead                                                                                                                                                |
| Per-rule suppression        | `packages/plugins/a11y-validator/lib/validators/a11y-validator.ts:15-17` (`isSuppressed`, `a11y:` namespace, DL#185)                                                                                                                                             | Escape hatch for every new rule                                                                                                                                                          |
| Validator context           | `packages/compiler/compiler-shared/lib/plugin-validators.ts:25-56`                                                                                                                                                                                               | `body`, `css`, `head`, `contract`                                                                                                                                                        |
| CSS merge (head only)       | `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-parser.ts:1143-1188`                                                                                                                                                                                | Body `<style>` is not in `ctx.css`. `ctx.css` is a `\n\n`-join of parts; external files start with `/* External CSS: <href> */` (`:1168`), head `<style>` parts have no marker (`:1184`) |
| Body `<style>` reachability | node-html-parser keeps `<style>` text as a block text element, so `walkElements(ctx.body)` reaches it and `.text` gives the CSS                                                                                                                                  | No parser change needed                                                                                                                                                                  |
| postcss + selector parser   | `packages/plugins/design-system-validator/package.json:53-54` (`dependencies`), `lib/validators/design-tokens.ts:2-4`, `design-contrast.ts:33-41`                                                                                                                | Same libraries and ranges for a11y-validator                                                                                                                                             |
| TS line scan                | `packages/jay-stack/stack-cli/lib/validate.ts:613-650` (`DOCUMENT_ACCESS_PATTERNS`, `jay-dom: allow`, fixed message `:640-645`), sync, path-only, called per file at `:2169`                                                                                     | Add a second pattern table with per-entry messages; add an options parameter                                                                                                             |
| Plugin discovery            | `packages/jay-stack/stack-cli/lib/validate.ts` already calls `scanPlugins` twice per run: `runPluginValidators` `:1808` and `runProjectValidators` `:1934`, both after the per-file loop                                                                         | Not reachable from `:2169`. Hoist one call to the start of `validateJayFiles` (`:1988`) and pass the result to both functions, so the run does fewer scans than today, not more          |
| Page export check           | `validate.ts:582-607` (`checkPageComponentExport`, called at `:2159`)                                                                                                                                                                                            | A `page.ts` without `export const page` is an **error**; every fixture `page.ts` must export `page`                                                                                      |
| NO-DESIGN-SYSTEM            | `validate.ts:1518` (`checkNoDesignSystem`), emitted at `:2528-2539` as a `.jay` warning; suppressed by `jay-stack: allow-no-design-system: true` in any page's `jay-validations` (`:2497-2505`)                                                                  | Fires on any fixture project without regions; the fixture suppresses it                                                                                                                  |
| Plugin agent-kit copy       | `packages/jay-stack/stack-cli/lib/run-agent-kit.ts:217-275` (`mergePluginAgentKitGuides`: `scanPlugins` `:218`, reads `<plugin>/agent-kit/<role>/*.md` except `INSTRUCTIONS.md` `:233-236`, copies and logs `:274`, index table `:292-293`)                      | The new a11y-validator guide reaches projects with no extra wiring                                                                                                                       |
| Page + contract pattern     | `examples/jay-stack/mood-tracker-plugin/lib/pages/mood-stats/` (`page.jay-contract` with `type: interactive` + `elementType` refs; `page.ts` exports `page = makeJayStackComponent<PageContract>()...withInteractive(constructor)` with `refs: PageElementRefs`) | Fixture pages copy this shape; `exec$` is on element refs (`packages/runtime/runtime/lib/node-reference.ts:208`)                                                                         |
| ui-kit popover-menu         | `packages/plugins/ui-kit/lib/popover-menu.ts:29-56` (opens on `onmouseenter`, closes on leave), contract types `trigger` as `HTMLElement`                                                                                                                        | Adding `popovertarget` would add a click toggle that fights hover (hover opens, click closes). Guide markup keeps hover and does not add `popovertarget`                                 |
| Test pattern                | `packages/plugins/a11y-validator/test/validators/a11y-validator.test.ts:14-22` (`makeContext(html, head?)`)                                                                                                                                                      | Gains a third argument `css?: string` → `ctx.css`                                                                                                                                        |
| Existing a11y guide         | `packages/plugins/a11y-validator/agent-kit/designer/a11y-patterns.md:177,196`                                                                                                                                                                                    | Link to the new guide                                                                                                                                                                    |
| DL#166 / DL#232 / DL#235    | a11y rules / project validators / boolean attrs                                                                                                                                                                                                                  | DL#166 is the shape this log follows; no project-level validator needed                                                                                                                  |

### Audit corrections

| Audit claim                                  | Verified                                                         | Correction                                                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Positive tabindex at `a11y-validator.ts:241` | Yes (rule `:233-250`, message `:241`)                            | —                                                                                                                                       |
| Tabindex without role at `:295`              | Yes (`:288-304`)                                                 | Only fires for `NON_INTERACTIVE_ELEMENTS`                                                                                               |
| Context type at `plugin-validators.ts:25`    | Yes                                                              | —                                                                                                                                       |
| TS scan at `validate.ts:623`                 | Yes (`checkDirectDocumentAccess`)                                | Scans only `<name>.ts` or `page.ts` next to the jay-html (`:625-627`)                                                                   |
| Body `<style>` not included                  | Yes (`jay-html-parser.ts:1179-1180`)                             | Body `<style>` elements and `style=""` attributes are still in `ctx.body`                                                               |
| `popover-menu.md:86`                         | Yes, and wrong                                                   | Popovers do not trap focus (non-modal). `:91` uses `popovertarget` on `<a>`. `role="menu"` needs arrow keys the component does not ship |
| (not in audit) `click-popover.md:40`         | Says "The Popover API handles focus management" (implies a trap) | It handles light dismiss, Escape and returning focus to the invoker only                                                                |

## Q&A

| Question                                                                              | Answer                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error or warning?                                                                     | Warning for all rules. Escape via `a11y:` overrides / `// jay-dom: allow`. Closed.                                                                                                                                                            |
| `overflow: hidden` on `html`/`body` in CSS?                                           | **Not validated.** It is the correct lock when scoped with `:has(dialog:modal)` and legit for app shells. Guide only. Closed.                                                                                                                 |
| Why not a framework `<Dialog>` component?                                             | The platform `<dialog>` already does the job. Null hypothesis holds.                                                                                                                                                                          |
| `aria-modal` on `<dialog>`?                                                           | Not flagged. Redundant with `showModal()`, but a **false signal** with `show()` (non-modal: the background stays interactive while assistive tech is told it is not). Which method opens it lives in TS, so this is a guide note, not a rule. |
| Dynamic attribute values (`role="{kind}"`, `aria-modal="{x}"`, `autofocus="{cond}"`)? | **Skipped**: an attribute whose value contains `{` neither fires nor counts. Exception: `aria-label`/`aria-labelledby` with `{expr}` count as present for `dialog-name`.                                                                      |
| Non-modal `role="dialog"` without `aria-modal`?                                       | Fires `custom-modal` with the non-modal message (use `<dialog>` + `show()` or `popover`).                                                                                                                                                     |
| `inert` as an escape for `custom-modal`?                                              | No. Whether the _background_ is inert cannot be checked reliably; the message does not suggest it. Suppression is the escape.                                                                                                                 |
| TS patterns in core or a11y-validator?                                                | Core, because only core reads `.ts` today.                                                                                                                                                                                                    |

## Design

### Validators (all in `a11y-validator` unless noted)

| Rule id                             | Trigger (exact)                                                                                                                                                                                                                                                                                                          | Escapes / no-fire                                                                                                                                                                                                                                                                                               | Message                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `custom-modal`                      | Tag is not `dialog`, and it has `aria-modal="true"` **or** `role="dialog"`/`"alertdialog"`                                                                                                                                                                                                                               | Tag `dialog`; dynamic `role`/`aria-modal` (value contains `{`) is skipped; suppression `a11y: { custom-modal: true }`                                                                                                                                                                                           | `<tag attr>` is interpolated: the element's tag plus the triggering attribute (`aria-modal="true"` if present, else `role="…"`). Modal (has `aria-modal="true"` **or** `role="alertdialog"`, which ARIA expects to be modal): `` `<${tag} ${attr}> is a hand-rolled modal. Use <dialog> + showModal() for focus containment, Escape and an inert background.` `` Non-modal: `` `<${tag} role="dialog"> is a hand-rolled dialog. Use <dialog> + show(), or the popover attribute.` `` |
| `dialog-name`                       | `<dialog>` with no `aria-label` and no `aria-labelledby`                                                                                                                                                                                                                                                                 | Either present (dynamic `{expr}` counts as present). A heading inside does **not** count                                                                                                                                                                                                                        | `<dialog> has no accessible name. Add aria-labelledby pointing at its heading.`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `outline-without-focus-visible`     | See algorithm below                                                                                                                                                                                                                                                                                                      | See algorithm below                                                                                                                                                                                                                                                                                             | `.btn:focus removes the focus outline with no :focus-visible replacement. Keyboard users lose track of focus.`                                                                                                                                                                                                                                                                                                                                                                       |
| `outline-none-unconditional`        | (a) CSS rule with no `:focus` in any selector sets `outline: none\|0` or `outline-style: none`, and a selector's last compound is **anchored** (see below). (b) Inline `style=""` with the same declaration on an `a[href]`, `button`, `input` (not `type=hidden`), `select`, `textarea`, or any element with `tabindex` | `dialog`, `[popover]` and any other selector/tag do not fire (container focus via `showModal()` commonly hides the ring); for (a) a matching `:focus-visible` replacement (same key rule as below); (b) has no escape except suppression (inline cannot be overridden by `:focus-visible` without `!important`) | (a) template `` `${selector} { ${property}: ${value} } removes focus outlines everywhere.` `` interpolating the firing selector, the declaration property (`outline`/`outline-style`) and its value as written, e.g. `button { outline: none } removes focus outlines everywhere.` (b) `<button style="outline: none"> removes the focus outline. Move the style to CSS and add a :focus-visible outline.`                                                                           |
| `autofocus-outside-dialog`          | `autofocus` on an element not inside `<dialog>`/`[popover]`, when the page has more than one **counted** `autofocus` **or** the element is not a form element. Counted = static `autofocus` outside `<dialog>`/`[popover]`; those inside dialogs/popovers are not counted (they apply when the container opens)          | Inside `<dialog>`/`[popover]`. A single `autofocus` on a form element. `autofocus="{cond}"` is skipped: neither fires nor counts                                                                                                                                                                                | `autofocus outside a dialog moves focus on page load and skips content for screen-reader users.`                                                                                                                                                                                                                                                                                                                                                                                     |
| core TS scan: `body-style-overflow` | Line matches `/document\.(body\|documentElement)\.style\.overflow\b/` (entry in the new `SCROLL_LOCK_PATTERNS`)                                                                                                                                                                                                          | `// jay-dom: allow`                                                                                                                                                                                                                                                                                             | `page.ts:7 — Scroll lock via document.body.style.overflow. Use <dialog>.showModal() with CSS html:has(dialog:modal) { overflow: hidden }. Suppress with // jay-dom: allow on the same line.` + guide suffix (below)                                                                                                                                                                                                                                                                  |

**Form element** = `input` (not `type=hidden`), `select`, `textarea`, `button`. `contenteditable` and `tabindex` elements are not form elements.

**Finding granularity.** `custom-modal` reports one finding per offending element (an element with both `role="dialog"` and `aria-modal="true"` is still one finding). `outline-none-unconditional` (a) reports one finding per anchored selector in the selector list (`button, a { outline: none }` gives two, each message interpolating its own selector; non-anchored selectors in the same list add none); (b) reports one finding per offending element.

**Anchored compound** (`outline-none-unconditional` (a)) = exactly one _anchor_ — a type selector `a`/`button`/`input`/`select`/`textarea`, an attribute selector on `tabindex` (any operator/value), or `*` — plus any number of classes and other attribute selectors, and **no** pseudo-classes. So `button.primary`, `[tabindex="0"]` and `input[type=text]` fire; `.btn` (no anchor) and `button:hover` (pseudo-class) do not.

**`outline-without-focus-visible` algorithm.** Flatten all CSS sources first (CSS Nesting rules): a nested selector containing `&` gets `&` replaced by each parent selector; a nested selector **without** `&` is a relative selector and gets an implicit `& ` (descendant) prefix (`.card { :focus {…} }` → `.card :focus`). Parent and child selector lists are cross-multiplied (`.a, .b { &:focus, &:active {…} }` → 4 selectors); rules inside any at-rule (`@media`, `@supports`, `@layer`, `@container`) are kept and treated as unconditional. For each rule, the _final_ `outline`/`outline-style` declaration decides if it removes the outline (`none` or `0`).

1. Split the selector list with `postcss-selector-parser`. A selector is **offending** if its last compound contains `:focus` (not `:focus-visible`/`:focus-within`, not inside `:not(...)`) and the rule removes the outline.
2. No fire if the last compound also contains `:not(:focus-visible)`.
3. **Same-rule escape:** no fire if the same rule sets a non-`none` `box-shadow`, or a visible border: `border`/`border-width`/`border-style` whose value is not `none`, `hidden` or `0`, or `border-color` with no `border:none`/`border-width:0` in the same rule.
4. **Key** = the offending compound with `:focus` removed, simple selectors sorted and serialized (`.btn:focus` → `.btn`; `*:focus` and `:focus` → `*`). The ancestor part of the selector is ignored.
5. **Replacement** = any rule whose selector has a last compound containing `:focus-visible` where (compound minus `:focus-visible`) equals the key, **or** is `*`/empty (bare `:focus-visible` covers everything), and that rule sets a visible `outline` (not `none`/`0`) or a non-`none` `box-shadow`. Found → no fire.
6. Otherwise fire once per offending selector. When the input is not parseable, do not fire.

**Location format (CSS findings).** Message prefix `[<source> line <n>] <selector>`; omit ` line <n>` when unavailable.

| Source                                                                 | `<source>`            | `<n>`                                                                                                                                                 |
| ---------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| k-th body `<style>` (1-based)                                          | `style#<k>`           | postcss line within that element                                                                                                                      |
| `ctx.css` segment after `/* External CSS: <href> */`, not the last one | `<href>`              | postcss line minus the marker line (line 1 = first line after the marker). Approximate when the file inlined `@import`s via `resolveNestedCssImports` |
| Last external segment, page has **no** non-empty `head style`          | `<href>`              | as above                                                                                                                                              |
| Last external segment, page **has** a non-empty `head style`           | `<href> + head style` | omitted                                                                                                                                               |
| `ctx.css` with no markers, page has a `head style`                     | `head style`          | omitted                                                                                                                                               |
| `ctx.css` with no markers, no `head style` (unit tests)                | `css`                 | postcss line                                                                                                                                          |

**Limitation (mixed linked + head CSS).** `ctx.css` is externals first, then head `<style>` texts, all joined with `\n\n` (`jay-html-parser.ts:1168`, `:1180-1187`), so head CSS lands inside the last external segment with no boundary. The validator detects the case from `ctx.head` (any non-empty `<style>`), and then drops the line and names both sources rather than report a wrong line. Fixing it properly (a marker per head style) is a parser change, out of scope.

Example: `[style#1 line 3] .btn:focus removes …`.

**Guide suffix.** Every a11y finding ends with `\nSee: agent-kit/designer/focus-and-dialogs.md` (new `FOCUS_GUIDE` constant; `pushFinding` takes the guide as an optional argument, default stays `A11Y_GUIDE`). The core TS message appends ` See agent-kit/designer/focus-and-dialogs.md` only when a11y-validator is installed; otherwise no guide pointer.

**TS scan wiring (stack-cli).**

| Step      | Change                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detect    | At the top of `validateJayFiles` (`validate.ts:1988`): `const scannedPlugins = await scanPlugins({ projectRoot, includeDevDeps: true })`; `const hasA11yValidator = [...scannedPlugins.values()].some((p) => p.packageName === '@jay-framework/a11y-validator')`. `packageName` is the npm name (`plugin-scanner.ts:37-38`); `p.name` is the plugin.yaml name `a11y-validator` and must not be used |
| Share     | `runPluginValidators` (`:1802-1808`) and `runProjectValidators` (`:1929-1934`) take `scannedPlugins` as a parameter instead of scanning. Cost: today's 2 scans per run become 1 (each scan resolves `package.json` dependencies and reads plugin manifests from disk); behaviour is unchanged because the dependency set cannot change during one run                                               |
| Pass      | `checkDirectDocumentAccess(jayHtmlPath, { hasA11yValidator })` at `:2169`; stays sync                                                                                                                                                                                                                                                                                                               |
| Tables    | `DOCUMENT_ACCESS_PATTERNS` unchanged with its fixed message. New `SCROLL_LOCK_PATTERNS: { pattern, message(match, guideSuffix) }[]`                                                                                                                                                                                                                                                                 |
| Per line  | Skip if `jay-dom: allow`. Try `DOCUMENT_ACCESS_PATTERNS` first (break on first match, as today), then `SCROLL_LOCK_PATTERNS` (break on first match). At most one warning per table per line; the two tables never match the same text, so no dedupe is needed                                                                                                                                       |
| Test seam | Export `checkDirectDocumentAccess` and call it directly with a temp fixture dir and `{ hasA11yValidator: true\|false }` (tests 27-29)                                                                                                                                                                                                                                                               |

**CSS source:** `ctx.css` plus the `.text` of every `<style>` element found by `walkElements(ctx.body)`, each parsed separately with postcss. `style=""` attributes are parsed as declaration lists and checked only by `outline-none-unconditional` (b).

**Rejected candidates**

| Candidate                                                        | Reason                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scroll-lock-overflow` (CSS `overflow: hidden` on `html`/`body`) | `showModal()` does not lock scroll, so `html:has(dialog:modal){overflow:hidden}` is the correct fix, and `html{overflow-y:hidden}` app shells are legit. Exempting `:has(...)` still leaves `body.modal-open` vs app-shell ambiguity. Guide only. |
| `popstate-modal` (TS `addEventListener('popstate'`)              | Routers and history-driven UIs use `popstate` legitimately; native back-to-close needs `CloseWatcher` (Chromium only), so a fallback can be correct. Too many false positives. Guide only.                                                        |
| Focus-outline contrast                                           | Needs the background colour _next to_ the element; outline is often `currentColor`/a var. Guide only.                                                                                                                                             |
| Hand-rolled popover detection                                    | Click-outside is in TS; `position: fixed` is everywhere. Guide.                                                                                                                                                                                   |
| `@starting-style` / `allow-discrete` hints                       | Missing them is not wrong; class-toggle animations live in TS. Guide.                                                                                                                                                                             |
| `<dialog open>` in HTML                                          | Valid non-modal dialog. Guide explains the difference.                                                                                                                                                                                            |
| Manual tab trap in TS                                            | Too varied to match by line. Guide.                                                                                                                                                                                                               |

### Guides and ui-kit (in scope)

| File                                                                           | Action                                                                                                                                                                                                                                           | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/plugins/a11y-validator/agent-kit/designer/focus-and-dialogs.md`      | **New**                                                                                                                                                                                                                                          | `<dialog>` + `showModal()` vs `show()`/`open`; naming via `aria-labelledby`; `inert` on background for custom layouts; scroll lock with `html:has(dialog:modal){overflow:hidden}`; back gesture (`CloseWatcher`, Chromium only); focus restore and moving focus into new views via refs; roving tabindex; popover API (not a focus trap); top-layer transitions with `@starting-style`, `allow-discrete`, `overlay`, `display`, `::backdrop`; `:focus-visible` with 3:1 contrast; note that `aria-modal="true"` on a `<dialog>` opened with `show()` is a false signal (only `showModal()` makes it modal); section per rule id. **Shape:** like `a11y-patterns.md`, no front-matter; line 1 is `# Focus and Dialogs in Jay-HTML`, followed by a blank line and a one-sentence plain paragraph (`mergePluginAgentKitGuides` takes the first non-empty line after the first `# ` heading as the index-table description, `run-agent-kit.ts:254-266`), e.g. `Keyboard focus, modal dialogs, popovers and scroll lock, and how to fix each a11y-validator focus warning.` Reaches projects through `mergePluginAgentKitGuides` (`run-agent-kit.ts:217-275`) when a11y-validator is installed |
| `packages/plugins/a11y-validator/agent-kit/designer/a11y-patterns.md`          | Edit `:177`, `:196`                                                                                                                                                                                                                              | One-line pointers to the new guide                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `packages/plugins/ui-kit/agent-kit/designer/popover-menu.md`                   | Fix `:86-95` (markup only)                                                                                                                                                                                                                       | Replace "handles focus trapping" at `:86` (popovers do not trap focus). Behaviour stays **hover-driven** (the component's own handlers); the trigger becomes `<button type="button" ref="trigger">` with **no** `popovertarget` (it would add a click toggle that closes what hover just opened) and **no** hard-coded `aria-expanded`. Replace the `<a popovertarget>` at `:91` the same way. State that hover menus are not keyboard-operable and point to `click-popover.md` (where `popovertarget` is used, and the browser exposes the expanded state per HTML-AAM) for keyboard access. Drop `role="menu"` unless arrow keys are handled. No change to `popover-menu.ts` or its contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `packages/plugins/ui-kit/agent-kit/designer/click-popover.md`                  | Fix `:26-40`                                                                                                                                                                                                                                     | Exit transition example with `allow-discrete`; replace "handles focus management" at `:40` with: light dismiss, Escape, and returning focus to the invoker; it does not trap focus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `packages/jay-stack/stack-cli/agent-kit-template/designer/validation-guide.md` | Edit: new `### Focus and dialog warnings (a11y)` under `## Common Scenarios`, after `### Warnings on component files` (`:87`); one bullet in `## What the Validator Sees` (`:13-23`) that body `<style>` blocks are read by the a11y focus rules | List the 6 rule ids, one line each, pointing to `focus-and-dialogs.md` (present only when a11y-validator is installed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Example

Both pages live in one fixture project (full files in **Appendix A**). Only `@jay-framework/a11y-validator` is installed as a validator plugin, so SEO and design-system rules do not run. Each page's head suppresses the core `NO-DESIGN-SYSTEM` project warning (`jay-stack: allow-no-design-system: true`), which would otherwise fire once on `.jay` because the project has no regions.

❌ Bad (`src/pages/bad-modal/`), key lines:

```html
<div class="overlay" role="dialog" aria-modal="true"><h2>Cart</h2></div>
<dialog ref="help"><h2>Help</h2></dialog>
<div role="button" tabindex="0" autofocus>Menu</div>
<style>
  .btn:focus {
    outline: none;
  }
  a {
    outline: 0;
  }
</style>
```

```ts
// page.ts:7, inside the exported page component's constructor
document.body.style.overflow = 'hidden';
```

Expected `jay-stack validate` output for the project: **exactly 6 warnings, 0 errors**, all on `src/pages/bad-modal/page.jay-html`:

| Rule                            | Message starts with                                                    |
| ------------------------------- | ---------------------------------------------------------------------- |
| `custom-modal`                  | `<div aria-modal="true"> is a hand-rolled modal.`                      |
| `dialog-name`                   | `<dialog> has no accessible name.`                                     |
| `autofocus-outside-dialog`      | `autofocus outside a dialog moves focus`                               |
| `outline-without-focus-visible` | `[style#1 line 1] .btn:focus removes the focus outline`                |
| `outline-none-unconditional`    | `[style#1 line 2] a { outline: 0 } removes focus outlines everywhere.` |
| `body-style-overflow`           | `page.ts:7 — Scroll lock via document.body.style.overflow.`            |

No `.jay` warning, no tabindex-without-role warning (`role="button"`), no page-export error (`page.ts` exports `page`).

✅ Good (`src/pages/good-modal/`), key lines:

```html
<button type="button" class="btn" ref="openCart">Open cart</button>
<dialog ref="cart" aria-labelledby="cart-title">… <button … ref="closeCart">Close</button></dialog>
<style>
  .app {
    background: #ffffff;
    color: #111111;
  }
  .btn:focus-visible {
    outline: 2px solid #1a56db;
    outline-offset: 2px;
  }
  html:has(dialog:modal) {
    overflow: hidden;
  }
</style>
```

```ts
refs.openCart.onclick(() => refs.cart.exec$((dialog) => dialog.showModal()));
refs.closeCart.onclick(() => refs.cart.exec$((dialog) => dialog.close()));
```

The focus ring is a literal `#1a56db` on `#ffffff` (contrast about 6.4:1); any replacement colour must keep **at least 3:1** against the adjacent background (WCAG 1.4.11). Expected output: 0 warnings, 0 errors. Focus returns to `openCart` on close by the platform; no `document.*` access.

## Implementation Plan (red tests first)

**Phase 1 — red tests** in `packages/plugins/a11y-validator/test/validators/focus-and-dialogs.test.ts`, using `makeContext(html, head?, css?)`:

| #   | Input                                                                                                         | Expect                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | `<div role="dialog" aria-modal="true"><h2>x</h2></div>`                                                       | 1 `custom-modal` (modal message), suggestion ends with `focus-and-dialogs.md`       |
| 2   | `<section aria-modal="true">`                                                                                 | `custom-modal`, message starts `<section aria-modal="true"> is a hand-rolled modal` |
| 3   | `<div role="dialog">`                                                                                         | `custom-modal`, message starts `<div role="dialog"> is a hand-rolled dialog`        |
| 4   | `<dialog aria-modal="true" aria-label="x">`                                                                   | none                                                                                |
| 5   | same as 1 + `validationOverrides` `{"a11y":{"custom-modal":true}}`                                            | none                                                                                |
| 6   | `<dialog><p>x</p></dialog>`                                                                                   | `dialog-name`                                                                       |
| 7   | `<dialog><h2>Cart</h2></dialog>`                                                                              | `dialog-name` (heading does not name a dialog)                                      |
| 8   | `<dialog aria-labelledby="t">` / `<dialog aria-label="x">`                                                    | none                                                                                |
| 9   | css `.btn:focus{outline:none}`                                                                                | `outline-without-focus-visible`, message starts `[css line 1] .btn:focus`           |
| 10  | css `.btn:focus{outline:0} .btn:focus-visible{outline:2px solid}`                                             | none                                                                                |
| 11  | css `.btn:focus:not(:focus-visible){outline:none}`                                                            | none                                                                                |
| 12  | body `<style>.btn:focus{outline:none}</style>`, empty `css`                                                   | `outline-without-focus-visible`, prefix `[style#1 line 1]`                          |
| 13  | css `*:focus{outline:none}`                                                                                   | `outline-without-focus-visible`                                                     |
| 14  | css `*:focus{outline:none} :focus-visible{outline:2px solid}`                                                 | none                                                                                |
| 15  | css `.btn:focus{outline:none} .card:focus-visible{outline:2px solid}`                                         | `outline-without-focus-visible` (key mismatch)                                      |
| 16  | css `.btn:focus{outline:none;box-shadow:0 0 0 2px blue}`                                                      | none (same-rule escape)                                                             |
| 17  | css `.btn:focus{outline:none} @media (min-width:1px){.btn:focus-visible{outline:2px solid}}`                  | none                                                                                |
| 18  | css `.btn{&:focus{outline:none}}`                                                                             | `outline-without-focus-visible`                                                     |
| 19  | css `.btn{&:focus{outline:none} &:focus-visible{outline:2px solid}}`                                          | none                                                                                |
| 20  | css `button{outline:none}`                                                                                    | `outline-none-unconditional`                                                        |
| 21  | css `dialog{outline:none} [popover]{outline:none}`                                                            | none                                                                                |
| 22  | css `.card{overflow:hidden}` / `html{overflow-y:hidden}`                                                      | none (no scroll-lock rule)                                                          |
| 23  | `<input autofocus><input autofocus>`                                                                          | `autofocus-outside-dialog`                                                          |
| 24  | `<input autofocus>` (only one)                                                                                | none                                                                                |
| 25  | `<div contenteditable autofocus>`                                                                             | `autofocus-outside-dialog`                                                          |
| 26  | `<dialog aria-label="x"><input autofocus></dialog>`                                                           | none                                                                                |
| 26a | `<div role="alertdialog">` (no `aria-modal`)                                                                  | `custom-modal` (modal message)                                                      |
| 26b | css `.btn{@media (min-width:1px){&:focus{outline:none}}}`                                                     | `outline-without-focus-visible`, selector `.btn:focus`                              |
| 26c | css `.btn:focus{outline:none;border:none}` / `.btn:focus{outline:none;border:0}`                              | `outline-without-focus-visible` (border not visible)                                |
| 26d | css `.btn:focus{outline:none;border:2px solid blue}`                                                          | none                                                                                |
| 26e | `<button style="outline: none">` / `<div style="outline:none">`                                               | `outline-none-unconditional` inline message / none                                  |
| 26f | css `/* External CSS: ./a.css */\n.x{}\n.btn:focus{outline:none}`                                             | prefix `[./a.css line 2]`                                                           |
| 26g | `<div role="button" tabindex="0" autofocus>`                                                                  | only `autofocus-outside-dialog` (no tabindex-without-role)                          |
| 26h | css `/* External CSS: ./a.css */\n.x{}\n.btn:focus{outline:none}\n\n.y{}`, head `<style>.y{}</style>` (mixed) | prefix `[./a.css + head style]`, no line                                            |
| 26i | `<input autofocus><dialog aria-label="x"><input autofocus></dialog>`                                          | none (dialog autofocus not counted)                                                 |
| 26j | `<input autofocus="{focusSearch}"><input autofocus>`                                                          | none (dynamic skipped, one counted)                                                 |
| 26k | `<div role="{kind}" aria-modal="{isModal}">`                                                                  | none (dynamic skipped)                                                              |
| 26l | css `.a,.b{&:focus{outline:none}}`                                                                            | 2 `outline-without-focus-visible`: `.a:focus`, `.b:focus` (cross-product)           |
| 26m | css `.card{:focus{outline:none}}`                                                                             | 1 `outline-without-focus-visible`, selector `.card :focus` (implicit `& `)          |
| 26n | css `button.primary{outline:none}` / `[tabindex="0"]{outline:none}` / `input[type=text]{outline:0}`           | 1 `outline-none-unconditional` each                                                 |
| 26o | css `.btn{outline:none}` / `button:hover{outline:none}`                                                       | none (no anchor / pseudo-class)                                                     |

Core TS scan, in `packages/jay-stack/stack-cli/test/validate.test.ts`, calling the exported `checkDirectDocumentAccess(path, { hasA11yValidator })` on a temp `page.jay-html` + `page.ts`:

| #   | Line / setup                                                                                                                                                                        | Expect                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 27  | `document.body.style.overflow = 'hidden';`, `hasA11yValidator: true`                                                                                                                | exactly 1 warning: `page.ts:1`, scroll-lock message, ends with `focus-and-dialogs.md`, no "use Jay refs" text                                                            |
| 28  | same line, `hasA11yValidator: false`                                                                                                                                                | exactly 1 warning: `page.ts:1`, no guide pointer                                                                                                                         |
| 29  | same as 27 + `// jay-dom: allow`                                                                                                                                                    | none                                                                                                                                                                     |
| 30  | `window.addEventListener('popstate', close);`                                                                                                                                       | none (rejected rule). **Documentation-only:** no rule matches `popstate` today, so this cannot fail; it guards against a future addition reintroducing the rejected rule |
| 31  | Integration: real `validateJayFiles` run on the Appendix A fixture project (a11y-validator installed via `package.json`, so detection goes through `scanPlugins` and `packageName`) | the `body-style-overflow` warning message ends with `focus-and-dialogs.md` (red if detection compares `p.name`)                                                          |

**Phase 2** — implement rules in `packages/plugins/a11y-validator/lib/validators/focus-rules.ts` (called from `a11y-validator.ts`, small functions); add `postcss` `^8.5.6` and `postcss-selector-parser` `^7.1.0` to a11y-validator runtime `dependencies` (same ranges as design-system-validator; no package version bumps). **Phase 3** — guides and ui-kit guide fixes. **Phase 4** — `yarn confirm`, demo.

## Demo plan (`/demo-feature`)

1. Copy the Appendix A fixture project into the workspace, `npm install`. Run `jay-stack validate` in a terminal recording with only `bad-modal` present: exactly the 6 warnings of the Example table, 0 errors, no `.jay` warning.
2. Remove `bad-modal`, keep `good-modal`, rerun: 0 warnings, 0 errors.
3. Run the dev server, open `/good-modal/` in Playwright and assert, recording to the workspace root (`focus-dialogs-<date>.webm`):
   - Tab until `document.activeElement` is the "Open cart" button; Enter opens the dialog (`dialog.matches(':modal')`).
   - **Tab never reaches page content behind the dialog**: press Tab 5 times; after each press `document.activeElement` is inside the `<dialog>` or is `document.body`/browser chrome (never an element in `.app` outside the dialog).
   - `document.scrollingElement.scrollTop` is unchanged after a wheel scroll.
   - Escape closes; `document.activeElement` is the "Open cart" button again; dialog and backdrop fade out.

## Verification Criteria

- **Red before Phase 2, green after** (they assert a finding or a message): 1, 2, 3, 6, 7, 9, 12, 13, 15, 18, 20, 23, 25, 26a, 26b, 26c, 26e, 26f, 26g, 26h, 26l, 26m, 26n, 27, 28, 31.
- **Green before and after** (vacuous no-finding tests, guard against false positives; must not turn red): 4, 5, 8, 10, 11, 14, 16, 17, 19, 21, 22, 24, 26, 26d, 26i, 26j, 26k, 26o, 29, 30 (30 is documentation-only). (26e is mixed: its `<div>` half is no-finding.)
- Existing a11y and stack-cli tests unchanged, including the two plugin passes after the `scannedPlugins` hoist.
- `yarn confirm` passes.
- No new findings on the repo's example apps other than true positives (record count in Implementation Results).
- ui-kit guides contain no claim that popovers trap focus, no `popovertarget` on a non-button, no hard-coded `aria-expanded`, and `popover-menu.md` has no `popovertarget` (hover-driven).

## Scope pre-mortem

| Risk                                                                            | Mitigation                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `outline` rule noisy on CSS resets (`*:focus{outline:none}` + `:focus-visible`) | Bare `:focus-visible`/`*` replacement counts (tests 13-14)          |
| Selector matching becomes a CSS engine                                          | Exact key equality on the last compound only; unparseable → no fire |
| Scroll-lock warnings on correct `:has(dialog:modal)` locks and app shells       | CSS rule rejected; only the JS `style.overflow` setter is flagged   |
| `popstate` warnings on routers                                                  | Rule rejected; guide explains `CloseWatcher` limits                 |
| Core TS message points at an absent guide                                       | Pointer only when `scanPlugins` finds a11y-validator                |
| Example apps start warning                                                      | Fix them or suppress per page, listed in Implementation Results     |

## Trade-offs

- Warnings, not errors: less safety, no broken builds on legit code.
- Line-scan TS rule is crude but cheap and matches an existing, accepted mechanism.
- Scroll lock, back gesture and focus-ring contrast left to the guide: honest limits of static analysis.

## Feedback-loop decision (jay-feedback)

- **Validation:** yes — 5 a11y rules + 1 core TS pattern (above).
- **Agent-kit guide:** yes — new `focus-and-dialogs.md`, plus fixes to ui-kit popover guides.
- **Framework feature:** no — `<dialog>`, `inert` and `popover` are platform features.

## Appendix A — demo fixture project

`package.json` dependencies: `@jay-framework/fullstack-component`, `@jay-framework/component`, `@jay-framework/runtime`, `@jay-framework/stack-client-runtime`, `@jay-framework/stack-server-runtime`, `@jay-framework/jay-stack-cli`; devDependencies: `@jay-framework/a11y-validator` (found by `scanPlugins` with `includeDevDeps: true`). No other validator plugin, no `src/components/`, no `src/actions/`.

Refs are declared in each page's contract (`type: interactive` + `elementType`), as in `examples/jay-stack/mood-tracker-plugin/lib/pages/mood-stats/page.jay-contract`.

`src/pages/bad-modal/page.jay-contract`

```yaml
name: Page
tags:
  - tag: openCart
    type: interactive
    elementType: HTMLButtonElement
  - tag: help
    type: interactive
    elementType: HTMLDialogElement
```

`src/pages/bad-modal/page.jay-html`

```html
<html>
  <head>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
    <script type="application/jay-validations">
      jay-stack:
        allow-no-design-system: true
    </script>
    <title>Bad modal</title>
  </head>
  <body>
    <div class="app">
      <h1>Shop</h1>
      <button type="button" class="btn" ref="openCart">Open cart</button>
      <div class="overlay" role="dialog" aria-modal="true"><h2>Cart</h2></div>
      <dialog ref="help"><h2>Help</h2></dialog>
      <div role="button" tabindex="0" autofocus>Menu</div>
      <style>
        .btn:focus {
          outline: none;
        }
        a {
          outline: 0;
        }
      </style>
    </div>
  </body>
</html>
```

`src/pages/bad-modal/page.ts` (line 7 is the overflow line)

```ts
import { makeJayStackComponent, PageProps } from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import type { PageContract, PageElementRefs } from './page.jay-html';

function badModalConstructor(_props: Props<PageProps>, refs: PageElementRefs) {
  refs.openCart.onclick(() => {
    document.body.style.overflow = 'hidden';
  });
  return { render: () => ({}) };
}

export const page = makeJayStackComponent<PageContract>()
  .withProps<PageProps>()
  .withInteractive(badModalConstructor);
```

`src/pages/good-modal/page.jay-contract`

```yaml
name: Page
tags:
  - tag: openCart
    type: interactive
    elementType: HTMLButtonElement
  - tag: closeCart
    type: interactive
    elementType: HTMLButtonElement
  - tag: cart
    type: interactive
    elementType: HTMLDialogElement
```

`src/pages/good-modal/page.jay-html`

```html
<html>
  <head>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
    <script type="application/jay-validations">
      jay-stack:
        allow-no-design-system: true
    </script>
    <title>Good modal</title>
  </head>
  <body>
    <div class="app">
      <h1>Shop</h1>
      <button type="button" class="btn" ref="openCart">Open cart</button>
      <dialog ref="cart" aria-labelledby="cart-title">
        <h2 id="cart-title">Cart</h2>
        <button type="button" class="btn" ref="closeCart">Close</button>
      </dialog>
      <style>
        .app {
          background: #ffffff;
          color: #111111;
          min-height: 200vh;
        }
        .btn:focus-visible {
          outline: 2px solid #1a56db;
          outline-offset: 2px;
        }
        html:has(dialog:modal) {
          overflow: hidden;
        }
        dialog {
          transition:
            opacity 0.2s,
            display 0.2s allow-discrete,
            overlay 0.2s allow-discrete;
          opacity: 0;
        }
        dialog[open] {
          opacity: 1;
        }
        dialog::backdrop {
          transition:
            background-color 0.2s,
            display 0.2s allow-discrete,
            overlay 0.2s allow-discrete;
          background-color: transparent;
        }
        dialog[open]::backdrop {
          background-color: rgb(0 0 0 / 0.4);
        }
        @starting-style {
          dialog[open] {
            opacity: 0;
          }
          dialog[open]::backdrop {
            background-color: transparent;
          }
        }
      </style>
    </div>
  </body>
</html>
```

`src/pages/good-modal/page.ts`

```ts
import { makeJayStackComponent, PageProps } from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import type { PageContract, PageElementRefs } from './page.jay-html';

function goodModalConstructor(_props: Props<PageProps>, refs: PageElementRefs) {
  refs.openCart.onclick(() => refs.cart.exec$((dialog) => dialog.showModal()));
  refs.closeCart.onclick(() => refs.cart.exec$((dialog) => dialog.close()));
  return { render: () => ({}) };
}

export const page = makeJayStackComponent<PageContract>()
  .withProps<PageProps>()
  .withInteractive(goodModalConstructor);
```

## Implementation Results

Implemented on branch `ai-web-mistakes/01-focus-inert`.

### What shipped

| Piece                                                                                                                                                                                                           | Where                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 5 a11y rules (`custom-modal`, `dialog-name`, `outline-without-focus-visible`, `outline-none-unconditional`, `autofocus-outside-dialog`)                                                                         | `packages/plugins/a11y-validator/lib/validators/focus-rules.ts`, called from `a11y-validator.ts`          |
| CSS sources + nesting flattener + selector helpers (shared with later CSS rules)                                                                                                                                | `packages/plugins/a11y-validator/lib/css/{css-sources,flat-rules,selectors}.ts`, DOM helpers `lib/dom.ts` |
| `postcss` `^8.5.6`, `postcss-selector-parser` `^7.1.0` as runtime `dependencies`                                                                                                                                | `packages/plugins/a11y-validator/package.json` (no version bump)                                          |
| Core TS scan `body-style-overflow` (`SCROLL_LOCK_PATTERNS`), `checkDirectDocumentAccess` exported with `{ hasA11yValidator }`                                                                                   | `packages/jay-stack/stack-cli/lib/validate.ts`                                                            |
| One `scanPlugins` per run, shared by the TS scan, `runPluginValidators` and `runProjectValidators`                                                                                                              | same                                                                                                      |
| New guide `focus-and-dialogs.md`; pointers in `a11y-patterns.md`; ui-kit `popover-menu.md` / `click-popover.md` fixed (markup only); framework `validation-guide.md` section + "What the Validator Sees" bullet | as designed                                                                                               |

### Reviewer notes folded in

| Note                                                                      | How it was folded in                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suppression keys use the `allow-` prefix                                  | Rule ids stay `custom-modal`, `dialog-name`, …; the page key is `a11y: { allow-<rule-id>: true }` (e.g. `allow-custom-modal`), matching `allow-adjacent-duplicate-text` and the design-system `allow-…` keys. Every suggestion names its key. Test 5 uses `allow-custom-modal`; `dialog-name` has its own suppression test |
| Test 31 says where its fixture lives and how a11y-validator resolves      | Doc comment on test 31: `test/fixtures/validate/focus-dialogs`, devDependency → `require.resolve('<name>/plugin.yaml')` from the fixture dir walks up to the monorepo root `node_modules` symlink; runs from the built dist                                                                                                |
| The outline-without-focus-visible message is a template                   | Message is `` `${prefix} ${selector} removes the focus outline with no :focus-visible replacement. …` `` with the firing selector interpolated (tests 9, 18, 26l, 26m pin the selector)                                                                                                                                    |
| Exact `toEqual` / `endsWith` checks, fixtures in `test/fixtures/`         | Test 31 asserts the whole `[file, message]` list with `toEqual` on the `test/fixtures/validate/focus-dialogs` project; guide pointers are `endsWith`; test 20 and the selector-list test pin full messages. The a11y unit rows stay inline HTML like the rest of that suite                                                |
| Demo pre-checks that the page can scroll                                  | The recording asserts `scrollHeight > clientHeight` before opening the dialog                                                                                                                                                                                                                                              |
| validation-guide.md says the `body-style-overflow` pointer is conditional | Added: the core warning names `focus-and-dialogs.md` only when a11y-validator is installed                                                                                                                                                                                                                                 |

### Deviations

1. **Mixed linked + head CSS detection.** The design reads "any non-empty `<style>` in `ctx.head`", but `JayHtmlHeadMeta` had no style field. Added an optional `styles?: string[]` to `JayHtmlHeadMeta` (`compiler-shared/lib/plugin-validators.ts`), filled by `parseHeadMeta` (`compiler-jay-html/lib/jay-target/jay-html-parser.ts`) with the non-empty head `<style>` texts. Additive; no emitted-output change.
2. **Fixture project needs `.jay` `validations: allow-no-error-pages: true`.** The DL counted exactly 6 warnings, but the project-level "no branded error page" nudge (added after the DL's audit) adds a 7th on `src/pages`. The fixture suppresses it, as the DL already does for `NO-DESIGN-SYSTEM`.
3. **stack-cli `tsconfig.json` excludes `test/fixtures/**/src/pages/**`.** The Appendix A `page.ts` files import `./page.jay-html` types that only exist after `jay-cli definitions`, so `build:check-types` failed. Same approach as `rollup-plugin`'s `**/fixtures/**` exclude.
4. **Red-first for tests 27–31** was by construction (they import the not-yet-exported `checkDirectDocumentAccess`); they were not run red separately before the stack-cli change.
5. `outline-none-unconditional` (a) also honours the `:focus-visible` replacement escape for the same key, as the design table says; a test covers it.
6. Test file uses `toMatch` instead of `toContain` (repo rule).
7. **Demo page keeps its `<style>` in `<head>`.** The Appendix A good page has a multi-line `<style>` inside `<body>`; the dev server's compiled module then fails with `Unterminated string literal` (the style text is emitted as a single-quoted JS string with raw newlines). That is a pre-existing compiler bug, not part of this log, and is reported for its own design log (no fix here). The validator side is unaffected: the stack-cli fixture keeps the body `<style>` and test 31 reads it. The recorded demo moves the same CSS into `<head>`, which the focus rules also read (still 0 findings).

### Tests

- a11y-validator: `test/validators/focus-and-dialogs.test.ts` — 45 tests. Before Phase 2: 25 failed (every "red before" row), 20 passed (the vacuous no-finding rows), after fixing one test bug (`.resolves` on a sync result). After: 45/45. Whole package 120/120.
- stack-cli `validate.test.ts`: tests 27–31 added; 102/102.
- Full suite (`yarn test`, after `yarn rebuild` + `yarn build:check-types` passed): 60 packages green, then `@jay-framework/dev-server` failed on browser hook/test **timeouts** (different tests each run; machine load average 23–72 from parallel streams), which aborted the remaining 11 packages. Re-run on its own: dev-server 811/811. The 11 aborted packages run individually: stack-cli 218/218, a11y-validator 120/120, agent-skills 10/10, data-files 23/23, design-system-validator 160/160, editing-policy 79/79, markdown 35/35, seo-validator 66/66, design-system-demo 9/9, fake-shop 9/9, smoke-test 80/80. Total 4,645 tests, 0 assertion failures.
- Example apps (`jay-stack validate`): fake-shop, design-system-demo, smoke-test — **0** new focus/dialog findings.

### Demo

`01-focus-inert-20261123.webm` (workspace root, narrated, Playwright Chromium): real `validate` output for a bad-only project (exactly the 6 warnings of the Example table, 0 errors) and a good-only project (0 / 0); then `/good-modal/`: page-scrollable pre-check, Tab to "Open cart" + Enter → `dialog.matches(':modal')`; 5 × Tab never leaves the dialog; wheel scroll leaves `scrollTop` unchanged; Escape closes and focus returns to "Open cart". All assertions passed.

### Feedback-loop result

Validation: 5 a11y rules + 1 core TS pattern. Guide: `focus-and-dialogs.md` (+ ui-kit fixes, framework pointer). Framework feature: none.
