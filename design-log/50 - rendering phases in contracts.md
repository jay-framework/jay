# Rendering Phases in Contracts - Code Generation Approach

## Background

From Design Log #49, we learned that TypeScript's type narrowing has fundamental limitations with nested structures. We need a different approach: **extending the contract format to declare rendering phases and generating phase-specific ViewState types at build time**.

## Problem Statement

Jay full-stack components render in three phases:
1. **Slow (build-time)**: Static data set at build time
2. **Fast (request-time)**: Dynamic data set per request, not interactive
3. **Interactive**: Data that can be modified on the client

Currently, there's no way to declare which phase each property belongs to, making it impossible for TypeScript to enforce type safety across rendering phases.

## Proposed Solution: Rendering Phase Metadata in Contracts

### Core Idea

Extend the `.jay-contract` format to include rendering phase metadata for each tag. The compiler will then generate three distinct ViewState types:
- `<ComponentName>SlowViewState` - properties available at build time
- `<ComponentName>FastViewState` - properties available at request time
- `<ComponentName>InteractiveViewState` - properties that can be modified on client

### Design Principles

1. **Source of Truth**: The contract is already the source of truth for ViewState - extend it to include phase information
2. **Sensible Defaults**: Most properties are slow (build-time), so that's the default
3. **Simple Syntax**: Minimal additional syntax - leverage existing contract structure
4. **Type Safety**: Generated types provide exact, compiler-enforced type safety
5. **No Runtime Overhead**: Pure build-time code generation
6. **Leverages Existing Patterns**: Interactive elements already go into `Refs` type - we're just adding phase-specific ViewState types

### Key Semantic Rules

**Objects (Grouping Only)**
- Object's `phase` attribute is **only a default** for child properties
- Object itself has **no semantic meaning** - it's just a grouping
- Object appears in a phase's ViewState if it has **any child property** in that phase
- Object's phase attribute is **optional** - children can declare their own phases

**Arrays (Structure Control)**
- Array's `phase` attribute controls **when the array structure is set** (which items exist)
- `phase: slow` → Array structure frozen at build time (items cannot be added/removed later)
- `phase: fast` → Array structure set at request time, frozen during interactive phase
- `phase: fast+interactive` → Array is mutable on client (can add/remove items)
- Array's child properties can have **later phases** than the array itself
  - Example: `slow` array can have `fast` or `fast+interactive` child properties
  - Constraint: Child `phase >= array.phase`

**Interactive Elements**
- Tags with `type: interactive` go into `<Component>Refs` type (existing pattern)
- Interactive elements are **NOT** part of any ViewState - they're element references
- No changes to existing interactive element handling

### Rendering Phase Rules

Based on contract tag types:

| Tag Type | Default Phase | Can Override? | Notes |
|----------|---------------|---------------|-------|
| `interactive` | interactive | ❌ No | Always interactive (by definition) |
| `data` | slow | ✅ Yes | Can be slow, fast, or fast+interactive |
| `variant` | slow | ✅ Yes | Can be slow, fast, or fast+interactive |
| `repeated` | slow | ✅ Yes | Can be slow, fast, or fast+interactive |

**Phase Options:**
- `slow` (default): Rendered at build time
- `fast`: Rendered at request time (SSR), not interactive
- `fast+interactive`: Rendered at request time, can be modified on client

### Contract Syntax Extension

#### Option A: Inline Phase Annotation (Recommended)

```jay-contract
contract ProductPage
  - {tag: name, type: data, dataType: string}                           # Default: slow
  - {tag: sku, type: data, dataType: string}                            # Default: slow
  - {tag: price, type: data, dataType: number, phase: slow}             # Explicit slow
  - {tag: inStock, type: data, dataType: boolean, phase: fast}          # Fast rendering
  - {tag: quantity, type: variant, dataType: number, phase: fast+interactive}  # Interactive
  
  # Interactive tags don't need phase (always interactive)
  - {tag: addToCart, type: interactive}
  
  # Repeated contracts
  - {tag: images, type: repeated, phase: slow}
    - {tag: url, type: data, dataType: string}
    - {tag: alt, type: data, dataType: string}
  
  # Nested objects with mixed phases
  - {tag: discount, type: data, dataType: object, phase: slow}
    - {tag: type, type: data, dataType: string}              # Inherits slow from parent
    - {tag: amount, type: data, dataType: number, phase: fast}  # Override to fast
    - {tag: applied, type: variant, dataType: boolean, phase: fast+interactive}  # Interactive
```

