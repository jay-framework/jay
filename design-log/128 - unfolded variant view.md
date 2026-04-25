# Design Log #127 — Page Freeze

## Background

The editor needs tools for designers to inspect all visual states of a page. The original idea was an "unfolded variant view" that renders all conditional branches side by side. Through design iteration, a simpler and more powerful concept emerged: **page freeze**.

Related design logs: #50 (rendering phases), #75 (slow render conditionals), #112 (hydration ViewState consistency).

## Problem

Designers working on jay-html pages need to:

1. See what the page looks like in different data states (variant values, different data)
2. Preserve specific states for comparison while editing the jay-html
3. Embed frozen page views in design board applications

Today they must manually toggle states, reload, and remember which combinations they've checked.

## Design: Page Freeze

### Core Concept

A **freeze** captures the current ViewState of a live page. The frozen page is rendered as pure SSR — the server element compiler produces static HTML from the saved ViewState. No component logic runs, no client scripts are included.

### Flow

1. User navigates to a page and interacts until reaching the desired state
2. User presses **Alt+S** (Option+S on Mac) to trigger freeze
3. **Visual feedback**: full-page white flash overlay (like a camera flash) + camera shutter sound effect — confirms the freeze was captured
4. The client captures the current ViewState via `window.__jay.automation.getPageState().viewState`
5. Client POSTs the ViewState to the dev-server → server stores it, returns an ID
6. Client opens a new tab at the same route with `?_jay_freeze=<id>`
7. Server loads the saved ViewState, SSR-renders the jay-html with it, returns static HTML

### What Freeze Gives You

- **Multiple states side by side**: freeze with `stockStatus=IN_STOCK`, navigate back, change state, freeze again. Two tabs showing both states.
- **Any state is freezable**: slow-only, fast, interactive, client-only states — whatever the automation API can capture.
- **Pseudo-classes still work**: `:hover`, `:focus`, `:active` are CSS — they work on the static HTML. The frozen page is fully responsive and supports breakpoints.
- **No special rendering mode**: pure SSR with fixed data.

### Output Formats

Frozen pages can be served in two formats:

**1. Full page** — complete HTML document with `<html>`, `<head>`, `<body>`. Opens in a browser tab. Includes inlined CSS.

**2. HTML fragment** — just the rendered body content with scoped styles, suitable for embedding in a shadow DOM inside a design board application. For shadow DOM to work correctly:

- CSS is inlined (scoped to the fragment)
- Fonts are inlined as base64 data URIs (prevents cross-origin/relative URL issues)
- Images are inlined or use absolute URLs (prevents relative path mismatches)

### Named Freezes

After creating a freeze, the user can rename it (e.g., "in-stock", "out-of-stock", "empty-cart"). Rename is a post-save operation to keep the freeze flow fast.

### API Architecture

The freeze system spans two layers:

**Dev-server** (HTTP) — handles the two core operations that need direct access to the rendering pipeline:

- `POST /_jay/freeze` — save ViewState, return ID (the freeze operation itself)
- `GET /route?_jay_freeze=<id>` — serve frozen page (full page format)
- `GET /route?_jay_freeze=<id>&format=fragment` — serve frozen page (shadow DOM fragment)
- CORS headers on fragment endpoint for cross-origin design board access

**Editor protocol** (Socket.IO) — exposes freeze management for design board applications:

- `listFreezes(route)` — list saved freezes for a route
- `renameFreeeze(id, name)` — rename a freeze
- `deleteFreeze(id)` — delete a freeze
- `onFreezeChanged(callback)` — notify design board when jay-html changes so it can refresh its embedded frozen views

The socket notification replaces HMR for shadow DOM embedded views — the design board application listens for change events and re-fetches the fragment.

### Storage

JSON files in `build/freezes/`. Each freeze:

```json
{
  "id": "abc123",
  "name": "in-stock",
  "route": "/products/kitan",
  "viewState": { ... },
  "createdAt": "2026-04-16T10:00:00Z"
}
```

Persists across server restarts so designers build up a library of states.

## Questions

1. **Q: How does the frozen page render?**

   **A:** Pure SSR — no client scripts. The server element compiler produces HTML from the saved ViewState. For full-page format: complete HTML document with inlined CSS. For fragment format: body content with scoped styles, inlined fonts/images for shadow DOM compatibility.

2. **Q: Does `getPageState()` capture nested headless component ViewState?**

   **A:** Keyed headless components (`key="w"`) — yes, merged under `viewState.w` by the composite `render()`. Non-keyed instances and headfull FS components — **no**. Their ViewState lives in the `HEADLESS_INSTANCES` context (keyed by coordinate, e.g., `S0/0/widget:AR0`), extracted and deleted from the ViewState in `composite-component.ts` before it reaches the automation API. Fix: the composite component's `render()` should re-inject `__headlessInstances` with each instance's current ViewState.

