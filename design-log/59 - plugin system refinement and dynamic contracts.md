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
  component: ./components/cms-collection        # Shared component for all dynamic contracts
  generator: ./generators/cms-contracts.ts      # Path to generator function
  prefix: "cms"                                 # Namespace prefix
```

**Key Fields:**

- **`name`**: Plugin identifier (must be unique in project)
- **`module`**: NPM package name for Node.js resolution
- **`contracts`**: Static list of exposed contracts (most common)
- **`dynamic_contracts`**: Optional generator for dynamic contracts
- **`contract`**: Path to `.jay-contract` file (see Path Resolution below)
- **`component`**: Path to TypeScript/JavaScript implementation (see Path Resolution below)
- **For dynamic contracts**: All generated contracts share the same `component` implementation. The component receives contract metadata as props to determine which contract instance it's handling.

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

**Key Concepts:**
1. **Shared Component**: All dynamic contracts use the **same component implementation**
2. **Contract as Service**: The component receives the full contract instance via a service (server-only)
3. **Automatic Naming Prefix**: Dynamic contracts use a prefix (e.g., `cms/collection-name`) to distinguish them from static contracts
4. **Use Cases**: CMS collections, multi-lingual variants, A/B test variants, tenant-specific schemas

#### Generator Function Signature with Builder API

Generators can access services (like database connections, API clients) using a builder pattern similar to `init.ts`:

```typescript
// generators/cms-contracts.ts
import { Contract } from '@jay-framework/compiler-shared';
import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { CMS_SERVICE } from '../services/cms-service';

export const generator = makeContractGenerator()
  .withServices(CMS_SERVICE)
  .generate(async (services) => {
    const cms = services[CMS_SERVICE];
    
    // Connect to CMS and read schema
    const collections = await cms.getCollections();
    
    // Return array of contracts
    return collections.map(collection => 
      generateContractFromSchema(collection)
    );
  });
```

**Why a builder API?**

- **Service injection**: Generator needs access to services (DB, API clients, credentials)
- **Consistent pattern**: Same pattern as `init.ts` and page components
- **Type safety**: Services are properly typed
- **Testability**: Can mock services in tests

**Builder API:**

```typescript
// @jay-framework/fullstack-component

export interface ContractGeneratorBuilder<Services extends ServiceMarkers> {
  withServices<NewServices extends ServiceMarkers>(
    ...services: NewServices
  ): ContractGeneratorBuilder<Services & NewServices>;
  
  generate(
    fn: (services: ServiceInstances<Services>) => Promise<Contract[]> | Contract[]
  ): DynamicContractGenerator;
}

export function makeContractGenerator(): ContractGeneratorBuilder<{}> {
  // Implementation
}
```

**Simple generators without services:**

```typescript
// generators/simple-generator.ts
import { makeContractGenerator } from '@jay-framework/fullstack-component';

export const generator = makeContractGenerator()
  .generate(async () => {
    // No services needed
    return [
      { name: 'StaticContract1', tags: [...] },
      { name: 'StaticContract2', tags: [...] },
    ];
  });
```

#### Component Implementation for Dynamic Contracts

The shared component receives the **full contract instance** via a special service marker:

```typescript
// components/cms-collection.ts
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import { DYNAMIC_CONTRACT_SERVICE } from '@jay-framework/fullstack-component';
import { Contract } from '@jay-framework/compiler-shared';
import { connectToCMS } from '../lib/cms-client';

// No special props needed - contract comes via service
export const cmsCollection = makeJayStackComponent<DynamicContract>()
  .withServices(DYNAMIC_CONTRACT_SERVICE)  // Get contract instance as service
  .withFastRender(async (props, contract: Contract) => {
    const cms = await connectToCMS();
    
    // Use contract.name to determine which collection to query
    // contract.name is the full dynamic contract name (e.g., "BlogPostsList")
    const collectionName = deriveCollectionName(contract.name);
    const items = await cms.query(collectionName);
    
    return partialRender({ items }, {});
  });

function deriveCollectionName(contractName: string): string {
  // "BlogPostsList" → "blog-posts"
  return contractName.replace(/List$/, '').replace(/([A-Z])/g, '-$1').toLowerCase().slice(1);
}
```

**Why use a service instead of props?**

- **Services are server-only** - Contract instance doesn't need to go to client
- **Compile-time resolution** - Contract is resolved at build time, not runtime
- **Type safety** - Service marker ensures proper typing
- **Clean separation** - Props for runtime data, services for build/server context

**Service Marker:**

```typescript
// @jay-framework/fullstack-component
export const DYNAMIC_CONTRACT_SERVICE = createJayService('DynamicContract');
```

#### Automatic Naming Prefix for Dynamic Contracts

**Problem:** When parsing jay-html, how do we know if `contract="products-list"` is static or dynamic?

**Solution:** Dynamic contracts automatically get a prefix based on the plugin's dynamic contract configuration.

**In plugin.yaml:**

```yaml
name: my-cms
module: "@mycompany/cms-plugin"

dynamic_contracts:
  prefix: "cms"                                 # Automatic prefix for all dynamic contracts
  component: ./components/cms-collection
  generator: ./generators/collections-generator.ts
