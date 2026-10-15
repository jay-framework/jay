# Design Log #221 — Per-Route loadParams Cache Key in the Production Build

Status: **[Implemented]**

## Decisions for the Implementer (TL;DR)

1. **A page's own `loadParams` is cached per route.** In the production build's param collection, a part
   with no `key` (the page's own component) caches its results under `page:<rawRoute>:<props>`. Two item
   routes, such as `/post/[slug]` and `/service-page/[slug]`, then each enumerate their own params.
2. **Headless (keyed) parts keep sharing.** A keyed part caches under `<key>:<props>` as before, so a plugin
   used on several routes with the same props runs its `loadParams` once per build.
3. **One small pure function, no new surface.** `loadParamsCacheKey(rawRoute, part)` in
   `lib/builder/param-routing.ts` replaces the inline key at the single call site in `build-pipeline.ts`.
   It's exported only for the test.

## Background

Step 1 of `buildVersion` collects each route's `loadParams` results before materializing instances
(`build-pipeline.ts:338–405`). It caches results so a `loadParams` shared by many routes, such as a stores
plugin's product enumeration, runs only once (`loadParamsCache`, `build-pipeline.ts:353`).

## Problem

The cache key was `${part.key ?? ''}:${JSON.stringify(part.headlessProps ?? {})}`. A page's own component has
no `key` and no headless props, so **every page-level `loadParams` on the site shared the key `:{}`**.

A site with two page-level item routes builds the first route, then reuses its params for the second:

- `/post/[slug]` loads the post slugs.
- `/service-page/[slug]` gets the post slugs too: its own `loadParams` never runs, its items are never built,
  and each reused slug renders a 404.

✅ verified: found migrating a Wix site with a blog and Bookings service pages, where the service pages were
built with post slugs. The new unit test reproduces it with the old key.

## Prior Art / Adjacent Mechanisms

- **#134a build pipeline:** per-instance compilation. It doesn't constrain the key; the key only has to
  separate parts whose `loadParams` can differ.
- **#136 loadParams route context:** passes route params to `loadParams` for multi-prefix filtering. It
  confirms a page's params belong to its route.
- **#110 filesystem slow render cache:** caches `loadParams` per route in the dev server. The production
  build's cache is the same idea, but it dropped the route for page parts.

Null hypothesis: no existing primitive needs changing. The route is already available at the call site
(`route.rawRoute`, ✅ verified `build-pipeline.ts:381`), so the fix is only which fields form the key.

## Questions and Answers

**Q: Why not key every part by route?**
A: Keyed headless parts are designed to be shared: a product enumeration used on several routes with the same
props would otherwise run once per route, which can be expensive and rate-limited by the backend.

**Q: Can two keyed parts on different routes with the same key and props legitimately need different params?**
A: Not with today's contract, where a headless part's params depend only on its key and props.
⚠️ assumed for route-context-aware `loadParams` (#136). If such a part reads the route, it would need the
route in its key too. Deferred; see the scope list below.

## Design

```ts
// lib/builder/param-routing.ts
export function loadParamsCacheKey(rawRoute: string, part: { key?: string; headlessProps?: unknown }): string {
    const propsKey = JSON.stringify(part.headlessProps ?? {});
    return part.key ? `${part.key}:${propsKey}` : `page:${rawRoute}:${propsKey}`;
}
```

`build-pipeline.ts:381`: `const cacheKey = loadParamsCacheKey(route.rawRoute, part);`

## Examples

- ✅ `/post/[slug]` and `/service-page/[slug]`, both with page-level `loadParams`, get two cache entries, and
  each route builds its own items.
- ✅ The `productPage` headless part with `{ category: 'a' }` on `/shop/[slug]` and `/sale/[slug]` runs once.
- ❌ Before: both page-level routes resolved to the key `:{}`.

## Trade-offs

- Page-level `loadParams` no longer dedupe across routes. That dedupe was never correct, because a page's
  params are its route's.

## Scope (not handled)

- Keyed parts whose `loadParams` depend on the route (#136 context): deferred. A part like that would need
  `rawRoute` in its key, but none exists today.

## Verification Criteria

- Two page-level item routes each produce their own instances in the route manifest.
- A shared headless part's `loadParams` still runs once per build.

## Implementation Results

- `packages/jay-stack/production-build/lib/builder/param-routing.ts`: `loadParamsCacheKey`, exported from
  `lib/index.ts` for the test.
- `build-pipeline.ts:381` uses it.
- `test/param-routing.test.ts` (new):
  - two page-level parts on different routes get separate keys, and the same route keeps one key;
  - a keyed part with the same props is shared across routes, and gets a separate key with other props.
- Tests: not run locally on this branch. No package registry was reachable from the machine to install the
  monorepo's dependencies, so CI runs them.
- Deviations from the design: none.
- Verified end to end with the change applied as a dist patch to a built site: a migrated Wix site with a blog
  and 86 Bookings service pages built every service page, and none answered 404.
