# CSS-first patterns

Prefer native HTML and modern CSS for presentation. Keep JavaScript for data loading, validation, and application logic.

`jay-stack validate` runs the **css-first** validator family when the plugin is enabled. v1 ships five automated rules; everything else on this page is guidance only.

## Automated rules (v1)

| Rule | What it catches | Prefer instead |
| --- | --- | --- |
| `allow-javascript-url` | `javascript:` in `href`, `src`, `action`, or `formaction` | `<button type="button">`, `popovertarget`, `<details>`, or a ref handler |
| `allow-inline-event-handlers` | Static `on*` attributes on native HTML elements | CSS for presentation; ref handlers for logic |
| `bound-inline-event-handler` (error) | `on*` value with a Jay binding that resolves to ViewState | Ref handler in the component script |
| `allow-js-lazy-load` | `<img data-src>` / `data-srcset` with no real `src` | `loading="lazy"` and a normal `src` |
| `allow-scroll-reveal-library` | AOS / WOW / ScrollReveal script tags, imports, or `data-aos` / `data-wow-*` attributes | `@keyframes` + `animation-timeline: view()` |

Suppress warnings per page with `<script type="application/jay-validations">` under `css-first: { <rule-key>: true }`, or `// css-first: allow` on a script line for script-side findings.

## Guidance only (no validator rule)

These patterns are common smells but need human judgment — automated rules were retired after corpus testing (see Design Log #221).

### Executable `<script>` in the page body

Jay’s core parser already enforces body-script policy (`jay-script="allow"` opts in to third-party loaders). Do not add inline executable scripts for UI behavior; use CSS, native elements, or the component script.

### Custom dialog markup (`role="dialog"` on a `<div>`)

Jay pages usually drive overlays with ViewState (`if="showPanel"`) and `role="alertdialog"` — that is valid. Native `<dialog>` needs imperative `showModal()` via refs; use it when the flow is click-to-open only. See in-app confirmation patterns in the stack agent-kit.

### Smooth scrolling in JavaScript

`scroll-behavior: smooth` (with `prefers-reduced-motion`) replaces the **option**, not the call. Keep JavaScript when you compute the scroll target (carousels, search match, pinned panels).

### Timer / `requestAnimationFrame` “animations”

`requestAnimationFrame(() => { el.style.opacity = '1' })` is often the correct way to **start** a CSS transition. Use `@keyframes` / `transition` for the motion itself; keep rAF for measure-then-set or one-shot class toggles.

### Presentational scroll handlers

Scroll listeners that only toggle classes can sometimes move to `position: sticky` or `animation-timeline: scroll()`, but many real handlers update signals, load data, or run analytics — none of those belong in a css-first rule.

### Toggle switches

Use `<input type="checkbox" role="switch">` inside a `<label>` (UI Kit `toggle-switch.md`). `<button role="switch">` is the WAI-ARIA Authoring Practices pattern and is not flagged.

## Rejected validator rules (historical)

- **Tab/listbox roles on custom elements** — no single native replacement; use UI Kit patterns.
- **classList.toggle('open')** — class names are ambiguous; refactor to native disclosure when possible.
- **Own-contract boolean disclosure variants** — often intentional (animation, layout, focus). Prefer native disclosure only for simple show/hide.
- **General animation libraries (GSAP, Lottie)** — replacement depends on usage.
- **Root theme from script** — prefer `color-scheme`, `prefers-color-scheme`, and `light-dark()`.
- **Sizing and layout from script** — prefer flex, grid, and container queries; keep JS for measure-once cases.

## Layout and size — prefer CSS over calculated pixels

When the viewport changes, a parent scales, or content reflows, UI often still “looks wrong” for a frame if script re-measures and writes pixel dimensions. That work is usually better expressed as **responsive layout** and **CSS that reacts to context**, not as JavaScript that recomputes width, height, or font size on every tick.

**Prefer**

- **Flow layout** — `display: flex` / `grid`, `flex: 1`, `min-width: 0`, `gap`, and intrinsic sizing so siblings share space without per-element width math.
- **Relative units** — `%`, `rem`, `em`, `fr`, `min()`, `max()`, `clamp()` instead of hard-coded pixels copied from `getBoundingClientRect()`.
- **One factor, many descendants** — when a single value affects presentation (zoom level, density, sidebar width), set a **custom property** on an ancestor and use `calc()` in the stylesheet; avoid pushing derived pixel sizes through ViewState `style` bindings for every child.
- **Transforms for visual scale** — `transform: scale(...)` on a container (with `transform-origin` set intentionally) so children participate in normal layout where possible; use counter-scaling in CSS (`zoom`, `scale`, or `calc` on a custom property) when something inside a scaled subtree must follow a different visual rule than its siblings.
- **Container queries** — `@container` when size should depend on a panel or card, not only the viewport.

**Avoid when CSS can own the outcome**

- `resize` / zoom / scroll handlers whose main job is updating `element.style.width`, `height`, `fontSize`, or per-node `transform` to “fix” layout.
- `createMemo` (or similar) that divides or multiplies measured sizes and feeds **inline `style`** on many elements.
- Rebuilding large ViewState rows only so templates can bind new pixel dimensions.

**JavaScript is still appropriate** for application logic: loading data, validation, hit-testing, mapping pointer events to coordinates, focus management, and **occasional** measurement when CSS has no hook (for example matching a mirror element’s width once on input, or sizing an offscreen export node). That is not the same as keeping layout correct by continuously recalculating sizes in script.

## Scroll-driven motion

Use `@supports (animation-timeline: view())` with `@keyframes` and `animation-timeline: view()` instead of scroll-reveal libraries.

Do **not** add CDN `<script src="…">` tags for AOS, WOW.js, or ScrollReveal in page markup. Prefer CSS view-timeline animations in the page stylesheet, or bundle behavior in the component script only when CSS cannot express the motion. The css-first validator flags known library script URLs (path segment match), bare package imports in `page.ts`, and `data-aos` / `data-wow-*` attributes.

## Sticky headers

Prefer `position: sticky` and `animation-timeline: scroll()` over scroll listeners that toggle classes.
