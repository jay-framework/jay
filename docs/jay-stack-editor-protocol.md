# Jay Stack Editor Protocol

## Overview

The Jay Stack Editor Protocol enables bidirectional communication between external design tools (like Figma, Wix, Sketch) and the Jay dev server. This protocol allows design tools to:

- **Publish** pages and components to your Jay project
- **Query** project structure, pages, components, and installed plugins
- **Save and retrieve images** for design assets
- **Export/Import** vendor-specific documents alongside Jay pages
- **Sync** design changes in real-time

## Installation

```bash
npm install @jay-framework/editor-client @jay-framework/editor-protocol
# or
yarn add @jay-framework/editor-client @jay-framework/editor-protocol
```

## Quick Start

```typescript
import { createEditorClient } from '@jay-framework/editor-client';

// Create and connect the client
const client = createEditorClient({
  portRange: [3101, 3200],
  editorId: 'figma-plugin-123',
});

await client.connect();

// Now you can use the protocol APIs
const projectInfo = await client.getProjectInfo({ type: 'getProjectInfo' });
```

## Protocol APIs

### 1. Publish API

Publish pages and components from your design tool to the Jay project.

#### Publishing a Page

```typescript
import { createPublishMessage } from '@jay-framework/editor-protocol';

const response = await client.publish(
  createPublishMessage([
    {
      route: '/products/:id',
      jayHtml: '<div>Product page content</div>',
      name: 'Product Page',
      contract: 'contract ProductPage { ... }', // Optional
    },
  ]),
);

if (response.success) {
  console.log('Page published:', response.status[0].filePath);
  // Output: src/pages/products/[id]/page.jay-html
}
```

**Note**: Dynamic route parameters are automatically converted:

- URL format: `/products/:id` → Filesystem: `src/pages/products/[id]/`

#### Publishing a Component

```typescript
const response = await client.publish(
  createPublishMessage(
    [],
    [
      {
        name: 'ProductCard',
        jayHtml: '<div>Product card content</div>',
        contract: 'contract ProductCard { ... }', // Optional
      },
    ],
  ),
);
```

### 2. Project Info API

Retrieve comprehensive project information in a single call.

```typescript
const response = await client.getProjectInfo({ type: 'getProjectInfo' });

if (response.success) {
  const { info } = response;

  console.log(`Project: ${info.name}`);
  console.log(`Pages: ${info.pages.length}`);
  console.log(`Components: ${info.components.length}`);
  console.log(`Plugins: ${info.plugins.length}`);

  // Access page details
  info.pages.forEach((page) => {
    console.log(`- ${page.name} (${page.url})`);

    // Page's own contract
    if (page.contract) {
      console.log(`  Contract: ${page.contract.tags.length} tags`);
    }

    // Used headless components
    if (page.usedComponents.length > 0) {
      console.log(`  Uses: ${page.usedComponents.length} components`);
    }
  });
}
```

**See the [Project Info API documentation](./jay-stack-project-info-api.md) for complete details.**

### 3. Export/Import API

Save and retrieve vendor-specific documents alongside Jay pages.

#### Export: Save Vendor Document

When publishing a page from your design tool, you can save the original design document:

```typescript
import { createExportMessage } from '@jay-framework/editor-protocol';

// Define your vendor document type
interface FigmaDocument {
  nodeId: string;
  name: string;
  type: 'FRAME' | 'COMPONENT';
  layers: any[];
}

// Create the document
const figmaDoc: FigmaDocument = {
  nodeId: 'abc-123-def',
  name: 'Homepage Design',
  type: 'FRAME',
  layers: [
    /* ... */
  ],
};

// Export it
const response = await client.export(
  createExportMessage<FigmaDocument>(
    'figma', // vendorId - identifies your editor
    '/home', // pageUrl - route of the page
    figmaDoc, // your vendor document
  ),
);

if (response.success) {
  console.log('Document saved at:', response.vendorSourcePath);
  // Output: src/pages/home/page.figma.json
}
```

#### Import: Retrieve Vendor Document

When reopening a page, retrieve the previously saved vendor document:

