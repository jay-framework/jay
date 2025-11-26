# Jay HTML with Contract References

## Background

Design Log #50 successfully implemented rendering phases in `.jay-contract` files, enabling compile-time type validation for slow, fast, and interactive rendering phases. However, `.jay-html` files still embed their data structure directly in the HTML, which has two limitations:

1. **No phase annotations**: Can't specify which properties belong to which rendering phase
2. **Limited reusability**: Data structure can't be shared between multiple HTML templates

## Problem Statement

Consider this `.jay-html` file:

```html
<html>
  <head>
    <script type="application/jay-data">
      data:
        slowlyRendered: string
        fastRendered: string
        fastDynamicRendered: string
    </script>
  </head>
  <body>
    <div>{slowlyRendered}</div>
    <div>{fastDynamicRendered}</div>
  </body>
</html>
```

**Current Issues:**

1. **No phase information**: The embedded data structure has no way to indicate which properties are slow vs fast
2. **Manual type definitions**: Developers must manually define phase-specific types:
   ```typescript
   type SlowlyViewState = Pick<PageViewState, 'slowlyRendered'>;
   type FastViewState = Omit<PageViewState, keyof SlowlyViewState>;
   ```
3. **No type safety**: Manual types can diverge from actual usage, no compile-time validation
4. **No generated contract type**: Can't use `makeJayStackComponent<PageContract>()` with phase-aware types

**Example from real codebase:**

File: `/Users/yoav/work/jay/jay/packages/jay-stack/stack-server-runtime/test/simple-page/page.ts`

```typescript
// Manual type definitions (error-prone, not validated)
type SlowlyViewState = Pick<PageViewState, 'slowlyRendered'>;
type FastViewState = Omit<PageViewState, keyof SlowlyViewState>;

// Line 1 tries to import PageContract, but it doesn't include phase types
import { render, PageElementRefs, PageViewState, PageContract } from './compiled/page.jay-html';

// Line 65 uses PageContract, but it has no phase-specific ViewState types
export const page = makeJayStackComponent<PageContract>()
  .withProps<PageProps>()
  .withSlowlyRender(renderSlowlyChanging) // No type validation!
  .withFastRender(renderFastChanging); // No type validation!
```

## Proposed Solution: Contract References

Allow `.jay-html` files to **reference an external `.jay-contract` file** for their data structure definition instead of embedding it inline.

### Core Design Principles

1. **Separation of Concerns**:

   - `.jay-contract` = Data structure + phase annotations (what to render)
   - `.jay-html` = Template + rendering logic (how to render)

2. **Single Source of Truth**: Contract defines the data structure once, HTML implements it

3. **Backward Compatibility**: Existing inline data structures continue to work

4. **Contract Reusability**: Multiple HTML templates can reference the same contract

5. **Type Safety**: Phase-specific types automatically generated from contract

### Syntax: Contract Reference in Jay HTML

#### Option A: Reference in `<script>` tag (Recommended)

```html
<html>
  <head>
    <!-- Reference external contract file -->
    <script type="application/jay-data" contract="./page.jay-contract"></script>
  </head>
  <body>
    <div>{slowlyRendered}</div>
    <div>{fastDynamicRendered}</div>
  </body>
</html>
```

**Pros:**

- Minimal syntax change
- Uses existing `<script type="application/jay-data">` tag
- Empty script body clearly indicates "defined elsewhere"
- `contract` attribute is explicit and discoverable

**Cons:**

- Script tag is empty (might be confusing initially)

#### Option B: Import-style reference at top

```html
<html>
  <head>
    <jay-import contract="./page.jay-contract" />

    <script type="application/jay-data">
      <!-- Data structure defined in referenced contract -->
    </script>
  </head>
  <body>
    <div>{slowlyRendered}</div>
    <div>{fastDynamicRendered}</div>
  </body>
</html>
```

**Pros:**

- More explicit "import" semantics
- Separates concern: import vs data declaration

**Cons:**

- Introduces new tag (`<jay-import>`)
- More verbose
- Two tags instead of one