**Pros:**
- Clear and explicit
- Easy to see phase at a glance
- Follows existing contract syntax patterns
- IDE can autocomplete phase values

**Cons:**
- Slightly more verbose
- Need to repeat `phase:` keyword

#### Option B: Shorthand Suffix (Alternative)

```jay-contract
contract ProductPage
  - {tag: name, type: data, dataType: string}           # Default: slow
  - {tag: inStock, type: data:fast, dataType: boolean}  # Fast rendering
  - {tag: quantity, type: variant:fast+interactive, dataType: number}  # Interactive
```

**Pros:**
- More concise
- Reads naturally

**Cons:**
- Less explicit
- Harder to parse
- Doesn't follow existing syntax patterns

**Recommendation: Use Option A (inline phase annotation)** - it's more explicit and follows Jay's existing syntax patterns.

### Generated TypeScript Types

From the contract above, the compiler would generate:

```typescript
// Generated from ProductPage.jay-contract

/** Full ViewState (for reference) - data and variant properties only */
export interface ProductPageViewState {
  name: string;
  sku: string;
  price: number;
  inStock: boolean;
  quantity: number;
  images: Array<{
    url: string;
    alt: string;
  }>;
  discount: {
    type: string;
    amount: number;
    applied: boolean;
  };
}

/** Interactive element refs (unchanged - existing pattern) */
export interface ProductPageRefs {
  addToCart: HTMLElementProxy<ProductPageViewState, HTMLButtonElement>;
}

/** Properties available in slow (build-time) phase */
export interface ProductPageSlowViewState {
  name: string;
  sku: string;
  price: number;
  images: Array<{
    url: string;
    alt: string;
  }>;
  discount: {
    type: string;
  };
}

/** Properties available in fast (request-time) phase */
export interface ProductPageFastViewState {
  inStock: boolean;
  quantity: number;
  discount: {
    amount: number;
    applied: boolean;
  };
}

/** Properties available in interactive (client-side) phase */
export interface ProductPageInteractiveViewState {
  quantity: number;
  discount: {
    applied: boolean;
  };
}
```

**Key Points:**
- **Naming Convention**: `<Component>SlowViewState`, `<Component>FastViewState`, `<Component>InteractiveViewState`
- **Interactive Elements**: Interactive tags (type: `interactive`) go into `<Component>Refs`, NOT ViewState (existing pattern, unchanged)
- **ViewState Phases**: Only contain `data` and `variant` properties for each respective phase

### Render Function Signatures

With generated types, render functions become type-safe:

```typescript
// Before (no type safety across phases)
function renderSlowlyChanging(props: ProductPageProps): ProductPageViewState {
  return {
    name: props.product.name,
    sku: props.product.sku,
    price: props.product.price,
    quantity: 0,  // ❌ Should not be here, but TypeScript doesn't catch it
    // ...
  };
}

// After (with generated types)
function renderSlowlyChanging(props: ProductPageProps): ProductPageSlowViewState {
  return {
    name: props.product.name,
    sku: props.product.sku,
    price: props.product.price,
    quantity: 0,  // ✅ TypeScript error: 'quantity' does not exist in type 'ProductPageSlowViewState'
    images: props.product.images,
    discount: {
      type: props.product.discountType,
    },
  };
}

function renderFastChanging(
  props: ProductPageProps,
  inventory: InventoryService
): ProductPageFastViewState {
  return {
    inStock: inventory.isInStock(props.product.id),
    quantity: inventory.getQuantity(props.product.id),
    discount: {
      amount: calculateDiscount(props.product),
      applied: false,  // Will be set to true interactively
    },
  };
}

class ProductPageConstructor {
  constructor(viewState: ProductPageInteractiveViewState, refs: ProductPageRefs) {
    // viewState only contains fast+interactive data/variant properties
    // refs contains interactive element references (addToCart button)
    refs.addToCart.addEventListener('click', () => {
      // Can modify interactive properties
      viewState.quantity++;
      viewState.discount.applied = true;
    });
  }
}
```