```typescript
import { createImportMessage } from '@jay-framework/editor-protocol';

const response = await client.import<FigmaDocument>(
  createImportMessage<FigmaDocument>(
    'figma', // vendorId - must match export
    '/home', // pageUrl - route of the page
  ),
);

if (response.success && response.vendorDoc) {
  const figmaDoc = response.vendorDoc;

  // Restore your editor state from the saved document
  console.log('Restored design:', figmaDoc.name);
  console.log('Node ID:', figmaDoc.nodeId);

  // Use the document to restore node references, layers, etc.
  restoreFigmaDesign(figmaDoc);
} else {
  console.log('No saved document found (new page)');
}
```

#### File Organization

Vendor documents are saved as `page.<vendorId>.json` alongside Jay files:

```
src/pages/
  home/
    ├── page.jay-html           # Jay HTML file
    ├── page.jay-html.d.ts      # TypeScript definitions
    ├── page.jay-contract       # Contract file (optional)
    └── page.figma.json         # Vendor document (exported)
  products/
    [id]/
      ├── page.jay-html
      ├── page.jay-html.d.ts
      └── page.wix.json         # Different vendor
```

#### Complete Workflow Example

```typescript
class FigmaToJayPlugin {
  private client = createEditorClient({
    portRange: [3101, 3200],
    editorId: figma.root.id,
  });

  async initialize() {
    await this.client.connect();
  }

  /**
   * Export Figma design to Jay
   */
  async exportToJay(nodeId: string, pageRoute: string) {
    // 1. Convert Figma node to Jay HTML
    const node = figma.getNodeById(nodeId);
    const jayHtml = convertFigmaToJayHtml(node);

    // 2. Create Figma document to save
    const figmaDoc: FigmaDocument = {
      nodeId: node.id,
      name: node.name,
      layers: serializeFigmaNode(node),
    };

    // 3. Publish the Jay HTML
    const publishResponse = await this.client.publish(
      createPublishMessage([
        {
          route: pageRoute,
          jayHtml: jayHtml,
          name: node.name,
        },
      ]),
    );

    if (!publishResponse.success) {
      throw new Error('Failed to publish page');
    }

    // 4. Export the Figma document
    const exportResponse = await this.client.export(
      createExportMessage<FigmaDocument>('figma', pageRoute, figmaDoc),
    );

    console.log('✅ Exported to Jay:', publishResponse.status[0].filePath);
    console.log('📦 Saved Figma doc:', exportResponse.vendorSourcePath);
  }

  /**
   * Import Jay page back to Figma
   */
  async importFromJay(pageRoute: string) {
    // 1. Import the Figma document
    const importResponse = await this.client.import<FigmaDocument>(
      createImportMessage<FigmaDocument>('figma', pageRoute),
    );

    if (!importResponse.success || !importResponse.vendorDoc) {
      throw new Error('No Figma document found for this page');
    }

    const figmaDoc = importResponse.vendorDoc;

    // 2. Check if the node still exists in Figma
    const existingNode = figma.getNodeById(figmaDoc.nodeId);

    if (existingNode) {
      // Node exists - select it
      figma.currentPage.selection = [existingNode as SceneNode];
      figma.viewport.scrollAndZoomIntoView([existingNode as SceneNode]);
      console.log('✅ Found existing Figma node:', figmaDoc.name);
    } else {
      // Node doesn't exist - could recreate from saved data
      console.log('⚠️ Original Figma node not found, but document data available');
    }

    return figmaDoc;
  }
}
```

**For complete export/import documentation, see:**

- Quick reference: `/packages/jay-stack/editor-protocol/QUICK_REFERENCE.md`
- Complete guide: `/packages/jay-stack/editor-protocol/EXPORT_IMPORT_GUIDE.md`
- Implementation details: `/packages/jay-stack/editor-protocol/IMPLEMENTATION_SUMMARY.md`

### 4. Vendors: Automatic Conversion to Jay HTML

The Jay Framework includes a **Vendor System** that automatically converts vendor-specific documents (like Figma, Sketch, Adobe XD) into Jay HTML when the export API is called.

#### Overview

When you call the `export()` API:

1. Your vendor document is saved as `page.<vendorId>.json`
2. If a vendor converter exists for your `vendorId`, it automatically runs
3. The converter generates `page.jay-html` from your document
4. You get back paths to both files in the response

