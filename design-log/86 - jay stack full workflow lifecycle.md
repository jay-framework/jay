# Jay Stack Full Workflow Lifecycle

**Date:** February 4, 2026  
**Status:** Draft  
**Related:** Design Logs #50, #80, #84, #85

## Background

Jay Stack has multiple stages from project setup to runtime. Several pieces exist (CLI commands, rendering phases, plugin system, agent-kit) but the full lifecycle is not tracked as a coherent workflow. Understanding the lifecycle is important for:

- Knowing which CLI commands/steps exist or are needed at each stage
- Ensuring plugins can hook into the right lifecycle points
- Giving agents (and developers) a clear sequence to follow

## Lifecycle Phases

```
┌─────────────────────────────────────────────────────────┐
│ 1. PROJECT SETUP                                        │
│    create project, install plugins                      │
├─────────────────────────────────────────────────────────┤
│ 2. PLUGIN SETUP                                         │
│    configure plugins, generate reference info            │
├─────────────────────────────────────────────────────────┤
│ 3. AGENT KIT                                            │
│    materialize contracts, prepare instructions/content   │
├─────────────────────────────────────────────────────────┤
│ 4. DEVELOPMENT (agent or human coding)                  │
│    generate/write pages, components, contracts           │
├─────────────────────────────────────────────────────────┤
│ 5. SLOW RENDER (build / dev server start)               │
│    static generation, SSG, slow phase                    │
├─────────────────────────────────────────────────────────┤
│ 6. FAST RENDER (SSR / request time)                     │
│    per-request data, session-aware rendering              │
├─────────────────────────────────────────────────────────┤
│ 7. INTERACTIVE (CSR / client-side)                      │
│    hydration, signals, reactive updates                   │
├─────────────────────────────────────────────────────────┤
│ 8. SLOW REFRESH (data change → re-render)               │
│    incremental slow re-render for specific routes        │
└─────────────────────────────────────────────────────────┘
```

## Phase Details

### Phase 1: Project Setup

**What happens:** Developer creates a new project, installs plugins.

**Existing:**
- `npm init` / project scaffold
- `npm install` plugins (e.g., `@wix/stores`, `@wix/data`)

**CLI:** None specific to jay-stack yet for project creation.

**No new commands needed** - standard npm workflow.

### Phase 2: Plugin Setup

**What happens:** Plugins are configured. Some plugins (like wix-data) need initial configuration and can generate reference files, default configs, or seed data after basic setup.

**Example:** After installing `@wix/data`, the developer runs a setup command. The plugin:
- Creates default collection schemas
- Generates reference config files
- Seeds initial data (if applicable)
- Validates plugin prerequisites (API keys, etc.)

**Question: Should this be a dedicated CLI command?**

**Answer:** Yes. Plugins need a lifecycle hook for post-install setup.

**Proposed command:**

```bash
# Run setup for all installed plugins
jay-stack setup

# Run setup for a specific plugin
jay-stack setup wix-stores

# Re-run setup (e.g., after config change)
jay-stack setup wix-data --force
```

**What `jay-stack setup` does:**
1. Scans installed plugins for a `setup` export or `setup` entry in `plugin.yaml`
2. Runs each plugin's setup function
3. Plugin setup can:
   - Create/update config files (in `src/` or project root)
   - Generate reference data (write to `agent-kit/references/` or project-level config)
   - Validate configuration (API keys, connections)
   - Report status (configured/needs-attention)

**Plugin.yaml extension:**

```yaml
# plugin.yaml
name: wix-data
setup:
  handler: ./setup.js        # Setup function entry point
  description: Configure CMS collections and seed data
  creates:
    - src/data/collections/   # Files/dirs this setup creates
```

**When to run:** After install, before agent-kit. Not automatic - developer explicitly runs it.

### Phase 3: Agent Kit

**What happens:** Prepare everything an agent needs to generate pages.

**Existing:**
- `jay-stack contracts` - materializes contracts to disk
- Design Log #85 defines `agent-kit/` folder structure

