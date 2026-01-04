# Vendor Integration Guide

## Overview

The Jay Stack Dev Server provides a **Vendor-Agnostic Design API** that enables bi-directional synchronization between external visual editors (like Figma, Wix, etc.) and Jay projects. This architecture allows any design tool to serve as a design source for Jay applications.

## Architecture

### Core Concepts

The vendor integration system uses a **Vendor Adapter Pattern** with three main components:

1. **Vendor Client (Plugin)**: A lightweight client (e.g., Figma Plugin) that serializes the editor's document structure and communicates with the Jay Dev Server via the **Editor Server Protocol** (WebSocket-based).

2. **Jay Dev Server**: The central hub that:

   - Provides WebSocket-based Editor Protocol for real-time communication
   - Routes protocol messages to appropriate vendor adapters
   - Stores raw vendor documents as the source of truth
   - Orchestrates conversion to Jay format

3. **Vendor Adapter**: A server-side module that converts between a specific vendor's format and Jay's format.

### Data Flow

```
┌─────────────────┐
│ External Editor │
│   (Figma, Wix)  │
└────────┬────────┘
         │ Serialize
         ▼
┌─────────────────┐
│ Vendor Client   │
│   (Plugin)      │
└────────┬────────┘
         │ WebSocket (Editor Protocol)
         ▼
┌─────────────────┐
│  Jay Dev Server │
│ (Editor Server) │
└────────┬────────┘
         │ Route by vendorId
         ▼
┌─────────────────┐
│ Vendor Adapter  │
│   (Converter)   │
└────────┬────────┘
         │
         ├─► page.figma.json (Source of Truth)
         └─► page.jay-html (Generated Code)
```

## Protocol Messages

The Dev Server uses the **Jay Editor Server Protocol** (WebSocket-based) for communication, ensuring consistency with other Jay editor integrations and providing real-time, efficient communication.

### Export Message (Editor → Jay)

Receives a design document from an external editor, saves it, and converts it to Jay format.

**Message Type**: `export`

**Message Structure**:

```typescript
interface ExportMessage<TVendorDoc> {
  type: 'export';
  vendorId: string; // e.g., 'figma', 'wix'
  pageUrl: string; // e.g., '/home', '/products/:id'
  vendorDoc: TVendorDoc; // Your vendor-specific document (strongly typed!)
}
```

**Response**:

```typescript
interface ExportResponse {
  type: 'export';
  success: boolean;
  vendorSourcePath?: string;
  jayHtmlPath?: string;
  contractPath?: string;
  warnings?: string[];
  error?: string;
}
```

**Flow**:

1. Client sends `ExportMessage` via WebSocket
2. Server saves raw vendor JSON as `page.[vendorId].json`
3. Invokes the vendor adapter's `convert()` method
4. Writes generated `page.jay-html` and optional `page.jay-contract`
5. Returns `ExportResponse` with paths and any warnings

### Import Message (Jay → Editor)

Retrieves the stored vendor document for a page, allowing the editor to reconstruct the design.

**Message Type**: `import`

**Message Structure**:

```typescript
interface ImportMessage<TVendorDoc> {
  type: 'import';
  vendorId: string;
  pageUrl: string;
}
```

**Response**:

```typescript
interface ImportResponse<TVendorDoc> {
  type: 'import';
  success: boolean;
  vendorDoc?: TVendorDoc; // Your vendor document (strongly typed!)
  error?: string;
}
```

## Using the Jay Editor Client

The easiest way to use the protocol is through the `@jay-framework/editor-client` package:

### Installation

```bash
npm install @jay-framework/editor-client
```

### Basic Example