```

**Generated contracts automatically prefixed:**

```typescript
// Generator returns contracts with names like: "BlogPosts", "Products", "Authors"
export const generator = {
  async generate() {
    const collections = await getCollections();
    return collections.map(col => ({
      name: `${toPascalCase(col.name)}List`,  // e.g., "BlogPostsList"
      tags: [...]
    }));
  }
};
```

**Framework adds prefix automatically:**

When loading dynamic contracts, the framework prepends the prefix:
- Generator produces: `BlogPostsList`
- Framework registers as: `cms/BlogPostsList`

**Usage in jay-html:**

```html
<script 
  type="application/jay-headless"
  plugin="my-cms"
  contract="cms/blog-posts-list"
  key="blogPosts"
></script>

<script 
  type="application/jay-headless"
  plugin="my-cms"
  contract="cms/products-list"
  key="products"
></script>
```

**Benefits:**

1. **Clear distinction** - `cms/` prefix makes it obvious it's a dynamic contract
2. **Namespace isolation** - Avoids collisions between static and dynamic contracts
3. **Plugin organization** - Multiple dynamic contract generators can have different prefixes
4. **Type safety** - Compiler can validate the prefix matches the plugin's dynamic_contracts configuration

**Static contracts don't need prefix:**

```html
<script 
  type="application/jay-headless"
  plugin="wix-stores"
  contract="product-list"
  key="products"
></script>
```

**Resolution Logic:**

```typescript
function resolveContract(pluginManifest: PluginManifest, contractName: string) {
  // Check if contract name has a prefix
  const prefix = pluginManifest.dynamic_contracts?.prefix;
  
  if (prefix && contractName.startsWith(`${prefix}/`)) {
    // Dynamic contract
    const actualName = contractName.slice(prefix.length + 1);
    return findDynamicContract(pluginManifest, actualName);
  } else {
    // Static contract
    return findStaticContract(pluginManifest, contractName);
  }
}
```

#### Using Dynamic Contracts

Once generated, they're used with the automatic prefix:

```html
<!-- In page.jay-html -->
<script 
  type="application/jay-headless"
  plugin="my-cms"
  contract="cms/blog-posts-list"
  key="blogPosts"
></script>

<script 
  type="application/jay-headless"
  plugin="my-cms"
  contract="cms/products-list"
  key="products"
></script>
```

**Both contracts use the same component** (`cms-collection`), but receive different contract instances via the `DYNAMIC_CONTRACT_SERVICE`.

**Build-time behavior:**
1. During `jay-stack build`, framework loads `init.ts` to initialize services
2. Framework calls generator with injected services: `generator.generate(services)`
3. Generated contracts (Contract[]) are validated
4. Framework adds automatic prefix to each contract name (e.g., `cms/BlogPostsList`)
5. All contracts are linked to the shared component specified in `dynamic_contracts.component`
6. Contracts become available for type-checking and compilation
7. At runtime, component receives full contract instance via `DYNAMIC_CONTRACT_SERVICE`

## What Plugin Developers Need to Do

### Creating a Static Plugin

1. **Create plugin.yaml**
   ```yaml
   name: my-plugin
   module: "@mycompany/my-plugin"
   contracts:
     - name: my-component
       contract: ./contracts/my-component.jay-contract
       component: ./components/my-component.ts
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
     prefix: "cms"                               # Namespace prefix
     component: ./components/cms-collection      # Shared component
     generator: ./generators/cms-generator.ts
   ```

2. **Implement shared component with service**
   ```typescript
   // components/cms-collection.ts
   import { DYNAMIC_CONTRACT_SERVICE, createJayService } from '@jay-framework/fullstack-component';
   
   export const cmsCollection = makeJayStackComponent<DynamicContract>()
     .withServices(DYNAMIC_CONTRACT_SERVICE)
     .withFastRender(async (props, contract: Contract) => {
       // contract.name contains full contract info
       const items = await fetchCollection(contract);
       return partialRender({ items }, {});
     });
   ```

3. **Implement generator with builder API**
   ```typescript
   // generators/cms-generator.ts
   import { makeContractGenerator } from '@jay-framework/fullstack-component';
   import { CMS_SERVICE } from '../services/cms-service';
   
   export const generator = makeContractGenerator()
     .withServices(CMS_SERVICE)
     .generate(async (services) => {
       const cms = services[CMS_SERVICE];
       const collections = await cms.getCollections();
       return collections.map(col => ({
         name: `${toPascalCase(col.name)}List`,
         tags: [/* ... */]
       }));
     });
   ```

4. **Configure services in project's `init.ts`**
   ```typescript
   // src/init.ts
   import { CMS_SERVICE } from '@mycompany/cms-plugin/services';
   
   export const init = initServer()
     .withService(CMS_SERVICE, () => new CMSClient({ /* ... */ }));
   ```

5. **Generator runs at build time**, framework loads `init.ts`, injects services, and adds prefix automatically (`cms/blog-posts-list`)

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
# Create plugin.yaml, contracts, components in that folder
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

#### Implementation Note: Plugin Resolution During jay-html Compilation

When the jay-html parser encounters a headless component reference, it must perform a **two-step resolution process**:

**Step 1: Load plugin.yaml** - Find and parse the plugin manifest

```typescript
// Resolution order:
// 1. src/plugins/<plugin-name>/plugin.yaml (local plugins)
// 2. node_modules/<plugin-name>/plugin.yaml (npm packages)