## Phase Inheritance and Nesting Rules

### Rule 1: Objects - Phase as Default Only

For object properties, the `phase` attribute (if specified) serves **only as a default** for child properties. It has **no semantic meaning** for the object itself.

```jay-contract
# Object phase is just a convenience - sets default for children
- {tag: discount, type: data, dataType: object, phase: slow}  # Default for children
  - {tag: type, type: data, dataType: string}                  # Inherits 'slow' default
  - {tag: amount, type: data, dataType: number, phase: fast}   # Override to 'fast'
  - {tag: applied, type: variant, dataType: boolean, phase: fast+interactive}  # Override to 'fast+interactive'
```

Generates:
```typescript
interface ProductPageSlowViewState {
  discount: {
    type: string;  // Only slow properties
  };
}

interface ProductPageFastViewState {
  discount: {
    amount: number;    // Only fast properties
    applied: boolean;  // fast+interactive properties appear in fast phase
  };
}

interface ProductPageInteractiveViewState {
  discount: {
    applied: boolean;  // Only fast+interactive properties
  };
}
```

**Alternative:** Object phase attribute could be **optional**. If omitted, each child must declare its own phase:

```jay-contract
# No phase on object - each child declares explicitly
- {tag: discount, type: data, dataType: object}
  - {tag: type, type: data, dataType: string, phase: slow}
  - {tag: amount, type: data, dataType: number, phase: fast}
```

**Key Insight:** Objects are always included in a phase's ViewState if they have any child property in that phase. The object itself doesn't "belong" to a phase - only its properties do.

### Rule 2: Arrays - Phase Controls Array Structure

For repeated contracts (arrays), the `phase` attribute controls **when the array structure is set** (which items exist in the array):

```jay-contract
# Slow array: Array structure set at build time (frozen list of items)
- {tag: images, type: repeated, phase: slow}
  - {tag: url, type: data, dataType: string}           # Defaults to slow
  - {tag: alt, type: data, dataType: string}           # Defaults to slow
  - {tag: loading, type: variant, dataType: boolean, phase: fast}  # ✅ OK: fast >= slow

# Fast array: Array structure set at request time (frozen during interactive phase)
- {tag: products, type: repeated, phase: fast}
  - {tag: id, type: data, dataType: string}            # Defaults to fast
  - {tag: name, type: data, dataType: string}          # Defaults to fast
  - {tag: selected, type: variant, dataType: boolean, phase: fast+interactive}  # ✅ OK

# Interactive array: Can add/remove items on client
- {tag: reviews, type: repeated, phase: fast+interactive}
  - {tag: id, type: data, dataType: string}            # Defaults to fast+interactive
  - {tag: text, type: data, dataType: string}          # Defaults to fast+interactive
```

**Validation Rules for Arrays:**

1. **Array phase sets minimum child phase**: All child properties must have `phase >= array.phase`
   ```jay-contract
   # ✅ Valid: Children can be same or later phase
   - {tag: items, type: repeated, phase: slow}
     - {tag: id, type: data, dataType: string}           # slow (inherited)
     - {tag: name, type: data, dataType: string, phase: fast}  # fast > slow ✅
   
   # ❌ Invalid: Child phase earlier than array phase
   - {tag: items, type: repeated, phase: fast}
     - {tag: id, type: data, dataType: string, phase: slow}  # slow < fast ❌
   ```

