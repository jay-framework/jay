# Figma Vendor

Converts Figma documents to Jay HTML with full contract binding support.

## Overview

The Figma vendor implements the complete conversion pipeline from Figma design documents to Jay-HTML, handling:

- **Data bindings** - Contract tags bound to UI elements
- **Interactive refs** - Button clicks, input fields, etc.
- **Attribute bindings** - src, value, href, etc.
- **Variant permutations** - Figma component variants to Jay if conditions
- **Repeater contexts** - forEach loops with proper path scoping
- **Plugin contracts** - Multi-component plugin support

## Architecture

### Conversion Pipeline

```
FigmaVendorDocument
    ↓
1. Extract bindings from pluginData
    ↓
2. Analyze bindings (type, paths, context)
    ↓
3. Validate binding rules
    ↓
4. Route to appropriate converter
    ↓
   - Repeater → convertRepeaterNode()
   - Variant → convertVariantNode()
   - Regular → convertRegularNode()
    ↓
Jay-HTML output
```

### Key Files

- **`index.ts`** - Main vendor implementation, conversion pipeline
- **`binding-analysis.ts`** - Binding analysis, path resolution, validation
- **`types.ts`** - Type definitions for bindings and context
- **`utils.ts`** - CSS conversion utilities
- **`converters/`** - Node-specific converters (text, rectangle, etc.)
- **`pageContractPath.ts`** - Contract path utilities

## Binding Types

### 1. Dynamic Content (Data)

**Figma Binding:**
```json
{
  "tagPath": ["productPage", "name"],
  "pageContractPath": { ... }
}
```

**Jay-HTML:**
```html
<div>{productPage.name}</div>
```

### 2. Interactive Ref

**Figma Binding:**
```json
{
  "tagPath": ["submitButton"],
  "pageContractPath": { ... }
}
```

**Jay-HTML:**
```html
<button ref="submitButton">Submit</button>
```

### 3. Dual Binding (Data + Interactive)

**Figma Binding:**
```json
{
  "tagPath": ["email"],
  "pageContractPath": { ... }
}
```

**Jay-HTML:**
```html
<input ref="email" value="{email}" />
```

### 4. Attribute Binding

**Figma Binding:**
```json
{
  "tagPath": ["product", "imageUrl"],
  "attribute": "src",
  "pageContractPath": { ... }
}
```

**Jay-HTML:**
```html
<img src="{product.imageUrl}" alt="..." />
```

**Supported Attributes:**
- `src` - Image sources (requires `semanticHtml: 'img'`)
- `href` - Link destinations (requires `semanticHtml: 'a'`)
- `value` - Input field values (requires `semanticHtml: 'input'`)
- `alt` - Image alt text
- `placeholder` - Input placeholders

#### Image Conversion (Semantic HTML: `img`)

When a node has `semanticHtml: 'img'` in its plugin data:

**Bound Image** (with `src` attribute binding):
```html
<img src="{productPage.imageUrl}" alt="{productPage.imageAlt}" data-figma-id="..." />
```

**Static Image** (no bindings, uses Figma fills):
```html
<img src="/assets/images/product-hero.png" alt="Product Hero" data-figma-id="..." />
```

For static images, the plugin must export and save the image:
```typescript
// In plugin serialization for IMAGE fills:
if (fill.type === 'IMAGE' && fill.imageHash) {
  const imageBytes = await figma.getImageByHash(fill.imageHash)?.getBytesAsync();
  if (imageBytes) {
    const imageUrl = await saveImageToAssets(imageBytes, node.id);
    serializedFill.imageUrl = imageUrl; // ← Add this!
  }
}
```

### 5. Property Binding (Variants)

**Figma Bindings:**
```json
[
  { "property": "mediaType", "tagPath": ["productPage", "mediaType"] },
  { "property": "selected", "tagPath": ["productPage", "isSelected"] }
]
```

**Jay-HTML:**
```html
<div if="productPage.mediaType == IMAGE && productPage.isSelected == true">
  <!-- IMAGE + selected variant -->
</div>
<div if="productPage.mediaType == VIDEO && productPage.isSelected == true">
  <!-- VIDEO + selected variant -->
</div>
<!-- ... other permutations -->
```

**Pseudo-CSS Variants:**

Variant values containing `:` (like `image:hover`, `:active`, `:disabled`) are automatically filtered out from Jay-HTML `if` conditions. These are pseudo-CSS class variants that should be handled via CSS display toggling instead:

