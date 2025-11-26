# Jay Stack Editor Protocol: `getContracts` API

## Overview

The `getContracts` endpoint retrieves all contract schemas from a Jay Stack project, including:

- Pages with their own contracts and references to used installed application components
- All installed application contracts (pages, components, and sub-contracts)

This API provides a complete view of all available contracts in the project for design tools and editors.

## Request

**Message Type:** `getContracts`

```typescript
interface GetContractsMessage {
  type: 'getContracts';
}
```

**Example:**

```typescript
const response = await editorClient.getContracts({
  type: 'getContracts',
});
```

## Response Structure

The response contains two main data structures:

```typescript
interface GetContractsResponse {
  type: 'getContracts';
  success: boolean;
  error?: string;

  // 1. Array of pages with their contracts and used component references
  pages: PageContractSchema[];

  // 2. All installed app contracts (organized by app)
  installedAppContracts: {
    [appName: string]: InstalledAppContracts;
  };
}
```

---

## 1. Pages (`pages`)

An array of all pages in the project. Each page includes:

- Its own contract (if it has a `.jay-contract` file)
- References to installed application components used on that page

### Structure

```typescript
interface PageContractSchema {
  pageName: string; // Directory name: "home", "products", etc.
  pageUrl: string; // Route path (unique identifier): "/", "/products", "/products/:id"
  contractSchema?: ContractSchema; // Optional - page's own contract if it has a .jay-contract file
  usedComponentContracts: {
    appName: string; // Name of the app providing this component
    componentName: string; // Name of the component (reference only - look up full contract in installedAppContracts)
  }[];
}
```

### Use Case

- View all pages in the project
- Access each page's own contract tags (from its `.jay-contract` file)
- See which installed application components are used on each page
- Look up the full contract for used components in `installedAppContracts`

### Page Detection & Configuration

The API detects pages by scanning the `src/pages` directory. A directory is considered a page if it contains any of:

- `page.jay-html`
- `page.jay-contract`
- `page.conf.yaml`

**Used Components Resolution:**
The list of `usedComponentContracts` is derived with the following priority:

1. **`page.jay-html`**: If present, `<script type="application/jay-headless">` tags are parsed.
2. **`page.conf.yaml`**: If `jay-html` is missing, this file is checked for a `used_components` list.

### Example

```typescript
[
  {
    pageName: 'home',
    pageUrl: '/',
    contractSchema: {
      name: 'home',
      tags: [
        {
          tag: 'siteTitle',
          type: 'data',
          dataType: 'string',
        },
        {
          tag: 'address',
          type: 'data',
          dataType: 'string',
        },
        {
          tag: 'featured',
          type: 'sub-contract',
          tags: [
            { tag: 'title', type: 'data', dataType: 'string' },
            { tag: 'description', type: 'data', dataType: 'string' },
          ],
        },
      ],
    },
    usedComponentContracts: [
      {
        appName: 'wix-jay-headless-store',
        componentName: 'productPage',
      },
    ],
  },
  {
    pageName: '[categoryId]',
    pageUrl: '/categorypage/:categoryId',
    contractSchema: {
      name: 'category-page-data',
      tags: [{ tag: 'categoryId', type: 'data', dataType: 'string' }],
    },
    usedComponentContracts: [
      {
        appName: 'wix-jay-headless-store',
        componentName: 'categoryPage',
      },
    ],
  },
  {
    pageName: '[productId]',
    pageUrl: '/productpage/:productId',
    // No contractSchema - this page doesn't have a .jay-contract file
    usedComponentContracts: [],
  },
];
```

**Key Points:**

- `pageUrl` serves as the unique identifier for each page
- `contractSchema` contains the page's own contract tags (optional - only if the page has a `.jay-contract` file)
- `usedComponentContracts` contains **references only** (appName + componentName)
- To get the full contract schema for a used component, look it up in `installedAppContracts[appName].pages` or `installedAppContracts[appName].components`

---

## 2. Installed App Contracts (`installedAppContracts`)

Contains all contracts from all installed applications, organized by app name. This includes both page-level and component-level contracts with all their sub-contracts fully expanded.

### Structure

```typescript
interface InstalledAppContracts {
  appName: string; // Application name
  module: string; // NPM module name
  pages: Array<{
    // Page-level contracts from this app
    pageName: string;
    contractSchema: ContractSchema;
  }>;
  components: Array<{
    // Component-level contracts from this app
    componentName: string;
    contractSchema: ContractSchema;
  }>;
}
```

### Use Case

- Browse all available contracts from installed applications
- Look up the full contract schema for components used on pages
- Understand what data each installed app provides
- Access complete contract definitions including all nested sub-contracts

### Example

