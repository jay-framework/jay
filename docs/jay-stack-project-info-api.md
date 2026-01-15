# Jay Stack Editor Protocol: `getProjectInfo` API

## Overview

The `getProjectInfo` endpoint retrieves comprehensive project information in a single optimized call, including:

- Project metadata (name, path)
- All pages with their contracts and used components
- All components in the project
- All plugins with their contract schemas

## Request

**Message Type:** `getProjectInfo`

```typescript
interface GetProjectInfoMessage {
  type: 'getProjectInfo';
}
```

**Example:**

```typescript
const response = await editorClient.getProjectInfo({
  type: 'getProjectInfo',
});
```

## Response Structure

```typescript
interface GetProjectInfoResponse {
  type: 'getProjectInfo';
  success: boolean;
  error?: string;
  info: ProjectInfo;
}

interface ProjectInfo {
  // Project metadata
  name: string;
  localPath: string;

  // Pages with full information (contracts + used components)
  pages: ProjectPage[];

  // Components in the project
  components: ProjectComponent[];

  // Plugins with their contracts
  plugins: Plugin[];
}
```

## Data Structures

### ProjectPage

Each page includes both basic information AND contract details:

```typescript
interface ProjectPage {
  // Basic info
  name: string; // Directory name
  url: string; // Route path (e.g., "/", "/products/:id")
  filePath: string; // Path to page.jay-html

  // Contract info
  contract?: Contract; // Page's own contract from .jay-contract file

  // Used components (references to plugin contracts)
  usedComponents: {
    appName: string; // Plugin name
    componentName: string; // Contract name within the plugin
    key: string; // Component instance key
  }[];
}
```

### Other Data Structures

```typescript
interface ProjectComponent {
  name: string;
  filePath: string;
  contractPath?: string;
}

interface Plugin {
  name: string; // Plugin name (kebab-case) for the plugin attribute
  contracts: Contract[]; // Array of available contracts
}

interface Contract {
  name: string;
  tags: ContractTag[];
}

interface ContractTag {
  tag: string;
  type: string | string[];
  dataType?: string;
  elementType?: string;
  required?: boolean;
  repeated?: boolean;
  tags?: ContractTag[]; // For sub-contracts
  link?: string; // Automatically resolved
}
```

## Example Response

```typescript
{
  type: 'getProjectInfo',
  success: true,
  info: {
    name: 'My Jay Stack Project',
    localPath: '/Users/dev/my-project',

    pages: [
      {
        name: 'home',
        url: '/',
        filePath: '/Users/dev/my-project/src/pages/page.jay-html',

        // Page's own contract
        contract: {
          name: 'home',
          tags: [
            { tag: 'siteTitle', type: 'data', dataType: 'string' },
            { tag: 'featured', type: 'sub-contract', tags: [...] }
          ]
        },

        // Used components reference plugin contracts
        usedComponents: [
          {
            appName: 'wix-stores',
            componentName: 'product-page',
            key: 'product'
          }
        ]
      }
    ],

    components: [
      {
        name: 'Button',
        filePath: '/Users/dev/my-project/src/components/Button.jay-html',
        contractPath: '/Users/dev/my-project/src/components/Button.jay-contract'
      }
    ],

    plugins: [
      {
        name: 'wix-stores',
        contracts: [
          {
            name: 'product-page',
            tags: [
              { tag: 'title', type: 'data', dataType: 'string' },
              { tag: 'price', type: 'data', dataType: 'number' },
              { tag: 'addToCartButton', type: 'interactive' }
            ]
          }
        ]
      }
    ]
  }
}
```

## Usage Examples

### Example 1: Get Complete Project Overview

```typescript
const response = await client.getProjectInfo({ type: 'getProjectInfo' });

if (response.success) {
  const { info } = response;

  console.log(`Project: ${info.name}`);
  console.log(`Location: ${info.localPath}`);
  console.log(`Pages: ${info.pages.length}`);
  console.log(`Components: ${info.components.length}`);
  console.log(`Plugins: ${info.plugins.length}`);
}
```

### Example 2: Display Page with Full Contracts

