# Jay Stack Editor Protocol: `getContracts` API

## Overview

The `getContracts` endpoint retrieves all contract schemas from a Jay Stack project, including page contracts, installed application contracts, and fully merged page contracts. This API provides a complete view of all available contracts in the project for design tools and editors.

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

The response contains three separate data structures, each serving a different purpose:

```typescript
interface GetContractsResponse {
  type: 'getContracts';
  success: boolean;
  error?: string;

  // 1. Individual page contracts (their own .jay-contract files only)
  pageContracts: {
    [pageId: string]: PageContractSchema;
  };

  // 2. Installed app contracts (organized by app)
  installedAppContracts: {
    [appName: string]: InstalledAppContracts;
  };

  // 3. Full page contracts (merged: page + installed apps)
  fullPageContracts: {
    [pageId: string]: FullPageContract;
  };
}
```

---

## 1. Page Contracts (`pageContracts`)

Contains contracts defined in `page.jay-contract` files next to each page.

### Structure

```typescript
interface PageContractSchema {
  pageId: string; // Unique identifier: "page-0", "page-1", etc.
  pageName: string; // Directory name: "home", "products", etc.
  pageUrl: string; // Route path: "/", "/products", "/products/:id"
  contractSchema?: {
    // Optional - only if page has a contract file
    name: string; // Contract name
    tags: ContractTag[]; // Array of contract tags
  };
}
```

### Use Case

- View which pages have their own contracts
- Inspect a specific page's contract definition
- Understand the page's native data structure

### Example

```typescript
{
    "page-0": {
        pageId: "page-0",
        pageName: "products",
        pageUrl: "/products",
        contractSchema: {
            name: "products-page",
            tags: [
                {
                    tag: "title",
                    type: "data",
                    dataType: "string",
                    required: true
                },
                {
                    tag: "items",
                    type: "sub-contract",
                    repeated: true,
                    tags: [
                        { tag: "name", type: "data", dataType: "string" },
                        { tag: "price", type: "data", dataType: "number" }
                    ]
                }
            ]
        }
    }
}
```

---

## 2. Installed App Contracts (`installedAppContracts`)

Contains all contracts from installed third-party applications, organized by app name.

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

- Browse available third-party contracts
- Understand what data installed apps provide
- Select app components to use on pages

### Example

```typescript
{
    "ShopifyApp": {
        appName: "ShopifyApp",
        module: "@shopify/jay-app",
        pages: [
            {
                pageName: "product-catalog",
                contractSchema: {
                    name: "shopify-catalog",
                    tags: [
                        { tag: "products", type: "sub-contract", repeated: true, tags: [...] },
                        { tag: "categories", type: "data", dataType: "string[]" }
                    ]
                }
            }
        ],
        components: [
            {
                componentName: "shopping-cart",
                contractSchema: {
                    name: "cart",
                    tags: [
                        { tag: "items", type: "sub-contract", repeated: true, tags: [...] },
                        { tag: "total", type: "data", dataType: "number" }
                    ]
                }
            }
        ]
    }
}
```

---

## 3. Full Page Contracts (`fullPageContracts`)

Contains the complete, merged contract for each page - combining the page's own contract with all installed app contracts used on that page.

### Structure

```typescript
interface FullPageContract {
  pageId: string;
  pageName: string;
  pageUrl: string;
  contractSchema: {
    // Single merged schema with ALL tags
    name: string;
    tags: ContractTag[]; // Page tags + all installed app tags
  };
}
```

### Use Case

- **Primary use case for design tools**
- Get the complete picture of all data available on a page
- Design UIs with access to both page and app data
- Single source of truth for what's available

### Example

