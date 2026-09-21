# Ref Forwarding Example (DL#194 — Tier 2 inlining)

Demonstrates **pure (Tier 2) composite inner-ref forwarding**: a structural composite
(`card` — `.jay-html` + `.jay-contract`, no `.ts`) exposes its named inner child-component ref
(`<jay:Counter ref="cta">`) to the usage site.

- **Single** — `refs.signupCard.cta.onChange(...)` reaches the one composite's counter.
- **Collection** — the composite repeated under a usage-site `forEach` makes `cta` a collection:
  `refs.cards.cards.cta.onChange(...)` fans to every card; `refs.cards.cards.cta.find(pred)`
  reaches exactly one.

The Tier 2 card is **inlined** — there is no component boundary. Its inner refs are parent-owned
(external scope), so each forwarded event carries the **usage-site** viewState: the page
(`pageTitle`) for the single card, the `forEach` item (`label`) for the collection — **not** the
card's own `heading`.

## Run

```bash
yarn build          # regular (index.html) + secure (secure.html)
yarn build:watch    # dev server
```

- `lib/` + `index.html` — regular/trusted build.
- `lib-secure/` + `secure.html` — sandboxed build (the composite import carries `sandbox="true"`);
  the secure-mode acceptance gate. The forwarded `cta` reaches the sandboxed counter identically to
  the regular build.

Click a counter's `+`/`-` and watch the event log; the forwarded handler reports which card fired
by its usage-site viewState (`pageTitle` for the single card, `label` for each list card).
