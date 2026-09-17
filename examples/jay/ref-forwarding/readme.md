# Ref Forwarding Example (DL#193 Phase 3)

Demonstrates **pure (Tier 2) composite inner-ref forwarding**: a structural composite
(`card` — `.jay-html` + `.jay-contract`, no `.ts`) exposes its named inner child-component ref
(`<jay:Counter ref="cta">`) to the usage site.

- **Single** — `refs.signupCard.cta.onChange(...)` reaches the one composite's counter.
- **Collection** — the composite repeated under a usage-site `forEach` makes `cta` a collection:
  `refs.cards.cards.cta.onChange(...)` fans to every card; `refs.cards.cards.cta.find(pred)`
  reaches exactly one.

No event re-basing (DL#193 §B): each forwarded event carries the composite's own (Card) viewState
(`heading`), not the page scope.

## Run

```bash
yarn build          # regular (index.html) + secure (secure.html)
yarn build:watch    # dev server
```

- `lib/` + `index.html` — regular/trusted build.
- `lib-secure/` + `secure.html` — sandboxed build (the composite import carries `sandbox="true"`);
  the secure-mode acceptance gate for Phase 3. The forwarded `cta` reaches the sandboxed counter
  identically to the regular build.

Click a counter's `+`/`-` and watch the event log; the forwarded handler reports which card
(by `heading`) fired.
