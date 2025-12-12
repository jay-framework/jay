# Plugin System Refinement and Dynamic Contracts

**Date:** December 11, 2025  
**Status:** Design Proposal  
**Related:** Design Logs #58, #51, #40, #39

## Summary

This document refines the plugin system by:
1. Renaming `app.conf.yaml` → `plugin.yaml`
2. Unifying headless component reference syntax across jay-html and page.config.yaml
3. Adding support for dynamic contract generation (e.g., CMS-driven contracts)
4. Clarifying what plugin developers and jay-stack users need to do

## Changes from Current Status

### 1. File Rename: `app.conf.yaml` → `plugin.yaml`

**Current:**
```
node_modules/@wix/stores/app.conf.yaml
src/config/installedApps/wix-stores/app.conf.yaml
```

**New:**
```
node_modules/@wix/stores/plugin.yaml
src/plugins/wix-stores/plugin.yaml
```

**Why `plugin.yaml` not `plugin.config.yaml`?**
- Shorter, cleaner
- Common convention (see `tsconfig.json`, `package.json`)
- "config" is redundant (YAML files are inherently configuration)

**Migration path:**
- Support both names during transition
- Deprecation warning for `app.conf.yaml`
- Auto-migration tool: `jay migrate plugin-config`

### 2. Plugin.yaml Format (Well-Documented)

```yaml
# plugin.yaml - Defines a Jay Stack plugin
#
# Plugins provide headless components with contracts that can be used in pages and components.
# This file can be in an npm package or in src/plugins/<plugin-name>/ folder.

# Plugin metadata
name: wix-stores                    # Human-readable name
module: "@wix/stores"                # NPM package name (for resolution)
version: "1.0.0"                     # Plugin version

# Static contracts: List of contracts exposed by this plugin
contracts:
  # Each contract entry defines a headless component
  - name: product-list               # Component name (used in references)
    key: products                    # Data key in parent contract
    contract: ./contracts/product-list.jay-contract  # Relative path to contract
    implementation: ./components/product-list.ts     # Relative path to implementation
    description: "Displays a list of products"       # Optional description
    
  - name: product-detail
    key: product
    contract: ./contracts/product-detail.jay-contract
    implementation: ./components/product-detail.ts
    
  - name: shopping-cart
    key: cart
    contract: ./contracts/cart.jay-contract
    implementation: ./components/cart.ts

# Dynamic contracts: Contracts generated at build time (optional)
dynamic_contracts:
  generator: ./generators/cms-contracts.ts  # Path to generator function
  cache_key: "schema-version-123"           # Optional cache key
```

**Key Fields:**

- **`name`**: Plugin identifier (must be unique in project)
- **`module`**: NPM package name for Node.js resolution
- **`contracts`**: Static list of exposed contracts (most common)
- **`dynamic_contracts`**: Optional generator for dynamic contracts
- **`contract`**: Relative path to `.jay-contract` file (resolved via Node.js module resolution)
- **`implementation`**: Relative path to TypeScript implementation
- **`key`**: The property name used when embedding this contract in a parent contract

### 3. Unified Headless Component Reference Syntax

**Goal:** Same syntax in both `page.jay-html` and `page.config.yaml`

#### In `page.jay-html`

```html
<script 
  type="application/jay-headless"
  plugin="wix-stores"
  contract="product-list"
  key="products"
></script>
```

