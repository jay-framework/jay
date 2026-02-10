# Branch Review Guide: `export_import`

## Overview

This branch introduces two major features:
1. **Figma Vendor Integration** - A complete system for converting Figma documents to Jay HTML
2. **Enhanced Plugin Resolution** - Improved plugin manifest and component resolution with better validation

**Total Changes:** 75 files changed, ~9,893 insertions, ~1,168 deletions

**Recent Updates:** This branch now includes the merge from main (PR #159) which added headless component props and repeater support. This merge introduced important interactions with the vendor system that are documented below.

---

## How to Review This Branch

The changes are clustered into **6 logical domains**. We recommend reviewing in this order:

1. **[Plugin Resolution & Validation](#1-plugin-resolution--validation)** (Foundation)
2. **[Editor Protocol Extensions](#2-editor-protocol-extensions)** (API Contract)
3. **[Vendor System Architecture](#3-vendor-system-architecture)** (Core Infrastructure)
4. **[Figma Vendor Implementation](#4-figma-vendor-implementation)** (Feature Implementation)
5. **[Editor Handlers Integration](#5-editor-handlers-integration)** (Feature Integration)
6. **[Documentation & Tests](#6-documentation--tests)** (Quality & Maintenance)

---

## 1. Plugin Resolution & Validation

**Purpose:** Improve plugin manifest resolution and add better validation for NPM and local plugins.

### Changes

#### Core Plugin Resolution
- `packages/compiler/compiler-shared/lib/plugin-resolution.ts` (~574 lines total, +172 lines)
    - New `resolvePluginManifest()` - Resolves plugin.yaml from local or NPM paths
    - New `resolvePluginComponent()` - Resolves contract files from plugins with validation
    - Enhanced `getPluginsFromConfig()` - Better error handling and validation
    - Added validation responses with detailed error messages
    - Enhanced with support for headless component resolution

#### Compiler Integration
- `packages/compiler/compiler-jay-html/lib/jay-target/jay-import-resolver.ts` (+9 lines)
    - Export `LOCAL_PLUGIN_PATH` for consistent plugin path handling
- `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-parser.ts` (+4 lines)
    - Use exported `LOCAL_PLUGIN_PATH` constant

#### Plugin Validation
- `packages/jay-stack/plugin-validator/lib/validate-plugin.ts` (+32 lines)
    - Added validation for `slugs` field in contract definitions
    - Validates slug format (must be valid identifiers)
    - Validates slugs is an array of strings

#### Tests
- `packages/compiler/compiler-shared/test/plugin-resolution.test.ts` (~603 lines total, +578 lines)
    - Tests for `resolvePluginManifest()` with local and NPM plugins
    - Tests for `resolvePluginComponent()` with validation scenarios
    - Tests for various error cases and edge conditions

### Why These Changes?

The plugin system needed better resolution logic to:
- Support both local (`src/plugins/`) and NPM plugins consistently
- Provide detailed validation errors instead of silent failures
- Support the vendor system's need to resolve plugin contracts (for Figma binding analysis)
- Add support for dynamic route slugs in plugin contracts

### Key Points for Reviewer

- ✅ **Backward Compatible:** Existing plugins continue to work
- ✅ **Better Errors:** Validation failures now return structured error messages
- ✅ **Test Coverage:** Comprehensive test suite for resolution logic
- ⚠️ **Breaking Change:** None, but adds new optional `slugs` field to contract schema

---

## 2. Editor Protocol Extensions

**Purpose:** Extend the Editor Protocol to support vendor document export/import and improve type definitions.

### Changes

#### Protocol Core
- `packages/jay-stack/editor-protocol/lib/protocol.ts` (+168 lines)
    - Added `ContractTag` and `Contract` types (simplified from compiler types)
    - Added `ExportMessage<TVendorDoc>` - Message type for exporting vendor documents
    - Added `ImportMessage<TVendorDoc>` - Message type for importing vendor documents
    - Added `ExportResponse` and `ImportResponse<TVendorDoc>` types
    - Changed `ProjectPage.contractSchema` → `ProjectPage.contract` (simplified)
    - Simplified `Plugin` interface (removed legacy `InstalledApp`)

#### Vendor Document Types
- `packages/jay-stack/editor-protocol/lib/vendor-documents.ts` (new file, +12 lines)
    - Single source of truth for vendor document types
    - Currently exports `FigmaVendorDocument` type
- `packages/jay-stack/editor-protocol/lib/vendors/figma.ts` (new file, +147 lines)
    - Complete `FigmaVendorDocument` type definition
    - Includes types for frames, text, images, components, variants, etc.
    - Includes `LayerBinding` type for contract bindings

#### Protocol Constructors
- `packages/jay-stack/editor-protocol/lib/constructors.ts` (+71 lines)
    - Added `createExportMessage()` - Factory for export messages
    - Added `createImportMessage()` - Factory for import messages

#### Client/Server Updates
- `packages/jay-stack/editor-client/lib/editor-client.ts` (+18 lines)
    - Added `export()` method for vendor document export
    - Added `import()` method for vendor document import
- `packages/jay-stack/editor-server/lib/editor-server.ts` (+38 lines)
    - Added handlers for `export` and `import` messages
    - Integrated with vendor registry

#### Type Simplifications
- `packages/jay-stack/editor-protocol/lib/types.ts` (+12 lines)
    - Export new protocol types
    - Remove legacy types

### Why These Changes?

The Editor Protocol needed to support:
- **Vendor Documents:** A standardized way for editor plugins (Figma, Sketch, etc.) to export their native formats
- **Type Safety:** Single source of truth for vendor document types that both plugins and vendors import
- **Simplified Types:** Protocol-specific types that are easier to serialize/deserialize than compiler types
- **Better DX:** Clear API for plugin developers to export/import designs

### Key Points for Reviewer

- ✅ **Single Source of Truth:** `vendor-documents.ts` is imported by both plugins and vendors
- ✅ **Type Safety:** Generic `ExportMessage<TVendorDoc>` ensures type safety per vendor
- ✅ **Backward Compatible:** Old protocol messages still work
- ⚠️ **Breaking Change:** `ProjectPage.contractSchema` renamed to `contract` with simplified structure
- ⚠️ **Headless Components Interaction:** `usedComponents[].key` is typed as `string`, but the merged headless component feature allows instance-only headless components where `key` is `undefined` (see Known Limitations below)

---

## 3. Vendor System Architecture

**Purpose:** Create an extensible vendor system for converting design tool documents to Jay HTML.

### Changes

#### Core Vendor Types
- `packages/jay-stack/stack-cli/lib/vendors/types.ts` (new file, +59 lines)
    - `Vendor<TVendorDoc>` interface - Core vendor contract
    - `VendorConversionResult` - Return type with body HTML, fonts, contract data

#### Vendor Registry
- `packages/jay-stack/stack-cli/lib/vendors/registry.ts` (new file, +48 lines)
    - `getVendor(vendorId)` - Get vendor by ID
    - `hasVendor(vendorId)` - Check if vendor exists
    - `getRegisteredVendors()` - List all vendors
    - Static registration of vendors

#### Jay HTML Builder
- `packages/jay-stack/stack-cli/lib/vendors/jay-html-builder.ts` (new file, +229 lines)
    - `buildJayHtmlFromVendorResult()` - Builds complete Jay HTML file from vendor result
    - Generates `<head>` with font imports
    - Generates `<body>` with vendor HTML
    - Optionally generates contract `<script>` tag
    - Handles Google Fonts integration

#### Public API
- `packages/jay-stack/stack-cli/lib/vendors/index.ts` (new file, +11 lines)
    - Exports public vendor API
    - Re-exports registry functions and types

### Why These Changes?

The vendor system provides:
- **Extensibility:** Easy to add new vendors (Sketch, Adobe XD, etc.)
- **Separation of Concerns:** Each vendor is responsible for its own conversion logic
- **Reusable Infrastructure:** HTML building, font management, contract generation are shared
- **Type Safety:** Generic vendor interface ensures compile-time safety

### Architecture

```
┌─────────────────┐
│  Editor Plugin  │  (Figma/Sketch/XD)
└────────┬────────┘
         │ export({ vendorId, vendorDoc })
         ▼
┌─────────────────┐
│ Editor Protocol │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Editor Handlers │
└────────┬────────┘
         │ getVendor(vendorId)
         ▼
┌─────────────────┐
│ Vendor Registry │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Specific Vendor │  (figmaVendor, sketchVendor, etc.)
│ convertToBody() │
└────────┬────────┘
         │ VendorConversionResult
         ▼
┌─────────────────┐
│ HTML Builder    │  Builds complete .jay-html file
└────────┬────────┘
         │
         ▼ Save to filesystem
```

### Key Points for Reviewer

- ✅ **Extensible:** New vendors just implement `Vendor` interface
- ✅ **Testable:** Vendors are pure functions (input doc → output HTML)
- ✅ **Separation:** Vendor logic is isolated from protocol/handler logic
- ✅ **Reusable:** HTML building is shared across all vendors

---

## 4. Figma Vendor Implementation

**Purpose:** Complete implementation of Figma document to Jay HTML conversion with support for bindings, repeaters, and variants.

**Related Design Log:** [Design Log #67 - Figma Vendor Conversion Algorithm](design-log/67%20-%20Figma%20Vendor%20Convesion%20Algorithm)

### Changes

#### Main Vendor Implementation
- `packages/jay-stack/stack-cli/lib/vendors/figma/index.ts` (new file, +344 lines)
    - `figmaVendor` - Implements `Vendor<FigmaVendorDocument>` interface
    - `convertNodeToJayHtml()` - Main conversion pipeline
    - `convertRegularNode()` - Handles standard nodes (text, images, frames)
    - Node type dispatching to specialized converters

#### Binding Analysis (Core Algorithm)
- `packages/jay-stack/stack-cli/lib/vendors/figma/binding-analysis.ts` (new file, +322 lines)
    - `analyzeBindings()` - Determines binding type and converts to Jay HTML syntax
    - `resolveBinding()` - Resolves contract bindings with plugin key prefix
    - `applyRepeaterContext()` - Applies repeater path context to child bindings
    - `validateBindings()` - Validates binding consistency
    - `getBindingsData()` - Extracts bindings from Figma plugin data
    - Supports:
        - Dynamic content bindings: `{path.to.data}`
        - Attribute bindings: `<img src="{path.to.url}">`
        - Interactive refs: `<button ref="submitButton">`
        - Dual bindings: `<input ref="email" value="{email}">`

#### Node Type Converters
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/text.ts` (new file, +232 lines)
    - Converts Figma TEXT nodes to HTML
    - Handles text styling (font, size, weight, color, alignment)
    - Supports dynamic content and refs
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/image.ts` (new file, +119 lines)
    - Converts Figma image fills to `<img>` tags
    - Handles both static and dynamic images
    - Extracts image URLs from fills
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/rectangle.ts` (new file, +31 lines)
    - Converts RECTANGLE nodes with fills, strokes, corners
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/ellipse.ts` (new file, +32 lines)
    - Converts ELLIPSE nodes with proper CSS border-radius
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/vector.ts` (new file, +38 lines)
    - Converts VECTOR nodes (currently as divs with basic styling)
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/group.ts` (new file, +67 lines)
    - Converts GROUP nodes with relative positioning

#### Advanced Converters
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/repeater.ts` (new file, +98 lines)
    - Converts repeated sub-contracts to `forEach` loops
    - Dual-wrapper architecture (outer positioned, inner repeating)
    - Manages repeater context stack for child path resolution
    - Structure:
      ```html
      <div data-figma-type="frame-repeater" style="position: absolute; ...">
        <div forEach="items" trackBy="id">
          <!-- Template item with context-relative paths -->
        </div>
      </div>
      ```
- `packages/jay-stack/stack-cli/lib/vendors/figma/converters/variants.ts` (new file, +328 lines)
    - Converts Figma component variants to Jay HTML if conditions
    - Generates all permutations of variant properties
    - Supports boolean variants: `if="isActive"` instead of `if="isActive == true"`
    - Filters pseudo-CSS variants (`:hover`, `:pressed`)
    - Handles interactive variant properties
    - Structure:
      ```html
      <div ref="state" style="...">
        <div if="state == idle"><!-- idle variant --></div>
        <div if="state == loading"><!-- loading variant --></div>
      </div>
      ```

#### Utilities
- `packages/jay-stack/stack-cli/lib/vendors/figma/utils.ts` (new file, +631 lines)
    - Style generation utilities:
        - `getPositionStyle()` - Absolute positioning
        - `getAutoLayoutStyles()` - Flexbox conversion
        - `getBackgroundFillsStyle()` - Background colors/gradients
        - `getStrokeStyles()` - Border styles
        - `getBorderRadius()` - Corner radius
        - `getTextStyles()` - Font, color, alignment
    - Font family collection and normalization
    - ID sanitization
    - Indentation helpers

#### Types & Helpers
- `packages/jay-stack/stack-cli/lib/vendors/figma/types.ts` (new file, +76 lines)
    - `ConversionContext` - State passed through conversion recursion
    - `BindingAnalysis` - Result of binding analysis
    - Re-exports protocol types
- `packages/jay-stack/stack-cli/lib/vendors/figma/pageContractPath.ts` (new file, +21 lines)
    - Utilities for working with page contract paths

### Why These Changes?

The Figma vendor enables:
- **Visual Programming:** Designers can bind Figma layers to data contracts
- **Complete Conversion:** All Figma node types converted to semantic HTML
- **Advanced Features:** Supports repeaters (forEach), variants (if conditions), dynamic content
- **Type Safety:** Full TypeScript support with contract validation
- **Maintainability:** Modular converter architecture, each node type has its own converter

### Conversion Features

| Feature | Figma Concept | Jay HTML Output |
|---------|---------------|-----------------|
| Data Binding | Layer bound to contract tag | `<div>{data.path}</div>` |
| Attribute Binding | Layer bound to tag with attribute | `<img src="{product.imageUrl}">` |
| Interactive | Layer bound to interactive tag | `<button ref="submitButton">` |
| Dual Binding | Layer bound to dual-type tag | `<input ref="email" value="{email}">` |
| Repeater | Frame bound to repeated sub-contract | `<div forEach="items" trackBy="id">` |
| Variants | Component with variant properties | `<div if="state == active">` |
| Boolean Variants | Variant with boolean contract tag | `<div if="isActive">` (simplified) |

### Key Points for Reviewer

- ✅ **Complete Implementation:** All phases from Design Log #67 implemented
- ✅ **Well-Tested:** Fixture-based tests with real Figma documents
- ✅ **Modular:** Each converter is independent and testable
- ✅ **Documented:** Inline comments explain complex logic
- ⚠️ **Complex:** Variant permutation generation is inherently complex
- 📝 **Design Log #67:** Read for full algorithm understanding

---

## 5. Editor Handlers Integration

**Purpose:** Integrate vendor system and plugin resolution into the editor handler pipeline.

### Changes

#### Editor Handlers
- `packages/jay-stack/stack-cli/lib/editor-handlers.ts` (~1,268 lines refactored)
    - Added `onExport()` handler - Handles vendor document export
    - Added `onImport()` handler - Handles vendor document import (stub)
    - Refactored `onGetProjectInfo()` - Simplified using new plugin resolution
    - Added `pageUrlToDirectoryPath()` - Converts routes to filesystem paths
    - Added `convertContractToProtocol()` - Converts compiler contracts to protocol contracts
    - Removed legacy code for `InstalledApp` and old contract handling
    - Better error handling and validation

#### Export Flow
1. Receive `ExportMessage` with `vendorId`, `pageUrl`, `vendorDoc`
2. Validate page exists (or create directory)
3. Save vendor document to `page.<vendorId>.json`
4. Look up vendor by ID from registry
5. Load project page and plugins
6. Call `vendor.convertToBodyHtml()`
7. Build complete `.jay-html` file with `buildJayHtmlFromVendorResult()`
8. Save to filesystem
9. Return success/error response

#### CLI Integration
- `packages/jay-stack/stack-cli/lib/server.ts` (+14 lines)
    - Log registered vendors on startup
    - Display vendor count in server info
- `packages/jay-stack/stack-cli/lib/index.ts` (+1 line)
    - Export vendor types for external use

### Why These Changes?

The editor handlers needed to:
- **Support Vendors:** Route export/import messages to appropriate vendors
- **Simplify Code:** Use new plugin resolution instead of legacy code
- **Better Errors:** Provide clear error messages for plugin and vendor issues
- **Maintain State:** Track pages and plugins for binding resolution

### Key Points for Reviewer

- ✅ **Backward Compatible:** Existing editor protocol messages still work
- ✅ **Better Architecture:** Clear separation of concerns (handlers → vendors)
- ⚠️ **Large Refactor:** Many lines changed but mostly simplifications
- 📝 **Test Coverage:** Updated tests to match new behavior

---

## 6. Documentation & Tests

**Purpose:** Document the new systems and ensure quality with comprehensive tests.

### Documentation Changes

#### Editor Protocol Documentation
- `docs/jay-stack-editor-protocol.md` (new file, +874 lines)
    - Complete Editor Protocol specification
    - Message types and response formats
    - Export/import API documentation
    - Plugin and contract type definitions
    - Example usage for plugin developers

#### Project Info API Documentation
- `docs/jay-stack-project-info-api.md` (~320 lines refactored)
    - Updated to match new `Plugin` and `Contract` types
    - Removed legacy `InstalledApp` references
    - Added examples with new types

#### Page Configuration Documentation
- `docs/jay-stack-page-configuration.md` (+40 lines)
    - Added `usedComponents` documentation
    - Explained plugin component key mapping
    - Updated examples

#### Jay HTML Documentation
- `docs/core/jay-html.md` (+176 lines)
    - Added section on vendors
    - Explained vendor document export flow
    - Updated contract binding examples

#### Building Jay Packages Documentation
- `docs/core/building-jay-packages.md` (+50 lines)
    - Added vendor system information
    - Updated plugin resolution documentation

#### README Updates
- `docs/README.md` (+9 lines)
    - Added link to Editor Protocol spec
    - Updated documentation structure

#### Vendor Documentation
- `packages/jay-stack/stack-cli/lib/vendors/README.md` (new file, +510 lines)
    - Complete guide for contributing new vendors
    - Step-by-step vendor implementation guide
    - Best practices and examples
    - Architecture diagrams
- `packages/jay-stack/stack-cli/lib/vendors/figma/README.md` (new file, +396 lines)
    - Figma-specific documentation
    - Plugin developer guide
    - Document structure explanation
    - Binding system documentation

#### Editor Protocol Package README
- `packages/jay-stack/editor-protocol/readme.md` (+124 lines)
    - Added export/import API examples
    - Updated type definitions
    - Added vendor document type information

### Test Changes

#### Plugin Resolution Tests
- `packages/compiler/compiler-shared/test/plugin-resolution.test.ts` (+603 lines)
    - Tests for `resolvePluginManifest()`
    - Tests for `resolvePluginComponent()`
    - Tests for NPM and local plugin resolution
    - Tests for validation errors

#### Vendor System Tests
- `packages/jay-stack/stack-cli/test/vendors/registry.test.ts` (new file, +69 lines)
    - Tests vendor registration
    - Tests vendor lookup
    - Tests error cases
- `packages/jay-stack/stack-cli/test/vendors/integration.test.ts` (new file, +267 lines)
    - End-to-end tests for vendor system
    - Tests HTML building
    - Tests font collection
    - Tests contract generation

#### Figma Vendor Tests
- `packages/jay-stack/stack-cli/test/vendors/figma/fixtures.test.ts` (new file, +213 lines)
    - Fixture-based tests with real Figma documents
    - Tests basic text conversion
    - Tests variants with boolean properties
    - Tests repeaters
    - Tests plugin contract resolution
    - Tests complex pages
- `packages/jay-stack/stack-cli/test/vendors/figma/fixtures/` (new directory)
    - `basic-text/` - Simple text binding test
    - `button-with-variants/` - Variant conversion test
    - `complex-page/` - Multi-element page test
    - `plugin-product-card/` - Plugin contract test
    - `repeater-list/` - Repeater conversion test
    - Each fixture has:
        - `page.figma.json` - Input Figma document
        - `page.jay-contract` - Contract definition
        - `expected.jay-html` - Expected output
        - `page.conf.yaml` (if needed) - Page configuration
        - `README.md` - Fixture documentation

#### Editor Handler Tests
- `packages/jay-stack/stack-cli/test/editor-handlers.test.ts` (~417 lines refactored)
    - Updated tests for new plugin resolution
    - Updated tests for contract format changes
    - Removed tests for legacy `InstalledApp` code

#### Editor Server Tests
- `packages/jay-stack/editor-server/test/editor-server.test.ts` (+25 lines)
    - Tests for export message handling
    - Tests for import message handling

#### Compiler Tests
- `packages/compiler/compiler-jay-html/test/contract/contract-compiler.test.ts` (+10 lines)
    - Updated for new plugin resolution
- `packages/compiler/compiler-jay-html/test/jay-target/parse-jay-file.unit.test.ts` (+5 lines)
    - Updated for new imports

### Why These Changes?

Documentation and tests ensure:
- **Developer Experience:** Clear docs help plugin developers and vendor contributors
- **Quality:** Comprehensive tests catch regressions
- **Maintainability:** Future contributors understand the system
- **Confidence:** Well-tested code can be safely refactored

### Key Points for Reviewer

- ✅ **Comprehensive Docs:** Every new feature is documented
- ✅ **Real-World Tests:** Fixture tests use actual Figma documents
- ✅ **Test Coverage:** All major code paths have tests
- 📝 **Fixture README:** Each fixture has its own documentation

---

## Known Limitations & Future Work

### Headless Component Instance-Only Support

**Context:** The main branch merge (PR #159) introduced "instance-only" headless components, where components can be used without a `key` attribute:

```html
<script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>
<jay:product-card productId="prod-123">
  <h1>{name}</h1>
</jay:product-card>
```

**Current Limitations in Export/Import:**

1. **Jay HTML Builder Limitation** (`jay-html-builder.ts`, lines 204-214)
    - Only includes headless components with both `plugin`, `contract`, AND `key`
    - Instance-only headless components (without `key`) are not added to generated Jay HTML
    - **Impact:** Figma export cannot generate instance-only headless component imports

2. **Binding Analysis Limitation** (`binding-analysis.ts`, lines 118-150)
    - Plugin binding resolution assumes a `key` exists
    - For instance-only components, `key` is `undefined`
    - Results in invalid binding paths like `"undefined.name"` instead of just `"name"`
    - **Impact:** Cannot bind Figma layers to instance-only headless component contracts

3. **Protocol Type Mismatch** (`protocol.ts`, line 116)
    - `usedComponents[].key` is typed as `string` (required)
    - Should be `string | undefined` to support instance-only headless components
    - **Impact:** Type safety issue when passing instance-only components through protocol

4. **Protocol Contract Metadata**
    - Protocol `Contract` type has only `name` and `tags`
    - Missing `props` field that was added for headless components
    - **Impact:** Figma plugin cannot discover or validate prop requirements for headless components

**Recommendation:** Document these as known limitations. Instance-only headless components are a newer feature, and key-based headless components remain fully supported by the vendor system.

---

## Miscellaneous Changes

### Configuration
- `.gitignore` (+1 line)
    - Added pattern for vendor document JSON files: `*.figma.json`

### Design Log
- `design-log/67 - Figma Vendor Convesion Algorithm` (new file, +767 lines)
    - Complete design documentation for Figma vendor
    - Background, problem statement, Q&A
    - Design decisions and trade-offs
    - Implementation plan and results
    - Examples and test cases

### Build Fixes
- `packages/jay-stack/route-scanner/package.json` (+1 line changed)
    - Changed `main` from `dist/index.js` to `dist/index.mjs` for ESM compatibility
- `packages/jay-stack/route-scanner/vite.config.ts` (+1 line changed)
    - Changed output format from CommonJS to ESM (`formats: ['es']`)
    - Fixes build compatibility with Vite-based consumers

---

## Testing the Branch

### Prerequisites
```bash
# Install dependencies
yarn install

# Build all packages
yarn build
```

### Run Tests
```bash
# Run all tests
yarn test

# Run specific test suites
cd packages/compiler/compiler-shared && yarn test
cd packages/jay-stack/stack-cli && yarn test
```

### Manual Testing

1. **Start Dev Server:**
   ```bash
   cd examples/jay-stack/fake-shop
   jay dev
   ```

2. **Check Vendor Registration:**
   Look for log message:
   ```
   📦 Registered vendors: figma
   ```

3. **Test Export (requires Figma plugin):**
    - Install Figma plugin
    - Bind Figma layers to contracts
    - Export from plugin
    - Check `page.jay-html` is created

---

## Summary

This branch introduces a **complete vendor system** with a **fully-functional Figma vendor** and **enhanced plugin resolution**. The changes are extensive but well-organized into logical domains.

**Strengths:**
- ✅ Clean architecture with separation of concerns
- ✅ Comprehensive test coverage with real-world fixtures
- ✅ Extensive documentation for contributors
- ✅ Type-safe throughout with TypeScript
- ✅ Follows design log methodology

**Areas for Attention:**
- ⚠️ Large refactor in `editor-handlers.ts` (review carefully)
- ⚠️ Breaking change in Editor Protocol (`contractSchema` → `contract`)
- ⚠️ Complex variant permutation logic (review with Design Log #67)
- ⚠️ Headless component instance-only support not yet implemented (see Known Limitations)
- ⚠️ Protocol type mismatch: `usedComponents[].key` should be `string | undefined`

**Recommended Review Order:**
1. Read [Design Log #67](design-log/67%20-%20Figma%20Vendor%20Convesion%20Algorithm) for context
2. Review Known Limitations section (important for understanding scope)
3. Review plugin resolution (foundation)
4. Review protocol extensions (API contract)
5. Review vendor architecture (infrastructure)
6. Review Figma vendor with fixtures (implementation)
7. Review integration code (editor handlers)
8. Verify documentation completeness

---

## Changelog

### Added
- Vendor system for converting design tool documents to Jay HTML
- Complete Figma vendor implementation with binding support
- Export/Import API in Editor Protocol
- Enhanced plugin resolution with validation
- Comprehensive documentation for vendors and protocol
- Fixture-based testing for Figma vendor
- Support for variant properties and repeaters
- Support for dynamic content, attributes, and refs

### Changed
- Plugin resolution returns validation objects instead of throwing errors
- Editor Protocol simplifies `Plugin` and `Contract` types
- `ProjectPage.contractSchema` renamed to `contract`
- Editor handlers refactored to use new plugin resolution

### Fixed
- Plugin manifest resolution from NPM packages
- Plugin component resolution with proper validation
- Contract slug validation

### Deprecated
- Legacy `InstalledApp` type (replaced by `Plugin`)

### Known Limitations
- Instance-only headless components (without `key`) are not supported in vendor export
- Protocol `Contract` type does not include `props` field from compiler contracts
- Binding analysis requires `key` for plugin contracts (incompatible with instance-only headless)

---

**Branch:** `export_import`  
**Author:** Noam Inbar  
**Original Date:** January 15, 2026  
**Last Updated:** February 10, 2026 (after merge with main/PR #159)  
**Total Changes:** 75 files, ~9,893 insertions, ~1,168 deletions
