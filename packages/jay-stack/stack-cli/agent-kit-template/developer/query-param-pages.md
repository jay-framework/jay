# Fast Query-Param Pages — Precompute the Default in the Slow Phase

Search pages, listing pages, filter pages and shareable-link pages read query parameters
(`props.query`) to decide what to render. The common mistake is to do **all** the work in the
fast phase and query on **every** request — including the request that has **no** query
parameters, whose result is a fixed default that never changes per request.

A second mistake is to treat **any** non-empty `props.query` as a reason to re-query the CMS.
Many params only change **markup** (map vs list, opening band, sheet height) while the **data**
is unchanged. Re-fetching on `?view=list` wastes work and breaks cacheability.

This guide shows how to make those pages load fast: precompute query-independent data in the
**slow** phase (free at build time), carry it forward, and in the fast phase either forward
that data into a pure `buildView` or query only when a **specific** param needs live data.

## First paint vs deferrable data (default policy)

Two axes apply on every page — do not confuse them:

| Axis     | Question                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------- |
| **When** | Build-time carry vs per-request fetch (slow / fast / interactive)                                 |
| **What** | **Critical path for first paint** vs data that appears only after interaction or a hidden surface |

**Default (best performance):** if the payload is **small** and everything on the default view
is needed for first paint, **fetch it in the slow phase and carry it forward**. No extra client
or per-request reads on the common path.

**Defer only when size forces it** (see Wix thresholds below) or when the data is genuinely
not on the critical path (e.g. a tab the user has not opened yet). Lazy loading and smaller
carries are **optimizations under budget pressure**, not the starting point.

Teach agents to classify each field: _visible on load_ → slow/fast carry; _hover-only, other tab,
or N×M URL explosion_ → candidate for deferral once the soft size warning fires.

## Why the slow phase is the right place for the default

The three phases differ in cost and in what they can see:

| Phase              | Runs                                 | Cost per request      | `props.query`                       |
| ------------------ | ------------------------------------ | --------------------- | ----------------------------------- |
| `withSlowlyRender` | build time (SSG), replayed from disk | **free**              | **not available** (compile error)   |
| `withFastRender`   | request time (SSR)                   | one server round trip | available: `Record<string, string>` |
| `withInteractive`  | client, after hydration              | client CPU            | reads `location.search`             |

`props.query` is **fast-phase only** — the slow phase cannot see query parameters at all. That
is not a limitation; it is the signal. Whatever a page renders when there are **no** query
parameters is, by definition, independent of the URL — so the slow phase can compute it once,
at build, for free. Paying a per-request query for it is wasted work on the most common path.

## TypeScript: use contract phase types

Generated definitions on `page.jay-contract` export phase-specific ViewState types. **Use them**
in `page.ts` — they catch mistakes early (wrong carry shape, missing fields in `buildView`,
accidentally putting CMS payloads in slow `viewState` when the contract says slow is empty).

Typical names (see [page-components.md](page-components.md)):

- `PageSlowViewState` — tags with `phase: slow` only (often `{}` when every tag is `fast`)
- `PageFastViewState` — tags resolved at request time
- `PageViewState` — full merged shape for the template

Import from the contract module (not a hand-rolled duplicate):

```typescript
import { PageFastViewState, PageSlowViewState, type PageContract } from './page.jay-contract.js';
```

Type `buildView` as returning `PageFastViewState`. Type the fast phase’s second argument as your
**carry-forward payload** (often `PageData` from `loadData()`, not the rendered view — see
below). Use `RenderPipeline.for<PageSlowViewState, PageData>()` so `toPhaseOutput` is checked
against those generics.

When every contract tag is `phase: fast`, `PageSlowViewState` is `{}`. That is intentional: the
slow phase should not duplicate the full fast view in `viewState` **and** in `carryForward`.

## The carry-forward mechanism

Every phase returns `phaseOutput(viewState, carryForward)` (or the equivalent from
`RenderPipeline.toPhaseOutput`). The `carryForward` value is handed to the **next** phase as a
**positional argument** — not a field on `props`. The fast render receives it as its **second
parameter**, before any services:
`withFastRender(async (props, carryForward, ...services) => …)`. (The interactive phase receives
it as its **fourth** parameter, after `props`, `refs` and the fast ViewState signals.)