#### Option C: Reference directly in data script

```html
<html>
  <head>
    <script type="application/jay-data">
      contract: ./page.jay-contract
    </script>
  </head>
  <body>
    <div>{slowlyRendered}</div>
    <div>{fastDynamicRendered}</div>
  </body>
</html>
```

**Pros:**

- Compact
- Uses existing YAML structure

**Cons:**

- Mixes contract reference with data definition syntax
- Less clear that it's a file reference

**Recommendation: Use Option A** - it's the most explicit and uses existing infrastructure with minimal changes.

### Complete Example

#### Step 1: Define Contract with Phases

**`page.jay-contract`:**

```yaml
name: Page
tags:
  # Static content - rendered at build time
  - tag: slowlyRendered
    type: data
    dataType: string
    phase: slow

  # Dynamic content - rendered per request
  - tag: fastRendered
    type: data
    dataType: string
    phase: fast

  - tag: fastDynamicRendered
    type: data
    dataType: string
    phase: fast

  # Interactive element
  interactive:
    - tag: button
      elementType: [button]
```

#### Step 2: Reference Contract in Jay HTML

**`page.jay-html`:**

```html
<html>
  <head>
    <!-- Reference external contract -->
    <script type="application/jay-data" contract="./page.jay-contract"></script>
  </head>
  <body>
    <div>
      <div>{slowlyRendered}</div>
      <div>{fastDynamicRendered}</div>
      <button ref="button" data-id="button">click</button>
    </div>
  </body>
</html>
```

#### Step 3: Generated Types

**`page.jay-html.d.ts`** (auto-generated from referenced contract):

```typescript
import { JayElement, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

// Full ViewState (from contract)
export interface PageViewState {
  slowlyRendered: string;
  fastRendered: string;
  fastDynamicRendered: string;
}

// Interactive element refs (from contract)
export interface PageElementRefs {
  button: HTMLElementProxy<PageViewState, HTMLButtonElement>;
}

// Phase-specific ViewStates (from contract phase annotations)
export type PageSlowViewState = Pick<PageViewState, 'slowlyRendered'>;
export type PageFastViewState = Pick<PageViewState, 'fastRendered' | 'fastDynamicRendered'>;
export type PageInteractiveViewState = {};

// Contract type with all 5 type parameters
export type PageContract = JayContract<
  PageViewState,
  PageElementRefs,
  PageSlowViewState,
  PageFastViewState,
  PageInteractiveViewState
>;

// Legacy exports for backward compatibility
export type PageElement = JayElement<PageViewState, PageElementRefs>;
// ... other exports
```

#### Step 4: Use with Type Safety

**`page.ts`:**

```typescript
import { PageContract } from './compiled/page.jay-html';
import {
  makeJayStackComponent,
  PageProps,
  partialRender,
} from '@jay-framework/fullstack-component';

// ✅ No manual type definitions needed!
// ✅ Phase-specific types come from contract

export const page = makeJayStackComponent<PageContract>()
  .withProps<PageProps>()
  .withSlowlyRender(async (props) => {
    return partialRender(
      {
        slowlyRendered: 'SLOWLY RENDERED',
        // fastRendered: 'test',  // ❌ TypeScript Error: Not in SlowViewState
      },
      { carryForwardSlowly: 'data' },
    );
  })
  .withFastRender(async (props, carryForward) => {
    return partialRender(
      {
        fastRendered: 'FAST RENDERED',
        fastDynamicRendered: 'FAST DYNAMIC',
        // slowlyRendered: 'test',  // ❌ TypeScript Error: Not in FastViewState
      },
      { carryForwardFast: 'data' },
    );
  })
  .withInteractive((props, refs, carryForward) => {
    refs.button.onclick(() => {
      // Interactive logic
    });
    return {
      render: () => ({}),
    };
  });
```

**Key Benefits:**

- ✅ No manual type definitions
- ✅ Compile-time phase validation
- ✅ IDE autocomplete works perfectly
- ✅ Single source of truth (contract)
- ✅ Types automatically stay in sync

