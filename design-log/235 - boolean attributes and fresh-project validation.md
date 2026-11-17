# Design Log #235 — QA fixes: boolean attributes on headless data, fresh-project validation

**Status: [Implemented — awaiting product approval]** — bug-fix log written together with the fix (repro tests first, red → green); independent design-log review 2026-11-10: ready to merge, six non-blocking findings, all addressed (see Implementation Results → Review).

## Decisions for the Implementer (TL;DR)

1. **`checked` is a boolean _property_ (`BOOLEAN_PROPERTY`), not a template-style `PROPERTY`.** Its value is a condition (same grammar as `disabled`); the client applies it with `dp()` (the live `checked` property), SSR emits a present/absent attribute. ✅ verified by new fixtures on the element / hydrate / server targets and slow-render; the react target is covered only by the existing curly-form fixture (no new react case for `checked="x"` or `!x`).
2. **A boolean-attribute value that is exactly one `{expr}` binding means the condition `expr`** (`checked="{selected}"` ≡ `checked="selected"`, `disabled="{x}"` ≡ `disabled="x"`). One helper, `toBooleanCondition` (`expression-compiler.ts`), is used by every target and by slow-render. `"{a} {b}"` stays a compile error.
3. **Because (2) makes the curly form correct, there is no `{…}`-on-boolean validation warning** — documented in the designer guide and `docs/core/jay-html.md` instead (validation would flag something that now works).
4. **Slow-render resolves boolean attributes as conditions**: a fully slow condition becomes the bare attribute (true) or removes it (false); a mixed one keeps the simplified condition. Never `checked="false"`.
5. **The issue was never headless-specific** — the headless `key` / `forEach` scopes resolve correctly; the attribute mapping was wrong for every data source. The repro fixture still uses keyed headless data, inside and outside `forEach`, because that is where it was found.
6. **Fresh project passes validate:** the create-jay home page uses the UI Kit `letter-split` only when UI Kit is selected (`{{#uiKit}}` template sections); the home page does **not** link to dev-only plugin routes (e.g. AIditor) — it documents `/aiditor` as plain text and opens it via an interactive button (`window.open`), so Check 1 stays pages-tree-only.
7. **Generated `CLAUDE.md`/`agents.md` use the creating package manager's run command** (`npm run setup` vs `yarn setup`).
8. **`getService` throws a typed `ServiceNotRegisteredError`** (detected by `name`, since Vite SSR can load a second module copy); `jay-stack setup` prints "Services not initialized yet: this plugin needs service '…' … the plugin that provides it is probably not configured yet".

## Background

An end-to-end QA run built a fresh `create-jay` project with headless plugins, a form page with checkbox chips bound to plugin data, ran `jay-stack setup`, `validate`, and the dev server. Five framework issues surfaced (below). DL#228 already recorded two of them (F2) as proposals; this log implements those two.

## Problems and root causes

### P1 — boolean attributes render wrong (Critical)

Repro: a keyed headless import (`key="ch"`) and

```html
<input type="checkbox" checked="ch.accepted" />
<!-- documented syntax -->
<label forEach="ch.interests.options" trackBy="id">
  <input type="checkbox" checked="selected" />
  <!-- documented syntax -->
  <input type="checkbox" checked="{selected}" />
  <!-- curly form -->
</label>
```

Observed: SSR `checked="selected"` / `checked="ch.accepted"` literally, and `checked="false"` for the curly form — all three are _checked_ in a browser (any present boolean attribute is true). First click inverted the selection.

Root cause (✅ verified):

- `jay-html-compiler-shared.ts:82` (pre-fix) mapped `checked: { type: PROPERTY }` — template-style parsing. A value without `{}` is a literal string: element target emitted `checked: 'selected'` (static attribute ⇒ always checked); server target (`jay-html-compiler-server.ts:415`) wrote `' checked="' + String(vs1.selected) + '"'` ⇒ `checked="false"`.
- The agent-kit (`designer/jay-html-template-syntax.md` "Boolean Attributes") documents `checked="isSelected"` as condition syntax — the docs and the mapping disagreed.
- For true boolean attributes the curly form was inconsistent across targets: `parseBooleanAttributeExpression("{x}")` is a client/hydrate parse error (`expression-compiler.ts:259` help text "no curly braces"), while the server path (`jay-html-compiler-server.ts:404`) accepted it without a validation.
- Slow-render (`slow-render-transform.ts:333` → `resolveTextBindings`, `:268` `String(value)`) string-substituted a slow `{flag}` on a boolean attribute to `"false"`.
- Runtime is fine: `element.ts:162` (`ba` toggles the attribute) and `:166` (`dp` sets the property).

