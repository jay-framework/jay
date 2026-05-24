# DL#141: Fast-Phase Request Context (Cookies & Response Headers)

## Background

The wix-members package needs two framework capabilities that don't exist yet: reading HTTP cookies during the fast phase, and setting HTTP response headers (specifically `Cache-Control`) from the fast phase. A third requirement — returning redirects/errors from the fast phase — is already fully supported via `redirect3xx()`, `forbidden()`, etc. (DL#54).

The fast phase already receives per-request data: `PageProps` (language, url), path params, and `RequestQuery` (DL#117). But the HTTP request is not exposed beyond these. And `PhaseOutput` carries data back (ViewState, carryForward, headTags) but has no mechanism for response headers.

### Use cases

1. **Login-protected page**: The fast phase reads a member auth token from a cookie. If invalid/missing, it returns `redirect3xx(302, '/login')`. If valid, it renders member-specific content.

2. **Cache-Control on member pages**: When a page renders with member-specific data, the component's fast phase sets `Cache-Control: no-store` so the response isn't cached by CDN or browser.

3. **Login indicator on regular pages**: Purely client-side (interactive phase reads cookies via `document.cookie`). Regular pages stay cacheable. No framework changes needed for this case.

## Problem

### 1. No cookie access in fast phase

`PageProps` contains only `language` and `url`. The HTTP request object (`req`) exists in dev-server and production-server handlers but isn't forwarded to the fast phase. Components wanting to read cookies have no path to do so.

Current flow:

```
HTTP Request (has cookies in headers)
    ↓
dev-server.ts / main-server.ts (has req object)
    ↓
renderFastChangingData(pageParams, pageProps, ..., query)  ← no cookies
    ↓
compDefinition.fastRender(props, ...)  ← props has no cookies
```

### 2. No response headers from fast phase

`PhaseOutput` returns `{ kind, rendered, carryForward, headTags? }`. There's no field for response headers. The response status/headers are set by the server layer after the fast phase completes, but only with hardcoded values (`200`, `Content-Type: text/html`).

Components can influence `<head>` content via `headTags` (DL#127), but `headTags` are HTML elements injected into the page body — they're not HTTP headers.

## Questions and Answers

**Q1: Should cookies be a separate prop (like `query`) or part of a broader request context?**

A1: Separate prop. Following the DL#117 pattern, `cookies` is a `Record<string, string>` intersected into the fast phase props type. This keeps the API consistent with `query` — both are per-request data available only in the fast phase. Adding a broad `request` object would leak HTTP concerns into the component model.

**Q2: Should cookies be available in the slow phase?**

A2: No. Same reasoning as query params (DL#117) — slow phase is cached/SSG, cookies are per-request. Including cookies would bust the cache or serve stale content.

**Q3: Should response headers be on `PhaseOutput` (like `headTags`) or a separate mechanism?**

A3: On `PhaseOutput`, in the existing `options` bag. This follows the `headTags` pattern exactly — optional metadata that flows through the render pipeline and gets applied by the server layer. The `phaseOutput()` helper already accepts `options?: { headTags?: HeadTag[] }`.

**Q4: Should we support setting cookies (Set-Cookie response header) from the fast phase?**

A4: Not in this design. `Set-Cookie` has complex semantics (domain, path, secure, httpOnly, sameSite, maxAge). The wix-members use case only needs to _read_ cookies, not write them. Setting cookies can be added later via a typed `responseCookies` field if needed.

**Q5: How does this interact with the DL#139 fetch handler?**

A5: DL#139 is implemented. The production server now uses Fetch API handlers: `fetchPageRequest()` in `fetch-page-handler.ts` returns `Response` with `ReadableStream`, and `createJayFetchHandler()` in `@jay-framework/jay-fetch-handler` receives the full `Request` object. Cookies are parsed from `request.headers.get('cookie')` at the handler level and passed down to `fetchPageRequest()` → `renderFastChangingData()`. Response headers from `PhaseOutput` are spread into `new Response(stream, { headers: { ...responseHeaders } })`. The old Node.js handlers (`page-handler.ts`) are kept but no longer used by `main-server.ts` — they don't need updating.

**Q6: Should response headers merge across multiple page parts (like headTags do)?**

A6: Last-write-wins, same ordering as headTags: headless components first (ordered by template position), page component last. For `Cache-Control` specifically, the most restrictive value should win — if any component says `no-store`, the page is `no-store`. But implementing "most restrictive" requires Cache-Control-specific logic. Simpler: last-write-wins. The page component runs last and can always override. If a plugin needs `no-store`, the plugin sets it and the page component shouldn't override it. In practice: collisions are unlikely for response headers, and when they occur the page author has final say.

**Q7: What about the `handleOtherResponseCodes` path — does it need response headers?**

A7: No. Redirects and errors are short-circuit responses with their own status codes and headers. Response headers from `PhaseOutput` only apply to successful (200) responses. A `redirect3xx` already sets `Location` header. A `forbidden` sets status 403. Adding `Cache-Control` to error responses is not a use case.

## Design

### 1. Request cookies in fast phase

New type `RequestCookies`, intersected into `RenderFast` props alongside `RequestQuery`:

```typescript
// jay-stack-types.ts
export interface RequestCookies {
  cookies: Record<string, string>;
}

export type RenderFast<Services, PropsT, FastViewState, FastCarryForward> = (
  props: PropsT & RequestQuery & RequestCookies,
  ...services: Services
) => Promise<FastRenderResult<FastViewState, FastCarryForward>>;
```

Usage in a component:

```typescript
.withFastRender(async (props, carryForward, memberService) => {
    const token = props.cookies['session-token'];
    if (!token) return redirect3xx(302, '/login');

    const member = await memberService.validate(token);
    if (!member) return redirect3xx(302, '/login');

    return phaseOutput({ memberName: member.name }, {}, {
        responseHeaders: { 'Cache-Control': 'no-store' },
    });
})
```

### 2. Cookie parsing

Both server entry points parse cookies from the request and pass to `renderFastChangingData`.

**Dev server** (Express `req`):

```typescript
// dev-server.ts — inside mkRoute handler
const cookies: Record<string, string> = {};
const cookieHeader = req.headers.cookie;
if (cookieHeader) {
  for (const pair of cookieHeader.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(rest.join('='));
  }
}
```

**Production server** (Fetch `Request` in `createJayFetchHandler`):

```typescript
// jay-fetch-handler/lib/index.ts — inside the returned handler
const cookieHeader = request.headers.get('cookie');
const cookies = parseCookies(cookieHeader);
// pass cookies to fetchPageRequest(match, manifest, url, artifacts, staticBaseUrl, cookies)
```

No cookie-parser middleware dependency — the format is simple enough to parse inline. A shared `parseCookies(header: string | null): Record<string, string>` helper avoids duplicating the logic between dev-server (Express `req.headers.cookie`) and production server (Fetch `request.headers.get('cookie')`).

### 3. Response headers from fast phase

Extend `PhaseOutput` and `phaseOutput()`:

```typescript
// jay-stack-types.ts
export interface PhaseOutput<ViewState extends object, CarryForward = {}> {
  kind: 'PhaseOutput';
  rendered: ViewState;
  carryForward: CarryForward;
  headTags?: HeadTag[];
  responseHeaders?: Record<string, string>;
}

// render-results.ts
export function phaseOutput<ViewState extends object, CarryForward = {}>(
  rendered: ViewState,
  carryForward: CarryForward,
  options?: { headTags?: HeadTag[]; responseHeaders?: Record<string, string> },
): PhaseOutput<ViewState, CarryForward> {
  return {
    kind: 'PhaseOutput',
    rendered,
    carryForward,
    ...(options?.headTags && { headTags: options.headTags }),
    ...(options?.responseHeaders && { responseHeaders: options.responseHeaders }),
  };
}
```

### 4. Response header collection in the pipeline

In `fast-changing-runner.ts`, collect `responseHeaders` from all page parts and headless instances, same pattern as `headTags`:

```typescript
// fast-changing-runner.ts
const responseHeaderSources: Record<string, string>[] = [];

// After each fastRenderedPart:
if (fastRenderedPart.responseHeaders) {
  responseHeaderSources.push(fastRenderedPart.responseHeaders);
}

// At the end:
const result = phaseOutput(fastViewState, fastCarryForward);
if (responseHeaderSources.length > 0) {
  result.responseHeaders = Object.assign({}, ...responseHeaderSources);
}
```

Last-write-wins: later components override earlier ones. Page component runs after headless components, so it has final say.

### 5. Response header application in server handlers

**Dev server** (`handleCachedRequest`, `handlePreRenderRequest`):

```typescript
const renderedFast = await renderFastChangingData(...);
if (renderedFast.kind !== 'PhaseOutput') {
    handleOtherResponseCodes(res, renderedFast);
    return;
}

// Apply response headers before sending body
if (renderedFast.responseHeaders) {
    for (const [key, value] of Object.entries(renderedFast.responseHeaders)) {
        res.setHeader(key, value);
    }
}
```

**Production server** (`fetchPageRequest` in `fetch-page-handler.ts`):

```typescript
const extraHeaders = (fastResult as any).responseHeaders || {};
return new Response(stream, {
  headers: { 'Content-Type': 'text/html; charset=utf-8', ...extraHeaders },
});
```

### 6. Data flow summary

```
HTTP Request
  │
  ├─ dev-server: req.headers.cookie        ──┐
  ├─ fetch handler: request.headers.get('cookie') ──┤── parseCookies() → Record<string, string>
  ├─ parse query from URL → Record<string, string>  (existing, DL#117)
  │
  ▼
renderFastChangingData(pageParams, pageProps, ..., query, cookies)
  │
  ├─ props = { ...pageProps, ...pageParams, query, cookies }
  │
  ▼
compDefinition.fastRender(props, carryForward, ...services)
  │
  ├─ Component reads props.cookies['session-token']
  ├─ Returns redirect3xx(302, '/login')  ← short-circuit
  │   OR
  ├─ Returns phaseOutput(viewState, cf, { responseHeaders: { 'Cache-Control': 'no-store' } })
  │
  ▼
Server handler
  ├─ If redirect/error → short-circuit response (existing)
  ├─ If PhaseOutput → apply responseHeaders to HTTP response, then render
  │   dev-server: res.setHeader(key, value)
  │   fetch handler: new Response(stream, { headers: { ...responseHeaders } })
```

### 7. Shared cookie parser

Both dev-server and fetch handler need to parse `Cookie` headers. Extract a shared helper into `stack-server-runtime`:

```typescript
// stack-server-runtime/lib/cookies.ts
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(rest.join('='));
  }
  return cookies;
}
```

### 8. `renderFastChangingData` signature change

```typescript
export async function renderFastChangingData(
  pageParams: object,
  pageProps: PageProps,
  carryForward: object,
  parts: Array<DevServerPagePart>,
  instancePhaseData?: InstancePhaseData,
  forEachInstances?: ForEachHeadlessInstance[],
  headlessInstanceComponents?: HeadlessInstanceComponent[],
  mergedSlowViewState?: object,
  query: Record<string, string> = {},
  cookies: Record<string, string> = {}, // ← new
): Promise<AnyFastRenderResult>;
```

## Implementation Plan

### Phase 1: Types

**`full-stack-component/lib/jay-stack-types.ts`**:

1. Add `RequestCookies` interface
2. Intersect `RequestCookies` into `RenderFast` props type
3. Add `responseHeaders?: Record<string, string>` to `PhaseOutput`

**`full-stack-component/lib/render-results.ts`**: 4. Add `responseHeaders` to `phaseOutput()` options

### Phase 2: Cookie parsing and forwarding

**`stack-server-runtime/lib/fast-changing-runner.ts`**:

1. Add `cookies` parameter to `renderFastChangingData`
2. Merge `cookies` into `partProps` for page-level parts
3. Merge `cookies` into instance props (static and forEach instances)
4. Collect `responseHeaders` from all parts and instances (same pattern as headTags)
5. Attach merged `responseHeaders` to the returned `PhaseOutput`

**`dev-server/lib/dev-server.ts`**: 6. Parse cookies from `req.headers.cookie` in `mkRoute` handler 7. Pass `cookies` to `handleCachedRequest`, `handlePreRenderRequest`, `handleClientOnlyRequest` 8. Each handler passes `cookies` to `renderFastChangingData` 9. Apply `renderedFast.responseHeaders` via `res.setHeader` before sending response body

**`production-server/lib/serve/fetch-page-handler.ts`**: 10. Add `cookies` parameter to `fetchPageRequest` 11. Pass cookies to `renderFastChangingData` 12. Apply `responseHeaders` in the `new Response(stream, { headers })` constructor

**`jay-fetch-handler/lib/index.ts`**: 13. Parse cookies from `request.headers.get('cookie')` using shared `parseCookies` 14. Pass cookies to `fetchPageRequest`

### Phase 3: Tests

**`stack-server-runtime/test/fast-changing-runner.test.ts`** (extend):

1. Test that cookies appear in fast render props
2. Test that empty cookies default to `{}`
3. Test that responseHeaders from phaseOutput are collected
4. Test that responseHeaders from multiple parts merge (last-write-wins)

**`full-stack-component/test/`** (extend): 5. Type-level test: `RenderFast` callback has `cookies` in props 6. Type-level test: `RenderSlowly` callback does NOT have `cookies`

### Phase 4: Agent-kit and documentation

**`packages/jay-stack/stack-cli/agent-kit-template/developer/`** (developer role):

1. Document `props.cookies` in the fast phase section
2. Document `responseHeaders` in the `phaseOutput()` options section
3. Show the login-protected page pattern (cookies + redirect + Cache-Control)

**`packages/jay-stack/stack-cli/agent-kit-template/plugin/`** (plugin role): 4. Document how a headless plugin component can read cookies and set response headers 5. Show the reusable login-gate component pattern

**General docs** (`docs/`): 6. Update fast-phase rendering docs with cookies and response headers 7. Add a "login-protected pages" recipe/example

## Examples

### Login-protected page

```typescript
export const page = makeJayStackComponent<ProtectedPageContract>()
  .withServices(MEMBER_SERVICE)
  .withFastRender(async (props, memberService) => {
    const token = props.cookies['session-token'];
    if (!token) return redirect3xx(302, '/login');

    const member = await memberService.validate(token);
    if (!member) return redirect3xx(302, '/login');

    return phaseOutput(
      { memberName: member.name, memberAvatar: member.avatar },
      {},
      { responseHeaders: { 'Cache-Control': 'no-store' } },
    );
  })
  .withInteractive((refs, viewState) => {
    /* ... */
  });
```

### Headless login-gate component (reusable plugin)

```typescript
export const loginGate = makeJayStackComponent<LoginGateContract>()
  .withServices(MEMBER_SERVICE)
  .withFastRender(async (props, memberService) => {
    const token = props.cookies['session-token'];
    const member = token ? await memberService.validate(token) : null;

    if (!member) return redirect3xx(302, props.loginPageUrl || '/login');

    return phaseOutput(
      { isLoggedIn: true, memberName: member.name },
      {},
      { responseHeaders: { 'Cache-Control': 'no-store' } },
    );
  });
```

### Anti-pattern: cookies in slow phase

```typescript
.withSlowlyRender(async (props, db) => {
    props.cookies  // TypeScript error: Property 'cookies' does not exist
})
```

## Trade-offs

| Aspect                                       | Benefit                                               | Cost                                                               |
| -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `Record<string, string>` for cookies         | Simple, matches `query` pattern                       | No typed cookie names, no parsing of JSON cookies                  |
| No cookie-parser dependency                  | Zero new dependencies                                 | Manual parsing (trivial for standard cookies)                      |
| Response headers as `Record<string, string>` | Simple, covers `Cache-Control` and any future headers | No typed header names, no multi-value headers                      |
| Last-write-wins for response headers         | Simple, page author has final say                     | No "most restrictive wins" for Cache-Control specifically          |
| No Set-Cookie support                        | Simpler scope                                         | Components can't set cookies from fast phase (add later if needed) |
| Cookies not in slow phase                    | Cache integrity preserved                             | Components needing auth in slow phase must use a different pattern |

## Verification Criteria

1. `props.cookies` is available in `withFastRender` callbacks with correct type `Record<string, string>`
2. `props.cookies` is NOT available in `withSlowlyRender` callbacks (TypeScript error)
3. Cookies from the HTTP `Cookie` header are correctly parsed and passed to fast phase
4. Missing `Cookie` header → `cookies` is `{}`
5. `phaseOutput()` accepts `responseHeaders` in the options bag
6. Response headers from `phaseOutput` are applied to the HTTP response
7. Multiple page parts with `responseHeaders` merge via last-write-wins
8. Redirect/error results bypass response headers (existing behavior unchanged)
9. Existing tests continue to pass
10. Production server (fetch handler) applies the same cookies + response headers flow
11. Smoke-test project (DL#140) continues to pass in all modes (dev, self-hosted, CDN)
