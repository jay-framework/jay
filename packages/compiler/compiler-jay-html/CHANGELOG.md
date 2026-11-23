# Changelog

## Unreleased

- **Security fix (DL#237):** slow-phase rendering now escapes resolved values. A slow text binding whose
  contract type is not `html-string` is HTML-escaped (`&`, `<`, `>`), so markup in a plain `string` no longer
  becomes live HTML in the pre-rendered page. Slow attribute values escape `&` and `"` once, so a literal
  `&amp;` next to a slow binding is kept. `html-string` slow text is still inlined raw (trusted markup).
  Pages that relied on raw markup in a `string` slow value now show it as text: declare it `html-string`
  and sanitize it at the source.
- Slow-phase attribute resolution no longer drops backslashes, in the resolved value or in the other
  attributes of the same element (`pattern="\d+"` now stays `\d+` instead of becoming `d+`).
