# Figma Vendor

Converts Figma documents to Jay HTML.

## Vendor Document Type

The Figma vendor uses the `FigmaVendorDocument` type defined in `@jay-framework/editor-protocol`. This is the **single source of truth** for the document structure.

### For Figma Plugin Developers

Import the type from the editor protocol:

```typescript
import { FigmaVendorDocument } from '@jay-framework/editor-protocol';

// Your Figma plugin code
const vendorDoc: FigmaVendorDocument = {
  type: selectedNode.type,
  name: selectedNode.name,
  children: selectedNode.children,
  // ... other Figma node properties
};

await editorProtocol.export({
  vendorId: 'figma',
  pageUrl: '/home',
  vendorDoc,
});
```

### For Vendor Contributors

The vendor implementation **imports** the type from editor-protocol:

```typescript
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';

export const figmaVendor: Vendor<FigmaVendorDocument> = {
  // Implementation uses the imported type
};
```

### Document Structure

See `@jay-framework/editor-protocol/lib/vendor-documents.ts` for the type definition.

This is the **only place** where the type is defined - both plugins and the vendor implementation import from here.

## TODO

- [ ] Update `FigmaVendorDocument` in `editor-protocol/lib/vendor-documents.ts` with actual Figma SectionNode structure
- [ ] Consider importing types from `@figma/plugin-typings` if available
- [ ] Implement actual Figma-to-Jay-HTML conversion logic in `index.ts`
- [ ] Add unit tests for conversion