## Semantic Rules

### Rule 1: Contract vs Inline Data (Mutually Exclusive)

A `.jay-html` file can have **either**:

- A contract reference: `<script type="application/jay-data" contract="./file.jay-contract">`
- Inline data structure: `<script type="application/jay-data">data:\n  prop: string</script>`

**NOT both.**

```html
<!-- ❌ Invalid: Both contract and inline data -->
<script type="application/jay-data" contract="./page.jay-contract">
  data:
    extraProp: string
</script>

<!-- ✅ Valid: Contract reference only -->
<script type="application/jay-data" contract="./page.jay-contract"></script>

<!-- ✅ Valid: Inline data only -->
<script type="application/jay-data">
  data:
    prop: string
</script>
```

**Validation Error:**

```
Error: page.jay-html (line 3): Cannot have both 'contract' attribute and inline data structure.
Either reference a contract file or define data inline, not both.
```

### Rule 2: Contract Path Resolution

Contract paths are resolved **relative to the `.jay-html` file location**:

```html
<!-- Relative path (same directory) -->
<script type="application/jay-data" contract="./page.jay-contract"></script>

<!-- Relative path (parent directory) -->
<script type="application/jay-data" contract="../contracts/page.jay-contract"></script>

<!-- Relative path (subdirectory) -->
<script type="application/jay-data" contract="./contracts/page.jay-contract"></script>
```

**Validation:** Compiler validates that the referenced contract file exists during compilation.

### Rule 3: Interactive Elements in HTML

Interactive elements (`ref` attributes) in the HTML **must be defined** as interactive elements in the referenced contract:

**Contract:**

```yaml
interactive:
  - tag: submitButton
    elementType: [button]
  - tag: cancelButton
    elementType: [button]
```

**HTML:**

```html
<!-- ✅ Valid: Matches contract -->
<button ref="submitButton">Submit</button>
<button ref="cancelButton">Cancel</button>

<!-- ✅ Valid: it is ok to omit the 'cancelButton' ref -->
<button ref="submitButton">Submit</button>

<!-- ❌ Invalid: Extra 'deleteButton' ref not in contract -->
<button ref="deleteButton">Delete</button>
```

**Validation Errors:**

```
Error: page.jay-html (line 15): Unknown ref 'deleteButton' not defined in page.jay-contract
```

### Rule 4: Template Variables in HTML

All template variables (`{varName}`) in the HTML **must be defined** in the referenced contract:

**Contract:**

```yaml
tags:
  - tag: title
    type: data
    dataType: string
  - tag: description
    type: data
    dataType: string
```

**HTML:**

```html
<!-- ✅ Valid: Both variables defined in contract -->
<h1>{title}</h1>
<p>{description}</p>

<!-- ❌ Invalid: 'author' not defined in contract -->
<span>{author}</span>
```

**Validation Error:**

```
Error: page.jay-html (line 8): Template variable '{author}' not defined in referenced contract page.jay-contract
```

### Rule 5: Contract Completeness

The referenced contract **does not need to include** every field from the HTML. However, the HTML **cannot use** fields not in the contract:

```yaml
# Contract defines more fields than HTML uses - ✅ OK
tags:
  - tag: title
    type: data
    dataType: string
  - tag: subtitle
    type: data
    dataType: string
  - tag: content
    type: data
    dataType: string
```

```html
<!-- ✅ Valid: Uses subset of contract fields -->
<h1>{title}</h1>
<p>{content}</p>
<!-- 'subtitle' not used - that's fine -->
```

**Rationale:** The contract is the full data structure; the HTML is one view of it.

### Rule 6: Backward Compatibility

Existing `.jay-html` files with inline data structures **continue to work** without modification:

```html
<!-- ✅ Still valid: Inline data (no phase annotations) -->
<html>
  <head>
    <script type="application/jay-data">
      data:
        title: string
        content: string
    </script>
  </head>
  <body>
    <h1>{title}</h1>
    <p>{content}</p>
  </body>
</html>
```

