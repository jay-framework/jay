# Jay Framework Vendors

This directory contains vendor implementations that convert design tool documents (Figma, Sketch, Adobe XD, etc.) into Jay HTML format.

## Overview

Vendors are **contributed by the community** as part of the Jay Framework open-source project. Each vendor implements a simple interface to transform their native document format into Jay HTML.

## Directory Structure

```
vendors/
├── types.ts          # Vendor interface definition
├── registry.ts       # Vendor registration system
├── index.ts          # Public API
└── figma/            # Figma vendor implementation
    └── index.ts
```

## How It Works

1. **Vendor Registration**: Vendors are statically imported in `registry.ts` and registered at server startup
2. **Export Flow**: When an editor plugin calls `export()`, the server:
   - Saves the vendor document as `page.<vendorId>.json`
   - Looks up the vendor by ID
   - Calls `vendor.convertToJayHtml()` to generate Jay HTML
   - Saves the result to `page.jay-html`

## Vendor Interface

Every vendor must implement this simple interface:

```typescript
interface Vendor<TVendorDoc = any> {
  vendorId: string;

  convertToJayHtml(vendorDoc: TVendorDoc, pageUrl: string): Promise<string>;
}
```

### Parameters

- **`vendorDoc`**: The vendor's native document format (e.g., Figma SectionNode)
- **`pageUrl`**: The page route (e.g., `/home`, `/products`)

### Returns

A Promise that resolves to a **Jay HTML string**.

## Contributing a New Vendor

### Overview

When adding a new vendor, you need to:

1. Define the vendor document type in editor-protocol (single source of truth)
2. Implement the vendor converter (imports the type)
3. Register the vendor

### Step 1: Define Vendor Document Type

**Important**: The vendor document type is defined **ONCE** in the editor-protocol package. This is the single source of truth that both plugins and vendors import from.

#### A. Define in Editor Protocol

Edit `/packages/jay-stack/editor-protocol/lib/vendor-documents.ts`:

```typescript
/**
 * YourVendor Document Type
 *
 * The structure that YourVendor plugins must send when exporting.
 * This is the single source of truth - both plugins and the vendor
 * implementation import from here.
 */
export type YourVendorDocument = {
  // Your vendor's serializable document structure
  id: string;
  name: string;
  nodes: YourVendorNode[];
};

export type YourVendorNode = {
  id: string;
  type: string;
  // ... node properties
};

```

This allows **both plugin developers AND the vendor implementation** to import:

```typescript
import { YourVendorDocument } from '@jay-framework/editor-protocol';
```

### Step 2: Implement the Vendor

Create `your-vendor-id/index.ts` and **import** the type:

```typescript
import { Vendor } from '../types';
import type { YourVendorDocument } from '@jay-framework/editor-protocol';

/**
 * YourVendor Implementation
 *
 * Imports YourVendorDocument from @jay-framework/editor-protocol,
 * which is the single source of truth.
 */

export const yourVendorVendor: Vendor<YourVendorDocument> = {
  vendorId: 'your-vendor-id',

  async convertToJayHtml(vendorDoc: YourVendorDocument, pageUrl: string): Promise<string> {
    // Parse vendor document
    const elements = parseVendorDocument(vendorDoc);

    // Generate Jay HTML
    const jayHtml = generateJayHtml(elements);

    return jayHtml;
  },
};

function parseVendorDocument(doc: YourVendorDocument) {
  // Your parsing logic
  return [];
}

function generateJayHtml(elements: any[]): string {
  // Your Jay HTML generation logic
  return '<section>...</section>';
}
```

**Key Points:**

- ✅ **Import the type** from `@jay-framework/editor-protocol`
- ✅ **No duplicate definitions** - there's only one source of truth
- ✅ **Use `import type`** for type-only imports (better for tree-shaking)
  vendorId: 'your-vendor-id',
      async convertToJayHtml(
          vendorDoc: YourVendorDocument,
          pageUrl: string,
      ): Promise<string> {
          // Parse vendor document
          const elements = parseVendorDocument(vendorDoc);

          // Generate Jay HTML
          const jayHtml = generateJayHtml(elements);

          return jayHtml;
      },
  };

function parseVendorDocument(doc: YourVendorDocument) {
// Your parsing logic
return [];
}