```css
/* Pseudo-variant CSS (handled separately, not in conversion) */
.mediaType_hover { display: none; }
.mediaType:hover .mediaType_hover { display: block; }
```

This filtering prevents invalid expressions like `if="media == image:hover"` from being generated.

### 6. Repeater

**Figma Binding:**
```json
{
  "tagPath": ["productPage", "items"],
  "pageContractPath": { ... }
}
```

**Contract:**
```yaml
- tag: items
  type: subContract
  repeated: true
  trackBy: id
```

**Jay-HTML:**
```html
<div forEach="productPage.items" trackBy="id">
  <div>{title}</div> <!-- Context-relative path -->
</div>
```

**Important:** Only the **first child** of a repeater node is converted. This first child serves as the template that gets repeated for each item in the array. Other sibling nodes are ignored as they are not part of the repeater pattern.

## Repeater Context

Repeaters change the path context for their children:

**Full Paths:**
- Repeater: `productPage.products`
- Child: `productPage.products.title`

**In Jay-HTML:**
```html
<div forEach="productPage.products" trackBy="id">
  <div>{title}</div> <!-- Not productPage.products.title -->
</div>
```

**Nested Repeaters:**
```html
<div forEach="compKey.items" trackBy="id">
  <div forEach="subItems" trackBy="id">  <!-- No prefix -->
    <div>{name}</div>  <!-- Relative to subItems -->
  </div>
</div>
```

## Validation Rules

1. **Property bindings are exclusive** - If ANY binding has a property, ALL must have properties
2. **Attributes + dynamic content allowed** - Multiple attribute bindings + dynamic content is valid
3. **Interactive must be pure** - Interactive bindings cannot have attribute or property
4. **One ref per node** - Only one interactive binding per node

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
  pluginData: {
    'jpage': 'true',
    'jay-layer-bindings': JSON.stringify([
      {
        pageContractPath: { ... },
        tagPath: ['productPage', 'name'],
        jayPageSectionId: '...'
      }
    ])
  },
  // ... other Figma node properties
};

await editorProtocol.export({
  vendorId: 'figma',
  pageUrl: '/products/:slug',
  vendorDoc,
});
```

### Plugin Data Format

**`jay-layer-bindings`** - Array of LayerBinding:
```typescript
type LayerBinding = {
  pageContractPath: PageContractPath;
  jayPageSectionId: string;
  tagPath: string[];
  attribute?: string;
  property?: string;
};
```

**`jpage`** - Marks top-level section as a Jay Page:
```typescript
pluginData: {
  'jpage': 'true',
  'urlRoute': '/products/:slug'
}
```

**`semanticHtml`** - Specifies HTML tag:
```typescript
pluginData: {
  'semanticHtml': 'img'  // or 'button', 'input', etc.
}
```

## Usage Example

```typescript
import { figmaVendor } from './vendors/figma';

const result = await figmaVendor.convertToBodyHtml(
  vendorDoc,
  '/products/:slug',
  projectPage,
  plugins
);

console.log(result.bodyHtml);
// <div data-figma-id="...">
//   <div>{productPage.name}</div>
//   <img src="{productPage.image}" />
//   <div forEach="productPage.items" trackBy="id">
//     <div>{title}</div>
//   </div>
// </div>
```

## Extending the Vendor

### Adding a New Binding Type

1. Update `BindingAnalysis` type in `types.ts`
2. Add analysis logic in `analyzeBindings()` in `binding-analysis.ts`
3. Add validation rules in `validateBindings()`
4. Handle new type in `convertRegularNode()` or create new converter

### Adding Node Type Support

1. Create converter in `converters/` (e.g., `my-node.ts`)
2. Import and call from `convertRegularNode()` in `index.ts`
3. Handle node-specific styling in converter

### Extending Path Resolution

Modify `resolveBinding()` in `binding-analysis.ts` to handle:
- New contract sources
- Custom path transformations
- Additional context types

## Known Limitations

1. **Variant Components:** Requires `componentPropertyDefinitions` in `FigmaVendorDocument`
2. **Page Contracts:** Page contract resolution not fully implemented
3. **Mixed Fonts:** Only single font per text node supported
4. **Error Recovery:** Logs warnings but doesn't have graceful fallbacks

## Testing

*To be added - See design-log/67 for test plan*

## Design Documentation

See `design-log/67 - Figma Vendor Conversion Algorithm` for:
- Complete design rationale
- Implementation details
- Examples and edge cases
- Trade-off decisions

---

**Last Updated:** January 12, 2026