The carry-forward argument is present only when a slow phase is declared; with no slow phase the
fast render is just `async (props, ...services)`. See [render-results.md](render-results.md) for
`phaseOutput` and the carry-forward contract, and [page-components.md](page-components.md) for the
positional carry-forward argument across phases.

### Carry raw data, render in fast — avoid duplicating the view in slow

On hybrid slow+fast pages, prefer:

- **Slow `viewState`:** `{}` when `PageSlowViewState` is empty (nothing to bake into slow HTML
  that fast will replace).
- **`carryForward`:** query-independent **source data** (`PageData` from `loadData()`), not a
  second copy of the full `buildView` output unless the default view is a true constant.

Fast phase always runs `buildView(carry, query)` so markup that depends on `props.query` stays
in one pure function for server and client.

```typescript
import {
  makeJayStackComponent,
  phaseOutput,
  RenderPipeline,
} from '@jay-framework/fullstack-component';
import { PageFastViewState, PageSlowViewState } from './page.jay-contract.js';

async function loadData(): Promise<PageData> {
  const [inventory, marks] = await Promise.all([getInventory({}), getMarks({})]);
  return { inventory, marks };
}

type PageData = Awaited<ReturnType<typeof loadData>>;

function buildView(
  { inventory, marks }: PageData,
  query: Record<string, string> | undefined,
): PageFastViewState {
  const view = viewFromQuery(query) ?? 'map';
  return { ...inventory, ...marksToViewState(marks), ...viewSwitchMarkup(view) };
}

export const page = makeJayStackComponent<PageContract>()
  .withProps()
  .withSlowlyRender(async () =>
    RenderPipeline.for<PageSlowViewState, PageData>()
      .try(loadData)
      .toPhaseOutput((data) => ({
        viewState: {},
        carryForward: data,
      })),
  )
  .withFastRender(async (props, carry: PageData) => {
    const query = Object.keys(props.query).length > 0 ? props.query : undefined;
    return phaseOutput(buildView(carry, query), {});
  });
```

**Tests:** assert `slow.rendered` is `{}`, data lives on `slow.carryForward`, fast with no CMS
mocks makes **zero** action calls, and `?view=list` still makes zero CMS calls while changing
only markup fields.

## The pattern

```
slow  → load query-independent data once → viewState {} (if contract says so), carryForward: PageData
fast  → buildView(carry, query) — no CMS unless a specific param needs live data
       → param branch that needs freshness → query + optional no-store
```

### ✅ Do — default data in slow, `buildView` in fast, query only on relevant params

```typescript
.withSlowlyRender(async (props, catalog) => {
  const results = await catalog.all();
  return phaseOutput({}, { results }); // empty slow VS when contract allows; carry the data
})
.withFastRender(async (props, carryForward: { results: Item[] }, catalog) => {
  const q = props.query.q?.trim() ?? '';
  if (!q) {
    return phaseOutput(buildListView(carryForward.results, props.query), {});
  }
  const results = await catalog.search(q);
  return phaseOutput(buildListView(results, props.query), {});
});
```

### ❌ Don't — query unconditionally, or on any query key

```typescript
// No slow phase: the build-time opportunity is wasted.
.withFastRender(async (props, catalog) => {
  const results = await catalog.search(props.query.q ?? ''); // every request, including ''
  return phaseOutput(results, {});
});

// Slow carry exists but fast ignores it whenever props.query is non-empty:
.withFastRender(async (props, carry: PageData) => {
  if (Object.keys(props.query).length > 0) {
    const data = await loadData(); // wrong for ?view=list — markup-only param
    return phaseOutput(buildView(data, props.query), {});
  }
  return phaseOutput(buildView(carry, undefined), {});
});
```

### ✅ Do — short-circuit on a token / id param (constant default in carry)

Shareable links: the no-token default is fixed; only a present token needs a lookup.

