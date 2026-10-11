# Error Pages

Error pages render your site's chrome when a request fails — a 404 for an unknown URL, a 5xx for a
server error — instead of a bare plain-text message. You author them exactly like any other page,
in a reserved top-level folder named for the HTTP status they cover.

## Where they live

Create error pages in `src/pages/` in a folder whose name is an HTTP **status token**:

```
src/pages/
  404/page.jay-html      # exact: 404 Not Found
  5xx/page.jay-html      # family: any 500–599
  502/page.jay-html      # exact: 502 Bad Gateway (optional, overrides 5xx for 502)
```

A status token is either:

- **Exact** — three digits, `100`–`599` (e.g. `404`, `502`).
- **Family** — a leading digit then `xx` (e.g. `4xx`, `5xx`), covering that whole class.

v1 renders only **4xx** and **5xx**. Reserve others with a folder, but they are not served yet.

These folders are **not navigable routes** — visiting `/404` or `/5xx` directly returns a normal 404,
and they never appear in the sitemap or internal-link checks. The error page is selected by the
response **status**, not by its URL.

## Resolution: exact → family → plain text

For a given status, Jay picks the most specific page:

1. **Exact** match — `pages/502/` for a 502.
2. **Family** fallback — `pages/5xx/` for a 502 when there's no `pages/502/`.
3. **Plain text** — if neither exists, a built-in plain-text response.

So a single `pages/5xx/` covers every server error, and you add `pages/502/` only where you want
bespoke copy. Minimum recommended set: **`404` and `5xx`** (the `validate` command warns if either is
missing — see below).

## Authoring an error page

Import the built-in `error` headless contract and bind its fields. No plugin install is needed —
`jay-stack`/`error` is built in:

```html
<html>
  <head>
    <script type="application/jay-headless" plugin="jay-stack" contract="error" key="error"></script>
    <script type="application/jay-data">
data:
    </script>
    <title>{error.title}</title>
    <meta name="description" content="{error.message}" />
  </head>
  <body>
    <main class="error-page">
      <h1>{error.status} — {error.title}</h1>
      <p>{error.message}</p>
      <ul forEach="error.details" trackBy="key">
        <li>{key}: {value}</li>
      </ul>
      <a href="/">Go home</a>
    </main>
  </body>
</html>
```

### Available bindings

| Binding            | Type                       | Meaning                                                    |
| ------------------ | -------------------------- | --------------------------------------------------------- |
| `{error.status}`   | number                     | The HTTP status (e.g. `404`, `503`).                      |
| `{error.title}`    | string                     | Short headline — supplied by logic or a sensible default. |
| `{error.message}`  | string                     | Longer explanation — supplied or defaulted.               |
| `{error.code}`     | string                     | App-specific error code; `''` when none.                  |
| `error.details`    | `{ key, value }[]`         | Key/value pairs for `forEach` — empty when none.          |

`error.title` and `error.message` always have a value: when the developer's code supplies none, Jay
fills a per-status default (e.g. `404 → "Page Not Found"`). You can rely on them being present.

## No fast/slow data phase

An error page is a **pass-through** of the injected `error` data — it runs **no** author fast or slow
phase and cannot fetch its own request-time data (rendering an error page must never itself fail). Its
static chrome (layout, nav, copy) is still pre-rendered at build. Keep the page to static markup plus
the `error.*` bindings.

## Validation

`jay-stack validate` warns when the minimum pages (`404` and `5xx`) are absent — a `4xx` family page
counts as covering `404`. If your site intentionally accepts the plain-text fallback, suppress the
nudge in `.jay`:

```yaml
validations:
    allow-no-error-pages: true
```

## See also

- Developer side — returning enriched errors (`notFound`, `serverError5xx`, title/details):
  `../developer/error-pages-guide.md`.
- Template syntax (`forEach`, bindings, expression limits): `jay-html-template-syntax.md`.
