# `$parent` Binding (DL#193 Capability A)

This example demonstrates **parent-scope binding across a `forEach`**: an item template that
reaches out of its own item scope to a field on the enclosing component's ViewState with the
`$parent` sigil.

```html
<li class="card" forEach="cards" trackBy="id" data-group="{$parent.groupLabel}">
  <span class="card-name">{name}</span>
  <span class="card-group">{$parent.groupLabel}</span>
</li>
```

`{name}` reads the item scope; `{$parent.groupLabel}` climbs one scope up to the board's
`groupLabel`. The compiler emits the leaf closures with the parent supplied positionally
(`da((vs1, _p1) => _p1.groupLabel)`) and flags the `forEach` with `dependsOnParent` so a
parent-only change re-runs the item leaves even when the `cards` array reference is unchanged.

## What to try

- **Relabel group** — changes only `groupLabel`. The `cards` array reference is untouched
  (keyed reuse), yet every `{$parent.groupLabel}` leaf updates. This is the DL#193 case #1
  regression the design exists to prevent.
- **Shuffle cards** — reorders the keyed items; the `$parent` leaves stay correct.

## Running

```shell
yarn build:watch
```

then open

- `http://localhost:5173/` for the regular (trusted) version.
- `http://localhost:5173/secure` for the secure version, where the board component runs in a
  sandbox worker.
- `http://localhost:5173/__inspect/` to view the compiler transformations.

## Regular vs. secure

The regular build (`lib/` + `index.html`) is the Phase 1 deliverable and renders `$parent`
bindings via the client target.

The secure build (`lib-secure/` + `secure.html`) is the **secure-mode acceptance gate for
Phase 4**: secure/bridge parent plumbing is implemented in Phase 4 of DL#193, so the secure
build is the forcing function that Phase 4 must make render identically to the regular build.