const pluginPath = resolvePlugin(pluginName, projectRoot);
const pluginManifest = await loadPluginManifest(pluginPath);
```

**Step 2: Resolve contract and component locations** - Look up paths in plugin manifest

```typescript
// Find contract definition in plugin.contracts or dynamic_contracts
const contractDef = findContractInPlugin(pluginManifest, contractName);

// Resolve contract file path (for type generation)
const contractPath = resolveFromPlugin(pluginManifest, contractDef.contract);

// Resolve component file path (for runtime import)
// For static contracts: use contractDef.component
// For dynamic contracts: use pluginManifest.dynamic_contracts.component
const componentPath = resolveFromPlugin(pluginManifest, contractDef.component);
```

**Step 3: Generate imports** - Create proper import statements for the page component

```typescript
// Contract import for type generation
import { ProductListContract } from '@wix/stores/contracts/product-list.jay-contract';

// Component import (server-side)
import { productList } from '@wix/stores';  // → dist/index.js

// Component import (client-side, generated by jay-stack)
import { productList } from '@wix/stores/client';  // → dist/index.client.js
```

**Key Changes from Current Implementation:**

- **Old:** Direct file path resolution based on `src` attribute
- **New:** Two-step resolution: plugin.yaml lookup → contract/component path resolution
- **Impact:** Parser now depends on plugin discovery and manifest loading
- **Benefit:** Decouples pages from plugin internals, enables plugin refactoring without breaking consumers

**Error Handling:**

```typescript
// Plugin not found
if (!pluginExists) {
  throw new CompilationError(
    `Plugin '${pluginName}' not found. Install with: npm install ${pluginName}`
  );
}

// Contract not found in plugin
if (!contractDef) {
  const availableContracts = listAvailableContracts(pluginManifest);
  throw new CompilationError(
    `Contract '${contractName}' not found in plugin '${pluginName}'. ` +
    `Available contracts: ${availableContracts.join(', ')}`
  );
}

// Component file not found
if (!fs.existsSync(componentPath)) {
  throw new CompilationError(
    `Component file not found: ${contractDef.component} ` +
    `(referenced in ${pluginName}/plugin.yaml)`
  );
}

// Contract file not found
if (!fs.existsSync(contractPath)) {
  throw new CompilationError(
    `Contract file not found: ${contractDef.contract} ` +
    `(referenced in ${pluginName}/plugin.yaml)`
  );
}
```

**Compilation Performance:**

To avoid repeated plugin.yaml loading during compilation:

```typescript
// Cache plugin manifests during compilation session
const pluginCache = new Map<string, PluginManifest>();

async function getPlugin(name: string, projectRoot: string): Promise<PluginManifest> {
  if (!pluginCache.has(name)) {
    const manifest = await loadPluginManifest(name, projectRoot);
    pluginCache.set(name, manifest);
  }
  return pluginCache.get(name)!;
}

// Clear cache when file system changes (dev mode)
function clearPluginCache(): void {
  pluginCache.clear();
}
```

**Implementation Location:**

- Parser updates: `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-parser.ts`
- Plugin loading: `packages/jay-stack/stack-cli/lib/plugin-loader.ts` (new file)
- Resolution helpers: Shared utility functions for consistent resolution across compiler and runtime

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
      contracts.push({ 
        ...contractDef, 
        contract,
        component: contractDef.component 
      });
    }
  }
  
  // Load dynamic contracts
  if (plugin.dynamic_contracts) {
    const generatorPath = resolveFromPlugin(
      plugin, 
      plugin.dynamic_contracts.generator
    );
    const generator = await import(generatorPath);
    const generatedContracts: Contract[] = await generator.generator.generate();
    
    // All dynamic contracts share the same component
    const sharedComponent = plugin.dynamic_contracts.component;
    const prefix = plugin.dynamic_contracts.prefix;
    
    for (const contract of generatedContracts) {
      contracts.push({
        name: `${prefix}/${toKebabCase(contract.name)}`,  // Add prefix
        contract,
        component: sharedComponent,  // Use shared component
      });
    }
  }
  
  return contracts;
}

function toKebabCase(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1);
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
  component: string;          // Path to component (resolved via package exports or relative path)
  description?: string;
}

export interface DynamicContractDef {
  prefix: string;                 // Namespace prefix for dynamic contracts (e.g., "cms")
  component: string;              // Path to shared component for all dynamic contracts
  generator: string;              // Path to generator
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
    component: ./components/product-list
```

**Key changes:**
- Removed `pages`/`components` nesting
- Removed `version` (use package.json version)
- Removed `key` from contract definition (specified at usage site)
- Changed `implementation` → `component` (clearer semantics)
- `component` path added (for ES module import)

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

dynamic_contracts:
  prefix: "cms"                                 # Namespace for dynamic contracts
  component: ./components/cms-collection        # Shared component for all collections
  generator: ./generators/collections-generator.ts