```typescript
const EMPTY_VIEW: PageFastViewState = buildEmptyInvite();

interface DefaultCarry {
  view: typeof EMPTY_VIEW;
}

.withSlowlyRender(async () =>
  RenderPipeline.for<PageSlowViewState, DefaultCarry>()
    .ok({ view: EMPTY_VIEW })
    .toPhaseOutput(() => ({
      viewState: {},
      carryForward: { view: EMPTY_VIEW },
    })),
)
.withFastRender(async (props, carry: DefaultCarry, store) => {
  const token = props.query.share;
  if (!token) return phaseOutput(carry.view, { stops: [] });
  const doc = await store.getByToken(token);
  return phaseOutput(
    buildViewFromDoc(doc),
    { stops: doc.stops },
    { responseHeaders: { 'Cache-Control': 'no-store' } },
  );
});
```

`Cache-Control: no-store` belongs only on the **param** branch. The no-token default is
cacheable.

### ✅ Do — hybrid freshness (slow default + live branch for specific params)

Some pages need **mostly** build-time data but a **live** read when certain query params appear
(e.g. reschedule flow, share token). Carry the slow snapshot; re-query only inside an explicit
`needsFresh…(props.query)` helper — not `Object.keys(props.query).length > 0`.

```typescript
function needsFreshRules(query: Record<string, string> | undefined): boolean {
  if (!query) return false;
  if (query.reschedule?.trim()) return true;
  return Boolean(query.experience?.trim());
}

.withFastRender(async (props, carry: { rules: VisitRules }) => {
  if (needsFreshRules(props.query)) {
    const rules = await getVisitRules({});
    return renderFromRules(rules, props, { 'Cache-Control': 'no-store' });
  }
  return renderFromRules(carry.rules, props);
});
```

Document which params are markup-only vs live in a comment next to the helper.

## When a query param only changes markup, not data

Params like `?view=list` vs map, opening brand/collection, or phone sheet height select
**presentation**. The inventory (or rules shell) is the same.

- Keep **data** on `carryForward` from slow (or from the last full `loadData` on live branches).
- In fast, only run `buildView(carry, query)` — derive `view` / `viewSwitchMarkup` / server-side
  opening state inside `buildView`.
- Do **not** call `loadData()` again because `props.query` is non-empty.
- URL **filters** that the interactive phase reads from `location.search` never belong in the fast
  phase; the server ships the full list and the client narrows it.

```typescript
.withFastRender(async (props, carry: PageData) => {
  const query =
    Object.keys(props.query).length > 0 ? props.query : undefined;
  return phaseOutput(buildView(carry, query), {}); // view=list changes markup only
});
```

## Pages with no query params at all

If the route never reads `props.query`, do **not** add a fast phase just for freshness. Put the
whole CMS read in `withSlowlyRender` and omit `withFastRender` (home, static listings, chronotype
wall, contact form idle state). Rely on platform rebuild / republish when content changes.

```typescript
.withSlowlyRender(async () => {
  const content = await getHomePageContent({});
  return phaseOutput(mapToViewState(content), {});
});
// no withFastRender — tests should expect page.fastRender === undefined
```

## Slow-phase `*.cache.json` size thresholds

