# Project Structure Identification: Pages vs Components

**Date:** December 1, 2025  
**Status:** Design Proposal - Enhanced with Component URLs  
**Related:** Editor Protocol, ProjectInfo API

## Summary

This document proposes enhancing the `ProjectComponent` interface to achieve perfect symmetry with `ProjectPage`. The key insight is that both pages and components are **contract roots** that should be identified by URL-like paths. The enhanced proposal adds support for **dynamic segments** in component paths (e.g., `/components/clock/[initialTime]`) that map to component props, creating a powerful and consistent organizational pattern.

## The Problem

The current `ProjectInfo` structure in the editor protocol treats pages and components asymmetrically in terms of identification:

### Current Implementation

```typescript
// packages/jay-stack/editor-protocol/lib/protocol.ts

export interface ProjectInfo {
    name: string;
    localPath: string;
    pages: ProjectPage[];
    components: ProjectComponent[];
    installedApps: InstalledApp[];
    installedAppContracts: {
        [appName: string]: InstalledAppContracts;
    };
}

export interface ProjectPage {
    name: string;           // Directory name
    url: string;            // ✅ UNIQUE identifier (e.g., "/", "/products/:id")
    filePath: string;       // Path to page.jay-html
    contractSchema?: ContractSchema;
    usedComponents: {...}[];
}

export interface ProjectComponent {
    name: string;           // ❌ Just filename - NOT unique
    filePath: string;       // Path to component file
    contractPath?: string;  // Path to contract file
}
```

### The Asymmetry

**Pages:**
- ✅ Have a unique identifier: `url` field
- ✅ URL provides natural path-based identification
- ✅ Clear "address" that can be used to reference pages
- Example: `/products/[slug]` uniquely identifies a page

**Components:**
- ❌ Only have a `name` field (just the filename)
- ❌ No unique path-based identifier
- ❌ Cannot organize in subdirectories without collisions
- Example: `submit-button` could collide with another `submit-button` in a different folder

## Why This Matters

### 1. Both Are Contract Roots

Pages and components are conceptually similar - both are **root Jay elements** that define contracts:

- **Pages**: Entry points accessible via URLs
- **Components**: Reusable elements accessible via import paths

Both define contracts (`.jay-contract` files) and serve as integration points. They should have parallel identification schemes.

### 2. Component Organization Limitations

The current flat scanning approach prevents natural organization:

```
src/components/
  ├── buttons/
  │   ├── submit-button.jay-html       ← name: "submit-button"
  │   └── cancel-button.jay-html
  └── forms/
      └── submit-button.jay-html       ← COLLISION! Also "submit-button"
```

Without unique identifiers, components cannot be organized hierarchically.

### 3. Current Scanning Implementation

The `scanProjectComponents()` function only scans the top level:

```typescript
// packages/jay-stack/stack-cli/lib/editor-handlers.ts:493-522

async function scanProjectComponents(componentsBasePath: string): Promise<ProjectComponent[]> {
    const components: ProjectComponent[] = [];

    try {
        const entries = await fs.promises.readdir(componentsBasePath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(JAY_EXTENSION)) {
                const componentName = path.basename(entry.name, JAY_EXTENSION);
                const componentPath = path.join(componentsBasePath, entry.name);
                
                components.push({
                    name: componentName,        // ❌ Not unique if subdirs exist
                    filePath: componentPath,
                    contractPath: hasContract ? contractPath : undefined,
                });
            }
        }
    } catch (error) {
        console.warn(`Failed to scan components directory ${componentsBasePath}:`, error);
    }

    return components;
}
```

**Issues:**
- No recursive directory scanning
- Only reads top-level files
- No relative path tracking
- Cannot handle nested organization

### 4. Contrast with Pages

Pages use `scanPageDirectories()` which:
- ✅ Recursively scans nested directories
- ✅ Builds URL paths for identification
- ✅ Supports dynamic routes like `[slug]`
- ✅ Provides unique identifiers for each page

## Proposed Solution

### Enhanced ProjectComponent Interface

