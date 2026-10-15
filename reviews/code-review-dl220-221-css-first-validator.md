# Code Review: DL#220 (component script in validation context) + DL#221 (code-review validator, css-first)

Date: 2026-10-14 | Scope: uncommitted changes in `compiler-shared`, `stack-cli`, `code-review-validator`, `a11y-validator` (hover rule), docs | Version: v1

## Summary

The DL#220 foundation (lazy, cached `ComponentScript`; one resolver; `ruleId` / `location` / `suppressKey`; host suppression) is well shaped. It ships with one release-blocking regression: any existing plugin warning now fails `validate`. The css-first rule set is **not ready to run at scale**. Measured on 190 real pages (starkdale, jay-aiditor, the Wix examples, Jay examples) plus adversarial snippets:

- one rule can never fire;
- the hover rule misses the canonical case it was designed for;
- four rules have confirmed false positives on correct code;
- one rule duplicates a core check;
- the four script rules have no tests at all.

After the fixes below, 5 css-first rules plus the a11y hover rule meet the "right every time it speaks" bar. The other 6 should retire to the agent-kit guide.

### How this was verified

- Unit suites: compiler-shared 5/5, stack-cli `validation-findings` 3/3, code-review-validator 7/7, a11y-validator 80/80. `tsc` on stack-cli fails (Critical 2).
- Corpus probe: ran `runTemplateRules`, `runScriptRules`, and `checkHoverOnlyDisclosureCss` on 190 `.jay-html` pages, with the sibling script resolved by `resolveComponentScript`. Every hit was hand-classified.
- Adversarial probe: 30 targeted snippets, one per suspected false-positive or false-negative shape (results quoted inline below).
- End-to-end repro of the `suppressKey` regression: a temporary project with the real `a11y-validator` linked in, run through the built `jay-stack-cli validate --json`.

## Per-rule verdict