2. **Array appears in phase where it's set AND all later phases**:
   ```jay-contract
   - {tag: images, type: repeated, phase: slow}
     - {tag: url, type: data, dataType: string}
     - {tag: caption, type: data, dataType: string, phase: fast}
   ```
   
   Generates:
   ```typescript
   interface ProductPageSlowViewState {
     images: Array<{
       url: string;  // Only slow properties of item
     }>;
   }
   
   interface ProductPageFastViewState {
     images: Array<{
       url: string;     // All properties slow or fast
       caption: string;
     }>;
   }
   
   interface ProductPageInteractiveViewState {
     images: Array<{
       url: string;     // All properties (array is frozen, but items still accessible)
       caption: string;
     }>;
   }
   ```

3. **Array mutation semantics**:
   - `phase: slow` → Array structure frozen at build time. Cannot add/remove/reorder items in fast or interactive phases.
   - `phase: fast` → Array structure set at request time, frozen during interactive phase. Cannot add/remove/reorder items interactively.
   - `phase: fast+interactive` → Array is mutable. Can add/remove/reorder items on client.

### Rule 3: Phase Ordering and Constraints

Phase ordering: `slow < fast < fast+interactive`

- **For objects**: No constraint (phase is just a default for children)
- **For arrays**: Child properties must have `phase >= array.phase`
- **For nested objects within arrays**: Follow object rules (phase is default for nested children)

## Implementation Plan

### Phase 1: Contract Parser Extension
**Location:** `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-parser.ts`

1. Extend contract AST to include `phase` field:
   ```typescript
   interface ContractTag {
     tag: string;
     type: 'data' | 'variant' | 'interactive' | 'repeated';
     dataType?: string;
     phase?: 'slow' | 'fast' | 'fast+interactive';  // NEW
     children?: ContractTag[];
   }
   ```

2. Parse `phase` attribute from contract syntax
3. Apply default phase rules:
   - `interactive` tags → `fast+interactive`
   - All others → `slow` (if not specified)

### Phase 2: Contract Validator
**Location:** `packages/compiler/compiler-jay-html/lib/jay-target/contract-validator.ts` (new file)

Validate phase rules:
1. ✅ Interactive tags don't have explicit `phase` attribute (it's implicit)
2. ✅ Phase values are valid: `slow`, `fast`, or `fast+interactive`
3. ✅ Child phases are >= parent phases
4. ✅ Interactive arrays have all interactive children
5. ✅ Emit clear error messages with line numbers

### Phase 3: Type Generator
**Location:** `packages/compiler/compiler-jay-html/lib/jay-target/phase-type-generator.ts` (new file)

Generate TypeScript interfaces:

```typescript
class PhaseTypeGenerator {
  /**
   * Generate phase-specific ViewState types from contract
   */
  generatePhaseTypes(contract: Contract): string {
    const fullType = this.generateFullViewState(contract);
    const slowType = this.generatePhaseViewState(contract, 'slow');
    const fastType = this.generatePhaseViewState(contract, 'fast');
    const interactiveType = this.generatePhaseViewState(contract, 'fast+interactive');
    
    return `
      ${fullType}
      ${slowType}
      ${fastType}
      ${interactiveType}
    `;
  }
  
  private generatePhaseViewState(
    contract: Contract, 
    phase: Phase
  ): string {
    // Filter contract tags by phase
    // Generate TypeScript interface
    // Handle nested objects recursively
  }
}
```

Output file: `<contract-name>.phases.generated.ts`

### Phase 4: Compiler Integration
**Location:** `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts`

1. After parsing contract, validate phases
2. Generate phase-specific types alongside existing types
3. Export generated types from contract file:
   ```typescript
   export { ProductPageViewState_Slow, ProductPageViewState_Fast, ProductPageViewState_Interactive } from './product-page.phases.generated';
   ```

### Phase 5: Builder API Update
**Location:** `packages/jay-stack/full-stack-component/lib/jay-stack-builder.ts`

Update builder to use generated types:

```typescript
interface JayStackBuilder<ViewState, Refs, SlowVS, FastVS, InteractiveVS> {
  withSlowlyRender(
    render: (props: Props) => SlowVS
  ): JayStackBuilder<ViewState, Refs, SlowVS, FastVS, InteractiveVS>;
  
  withFastRender(
    render: (props: Props, ...services) => FastVS
  ): JayStackBuilder<ViewState, Refs, SlowVS, FastVS, InteractiveVS>;
  
  withInteractive(
    constructor: new (viewState: InteractiveVS, refs: Refs) => Component
  ): JayStackComponent<ViewState, Refs>;
}

// Usage:
const page = makeJayStackComponent<typeof render>()
  .withProps<PageProps>()
  .withSlowlyRender(renderSlowlyChanging)  // Returns ProductPageSlowViewState
  .withFastRender(renderFastChanging)      // Returns ProductPageFastViewState
  .withInteractive(ProductPageConstructor); // Receives (ProductPageInteractiveViewState, ProductPageRefs)
```

**Note**: The builder already has the `Refs` type parameter - we're just adding the phase-specific ViewState types (`SlowVS`, `FastVS`, `InteractiveVS`).

## Migration Path

### Backward Compatibility

**Existing contracts without phase annotations:**
- All `data` and `variant` tags default to `slow` phase
- `interactive` tags go into `Refs` (existing behavior, unchanged)
- Generated types:
  - `<Component>SlowViewState` = all data/variant properties
  - `<Component>FastViewState` = empty `{}`
  - `<Component>InteractiveViewState` = empty `{}`
  - `<Component>Refs` = all interactive elements (existing)

**Example:**
```jay-contract
# Old contract (no phase annotations)
name: ProductPage
tags:
  - tag: name
    type: data
    dataType: string
  - tag: price
    type: data
    dataType: number
  - tag: addToCart
    type: interactive
    elementType: HTMLButtonElement
```

Generates:
```typescript
interface ProductPageViewState {
  name: string;
  price: number;
}

interface ProductPageRefs {
  addToCart: HTMLElementProxy<ProductPageViewState, HTMLButtonElement>;
}

interface ProductPageSlowViewState {
  name: string;
  price: number;
}

interface ProductPageFastViewState {
  // Empty - no fast properties declared
}

interface ProductPageInteractiveViewState {
  // Empty - no interactive properties declared
}
```

This ensures existing code continues to work.

### Gradual Adoption

1. **Phase 1**: Add phase annotations to new contracts
2. **Phase 2**: Migrate existing contracts one at a time
3. **Phase 3**: Lint rule to encourage phase annotations

## Examples

### Example 0: Objects vs Arrays - Key Differences

This example highlights the semantic difference between objects and arrays:

```jay-contract
contract Demo
  # OBJECT: Phase is just a default for children
  - {tag: pricing, type: data, dataType: object, phase: slow}  # Optional, just a default
    - {tag: base, type: data, dataType: number}          # Inherits slow (default)
    - {tag: discount, type: data, dataType: number, phase: fast}  # Override to fast
    # Result: pricing object appears in BOTH slow and fast ViewStates
    #   - SlowViewState has pricing.base
    #   - FastViewState has pricing.discount
  
  # ARRAY: Phase controls when array structure is set
  - {tag: images, type: repeated, phase: slow}  # Array structure frozen at build time
    - {tag: url, type: data, dataType: string}         # Inherits slow
    - {tag: loaded, type: variant, dataType: boolean, phase: fast}  # ✅ OK: fast >= slow
    # Result: Array appears in slow, fast, AND interactive ViewStates
    #   - SlowViewState: images with url only
    #   - FastViewState: images with url + loaded
    #   - InteractiveViewState: images with url + loaded (structure still frozen)
  
  - {tag: cart, type: repeated, phase: fast+interactive}  # Mutable array
    - {tag: productId, type: data, dataType: string}     # Must be fast+interactive
    - {tag: quantity, type: variant, dataType: number}   # Must be fast+interactive
    # Result: Can add/remove cart items on client
```