```typescript
export interface ProjectComponent {
    name: string;           // Display name (just filename)
    relativePath: string;   // ✅ UNIQUE identifier from componentsBase
    filePath: string;       // Absolute path to file
    contractPath?: string;  // Path to contract file
}
```

**Example:**

```
src/components/
  ├── buttons/
  │   └── submit-button.jay-html
  └── forms/
      └── submit-button.jay-html

Results in:
[
  { 
    name: "submit-button",
    relativePath: "buttons/submit-button",      // ✅ Unique
    filePath: "/abs/path/to/components/buttons/submit-button.jay-html",
    contractPath: "/abs/path/to/components/buttons/submit-button.jay-contract"
  },
  { 
    name: "submit-button",
    relativePath: "forms/submit-button",        // ✅ Unique
    filePath: "/abs/path/to/components/forms/submit-button.jay-html"
  }
]
```

### Benefits

1. **Parallel Structure**: Components now mirror pages with unique path-based identifiers
2. **Hierarchical Organization**: Components can be organized in subdirectories naturally
3. **No Collisions**: `relativePath` provides uniqueness, like `url` does for pages
4. **Editor Integration**: Editors can uniquely reference components for editing
5. **Import Paths**: The `relativePath` can align with import conventions

### Implementation Changes Required

1. **Update Protocol Interface** (`packages/jay-stack/editor-protocol/lib/protocol.ts`)
   - Add `relativePath` field to `ProjectComponent`
   - Update JSDoc to clarify unique identification

2. **Update Component Scanner** (`packages/jay-stack/stack-cli/lib/editor-handlers.ts`)
   - Make `scanProjectComponents()` recursive (similar to `scanPageDirectories()`)
   - Calculate and store `relativePath` for each component
   - Handle nested directory structures

3. **Update Documentation** (`docs/jay-stack-project-info-api.md`)
   - Document new `relativePath` field
   - Explain component identification scheme
   - Provide examples of hierarchical component organization

4. **Add Tests** (`packages/jay-stack/stack-cli/test/editor-handlers.test.ts`)
   - Test recursive component scanning
   - Test unique identification with nested components
   - Test name collisions are resolved via `relativePath`

## Implementation Sketch

```typescript
// Recursive component scanner
async function scanProjectComponents(
    componentsBasePath: string,
    currentRelativePath: string = ''
): Promise<ProjectComponent[]> {
    const components: ProjectComponent[] = [];

    try {
        const entries = await fs.promises.readdir(
            path.join(componentsBasePath, currentRelativePath), 
            { withFileTypes: true }
        );

        for (const entry of entries) {
            const entryRelativePath = path.join(currentRelativePath, entry.name);
            
            if (entry.isDirectory()) {
                // Recurse into subdirectories
                const subComponents = await scanProjectComponents(
                    componentsBasePath, 
                    entryRelativePath
                );
                components.push(...subComponents);
                
            } else if (entry.name.endsWith(JAY_EXTENSION)) {
                const componentName = path.basename(entry.name, JAY_EXTENSION);
                const componentRelativePath = path.join(
                    currentRelativePath, 
                    componentName
                );
                const componentPath = path.join(
                    componentsBasePath, 
                    currentRelativePath, 
                    entry.name
                );
                const contractPath = path.join(
                    componentsBasePath,
                    currentRelativePath,
                    `${componentName}${JAY_CONTRACT_EXTENSION}`,
                );

                components.push({
                    name: componentName,
                    relativePath: componentRelativePath.replace(/\\/g, '/'), // Normalize to forward slashes
                    filePath: componentPath,
                    contractPath: fs.existsSync(contractPath) ? contractPath : undefined,
                });
            }
        }
    } catch (error) {
        console.warn(`Failed to scan components directory ${componentsBasePath}:`, error);
    }

    return components;
}
```

## Current State

### Example Projects

Currently, **no examples exist with a `components/` folder** in the jay-stack examples:

- `examples/jay-stack/fake-shop/` - Only has `src/pages/`, no `src/components/`
- Infrastructure is in place (config supports `componentsBase`), but no examples demonstrate it

**Recommendation:** Create an example project that includes a `src/components/` folder with hierarchically organized components to test and demonstrate this functionality.

## Alternative Considered

### Option: Use Full File Paths as IDs

