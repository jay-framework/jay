# DL#228: Request Context for Server Actions

Status: **[Design]** — awaiting approval (pending the gated edge/BaaS ALS spike, Phase 0; see Q7).

## Decisions for the Implementer (TL;DR)

- **Problem**: a server action handler receives only the client-sent `input` plus globally-registered singleton services. It has **no** access to the incoming request's cookies / query / headers. Anything request-scoped — above all the authenticated caller's identity — must either be smuggled through `input` (client-sent ⇒ spoofable, server-unverifiable) or go without. The page/fast-render path already surfaces cookies + query (DL#141, DL#117); actions do not.
- **Chosen mechanism**: a **request-scoped accessor**, `getRequestContext()`, backed by `AsyncLocalStorage` (ALS), exported from `@jay-framework/stack-server-runtime`. The action dispatch (`ActionRegistry.execute` / `executeStream`) runs the handler **inside** `runWithRequestContext(ctx, …)`; the handler reads context by calling `getRequestContext()`. On its promise of **both** "no handler signature changes" **and** per-request isolation: this holds **fully on Node** (dev server, Node main-server, CLI), where ALS is guaranteed. It is **not** guaranteed on the edge/BaaS (fetch) target — see the next bullet.
- **⚠️ ALS is a gating prerequisite, not an assumption**: the design's transparency property (ambient accessor, zero signature change, per-request isolation) depends on ALS being available **and correct** on each serving runtime. ALS is guaranteed on Node, so the **Node dispatch paths (~80% of this design) are implementable regardless**. The **edge/BaaS fetch target is the open question**: whether that runtime exposes `node:async_hooks`/ALS (e.g. requires a `nodejs_compat`-style flag) is **not established by this codebase**. Note the edge handler does **not** avoid Node builtins — it already pulls them transitively: `jay-fetch-handler/lib/index.ts:16` imports from the `@jay-framework/stack-server-runtime` barrel, which `export *`s `plugin-scanner` / `plugin-init-discovery`, both importing `node:fs`/`node:path`/`node:module` (plugin-scanner.ts:8-10). So "edge runs without Node builtins" is **false**; the real question is only whether `node:async_hooks` specifically resolves there.
- **⚠️ Lazy/guarded ALS so a missing API cannot break page rendering at import**: the new `request-context.ts` is exported from that same barrel, which the edge **page** path imports. A top-level `new AsyncLocalStorage()` therefore runs at **import time** on the edge — if `node:async_hooks` is unavailable there, it would throw and break the edge **page** render, not just actions. The design **must create the ALS store lazily (behind a guarded accessor)** so importing the module can never throw: a missing ALS degrades to the safe empty context at *call* time, never a crash at *import* time. Call-time must not be **silent**, though: when a **real** request is dispatched with no ALS store, the dispatch emits a **one-time error log** (`getRequestContext()` stays non-throwing per call, to avoid crashing the edge page path). A **Phase 0 spike (below) must still verify ALS on the actual edge/BaaS target before any edge work**; if ALS is absent there, the design **pivots on that target** (accept a handler-signature/threading change, or scope request-context to Node-serving only) — there is **no transparent no-ALS fallback** (see Q7). The edge path is gated on the Phase 0 result.
- **Rejected**: threading a `ctx` argument into `withHandler((input, ctx, …services))`. It is a breaking change to every handler, it is positionally ambiguous against spread services, and it would leak server HTTP concerns into the client-facing `JayAction` callable type `(input) => Promise<O>`. See Prior Art + Q3.
- **What is exposed** (minimal): `{ cookies, query, headers }`, all `Record<string, string>`. `cookies` / `query` **reuse the existing shapes** from `RequestCookies` / `RequestQuery` (jay-stack-types.ts:84-94); `parseCookies` (cookies.ts:5) is reused for parsing. **No** raw request object, **no** request body, **no** `Set-Cookie`, **no** parsed session — those are out of scope (see Scope pre-mortem). Note: `headers` also contains the raw `cookie` header, so the cookie data appears both parsed (in `cookies`) and raw (in `headers.cookie`) — harmless duplication; `cookies` is the intended accessor.
- **Lifetime**: strictly request-scoped. Outside a request (CLI `jay-stack action …`, or a server-side action call from a render phase), `getRequestContext()` returns a **safe empty context** `{ cookies: {}, query: {}, headers: {} }` — it does not throw — so shared plugin code runs in both settings. Mirrors fast-render's `cookies/query` defaulting to `{}` (fast-changing-runner.ts:28-29).
- **Security framing**: `getRequestContext()` returns **server-trusted request data** — cookies/headers the browser actually sent, parsed server-side — as opposed to spoofable `input`. Auth code must read the token/session cookie from the context, never from `input`.
- **⚠️ Caching + context = cross-user data leak (must be closed in this DL)**: a cached **GET** query (`makeJayQuery().withCaching(...)`) today gets `Cache-Control: max-age=…, stale-while-revalidate=…` with **no `private` and no `Vary: Cookie`** — emitted by `getCacheHeaders` (action-registry.ts:273-292) and applied at both dispatch paths (fetch-action-handler.ts:110-113, action-router.ts:170-173). Once such a query can read `getRequestContext()`, a **per-user** response (keyed on a cookie) could be stored by a shared/CDN cache and served to **other** users. Decision: **when a handler reads the request context, its response must not be shared-cached across users.** `getRequestContext()` records "context was read" for the current request; the cache-header path then marks that response `private` (and adds `Vary: Cookie`), i.e. shared caching is disabled for context-reading responses. See Design §8.
- **Three dispatch entry points to wire** (all already hold the full request): dev-server Express router (action-router.ts), and production `fetchActionRequest` (fetch-action-handler.ts), which serves **both** the Node main-server and the edge/BaaS fetch handler. The CLI path (run-action.ts) passes nothing ⇒ empty context.
- **jay-feedback**: this **is** a framework feature (the capability does not exist). Accompany it with an **agent-kit guide** (how to read request context in an action + the trusted-vs-spoofable security note + the caching rule below). A deterministic `validate` **warning** is reasonable and proposed: flag a **cached GET query** (`makeJayQuery` with `.withCaching`) whose handler references `getRequestContext` — "cached action reads request context without `private`; per-user data may be shared-cached" — since this is statically detectable (unlike "auth read from `input`", which stays guide-only). See §Design 8 and Phase 6.

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

**Nested action calls (inside a request).** A handler that calls **another action's callable directly** (`await otherAction(input)`) does **not** go through the registry: the callable is the closure built at jay-action-builder.ts:244-248, which resolves services and calls `handler(input, ...services)` with no ALS wrapping of its own. Because that call executes **within** the outer handler's `runWithRequestContext` scope, the inner handler's `getRequestContext()` **inherits the same request context** via ALS — the correct, transparent behavior (and consistent with the Q6 inherit-by-default for a nested `registry.execute`). A planned test covers this nested-callable case (Phase 5).

**Q6: Does `ActionRegistry.execute` change signature?**
A6: Yes, additively: `execute(actionName, input, requestContext?)` and `executeStream(actionName, input, requestContext?)`. The parameter **defaults to `peekRequestContext()`** — i.e. it **inherits the enclosing request's context** — not to a hard-coded empty context. This default is what makes nested calls correct: when there is no enclosing request (CLI, render-phase call) `peekRequestContext()` returns the empty context (Q5), so a two-arg call still behaves as "no context"; when a handler already running inside a request calls `registry.execute(name, input)` without passing a context, the inner call **inherits** the outer request's context rather than wiping it. It uses `peekRequestContext()` rather than `getRequestContext()` so that merely inheriting the context does **not** flip `contextWasRead` on the outer scope — only a genuine `getRequestContext()` read by a handler marks the response per-user (§8). Existing callers (tests, CLI) that pass two args keep working. The registry wraps the handler call in `runWithRequestContext`. Centralizing the ALS wrap in the registry (not in each HTTP entry point) keeps a single source of truth and guarantees streaming + non-streaming parity.

**Q7: Does AsyncLocalStorage work on the production edge/BaaS (fetch) runtime, and what if it does not?**
A7: **Node: yes, guaranteed.** ALS (`node:async_hooks`) ships with Node, so every Node-serving dispatch path — dev server, Node main-server, CLI — is sound and the full design (ambient accessor, no signature change, per-request isolation) holds.

**Edge/BaaS: unverified — a gating prerequisite, not an assumption.** `AsyncLocalStorage` is part of the WinterCG common-minimum API and many edge runtimes expose it, but whether the **actual** edge/BaaS target this framework deploys to exposes `node:async_hooks`/ALS (some require a `nodejs_compat`-style flag) is **not established by this codebase**.

**The edge handler already pulls `node:` builtins transitively.** The edge handler imports from the `@jay-framework/stack-server-runtime` barrel (jay-fetch-handler/lib/index.ts:16), and that barrel `export *`s `./plugin-scanner` and `./plugin-init-discovery` (stack-server-runtime/lib/index.ts:12-13), both of which `import 'node:fs' / 'node:path' / 'node:module'` (plugin-scanner.ts:8-10). So the edge bundle **already** pulls `node:` builtins transitively; "edge runs without Node builtins" is false. The spike's real job is therefore narrower: **does the edge runtime run with Node compatibility** (which would resolve `node:async_hooks` and settle this immediately), **or expose `AsyncLocalStorage` as a global** (which `ensureRequestContextStorage` tries first, §1), and **does ALS resolve and behave correctly** there — not whether `node:` is reachable at all.

**Import-time safety is the design's responsibility, independent of the spike.** Because `request-context.ts` is exported from that same barrel, which the edge **page** path imports, a top-level `new AsyncLocalStorage()` would execute at **import time** on the edge and, if ALS were unavailable, would throw and break the edge **page** render — not just actions. The design therefore creates the ALS store **lazily, behind a guarded accessor** (Design §1): importing the module never throws; a missing ALS degrades to the safe empty context at call time.

**Call-time must not be silent.** Import-safety must never become "silently serve an empty context to real requests" — an empty context means "no request", and serving it to an authenticated caller would treat them as unauthorized. So while `getRequestContext()` is kept non-throwing on every call (throwing per-call could crash the edge **page** path, which also imports the barrel), the **dispatch path** emits a **one-time error log** the first time a **real** (non-empty) request is dispatched with no ALS store (`runWithRequestContext`, Design §1). This reconciles import-safety with "not silent" without crashing page render. A runtime that truly lacks ALS is expected to **pivot per Phase 0** (Option A threading on that target, or Option B Node-serving only), not to lean on this log as a steady state. This **must be verified by the Phase 0 spike on the real target runtime before any edge work** (see Implementation Plan Phase 0 + Verification Criteria #7).

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
import { getLogger } from '@jay-framework/logger'; // already a dependency (package.json)

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
    /** Request headers, lowercased keys, repeated values joined with ", " (see §3/§4). */
    headers: Record<string, string>;
}

/** Internal per-request scope: the context plus a mutable "was it read?" flag (drives §8 caching). */
interface RequestScope {
    context: RequestContext;
    contextWasRead: boolean;
}

const EMPTY_CONTEXT: RequestContext = Object.freeze({
    cookies: Object.freeze({}),
    query: Object.freeze({}),
    headers: Object.freeze({}),
}) as RequestContext;

/** Deep-freeze a per-request context so a handler cannot mutate shared request state (Q/immutability). */
export function freezeRequestContext(context: RequestContext): RequestContext {
    Object.freeze(context.cookies);
    Object.freeze(context.query);
    Object.freeze(context.headers);
    return Object.freeze(context);
}

// Lazy, guarded ALS. Resolution is dynamic and wrapped so merely *importing* this module
// (the stack-server-runtime barrel is pulled in by the edge PAGE path too) can NEVER throw
// when ALS is unavailable. A missing API degrades to EMPTY_CONTEXT at *call* time (with a
// one-time error log on real dispatch, see runWithRequestContext) — never a crash at import
// time. See Q7.
let storage: AsyncLocalStorage<RequestScope> | undefined;
let storageReady: Promise<void> | undefined;

/**
 * Resolve the ALS store exactly once, caching the in-flight PROMISE (not a boolean).
 * Caching a boolean would let a second request arriving during resolution proceed while
 * `storage` is still undefined (cold-start race → that request reads an empty context and a
 * signed-in caller is wrongly treated as unauthorized). Caching the promise makes every caller
 * await the same resolution. Tries a runtime-provided global `AsyncLocalStorage` first (some
 * edge runtimes expose it on `globalThis` rather than as a module), then the `node:async_hooks`
 * module. Never throws: a runtime without ALS leaves `storage` undefined. Dispatch awaits this
 * before wrapping a handler.
 */
export function ensureRequestContextStorage(): Promise<void> {
    return (storageReady ??= initStorage());
}

async function initStorage(): Promise<void> {
    const globalAls = (globalThis as { AsyncLocalStorage?: typeof AsyncLocalStorage })
        .AsyncLocalStorage;
    if (typeof globalAls === 'function') {
        storage = new globalAls<RequestScope>();
        return;
    }
    await import('node:async_hooks').then(
        (m) => {
            storage = new m.AsyncLocalStorage<RequestScope>();
        },
        () => {
            storage = undefined; // no ALS on this runtime → getRequestContext() yields EMPTY_CONTEXT
        },
    );
}

let missingStorageLogged = false;

/**
 * Run `fn` with `context` as the active request context (used by action dispatch).
 * Returns the mutable scope so the caller can read `contextWasRead` after `fn` completes.
 */
export function runWithRequestContext<T>(
    context: RequestContext,
    fn: () => T,
): { result: T; scope: RequestScope } {
    const scope: RequestScope = { context, contextWasRead: false };
    if (!storage) {
        // No ALS on this runtime. Import-time stayed safe (never threw), but a REAL request is now
        // being dispatched with no way to surface its context. Do NOT fail silently (Q7): emit a
        // one-time, non-crashing error log so an operator sees it — without crashing page render by
        // throwing on every call. A context equal to EMPTY_CONTEXT is a CLI/render call with no
        // request, which is expected and stays quiet.
        if (context !== EMPTY_CONTEXT && !missingStorageLogged) {
            missingStorageLogged = true;
            getLogger().error(
                'request context unavailable: AsyncLocalStorage did not resolve on this runtime, so ' +
                    'getRequestContext() returns an empty context for all action handlers. A runtime ' +
                    'lacking ALS must pivot per Phase 0 (Node-serving only, or threading on that ' +
                    'target) rather than silently serve an empty context.',
            );
        }
        return { result: fn(), scope }; // no ALS: handler runs; reads yield EMPTY_CONTEXT
    }
    return { result: storage.run(scope, fn), scope };
}

/**
 * Read the current request's context inside an action handler.
 * Records the read for the current request (so the dispatch can disable shared caching, §8).
 * Returns an empty context when called outside a request (CLI, render-phase action calls).
 */
export function getRequestContext(): RequestContext {
    const scope = storage?.getStore();
    if (!scope) return EMPTY_CONTEXT;
    scope.contextWasRead = true;
    return scope.context;
}

/**
 * Like getRequestContext() but does NOT record a read. Used ONLY as the default value of the
 * registry's `requestContext` parameter: a nested two-arg `registry.execute` must INHERIT the
 * enclosing context without flipping `contextWasRead` on the outer scope — otherwise the outer
 * response would be falsely downgraded to `private` (§8) even though nothing read context.
 * Internal only; handlers always use getRequestContext().
 */
export function peekRequestContext(): RequestContext {
    return storage?.getStore()?.context ?? EMPTY_CONTEXT;
}
```

`RequestContext` deliberately has the same `cookies`/`query` field types as `RequestCookies`/`RequestQuery` (jay-stack-types.ts:84-94) so the two surfaces stay consistent; it is defined in stack-server-runtime to avoid the fullstack-component circular dependency (Q2). The `contextWasRead` flag lives on the **internal** `RequestScope`, never on the public `RequestContext` the handler sees — the handler surface stays `{ cookies, query, headers }`.

**Public vs. internal export surface.** Only `getRequestContext()` and the `RequestContext` type are part of the **public** surface (what handler/plugin code imports). `runWithRequestContext`, `ensureRequestContextStorage`, `peekRequestContext`, and `freezeRequestContext` are dispatch internals and must **not** be publicly importable — otherwise plugin code could call `runWithRequestContext` with a fabricated context and impersonate a caller. They are exported from an **internal subpath** (`@jay-framework/stack-server-runtime/internal`) consumed only by the dev-server and production-server dispatch code. See the "Export surface" note below and Implementation Plan Phase 1.

### 2. Registry dispatch wraps the handler (the only runtime behavior change)

`ActionRegistry.execute` (action-registry.ts:201-265) and `executeStream` (action-registry.ts:326-336) gain an optional `requestContext` and wrap the handler call:

```typescript
async execute<T = any>(
    actionName: string,
    input: unknown,
    requestContext: RequestContext = peekRequestContext(), // default: INHERIT (Q6) without recording a read — empty only when unset
): Promise<ActionExecutionResult<T>> {
    // … unchanged lookup / streaming guard …
    try {
        await ensureRequestContextStorage();               // resolve lazy ALS before wrapping
        const services = resolveServices(action.services);
        const { result, scope } = runWithRequestContext(requestContext, () =>
            action.handler(input, ...services),            // handler sees context via getRequestContext()
        );
        const data = await result;                         // ALS propagates through the awaited chain;
        // scope.contextWasRead is now set iff the handler read the context (read AFTER the await):
        return { success: true, data: data as T, contextWasRead: scope.contextWasRead };
    } catch (error) { /* unchanged */ }
}
```

`ActionExecutionResult` gains an optional `contextWasRead?: boolean` so the HTTP dispatch can disable shared caching for a context-reading response (§8). The default parameter is `peekRequestContext()` — **inherit** the enclosing context (Q6), which is `EMPTY_CONTEXT` when there is no active request. It is `peekRequestContext()` (not `getRequestContext()`) on purpose: inheriting the context for a nested two-arg `registry.execute` must **not** flip `contextWasRead` on the outer scope, or the outer response would be falsely downgraded to `private` (§8) when nothing actually read context. The flag therefore reflects only genuine `getRequestContext()` reads by handlers (minor fix).

**`executeStream` must enclose the _entire_ iteration in the ALS scope, not just generator creation.** Wrapping only `storage.run(ctx, () => handler(...))` is wrong: `run()` would return the async generator before its body executes, and each later `.next()` would resume **outside** the store. Drive the handler generator manually so every resumption runs inside `runWithRequestContext`:

```typescript
async *executeStream(
    actionName: string,
    input: unknown,
    requestContext: RequestContext = peekRequestContext(),
): AsyncGenerator<any> {
    const action = this.actions.get(actionName);
    if (!action || !action.isStreaming) throw new Error(`Streaming action '${actionName}' not found`);

    await ensureRequestContextStorage();
    const services = resolveServices(action.services);

    // Create the iterator inside the scope, then resume it inside the scope on every step.
    const { result: iterator } = runWithRequestContext(requestContext, () =>
        action.handler(input, ...services) as AsyncGenerator<any>,
    );
    try {
        while (true) {
            const { result: step } = runWithRequestContext(requestContext, () => iterator.next());
            const { value, done } = await step;      // resumption ran inside the store
            if (done) break;
            yield value;
        }
    } finally {
        // If the consumer stops early (client disconnect / `break`), close the handler generator
        // INSIDE the request scope so its `finally` blocks run and clean up (connections,
        // subscriptions). A plain `for await` did this automatically; the manual drive must call
        // `return()` explicitly or that cleanup is dropped — a leak regression vs. today's loop.
        await runWithRequestContext(requestContext, () => iterator.return?.()).result;
    }
}
```

Streaming actions are POST (no GET cache headers), so the `contextWasRead` flag is not needed for caching on this path. **Traced**: the only call to `action.handler` in `execute` is action-registry.ts:232 and in `executeStream` is action-registry.ts:333 — both are the single points wrapped; services resolution (action-registry.ts:229, 332) stays before the wrap and is unaffected. Current signatures are two-arg (action-registry.ts:201, 326); `requestContext` is added additively (Q6).

### Export surface (public vs. internal)

The public barrel (`stack-server-runtime/lib/index.ts`) today uses `export *` per module. For `request-context.ts` that is **not** acceptable: it would publicly expose `runWithRequestContext`, which lets any importer run a handler under a **fabricated** context (identity spoofing). The dispatch internals are therefore split off:

- **Public** — the barrel re-exports **only** `getRequestContext` and the `RequestContext` type (a selective `export { getRequestContext, type RequestContext } from './request-context'`, not `export *`). This is all handler/plugin code ever needs.
- **Internal** — a new entry `stack-server-runtime/lib/internal.ts` re-exports `runWithRequestContext`, `ensureRequestContextStorage`, `peekRequestContext`, and `freezeRequestContext`, surfaced as the subpath `@jay-framework/stack-server-runtime/internal`. The package gains an `exports` map (`"."` → the main barrel, `"./internal"` → the internal entry) and the build emits both entry points (today only `lib/index.ts` is built). Only the dev-server and production-server dispatch code import from `/internal`.

### 3. Dev entry builds context from Express `req`

In `createActionRouter` (action-router.ts:57-192), before dispatch, build the context and pass it to both `execute` and `executeStream`:

```typescript
const requestContext = freezeRequestContext({
    cookies: parseCookies(req.headers.cookie),                 // reuse cookies.ts:5
    query: flattenQuery(req.query),                            // Express query → Record<string,string>
    headers: flattenHeaders(req.headers),                      // lowercase keys, repeated values joined ", " (see rule)
});
// streaming:    registry.executeStream(actionName, input, requestContext)   (action-router.ts:150)
// non-streaming: registry.execute(actionName, input, requestContext)         (action-router.ts:165)
```

`flattenQuery` / `flattenHeaders` are small **new** helpers added in this file (no `flattenHeaders` exists in the codebase today — verified by grep). The context is passed through `freezeRequestContext` (Design §1) so a handler cannot mutate shared request state — the per-request context is frozen just like `EMPTY_CONTEXT`. `freezeRequestContext` is imported from the **internal** subpath (`@jay-framework/stack-server-runtime/internal`), not the public barrel (Export surface note).

Because this entry always dispatches a **real** (non-empty) context, a runtime that lacks ALS does **not** silently serve an empty context here: the registry's `runWithRequestContext` emits a one-time error log on the first such dispatch (Design §1, Q7). On Node (the dev server) ALS is guaranteed, so this path never hits that branch.

**Single header-flattening rule for both entries (Verification Criterion 7).** Repeated request headers are **joined with `", "`** (the HTTP list rule), lowercased keys. This is what the Fetch side already does (`Headers.entries()` combines repeats with `, `), and it matches Node/Express `req.headers`, which already collapses most duplicate request headers into a single `", "`-joined string. `flattenHeaders` therefore passes `req.headers` values through unchanged (joining with `", "` for the rare array-valued header), **not** "last value wins", so dev and prod produce identical header maps. (`set-cookie` is response-only and never appears on a request, so its array special-casing is irrelevant here.)

`parseCookies` is already imported in the dev-server (dev-server.ts:33) and used for the page path (dev-server.ts:523). GET actions parse `input` from `req.query` (action-router.ts:106-115) — the `query` in the context is the **same** raw query map; this is intentional and documented (for a GET query the context query equals the input before `_input` handling).

### 4. Production entry builds context from the Fetch `Request`

`fetchActionRequest` (fetch-action-handler.ts:15) already holds the full `Request`, so it builds the context itself — **no signature change** and nothing to thread from its two callers (jay-fetch-handler/index.ts:77, main-server.ts:114):

```typescript
const requestContext = freezeRequestContext({
    cookies: parseCookies(request.headers.get('cookie')),      // reuse cookies.ts:5
    query: Object.fromEntries(url.searchParams.entries()),     // already computed nearby (fetch-action-handler.ts:64)
    headers: Object.fromEntries(request.headers.entries()),    // lowercased keys; repeats already ", "-joined by Fetch
});
// registry.executeStream(actionName, input, requestContext)   (fetch-action-handler.ts:87)
// registry.execute(actionName, input, requestContext)         (fetch-action-handler.ts:105)
```

`Object.fromEntries(request.headers.entries())` already yields the single-header rule above: Fetch `Headers.entries()` returns lowercased keys with repeated values combined by `, `. The dev-side `flattenHeaders` is specified to match it (§3), so both entries produce identical header maps (Verification Criterion 7). The context is frozen via `freezeRequestContext` here too.

This single change covers **both** production dispatch paths (edge/BaaS and Node main-server) because both funnel through `fetchActionRequest`. `freezeRequestContext` is imported from the **internal** subpath here too (Export surface note).

Here as well the dispatched context is real (non-empty), so a runtime missing ALS is not silent: the first such dispatch triggers the one-time error log in `runWithRequestContext` (§1, Q7). On the Node main-server ALS is guaranteed; on the edge/BaaS target the one-time log is the visible signal if Phase 0 is skipped and ALS turns out absent — at which point that target must pivot per Q7 (Node-serving only, or threading) rather than serve empty context.

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

### 8. Reading context disables shared caching (cross-user-leak guard)

**The problem this closes.** A GET query may be cached: `makeJayQuery('x').withCaching({ maxAge })` (jay-action-builder.ts:221, 305) ⇒ `getCacheHeaders` emits `Cache-Control: max-age=…, stale-while-revalidate=…` (action-registry.ts:273-292) with **no `private` and no `Vary`**, applied at both fetch-action-handler.ts:110-113 and action-router.ts:170-173. Before this DL that is fine — a cached query's response is the same for every caller. **After this DL** a cached query can call `getRequestContext()` and return a response derived from the caller's cookie (e.g. "my orders"). A shared/CDN cache keyed only on the URL would then store the first user's response and serve it to **other users** — a cross-user data leak.

**Decision.** A response produced by a handler that **read the request context** must not be shared-cached across users. The mechanism reuses the `contextWasRead` flag from Design §1/§2:

1. `execute` returns `contextWasRead` in its result (§2).
2. Only on the **GET + cache-eligible** branch (where `getCacheHeaders` is consulted today), when `contextWasRead` is true, the dispatch **rewrites the cache directive to be per-user**: prepend `private` and add `Vary: Cookie` (equivalently, for a CDN that ignores `private`, downgrade to `no-store`). When `contextWasRead` is false, today's behavior is unchanged (safe to shared-cache).

```typescript
// fetch-action-handler.ts (GET success branch, replacing lines 109-113) and the
// equivalent action-router.ts:168-174 — ONE rule, both entries:
if (requestMethod === 'GET') {
    const cacheHeaders = registry.getCacheHeaders(actionName);
    if (cacheHeaders) {
        if (result.contextWasRead) {
            headers['Cache-Control'] = `private, ${cacheHeaders}`; // not shared-cacheable
            headers['Vary'] = 'Cookie';
        } else {
            headers['Cache-Control'] = cacheHeaders;               // unchanged
        }
    }
}
```

This is enforced at the **dispatch** layer (where cache headers are already emitted), so a plugin author cannot forget it. It is deliberately conservative: a cached query that never reads context keeps full shared caching; the moment it reads context, its response becomes per-user. The accompanying `validate` **warning** (TL;DR jay-feedback, Phase 6) surfaces the combination at build time so the author is aware rather than surprised by a cache downgrade.

## Implementation Plan

### Phase 0 — edge ALS availability spike (GATING PREREQUISITE)
0. **Before any edge work**, answer two questions on the **actual edge/BaaS (fetch) target runtime** (Node is already guaranteed, so this spike is edge-only):
   - **(a) Is ALS available at all on the target — as a global or via Node compatibility?** `ensureRequestContextStorage` tries **`globalThis.AsyncLocalStorage` first**, then the `node:async_hooks` module (Design §1), so check **both**: (i) does the runtime expose `AsyncLocalStorage` as a global, and (ii) does the edge bundle run with Node compatibility that resolves `node:async_hooks`? The edge handler already imports `node:fs`/`node:path`/`node:module` transitively (jay-fetch-handler/lib/index.ts:16 → barrel → plugin-scanner.ts:8-10), so the edge build must already be providing *some* Node builtins. If either (i) or (ii) holds and resolves ALS, the question is **settled affirmatively** — confirm this first, as it may need no further spike.
   - **(b) If (a) is inconclusive, run the ALS behaviour spike:** resolve the store via `ensureRequestContextStorage` (global or `await import('node:async_hooks')`), run a handler-shaped async function with interleaved `await`s inside `runWithRequestContext`, and confirm the store resolves, `getStore()` returns the right context across `await` boundaries, and two concurrent invocations do not bleed. Record the result in an Implementation Results section.
   - **Independent of the spike, the design is import-safe:** the ALS store is created lazily behind `ensureRequestContextStorage` (Design §1), so even if `node:async_hooks` is absent on the edge, merely **importing** the barrel (which the edge **page** path does) never throws — it degrades to the empty context at call time. The spike decides the *edge action* capability, never page-render safety.
   - **If ALS is confirmed on the edge target** → proceed with the full design (Phases 1–6), the edge path included.
   - **If ALS is absent/incorrect on the edge target** → the Node paths (Phases 1–3, 5, 6) still proceed; the **edge path (Phase 4) pivots** per Q7 (Option A threading-on-edge, or Option B Node-serving-only) — a decision surfaced to the user before edge work starts. No empty-context "fallback" is used on edge (empty context ≠ working context).

### Phase 1 — Core accessor (stack-server-runtime)
1. Add `request-context.ts`: `RequestContext`, internal `RequestScope` (carries `contextWasRead`), frozen `EMPTY_CONTEXT`, `freezeRequestContext`, the **lazy/guarded** `ensureRequestContextStorage` (caches the resolution **promise**, not a boolean, to avoid the cold-start race; tries `globalThis.AsyncLocalStorage` first, then dynamic `import('node:async_hooks')`, wrapped so importing the module never throws), `runWithRequestContext` (returns `{ result, scope }`; emits the one-time error log when dispatching a real context with no ALS), `getRequestContext` (flips `scope.contextWasRead`), and the internal `peekRequestContext` (reads context **without** flipping the flag — the registry default-param inheritance path).
2. **Public vs. internal exports.** From `stack-server-runtime/lib/index.ts`, re-export **only** `getRequestContext` and the `RequestContext` type (selective `export { … }`, not `export *`). Add `stack-server-runtime/lib/internal.ts` re-exporting `runWithRequestContext`, `ensureRequestContextStorage`, `peekRequestContext`, and `freezeRequestContext`; add a package `exports` map (`"."` → main, `"./internal"` → the internal entry) and build both entry points. Only dev-server / production-server import from `/internal` (Export surface note).

### Phase 2 — Registry wrapping
3. Add optional `requestContext` (default `peekRequestContext()`, i.e. inherit without recording a read — Q6 / minor fix) to `execute` and `executeStream`; `await ensureRequestContextStorage()` first, then wrap the single `handler(...)` call site in each (action-registry.ts:232, 333). `executeStream` uses the manual-drive shape so the ALS scope encloses the **entire** iteration, **wrapped in try/finally that calls `iterator.return?.()` inside the request scope** so a consumer that stops early still runs the handler's cleanup (Design §2). `execute` returns `contextWasRead` on its result; add `contextWasRead?: boolean` to `ActionExecutionResult`. Import the internals from `@jay-framework/stack-server-runtime/internal`.

### Phase 3 — Dev entry (dispatch + caching guard)
4. In `action-router.ts`, build `RequestContext` from `req` via `freezeRequestContext` (reuse `parseCookies`; add small `flattenQuery` / `flattenHeaders` helpers, headers joined with `", "` per §3) and pass it to `execute` (action-router.ts:165) and `executeStream` (action-router.ts:150).
5. Apply the §8 caching guard at the GET cache-header branch (action-router.ts:168-174): if `result.contextWasRead`, emit `Cache-Control: private, <cacheHeaders>` + `Vary: Cookie`; else unchanged.

### Phase 4 — Production entry (dispatch + caching guard; edge path gated on Phase 0)
6. In `fetch-action-handler.ts`, build `RequestContext` from `request` via `freezeRequestContext` and pass it to `execute` (fetch-action-handler.ts:105) and `executeStream` (fetch-action-handler.ts:87). No caller changes. The **Node main-server** path funnels through `fetchActionRequest` too and is unconditional (ALS guaranteed on Node).
7. Apply the §8 caching guard at the GET cache-header branch (fetch-action-handler.ts:109-113), identically to Phase 3.
8. The **edge/BaaS** path proceeds only if **Phase 0 confirmed ALS** on that runtime. If not, apply the Q7 pivot (Option A or B) for the edge target rather than this ambient-ALS wiring.

### Phase 5 — Tests (fixture/behavior)
9. `stack-server-runtime`: a handler calling `getRequestContext()` inside `execute(name, input, ctx)` sees `ctx`; outside (`execute(name, input)`) sees the empty context; streaming parity; two interleaved `execute` calls with different contexts do not bleed (concurrency isolation).
10. **Nested-call isolation**: a handler that calls another action's callable directly (`await otherAction(input)`, the jay-action-builder.ts:244-248 closure) — the inner handler's `getRequestContext()` inherits the outer request's context; and a nested `registry.execute(name, input)` (two-arg) inherits rather than wipes (Q6). **Also assert the peek default has no side effect**: when the outer handler does **not** read context but calls a nested two-arg `registry.execute`, the outer response is **not** downgraded to `private` (the inherited default used `peekRequestContext`, which does not flip `contextWasRead`).
10b. **Streaming cleanup on early abandon** (MF2): a streaming handler whose generator has a `finally` block — when the consumer stops iterating early (`break` / client disconnect), the manual drive calls `iterator.return?.()` inside the request scope and the handler's `finally` runs (no leaked connection/subscription). Fails against a manual loop that omits the `return()` call.
10c. **Call-time non-silence** (MF3): dispatching a real (non-empty) context with no ALS store runs the handler (empty context) **and** emits exactly one error log across repeated dispatches; an `EMPTY_CONTEXT` dispatch (CLI/render) stays quiet.
11. **Caching guard** (§8): a cached GET query (`makeJayQuery().withCaching`) whose handler reads context yields `Cache-Control: private, …` + `Vary: Cookie`; one that does **not** read context keeps the plain `max-age=…` (no `private`). Written as expected-first, no false greens.
12. **Import-safety**: importing `request-context.ts` with `node:async_hooks` unavailable does not throw; `getRequestContext()` then returns the empty context.
13. `dev-server`: action router populates cookies/query/headers from `req` and applies the §8 caching guard.
14. `production-server`: `fetchActionRequest` populates context from `Request` and applies the §8 caching guard.
   - Expected values are written from the intended correct behavior first (no false greens).

### Phase 6 — agent-kit guide + validation (jay-feedback)
15. Developer + plugin role guides under `stack-cli/agent-kit-template/`: "Reading request context in a server action" — `getRequestContext()`, the three fields, the **trusted vs. spoofable** rule (read identity from `cookies`, never `input`), the empty-context-outside-a-request behavior, and the **caching rule** (a cached GET query that reads context becomes per-user / `private`).
16. **`jay-stack validate` warning**: flag a `makeJayQuery` + `.withCaching` whose handler references `getRequestContext` — "cached query reads request context; its response is downgraded to `private` (per-user) and cannot be shared-cached." Statically detectable (GET + caching + a `getRequestContext` reference), located, suppressible — the `validate`-first rung of the priority order for the caching dimension (the "auth read from `input`" case stays guide-only, as it is not reliably detectable).

## Verification Criteria

1. Inside an action handler invoked over HTTP, `getRequestContext().cookies` contains the request's parsed cookies; `.query` and `.headers` are populated.
2. The same handler, invoked via CLI (`jay-stack action …`) or as a direct server-side call, gets `{ cookies:{}, query:{}, headers:{} }` and does not throw.
3. Identity derived from a cookie is **not** overridable by `input` (anti-pattern test: passing a forged id in `input` has no effect when the handler reads the cookie).
4. Streaming actions (`makeJayStream`) see the same context as request-response actions.
5. Two concurrent requests with different cookies never observe each other's context.
6. Existing handlers (no `getRequestContext()` call) behave identically; all existing action tests pass unchanged.
7. Dev and the Node main-server dispatch paths populate context identically — **same header-flattening rule** on both (repeats joined with `", "`, §3/§4). The edge/BaaS path populates context identically **only once Phase 0 confirms ALS on that runtime**; absent that, the edge target follows the Q7 pivot and this criterion is scoped to the Node-serving paths.
8. **Caching cross-user guard (§8)**: a cached GET query (`makeJayQuery().withCaching`) whose handler calls `getRequestContext()` returns a response with `Cache-Control: private` (+ `Vary: Cookie`) — never a shared-cacheable `max-age` without `private`. A cached GET query that does **not** read context is unchanged (plain `max-age=…`). A shared/CDN cache cannot serve one user's context-derived response to another.
9. **Nested calls inherit context**: an action handler that calls another action (via its callable, or via a two-arg `registry.execute`) sees the enclosing request's context in the inner handler — not an empty one.
10. **Import safety**: importing the stack-server-runtime barrel on a runtime without ALS does not throw at import time (the edge page path stays functional); context simply reads empty there.
11. **Streaming cleanup**: a streaming handler whose generator has a `finally` block runs that cleanup even when the consumer abandons the stream early (client disconnect) — no leaked connections/subscriptions.
12. **Call-time non-silence**: a runtime without ALS does not silently serve an empty context to real requests — the dispatch emits a one-time error log on the first such dispatch, while `getRequestContext()` never throws (the edge page path stays functional).
13. **No cold-start race**: concurrent requests arriving while the ALS store is still resolving all observe a resolved store (the resolution promise is cached, not a boolean) — none sees an empty context due to a half-initialized store.
14. **Internal surface not public**: `runWithRequestContext` / `ensureRequestContextStorage` / `freezeRequestContext` / `peekRequestContext` are not importable from the public barrel; only `getRequestContext` and `RequestContext` are.

## Trade-offs

| Aspect | Benefit | Cost |
| --- | --- | --- |
| Ambient accessor (ALS) over handler argument | Zero handler changes; clean client-facing type; works through any call depth | A new, if standard, runtime facility; "magic" ambient value instead of an explicit param |
| Context lives in stack-server-runtime | No fullstack-component circular dep; fullstack-component untouched | Handlers import the accessor from a second package (already common for server code) |
| Expose only cookies/query/headers | Minimal, transport-agnostic, hard to misuse | No raw request / body / Set-Cookie — some advanced cases need a future extension |
| Empty context outside a request (no throw) | Shared plugin code runs in CLI + render too | A handler cannot distinguish "no cookies" from "no request" (acceptable; add a flag later only if needed) |
| `execute` gains optional `requestContext` | Additive, backward compatible, single ALS wrap point | A (minor) signature change to a core method |
| Context-read disables shared caching (§8) | Closes a cross-user data leak; enforced at dispatch so authors can't forget; conservative (only context-reading responses downgrade) | A cached GET query that reads context loses shared/CDN caching (becomes per-user `private`); authors warned via `validate` |
| Lazy/guarded ALS (global-first, else dynamic import) | Importing the barrel never throws, so a no-ALS edge runtime cannot break page rendering at import; a real request without ALS is not silent (one-time error log), not a crash | One-time async init before dispatch (`ensureRequestContextStorage`, resolution **promise** cached to avoid a cold-start race); a dynamic import instead of a static one |
| AsyncLocalStorage | Per-request isolation, no race; **guaranteed on Node** (dev, Node main-server, CLI) | ⚠️ **not guaranteed on the edge/BaaS target** — gated on a Phase 0 spike; if absent there, the edge target must pivot (Q7 Option A threading / Option B Node-only). No transparent no-ALS fallback exists |

## Scope pre-mortem — what this does NOT handle

- **Writing response data from an action** (`Set-Cookie`, status, response headers) — **deferred**. Actions return JSON today; page response headers are a separate mechanism (DL#141 `responseHeaders`, page-only). A future DL can add an action-side response accessor if a use case appears.
- **A parsed session / typed auth object** — **out of scope (own concern)**. The framework exposes raw cookies/headers; validating a token into a session is a plugin/service responsibility (e.g. a members plugin reads the cookie and calls its service). The framework should not bake in an auth model.
- **Raw `Request` / request body exposure** — **intentionally excluded**. Keeps the surface transport-agnostic and small; the body is already `input`.
- **Secure/sandbox (worker) actions** — n/a. Actions execute server-side only; the secure sandbox (DL#12) is a client concern, no boundary is crossed.
- **A `validate` rule flagging "auth read from `input`"** — **deferred/noted**. Detecting spoofable-identity patterns statically is unreliable; the agent-kit guide carries that rule. (Note: a *different* `validate` **warning** — cached GET query that reads context, §8/Phase 6 — **is** in scope, because that combination *is* statically detectable.)
- **Multipart/file actions (DL#131)** — unaffected; files remain in `input`, context is still available.
- **Request context on the edge/BaaS (fetch) target** — **conditional, gated on Phase 0**. The full ambient-ALS design is committed for all Node-serving paths. The edge/BaaS target ships request-context only if the Phase 0 spike confirms ALS there; otherwise it is deferred behind a Q7 pivot decision (threading-on-edge, or Node-serving-only) rather than silently relying on an empty context. This is the one part of the design that is not unconditionally in scope.