**Proposed:** Rename/extend to `jay-stack agent-kit` (as in #85):
1. Materialize dynamic contracts → `agent-kit/materialized-contracts/`
2. Generate contracts-index.yaml and plugins-index.yaml
3. Ensure INSTRUCTIONS.md is present
4. Optionally run `jay-stack params` for all components with load params

**CLI:**

```bash
jay-stack agent-kit          # Full agent-kit generation
jay-stack params <contract>  # Discover load param values (from #84 Phase 1b)
jay-stack action <action>    # Run plugin action for data discovery
```

### Phase 4: Development (Agent or Human Coding)

**What happens:** Agent or developer creates/edits pages, components, contracts.

**Agent workflow:**
1. Read `agent-kit/INSTRUCTIONS.md`
2. Read contracts-index, plugins-index
3. Read content files from `agent-kit/content/`
4. Generate `src/pages/**/page.jay-html`, `page.jay-contract`, `page.conf.yaml`

**Human workflow:**
- Write jay-html templates, TypeScript components
- Use `jay-stack validate` to check files

**Existing CLI:**
- `jay-stack validate` - validates .jay-html and .jay-contract files
- `jay-stack validate-plugin` - validates plugin packages

### Phase 5: Slow Render (Build Time)

**What happens:** Static site generation. All slow-phase data is resolved, templates are rendered with slow ViewState, carry-forward data is stored.

**Existing:**
- Dev server runs slow rendering on startup
- Build (not yet fully implemented) would do the same

**What runs:**
1. For each page: resolve slow props (static values, load params)
2. Call component's `slowlyRender(props)` → slow ViewState + carryForward
3. Transform jay-html template with slow ViewState
4. Store rendered HTML + carryForward for fast phase
5. Cache results (page-level caching, includes nested component slow renders)

**CLI:**
- `jay-stack dev` - dev server (includes slow render)
- `jay-stack build` (future) - production build

### Phase 6: Fast Render (SSR / Request Time)

**What happens:** Per-request rendering. Session-aware, dynamic data injected.

**What runs:**
1. Receive HTTP request
2. For each page: call component's `fastRender(carryForward)` → fast ViewState
3. Merge fast ViewState into pre-rendered HTML
4. For nested components: pass their stored carryForward, get fast ViewState
5. Serve complete HTML + client scripts

**No new CLI** - this is the server runtime.

### Phase 7: Interactive (CSR / Client-Side)

**What happens:** Browser hydrates, signals activate, interactive elements wire up.

**What runs:**
1. Client runtime initializes
2. `makeJayComponent` attaches to DOM elements
3. Signals created from interactive ViewState
4. Event handlers wire up to refs
5. Plugin's `interactiveConstructor` runs

**No CLI** - this is client runtime.

### Phase 8: Slow Refresh (Data Change)

**What happens:** External data changes (e.g., product updated in CMS). The slow render for affected routes needs to re-run.

**Question: Should this be a dedicated CLI command?**

**Answer:** Yes, but not for now. This is a future optimization for when the build product is implemented.

**Proposed (future):**

```bash
# Re-render slow phase for a specific route
jay-stack refresh /shop/products/[slug]

# Re-render slow phase for all routes using a specific contract
jay-stack refresh --contract wix-stores/product-page

# Re-render all routes
jay-stack refresh --all
```

**What it does:**
1. Identify affected routes (by path or by contract dependency)
2. Re-run slow render for those routes only
3. Update cached slow-render output
4. Optionally trigger rebuild of static assets

**Not building this now** - depends on the build product phase being implemented first.

## Summary: CLI Commands by Phase

| Phase | Command | Status | Description |
|-------|---------|--------|-------------|
| 2. Plugin Setup | `jay-stack setup [plugin]` | **New** | Run plugin post-install setup |
| 3. Agent Kit | `jay-stack agent-kit` | Proposed (#85) | Materialize contracts + kit |
| 3. Agent Kit | `jay-stack contracts` | **Exists** | Materialize contracts |
| 3. Agent Kit | `jay-stack params <contract>` | Proposed (#84) | Discover load param values |
| 3. Agent Kit | `jay-stack action <action>` | Proposed (#84) | Run plugin action |
| 4. Development | `jay-stack validate` | **Exists** | Validate project files |
| 4. Development | `jay-stack validate-plugin` | **Exists** | Validate plugin package |
| 5. Slow Render | `jay-stack dev` | **Exists** | Dev server (slow + fast + interactive) |
| 5. Slow Render | `jay-stack build` | Future | Production build |
| 8. Slow Refresh | `jay-stack refresh [route]` | Future | Re-render slow phase for route |

## Questions

### Q1: Should `jay-stack setup` be interactive or headless?

Both. Default is headless (reads config, generates files). With `--interactive` flag, prompts for configuration values. Agent always uses headless mode.

### Q2: Should `jay-stack agent-kit` subsume `jay-stack contracts`?

Likely yes for v2. For now, `contracts` exists and works; `agent-kit` extends it with plugins-index and defaults output to `agent-kit/`. Could keep `contracts` as an alias or low-level command.

### Q3: Where does `jay-stack setup` write plugin config?

Plugin decides. Reasonable defaults:
- Plugin-specific config: `src/plugins/<name>/` or project root config files
- Reference data for agents: `agent-kit/references/`
- Generated schemas: wherever the plugin convention specifies

### Q4: Should `jay-stack refresh` invalidate cache selectively?

Yes. The slow-render cache is page-level. Refresh should:
1. Identify which cache entries are affected
2. Re-render only those
3. This requires tracking which contracts/data sources each page depends on

This is a future concern - cache dependency tracking needs to be designed when we build the production build system.

## Implementation Priority

1. **`jay-stack setup`** - Needed before agent-kit works well (plugins need to be configured first)
2. **`jay-stack agent-kit`** - Needed for agentic generation (extends existing `contracts` command)
3. **`jay-stack params`** - Needed for agents to discover load param values
4. **`jay-stack action`** - Needed for agents to discover dynamic data
5. **`jay-stack refresh`** - Future, depends on build product
