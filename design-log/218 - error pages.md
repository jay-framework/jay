# Design Log #218 — Error Pages (404 / 4xx / 5xx and friends)

Status: **[Design]**

## Decisions for the Implementer (TL;DR)

1. **Convention — top-level reserved folders in `pages/`.** An error page is a normal
   `page.jay-html` living in a **top-level** folder whose name is an HTTP status token:
   - exact code — `pages/404/`, `pages/500/`, `pages/502/`, `pages/504/`
   - family — `pages/4xx/`, `pages/5xx/`
   These folder names are **reserved** (not routable — `/404` is *not* a navigable URL).
   Reservation applies **only at the top level** of the pages root; a nested
   `pages/blog/404/page.jay-html` is a normal route `/blog/404`.
2. **Resolution is exact → family → built-in.** For an outcome with status `S`:
   look up `String(S)` → look up `${first-digit}xx` → fall back to the current
   hardcoded plain-text response. So `502` renders `pages/502` if present, else
   `pages/5xx`, else plain text. `404` renders `pages/404` → `pages/4xx` → plain text.
3. **v1 scope is 4xx + 5xx.** Redirects (3xx) keep today's `Location`-header-only
   behavior (no page body). 1xx/2xx page slots are out of scope. The token grammar
   permits them so we don't repaint later, but the renderer only invokes error pages
   for 4xx/5xx statuses.
4. **No new 504/timeout runtime.** Any status — including `504` — reaches the renderer
   through the existing path: framework-generated (no route → 404, uncaught throw → 500)
   or a component/plugin returning that `RenderOutcome` status (e.g. a timeout-measuring
   plugin returns `serverError5xx(504, …)`). The precedence rule (`504` beats `5xx`)
   is just the exact-before-family chain.
5. **Error info reaches the template via a reserved headless key `error`.** The framework
   ships a built-in, typed **Error contract** (`jay-stack`/`error`). An error page declares
   `<script type="application/jay-headless" plugin="jay-stack" contract="error" key="error">`;
   the renderer injects the error ViewState under the `error` key. Fields are
   `status` / `title` / `message` / `url`, plus a forEach-able `details` key/value list.
   Template reads `{error.status}`, `{error.title}`, `{error.message}`,
   `<div forEach="error.details">{key}: {value}</div>`. `jay.error.*` is also
   exposed (untyped, via `__jay`) as a zero-import convenience.
6. **`RenderResult` gains a human-facing `title`.** Add optional `title?` to
   `ServerError5xx` and `ClientError4xx` (they already carry `message?`, `code?`,
   `details?`); thread `title` through the constructors (`notFound`, `serverError5xx`,
   `clientError4xx`, …). When a component returns `notFound('…', { title })`, that flows
   into the error page's `error` ViewState. The framework fills sensible per-status defaults
   for `title`/`message` when omitted. `details` (the existing `Record<string, unknown>`)
   is projected to `[{ key, value }]` for the forEach-able `error.details`.
7. **Validation (prevention-first).** Tier-1 `validate` warns when the **minimum** error
   pages are absent (minimum = `404` and `5xx`). Suppressible via `.jay`
   `validations: { allow-no-error-pages: true }` (same pattern as `allow-no-ard`, DL#214).
   Agent-kit gains a guide: how to build error pages and consume the `error` contract.
8. **Both targets, from the start.** Production (`main-server.ts` no-match + catch +
   `fetch-page-handler.ts` error short-circuit) and dev (`dev-server.ts`
   `handleOtherResponseCodes` + the missing unknown-path 404 + the exception catch).
   Error-page rendering must itself be exception-safe: if rendering the error page throws,
   fall back to the built-in plain-text response.
9. **An error is a request-time (fast) event, but the error page is a pure pass-through.**
   An error page runs **no author fast phase** — the framework passes the error details
   through as the fast contribution under `error`. The page's slow phase (static chrome, if
   any) is pre-rendered at build and merged. Error pages may still be interactive (client
   hydration) for a search box / "go home" button.

---

## Background

Jay Stack pages are `page.jay-html` files discovered by the route-scanner and rendered
on demand (slow phase pre-baked at build into `*.cache.json`, fast phase at request time).
There is **no static HTML emission** — the server renders every page. ✅ verified
(route-scanner.ts; production-build build-pipeline.ts; fetch-page-handler.ts).

Error/status responses today are **hardcoded plain text**:

| Case | Current response | Site (✅ verified) |
| --- | --- | --- |
| No route match (prod) | `404` `"Not Found"` | `production-server/.../main-server.ts:127-131` |
| Component error outcome (prod) | `status` + `message \|\| "Error"` | `fetch-page-handler.ts:85-95` |
| Uncaught exception (prod) | `500` `"Internal Server Error"` | `main-server.ts:143-150` |
| Component error outcome (dev) | `status` + `"server error"` / `"client error"` | `dev-server.ts:291-300` |
| Uncaught exception (dev) | `500` + stack | `dev-server.ts:471-476` |
| Unknown path (dev) | **no 404** — falls to Express default | — (`dev-server.ts` registers `app.get(route.path,…)` per route) |

The error *states* already exist: `ServerError5xx` / `ClientError4xx` / `Redirect3xx`
carry `status`, `message`, `code`, `details`. ✅ verified (`jay-stack-types.ts:102-123`).
What is missing is a way to render a **designed** page for them.

## Problem

Designers/developers cannot brand or enrich error responses. A 404 or 500 is bare text,
inconsistent with the site, and carries no author-controlled messaging. We want:

- Author error pages as ordinary `.jay-html` (designer-owned, bindable, interactive).
- A catch-all per family (`4xx`, `5xx`) overridable by specific codes (`404`, `502`, `504`).
- The page to receive typed error info (status / title / message / url / details) to display.
- A build-time check that the minimum error pages exist, with agent-kit guidance.