Each route’s slow-phase snapshot is written as
`build/<version>/backend/pre-rendered/<route>/page.cache.json` (slow `viewState` +
`carryForward` serialized together). Hosted backends often store that blob as a single row with a
**512 KiB (524 288 byte)** content cap — the same limits enforced by **`jay-stack validate --tier-2`**
(DL#211 Check 6: soft **307 200** bytes / 300 KiB, hard **524 288** bytes / 512 KiB).

Payloads are usually **URLs and text**, not image blobs — but **many markers × many units × many
slides** still blows the limit.

### Soft vs hard limits (agent behavior)

| Tier                                                                                          | Bytes                       | Meaning                                                  |
| --------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| **OK**                                                                                        | Under **307 200** (300 KiB) | Prefer **full slow carry** for all first-paint data.     |
| **Soft warning**                                                                              | **307 200 – 524 287**       | Deploy may still work. Agent **must** report sizes after |
| `build:production`, **warn** in chat or AIditor, and **propose** deferral (smaller carry,     |
| tab-scoped fetch, post-hydration lazy enrich — see pattern below). Do not ship only a silent  |
| product trim (e.g. fewer slides) without calling it out.                                      |
| **Hard**                                                                                      | **≥ 524 288** (512 KiB)     | **Must** reduce carry before merge: defer non-critical   |
| fields, lazy enrich after hydration, or split via a platform-supported mechanism. Do not rely |
| on skipping the slow phase entirely.                                                          |

**After `npm run build:production` (or `jay-stack build`), run Tier 2 validation:**

```bash
jay-stack validate --tier-2
```

Or inspect sizes manually:

```bash
wc -c build/v*/backend/pre-rendered/*/*.cache.json
find build -path '*/pre-rendered/*/*.cache.json' -size +300k -print   # soft (approx)
find build -path '*/pre-rendered/*/*.cache.json' -size +512k -print   # hard (512 KiB)
```

**Keep the cache small when over budget:**

- Use **empty slow `viewState` + `carryForward` only** — do not duplicate the full fast view in
  both slots.
- Carry only what rebuilds the **default** view; defer the rest.
- Re-read [production-build.md](../devops/production-build.md).

Local dev is more forgiving; **verify on a production build** before deploying to a size-capped host.

### Pattern: map preview — one image in carry, enrich after hydration

For estate-map markers (listing pages): preview galleries are **not** first-paint critical for
every unit at once, but the **first** image per point should feel instant.

Recommended product + engineering shape (e.g. Starkdale `/all-residences`, `/explore`):

1. **Slow carry (SSR):** each map preview has **one slide** (hero image + card fields needed for
   the popup). Marker shell (position, label, counts) stays in carry.
2. **After interactive hydration:** automatically start fetching **additional slides** per marker
   (Jay query or batched action) — **do not** wait for hover to begin the fetch.
3. **UI:** no loading spinner. **Hide** gallery arrows until at least one extra slide has
   arrived; then show arrows so the user can see more. If only one image ever exists, arrows
   stay hidden.
4. **Restore full gallery depth** in the deferred payload (e.g. up to six slides), not in
   `page.cache.json`.

Wire fetches in `withInteractive` once the component is live; merge into ViewState or DOM via
refs per [component-refs.md](component-refs.md). Document the action contract in the page or
plugin agent-kit.

## Trade-off: freshness

Slow-phase output is built once and replayed from disk; it does **not** re-run per request. If
the default is a true constant (empty state, fixed invite, static form), there is no downside. If
the default is derived from CMS data that changes between builds, moving it to slow pins it until
the next build or platform-triggered rebuild.

Choose per page:

- **Immutable default** → slow only or slow carry + fast forward (no CMS on default path).
- **Default changes occasionally** → slow + rebuild on publish; optional interactive refresh for
  niceties only.
- **Highly volatile slice** (live availability, per-user share token) → keep **that slice** in
  fast behind an explicit param check; do not move it to slow.

## Checklist

- [ ] Does the fast phase query when the **relevant** query param is empty/absent? → carry data
      in slow; fast uses `buildView(carry, query)`.
- [ ] Is the default data independent of `props.query`? → `loadData()` in slow, typed
      `carryForward`.
- [ ] Is `PageSlowViewState` `{}`? → slow `viewState: {}`; do not duplicate the full fast view in
      both `viewState` and `carryForward`.
- [ ] Are `PageSlowViewState`, `PageFastViewState`, and `buildView`’s return type imported from
      `page.jay-contract`?
- [ ] Does `Object.keys(props.query).length > 0` trigger a CMS call? → replace with a named
      `needsFresh…(query)` for live params only.
- [ ] Is `Cache-Control: no-store` on the no-params default? → restrict to live param branches.
- [ ] Does a markup-only param trigger a re-query? → derive in `buildView`, forward carry.
- [ ] Phase tests: slow carry populated, fast default zero CMS calls, markup param zero CMS calls.
- [ ] After production build, run **`jay-stack validate --tier-2`** (or `wc -c` on each
      `*.cache.json`); **under 300 KiB** OK for full carry; **soft** → warn and propose deferral;
      **hard (≥ 512 KiB)** → must defer/shrink before deploy.
- [ ] Map previews: one image in carry; extra slides after hydration (not hover-gated); arrows
      only when more slides are loaded; no loading gif.