function generateJayHtml(elements: any[]): string {
// Your Jay HTML generation logic
return '<section>...</section>';
}

````

### Step 3: Create Vendor README

Create `your-vendor-id/README.md`:

```markdown
# YourVendor Vendor

Converts YourVendor documents to Jay HTML.

## For Plugin Developers

Import the document type from editor protocol:

\`\`\`typescript
import { YourVendorDocument } from '@jay-framework/editor-protocol';

const vendorDoc: YourVendorDocument = {
    id: 'doc-123',
    name: 'My Page',
    nodes: [...]
};

await editorProtocol.export({
    vendorId: 'your-vendor-id',
    pageUrl: '/home',
    vendorDoc
});
\`\`\`

## Document Structure

See the type definition in `@jay-framework/editor-protocol/lib/vendor-documents.ts`.
````

### Step 4: Register Your Vendor

Edit `registry.ts`:

```typescript
// Add import
import { yourVendorVendor } from './your-vendor-id';

// Add to registry Map
const vendorRegistry = new Map<string, Vendor>([
  [figmaVendor.vendorId, figmaVendor],
  [yourVendorVendor.vendorId, yourVendorVendor], // Add your vendor here
]);
```

### Step 5: Test Your Vendor

1. Build the package:

   ```bash
   cd /Users/noamsi/projects/jay/packages/jay-stack/stack-cli
   npm run build
   ```

2. Start a dev server:

   ```bash
   jay dev
   ```

3. Look for your vendor in the startup logs:

   ```
   📦 Initializing vendors...
   ✅ Registered vendor: figma
   ✅ Registered vendor: your-vendor-id
   ```

4. Test export from your editor plugin

## Example: Figma Vendor

See `figma/index.ts` for a complete example implementation.

```typescript
export const figmaVendor: Vendor<FigmaDocument> = {
  vendorId: 'figma',

  async convertToJayHtml(vendorDoc, pageUrl) {
    console.log(`Converting Figma document for page: ${pageUrl}`);

    // Parse Figma document
    const elements = parseFigmaNodes(vendorDoc);

    // Generate Jay HTML
    const jayHtml = generateJayHtmlFromElements(elements);

    return jayHtml;
  },
};
```

## Best Practices

### 1. Single Source of Truth

**The vendor document type is defined ONCE** in `editor-protocol/lib/vendor-documents.ts`. Both plugins and vendors import from there:

```typescript
// ✅ CORRECT - Import from editor-protocol (single source of truth)
import type { MyVendorDocument } from '@jay-framework/editor-protocol';

export const myVendor: Vendor<MyVendorDocument> = {
  // Implementation uses imported type
};

// ❌ WRONG - Don't redefine the type locally
export type MyVendorDocument = {
  /* ... */
}; // DON'T DO THIS
```

**Why?**

- **No duplication** - type is defined once
- **Always in sync** - impossible to have mismatches
- **Single update point** - change in one place updates everywhere
- **Follows DRY principle** - Don't Repeat Yourself

### 2. Use `type` for Vendor Documents, Not `interface`

In the editor-protocol, use `type` instead of `interface` for vendor documents:

```typescript
// ✅ CORRECT - Use 'type' for serializable data
export type MyVendorDocument = {
  name: string;
  nodes: MyVendorNode[];
};

// ❌ WRONG - Don't use 'interface' for data sent over network
interface MyVendorDocument {
  name: string;
  nodes: MyVendorNode[];
}
```

**Why?**

- `type` is more explicit about being a data structure
- `type` makes it clear this is serializable data, not an API contract
- Follows TypeScript best practices for data transfer objects (DTOs)

### 3. Use `import type` for Type-Only Imports

When importing vendor document types, use `import type`:

```typescript
// ✅ CORRECT - Type-only import (better for tree-shaking)
import type { MyVendorDocument } from '@jay-framework/editor-protocol';

// ⚠️ OK but not optimal - Regular import
import { MyVendorDocument } from '@jay-framework/editor-protocol';
```

### 4. Type Safety

    } catch (error) {
        throw new Error(`Failed to generate Jay HTML: ${error.message}`);
    }

}

````

### 3. Logging

Add console logs to help with debugging:

```typescript
async convertToJayHtml(vendorDoc, pageUrl) {
    console.log(`Converting ${this.vendorId} document for ${pageUrl}`);
    console.log(`Document has ${vendorDoc.nodes.length} nodes`);

    const jayHtml = generateJayHtml(vendorDoc);

    console.log(`Generated ${jayHtml.length} characters of Jay HTML`);
    return jayHtml;
}
````

