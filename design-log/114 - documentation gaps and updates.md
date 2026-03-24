# Documentation Gaps and Updates

## Background

Audited recent design logs (DL#84–DL#113) against current docs in `docs/core/`, `docs/getting-started/`, and `packages/jay-stack/stack-cli/agent-kit-template/`. Several features implemented over recent development cycles lack corresponding documentation.

## Documentation Health

**Well documented** (no action needed):

- Three-phase rendering (slow/fast/interactive) — `docs/core/jay-stack.md`, `docs/core/contract-files.md`
- Component types (headfull/headless, client-only/full-stack) — `docs/core/components.md`
- Promise/async view state — `docs/core/jay-html.md`, `docs/core/contract-files.md`
- Basic jay-html syntax — `docs/core/jay-html.md`
- Server actions — `docs/core/server-actions.md`
- Render pipeline — `docs/core/render-pipeline.md`

**Gaps identified below.**

## Gap 1: Nested Headless Components

**Design logs**: DL#84 (props, repeater support), DL#90 (interactive forEach), DL#102 (SSR/hydration)

**Current docs**: `docs/core/jay-html.md` lines 219-313 covers basics (instance-based, key-based, props, inline templates). Agent-kit `jay-html-syntax.md` lines 126-202 also covers this well.

**Missing**:

- Phase constraints — headless instances inside forEach require the array to be `slow` phase (DL#90 explains why fast/interactive-only instances aren't supported inside forEach)
- How headless instance SSR works — server-element compilation renders instances using `__headlessInstances` ViewState lookup
- The `ref` attribute on `<jay:xxx>` — auto-generated `AR0`, `AR1` vs explicit refs
- Coordinate system for headless instances — how trackBy values map to `__headlessInstances` keys

**Where to update**: `docs/core/jay-html.md` (headless components section), `agent-kit-template/jay-html-syntax.md`

## Gap 2: Headfull Nested Full-Stack Components

**Design log**: DL#111

**Current docs**: `docs/core/jay-html.md` lines 189-217 documents client-only headfull imports (`<script type="application/jay-headfull">`). No mention of the `contract` attribute for full-stack headfull.

**Missing**:

- `contract` attribute on `application/jay-headfull` — makes the component full-stack (slow/fast phases, SSR)
- How template injection works — component's jay-html body is injected into `<jay:Name>` tags
- Component jay-html structure (separate jay-html with `application/jay-data` and body)
- When to use headfull FS vs headless (headfull owns its UI, headless delegates UI to parent)
- CSS from component jay-html is merged into the page

**Where to update**: `docs/core/jay-html.md` (new section after headfull imports), `agent-kit-template/jay-html-syntax.md`

## Gap 3: Route Params and Static Override Routes

**Design logs**: DL#69 (route priority), DL#113 (explicit route params)

**Current docs**: Agent-kit `routing.md` covers directory-based routing, dynamic route syntax, and route priority. Mentions static overrides but doesn't explain how they get param values.

**Missing**:

- `<script type="application/jay-params">` — how static override routes declare their param values (DL#113)
- Example: ceramic-flower-vase override with explicit `slug: ceramic-flower-vase`
- No routing doc in `docs/core/` at all — should be added

**Where to update**: New `docs/core/routing.md`, update `agent-kit-template/routing.md` with jay-params

**Naming**: The feature should be called **"static route overrides"** — a static route that overrides a dynamic route for a specific URL, with explicit params declared via `jay-params`.

## Gap 4: Component Types Decision Guide

**Current docs**: `docs/core/components.md` lists the types but doesn't guide the decision.

**Missing**: A decision flowchart or table for choosing between:

- `makeJayComponent` (client-only) vs `makeJayStackComponent` (full-stack)
- Headfull (owns UI) vs headless (UI from parent page)
- Key-based headless (page-level data binding) vs instance-based headless (positioned in template)
- Client-only headfull nested vs full-stack headfull nested (DL#111)
- When plugins provide headless components vs when to use project-local

**Where to update**: `docs/core/components.md` (new "Choosing a Component Type" section)

## Gap 5: SSR and Hydration

**Design logs**: DL#93, DL#94, DL#102, DL#103, DL#106, DL#112

**Current docs**: No documentation at all for SSR/hydration internals.

**Missing**:

- SSR overview: server-element target compiles jay-html to streaming HTML renderer
- Hydration overview: hydrate target adopts server-rendered DOM, attaches interactivity
- How SSR ViewState flows from server to client (serialized in `<script type="module">`)
- Phase-aware SSR — only `fast+interactive` bindings get `jay-coordinate` for client hydration
- DL#112 ViewState consistency — hydration uses SSR ViewState, then reconciles with client state

**This is not user-facing API** — it's internal architecture. Document at a high level in jay-stack.md or a separate guide for contributors. Not needed in agent-kit docs.

**Where to update**: `docs/core/jay-stack.md` (new "Server-Side Rendering" section with high-level overview)

## Gap 6: Plugin System Reference

**Design logs**: DL#60, DL#87

**Current docs**: Agent-kit `contracts-and-plugins.md` has good coverage for AI agents. `docs/core/` has no plugin reference.

**Missing from core docs**:

- `plugin.yaml` format reference (name, contracts, actions, dynamic_contracts, init, setup)
- How plugins are resolved (local `src/plugins/` vs NPM packages)
- Action metadata (`.jay-action` files)
- Plugin setup command (DL#87)

**Where to update**: New `docs/core/plugins.md` or expand `docs/core/jay-stack.md`

## Implementation Plan

### Phase 1: Core doc updates (existing files)

1. **`docs/core/jay-html.md`**

   - Expand headless component section with phase constraints and ref naming
   - Add headfull full-stack component section (DL#111: `contract` attribute, template injection)

2. **`docs/core/components.md`**

   - Add "Choosing a Component Type" decision guide

3. **`docs/core/jay-stack.md`**
   - Add brief SSR section (high-level, how it works, not internals)
   - Add ViewState flow diagram (server → serialized → client hydration → reconciliation)

### Phase 2: New docs

4. **`docs/core/routing.md`** (new)

   - Directory-based routing
   - Dynamic route params (`[slug]`, `[[optional]]`, `[...catchAll]`)
   - Static route overrides with `<script type="application/jay-params">`
   - Route priority
   - `loadParams` for SSG

5. **`docs/core/plugins.md`** (new)
   - plugin.yaml format reference
   - Local vs NPM resolution
   - Actions and setup

### Phase 3: Agent-kit template updates

6. **`agent-kit-template/jay-html-syntax.md`**

   - Add headfull FS component syntax
   - Add `application/jay-params` to file structure

7. **`agent-kit-template/routing.md`**

   - Add `jay-params` section for static overrides

8. **`agent-kit-template/INSTRUCTIONS.md`**
   - Mention static override routes with params

## Implementation Results

### Completed

1. **`docs/core/routing.md`** (NEW) — Directory-based routing, dynamic params, route priority, static route overrides with `jay-params`, `loadParams` for SSG
2. **`docs/core/jay-html.md`** — Added "Importing Headfull Full-Stack Components" section with `contract` attribute, template injection, and usage guidance
3. **`docs/core/components.md`** — Added "Choosing a Component Type" decision table with 6 rows covering all component type combinations
4. **`docs/core/jay-stack.md`** — Added "Server-Side Rendering" section with how it works (server render, hydration, phase-aware bindings, ViewState consistency)
5. **`agent-kit-template/routing.md`** — Added "Static Override Params" section with `jay-params` example
6. **`agent-kit-template/jay-html-syntax.md`** — Added headfull FS component section, added `jay-params` and `jay-headfull` to file structure example

7. **`docs/core/plugins.md`** (NEW) — plugin.yaml format reference (all fields), plugin resolution (local vs NPM), .jay-action metadata format with Jay-Type notation, setup command and handler API, plugin validation
8. **`agent-kit-template/INSTRUCTIONS.md`** — Added `jay-params` mention in workflow step 7 for static override routes

### Deviations from Plan

- **Headless phase constraint note** (Gap 1): Already existed in `jay-html.md` line 345 — no changes needed
