# DL#229: Request Cookies for Server Actions

Status: **[Approved]** (2026-10-26).

Supersedes the withdrawn DL#228 (ambient `getRequestContext()` over AsyncLocalStorage). Its file was removed in commit `51a045d8`.

## Decisions for the Implementer (TL;DR)

- **Need**: an action, query, or stream handler can **read** the current request's cookies and **set or clear** response cookies. The typical use is to forward the cookies to an upstream service that identifies the caller from a session cookie set on the site's domain, and to write that httpOnly credential cookie on login, refresh, and logout. Page fast render already receives `props.cookies` (jay-stack-types.ts:92-94, 217). Action handlers receive only `(input, ...services)` (action-registry.ts:229-232).
- **Mechanism: an explicit argument, opted into with a builder step.** It is not an ambient accessor.
  ```typescript
  makeJayAction('account.update')
      .withServices(ACCOUNT_SERVICE)
      .withRequest()                                   // opt-in
      .withHandler(async (input: In, request, account) => {
          // request: ActionRequest = { readonly cookies: Readonly<Record<string,string>> }
      });
  ```
  - `.withRequest()` inserts `request: ActionRequest` as the **second** parameter, before the spread services. A trailing parameter after a variadic `...services` is not expressible cleanly in TS (see Q2).
  - `ActionRequest` is a new exported type in `fullstack-component`. It is the existing `RequestCookies` read shape (jay-stack-types.ts:92) plus two write methods: `setCookie(name, value, options?)` and `clearCookie(name, options?)`.
  - The same step exists on `makeJayQuery` (the same builder class) and `makeJayStream`. Stream handlers get the read-only `StreamActionRequest = Readonly<RequestCookies>`, with no setters (Q10).
- **Setting response cookies, read-write and opt-in through the same `.withRequest()`:**
  - **Why:** page JS cannot write an httpOnly credential cookie, so login, refresh, and logout go through an action, and the server sets the cookie.
  - **Defaults:** `httpOnly: true`, `sameSite: 'Lax'`, `path: '/'`, and `secure` when the request is https (Q11).
  - **Options:** `httpOnly`, `secure`, `sameSite: 'Strict'|'Lax'|'None'`, `path`, `domain`, `maxAge` (seconds), `expires: Date`.
  - **Emission:** cookies are emitted as `Set-Cookie` **only on a successful response**. Cookies set before a throw or an `ActionError` are discarded (Q9).
  - **Header fix:** the Node main-server's `pipeFetchResponse` currently collapses multiple `Set-Cookie` headers into one, keeping only the last (main-server.ts:43-46). It must be fixed to use `getSetCookie()`.
  - **Not in fast render:** page fast render does **not** get cookie setters. That is out of scope (Q12).
- **Opt-in, no change for existing handlers.** If `.withRequest()` is absent, the handler is called exactly as today: `handler(input, ...services)`. The client-facing callable type `(input) => Promise<O>` (jay-action-builder.ts:244-248) is unchanged for every action.
- **Caching rule (hard):**
  1. `.withRequest()` combined with `.withCaching()` **throws when the action is defined** (in `withHandler`). The error says that a cookie-reading handler is per-user and must not be cached.
  2. Every response from a `.withRequest()` action carries `Cache-Control: private, no-store`. That includes every response that sets cookies, since setters exist only on `.withRequest()` actions, so a `Set-Cookie` response is never shared-cached. This covers success and error, GET and POST, streaming and non-streaming, so no browser, CDN, or proxy cache can store it heuristically. Today a GET without `withCaching` sends **no** Cache-Control at all (action-registry.ts:276-278).