Why a property for `checked`: the `checked` attribute only sets the default; once the user toggles a checkbox, attribute changes no longer move the live state. `dp` keeps the reactive model honest (unchanged from before). `selected` on `<option>` stays a `BOOLEAN_ATTRIBUTE` (no behavior change in this log).

### P2 — `{…}` on a boolean attribute (validation)

Decided: make it correct (TL;DR 2/3) rather than warn. The parse-error help text now lists `disabled="{isDisabled}"` as ✓ and `"{a} {b}"` as ✗.

### P3 — fresh `create-jay` project fails `jay-stack validate` (High; DL#228 F2)

- (a) `create-jay/templates/page.jay-html` always imported `@jay-framework/ui-kit` `letter-split`; with `--plugins "…"` not including UI Kit ⇒ `Plugin "@jay-framework/ui-kit" not found`.
- (b) The home page linked `/aiditor` (a dev-only plugin route). Fix: remove internal `<a href>` to that path; document the URL and open AIditor from `page.ts` via `refs` + `window.open` (not link validation widening).

### P4 — generated `CLAUDE.md` says `yarn setup` for an npm project

`create-jay/templates/CLAUDE.md` hard-coded `yarn`; `scaffoldProject` copied it verbatim although `index.ts` already detects the package manager.

### P5 — misleading setup message

`stack-server-runtime/lib/services.ts` `getService` threw "Service '…' not found. Did you register it in jay.init.ts?"; `run-setup.ts` `initPlugin` printed it as "Init after setup: …" for every plugin whose provider plugin had no credentials yet.

## Prior Art / Adjacent Mechanisms

- `BOOLEAN_ATTRIBUTE` + `ba()` and the `condition` grammar — reused as-is; `booleanProperty` is the same rule emitting `dp()`.
- `parseConditionForSlowRender` (already used for `if`) — reused for boolean attributes in slow-render.
- DL#210 broken-link check (unchanged oracle — project pages + public assets only), DL#228 (F2 proposals, implemented here).

Null hypothesis: docs-only (tell designers to write `checked="{x}"`) fails — SSR still renders `checked="false"`. A validation alone fails the same way. The mapping is wrong, so the fix is in the compiler.

## Design

| Target                 | `checked="cond"` / `checked="{cond}"` | `disabled="{cond}"`             |
| ---------------------- | ------------------------------------- | ------------------------------- |
| element / hydrate      | `checked: dp(vs => cond)`             | `disabled: ba(vs => cond)`      |
| server                 | `if (cond) { w(' checked'); }`        | `if (cond) { w(' disabled'); }` |
| react                  | `checked={cond}`                      | `disabled={cond}`               |
| slow-render (all slow) | bare attribute or removed             | bare attribute or removed       |

New/changed surface: `BOOLEAN_PROPERTY` mapping type, `booleanProperty` grammar start rule, `parseBooleanPropertyExpression`, `toBooleanCondition`; `ServiceNotRegisteredError` / `isServiceNotRegisteredError`; create-jay `renderHomePage` / `renderAgentGuidance` / `renderSections`; create-jay home `openAiditor` interactive button.

## Scope — not handled here