## Prior Art / Adjacent Mechanisms

Enumerated before designing (methodology §3); each is reused rather than reinvented where possible.

| Mechanism | Where | Verdict for this design |
| --- | --- | --- |
| **Route scanner** — `page.jay-html` → route; `IGNORED_DIRS`; dynamic `[slug]` brackets; specificity sort | `route-scanner.ts` (scanDirectory:97, convertToRoutePath:57, line 111 filename gate) ✅ | **Extend.** No reserved names exist today; add top-level status-token reservation that diverts matching folders out of `routes[]` into an error-page set. |
| **RouteManifest / RouteEntry** | `production-server/lib/types.ts:4-62` ✅ | **Extend.** Add `errorPages?: Record<token, ErrorPageEntry>`; `ErrorPageEntry` mirrors the compiled refs of a single-instance route (serverElementPath, routeClientBundlePath, routeHydratePath, routeCssPath, cssImports, headMeta, scripts). |
| **`__jay` synthetic ViewState** injected at render, read via reserved `jay.` prefix | inject `fetch-page-handler.ts:112-115`, `dev-server.ts:1552-1558`; prefix `expression-compiler.ts:131-134` ✅ | **Reuse pattern.** Error info is injected exactly like `__jay`. Also extend `__jay.error` for the untyped `jay.error.*` convenience. |
| **Keyed headless parts** merge under `viewState[key]` | `fast-changing-runner.ts:64` ✅ | **Reuse the shape, not the runner.** The `error` key lands in ViewState the same way a keyed part does, but is injected (not produced by running a component). |
| **Contract → ViewState types** | `contract-to-view-state-and-refs.ts`; example `page-with-headless-and-contract` fixture ✅ | **Reuse.** The built-in Error contract compiles to `ErrorViewState` exactly like any headless contract, giving `error: ErrorViewState` typing on the page. |
| **`RenderResult` error constructors** | `render-results.ts:13-62`; types `jay-stack-types.ts:102-123`; pipeline `render-pipeline.ts:74-100,189-256` ✅ | **Extend.** Add `title?` to the two error interfaces (they already carry `message?`/`code?`/`details?`) and their constructors/pipeline factories. |
| **`.jay` `validations` suppression** (`allow-no-ard`) | DL#214 / this-session config.ts + validate.ts | **Reuse.** Add `allow-no-error-pages`. |
| **DL#54 render-result monads**; **DL#34 jay stack rendering phases**; **DL#213 site head tags** | — | Context; error pages inherit head-tag merging (site identity + template). |

### Null-hypothesis check (methodology §4)

- *Why not reuse `__jay` only (no new contract)?* It is untyped (string-typed via the
  `jay.` prefix) and the user wants an importable, typed contract/headless component for
  error info. We still get `jay.error.*` for free, but the typed `error` key is primary.
- *Why not a framework render-timeout for 504?* Not needed — 504 originates from a
  plugin/component returning that status. No new runtime surface.
- *Why not static `404.html` emission (SSG)?* Jay serves every page via its own server;
  there is no static HTML target today. Deferred (see Scope pre-mortem).
- *Why a new manifest section instead of a flag on `RouteEntry`?* Error pages are resolved
  by status, not by URL match; keeping them out of `routes[]` avoids polluting the
  URL-matching path and prevents accidental navigability.

## Questions and Answers

**Q1. Folder convention?** → **Top-level `pages/<status>/`** reserved folders
(`404`, `500`, `502`, `504`, `4xx`, `5xx`). Reserved = excluded from routing. (User-selected.)

**Q2. How does error info reach the template?** → **Reserved headless key `error`**, typed
by a built-in Error contract; `jay.error.*` also exposed untyped. (User-selected.)