**Changes from current:**
- `src` → `plugin` (clearer semantics)
- `name` → `contract` (directly references contract name from plugin.yaml)
- Removes indirection (no need to know if it's a page or component in the plugin)

#### In `page.config.yaml`

```yaml
# page.config.yaml
used_components:
  - plugin: wix-stores
    contract: product-list
    key: products
    
  - plugin: wix-stores
    contract: shopping-cart
    key: cart
```

**Perfect symmetry with jay-html!**

### 4. Plugin Discovery and Resolution

#### Two locations for plugins:

1. **NPM packages** (published plugins)
   ```
   node_modules/@wix/stores/plugin.yaml
   ```
   - Discovered via Node.js module resolution
   - Reference: `plugin: "@wix/stores"`

2. **Local project plugins** (custom/development plugins)
   ```
   src/plugins/my-custom-plugin/plugin.yaml
   ```
   - Discovered by scanning `src/plugins/` directory
   - Reference: `plugin: "my-custom-plugin"`

#### Resolution Priority:

1. Check `src/plugins/<name>/plugin.yaml` (local overrides)
2. Check `node_modules/<name>/plugin.yaml` (npm package)
3. Check `src/config/installedApps/<name>/app.conf.yaml` (legacy)

### 5. Dynamic Contract Generation

**Use Case:** CMS plugin that reads schema from external system and generates contracts

#### Generator Function Signature

```typescript
// cms-contracts.ts
import { Contract } from '@jay-framework/compiler-shared';

export interface DynamicContractGenerator {
  /**
   * Generate contracts dynamically at build time
   * @returns Array of generated contract definitions
   */
  generate(): Promise<GeneratedContract[]> | GeneratedContract[];
}

export interface GeneratedContract {
  name: string;                    // Contract name (e.g., "blog-post")
  key: string;                     // Data key (e.g., "blogPost")
  contract: Contract;               // Parsed contract object
  implementation: string;           // Path to implementation file
  description?: string;             // Optional description
}

// Example: CMS plugin that generates contracts for each collection
export const generator: DynamicContractGenerator = {
  async generate() {
    // Connect to CMS and read schema
    const cms = await connectToCMS();
    const collections = await cms.getCollections();
    
    return collections.map(collection => ({
      name: `${collection.name}-list`,
      key: collection.name,
      contract: generateContractFromSchema(collection.schema),
      implementation: `./generated/${collection.name}.ts`,
      description: `List view for ${collection.name}`
    }));
  }
};
```

#### Using Dynamic Contracts

Once generated, they're used exactly like static contracts:

```html
<!-- In page.jay-html -->
<script 
  type="application/jay-headless"
  plugin="my-cms"
  contract="blog-post-list"
  key="blogPosts"
></script>
```

**Build-time behavior:**
1. During `jay build`, framework calls `generator.generate()`
2. Generated contracts are validated
3. Implementation files are generated or validated
4. Contracts become available for type-checking and compilation
5. Results cached using `cache_key` (regenerate only when cache invalidated)

## What Plugin Developers Need to Do

### Creating a Static Plugin

1. **Create plugin.yaml**
   ```yaml
   name: my-plugin
   module: "@mycompany/my-plugin"
   contracts:
     - name: my-component
       key: myComponent
       contract: ./contracts/my-component.jay-contract
       implementation: ./components/my-component.ts
   ```

2. **Create contract files**
   ```yaml
   # contracts/my-component.jay-contract
   name: MyComponent
   tags:
     - tag: title
       type: data
       dataType: string
       phase: slow
   ```

3. **Implement component**
   ```typescript
   // components/my-component.ts
   import { makeJayStackComponent } from '@jay-framework/fullstack-component';
   import { MyComponentContract } from '../contracts/my-component.jay-contract';
   
   export const myComponent = makeJayStackComponent<MyComponentContract>()
     .withSlowlyRender(async (props) => {
       return partialRender({ title: 'Hello' }, {});
     });
   ```

4. **Publish to NPM** (or keep local in `src/plugins/`)

### Creating a Dynamic Plugin

1. **Create plugin.yaml with dynamic_contracts**
   ```yaml
   name: cms-plugin
   module: "@mycompany/cms-plugin"
   dynamic_contracts:
     generator: ./generators/cms-generator.ts
     cache_key: "${CMS_SCHEMA_VERSION}"
   ```

2. **Implement generator**
   ```typescript
   // generators/cms-generator.ts
   export const generator = {
     async generate() {
       // Fetch CMS schema
       // Generate contracts
       // Return GeneratedContract[]
     }
   };
   ```

3. **Generator runs at build time**, creates contracts and types

## What Jay-Stack Users Need to Do

### Installing a Plugin

**From NPM:**
```bash
npm install @wix/stores
```

Framework auto-discovers plugin via `node_modules/@wix/stores/plugin.yaml`

**Local Plugin:**
```bash
mkdir -p src/plugins/my-plugin
# Create plugin.yaml, contracts, implementations in that folder
```

### Using a Plugin in a Page

**Option 1: In jay-html**
```html
<!-- page.jay-html -->
<html>
  <head>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
    
    <!-- Reference plugin contracts -->
    <script 
      type="application/jay-headless"
      plugin="wix-stores"
      contract="product-list"
      key="products"
    ></script>
  </head>
  <body>
    <!-- Render data from headless component -->
    <div each="product in products">
      <h2>{product.name}</h2>
    </div>
  </body>
</html>
```

**Option 2: In page.config.yaml (headless pages)**
```yaml
# page.config.yaml
used_components:
  - plugin: wix-stores
    contract: product-list
    key: products
```

**Both are equivalent!** Choose based on whether you have a visual template (jay-html) or pure config (headless).

### Page Contract Integration

When using headless components, the page contract automatically includes them:

```yaml
# page.jay-contract
name: ProductsPage
tags:
  - tag: pageTitle
    type: data
    dataType: string
    phase: slow
    
  # Headless component contract is nested here
  - tag: products
    type: subcontract
    link: plugin:wix-stores/product-list  # Resolved from plugin
    phase: fast
```

**Note:** The `link: plugin:wix-stores/product-list` syntax tells the compiler to resolve the contract from the `wix-stores` plugin.

## Implementation Changes Required

### 1. Update `editor-handlers.ts`

**Current:** Scans `installedApps/*/app.conf.yaml`  
**New:** Scan both:
- `src/plugins/*/plugin.yaml` (local)
- `node_modules/*/plugin.yaml` (npm)

```typescript
async function scanPlugins(
  projectRoot: string
): Promise<{ [pluginName: string]: PluginManifest }> {
  const plugins: { [pluginName: string]: PluginManifest } = {};
  
  // Scan local plugins
  const localPluginsPath = path.join(projectRoot, 'src/plugins');
  if (fs.existsSync(localPluginsPath)) {
    const localPlugins = await scanDirectory(localPluginsPath, 'plugin.yaml');
    Object.assign(plugins, localPlugins);
  }
  
  // Scan npm packages (via package.json dependencies)
  const packageJson = require(path.join(projectRoot, 'package.json'));
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  for (const [pkgName, _] of Object.entries(deps)) {
    const pluginPath = resolvePackagePath(projectRoot, pkgName, 'plugin.yaml');
    if (pluginPath && fs.existsSync(pluginPath)) {
      const plugin = await loadPlugin(pluginPath);
      plugins[pkgName] = plugin;
    }
  }
  
  return plugins;
}
```

### 2. Update jay-html Parser

**Current:** Parses `<script type="application/jay-headless">` with `src`/`name` attributes  
**New:** Parse with `plugin`/`contract` attributes (support both for backward compatibility)

```typescript
interface HeadlessReference {
  plugin: string;      // Plugin name (e.g., "wix-stores")
  contract: string;    // Contract name (e.g., "product-list")
  key: string;         // Data key in parent
}
```

### 3. Add Dynamic Contract Generator Support

```typescript
async function loadPluginContracts(
  plugin: PluginManifest,
  projectRoot: string
): Promise<ResolvedContract[]> {
  const contracts: ResolvedContract[] = [];
  
  // Load static contracts
  if (plugin.contracts) {
    for (const contractDef of plugin.contracts) {
      const contract = await loadContract(
        resolveFromPlugin(plugin, contractDef.contract)
      );
      contracts.push({ ...contractDef, contract });
    }
  }
  
  // Load dynamic contracts
  if (plugin.dynamic_contracts) {
    const generatorPath = resolveFromPlugin(
      plugin, 
      plugin.dynamic_contracts.generator
    );
    const generator = await import(generatorPath);
    const generated = await generator.generator.generate();
    
    for (const gen of generated) {
      contracts.push({
        name: gen.name,
        key: gen.key,
        contract: gen.contract,
        implementation: gen.implementation
      });
    }
  }
  
  return contracts;
}
```

### 4. Update Protocol Types

```typescript
// editor-protocol/lib/protocol.ts

export interface PluginManifest {
  name: string;
  module: string;
  version?: string;
  contracts?: StaticContractDef[];
  dynamic_contracts?: DynamicContractDef;
}

export interface StaticContractDef {
  name: string;
  key: string;
  contract: string;           // Path to .jay-contract
  implementation: string;     // Path to .ts implementation
  description?: string;
}

export interface DynamicContractDef {
  generator: string;          // Path to generator
  cache_key?: string;         // Cache invalidation key
}

export interface ResolvedContract extends StaticContractDef {
  contract: Contract;         // Parsed contract object
}
```

## Migration Guide

### For Plugin Developers

**Step 1:** Rename file
```bash
mv app.conf.yaml plugin.yaml
```

**Step 2:** Update format (if needed)
```yaml
# OLD (app.conf.yaml)
name: wix-stores
module: @wix/stores
pages:
  - name: ProductPage
    headless_components:
      - name: product-list
        key: products
        contract: ./contracts/product-list.jay-contract

# NEW (plugin.yaml) - flattened structure
name: wix-stores
module: "@wix/stores"
contracts:
  - name: product-list
    key: products
    contract: ./contracts/product-list.jay-contract
    implementation: ./components/product-list.ts
```

**Step 3:** Update package.json exports
```json
{
  "exports": {
    "./plugin.yaml": "./plugin.yaml",
    "./contracts/*": "./contracts/*",
    "./components/*": "./dist/components/*"
  }
}
```

### For Jay-Stack Users

**Automatic migration:** Run `jay migrate plugin-refs` to update references:

```html
<!-- Before -->
<script 
  type="application/jay-headless"
  src="wix-stores"
  name="product-list"
  key="products"
></script>

<!-- After -->
<script 
  type="application/jay-headless"
  plugin="wix-stores"
  contract="product-list"
  key="products"
></script>
```

## Benefits

1. **Clearer Semantics**
   - `plugin` vs `src` - explicit that it's a plugin reference
   - `contract` vs `name` - directly references contract definition
   - Removes confusion about pages vs components in plugin structure

2. **Perfect Symmetry**
   - jay-html and page.config.yaml use identical syntax
   - Easier to learn and remember

3. **Better Organization**
   - Flat `contracts` list is simpler than nested `pages/components` structure
   - Local plugins in `src/plugins/` (not buried in `config/installedApps/`)

4. **Dynamic Contracts**
   - Powerful new capability for CMS, database-driven apps
   - Contracts generated at build time maintain type safety
   - Clean generator interface

5. **Well-Documented Format**
   - Clear examples in this document
   - Inline YAML comments in format definition
   - Explicit field meanings

## Example: CMS Plugin with Dynamic Contracts

### Plugin Structure

```
my-cms-plugin/
├── plugin.yaml
├── generators/
│   └── collections-generator.ts
├── templates/
│   └── collection-list.template.ts
└── package.json
```

### plugin.yaml

```yaml
name: my-cms
module: "@mycompany/cms-plugin"
version: "1.0.0"

dynamic_contracts:
  generator: ./generators/collections-generator.ts
  cache_key: "${CMS_API_URL}:${CMS_SCHEMA_VERSION}"
```

### collections-generator.ts

```typescript
import { DynamicContractGenerator, GeneratedContract } from '@jay-framework/plugin-api';
import { connectToCMS } from './cms-client';
import { generateTemplate } from '../templates/collection-list.template';

export const generator: DynamicContractGenerator = {
  async generate(): Promise<GeneratedContract[]> {
    // Connect to CMS
    const cms = await connectToCMS({
      apiUrl: process.env.CMS_API_URL,
      apiKey: process.env.CMS_API_KEY
    });
    
    // Get all collections
    const collections = await cms.getCollections();
    
    // Generate contract for each collection
    return collections.map(collection => {
      // Generate contract from schema
      const contract: Contract = {
        name: `${collection.name}List`,
        tags: [
          {
            tag: 'items',
            type: 'data',
            dataType: 'array',
            repeated: true,
            phase: 'fast',
            tags: collection.fields.map(field => ({
              tag: field.name,
              type: 'data',
              dataType: mapFieldType(field.type),
              phase: field.cached ? 'slow' : 'fast'
            }))
          },
          {
            tag: 'totalCount',
            type: 'data',
            dataType: 'number',
            phase: 'fast'
          }
        ]
      };
      
      // Generate implementation
      const implementation = generateTemplate(collection);
      
      return {
        name: `${collection.name}-list`,
        key: `${collection.name}List`,
        contract,
        implementation: `./generated/${collection.name}-list.ts`,
        description: `List view for ${collection.displayName || collection.name}`
      };
    });
  }
};

function mapFieldType(cmsType: string): string {
  const typeMap = {
    'text': 'string',
    'number': 'number',
    'boolean': 'boolean',
    'date': 'string',
    'reference': 'string'
  };
  return typeMap[cmsType] || 'string';
}
```

### Usage in Project

```bash
# Install plugin
npm install @mycompany/cms-plugin

# Set environment variables
export CMS_API_URL="https://my-cms.com/api"
export CMS_API_KEY="secret-key"
export CMS_SCHEMA_VERSION="v2.1"

# Build - contracts are generated automatically
jay build
```

**Generated contracts are available:**

```html
<!-- page.jay-html -->
<script 
  type="application/jay-headless"
  plugin="my-cms"
  contract="blog-posts-list"
  key="blogPosts"
></script>

<script 
  type="application/jay-headless"
  plugin="my-cms"
  contract="products-list"
  key="products"
></script>
```

All with full type safety and IDE autocomplete!

## Open Questions

1. **Should we support contract versioning in plugin.yaml?**
   ```yaml
   contracts:
     - name: product-list
       version: "2.0"
       contract: ./contracts/product-list-v2.jay-contract
   ```

2. **Should dynamic contracts support incremental regeneration?**
   - Only regenerate changed contracts
   - Requires stable contract IDs/hashing

3. **Should we support contract aliases?**
   ```yaml
   contracts:
     - name: product-list
       aliases: [products, product-listing]
   ```

4. **Should contracts declare their dependencies?**
   ```yaml
   contracts:
     - name: shopping-cart
       requires: [product-list]  # Must be available
   ```

## Next Steps

1. **Update editor-handlers.ts** - Add plugin scanning and dynamic contract support
2. **Update jay-html parser** - Support `plugin`/`contract` attributes
3. **Create plugin API package** - Export types for plugin developers
4. **Implement migration tool** - `jay migrate plugin-config`
5. **Update documentation** - Plugin development guide
6. **Create example plugins** - Static and dynamic examples
7. **Add validation** - Ensure contracts referenced exist

## Success Criteria

- ✅ Plugin developers can create plugins with static contracts easily
- ✅ Plugin developers can create CMS-like plugins with dynamic contracts
- ✅ Jay-stack users can reference contracts with clear, unified syntax
- ✅ Both jay-html and page.config.yaml use identical reference format
- ✅ Migration from old format is straightforward
- ✅ Dynamic contracts maintain full type safety
- ✅ Documentation is comprehensive and includes examples