- `<select>`'s `value` vs option `selected` reconciliation after user interaction (unchanged).
- DL#228 F3–F6 (tsc on fresh scaffold, slow file data refresh, setup init ordering, suppression hint) — still open there.
- A full scaffold → `validate` end-to-end test (DL#228 TL;DR 1) — needs network installs; the template renderer is unit-tested instead.

## Verification

- Fixture `compiler-jay-html/test/fixtures/contracts/boolean-attributes-headless` (keyed headless data, inside/outside `forEach`, condition + curly forms) on element, hydrate and server targets; contract `.d.ts` fixture for `boolean-choices-headless`.
- Slow-render fixture `slow-render/boolean-attribute-slow-bindings`.
- `basics/attributes` server fixture corrected (it encoded the bug: `checked="' + String(vs.bool1) + '"'`).
- create-jay `test/render-templates.test.ts` (expected files derived from the original templates); stack-server-runtime `services.test.ts`; stack-cli `init-after-setup-message.test.ts`.

## Agent feedback loop

- **Agent-kit:** `designer/jay-html-template-syntax.md` — single-binding form equivalence, works for headless and `forEach`, `checked` follows the ViewState. `docs/core/jay-html.md` updated (removed the "checked is not a boolean attribute" note).
- **Validation:** none new for P1/P2 — the curly form is now correct, and the remaining wrong form (`"{a} {b}"`) is already a compile error. P3 avoids false link errors by not linking to dev-only routes in the scaffold (not by widening Check 1).

## Implementation Results

- **Red first:** the boolean-attributes-headless fixture was compiled on the unfixed code — element/hydrate emitted `checked: 'ch.accepted'` / `checked: 'selected'` (static), server emitted `checked="ch.accepted"`, `checked="selected"`, `checked="' + String(vs1.selected) + '"'`, and `disabled="{ch.accepted}"` was a client parse error. The slow-render, link-oracle, template and services tests were run red before their fixes.
- **Existing fixture corrected:** `basics/attributes/generated-server-element.ts` (`checked="{bool1}"`) now `if (vs.bool1) { w(' checked'); }` — the old expectation encoded the bug. No other fixture changed.
- **Deviation:** slow-render leaves a fast-only condition untouched (`disabled="{busy}"` stays as written) instead of normalising braces — fewer rewrites, same meaning.
- **Deviation:** the `registerService(...)` hint in the service error now derives the constant from the bare service name (`PAYMENT_CLIENT_SERVICE`) — it printed `JAY:SERVICE:PAYMENTCLIENT_SERVICE` before.
- **Note:** stack-cli resolves `@jay-framework/stack-server-runtime` to its JS entry, so type predicates exported from it are not seen; `init-after-setup-message.ts` reads `serviceName` through an explicit type.
- **Not done:** the HTML boolean-attribute list was not extended (`allowfullscreen`, `nomodule`, `itemscope`, … are still template-style); the DL#228 scaffold → validate e2e test.

Test results (all green):

| Package              | Tests                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------- |
| compiler-jay-html    | 764/764 passing (4 skipped) — +4 new (element, hydrate, server, contract d.ts) +1 slow-render |
| stack-cli            | 206/206 — +2 link tests, +2 setup-message tests                                               |
| stack-server-runtime | 179/179 — +3 service tests                                                                    |
| create-jay           | 14/14 — +6 template tests                                                                     |

`yarn confirm` (rebuild + type check + all tests + format): passing.

### Review (2026-11-10) — independent design-log review: ready to merge, 6 non-blocking findings addressed

- **Parser file:** `expression-parser.cjs` is regenerated by the build and Prettier-formatted like `main`; commit the formatted file.
- **React claim** narrowed in TL;DR 1: no new react fixture; react is covered by the existing curly-form fixture only.
- **No downstream names:** neutral examples replace the plugin-specific service and route names in this log, `services.ts` and its tests.
- **Status** aligned between this log and the index.
- **Breaking change (intended, now documented):** a boolean attribute whose value mixes text and a binding (e.g. `checked="text {x}"`) used to compile as a string attribute and is now a compile error, like `"{a} {b}"`. No usage in this repo.
- **Also on this branch:** DL #234's `validate.test.ts` fixture `get-action-reads-cookies` lacked `src/pages` (an empty folder git does not track), so that test failed on `main`; fixed with `src/pages/.gitkeep`.
- **Product decision (2026-11-10):** Do **not** extend Check 1 with plugin manifest routes — keeps production link semantics pages-only. Fresh-project `/aiditor` onboarding uses text + `window.open` button instead.
- **Live verification (2026-11-10):** an end-to-end project built from this branch renders an unselected `checked="selected"` checkbox inside `forEach` over keyed headless data without the attribute, and the DOM `checked` property tracks every click (load all false → follows each toggle).