**Q3. 504 / render timeout?** → **No framework timeout.** 504 (and any status) comes from a
component/plugin `RenderOutcome`, or framework-generated 404/500. Precedence `504`→`5xx` is
the exact→family chain. (User clarification: "504 can source from a plugin that measures
timeout and resolves to a 504 status … the important point is the 4xx and 5xx catch-all
pages with more specific pages like 404, 502, 504.")

**Q4. Is `/404` navigable?** → **No.** Reserved top-level folders are not emitted as routes.
Trade-off: top-level folders named exactly `100`–`599` or `Nxx` can no longer be real routes.
Accepted (unlikely to conflict; nested same-named folders are unaffected).

**Q5. Minimum pages for validation?** → **`404` and `5xx`** (confirmed). Warn if absent;
suppress with `.jay` `allow-no-error-pages`. `5xx` covers 500 via family fallback.

**Q6. Do error pages run their own phases?** → **An error is a request-time (fast) event by
definition, but the error page has no real fast render — it only passes the error details
through.** (User: "error pages which happen on the server are fast render by definition.
However, the pages themselves have no real fast render, only a pass through of the error
details.") So: no author fast phase runs; the framework injects the error details as the
`error` ViewState (the fast contribution). The page's slow phase (static chrome, if any) is
pre-rendered at build and merged. Client hydration still allowed.

**Q7. What fields does the Error contract expose?** → **`status: number`, `title: string`,
`message: string`, `url: string`** (the path that errored), plus **`details`** — an optional
**repeated `{ key: string, value: string }`** list a page can render with `forEach` when it
wants to surface structured detail. (Dropped `code` and `description` from the earlier draft;
`message` serves the descriptive text.) The framework projects the `RenderResult.details`
record to the `[{ key, value }]` list. (User-selected.)

## Design

### 1. Status-token grammar & resolution

```
token      := exact | family
exact      := [1-5][0-9][0-9]        # 404, 500, 502, 504
family     := [1-5] "xx"             # 4xx, 5xx  (v1 renders only 4xx/5xx)
```

Resolution for an outcome status `S` (pseudocode):

```ts
function resolveErrorPage(errorPages, S) {
    if (S < 400 || S > 599) return undefined;      // v1: only 4xx/5xx get a page
    return errorPages[String(S)]                   // exact, e.g. "502"
        ?? errorPages[`${Math.floor(S / 100)}xx`]; // family, e.g. "5xx"
    // caller falls back to built-in plain text when undefined
}
```

```mermaid
flowchart TD
  O[Outcome status S] --> R{S in 400..599?}
  R -- no --> P[existing behavior: redirect header / success]
  R -- yes --> E{errorPages[S] exists?}
  E -- yes --> RenderExact[render pages/S]
  E -- no --> F{errorPages[Nxx] exists?}
  F -- yes --> RenderFamily[render pages/Nxx]
  F -- no --> Text[built-in plain text fallback]
```

### 2. Scanner change (`route-scanner.ts`)

At the **top level** of the pages root, a directory whose name matches the token grammar is
**not** converted to a route. Instead the scanner records an error-page entry
`{ token, jayHtmlPath, compPath? }`. Implementation: in `scanDirectory`, when `depth === 0`
(direct child of base) and `isStatusToken(dirName)`, scan the folder for `page.jay-html` and
push to a separate `errorPages` collection rather than recursing into normal route conversion.
Nested occurrences (depth > 0) are left as normal routes. ✅ hook point verified
(route-scanner.ts:95-136).

`scanRoutes` returns `{ routes, errorPages }` (new field). Callers that only want routes
ignore it; the build pipeline consumes it.

### 3. Built-in Error contract (`jay-stack`/`error`)

Ship a canonical contract compiled to `ErrorViewState`:

```yaml
# built-in — conceptually:
name: Error
tags:
  - { tag: status,  type: data, dataType: number, phase: fast }
  - { tag: title,   type: data, dataType: string, phase: fast }
  - { tag: message, type: data, dataType: string, phase: fast }
  - { tag: url,     type: data, dataType: string, phase: fast }
  - tag: details                 # optional, forEach-able structured detail
    type: sub-contract
    repeated: true
    phase: fast
    tags:
      - { tag: key,   type: data, dataType: string }
      - { tag: value, type: data, dataType: string }
```

Phase is `fast` because the error data is a request-time pass-through (Q6), not build-time
slow data. This generates `error: { status: number; title: string; message: string; url:
string; details: Array<{ key: string; value: string }> }`.

The compiler special-cases `plugin="jay-stack" contract="error"` on a headless script to
this built-in contract (no module resolution), generating `error: ErrorViewState` on the
page ViewState — exactly the typing path of a normal keyed headless part (verified pattern:
`page-with-headless-and-contract` fixture, `contract-to-view-state-and-refs.ts`). The runtime
**injects** `viewState.error = errorInfo` at the error-render site (no component runs).

### 4. Injecting the error ViewState

New helper, used by both targets at the error-render site:

```ts
function buildErrorViewState(entry: ErrorPageEntry, info: ErrorInfo): object {
    const vs = { ...(entry.slowCache?.slowViewState ?? {}) };   // static chrome, if any
    const error = {
        status: info.status,
        title: info.title ?? defaultTitle(info.status),
        message: info.message ?? defaultMessage(info.status),
        url: info.url,
        details: Object.entries(info.details ?? {}).map(
            ([key, value]) => ({ key, value: String(value) }),
        ),
    };
    (vs as any).error = error;
    (vs as any).__jay = { params: {}, url: { path: info.url }, error };
    return vs;
}
```

`ErrorInfo` is assembled from the `RenderResult` (status/message/title/details) or framework
defaults (no-route → 404; uncaught throw → 500). `defaultTitle`/`defaultMessage` provide
per-status text so a bare `pages/5xx` page still shows something sensible. `details` (the
`RenderResult.details` record) is projected to the forEach-able `[{ key, value }]` list.

Render = load the error page's compiled server element and
`renderToStream(buildErrorViewState(...))` — the same call pages use (`fetch-page-handler.ts:199`).
**Wrap in try/catch**; on failure emit the built-in plain-text response.

### 5. `RenderResult` extension (`jay-stack-types.ts` + `render-results.ts` + `render-pipeline.ts`)

```ts
export interface ServerError5xx {
    kind: 'ServerError';
    status: number;
    message?: string;      // existing — descriptive text, surfaces as error.message
    code?: string;         // existing — kept (not exposed in the Error contract)
    title?: string;        // NEW — human-facing heading, surfaces as error.title
    details?: Record<string, unknown>;  // existing — projected to error.details [{key,value}]
}
// ClientError4xx: same new `title?` field.
```

`message` (already present) and `details` (already present) need no new fields — only `title`
is added. Constructor signatures move the trailing options into a bag (no backward-compat
constraint):

```ts
serverError5xx(status, message?, opts?: { title?; code?; details? })
clientError4xx(status, message?, opts?: { title?; code?; details? })
notFound(message?, opts?: { title?; details? })   // 404
badRequest / unauthorized / forbidden — same shape
```

Mirror in `RenderPipeline` factories (`render-pipeline.ts:189-256`).

### 6. Manifest & build pipeline

- `RouteManifest.errorPages?: Record<token, ErrorPageEntry>` where `ErrorPageEntry` carries
  the compiled refs of a single unit: `serverElementPath`, `routeClientBundlePath`,
  `routeHydratePath`, `routeCssPath`, `cssImports`, `headMeta`, `scripts`, and an optional
  pre-rendered `slowCache` (slow ViewState only; no instances/params).
- The build compiles each error page like a one-instance route, emitting under
  `backend/pre-rendered/_errors/<token>/` and `frontend/pages/_errors/<token>/` (the `_errors`
  subtree only names the *output* location; the *source* lives at top-level `pages/<token>/`).
- Error pages are excluded from sitemap/llms.txt/robots and from internal-link validation
  (they are not URLs).

### 7. Server wiring

**Production:**
- `main-server.ts:127-131` (no match) → `renderErrorPage(404, …)` → plain text fallback.
- `fetch-page-handler.ts:85-95`: `ServerError`/`ClientError` → `renderErrorPage(status, …)` →
  plain text fallback. `Redirect` unchanged.
- `main-server.ts:143-150` (catch) → `renderErrorPage(500, …)` → plain text fallback.

**Dev:**
- Add an Express catch-all (after all route registrations) → `renderErrorPage(404, …)`.
- `dev-server.ts:291-300` `handleOtherResponseCodes` → `renderErrorPage(status, …)`.
- `dev-server.ts:471-476` (catch) → `renderErrorPage(500, …)` (keep stack in logs/dev detail).

Dev compiles the error page on the fly (like any dev page render); prod loads from
`manifest.errorPages`.

### 8. Validation (`stack-cli` Tier-1)

- Warn when `errorPages` lacks the minimum (`404` and `5xx`), with a suggestion pointing to
  the new agent-kit guide and the `.jay` suppression.
- Suppress via `.jay` `validations: { allow-no-error-pages: true }` (extend `JayConfig.validations`).
- Validate shape of present error pages (declared `jay-stack`/`error` headless when they bind
  `{error.*}`; well-formed token folder).

### 9. Agent-kit

- **Designer guide** — authoring error pages: the `pages/<status>/` convention, the
  `error` headless import, bindings (`{error.status}`, `{error.title}`, `{error.message}`,
  `forEach="error.details"`), the exact→family precedence, and that these folders are not navigable.
- **Developer guide** — returning `notFound('…', { title })` /
  `serverError5xx(504, msg, { title })` and how those fields surface on the page.

## Implementation Plan

1. **render-results** — add `title?` to the two error interfaces + constructors +
   pipeline factories; unit tests. (Smallest, isolated.)
2. **Built-in Error contract + compiler recognition** of `jay-stack`/`error`; generate
   `error: ErrorViewState`; fixture + `.d.ts` comparison test (no `toContain`).
3. **Scanner** — status-token reservation at top level; `scanRoutes` returns `errorPages`;
   fixtures for exact/family/nested-not-reserved.
4. **Manifest + build pipeline** — `errorPages` section; compile error pages; output tree;
   exclude from sitemap/links.
5. **Renderer** — `renderErrorPage` + `buildErrorViewState` + defaults; wire prod (3 sites)
   and dev (3 sites, incl. new catch-all). Cross-target fixtures + a live example.
6. **Validation** — minimum-pages warning + `.jay allow-no-error-pages`; tests.
7. **Agent-kit** — designer + developer guides.
8. **Example** — add `404` and `5xx` pages to the smoke-test (or fake-shop) and a dev/prod
   render test that asserts the full HTML via `toEqual(prettifyHtml(...))`.

## Examples

`src/pages/404/page.jay-html`:

```html
<html>
  <head>
    <script type="application/jay-headless" plugin="jay-stack" contract="error" key="error"></script>
    <title>{error.title}</title>
    <meta name="description" content="{error.message}">
  </head>
  <body>
    <main>
      <h1>{error.status} — {error.title}</h1>
      <p>{error.message}</p>
      <ul forEach="error.details">
        <li>{key}: {value}</li>
      </ul>
      <a href="/">Go home</a>
    </main>
  </body>
</html>
```

`src/pages/5xx/page.jay-html` — same shape; renders for any 500–599 without a more specific page.

Developer returning enriched errors from a page/plugin:

```ts
return notFound('The product you are looking for may have been removed.', {
    title: 'Product not found',
});
// → renders pages/404 (or pages/4xx); error.title / error.message bound.
```

A timeout-measuring plugin:

```ts
return serverError5xx(504, 'Upstream timed out', {
    title: 'This is taking too long',
    details: { upstream: 'inventory-service', waitedMs: '10000' },
});
// → renders pages/504 if present, else pages/5xx; error.details lists the key/value pairs.
```

## Trade-offs

| Aspect | Benefit | Cost |
| --- | --- | --- |
| Top-level reserved status folders | Zero new file type; obvious location; designer-authored | Top-level folders named `100`–`599` / `Nxx` are no longer routable |
| Exact → family resolution | One `5xx` covers everything; override precisely where it matters | Two lookups per error; authors must learn the precedence |
| Reserved `error` headless key (typed) | Typed bindings; reuses contract→ViewState + keyed-part shape | Compiler must special-case a built-in plugin/contract |
| Inject `error` (don't run a component) | No request-time failure from running a component during error handling | Error page can't compute its own fast data in v1 |
| `title` on RenderResult (+ `details` projection) | Author messaging flows from logic to UI | Constructor signature churn (acceptable; no back-compat) |
| Validation + agent-kit | Minimum pages caught at build; guidance prevents misuse | One more suppression flag to document |

## Verification Criteria

1. `pages/404/page.jay-html` renders (branded HTML) for an unmatched URL in **both** dev and prod.
2. `pages/5xx/page.jay-html` renders for a thrown exception and for `serverError5xx(503)`.
3. `pages/502/page.jay-html` (exact) wins over `pages/5xx/` for a 502.
4. `/404` and `/5xx` are **not** navigable routes (absent from the route manifest/sitemap).
5. `{error.status}`/`{error.title}`/`{error.message}` bind correctly; defaults appear when
   the component supplied none; `forEach="error.details"` lists supplied key/value pairs.
6. `notFound('msg', { title })` surfaces `error.title`/`error.message` on the rendered page.
7. `validate` warns when `404`/`5xx` are missing and is silent when present or suppressed via
   `.jay allow-no-error-pages`.
8. Rendering an error page that itself throws falls back to the built-in plain-text response
   (no infinite loop, no unhandled crash).

## Scope Pre-mortem (what this does NOT handle)

- **Nested / per-route error boundaries** (e.g. `pages/blog/_error`): deferred — own DL if needed.
- **1xx / 2xx / 3xx error pages & redirect-body rendering**: deferred; grammar reserves the
  space, renderer ignores it. Redirects stay header-only.
- **Static `404.html` emission for CDN/host-level serving**: deferred — Jay serves via its own
  server; revisit if an SSG/static-export target lands.
- **Author fast phase on error pages**: not supported — the error page is a pass-through of the
  injected `error` data (Q6). Its slow phase (static chrome) is still pre-rendered at build.
- **Localized / i18n error pages**: deferred.

---

## Implementation Results

### Phase 1 — render-results `title` + options bag ✅

- `jay-stack-types.ts`: added `title?: string` to `ServerError5xx` and `ClientError4xx`
  (they already carried `message?`/`code?`/`details?`).
- `render-results.ts`: introduced `ErrorOptions { title?; code?; details? }`; the error
  constructors (`serverError5xx`, `clientError4xx`, `notFound`, `badRequest`, `unauthorized`,
  `forbidden`) now take `(…, message?, opts?: ErrorOptions)` instead of a positional
  `details`. Fields are spread conditionally so unset keys are omitted (clean `toEqual`).
- `render-pipeline.ts`: `RenderPipeline` factory interface + impl updated to `opts?: ErrorOptions`.
- Tests: new `test/render-results.test.ts` (6 tests) + updated one `render-pipeline.test.ts`
  case that passed `details` positionally → `{ details: … }`. All 58 package tests pass,
  types clean.
- No external callers passed a positional `details` (verified across packages/examples), so
  the signature change broke nothing.

### Phase 2 — built-in Error contract + compiler recognition ✅

- **New `builtin-contracts.ts`** (`compiler-jay-html/lib/contract/`): the in-memory
  `ERROR_CONTRACT` (`name: Error`; `status:number`, `title:string`, `message:string`,
  `url:string`, all `phase: fast`; `details` repeated sub-contract `{ key, value }`
  trackBy `key`, `phase: fast`) plus `ERROR_CONTRACT_PLUGIN='jay-stack'`,
  `ERROR_CONTRACT_NAME='error'`, `ERROR_CONTRACT_MODULE='@jay-framework/full-stack-component'`,
  and `isBuiltInErrorContract(plugin, contract)`. Exported via `lib/contract/index.ts`.
- **Parser special-case** (`jay-html-parser.ts` `parseHeadlessImports`): a new first branch in
  the `try` — `if (isBuiltInErrorContract(pluginAttr, contractAttr))` — sets
  `loadedContract = ERROR_CONTRACT`, `contractFile = ERROR_CONTRACT_MODULE` (bare specifier,
  **no** plugin/filesystem resolution), `contractTagName = 'error'`, non-structural. Because
  it's non-structural and never used as a `<jay:error>` region, **no component instance is
  generated** — the import contributes typing only (the `error` ViewState is injected at render
  in later phases). `relativeContractPath` is guarded so the bare specifier is not relativized.
- **Type-only target** (`full-stack-component/lib/error-contract.ts`, re-exported from index):
  hand-written `ErrorViewState`, `DetailOfErrorViewState`, `ErrorRefs`, `ErrorRepeatedRefs`
  matching the compiled contract shape. Generated error pages import
  `{ ErrorViewState, ErrorRefs, DetailOfErrorViewState } from '@jay-framework/full-stack-component'`
  (type-only — erased at runtime).
- **Anti-drift test** (`test/contract/builtin-error-contract.test.ts`): compiles
  `ERROR_CONTRACT` via `compileContract` and asserts (toEqual) it equals the committed
  fixture `fixtures/contracts/builtin-error/error.jay-contract.d.ts`. If the contract shape
  changes, this breaks — reminding the dev to update the hand-written `error-contract.ts`.
- **Page-side fixture + test** (`fixtures/contracts/page-with-error-contract/` +
  `jay-html-contract-ref.test.ts` "with built-in error contract"): a `page.jay-html` declaring
  the error headless + binding `{error.status/title/message}` + `forEach="error.details"`
  generates `error?: ErrorViewState` on `PageViewState`, `error: ErrorRefs` on
  `PageElementRefs`, with `error` in fast+interactive phases (slow `{}`). Compared via toEqual
  against the committed `page.jay-html.d.ts`.
- Results: compiler-jay-html 732 passing (+2 new), full-stack-component 58 passing, whole-repo
  `build:check-types` clean. No `toContain` used.

### Phase 2.1 — `code` added to the Error contract (reverses Q7's drop) ✅

User review surfaced an asymmetry: `code?` lives on `ErrorOptions` / `ServerError5xx` /
`ClientError4xx` (a developer can set it) but Q7 had dropped it from the page-bindable Error
contract — so there was no typed way to display it. **Decision (supersedes Q7 on this field):
add `code` to the Error contract** so pages can bind `{error.code}`.

- `builtin-contracts.ts`: added `{ tag: 'code', data, string, phase: fast }` after `url`.
- `full-stack-component/lib/error-contract.ts`: `ErrorViewState` gains `code: string`.
- Anti-drift fixture `builtin-error/error.jay-contract.d.ts` updated (`code` in the interface and
  in `ErrorFastViewState`'s `Pick`).
- Contract data tags generate **required** fields (no `required` handling in
  `contract-to-view-state-and-refs.ts`), so `code: string` is required — like `title`/`message`.
  `code` is optional on the outcome, so **Phase 5's `buildErrorViewState` must default it to `''`**
  when the `RenderResult` supplied none (same pattern as the title/message defaults).
- All tests green; `build:check-types` clean.

**Deviation from design:** the DL said "the compiler special-cases … (no module resolution),
generating `error: ErrorViewState`." Implemented exactly, with one made-concrete decision: the
generated **type import resolves to the bare specifier `@jay-framework/full-stack-component`**
(type-only), where the shipped hand-written types live — rather than a relative path into a
synthetic contract file. This keeps the import stable across projects and avoids a
relative-path-into-node_modules. An anti-drift compiler test locks the contract/type shape.

### Phase 3 — scanner: reserve top-level status-token folders ✅

- **`route-scanner.ts`**: added `isStatusToken(name)` (`^([1-5][0-9]{2}|[1-5]xx)$`), the
  `JayErrorPage` / `JayErrorPages` types, and a `ScanResult = { routes, errorPages }`.
  `scanDirectory` now carries a `depth` and returns `ScanResult`: at **depth 0** a directory whose
  name is a status token is collected as an error page (`toErrorPage` resolves its
  `page.jay-html` + optional `page.ts`) and **not recursed into** — so it's never a route and its
  nested content isn't emitted. Status-named folders at **depth > 0** stay normal routes
  (`/blog/404`). `scanRoutes` now returns `{ routes: sorted, errorPages }`.
- **Callers updated** (no back-compat shim, per project policy): `dev-server.ts` `initRoutes`,
  `check-internal-links.ts` `buildRouteOracle`, `production-build` `server-code-build.ts` all
  destructure `{ routes }` (error pages consumed later in Phases 4–5). Error pages are thereby
  already excluded from internal-link checking and the route build.
- **Fixtures + tests**: `test/fixtures/error-pages/` (`404/` with co-located `page.ts`, `5xx/`,
  `502/`, root `page.jay-html`, nested `blog/404/`). New `route-scanner.test.ts` block asserts
  exact/family collection with resolved paths, that top-level tokens are absent from `routes`,
  and that nested `/blog/404` is a route (not reserved). `isStatusToken` unit-tested across
  valid/invalid tokens. The whole-`fixtures/` express-route test's expected set was extended with
  the new (non-reserved, because scanned from the fixtures root) `/error-pages/*` routes.
- Results: route-scanner 24 passing; whole-repo `build:check-types` clean (after rebuilding
  route-scanner's `.d.ts` so dependents see the new `ScanResult`). stack-cli 195 passing.

### Phase 2.2 — fix `ERROR_CONTRACT_MODULE` package name (hyphen bug) ✅

While wiring Phase 4 the generated error-type import failed to resolve in the real build with
`Plugin "jay-stack" not found` — surfaced only once a production build actually compiled an error
page (the Phase 2 tests compare generated *text* to fixtures, so a wrong-but-consistent module
name passed). Root cause: Phase 2 set `ERROR_CONTRACT_MODULE = '@jay-framework/full-stack-component'`
(hyphenated) but the package is actually **`@jay-framework/fullstack-component`** (no hyphen).
Fixed the constant in `builtin-contracts.ts`, `error-contract.ts`'s doc comment, and the Phase 2
fixtures/tests (`page-with-error-contract/page.jay-html.d.ts`, `builtin-error-contract.test.ts`,
`jay-html-contract-ref.test.ts`). Phase 2 compiler tests re-pass (9) against the corrected name.
**Lesson (methodology §Boundary):** a text-only fixture comparison doesn't verify module
*resolution* — the live build in Phase 4 is what caught it, reinforcing "live example up front."

### Phase 4 — manifest + build pipeline ✅

- **Manifest types** (`production-server/lib/types.ts`): added `ErrorPageEntry` (token +
  compiled refs — `serverElementPath`, `routeCssPath?`, `routeHydratePath?`,
  `routeClientBundlePath?`, `cssImports?`, `headMeta?`, `scripts?`, `sharedDeps?`, `trackByMap?`,
  and an optional `slowCache?`) and `RouteManifest.errorPages?: Record<token, ErrorPageEntry>`.
  Exported `ErrorPageEntry` from the package index.
- **Discovery** (`server-code-build.ts`): `discoverServerEntries` now returns `errorPages` from
  `scanRoutes` and adds each error page's co-located `page.ts` (if any) to the server build input,
  so an error-page client bundle can import its component.
- **New pass** (`error-pages-build.ts`): `buildErrorPages` compiles each error page **like a
  single-instance route** into the `_errors/<token>/` subtree — server element (+ css/headMeta/
  scripts/cssImports), hydrate script (+ sharedDeps), and client bundle (hydrate entry + optional
  page.ts) — returning `Record<token, ErrorPageEntry>`. **No slow/instance pre-render runs**
  (Q6: an error page is a pass-through of the injected `error` ViewState; static chrome renders
  from the template without slow data), so `slowCache` is left unset in v1. Each stage is
  independently try/caught so a later-stage failure still yields a usable server-element-only entry.
- **Wiring** (`build-pipeline.ts`): a new "Phase 1b" calls `buildErrorPages` (reusing the shared
  `instanceCtx` + `sharedManifest`) and spreads `errorPages` onto the manifest when non-empty.
- **Exclusions (verified, not re-implemented):** `generateSitemap` and `generateLlmsTxt` iterate
  only `manifest.routes` (✅ `generate-sitemap.ts:16`, `generate-llms-txt.ts:65`); `robots.txt`
  doesn't enumerate pages; internal-link validation already consumes `{ routes }` (Phase 3). Error
  pages never enter `routes[]`, so all four exclusions hold structurally — no extra filtering code.
- **Fixtures + tests**: added `basic-project/src/pages/404/page.jay-html` and `5xx/page.jay-html`
  (both declare the `jay-stack`/`error` headless + bind `{error.status/title/message}`; 404 also
  `forEach="error.details"`). New `build.test.ts` block (5 tests): manifest `errorPages` keyed
  `['404','5xx']`; each has server/hydrate/client paths; artifacts land under `_errors/<token>/`
  and the files exist; `/404` & `/5xx` are absent from `routes` and `matchRequest` returns
  undefined; headMeta captured. production-build 94 passing; production-server 23 passing;
  whole-repo `build:check-types` clean.
- **Build-order note:** compiler-jay-html / full-stack-component / compiler-jay-stack / vite-plugin
  **dist** had to be rebuilt (dependents consume built `.d.ts`/`.js`, not source) — this is also
  what surfaced the Phase 2.2 hyphen bug.

### Phase 5 — renderer + wiring (prod 3 sites, dev 3 sites + catch-all) ✅

- **Shared, target-agnostic helpers** (`stack-server-runtime/lib/error-view-state.ts`, exported
  from the package index): `ErrorInfo`, `resolveErrorPageToken(tokens, status)` (exact → family,
  `undefined` outside 4xx/5xx — v1 scope), `defaultErrorTitle`/`defaultErrorMessage` (per-status
  table → family fallback → generic), and `buildErrorViewState(info, slowViewState = {})` which
  sets `vs.error` + `vs.__jay.error`, defaults `code` to `''` (Phase 2.1 required field), and
  projects `details` to the forEach-able `[{ key, value }]`. 10 unit tests
  (`error-view-state.test.ts`).
- **Production renderer** (`production-server/lib/serve/render-error-page.ts`, exported):
  `renderErrorPage(manifest, artifacts, staticBaseUrl, info)` resolves the token from
  `manifest.errorPages`, streams the compiled server element with the injected error ViewState
  (same streaming shape as `fetch-page-handler`), hydrates the whole error VS as the fast
  contribution, and **always** responds with `info.status`. No `errorPages`/no token/throw →
  built-in plain text. Wired at **3 prod sites**: `main-server.ts` no-match (404) and catch (500,
  with an inner plain-text fallback), and `fetch-page-handler.ts`'s `ServerError`/`ClientError`
  short-circuit (status/title/message/code/details threaded from the outcome).
- **Dev renderer** (`dev-server.ts`): `initErrorPages` scans the reserved folders into a
  `token → JayRoute` map; module-level `_renderDevErrorPage` (installed by `mkDevServer` once
  render deps exist, same pattern as `_watchLinkedFiles`) compiles the resolved error page **on the
  fly** through the normal dev pipeline (`loadPageParts` → `sendResponse`) with the injected error
  VS and **no author phases** (Q6). `sendResponse` gained a trailing `statusCode = 200` param so
  the error response carries the real status. Wired at **3 dev sites**:
  `handleOtherResponseCodes` (now async, takes `url`; `Redirect` unchanged, `ServerError`/
  `ClientError` → designed page) at its 4 call sites, the `mkRoute` exception catch (→ 500, stack
  still logged), and a **new catch-all 404**.
- **Catch-all registration** (`stack-cli/lib/server.ts`): page routes now mount on a dedicated
  `express.Router()` (occupies one app-stack slot before the catch-all), so routes added at runtime
  via `attachRouteRegistrar` still match ahead of the 404. `mkDevServer` exposes
  `errorPageHandler(status): RequestHandler`; `app.use(errorPageHandler(404))` is registered
  **last** (after page router and test-mode endpoints) so it only fires on genuine misses.
- **Exception-safety:** every render path (prod + dev) is wrapped; a throw during error-page
  rendering degrades to plain text (verification criterion 8) — no infinite loop.
- **Fixtures + tests:** prod serve test (`production-build/test/serve.test.ts`, +3) asserts an
  unmatched URL yields a branded 404 (status 404, `Page Not Found`, bound `404 — …`, title tag);
  dev test (`dev-server/test/error-pages.test.ts`, +3, fixture `error-pages/{404,5xx,page}`)
  asserts reserved folders are absent from `routes`, the 404 renders with status 404, and `503`
  falls back to the `5xx` family page with status 503.
- Results: stack-server-runtime +10; production-build serve 30; dev-server **746** (743 + 3);
  stack-cli **195**; whole-repo `build:check-types` exit 0. No `toContain` on code files.
- **Deviation:** the DL sketched `buildErrorViewState(entry, info)` reading `entry.slowCache`;
  implemented as `buildErrorViewState(info, slowViewState = {})` — the caller passes the (v1 empty)
  slow chrome, keeping the helper free of the `ErrorPageEntry`/dev-route split so both targets share
  it verbatim.

### Phase 6 — validation (minimum error pages + suppression) ✅

- `stack-cli/lib/config.ts`: extended `JayConfig.validations` with
  `'allow-no-error-pages'?: boolean` (doc comment mirrors `allow-no-ard` — a project-tree
  concern, so it lives in `.jay`, not a page's `application/jay-validations` script). `loadConfig`
  already passes `validations` through verbatim, so no loader change was needed.
- `stack-cli/lib/validate.ts`: after the ARD block, a new Tier-1 check scans the pages root with
  `scanRoutes(scanDir, { jayHtmlFilename: 'page.jay-html', compFilename: 'page.ts' })` and collects
  the `errorPages` tokens. `404` is satisfied by an exact `404` **or** the `4xx` family; `5xx` only
  by a `5xx` family page. Missing tokens produce a single warning
  (`file: 'src/pages'`, message naming the missing tokens, suggestion pointing to
  `designer/error-pages-guide.md` and the `.jay` suppression). Suppressed when
  `config.validations?.['allow-no-error-pages'] === true`.
- **Fixtures** (`test/fixtures/validate/`): `error-pages-missing` (plain page → warns 404+5xx),
  `error-pages-present` (exact `404`+`5xx` → silent), `error-pages-family` (`4xx`+`5xx` → silent,
  proves family covers 404), `error-pages-suppressed` (plain page + `.jay allow-no-error-pages` →
  silent).
- **Tests:** `test/validate-error-pages.test.ts` (4 tests) mirrors `validate-ard-suppression.test.ts`:
  warns for both tokens, silent when present, family-covers-404, suppressed. All pass.
- Results: new suite 4/4; `validate.test.ts` 92, ARD 7+2, coverage 22 — no regressions (existing
  fixtures with no error pages still pass; those suites assert specific warnings, not counts).
  `yarn build` (stack-cli) clean incl. DTS. No `toContain` on code files.
- Satisfies verification criterion 7.

### Phase 7 — agent-kit guides ✅

- **Designer guide** (`agent-kit-template/designer/error-pages-guide.md`): reserved `pages/<status>/`
  convention, status-token grammar (exact/family), exact→family→plain-text resolution, the
  built-in `jay-stack`/`error` headless import, the full binding table
  (`error.status`/`title`/`message`/`code` + `forEach="error.details"`), the no-fast/slow-phase
  pass-through rule (Q6), and the `allow-no-error-pages` suppression. Folders are explicitly called
  out as **not navigable** (absent from sitemap/links).
- **Developer guide** (`agent-kit-template/developer/error-pages-guide.md`): returning errors
  (`notFound`/`badRequest`/`unauthorized`/`forbidden`/`clientError4xx`/`serverError5xx`), the
  `{ title?, code?, details? }` options bag → `error.*` binding table (verified against
  `render-results.ts:18` — `details?: Record<string, unknown>`), which page renders per status, and
  the `RenderPipeline` factory parity. Uncaught exception → 500 → `5xx` noted.
- **Cross-links:** `designer/INSTRUCTIONS.md` and `developer/INSTRUCTIONS.md` reference tables each
  gained an `error-pages-guide.md` row; `developer/render-results.md` Error Results section now shows
  the options bag and links both guides; `designer/routing.md` gained a "Reserved Status Folders"
  note so routing readers learn `404`/`5xx` are reserved.
- Satisfies DL §9 and verification criterion 6's guidance surface.

### Phase 8 — example + live render tests ✅

- **Example pages** (`examples/jay-stack/smoke-test/src/pages/`): added `404/page.jay-html` (title,
  meta description, `error.status/title/message` bindings, `forEach="error.details"`, "Go home" link)
  and `5xx/page.jay-html` (same shape, no forEach/meta) — both importing the built-in `jay-stack`/`error`
  headless. This also clears the Phase 6 validation nudge for the example.
- **Live render tests** (`test/smoke.test.ts`): added to **both** the `dev mode` and
  `production self-hosted` describes — an unmatched URL (`/does-not-exist/`) renders the branded 404
  (status 404, `404 — Page Not Found`, `<title>Page Not Found</title>`, "Go home") and passes
  `expectPage` (valid doctype, no raw "client/server error" leak). Reserved folders are confirmed
  non-navigable: `/404/` itself resolves through the error page as a 404 (not a 200 page render), and
  the production sitemap excludes `/404` and `/5xx`.
- **5xx trigger page** (`src/pages/error-500/`): a page whose slow phase renders static chrome and
  whose **fast phase returns `serverError5xx(500, …, { title, details })`**, so every request resolves
  through `pages/5xx` (family fallback) with status 500 — exercising criterion 2's "renders for
  `serverError5xx`" path end-to-end. Linked from the home-page nav. Dev + prod smoke tests assert
  status 500, the branded `500 — Something went wrong`, the custom message, and that the page's own
  body never renders.
- Results: full smoke suite **77/77** (dev + prod self-hosted + prod CDN, real build + spawned
  servers). Confirms verification criteria 1, 2, 4 end-to-end across dev and prod targets.
- **Deviation:** the DL sketched the example test as `toEqual(prettifyHtml(...))` on the full HTML.
  Implemented as the smoke test's established live-server `toMatch`-on-response-body pattern instead:
  a live SSR response carries per-build hydration-bundle hashes and runtime glue, so full-document
  equality would be brittle and off-pattern here. Exact-HTML `toEqual(prettifyHtml())` coverage lives
  at the **compiler** level (Phase 2's `.d.ts`/output fixtures); the example test's job is to prove the
  wired end-to-end render, which `toMatch` on status + branded markers does directly.

## Deviations from Original Design (summary)

1. **`buildErrorViewState(info, slowViewState = {})`** (Phase 5) instead of the sketched
   `buildErrorViewState(entry, info)` — the caller passes the (v1 empty) slow chrome, keeping the
   helper free of the `ErrorPageEntry`/dev-route split so prod and dev share it verbatim.
2. **`code` restored to the Error contract** (Phase 2.1) after Q7 dropped it — the outcome monads
   already carried `code?`, so surfacing it cost nothing and avoided an asymmetric field drop;
   `buildErrorViewState` defaults it to `''`.
3. **`ERROR_CONTRACT_MODULE` package name** fixed to `@jay-framework/fullstack-component` (no hyphen)
   (Phase 2.2) — a typo caught by the build, not a design change.
4. **Example render test uses live-server `toMatch`** (Phase 8) rather than
   `toEqual(prettifyHtml(...))` — see Phase 8 deviation above; exact-HTML equality lives at the
   compiler fixture level.

All 8 verification criteria are met: 1/2/4 by the Phase 8 smoke tests (dev + prod); 3/5 by the
scanner + renderer unit/fixture tests (Phases 3–5); 6 by `render-results` + guides (Phases 1, 7);
7 by the validation suite (Phase 6); 8 by the exception-safety fallback wired at every render site
(Phase 5).