#### How It Works

```typescript
import { FigmaVendorDocument } from '@jay-framework/editor-protocol';

// 1. Define your vendor document (using the official type)
const vendorDoc: FigmaVendorDocument = {
  type: selectedNode.type,
  name: selectedNode.name,
  children: selectedNode.children,
};

// 2. Call export
const response = await client.export({
  type: 'export',
  vendorId: 'figma',
  pageUrl: '/home',
  vendorDoc,
});

// 3. Vendor automatically converts to Jay HTML
if (response.success) {
  console.log('Vendor JSON:', response.vendorSourcePath); // page.figma.json
  console.log('Jay HTML:', response.jayHtmlPath); // page.jay-html (auto-generated!)
}
```

#### Vendor Document Types

Each vendor defines a document type that plugins must use. Import these types from `@jay-framework/editor-protocol`:

```typescript
// Figma
import { FigmaVendorDocument } from '@jay-framework/editor-protocol';

// Sketch
import { SketchVendorDocument } from '@jay-framework/editor-protocol';

// Adobe XD
import { XdVendorDocument } from '@jay-framework/editor-protocol';

// All vendor documents
import { AnyVendorDocument, VendorDocumentMap } from '@jay-framework/editor-protocol';
```

**Type Safety**: TypeScript will validate that your `vendorDoc` matches the expected type for your `vendorId`.

#### Example: Figma Plugin with Vendor

```typescript
import { createEditorClient } from '@jay-framework/editor-client';
import { FigmaVendorDocument } from '@jay-framework/editor-protocol';

class FigmaPlugin {
  private client = createEditorClient({ editorId: figma.root.id });

  async exportPage(node: SectionNode, pageUrl: string) {
    await this.client.connect();

    // Create vendor document using official type
    const vendorDoc: FigmaVendorDocument = {
      type: node.type,
      name: node.name,
      children: node.children.map((child) => ({
        // ... serialize Figma node
      })),
    };

    // Export - vendor will automatically convert to Jay HTML
    const response = await this.client.export({
      type: 'export',
      vendorId: 'figma',
      pageUrl,
      vendorDoc,
    });

    if (response.success) {
      figma.notify(`✅ Exported! Jay HTML created at: ${response.jayHtmlPath}`);
    }
  }
}
```

#### File Organization with Vendors

When a vendor converter runs, it creates both files:

```
src/pages/
  home/
    ├── page.figma.json      # Your vendor document (saved by export API)
    ├── page.jay-html        # Jay HTML (generated by Figma vendor)
    └── page.jay-html.d.ts   # TypeScript definitions
```

#### Available Vendors

The following vendors are built into the Jay Framework:

- **Figma** (`vendorId: 'figma'`) - Converts Figma SectionNodes to Jay HTML
- **Sketch** (`vendorId: 'sketch'`) - Coming soon
- **Adobe XD** (`vendorId: 'xd'`) - Coming soon

#### Contributing a Vendor

Vendors are part of the Jay Framework open-source project. To contribute a new vendor:

**Step 1: Define Document Type** in `@jay-framework/editor-protocol`

```typescript
// packages/jay-stack/editor-protocol/lib/vendor-documents.ts
export type MyVendorDocument = {
  id: string;
  name: string;
  elements: MyVendorElement[];
};

export type MyVendorElement = {
  id: string;
  type: string;
};

// Add to union and map
export type AnyVendorDocument = FigmaVendorDocument | MyVendorDocument;

export type VendorDocumentMap = {
  figma: FigmaVendorDocument;
  'my-vendor': MyVendorDocument;
};
```

**Step 2: Implement Converter** in `@jay-framework/stack-cli`

```typescript
// packages/jay-stack/stack-cli/lib/vendors/my-vendor/index.ts
import { Vendor } from '../types';
import type { MyVendorDocument } from '@jay-framework/editor-protocol';

export const myVendorVendor: Vendor<MyVendorDocument> = {
  vendorId: 'my-vendor',

  async convertToJayHtml(vendorDoc, pageUrl) {
    // Parse your vendor document
    const elements = parseVendorDocument(vendorDoc);

    // Generate Jay HTML
    const jayHtml = generateJayHtml(elements);

    return jayHtml;
  },
};

function parseVendorDocument(doc: MyVendorDocument) {
  // Your parsing logic
  return doc.elements.map(/* ... */);
}

function generateJayHtml(elements: any[]): string {
  // Your Jay HTML generation logic
  return '<section>...</section>';
}
```

