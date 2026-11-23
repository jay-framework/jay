# Forms and Autofill in Jay-HTML

Labels, hints, error messages, validation styling and autocomplete, and how to fix each `[a11y/…]` form finding.

Every finding starts with `[a11y/<rule-id>]`. To keep a deliberate pattern on one page, suppress that rule only:

```html
<script type="application/jay-validations">
  a11y:
    allow-hint-below-field: true
</script>
```

## 1. Label every field — a placeholder is not a label (`placeholder-as-label`)

A placeholder disappears as soon as the user types, has low contrast and is not a reliable accessible name.

```html
<!-- ❌ -->
<input type="email" placeholder="Email" />
<!-- ✅ -->
<label for="email">Email</label>
<input id="email" type="email" autocomplete="email" />
```

## 2. Hints go above the field, errors may go below (`placeholder-format-hint`, `hint-below-field`)

Format hints (`MM/YY`), examples (`e.g. …`) and password rules must stay visible while typing, so put them in their own element **above** the field and link it with `aria-describedby`. Below the field, the mobile keyboard and autofill popovers cover them.

```html
<label for="exp">Expiry date</label>
<p id="exp-hint">MM/YY</p>
<input id="exp" autocomplete="cc-exp" inputmode="numeric" aria-describedby="exp-hint" />
```

Error messages may sit below the field: they appear after the user has typed. The `hint-below-field` rule treats a target as an error (and skips it) when it is conditional (`if=` / `when-*`), has a text binding, has `error`/`invalid` in its class or id, has `role="alert"`/`role="status"`/`aria-live`, or is an `aria-errormessage` target. It uses DOM order; if CSS moves the hint visually, suppress the rule.

## 3. Error messages are linked to their field (`describedby-missing-id`, `error-not-associated`)

Give the error a static id, list it in the field's `aria-describedby`, and bind `aria-invalid` to the same state:

```html
<label for="zip">Postal code</label>
<input
  id="zip"
  autocomplete="postal-code"
  value="{zip}"
  aria-invalid="{zipInvalid}"
  aria-describedby="zip-err"
/>
<span id="zip-err" if="zipError">{zipError}</span>
```

Every `aria-describedby` token must be a static id in the same file. A bound id (`id="{hintId}"`) does not count.

## 4. Style `:user-invalid`, not `:invalid` (`css-invalid-early`)

`:invalid` matches required fields on page load, so untouched fields turn red. `:user-invalid` matches only after the user has changed the field or tried to submit.

```css
/* ❌ */
input:invalid {
  border-color: red;
}
/* ✅ */
input:user-invalid {
  border-color: red;
}
```

Other accepted gates: a state class (`.submitted`, `.touched`, `.dirty`, `.was-validated`, `.user-interacted`), a state data attribute (`[data-touched]`, `[data-submitted]`, `[data-dirty]`, `[data-state]`, `[data-user-*]`) or `[aria-invalid]` on the field or an ancestor; `form:invalid button` (dims the submit button) is fine. `:focus:invalid` is **not** a gate — focus comes before typing.

`:not(:placeholder-shown):invalid` works only when the field has a placeholder; without one it is red on load. Use `placeholder=" "` if you rely on it.

Do not rebuild `:user-invalid` with `blur` listeners in TS: they flag required fields the moment the user tabs past them. When you set `aria-invalid` from TS, set it at the same moment `:user-invalid` would match (after a change, or on submit).

## 5. `novalidate` + custom errors

Use `novalidate` only when you render your own messages. Then: validate on submit, show all errors at once, move focus to the first invalid field (`refs.field.exec$((el) => el.focus())`), and keep each message linked as in §3.

## 6. Autocomplete tokens (`autocomplete-invalid`, `autocomplete-missing`)

| Field                                 | Token                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Full name / given / family            | `name` / `given-name` / `family-name`                                                                       |
| Email                                 | `email`                                                                                                     |
| Phone                                 | `tel`                                                                                                       |
| Company                               | `organization`                                                                                              |
| Street / city / postal code / country | `street-address` / `address-level2` / `postal-code` / `country-name` (input) or `country` (select of codes) |
| Card number / expiry / CVC            | `cc-number` / `cc-exp` / `cc-csc`                                                                           |

Prefix with `shipping` or `billing`, and `section-<name>` to separate two addresses on one page: `autocomplete="shipping postal-code"`. `home`/`work`/`mobile` go only before contact tokens (`work email`, `mobile tel`). Common typos: `phone` → `tel`, `zip` → `postal-code`, `firstname` → `given-name`, `nope`/`false` → `off`. On `<form>` only `on`/`off` are valid. `autocomplete="off"` is fine when autofill is truly unwanted (it satisfies `autocomplete-missing`).

## 7. Sign-in and sign-up (`password-autocomplete`, `username-autocomplete`)

```html
<form>
  <label for="email">Email</label>
  <input id="email" type="email" autocomplete="username" />
  <label for="pw">Password</label>
  <input id="pw" type="password" autocomplete="current-password" />
</form>
```

- Sign-in password: `current-password`. Choosing a password: `new-password` (the browser offers a strong password). SMS/OTP code: `one-time-code`.
- The sign-in name field gets `username` — even when it is `type="email"` — so password managers save the right pair. With passkeys: `autocomplete="username webauthn"`.
- `autocomplete="off"` on a password field is ignored by password managers and blocks users; it is still flagged.
- Put the password rules **above** the new-password field (§2).

The rules check only that the tokens are present; whether `current-password` vs `new-password` is right for the page is up to you.

## 8. Input types and `inputmode`

Use `type="email"` / `type="tel"` for the right keyboard. For codes and card numbers use `inputmode="numeric"`, not `type="number"` (which adds spinners and drops leading zeros).

## 9. Autofill styling: colour plus a non-colour cue (`css-autofill-color-only`)

Colour alone does not tell everyone a field was autofilled (WCAG 1.4.1). Add a cue that does not shift layout:

```css
input:autofill {
  border-color: #1a56db;
  box-shadow: inset 0 0 0 2px #1a56db;
}
```

Declarations for the same selector are merged across the page CSS before the check. Known gap: the `box-shadow: 0 0 0 1000px white inset` hack that hides the autofill background passes the rule, but it hides the autofill state instead of signalling it.

## 10. Where findings point

CSS findings name the source: a linked file (`styles/form.css`), an `@import`ed file, `<head> <style>`, or `page CSS`.