- **CSRF: same-origin enforcement for non-GET `.withRequest()` actions.** Today jay has **no** CSRF or origin check on actions. SameSite on its own is not enough (Q5). The check matters more now that actions can **set** credentials: without it, a cross-site page could force a login as the attacker's account (login CSRF) or log the user out. Before parsing the body, the dispatcher rejects a non-GET `.withRequest()` request with **403 `CROSS_ORIGIN_REQUEST`** when either of these holds:
  - `Sec-Fetch-Site` is present and is not `same-origin` or `none`;
  - `Sec-Fetch-Site` is absent, and `Origin` is present and differs from the request URL's origin.

  A request that carries neither header is allowed, because non-browser clients do not send them and are not a CSRF vector. GET `.withRequest()` queries are not checked: cross-origin pages cannot read the response, because actions send no CORS headers. The guide states that a GET must not mutate. The logic is one shared pure function in `stack-server-runtime` that all entry points call.
- **Same in every runtime.** The registry is the single place that builds the handler call. Each HTTP entry point only parses cookies, which it already does for pages, and passes them in:
  - the dev Express router (action-router.ts:165 and :150);
  - the production `fetchActionRequest` (fetch-action-handler.ts:105 and :87), which serves both the Node main-server (main-server.ts:114) and the fetch/edge handler (jay-fetch-handler/lib/index.ts:77).

  There is no AsyncLocalStorage and no new runtime dependency.
- **Outside an HTTP request** (the direct server-side callable, the CLI, a render-phase call), the handler receives the frozen empty `{ cookies: {} }`. This mirrors the fast-render default (fast-changing-runner.ts:29).
- **Out of scope**: headers (read or write), query (GET input already carries it), the raw request, cookie setters on streams and on page fast render, a parsed session, an ambient accessor, and propagation into nested direct callable calls.
- **jay-feedback**: add an **agent-kit guide** section to `stack-cli/agent-kit-template/plugin/actions-guide.md`. **No `validate` rule** is needed, because the one dangerous combination (`withRequest` + `withCaching`) fails loudly at definition time, which is stronger than a warning.

## Background

DL#63 introduced `makeJayAction` / `makeJayQuery` and the `ActionRegistry`. It listed "**Request Context** (optional): `.withRequestContext()` builder method; access to headers, cookies; auth token extraction" as deferred future work (DL#63 lines 605-609). DL#141 then delivered cookies to the **page fast phase** as `props.cookies` (`RequestCookies`, jay-stack-types.ts:92-94; threaded in fast-changing-runner.ts:29, 48, 118, 192). Every page entry point already parses cookies:
- dev-server.ts:523;
- main-server.ts:162;
- jay-fetch-handler/lib/index.ts:107.

All three call `parseCookies` (stack-server-runtime/lib/cookies.ts:5).

DL#228 tried to close the action-side gap with an ambient `getRequestContext()` backed by AsyncLocalStorage. It was withdrawn. The lessons that carry over:
1. ALS availability on the edge/fetch target was unverified, and it needed a gated spike.
2. Import-time safety of a barrel-exported ALS store needed lazy init.
3. Store identity across duplicate module copies needed `globalThis` keys.
4. A "was context read?" flag had to propagate through nested `execute` calls to decide cacheability.

Points 1-4 together were most of DL#228's complexity, and **all of them exist only because the accessor is ambient**. The caching risk it identified is real and is kept here: a cached GET with no `private` is a cross-user leak.

## Problem

The dispatch holds the request and throws the cookies away:

- **Registry**: `execute(actionName, input)` resolves services and calls `action.handler(input, ...services)` (action-registry.ts:201, 229-232). `executeStream` does the same (action-registry.ts:326-335).
- **Dev entry**: the Express handler has `req`, but forwards only `input` to `registry.execute(actionName, input)` (action-router.ts:165) and `registry.executeStream(actionName, input)` (action-router.ts:150).
- **Production entry**: `fetchActionRequest(request, registry)` has the Fetch `Request`, but calls `registry.execute(actionName, input)` (fetch-action-handler.ts:105) and `executeStream` (fetch-action-handler.ts:87) with input only.

A handler that must act **as the caller** against an upstream service therefore cannot get the caller's session cookie. The browser does send it: the client uses `fetch` with default `credentials: 'same-origin'` (stack-client-runtime/lib/action-caller.ts:215-221, 236). The only workaround is to copy the cookie into `input` from client code. That is impossible for HttpOnly cookies, and it spreads auth plumbing into every caller.

