# Layout stability (CLS) and flicker

Content that moves after it paints (CLS) or a page that stays blank until a script runs both hurt users
and Core Web Vitals.

| Cause                                                             | Fix                                                           | Rule                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------- |
| `<video>`/`<iframe>` without a size (300x150, then jumps)         | `width`+`height` attributes, or `aspect-ratio` on the element | `design-media-dimensions`       |
| Web font swap reflows text                                        | metric-matched fallback; `font-size-adjust`                   | `font-fallbacks`                |
| `100vh` hero jumps when mobile toolbars show/hide                 | `svh`/`dvh` (plus a Googlebot cap)                            | `design-viewport-height`        |
| Anti-flicker `opacity: 0` / `visibility: hidden` on the page root | remove it; `<script blocking="render" jay-script="allow">`    | `design-hidden-root`            |
| Cross-document view transition pops in                            | `<link rel="expect" href="#id" blocking="render">`            | `design-view-transition-expect` |

## Media: reserve the box on the element

```html
<!-- ✅ -->
<video src="/hero.mp4" width="1280" height="720"></video>
<iframe class="map" src="https://maps.example/embed"></iframe>
<style>
  .map {
    width: 100%;
    aspect-ratio: 16 / 9;
  }
</style>
<style>
  video {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
    object-fit: cover;
  }
</style>
```

- `aspect-ratio` on a **wrapper** does not count: put it on the `<video>`/`<iframe>`.
- `width: 100%; height: auto` alone still warns: add `aspect-ratio`.
- An absolutely positioned or hidden element is skipped.
- Components are checked on their own CSS. A component sized only by the page's CSS warns; suppress it
  in the component's own `<head>`.

## Fonts

Give each web font a metric-matched `local()` fallback (see `font-fallback-patterns.md`).
`font-size-adjust: from-font` is a lighter option that keeps the x-height steady across the swap.

## Viewport height

| Viewer         | What happens with `100vh`                            | Fix                                           |
| -------------- | ---------------------------------------------------- | --------------------------------------------- |
| Mobile visitor | the hero jumps when toolbars show/hide               | `svh` (stable) or `dvh` (follows the toolbar) |
| Googlebot      | every viewport unit resolves to a very tall viewport | `max-height` cap inside a mobile `@media`     |
| Both           | —                                                    | `min-height: 100svh` plus the cap             |

## Anti-flicker snippets

A/B tools often hide the page (`body { opacity: 0 }`, `html.async-hide { opacity: 0 }`) until a script
runs. This delays LCP, and the invisible content is still clickable. Remove it. If content really must
wait for a script, block rendering instead:

```html
<script blocking="render" jay-script="allow">
  /* small, inline */
</script>
```

Inline, or an external URL; local `src` files are not allowed (see `designer/script-tags.md`).

The rule cannot see: classes toggled at runtime (`.async-hide` without `html`/`body` in the selector),
nested CSS, inline `style` on `<html>`, and `<style>` inside `<body>`.

## View transitions

Every page that opts in with `@view-transition { navigation: auto; }` needs its own expect link, pointing at
an above-the-fold element:

```html
<link rel="expect" href="#main-content" blocking="render" />
```

A shared stylesheet with `@view-transition` makes every page need the link. Gate the transition for
reduced motion too (see `reduced-motion.md`).

## Suppression keys

Under `design-system:` in `<script type="application/jay-validations">`:
`allow-media-no-dimensions`, `allow-hidden-root`, `allow-view-transition-no-expect`.
