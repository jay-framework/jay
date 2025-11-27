# Jay Stack Editor Protocol: `getProjectInfo` API

## Overview

The `getProjectInfo` endpoint retrieves comprehensive project information in a single optimized call, including:

- Project metadata (name, path)
- All pages with their contracts and used components
- All components in the project
- All installed applications
- Complete contract schemas for all installed applications

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

  // Installed applications (basic info)
  installedApps: InstalledApp[];

  // Full contract schemas from installed applications
  installedAppContracts: {
    [appName: string]: InstalledAppContracts;
  };
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
  contractSchema?: ContractSchema; // Page's own contract from .jay-contract file

  // Used components
  usedComponents: {
    // Parsed from jay-html or page.conf.yaml
    contract: string;
    src: string;
    name: string;
    key: string;
  }[];

  // Used component contract references
  usedComponentContracts: {
    appName: string; // Which app provides this component
    componentName: string; // Component name to look up in installedAppContracts
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

interface InstalledApp {
  name: string;
  module: string;
  pages: Array<{
    name: string;
    headless_components: Array<{
      name: string;
      key: string;
      contract: string;
      slugs?: string[];
    }>;
  }>;
  components: Array<{
    name: string;
    headless_components: Array<{
      name: string;
      key: string;
      contract: string;
    }>;
  }>;
  config_map?: Array<{
    display_name: string;
    key: string;
  }>;
}

interface InstalledAppContracts {
  appName: string;
  module: string;
  pages: Array<{
    pageName: string;
    contractSchema: ContractSchema;
  }>;
  components: Array<{
    componentName: string;
    contractSchema: ContractSchema;
  }>;
}

interface ContractSchema {
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
        contractSchema: {
          name: 'home',
          tags: [
            { tag: 'siteTitle', type: 'data', dataType: 'string' },
            { tag: 'featured', type: 'sub-contract', tags: [...] }
          ]
        },

        // Used components from jay-html
        usedComponents: [
          {
            contract: './contracts/product.jay-contract',
            src: 'wix-jay-headless-store',
            name: 'productPage',
            key: 'product'
          }
        ],

        // References to installed app contracts
        usedComponentContracts: [
          {
            appName: 'wix-jay-headless-store',
            componentName: 'productPage'
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

    installedApps: [
      {
        name: 'wix-jay-headless-store',
        module: 'wix-jay-headless-store',
        pages: [...],
        components: [...],
        config_map: [...]
      }
    ],

    installedAppContracts: {
      'wix-jay-headless-store': {
        appName: 'wix-jay-headless-store',
        module: 'wix-jay-headless-store',
        pages: [
          {
            pageName: 'productPage',
            contractSchema: {
              name: 'product-page',
              tags: [
                { tag: 'title', type: 'data', dataType: 'string' },
                { tag: 'price', type: 'data', dataType: 'number' },
                // ... all other tags
              ]
            }
          }
        ],
        components: [...]
      }
    }
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
  console.log(`Installed Apps: ${info.installedApps.length}`);
}
```

### Example 2: Display Page with Full Contracts

```typescript
const response = await client.getProjectInfo({ type: 'getProjectInfo' });
const homePage = response.info.pages.find((p) => p.url === '/');

if (homePage) {
  console.log(`\nPage: ${homePage.name} (${homePage.url})`);

  // Show page's own contract
  if (homePage.contractSchema) {
    console.log('\nPage Contract:');
    homePage.contractSchema.tags.forEach((tag) => {
      console.log(`  - ${tag.tag}: ${tag.type}`);
    });
  }

  // Show used component contracts
  homePage.usedComponentContracts.forEach((ref) => {
    const app = response.info.installedAppContracts[ref.appName];

    // Find the contract (could be in pages or components)
    const contract =
      app.pages.find((p) => p.pageName === ref.componentName) ||
      app.components.find((c) => c.componentName === ref.componentName);

    if (contract) {
      console.log(`\nComponent: ${ref.appName}.${ref.componentName}`);
      contract.contractSchema.tags.forEach((tag) => {
        console.log(`  - ${tag.tag}: ${tag.type}`);
      });
    }
  });
}
```

### Example 3: Build Complete Tag List for a Page

```typescript
function getAllPageTags(
  page: ProjectPage,
  installedAppContracts: { [appName: string]: InstalledAppContracts },
): ContractTag[] {
  const allTags: ContractTag[] = [];

  // 1. Add page's own tags
  if (page.contractSchema) {
    allTags.push(...page.contractSchema.tags);
  }

  // 2. Add tags from used components
  page.usedComponentContracts.forEach((ref) => {
    const app = installedAppContracts[ref.appName];
    if (!app) return;

    const contract =
      app.pages.find((p) => p.pageName === ref.componentName) ||
      app.components.find((c) => c.componentName === ref.componentName);

    if (contract) {
      allTags.push(...contract.contractSchema.tags);
    }
  });

  return allTags;
}

// Usage
const response = await client.getProjectInfo({ type: 'getProjectInfo' });
const homePage = response.info.pages.find((p) => p.url === '/');
const allTags = getAllPageTags(homePage, response.info.installedAppContracts);
```

### Example 4: List All Available Apps and Their Contracts

```typescript
const response = await client.getProjectInfo({ type: 'getProjectInfo' });

Object.values(response.info.installedAppContracts).forEach((app) => {
  console.log(`\nApp: ${app.appName} (${app.module})`);

  console.log(`  Pages: ${app.pages.length}`);
  app.pages.forEach((page) => {
    console.log(`    - ${page.pageName}: ${page.contractSchema.tags.length} tags`);
  });

  console.log(`  Components: ${app.components.length}`);
  app.components.forEach((comp) => {
    console.log(`    - ${comp.componentName}: ${comp.contractSchema.tags.length} tags`);
  });
});
```

## Page Detection & Configuration

The API detects pages by scanning the `src/pages` directory. A directory is considered a page if it contains any of:

- `page.jay-html`
- `page.jay-contract`
- `page.conf.yaml`

**Used Components Resolution:**
The list of `usedComponentContracts` is derived with the following priority:

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
  │   └─ scanInstalledApps()
  │
  ├─ Scan installed app contracts
  │   └─ scanInstalledAppContracts()
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
- Parallel scanning where possible (project name, components, apps)
- Shared `scanPageDirectories` function ensures consistency
- Contract resolution happens in a single pass

## Response Guarantees

- **Always returns complete data structures** (even if empty)
- **Linked sub-contracts are always resolved** before response
- **No manual link resolution needed** on the client side
- **All sub-contracts are fully expanded** in `installedAppContracts`
- **Page contracts include the page's own .jay-contract file** (if it exists)
- **usedComponentContracts are references only** - look up full schema in `installedAppContracts`

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
  // - installedApps: []
  // - installedAppContracts: {}
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
  console.log(`⚙️  Installed Apps: ${info.installedApps.length}`);

  // Display each page with its contracts
  info.pages.forEach((page) => {
    console.log(`\n\nPage: ${page.name} (${page.url})`);

    if (page.contractSchema) {
      console.log('  Own Contract:');
      page.contractSchema.tags.forEach((tag) => {
        console.log(`    - ${tag.tag}: ${tag.type}${tag.dataType ? ` (${tag.dataType})` : ''}`);
      });
    }

    if (page.usedComponentContracts.length > 0) {
      console.log('  Uses Components:');
      page.usedComponentContracts.forEach((ref) => {
        console.log(`    - ${ref.appName}.${ref.componentName}`);
      });
    }
  });

  // List all available contracts
  console.log('\n\n📋 Available Contracts:');
  Object.values(info.installedAppContracts).forEach((app) => {
    console.log(`\n  ${app.appName}:`);
    app.pages.forEach((p) => {
      console.log(`    📄 ${p.pageName}`);
    });
    app.components.forEach((c) => {
      console.log(`    🧩 ${c.componentName}`);
    });
  });
} else {
  console.error('Failed to get project info:', response.error);
}
```

## Best Practices

### For Design Tools

**Create a helper function to resolve component references:**

```typescript
function lookupComponentContract(
  ref: { appName: string; componentName: string },
  installedAppContracts: { [appName: string]: InstalledAppContracts },
): ContractSchema | null {
  const app = installedAppContracts[ref.appName];
  if (!app) return null;

  // Check pages
  const pageContract = app.pages.find((p) => p.pageName === ref.componentName);
  if (pageContract) return pageContract.contractSchema;

  // Check components
  const componentContract = app.components.find((c) => c.componentName === ref.componentName);
  if (componentContract) return componentContract.contractSchema;

  return null;
}
```

**Display comprehensive contract information:**

```typescript
const response = await client.getProjectInfo({ type: 'getProjectInfo' });
const page = response.info.pages.find((p) => p.url === targetUrl);

if (page) {
  // Display page-level tags
  if (page.contractSchema) {
    displayContract(page.contractSchema);
  }

  // Display used component tags
  page.usedComponentContracts.forEach((ref) => {
    const contract = lookupComponentContract(ref, response.info.installedAppContracts);
    if (contract) {
      displayContract(contract);
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
  ├─ Scan installed apps → 30ms (once!)
  ├─ Parse contracts → 80ms
  └─ Network overhead → 50ms

TOTAL TIME: ~280ms
```

Everything in one optimized request! ⚡