```typescript
import { EditorClient } from '@jay-framework/editor-client';

// Define your vendor document type
interface FigmaDoc {
  name: string;
  nodeId: string;
  type: string;
  children?: FigmaDoc[];
}

// Initialize the client
const client = new EditorClient({
  editorId: 'my-figma-plugin-tab-id',
  portRange: [3101, 3200],
});

// Connect to the dev server
await client.connect();

// Export design to Jay with full type safety!
async function exportToJay(pageUrl: string, figmaDoc: FigmaDoc) {
  const response = await client.export<FigmaDoc>({
    type: 'export',
    vendorId: 'figma',
    pageUrl: pageUrl,
    vendorDoc: figmaDoc, // ✅ TypeScript validates this is FigmaDoc
  });

  if (response.success) {
    console.log('✓ Export successful!');
    console.log('Files created:', response.jayHtmlPath);
  } else {
    console.error('✗ Export failed:', response.error);
  }
}

// Import design from Jay with full type safety!
async function importFromJay(pageUrl: string) {
  const response = await client.import<FigmaDoc>({
    type: 'import',
    vendorId: 'figma',
    pageUrl: pageUrl,
  });

  if (response.success && response.vendorDoc) {
    const figmaDoc = response.vendorDoc; // ✅ Typed as FigmaDoc
    // Rebuild design in Figma from figmaDoc
  }
}

// Clean disconnect
await client.disconnect();
```

## Creating a Vendor Adapter

### Step 1: Define Your Vendor Document Type

Create a TypeScript interface that represents your editor's document structure:

```typescript
// lib/vendor-adapters/myeditor/types.ts

export interface MyEditorDoc {
  name: string;
  version: string;
  nodes: MyEditorNode[];
  // ... other properties specific to your editor
}

export interface MyEditorNode {
  id: string;
  type: 'frame' | 'text' | 'image' | 'button';
  properties: Record<string, any>;
  children?: MyEditorNode[];
}
```

### Step 2: Implement the VendorAdapter Interface

Create an adapter class that implements the `VendorAdapter<T>` interface:

```typescript
// lib/vendor-adapters/myeditor/myeditor-adapter.ts

import { VendorAdapter, ConversionContext, ConversionResult } from '../types';
import { MyEditorDoc } from './types';

export class MyEditorAdapter implements VendorAdapter<MyEditorDoc> {
  readonly vendorId = 'myeditor';

  async convert(editorDoc: MyEditorDoc, context: ConversionContext): Promise<ConversionResult> {
    try {
      // Convert your editor's document structure to Jay HTML
      const jayHtml = this.convertToJayHtml(editorDoc);

      // Optionally generate a contract if needed
      const contract = this.generateContract(editorDoc);

      return {
        success: true,
        jayHtml,
        contract: contract || undefined,
        warnings: [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Conversion failed',
      };
    }
  }

  private convertToJayHtml(doc: MyEditorDoc): string {
    // Your conversion logic here
    // Map your editor's components to Jay components
    // Handle layouts, styles, text, images, etc.

    let jayHtml = '<view>\n';

    for (const node of doc.nodes) {
      jayHtml += this.convertNode(node);
    }

    jayHtml += '</view>\n';

    return jayHtml;
  }

  private convertNode(node: MyEditorNode): string {
    switch (node.type) {
      case 'text':
        return `  <text>${node.properties.content}</text>\n`;
      case 'button':
        return `  <button>${node.properties.label}</button>\n`;
      // ... handle other node types
      default:
        return '';
    }
  }

  private generateContract(doc: MyEditorDoc): string | null {
    // Generate a contract if your editor has interactive elements
    // or data requirements
    if (this.hasInteractiveElements(doc)) {
      return `page {\n  <!-- Contract tags -->\n}\n`;
    }
    return null;
  }

  private hasInteractiveElements(doc: MyEditorDoc): boolean {
    // Check if the document has buttons, forms, etc.
    return doc.nodes.some((n) => n.type === 'button');
  }
}
```

### Step 3: Register Your Adapter

Add your adapter to the global registry:

```typescript
// lib/vendor-adapters/index.ts

export * from './myeditor/myeditor-adapter';
export * from './myeditor/types';

import { MyEditorAdapter } from './myeditor/myeditor-adapter';

export function createVendorRegistry(): VendorAdapterRegistry {
  const registry = new VendorAdapterRegistry();

  // Register built-in adapters
  registry.register(new FigmaAdapter());
  registry.register(new MyEditorAdapter()); // Add your adapter here

  return registry;
}
```

### Step 4: Build Your Editor Plugin/Client

Your editor plugin should:

