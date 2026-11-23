# 244 - INP responsiveness validations

**Status:** [Implemented] — 3 warnings + guides; `inp/inline-event-handler` dropped (see Implementation Results).

## TL;DR — decisions for the implementer

1. **Four new `jay-stack validate` warnings. Each one points to a guide.** A guide-only answer was rejected: the validators lead agents to the guides.
2. **Two TS rules** run on the page's `.ts` file (same file lookup as `checkDirectDocumentAccess`):
   - `inp/blocking-dialog`: bare or `window.` `alert(` / `confirm(` / `prompt(`
   - `inp/settimeout-zero-yield`: `setTimeout(<anything>, 0)`
3. **TS scope = the interactive constructor's body.** Resolve the argument of `.withInteractive(X)`: an inline function, or a named `function X` / `const X =` anywhere in the file. Scan only that span. No `withInteractive` call, or an unresolvable argument → nothing scanned.
4. **No TypeScript AST.** `typescript` is only a devDependency of stack-cli (`package.json:57`), and nothing in `stack-cli/lib` imports it. Instead, a small **masker** blanks out comments and string/template literals (keeping line numbers), then balanced `()`/`{}` matching finds spans and call arguments.
5. **One jay-html rule** in core: `inp/inline-event-handler`, for `on*=` attributes such as `onclick="..."`.
6. **One CSS rule** in `seo-validator`: `content-visibility-without-intrinsic-size`.
7. **Severity is always `warning`.** There is no `info` level (`plugin-validators.ts:4`).
8. **Where the remediation + guide pointer go:**

   | Rule kind            | Finding shape                                                                                                      | Remediation + `See agent-kit/...`                                                                         |
   | -------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
   | CSS (seo-validator)  | `JayHtmlValidationFinding` — has `suggestion?: string` (`plugin-validators.ts:6`; printed at `validate.ts:98,105`) | in `suggestion`, like the sibling `display=swap` rule (`seo-validator.ts:363`); `message` states the fact |
   | TS / jay-html (core) | plain strings, like the DOM check                                                                                  | last sentence of the string                                                                               |

9. **Suppression:** TS rules use `// jay-inp: allow` on the same line (mirrors `// jay-dom: allow`). jay-html and CSS rules use `<script type="application/jay-validations">` keys.
10. **Red tests first.** `checkDirectDocumentAccess` has no tests today; it gets a regression test as part of this change.

## Background

INP (Interaction to Next Paint) measures how long the page takes to paint after a click, tap or key press. AI-written code commonly hurts it by:

- long synchronous work in event handlers
- yielding with `setTimeout(0)` instead of `scheduler.yield()`
- blocking dialogs
- rendering huge DOM trees up front
- using `content-visibility` without a size placeholder

Jay already splits work into slow render (build), fast render (request) and interactive (client). Data work belongs in the first two. That is the Jay-specific angle.

## Problem

`jay-stack validate` says nothing about responsiveness, and no agent-kit guide covers INP. An agent never learns that `confirm()` freezes the main thread, or that `setTimeout(0)` sends the task to the back of the queue.

## Prior Art / Adjacent Mechanisms (verified)

