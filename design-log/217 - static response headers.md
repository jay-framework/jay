# DL#217 — Static response headers (CORS + content-type for `.well-known`)

**Status: [Implemented]** — follow-up to [DL#214](214%20-%20agent-discovery%20files.md) (agent-discovery
files) and [DL#216](216%20-%20agent-skills%20publishing.md) (agent-skills). Makes Jay's static
serving emit the response headers the agent-readiness specs require, in **both** dev and
production, with **zero config**.

---

## Decisions for the Implementer (TL;DR)

- **Correct defaults, not a feature.** `SKILL.md` → `text/markdown`, `.tar.gz`/`.gz` →
  `application/gzip`, and `Access-Control-Allow-Origin: *` for everything under `/.well-known/`.
  The agent-skills-discovery and api-catalog specs require cross-origin reads with correct
  content-types; shipping those as built-in defaults is a correctness fix, not a user preference.
- **This is the shared root cause** behind two features (DL#195 "name the shared cause before the
  second workaround"): DL#214's ARD and DL#216's skills both need the same CORS/content-type
  behavior from the same two serving paths. Fix it once in the serving layer rather than
  per-feature.
- **Two targets, same rule** (no shared package — different runtimes):
  - **Prod**: `production-server/lib/serve/fetch-static-handler.ts` — a `fetch`-style `Response`.
    Add `.md`/`.tar.gz`/`.gz` to `MIME_TYPES`; set the CORS header when the pathname is under
    `/.well-known/`.
  - **Dev**: `stack-cli/lib/server.ts` — `express.static(..., { setHeaders })`. Set the CORS
    header + explicit content-type for `.md`/`.gz` on `/.well-known/` responses.
  - Both cite this DL so a grep for one finds the other (keeps the rule from drifting).
- **General user-customizable header mechanism: NOT built (user decision, YAGNI).** We considered
  a declarative `headers:` config-map (Netlify `_headers` / Vercel model — `glob → {set/add}`) and
  a programmatic hook. Neither ships now — there is exactly one concrete need (the `.well-known`
  defaults) and it's spec-mandated, so it belongs in the serving layer, not a config surface.
  **If** a second, genuinely user-specific need appears (custom cache-control, security headers,
  CORS for an export route), prefer the **declarative config-map over a code hook**: header policy
  is almost always declarative, and a map applies identically across dev/prod/build, whereas a hook
  must be wired into all three targets and invites plugins contending for headers. Revisit then —
  don't pre-build it.

## Problem

DL#214 fixed *serving* `/.well-known/*` in dev (`dotfiles: 'allow'`) but not the *headers*. A
compliant agent reads these resources **cross-origin** and keys on content-type:

- Without `Access-Control-Allow-Origin: *`, a browser-based agent's fetch is blocked by CORS.
- `SKILL.md` served as `application/octet-stream` (prod `MIME_TYPES` has no `.md`) is not treated
  as `text/markdown`; `.tar.gz` archives likewise lacked a content-type.

Both are invisible to human review and to Jay's own validators — they only surface when a real
agent (or a cross-origin fetch) tries to consume the site.

## Design

Minimal, targeted. No new concepts, no config.

### Prod — `fetch-static-handler.ts`

```ts
const MIME_TYPES = {
  // …existing…
  '.md': 'text/markdown',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
};
// `.tar.gz` resolves via its last extension `.gz` → application/gzip.

// when building the Response:
const headers = { 'Content-Type': …, 'Content-Length': …, 'Cache-Control': … };
if (pathname.startsWith('/.well-known/')) headers['Access-Control-Allow-Origin'] = '*';
```

### Dev — `server.ts`

```ts
express.static(publicPath, {
  dotfiles: 'allow',
  setHeaders: (res, filePath) => {
    // express.static serves /.well-known/* at the same URL path; gate on the served file path.
    if (filePath.includes(`${path.sep}.well-known${path.sep}`)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (filePath.endsWith('.md')) res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      if (filePath.endsWith('.gz')) res.setHeader('Content-Type', 'application/gzip');
    }
  },
});
```

(`express.static` already maps `.md`/`.gz` reasonably via `mime`, but we set them explicitly so dev
and prod agree byte-for-byte on the headers that matter.)

## Verification criteria

- Prod handler returns `text/markdown` + `Access-Control-Allow-Origin: *` for a
  `/.well-known/agent-skills/<n>/SKILL.md`, and `application/gzip` for a `.tar.gz`.
- Prod handler does **not** add CORS for a normal asset (e.g. `/index.html`).
- Dev `express.static` with `setHeaders` sets CORS + content-type on `/.well-known/*` and nothing
  extra elsewhere (asserted via the existing `well-known-serving.test.ts` harness).

## Scope — what this does NOT handle

- **User-customizable headers** (config-map / hook) — declined above; revisit on a real second
  need, preferring the declarative map.
- **Non-`.well-known` CORS** — out of scope; nothing else in Jay needs cross-origin static reads.