```typescript
{
    "page-0": {
        pageId: "page-0",
        pageName: "products",
        pageUrl: "/products",
        contractSchema: {
            name: "products",
            tags: [
                // From page's own contract:
                { tag: "pageTitle", type: "data", dataType: "string" },
                { tag: "description", type: "data", dataType: "string" },

                // From ShopifyApp used on this page:
                { tag: "products", type: "sub-contract", repeated: true, tags: [
                    { tag: "name", type: "data", dataType: "string" },
                    { tag: "price", type: "data", dataType: "number" },
                    { tag: "image", type: "data", dataType: "string" }
                ]},

                // From AnalyticsApp used on this page:
                { tag: "viewCount", type: "data", dataType: "number" },
                { tag: "lastViewed", type: "data", dataType: "string" }
            ]
        }
    }
}
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
  link?: string; // For linked sub-contracts: path to contract file (resolved automatically)
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

## Linked Sub-Contracts

Contracts can reference other contract files using the `link` property. **These are automatically resolved** by the API - you'll receive the fully expanded tags.

### In the Contract File (YAML)

```yaml
name: product-page
tags:
  - tag: product
    type: sub-contract
    link: './product-item.jay-contract' # Reference to another file
    required: true
```

### In the API Response

The `link` is resolved and replaced with actual tags:

```typescript
{
    tag: "product",
    type: "sub-contract",
    required: true,
    tags: [  // ← Automatically loaded from product-item.jay-contract
        { tag: "name", type: "data", dataType: "string" },
        { tag: "price", type: "data", dataType: "number" },
        { tag: "image", type: "data", dataType: "string" }
    ]
}
```

**Features:**

- ✅ Works in page contracts
- ✅ Works in installed app contracts
- ✅ Supports nested/recursive links
- ✅ Paths resolved relative to the contract file's directory
- ✅ Graceful fallback if link cannot be resolved

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
  // 1. List all pages and their contracts
  Object.values(response.pageContracts).forEach((page) => {
    console.log(`Page: ${page.pageName} (${page.pageUrl})`);
    if (page.contractSchema) {
      console.log(`  Contract: ${page.contractSchema.name}`);
      console.log(`  Tags: ${page.contractSchema.tags.length}`);
    } else {
      console.log(`  No contract`);
    }
  });

  // 2. List all installed apps
  Object.values(response.installedAppContracts).forEach((app) => {
    console.log(`App: ${app.appName}`);
    console.log(`  Pages: ${app.pages.length}`);
    console.log(`  Components: ${app.components.length}`);
  });

  // 3. Get complete contract for a specific page (RECOMMENDED)
  const productPage = Object.values(response.fullPageContracts).find(
    (p) => p.pageUrl === '/products',
  );

  if (productPage) {
    // This includes everything: page contract + all installed app contracts
    const allTags = productPage.contractSchema.tags;
    console.log(`Complete contract for ${productPage.pageName}:`);
    allTags.forEach((tag) => {
      console.log(`  - ${tag.tag} (${tag.type})`);
    });
  }
} else {
  console.error('Failed to get contracts:', response.error);
}
```

---

## Best Practices

### For Design Tools

**Use `fullPageContracts` as your primary data source:**

- Contains the complete, merged view of all available data
- Single source of truth for UI design
- No need to manually merge page + app contracts

```typescript
// ✅ Recommended
const pageContract = response.fullPageContracts[pageId];
const availableTags = pageContract.contractSchema.tags;

// Design UI using all available tags
availableTags.forEach((tag) => {
  if (tag.type === 'data') {
    // Add data binding option
  } else if (tag.type === 'interactive') {
    // Add interactive element
  }
});
```

### For Contract Browsers/Explorers

**Use all three structures:**

- `pageContracts` - Show page-specific contracts
- `installedAppContracts` - Browse available app contracts
- `fullPageContracts` - Show the complete picture per page

### For Contract Editors

**Use `pageContracts` and `installedAppContracts` separately:**

- Edit page contracts independently
- Browse app contracts (read-only)
- Understand what each source provides

---

## Response Guarantee

- **Always returns all three data structures** (even if empty)
- **Linked sub-contracts are always resolved** before response
- **No manual link resolution needed** on the client side
- **Path resolution is automatic** and works for all contract locations

---

## Error Handling

```typescript
const response = await client.getContracts({ type: 'getContracts' });

if (!response.success) {
  console.error('Error:', response.error);
  // response will still contain empty structures:
  // - pageContracts: {}
  // - installedAppContracts: {}
  // - fullPageContracts: {}
}
```

**Partial failures are logged but don't fail the entire request:**

- Invalid contract file → Warning logged, page included without contract
- Unresolved link → Warning logged, link reference preserved
- Missing installed app → Warning logged, app skipped