```typescript
{
  "wix-jay-headless-store": {
    appName: "wix-jay-headless-store",
    module: "wix-jay-headless-store",
    pages: [
      {
        pageName: "productPage",
        contractSchema: {
          name: "product-page",
          tags: [
            {
              tag: "title",
              type: "data",
              dataType: "string"
            },
            {
              tag: "serverData",
              type: "data",
              dataType: "string"
            },
            {
              tag: "product",
              type: "sub-contract",
              tags: [
                { tag: "title", type: "data", dataType: "string" },
                { tag: "description", type: "data", dataType: "string" }
              ]
            }
          ]
        }
      },
      {
        pageName: "categoryPage",
        contractSchema: {
          name: "category-page",
          tags: [
            {
              tag: "categoryName",
              type: "data",
              dataType: "string",
              required: true
            },
            {
              tag: "products",
              type: "sub-contract",
              repeated: true,
              required: true,
              tags: [
                { tag: "title", type: "data", dataType: "string" },
                { tag: "description", type: "data", dataType: "string" }
              ]
            }
          ]
        }
      }
    ],
    components: [
      {
        componentName: "cartDrawer",
        contractSchema: {
          name: "cart",
          tags: [
            {
              tag: "items",
              type: "sub-contract",
              repeated: true,
              tags: [
                { tag: "productId", type: "data", dataType: "string" },
                { tag: "quantity", type: "data", dataType: "number" }
              ]
            },
            { tag: "total", type: "data", dataType: "number" }
          ]
        }
      }
    ]
  }
}
```

**Key Points:**

- All contracts from all installed apps are included
- Both page-level and component-level contracts are provided
- All sub-contracts are fully expanded and included
- Linked sub-contracts are automatically resolved

---

## Working with Contracts

### Example 1: Get Full Contract for a Page

```typescript
const response = await client.getContracts({ type: 'getContracts' });

// Find a specific page
const homePage = response.pages.find((p) => p.pageUrl === '/');

if (homePage) {
  // 1. Page's own contract
  if (homePage.contractSchema) {
    console.log('Page contract:', homePage.contractSchema.name);
    homePage.contractSchema.tags.forEach((tag) => {
      console.log(`  - ${tag.tag} (${tag.type})`);
    });
  }

  // 2. Used component contracts
  homePage.usedComponentContracts.forEach((ref) => {
    // Look up the full contract in installedAppContracts
    const app = response.installedAppContracts[ref.appName];

    // Check if it's a page contract
    const pageContract = app.pages.find((p) => p.pageName === ref.componentName);
    if (pageContract) {
      console.log(`\nUsed component: ${ref.appName}.${ref.componentName}`);
      pageContract.contractSchema.tags.forEach((tag) => {
        console.log(`  - ${tag.tag} (${tag.type})`);
      });
    }

    // Check if it's a component contract
    const componentContract = app.components.find((c) => c.componentName === ref.componentName);
    if (componentContract) {
      console.log(`\nUsed component: ${ref.appName}.${ref.componentName}`);
      componentContract.contractSchema.tags.forEach((tag) => {
        console.log(`  - ${tag.tag} (${tag.type})`);
      });
    }
  });
}
```

### Example 2: Build Complete Tag List for a Page

```typescript
function getPageTags(
  page: PageContractSchema,
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

    // Look up in pages
    const pageContract = app.pages.find((p) => p.pageName === ref.componentName);
    if (pageContract) {
      allTags.push(...pageContract.contractSchema.tags);
    }

    // Look up in components
    const componentContract = app.components.find((c) => c.componentName === ref.componentName);
    if (componentContract) {
      allTags.push(...componentContract.contractSchema.tags);
    }
  });

  return allTags;
}

// Usage
const response = await client.getContracts({ type: 'getContracts' });
const homePage = response.pages.find((p) => p.pageUrl === '/');
const allTags = getPageTags(homePage, response.installedAppContracts);
```

### Example 3: List All Available Apps

```typescript
const response = await client.getContracts({ type: 'getContracts' });

Object.values(response.installedAppContracts).forEach((app) => {
  console.log(`\nApp: ${app.appName} (${app.module})`);
  console.log(`  Pages: ${app.pages.map((p) => p.pageName).join(', ')}`);
  console.log(`  Components: ${app.components.map((c) => c.componentName).join(', ')}`);
});
```

---

## Contract Tag Structure

Each tag in a contract follows this structure:

```typescript
interface ContractTag {
  tag: string; // Tag identifier (e.g., "title", "items")
  type: string | string[]; // Tag type(s): "data", "interactive", "variant", "sub-contract"
  dataType?: string; // For data/variant tags: "string", "number", "boolean", "enum (val1 | val2)"
  elementType?: string; // For interactive tags: "HTMLButtonElement", "HTMLInputElement"
  required?: boolean; // Whether the tag is required
  repeated?: boolean; // Whether the tag is an array/repeated
  tags?: ContractTag[]; // For sub-contracts: nested tags
  link?: string; // For linked sub-contracts (resolved automatically)
}
```

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

---

## Best Practices

### For Design Tools

**1. Always check both page contracts and used component contracts:**

