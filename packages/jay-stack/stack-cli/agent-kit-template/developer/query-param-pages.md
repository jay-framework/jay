# Fast Query-Param Pages — Precompute the Default in the Slow Phase

> **Rendering phases — read this first.** Jay pages use three phases: **slow** (build-time static
> generation), **fast** (per-request server rendering), and **interactive** (client after hydration).
> Put only **slow-changing** data in the slow phase — content that is safe to fetch once, serialize into
> `page.cache.json`, and replay until the next build or republish. **Fast-changing** data (live
> availability, per-user or session state, real-time status, token lookups, anything that must be fresh
> on every visit) belongs in **fast** or **interactive**, not in the slow carry. **Hybrid pages** may
> still keep a **publish-time snapshot** in slow when the default URL is allowed to be stale until
> rebuild; named query params then trigger a live re-read in fast (see Hybrid freshness). Examples
> later assume CMS-backed data that changes on publish, not volatile counts. For how phases work on
> pages, see [page-components.md](page-components.md); for the
> builder API and phase hooks, see [Component Structure](../plugin/component-structure.md); for
> choosing `slow` vs `fast` on contract tags, see the [Contract Authoring Guide](../contracts/GUIDE.md)
> decision checklist.

Search pages, listing pages, filter pages and shareable-link pages read query parameters
(`props.query`) to decide what to render. The common mistake is to do **all** the work in the
fast phase and query on **every** request — including the request that has **no** query
parameters, whose result is a fixed default that never changes per request.

A second mistake is to treat **any** non-empty `props.query` as a reason to re-query the CMS.
Many params only change **markup** (layout mode, which panel is open, sheet height) while the
**data** is unchanged. Re-fetching on `?view=list` wastes work and breaks cacheability.

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