```typescript
const response = await client.getProjectInfo({ type: 'getProjectInfo' });
const homePage = response.info.pages.find((p) => p.url === '/');

if (homePage) {
  console.log(`\nPage: ${homePage.name} (${homePage.url})`);

  // Show page's own contract
  if (homePage.contract) {
    console.log('\nPage Contract:');
    homePage.contract.tags.forEach((tag) => {
      console.log(`  - ${tag.tag}: ${tag.type}`);
    });
  }

  // Show used component contracts
  homePage.usedComponents.forEach((ref) => {
    // Find the plugin
    const plugin = response.info.plugins.find((p) => p.name === ref.appName);
    
    if (plugin) {
      // Find the contract within the plugin
      const contract = plugin.contracts.find((c) => c.name === ref.componentName);
      
      if (contract) {
        console.log(`\nComponent: ${ref.appName}.${ref.componentName}`);
        contract.tags.forEach((tag) => {
          console.log(`  - ${tag.tag}: ${tag.type}`);
        });
      }
    }
  });
}
```

### Example 3: Build Complete Tag List for a Page

```typescript
function getAllPageTags(
  page: ProjectPage,
  plugins: Plugin[],
): ContractTag[] {
  const allTags: ContractTag[] = [];

  // 1. Add page's own tags
  if (page.contract) {
    allTags.push(...page.contract.tags);
  }

  // 2. Add tags from used components
  page.usedComponents.forEach((ref) => {
    const plugin = plugins.find((p) => p.name === ref.appName);
    if (!plugin) return;

    const contract = plugin.contracts.find((c) => c.name === ref.componentName);
    if (contract) {
      allTags.push(...contract.tags);
    }
  });

  return allTags;
}

// Usage
const response = await client.getProjectInfo({ type: 'getProjectInfo' });
const homePage = response.info.pages.find((p) => p.url === '/');
const allTags = getAllPageTags(homePage, response.info.plugins);
```

### Example 4: Use Plugin System

```typescript
const response = await client.getProjectInfo({ type: 'getProjectInfo' });

// Display all plugins and their contracts
response.info.plugins.forEach((plugin) => {
  console.log(`\nPlugin: ${plugin.name}`);
  console.log(`  Contracts: ${plugin.contracts.length}`);

  plugin.contracts.forEach((contract) => {
    console.log(`    - ${contract.name}: ${contract.tags.length} tags`);
    contract.tags.forEach((tag) => {
      console.log(`      • ${tag.tag}: ${tag.type}${tag.dataType ? ` (${tag.dataType})` : ''}`);
    });
  });
});

// Find a specific plugin contract
function findPluginContract(
  plugins: Plugin[],
  pluginName: string,
  contractName: string,
): Contract | null {
  const plugin = plugins.find((p) => p.name === pluginName);
  if (!plugin) return null;

  return plugin.contracts.find((c) => c.name === contractName) || null;
}

// Usage
const productContract = findPluginContract(
  response.info.plugins,
  'wix-stores',
  'product-page',
);
if (productContract) {
  console.log(`Found contract: ${productContract.name} with ${productContract.tags.length} tags`);
}
```

## Page Detection & Configuration

The API detects pages by scanning the `src/pages` directory. A directory is considered a page if it contains any of:

- `page.jay-html`
- `page.jay-contract`
- `page.conf.yaml`

**Used Components Resolution:**
The list of `usedComponents` is derived with the following priority:

1. **`page.jay-html`**: If present, `<script type="application/jay-headless">` tags are parsed.
2. **`page.conf.yaml`**: If `jay-html` is missing, this file is checked for a `used_components` list.

See [page.conf.yaml documentation](./jay-stack-page-configuration.md) for more details.

## Contract Tag Structure

### Tag Types

1. **`data`** - View state data displayed in the UI

   ```typescript
   { tag: "title", type: "data", dataType: "string", required: true }
   ```

2. **`interactive`** - UI elements that can be interacted with programmatically

   ```typescript
   { tag: "submitButton", type: "interactive", elementType: "HTMLButtonElement" }
   ```

3. **`variant`** - Design variations/states (must be enum)

   ```typescript
   { tag: "status", type: "variant", dataType: "enum (active | inactive | pending)" }
   ```

4. **`sub-contract`** - Nested data structures

   ```typescript
   {
     tag: "items",
     type: "sub-contract",
     repeated: true,
     tags: [
       { tag: "name", type: "data", dataType: "string" },
       { tag: "price", type: "data", dataType: "number" }
     ]
   }
   ```

## Implementation Details

### Optimized Scanning

The implementation uses a unified scanning approach in a single pass:

```
scanProjectInfo()
  ↓
  ├─ Scan basic info in parallel
  │   ├─ getProjectName()
  │   ├─ scanProjectComponents()
  │   └─ scanPlugins()
  │
  └─ Scan pages (single pass with all info)
      └─ scanPageDirectories()
          ├─ Detect page files
          ├─ Parse contracts
          ├─ Parse used components
          └─ Resolve component contract references
```

