# Code Review: DL#220 + DL#221 — follow-up after fixes

Date: 2026-10-14 | Scope: uncommitted changes after the v1 review fixes | Version: v2 | Previous: `code-review-dl220-221-css-first-validator.md`

## Summary

Every v1 critical issue is resolved in substance:

- end-user `validate` no longer fails on plugin warnings that lack `suppressKey`;
- `compileOnly` returns `ruleCounts`;
- the 6 low-precision rules are retired;
- the hover algorithm now catches the canonical dropdown and tooltip and ignores decorative hovers;
- every v1 adversarial false positive is gone.

The rule logic is close to the "right every time it speaks" bar. What still blocks shipping is mostly packaging and gating:

- the plugin bundles an undeclared `typescript-bridge`;
- the plugin's own type check fails;
- the new `validate-plugin` probe fails a plugin build when its tools entry can't load;
- one claimed fix (`on*` matching) is still wrong, and its test is a false green;
- one hover filter (`::after`) doesn't work.

### How this was verified

- Suites:
  - code-review-validator 15/15, a11y-validator 83/83, compiler-shared 135/135, stack-cli 203/203 (the v1 JSON-LD failures are gone);
  - **plugin-validator 52/53: one new failure** (Critical 3).
- Type checks:
  - **code-review-validator fails** (Critical 2);
  - **compiler-shared fails** in its test file (Important 4);
  - stack-cli has only the pre-existing `siteHeadTags` / `site` errors.
- Built `dist/tools.js` with `vite build --ssr` and inspected its imports.
- Re-ran the v1 190-page real-site probe (starkdale, jay-aiditor, Wix examples, Jay examples) and the v1 adversarial snippets, plus new ones for the changed code.

## Rule status after the fixes

| Rule | Real-site hits (190 pages) | Adversarial snippets | Status |
| --- | --- | --- | --- |
| `allow-javascript-url` | 0 | correct | Ready |
| `bound-inline-event-handler` (error) | 0 | correct: plain-JS braces stay a warning | Ready (see Suggestion 1) |
| `allow-inline-event-handlers` | 0 | **still flags `one`, `only`, `onlyif`** | Fix (Important 1) |
| `allow-js-lazy-load` | 0 | correct: lightbox `data-src` silent | Ready |
| `allow-scroll-reveal-library` | 0 | correct: `./aos` and `data-sr-only` silent; 3 attributes give 1 finding | Ready |
| `a11y/allow-hover-only-disclosure` | 28 (7 distinct selectors) | canonical cases caught; `:focus` twin, `:not(:hover)`, Tailwind all silent | Fix `::after` (Important 2), then ready |

Hover precision on distinct selectors:

- **True:** quick-option add-to-cart buttons (Wix), starkdale's video-toggle button, TodoMVC's `.destroy` button (newly caught), the product name and price overlay, and the demo `.reveal` text.
- **False:** a decorative `→` glyph inside a link (`.category-card-arrow`), and an `::after` marker that should have been skipped (Important 2).

That is 5 of 7 now, and 5 of 6 after the `::after` fix. css-first has zero real-site hits: no false positives, but the corpus also contains none of these patterns, so the adversarial snippets carry the evidence.

Hover rule cost: 66 ms for the first page on a 10k-selector stylesheet (v1: 129 ms), then 8 ms for each later page sharing it.

---

## Critical Issues

### 1. `typescript-bridge` is undeclared and gets bundled into the plugin

- Location: `code-review-validator/lib/css-first/script-rules.ts:2`, `package.json` (peer and dev dependencies), `vite.config.ts:18`.
- Problem: `package.json` doesn't list `@jay-framework/typescript-bridge`, and Vite externalizes only `@jay-framework/compiler-*`. A fresh build inlines the bridge into `dist/tools.js` (`const require$1 = createRequire(import.meta.url)`), so the plugin calls `require('typescript')` **from its own `dist` folder**, while `typescript` is still only a devDependency.
- Impact:
  - strict installs (pnpm, Yarn Plug'n'Play) fail to load the validator;
  - hoisted installs may resolve a different TypeScript copy than the one `compiler-shared` used to parse `ctx.script`, and then `ts.isImportDeclaration` silently returns false.

  That is the v1 issue in a new form.