**Generated Types (backward compatible):**

data types defined in the jay-html are considered interactive by default, contrary to a contract.

```typescript
export interface PageViewState {
  title: string;
  content: string;
}

export interface PageElementRefs {}

// Phase-specific types default to full ViewState / empty
export type PageSlowViewState = {}; // Empty
export type PageFastViewState = {}; // Empty
export type PageInteractiveViewState = PageViewState; // all the PageViewState propeties

export type PageContract = JayContract<
  PageViewState,
  PageElementRefs,
  PageSlowViewState,
  PageFastViewState,
  PageInteractiveViewState
>;
```

## Implementation Plan

### Phase 1: Parser Extension

**Location:** `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-parser.ts`

1. **Detect contract reference:**

   ```typescript
   interface ParsedJayData {
     type: 'inline' | 'contract-ref';
     data?: InlineDataStructure; // For inline data
     contractPath?: string; // For contract reference
   }
   ```

2. **Parse `contract` attribute:**

   ```typescript
   function parseJayDataScript(scriptElement: HTMLScriptElement): ParsedJayData {
     const contractAttr = scriptElement.getAttribute('contract');

     if (contractAttr) {
       // Contract reference
       const scriptBody = scriptElement.textContent?.trim();
       if (scriptBody && scriptBody.length > 0) {
         throw new ValidationError('Cannot have both contract attribute and inline data structure');
       }
       return {
         type: 'contract-ref',
         contractPath: contractAttr,
       };
     } else {
       // Inline data (existing logic)
       return {
         type: 'inline',
         data: parseInlineDataStructure(scriptElement),
       };
     }
   }
   ```

3. **Resolve contract path:**
   ```typescript
   function resolveContractPath(htmlFilePath: string, contractPath: string): string {
     const htmlDir = path.dirname(htmlFilePath);
     const resolvedPath = path.resolve(htmlDir, contractPath);

     if (!fs.existsSync(resolvedPath)) {
       throw new ValidationError(`Referenced contract file not found: ${contractPath}`);
     }

     return resolvedPath;
   }
   ```

### Phase 2: Contract Loading

**Location:** `packages/compiler/compiler-jay-html/lib/jay-target/contract-loader.ts` (new file)

1. **Load and parse referenced contract:**

   ```typescript
   async function loadReferencedContract(contractPath: string): Promise<Contract> {
     const contractContent = await fs.promises.readFile(contractPath, 'utf-8');
     const contract = parseContract(contractContent); // Reuse existing parser
     return contract;
   }
   ```

2. **Validate contract:**
   ```typescript
   function validateContract(contract: Contract): void {
     // Use existing contract validator
     validatePhaseRules(contract); // From Design Log #50
   }
   ```

### Phase 3: HTML-Contract Validation

**Location:** `packages/compiler/compiler-jay-html/lib/jay-target/html-contract-validator.ts` (new file)

**Validate HTML against contract:**

```typescript
class HtmlContractValidator {
  /**
   * Validate that HTML template matches the referenced contract
   */
  validate(html: ParsedHTML, contract: Contract): ValidationErrors {
    const errors: ValidationErrors = [];

    // 1. Validate template variables
    const templateVars = extractTemplateVariables(html);
    for (const varName of templateVars) {
      if (!contractHasField(contract, varName)) {
        errors.push({
          line: getLineNumber(html, varName),
          message: `Template variable '{${varName}}' not defined in contract`,
        });
      }
    }

    // 2. Validate interactive element refs
    const htmlRefs = extractRefs(html);
    const contractRefs = extractInteractiveTags(contract);

    // Check for missing refs
    for (const refName of contractRefs) {
      if (!htmlRefs.has(refName)) {
        errors.push({
          message: `Missing required ref '${refName}' defined in contract`,
        });
      }
    }

    // Check for extra refs
    for (const refName of htmlRefs) {
      if (!contractRefs.has(refName)) {
        errors.push({
          line: getLineNumber(html, `ref="${refName}"`),
          message: `Unknown ref '${refName}' not defined in contract`,
        });
      }
    }

    return errors;
  }
}
```

