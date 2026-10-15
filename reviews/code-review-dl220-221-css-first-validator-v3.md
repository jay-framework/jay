# Code Review v3 — DL#220 / DL#221 (css-first validator), round-3 fixes

Follow-up to `code-review-dl220-221-css-first-validator-v2.md`.

## Verdict

**One blocker, then ship.** Every v2 item is fixed, and I re-verified each fix against the code, tests, and the 190-page real-site probe. The rules themselves are now at the confidence bar: the css-first family fires **zero** times on 190 real pages, and every adversarial false-positive case from v1/v2 is silent. The blocker is a build break in `plugin-validator`, not a rule-quality issue.

## Verified

| Area | Result |
| --- | --- |
| Tests | code-review-validator 15/15, a11y-validator 84/84, compiler-shared 135/135, plugin-validator 53/53, stack-cli 203/203, compiler-jay-html 731/731 (4 skipped) |
| `tsc --noEmit` | Clean everywhere except the 3 pre-existing stack-cli errors (`siteHeadTags`, `site`), which are out of scope |
| Packaging | `dist/tools.js` imports `@jay-framework/typescript-bridge` as an external; it is not bundled |
| Inline `on*` | `<my-widget one only>`, `<div one only>`, `<input onlyif>` produce no findings, whether the tag is open or closed |
| Hover `::after` | 0 findings (expected 0). Real-site distinct selectors went from 7 to 6, and 5/6 are true positives |
| Hover performance | 67 ms on the first page (10k selectors), 8 ms per cached page; the cache is capped at 16 entries |
| `expression-parser.cjs` | Reverted; it no longer appears in the diff |
| `validate-plugin` probe (from source) | code-review-validator clean. a11y-validator and seo-validator warn (error with `--strict`). No build or CI script uses `--strict` |
| `toContain` | None in the new or changed tests. The one at `validate-add-menu-catalog.test.ts:316` predates this work |

The remaining hover false positive is `.category-card:hover .category-card-arrow`, a decorative `→` glyph. This is an accepted residual: a static rule cannot tell decoration from disclosure, and suppression covers it.

## Blocking

### 1. `plugin-validator` build fails, so the shipped CLI does not contain the probe

```
lib/load-validator-handler.ts (3:9): "pathToFileURL" is not exported by "__vite-browser-external"
```

`vite.config.ts` builds in library mode (non-SSR), so Node built-ins resolve to Vite's browser stub unless they are listed as externals. `url` is not listed. Consequences:

- Root `yarn build` / `yarn confirm` fail.
- `jay-stack-cli validate-plugin` runs the **stale** `dist/`, which does not contain the `suppressKey` probe. The "plugin-validator 25/25" result reflects Vitest running source, not the CLI that ships.

A second, related problem: `validate-validator-findings.ts:3` imports `node-html-parser`, but `package.json` does not declare it. It currently builds only because of hoisting, and it gets bundled.

**Fix** (verified: I ran an equivalent Vite build out of tree; it succeeds and emits `import { pathToFileURL } from "url"` and `import { parse } from "node-html-parser"`):

- `vite.config.ts`: add `'url'` and `'node-html-parser'` to `external`. Better still, use `[...builtinModules, /^node:/]` so the next built-in import does not repeat this break.
- `package.json`: add `node-html-parser` to `dependencies`, at the same version as `compiler-jay-html`.
- Re-run `yarn build` in the package, then run `jay-stack-cli validate-plugin` once inside `packages/plugins/a11y-validator` to confirm the shipped CLI emits the unkeyed-warning notice.

## Minor (non-blocking)

### 2. The probe's loader is more lenient than the host's, though its comment says they match

`load-validator-handler.ts` claims to load "the same way stack-cli does". It differs from `stack-cli/lib/validate.ts:1806–1818` in two ways:

- **Local handlers:** the probe tries `''`, `.ts`, `.js`, `.mjs`. stack-cli does a single `import(handlerPath)`. A `handler: ./lib/validator` that resolves only via the extension fallback passes the probe and then fails in end-user `validate`.
- **npm handlers:** the probe prefers `dist/tools.js` on disk. stack-cli uses the package export map (`${packageName}/tools`). This divergence is reasonable for a pre-publish check, because `validate-plugin.ts:585` separately verifies the `./tools` export.

Suggestion: have stack-cli call `loadPluginValidatorHandler`. stack-cli already depends on plugin-validator, so the loader logic would live in one place. Otherwise, remove the extension fallback so the probe never passes something the host rejects.

### 3. Stale DL#220 row in `design-log/index.md`

Line 153 still says "host suppression + plugin-defect error for unkeyed warnings". That error was removed from end-user `validate` in round 1. Suggested wording: "…host suppression; `validate-plugin` smoke probe for unkeyed warnings (`--strict` = error)…".

The DL#221 appendix table (line 339) still lists `data-sr-*`, but the round-3 note at line 327 corrects it. That is consistent with the append-only rule, so no change is needed.

### 4. Suppression-comment matcher (carried over from v2, still open)

`validation-findings.ts:54`: `new RegExp(`${namespace}:\\s*allow`)`. This regex has three issues:

- The namespace is not escaped.
- There is no word boundary, so `my-a11y: allow` suppresses `a11y`.
- It does not check for a comment, so visible text such as "a11y: allow list" on the same line suppresses the finding.

DL#220 says it "accepts `namespace: allow` in block or line comments", and the code is looser than that. The risk is low because the failure mode is a silent false negative, not noise. The fix is one line: escape the namespace, add `(?<![\w-])` before it, and require `<!--`, `/*`, or `//` earlier on the line.

### 5. Nit: camelCase SVG elements count as non-native

`isNativeHtmlElement` returns false when the tag name has any uppercase letter. As a result, `onclick` on `<foreignObject>`, `<clipPath>`, `<linearGradient>` or `<textPath>` is skipped. This is a rare false negative and the right trade-off for precision. If you want, add a small allowlist of SVG camelCase tag names.

## Recommendation

Fix #1 (two lines of config plus one dependency), then merge. Items #2–#4 can be a small follow-up. None of them affects the precision of the rules.
