# Changelog

## Unreleased

- **html-safety validate rules (DL#237).** `jay-stack validate` reports:
  - `HTML-STRING-TRUST` (warning) — a jay-html text binding resolves to an `html-string` contract tag
    (rendered as raw HTML; Jay sanitizes it nowhere). Suppress per page with
    `jay-stack: { allow-html-string: ["<key>.<tag path>"] }` or `jay-validations="HTML-STRING-TRUST"` on the
    headless import.
  - `RAW-HTML-SINK` (warning) — `innerHTML =`, `outerHTML =`, `insertAdjacentHTML(`, `document.write(` in the
    component `.ts`. Suppress one line with `// jay-validations: RAW-HTML-SINK <reason>` (reason required).
  - `INLINE-EVENT-HANDLER` (error) — `on*` attributes in jay-html. Suppress with
    `jay-stack: { allow-inline-handler: ["<element>@<attr>"] }`.
  - `JAVASCRIPT-URL` (error) — static `href`/`src`/`action`/`formaction`/`xlink:href` with a `javascript:`,
    `vbscript:` or `data:text/html` URL. Suppress with `jay-stack: { allow-javascript-url: ["<value>"] }`.
