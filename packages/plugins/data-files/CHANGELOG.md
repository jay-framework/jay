# Changelog

## Unreleased

- `generate-schema` prints a warning for every field it infers as `html-string` (a value starting with `<`),
  naming the data file and field (DL#237). Declare the field `string` if it is text.