**Step 3: Register Vendor**

```typescript
// packages/jay-stack/stack-cli/lib/vendors/registry.ts
import { myVendorVendor } from './my-vendor';

const vendorRegistry = new Map<string, Vendor>([
  [figmaVendor.vendorId, figmaVendor],
  [myVendorVendor.vendorId, myVendorVendor], // Add here
]);
```

**For complete vendor contribution guidelines, see:**

- **[Vendors README](../packages/jay-stack/stack-cli/lib/vendors/README.md)** - Complete guide
- **[Figma Vendor Example](../packages/jay-stack/stack-cli/lib/vendors/figma/)** - Reference implementation
- **[Vendor Types](../packages/jay-stack/editor-protocol/lib/vendor-documents.ts)** - Document type definitions

#### Vendor API Response

When a vendor converter runs successfully:

```typescript
interface ExportResponse {
  type: 'export';
  success: true;
  vendorSourcePath: string; // '/path/to/page.figma.json'
  jayHtmlPath?: string; // '/path/to/page.jay-html' (if vendor converted it)
  warnings?: string[]; // Conversion warnings (if any)
}
```

If no vendor exists for your `vendorId`, only the JSON is saved:

```typescript
{
    type: 'export',
    success: true,
    vendorSourcePath: '/path/to/page.my-vendor.json'
    // No jayHtmlPath - no converter available
}
```

#### Benefits

1. **Automatic Conversion**: No manual Jay HTML generation needed
2. **Type Safety**: Vendor document types validated by TypeScript
3. **Single Source**: Vendor JSON is saved for future import
4. **Extensible**: New vendors can be added as community contributions
5. **Backward Compatible**: Export works even without a vendor converter
6. **Open Source**: Vendors are contributed to the Jay Framework

### 5. Image Management API

Save and check for design assets (images) in your project.

#### Save Image

```typescript
import { createSaveImageMessage } from '@jay-framework/editor-protocol';

// Get image data as base64
const imageData = await node.exportAsync({ format: 'PNG' });
const base64 = arrayBufferToBase64(imageData);

const response = await client.saveImage(
  createSaveImageMessage(
    'unique-image-id', // Use node ID or hash
    base64, // Base64-encoded image data
  ),
);

if (response.success) {
  console.log('Image saved:', response.imageUrl);
  // Output: /images/unique-image-id.png
}
```

#### Check if Image Exists

```typescript
import { createHasImageMessage } from '@jay-framework/editor-protocol';

const response = await client.hasImage(createHasImageMessage('unique-image-id'));

if (response.exists) {
  console.log('Image already exists:', response.imageUrl);
  // No need to upload again
} else {
  // Upload the image
  await client.saveImage(/* ... */);
}
```

## TypeScript Type Safety

All protocol messages and responses are fully typed:

```typescript
import type {
  PublishMessage,
  PublishResponse,
  ExportMessage,
  ExportResponse,
  ImportMessage,
  ImportResponse,
  GetProjectInfoMessage,
  GetProjectInfoResponse,
  SaveImageMessage,
  SaveImageResponse,
  HasImageMessage,
  HasImageResponse,
} from '@jay-framework/editor-protocol';

// Define your vendor document interface
interface MyVendorDoc {
  version: string;
  nodeId: string;
  timestamp: number;
  metadata: {
    exportedBy: string;
    toolVersion: string;
  };
}

// Type-safe export
const exportMessage = createExportMessage<MyVendorDoc>('my-tool', '/home', myDoc);

// Type-safe import
const importResponse = await client.import<MyVendorDoc>(
  createImportMessage<MyVendorDoc>('my-tool', '/home'),
);

if (importResponse.success && importResponse.vendorDoc) {
  // importResponse.vendorDoc is typed as MyVendorDoc
  console.log(importResponse.vendorDoc.version);
}
```

## Page Configuration

Pages can be configured using `page.conf.yaml` to define headless component dependencies without a jay-html file.