| Mechanism                          | Where                                                                                                     | What we reuse                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TS line scan of the page component | `stack-cli/lib/validate.ts:611-658` (`DOCUMENT_ACCESS_PATTERNS`, `checkDirectDocumentAccess`)             | File lookup (`<basename>.ts` or `page.ts`, `:625-627`), same-line suppression (`:621`, `:640`), message shape (`:645-649`)                                   |
| Call site                          | `validate.ts:2168-2172`                                                                                   | Same call site for the new TS rules                                                                                                                          |
| Core jay-html element walk         | `validate.ts:507` (`walkElement` inside `checkRefElementTypes`, recursing `childNodes` at `:569`)         | Same recursive `walkElement` over `childNodes` for `inline-event-handler`                                                                                    |
| Plugin validator context           | `compiler-shared/lib/plugin-validators.ts:25-52`; built at `validate.ts:1838-1841` with `css: parsed.css` | `ctx.css` for the CSS rule                                                                                                                                   |
| What `parsed.css` contains         | `compiler-jay-html/lib/jay-target/jay-html-parser.ts:1143-1189`                                           | Local `<link rel="stylesheet">` files (with nested `@import` resolved) **plus** `<head><style>`. Not: remote URLs, `<body>` `<style>`, `style=""` attributes |
| Finding shape                      | `plugin-validators.ts:3-9` (`severity: 'error' \| 'warning'`, `message`, optional `suggestion`)           | `warning`; CSS rule fills `suggestion`                                                                                                                       |
| Rule suppression                   | `seo-validator.ts:11-13` (`validationOverrides.seo[rule]`), `a11y-validator.ts:15-17`                     | Suppression key for the CSS rule                                                                                                                             |
| A CSS perf rule in seo-validator   | `seo-validator.ts:359-367` (font `display=swap`)                                                          | Home and tone of the CSS rule                                                                                                                                |
| Guide pointer suffix               | `a11y-validator.ts:8`, `seo-validator.ts:193`                                                             | `See agent-kit/...` format                                                                                                                                   |
| Interactive-phase guides           | `agent-kit-template/developer/component-state.md`, `component-refs.md:123-143`                            | Linked from the new guide                                                                                                                                    |

**Does the compiler already handle `on*` attributes?** No. A grep of `compiler-jay-html/lib` for `on`-prefix attribute handling finds nothing: such attributes pass through as plain HTML attributes. So the new rule does not duplicate a compiler check.

**Real-code layout (drives decision 3).** The usual page shape is a named constructor defined above and passed by name at the end:

| File                                                             | Constructor                            | Handler                       | `.withInteractive(` |
| ---------------------------------------------------------------- | -------------------------------------- | ----------------------------- | ------------------- |
| `examples/jay-stack/fake-shop/src/pages/products/[slug]/page.ts` | `:93 function ProductsPageConstructor` | `:111 refs.addToCart.onclick` | `:152`              |
| `examples/jay-stack/fake-shop/src/pages/page.ts`                 | `homePageConstructor`                  | —                             | `:58`               |
| `examples/jay-stack/fake-shop/src/pages/products/page.ts`        | `ProductsPageConstructor`              | —                             | `:52`               |

A "lines after `.withInteractive(`" cut would scan nothing in these files. Same shape in fake-shop `inventory-check`, `upload`, and the mood-tracker plugin's `mood-stats`.

## Q&A

| Question                                                                                  | Answer                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Why not guide-only?                                                                       | Validators are how agents find guides. False positives are rare; known false negatives are listed in Trade-offs.                                                                                                                       |
| Why scan only the interactive constructor?                                                | That code runs on the client. Slow/fast render runs on the server, where dialogs and `setTimeout(0)` are not an INP issue.                                                                                                             |
| Why not the whole file minus `withSlowlyRender`/`withFastRender`/`withLoadParams` bodies? | Those are often named functions too, so we would need the same resolver anyway — and module-level helpers would then be scanned even when only the server uses them. Resolving the one interactive constructor is simpler and precise. |
| Why not a TS AST?                                                                         | `typescript` is a devDependency only; making it a runtime dependency of the CLI for two warnings is heavy. The masker (comments/strings blanked) plus bracket matching covers the cases we flag, including arrows and nested calls.    |
| Helpers defined outside the constructor and called from handlers?                         | Not scanned — a false negative, the safe direction. The guide covers it.                                                                                                                                                               |
| Headless plugin components?                                                               | Not scanned. Same scope as today's DOM check.                                                                                                                                                                                          |
| Is `inline-event-handler` an INP rule?                                                    | Partly. Inline handlers bypass Jay refs, so no one owns or batches them, and they are a common AI habit. It points to the INP guide.                                                                                                   |
| Error or warning?                                                                         | Warning. Each pattern has rare legitimate uses.                                                                                                                                                                                        |