Instead of `relativePath`, use the full `filePath` as the unique identifier.

**Rejected because:**
- File paths are machine-specific (not portable)
- Editor applications may run on different machines
- Relative paths align better with import conventions
- Matches the pattern used for pages (URLs are also relative)

## Related Concepts

- **Pages**: Use `url` for unique identification (e.g., `/products/[slug]`)
- **Installed App Components**: Use combination of `appName` + `componentName` + `key`
- **Contracts**: Both pages and components can have `.jay-contract` files
- **Editor Integration**: Editors need unique IDs to publish/edit specific pages or components

## Next Steps

### Phase 1: URL Identification (Immediate)
1. Validate the enhanced proposal with team
2. Add `url` field to `ProjectComponent` interface
3. Update component scanner to generate URLs (static paths only initially)
4. Update editor integration to use URLs for identification
5. Create example project with hierarchical components
6. Update documentation and tests

### Phase 2: Dynamic Segments (Short-term)
1. Add support for `[param]` directory recognition
2. Parse dynamic segments in component URLs
3. Validate dynamic segments match contract props
4. Update tests for dynamic component paths
5. Document component organization patterns

### Phase 3: Runtime Semantics (Long-term)
1. Define runtime behavior for dynamic components
2. Consider integration with import system
3. Explore dynamic component loading capabilities
4. Document advanced usage patterns

### Decision Points
- Should TypeScript imports use file paths or URLs?
- Allow multiple components per dynamic path?
- Support constrained dynamic segments?

## Enhanced Proposal: Component URLs with Dynamic Segments

### The Idea

Rather than just adding `relativePath`, we should add a **`url`** field to components, creating **perfect symmetry** with pages. This URL would support dynamic segments using the same `[param]` syntax as pages.

```typescript
export interface ProjectComponent {
    name: string;           // Display name (just filename)
    url: string;            // ✅ URL-like identifier with dynamic segments
    filePath: string;       // Absolute path to file
    contractPath?: string;  // Path to contract file
}
```

### Examples

**File structure:**
```
src/components/
  ├── button/
  │   └── button.jay-html
  ├── clock/
  │   └── [initialTime]/
  │       └── clock.jay-html
  └── list/
      └── [itemType]/
          └── list-item.jay-html
```

**Resulting component info:**
```typescript
[
  {
    name: "button",
    url: "/components/button",           // Simple component
    filePath: "/abs/path/to/components/button/button.jay-html"
  },
  {
    name: "clock",
    url: "/components/clock/[initialTime]",  // Component with dynamic segment
    filePath: "/abs/path/to/components/clock/[initialTime]/clock.jay-html"
  },
  {
    name: "list-item",
    url: "/components/list/[itemType]/list-item",  // Nested with dynamic segment
    filePath: "/abs/path/to/components/list/[itemType]/list-item.jay-html"
  }
]
```

### Dynamic Segments Map to Component Props

The key insight: **Dynamic segments in component paths should become component props**.

When a component is used, the dynamic segments are satisfied by providing props:

```jay-html
<!-- Using the clock component -->
<clock initialTime="12:00:00" />

<!-- Using the list-item component with different types -->
<list-item itemType="task" />
<list-item itemType="note" />
```

### Why This Makes Sense

#### 1. Perfect Symmetry with Pages

**Pages:**
- URL: `/products/[slug]` 
- Dynamic segment `slug` becomes a route parameter
- Accessed at runtime: `/products/laptop`, `/products/phone`

**Components (proposed):**
- URL: `/components/clock/[initialTime]`
- Dynamic segment `initialTime` becomes a component prop
- Accessed at usage: `<clock initialTime="12:00:00" />`

#### 2. Self-Documenting Component APIs

The component path structure reveals its prop requirements:

```
/components/chart/[chartType]/[dataSource]/chart.jay-html
                  ^^^^^^^^^    ^^^^^^^^^^^
                  Required props: chartType, dataSource
```

#### 3. Component Variants and Specialization

Dynamic segments enable natural component variant organization:

```
src/components/
  └── button/
      ├── [variant]/          # Variants: primary, secondary, danger
      │   └── button.jay-html
      └── [size]/             # Sizes: small, medium, large
          └── [variant]/
              └── button.jay-html
```