```

### collections-generator.ts

```typescript
import { makeContractGenerator } from '@jay-framework/fullstack-component';
import { Contract } from '@jay-framework/compiler-shared';
import { CMS_SERVICE } from '../services/cms-service';

export const generator = makeContractGenerator()
  .withServices(CMS_SERVICE)
  .generate(async (services) => {
    const cms = services[CMS_SERVICE];
    
    // Get all collections from CMS
    const collections = await cms.getCollections();
    
    // Generate contract for each collection
    return collections.map(collection => {
      const contract: Contract = {
        name: `${toPascalCase(collection.name)}List`,  // e.g., "BlogPostsList"
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
      
      return contract;
    });
  });

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

function toPascalCase(str: string): string {
  return str.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}
```

### Usage in Project

**1. Install plugin:**
```bash
npm install @mycompany/cms-plugin
```

**2. Configure services in `init.ts`:**
```typescript
// src/init.ts
import { CMS_SERVICE } from '@mycompany/cms-plugin/services';
import { CMSClient } from '@mycompany/cms-plugin/client';

export const init = initServer()
  .withService(CMS_SERVICE, () => {
    return new CMSClient({
      apiUrl: process.env.CMS_API_URL,
      apiKey: process.env.CMS_API_KEY
    });
  });
```

**3. Set environment variables:**
```bash
export CMS_API_URL="https://my-cms.com/api"
export CMS_API_KEY="secret-key"
```

**4. Build - contracts are generated automatically:**
```bash
jay-stack build
```

**Generated contracts are available:**

```html
<!-- page.jay-html -->
<script 
  type="application/jay-headless"
  plugin="my-cms"
  contract="cms/blog-posts-list"
  key="blogPosts"
></script>

<script 
  type="application/jay-headless"
  plugin="my-cms"
  contract="cms/products-list"
  key="products"
></script>
```

All with full type safety and IDE autocomplete! Both use the same `cms-collection` component but with different contract instances passed via service.

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
**Answer:** agree with recommendation

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
    component: "productList"
```

**Which approach?**
**Answer:** I think the second does not work, as NPM does not let us require files that are not exported.

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
**Answer:** we should use the NPM version mechanism, at least until we find really good requirements for something else.

### 4. Path Resolution - Support both formats?

**Format 1: Relative file paths (for local development)**
```yaml
contracts:
  - name: product-list
    contract: ./contracts/product-list.jay-contract
    component: ./components/product-list.ts
```

**Format 2: Package exports (for NPM)**
```yaml
contracts:
  - name: product-list
    contract: "./contracts/product-list.jay-contract"  # Resolved via exports
    component: "./components/product-list"              # Resolved via exports
```

**Question:** Are these the same format, or do we need different syntax? Can we auto-detect based on whether it's an NPM package or local plugin?
**Answer:** we can auto detect. There is something nice in the fact that the path are relative to the plugin.yaml.
however, for NPM, we also need to validate the contract files are exported from the package,  
and that the component files are exported from the package main module

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

**Answer:** I think we should, and mandate that there is an NPM dependency between the two plugin packages

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
**Answer:** we use the init.js and services pattern for plugin initialization.
the plugin needs to document what configuration it needs and how to activate it from the init.js file

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

**Answer:**
during development - at the time of jay dev startup.
during production - dynamic contract change is a classic slow changing data, and we will need to build 
a mechanism that can accept a signal from the source system (CMS) about a change and trigger a refresh of the 
contracts. we will need to design this system at a later time.

regarding storage, for development we do not need to store generated contracts. 
for production, all slowly rendered data needs to be stored, and this storage system is yet to be defined.

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

**Answer:** compile time error

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

**Risk:** Could break plugin components

**Answer:** I do not think so. 
Jay support extension using a close / open principle - a page can have a page contract in addition to 
importing a contract, and the visual page can use the page contract tags instead of the imported contract tags. 

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
      component: './components/product-list'
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
  
**Answer:** I think for now it is an overkill

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

**Answer:** right now we are using the first pattern, with the `.jay-contract` suffix, which is used by the compiler 
to turn the contract file to a TS file.

## Next Steps

1. **Update editor-handlers.ts** - Add plugin scanning and dynamic contract support
2. **Update jay-html parser** - Support `plugin`/`contract` attributes
3. **Create plugin API package** - Export types for plugin developers
4. **Implement migration tool** - `jay migrate plugin-config`
5. **Update documentation** - Plugin development guide
6. **Create example plugins** - Static and dynamic examples
7. **Add validation** - Ensure contracts referenced exist
8. **Create plugin validation tool** - `jay validate-plugin`

## Plugin Validation Tool

### Overview

A validation tool integrated into `jay-stack-cli` to help plugin developers ensure their plugins are correctly structured before publishing or during development.

**Target Users:** Plugin developers (not app developers)

**Two Validation Modes:**
1. **Package mode**: Validate an NPM plugin package (published or ready to publish)
2. **Local mode**: Validate plugins in `src/plugins/` during development

### CLI Integration

**Update to jay-stack-cli structure:**

Current command `jay-stack` becomes `jay-stack dev`, and we add new validation commands:

```bash
# Development server (existing functionality)
jay-stack dev
jay-stack dev --port 3000

# Plugin validation (new functionality)
jay-stack validate-plugin              # Validate current directory as plugin package
jay-stack validate-plugin ./my-plugin  # Validate specific plugin package
jay-stack validate-plugin --local      # Validate src/plugins/ in current project

# Combined validation and generation
jay-stack validate-plugin --generate-types  # Also generate .d.ts files
```

**Implementation uses Commander package** (already used by jay-stack-cli)

### Validation Package Structure

Create new package: `@jay-framework/plugin-validator`

```
packages/jay-stack/plugin-validator/
├── lib/
│   ├── index.ts                    # Main validator export
│   ├── validate-plugin.ts          # Core validation logic
│   ├── validate-package.ts         # NPM package validation
│   ├── validate-local.ts           # Local src/plugins/ validation
│   ├── validators/
│   │   ├── schema-validator.ts     # plugin.yaml schema
│   │   ├── contract-validator.ts   # Contract file validation
│   │   ├── component-validator.ts  # Component file validation
│   │   └── package-validator.ts    # package.json validation
│   └── utils/
│       ├── contract-generator.ts   # Uses jay-cli definitions
│       └── error-formatter.ts      # Pretty error messages
├── package.json
└── tsconfig.json
```

**Reuses existing tools:**
- `@jay-framework/compiler-jay-html` - For contract parsing
- `jay-cli definitions` - For generating and validating .d.ts files
- `@jay-framework/compiler-shared` - For types and utilities

### Command

```bash
# Validate NPM plugin package (current directory)
jay-stack validate-plugin

# Validate specific plugin package directory
jay-stack validate-plugin ./my-plugin

# Validate local plugins in src/plugins/
jay-stack validate-plugin --local

# Validate with verbose output
jay-stack validate-plugin --verbose

# Generate .d.ts files during validation
jay-stack validate-plugin --generate-types

# CI mode (exit code 1 on any error)
jay-stack validate-plugin --strict
```

### Validation Checks

#### 1. **plugin.yaml Schema Validation**

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  type: 'schema' | 'file-missing' | 'export-mismatch' | 'contract-invalid';
  message: string;
  location?: string;  // File path or YAML path
  suggestion?: string;
}
```

**Checks:**
- ✅ plugin.yaml exists
- ✅ Valid YAML syntax
- ✅ Required fields present (`name`, `contracts` or `dynamic_contracts`)
- ✅ Field types correct (strings, arrays, objects)
- ✅ No unknown fields (warn only)
- ✅ `module` field matches package.json `name` (for NPM packages)

**Example errors:**
```
❌ Error: plugin.yaml not found
❌ Error: Invalid YAML syntax at line 5
❌ Error: Missing required field 'name'
❌ Error: Field 'contracts' must be an array
⚠️  Warning: Unknown field 'version' - use package.json version instead
```

#### 2. **Contract File Validation**

**Checks:**
- ✅ All referenced contract files exist
- ✅ Contract files are valid `.jay-contract` files (YAML syntax)
- ✅ Contract files can be parsed without errors (uses `@jay-framework/compiler-jay-html`)
- ✅ Contract names in files match declared names (PascalCase matching)
- ✅ **Generate `.d.ts` files** using `jay-cli definitions` command
- ✅ For NPM packages: contract paths resolve via package.json exports
- ✅ For NPM packages: contract files are exported in package.json

**Example errors:**
```
❌ Error: Contract file not found: ./contracts/product-list.jay-contract
   Referenced in: contracts[0]
   
