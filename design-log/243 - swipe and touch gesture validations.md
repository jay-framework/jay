# 243 — Swipe and touch gesture validations

**Status:** [Design] — awaiting design-log review, then product approval. No production code yet.

## Decisions for the Implementer (TL;DR)

1. Add **four** `jay-stack validate` **warnings**. Each message names the guide to read.

| Rule | Where | Fires when |
|---|---|---|
| `SWIPE-SNAP-OVERSCROLL` | a11y-validator, CSS | horizontal `scroll-snap-type` rule has no `overscroll-behavior(-x/-inline)` |
| `SWIPE-SNAP-BLOCKED` | a11y-validator, CSS | the same snap rule also sets `touch-action: none`/`pan-y`, or both its *effective* overflow axes are `visible`/`clip` (not a scroll container) — the user can never swipe it |
| `SWIPE-CAROUSEL-KEYBOARD` | a11y-validator, jay-html + CSS | a snap container or carousel region a keyboard cannot reach, a carousel with no (or an empty) name, or `aria-roledescription` on an implicit-generic element (`div`, `span`, …) with no `role` |
| `SWIPE-TOUCH-LISTENER` | stack-cli TS line scan (like `checkDirectDocumentAccess`) | `touchstart/move/end/cancel` listeners or `ontouch*` ref handlers |

2. Every message starts with `[SWIPE-…]` and ends with its suppression key, because a finding has no rule field (`plugin-validators.ts:3-9` ✅). Each rule passes its own guide to `pushFinding`, so the a11y-patterns guide is not appended twice (see "Message format").
3. Suppression: `a11y: { allow-…: true }` in `application/jay-validations` for the CSS/DOM rules; a same-line `// jay-gesture: allow` comment for TS (Q1 settled below).
4. A selector too complex to match safely → no report. A missed warning beats a false positive. A comma list (`.a, .b`) is split and each part is matched on its own (simple parts checked, complex parts skipped).
5. Viewport `user-scalable=no` / `maximum-scale` is **already an error** (`a11y-validator.ts:318-345` ✅). No new rule.
6. Guides come second: fix `ui-kit/agent-kit/designer/scroll-carousel.md` (it teaches the mistake today), add `a11y-validator/agent-kit/designer/swipe-gestures.md`, extend `developer/component-refs.md`.
7. Demos prove **observable behaviour** (scroll chaining, snap offsets, keyboard), not recorded back-navigation. Real back-navigation needs a real device or trackpad.

## Background

Point #4 of the Chrome article "Top 10 things AI gets wrong in web dev" lists four mistakes:

| # | AI mistake | Native fix |
|---|---|---|
| a | Swipe built from `touchmove`/`pointermove` with JS physics | CSS Scroll Snap (the browser runs the physics off the main thread) |
| b | Tab or carousel swipe without overscroll control, so an over-swipe triggers browser back/forward | `overscroll-behavior-x: contain` (or `none`) |
| c | Swipe progress tracked in JS callbacks | Scroll-driven animations (`animation-timeline: scroll()/view()`) |
| d | Scroll-based swipe panels with no keyboard access | Focusable scroller and/or real prev/next buttons |

## Problem

Agents writing Jay pages copy these patterns, and Jay says nothing about them. Jay's own carousel guide even repeats mistakes (b) and (d).

## Prior Art / Adjacent Mechanisms