#### 4. Type-Safe Component Props

The component contract file would declare these dynamic segments as required props:

```typescript
// clock/[initialTime]/clock.jay-contract
interface ClockContract {
  initialTime: string;  // Required - comes from dynamic segment
  format?: '12h' | '24h';  // Optional - additional prop
}
```

### Implementation Considerations

#### Easy Parts ✅

1. **Path Parsing**: We already parse dynamic segments for pages
   - Reuse the same regex patterns
   - Same `[param]` syntax
   - Same normalization logic

2. **URL Generation**: Convert file paths to URLs
   - Replace OS path separators with `/`
   - Prepend `/components/` prefix
   - Keep dynamic segment brackets intact

3. **Unique Identification**: URLs are already unique
   - No name collisions possible
   - Natural hierarchical organization
   - Consistent with page URLs

#### Moderate Complexity ⚠️

1. **Contract Validation**: Ensure dynamic segments match contract props
   ```typescript
   // Validation: path has [initialTime], contract must have initialTime prop
   validateComponentStructure(componentUrl, contractSchema)
   ```

2. **Editor Integration**: Map component URLs to file locations
   - Parse URL to extract file path
   - Handle dynamic segment directories
   - Navigate to correct file when editing

3. **Component Scanner**: Recognize dynamic segment directories
   ```typescript
   if (entry.name.startsWith('[') && entry.name.endsWith(']')) {
     // This is a dynamic segment directory
     isDynamicSegment = true;
     segmentName = entry.name.slice(1, -1);
   }
   ```

#### Complex Parts 🔴

1. **Runtime Component Resolution**: How do components get instantiated?
   
   **Question:** Does the framework need to "resolve" components like it resolves pages?
   
   **Analysis:**
   - Pages: Routes are matched at runtime (`/products/laptop` → `products/[slug]/page.jay-html`)
   - Components: Typically statically imported and used directly
   
   **Two possible models:**

   **Model A: Static Imports (Current Model)**
   ```typescript
   // Traditional import
   import { Clock } from './components/clock/[initialTime]/clock.jay-html';
   
   // Usage
   <Clock initialTime="12:00:00" />
   ```
   - Dynamic segments are just directory structure
   - No runtime resolution needed
   - Props are explicit in usage

   **Model B: Dynamic Resolution (New Capability)**
   ```typescript
   // Runtime component resolution
   const ClockComponent = resolveComponent('/components/clock/[initialTime]', {
     initialTime: '12:00:00'
   });
   ```
   - Framework resolves component path at runtime
   - Similar to how pages are resolved
   - Enables dynamic component loading

2. **Component Reference in jay-html**: How to reference components in templates?
   
   Current model uses static imports. With component URLs, we could enable:
   
   ```jay-html
   <!-- Option 1: Traditional import -->
   <import src="./clock/[initialTime]/clock.jay-html" as="clock" />
   <clock initialTime="12:00:00" />
   
   <!-- Option 2: URL-based reference (new?) -->
   <component url="/components/clock/[initialTime]" initialTime="12:00:00" />
   ```

3. **Multiple Components per Path?**: Unlike pages (one `page.jay-html` per route), components might have multiple files:
   
   ```
   components/
     └── clock/
         └── [initialTime]/
             ├── clock.jay-html          ← Main component
             ├── digital-clock.jay-html  ← Variant?
             └── analog-clock.jay-html   ← Another variant?
   ```
   
   **Resolution:** Probably should follow page convention:
   - One component per dynamic path
   - Component filename could be flexible (not necessarily matching directory)
   - Or enforce naming: directory name must match component name

### Proposed Interface (Full Symmetry)

```typescript
export interface ProjectPage {
    name: string;
    url: string;              // e.g., "/products/[slug]"
    filePath: string;
    contractSchema?: ContractSchema;
    usedComponents: {...}[];
}

export interface ProjectComponent {
    name: string;
    url: string;              // e.g., "/components/clock/[initialTime]"
    filePath: string;
    contractPath?: string;
    contractSchema?: ContractSchema;  // Also include contract schema?
}
```

