# Jay Stack Setup Command

**Date:** February 9, 2026  
**Status:** Draft  
**Related:** Design Logs #60 (plugin system), #65 (makeJayInit), #85 (agent-kit), #86 (lifecycle)

## Background

Design Log #86 identifies Phase 2 "Plugin Setup" as a gap: after installing plugins and before running `agent-kit`, plugins need configuration (credentials, connections) and can generate reference data (collection schemas, category lists). Today:

- Plugin init (`makeJayInit`) registers services but has no mechanism for first-time config setup
- No CLI command creates config templates or validates credentials
- The agent-kit template docs (`cli-commands.md`, `project-structure.md`) already reference `jay-stack setup` but it doesn't exist
- `PluginManifest` has no `setup` field

## Problem

Plugins like `wix-data` and `wix-stores` need credentials (API keys, site URLs) to function. Currently a developer must manually create config files by reading plugin docs. There's no:

1. Guided config creation (templates with required fields)
2. Credential/connection validation before attempting to build
3. Reference data generation (collection schemas, product lists) that agents need for informed page generation

## Design

### Three-Phase Setup Flow

```
jay-stack setup [plugin] [--force]
         │
         ▼
┌──────────────────────────┐
│ 1. CONFIG CHECK          │
│ Does config exist?       │
│ No → create template     │
│ Yes → continue           │
├──────────────────────────┤
│ 2. SERVICE INIT + VERIFY │
│ Run plugin init          │
│ Failed → report error    │
│ OK → continue            │
├──────────────────────────┤
│ 3. REFERENCE GENERATION  │
│ Call setup hook with      │
│ live services             │
│ Write to agent-kit/      │
│ references/<plugin>/     │
└──────────────────────────┘
```

### Plugin.yaml Extension

```yaml
# plugin.yaml
name: wix-stores
setup:
  handler: setupWixStores # Export name (NPM) or path (local)
  description: Configure Wix Stores credentials and generate product catalog reference
```

### PluginManifest Type Change

In `compiler-shared/lib/plugin-resolution.ts`:

```typescript
export interface PluginManifest {
  // ...existing fields...
  setup?: {
    handler: string; // Export name or relative path to setup module
    description?: string; // Human-readable description of what setup does
  };
}
```

### Setup Handler Interface

```typescript
interface PluginSetupContext {
  pluginName: string;
  projectRoot: string;
  configDir: string; // From .jay configBase, defaults to ./config
  referencesDir: string; // agent-kit/references/<plugin>/
  services: Map<symbol, unknown>; // Registered services (empty if init failed)
  initError?: Error; // Present if plugin init failed
  force: boolean; // --force flag
}

interface PluginSetupResult {
  status: 'configured' | 'needs-config' | 'error';
  configCreated?: string[]; // Config files created (relative paths)
  referencesCreated?: string[]; // Reference files created (relative paths)
  message?: string; // Human-readable status message
}

// Plugin exports this function:
type PluginSetupHandler = (context: PluginSetupContext) => Promise<PluginSetupResult>;
```

### How the Handler Works

The handler gets full context and decides what to do:

```typescript
// Example: wix-stores/lib/setup.ts
export async function setupWixStores(ctx: PluginSetupContext): Promise<PluginSetupResult> {
  const configPath = path.join(ctx.configDir, 'wix-stores.yaml');

  // Phase 1: Config check
  if (!fs.existsSync(configPath)) {
    // Create template with placeholders
    fs.writeFileSync(
      configPath,
      YAML.stringify({
        apiKey: '<your-api-key>',
        siteUrl: '<your-site-url>',
      }),
    );
    return {
      status: 'needs-config',
      configCreated: ['config/wix-stores.yaml'],
      message: 'Config template created. Fill in credentials and re-run setup.',
    };
  }

  // Phase 2: Verify services
  if (ctx.initError) {
    return {
      status: 'error',
      message: `Service initialization failed: ${ctx.initError.message}`,
    };
  }

  // Phase 3: Generate references
  const storesService = ctx.services.get(WIX_STORES_SERVICE_MARKER);
  const products = await storesService.products.list({ limit: 50 });
  const categories = await storesService.categories.list();

  await fs.promises.mkdir(ctx.referencesDir, { recursive: true });
  fs.writeFileSync(
    path.join(ctx.referencesDir, 'products.yaml'),
    YAML.stringify({
      products: products.items.map((p) => ({ id: p._id, name: p.name, slug: p.slug })),
    }),
  );
  fs.writeFileSync(
    path.join(ctx.referencesDir, 'categories.yaml'),
    YAML.stringify({
      categories: categories.items.map((c) => ({ id: c._id, name: c.name, slug: c.slug })),
    }),
  );

  return {
    status: 'configured',
    referencesCreated: [
      'agent-kit/references/wix-stores/products.yaml',
      'agent-kit/references/wix-stores/categories.yaml',
    ],
    message: `Found ${products.items.length} products, ${categories.items.length} categories`,
  };
}
```

