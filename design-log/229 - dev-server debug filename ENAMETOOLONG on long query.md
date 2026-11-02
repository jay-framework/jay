# 229 - dev-server: debug filename built from URL+query → `ENAMETOOLONG` 500 on long query strings

Status: **[Implemented]** 2026-11-02 — see §Implementation results. The owner review reframed the fix (gate + best-effort + DRY as primary; pathname-only filename sanitization as defense-in-depth). Decision: **keep** the debug artifact, behind `verbose`.

Repo note: this lives in the **jay mono repo** (`packages/jay-stack/dev-server`), not a Wix repo — the bug merely surfaced under Wix remote-machine hosting.

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

`pageName` becomes `aiditor?remoteMachineSessionP=<~800 chars>` and the target filename `${pageName}.html` is ~820 chars — over `NAME_MAX` (255) → `ENAMETOOLONG`. Even _short_ query params are a latent problem: they produce spurious, duplicate debug files (`index.html`, `?x=1.html`, …) and embed arbitrary characters into a path.

## Design (fix)

Derive the debug filename from the pathname only, mirroring the `split('?')[0]` pattern already used elsewhere in this file (≈L644, ≈L1665), and harden against long/odd path segments. Apply to **both** blocks:

```js
// Save generated page to build folder for debugging
const routePath = (url || '/').split('?')[0]; // drop the query string
const pageName =
  routePath === '/' || routePath === ''
    ? 'index'
    : routePath
        .replace(/^\//, '')
        .replace(/\//g, '-')
        .replace(/[^\w.-]/g, '_') // keep filesystem-safe chars
        .slice(0, 200); // stay under NAME_MAX
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

## Owner review & challenge (2026-11-02)

I take this over and push back on the framing. The diagnosis is right, but the proposed fix treats the **symptom** (this filename, this trigger) and parks the two changes that actually fix the **class** as "optional follow-ups." They should be the primary fix.

**C1 — A debug-only side effect must never be able to fail a real request.** The write sits inside the request handler's `try/catch` (`dev-server.ts` L534), so _any_ failure of `fs.writeFile`/`fs.mkdir` becomes a 500 error page — not just a long filename. Sanitizing the name closes one door; EACCES, ENOSPC, a read-only `buildFolder`, a deep `buildFolder` hitting `PATH_MAX` (vs `NAME_MAX`), or an mkdir race all still 500 a page render. **A best-effort `try/catch` that swallows and logs would have prevented the reported 500 on its own**, independent of the filename.

**C2 — Don't write per request at all by default.** The artifact is a write-only debugging aid — ✅ verified nothing reads `build/dev/debug/client-entry/` (only a passing mention in `vite-factory.ts:154`). Awaiting a disk write on every page render is a hot-path I/O cost and a standing liability. We already have `options.logLevel` (`'silent' | 'info' | 'verbose'`, DL#83). **Gate the write behind `verbose`.** In normal `info` dev there is then no write, so the `ENAMETOOLONG` cannot occur regardless of query length.

**C3 — DRY is not optional here.** The DL itself says "two identical blocks need the change" — that is the defect waiting to recur. Extract one helper so the gate + try/catch + naming have a single home and cannot drift.

**C4 — Make it testable.** Verification is curl-only. Split out a pure `debugPageName(url)` and unit-test it; the async write/gate is a thin wrapper.

### Revised fix (primary)

```ts
/** Debug artifact name from a route path: query stripped, fs-safe, length-capped. Pure → unit-tested. */
export function debugPageName(url: string | undefined): string {
  const routePath = (url || '/').split('?')[0];
  if (routePath === '/' || routePath === '') return 'index';
  return (
    routePath
      .replace(/^\//, '')
      .replace(/\//g, '-')
      .replace(/[^\w.-]/g, '_') // fs-safe (also turns [slug] → _slug_)
      .slice(0, 200) || 'index' // guard a path that sanitizes to empty
  );
}

/** Best-effort, verbose-only. A debug write must never fail a page request. */
async function writeDebugPage(options: DevServerOptions, url: string | undefined, html: string) {
  if (options.logLevel !== 'verbose' || !options.buildFolder) return; // C2 gate (DL#83)
  try {
    const dir = path.join(options.buildFolder, 'debug', 'client-entry');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${debugPageName(url)}.html`), html, 'utf-8');
  } catch (e) {
    getLogger().info(`[dev] debug page write skipped: ${(e as Error).message}`); // C1 swallow
  }
}
```

Both blocks collapse to `await writeDebugPage(options, url, pageHtml);`.

### What changes vs the original proposal

- Filename sanitization is **kept**, but demoted to defense-in-depth inside the helper — it is no longer load-bearing, because the gate means no write in normal dev and the try/catch means a write failure never 500s.
- **Verification criterion #3 changes:** by default (`info`) **no** debug artifact is written; it appears only under `-v/--verbose`. Criteria #1/#2 (no 500, page renders) hold in _both_ modes. Add a unit test for `debugPageName`: long query, special chars, `/`, trailing slash, nested, `[slug]`, empty-after-sanitize.

### Residual question

Is the per-route debug HTML still useful enough to keep behind `verbose`, or should it be deleted outright? I'd keep it (cheap under a flag, occasionally handy), but if no one has opened one of these files in months, deleting both blocks is the smallest fix of all. _Open — owner's call._

**Resolved (2026-11-02):** keep it — it helps diagnose a range of rendering/bundling bugs. Gated behind `verbose`.

## Implementation results (2026-11-02)

Implemented the revised design in `packages/jay-stack/dev-server/lib/dev-server.ts`:

- **`debugPageName(url)`** (exported, pure) — route-path only (`split('?')[0]`), `/`→`-`, non-fs-safe→`_`, `.slice(0, 200)`, `/`/empty→`index`, with a trailing `|| 'index'` guard.
- **`writeDebugPage(options, url, html)`** — returns early unless `options.logLevel === 'verbose'` (DL#83) and `buildFolder` is set (**C2 gate**); wraps `mkdir`+`writeFile` in `try/catch` that logs and swallows (**C1 best-effort**).
- Both identical debug blocks replaced by `await writeDebugPage(options, url, pageHtml);` (**C3 DRY**).
- Tests (**C4**): `test/debug-page-name.test.ts` — 6 cases (long query dropped; `/`/empty/undefined/`/?x`→`index`; nested; `[slug]`/spaces/`:`→`_`; trailing slash; 200-char cap). 12/12 green with the sibling bracket-URL suite; package `tsc` clean.

**Deviation from the original proposal:** filename sanitization is retained but no longer load-bearing — the gate means no write in normal dev, and the try/catch means a write failure never 500s a request. Verification criterion #3 is amended: by default (`info`) **no** debug artifact is written; it appears only under `-v/--verbose`. Criteria #1/#2/#4 hold.

**Agent-kit:** added a "Verbose diagnostics (`-v`)" note to `stack-cli/agent-kit-template/devops/INSTRUCTIONS.md` documenting that verbose writes the per-route client HTML to `build/.../debug/client-entry/`, off by default, best-effort, query-stripped filename.
