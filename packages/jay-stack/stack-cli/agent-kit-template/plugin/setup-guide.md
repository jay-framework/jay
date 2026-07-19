# Plugin Setup & References

Plugins can provide two hooks for project configuration and AI agent discovery:

- **Setup handler** — runs during `jay-stack setup <plugin>`. Creates config files and validates credentials.
- **References handler** — runs during `jay-stack agent-kit`. Generates discovery data (add-menu catalogs, reference files) using live services or static templates.

## When Each Runs

```
jay-stack setup <plugin>     →  setup.handler()
jay-stack agent-kit          →  setup.references()  (after contract materialization)
```

Setup runs once when a project first installs the plugin. Agent-kit runs whenever the developer regenerates the agent kit — it can use live services to produce fresh data.

## Declaring in plugin.yaml

```yaml
setup:
  handler: setupMyPlugin # export name (NPM) or ./path (local)
  references: generateMyReferences # export name (NPM) or ./path (local)
  description: Install My Plugin config and AIditor catalog
```

**NPM plugins:** both values are export names from the package entry point (`lib/index.ts`).  
**Local plugins:** relative paths to the handler modules.

`jay-stack validate-plugin` checks that these exist and are correctly exported.

## Writing a Setup Handler

The setup handler creates config files and AIditor assets. It receives a `PluginSetupContext` and returns a `PluginSetupResult`.

```typescript
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';
import fs from 'node:fs';
import path from 'node:path';

export async function setupMyPlugin(ctx: PluginSetupContext): Promise<PluginSetupResult> {
  if (ctx.initError) {
    return { status: 'error', message: `Init failed: ${ctx.initError.message}` };
  }

  const configCreated: string[] = [];
  const configPath = path.join(ctx.configDir, '.my-plugin.yaml');

  if (!fs.existsSync(configPath) || ctx.force) {
    fs.mkdirSync(ctx.configDir, { recursive: true });
    fs.writeFileSync(configPath, '# My Plugin config\n', 'utf-8');
    configCreated.push('config/.my-plugin.yaml');
  }

  return {
    status: 'configured',
    configCreated,
    message:
      configCreated.length > 0
        ? 'My Plugin config installed.'
        : 'My Plugin config already present (use --force to rewrite).',
  };
}
```

### PluginSetupContext

| Field         | Type      | Description                                                       |
| ------------- | --------- | ----------------------------------------------------------------- |
| `pluginName`  | `string`  | Plugin name from plugin.yaml                                      |
| `projectRoot` | `string`  | Absolute project root path                                        |
| `configDir`   | `string`  | Config directory (from `.jay` configBase, defaults to `./config`) |
| `services`    | `Map`     | Registered services (may be empty if init failed)                 |
| `initError`   | `Error?`  | Present if plugin init failed — check this before using services  |
| `force`       | `boolean` | Whether `--force` flag was passed                                 |

### PluginSetupResult

| Field           | Type                                        | Description                                     |
| --------------- | ------------------------------------------- | ----------------------------------------------- |
| `status`        | `'configured' \| 'needs-config' \| 'error'` | Overall result                                  |
| `configCreated` | `string[]?`                                 | Config files created (relative to project root) |
| `message`       | `string?`                                   | Human-readable status message                   |

## Writing a References Handler

The references handler generates discovery data at agent-kit time. It can use live services (database queries, API calls) to produce dynamic content.

```typescript
import type {
  PluginReferencesContext,
  PluginReferencesResult,
} from '@jay-framework/stack-server-runtime';
import fs from 'node:fs';
import path from 'node:path';

export async function generateMyReferences(
  ctx: PluginReferencesContext,
): Promise<PluginReferencesResult> {
  if (ctx.initError) {
    return { referencesCreated: [], message: `Skipped: ${ctx.initError.message}` };
  }

  // Example: generate add-menu items from live data
  const outputPath = path.join(ctx.projectRoot, 'agent-kit/aiditor/add-menu/my-plugin.yaml');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const items = [
    { id: 'my-plugin:feature-1', title: 'Feature 1', category: 'My Plugin', prompt: '...' },
  ];
  fs.writeFileSync(outputPath, yaml.dump({ items }), 'utf-8');

  return {
    referencesCreated: ['agent-kit/aiditor/add-menu/my-plugin.yaml'],
    message: `Generated ${items.length} add-menu items`,
  };
}
```

### PluginReferencesContext

| Field           | Type      | Description                                                     |
| --------------- | --------- | --------------------------------------------------------------- |
| `pluginName`    | `string`  | Plugin name from plugin.yaml                                    |
| `projectRoot`   | `string`  | Absolute project root path                                      |
| `referencesDir` | `string`  | Directory for reference data (`agent-kit/references/<plugin>/`) |
| `services`      | `Map`     | Registered services                                             |
| `initError`     | `Error?`  | Present if plugin init failed                                   |
| `force`         | `boolean` | Whether `--force` flag was passed                               |

### PluginReferencesResult

| Field               | Type       | Description                              |
| ------------------- | ---------- | ---------------------------------------- |
| `referencesCreated` | `string[]` | Files created (relative to project root) |
| `message`           | `string?`  | Human-readable status message            |

## Setup vs References — When to Use Which

| Use case                                                             | Handler            | Why                                                                    |
| -------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------- |
| Copy static add-menu template and thumbnails                         | `setup.references` | Catalogs are discovery data — materialize during `jay-stack agent-kit` |
| Generate data from live services (product catalogs, CMS schemas)     | `setup.references` | Needs services initialized; regenerated on each `agent-kit` run        |
| Validate credentials / API keys                                      | `setup.handler`    | Part of initial project configuration                                  |
| Write AIditor add-menu from project-specific data (DESIGN.md tokens) | `setup.references` | Data comes from project files, not static templates                    |

## AIditor Add-Menu Items

The **references handler** writes to `agent-kit/aiditor/add-menu/<plugin-name>.yaml`. The AIditor discovers and loads all YAML files in this directory. **Setup handlers must not write add-menu catalogs** — use `setup.references` instead.

See `agent-kit/plugin/aiditor-add-menu.md` for the full contributor guide.

Each item:

```yaml
items:
  - id: my-plugin:feature-name # unique ID
    title: Feature Name # shown in the add menu
    category: My Plugin # grouping
    subCategory: Components # sub-grouping
    pluginName: my-plugin # optional: plugin attribution
    packageName: '@my-org/my-plugin' # optional: npm package name
    prompt: | # instructions for the AI agent
      Use headless component @my-org/my-plugin / contract feature-name.
      Read agent-kit/designer/feature-name.md for usage guide.
```

## Exporting Handlers

For NPM plugins, export the handlers from the package entry point:

```typescript
// lib/index.ts
export { setupMyPlugin } from './setup.js';
export { generateMyReferences } from './references.js';
// ... other exports (components, actions, services)
```

For local plugins, use relative paths in plugin.yaml instead of export names.