### Phase 4: Type Generation

**Location:** `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts`

**For HTML with contract reference:**

```typescript
function compileJayHtml(htmlFile: string): GeneratedTypes {
  const parsed = parseJayHtml(htmlFile);

  if (parsed.jayData.type === 'contract-ref') {
    // Load referenced contract
    const contractPath = resolveContractPath(htmlFile, parsed.jayData.contractPath);
    const contract = loadReferencedContract(contractPath);

    // Validate contract
    validateContract(contract);

    // Validate HTML against contract
    const htmlValidator = new HtmlContractValidator();
    const errors = htmlValidator.validate(parsed.html, contract);
    if (errors.length > 0) {
      throw new CompilationError(errors);
    }

    // Generate types from contract (reuse existing logic from Design Log #50)
    const types = generateTypesFromContract(contract, {
      componentName: getComponentName(htmlFile),
      includePhaseTypes: true, // ✅ Generate phase-specific types
    });

    return types;
  } else {
    // Inline data (existing logic)
    return generateTypesFromInlineData(parsed.jayData.data, {
      componentName: getComponentName(htmlFile),
      includePhaseTypes: false, // ❌ No phase annotations in inline data
    });
  }
}
```

**Key Points:**

- Contract reference → Use contract parser (with phase support)
- Inline data → Use existing inline parser (no phase support)
- Same type generation output format for both

### Phase 5: Compiler Integration

**Location:** `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts`

1. Update compilation pipeline to handle contract references
2. Ensure generated `.jay-html.d.ts` includes phase-specific types
3. Maintain backward compatibility for inline data structures

### Phase 6: Documentation

1. Update Jay HTML documentation with contract reference syntax
2. Add migration guide: inline data → contract reference
3. Update examples in Jay Stack docs

## Generated Type Comparison

### Before: Inline Data (No Phase Support)

**`page.jay-html`:**

```html
<script type="application/jay-data">
  data:
    slowlyRendered: string
    fastRendered: string
</script>
```

**Generated `page.jay-html.d.ts`:**

```typescript
export interface PageViewState {
  slowlyRendered: string;
  fastRendered: string;
}

export interface PageElementRefs {}

// No phase-specific types OR defaults to all slow
export type PageSlowViewState = {};
export type PageFastViewState = {};
export type PageInteractiveViewState = PageViewState;

export type PageContract = JayContract<
  PageViewState,
  PageElementRefs,
  PageSlowViewState,
  PageFastViewState,
  PageInteractiveViewState
>;
```

### After: Contract Reference (With Phase Support)

**`page.jay-contract`:**

```yaml
name: Page
tags:
  - { tag: slowlyRendered, type: data, dataType: string, phase: slow }
  - { tag: fastRendered, type: data, dataType: string, phase: fast }
```

**`page.jay-html`:**

```html
<script type="application/jay-data" contract="./page.jay-contract"></script>
```

**Generated `page.jay-html.d.ts`:**

```typescript
export interface PageViewState {
  slowlyRendered: string;
  fastRendered: string;
}

export interface PageElementRefs {}

// Phase-specific types from contract ✅
export type PageSlowViewState = Pick<PageViewState, 'slowlyRendered'>;
export type PageFastViewState = Pick<PageViewState, 'fastRendered'>;
export type PageInteractiveViewState = {};

export type PageContract = JayContract<
  PageViewState,
  PageElementRefs,
  PageSlowViewState,
  PageFastViewState,
  PageInteractiveViewState
>;
```

## Migration Strategy

### Step 1: Add Contract Files (Backward Compatible)

Existing `.jay-html` files continue to work. New projects can adopt contract references immediately.

### Step 2: Gradual Migration

For existing projects, migrate one component at a time:

1. Create `.jay-contract` file with phase annotations
2. Update `.jay-html` to reference contract
3. Remove manual type definitions from `.ts` files
4. Regenerate types

## Benefits