❌ Error: Contract file invalid: ./contracts/cart.jay-contract
   Parse error: Invalid YAML syntax at line 12
   
❌ Error: Contract name mismatch
   Declared: "product-list"
   Contract file name: "ProductList"
   File: ./contracts/product-list.jay-contract
   
❌ Error: Contract file not exported in package.json
   File: ./contracts/product-list.jay-contract
   Add to exports: "./contracts/*.jay-contract": "./dist/contracts/*.jay-contract"
   
✅ Success: Generated type definitions for 3 contracts
   - dist/contracts/product-list.jay-contract.d.ts
   - dist/contracts/product-detail.jay-contract.d.ts
   - dist/contracts/cart.jay-contract.d.ts
```

**Type Generation Integration:**

When `--generate-types` flag is used, the validator:
1. Finds all contract files
2. Calls `jay-cli definitions` for each contract
3. Validates generated types compile without errors
4. Reports any type generation failures

#### 3. **Component File Validation**

**Checks:**
- ✅ All referenced component files exist
- ✅ Component files are valid TypeScript/JavaScript (syntax check)
- ✅ Component exports expected identifiers (static analysis)
- ✅ For NPM packages: component paths resolve via package.json exports
- ✅ For NPM packages: components are exported from main module (`dist/index.js`)
- ✅ For dual builds: both `index.js` and `index.client.js` exist in dist/

**Example errors:**
```
❌ Error: Component file not found: ./components/product-list.ts
   Referenced in: contracts[0].component
   
❌ Error: Component not exported from main module
   Component: ./components/product-list
   Expected in: dist/index.js
   Suggestion: Add export in lib/index.ts
   
⚠️  Warning: Missing client build
   Found: dist/index.js
   Missing: dist/index.client.js
   Run: npm run build:client
   
