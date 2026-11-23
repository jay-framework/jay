# Dark mode patterns

A dark theme that only changes your own colours still leaves the browser's parts light: native inputs,
selects, scrollbars and the first paint. `color-scheme` tells the browser the page supports dark.

The `color-scheme` validator (design-system-validator) runs on pages that have a dark theme: a
`prefers-color-scheme: dark` media rule, a toggle selector (`.dark`, `.dark-mode`, `.theme-dark`,
`[data-theme="dark"]`, `[data-color-scheme="dark"]`, `[data-mode="dark"]`), a `light-dark()` value or a
`color-scheme` that includes `dark`. Light-only pages are never checked.

## 1. Baseline

```html
<head>
  <meta name="color-scheme" content="light dark" />
  <style>
    :root {
      color-scheme: light dark;
    }
  </style>
</head>
```

The meta is read before any CSS loads, so dark-mode users get no white flash. Keep the property too: it
also covers pages whose meta comes late or from a plugin.

## 2. Tokens with `light-dark()`

```css
:root {
  color-scheme: light dark;
  --bg: light-dark(#fff, #111);
  --text: light-dark(#111, #eee);
}
body {
  background: var(--bg);
  color: var(--text);
}
```

`light-dark()` needs a dark `color-scheme`; without one it always returns the light value.

## 3. Toggle themes

A toggle lets the user pick dark while the OS is light, so the meta is not enough. Set `color-scheme` on
the toggle selector itself:

```css
[data-theme='dark'] {
  color-scheme: dark;
}
[data-theme='light'] {
  color-scheme: light;
}
```

A token counts as a theme only at the root (`html.dark`, `:root[data-theme="dark"]`) or as the first part
of a selector (`.dark .card`, `[data-theme="dark"] input`). `.btn.dark` and `.btn:is(.dark)` are component
variants, not themes.

## 4. Form controls

Do not give inputs, selects or textareas a literal colour (`#fff`, `white`, `rgb(...)`) unless a dark rule
overrides it. Use a token, `light-dark()`, or the system colours `Field` / `FieldText`:

```css
input,
select,
textarea {
  background: Field;
  color: FieldText;
}
input[type='checkbox'],
input[type='radio'] {
  accent-color: var(--accent);
}
```

A dark override can come from `@media (prefers-color-scheme: dark) { input { ... } }` or from a toggle
rule (`[data-theme="dark"] input { ... }`). Buttons are not checked.

## 5. Toggle behaviour (developer)

- Offer three choices: **system**, light, dark. "System" removes the stored key and follows the OS.
- Save the choice in `localStorage`; listen to the `storage` event so other tabs follow.
- While in "system", listen to `matchMedia('(prefers-color-scheme: dark)')` changes.
- Set the attribute before first paint (a small inline `<script jay-script="allow">` in `<head>`), or the
  page flashes the wrong theme.

## 6. Blind spots

The validator cannot see external (CDN) stylesheets, theme names outside the list above (`.night`),
controls rendered inside `jay:` child components, a meta set by script, and base rules like
`html input { background: #fff }`. Check those by hand.

## 7. Rules and suppression

Suppress under `design-system:` in `<script type="application/jay-validations">`:

| Rule                               | Key                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `no-color-scheme-meta`             | `allow-no-color-scheme-meta`                                                      |
| `color-scheme-meta-light-only`     | `allow-color-scheme-meta-light-only`                                              |
| `dark-toggle-without-color-scheme` | `allow-dark-toggle-without-color-scheme`                                          |
| `light-dark-without-color-scheme`  | `allow-light-dark-without-color-scheme`                                           |
| `fixed-control-colors`             | `allow-fixed-control-colors` (or `/* design-system: allow */` on one declaration) |