3. **Q: How does the design board know when to refresh?**

   **A:** Via the editor protocol socket. When jay-html or CSS changes, the dev-server emits a `freezeChanged` event. The design board re-fetches the fragment endpoint to get the updated render.

## Implementation Plan

### Phase 1: Dev-server freeze endpoints

Add to the dev-server:

- `POST /_jay/freeze` — body: `{ route, viewState }` → store, return `{ id }`
- Frozen page rendering: detect `?_jay_freeze=<id>` in route handler
  - Load saved ViewState
  - SSR-render jay-html with it (skip slow/fast phases)
  - `format=fragment`: return body HTML with scoped styles, inlined fonts/images, CORS headers
  - Default: return full-page HTML document
- Storage: `build/freezes/<id>.json`
- Client-side: register `Alt+S` / `Option+S` keyboard shortcut on dev pages (in the automation setup script, not a plugin) to trigger freeze and open new tab

### Phase 2: Complete ViewState capture for non-keyed instances

**Problem:** Non-keyed headless instances and headfull FS components store their ViewState in the `HEADLESS_INSTANCES` context, not in the composite component's ViewState. The `__headlessInstances` object is extracted and deleted from the ViewState in `composite-component.ts` (lines 44-49) before hydration. It is never re-injected into the ViewState that `render()` returns, so the automation API never sees it.

**Fix:** In the composite component's `render()` function, after merging all keyed and unkeyed parts, re-inject `__headlessInstances` with each instance component's current ViewState (from their interactive `render()` output).

**File:** `packages/jay-stack/stack-client-runtime/lib/composite-component.ts`

In the `render()` closure (around line 96-117):

1. After the existing merge loop that handles keyed and unkeyed parts
2. Collect each instance component's current ViewState by its coordinate key
3. Add `viewState.__headlessInstances = { [coordKey]: instanceVS, ... }` to the returned ViewState

**Test:** Add a test to `packages/runtime/runtime-automation/test/integration.test.ts` that:

1. Creates a composite component with a non-keyed headless instance
2. Wraps with automation
3. Verifies `getPageState().viewState.__headlessInstances` contains the instance's ViewState under the correct coordinate key
4. Triggers an interactive update on the instance and verifies the captured ViewState reflects the change

### Phase 3: Editor protocol freeze management

Add to the editor protocol:

- `listRoutes()` — list all page routes in the project (so the design board can navigate and freeze any page)
- `listFreezes(route)` — list saved freezes for a route
- `renameFreeze(id, name)` — rename
- `deleteFreeze(id)` — delete
- `onFreezeChanged` event — emitted when jay-html/CSS changes, so design board can refresh

### Phase 4: Shadow DOM fragment support

- Inline fonts as base64 data URIs in the fragment output
- Inline images or rewrite to absolute URLs
- Scoped CSS (already inlined by the jay-html parser)
- CORS headers on fragment endpoint

## Key Files

| Purpose                  | File                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| Dev-server route handler | `dev-server/lib/dev-server.ts`                                         |
| SSR page generation      | `dev-server/lib/dev-server.ts` (`sendResponse`, `generateSSRPageHtml`) |
| Server element compiler  | `compiler-jay-html/lib/jay-target/jay-html-compiler-server.ts`         |
| Automation API           | `runtime-automation/lib/automation-agent.ts`                           |
| Editor protocol          | `editor-protocol/lib/protocol.ts`                                      |
| Editor server            | `editor-server/lib/editor-server.ts`                                   |

## Trade-offs

- **Dev-server core, not a plugin**: freeze needs direct access to the rendering pipeline (SSR with arbitrary ViewState) and the editor protocol (socket events). Too integrated for a plugin.
- **Pure static output**: frozen pages are plain HTML — no client scripts, no runtime. Minimal, fast, embeddable.
- **Two formats**: full-page for browser tabs, fragment for shadow DOM embedding. Fragment requires font/image inlining for cross-origin compatibility.
- **Socket for refresh**: shadow DOM views can't use HMR. The editor protocol socket notifies the design board to re-fetch on changes.
- **Persistent storage**: freezes survive server restarts. Cost: disk space in `build/freezes/`.
- **Automation API dependency**: requires automation enabled (default in dev). Gap: nested component state capture.
- **No automatic variant enumeration**: user manually creates freezes. This is intentional — they know which states matter.

## Implementation Results

### Phase 1: Dev-server freeze endpoints — completed