**Perfect Parallel Structure!**

### Implementation Difficulty Assessment

| Aspect | Difficulty | Reasoning |
|--------|-----------|-----------|
| Add `url` field to interface | 🟢 Easy | Simple protocol change |
| Parse component paths for `[segments]` | 🟢 Easy | Reuse page parsing logic |
| Generate component URLs | 🟢 Easy | String transformation |
| Recursive component scanning | 🟡 Moderate | Similar to page scanning |
| Contract validation | 🟡 Moderate | New validation logic needed |
| Editor integration updates | 🟡 Moderate | Update file resolution |
| Runtime semantics | 🔴 Complex | Need to define what dynamic segments *mean* |
| Import system integration | 🔴 Complex | How do imports reference dynamic paths? |

**Overall Assessment: Moderate to Complex**

The core idea is sound and the basic implementation is straightforward. The complexity comes from:
1. Defining clear semantics for what dynamic segments mean in component context
2. Ensuring the import/reference system works smoothly
3. Deciding if this enables new runtime capabilities or just improves organization

### Recommended Approach: Phased Implementation

#### Phase 1: URL Identification (Easy) 🟢
- Add `url` field to `ProjectComponent`
- Generate URLs from component file paths
- Support static paths only (no dynamic segments yet)
- Update editor to use URLs for identification

**Benefit:** Solves the uniqueness problem immediately

#### Phase 2: Dynamic Segment Support (Moderate) 🟡
- Recognize `[param]` directories in component paths
- Include dynamic segments in URLs
- Validate dynamic segments match contract props
- Update component scanner to handle nested dynamic paths

**Benefit:** Enables component organization by variants/types

#### Phase 3: Runtime Semantics (Complex) 🔴
- Define how dynamic components are resolved
- Integrate with import system
- Enable dynamic component loading if desired
- Document usage patterns and best practices

**Benefit:** Unlocks new compositional patterns

### Open Questions

1. **Import Paths**: Should TypeScript imports reference the actual file path or the URL?
   ```typescript
   // Option A: File path (current)
   import { Clock } from '@/components/clock/[initialTime]/clock.jay-html';
   
   // Option B: URL-like
   import { Clock } from '@components/clock/[initialTime]';
   ```

2. **Multiple Components per Dynamic Path**: Allowed or prohibited?

3. **Dynamic Segment Constraints**: Can we specify allowed values?
   ```
   /components/button/[variant:primary|secondary|danger]/button.jay-html
                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                     Constrained dynamic segment?
   ```

4. **Default Values**: How to handle optional dynamic segments?

### Comparison with Alternative Proposal

| Aspect | `relativePath` Approach | `url` with Dynamic Segments |
|--------|------------------------|----------------------------|
| Uniqueness | ✅ Solved | ✅ Solved |
| Symmetry with pages | ⚠️ Partial | ✅ Complete |
| Implementation complexity | 🟢 Simple | 🟡 Moderate to Complex |
| Enables new patterns | ❌ No | ✅ Yes (component variants) |
| Breaking changes | 🟢 Minimal | 🟡 May affect imports |
| Learning curve | 🟢 Low | 🟡 Moderate |

### Recommendation

**Yes, this idea makes sense!** It creates beautiful symmetry and unlocks interesting organizational patterns.

**Implementation strategy:**
1. Start with Phase 1 (URL identification without dynamic segments) - this is easy and solves the immediate problem
2. Validate the approach with a real example
3. Proceed to Phase 2 (dynamic segments) once Phase 1 proves valuable
4. Consider Phase 3 only if clear use cases emerge

**Key decision:** We don't have to implement all phases at once. Just adding the `url` field (even without dynamic segment support initially) already solves the uniqueness problem and creates symmetry with pages.

## References

- `packages/jay-stack/editor-protocol/lib/protocol.ts` - Protocol definitions
- `packages/jay-stack/stack-cli/lib/editor-handlers.ts` - Component scanning implementation
- `packages/jay-stack/stack-cli/lib/config.ts` - Configuration with `componentsBase`
- `docs/jay-stack-project-info-api.md` - ProjectInfo API documentation