⚠️  Warning: Component file has no default or named export matching contract name
   File: ./components/product-list.ts
   Expected export: productList
```

#### 4. **Package.json Validation** (NPM packages only)

**Checks:**
- ✅ package.json exists
- ✅ `name` field matches plugin.yaml `module`
- ✅ `type: "module"` is set
- ✅ `exports` field includes plugin.yaml
- ✅ `exports` field includes contract paths
- ✅ `exports` field includes component paths (both server and client)
- ✅ `files` field includes dist/ and plugin.yaml
- ✅ Build scripts exist for dual builds

**Example errors:**
```
❌ Error: package.json not found
   
❌ Error: Package name mismatch
   package.json: "@wix/stores"
   plugin.yaml module: "@wix/store"
   
❌ Error: Missing package.json exports
   Required: "./plugin.yaml": "./plugin.yaml"
   
⚠️  Warning: Missing "type": "module" in package.json
   
⚠️  Warning: Missing dual build scripts
   Add: "build:client": "vite build"
   Add: "build:server": "vite build --ssr"
```

#### 5. **Dynamic Contract Validation**

**Checks:**
- ✅ Generator file exists
- ✅ Generator exports valid interface
- ✅ Generator can be imported (syntax check)
- ⚠️  Generator execution (optional, may require env vars)

**Example errors:**
```
❌ Error: Generator file not found: ./generators/cms-generator.ts
   Referenced in: dynamic_contracts.generator
   
❌ Error: Generator file has syntax errors
   File: ./generators/cms-generator.ts
   Error: Unexpected token at line 15
   
⚠️  Warning: Generator export validation skipped
   Set environment variables to test generator execution
```

#### 6. **File Structure Validation**

**Checks:**
- ✅ Recommended directory structure
- ✅ No conflicting files
- ✅ Contract files in consistent location
- ✅ Component files in consistent location

**Example warnings:**
```
⚠️  Warning: Contracts not in recommended location
   Found: ./product-list.jay-contract
   Recommended: ./contracts/product-list.jay-contract
   
⚠️  Warning: Mixed contract locations
   Some in ./contracts/, some in root
   Consider organizing all contracts in ./contracts/
