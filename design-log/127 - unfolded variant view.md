# Design Log #127 — Page Freeze and Variant View

## Background

The editor needs tools for designers to inspect all visual states of a page. The original idea was an "unfolded variant view" that renders all conditional branches side by side. Through design iteration, a simpler and more powerful concept emerged: **page freeze**.

Related design logs: #50 (rendering phases), #75 (slow render conditionals), #112 (hydration ViewState consistency).

## Problem

Designers working on jay-html pages need to:

1. See what the page looks like in different data states (variant values, different data)
2. Preserve specific states for comparison while editing the jay-html
3. See changes to the jay-html reflected in all saved states via live reload

Today they must manually toggle states, reload, and remember which combinations they've checked.

## Design: Page Freeze

### Core Concept

A **freeze** captures the current ViewState of a live page and opens it in a new tab. The frozen page renders using the compiled jay-html template + the saved ViewState, without running any component logic. It's a pure data-driven render.

### Flow

1. User navigates to a page and interacts until reaching the desired state
2. User triggers **freeze** (button in dev toolbar, keyboard shortcut, or automation command)
3. The client captures the current ViewState via `window.__jay.automation.getPageState().viewState`
4. Client POSTs the ViewState to the dev-server → server stores it, returns an ID
5. Client opens a new tab at the same route with `?_jay_freeze=<id>`
6. Server loads the frozen page: SSR renders the jay-html using the saved ViewState as-is (no component slow/fast/interactive phases)
7. The frozen page gets **live reload** — when the jay-html changes, the page re-renders with the same saved ViewState

### What Freeze Gives You

- **Multiple states side by side**: freeze the page with `stockStatus=IN_STOCK`, then navigate back, change the state to `OUT_OF_STOCK`, freeze again. Now you have two tabs showing both states.
- **Live jay-html editing**: change the jay-html → both frozen tabs update via HMR, showing how the template change looks in both states.
- **Any state is freezable**: slow-only, fast, interactive, client-only states — whatever the automation API can capture.
- **No special rendering mode**: the page renders normally with the compiled template, just with fixed data.

### Named Freezes

After creating a freeze, the user can name it (e.g., "in-stock", "out-of-stock", "empty-cart"). The dev-server provides:

- `POST /_jay/freeze` — save ViewState, return ID
- `PATCH /_jay/freeze/:id` — rename a freeze
- `GET /_jay/freeze/list?route=/products/kitan` — list saved freezes for a route
- `DELETE /_jay/freeze/:id` — delete a freeze

Storage: JSON files in `build/freezes/`. Persists across server restarts so designers can build up a library of states.

## Questions

1. **Q: Can this be implemented as a plugin?**

   **A:** Partially. The client-side part (capture ViewState, POST to server, open new tab) fits the plugin model — similar to webMCP, it hooks into `window.__jay.automation` via `makeJayInit().withClient()`. However, the server-side part (storing freezes, serving frozen pages with saved ViewState instead of component-computed ViewState) requires dev-server changes. A plugin can provide the client trigger + UI, while the dev-server provides the freeze API endpoints and the frozen page rendering.

2. **Q: How does the frozen page render?**

   **A:** Pure SSR — no client scripts at all. The dev-server runs the server element compiler with the saved ViewState and returns static HTML with CSS. No hydrate script, no Vite client, no component runtime. Just the rendered HTML snapshot. This is the simplest approach: the server element compiler already produces HTML from a ViewState — we just skip the client entry script generation.

3. **Q: Does `getPageState()` capture nested headless component ViewState?**

   **A:** This is a gap to investigate. The automation API's `getPageState()` returns the page-level merged ViewState. Nested headless components may have their own ViewState that isn't included. If not, we need to extend the automation API to capture the full component tree state.

4. **Q: What about CSS and assets?**

   **A:** The frozen page includes CSS (inlined from the jay-html's `<link>` and `<style>` tags) and references the same assets. No client runtime needed.

5. **Q: What about live reload?**

   **A:** Without the Vite client script, there's no automatic HMR. The user manually refreshes the frozen tab after editing jay-html. This is acceptable — the frozen page is a snapshot for inspection, not an interactive development surface. If live reload is needed later, we can add just the Vite client script without the component runtime.

## Implementation Plan

### Phase 1: Dev-server freeze API

Add endpoints to the dev-server:
- `POST /_jay/freeze` — body: `{ route, viewState }` → stores freeze, returns `{ id }`
- `GET /_jay/freeze/list?route=...` — returns freezes for a route
- `PATCH /_jay/freeze/:id` — body: `{ name }` → rename
- `DELETE /_jay/freeze/:id`
- Storage: `build/freezes/<id>.json` with `{ id, name, route, viewState, createdAt }`

### Phase 2: Frozen page rendering

In the dev-server route handler, detect `?_jay_freeze=<id>`:
- Load the saved ViewState from storage
- Skip slow+fast phase computation — use the saved ViewState directly
- Run the server element compiler with the saved ViewState to produce HTML
- Return pure static HTML: CSS + rendered body, no client scripts (no hydrate, no Vite client, no component runtime)
- The result is a minimal SSR-only page — just the HTML snapshot

### Phase 3: Client-side freeze plugin

Create `packages/jay-stack-plugins/page-freeze/` as a `global: true` plugin:
- `makeJayInit().withClient()` hooks into `window.__jay.automation`
- Adds a freeze button to the page (floating dev toolbar or keyboard shortcut)
- On trigger: captures ViewState via `automation.getPageState()`, POSTs to freeze API, opens new tab

## Key Files

| Purpose | File |
|---------|------|
| Dev-server route handler | `dev-server/lib/dev-server.ts` |
| SSR page generation | `dev-server/lib/dev-server.ts` (`sendResponse`, `generateSSRPageHtml`) |
| Automation API | `runtime-automation/lib/automation-agent.ts` |
| webMCP plugin (pattern reference) | `jay-stack-plugins/webmcp/` |
| Client init pattern | `jay-stack-plugins/webmcp/lib/init.ts` |

## Trade-offs

- **Simple concept**: freeze is just "save ViewState + SSR with it". No special compile modes, no variant discovery, no partial unfolding.
- **Pure static output**: frozen pages are plain HTML — no client scripts, no runtime. Minimal, fast, inspectable.
- **No live reload**: without Vite client, user manually refreshes after jay-html edits. Acceptable for snapshot inspection. Can add Vite client later if needed.
- **Plugin architecture**: client-side trigger is a plugin (like webMCP). Server-side API lives in dev-server (needs direct access to rendering pipeline).
- **Persistent storage**: freezes survive server restarts, building up a state library over time. Cost: some disk space in `build/freezes/`.
- **Automation API dependency**: requires the page to have automation enabled (default in dev). Gap: nested component state may not be captured.
- **No automatic variant enumeration**: user manually creates freezes for each state they care about. This is intentional — they know which states matter.
