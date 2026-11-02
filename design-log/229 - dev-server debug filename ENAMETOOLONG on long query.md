# 229 - dev-server: debug filename built from URL+query → `ENAMETOOLONG` 500 on long query strings

Status: **[Design]** — bug + proposed fix, not yet implemented.

Area: `packages/jay-stack/dev-server`. Found 2026-11-02 while serving a Jay dev server behind a proxy that authenticates by passing a session token as a **query parameter** (a Wix remote-machine sandbox: requests arrive as `/<route>?remoteMachineSessionP=<~800-char token>`).

## Decisions for the Implementer (TL;DR)

1. **Bug:** the dev server writes a per-request debug artifact whose filename is derived from the request URL **including the query string**. A long query (e.g. an ~800-char auth token) makes the filename exceed the OS limit (`NAME_MAX` = 255) → `fs.writeFile` throws `ENAMETOOLONG` → the request returns **500**.
2. **Fix:** derive the debug filename from the **route/pathname only** (strip the query), and sanitize + length-cap as defense-in-depth. Two identical blocks need the change.
3. **Location:** `packages/jay-stack/dev-server/lib/dev-server.ts`, both "Save generated page to build folder for debugging" blocks (search `'debug', 'client-entry'`; ≈L1090–1095 and ≈L1200–1205).
4. **Blast radius is small and local** — only the debug-artifact filename; no change to what's served. Once fixed, a query-bearing page request (`/route?token=…`) renders normally instead of 500ing.

## Problem (symptom)

Any request to a page route with a long query string 500s in dev. Server log shows `ENAMETOOLONG` from `fs.writeFile`. The response body is never produced because the throw happens during the render path's debug write, not in a route the caller controls.

This is not hypothetical: a dev server fronted by a proxy that carries auth as a query param (here `?remoteMachineSessionP=<token>`, ~800 chars) is unreachable on every page route. We had to work around it by priming the proxy's session cookie through a **non-page** asset (`/@vite/client?…`, served by Vite middleware before this code runs) so the real page requests carry the token as a cookie instead of a query.

## Root cause

`packages/jay-stack/dev-server/lib/dev-server.ts` — two identical blocks:

```js
// Save generated page to build folder for debugging
const pageName = !url || url === '/' ? 'index' : url.replace(/^\//, '').replace(/\//g, '-');
const clientScriptDir = path.join(options.buildFolder, 'debug', 'client-entry');
await fs.mkdir(clientScriptDir, { recursive: true });
await fs.writeFile(path.join(clientScriptDir, `${pageName}.html`), pageHtml, 'utf-8');
```

`url` is passed in from the request handler as `req.originalUrl.replace(options.publicBaseUrlPath, '')` (≈L535), and `req.originalUrl` **includes the query string**. `pageName` only strips the leading slash and swaps `/`→`-`; it does **not** remove the query. So for

```
/aiditor?remoteMachineSessionP=<~800 chars>
```

`pageName` becomes `aiditor?remoteMachineSessionP=<~800 chars>` and the target filename `${pageName}.html` is ~820 chars — over `NAME_MAX` (255) → `ENAMETOOLONG`. Even *short* query params are a latent problem: they produce spurious, duplicate debug files (`index.html`, `?x=1.html`, …) and embed arbitrary characters into a path.

## Design (fix)

Derive the debug filename from the pathname only, mirroring the `split('?')[0]` pattern already used elsewhere in this file (≈L644, ≈L1665), and harden against long/odd path segments. Apply to **both** blocks:

```js
// Save generated page to build folder for debugging
const routePath = (url || '/').split('?')[0];                 // drop the query string
const pageName =
  routePath === '/' || routePath === ''
    ? 'index'
    : routePath
        .replace(/^\//, '')
        .replace(/\//g, '-')
        .replace(/[^\w.-]/g, '_')                             // keep filesystem-safe chars
        .slice(0, 200);                                       // stay under NAME_MAX
const clientScriptDir = path.join(options.buildFolder, 'debug', 'client-entry');
await fs.mkdir(clientScriptDir, { recursive: true });
await fs.writeFile(path.join(clientScriptDir, `${pageName}.html`), pageHtml, 'utf-8');
```

Optional follow-ups (not required for the fix):
- Factor the two blocks into one helper (`writeDebugPage(buildFolder, url, html)`), so they can't drift.
- The debug write runs on **every** dev request; consider gating it behind the verbose/debug flag (DL#83) to avoid per-request disk writes.

## Reproduce

```sh
# any Jay Stack project
npm run dev                         # jay-stack dev, e.g. http://localhost:3000
curl -i "http://localhost:3000/?x=$(python3 -c 'print("a"*600)')"
# -> HTTP 500; server log: ENAMETOOLONG from fs.writeFile in the debug block
```

Real-world trigger: `curl -i "http://localhost:3000/aiditor?remoteMachineSessionP=<long token>"`.

## Verification criteria

1. `GET /?x=<600 a's>` returns the page (200), not 500; no `ENAMETOOLONG`.
2. `GET /aiditor?remoteMachineSessionP=<~800-char token>` renders normally.
3. The debug artifact is written once per **route** (`build/dev/debug/client-entry/aiditor.html`), with no query in the filename, and repeated requests to the same route with different queries don't create extra files.
4. Existing behavior for `/` (→ `index.html`) and nested routes (`/products/x` → `products-x.html`) is unchanged.

## Trade-offs / notes

- Deriving from the pathname means two requests to the same route with different queries overwrite the same debug file — correct and intended (the artifact is per route, not per query).
- The `slice(200)`/sanitize is belt-and-suspenders against pathological routes; the pathname-only change alone fixes the reported `ENAMETOOLONG`.
- No public API or served-output change; purely the debug-artifact naming.
