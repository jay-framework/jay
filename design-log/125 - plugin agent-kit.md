# Design Log #125 — Plugin Agent-Kit

## Background

The existing `jay-stack agent-kit` command generates instructions and reference data for AI agents that build **jay-stack projects** — creating jay-html pages that consume plugins. But creating a **plugin** is a fundamentally different task: defining contracts, writing headless components, setting up `plugin.yaml`, implementing server actions, etc.

There is no agent-kit support for this workflow today. AI agents creating plugins have no structured guidance, which leads to issues like contracts missing `props` and `params` declarations (see DL#124).

Related design logs: #39 (Plugin package), #60 (plugin system refinement), #84 (headless props), #85 (agent-kit for projects), #124 (contract consistency).

## Problem

An AI agent tasked with creating or modifying a jay plugin has no equivalent of the project agent-kit. It must rely on general knowledge or `.cursor/skills/` files (which are local to the jay framework repo, not installed into consumer projects). This leads to:

- Contracts that are incomplete (missing props, params, phases)
- Components that don't match their contracts
- Missing or malformed `plugin.yaml`
- Actions without `.jay-action` metadata files

## Questions

1. **Q: Should `--mode plugin` generate into the same `agent-kit/` folder or a different one (e.g., `agent-kit-plugin/`)?**
   **A:** ~~Separate `agent-kit-plugin/` folder.~~ Revised: all three agent-kits (designer, developer, plugin) live under one `agent-kit/` folder as subfolders. See point 3 below.

2. **Q: What reference data should the plugin agent-kit generate?**
   **A:** Documentation/skills focused on plugin authoring:

   - **Component state hooks**: `createSignal`, `createMemo`, `createEffect`, `createEvent` for the interactive phase
   - **Refs**: how to use refs, collection refs
   - **Immutable data**: data is immutable, examples of using JSON Patch to update data, the `map` hook
   - **Contract data types**: all tag types (data, variant, interactive, sub-contract), async data types (`Promise<T>`), linked sub-contracts, repeated sub-contracts with `trackBy`
   - **Interactive elements**: interactive refs, element types
   - **Phase guidance**: how to decide if data is `slow`, `fast`, or `fast+interactive` — what belongs at build time vs request time vs client-side
   - **Props vs params**: when to use `props` (component configuration, passed by parent) vs `params` (URL route segments, passed by routing)

3. **Q: Should the plugin agent-kit include validation instructions (run `jay-stack validate-plugin`)?**
   **A:** Yes.

4. **Q: Is a plugin always developed inside a standalone package, or can it be developed inline within a project?**
   **A:** It can be developed inline within a project. See `examples/jay-stack/fake-shop` for an example.

5. **Q: How does a plugin describe which contract/action to use when?**
   Today we list available contracts and actions, but don't describe _when_ to use each one. A plugin should be able to provide guidance like "use `product-page` for detail pages, `product-search` for listing pages."

6. **Q: How does a plugin tell the agent about its reference files?**
   Plugins can create reference files (product catalogs, schemas, etc.) but there is no mechanism to describe what those files are or how to use them. The agent needs a way to discover and understand plugin-created references.

7. **Q: Should there be three agent-kits instead of two?**
   Three roles: **designer** (creates jay-html UI), **developer** (builds the project, wiring, config), **plugin** (creates contracts, components, actions). All three under one `agent-kit/` folder.

8. **Q: Should `agent-kit` work before `setup`?**
   Currently `agent-kit` only works after `jay-stack setup`. It should also work before — generating instruction files without materialized contracts/references. When running before setup, it should note which plugins are not initialized but not fail.

9. **Q: Should plugins be able to contribute skills to each agent-kit?**
   A plugin may want to add specific instructions for designers ("how to style this component"), developers ("how to configure this plugin"), or other plugin authors ("how to extend this plugin").

10. **Q: What should we call the three folders and their instruction files?**
    Options for folders: `designer/`, `developer/`, `plugin/` — or call them `agents`?
    Options for instruction files within: call them `skills`?

## Design

### CLI Interface

```bash
jay-stack agent-kit                # existing: project mode (default)
jay-stack agent-kit --mode plugin  # new: plugin authoring mode
```

### Document Size Guideline

Each guide file should aim for **100–200 lines**. If a document exceeds ~250 lines, split it into focused sub-documents. The structure below is the initial split — it is flexible and should be adjusted based on actual content length during implementation.

### Plugin Agent-Kit Output

```
agent-kit-plugin/
├── INSTRUCTIONS.md            # Plugin authoring workflow + index of guides
├── contracts-guide.md         # Contract data types, phases, props, params, sub-contracts
├── plugin-structure.md        # plugin.yaml, package layout, exports
├── component-structure.md     # makeJayStackComponent, builder API, three phases, props, params
├── component-state.md         # createSignal, createPatchableSignal, createMemo, createEffect, createDerivedArray, createEvent
├── component-refs.md          # Refs, collection refs, element types
├── component-data.md          # Immutable data, JSON Patch, map hook
├── component-context.md       # provideContext, provideReactiveContext, createReactiveContext, registerReactiveGlobalContext
├── render-results.md          # phaseOutput, RenderPipeline, errors, redirects
├── actions-guide.md           # makeJayAction, makeJayQuery, .jay-action files
├── services-guide.md          # createJayService, makeJayInit
└── validation.md              # jay-stack validate-plugin usage
```

### Key Content Areas

#### Contract Authoring (contracts-guide.md)

- Full `.jay-contract` YAML format with all tag types (data, variant, interactive, sub-contract)
- **Async data types**: `Promise<T>` for data fetched asynchronously
- **Sub-contracts**: nested and linked, repeated with `trackBy`
- **Interactive elements**: refs, element types
- **Props vs params**: when to use each — props for component configuration (passed by parent), params for URL route segments (passed by routing)
- **Phase guidance**: how to decide `slow` vs `fast` vs `fast+interactive` — what belongs at build time vs request time vs client-side
- Examples of good and bad contracts

#### Component Structure (component-structure.md)

- `makeJayStackComponent` with three-phase rendering
- Builder API: `.withProps()`, `.withServices()`, `.withContexts()`
- Props parameter and how it maps to contract `props`
- `loadParams` and how it maps to contract `params`

#### Component State (component-state.md)

- `createSignal` and `createPatchableSignal` — reactive state
- `createMemo` — computed values
- `createEffect` — side effects with cleanup
- `createDerivedArray` — optimized array mapping
- `createEvent` — component event emitters

#### Component Refs (component-refs.md)

- How to use refs for interactive elements
- Collection refs for repeated elements
- Element types (HTMLButtonElement, HTMLInputElement, etc.)

#### Component Data (component-data.md)

- Data is immutable — never mutate directly
- Using JSON Patch to update data
- The `map` hook for transforming data

#### Component Context (component-context.md)

- `provideContext` / `provideReactiveContext`
- `createReactiveContext` / `registerReactiveGlobalContext`

#### Render Results (render-results.md)

- `phaseOutput` for successful phase output
- `RenderPipeline` for composable render flows
- Error responses: `notFound`, `badRequest`, `unauthorized`, `forbidden`, `serverError5xx`, `clientError4xx`
- Redirects: `redirect3xx`

#### Plugin Structure (plugin-structure.md)

- `plugin.yaml` format: contracts, actions, config templates
- Package layout: `lib/`, `dist/`, exports
- NPM package requirements (`package.json` exports field)
- Inline plugins within a project (see `examples/jay-stack/fake-shop`)

#### Actions (actions-guide.md)

- `makeJayAction` / `makeJayQuery`
- `.jay-action` file format with typed schemas
- Action registry and service injection

#### Services (services-guide.md)

- `createJayService` — service markers for dependency injection
- `makeJayInit` — server/client initialization

#### Validation (validation.md)

- Running `jay-stack validate-plugin`
- Common validation errors and how to fix them

### Workflow in INSTRUCTIONS.md

1. Read INSTRUCTIONS.md for overview
2. Read the relevant guides for the task at hand
3. Define contracts first (source of truth)
4. Implement components matching the contracts
5. Define actions with `.jay-action` metadata
6. Set up `plugin.yaml`
7. Run `jay-stack validate-plugin` to check correctness

## Implementation Plan

### Phase 1: Template files

1. Create `packages/jay-stack/stack-cli/agent-kit-plugin-template/` with the guide files (output to `agent-kit-plugin/`)
2. Content derived from existing `.cursor/skills/` and design logs

### Phase 2: CLI integration

1. Add `--mode` flag to `agent-kit` command in `cli.ts`
2. Default mode is `project` (existing behavior)
3. `plugin` mode copies from `agent-kit-plugin-template/` instead

### Phase 3: Dynamic content

1. If generating inside an existing plugin, introspect existing contracts and `plugin.yaml` to include context-specific references

## Trade-offs

- **Separate template folder** keeps project and plugin concerns cleanly separated
- **Separate output folder** (`agent-kit-plugin/`) allows both project and plugin agent-kits to coexist (important for inline plugins)
- **Static templates first** (Phase 1-2) gives immediate value; dynamic introspection (Phase 3) can follow