1. **Serialize the design** into your vendor document format
2. **Connect to the Dev Server** via the Editor Client
3. **Send protocol messages** for export/import
4. **Handle responses** and show success/error messages

Example using the Editor Client:

```typescript
import { EditorClient } from '@jay-framework/editor-client';

// Your editor's document type
interface MyEditorDoc {
  name: string;
  version: string;
  nodes: MyEditorNode[];
}

// Initialize client
const client = new EditorClient({
  editorId: 'my-editor-plugin-id',
  portRange: [3101, 3200],
});

await client.connect();

// Export to Jay
async function publishToJay(pageUrl: string) {
  // 1. Serialize your editor's current design
  const myEditorDoc: MyEditorDoc = serializeCurrentDesign();

  // 2. Send to Jay Dev Server via protocol
  const response = await client.export<MyEditorDoc>({
    type: 'export',
    vendorId: 'myeditor',
    pageUrl: pageUrl,
    vendorDoc: myEditorDoc,
  });

  if (response.success) {
    console.log('Published successfully!');
    if (response.warnings?.length) {
      console.warn('Warnings:', response.warnings);
    }
  } else {
    console.error('Failed:', response.error);
  }
}

// Import from Jay
async function loadFromJay(pageUrl: string) {
  // Retrieve the design from Jay
  const response = await client.import<MyEditorDoc>({
    type: 'import',
    vendorId: 'myeditor',
    pageUrl: pageUrl,
  });

  if (response.success && response.vendorDoc) {
    // Rebuild your editor's design from the vendor document
    rebuildDesignFromDoc(response.vendorDoc);
  } else {
    console.error('Failed to load:', response.error);
  }
}

function serializeCurrentDesign(): MyEditorDoc {
  // Convert your editor's internal state to MyEditorDoc format
  return {
    name: getCurrentPageName(),
    version: '1.0',
    nodes: getAllNodes().map(serializeNode),
  };
}

function rebuildDesignFromDoc(doc: MyEditorDoc) {
  // Convert MyEditorDoc back to your editor's internal state
  clearCanvas();
  doc.nodes.forEach((node) => createNodeInEditor(node));
}
```

## VendorAdapter Interface Reference

### Required Properties

- `vendorId: string` - Unique identifier for your vendor (e.g., 'figma', 'wix')

### Required Methods

#### `convert(vendorDoc: T, context: ConversionContext): Promise<ConversionResult>`

Converts a vendor-specific document to Jay format.

**Parameters**:

- `vendorDoc`: Your typed vendor document
- `context`: Conversion context object containing:
  - `pageDirectory`: Absolute path to the page directory
  - `pageUrl`: The page route (e.g., '/home')
  - `projectRoot`: Project root path
  - `pagesBase`: Pages base path

**Returns**: `ConversionResult` object with:

- `success: boolean` - Whether conversion succeeded
- `jayHtml?: string` - Generated Jay HTML
- `contract?: string` - Optional contract file content
- `error?: string` - Error message if failed
- `warnings?: string[]` - Non-fatal warnings

## File Structure

When a design is exported, files are organized as follows:

```
src/pages/
├── home/
│   ├── page.figma.json      # Source of truth (vendor format)
│   ├── page.jay-html        # Generated Jay HTML
│   ├── page.jay-contract    # Optional contract
│   └── page.ts              # Optional component logic
└── products/
    └── [id]/
        ├── page.figma.json
        ├── page.jay-html
        └── page.jay-contract
```

### File Naming Convention

- Vendor source: `page.[vendorId].json`
- Jay HTML: `page.jay-html`
- Contract: `page.jay-contract`

## Best Practices

### 1. Type Safety

Always use TypeScript generics to ensure type safety:

```typescript
export class MyAdapter implements VendorAdapter<MyDocType> {
  // TypeScript will enforce that convert() receives MyDocType
}
```

### 2. Error Handling

Always wrap conversion logic in try-catch and return structured errors:

```typescript
async convert(doc: MyDoc, context: ConversionContext): Promise<ConversionResult> {
  try {
    // conversion logic
    return { success: true, jayHtml: '...' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

### 3. Incremental Development

Start simple and iterate:

1. **Phase 1**: Convert basic elements (text, containers)
2. **Phase 2**: Add layout support (flexbox, grid)
3. **Phase 3**: Handle styles (colors, fonts, spacing)
4. **Phase 4**: Support images and assets
5. **Phase 5**: Generate contracts for interactive elements

### 4. Validation and Warnings

Use the `warnings` array for non-fatal issues:

```typescript
const warnings: string[] = [];

if (node.type === 'unsupported-element') {
  warnings.push(`Unsupported element type: ${node.type}`);
}

return {
  success: true,
  jayHtml,
  warnings,
};
```

### 5. Preserve Metadata

Store editor-specific metadata in the vendor JSON for perfect round-trips:

```typescript
export interface MyEditorDoc {
  // Core structure
  nodes: Node[];

  // Preserve editor-specific data for import
  metadata: {
    editorVersion: string;
    plugins: string[];
    customSettings: Record<string, any>;
  };
}
```

## Example: Complete Figma Adapter (Conceptual)

```typescript
export class FigmaAdapter implements VendorAdapter<FigmaDoc> {
  readonly vendorId = 'figma';

  async convert(figmaDoc: FigmaDoc, context: ConversionContext): Promise<ConversionResult> {
    const warnings: string[] = [];

    try {
      // Build Jay HTML
      let jayHtml = '<!-- Generated from Figma -->\n<view>\n';

      // Convert Figma AutoLayout to Jay layout
      if (figmaDoc.layout?.mode === 'HORIZONTAL') {
        jayHtml += '  <hstack>\n';
      } else if (figmaDoc.layout?.mode === 'VERTICAL') {
        jayHtml += '  <vstack>\n';
      }

      // Convert children
      for (const child of figmaDoc.children || []) {
        jayHtml += this.convertFigmaNode(child, warnings);
      }

      // Close layout
      if (figmaDoc.layout?.mode === 'HORIZONTAL') {
        jayHtml += '  </hstack>\n';
      } else if (figmaDoc.layout?.mode === 'VERTICAL') {
        jayHtml += '  </vstack>\n';
      }

      jayHtml += '</view>\n';

      // Generate contract if needed
      let contract: string | undefined;
      if (this.hasVariants(figmaDoc)) {
        contract = this.generateFigmaContract(figmaDoc);
      }

      return {
        success: true,
        jayHtml,
        contract,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Conversion failed',
      };
    }
  }

  private convertFigmaNode(node: FigmaNode, warnings: string[]): string {
    switch (node.type) {
      case 'TEXT':
        return `    <text>${node.characters || ''}</text>\n`;

      case 'RECTANGLE':
        const bg = node.style?.backgroundColor || '#FFFFFF';
        return `    <view style="background-color: ${bg}"></view>\n`;

      case 'FRAME':
        // Recursively convert frame children
        let html = '    <view>\n';
        for (const child of node.children || []) {
          html += '  ' + this.convertFigmaNode(child, warnings);
        }
        html += '    </view>\n';
        return html;

      default:
        warnings.push(`Unsupported Figma node type: ${node.type}`);
        return '';
    }
  }

  private hasVariants(doc: FigmaDoc): boolean {
    return doc.componentProperties !== undefined;
  }

  private generateFigmaContract(doc: FigmaDoc): string {
    let contract = 'page {\n';

    // Convert Figma component properties to Jay variants
    for (const [key, prop] of Object.entries(doc.componentProperties || {})) {
      contract += `  variant ${key} {\n`;
      contract += `    // TODO: Define variant options\n`;
      contract += `  }\n`;
    }

    contract += '}\n';
    return contract;
  }
}
```

## Troubleshooting

### Adapter Not Found

**Error**: "No adapter found for vendor: myeditor"

**Solution**: Ensure your adapter is registered in `createVendorRegistry()` in `lib/vendor-adapters/index.ts`

### Large Payloads

**Error**: "Request entity too large"

**Solution**: The server is configured with a 50MB limit. If you need more, adjust the limit in `server.ts`:

```typescript
app.use(express.json({ limit: '100mb' }));
```

### Conversion Failures

If conversion fails but you still want to save the source:

The API saves the vendor JSON **before** attempting conversion, so the source of truth is preserved even if conversion fails.

## Testing Your Adapter

### Unit Tests

Create unit tests for your conversion logic:

```typescript
import { MyEditorAdapter } from './myeditor-adapter';