- `FreezeStore` class (`dev-server/lib/freeze.ts`) — CRUD for freeze entries in `build/freezes/`
- `POST /_jay/freeze` endpoint — saves ViewState, returns `{ id }`
- `?_jay_freeze=<id>` frozen page rendering via `generateFrozenPageHtml` (pure SSR, no client scripts)
- `?_jay_freeze=<id>&format=fragment` — body-only HTML with inlined CSS for shadow DOM
- Alt+S / Option+S keyboard shortcut (uses `e.code === 'KeyS'` for Mac compatibility)
- Visual feedback: white flash overlay + synthesized camera shutter sound
- Request timing shows `[FROZEN]` annotation
- Build folder cleanup preserves `freezes/` directory
- "FROZEN" badge in top-right corner of frozen pages

### Phase 2: Nested component ViewState capture — completed

Non-keyed headless instance ViewState was missing from `automation.getPageState().viewState`. Fixed by:

1. Each instance's wrapped `render()` writes its materialized ViewState to `instanceData.viewStates[resolvedKey]` (using `materializeViewState` to resolve signal getters to plain values)
2. Composite component's `render()` re-injects `instanceData.viewStates` as `__headlessInstances` in the returned ViewState
3. Automation agent's `getPageState()` computes the slow+fast merge fresh on each call (not cached), and prefers the component's `__headlessInstances` over the stale slow-phase snapshot

### Phase 3: Editor protocol freeze management — completed

- Protocol types: `ListRoutesMessage/Response`, `ListFreezesMessage/Response`, `RenameFreezeMessage/Response`, `DeleteFreezeMessage/Response`, `FreezeEntry`
- Editor server: handlers + `emitFreezeChanged()` socket event
- Editor client: implemented all freeze protocol methods
- CLI wiring: connected handlers to FreezeStore and routes, emits `freezeChanged` on jay-html/CSS changes

### Phase 4: Shadow DOM fragment support — completed

- CSS inlined by reading the file directly from disk (strips `/@fs` prefix and query params from Vite URL)
- CORS headers (`Access-Control-Allow-Origin: *`) on fragment responses
- Font inlining deferred — requires reading font files and base64 encoding

### Deviations from design

1. **Frozen page uses pre-rendered jay-html.** The original implementation read the original jay-html source, which caused slowForEach items to be compiled as forEach loops with wrong `__headlessInstances` keys. Fixed to load the pre-rendered jay-html from the slow render cache (with `slowForEach` items unrolled and scoped coordinates assigned).

2. **Instance ViewState via `render()` not `viewStateChange` event.** The design suggested using the component's `viewStateChange` event for capturing instance ViewState. Instead, each instance's wrapped `render()` directly updates `instanceData.viewStates[resolvedKey]` with `materializeViewState(vs)`. This is simpler — no event subscription, no cross-component wiring, and `instanceData.viewStates` already has the right shape from SSR.

3. **No `instanceGetters` Map or factory wrapper.** Initial implementation used a `Map<string, () => object>` for lazy collection and overrode the component's `viewState` getter via a factory wrapper. Simplified to direct writes in `render()` + re-injection in composite `render()`. No Maps, no getter overrides, no factory wrappers.

4. **Automation agent computes merge fresh.** Previously cached `mergedViewState` in the `viewStateChange` handler. Changed to compute on each `getPageState()` call so it always reads the latest `__headlessInstances` from the component's ViewState (which includes instance data updated during their own reactive cycles, not just the page's).

5. **CSS inlined by reading from disk, not Vite transform.** Initially tried `vite.transformRequest()` which wraps CSS in JS modules. Simplified to reading the CSS file directly from the filesystem path extracted from the Vite URL.

## Addendum: Iframe-mode freeze (AIditor integration)

### Problem

When the AIditor loads a page inside an iframe, the current freeze flow opens a new browser tab (`window.open`). This breaks the AIditor experience — the freeze result should stay within the AIditor's control, not escape to a separate tab.

### Design

A URL parameter `_jay_embed=true` (added by the AIditor to the iframe `src`) switches the freeze behavior. Since the parent window is also a jay dev server application, it captures Alt+S itself. The iframe must not also listen for Alt+S — instead, the parent triggers the freeze via `postMessage`.

**Two-way protocol:**

1. **Parent → iframe**: `{ type: 'jay:requestFreeze' }` — tells the iframe to capture and save a freeze
2. **Iframe → parent**: `{ type: 'jay:freeze', id, route }` — returns the freeze ID once saved

### Embed mode behavior

When `_jay_embed` is present:

- The Alt+S keyboard handler is **not registered** (parent owns this shortcut)
- A `message` event listener waits for `jay:requestFreeze` from the parent
- On receiving the request, the iframe runs the freeze (flash, sound, capture, save)
- After saving, posts `jay:freeze` back to the parent with the freeze ID and route