**Key optimizations:**

- Pages directory scanned **once** (not multiple times)
- Parallel scanning where possible (project name, components, plugins)
- Shared `scanPageDirectories` function ensures consistency
- Contract resolution happens in a single pass

## Response Guarantees

- **Always returns complete data structures** (even if empty)
- **Linked sub-contracts are always resolved** before response
- **No manual link resolution needed** on the client side
- **All sub-contracts are fully expanded** in plugin contracts
- **Page contracts include the page's own .jay-contract file** (if it exists)
- **usedComponents are references** - look up full schema in `plugins`

## Error Handling

```typescript
const response = await client.getProjectInfo({ type: 'getProjectInfo' });

if (!response.success) {
  console.error('Error:', response.error);
  // response.info will still contain empty/default values:
  // - name: 'Error'
  // - localPath: process.cwd()
  // - pages: []
  // - components: []
  // - plugins: []
}
```

**Graceful degradation:**

- Invalid contract files → Warning logged, page included without contract
- Unresolved links → Warning logged, link reference preserved
- Missing files → Warning logged, data returned with available information

## Complete Usage Example

```typescript
import { createEditorClient } from '@jay-framework/editor-client';

const client = createEditorClient({
  portRanges: {
    http: [3000, 3100],
    editor: [3101, 3200],
  },
});

// Connect to the dev server
await client.connect();

// Get all project information
const response = await client.getProjectInfo({
  type: 'getProjectInfo',
});

if (response.success) {
  const { info } = response;

  // Display project overview
  console.log(`\n📦 Project: ${info.name}`);
  console.log(`📁 Location: ${info.localPath}`);
  console.log(`📄 Pages: ${info.pages.length}`);
  console.log(`🧩 Components: ${info.components.length}`);
  console.log(`🔌 Plugins: ${info.plugins.length}`);

  // Display each page with its contracts
  info.pages.forEach((page) => {
    console.log(`\n\nPage: ${page.name} (${page.url})`);

    if (page.contract) {
      console.log('  Own Contract:');
      page.contract.tags.forEach((tag) => {
        console.log(`    - ${tag.tag}: ${tag.type}${tag.dataType ? ` (${tag.dataType})` : ''}`);
      });
    }

    if (page.usedComponents.length > 0) {
      console.log('  Uses Components:');
      page.usedComponents.forEach((ref) => {
        console.log(`    - ${ref.appName}.${ref.componentName}`);
      });
    }
  });

  // List all available contracts from plugins
  console.log('\n\n📋 Plugin Contracts:');
  info.plugins.forEach((plugin) => {
    console.log(`\n  🔌 ${plugin.name}:`);
    plugin.contracts.forEach((contract) => {
      console.log(`    📋 ${contract.name} (${contract.tags.length} tags)`);
    });
  });
} else {
  console.error('Failed to get project info:', response.error);
}
```

## Best Practices

### For Design Tools

**Use the Plugin system for headless script generation:**

```typescript
function findPluginContract(
  plugins: Plugin[],
  pluginName: string,
  contractName: string,
): Contract | null {
  const plugin = plugins.find((p) => p.name === pluginName);
  if (!plugin) return null;

  return plugin.contracts.find((c) => c.name === contractName) || null;
}

// Generate headless script tag attributes
function generateHeadlessScriptAttributes(
  pluginName: string,
  contractName: string,
  key: string,
): { plugin: string; contract: string; key: string } {
  return {
    plugin: pluginName,
    contract: contractName,
    key: key,
  };
}
```

**Display comprehensive contract information:**

```typescript
const response = await client.getProjectInfo({ type: 'getProjectInfo' });
const page = response.info.pages.find((p) => p.url === targetUrl);

if (page) {
  // Display page-level tags
  if (page.contract) {
    displayContract(page.contract);
  }

  // Display used component tags
  page.usedComponents.forEach((ref) => {
    const plugin = response.info.plugins.find((p) => p.name === ref.appName);
    if (plugin) {
      const contract = plugin.contracts.find((c) => c.name === ref.componentName);
      if (contract) {
        displayContract(contract);
      }
    }
  });
}
```

## Performance Benefits

Single API call retrieves all information:

```
getProjectInfo
  ├─ Scan pages directory → 100ms (once!)
  ├─ Scan components → 20ms
  ├─ Scan plugins → 30ms (once!)
  ├─ Parse contracts → 80ms
  └─ Network overhead → 50ms

TOTAL TIME: ~280ms
```

Everything in one optimized request! ⚡