### CLI Command

```bash
# Run setup for all plugins that declare setup in plugin.yaml
jay-stack setup

# Run setup for a specific plugin
jay-stack setup wix-stores

# Force re-run (overwrite config templates and regenerate references)
jay-stack setup --force

# Verbose output
jay-stack setup -v
```

### CLI Output

```
$ jay-stack setup

🔧 Setting up plugins...

📦 wix-stores
   ⚠️  Config template created: config/wix-stores.yaml
   → Fill in credentials and re-run: jay-stack setup wix-stores

📦 wix-data
   ✅ Services verified
   ✅ Generated references:
      agent-kit/references/wix-data/collections.yaml (4 collections)

Setup complete: 1 configured, 1 needs config
```

### Reference Data Location

Reference data goes to `agent-kit/references/<plugin>/` because:

- It's discovery material for agents, not runtime config
- Same audience as `agent-kit/materialized-contracts/`
- Design Log #85 already proposed `agent-kit/references/`
- Keeps `config/` focused on credentials and runtime settings

### File Layout After Setup

```
config/
├── project.conf.yaml
├── wix-stores.yaml        ← credentials (may be gitignored)
└── wix-data.yaml          ← credentials

agent-kit/
├── references/
│   ├── wix-stores/
│   │   ├── products.yaml  ← reference catalog
│   │   └── categories.yaml
│   └── wix-data/
│       └── collections.yaml ← collection schemas
├── materialized-contracts/  ← from jay-stack agent-kit
└── INSTRUCTIONS.md          ← from jay-stack agent-kit
```

## Implementation Plan

### Phase 1: PluginManifest + Setup Handler Types

1. Add `setup` field to `PluginManifest` in `compiler-shared/lib/plugin-resolution.ts`
2. Create setup handler types in `stack-server-runtime` (or a shared location)
3. Update plugin-validator to accept `setup` field

### Phase 2: CLI Command

1. Add `setup` command to `stack-cli/lib/cli.ts`
2. Create `stack-cli/lib/run-setup.ts` with:
   - Discover plugins with `setup` in plugin.yaml
   - For each plugin: attempt init → load setup handler → call it → report result
3. Wire up Vite server for TypeScript loading (same pattern as `run-action.ts`)

### Phase 3: Update Docs

1. Verify agent-kit template `cli-commands.md` matches implementation
2. Verify `project-structure.md` references are accurate
3. Update skill files if needed

### Phase 4: Example Plugin Setup Handler

1. Add `setup` to `wix-stores/plugin.yaml`
2. Implement `setupWixStores` in `wix-stores/lib/setup.ts`
3. Test full flow: no config → template → fill in → setup → references

## Questions

### Q1: Should setup run init for ALL plugins or only the target plugin?

**Answer:** Run init for all plugins (they may depend on each other), but only call the setup handler for the target plugin(s). Uses the existing `initializeServicesForCli` which already handles dependency ordering.

### Q2: What if a plugin has no `setup` but needs config?

Plugins without `setup` in plugin.yaml are skipped by `jay-stack setup`. The `setup` handler is opt-in — not all plugins need first-time configuration. Plugins that only provide static contracts (no credentials needed) don't need it.

### Q3: Should setup validate the config file schema?

Not in v1. The setup handler receives the config dir and can validate itself. A schema validation system could be added later if needed.

### Q4: Should `--force` recreate config templates even if config exists?

Yes. `--force` means "start fresh" — recreate config template (backing up existing) and regenerate all references.

## Plugin Setup Handlers

### wix-server-client

**This is the foundation** — wix-stores and wix-data both depend on `WIX_CLIENT_SERVICE`.

**Setup behavior:**

- No config → create `config/.wix.yaml` template with placeholder apiKey, siteId, oauthClientId
- Config exists → run init, try to create a WixClient, report success/failure
- No reference data (credentials-only plugin)

```yaml
# plugin.yaml addition
setup:
  handler: setupWixServerClient
  description: Configure Wix API credentials
```

### wix-stores

**Depends on:** wix-server-client (needs `WIX_CLIENT_SERVICE`)

**Setup behavior:**