| What | Where | Reuse |
|---|---|---|
| TS line scan with same-line suppression comment | `packages/jay-stack/stack-cli/lib/validate.ts:609-655` (`DOCUMENT_ACCESS_PATTERNS`, `DOM_SUPPRESS_COMMENT = 'jay-dom: allow'` at `:621`, `checkDirectDocumentAccess`), called at `:2168-2172` | The model for `SWIPE-TOUCH-LISTENER` |
| Scan scope: only `<basename>.ts` or `page.ts` next to the jay-html | `validate.ts:624-627` | Same scope (a known limit, see pre-mortem) |
| Per-rule page suppression `a11y: { rule: true }` | `packages/plugins/a11y-validator/lib/validators/a11y-validator.ts:15-17` (DL#185) | For the CSS and DOM rules |
| Guide suffix appended to the suggestion | `a11y-validator.ts:8,19-27` (`A11Y_GUIDE`, appended to every suggestion) ✅ | Add an optional `guide` parameter (default `A11Y_GUIDE`); swipe rules pass the swipe guide |
| Finding shape: `severity`, `message`, `suggestion?`, `element?`, `attribute?` — no rule id | `compiler-shared/lib/plugin-validators.ts:3-9` ✅ | Rule id and suppression key go in the message text |
| Empty `aria-label`/`aria-labelledby` errors | `a11y-validator.ts:354` (`checkLabel`), emitted at `:367-376,383-392` ✅ — but only called for `input`/`select`/`textarea` (`:203-214`) ✅ | Not reused: carousels need their own empty-name check (Trigger B) |
| `isFocusable` | `a11y-validator.ts:529-545` ✅ — counts widget roles and `<button>` even when disabled | Not reused as-is; Trigger A uses a stricter `isKeyboardReachable` |
| Viewport zoom checks (`user-scalable=no`, `maximum-scale < 2`) | `a11y-validator.ts:318-345` (errors, WCAG 1.4.4) | Already covers the viewport candidate |
| Validator context gets page CSS | `packages/compiler/compiler-shared/lib/plugin-validators.ts:29` (`css?: string`), filled at `validate.ts:1841` from `extractCss` (`compiler-jay-html/lib/jay-target/jay-html-parser.ts:1134-1190`) | Input for the CSS rules (scope: see pre-mortem) |
| Element walk | `compiler-shared/lib/validator-utils.ts:49-110` (`walkElements`) | `<jay:scroll-carousel>` is visited as a plain element named `jay:scroll-carousel`, with the page's own children inside it. Only the contract scope changes (`:70-81`); the component's template is **not** expanded |
| postcss CSS parsing and cascade resolution | `packages/plugins/design-system-validator/lib/css-cascade.ts:1-2,72,240` | Same `postcss` parse. Selector matching is deliberately simpler |
| Validation guide entry point | `validate.ts:3002` → `agent-kit/designer/validation-guide.md` | Add the four rules to it |
| Carousel component (click → `scrollBy`, smooth) | `packages/plugins/ui-kit/lib/scroll-carousel.ts:18-26` | Correct approach (native scroll). Unchanged |
| Carousel guide | `packages/plugins/ui-kit/agent-kit/designer/scroll-carousel.md:44-52,81-103` | No `overscroll-behavior-x`. Uses obsolete `-webkit-overflow-scrolling: touch` (`:88` ✅). Pattern 2 calls prev/next "optional" (`:77` ✅) |
| Drag advice (`setPointerCapture`) | `stack-cli/agent-kit-template/developer/component-refs.md:135` | Extend with "prefer scroll snap" |
| Runtime exposes `ontouch*` on refs (incl. `ontouchcancel` at `:299`) | `packages/runtime/runtime/lib/node-reference-types.ts:299-314` | The TS rule flags uses of them |
| a11y tests: inline HTML + `makeContext(html, head)` | `a11y-validator/test/validators/a11y-validator.test.ts:14-22` | Test pattern; needs a `css` argument (P0) |

**Null hypothesis (guide only).** The project's rule is "validation first, guide second", and today's guide is wrong. Agents copy the guide's CSS; a check that fails loudly is the reliable correction. All four rules match literal text or simple structure.

## Candidate evaluation

| Candidate | Verdict | Reason |
|---|---|---|
| Horizontal `scroll-snap-type` without `overscroll-behavior(-x)` | **Accept → SWIPE-SNAP-OVERSCROLL** | Literal and local. Exact mistake (b) |
| `touch-action: none` or `pan-y` (without `pan-x`) on the same rule as horizontal snap | **Accept → SWIPE-SNAP-BLOCKED** | Literal same-rule. It disables native horizontal panning, so the snap row cannot be swiped (usually added "to stop the page scrolling" for a JS swipe) |
| Both effective overflow axes `visible`/`clip`, both declared on the same rule as horizontal snap | **Accept → SWIPE-SNAP-BLOCKED** | That element is not a scroll container ⚠️ (CSS Overflow 3), so snap is dead. An axis not declared on the rule is skipped (could be set elsewhere) |
| `overflow-x: visible` or `clip` + `overflow-y` `auto`/`hidden`/`scroll` | Reject (not blocked) | CSS computes `visible`→`auto` and `clip`→`hidden` when the other axis is neither `visible` nor `clip`, so it is a scroll container ⚠️ (CSS Overflow 3 spec; not tested in a browser) |
| Same, with `overflow-x: hidden` | Reject | Still scrollable by script; a buttons-only carousel (`scrollBy`) is a legitimate design |
| `overflow-x: hidden` snap row **and** no `<button>` in the parent (nobody can scroll it) | Reject as SNAP-BLOCKED | Buttons may live further up or be added by a headless component; Trigger A of SWIPE-CAROUSEL-KEYBOARD already warns on this structure (no focusable inside, no button in parent), so a second rule would duplicate it |
| `aria-roledescription` (any value) on an element whose implicit role is generic, with **no** `role` attribute | **Accept → part of SWIPE-CAROUSEL-KEYBOARD (Trigger C)** | ARIA 1.2 forbids it only on the generic role, so it is not announced ⚠️ (screen-reader behaviour not tested). Elements with a non-generic implicit role (`button`, `section` with a name, `nav`, …) and any explicit role pass. Literal tag + attribute check |
| Viewport `user-scalable=no` / `maximum-scale=1` | Already covered | Existing errors at `a11y-validator.ts:318-345`. The new guide mentions them |
| Horizontal scroller without scroll-snap | Reject | Many legitimate free scrollers (tables, code, chip rows) |
| `touch-action` missing on a custom-drag element | Reject | CSS cannot tell which element is dragged. Guide only |
| Snap container / carousel with no keyboard path or no (empty) name | **Accept → SWIPE-CAROUSEL-KEYBOARD** | Structure check, mistake (d). Simple selectors only |
| `addEventListener('touchstart'\|'touchmove'\|'touchend'\|'touchcancel')` or `.ontouch…(` | **Accept → SWIPE-TOUCH-LISTENER** | Literal tokens. `touchcancel` is included because it is always paired with a hand-rolled touch gesture |
| Touch listener without `{ passive: true }` | Reject (merged) | Already flagged above. Options often span lines |
| `preventDefault()` inside a `touchmove` handler | Reject | Needs scope analysis |
| `pointermove` swipe physics | Reject | `pointermove` is correct for drag/resize (`component-refs.md:135`). Guide only |
| JS swipe progress (`onscroll` writing styles) | Reject | Cannot be told apart from legitimate scroll handlers. Guide only |
| `-webkit-overflow-scrolling: touch` | Reject as rule | Harmless no-op. Remove it from the guide |
| Unconditional `scroll-behavior: smooth` | Out of scope | Belongs to point 2 (reduced motion) |

## Rules

### Message format (all rules)

`message` = `[RULE-ID] <problem>`; `suggestion` = `<fix> Suppress with <key>.` + the rule's guide. Example: `[SWIPE-SNAP-OVERSCROLL] .track scrolls horizontally …` / `… Suppress with a11y: { allow-snap-overscroll: true }.\nSee: agent-kit/designer/swipe-gestures.md`. `pushFinding(findings, finding, guide = A11Y_GUIDE)` appends exactly one guide.

All four are **warnings**: `validate` already says warnings "must be fixed or explicitly suppressed" (`validate.ts:2984`).

"Horizontal snap rule" below means a CSS rule (also inside `@media`) whose `scroll-snap-type` axis is `x`, `inline` or `both`.

**Comma selector lists (decided):** a rule's selector list is split on top-level commas and each part is treated as its own selector — `.a, .b { … }` reports `.a` and `.b` separately, and for OVERSCROLL `.a` is satisfied by any rule whose list contains `.a`. A part that is not simple is skipped for the keyboard match (test 13b).

### SWIPE-SNAP-OVERSCROLL

- **Trigger:** a horizontal snap rule, and **no** rule (anywhere in `ctx.css`) with identical selector text declares `overscroll-behavior-x`, `overscroll-behavior-inline` or `overscroll-behavior`. Any value counts, including `auto` (an explicit `auto` is a deliberate choice).
- **Why across rules here but within one rule for SNAP-BLOCKED:** a *missing* property is only safe to report if no other rule for that selector adds it, so OVERSCROLL looks wider to avoid false positives. A *present* bad property is safe to report from the rule that declares it, and looking across rules would need cascade order (which rule wins) that simple matching cannot resolve. Both choices minimise false positives.
- **False positives:** vertical snap is excluded. A nested carousel can still chain to the page, so the warning is still right. Another selector setting the property → missed warning (accepted).
- **Suppression:** `a11y: { allow-snap-overscroll: true }`.
- **Message:** `` [SWIPE-SNAP-OVERSCROLL] `.track` scrolls horizontally with scroll-snap but has no overscroll-behavior-x — an over-swipe can trigger browser back/forward. `` ⚠️ (browser behaviour, see demos) **Suggestion:** `` Add `overscroll-behavior-x: contain;` to the same rule. Suppress with a11y: { allow-snap-overscroll: true }. `` + swipe guide.

### SWIPE-SNAP-BLOCKED

- **Trigger (same rule only):** a horizontal snap rule that also declares
  - `touch-action` whose value is `none`, or has no horizontal pan keyword (`pan-x`/`pan-left`/`pan-right`) — e.g. `pan-y`, `pinch-zoom`, `pan-y pinch-zoom` — but is not `auto`/`manipulation`, or
  - effective `overflow-x` **and** `overflow-y` both `visible`/`clip`. `clip` is treated exactly like `visible`. If either axis is not declared on the rule, skip (it could be set elsewhere).
- **Effective value:** read the rule's declarations in order; the last one wins. `overflow: a b` sets x=`a`, y=`b`; `overflow: a` sets both. Later `overflow-x`/`overflow-y` override the shorthand. `!important` and other rules are ignored.
- **Why the y check:** when the other axis is neither `visible` nor `clip`, `visible` computes to `auto` and `clip` to `hidden` ⚠️ (CSS Overflow 3), so `overflow-x: visible|clip; overflow-y: auto` is a scroll container. Only both-axes `visible`/`clip` is blocked.
- **Not flagged:** `touch-action: pan-x`, `pan-left`, `pan-right`, `manipulation`, `auto`; `overflow-x: hidden`/`auto`/`scroll`; `overflow-x: visible|clip` with `overflow-y: auto|hidden|scroll`; `overflow-x: visible` with no `overflow-y` on the rule; properties set in a different rule.
- **Suppression:** `a11y: { allow-snap-blocked: true }`.
- **Message:** `` [SWIPE-SNAP-BLOCKED] `.track` has scroll-snap but `touch-action: none` — users cannot swipe it. `` (or `` …but overflow is `visible`/`clip` on both axes — it never scrolls. ``) **Suggestion (per cause, one finding per cause):** touch-action → `` Remove touch-action or use pan-x. Suppress with a11y: { allow-snap-blocked: true }. ``; overflow → `` Set overflow-x: auto. Suppress with a11y: { allow-snap-blocked: true }. `` Both + swipe guide.

### SWIPE-CAROUSEL-KEYBOARD

- **Carousel element:** (1) an element with `aria-roledescription="carousel"` (case-insensitive, trimmed), or (2) an element matched by a *simple* selector (`.class`, `#id`, `tag`, or a compound of these; no combinators or pseudos) of a horizontal snap rule. Complex selectors are skipped.
- **Headless components:** `walkElements` visits `<jay:scroll-carousel>` as one element with the page's own children. A `ref="container"` child with a matching class is checked like any element; the component's internal template is not seen.
- **Keyboard-reachable** (new helper `isKeyboardReachable`, stricter than `isFocusable` at `:529-545` ✅): `tabindex` parsed as an integer ≥ 0; or `a`/`area` with `href`; or `button`/`select`/`textarea`/`input` (not `type=hidden`) without `disabled`; or `summary` that is the first child of `details`; or `contenteditable` other than `"false"`; or `video`/`audio` with `controls`; or `iframe`. `tabindex="-1"`, a disabled button and `<a>` without `href` do **not** count. Roles alone do not count (a `role="button"` div needs its own tabindex).
- **Trigger A, no keyboard path:** the container is not keyboard-reachable, has no keyboard-reachable descendant, and its parent has no keyboard-reachable prev/next control outside the container: a `<button>` (not disabled) or an `<a href>` child.
- **Trigger B, no name:** a case (1) element whose `aria-label` and `aria-labelledby` are both absent or empty/whitespace. Empty values are **not** reported elsewhere: `checkLabel` (`:354`) runs only for `input`/`select`/`textarea` (`:203-214`) ✅, so Trigger B owns this case.
- **Trigger C, unannounced role description:** an element with `aria-roledescription`, **no `role` attribute**, and a tag whose implicit role is generic. Exact list: `div`, `span`, `b`, `i`, `u`, `s`, `small`, `bdi`, `bdo`, `data`, `pre`. Everything else passes — including `section` (skipped: it is `region` when named, and unnamed sections are rare enough to not be worth the ambiguity) and any element with an explicit role. Message echoes the actual value: `` [SWIPE-CAROUSEL-KEYBOARD] <div aria-roledescription="<value>"> has no role, so the role description is not announced. `` **Suggestion:** `` Add role="region" (or "group") with an aria-label. Suppress with a11y: { allow-carousel-keyboard: true }. `` + swipe guide.
- **Known false negatives:** a parent with *any* `<button>`/`<a href>` passes, even an unrelated one (e.g. "Add to cart"). Buttons further away than the parent are missed. Both accepted.
- **False positives:** slides with links pass (Tab scrolls them in). Chrome's default focusable scrollers do not cover Safari, so the warning still applies.
- **Suppression:** `a11y: { allow-carousel-keyboard: true }`.
- **Message A:** `` [SWIPE-CAROUSEL-KEYBOARD] Swipe region `.gallery` cannot be reached by keyboard — no prev/next buttons and nothing focusable inside. `` **Suggestion:** `` Add <button> prev/next controls (e.g. ui-kit scroll-carousel refs) or tabindex="0" with an aria-label. Suppress with a11y: { allow-carousel-keyboard: true }. `` + swipe guide.
- **Message B:** `` [SWIPE-CAROUSEL-KEYBOARD] <div aria-roledescription="carousel"> has no accessible name (WCAG 4.1.2). `` Same suggestion tail. B and C may both fire on one element (two separate problems).

### SWIPE-TOUCH-LISTENER

- **Where:** `stack-cli/lib/validate.ts`, next to `checkDirectDocumentAccess`, same files and loop.
- **Trigger (per line):** `/addEventListener\(\s*['"`]touch(start|move|end|cancel)['"`]/` or `/\.ontouch(start|move|end|cancel)\$?\(/`.
- **Suppression:** `// jay-gesture: allow` on the same line.
- **False positives (accepted, suppressible):**
  - comments and strings (same risk as the DOM scan);
  - real pinch/multi-touch;
  - `touchend` used for non-swipe work: closing a menu on outside tap, ending a long-press timer, analytics, iOS "first tap" hover workarounds.
- **Overlap with the DOM scan, accepted:** `document.addEventListener('touchmove', …)` gives two warnings, one for document access and one for the touch gesture. They are different fixes (use refs vs. use scroll snap) with different suppression tokens, so both stay. Test 30 pins it: `checkDirectDocumentAccess` and the new `checkTouchListeners` are **both exported** from `validate.ts`; the test calls each on the same file and asserts exactly one warning from each.
- **False negatives:** a call split across lines (`addEventListener(\n 'touchmove'`) is missed, as in the DOM scan.
- **Message:** `` [SWIPE-TOUCH-LISTENER] page.ts:12 — Touch listener "addEventListener('touchmove'" — build swipes with CSS scroll-snap, or pointer events for drag. Suppress with // jay-gesture: allow on the same line. See agent-kit/developer/component-refs.md#gestures ``

### Before / after

```css
/* before — warns SWIPE-SNAP-OVERSCROLL and SWIPE-SNAP-BLOCKED */
.tabs { display:flex; overflow-x:auto; scroll-snap-type:x mandatory; touch-action:none; }
/* after */
.tabs { display:flex; overflow-x:auto; scroll-snap-type:x mandatory; overscroll-behavior-x:contain; }
```

```html
<!-- before — warns SWIPE-CAROUSEL-KEYBOARD (A) -->
<div class="gallery"><img src="1.jpg" alt="…"><img src="2.jpg" alt="…"></div>
<!-- after -->
<div class="carousel" role="region" aria-label="Gallery">
  <button ref="prev" aria-label="Previous">‹</button>
  <div ref="container" class="gallery">…</div>
  <button ref="next" aria-label="Next">›</button>
</div>
```

```ts
// before — warns SWIPE-TOUCH-LISTENER
refs.card.addEventListener('touchmove', onMove);
// after: delete the JS — the card lives in a scroll-snap row (swipe-to-dismiss = snap point + scrollend)
```

## Socratic Q&A

- **Why not errors?** Each pattern has a legitimate use (pinch-zoom, deliberate `auto`). Warnings plus suppression match a11y practice.
- **Why only identical selector text?** A full cascade adds risk and code. AI output puts the properties in one rule, and the suggested fix does the same.
- **Why not reuse `resolveCascade` from design-system-validator?** It would make a11y-validator depend on another plugin. Simple matching covers `.track`. (Q4 below, follow-up only.)
- **Q1 settled: why a new `jay-gesture: allow` instead of `jay-dom: allow`?** The two rules mean different things. Reusing `jay-dom` would let one comment silence both a document-access warning and a gesture warning on the same line, and the message would point to the wrong guide. A separate token is one more constant next to `DOM_SUPPRESS_COMMENT`.
- **Why is `auto` accepted for overscroll?** It is an explicit choice someone wrote on purpose; flagging it would push people to suppress instead.
- **Does the TS rule block the runtime's `ontouch*` API?** No. It is a warning with suppression.
- **What about scroll-driven animations (c)?** Not soundly detectable; guide only.
- **Do headless plugin component files get scanned?** No. Same scope as the DOM check.
- **Q3 settled: is emulated WebKit enough?** Yes, for what it claims. The mobile demo is labelled "snap + keyboard behaviour", not touch physics. Real touch physics and back-navigation need a real device and are not required for "done".

## Design: guides (second)

| File | Change |
|---|---|
| `packages/plugins/ui-kit/agent-kit/designer/scroll-carousel.md` | Add `overscroll-behavior-x: contain` to both CSS samples. Remove `-webkit-overflow-scrolling`. Pattern 2: "pure swipe galleries still need a keyboard path (buttons or `tabindex="0"` + `aria-label`)". State that the controls must be real prev/next `<button>`s that scroll the track (the validator accepts any nearby button, so an unrelated one would silence it). Link to swipe-gestures.md |
| **new** `packages/plugins/a11y-validator/agent-kit/designer/swipe-gestures.md` | One page on the four mistakes (keyboard section: controls must be real prev/next `<button>`s, not any button nearby — Trigger A cannot tell) plus "don't block the swipe" (`touch-action`, `overflow`) and "don't disable zoom". Each section opens with its rule id and has a before/after |
| `packages/jay-stack/stack-cli/agent-kit-template/developer/component-refs.md` | New `## Gestures` anchor: prefer CSS snap; pointer events + `setPointerCapture` + `touch-action` for real drags; no touch listeners. Describes `// jay-gesture: allow` |
| `…/designer/validation-guide.md` | List the four rule ids and their suppressions |

## Implementation Plan (red tests first)

**P0: red tests.** Each asserts correct behaviour and fails before P1. Assert the full findings array with `toEqual` (never `toContain`). Isolation: the HTML of tests 1–8 and 17–21 (except 20) has no element matching the snap selector, or puts a sibling `<button>` next to it, so Keyboard A does not also fire.

First, extend the test helper: `makeContext(html, head?, css?)` in `a11y-validator.test.ts:14` (and the copy in the new test file) sets `css` on the context.

`packages/plugins/a11y-validator/test/validators/swipe-gestures.test.ts`:

| # | Input | Expected |
|---|---|---|
| 1 | `scroll-snap-type: x mandatory`, no overscroll | 1 `SWIPE-SNAP-OVERSCROLL` naming the selector and `swipe-gestures.md` |
| 2 | + `overscroll-behavior-x: contain` | none |
| 3 | + `overscroll-behavior: none` | none |
| 4 | overscroll in a second rule, same selector | none |
| 5 | `scroll-snap-type: y mandatory` | none |
| 6 | `both`, `inline` | warn each |
| 7 | inside `@media` | warn |
| 7a | `.t { overscroll-behavior-x: contain }` top-level + `@media (…) { .t { scroll-snap-type: x mandatory } }` | none (identical selector text matches across at-rules; decided) |
| 8 | `allow-snap-overscroll: true` | none |
| 9 | `.gallery` snap-x, only `<img>` children, no buttons | Keyboard A |
| 10 | sibling `<button>` | none |
| 11 | `<a href>` slides | none |
| 12 | `tabindex="0"` on container | none |
| 12a | `tabindex="-1"` on container | A |
| 12b | sibling `<button disabled>` only | A |
| 12c | `<a>` slides without `href` | A |
| 12d | slide with `contenteditable` / `<details><summary>` | none |
| 12e | slide with `<video controls>` / `<audio controls>` / `<iframe>` | none each; `<video>` without `controls` → A |
| 12f | sibling `<a href="#next">` instead of a button | none |
| 13 | `.wrap > .gallery` | none (skipped) |
| 13a | `.a, .b { scroll-snap-type: x mandatory }`, no overscroll | 2 OVERSCROLL (`.a`, `.b`); `.b { overscroll-behavior-x: contain }` added → 1 (`.a`) |
| 13b | `.gallery, .wrap > .x` snap-x, `.gallery` with only images | A for `.gallery`; complex part skipped |
| 14 | `aria-roledescription="carousel"`, no name | B |
| 15 | with `aria-label` (and `role="region"`) | no B |
| 15a | `aria-label="  "` / `aria-labelledby=""` | B each (empty counts as no name) |
| 15b | `aria-roledescription="carousel"` + `aria-label`, no role | C |
| 15c | same with `role="group"` | none |
| 15d | `<div role="button" tabindex="0" aria-roledescription="toggle">` | none (valid ARIA) |
| 15e | `<section aria-label="Gallery" aria-roledescription="carousel">` | no C (implicit `region`) |
| 15f | `<button aria-roledescription="toggle">` | none |
| 15g | `<span aria-roledescription="slide">` | C, message contains `"slide"` |
| 16 | `allow-carousel-keyboard: true` | none |
| 17 | snap-x + `touch-action: none` | 1 `SWIPE-SNAP-BLOCKED` |
| 18 | snap-x + `touch-action: pan-y` | warn; `pinch-zoom` → warn; `pan-y pinch-zoom` → warn; `pan-x`, `pan-left`, `pan-right`, `pan-left pan-y` and `manipulation` → none |
| 19 | snap-x + `overflow: visible`; `overflow: clip`; `overflow-x: clip; overflow-y: visible` | warn each |
| 19a | snap-x + `overflow-x: visible; overflow-y: auto`; `overflow-x: clip; overflow-y: auto`; `overflow-x: hidden` | none each (scroll container) |
| 19c | snap-x + `overflow-x: visible` only (no `overflow-y` on the rule) | none (skipped, could be set elsewhere) |
| 19b | `overflow: visible auto` / `overflow-x: visible; overflow: auto` (last wins) | none each |
| 20 | `<jay:scroll-carousel>` with `<div ref="container" class="gallery">` of images, no buttons | Keyboard A |
| 21 | `allow-snap-blocked: true` | none |
| 21a | any finding | message starts with `[SWIPE-…]`, suggestion names its suppression key and contains `swipe-gestures.md` once and `a11y-patterns.md` zero times |

`packages/jay-stack/stack-cli/test/validate-gesture-listeners.test.ts` (temp dir with `page.jay-html` + `page.ts`, through the exported checker):

| # | Input | Expected |
|---|---|---|
| 22 | `addEventListener('touchmove', …)` | warning with `page.ts:<line>` |
| 23 | `"touchstart"` (double quotes) | warn |
| 24 | `refs.x.ontouchend(`, `ontouchstart$(`, `ontouchcancel(` | warn each |
| 25 | `addEventListener('touchcancel', …)` | warn |
| 26 | `addEventListener('pointermove'` | none |
| 27 | `refs.x.addEventListener('touchmove', f); // jay-gesture: allow` | none |
| 28 | same line with `// jay-dom: allow` only | **warns** (tokens are separate) |
| 29 | `<basename>.ts` component file | scanned |
| 30 | `document.addEventListener('touchmove', f)` | `checkDirectDocumentAccess` → exactly 1 DOM warning; `checkTouchListeners` → exactly 1 `[SWIPE-TOUCH-LISTENER]` (both exported) |

**P1:** implement the a11y rules (add `postcss` as a dependency of a11y-validator, same version as design-system-validator; never touch package versions). **P2:** the stack-cli rule; export `checkTouchListeners` and `checkDirectDocumentAccess` for tests. **P3:** guides. **P4:** demos. **P5:** set this log's status and index line to [Implemented], append Implementation Results (X/Y tests), add a CHANGELOG `## Unreleased` entry.

## Recorded browser demos

A testbed page with two carousels, "bad" (AI-generated) and "fixed", plus a page tall/wide enough to scroll. Fixtures: `bad` = the "before" CSS/HTML above; `fixed` = the corrected Pattern 1 sample from the updated `scroll-carousel.md` (with `overscroll-behavior-x: contain`, `role="region"` + `aria-label`, prev/next buttons), copied verbatim into `swipe-gestures-demo/page.jay-html`. Videos at the **workspace root** as `swipe-gestures-<browser>-<date>.webm`. Recorder: the workspace demo recorder.

**Outer page markup (Chromium chaining needs it):** `<body>` holds one root `<main style="overflow-x:auto">` wrapping a `<div style="width:300vw">` that contains both carousels, so the outer scroller can move horizontally when a track chains. A page that does not overflow horizontally cannot show chaining.

**What a script can and cannot show.** Synthetic wheel events in Playwright Chromium do not trigger swipe-to-navigate, and script-dispatched `TouchEvent`s are untrusted, so they do not start native scrolling or snapping. Neither demo claims to record back-navigation; that needs a real device or trackpad.

| Run | Setup | Steps and assertions |
|---|---|---|
| Chromium, mobile emulation | Playwright Chromium, `devices['Pixel 7']` (`hasTouch`, `isMobile`), CDP session | 1. Show `jay-stack validate` output (warnings on bad, 0 swipe warnings on the fixed page). 2. Assert `getComputedStyle(track).overscrollBehaviorX` is `auto` on bad, `contain` on fixed. 3. Scroll each track to its end, then start a **new** `Input.synthesizeScrollGesture` (trusted, `gestureSourceType: 'touch'`) at the track's edge, further in the same direction. Each gesture must start after the track is at the edge: Chrome latches a gesture to the scroller it started in ⚠️, so one long gesture would never chain. 4. Assert scroll chaining: on bad, the outer `<main>`'s `scrollLeft` changes ⚠️ (expected behaviour, to be confirmed by the demo); on fixed it stays the same and the track's `scrollLeft` stays at max. 5. After a gesture mid-track, wait for `scrollend` and assert `scrollLeft` equals a slide offset |
| WebKit, iPhone emulation | Playwright WebKit, `devices['iPhone 13']` | Labelled **"snap + keyboard behaviour, not touch physics"**. Waiting: `scrollend` with a fallback (poll `scrollLeft` every 50 ms until unchanged for 3 polls, 2 s timeout), since WebKit `scrollend` support is ⚠️ unverified. 1. `track.scrollBy({left: 40})` on fixed, wait, assert `scrollLeft` is the nearest slide offset (snap works). 2. Keyboard: Tab to "Next" (WebKit may skip buttons on Tab without full keyboard access ⚠️; if `activeElement` is not "Next" after Tab, fall back to `next.focus()` and log the fallback), assert `document.activeElement` is it, `matches(':focus-visible')` is true and computed `outlineStyle` is not `none`; press Enter, wait, assert `scrollLeft` = next slide offset. 3. On bad: assert the track and its descendants have no keyboard-reachable element and its parent has no prev/next `<button>` (DOM query), so there is no keyboard path. (Not "Tab never reaches", which depends on WebKit's Tab-to-links setting ⚠️.) |

## Verification Criteria

- All P0 tests (1–30 plus lettered cases) are red before P1 and green after. `yarn confirm` passes.
- `validate` on `swipe-gestures-demo/page.jay-html` with only the fixed carousel (the corrected Pattern 1 sample of `scroll-carousel.md`) gives 0 swipe warnings. The old guide's Pattern 2 gives `SWIPE-SNAP-OVERSCROLL` **and** Keyboard A.
- The jay repo's own examples are not newly flagged unless they really contain the mistake. Run and list the results.
- Both demo videos exist and their assertions pass as listed above.

## Scope pre-mortem

| Risk | Mitigation |
|---|---|
| Noise on existing projects | Warnings only, per-rule suppression, complex selectors skipped |
| `postcss` cost in a11y-validator | Already in the tree; one parse per page |
| Headless/plugin component TS not scanned | Documented. Follow-up |
| What `ctx.css` holds | Checked in `extractCss` (`jay-html-parser.ts:1134-1190`): local `<link rel="stylesheet">` files (with nested `@import`s resolved) **and** `<style>` in `<head>`. Not included: `<style>` in the body, remote `http(s)://` stylesheets, styles inside headless component templates. Those are accepted false negatives |
| Scope creep into the scroll-carousel runtime | Out of scope. Its smooth scrolling belongs to point 2 |

## jay-feedback decision

- **Validation:** yes, four rules (above).
- **Agent-kit:** yes, the new swipe-gestures guide, the corrected carousel guide, and the gestures section in component-refs.
- **Framework feature:** none.

## Trade-offs

Simple selector matching misses some cases but never guesses. A line scan is cheap and catches the AI's literal pattern, but misses multi-line calls.

## Open Questions

Q1 (suppression token), Q2 (`auto`) and Q3 (emulated WebKit) are settled above. Remaining, follow-ups only, none blocks this log:

4. Should a11y-validator later use design-system-validator's `resolveCascade` subpath (DL#233) for full selector matching?
5. Should `SWIPE-TOUCH-LISTENER` also scan headless component files in plugins?