| Rule | Hits on 190 real pages | Precision on real code | Verdict |
| --- | --- | --- | --- |
| `allow-executable-script` | 2 | 0/2: both `jay-script="allow"` third-party loaders | **Retire**: core already owns it (DL#149) |
| `allow-inline-event-handlers` | 0 | — | **Keep, fix matcher** (Important 6) |
| `bound-inline-event-handler` (error) | 0 | — | **Keep, fix extraction** (Important 5) |
| `allow-javascript-url` | 0 | — | **Keep** as is |
| `allow-custom-dialog` | 45 | Replacement does not fit Jay's ViewState model | **Retire to guide** (Important 3) |
| `allow-div-switch` | 1 | 0/1: `<button role="switch">` is the WAI-ARIA pattern | **Retire** the `<button>` branch; move `<div>`/`<span>` to a11y |
| `allow-js-lazy-load` | 0 | Adversarial false positive (lightbox `data-src`) | **Keep, narrow** (Important 7) |
| `allow-scroll-reveal-library` | 0 | Adversarial false positives (`data-sr-only`, `./aos`) | **Keep, narrow and dedupe** (Important 7) |
| `allow-scripted-smooth-scroll` | 8 | 3/8 already reduced-motion-guarded; in all 8 the JS call must stay | **Retire** (Important 2) |
| `allow-timer-animation` | 0 | Adversarial false positives (rAF that starts a transition, progress bar) | **Retire** (Important 2) |
| `allow-presentational-scroll-handler` | 0 | Can never fire; predicate unsafe once it can | **Retire or rewrite** (Critical 3) |
| `a11y/allow-hover-only-disclosure` | 30 (about 9 distinct selectors) | About 3 true; misses the canonical case | **Keep, fix algorithm** (Critical 4) |

---

## Critical Issues

### 1. Every existing plugin warning now fails `validate`

- Location: `stack-cli/lib/validate.ts`, plugin loop (`finding.severity === 'warning' && !finding.suppressKey` becomes `errors.push`).
- Problem: only the new hover rule and css-first set `suppressKey`. `a11y-validator` (5 warning sites), `seo-validator` (16), `design-system-validator` (about 20), and `agent-skills` emit none. Third-party plugins emit none either.
- Repro: temporary project, `a11y-validator` linked, one page with `<button tabindex="3">`. Output: `valid: false`, exit 1, `ERROR plugin:a11y-validator | Validator "accessibility" emitted a warning without suppressKey: "Positive tabindex="3"…"`.
- Impact: every site using the first-party validators breaks on upgrade. The person who sees the error (the site author) cannot fix it; only the plugin author can. DL#220 Q7 assumed this "never fires for well-formed plugins", but no existing first-party plugin is well-formed by the new definition. fake-shop didn't catch it because fake-shop produces zero plugin warnings.
- Fix: enforce the invariant where the plugin author sees it: `jay-stack-cli validate-plugin`, or a test helper shared by plugin test suites. In end-user `validate`, at most emit one *warning* per validator per run. Separately, add `ruleId` / `suppressKey` to all first-party plugin warnings (that work is DL#176's).
- Related: as written, the defect error is pushed **once per finding**. Fifty warnings mean fifty identical errors. Dedupe to one per validator per run.

### 2. Type check fails: `ruleCounts` missing on the `compileOnly` return

- Location: `stack-cli/lib/validate.ts:2424`.
- Problem: `ValidationResult.ruleCounts` is required, but the early `if (options.compileOnly) return {…}` path doesn't set it. `tsc` gives `TS2741: Property 'ruleCounts' is missing`.
- Fix: add `ruleCounts: computeRuleCounts(errors, warnings)` to that return.

### 3. `allow-presentational-scroll-handler` can never fire, and its predicate is unsafe

- Location: `code-review-validator/lib/css-first/script-rules.ts:77–78`, `:131–141`.
- Problem A (dead rule): `node.expression.getText() === 'addEventListener'` only matches a bare `addEventListener(…)`. `window.addEventListener('scroll', …)`, the DL's canonical example, gives no finding (verified). Starkdale has 12 real `window` / element scroll and resize listeners, and none can match. `onscroll =` from the spec is not implemented.
- Problem B (unsafe once fixed): `expressionOnlyPresentation` is substring-based. Any statement whose text contains `scrollY`, `scrollTop`, `classList`, or `.style` passes. These three all count as "presentation only" today (verified with a bare call):
  - `setShowBackToTop(window.scrollY > 300)`: a signal write
  - `analytics.track('depth', window.scrollY)`: analytics
  - `loadMore(el.scrollTop)`: data loading

  That violates DL#221's "effect-exhaustive" rule, which says a signal write or an action call must stay silent.
- Fix: retire it for v1. If it is kept, rewrite it with an AST allowlist and fixtures before re-enabling:
  - every handler statement is `X.classList.add|remove|toggle(<string literal>[, <cond>])` or `X.style.<prop> = <expr>`;
  - `<cond>` and `<expr>` reference only `scrollY`, `pageYOffset`, `scrollTop`, `getBoundingClientRect()`, and literals;
  - no closure-variable writes, so scroll-direction headers stay silent, which is correct because CSS can't do them portably.

### 4. Hover-only disclosure misses the canonical case and flags decorative hovers

- Location: `a11y-validator/lib/validators/hover-only-disclosure-css.ts:138–144`.
- Problem: `twinKeys` is built from **every** selector in the stylesheet (with focus pseudos stripped), not only from selectors that contained `:focus-within` / `:focus-visible`. So the ordinary hidden base rule counts as a "twin":
  - `.nav li > ul { display:none } .nav li:hover > ul { display:block }` gives **0** findings (expected 1).
  - `.tip .bubble { opacity:0 } .tip:hover .bubble { opacity:1 }` gives **0** (expected 1).

  The rule only fires when no base rule shares the selector, which is mostly decorative hover. Real-site hits collapse to about 9 distinct selectors:
  - true: `.product-card:hover .quick-options-area .quick-options-buttons` (add-to-cart buttons with base `display:none`), plus a video toggle and an image overlay;
  - false: a decorative arrow, an `::after` marker, `:hover` inside `:not()` / `:has()` used for dimming, and image-hover effects.
- Also missed:
  - a `:focus` twin on a focusable trigger (`.trigger:hover + .menu`, `.trigger:focus + .menu`) is flagged;
  - `:hover` inside `:not(...)` is treated as a hover reveal;
  - Tailwind `group-hover:` / `group-focus-within:` pairs can never match by key.
- Fix (each step makes the rule quieter and more precise):
  1. Only add a selector to `twinKeys` if it actually contained a focus pseudo; include `:focus`.
  2. Require a **provably hidden base state**: some non-hover rule whose last compound equals the candidate's last compound and declares `display:none`, `visibility:hidden`, or `opacity:0`. If none is found, stay silent. This also silences utility CSS, where nothing can be proven.
  3. Skip candidates whose last compound is a `::before` / `::after` pseudo-element; they can't hold interactive content.
  4. Ignore `:hover` nested inside `:not()` / `:has()`.
  5. Add fixtures for each row of the DL table **plus** the hidden-base canonical case, which the current 5 tests don't cover. That gap is why the bug passed.

### 5. `allow-executable-script` duplicates a core check and fires on scripts the author already opted in

- Location: `template-rules.ts:11–23`, `:56–67`.
- Problem: core's `validateAndCollectScripts` (`compiler-jay-html/lib/jay-target/jay-html-parser.ts:952–1011`, DL#149) already rejects local `src`, flags unmarked inline and external scripts, and treats `jay-script="allow"` as the explicit opt-in. This rule ignores `jay-script="allow"`, so both real-site hits (starkdale `ai/page.jay-html`, two third-party loaders marked `jay-script="allow"`) are false positives. It also flags non-executable data blocks (`type="application/json"`, `text/template`, verified), because it allowlists non-executable types instead of matching the executable ones.
- Fix: retire. The core check owns this policy.

### 6. The script rules have no tests; DL#221's verification criteria are unmet

- Location: `code-review-validator/test/`. There are only `template-rules.test.ts` (3 tests) and `scroll-reveal-libraries.test.ts` (4).
- Problem: none of the four script-rule implementations has a test. DL#221 requires a positive, negative, and suppressed fixture per rule (Plan step 1, Verification 1, 2, 4). The dead rule (Critical 3) and the hover bug (Critical 4) are exactly what those fixtures exist to catch. The Implementation Results record "3/3" as if that were the gate.
- Fix: for every rule that survives, add fixture files (`test/css-first/fixtures/<rule>/{positive,negative,suppressed}`) asserting full finding objects with `toEqual`, per CLAUDE.md. Today's assertions (`findings.some(...)).toBe(true)`) cannot detect wrong messages, duplicate findings, or extra findings.

---

## Important Issues

### 1. `typescript` is imported at runtime but not declared

- Location: `code-review-validator/package.json`; `lib/css-first/script-rules.ts:2` (`import ts from 'typescript'`); `dist/tools.js` keeps it external.
- Problem: `typescript` is only a devDependency, so consumers get it from hoisting or not at all. Worse, the plugin must use **the same copy** the host parsed with. `SyntaxKind` numbers shift between TypeScript versions, so a second copy makes `ts.isCallExpression(node)` silently false, and the rules go quiet with no error.
- Fix: declare `typescript` as a `peerDependency` with the same range as `compiler-shared`. Better still, have `compiler-shared` re-export the `ts` namespace it parsed with, so the plugin cannot pick up a different copy.

### 2. Smooth-scroll and timer rules fail gate 2 or 3 on real code

- `allow-scripted-smooth-scroll` (`script-rules.ts:34–57`): 8 real hits.
  - 3 already do exactly what the suggestion asks: `behavior: reducedMotion.matches ? 'instant' : 'smooth'` (all-residences `page.ts:995`), `prefersReducedMotion() ? 'auto' : 'smooth'`, and `reduced ? 'auto' : 'smooth'`.
  - In all 8, the JS call has to stay because it computes the target (carousel `goTo`, scroll to a search match, reveal a pinned panel). CSS `scroll-behavior` replaces only the option, not the JavaScript.
  - Matching is textual: `endsWith('scrollTo')` plus `arg.getText().includes('smooth')`, so `list.scrollTo(0, smoothedOffset)` is flagged (verified).
- `allow-timer-animation` (`:143–184`): the predicate is "a single statement whose text includes `.style`". These are all flagged (verified):
  - `requestAnimationFrame(() => { panel.style.opacity = '1' })`: the standard way to *start* a CSS transition, so the rule tells the author to use the thing they are already using;
  - a progress bar mirroring real upload state;
  - a measure-then-set height.

  "Animation" (a time-derived value) isn't checkable with this shape.
- Fix: retire both to `css-first-patterns.md`. If smooth scroll comes back, make it an a11y rule ("unguarded smooth scroll"): literal `behavior: 'smooth'` property only, with conditionals silent.

### 3. `allow-custom-dialog`: the named replacement doesn't fit Jay

- Location: `template-rules.ts:105–113`, `:172–182`.
- Problem: 45 real hits, mostly `if="showX"` overlays with `role="alertdialog" aria-modal="true"`. In Jay, visibility is driven by ViewState. A native modal `<dialog>` needs an imperative `showModal()` through `exec$`, and `commandfor` / `command="show-modal"` only covers dialogs opened by a click, not ones opened by state (for example, a confirm after an async check). That pattern is what this workspace's own in-app-confirmation guidance prescribes. `<div popover role="dialog">`, a recommended non-modal pattern, is also flagged (verified). Each hit also carries no element identity, so 20 identical messages on one page can't be told apart.
- Fix: retire to the guide. Revisit only with a Jay-native `<dialog>` pattern documented in agent-kit that the message can cite.

### 4. `allow-div-switch` flags the WAI-ARIA reference pattern

- `<button role="switch" aria-checked>` is the WAI-ARIA Authoring Practices switch pattern: focusable, keyboard-operable, accessible. That was the only real hit (jay-aiditor). Meanwhile `<span role="switch">`, which is actually worse, is missed.
- Fix: drop the `<button>` branch. The non-focusable `<div>` / `<span>` case is an accessibility issue and belongs in a11y-validator (`role` on a non-focusable element with no `tabindex`).

### 5. `bound-inline-event-handler` can fire an unsuppressible error on plain JavaScript

- Location: `template-rules.ts:25–42`, `shared/binding-paths.ts`.
- Problem: `parseTemplateParts('if (ready) { open = true }')` returns binding `open = true`. The regex in `bindingPathsFromExpression` pulls out `open`, and if the contract has an `open` tag the result is the **unsuppressible error** (verified). DL#221 Q6 and Verification 5 require plain-JavaScript braces to stay a warning.
- Fix: flag only when the binding part parses as a valid jay expression with the compiler's own expression parser and one of its identifiers resolves. On a parse failure, fall back to the warning. Add the verified case as a fixture.

### 6. Inline-handler attribute matching is too broad

- `lowerName.startsWith('on')` also matches attributes such as `one` and `only`, and props on custom or headless component tags (verified: `<my-widget one only>` gives two warnings).
- Fix: `/^on[a-z]+$/`, native (lowercase, non-`jay:`) elements only.

### 7. Narrow the lazy-load and scroll-reveal matchers, and cut finding volume

- `allow-js-lazy-load`: `<img src="thumb.jpg" data-src="full.jpg">` (lightbox full-resolution image) is flagged. Fire only when `data-src` / `data-srcset` is present **and** `src` is missing, empty, or a `data:` placeholder. Without JavaScript that image cannot render, so the finding is certain.
- `allow-scroll-reveal-library`:
  - `^data-sr(?:-|$)` matches `data-sr-only` (a screen-reader convention). Match `data-sr` and `data-sr-id` exactly.
  - `matchesScrollRevealImport('./aos')` and `('./effects/wow.js')` are true. Match bare package specifiers only (the first segment, or scope plus name).
  - One element with `data-aos`, `data-aos-duration`, and `data-aos-delay` produces **3** findings. Emit one per element.
- Volume at scale: per-attribute and per-element findings multiply across 50-image grids and the AOS markup in every section. Template findings also carry no `element`, so they can't be located. Set `element` (tag plus `ref` / `id` / first class) on every template finding, and emit at most one finding per element per rule.

### 8. The docs disagree with the code, and the corpus gate proves nothing

- Rule counts: the code has **11** css-first rules. DL#221 Implementation Results and `index.md` say 13; DL#147 says "14" and lists 11.
- Every finding's suggestion points to `css-first-patterns.md`, but the guide has no section for 8 of the 11 rules (dialog, switch, `javascript:` URLs, lazy-load, inline handlers, executable script, timer, smooth scroll).
- Corpus gate: "0 css-first warnings on fake-shop" holds, but fake-shop produces **zero plugin warnings of any kind**, so it can't measure precision. `design-system-demo` wasn't run. The 190-page corpus used here surfaced every issue above. Use it, or a similar real-site set, as the gate, and record per-rule true and false positives, not just counts.

### 9. Silent change to line suppression

- Core used `line.includes('jay-dom: allow')`; the host now requires `// jay-dom: allow`. `/* jay-dom: allow */` and `//jay-dom: allow` no longer suppress. Every use in this workspace is the `// ` form, so nothing breaks here, but it is an undocumented narrowing. Either accept `<namespace>: allow` regardless of comment style, or record the change in DL#220.

---

## Suggestions

1. **Hover rule cost.** It took 129 ms per page on a 10k-selector stylesheet, and it repeats per page for a shared stylesheet (200 pages, about 26 s). Pre-filter with `selector.includes(':hover')` / `includes(':focus')` before any `postcss-selector-parser` call, and cache results per CSS string within the run. The same caching also dedupes the identical finding repeated across 20 pages (Wix examples).
2. **One AST pass.** `runScriptRules` walks the tree three times and calls `getText()` on every call expression. Use one visitor and match structure (property assignment `behavior` with a string literal `'smooth'`) instead of text.
3. **`createLineTextResolver`** re-reads script files from disk even though `ScriptCache` already holds their text. Consult the cache first.
4. **`ComponentScript.text` can throw** (for example, a permissions error). In the core loop that surfaces as a `stage: 'parse'` error on the *template*. Catch it in the getter's callers, or return `undefined` from the resolver when the read fails.
5. **`resolveComponentScript`** resolves a relative `jayHtmlPath` against `projectRoot`. If `projectRoot` is itself relative, the path is resolved twice (hit while probing). Normalize with `path.resolve(projectRoot)` first.
6. **`ruleCounts`** only contains rules that fired. DL#220's example shows zero entries, which the corpus gate needs to tell "ran, found nothing" from "never ran". Optional: seed known rule ids from loaded validators.
7. **Stale `dist/`** in code-review-validator still bundles the retired hover and signal-trace code and imports `postcss`. Rebuild before publishing.

## Good patterns worth keeping

- `ComponentScript` with lazy `text` / `sourceFile` and a run-scoped cache: one parse, no module state, verified sharing.
- A single resolution order in `compiler-shared`, used by both core and plugins.
- `cssFirstWarning` / `cssFirstError` guarantee `ruleId` and `suppressKey` per finding.
- The scroll-reveal list is the single source for every half; path-segment matching for `<script src>` was a good tightening.
- Plugin serve entries stay compiler-free (DL#179).
- Retiring `allow-presentational-variant` and `allow-js-theme-switch` with written reasons is the right instinct. This review applies the same bar to the rest.

## Questions for the Author

- [ ] Should a plugin-contract violation ever fail an end-user build? Recommendation: enforce it in `validate-plugin` only.
- [ ] With 6 rules retired, the css-first script surface shrinks to the scroll-reveal import half. Is that acceptable for v1? DL#220 still pays for itself through the core DOM rule.
- [ ] Should `allow-js-lazy-load` and `allow-scroll-reveal-library` report once per file (with a count) rather than per element?

## Out of scope (pre-existing, not caused by this change)

- `stack-cli/test/validate.test.ts`: 5 failing `checkJsonLdScripts (DL#213)` tests in `parseJayFile`.
- `stack-cli` `tsc`: `siteHeadTags` / `site` errors from other packages' stale builds.

## Verdict: CHANGES REQUESTED