```

### Implementation

**New Package: `@jay-framework/plugin-validator`**

Location: `packages/jay-stack/plugin-validator/`

**Package structure:**
```
packages/jay-stack/plugin-validator/
├── lib/
│   ├── index.ts                    # Main validator export
│   ├── validate-plugin.ts          # Core validation orchestrator
│   ├── validate-package.ts         # NPM package validation
│   ├── validate-local.ts           # Local src/plugins/ validation
│   ├── output-formatter.ts         # Pretty error/success output
│   └── validators/
│       ├── schema-validator.ts     # plugin.yaml schema validation
│       ├── contract-validator.ts   # Contract file validation + type gen
│       ├── component-validator.ts  # Component file validation
│       └── package-validator.ts    # package.json validation
├── package.json
└── tsconfig.json
```

**Reuses existing tools:**
- `@jay-framework/compiler-jay-html` - For contract parsing
- `jay-cli definitions` - For generating and validating .d.ts files
- `@jay-framework/compiler-shared` - For types and utilities
- `commander` - CLI framework (via jay-stack-cli)

**Package dependencies:**
```json
{
  "name": "@jay-framework/plugin-validator",
  "dependencies": {
    "@jay-framework/compiler-jay-html": "workspace:^",
    "@jay-framework/compiler-shared": "workspace:^",
    "yaml": "^2.3.4",
    "chalk": "^5.3.0"
  }
}
```

**Used by jay-stack-cli:**
```json
// packages/jay-stack/stack-cli/package.json
{
  "dependencies": {
    "@jay-framework/plugin-validator": "workspace:^",
    "commander": "^11.1.0"
  }
}
```
  const pluginPath = options.pluginPath || process.cwd();
  const verbose = options.verbose || false;
  const strict = options.strict || false;
  
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };
  
  // 1. Load and validate plugin.yaml
  const pluginYamlPath = path.join(pluginPath, 'plugin.yaml');
  if (!fs.existsSync(pluginYamlPath)) {
    result.errors.push({
      type: 'file-missing',
      message: 'plugin.yaml not found',
      location: pluginPath,
      suggestion: 'Create a plugin.yaml file in the plugin root directory',
    });
    result.valid = false;
    return result;
  }
  
  // Parse plugin.yaml
  let pluginManifest: PluginManifest;
  try {
    const yamlContent = fs.readFileSync(pluginYamlPath, 'utf-8');
    pluginManifest = YAML.parse(yamlContent);
  } catch (error) {
    result.errors.push({
      type: 'schema',
      message: `Invalid YAML syntax: ${error.message}`,
      location: pluginYamlPath,
    });
    result.valid = false;
    return result;
  }
  
  // 2. Schema validation
  validateSchema(pluginManifest, pluginYamlPath, result);
  
  // 3. Contract file validation
  if (pluginManifest.contracts) {
    for (let i = 0; i < pluginManifest.contracts.length; i++) {
      validateContract(pluginManifest.contracts[i], i, pluginPath, result);
    }
  }
  
  // 4. Component file validation
  if (pluginManifest.contracts) {
    for (let i = 0; i < pluginManifest.contracts.length; i++) {
      validateComponent(pluginManifest.contracts[i], i, pluginPath, result);
    }
  }
  
  // 5. Package.json validation (if NPM package)
  const packageJsonPath = path.join(pluginPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    validatePackageJson(pluginManifest, pluginPath, result);
  }
  
  // 6. Dynamic contracts validation
  if (pluginManifest.dynamic_contracts) {
    validateDynamicContracts(pluginManifest.dynamic_contracts, pluginPath, result);
  }
  
  // 7. File structure validation
  validateFileStructure(pluginPath, result);
  
  // Final result
  result.valid = result.errors.length === 0;
  
  return result;
}

function validateSchema(
  manifest: PluginManifest,
  location: string,
  result: ValidationResult
): void {
  // Check required fields
  if (!manifest.name) {
    result.errors.push({
      type: 'schema',
      message: "Missing required field 'name'",
      location,
    });
  }
  
  if (!manifest.contracts && !manifest.dynamic_contracts) {
    result.errors.push({
      type: 'schema',
      message: "Plugin must have either 'contracts' or 'dynamic_contracts'",
      location,
    });
  }
  
  // Check for deprecated fields
  if ((manifest as any).version) {
    result.warnings.push({
      type: 'schema',
      message: "Field 'version' is deprecated - use package.json version instead",
      location,
      suggestion: 'Remove version from plugin.yaml',
    });
  }
  
  // Validate contracts array
  if (manifest.contracts && !Array.isArray(manifest.contracts)) {
    result.errors.push({
      type: 'schema',
      message: "Field 'contracts' must be an array",
      location,
    });
  }
}

function validateContract(
  contract: StaticContractDef,
  index: number,
  pluginPath: string,
  result: ValidationResult
): void {
  const contractPath = path.join(pluginPath, contract.contract);
  
  // Check file exists
  if (!fs.existsSync(contractPath)) {
    result.errors.push({
      type: 'file-missing',
      message: `Contract file not found: ${contract.contract}`,
      location: `contracts[${index}]`,
      suggestion: `Create the contract file or update the path in plugin.yaml`,
    });
    return;
  }
  
  // Parse and validate contract
  try {
    const contractContent = fs.readFileSync(contractPath, 'utf-8');
    const contractData = YAML.parse(contractContent);
    
    // Validate contract name matches
    if (contractData.name && contractData.name !== toPascalCase(contract.name)) {
      result.warnings.push({
        type: 'schema',
        message: `Contract name mismatch`,
        location: contractPath,
        suggestion: `Contract file name should be '${toPascalCase(contract.name)}' or declare name: '${contract.name}' in plugin.yaml`,
      });
    }
  } catch (error) {
    result.errors.push({
      type: 'contract-invalid',
      message: `Invalid contract file: ${error.message}`,
      location: contractPath,
    });
  }
}

function validateComponent(
  contract: StaticContractDef,
  index: number,
  pluginPath: string,
  result: ValidationResult
): void {
  const componentPath = path.join(pluginPath, contract.component);
  
  // Try with .ts and .js extensions
  const possiblePaths = [
    componentPath,
    `${componentPath}.ts`,
    `${componentPath}.js`,
  ];
  
  const exists = possiblePaths.some(p => fs.existsSync(p));
  
  if (!exists) {
    result.errors.push({
      type: 'file-missing',
      message: `Component file not found: ${contract.component}`,
      location: `contracts[${index}].component`,
      suggestion: `Create the component file or update the path in plugin.yaml`,
    });
  }
}

function validatePackageJson(
  manifest: PluginManifest,
  pluginPath: string,
  result: ValidationResult
): void {
  const packageJsonPath = path.join(pluginPath, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  
  // Check module name matches
  if (manifest.module && packageJson.name !== manifest.module) {
    result.errors.push({
      type: 'schema',
      message: `Package name mismatch: package.json="${packageJson.name}", plugin.yaml module="${manifest.module}"`,
      location: packageJsonPath,
      suggestion: `Update module in plugin.yaml to match package.json name`,
    });
  }
  
  // Check type: module
  if (packageJson.type !== 'module') {
    result.warnings.push({
      type: 'schema',
      message: 'Missing "type": "module" in package.json',
      location: packageJsonPath,
      suggestion: 'Add "type": "module" to package.json',
    });
  }
  
  // Check exports include plugin.yaml
  if (!packageJson.exports || !packageJson.exports['./plugin.yaml']) {
    result.errors.push({
      type: 'export-mismatch',
      message: 'plugin.yaml not exported in package.json',
      location: packageJsonPath,
      suggestion: 'Add "./plugin.yaml": "./plugin.yaml" to exports',
    });
  }
  
  // Check dual builds exist
  const distPath = path.join(pluginPath, 'dist');
  if (fs.existsSync(distPath)) {
    const hasServerBuild = fs.existsSync(path.join(distPath, 'index.js'));
    const hasClientBuild = fs.existsSync(path.join(distPath, 'index.client.js'));
    
    if (!hasServerBuild) {
      result.warnings.push({
        type: 'file-missing',
        message: 'Server build not found: dist/index.js',
        location: distPath,
        suggestion: 'Run: npm run build:server',
      });
    }
    
    if (!hasClientBuild) {
      result.warnings.push({
        type: 'file-missing',
        message: 'Client build not found: dist/index.client.js',
        location: distPath,
        suggestion: 'Run: npm run build:client',
      });
    }
  }
}

function toPascalCase(str: string): string {
  return str.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}
```