## Design

### Rule table

| Rule id                                     | Where                    | Detects                                                                                                                                                                                                                                                                                                                                      | Message                                                                                                                                                                                                           | Suppress                                               |
| ------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `inp/blocking-dialog`                       | core TS scan             | in masked constructor span: `/(?<![\w.$])(?:window\.)?(alert\|confirm\|prompt)\s*\(/`, skipped only when its balanced `(...)` is **immediately** followed by `\s*(:[^{]*)?\{` (a declaration: `confirm() {`, `confirm(): void {`, `function confirm() {`). `if (confirm('x')) {` still warns — the `)` after the args is not followed by `{` | `page.ts:N — "confirm(" blocks the main thread and hurts INP; use an in-app dialog driven by ViewState. Suppress with // jay-inp: allow on the same line. See agent-kit/developer/responsiveness-guide.md`        | `// jay-inp: allow`                                    |
| `inp/settimeout-zero-yield`                 | core TS scan             | in masked span: each `setTimeout(` call; take its balanced argument list, split on **top-level** commas; flag when there are ≥2 args and the 2nd, **trimmed**, is exactly `0` (`0.0`, `-0`, `0x0` do not count)                                                                                                                              | `page.ts:N — setTimeout(…, 0) queues behind all other tasks; yield with scheduler.yield() (with fallback). Suppress with // jay-inp: allow on the same line. See agent-kit/developer/responsiveness-guide.md`     | `// jay-inp: allow`                                    |
| `inp/inline-event-handler`                  | core jay-html walk       | attribute name matching `/^on[a-z]+$/i` on any body element, recursing into `<template>` children and headless inline templates; **not** inside `<script>` (its text is not elements). `data-on-x` does not match                                                                                                                            | `<button onclick> — inline handler bypasses Jay refs; add ref="..." and handle it in withInteractive. See agent-kit/developer/responsiveness-guide.md`                                                            | `jay-stack: { allow-inline-handlers: true }`           |
| `content-visibility-without-intrinsic-size` | seo-validator, `ctx.css` | see "CSS rule details"                                                                                                                                                                                                                                                                                                                       | message: `.card uses content-visibility: auto without contain-intrinsic-size — scrollbar jumps and layout shift`; suggestion: `Add contain-intrinsic-size: auto <px>. See agent-kit/designer/jay-html-styling.md` | `seo: { allow-content-visibility-without-size: true }` |

**Naming convention.** TS rule ids are `inp/<kebab>`; their suppression is the shared line comment. jay-html/CSS keys follow the existing per-plugin convention `<namespace>: { allow-<what>: true }` (as in seo/a11y). The rule id appears only in the docs/validation-guide row, not in the message.

### TS scanner

`checkDirectDocumentAccess` becomes one caller of a shared scanner. Names are intent, not final code.

```ts
interface SourceRule {
  id: string;
  find(masked: string): Match[];
  suppress: string;
  message(m: Match): string;
}
function maskSource(src: string): string; // comments + string/template text → spaces; newlines kept
function interactiveSpan(masked: string): Span | undefined;
function scanComponentSource(
  jayHtmlPath: string,
  rules: SourceRule[],
  scope: 'file' | 'interactive',
): string[];
```