- No own config — credentials come from wix-server-client
- If services available → fetch products (via `searchProducts`) and categories (via `queryCategories`), write to `agent-kit/references/wix-stores/`
- If services unavailable (wix-server-client not configured) → report dependency error

**References generated:**

- `agent-kit/references/wix-stores/products.yaml` — product catalog (id, name, slug, price)
- `agent-kit/references/wix-stores/categories.yaml` — category list (id, name, slug)

```yaml
# plugin.yaml addition
setup:
  handler: setupWixStores
  description: Generate product and category reference data
```

### wix-data

**Depends on:** wix-server-client (needs `WIX_CLIENT_SERVICE`)

**Setup behavior:**

- No config → call existing `generateDefaultConfig(wixClient)` which fetches collection schemas from API and writes `config/wix-data.yaml` + `config/wix-data-collections.md`
- Config exists → validate, generate reference data
- Already has config auto-generation logic in `config-loader.ts` — setup handler delegates to it

**References generated:**

- `agent-kit/references/wix-data/collections.yaml` — collection schemas with field types and relationships

```yaml
# plugin.yaml addition
setup:
  handler: setupWixData
  description: Configure CMS collections and generate schema references
```

### Setup Order

Since setup runs init for all plugins (dependency-ordered), the natural execution order is:

1. wix-server-client setup → creates credentials config
2. wix-data setup → generates collection config + references
3. wix-stores setup → generates product/category references

Running `jay-stack setup` with no args runs all three in order. Running `jay-stack setup wix-stores` runs init for all but only calls the wix-stores setup handler.

## Trade-offs

| Decision                                       | Pro                                                          | Con                                      |
| ---------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| Single handler function (not 3 separate hooks) | Simple API, plugin decides what to do                        | Plugin must handle all phases internally |
| References in `agent-kit/` not `config/`       | Clean separation: config = runtime, references = discovery   | Two output locations from one command    |
| Handler gets services map directly             | Plugins can use their own service markers                    | Loosely typed (Map<symbol, unknown>)     |
| Setup is explicit CLI command, not automatic   | Developer controls when setup runs, no surprise side effects | Extra step to remember                   |

## Implementation Results

### Files Created/Modified

**New files:**

- `jay/packages/jay-stack/stack-server-runtime/lib/plugin-setup.ts` — Types (`PluginSetupContext`, `PluginSetupResult`, `PluginSetupHandler`) + discovery + execution logic
- `jay/packages/jay-stack/stack-cli/lib/run-setup.ts` — CLI handler with config dir resolution, init error capture, per-plugin reporting
- `wix/packages/wix-server-client/lib/setup.ts` — Creates `.wix.yaml` template, validates credentials
- `wix/packages/wix-stores/lib/setup.ts` — Generates products.yaml + categories.yaml references
- `wix/packages/wix-data/lib/setup.ts` — Generates collections.yaml references with field schemas

**Modified files:**

- `compiler-shared/lib/plugin-resolution.ts` — Added `setup` field to `PluginManifest`
- `stack-server-runtime/lib/index.ts` — Exports `plugin-setup`
- `stack-cli/lib/cli.ts` — Registered `setup` command
- `wix-server-client/plugin.yaml`, `lib/index.ts` — Added setup handler/export
- `wix-stores/plugin.yaml`, `lib/index.ts` — Added setup handler/export
- `wix-data/plugin.yaml`, `lib/index.ts` — Added setup handler/export
- `agent-kit-template/cli-commands.md` — Updated setup description
- `agent-kit-template/project-structure.md` — Added `agent-kit/references/` to layout

### Deviations from Design

1. **Handler loading for NPM plugins**: Design proposed handler as export name. Implementation loads from package main module and looks up the named export. For local plugins, it resolves as a file path and looks for `setup` or `default` export.
2. **wix-data config creation**: Not handled by the setup handler directly. wix-data's existing `loadConfig()` in init already auto-generates `config/wix-data.yaml` when missing. The setup handler validates this happened.
3. **Init error handling**: The CLI runs `initializeServicesForCli` once for all plugins (not per-plugin). If it fails, the error is passed to all setup handlers. Handlers decide how to react based on their needs.
4. **Reference generation split from setup**: Original design had setup handlers generating references. Refactored so setup only handles config + validation, and reference generation is a separate `setup.references` hook called by `jay-stack agent-kit`. This is cleaner: setup answers "can I connect?", agent-kit answers "prepare everything for agents". Plugin.yaml has `setup.handler` (for config/validation) and `setup.references` (for discovery data). Agent-kit command runs references after materializing contracts, using the same Vite server and initialized services. Added `--no-references` flag to agent-kit for skipping.
