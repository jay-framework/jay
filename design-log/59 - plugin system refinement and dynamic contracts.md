# Plugin System Refinement and Dynamic Contracts

**Date:** December 11, 2025  
**Status:** Design Proposal  
**Related:** Design Logs #58, #51, #40, #39

## Summary

This document refines the plugin system by:
1. Renaming `app.conf.yaml` → `plugin.yaml` (not `plugin.config.yaml`)
2. Unifying headless component reference syntax across jay-html and page.config.yaml
3. Adding support for dynamic contract generation (e.g., CMS-driven contracts)
4. Clarifying what plugin developers and jay-stack users need to do

**Key Decisions:**
- ✅ File name: `plugin.yaml` (shorter, follows common conventions)
- ✅ Remove `version` field (use package.json version instead)
- ✅ Remove `key` field from contract definitions (specify at usage site)
- ✅ Make `module` field optional (defaults to `name` for local plugins)
- ✅ Use package.json `exports` for NPM package path resolution
- ✅ Contract files (.jay-contract) must be published with NPM packages
- ✅ No fallback to `installedApps/` - clean break from old structure

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

### 2. NPM Package Structure for Plugins

An NPM plugin package should include **dual builds** for client-server code splitting (see Design Log #52):

```
@wix/stores/
├── package.json            # NPM package definition with exports
├── plugin.yaml             # Plugin manifest
├── lib/                    # Source TypeScript
│   ├── index.ts            # Main entry (re-exports all components)
│   ├── contracts/          # Contract files (.jay-contract)
│   │   ├── product-list.jay-contract
│   │   ├── product-detail.jay-contract
│   │   └── cart.jay-contract
│   └── components/
│       ├── product-list.ts
│       ├── product-detail.ts
│       └── cart.ts
├── dist/                   # Compiled JavaScript (dual builds)
│   ├── index.js            # Server build (client code stripped)
│   ├── index.client.js     # Client build (server code stripped)
│   └── contracts/          # Copied contract files
│       ├── product-list.jay-contract
│       ├── product-detail.jay-contract
│       └── cart.jay-contract
└── vite.config.ts          # Build configuration with dual outputs
```

**package.json example:**
```json
{
  "name": "@wix/stores",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/index.client.js",
    "./plugin.yaml": "./plugin.yaml",
    "./contracts/*.jay-contract": "./dist/contracts/*.jay-contract"
  },
  "files": [
    "dist",
    "plugin.yaml"
  ],
  "scripts": {
    "build": "npm run definitions && npm run build:client && npm run build:server && npm run build:copy-contracts",
    "definitions": "jay-cli definitions lib",
    "build:client": "vite build",
    "build:server": "vite build --ssr",
    "build:copy-contracts": "cp -r lib/contracts/*.jay-contract* dist/contracts/"
  }
}
```

**vite.config.ts example:**
```typescript
import { resolve } from 'path';
import { defineConfig } from 'vite';
import { JayRollupConfig, jayStackCompiler } from '@jay-framework/compiler-jay-stack';

const jayOptions: JayRollupConfig = {
  tsConfigFilePath: resolve(__dirname, 'tsconfig.json'),
  outputDir: 'build/jay-runtime',
};

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [...jayStackCompiler(jayOptions)],
  build: {
    minify: false,
    target: 'es2020',
    ssr: isSsrBuild,              // Determines server vs client build
    emptyOutDir: false,            // Keep both builds in dist/
    lib: {
      entry: isSsrBuild
        ? { index: resolve(__dirname, 'lib/index.ts') }           // Server build
        : { 'index.client': resolve(__dirname, 'lib/index.ts') }, // Client build
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@jay-framework/component',
        '@jay-framework/fullstack-component',
        '@jay-framework/reactive',
        '@jay-framework/runtime',
        '@jay-framework/secure',
      ],
    },
  },
}));
```

**Key points:**
- **Dual builds**: Server build (`index.js`) has client code stripped, client build (`index.client.js`) has server code stripped
- **Build commands**: Run both `vite build` (client) and `vite build --ssr` (server)
- **Contract files**: Must be published in `dist/` directory (not just source)
- **Code splitting**: Uses `jayStackCompiler` plugin which detects `isSsrBuild` flag
- **Server build** (default export `.`): Safe to import on Node.js (no browser APIs)
- **Client build** (`./client` export): Optimized for browser (no server code)
- **Security**: Server secrets never leak to client bundle
- **Performance**: Both bundles are smaller and optimized for their environment

**How consumers use the plugin:**

Server-side imports (in page.ts):
```typescript
import { productList } from '@wix/stores';
// → Resolves to dist/index.js (server build - no browser APIs) ✅
```

Client-side imports (generated by jay-stack):
```typescript
import { productList } from '@wix/stores/client';
// → Resolves to dist/index.client.js (client build - no server code) ✅
```

### 3. Plugin.yaml Format (Well-Documented)

```yaml
# plugin.yaml - Defines a Jay Stack plugin
#
# Plugins provide headless components with contracts that can be used in pages and components.
# This file can be in an npm package or in src/plugins/<plugin-name>/ folder.

# Plugin metadata
name: wix-stores                    # Human-readable name
module: "@wix/stores"                # NPM package name (for resolution)

# Static contracts: List of contracts exposed by this plugin
contracts:
  # Each contract entry defines a headless component
  - name: product-list               # Component name (used in references)
    contract: ./contracts/product-list.jay-contract  # Path to contract (relative or export path)
    component: ./components/product-list        # Export path to implementation
    description: "Displays a list of products"       # Optional description
    
  - name: product-detail
    contract: ./contracts/product-detail.jay-contract
    component: ./components/product-detail
    
  - name: shopping-cart
    contract: ./contracts/cart.jay-contract
    component: ./components/cart

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
- **`contract`**: Path to `.jay-contract` file (see Path Resolution below)
- **`component`**: Path to TypeScript/JavaScript implementation (see Path Resolution below)

**Path Resolution:**

For **NPM packages**, paths use Node.js module resolution with package.json exports:
- `./contracts/product-list.jay-contract` → resolved via package.json `exports` field
- `./components/product-list` → resolved as ES module export

For **local plugins** (src/plugins/), paths are relative to plugin.yaml location:
- `./contracts/product-list.jay-contract` → relative path from plugin.yaml
- `./components/product-list.ts` → relative path from plugin.yaml

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
- `key` is specified here (at usage site), not in plugin.yaml
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

1. Check `src/plugins/<name>/plugin.yaml` (local plugins)
2. Check `node_modules/<name>/plugin.yaml` (npm packages)

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
  name: string;                    // Contract name (e.g., "blog-post-list")
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
      contract: generateContractFromSchema(collection.schema),
      implementation: `./generated/${collection.name}-list.ts`,
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
        contract: gen.contract,
        implementation: gen.implementation,
        description: gen.description
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
  module?: string;            // Optional for local plugins, defaults to name
  contracts?: StaticContractDef[];
  dynamic_contracts?: DynamicContractDef;
}

export interface StaticContractDef {
  name: string;
  contract: string;           // Path to .jay-contract (resolved via package exports or relative path)
  implementation: string;     // Path to implementation (resolved via package exports or relative path)
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
        key: products  # ❌ key was here
        contract: ./contracts/product-list.jay-contract

# NEW (plugin.yaml) - flattened structure, no key
name: wix-stores
module: "@wix/stores"  # Optional - can be omitted if same as name
contracts:
  - name: product-list
    contract: ./contracts/product-list.jay-contract
    implementation: ./components/product-list
```

**Key changes:**
- Removed `pages`/`components` nesting
- Removed `version` (use package.json version)
- Removed `key` from contract definition (specified at usage site)
- `implementation` path added (for ES module import)

**Step 3:** Update package.json exports (for NPM packages)
```json
{
  "name": "@wix/stores",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    "./plugin.yaml": "./plugin.yaml",
    "./contracts/*.jay-contract": "./contracts/*.jay-contract",
    "./components/*": "./dist/components/*.js"
  }
}
```

**Note:** Contract files (.jay-contract) should be included in your published package, not just the compiled TypeScript. Jay-stack needs the YAML contract files at build time.

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

### 1. Do we need the `module` field for local plugins?

**Current proposal:**
```yaml
# Local plugin in src/plugins/my-plugin/plugin.yaml
name: my-plugin
module: my-plugin  # ❓ Is this needed?
```

**Options:**
- **A)** Make `module` optional for local plugins, use `name` as module identifier
- **B)** Require `module` always (for consistency)
- **C)** Remove `module` entirely, just use `name` everywhere