describe('MyEditorAdapter', () => {
  const adapter = new MyEditorAdapter();

  it('should convert a simple document', async () => {
    const doc = {
      name: 'test',
      nodes: [{ type: 'text', properties: { content: 'Hello' } }],
    };

    const result = await adapter.convert(doc, {
      pageDirectory: '/tmp/test',
      pageUrl: '/test',
      projectRoot: '/project',
      pagesBase: '/project/src/pages',
    });

    expect(result.success).toBe(true);
    expect(result.jayHtml).toContain('<text>Hello</text>');
  });
});
```

### Manual Testing with Editor Client

1. Start the Jay dev server: `npx jay dev`
2. Create a test plugin using the Editor Client:

```typescript
import { EditorClient } from '@jay-framework/editor-client';

const client = new EditorClient({
  editorId: 'test-editor',
  portRange: [3101, 3200],
});

await client.connect();

// Test export
const exportResponse = await client.export({
  type: 'export',
  vendorId: 'myeditor',
  pageUrl: '/test',
  vendorDoc: {
    name: 'Test Page',
    nodes: [],
  },
});

console.log('Export result:', exportResponse);

// Test import
const importResponse = await client.import({
  type: 'import',
  vendorId: 'myeditor',
  pageUrl: '/test',
});

console.log('Import result:', importResponse);

await client.disconnect();
```

## Advanced Topics

### Handling Images

When your editor has images:

1. Extract image data in the plugin
2. Use the existing Editor Server's `saveImage` protocol message to upload images
3. Reference images by URL in the generated Jay HTML

Example:

```typescript
// Save image via protocol
const imageResponse = await client.saveImage({
  type: 'saveImage',
  imageUrl: 'https://example.com/image.png',
  imageName: 'hero-image.png',
});

// Reference in generated Jay HTML
const jayHtml = `<image src="${imageResponse.localPath}" />`;
```

### Supporting Multiple Page Types

If your editor has different page types:

```typescript
async convert(doc: MyDoc, context: ConversionContext): Promise<ConversionResult> {
  if (doc.pageType === 'landing') {
    return this.convertLandingPage(doc, context);
  } else if (doc.pageType === 'product') {
    return this.convertProductPage(doc, context);
  }
  // ...
}
```

### Schema Versioning

Include version info in your vendor document:

```typescript
export interface MyEditorDoc {
  schemaVersion: string;
  // ... other fields
}

// In adapter
async convert(doc: MyEditorDoc, context: ConversionContext) {
  if (doc.schemaVersion === '1.0') {
    return this.convertV1(doc, context);
  } else if (doc.schemaVersion === '2.0') {
    return this.convertV2(doc, context);
  }
  // ...
}
```

## Summary

The Vendor Integration system provides a clean, extensible way to connect any design editor to Jay:

1. **Create types** for your vendor document format
2. **Implement VendorAdapter** with conversion logic
3. **Register your adapter** in the registry
4. **Build a plugin** for your editor using the Editor Client that serializes and communicates via the Editor Protocol
5. **Test** using the Editor Client

The system handles:

- ✅ WebSocket-based real-time communication via Editor Protocol
- ✅ Storing source documents as source of truth
- ✅ Routing protocol messages to the correct adapter
- ✅ File system management
- ✅ Error handling and validation
- ✅ Bi-directional sync (export & import)
- ✅ Full TypeScript type safety with generics

You focus on:

- ✅ Serializing your editor's format
- ✅ Converting to Jay HTML
- ✅ Mapping your editor's concepts to Jay's concepts

## See Also

- [Editor Protocol Documentation](../jay-stack-project-info-api.md) - Core protocol details
- [Creating Vendor Adapters](../../packages/jay-stack/stack-cli/lib/vendor-adapters/README.md) - Implementation guide
- [Editor Client API](https://github.com/jay-framework/jay/tree/main/packages/jay-stack/editor-client) - Client library reference