### Validation Logic Overview

**Two modes:**

1. **Package mode** - Validates a plugin package (NPM or local development)
   - Load and parse `plugin.yaml`
   - Validate schema
   - Check all contract files exist and are valid
   - Generate `.d.ts` files (if `--generate-types` flag)
   - Check all component files exist
   - Validate `package.json` exports (if present)
   - Validate dynamic contract generator (if present)

2. **Local mode** (`--local`) - Validates all plugins in `src/plugins/`
   - Find all directories in `src/plugins/`
   - Run package validation on each
   - Aggregate results

**Contract validation with type generation:**
- Parse contract file using `@jay-framework/compiler-jay-html`
- Check for syntax errors
- If `--generate-types` flag: call `jay-cli definitions` command
- Track success/failure of type generation
- Report results

**Component validation:**
- Check file exists
- For NPM packages: verify component is exported from main module
- For NPM packages: verify dual builds exist (`index.js` and `index.client.js`)

**Package.json validation:**
- Verify contract files are exported
- Verify main module exports components
- Check for dual build configuration

### Output Format

**Success:**
```bash
$ jay-stack validate-plugin

✅ Plugin validation successful!

Plugin: wix-stores (@wix/stores)
  ✅ plugin.yaml valid
  ✅ 3 contracts validated
  ✅ 3 type definitions generated
  ✅ 3 components validated
  ✅ package.json valid
  ✅ Dual builds present
  
No errors found.
```

**With Warnings:**
```bash
$ jay-stack validate-plugin

⚠️  Plugin validation passed with warnings

Plugin: my-plugin
  ✅ plugin.yaml valid
  ✅ 2 contracts validated
  ⚠️  1 warning

Warnings:
  ⚠️  contracts/product.jay-contract: Contract name mismatch
      Expected: 'Product', Found: 'ProductList'
      
Use --strict to treat warnings as errors.
```

**With Errors:**
```bash
$ jay-stack validate-plugin

❌ Plugin validation failed

Plugin: my-plugin
  ❌ plugin.yaml invalid
  ❌ 1 contract missing
  ✅ 1 component validated
  
Errors:
  ❌ contracts[0]: Contract file not found: ./contracts/missing.jay-contract
      Location: contracts[0]
      → Create the contract file or update the path in plugin.yaml
      
  ❌ contracts[0].component: Component file not found: ./components/missing.ts
      Location: contracts[0].component
      → Create the component file or update the path in plugin.yaml

2 errors found.
```

**Local plugins validation:**
```bash
$ jay-stack validate-plugin --local

✅ Validated 2 local plugins in src/plugins/

Plugin: my-custom-plugin
  ✅ plugin.yaml valid
  ✅ 1 contract validated
  ✅ 1 component validated
  
Plugin: experimental-plugin
  ⚠️  1 warning
  
Warnings:
  ⚠️  Missing component implementation
      Contract: test-feature
      → Implement ./components/test-feature.ts
```

### Integration with jay-stack CLI

**Update CLI structure:**

1. Move existing dev server to `dev` subcommand
2. Add new `validate-plugin` command
3. Use Commander package for command handling

**CLI commands:**

```bash
# Development server (existing functionality)
jay-stack dev [path]
jay-stack dev --port 3000

# Plugin validation (new)
jay-stack validate-plugin [path]
jay-stack validate-plugin --local
jay-stack validate-plugin --generate-types
jay-stack validate-plugin --verbose
jay-stack validate-plugin --strict

# Build (existing)
jay-stack build
```

**Implementation approach:**

- Import validation functions from `@jay-framework/plugin-validator`
- Add new command using Commander's `.command()` API
- Format and display validation results
- Exit with appropriate error codes (0 for success, 1 for failure)
```json
{
  "scripts": {
    "validate": "jay-stack validate-plugin",
    "prepack": "npm run validate",
    "prepublishOnly": "npm run validate --strict"
  }
}
```

**In CI/CD:**
```yaml
# .github/workflows/validate.yml
name: Validate Plugin
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build
      - run: npx jay-stack validate-plugin --strict --verbose
```

### Benefits

1. **Catch errors early** - Before publishing or deployment
2. **Clear error messages** - With suggestions for fixes
3. **CI/CD integration** - Prevent invalid plugins from being published
4. **Development feedback** - Quick validation during development
5. **Documentation** - Validation rules serve as documentation
6. **Consistency** - Enforce plugin structure standards

## Success Criteria

- ✅ Plugin developers can create plugins with static contracts easily
- ✅ Plugin developers can create CMS-like plugins with dynamic contracts
- ✅ Jay-stack users can reference contracts with clear, unified syntax
- ✅ Both jay-html and page.config.yaml use identical reference format
- ✅ Migration from old format is straightforward
- ✅ Dynamic contracts maintain full type safety
- ✅ Documentation is comprehensive and includes examples