- **Masking** keeps offsets and line numbers, so `'Please confirm (y/n)'` and `// confirm(` never match. Suppression is checked on the **raw** line.
  - Template `${...}` stays visible (code). Nested templates (`` `${ `a` }` ``) use a stack: template → `${` → code → `` ` `` → template, popping on the matching `}`.
  - **Regex literals:** a `/` starts a regex when the previous non-space token is an operator, one of `( , = : [ ! & | ? { } ;`, or line start; the body (with `[...]` classes and `\/` escapes) is blanked. Otherwise `/` is division. Known miss: `/` after `)` of `if (x) /re/.test(y)` is read as division — accepted (rare; at worst a stray match, suppressible).
- **`interactiveSpan`**: find `.withInteractive(` in masked text, take the first argument of its balanced `(...)`.
  - Starts with `function` / `(` / `async` / an identifier followed by `=>` → that inline expression is the span.
  - A bare identifier `X` → find `(?:export\s+)?(?:async\s+)?function\s+X\s*[<(]` or `(?:export\s+)?(?:const|let|var)\s+X\s*(?::[^=]+)?=` (covers arrows and function expressions) in masked text; span = from there to the matching `}` of its body (or the arrow's expression end).
  - Not found → `undefined` → no INP warnings.
- **DOM rules keep `scope: 'file'` and raw-line matching** — behaviour and text unchanged.

Examples of what `settimeout-zero-yield` flags:

| Code                                                            | Flagged?                           |
| --------------------------------------------------------------- | ---------------------------------- |
| `setTimeout(r, 0)`                                              | yes                                |
| `setTimeout(() => doWork(), 0)`                                 | yes                                |
| `setTimeout(() => fn(a, b), 0)`                                 | yes (inner comma is not top-level) |
| `new Promise(r => setTimeout(r, 0))`                            | yes                                |
| `setTimeout(r, 100)` / `setTimeout(r)` / `setTimeout(r, delay)` | no                                 |

### CSS rule details

- Input: `ctx.css` (local linked stylesheets + head `<style>`; see Prior Art). Remote stylesheets and `style=""` are out of scope.
- Walk rule blocks with a brace-matching pass over CSS with comments **and strings** masked (`content: "}"` cannot unbalance it), **descending into `@media` / `@supports` / `@container` / `@layer`** blocks so nested rules are checked.
- A block warns when it declares `content-visibility: auto` and declares none of: `contain-intrinsic-size`, `contain-intrinsic-block-size`, `contain-intrinsic-inline-size`, `contain-intrinsic-width`, `contain-intrinsic-height` (shorthand or any longhand).
- `content-visibility: var(--x)` is not flagged (value unknown). A custom property _defining_ `--cv: auto` is not flagged.
- Message names the block's selector.

### Guides

**New: `agent-kit-template/developer/responsiveness-guide.md`**

1. What INP is, and the 200 ms target
2. Data work in slow/fast render, not `withInteractive`; `createMemo` instead of recomputing per event
3. Yield in long handlers: `scheduler.yield()` with a `setTimeout` fallback (code example)
4. Visual feedback first (set a signal), then the work
5. No `alert`/`confirm`/`prompt` — in-app dialog (jay-html + ViewState + refs)
6. No large `JSON.parse` / `localStorage` loops in handlers — read once, keep in a signal
7. Events through refs, never `on*=` attributes
8. Long lists: paginate or render in the fast phase; `content-visibility` with `contain-intrinsic-size`
9. Scope note: only the interactive constructor is scanned; suppression `// jay-inp: allow`

**Extend:** `designer/jay-html-styling.md` (`## content-visibility`: pair with `contain-intrinsic-size: auto <px>`), `developer/INSTRUCTIONS.md` (guide row), `designer/validation-guide.md` (a row per rule id).

## Rejected candidates

| Candidate                                               | Why rejected                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `JSON.parse` in handlers                                | Cost depends on unknown payload size. Too noisy. Guide only.      |
| Sync `localStorage` in loops                            | Needs real loop detection. Unsound without an AST. Guide only.    |
| Large static lists → `content-visibility` hint          | `forEach` size is unknown statically. Weak signal.                |
| "Heavy work in interactive" (`fetch(`, `.sort(`)        | Legitimate and common; no cost signal. Guide only.                |
| `requestAnimationFrame` misuse, no `scheduler.postTask` | Absence is not a bug.                                             |
| `setTimeout(fn)` with no delay                          | Hard to tell from real deferrals. Only explicit `, 0` is flagged. |
| TS AST via `typescript`                                 | Would add a runtime dependency to the CLI; masker suffices.       |
| New `info` severity                                     | Changes the shared finding interface. Out of scope.               |

## Implementation Plan

**Phase 1: red tests first**

1. `stack-cli/test/validate.test.ts`, fixtures in `test/fixtures/inp-responsiveness/<case>/` (jay-html + `page.ts`):

   | Case                                                                                                                                | Expected                                    |
   | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
   | inline `.withInteractive(function (p, refs) { … confirm('x') … })`                                                                  | 1 warning                                   |
   | **named** constructor above, `.withInteractive(Page)` last line, `confirm(` in a handler                                            | 1 warning                                   |
   | **named arrow** `const Page = (p, refs) => { … alert(…) … }`                                                                        | 1 warning                                   |
   | `confirm(` inside a `withFastRender` function, not in the constructor                                                               | 0                                           |
   | `foo.confirm(` in constructor                                                                                                       | 0                                           |
   | `window.confirm(` in constructor                                                                                                    | 1                                           |
   | `window.confirm(` with `// jay-inp: allow`                                                                                          | 0                                           |
   | **typed const** `const Page: Ctor<P> = function (p, refs) { … confirm('x') … }`                                                     | 1                                           |
   | **exported** `export async function Page(p, refs) { … confirm('x') … }`                                                             | 1                                           |
   | `'Please confirm (y/n)'` string, `// confirm(` comment, method shorthand `confirm() {`, `confirm(): void {`, `function confirm() {` | 0                                           |
   | `if (confirm('x')) {` / `if (!confirm('x')) return;`                                                                                | 1 each                                      |
   | masker: `/confirm\(/.test(s)` regex, `` `${ `confirm(` }` `` nested template                                                        | 0                                           |
   | `setTimeout(r, 0.0)`, `setTimeout(r, -0)`                                                                                           | 0                                           |
   | `setTimeout(r, 0)`, `setTimeout(() => doWork(), 0)`, `setTimeout(() => fn(a, b), 0)`                                                | 1 each                                      |
   | `setTimeout(r, 100)`, `setTimeout(r)`                                                                                               | 0                                           |
   | no `.withInteractive(` in file                                                                                                      | 0                                           |
   | `<button onclick="x()">`                                                                                                            | 1; 0 with `allow-inline-handlers`           |
   | `onclick=` inside `<template>`                                                                                                      | 1                                           |
   | `<div data-on-x="y">`                                                                                                               | 0                                           |
   | existing DOM-access patterns                                                                                                        | same warnings, same text (regression guard) |

2. **Real example page:** run the scanner on `examples/jay-stack/fake-shop/src/pages/products/[slug]/page.ts` with a copied fixture that adds one `confirm(` inside `ProductsPageConstructor`'s `addToCart` handler → exactly 1 warning at that line. Proves the named-constructor layout on real code.
3. `plugins/seo-validator/test/validators/seo-validator.test.ts`:

   | CSS                                                                | Expected         |
   | ------------------------------------------------------------------ | ---------------- |
   | `.a{content-visibility:auto}`                                      | 1                |
   | + `contain-intrinsic-size`                                         | 0                |
   | + `contain-intrinsic-block-size` only                              | 0                |
   | inside `@media (min-width:600px){ .a{content-visibility:auto} }`   | 1                |
   | `content-visibility: var(--cv)`                                    | 0                |
   | `.a{content:"}"} .b{content-visibility:auto}` (CSS strings masked) | 1, selector `.b` |
   | suppressed                                                         | 0                |

4. **Guide-path test:** for every new message (CSS: its `suggestion`), extract the `See agent-kit/<path>` and assert the file exists in `agent-kit-template`.
5. Test rules: assert the full list with `toEqual` (never `toContain`); expected messages written by hand from the Design table.
6. Run; confirm all new tests are red.

**Phase 2: code**

1. Add `maskSource`, `interactiveSpan`, `scanComponentSource`; port DOM patterns (scope `file`); add the two INP rules (scope `interactive`).
2. Add `checkInlineEventHandlers` (recursive `walkElement` over `body.childNodes`) and call it next to `validate.ts:2168`.
3. Add the seo-validator CSS rule.
4. Tests green, then `yarn confirm`.

**Phase 3: guides.** Write the new guide and the extensions above.

**Phase 4: demo (`/demo-feature`) in `examples/jay-stack/fake-shop`**

1. Add a demo page with `confirm()`, `setTimeout(…, 0)`, `onclick=`, and bare `content-visibility`, using the named-constructor layout.
2. `jay-stack validate` → the four warnings with guide paths.
3. Fix per the guides: in-app dialog, `scheduler.yield`, a ref, `contain-intrinsic-size`. Validate is clean.
4. Dev server; drive the fixed dialog in a browser.
5. Record the video to the workspace root.

**Phase 5: wrap up.** Append Implementation Results; set the index status to `[Implemented]`.

## Examples

```ts
// page.ts — before (warns)
function ProductPage(_p, refs) {
  refs.remove.onclick(async () => {
    if (!confirm('Delete?')) return;                 // inp/blocking-dialog
    setTimeout(() => recompute(), 0);                // inp/settimeout-zero-yield
  });
  return { render: () => ({}) };
}
export const page = makeJayStackComponent<…>()
  .withFastRender(renderFast)                        // not scanned
  .withInteractive(ProductPage);                     // resolves → ProductPage body

// after
const yieldToMain = () =>
  globalThis.scheduler?.yield ? scheduler.yield() : new Promise(r => setTimeout(r, 0)); // jay-inp: allow
```

```css
/* warns */
.card {
  content-visibility: auto;
}
/* ok    */
.card {
  content-visibility: auto;
  contain-intrinsic-size: auto 320px;
}
```

## Trade-offs

- **Masker + bracket matching, not an AST.** No new runtime dependency. Cost: exotic forms (constructor imported from another file, `withInteractive(wrap(X))`) resolve to nothing → false negatives, the safe direction.
- **Constructor-only scope.** Module-level helpers called from handlers are missed. Accepted.
- **Known false negatives (accepted):** `globalThis.confirm(` / `self.alert(` (only bare and `window.` match); constructor imported from another file; `withInteractive(wrap(X))`; helpers outside the constructor.
- **Warnings only.** Never block a build. The guide pointer helps.
- **CSS rule is per block.** `content-visibility` and `contain-intrinsic-size` in different rules for one element → false positive; suppression covers it.

## Verification Criteria

- Phase 1 tests red before code, green after. `yarn confirm` passes.
- Existing DOM-access warning text unchanged byte for byte.
- Every new TS/jay-html message, and the CSS `suggestion`, ends with `See agent-kit/…` and the path exists (guide-path test).
- The real fake-shop page test finds the planted `confirm(` in the named constructor.
- Demo video: four warnings, then a clean validate, then the fixed dialog working.

## Scope pre-mortem

| Failure                                                                   | Guard                                                                                                       |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Refactor changes DOM messages                                             | Regression test (Phase 1)                                                                                   |
| Named constructor not found                                               | Named + named-arrow + real-page tests                                                                       |
| Strings/comments trigger rules                                            | Masker + string/comment tests                                                                               |
| Local function or method named `confirm`                                  | Method shorthand excluded; a plain local `confirm(...)` call still warns — suppress on that line            |
| Masker desync (unhandled regex/template form blanks code or exposes text) | Masker fixtures (regex, nested template, strings, comments); line count asserted equal before/after masking |
| Resolver miss (constructor form not matched → silent 0)                   | Inline, named, named-arrow, typed-const, export-function and real-page tests                                |
| Scope creep into AST / headless scanning                                  | Out of scope; separate log                                                                                  |
| Someone adds `info` severity                                              | Rejected here                                                                                               |

## Feedback-loop decision

- **Validation:** yes, the 4 rules above.
- **Agent-kit guide:** yes — new `developer/responsiveness-guide.md`, a styling section, validation-guide rows.
- **Framework feature:** none.

## Implementation Results

### What shipped

| Rule                                        | Module                                                                                     | Tests                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `inp/blocking-dialog`                       | `stack-cli/lib/inp-responsiveness.ts` (new)                                                | `stack-cli/test/inp-responsiveness.test.ts` |
| `inp/settimeout-zero-yield`                 | same                                                                                       | same                                        |
| `content-visibility-without-intrinsic-size` | `seo-validator/lib/validators/content-visibility.ts` (new), called from `seo-validator.ts` | `seo-validator.test.ts`                     |

Guides: new `developer/responsiveness-guide.md`; `## content-visibility` in `designer/jay-html-styling.md`; a row in `developer/INSTRUCTIONS.md`; a "Responsiveness (INP) warnings" table in `designer/validation-guide.md`.

### Deviations from the Design

1. **`inp/inline-event-handler` dropped** (decided at approval). Design Log #237 owns one error rule, `INLINE-EVENT-HANDLER`, for `on*=` attributes, so a second warning would duplicate it. The responsiveness guide explains why inline handlers hurt and names `INLINE-EVENT-HANDLER`. The jay-html walk, its tests and the `allow-inline-handlers` key are not built.
2. **No shared-scanner refactor of `checkDirectDocumentAccess`.** It stays byte-for-byte unchanged, to avoid conflicts with other branches that edit `validate.ts`. The INP rules live in a new module; `validate.ts` gains one import and one call next to the DOM check. The file lookup (`<basename>.ts` or `page.ts`) is repeated in the new module — a small duplication, accepted.
3. **DOM-access regression guard** is an integration test through `validateJayFiles` (fixture `test/fixtures/inp-responsiveness/page-warnings`) that asserts the DOM warning text exactly, next to the two INP warnings.
4. **Real-page test** reads the real fake-shop `products/[slug]/page.ts` and plants `confirm(` in memory, not in a copied fixture file. It also asserts the page as committed gives 0 warnings.
5. **Dialog message quotes the callee as written** — `"window.confirm("` for `window.confirm(`, `"confirm("` for a bare call.
6. **CSS `suggestion` also names the suppression key**, like the sibling seo rules.
7. **Masker scope.** Strings stop at a newline (unterminated-string safety). CSS masking blanks comments then strings with regexes; a `/*` inside a CSS string is a known miss (rare).

### Test results

- `stack-cli`: 242/242 (new file: 29/29). Red first: the new file failed before `inp-responsiveness.ts` existed; the guide-path test stayed red until the guide was written.
- `seo-validator`: 76/76 (3 new tests red before the rule).
- `yarn build` and `yarn build:check-types`: pass.
- `yarn confirm`: build and type check pass; the test step failed only on `dev-server/test/hydration.test.ts` hook timeouts ("Hook timed out in 10000ms") while machine load was ~77. That file passes 735/735 when run on its own. `yarn format` was then run separately.

### Demo

A temporary fake-shop page (`confirm()`, `setTimeout(…, 0)`, bare `content-visibility: auto`, named constructor) gave exactly the three warnings with guide paths. The fixed page (in-app `role="alertdialog"` driven by ViewState, `scheduler.yield()` with fallback, `contain-intrinsic-size`) validated clean, and the dialog worked in the browser. The demo page was then reverted (not committed).

### Feedback-loop answer

Validation: 3 rules (the fourth is covered by `INLINE-EVENT-HANDLER`). Guide: yes, as listed. Framework feature: none.
