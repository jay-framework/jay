# DL#228: Request Context for Server Actions

Status: **[Design]** — revising (reviewer blocker on the edge/BaaS ALS assumption; see Q7 + Phase 0).

## Decisions for the Implementer (TL;DR)

- **Problem**: a server action handler receives only the client-sent `input` plus globally-registered singleton services. It has **no** access to the incoming request's cookies / query / headers. Anything request-scoped — above all the authenticated caller's identity — must either be smuggled through `input` (client-sent ⇒ spoofable, server-unverifiable) or go without. The page/fast-render path already surfaces cookies + query (DL#141, DL#117); actions do not.
- **Chosen mechanism**: a **request-scoped accessor**, `getRequestContext()`, backed by `AsyncLocalStorage` (ALS), exported from `@jay-framework/stack-server-runtime`. The action dispatch (`ActionRegistry.execute` / `executeStream`) runs the handler **inside** `runWithRequestContext(ctx, …)`; the handler reads context by calling `getRequestContext()`. On its promise of **both** "no handler signature changes" **and** per-request isolation: this holds **fully on Node** (dev server, Node main-server, CLI), where ALS is guaranteed. It is **not** guaranteed on the edge/BaaS (fetch) target — see the next bullet.
- **⚠️ ALS is a gating prerequisite, not an assumption**: the design's transparency property (ambient accessor, zero signature change, per-request isolation) depends on ALS being available **and correct** on each serving runtime. ALS is guaranteed on Node, so the **Node dispatch paths (~80% of this design) are implementable regardless**. The **edge/BaaS fetch target is different**: whether that runtime exposes `node:async_hooks`/ALS (e.g. requires a `nodejs_compat`-style flag) is **not established by this codebase** — the in-repo edge fetch handler imports no `node:` builtins. A **Phase 0 spike (below) must verify ALS on the actual edge/BaaS target before any edge work**. If ALS is absent there, the design must **pivot on that target** (accept a handler-signature/threading change, or scope request-context to Node-serving only) — there is **no transparent no-ALS fallback** (see Q7). The edge path is gated on the Phase 0 result.
- **Rejected**: threading a `ctx` argument into `withHandler((input, ctx, …services))`. It is a breaking change to every handler, it is positionally ambiguous against spread services, and it would leak server HTTP concerns into the client-facing `JayAction` callable type `(input) => Promise<O>`. See Prior Art + Q3.
- **What is exposed** (minimal): `{ cookies, query, headers }`, all `Record<string, string>`. `cookies` / `query` **reuse the existing shapes** from `RequestCookies` / `RequestQuery` (jay-stack-types.ts:84-94); `parseCookies` (cookies.ts:5) is reused for parsing. **No** raw request object, **no** request body, **no** `Set-Cookie`, **no** parsed session — those are out of scope (see Scope pre-mortem). Note: `headers` also contains the raw `cookie` header, so the cookie data appears both parsed (in `cookies`) and raw (in `headers.cookie`) — harmless duplication; `cookies` is the intended accessor.
- **Lifetime**: strictly request-scoped. Outside a request (CLI `jay-stack action …`, or a server-side action call from a render phase), `getRequestContext()` returns a **safe empty context** `{ cookies: {}, query: {}, headers: {} }` — it does not throw — so shared plugin code runs in both settings. Mirrors fast-render's `cookies/query` defaulting to `{}` (fast-changing-runner.ts:28-29).
- **Security framing**: `getRequestContext()` returns **server-trusted request data** — cookies/headers the browser actually sent, parsed server-side — as opposed to spoofable `input`. Auth code must read the token/session cookie from the context, never from `input`.
- **Three dispatch entry points to wire** (all already hold the full request): dev-server Express router (action-router.ts), and production `fetchActionRequest` (fetch-action-handler.ts), which serves **both** the Node main-server and the edge/BaaS fetch handler. The CLI path (run-action.ts) passes nothing ⇒ empty context.
- **jay-feedback**: this **is** a framework feature (the capability does not exist). Accompany it with an **agent-kit guide** (how to read request context in an action + the trusted-vs-spoofable security note). No deterministic `validate` rule is proposed as core (detecting "auth read from `input`" is unreliable); noted as a deferred idea.

---

## Background

Jay Stack server actions (DL#63) are RPC-style handlers defined with `makeJayAction` / `makeJayQuery` / `makeJayStream`. A client call is compiled into an HTTP request to `/_jay/actions/<name>`; the server looks the action up in `ActionRegistry`, resolves its declared services, and calls `handler(input, ...services)`.

Two adjacent request-scoped capabilities already exist for the **render** phases:

- **Query string** in the fast phase (DL#117) — `RequestQuery` (jay-stack-types.ts:84).
- **Cookies** + **response headers** in the fast phase (DL#141) — `RequestCookies` (jay-stack-types.ts:92), parsed by `parseCookies` (cookies.ts:5) and threaded into fast-render props (fast-changing-runner.ts:28-29, 44-48).

Actions were explicitly left out of this: DL#63's "Request Context (optional)" was deferred ("Defer for now … Requires handshake between page loading and action calls. Address in future iteration." — DL#63 Open Questions #1). This log closes that gap.

## Problem

A handler cannot see the request it is serving. Concretely, the dispatch has the request context available and drops it:

- **Dispatch core** — `ActionRegistry.execute` resolves services and calls the handler with only `input`:
  - `const services = resolveServices(action.services);` then `const result = await action.handler(input, ...services);` (action-registry.ts:229-232). `executeStream` is identical (action-registry.ts:332-334).
- **Dev entry** — the Express router has `req` (with `req.headers.cookie`, `req.query`, `req.headers`) but extracts only the action name and `input`, then calls `registry.execute(actionName, input)` (action-router.ts:60, 104-119, 165). Nothing request-scoped is forwarded.
- **Production entry** — `fetchActionRequest(request, registry)` has the full Fetch `Request` but likewise builds only `input` and calls `registry.execute(actionName, input)` (fetch-action-handler.ts:57-80, 105). It is called with the request but **no cookies** from both production paths: edge/BaaS `createJayFetchHandler` (jay-fetch-handler/index.ts:77) and Node `main-server` (main-server.ts:114) — even though both parse cookies for the *page* path right next to it (index.ts:107, main-server.ts:162).

The consequence: an action that must know *who is calling* (a member/session token lives in a cookie) has only two bad options:

```typescript
// ❌ Spoofable: the client puts its own identity in the body. The server cannot verify it.
export const deleteAccount = makeJayAction('account.delete')
    .withHandler(async (input: { memberId: string }) => { /* trusts input.memberId */ });
```

versus no identity at all. The browser already sends the auth cookie on the action request; the server receives it and throws it away.

## Prior Art / Adjacent Mechanisms

| Mechanism | Where | Solves this? |
| --- | --- | --- |
| **`RequestCookies` / `RequestQuery` props** (DL#141 / #117) | jay-stack-types.ts:84-94; threaded in fast-changing-runner.ts:28-29,44-48,117-118,192 | Partially — gives the right **shape** to reuse (`Record<string,string>`), but the **delivery** is a props param to `fastRender`. Actions never pass through `fastRender`, so the delivery channel does not reach them. Reuse the types; a new delivery is needed. |
| **`parseCookies`** | cookies.ts:5 | Reused as-is for parsing the Cookie header on the action path. No new parser. |
| **Global service resolver** `globalThis.__JAY_SERVICE_RESOLVER__` | set in services.ts:124; read in jay-action-builder.ts:245 | Closest existing "ambient value reachable from a handler" pattern. But services are **process-global singletons set once at init** (services.ts:17, 34), not per-request — they cannot carry per-request cookies. Confirms the shape of the solution (a runtime-registered ambient accessor owned by stack-server-runtime) but not request scoping. |
| **Services (`.withServices`)** | DL#48 / #82 | No — singletons by design. Overloading them with per-request data would conflate infra with request state and break their lifetime contract. |
| **`input`** | the action argument | No — this *is* the spoofable channel the design must replace for trusted data. |
| **A server-side request-scoped context** | — | Does not exist. Client contexts (DL#30) are hierarchical and client-side; there is no server per-request context today. |
| **AsyncLocalStorage in the codebase** | — | **None.** `grep AsyncLocalStorage/async_hooks` over `packages/**/lib` returns only `@types/node` declarations — no runtime use. So ALS is genuinely new surface; §Design justifies it against the null hypothesis. |

### How other frameworks expose request context to server handlers

- **Next.js** — `cookies()`, `headers()`, `draftMode()` from `next/headers`: ambient, request-scoped accessors (AsyncLocalStorage under the hood), no argument threading. Server Actions read them the same way.
- **SvelteKit / Remix** — pass an explicit `RequestEvent` / request argument into the handler (`load({ cookies })`, `action({ request })`). Argument-threading model.
- **Node frameworks (Fastify/Express)** — `request` object passed explicitly; `AsyncLocalStorage` is the standard way to make it ambient without threading.

Jay's render phases already chose the **argument** model (props). For actions, the handler signature is the public, client-facing callable, which makes the **ambient accessor** model (the Next.js shape) the better fit here — see Q3.

## Questions and Answers

**Q1: Reuse `RequestCookies`/`RequestQuery` or new types?**
A1: Reuse their field shapes (`cookies`/`query` as `Record<string,string>`) inside a new `RequestContext` interface. A separate `RequestContext` is warranted because the accessor returns cookies + query + headers **together** at request time, which is a different grouping than the per-field props intersection used by `RenderFast`. No new cookie/query parsing — `parseCookies` is reused.

**Q2: Where does `getRequestContext()` live?**
A2: In `@jay-framework/stack-server-runtime`, next to `resolveServices`, `parseCookies`, and the registry. Handlers are server code and already import from this package (e.g. `runAction` historically, service helpers). It must **not** live in `@jay-framework/fullstack-component`, which cannot depend on stack-server-runtime (circular dependency — DL#82 Q1). Because the accessor lives in stack-server-runtime and the registry does the ALS wrapping, **`fullstack-component` needs no change at all** — the client-facing `JayAction` type stays clean.

**Q3: Ambient accessor vs. a handler argument?**
A3: Ambient accessor (`getRequestContext()`), for three reasons. (1) **Backward compatibility** — zero change to existing handlers; the argument form rewrites every signature. (2) **Positional safety** — services are spread (`handler(input, ...services)`, action-registry.ts:232); inserting a `ctx` between `input` and services is ambiguous and a trailing `ctx` is unreachable past a variadic. (3) **Type cleanliness** — the public callable is `(input: Input) => Promise<Output>` (jay-action-builder.ts:94-96), what client code calls after the build transform; a `ctx` param would leak server HTTP shape into the client type.

**Q4: What exactly is exposed?**
A4: `{ cookies: Record<string,string>, query: Record<string,string>, headers: Record<string,string> }`. Headers are lowercased-key, single-valued (last wins), matching how `parseCookies`/`query` already collapse repeats (RequestQuery doc, jay-stack-types.ts:82). **Not** exposed: the raw `Request`/`req`, the request body, `Set-Cookie`/response mutation, a parsed session. Keep the surface minimal and transport-agnostic (same object from Express `req` and Fetch `Request`).

**Q5: What does `getRequestContext()` return outside a request?**
A5: A frozen empty context `{ cookies: {}, query: {}, headers: {} }`, never `undefined`, never a throw. The CLI action path (run-action.ts:92) and server-side action calls from render phases have no HTTP request; shared plugin code must still run. This mirrors fast-render defaulting `cookies`/`query` to `{}` (fast-changing-runner.ts:28-29).

**Q6: Does `ActionRegistry.execute` change signature?**
A6: Yes, additively: `execute(actionName, input, requestContext?)` and `executeStream(actionName, input, requestContext?)`, with `requestContext` defaulting to the empty context. Existing callers (tests, CLI) that pass two args keep working. The registry wraps the handler call in `runWithRequestContext`. Centralizing the ALS wrap in the registry (not in each HTTP entry point) keeps a single source of truth and guarantees streaming + non-streaming parity.

**Q7: Does AsyncLocalStorage work on the production edge/BaaS (fetch) runtime, and what if it does not?**
A7: **Node: yes, guaranteed.** ALS (`node:async_hooks`) ships with Node, so every Node-serving dispatch path — dev server, Node main-server, CLI — is sound and the full design (ambient accessor, no signature change, per-request isolation) holds.

**Edge/BaaS: unverified — a gating prerequisite, not an assumption.** `AsyncLocalStorage` is part of the WinterCG common-minimum API and many edge runtimes expose it, but whether the **actual** edge/BaaS target this framework deploys to exposes `node:async_hooks`/ALS (some require a `nodejs_compat`-style flag) is **not established by this codebase**: the in-repo edge fetch handler imports no `node:` builtins. This **must be verified by the Phase 0 spike on the real target runtime before any edge work** (see Implementation Plan Phase 0 + Verification Criteria #7).

**There is no transparent no-ALS fallback.** Without ALS, the two candidate fallbacks both fail the design's own goals:
- An *ambient single-value slot* that `getRequestContext()` reads (set per call, outside ALS) is **unsound**: it races across `await` boundaries inside a handler and across concurrent in-flight requests — exactly the concurrency bleed Q8 rejects. Not viable.
- *Threading `ctx` into the handler call* (`handler(input, ctx, …services)`) is correct, but it **is** the handler-signature-change design this log rejects (Prior Art + Q3). It is not a drop-in swap.

So if the Phase 0 spike finds ALS unavailable/incorrect on the edge/BaaS target, the design **pivots on that target** — a deliberate decision, presented neutrally:
- **Option A — threading on edge only**: keep ambient ALS on Node, thread `requestContext` into the handler on the edge target. Cost: two handler-calling shapes; the client-facing callable type must still not leak `ctx` (Q3), so this needs its own design.
- **Option B — Node-serving only**: ship request-context for the Node-serving paths now, and explicitly scope-out the edge/BaaS target until it gains ALS. Cost: a capability gap on edge, clearly documented.

Either way, the empty-context behavior (Q5) is **not** the edge fallback: an empty `{cookies:{},query:{},headers:{}}` means "no context", not "working context", so relying on it on edge would silently drop the request's real cookies/headers — the opposite of the feature. The ~80% that is the Node dispatch paths is implementable before the spike resolves; the edge path is gated on it.

**Q8: Concurrency — can one request's context bleed into another?**
A8: No. `AsyncLocalStorage.run()` isolates per async execution context; concurrent in-flight requests each get their own store. This is the core reason ALS is chosen over any `globalThis` single-value slot (which would race — unlike the service resolver, which is deliberately a constant singleton).

## Design

### 1. New module: `stack-server-runtime/lib/request-context.ts`

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Server-trusted, request-scoped context for a server action handler.
 * All values are parsed from the incoming HTTP request on the server —
 * unlike the action `input`, they cannot be spoofed by the client body.
 */
export interface RequestContext {
    /** Cookies parsed from the request Cookie header (reuses RequestCookies shape). */
    cookies: Record<string, string>;
    /** Query string parameters (reuses RequestQuery shape). */
    query: Record<string, string>;
    /** Request headers, lowercased keys, last value wins. */
    headers: Record<string, string>;
}

const EMPTY_CONTEXT: RequestContext = Object.freeze({
    cookies: Object.freeze({}),
    query: Object.freeze({}),
    headers: Object.freeze({}),
}) as RequestContext;

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with `context` as the active request context (used by action dispatch). */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
}

/**
 * Read the current request's context inside an action handler.
 * Returns an empty context when called outside a request (CLI, render-phase action calls).
 */
export function getRequestContext(): RequestContext {
    return storage.getStore() ?? EMPTY_CONTEXT;
}
```

`RequestContext` deliberately has the same `cookies`/`query` field types as `RequestCookies`/`RequestQuery` (jay-stack-types.ts:84-94) so the two surfaces stay consistent; it is defined in stack-server-runtime to avoid the fullstack-component circular dependency (Q2).

### 2. Registry dispatch wraps the handler (the only runtime behavior change)

`ActionRegistry.execute` (action-registry.ts:201-265) and `executeStream` (action-registry.ts:326-336) gain an optional `requestContext` and wrap the handler call:

```typescript
async execute<T = any>(
    actionName: string,
    input: unknown,
    requestContext: RequestContext = getRequestContext(), // default: empty when unset
): Promise<ActionExecutionResult<T>> {
    // … unchanged lookup / streaming guard …
    try {
        const services = resolveServices(action.services);
        const result = await runWithRequestContext(requestContext, () =>
            action.handler(input, ...services),       // handler sees context via getRequestContext()
        );
        return { success: true, data: result as T };
    } catch (error) { /* unchanged */ }
}
```

`executeStream` wraps identically around its `for await` over `action.handler(...)`. **Traced**: the only call to `action.handler` in `execute` is action-registry.ts:232 and in `executeStream` is action-registry.ts:333 — both are the single points wrapped; services resolution (action-registry.ts:229, 332) stays before the wrap and is unaffected.

### 3. Dev entry builds context from Express `req`

In `createActionRouter` (action-router.ts:57-192), before dispatch, build the context and pass it to both `execute` and `executeStream`:

```typescript
const requestContext: RequestContext = {
    cookies: parseCookies(req.headers.cookie),                 // reuse cookies.ts:5
    query: flattenQuery(req.query),                            // Express query → Record<string,string>
    headers: flattenHeaders(req.headers),                      // lowercase keys, last value wins
};
// streaming:    registry.executeStream(actionName, input, requestContext)   (action-router.ts:150)
// non-streaming: registry.execute(actionName, input, requestContext)         (action-router.ts:165)
```

`parseCookies` is already imported in the dev-server (dev-server.ts:33) and used for the page path (dev-server.ts:523). GET actions parse `input` from `req.query` (action-router.ts:106-115) — the `query` in the context is the **same** raw query map; this is intentional and documented (for a GET query the context query equals the input before `_input` handling).

### 4. Production entry builds context from the Fetch `Request`

`fetchActionRequest` (fetch-action-handler.ts:15) already holds the full `Request`, so it builds the context itself — **no signature change** and nothing to thread from its two callers (jay-fetch-handler/index.ts:77, main-server.ts:114):

```typescript
const requestContext: RequestContext = {
    cookies: parseCookies(request.headers.get('cookie')),      // reuse cookies.ts:5
    query: Object.fromEntries(url.searchParams.entries()),     // already computed nearby (fetch-action-handler.ts:64)
    headers: Object.fromEntries(request.headers.entries()),    // Fetch Headers → lowercased record
};
// registry.executeStream(actionName, input, requestContext)   (fetch-action-handler.ts:87)
// registry.execute(actionName, input, requestContext)         (fetch-action-handler.ts:105)
```

This single change covers **both** production dispatch paths (edge/BaaS and Node main-server) because both funnel through `fetchActionRequest`.

### 5. CLI and render-phase calls

`run-action.ts:92` calls `registry.execute(matchedName, input)` with two args ⇒ `requestContext` defaults to the empty context (Q5). Server-side action calls from render phases go through the action callable (jay-action-builder.ts:244-248), which never sets ALS ⇒ `getRequestContext()` returns empty there too. Both are correct: there is no HTTP request.

### 6. Usage

```typescript
import { makeJayAction, ActionError } from '@jay-framework/fullstack-component';
import { getRequestContext } from '@jay-framework/stack-server-runtime';
import { MEMBER_SERVICE } from '../services';

export const renameMyAccount = makeJayAction('account.rename')
    .withServices(MEMBER_SERVICE)
    .withHandler(async (input: { newName: string }, members) => {
        const { cookies } = getRequestContext();          // ✅ server-trusted
        const token = cookies['session-token'];
        const member = token ? await members.validate(token) : null;
        if (!member) throw new ActionError('UNAUTHORIZED', 'Sign in to continue');

        // identity comes from the verified cookie, NOT from input
        return members.rename(member.id, input.newName);
    });
```

```typescript
// ❌ Anti-pattern — reading identity from spoofable input
.withHandler(async (input: { memberId: string; newName: string }, members) => {
    return members.rename(input.memberId, input.newName); // any client can pass any memberId
});
```

### 7. Data flow

```
HTTP action request  POST /_jay/actions/account.rename   (Cookie: session-token=…)
  │
  ├─ dev:  action-router.ts  → { cookies: parseCookies(req.headers.cookie), query, headers }
  └─ prod: fetch-action-handler.ts → { cookies: parseCookies(req.headers.get('cookie')), query, headers }
  │
  ▼
ActionRegistry.execute(name, input, requestContext)
  │  services = resolveServices(action.services)              (unchanged)
  ▼
runWithRequestContext(requestContext, () => handler(input, ...services))
  │
  ▼
handler  →  getRequestContext()  →  { cookies, query, headers }   (server-trusted)
```

## Implementation Plan

### Phase 0 — ALS availability spike (GATING PREREQUISITE)
0. **Before any other phase**, verify `AsyncLocalStorage` is available **and behaves correctly** on the **actual edge/BaaS (fetch) target runtime** the framework deploys to — not just on Node (Node is already guaranteed). The spike: import `node:async_hooks`, run a handler-shaped async function with interleaved `await`s inside `runWithRequestContext`, and confirm (a) the import resolves on that runtime, (b) `getStore()` returns the right context across `await` boundaries, and (c) two concurrent invocations do not bleed. Record the result in an Implementation Results section.
   - **If ALS is confirmed on the edge target** → proceed with the full design (Phases 1–6), the edge path included.
   - **If ALS is absent/incorrect on the edge target** → the Node paths (Phases 1–3, 5, 6) still proceed; the **edge path (Phase 4) pivots** per Q7 (Option A threading-on-edge, or Option B Node-serving-only) — a decision surfaced to the user before edge work starts. No empty-context "fallback" is used on edge (empty context ≠ working context).

### Phase 1 — Core accessor (stack-server-runtime)
1. Add `request-context.ts` (`RequestContext`, `runWithRequestContext`, `getRequestContext`, frozen `EMPTY_CONTEXT`).
2. Export all three from `stack-server-runtime/lib/index.ts`.

### Phase 2 — Registry wrapping
3. Add optional `requestContext` to `execute` and `executeStream`; wrap the single `handler(...)` call site in each (action-registry.ts:232, 333) with `runWithRequestContext`.

### Phase 3 — Dev entry
4. In `action-router.ts`, build `RequestContext` from `req` (reuse `parseCookies`; add small `flattenQuery` / `flattenHeaders` helpers) and pass it to `execute` (action-router.ts:165) and `executeStream` (action-router.ts:150).

### Phase 4 — Production entry (edge path gated on Phase 0)
5. In `fetch-action-handler.ts`, build `RequestContext` from `request` and pass it to `execute` (fetch-action-handler.ts:105) and `executeStream` (fetch-action-handler.ts:87). No caller changes. The **Node main-server** path funnels through `fetchActionRequest` too and is unconditional (ALS guaranteed on Node).
6. The **edge/BaaS** path proceeds only if **Phase 0 confirmed ALS** on that runtime. If not, apply the Q7 pivot (Option A or B) for the edge target rather than this ambient-ALS wiring.

### Phase 5 — Tests (fixture/behavior)
7. `stack-server-runtime`: a handler calling `getRequestContext()` inside `execute(name, input, ctx)` sees `ctx`; outside (`execute(name, input)`) sees the empty context; streaming parity; two interleaved `execute` calls with different contexts do not bleed (concurrency isolation).
8. `dev-server`: action router populates cookies/query/headers from `req`.
9. `production-server`: `fetchActionRequest` populates context from `Request`.
   - Expected values are written from the intended correct behavior first (no false greens).

### Phase 6 — agent-kit guide (jay-feedback)
10. Developer + plugin role guides under `stack-cli/agent-kit-template/`: "Reading request context in a server action" — `getRequestContext()`, the three fields, the **trusted vs. spoofable** rule (read identity from `cookies`, never `input`), and the empty-context-outside-a-request behavior.

## Verification Criteria

1. Inside an action handler invoked over HTTP, `getRequestContext().cookies` contains the request's parsed cookies; `.query` and `.headers` are populated.
2. The same handler, invoked via CLI (`jay-stack action …`) or as a direct server-side call, gets `{ cookies:{}, query:{}, headers:{} }` and does not throw.
3. Identity derived from a cookie is **not** overridable by `input` (anti-pattern test: passing a forged id in `input` has no effect when the handler reads the cookie).
4. Streaming actions (`makeJayStream`) see the same context as request-response actions.
5. Two concurrent requests with different cookies never observe each other's context.
6. Existing handlers (no `getRequestContext()` call) behave identically; all existing action tests pass unchanged.
7. Dev and the Node main-server dispatch paths populate context identically (ALS guaranteed on Node). The edge/BaaS path populates context identically **only once Phase 0 confirms ALS on that runtime**; absent that, the edge target follows the Q7 pivot and this criterion is scoped to the Node-serving paths.

## Trade-offs

| Aspect | Benefit | Cost |
| --- | --- | --- |
| Ambient accessor (ALS) over handler argument | Zero handler changes; clean client-facing type; works through any call depth | A new, if standard, runtime facility; "magic" ambient value instead of an explicit param |
| Context lives in stack-server-runtime | No fullstack-component circular dep; fullstack-component untouched | Handlers import the accessor from a second package (already common for server code) |
| Expose only cookies/query/headers | Minimal, transport-agnostic, hard to misuse | No raw request / body / Set-Cookie — some advanced cases need a future extension |
| Empty context outside a request (no throw) | Shared plugin code runs in CLI + render too | A handler cannot distinguish "no cookies" from "no request" (acceptable; add a flag later only if needed) |
| `execute` gains optional `requestContext` | Additive, backward compatible, single ALS wrap point | A (minor) signature change to a core method |
| AsyncLocalStorage | Per-request isolation, no race; **guaranteed on Node** (dev, Node main-server, CLI) | ⚠️ **not guaranteed on the edge/BaaS target** — gated on a Phase 0 spike; if absent there, the edge target must pivot (Q7 Option A threading / Option B Node-only). No transparent no-ALS fallback exists |

## Scope pre-mortem — what this does NOT handle

- **Writing response data from an action** (`Set-Cookie`, status, response headers) — **deferred**. Actions return JSON today; page response headers are a separate mechanism (DL#141 `responseHeaders`, page-only). A future DL can add an action-side response accessor if a use case appears.
- **A parsed session / typed auth object** — **out of scope (own concern)**. The framework exposes raw cookies/headers; validating a token into a session is a plugin/service responsibility (e.g. a members plugin reads the cookie and calls its service). The framework should not bake in an auth model.
- **Raw `Request` / request body exposure** — **intentionally excluded**. Keeps the surface transport-agnostic and small; the body is already `input`.
- **Secure/sandbox (worker) actions** — n/a. Actions execute server-side only; the secure sandbox (DL#12) is a client concern, no boundary is crossed.
- **A `validate` rule flagging "auth read from `input`"** — **deferred/noted**. Detecting spoofable-identity patterns statically is unreliable; the agent-kit guide carries the rule instead (jay-feedback: guide over validation here).
- **Multipart/file actions (DL#131)** — unaffected; files remain in `input`, context is still available.
- **Request context on the edge/BaaS (fetch) target** — **conditional, gated on Phase 0**. The full ambient-ALS design is committed for all Node-serving paths. The edge/BaaS target ships request-context only if the Phase 0 spike confirms ALS there; otherwise it is deferred behind a Q7 pivot decision (threading-on-edge, or Node-serving-only) rather than silently relying on an empty context. This is the one part of the design that is not unconditionally in scope.
