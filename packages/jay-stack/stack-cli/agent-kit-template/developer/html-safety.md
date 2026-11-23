# HTML safety (XSS)

Jay escapes every plain binding. The XSS risks are the places where you opt out of escaping.

## `html-string` is trusted markup only

A contract tag with `dataType: html-string` is rendered as **raw HTML**: SSR writes it unescaped, the slow
phase inlines it unescaped, and the client sets `innerHTML`. **Jay does not sanitize html-string anywhere:
not on the server, not in the slow phase, not on the client.**

- Use `string` for anything a user, a CMS editor or a third-party API wrote. Formatting showing up as text is
  the safe failure; markup running in the page is not.
- Use `html-string` only for markup you control, or markup you **sanitize at the source, on the server**, in
  the slow or fast render function, before it enters ViewState. That one place covers SSR, the slow
  pre-render and client updates. A client-only sanitizer is useless: the server already sent the markup.
- `RenderElementOptions.sanitizeHtml` exists in the runtime but **is not wired**: no Jay code path passes it.
  It is not a defence; do not rely on it.
- Jay ships no sanitizer. Use a maintained one (for example `sanitize-html` or DOMPurify on the server)
  with an allowlist: drop `<script>`, `on*` attributes, `style`, and `javascript:` URLs.

```ts
// ✅ sanitize at the source, in the server-side render function
.withSlowlyRender(async (props, articles) => {
    const article = await articles.get(props.slug);
    return phaseOutput({ title: article.title, body: sanitize(article.bodyHtml) }, {});
})
```

`jay-stack validate` warns `HTML-STRING-TRUST` on each jay-html element that binds an html-string tag. Once
you have checked the source is trusted or sanitized, acknowledge it in the page:

```html
<script type="application/jay-validations">
  jay-stack:
    allow-html-string:
      - article.body # sanitized by the article service (sanitize-html allowlist)
</script>
```

Entries are dotted contract tag paths: `<key>.<tag path>` (e.g. `article.sections.body`, one entry covers
every repeated item; linked sub-contracts go through the linking tag, e.g. `article.author.bio`), or the bare
tag path without the key (`body`). Page-own contract tags have no key. To acknowledge every tag of one
headless import, add `jay-validations="HTML-STRING-TRUST"` on its `application/jay-headless` script.

`jay-stack run data-files/generate-schema` infers `html-string` for any value starting with `<` and prints a
warning naming the field. Change it to `string` if it is text.

## No raw HTML sinks in component code

Do not write `el.innerHTML = …`, `el.outerHTML = …`, `insertAdjacentHTML(…)` or `document.write(…)` in
`page.ts` or component `.ts` files. Render through the jay-html: a text binding for text, an html-string tag
(sanitized at the source) for markup. `validate` warns `RAW-HTML-SINK`. For a real exception (constant
markup, already-sanitized output), suppress the one line with a reason:

```ts
// jay-validations: RAW-HTML-SINK markup is a build-time constant, no user data
container.innerHTML = ICON_SVG;
```

The comment goes on the same line or the line above, and the **reason is required**: without one the comment
is ignored. The check is a plain line scan, so it can also fire inside a comment or string; suppress those
the same way.

## No inline event handlers

`onclick="…"`, `onload="…"`, `onerror="…"` and every other `on*` attribute in jay-html are errors
(`INLINE-EVENT-HANDLER`), including on inline SVG. Add a `ref` and handle the event in the component
(see [component-refs.md](component-refs.md)). Suppress a specific case per page with
`jay-stack: { allow-inline-handler: ["svg@onload"] }`.

## URLs that run script

A static `href`, `src`, `action`, `formaction` or `xlink:href` starting with `javascript:`, `vbscript:` or
`data:text/html` is an error (`JAVASCRIPT-URL`). Use a `<button>` with a ref instead of
`href="javascript:…"`. Suppress one exact value per page with
`jay-stack: { allow-javascript-url: ["javascript:void(0)"] }`.

Bound URLs (`href="{url}"`) are not checked. When a URL comes from users or a CMS, allow only `http:`,
`https:`, `mailto:` and relative URLs, in the render function:

```ts
const safeUrl = (url: string) => (/^(https?:|mailto:|\/|#)/i.test(url.trim()) ? url : '#');
```

## Suppression keys

| Rule                   | Severity | Suppress                                                                        |
| ---------------------- | -------- | ------------------------------------------------------------------------------- |
| `HTML-STRING-TRUST`    | warning  | `jay-stack: allow-html-string: [path]`, or `jay-validations` on the import       |
| `RAW-HTML-SINK`        | warning  | `// jay-validations: RAW-HTML-SINK <reason>` (same or preceding line)           |
| `INLINE-EVENT-HANDLER` | error    | `jay-stack: allow-inline-handler: ["<element>@<attr>"]`                         |
| `JAVASCRIPT-URL`       | error    | `jay-stack: allow-javascript-url: ["<exact value>"]`                            |

The page-script keys follow the `jay-stack: { allow-… }` naming used by the other core suppressions (see
`designer/validation-guide.md`). Multi-line YAML in the `application/jay-validations` script, including `#`
reason comments, survives `jay-stack sync` (Design Log #208).

## Optional hardening (deployment)

A Content-Security-Policy without `'unsafe-inline'` scripts and Trusted Types (Chromium) block most of what
slips through. The browser `Element.setHTML()` sanitizer is not yet available everywhere. These are
deployment choices; Jay does not configure them.