### 4. Semantic HTML

Generate proper semantic HTML:

```typescript
function generateJayHtml(doc: MyVendorDoc): string {
  // Use semantic tags
  let html = '<section>\n';

  for (const node of doc.nodes) {
    if (node.type === 'heading') {
      html += `  <h1>${node.text}</h1>\n`;
    } else if (node.type === 'paragraph') {
      html += `  <p>${node.text}</p>\n`;
    }
  }

  html += '</section>';
  return html;
}
```

### 5. Handle Edge Cases

Account for various document structures:

```typescript
async convertToJayHtml(vendorDoc, pageUrl) {
    // Handle empty document
    if (!vendorDoc.nodes || vendorDoc.nodes.length === 0) {
        return '<section><p>Empty page</p></section>';
    }

    // Handle unsupported features gracefully
    const supportedNodes = vendorDoc.nodes.filter(node =>
        ['text', 'frame', 'image'].includes(node.type)
    );

    return generateJayHtml(supportedNodes);
}
```

## Testing

### Unit Tests

Create unit tests for your vendor:

```typescript
import { yourVendor } from './your-vendor-id';

describe('YourVendor', () => {
  it('should convert basic document', async () => {
    const doc = { nodes: [{ type: 'text', text: 'Hello' }] };
    const html = await yourVendor.convertToJayHtml(doc, '/test');

    expect(html).toContain('Hello');
  });

  it('should handle empty document', async () => {
    const doc = { nodes: [] };
    const html = await yourVendor.convertToJayHtml(doc, '/test');

    expect(html).toBeTruthy();
  });
});
```

### Integration Tests

Test the full export flow:

1. Start dev server
2. Call export API from plugin
3. Verify `page.jay-html` is created
4. Verify HTML is valid

## Architecture

```
┌─────────────────┐
│  Editor Plugin  │
│  (Figma/etc.)   │
└────────┬────────┘
         │ export({ vendorId, vendorDoc, pageUrl })
         ▼
┌─────────────────────────┐
│   Editor Protocol       │
└────────┬────────────────┘
         ▼
┌─────────────────────────┐
│   onExport Handler      │
│   1. Save JSON          │
│   2. Lookup vendor      │
│   3. Call convertToJayHtml
└────────┬────────────────┘
         ▼
┌─────────────────────────┐
│   Vendor Registry       │
│   getVendor(vendorId)   │
└────────┬────────────────┘
         ▼
┌─────────────────────────┐
│   Your Vendor           │
│   convertToJayHtml()    │
│   Returns: string       │
└────────┬────────────────┘
         ▼
┌─────────────────────────┐
│   Save to File System   │
│   page.jay-html         │
└─────────────────────────┘
```

## FAQ

### Q: Where should vendor code live?

**A:** In the Jay Framework repository under `packages/jay-stack/stack-cli/lib/vendors/`. Vendors contribute their implementations as part of the open-source project.

### Q: Can vendors have dependencies?

**A:** Yes, add them to `packages/jay-stack/stack-cli/package.json`.

### Q: How do I handle vendor-specific types?

**A:** Import types from your vendor's SDK (e.g., `@figma/plugin-typings`) or define your own interfaces.

### Q: What if conversion fails?

**A:** Throw an error with a descriptive message. The framework will catch it and return it in the export response.

### Q: Can I generate multiple files?

**A:** The current interface returns a single HTML string that gets saved to `page.jay-html`. If you need to generate additional files (like contracts), please open an issue to discuss the requirements.

### Q: How do I debug my vendor?

**A:** Add `console.log()` statements. They will appear in the dev server console when export is called.

## Contributing

1. Fork the Jay Framework repository
2. Create your vendor implementation
3. Add tests
4. Submit a pull request
5. Maintainers will review and merge

## Resources

- [Jay Framework Documentation](https://github.com/jay-framework/jay)
- [Editor Protocol Specification](../../editor-protocol/README.md)
- [Example: Figma Vendor](./figma/index.ts)

## License

Same as Jay Framework - check the root LICENSE file.