- Fix:
  1. Add `@jay-framework/typescript-bridge` to `peerDependencies` and `devDependencies`.
  2. Externalize `/^@jay-framework\//` in `vite.config.ts`.
  3. Make `compiler-shared/lib/component-script.ts` parse through the same bridge (it already depends on it, see `compiler-shared/package.json:31`), so host and plugin are guaranteed one TypeScript module.

### 2. The plugin's type check fails

- Location: `script-rules.ts:13`: `const visit = (node: ts.Node)` gives `TS2503: Cannot find namespace 'ts'`.
- Cause: the bridge exports `ts` as a **value**; the namespace types come from `export type { typescript as TypeScript }`.
- Fix: `import { ts, type TypeScript } from '@jay-framework/typescript-bridge'` and type the parameter as `TypeScript.Node`. `build:check-types` and `yarn confirm` fail until this is fixed.

### 3. The `validate-plugin` probe turns a load failure into an error, even without `--strict`

- Location: `plugin-validator/lib/validate-validator-findings.ts:49–57`.
- Problem: if `import(dist/tools.js)` throws, the probe pushes `result.errors` with `type: 'schema'` regardless of `strict`. That breaks the existing test `validate-plugin.test.ts > passes when validators are declared and exported from ./tools` (its fixture re-exports from a sibling file). Every plugin's `npm run build` runs `validate-plugin`, so a smoke probe is now a hard gate on module-graph loading.
- Fix:
  - make load failures a warning unless `--strict`, matching the rest of the probe;
  - reuse the host's handler-loading logic (`stack-cli/lib/validate.ts:1805–1817`: `${packageName}/tools`, `handlerModule[validatorDef.handler]`, local `validate` / `default`) instead of re-deriving the export name. Local plugins are currently skipped silently.

---

## Important Issues

### 1. `on*` matching is still wrong, and its test is a false green

