# Plugins

Plugins provide headless components, server actions, and services to Jay Stack applications. A plugin is either a local directory under `src/plugins/` or an installed NPM package.

## plugin.yaml

Every plugin has a `plugin.yaml` at its root:

```yaml
name: my-plugin

contracts:
  - name: product-page
    contract: product-page.jay-contract
    component: productPage
    description: Full product page with variants and pricing

actions:
  - addToCart
  - name: searchProducts
    action: search-products.jay-action

init: myPluginInit

setup:
  handler: setupMyPlugin
  references: generateMyPluginReferences
  description: Configure API credentials
```

### Fields

| Field               | Type             | Description                                                                  |
| ------------------- | ---------------- | ---------------------------------------------------------------------------- |
| `name`              | string           | Plugin name, used in `plugin="..."` attributes                               |
| `version`           | string?          | Plugin version                                                               |
| `module`            | string?          | Entry point path (local plugins only, e.g., `./my-plugin`)                   |
| `global`            | boolean?         | If true, loads on every page regardless of usage                             |
| `contracts`         | array?           | Static contract declarations                                                 |
| `dynamic_contracts` | object or array? | Runtime-generated contracts                                                  |
| `actions`           | array?           | Server action exports                                                        |
| `init`              | string?          | Export name for `JayInit` constant (auto-discovers `lib/init.ts` if omitted) |
| `setup`             | object?          | Setup command configuration                                                  |

### contracts

Each entry maps a contract to its component implementation:

```yaml
contracts:
  - name: product-page # Contract name (used in contract="..." attributes)
    contract: product-page.jay-contract # Path to contract file
    component: productPage # Exported member name from plugin module
    description: Product details page
```

For NPM packages, `contract` is a package export subpath. For local plugins, it's a relative path.

### dynamic_contracts

For contracts generated at runtime (e.g., from a CMS schema):

```yaml
dynamic_contracts:
  generator: ./generate-contracts # Path to generator module
  component: dynamicComponent # Component export name
  prefix: list # Prefix for generated names (e.g., list/recipes)
```

### actions

Actions can be listed as simple strings (export name only) or with metadata:

```yaml
actions:
  - clearHistory # Simple: export name only
  - name: searchProducts # With metadata:
    action: search-products.jay-action # Path to .jay-action file
```

Actions with `.jay-action` metadata are discoverable by AI agents via the agent-kit.

### setup

```yaml
setup:
  handler: setupMyPlugin # Export name for setup handler
  references: generateReferences # Export name for reference data generation
  description: Configure API key # Human-readable description
```

## Plugin Resolution

Plugins are resolved in this order:

1. **Local plugins** — `src/plugins/<plugin-name>/plugin.yaml`
2. **NPM packages** — `node_modules/<plugin-name>/plugin.yaml`

### Local Plugin

```
src/plugins/stock-status/
├── plugin.yaml
├── stock-status.jay-contract
└── stock-status.ts
```

```yaml
# plugin.yaml
name: stock-status
module: ./stock-status
contracts:
  - name: stock-status
    contract: ./stock-status.jay-contract
    component: stockStatus
```

Paths in `contract` and `module` are relative to the plugin directory.

Local plugins are useful for plugin development — since the plugin code lives inside the project, the dev server hot-redeploys changes without requiring a separate build step.

### NPM Plugin

For NPM packages, the `contract` field maps to package export subpaths. The package must export `plugin.yaml` in its `package.json` exports:

```json
{
  "exports": {
    "./plugin.yaml": "./plugin.yaml",
    "./product-page.jay-contract": "./lib/product-page.jay-contract"
  }
}
```

### Using a Plugin

Reference the plugin name in jay-html imports:

```html
<!-- Key-based -->
<script
  type="application/jay-headless"
  plugin="stock-status"
  contract="stock-status"
  key="stock"
></script>

<!-- Instance-based -->
<script type="application/jay-headless" plugin="product-widget" contract="product-widget"></script>
```

## Action Metadata (.jay-action)

`.jay-action` files describe server action inputs and outputs for AI agent discovery. They use a YAML format with Jay-Type notation:

```yaml
name: searchProducts
description: Search products with text query, filters, and pagination

import:
  productCard: product-card.jay-contract

inputSchema:
  query: string
  filters?:
    inStockOnly?: boolean
    minPrice?: number
    maxPrice?: number
  sortBy?: enum(relevance | price_asc | price_desc)
  pageSize?: number

outputSchema:
  products:
    - productCard
  totalCount: number
  hasMore: boolean
```

### Jay-Type Notation

| Notation                   | Meaning                  |
| -------------------------- | ------------------------ |
| `name: string`             | Required string          |
| `name?: number`            | Optional number          |
| `name: boolean`            | Required boolean         |
| `name: enum(a \| b \| c)`  | Enum type                |
| `nested:` + indented block | Object with properties   |
| `- itemType`               | Array of items           |
| `name: record(T)`          | Record with typed values |
| `name: ContractName`       | Type from `import` block |

The `import` block lets you reference contract ViewState types in schemas, avoiding duplication.

## Plugin Setup

Plugins can provide a setup handler that configures credentials and generates reference data.

### Running Setup

```bash
# Set up all plugins
jay-stack setup

# Set up a specific plugin
jay-stack setup my-plugin

# Force re-run (overwrite config templates)
jay-stack setup --force
```

### Setup Flow

1. **Config check** — If no config file exists, the handler creates a template and returns `needs-config`
2. **Service init + verify** — Plugin initialization runs, services are validated
3. **Reference generation** — Called separately by `jay-stack agent-kit` to generate reference data for AI agents

### Setup Handler

The setup handler is an async function exported from the plugin module:

```typescript
import { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';

export async function setupMyPlugin(ctx: PluginSetupContext): Promise<PluginSetupResult> {
  const configPath = path.join(ctx.configDir, 'my-plugin.yaml');

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, CONFIG_TEMPLATE);
    return {
      status: 'needs-config',
      configCreated: ['config/my-plugin.yaml'],
      message: 'Fill in credentials and re-run: jay-stack setup my-plugin',
    };
  }

  return { status: 'configured' };
}
```

The context provides:

| Field         | Description                                    |
| ------------- | ---------------------------------------------- |
| `pluginName`  | Plugin name from plugin.yaml                   |
| `projectRoot` | Project root directory                         |
| `configDir`   | Config directory path (defaults to `./config`) |
| `services`    | Registered services from plugin init           |
| `initError`   | Present if plugin init failed                  |
| `force`       | Whether `--force` flag was used                |

### File Layout After Setup

```
config/
├── my-plugin.yaml          ← credentials / configuration
project-root/
└── agent-kit/
    └── references/
        └── my-plugin/      ← generated reference data
```

## Plugin Validation

Use the CLI to validate a plugin's structure:

```bash
jay-stack validate <plugin-name>
```

This checks that `plugin.yaml` is valid, contract files exist, component exports are resolvable, and (for NPM packages) `package.json` exports are correct.