```typescript
const page = response.pages.find((p) => p.pageUrl === targetUrl);

// Page's own data
if (page.contractSchema) {
  // Show page-level tags in the UI
  displayContract(page.contractSchema);
}

// Used component data
page.usedComponentContracts.forEach((ref) => {
  const contract = lookupContract(ref, response.installedAppContracts);
  if (contract) {
    displayContract(contract);
  }
});
```

**2. Create a helper function to resolve component references:**

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

### For Contract Browsers/Explorers

**Display comprehensive contract information:**

```typescript
// 1. Show all pages with their contracts
response.pages.forEach((page) => {
  console.log(`\n${page.pageUrl}:`);

  if (page.contractSchema) {
    console.log(`  Own contract: ${page.contractSchema.name}`);
  }

  if (page.usedComponentContracts.length > 0) {
    console.log('  Uses:');
    page.usedComponentContracts.forEach((ref) => {
      console.log(`    - ${ref.appName}.${ref.componentName}`);
    });
  }
});

// 2. Show all installed apps
Object.values(response.installedAppContracts).forEach((app) => {
  console.log(`\nApp: ${app.appName}`);
  app.pages.forEach((page) => {
    console.log(`  Page: ${page.pageName}`);
  });
  app.components.forEach((comp) => {
    console.log(`  Component: ${comp.componentName}`);
  });
});
```

---

## Response Guarantee

- **Always returns both data structures** (even if empty)
- **Linked sub-contracts are always resolved** before response
- **No manual link resolution needed** on the client side
- **All sub-contracts are fully expanded** in `installedAppContracts`
- **Page contracts include the page's own .jay-contract file** (if it exists)
- **usedComponentContracts are references only** - look up full schema in `installedAppContracts`

---

## Error Handling

```typescript
const response = await client.getContracts({ type: 'getContracts' });

if (!response.success) {
  console.error('Error:', response.error);
  // response will still contain empty structures:
  // - pages: []
  // - installedAppContracts: {}
}
```

**Partial failures are logged but don't fail the entire request:**

- Invalid contract file → Warning logged, page/component included without contract
- Unresolved link → Warning logged, link reference preserved in contract
- Missing installed app → Warning logged, app skipped

---

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

// Get all contracts
const response = await client.getContracts({
  type: 'getContracts',
});

if (response.success) {
  // Find a specific page
  const productPage = response.pages.find((p) => p.pageUrl === '/products');

  if (productPage) {
    console.log(`\nPage: ${productPage.pageName} (${productPage.pageUrl})`);

    // Show page's own contract
    if (productPage.contractSchema) {
      console.log('\nPage Contract:');
      console.log(`  Name: ${productPage.contractSchema.name}`);
      productPage.contractSchema.tags.forEach((tag) => {
        console.log(`  - ${tag.tag}: ${tag.type}`);
      });
    }

    // Show used components
    if (productPage.usedComponentContracts.length > 0) {
      console.log('\nUsed Components:');
      productPage.usedComponentContracts.forEach((ref) => {
        const app = response.installedAppContracts[ref.appName];
        const contract =
          app.pages.find((p) => p.pageName === ref.componentName) ||
          app.components.find((c) => c.componentName === ref.componentName);

        if (contract) {
          console.log(`\n  ${ref.appName}.${ref.componentName}:`);
          contract.contractSchema.tags.forEach((tag) => {
            console.log(`    - ${tag.tag}: ${tag.type}`);
          });
        }
      });
    }
  }

  // List all installed apps
  console.log('\n\nInstalled Apps:');
  Object.values(response.installedAppContracts).forEach((app) => {
    console.log(`\n${app.appName} (${app.module}):`);
    console.log(`  Pages: ${app.pages.length}`);
    console.log(`  Components: ${app.components.length}`);
  });
} else {
  console.error('Failed to get contracts:', response.error);
}
```

---

## Key Design Decisions

### Why Store References Instead of Full Schemas in `usedComponentContracts`?

1. **Avoids data duplication** - If the same component is used on multiple pages, its contract is stored only once in `installedAppContracts`
2. **Single source of truth** - All contract schemas live in `installedAppContracts`, making updates and consistency easier
3. **Smaller response size** - References are much smaller than full contract schemas
4. **Clear separation** - Page contracts vs. app contracts are clearly separated

### Why Include Page's Own Contract?

1. **Complete picture** - Pages often have their own data requirements (like URL params, page-specific state)
2. **Composability** - Page contract + used component contracts = full page data model
3. **Flexibility** - Pages can work with or without installed applications

### Finding Page by URL

Since `pageUrl` is the unique identifier, you can easily find pages:

```typescript
// Using array find
const homePage = response.pages.find((p) => p.pageUrl === '/');
const productPage = response.pages.find((p) => p.pageUrl === '/products/:id');

// Or create a map for faster lookups
const pagesByUrl = new Map(response.pages.map((page) => [page.pageUrl, page]));

const homePage = pagesByUrl.get('/');
const productPage = pagesByUrl.get('/products/:id');
```