### Message formats

```typescript
// Parent → iframe
interface JayRequestFreezeMessage {
  type: 'jay:requestFreeze';
}

// Iframe → parent
interface JayFreezeMessage {
  type: 'jay:freeze';
  id: string; // freeze ID returned by POST /_jay/freeze
  route: string; // page route (window.location.pathname)
}
```

### Notes

- `_jay_embed` is a general-purpose flag — other iframe-aware behaviors can check it in the future
- The AIditor is responsible for constructing the freeze URL (`route + '?_jay_freeze=' + id`) when it decides to display the frozen view
- Visual feedback (flash + sound) still plays in the iframe — confirms the freeze was captured
- The `*` target origin in `postMessage` is acceptable since the message contains only a freeze ID and route path (no sensitive data)
- Embed mode is sticky via a session cookie (`_jay_embed=1`) — set on first load with the URL param, persists across in-iframe navigations

### Implementation results

#### FreezeEntry: `routePattern` field

Freeze entries now store both `route` (concrete URL, e.g., `/products/kitan`) and `routePattern` (Express pattern, e.g., `/products/kitan{/:category}`). This allows `FreezeStore.list()` to match by pattern (exact match on `routePattern` or `route`) and the AIditor to display the concrete URL while grouping freezes by route.

The route pattern is baked into the client script at generation time (`GenerateClientScriptOptions.routePattern`) and sent by the client in the `POST /_jay/freeze` body. This avoids server-side route matching on save — the server just stores what the client provides.

#### Files changed

| File                                                 | Change                                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stack-server-runtime/lib/generate-client-script.ts` | `FREEZE_SHORTCUT_SCRIPT` → `buildFreezeScript(routePattern)`: bakes route pattern into client script; embed mode via session cookie; two-way postMessage protocol |
| `dev-server/lib/freeze.ts`                           | `FreezeEntry.routePattern`; `save()` accepts `routePattern`; `list()` matches by `routePattern` or `route`                                                        |
| `dev-server/lib/dev-server.ts`                       | Pass `routePattern` via `GenerateClientScriptOptions` at all render paths; `setupFreezeEndpoint` reads `routePattern` from POST body                              |
| `editor-protocol/lib/protocol.ts`                    | `FreezeEntry.routePattern`                                                                                                                                        |
| `stack-cli/lib/server.ts`                            | `listFreezes` response includes `routePattern`                                                                                                                    |

## Addendum: Route notification in embed mode

### Problem

When a page loads inside the AIditor iframe, the parent has no reliable way to know which route the iframe is displaying. The AIditor currently infers the route from `inferRouteFromPathname` and polls with a 300ms interval — both are fragile and wasteful. When the user clicks a link inside the iframe (client-side navigation or full reload), the parent doesn't learn the new route until the next poll cycle, and the inferred pattern may be wrong.

### Design

Add a `jay:route` postMessage that the iframe sends to the parent **on every page load** in embed mode. This gives the parent the exact route pattern and concrete path without guessing or polling.

The message fires immediately in the `if (__jayEmbedMode)` block of `buildFreezeScript()`, since the `routePattern` literal is already available there.

### Message format

```typescript
// Iframe → parent (fires on page load)
interface JayRouteMessage {
  type: 'jay:route';
  route: string; // concrete path (window.location.pathname)
  routePattern: string; // route pattern literal baked into the script
}
```

### Where it fires

In `buildFreezeScript(routePattern)` (`stack-server-runtime/lib/generate-client-script.ts`), inside the existing `if (__jayEmbedMode)` block, before the `message` event listener:

```js
if (__jayEmbedMode) {
  // Notify parent of the current route on load
  window.parent.postMessage({
    type: 'jay:route',
    route: window.location.pathname,
    routePattern: <routePatternLiteral>,
  }, '*');

  // ... existing jay:requestFreeze listener
}
```

This fires once per page load — every time the iframe navigates to a new page, it gets a fresh script with the correct `routePattern` baked in.

### What the AIditor does with it

1. Listens for `jay:route` messages on `window`
2. Uses `routePattern` to select the correct page route (replaces `inferRouteFromPathname`)
3. Uses `route` for the preview path dropdown
4. Can replace the 300ms polling probe with this event-driven approach for route sync

### Notes

- No new dependencies — uses the same `postMessage` + `*` origin as the existing freeze protocol
- `routePattern` is the same literal already baked in for freeze entries — no new plumbing needed
- Fires synchronously on script execution (not deferred) so the parent knows the route before any user interaction
- On client-side SPA navigation within the iframe, the message only fires on full page loads (script re-execution). If SPA navigation is added later, a separate mechanism would be needed