1. **Type Safety**: Compile-time validation of rendering phases in `.jay-html` components
2. **Consistency**: Same phase annotation system for both `.jay-contract` and `.jay-html`
3. **Reusability**: Multiple HTML templates can share the same contract
4. **Maintainability**: Single source of truth for data structure
5. **Better Tooling**: IDE support, autocomplete, refactoring
6. **Clear Separation**: Contract (what) vs Template (how)
7. **Backward Compatible**: Existing code continues to work

## Trade-offs

**Pros:**

- ✅ Enables phase annotations in `.jay-html` components
- ✅ Reuses existing contract infrastructure
- ✅ Clear separation of concerns
- ✅ Minimal syntax changes
- ✅ Backward compatible

**Cons:**

- ❌ Requires two files per component (`.jay-html` + `.jay-contract`)
- ❌ Extra step in development (but can be automated)
- ❌ Potential for HTML-contract mismatch (mitigated by validation)

**Mitigation:**

- Compiler validates HTML matches contract at build time
- Clear error messages guide developers

## Open Questions

### Q1: Should we allow inline data with phase annotations?

**Option A: No (Recommended)**

- Keep it simple: inline data = no phases, contract reference = phases
- Avoids duplicating phase annotation syntax in two formats
- Encourages contract-first design

**Option B: Yes**

- Add phase annotations to inline YAML:
  ```yaml
  data:
    - { tag: title, dataType: string, phase: slow }
    - { tag: price, dataType: number, phase: fast }
  ```
- More flexible
- But increases complexity and maintenance burden

**Recommendation:** Start with Option A (no inline phase annotations), can add Option B later if strong demand.

### Q2: Can a contract be shared by multiple HTML files?

**Answer: Yes** - this is actually a benefit:

```
contracts/
  product-data.jay-contract     # Shared contract

pages/
  product-grid.jay-html          # References product-data.jay-contract
  product-list.jay-html          # References product-data.jay-contract
  product-detail.jay-html        # References product-data.jay-contract
```

All three HTML files use the same data structure but render it differently.

### Q3: What if contract has more fields than HTML uses?

**Answer: That's fine** - the contract is the full data structure, HTML is one view of it:

**Contract:**

```yaml
tags:
  - { tag: id, type: data, dataType: string }
  - { tag: name, type: data, dataType: string }
  - { tag: description, type: data, dataType: string }
  - { tag: price, type: data, dataType: number }
```

**HTML (uses subset):**

```html
<div>
  <h1>{name}</h1>
  <p>${price}</p>
</div>
```

This is valid - the HTML doesn't need to use every field from the contract.

### Q4: How do we handle contract versioning?

**Answer: File-system based** - same as code:

```
contracts/
  product-v1.jay-contract
  product-v2.jay-contract

pages/
  legacy-product.jay-html     # contract="./contracts/product-v1.jay-contract"
  new-product.jay-html        # contract="./contracts/product-v2.jay-contract"
```

No special versioning mechanism needed - just file references.

## Success Criteria

✅ **Feature Parity**: `.jay-html` with contract references has same phase support as `.jay-contract`
✅ **Type Safety**: Compile-time validation of phases in HTML components  
✅ **Backward Compatible**: Existing inline data structures continue to work  
✅ **Clear Errors**: Helpful validation messages for HTML-contract mismatches  
✅ **Developer Experience**: IDE support, autocomplete, refactoring work seamlessly  
✅ **Documentation**: Clear migration guide and examples

## Next Steps

1. **Phase 1**: Extend jay-html parser to detect and parse `contract` attribute
2. **Phase 2**: Implement contract loading and resolution
3. **Phase 3**: Implement HTML-contract validation
4. **Phase 4**: Update type generation to use contract-based types
5. **Phase 5**: Integration testing with existing fixtures
6. **Phase 6**: Update documentation and examples
7. **Phase 7**: Create migration tooling

## Related Design Logs

- **Design Log #50**: Rendering phases in contracts (foundation for this design)
- **Design Log #49**: Initial type-narrowing approach (findings informed both #50 and #51)