**Recommendation:** Option A - `module` is optional, defaults to `name` if not specified

### 2. NPM Package Structure - What should package.json look like?

**Contracts as files via exports:**
```json
{
  "name": "@wix/stores",
  "version": "1.0.0",
  "exports": {
    "./plugin.yaml": "./plugin.yaml",
    "./contracts/*": "./dist/contracts/*",
    "./components/*": "./dist/components/*.js"
  }
}
```

**OR contracts as TypeScript types only?**
```json
{
  "name": "@wix/stores",
  "exports": {
    "./plugin.yaml": "./plugin.yaml",
    ".": "./dist/index.js"
  }
}
```

Then plugin.yaml references named exports:
```yaml
contracts:
  - name: product-list
    contract: "productListContract"  # Named export from main module
    implementation: "productList"
```

**Which approach?**

### 3. How do users specify which version of a plugin to use?

Since we removed `version` from plugin.yaml:

```bash
# Standard NPM versioning
npm install @wix/stores@1.2.3
```

But what if they want to use a specific contract version?

**Options:**
- **A)** Version is purely package-level (use package.json version)
- **B)** Support contract-level versioning in plugin.yaml
- **C)** Use multiple plugins with different names for breaking changes

**Question:** Should major contract changes be separate plugins (e.g., `@wix/stores-v2`) or same plugin with versioned contracts?