**Defer** when data is not on the critical path (e.g. a tab the user has not opened yet). **Shrink
carry** when [slow-phase cache size](#slow-phase-cache-size-pagecachejson) exceeds the soft budget
— that section is the source of truth for byte limits and deferral under size pressure.

Classify each field: _visible on load_ → slow/fast carry; _hover-only, other tab, or N×M URL
explosion_ → candidate for deferral once tier-2 reports a soft warning.

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

### Carry raw data, render in fast — do not duplicate between slots

On hybrid slow+fast pages, split output by **role**, not “always empty slow ViewState”:

- **Slow `viewState`:** whatever `PageSlowViewState` requires — slow-phase contract tags bound in
  jay-html. Use `{}` only when `PageSlowViewState` is `{}` (all tags are `phase: fast`).
- **`carryForward`:** query-independent **source data** for the fast phase (`PageData` from
  `loadData()`), not a second copy of the same fields already in slow `viewState`, and not a
  duplicate of the full `buildView` output unless the default view is a true constant.

In both `viewState` and `carryForward`, ship only what the next phase or your jay-html bindings
actually use — drop extra fields that are never read or bound.

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
  query: Record<string, string>,
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
  .withFastRender(async (props, carry: PageData) =>
    phaseOutput(buildView(carry, props.query), {}),
  );
```

**Tests:** assert `slow.rendered` is `{}`, data lives on `slow.carryForward`, fast with no CMS
mocks makes **zero** action calls, and `?view=list` still makes zero CMS calls while changing
only markup fields.

## The pattern

```
slow  → load query-independent data once → viewState {} (if contract says so), carryForward: PageData
fast  → buildView(carry, props.query) — no CMS unless a specific param needs live data
       → param branch that needs freshness → query + optional no-store
```

Snippets below use `phaseOutput` directly; the main example uses `RenderPipeline` in slow when you
want typed error handling — both return the same `viewState` / `carryForward` shape.

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
  return phaseOutput(buildView(carry, props.query), {});
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
(e.g. share token, a booking-change flow). Carry a **snapshot** in slow that is safe to show
**stale on the default path** (no live param); re-query only inside an explicit
`needsFresh…(props.query)` helper — not `Object.keys(props.query).length > 0`.

```typescript
function needsFreshRules(query: Record<string, string>): boolean {
  return Boolean(query.live?.trim() || query.bookingId?.trim());
}

function rulesToPhaseOutput(
  rules: VisitRules,
  query: Record<string, string>,
  responseHeaders?: Record<string, string>,
) {
  return phaseOutput(buildViewFromRules(rules, query), {}, { responseHeaders });
}

.withFastRender(async (props, carry: { rules: VisitRules }) => {
  if (needsFreshRules(props.query)) {
    const rules = await getVisitRules({});
    return rulesToPhaseOutput(rules, props.query, { 'Cache-Control': 'no-store' });
  }
  return rulesToPhaseOutput(carry.rules, props.query);
});
```

Document which params are markup-only vs live in a comment next to the helper.

## When a query param only changes markup, not data

Params like `?view=list` vs map, which collection or item is open, or sheet/panel layout select
**presentation**. The underlying dataset is the same.

- Keep **data** on `carryForward` from slow (or from the last full `loadData` on live branches).
- In fast, only run `buildView(carry, query)` — derive `view` / `viewSwitchMarkup` / server-side
  opening state inside `buildView`.
- Do **not** call `loadData()` again because `props.query` is non-empty.

```typescript
.withFastRender(async (props, carry: PageData) =>
  phaseOutput(buildView(carry, props.query), {}), // ?view=list changes markup only
);
```

## Filters and pagination

Do not confuse **re-querying** in fast (usually wrong for filter params) with **applying** filter
or page params in fast (often required for correct first paint).

Shared links like `?brand=x` or `?page=3` must match the **first HTML** (SEO, no flash of wrong
content). When the full dataset already lives in slow `carryForward`, fast should run the same
pure `buildView(carry, props.query)` and **filter or slice in memory** — zero CMS calls.
**Interactive** then owns filter/page changes after load (read `location.search`, update URL with
`history` APIs, optionally call actions). Applying filters only in interactive, with no fast pass
over `props.query`, is wrong for deep links.

| Dataset | First load (`props.query` in fast) | After hydration (interactive) |
| ------- | ---------------------------------- | ----------------------------- |
| Small, fully carried | `buildView` filters or paginates over carry (no CMS) | Same logic on carry, or DOM narrow; sync URL |
| Large or over cache budget | Query with filter + limit/offset (or cursor); `no-store` if volatile | Action for page/filter changes; sync URL if shareable |

**Large catalogs:** “ship the full list” does not scale — slow `page.cache.json` caps (see below)
and client download cost. Server-side filter/pagination is required; filtering only the current
page on the client is wrong (you would filter page *N*, not the whole result set).

**Security:** client hide/show is not access control — never put rows the user must not see in
carry or ViewState.

## Pages with no query params at all

If the route never reads `props.query`, do **not** add a fast phase just for freshness. Put the
whole CMS read in `withSlowlyRender` and omit `withFastRender` (home page, static listings, static
content walls, idle form shells). Rely on platform rebuild / republish when content changes.

```typescript
.withSlowlyRender(async () => {
  const content = await getHomePageContent({});
  return phaseOutput(mapToViewState(content), {});
});
// no withFastRender — tests should expect page.fastRender === undefined
```

## Slow-phase cache size (`page.cache.json`)

Each route’s slow-phase snapshot is written as
`build/<version>/backend/pre-rendered/<route>/page.cache.json` (slow `viewState` +
`carryForward` serialized together).

**Jay enforces carry budgets in CI and pre-deploy:** `jay-stack validate --tier-2` measures each
`*.cache.json` and reports a **soft warning** at **307 200 bytes (300 KiB)** and a **hard error**
at **524 288 bytes (512 KiB)**. Those limits match common hosted deploy storage caps for a single
pre-rendered row; staying under them keeps local validation aligned with production. See
[validation-tier-2-guide.md](../designer/validation-tier-2-guide.md) for tier-2 output.

Payloads are usually **URLs and text**, not image blobs — but dense lists (many markers × many
preview fields) still blow the limit.

### Soft vs hard limits (agent behavior)

| Tier | Bytes | Meaning |
| ---- | ----- | ------- |
| **OK** | Under **307 200** (300 KiB) | Prefer full slow carry for first-paint data. |
| **Soft warning** | **307 200 – 524 287** | Tier 2 warns; deploy may still work on some hosts. |
| **Hard** | **≥ 524 288** (512 KiB) | Tier 2 errors; shrink carry before merge. |

After a production build, agents **must** run tier-2 (or `wc -c` on each cache file), **surface**
the sizes, and **propose** deferral when soft — smaller carry, tab-scoped fetch, post-hydration
enrich (see pattern below). Do not silently trim user-visible data without calling it out.

On **hard** limit: defer non-critical fields, lazy enrich after hydration, or split via a
platform-supported mechanism. **Do not** move the entire dataset to fast-only rendering just to
avoid the cache file — you lose the build-time default path and pay per-request cost instead.

### Verify size

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

- Put slow-phase fields in **slow `viewState`** or in **`carryForward`**, not both — never duplicate
  the same payload across slots; both serialize into `page.cache.json`.
- Carry only what rebuilds the **default** view; defer the rest.
- Re-read [production-build.md](../devops/production-build.md).

Local dev is more forgiving; **verify on a production build** before deploying to a size-capped host.

### Example pattern: dense lists — minimal carry, enrich after hydration

On pages with **many markers or rows** (maps, dense catalogs): put **first-paint** preview
fields in slow carry (e.g. one thumbnail + labels per item); fetch heavier media or extra fields
in `withInteractive` via actions or client queries — start those fetches after hydration, not only
on hover. Keep the full gallery or detail payload out of `page.cache.json`. Merge deferred data
into ViewState or the DOM via refs per [component-refs.md](component-refs.md).

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
- [ ] Slow `viewState` matches `PageSlowViewState` (may be `{}` when every tag is `fast`); same data
      must not also sit in `carryForward`.
- [ ] Are `PageSlowViewState`, `PageFastViewState`, and `buildView`’s return type imported from
      `page.jay-contract`?
- [ ] Does `Object.keys(props.query).length > 0` trigger a CMS call? → replace with a named
      `needsFresh…(query)` for live params only.
- [ ] Is `Cache-Control: no-store` on the no-params default? → restrict to live param branches.
- [ ] Does a markup-only param trigger a re-query? → derive in `buildView`, forward carry.
- [ ] Shared filter/page URLs: does fast `buildView(carry, props.query)` apply them in memory (small
      carry) or query the server (large set)? Interactive-only apply → wrong first paint.
- [ ] Phase tests: slow carry populated, fast default zero CMS calls, markup param zero CMS calls.
- [ ] After production build, run **`jay-stack validate --tier-2`** (or `wc -c` on each
      `*.cache.json`); **under 300 KiB** OK for full carry; **soft** → warn and propose deferral;
      **hard (≥ 512 KiB)** → must defer/shrink before deploy (not fast-only to dodge the cap).
- [ ] Dense lists/maps: minimal preview in slow carry; defer heavy fields to interactive/actions.
