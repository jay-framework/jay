# Override + Ref Forwarding

Injecting a component into a generic composite via `<override>` — and forwarding that injected
component's ref to the usage site. This example composes **three** already-shipped Jay mechanisms with
**zero framework code**:

- **DL#181 — Headfull component override.** `<override ref="slot">…</override>` splices content into a
  target component at compile time, anchored on a `ref`.
- **DL#193 §C — Override-introduced content.** The spliced content becomes part of the target
  component's body.
- **DL#193 Phase 3 — Pure-composite ref forwarding.** A structural (Tier 2) composite's named inner
  child-component refs are forwarded to the usage site, typed in the composite's own scope.

Because overrides are pure compile-time splicing, by the time ref-forwarding runs the injected
`<jay:Counter ref="cta">` is indistinguishable from a hardcoded inner ref — so forwarding "just works."

## The pieces

- **`lib/card/`** — a **generic** structural card (`card.jay-html` + `card.jay-contract`, no `.ts`). It
  knows nothing about `Counter`. Its `<div ref="slot">` is an **override-only** anchor: a `ref` present
  in the jay-html but not in the contract, so it never appears on the card's own `Refs` — it exists
  purely as an injection target.
- **`lib/counter.ts` / `lib/counter.jay-html`** — a plain headfull `Counter` that emits `onChange`.
- **`lib/app.jay-html`** — the page. It imports `Counter` (the card does not) and injects it into the
  card's slot:

  ```html
  <jay:card heading="Sign up" ref="signupCard">
    <override ref="slot">
      <jay:Counter ref="cta" initialValue="0" />
    </override>
  </jay:card>
  ```

- **`lib/index.ts`** — reads the forwarded ref: `refs.signupCard.cta.onChange(...)` (single) and
  `refs.cards.cards.cta.onChange(...)` / `.find(...)` (collection, when the card is repeated under a
  usage-site `forEach`).

## Regular vs secure

Two build targets exercise the same wiring:

- **Regular** (`index.html` → `lib/`).
- **Secure** (`secure.html` → `lib-secure/`, `sandbox="true"`). The `Counter` is injected via
  `<override>` into a **sandboxed** card and runs sandboxed too, yet the forwarded `cta` reaches it
  identically.

## Run

```bash
yarn build      # jay-cli definitions + vite build (both targets)
```

Then serve `dist/` (e.g. `npx vite preview`) and open `index.html` / `secure.html`. Click the injected
counters; the log shows `[single] "…" counter → N`, `[list] …`, and `[find:Bravo only] …`.
