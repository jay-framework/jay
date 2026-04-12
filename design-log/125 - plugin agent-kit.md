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
   **A:** Add a `description` field to `.jay-contract` files (`.jay-action` already has one). The `agent-kit` command extracts descriptions into the materialized index, giving agents a quick overview without opening every file. `plugin.yaml` keeps its short `description` per contract as a summary for indexing.

6. **Q: How does a plugin tell the agent about its reference files?**
   **A:** Two parts: (1) plugin declares its references in `plugin.yaml` so the system knows they exist, (2) the `agent-kit` command generates an `INDEX.md` per plugin in `references/<plugin>/` describing what each reference file contains and how to use it.

7. **Q: Should there be three agent-kits instead of two?**
   **A:** Yes. Three roles: **designer** (creates jay-html UI), **developer** (builds the project, wiring, config), **plugin** (creates contracts, components, actions). All under one `agent-kit/` folder as subfolders.

8. **Q: Should `agent-kit` work before `setup`?**
   **A:** Yes. Before setup: generates instruction/guide files only, notes which plugins are not initialized (as info, not errors). After setup: also materializes contracts and references.

9. **Q: Should plugins be able to contribute skills to each agent-kit?**
   **A:** Yes. A plugin package can include an `agent-kit/` folder with subfolders matching the three roles (`designer/`, `developer/`, `plugin/`). The `agent-kit` command merges these into the project's agent-kit.

10. **Q: What should we call the three folders and their instruction files?**
    **A:** Folders: `designer/`, `developer/`, `plugin/` — these are roles, not agents. Instruction files: **guides** (not "skills" to avoid confusion with `.cursor/skills/`). Each folder has an `INSTRUCTIONS.md` as the index pointing to the guides.

## Design

### CLI Interface

```bash
jay-stack agent-kit              # generates all three roles
jay-stack agent-kit --mode plugin    # generate only plugin guides
jay-stack agent-kit --mode designer  # generate only designer guides
jay-stack agent-kit --mode developer # generate only developer guides
```

Before `jay-stack setup`: generates guide files only, notes uninitialized plugins as info (not errors).
After `jay-stack setup`: also materializes contracts and references.

### Document Size Guideline

Each guide file should aim for **100–200 lines**. If a document exceeds ~250 lines, split it into focused sub-documents. The structure below is the initial split — it is flexible and should be adjusted based on actual content length during implementation.

### Unified Agent-Kit Output

```
agent-kit/
├── references/                    # Plugin-generated reference data
│   └── <plugin-name>/
│       ├── INDEX.md               # Describes each reference file
│       └── ...reference files
├── materialized-contracts/        # Materialized contract files
│
├── designer/                      # Role: creates jay-html UI
│   ├── INSTRUCTIONS.md            # Workflow + index of guides
│   ├── jay-html-syntax.md
│   ├── jay-html-template-syntax.md
│   ├── jay-html-components.md
│   ├── jay-html-styling.md
│   ├── routing.md
│   ├── contracts-and-plugins.md   # Reading contracts, mapping to jay-html
│   ├── cli-commands.md
│   └── <plugin-contributed>*.md   # Plugins can add designer guides
│
├── developer/                     # Role: builds the project + page components
│   ├── INSTRUCTIONS.md
│   ├── project-structure.md
│   ├── routing.md
│   ├── configuration.md           # .jay, plugin config, init
│   ├── page-contracts.md          # Page-level contracts (page.jay-contract)
│   ├── page-components.md         # page.ts: makeJayStackComponent for pages
│   ├── component-state.md         # createSignal, createMemo, createEffect, etc.
│   ├── component-refs.md          # Refs, collection refs
│   ├── component-data.md          # Immutable data, JSON Patch, map
│   ├── render-results.md          # phaseOutput, RenderPipeline, errors, redirects
│   ├── cli-commands.md
│   └── <plugin-contributed>*.md   # Plugins can add developer guides
│
└── plugin/                        # Role: creates plugins (contracts, components, actions)
    ├── INSTRUCTIONS.md
    ├── contracts-guide.md
    ├── plugin-structure.md
    ├── component-structure.md
    ├── component-state.md
    ├── component-refs.md
    ├── component-data.md
    ├── component-context.md
    ├── render-results.md
    ├── actions-guide.md
    ├── services-guide.md
    ├── validation.md
    └── <plugin-contributed>*.md   # Plugins can add plugin-author guides
```

### Contract Description Field

Add `description` to `.jay-contract` files:

```yaml
name: product-page
description: Full product detail page with gallery, options, and add-to-cart. Use for individual product routes like /products/[slug].
params:
  slug: string
tags:
  ...
```

The `agent-kit` command extracts descriptions into the materialized index.