- Location: `template-rules.ts:19–26`; `test/css-first/template-rules.test.ts:62–65`.
- Problem: `/^on[a-z]+$/` matches `one`, `only` and `onlyif`. Verified: `<div one="1" only="x"></div>` gives two `allow-inline-event-handlers` warnings, and `<input onlyif="x">` gives one.
- Why the test passes: its markup `<my-widget one="1" only="x">` is unclosed, and `node-html-parser` drops it (the body has 0 children). The test passes because it inspects nothing.
- Related: `isNativeHtmlElement` compares a tag that was already lowercased on line 103, so the "capitalized component" branch can never trigger. Only the `:` check does anything.
- Fix:
  - match against the explicit set of event-handler content attributes (the HTML spec's global event handlers: `onclick`, `oninput`, …, a fixed list of about 90);
  - check the **original** `rawTagName` case;
  - close the tag in the test, and add a native-element case (`<div one only>`) asserting `toEqual([])`.

### 2. Hover rule: `::after` / `::before` targets are not skipped

- Location: `hover-only-disclosure-css.ts:137` (and the same pattern at `:68`, `:101`, `:122`, `:161`, `:183`).
- Problem: `'::after'.replace(/^:/, '')` returns `':after'`, so only the legacy single-colon `:after` is skipped. Repro: `.o .m::after { opacity:0 } .o:hover .m::after { opacity:1 }` gives 1 finding (expected 0). Real hit: starkdale `chronotype` `.chronotype-quiz__marker::after`. No test covers `::after`.
- Fix: strip with `/^::?/` everywhere, and add a `::after` fixture.

### 3. `expression-parser.cjs`: 4,600 lines of formatting churn

- `git diff` shows +1,025 / −3,591 lines. After running both versions through Prettier, the diff is **0 lines**, and `expression-parser.pegjs` is unchanged. It is a regeneration without formatting.
- Fix: revert the file with `git checkout -- packages/compiler/compiler-jay-html/lib/expressions/expression-parser.cjs`, so the PR carries only the two-line `index.ts` export change.

### 4. compiler-shared test file fails the type check (missed in v1)

- `test/component-script.test.ts:5` imports `ScriptCache` from `../lib/component-script`, which doesn't export it (it lives in `plugin-validators`).
- `:74` reads `sourceFile.parseDiagnostics`, which is internal to TypeScript and missing from the public types.
- Fix: import the type from `../lib/plugin-validators`, and use `(sourceFile as any).parseDiagnostics` or assert on `ts.getPreEmitDiagnostics`-free behavior, for example that the source file has statements.

### 5. Docs are still stale in two places

- `design-log/index.md`, DL#221 row: still "css-first family (13 rules) … corpus gate zero on fake-shop". It should say 5 rules plus the a11y hover rule, with the 190-page corpus.
- DL#221 Appendix: still lists `data-sr-*`; the code now matches only `data-sr` and `data-sr-id`.
- Methodology: the DL#221 rule and appendix tables (initial design sections) were edited in place. CLAUDE.md asks for append-only after implementation starts. Record superseded rows under Implementation Results instead.

---

## Suggestions

1. **`bound-inline-event-handler` relies on the message text.** `accessor.validations.some(m => m.includes('Failed to parse'))` depends on the wording at `expression-compiler.ts:420`. It degrades safely (it falls back to a warning), but export a `tryParseAccessor` that returns `undefined` when the result is not an `Accessor` instead. Known limitation worth one line in DL#221: ternary or compound bindings in `on*` (`{a ? b : c}`) don't parse as accessors, so they stay a warning.
2. **Per-element dedupe is really per-descriptor.** `pushOncePerElement` keys on `elementDescriptor`, so 50 `<img class="card-img" data-src>` produce **one** finding. That is good for volume, but the docs say "one finding per element". Either key on node identity, or keep it and document "one per distinct element signature".
3. **Hover decorative glyphs.** The remaining false positive is a `→` revealed inside a link. Optionally, cross-check the template: stay silent when every element matching the target's last compound has no interactive descendants and no alphanumeric text (or is `aria-hidden`). If nothing matches, stay silent too.
4. **Line-suppression regex.** `new RegExp(\`${namespace}:\\s*allow\`)` interpolates the namespace unescaped and matches anywhere on the line, including inside string literals and as a suffix (`first: allow` matches inside `css-first: allow`). Escape the namespace and anchor it: `(?:\/\/|\/\*)\s*<ns>:\s*allow`.
5. **Probe scope.** The `validate-plugin` probe runs one synthetic page, so it only catches a missing `suppressKey` on warnings that page happens to trigger. Call it a smoke check in DL#220. The real gate is plugin unit tests using `findingsMissingSuppressKey`.
6. **`cssParseCache` is module-level and unbounded.** That's harmless today, because validation runs once per process (`dev` start, `build`, `validate`), but it contradicts DL#220's "no module-level state". Cap it (for example, the last 16 stylesheets) or pass a run-scoped cache.
7. **Cross-page duplicates.** 20 of the 28 hover hits are one shared stylesheet rule repeated per page. Consider having the host collapse identical location-less findings across files, or have `ruleCounts` count distinct messages, so the corpus gate reflects root causes.
8. **Test assertions.** Most tests still use `objectContaining` or `.some(...)`. Per CLAUDE.md, assert full finding objects with `toEqual` (message and suggestion included) for at least one positive per rule.

## Resolved since v1

- End-user `validate` no longer fails on plugin warnings missing `suppressKey`; the check moved to `validate-plugin`.
- `compileOnly` includes `ruleCounts`.
- 6 rules retired with guidance; the remaining 5 css-first rules have positive and negative tests.
- Hover algorithm: focus-only twin keys, the hidden-base requirement, `:not()` / `:has()` exclusion, a `:focus` twin, and caching with early exit.
- Bare-specifier imports, exact `data-sr` / `data-sr-id`, lazy-load only without a real `src`, `element` on template findings.
- `resolveComponentScript` normalizes `projectRoot`; block-comment suppression works.

## Verdict: CHANGES REQUESTED

Small and mechanical. Fix Critical 1–3 and Important 1–4; after that I'd approve shipping these 5 css-first rules and the a11y hover rule.