### 4. Path Resolution - Support both formats?

**Format 1: Relative file paths (for local development)**
```yaml
contracts:
  - name: product-list
    contract: ./contracts/product-list.jay-contract
    implementation: ./components/product-list.ts
```

**Format 2: Package exports (for NPM)**
```yaml
contracts:
  - name: product-list
    contract: "./contracts/product-list.jay-contract"  # Resolved via exports
    implementation: "./components/product-list"         # Resolved via exports
```

**Question:** Are these the same format, or do we need different syntax? Can we auto-detect based on whether it's an NPM package or local plugin?

### 5. Can contracts reference other plugin's contracts?

**Example:**
```yaml
# plugin: wix-stores
contracts:
  - name: shopping-cart
    contract: ./contracts/cart.jay-contract
```

```yaml
# cart.jay-contract
name: ShoppingCart
tags:
  - tag: items
    type: subcontract
    link: plugin:wix-stores/product-list  # ❓ Reference another contract in same plugin
    repeated: true
    
  - tag: payment
    type: subcontract
    link: plugin:wix-payments/payment-form  # ❓ Reference contract from different plugin
```

**Should we support:**
- ✅ Contracts referencing other contracts in same plugin?
- ❓ Contracts referencing contracts from other plugins (plugin dependencies)?

### 6. Plugin initialization and configuration?

Some plugins might need configuration:

```yaml
# In project's config or .env
WIX_STORES_API_KEY=abc123
WIX_STORES_SHOP_ID=my-shop
```

**Should plugin.yaml declare required config?**
```yaml
name: wix-stores
module: "@wix/stores"
config:
  - name: API_KEY
    env: WIX_STORES_API_KEY
    required: true
  - name: SHOP_ID
    env: WIX_STORES_SHOP_ID
    required: true
```

**Or leave config to runtime only?**

### 7. When do dynamic contracts get generated?

**Options:**
- **A)** During `jay build` (compile time)
- **B)** During `jay dev` startup (dev server init)
- **C)** On-demand when first referenced
- **D)** Explicitly via `jay generate-contracts`

**Follow-up:** Where are generated contracts stored?
- In memory only?
- Cached in `node_modules/.cache/jay/`?
- Committed to repo in `src/generated/`?

### 8. Error handling for missing contracts?

```html
<script 
  type="application/jay-headless"
  plugin="wix-stores"
  contract="nonexistent-contract"
  key="data"
></script>
```

**What should happen?**
- Compile-time error (prevent build)
- Warning with type `unknown`
- Auto-generate empty contract

### 9. Should plugin.yaml support contract overrides?

Allow projects to override plugin contracts:

```yaml
# In project's src/plugins/wix-stores-overrides/plugin.yaml
name: wix-stores
module: "@wix/stores"
override: true  # Extends/overrides original plugin

contracts:
  - name: product-list
    contract: ./my-custom-product-list.jay-contract  # Override
```

**Use cases:**
- Customize third-party plugin contracts
- Add extra fields
- Change phase annotations

**Risk:** Could break plugin implementations

### 10. Should we support TypeScript for plugin.yaml?

Instead of YAML, use TypeScript with type checking:

```typescript
// plugin.config.ts
import { definePlugin } from '@jay-framework/plugin-api';

export default definePlugin({
  name: 'wix-stores',
  module: '@wix/stores',
  contracts: [
    {
      name: 'product-list',
      contract: './contracts/product-list.jay-contract',
      implementation: './components/product-list'
    }
  ]
});
```

**Benefits:**
- Type checking
- IDE autocomplete
- Can compute contract list dynamically

**Drawbacks:**
- Requires compilation
- More complex tooling

### 11. How to handle contract file extensions in imports?

```typescript
// Option A: With extension
import { productListContract } from '@wix/stores/contracts/product-list.jay-contract';

// Option B: Without extension  
import { productListContract } from '@wix/stores/contracts/product-list';

// Option C: From main export
import { productListContract } from '@wix/stores';
```

**Which pattern should we document/recommend?**

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

