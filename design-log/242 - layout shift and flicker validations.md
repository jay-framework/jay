# DL#242 — Layout shift (CLS) and flicker validations

Status: **[Design]**

## Decisions for the Implementer (TL;DR)

- Add **3 warning rules** to `design-system-validator`, named like the existing `design-viewport-height`: `design-media-dimensions`, `design-hidden-root`, `design-view-transition-expect`. Register in `plugin.yaml`, export from `lib/tools.ts` (the validators entry). Not `lib/index.ts`: that is the compiler-free serve entry (DL#179) and exports only `fontFallback`.
- **No new font rule.** DL#168's `font-fallbacks` already flags web fonts that have no metric-matched fallback (`size-adjust` and the other overrides). `font-size-adjust` becomes a line in the guide, not a rule.
- **No new `vh` rule.** DL#188 already flags top-level `vh`. Its "dvh is not a fix" advice is about the Googlebot render. The article's "use dvh/svh" advice is about mobile toolbar jumps. The guide explains both (Q4).
- Each rule is suppressed by one key in the file's own `<script type="application/jay-validations">`: `design-system: { allow-…: true }`. Every suggestion names its key and the new guide `agent-kit/designer/layout-stability.md`, like `design-font-fallbacks.ts:216`. The exact strings are in the Design section; tests assert them with `toEqual`.
- **Scope.** `jay-stack validate` builds one context per file from that file's own body and CSS (`stack-cli/lib/validate.ts:1838-1845`); a page's context does **not** include the templates of components it uses. So:
  - Rule 1 (media) runs on **pages and component files**. A component suppresses in its own `<head>` script: `parseJayFile` reads `jay-validations` for every jay-html file (`jay-html-parser.ts:1387`, `:1089-1104`), and component files have a `<head>` (e.g. `design-system-demo/src/components/card/card.jay-html`).
  - Rules 2 (hidden root) and 3 (view transition) are about `html`/`body`/`<head>`, which only a page has. They run on **pages only** (path check as in `design-viewport-height.ts:44-46`).
- Write the RED tests first, one test file per rule (see the Implementation Plan). The demo runs `jay-stack validate` on a sample page and records the shift in a browser before and after the fix.

## Background

The article "Top 10 things AI gets wrong in web dev" (developer.chrome.com), point #8, says models set `width`/`height` on `<img>` but miss other causes of CLS:

| Article cause | Article fix |
| --- | --- |
| `<video>` without dimensions defaults to 300x150, then jumps when metadata loads | `aspect-ratio` + `object-fit` **on the media element**, not on a wrapper |
| Web font swap reflows text | `font-size-adjust` / metric-matched fallback |
| Static `vh` heroes jump when mobile toolbars show/hide | `dvh` / `svh` |
| A/B "anti-flicker" snippets: `opacity:0` / `visibility:hidden` with long timeouts. They delay LCP and leave invisible content clickable | `<script blocking="render">` |
| Cross-document view transitions start before above-the-fold markup is parsed | `<link rel="expect" href="#id" blocking="render">` |

## Prior Art / Adjacent Mechanisms (verified against code)

| Mechanism | Where | What it covers |
| --- | --- | --- |
| img dimensions rule | `packages/plugins/seo-validator/lib/validators/seo-validator.ts:59-81` | warns when `<img>` has no `width`+`height` attributes and no inline `width:`+`height:`. **Skipped when `srcset` is present** (`:63-67`) |
| img `loading` rule | same file `:83-95` | missing `loading`. Not a CLS rule (LCP / bytes) |
| `display=swap` on font links | same file `:359-372` | only `fonts.googleapis.com` and `use.typekit.net` (`:330`) |
| font fallback metrics (DL#168) | `packages/plugins/design-system-validator/lib/validators/design-font-fallbacks.ts:143-239` | web font with no `local()` `@font-face` using `size-adjust`/`ascent-override`/`descent-override`/`line-gap-override` (`:12-17`). Suppressed by `allow-font-no-fallback` (`:209`) |
| viewport height (DL#188) | `.../validators/design-viewport-height.ts:41-98` | `vh`/`svh`/`lvh`/`dvh`/`vmax` on top-level containers, for the Googlebot tall render. Suppressed by `allow-viewport-height` (`:50`) |
| CSS→element cascade | `.../design-system-validator/lib/css-cascade.ts:144-151` | `html`, `:root` and `body` rules resolve onto the root container. This lets a rule see `body { opacity: 0 }` |
| validator registry | `packages/plugins/design-system-validator/plugin.yaml:30-58` | one entry per sub-validator |
| finding shape | `packages/compiler/compiler-shared/lib/plugin-validators.ts:3-9` | `severity`, `message`, `suggestion`, `element`, `attribute`. **No rule id and no line number** |
| what `ctx.css` contains | `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-parser.ts:1170-1188` | linked local CSS plus `<head><style>`. External CSS is only a comment. Body inline `style=""` is not included and must be read from the element |
| suppression docs | `packages/jay-stack/stack-cli/agent-kit-template/designer/validation-guide.md:107-136` | `jay-validations` YAML and the list of design-system keys |

### Audit notes

- The img rule skips any `<img srcset>` and ignores inline `aspect-ratio`; the two font-host lists differ (2 vs 4 hosts); `design-font-fallbacks.ts:235` pushes an empty message. All are follow-ups (Q7).
- DL#188 is about the Googlebot render, not CLS (see Q4).
- Findings have no rule id or line number, so "located" means file + `element` + selector in the message.

## Problem

An agent can ship a page that passes `jay-stack validate` and still shifts or flickers:

```html
<video src="/hero.mp4" autoplay muted></video>          <!-- 300x150, then jump -->
<iframe src="https://maps.example/embed"></iframe>       <!-- jump -->
<style>body { opacity: 0 }</style>                       <!-- anti-flicker -->
<style>@view-transition { navigation: auto; }</style>    <!-- pops in -->
```

None of these is flagged today.

## Q&A

**Q1. Which plugin: seo-validator or design-system-validator?**
design-system-validator. Two of the rules need CSS resolved onto elements (`css-cascade.ts`), and DL#188 Q1 already rejected exporting that helper to seo. A class such as `.hero-video { aspect-ratio: 16/9 }` must satisfy the media rule, and that needs the cascade.

**Q2. Why not also fix the img `srcset` gap here?**
That changes an existing seo rule's behaviour and adds warnings to existing projects. It is a follow-up (Q7), not part of point #8.

**Q3. A rule for `@font-face` without `size-adjust`, or for `font-size-adjust`?**
No. The `font-fallbacks` rule already requires a metric override on the fallback face. A second rule would double-warn the same fix. `font-size-adjust` is a softer alternative and goes in the guide only.

**Q4. The article says use `dvh`; DL#188 says `dvh` is not a fix. Which wins?**
Both are true for different viewers. For a mobile visitor, `svh`/`dvh` stop toolbar jumps. For Googlebot, every viewport unit resolves tall, and a `max-height` cap inside a mobile `@media` is still needed. No rule change; the new guide carries a 3-row table. DL#188's rule and wording stand.

**Q5. Should the anti-flicker rule be an error?**
No. A brief, deliberate `opacity:0` that is lifted by script is legitimate, for example a splash. Warning + suppression.

**Q6. Can the rule detect `<html class="async-hide">` toggled by a script?**
Partly. The CSS rule `.async-hide { opacity: 0 }` alone is not caught (no `html`/`body` in the selector). `html.async-hide { opacity: 0 }` is caught, because Rule 2 matches by selector text, whatever the static classes are. The runtime class toggle itself is not seen. Known gap, in the guide.

**Q7. Follow-ups (out of scope)**
(a) the img `srcset` / `aspect-ratio` gap; (b) unify the font-host lists; (c) the empty-message finding in `design-font-fallbacks.ts:235`.

## Design

All three rules are new sub-validators in `packages/plugins/design-system-validator/lib/validators/`, registered in `plugin.yaml` and exported from `lib/tools.ts`. They follow the same pattern as `design-viewport-height.ts`. Severity is **warning** for all three.

### Rule 1 — `design-media-dimensions` (handler `validateMediaDimensions`)

| | |
| --- | --- |
| Elements | `<video>`, `<iframe>`, in page and component files |
| Passes if any | (a) both `width` and `height` attributes are non-empty (a binding such as `width="{w}"` counts; `width=""` does not); (b) the base cascade or inline `style` gives the element `aspect-ratio`; (c) the base cascade or inline `style` gives both `width` and `height`, neither `auto`. So `width:100%; height:auto` still warns (the guide says to add `aspect-ratio`). A **mix** (`width` attribute + CSS `height`) warns: each condition is a self-contained pair, the mix is rare, and the suggestion's fix is one line; suppression covers a deliberate mix |
| Not satisfied by | `aspect-ratio` on a **wrapper**. The article says the ratio belongs on the media element |
| Lenient on at-rules | Rule 1 reads the cascade, whose `getMediaQuery` (`css-cascade.ts:53-62`) knows only `@media`. So `aspect-ratio` inside `@supports`/`@container` lands in the base map and **passes**. Accepted: a false pass is cheaper than a false warning here. Rule 2 differs on purpose (it walks at-rules itself and excludes these) |
| Suppress | `design-system: { allow-media-no-dimensions: true }` in the page's or the component's own `<head>` |
| `element` / `attribute` | `` `<${tag}>` `` (`<video>` or `<iframe>`) / `width` |

Why components too: a page's context does not contain its components' templates, so a pages-only rule would miss every video inside a component. Each file is checked once, against its own body and CSS, so nothing is reported twice. Known gap: a component whose sizing comes from the page's CSS warns in the component; suppress it there.

Messages differ, because the failure differs. A `<video>` starts at 300x150 and jumps when metadata loads. An `<iframe>` keeps its 300x150 default; it shifts only when the embed or a script resizes it.

- video message: `<video> has no width/height or aspect-ratio. It renders at 300x150, then jumps when the video metadata loads (CLS).`
- iframe message: `<iframe> has no width/height or aspect-ratio. It renders at the 300x150 default and shifts the layout when the embed or a script resizes it (CLS).`
- suggestion (both): `Add width and height attributes, or aspect-ratio + object-fit on the element itself (not on a wrapper). If intentional, suppress with design-system: { allow-media-no-dimensions: true } in <script type="application/jay-validations">. See agent-kit/designer/layout-stability.md`

False positives: (1) `position: absolute; inset: 0` inside a sized box. This takes no flow space, so the rule skips when the resolved `position` is `absolute` or `fixed`. (2) A hidden or `display:none` iframe, e.g. a tracking pixel: skip when the resolved `display` is `none` or the `hidden` attribute is set. (3) Sizing in external CSS cannot be seen; suppress it.

### Rule 2 — `design-hidden-root` (handler `validateHiddenRoot`)

| | |
| --- | --- |
| Targets | `html`, `:root`, `body`, and direct element children of `<body>` (exact matching below); pages only |
| Flags | base-level `opacity: 0` (also `0.0`, `0%`) or `visibility: hidden`, from CSS or inline `style`. A `transition` beside it does not change this: a script fade-in is the anti-flicker pattern |
| Not flagged | rules inside `@media`, `@keyframes`, `@starting-style`, `@supports`, `@container`. Rules inside `@layer` count as base |
| Suppress | `design-system: { allow-hidden-root: true }` |
| `element` | the selector as written (`body`, `:root`, `body.dark`), or `` `<${tag}>` `` for an inline `style` |

**Why not the cascade.** `getMediaQuery` (`css-cascade.ts:53-62`) knows only `@media`, so `@starting-style`/`@supports`/`@container` rules would land in the base map. And `selectorTargetsRoot` (`css-cascade.ts:148`, private) tests `body.dark` with `root.closest(...)`, so it needs the class present statically. Rule 2 therefore does not use or export it. It adds its own helper in the rule file:

1. Walk `ctx.css` with postcss `walkRules`. Skip a rule if any ancestor is an at-rule named in `EXCLUDED_AT_RULES = {media, keyframes, starting-style, supports, container}`. Skip a rule whose parent is another rule (CSS nesting, `body { & .x {…} }`): known gap.
2. For each selector in `rule.selectors`, parse it with `postcss-selector-parser` and take the **rightmost compound**.
   - It **targets the root** if that compound contains the tag `html` or `body`, or the pseudo `:root`. Extra classes, ids or attributes are allowed and are **not** checked against the static element, because those classes are usually added at runtime. So `body`, `html`, `:root`, `body.dark`, `html.async-hide`, `.js body` all target the root. `.dark` alone does not.
   - Only **top-level** nodes of the rightmost compound count: `html`/`body`/`:root` inside `:not()`, `:is()`, `:where()` or `:has()` do not (`.x:not(body)`, `:is(body) .card` do not target the root).
   - A compound that contains a **pseudo-element** (`body::before`, `html::after`) is skipped: it styles a generated box, not the page.
   - Otherwise it **targets a direct child** if some element child `child` of `ctx.body` satisfies `child.closest(selector) === child` (wrapped in try/catch; an invalid selector is no match). So `#app`, `.shell`, `body > main` match a direct child; `.modal` on a nested element does not.
3. **Selector lists** are checked per selector: one finding per matching selector, `element` = that selector. `html, body{opacity:0}` → 2 findings; `body, .x{opacity:0}` → 1.
4. Inline `style`: read the `style` attribute of each direct element child of `ctx.body` (and of `ctx.body` itself if it carries one) with the same value check.

- message (CSS): `"${selector}" sets ${property}: ${value}. The page stays invisible until a script reveals it (anti-flicker). This delays LCP and leaves invisible content clickable.`
- message (inline `style`, no selector): `<${tag}> style sets ${property}: ${value}. The page stays invisible until a script reveals it (anti-flicker). This delays LCP and leaves invisible content clickable.`
- suggestion: `Remove it. If content must wait for a script, use <script blocking="render" jay-script="allow"> (inline, or an external URL; local src files are not allowed) instead, see designer/script-tags.md. If intentional, suppress with design-system: { allow-hidden-root: true } in <script type="application/jay-validations">. See agent-kit/designer/layout-stability.md`

False positives: a splash or loader the author reveals deliberately. Suppress it. Nested modals are not affected.

### Rule 3 — `design-view-transition-expect` (handler `validateViewTransitionExpect`)

| | |
| --- | --- |
| Trigger | page file whose `ctx.css` has `@view-transition` with `navigation: auto` (postcss `walkAtRules('view-transition')`) |
| Passes if | `ctx.head?.links` has `rel="expect"` with a `blocking` value that includes `render` |
| Suppress | `design-system: { allow-view-transition-no-expect: true }` |
| Message | `Cross-document view transition is enabled without <link rel="expect" blocking="render">. The transition can start before above-the-fold content is parsed, so it pops in.` |
| Suggestion | `Add <link rel="expect" href="#main-content" blocking="render"> in <head>, pointing at an above-the-fold element id. If intentional, suppress with design-system: { allow-view-transition-no-expect: true } in <script type="application/jay-validations">. See agent-kit/designer/layout-stability.md` |
| `element` | `@view-transition` |

The parser keeps every link attribute except `rel`/`href` (`jay-html-parser.ts:1078-1083`), so `blocking` reaches `head.links`. No parser change. If `ctx.head` is undefined, treat it as no links (the rule fires when `@view-transition` is present).

### Agent-kit guide (second priority)

New file `packages/plugins/design-system-validator/agent-kit/designer/layout-stability.md`, under 120 lines. `run-agent-kit.ts:271` copies plugin files to `agent-kit/<role>/<file>` in the project (same as `font-fallback-patterns.md`), so suggestions say `agent-kit/designer/layout-stability.md`.

1. The cause → fix table, 5 rows: unsized video/iframe → `width`/`height` or `aspect-ratio` on the element · font swap → metric fallback / `font-size-adjust` · `vh` hero → `svh`/`dvh` (+ Googlebot cap) · anti-flicker `opacity:0` → `<script blocking="render" jay-script="allow">` (per `designer/script-tags.md`) · view transition → `<link rel="expect" blocking="render">`. Each row names its rule (`design-media-dimensions`, `font-fallbacks`, `design-viewport-height`, `design-hidden-root`, `design-view-transition-expect`).
2. A media section: `width`/`height`, or `aspect-ratio` + `object-fit` on the element. `width:100%; height:auto` alone still warns. Components are checked too; a component suppresses in its own `<head>`.
3. A fonts section: point to `font-fallback-patterns.md`, plus `font-size-adjust` as a lighter option.
4. A viewport section: the 3-row Q4 table (visitor / Googlebot / fix).
5. Anti-flicker: why to avoid it, `<script blocking="render" jay-script="allow">` (no local `src`; links `designer/script-tags.md`), and what Rule 2 cannot see (runtime class toggles, nested CSS, inline `style` on `<html>`, `<style>` in `<body>`).
6. View transitions: `rel="expect"` on every page that opts in.

Also add the three new keys to the suppression list in `stack-cli/agent-kit-template/designer/validation-guide.md:134-136`.

### Null hypothesis

| Candidate | Existing rule that covers it? | Decision |
| --- | --- | --- |
| video/iframe dimensions | img rule is `<img>`-only (`seo-validator.ts:32`) | new rule |
| hidden root | none (`grep opacity` in validators: none) | new rule |
| view transition `expect` | none | new rule |
| font metric overrides | DL#168 `font-fallbacks` | no rule |
| `font-size-adjust` | partly covered by DL#168 | guide only |
| mobile `vh` jump | DL#188 rule fires on top-level `vh` | guide only |

## Implementation Plan

**Phase 0 — RED tests.** These must fail first, because the validators do not exist yet. All files go in `packages/plugins/design-system-validator/test/validators/`.

Every "1" case below with no other note asserts the **full finding object** with `toEqual` (the repo forbids `toContain`). Pages use path `src/pages/x/page.jay-html`; components `src/components/c/c.jay-html`.

`design-media-dimensions.test.ts`
- page `<video src="/v.mp4"></video>` → 1, video message, `element:'<video>'`
- page `<iframe src="/e"></iframe>` → 1, iframe message, `element:'<iframe>'`
- component file `<video src="/v.mp4"></video>` → 1 (components are checked)
- component file with `design-system: { allow-media-no-dimensions: true }` in its own `<head>` → 0
- page with the same override → 0
- `<video width="640" height="360">` → 0
- `<video width="{w}" height="{h}">` → 0
- `<video width="" height="">` → 1
- `<video class="v">` + `.v{aspect-ratio:16/9}` → 0
- `<video style="aspect-ratio:16/9">` → 0
- `<video class="v">` + `.v{width:100%;height:auto}` → 1
- `<div class="w"><video></video></div>` + `.w{aspect-ratio:16/9}` → 1 (wrapper does not count)
- `<video class="v">` + `.v{position:absolute}` → 0
- `<video width="640" class="v">` + `.v{height:360px}` → 1 (mixed attribute + CSS warns)
- `<video class="v">` + `@supports (aspect-ratio:1){.v{aspect-ratio:16/9}}` → 0 (lenient)
- `<iframe hidden>` → 0
- `<iframe class="t">` + `.t{display:none}` → 0
- `<video class="v">` + `@media (min-width:600px){.v{aspect-ratio:16/9}}` → 1 (base only)

`design-hidden-root.test.ts` (page `<body><main id="app"><div class="modal"></div></main></body>` unless noted)
- `body{opacity:0}` → 1, `element:'body'`
- `html{visibility:hidden}` → 1, `element:'html'`
- `:root{opacity:0%}` → 1, `element:':root'`
- `body.dark{opacity:0}` (no `class` on body) → 1, `element:'body.dark'`
- `html.async-hide{opacity:0}` → 1
- `.dark{opacity:0}` → 0
- `#app{visibility:hidden}` → 1, `element:'#app'`
- `body > main{opacity:0}` → 1
- `body{opacity:0;transition:opacity .3s}` → 1
- `<body><main style="opacity:0">` → 1, inline message, `element:'<main>'`
- `.modal{opacity:0}` → 0 (nested)
- `body::before{opacity:0}` → 0 (pseudo-element)
- `.x:not(body){opacity:0}` → 0; `:is(html) .card{opacity:0}` → 0 (root only at top level)
- `html, body{opacity:0}` → 2, `element:'html'` and `element:'body'`
- `body{opacity:.5}` → 0
- `@media (x){body{opacity:0}}` → 0
- `@keyframes f{from{opacity:0}}` → 0
- `@starting-style{body{opacity:0}}` → 0
- `@supports (x){body{opacity:0}}` → 0
- `@container (x){body{opacity:0}}` → 0
- `@layer base{body{opacity:0}}` → 1
- component file with `body{opacity:0}` → 0 (pages only)
- override `allow-hidden-root` → 0

`design-view-transition-expect.test.ts`
- `@view-transition{navigation:auto}`, no link → 1, `element:'@view-transition'`
- same with `ctx.head` undefined → 1
- `<link rel="expect" href="#m" blocking="render">` → 0
- `<link rel="expect" href="#m">` (no `blocking`) → 1
- `navigation:none` → 0
- no `@view-transition` → 0
- component file with `@view-transition{navigation:auto}` → 0 (pages only)
- override `allow-view-transition-no-expect` → 0

**Phase 1 —** implement the three validators, register them in `plugin.yaml`, export them from `lib/tools.ts`. **Phase 2 —** write the guide and update the validation-guide keys. **Phase 3 —** `yarn test` in the plugin, then `yarn confirm`. **Phase 4 —** demo.

### Demo (`/demo-feature`)

No example app loads `design-system-validator` (plugins come from `src/plugins/` or `package.json` deps, `plugin-scanner.ts:71+`). So, uncommitted and reverted after recording:

1. In `examples/jay-stack/design-system-demo`, add `"@jay-framework/design-system-validator": "workspace:^"` to `devDependencies` (`validate` scans dev deps) and run `yarn install`.
2. Add `src/pages/cls-demo/page.jay-html`: an unsized `<video>` above a block of text, an unsized `<iframe>`, `body{opacity:0}` lifted by `<script jay-script="allow">setTimeout(() => document.body.style.opacity = '1', 2000)</script>` (inline scripts need `jay-script="allow"`, `jay-html-parser.ts:1008`), and `@view-transition{navigation:auto}`. Video: `https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4` (public CC0, about 1 MB) with `preload="metadata"`; under the throttling below its metadata arrives well after the text paints. If the URL is unreachable, use any public mp4 of at least 500 KB. Run `jay-stack validate`; record the 4 warnings.
3. Run the dev server. In Playwright, with CDP network throttling (latency 400 ms, 400 kbit/s down), record the page load and print the sum of `layout-shift` entries without `hadRecentInput` (PerformanceObserver, `buffered: true`).
   - CLS comes from the **video** only: it starts at 300x150 and grows when metadata loads, pushing the text down. Expect sum > 0.1.
   - `body{opacity:0}` is **not CLS**; it is a blank first paint. Show it with a screenshot taken 500 ms after `domcontentloaded` (before the 2-second lift).
   - The iframe does not shift unless something resizes it; it is shown only in the validate output.
   - The view transition needs two pages and a navigation; it is shown only in the validate output, not recorded.
4. Apply the guide's fixes. Re-run validate (none of these warnings) and re-record: sum < 0.01, and the screenshot at the same moment shows content.
5. Save the video at the workspace root as `cls-validations-<date>.webm`. Revert the `package.json` change and the lockfile, delete the demo page.

## Verification Criteria

- [ ] All Phase 0 tests went red first, and now pass.
- [ ] Existing design-system-validator and seo-validator tests are unchanged and pass.
- [ ] Each suggestion names its suppression key and `layout-stability.md`.
- [ ] Each suppression key appears in `validation-guide.md`.
- [ ] `yarn confirm` is green.
- [ ] The demo shows the 4 warnings, CLS > 0.1 → < 0.01 for the video, and the blank first paint gone.
- [ ] Index status is updated to `[Implemented]`, and an Implementation Results section is appended.

## Scope pre-mortem

| Risk | Mitigation |
| --- | --- |
| Noise on existing projects: every embed iframe warns | Single page-level key. The suggestion gives the exact one-line fix |
| Cascade misses external or CDN CSS → false positives | Documented in the guide. Suppression |
| Component media sized by page CSS warns in the component | Known gap, in the guide. Suppress in the component's `<head>` |
| A shared linked CSS file with `@view-transition` makes **every** page warn | Expected: `rel="expect"` is per document, so each page needs its own link. The guide says so; per-page suppression |
| Runtime `html`/`body` class toggles and nested CSS escape Rule 2 | Known gap, in the guide (Q6) |
| Inline `style` on `<html>`, and `<style>` inside `<body>`, escape Rule 2: `ctx.body` starts at `<body>`, and `ctx.css` holds only `head style` and linked sheets (`jay-html-parser.ts:1179-1180`) | Known gap, in the guide |
| Scope creep into the img/srcset fix or font-host unification | Explicitly deferred (Q7) |
| Double warnings with DL#168/#188 | No font rule and no vh rule (null-hypothesis table) |

## Trade-offs

- **Cascade-aware (design-system) vs. attribute-only (seo):** we gain accurate class-based passes. The cost is that media rules live away from the img rule. The seo img rule stays where it is.
- **Warnings, not errors:** these patterns are usually wrong but sometimes deliberate.
- **Static detection only:** runtime class toggles and injected banners are not caught. That is left to the guide and to in-browser CLS measurement.
- **Validators + guide, no framework feature:** the fixes are plain HTML/CSS. The framework adds nothing new.

## Agent feedback loop

- **Validations:** `design-media-dimensions`, `design-hidden-root`, `design-view-transition-expect`.
- **Guide:** `layout-stability.md` plus the key list in `validation-guide.md`.