Generated types:
```typescript
interface DemoSlowViewState {
  pricing: {
    base: number;  // Only slow child
  };
  images: Array<{
    url: string;  // Only slow children
  }>;
  // cart doesn't appear (it's fast+interactive)
}

interface DemoFastViewState {
  pricing: {
    discount: number;  // Only fast child
  };
  images: Array<{
    url: string;    // All slow or fast children
    loaded: boolean;
  }>;
  cart: Array<{  // Array structure set here
    productId: string;
    quantity: number;
  }>;
}

interface DemoInteractiveViewState {
  // pricing doesn't appear (no interactive children)
  images: Array<{   // Frozen structure, but items still accessible
    url: string;
    loaded: boolean;
  }>;
  cart: Array<{  // Mutable - can add/remove items
    productId: string;
    quantity: number;
  }>;
}
```

### Example 1: E-commerce Product Page

```jay-contract
contract ProductPage
  # Static product info (rendered at build time)
  - {tag: name, type: data, dataType: string}
  - {tag: sku, type: data, dataType: string}
  - {tag: description, type: data, dataType: string}
  - {tag: images, type: repeated, phase: slow}
    - {tag: url, type: data, dataType: string}
    - {tag: alt, type: data, dataType: string}
  
  # Dynamic pricing (rendered per request)
  - {tag: price, type: data, dataType: number, phase: fast}
  - {tag: inStock, type: data, dataType: boolean, phase: fast}
  
  # User interactions (client-side)
  - {tag: quantity, type: variant, dataType: number, phase: fast+interactive}
  - {tag: selectedSize, type: variant, dataType: string, phase: fast+interactive}
  - {tag: addToCart, type: interactive}
  
  # User reviews (mutable array)
  - {tag: reviews, type: repeated, phase: fast+interactive}
    - {tag: id, type: data, dataType: string, phase: fast+interactive}
    - {tag: author, type: data, dataType: string, phase: fast+interactive}
    - {tag: rating, type: data, dataType: number, phase: fast+interactive}
    - {tag: comment, type: data, dataType: string, phase: fast+interactive}
```

### Example 2: Blog Post

```jay-contract
contract BlogPost
  # Static content
  - {tag: title, type: data, dataType: string}
  - {tag: content, type: data, dataType: string}
  - {tag: author, type: data, dataType: string}
  - {tag: publishedDate, type: data, dataType: string}
  
  # Dynamic stats
  - {tag: viewCount, type: data, dataType: number, phase: fast}
  - {tag: likeCount, type: data, dataType: number, phase: fast}
  
  # User interaction
  - {tag: liked, type: variant, dataType: boolean, phase: fast+interactive}
  - {tag: toggleLike, type: interactive}
```

## Open Questions

1. **Q: Should we allow phase override at the property level within repeated contracts?**
   - A: No. The repeated contract phase applies to the entire array. Individual items can't have different phases because arrays are rendered atomically.

2. **Q: What about optional properties?**
   - A: Optional properties work the same way - they're optional in their respective phase ViewState types.

3. **Q: How do we handle async properties?**
   - A: Async is orthogonal to phases. Each phase resolves async independently (covered in Design Log #49).

4. **Q: Can we have validation at dev server startup?**
   - A: Yes, but primary validation is at compile time (contract validation). Dev server can provide runtime warnings.

5. **Q: Should generated files be committed or .gitignored?**
   - A: **Recommendation**: Commit them (like `.jay-contract.ts` files). Makes code review easier and provides stable types for IDEs.

## Success Criteria

✅ **Type Safety**: Compiler enforces correct property usage across phases
✅ **Clear Errors**: Helpful error messages when using wrong property in wrong phase  
✅ **Zero Runtime Cost**: Pure compile-time generation
✅ **Backward Compatible**: Existing contracts work without modification
✅ **Developer Experience**: IDE autocomplete works perfectly
✅ **Maintainable**: Generated types are readable and debuggable

## Next Steps

1. Create Phase 1: Extend contract parser
2. Create Phase 2: Add contract validator
3. Create Phase 3: Implement type generator
4. Create Phase 4: Integrate with compiler
5. Create Phase 5: Update builder API
6. Test with real contracts
7. Document in Jay docs

