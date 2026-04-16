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

   **A:** Gap to investigate. The automation API's `getPageState()` returns the page-level merged ViewState. Nested headless components may have their own ViewState not included. If not, extend the automation API to capture the full component tree state.

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

### Phase 2: Verify nested headless component ViewState capture

Investigate Q2 — does `automation.getPageState().viewState` include the full merged ViewState for nested headless components (e.g., a product-page with a nested product-widget)?

- Test with a page that has keyed headless components and verify the captured ViewState includes their data
- Test with instance-only (non-keyed) headless components
- If gaps exist: extend the automation API to walk the component tree and merge all ViewState data into the capture
- Resolve any issues before proceeding — the freeze is only useful if it captures the complete page state

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