```yaml
# src/pages/products/[id]/page.conf.yaml
used_components:
  - plugin: wix-stores
    contract: product-page
    key: product
```

**See the [Page Configuration documentation](./jay-stack-page-configuration.md) for complete details.**

## Error Handling

Always handle errors gracefully:

```typescript
try {
  const response = await client.publish(message);

  if (!response.success) {
    console.error('Publish failed:', response.error);
    // Show user-friendly error
    showNotification('Failed to publish: ' + response.error, 'error');
  } else {
    showNotification('✅ Published successfully', 'success');
  }
} catch (error) {
  console.error('Connection error:', error);
  showNotification('Connection error. Is the dev server running?', 'error');
}
```

### Error Response Types

```typescript
// Publish errors
if (!publishResponse.success) {
  // Check individual status for each page/component
  publishResponse.status.forEach((status, index) => {
    if (!status.success) {
      console.error(`Failed to publish item ${index}:`, status.error);
    }
  });
}

// Export/Import errors
if (!exportResponse.success) {
  console.error('Export failed:', exportResponse.error);
}

// Import may fail if document doesn't exist (not an error for new pages)
if (!importResponse.success) {
  console.log('No saved document found, starting fresh');
}
```

## Connection Management

The editor client manages the WebSocket connection automatically:

```typescript
const client = createEditorClient({
  portRange: [3101, 3200],
  editorId: 'unique-editor-id',
  reconnect: true, // Auto-reconnect on disconnect
  reconnectInterval: 3000, // Reconnect delay in ms
});

// Connect to dev server
await client.connect();

// Check connection status
if (client.isConnected()) {
  // Ready to send messages
}

// Disconnect when done
await client.disconnect();
```

## Vendor ID Best Practices

Choose a clear, unique vendor ID for your design tool:

- **Figma**: `'figma'`
- **Wix**: `'wix'`
- **Sketch**: `'sketch'`
- **Adobe XD**: `'xd'`
- **Custom Tool**: `'my-design-tool'`

Use lowercase, kebab-case identifiers:

- ✅ `'figma'`, `'wix'`, `'sketch'`, `'adobe-xd'`
- ❌ `'Figma'`, `'FIGMA'`, `'figma_plugin'`

## Common Patterns

### Pattern 1: Sync on Save

Automatically sync to Jay when user saves in the design tool:

```typescript
// Listen for save events in your design tool
figma.on('save', async () => {
  const selection = figma.currentPage.selection[0];

  if (selection) {
    await plugin.exportToJay(selection.id, '/home');
    figma.notify('✅ Synced to Jay');
  }
});
```

### Pattern 2: Restore on Open

Restore design state when opening a Jay page:

```typescript
async function openPage(pageRoute: string) {
  try {
    // Try to import existing vendor document
    const response = await client.import<FigmaDocument>(
      createImportMessage<FigmaDocument>('figma', pageRoute),
    );

    if (response.success && response.vendorDoc) {
      // Restore from saved document
      restoreDesign(response.vendorDoc);
    } else {
      // Start fresh
      startNewDesign(pageRoute);
    }
  } catch (error) {
    console.error('Failed to open page:', error);
  }
}
```

### Pattern 3: Two-Way Sync

Keep design tool and Jay project in sync:

```typescript
class JaySync {
  private watcher: FileWatcher;

  async startWatching() {
    // Watch for changes in Jay project
    this.watcher = watchJayProject((event) => {
      if (event.type === 'page-updated') {
        this.onJayPageUpdated(event.pageUrl);
      }
    });
  }

  async onJayPageUpdated(pageUrl: string) {
    // Import updated Jay page
    const response = await client.import<MyVendorDoc>(
      createImportMessage<MyVendorDoc>('my-tool', pageUrl),
    );

    if (response.success && response.vendorDoc) {
      // Update design tool
      updateDesign(response.vendorDoc);
    }
  }

  async onDesignUpdated(nodeId: string, pageUrl: string) {
    // Export updated design to Jay
    await this.exportToJay(nodeId, pageUrl);
  }
}
```

## Protocol Messages Reference

### Publish Message