## Prior Art / Adjacent Mechanisms

| Mechanism | Where | Fit |
| --- | --- | --- |
| `RequestCookies` props on fast render | jay-stack-types.ts:92-94, 217 | **Reuse the shape.** The delivery (a props object) does not reach actions, but an explicit argument is the same "argument-threading" model the render phases already use. |
| `parseCookies` | cookies.ts:5 | Reused unchanged on the action path. |
| Builder steps `withServices` / `withMethod` / `withCaching` / `withFiles` | jay-action-builder.ts:158-176, 206-228 | **The pattern to follow.** `withFiles()` (DL#131) is the closest precedent: a boolean opt-in that the registry/dispatcher reads from the definition (`acceptsFiles`, jay-action-builder.ts:129-130; dev check at action-router.ts:390-403). |
| DL#63 deferred `.withRequestContext()` | DL#63 Open Questions #2 | The originally intended shape. This log implements its cookie subset under the shorter name `.withRequest()`. |
| Ambient `getRequestContext()` + ALS | DL#228 (withdrawn) | Rejected. See the Background lessons and Q1. |
| `globalThis.__JAY_SERVICE_RESOLVER__` | jay-action-builder.ts:245 | Process-global singleton. It cannot carry per-request data. |

## Questions and Answers

**Q1: Why an explicit argument and not an ambient accessor? (null hypothesis)**
A1: The null hypothesis is "no new mechanism; the client puts the data in `input`". It fails because HttpOnly session cookies are unreadable by client JS, and because client-supplied identity is spoofable. A new channel is therefore justified, and the smallest one is an argument:
- It works identically on every runtime with zero runtime dependencies. No ALS spike is needed, and there is no edge question.
- It cannot leak between concurrent requests, because no shared slot exists.
- The handler's type **declares** that it is per-user, so caching can be decided **statically at definition time** (Caching rule 1) instead of by DL#228's runtime "was it read" flag and nested propagation.

DL#228's objections to an argument were "breaking for every handler", "ambiguous against spread services", and "leaks into the client type". Each one is removed by making the argument **opt-in** and **fixed at position 2 only when opted in**. The client callable is unaffected.

**Q2: Why position 2 `(input, request, ...services)` and not trailing?**
A2: Services are a variadic tuple spread (`...services: Services`, jay-action-builder.ts:133, 182). A trailing `request` would need `(...args: [...Services, ActionRequest])`, which gives poor inference and confusing user code. Position 2 is unambiguous because it is present **iff** `.withRequest()` was called, and the builder's type changes accordingly. It is the same model as `RenderFast`, where request data travels in the first-position props ahead of `...services` (jay-stack-types.ts:217-218).

**Q3: Why only cookies?**
A3: Cookies are the stated need: forwarding the caller's identity. Query is already the GET input (fetch-action-handler.ts:59-66; action-router.ts:106-115). Headers are out of scope for this log:
- they widen the surface (and `Authorization` invites token-in-header auth designs, which need their own CSRF analysis);
- no current need requires them.

`ActionRequest` is an object, not a bare cookie map, so adding `headers` later is additive and non-breaking.

**Q4: What does a handler receive when there is no HTTP request?**
A4: A frozen `{ cookies: {} }`. This covers three cases:
- the server-side direct callable (jay-action-builder.ts:244-248), which has no request to read;
- the CLI `jay-stack action` path;
- `registry.execute` called with two arguments, including existing tests.

It mirrors fast render defaulting `cookies = {}` (fast-changing-runner.ts:29). It never throws: shared plugin code must run in both settings, and "no cookies" correctly reads as "anonymous caller". **Nested direct calls do not propagate cookies.** If a `.withRequest()` handler calls another action's callable directly, the inner handler receives `{ cookies: {} }`. To forward identity, the outer handler calls a shared function and passes `request` explicitly. This is documented in the guide and is the honest consequence of having no ambient state.

**Q5: CSRF. Is SameSite enough, and what does jay do today?**
A5: **Today there is no protection**: no origin, `Sec-Fetch-*`, or token check exists in the action paths (action-router.ts:55-180; fetch-action-handler.ts:15-120). Until now that was harmless, because handlers could not see cookies, so a forged request carried no authority. Once they can, a cross-site page can trigger a state-changing POST with the victim's cookies:
- **Production parses any body as JSON regardless of `Content-Type`** (fetch-action-handler.ts:68-69). A CORS-"simple" `text/plain` form POST or `fetch(..., {mode:'no-cors'})` therefore reaches the handler without a preflight. Multipart is also simple (action-router.ts:389).
- **SameSite is not sufficient on its own.** The cookie is set by the hosting platform, not by jay, so jay cannot guarantee its attribute. Cookies may be `SameSite=None` (embedded or third-party hosting), and Lax-by-default is not universal across browsers. Jay must not make action safety depend on another party's cookie attributes.

**Decision**: enforce same-origin for **non-GET `.withRequest()`** actions in the dispatcher, before the body is read:
- prefer `Sec-Fetch-Site`, which all current browsers send and which is independent of Host or proxy rewriting;
- fall back to `Origin` vs the request URL's origin;
- allow requests that carry neither header (non-browser callers).

**With cookie setters, this check is also the login-CSRF defence.** A cross-site page that could POST to a login action would plant the attacker's session in the victim's browser. A logout action could be forced the same way. Both are non-GET `.withRequest()` actions, so both are covered. `sameSite: 'Lax'` by default adds defence in depth on the cookie itself, but per the paragraph above it is not relied on.

Jay's own client always calls same-origin (relative `ACTION_ENDPOINT_BASE` URL, action-caller.ts:212-214), so legitimate traffic passes. The check is scoped to `.withRequest()` so existing actions are unaffected, which keeps the change opt-in. Applying it to all actions is a reasonable follow-up, not part of this log.

GET is not checked: actions emit no CORS headers, so a cross-origin page cannot read the response. The guide requires GET queries to be side-effect free.

**Q6: Why throw on `withRequest` + `withCaching` instead of only adding `private`?**
A6: `withCaching` exists to produce a shared-cacheable response (`max-age` / `stale-while-revalidate`, action-registry.ts:273-292). A per-user cached response is a contradiction. The only "safe" interpretation (`private, max-age`) would silently change the meaning of an explicit option. Failing loudly at definition time follows jay's "validation first" principle and is caught on first import in dev.

**Q7: Proxies and the `Origin` fallback.**
A7: The request URL in main-server is built from the `Host` header (main-server.ts:29). Behind a Host-rewriting proxy, an `Origin` comparison can fail closed, returning 403 to a legitimate browser. This only happens on the fallback path, where `Sec-Fetch-Site` is absent, which in practice means old browsers. That is accepted as a risk and listed under Trade-offs. No `X-Forwarded-Host` trust is added.

**Q8: How does an action set cookies? A setter on `ActionRequest`, or a cookie list returned beside the result? (null hypothesis)**
A8: The null hypothesis is "no new mechanism": client JS writes `document.cookie`. It fails because the credential must be **httpOnly**, and page JS can neither read nor write httpOnly cookies. A server channel is therefore required. There are two candidates:
- **Returned list** (`return { data, cookies }` or a wrapper type). This puts transport into the handler's output type. Either `O` becomes a wrapper on the client callable `(input) => Promise<O>` (jay-action-builder.ts:244-248), or the builder must strip it in both the build transform and the client runtime. That is more surface.
- **Setter on the `request` object** the handler already opted into. Nothing changes in the output type or the client. The object already exists per call, so it can carry a per-call collector.

**Decision: setters.** `request.setCookie(name, value, options?)` and `request.clearCookie(name, options?)` append to a per-invocation list. The registry creates the list in `execute` and returns it in the success result. Handlers that never call a setter emit nothing.

**Q9: Are cookies set before a throw still sent?**
A9: **No.** The registry returns `cookies` only on the success branch (action-registry.ts:234-237). The catch branch (:238-266) drops them. This keeps responses all-or-nothing: a login handler that sets the cookie and then fails a later step must not leave the caller half signed in. If an error path needs to clear a cookie, the handler returns a success value that says so. This is documented in the guide.

**Q10: Streaming actions?**
A10: **Excluded from setting cookies; reading is supported.** Headers are committed before the generator runs: the dev router sets the NDJSON headers at action-router.ts:146-147 before `executeStream` (:150), and the fetch handler builds the `Response` with its headers at fetch-action-handler.ts:100-102 while the stream body is still pending (:84-99). A cookie set mid-stream has no header to go in. Stream handlers therefore get `StreamActionRequest` (read-only), so the error is caught at compile time. They do not get a setter that would fail at runtime.

**Q11: The `secure` default. How is "request is https" known?**
A11: Each entry point computes `isSecureRequest` with this rule: the request URL protocol is `https:`, **or** the first value of `x-forwarded-proto` is `https`. The header is trusted only to *upgrade* to `secure`, never to downgrade, so a spoofed header can only make a cookie stricter. The URL protocol differs per entry point:
- the dev router uses `req.protocol`;
- the fetch/edge handler uses `new URL(request.url).protocol`;
- the Node main-server always builds an `http://` URL (main-server.ts:29), so behind a TLS terminator it depends on `x-forwarded-proto`.

An explicit `secure` option always wins. `sameSite: 'None'` forces `secure: true`, because browsers reject `SameSite=None` cookies that are not `Secure`.

**Q12: Does page fast render need to set cookies?**
A12: **Out of scope.** The credential flows here are all triggered from page JS (login, refresh, logout), and those are actions. Setting cookies during a page GET render would be a side effect on a safe method. It would also run on every render, including SWR and cached paths, which mixes per-user credential writes into the page pipeline. The existing `responseHeaders?: Record<string,string>` (jay-stack-types.ts:154, DL#141) cannot carry multiple `Set-Cookie` values anyway. Supporting that would be its own design for a need that does not exist yet.

## Design

### 1. Types (`fullstack-component`)

```typescript
// jay-stack-types.ts, next to RequestCookies
export interface CookieOptions {
    httpOnly?: boolean;                       // default true
    secure?: boolean;                         // default: request is https (Q11); forced true by sameSite 'None'
    sameSite?: 'Strict' | 'Lax' | 'None';     // default 'Lax'
    path?: string;                            // default '/'
    domain?: string;                          // default: none (host-only)
    maxAge?: number;                          // seconds
    expires?: Date;
}
/** Read-only request data for stream handlers (Q10). */
export type StreamActionRequest = Readonly<RequestCookies>;
/** Request access for an action/query handler that opted in with .withRequest(). */
export interface ActionRequest extends StreamActionRequest {
    setCookie(name: string, value: string, options?: CookieOptions): void;
    /** Emits the cookie with an empty value, Max-Age=0, and the same path/domain (they must match to clear). */
    clearCookie(name: string, options?: Pick<CookieOptions, 'path' | 'domain'>): void;
}
```

`setCookie` throws a `TypeError` when the name is not an RFC 6265 token. The value is `encodeURIComponent`-encoded, which mirrors `decodeURIComponent` in `parseCookies` (cookies.ts:10), so a value round-trips. Setting the same name twice keeps only the last write.

### 2. Builder (`jay-action-builder.ts`)

- `JayActionDefinition` gains `needsRequest?: boolean` (next to `acceptsFiles`, :129-130). The stored `handler` type widens to `(input, ...args: any[]) => Promise<Output>` internally. The public `withHandler` overloads keep precise types.
- `JayActionBuilder` gains a type flag `R extends boolean` and `withRequest(): JayActionBuilder<Services, Input, Output, DefaultMethod, true>`. The `withHandler` parameter type becomes conditional:
  ```typescript
  handler: R extends true
      ? (input: I, request: ActionRequest, ...services: Services) => Promise<O>
      : (input: I, ...services: Services) => Promise<O>
  ```
  `JayStreamBuilder` gets the same treatment (the `:376-419` region).
- `withHandler` throws `Error("Action '<name>' uses .withRequest() and .withCaching(): a handler that reads cookies is per-user and must not be cached. Remove .withCaching().")` when both are set.
- The server-side direct callable (:244-248) calls `handler(input, createActionRequest({}), ...services)` when `needsRequest`, and is unchanged otherwise. With no HTTP response to write to, setter calls are recorded and then **discarded**, and a one-line `getLogger().warn` names the action and cookie. A direct call cannot set cookies; this is documented.

### 3. Registry (`stack-server-runtime/lib/action-registry.ts`)

- **Inputs:** `execute(actionName, input, incoming: IncomingRequest = { cookies: {}, secure: false })` and `executeStream(actionName, input, incoming = …)`. `IncomingRequest = { cookies: Record<string,string>; secure: boolean }` is internal to stack-server-runtime.
- **Per-call object:** `execute` builds a fresh `ActionRequest` with `createActionRequest(incoming)`. That function lives in a new `stack-server-runtime/lib/action-request.ts`, and its `setCookie`/`clearCookie` collect into a per-call `Map<name, SetCookieEntry>`. `executeStream` passes the frozen read-only `{ cookies }`.
- **Result:** `ActionExecutionResult` success gains `setCookies?: string[]`, the serialized `Set-Cookie` values from `serializeSetCookie(name, value, resolvedOptions)` (new, in cookies.ts). The error branch never carries it (Q9). The call site (:232, :333) becomes `action.needsRequest ? action.handler(input, request, ...services) : action.handler(input, ...services)`, extracted as a small `invokeHandler(action, input, request)`. The registry stores the `needsRequest` flag when it registers the action.
- `getCacheHeaders(actionName)` returns `'private, no-store'` for `needsRequest` actions, whatever the method. The existing behavior for other actions is unchanged.
- New pure export: `isCrossOriginRequest({ secFetchSite, origin, requestOrigin }): boolean`, implementing the Q5 rule. New: `needsSameOriginCheck(action) = action.needsRequest && action.method !== 'GET'`.

### 4. Entry points

| Runtime | File:line | Change |
| --- | --- | --- |
| Dev (Express) | action-router.ts:91-102 (after the method check, before input parse :103) | If `needsSameOriginCheck`, run `isCrossOriginRequest` with `req.headers['sec-fetch-site']`, `req.headers.origin`, and `${req.protocol}://${req.headers.host}`. On a cross-origin result, respond 403 `CROSS_ORIGIN_REQUEST`. **Note**: `actionBodyParser` (action-router.ts:370+) runs earlier and parses multipart into temp files. It must skip parsing for a cross-origin `.withRequest()` request (the same check, reused) so no body work happens. |
| Dev (Express) | action-router.ts:150, :165, :170-173 | Pass `{ cookies: parseCookies(req.headers.cookie), secure: isSecureRequest(...) }`. On success, `res.append('Set-Cookie', v)` for each entry (Express `append` keeps repeats) before `res.status(200).json` (:178) to `executeStream` / `execute`. Set `Cache-Control` from `getCacheHeaders` for **any** method and for the streaming response and error responses when `needsRequest`. |
| Production fetch | fetch-action-handler.ts:45-56 | Same-origin check after the method check (:55), before `request.text()` (:68). |
| Production fetch | fetch-action-handler.ts:87, :100-102, :105-118 | Pass `{ cookies: parseCookies(request.headers.get('cookie')), secure: isSecureRequest(...) }`. On success, `jsonResponse` (:122-131) takes a `Headers` object so it can `headers.append('Set-Cookie', v)` once per entry; a plain `Record<string,string>` cannot hold repeats. Apply `private, no-store` to streaming, success, and error responses for `needsRequest`. |
| Node main-server | main-server.ts:28-40, :112-116; `pipeFetchResponse` :42-47 | The request side needs no change: it converts all headers, including `cookie`, `sec-fetch-site`, and `x-forwarded-proto`. **Bug fix:** `pipeFetchResponse` copies headers into a `Record` with `forEach` (:44-46), so with several `Set-Cookie` values only the last survives. It must write `response.headers.getSetCookie()` as an array (`res.setHeader('set-cookie', [...])`) and skip `set-cookie` in the generic loop. |
| Fetch/edge handler | jay-fetch-handler/lib/index.ts:76-78 | **No change.** It returns the `Response` from `fetchActionRequest` as-is, and the multiple `Set-Cookie` entries in its `Headers` reach the host runtime intact. |
| CLI / direct callable | jay-action-builder.ts:244-248 | Empty frozen request (Q4). |

### 5. Agent-kit guide

Add a "Reading the caller's cookies" section to `packages/jay-stack/stack-cli/agent-kit-template/plugin/actions-guide.md`. It covers:
- `.withRequest()` and the handler position;
- cookies are read-only and server-trusted, and identity is never read from `input`;
- the rule that `withCaching` is forbidden with `withRequest`;
- GET must not mutate;
- non-GET calls must come from the same origin;
- nested direct calls get empty cookies, so pass `request` explicitly;
- setting credentials: `request.setCookie` / `clearCookie`, the safe defaults, cookies dropped on error, no setters in streams, and that `clearCookie` must use the same `path`/`domain` the cookie was set with.

## Implementation Plan

1. **Red tests first** (list below). Confirm they fail.
2. Types + builder (§1-2) in `fullstack-component`.
3. Registry: `invokeHandler`, `getCacheHeaders`, `isCrossOriginRequest` (§3).
4. Dev router + body parser (§4).
5. `fetchActionRequest` (§4).
6. Agent-kit guide (§5).
7. `yarn confirm`. Then demo: a dev-server example page whose `.withRequest()` POST echoes a cookie-derived value, and a cross-origin POST attempt that is rejected with 403.

### Tests (red first, `toEqual` on structured results)

`fullstack-component`:
1. `withRequest()` handler receives `(input, { cookies: {} }, ...services)` when invoked through the direct callable.
2. `withRequest().withCaching()` throws in `withHandler` with the message above.
3. An action without `withRequest` is still invoked as `(input, ...services)`, and its arity and arguments are unchanged.

`stack-server-runtime`:
4. `execute(name, input, { cookies: { s: '1' } })` passes that object as arg 2 for a `needsRequest` action.
5. The same call on a non-`needsRequest` action calls `handler(input, svc)`, so cookies do not leak into services.
6. `execute(name, input)` with two args on a `needsRequest` action passes `{ cookies: {} }`.
7. `executeStream` follows the same rules as 4 and 6.
8. `getCacheHeaders` returns `'private, no-store'` for a `needsRequest` GET and POST, and is unchanged for a cached non-request GET.
9. `isCrossOriginRequest` table: `cross-site` → true; `same-site` → true; `same-origin` → false; `none` → false; no SFS with a mismatching Origin → true; no SFS with a matching Origin → false; neither header → false.

`production-server` (`fetchActionRequest`, which covers both main-server and the fetch handler):
10. A POST `.withRequest()` request with `Cookie: s=abc` sends the handler `{ cookies: { s: 'abc' } }`, and the response has `Cache-Control: private, no-store`.
11. A POST `.withRequest()` request with `Sec-Fetch-Site: cross-site` returns 403 `CROSS_ORIGIN_REQUEST`, the handler is not called, and the body is not read.
12. A POST **without** `.withRequest()` and with `Sec-Fetch-Site: cross-site` behaves as today (200), so nothing changes for existing actions.
13. A streaming `.withRequest()` action receives cookies, and its response carries `private, no-store`.

Cookie setting (red first):
14. `serializeSetCookie` (`toEqual` on the exact string):
    - defaults with `secure: true` give `'sid=a%20b; Path=/; HttpOnly; SameSite=Lax; Secure'`;
    - `{ maxAge: 3600, domain: 'example.com', sameSite: 'Strict', httpOnly: false }` serializes in a fixed attribute order;
    - `sameSite: 'None'` with `secure: false` emits `Secure`;
    - an invalid name (`'a;b'`) throws.
15. `clearCookie('sid', { path: '/x' })` gives `'sid=; Path=/x; Max-Age=0; HttpOnly; SameSite=Lax'` (plus `Secure` on https).
16. Registry: a handler that calls `setCookie` twice for different names and once more for the same name returns `setCookies` of length 2, with the last write winning.
17. Registry: a handler that calls `setCookie` and then throws an `ActionError` returns an error result with **no** `setCookies`.
18. `fetchActionRequest`: a POST that sets two cookies returns `response.headers.getSetCookie()` equal to both strings, plus `Cache-Control: private, no-store`.
19. `fetchActionRequest`: a request URL that is `http:` with `x-forwarded-proto: https` gives a `Secure` cookie. A plain `http:` request gives none.
20. **Bug repro, main-server `pipeFetchResponse`:** a `Response` with two `Set-Cookie` entries piped to a mock `ServerResponse` yields `set-cookie` equal to both values. This is red today (main-server.ts:44-46).
21. A cross-site POST to a cookie-setting action returns 403, and the handler never runs, so no `Set-Cookie` is sent.
22. Type tests: `StreamActionRequest` has no `setCookie` (`// @ts-expect-error`).

`dev-server` (`createActionRouter`): mirror tests 10, 11, 13, 18, and 21, plus the multipart case where `actionBodyParser` skips parsing for a cross-origin `.withRequest()` request.

## Verification Criteria

- All the tests above go from red to green. Existing action tests pass unchanged (opt-in proof).
- `yarn confirm` is green.
- Demo in the dev server: an opted-in action returns a value derived from a cookie set in the browser. A `curl` POST with `Sec-Fetch-Site: cross-site` gets 403. The response headers show `private, no-store`.
- Demo, cookie round trip: a login action sets an httpOnly cookie, so the browser devtools show `HttpOnly` and `SameSite=Lax` and `document.cookie` does not contain it. A later `.withRequest()` action reads it. A logout action clears it. All of this is verified on both the dev server and the production Node server, where two cookies set in one response both arrive.
- `grep` shows no `AsyncLocalStorage` and no new runtime dependency.

## Scope Pre-mortem

- **Headers**: out of scope (Q3), and additive later on `ActionRequest`.
- **Cookie setters on streams** (Q10) and **in page fast render** (Q12): out of scope.
- **Signed or encrypted cookie values, cookie prefixes (`__Host-`), `Partitioned`**: not handled. The value is opaque, and the handler supplies any signing. `__Host-` works if the caller passes `path: '/'`, no domain, and `secure`.
- **Cookies on error responses**: deliberately not sent (Q9).
- **CSRF for non-`withRequest` actions**: unchanged, because those handlers have no ambient authority. A possible follow-up.
- **Token-based CSRF**: not needed. The origin check covers browsers, and non-browser callers are not a CSRF vector.
- **Nested propagation**: deliberately absent (Q4).
- **Render-phase consumers calling actions server-side**: they get empty cookies. If needed, they already hold `props.cookies` and can call shared code directly.

## Trade-offs

- **Explicit argument vs. ambient** (+) It is portable, statically cacheable, and leak-free, with no ALS. (−) Identity does not flow implicitly through nested callables, and the position-2 argument shifts services by one for opted-in handlers.
- **Throwing on `withCaching`** (+) The leak becomes impossible. (−) A legitimately "per-user but browser-cacheable" query cannot be expressed. That can be added later as an explicit `private` cache option.
- **Setter on `request` vs. returned list** (+) No change to output types or the client. (−) The handler mutates a collector, which is slightly impure, and direct calls silently drop cookies, mitigated by a warn log.
- **Dropping cookies on error** (+) Atomic outcomes. (−) Clearing a cookie on failure needs a success response.
- **Origin fallback** (+) It protects browsers without `Sec-Fetch-Site`. (−) It can fail closed behind a Host-rewriting proxy (Q7).
- **Scoping CSRF to `.withRequest()`** (+) Zero behavior change for existing actions. (−) Two security postures for actions, which the guide documents.