### Plugin-Contributed Guides

A plugin package can include an `agent-kit/` folder:

```
my-plugin/
├── plugin.yaml
├── agent-kit/
│   ├── designer/
│   │   └── my-plugin-usage.md     # "How to use this plugin's contracts in jay-html"
│   ├── developer/
│   │   └── my-plugin-config.md    # "How to configure this plugin"
│   └── plugin/
│       └── my-plugin-extending.md # "How to extend this plugin"
└── lib/
    └── ...
```

The `agent-kit` command merges these into the project's agent-kit.

### Plugin Reference Declaration

Plugins declare references in `plugin.yaml`:

```yaml
references:
  - name: product-catalog
    description: All products with IDs, slugs, names, and prices
    file: product-catalog.json
  - name: collection-schemas
    description: Collection field schemas for filtering
    file: collection-schemas.json
```

The `agent-kit` command generates `references/<plugin>/INDEX.md` from these declarations.

### Key Content Areas — Developer Guides

The developer role includes creating page-level full-stack components (`page.ts`) with their own contracts (`page.jay-contract`). Many component guides are shared with the plugin role — the content is the same, but scoped to page components rather than plugin components.

#### Page Contracts (page-contracts.md)

- When a page needs its own contract (page-level data, not from a plugin)
- `page.jay-contract` format — same as plugin contracts but for page-owned data
- Props and params in page contracts
- Combining page contract with headless plugin contracts

#### Page Components (page-components.md)

- `page.ts` file: `makeJayStackComponent` for page-level logic
- Three-phase rendering in a page context
- `loadParams` for route params
- Combining page component with headless plugin components on the same page

#### Component State, Refs, Data, Render Results

Same content as plugin guides (`component-state.md`, `component-refs.md`, `component-data.md`, `render-results.md`) — shared template files between developer and plugin roles.

### Key Content Areas — Plugin Guides

#### Contract Authoring (contracts-guide.md)

- Full `.jay-contract` YAML format with all tag types (data, variant, interactive, sub-contract)
- **Async data types**: `Promise<T>` for data fetched asynchronously
- **Sub-contracts**: nested and linked, repeated with `trackBy`
- **Interactive elements**: refs, element types
- **Props vs params**: when to use each — props for component configuration (passed by parent), params for URL route segments (passed by routing)
- **Phase guidance**: how to decide `slow` vs `fast` vs `fast+interactive` — what belongs at build time vs request time vs client-side
- **Description field**: always include a description explaining when to use this contract
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

- `plugin.yaml` format: contracts, actions, config templates, references
- Package layout: `lib/`, `dist/`, exports
- NPM package requirements (`package.json` exports field)
- Inline plugins within a project (see `examples/jay-stack/fake-shop`)
- Contributing agent-kit guides for each role

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

### Workflow in Plugin INSTRUCTIONS.md

1. Read INSTRUCTIONS.md for overview
2. Read the relevant guides for the task at hand
3. Define contracts first (source of truth) — include `description` field
4. Implement components matching the contracts
5. Define actions with `.jay-action` metadata
6. Set up `plugin.yaml` (including references declarations)
7. Optionally add agent-kit guides for designer/developer roles
8. Run `jay-stack validate-plugin` to check correctness

## Implementation Plan

### Phase 1: Unified folder structure + plugin guides

1. Restructure `agent-kit-template/` to output into `agent-kit/designer/` (move existing project guides there)
2. Create `agent-kit-plugin-template/` with plugin guide files, output into `agent-kit/plugin/`
3. Create `agent-kit-developer-template/` with developer guide files, output into `agent-kit/developer/`

### Phase 2: CLI integration

1. Add `--mode` flag to `agent-kit` command (`designer`, `developer`, `plugin`, or all)
2. Support running before setup (guides only, no materialized contracts/references)

### Phase 3: Contract description field

1. Add `description` to `.jay-contract` parser
2. Extract descriptions into materialized index during `agent-kit`

### Phase 4: Plugin-contributed guides

1. Read `agent-kit/` folder from each plugin package
2. Merge contributed guides into the project's agent-kit under the appropriate role folder

### Phase 5: Plugin reference declarations

1. Add `references` section to `plugin.yaml` schema
2. Generate `references/<plugin>/INDEX.md` from declarations during `agent-kit`

## Trade-offs

- **Unified `agent-kit/` folder** with role subfolders keeps everything discoverable
- **Three roles** may seem heavy but reflects real workflow separation — most projects will only use one or two
- **Before-setup support** means guide files are static templates (no plugin-specific content), but still valuable for bootstrapping
- **Plugin-contributed guides** require plugins to opt in — no extra burden on plugins that don't need it