```typescript
interface PublishMessage {
  type: 'publish';
  pages?: Array<{
    route: string; // e.g., '/home', '/products/:id'
    jayHtml: string; // Jay HTML content
    name: string; // Display name
    contract?: string; // Optional contract content
  }>;
  components?: Array<{
    name: string; // Component name
    jayHtml: string; // Jay HTML content
    contract?: string; // Optional contract content
  }>;
}
```

### Export Message

```typescript
interface ExportMessage<TVendorDoc> {
  type: 'export';
  vendorId: string; // Your tool identifier
  pageUrl: string; // Page route
  vendorDoc: TVendorDoc; // Your document data
}
```

### Import Message

```typescript
interface ImportMessage<TVendorDoc> {
  type: 'import';
  vendorId: string; // Your tool identifier
  pageUrl: string; // Page route
}
```

### Get Project Info Message

```typescript
interface GetProjectInfoMessage {
  type: 'getProjectInfo';
}
```

### Save Image Message

```typescript
interface SaveImageMessage {
  type: 'saveImage';
  imageId: string; // Unique identifier
  imageData: string; // Base64-encoded image
}
```

### Has Image Message

```typescript
interface HasImageMessage {
  type: 'hasImage';
  imageId: string; // Unique identifier
}
```

## Best Practices

### 1. Use TypeScript

Define clear interfaces for your vendor documents:

```typescript
interface FigmaDocument {
  version: string;
  nodeId: string;
  name: string;
  timestamp: number;
  layers: FigmaLayer[];
  metadata: {
    exportedBy: string;
    figmaFileKey: string;
  };
}
```

### 2. Handle Connection Errors

Always check if the dev server is running:

```typescript
try {
  await client.connect();
} catch (error) {
  showErrorMessage('Cannot connect to Jay dev server. Please start it with: jay dev');
  return;
}
```

### 3. Optimize Image Upload

Check if images exist before uploading:

```typescript
// Check first
const hasImage = await client.hasImage(createHasImageMessage(imageId));

if (!hasImage.exists) {
  // Only upload if not already present
  await client.saveImage(createSaveImageMessage(imageId, imageData));
}
```

### 4. Save Complete Context

Save enough information to restore your design tool's state:

```typescript
interface MyVendorDoc {
  // Essential identifiers
  nodeId: string;
  documentId: string;

  // Layout information
  position: { x: number; y: number };
  size: { width: number; height: number };

  // Style information
  colors: string[];
  fonts: string[];

  // Hierarchy
  children: MyVendorDoc[];

  // Metadata
  timestamp: number;
  version: string;
}
```

### 5. Version Your Documents

Include version information for backward compatibility:

```typescript
interface MyVendorDoc {
  version: string; // '1.0.0'
  // ... other fields
}

// When importing
const doc = importResponse.vendorDoc;

if (doc.version === '1.0.0') {
  // Handle version 1.0.0
} else if (doc.version === '2.0.0') {
  // Handle version 2.0.0
}
```

## Next Steps

1. **Start the dev server**: `jay dev`
2. **Create your editor plugin**: Use the client library
3. **Implement export**: Save your designs to Jay
4. **Implement import**: Restore designs from Jay
5. **Test the workflow**: Export, close, import, verify

## Related Documentation

- [Project Info API](./jay-stack-project-info-api.md) - Complete project information API
- [Page Configuration](./jay-stack-page-configuration.md) - Configuring pages with `page.conf.yaml`
- [Contract Files](./core/contract-files.md) - Understanding Jay contracts
- [Jay HTML Format](./core/jay-html.md) - Jay HTML syntax reference
- [Editor Protocol Package](../packages/jay-stack/editor-protocol/readme.md) - Protocol package documentation
- [Export/Import Guide](../packages/jay-stack/editor-protocol/EXPORT_IMPORT_GUIDE.md) - Detailed export/import examples
- [Quick Reference](../packages/jay-stack/editor-protocol/QUICK_REFERENCE.md) - Quick API reference
- **[Vendors System](../packages/jay-stack/stack-cli/lib/vendors/README.md)** - Complete vendor contribution guide
- **[Vendor Document Types](../packages/jay-stack/editor-protocol/lib/vendor-documents.ts)** - Vendor document type definitions

---

**Need help?** Check the examples in `/packages/jay-stack/editor-protocol/` or open an issue on GitHub.
