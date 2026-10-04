# Script Tags in Jay-HTML

## Default Rule

Use `page.ts` with `makeJayStackComponent` for all page behavior — animations, interactions, data fetching, DOM manipulation. Do not write inline `<script>` tags for page logic.

## When Scripts Are Needed

Some third-party tools provide script snippets that must be included as-is:

- **Analytics**: Google Analytics, Google Tag Manager, Meta Pixel
- **Tag managers**: GTM containers, consent management platforms
- **Chat widgets**: Intercom, Drift, Zendesk
- **A/B testing**: Optimizely, VWO

These scripts cannot be rewritten as `page.ts` components — they are third-party code meant to run as provided.

## How to Include Scripts

Add `jay-script="allow"` to mark a script for inclusion:

```html
<!-- External script -->
<script src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX" async jay-script="allow"></script>

<!-- Inline bootstrap snippet (e.g., GTM configuration) -->
<script jay-script="allow">
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  gtag('js', new Date());
  gtag('config', 'G-XXXXX');
</script>
```

Without `jay-script="allow"`:

- Inline scripts produce an **error**
- External scripts produce a **warning**

## What Is Not Supported

**Local script imports** are never allowed, even with `jay-script="allow"`:

```html
<!-- Error: always rejected -->
<script src="./my-script.js"></script>
<script src="../lib/utils.js" jay-script="allow"></script>
```

Move local script logic into `page.ts`.

## Placement and Performance

Scripts can be placed in `<head>` or `<body>`. Choose based on loading priority:

| Placement                        | When to use                                             |
| -------------------------------- | ------------------------------------------------------- |
| `<head>` with `async`            | Script should load early without blocking (analytics)   |
| `<head>` with `defer`            | Script needs the DOM but should start downloading early |
| End of `<body>`                  | Non-critical scripts that should not delay page render  |
| `<head>` without `async`/`defer` | Avoid — blocks page rendering                           |

```html
<head>
  <!-- Good: async loading, doesn't block render -->
  <script
    src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX"
    async
    jay-script="allow"
  ></script>
</head>
<body>
  <main>...</main>
  <!-- Good: loads after page content -->
  <script src="https://cdn.example.com/chat-widget.js" defer jay-script="allow"></script>
</body>
```

## Per-Route Consideration

Not every page needs every script. Consider whether a third-party script is needed on all pages or only specific routes. Place scripts only on the pages that need them to avoid unnecessary loading.
