# Fast Query-Param Pages — Precompute the Default in the Slow Phase

Search pages, listing pages, filter pages and shareable-link pages read query parameters
(`props.query`) to decide what to render. The common mistake is to do **all** the work in the
fast phase and query on **every** request — including the request that has **no** query
parameters, whose result is a fixed default that never changes per request.

This guide shows how to make those pages load fast: precompute the no-params default in the
**slow** phase (free at build time), carry it forward, and short-circuit to it in the fast
phase when there are no query parameters — querying only when parameters are actually present.

## Why the slow phase is the right place for the default

The three phases differ in cost and in what they can see:

| Phase | Runs | Cost per request | `props.query` |
| ----- | ---- | ---------------- | ------------- |
| `withSlowlyRender` | build time (SSG), replayed from disk | **free** | **not available** (compile error) |
| `withFastRender` | request time (SSR) | one server round trip | available: `Record<string, string>` |
| `withInteractive` | client, after hydration | client CPU | reads `location.search` |

`props.query` is **fast-phase only** — the slow phase cannot see query parameters at all. That
is not a limitation; it is the signal. Whatever a page renders when there are **no** query
parameters is, by definition, independent of the URL — so the slow phase can compute it once,
at build, for free. Paying a per-request query for it is wasted work on the most common path.

## The carry-forward mechanism

Every phase returns `phaseOutput(viewState, carryForward)`. The `carryForward` value is handed
to the **next** phase as `props.carryForward`:

```typescript
.withSlowlyRender(async () => {
  const data = await loadDefault();          // free at build time
  return phaseOutput(data, { data });        // viewState + carry-forward payload
})
.withFastRender(async (props) => {
  // props.carryForward.data is the slow phase's { data }
})
```

See [render-results.md](render-results.md) for `phaseOutput` and the carry-forward contract,
and [page-components.md](page-components.md) for `props.carryForward` across phases.

## The pattern

```
slow  → compute the no-params default once → carryForward it
fast  → no relevant query params? forward the carried default (instant, no query)
       → params present? query with them and return the fresh result
```

### ✅ Do — default in slow, forwarded in fast, query only on params

```typescript
import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent<ListingContract>()
  .withServices(CATALOG)
  .withSlowlyRender(async (props, catalog) => {
    const results = await catalog.all();       // the "show everything" default — free at build
    return phaseOutput(results, { results });   // carry it forward
  })
  .withFastRender(async (props, catalog) => {
    const q = props.query.q ?? '';
    if (!q) {
      // No search term: forward the precomputed default. No query, instant.
      return phaseOutput(props.carryForward.results, {});
    }
    // A search term is present: this is the only path that must query per request.
    const results = await catalog.search(q);
    return phaseOutput(results, {});
  });
```

### ❌ Don't — query unconditionally, slow phase doing nothing

```typescript
export const page = makeJayStackComponent<ListingContract>()
  .withServices(CATALOG)
  // No slow phase: the build-time opportunity is wasted.
  .withFastRender(async (props, catalog) => {
    const q = props.query.q ?? '';
    const results = await catalog.search(q);   // queries even when q === '' — the default, every request
    return phaseOutput(results, {});
  });
```

### ✅ Do — short-circuit on a token / id param

The same shape works for shareable links, where the default (no token) is a fixed "nothing to
show" view and only a present token needs a lookup:

```typescript
  .withSlowlyRender(async () => phaseOutput(EMPTY_VIEW, { default: EMPTY_VIEW }))
  .withFastRender(async (props, store) => {
    const token = props.query.share;
    if (!token) return phaseOutput(props.carryForward.default, {});   // cacheable, instant
    const doc = await store.getByToken(token);                        // query only when asked
    return phaseOutput(
      render(doc),
      {},
      { responseHeaders: { 'Cache-Control': 'no-store' } },           // per-request → not cacheable
    );
  });
```

Note that `Cache-Control: no-store` belongs only on the **param** branch, where the response is
genuinely per-request. The no-params default is identical for everyone and can be cached.

## When a query param only changes markup, not data

Sometimes a param (e.g. `?view=list` vs `?view=grid`) selects a *presentation*, not a different
dataset. Keep deriving that cheap, param-dependent bit in the fast phase, but still forward the
**data** from the slow phase — do not re-query it:

```typescript
  .withSlowlyRender(async (props, catalog) => {
    const items = await catalog.all();
    return phaseOutput({ items, view: 'grid' }, { items });
  })
  .withFastRender(async (props) => {
    const view = props.query.view === 'list' ? 'list' : 'grid';   // cheap, no query
    return phaseOutput({ items: props.carryForward.items, view }, {});
  });
```

## Trade-off: freshness

Slow-phase output is built once and replayed from disk; it does **not** re-run per request. If
the default is a true constant (an empty state, a fixed invite, a static form), there is no
downside. If the default is derived from data that changes between builds, moving it to the slow
phase pins it until the next build. Choose per page:

- **Immutable default** → move it to slow outright.
- **Default changes occasionally** → move to slow and rebuild on publish, **or** render a slow
  default for instant first paint and refresh from the server in the interactive phase.
- **Default is highly volatile and must be live** → keep it in the fast phase; the pattern does
  not apply.

## Checklist

- [ ] Does the fast phase query even when the relevant query param is empty/absent? → move the
      default to `withSlowlyRender`.
- [ ] Is the default independent of `props.query`? → it belongs in the slow phase (which cannot
      see `props.query` anyway).
- [ ] Is `Cache-Control: no-store` on the no-params default? → it should be on the param branch
      only.
- [ ] Does a param that only changes presentation trigger a re-query? → derive the markup in
      fast, forward the data from slow.
