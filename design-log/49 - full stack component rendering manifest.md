# Full Stack Component refinement for gradual rendering

The Jay full stack component, created using the Syntax below, is based on the `ViewState` type for page rendering, 
where `renderSlowlyChanging` renders part of the `ViewState` members and both `renderFastChanging` and `ProductsPageConstructor`
render the rest of the `ViewState` members. 

The current API is at [jay-stack-builder.ts](packages/jay-stack/full-stack-component/lib/jay-stack-builder.ts), 
and an example usage is

```typescript
export const page = makeJayStackComponent<typeof render>()
  .withProps<PageProps>()
  .withServices(PRODUCTS_DATABASE_SERVICE, INVENTORY_SERVICE)
  .withLoadParams(urlLoader)
  .withSlowlyRender(renderSlowlyChanging)
  .withFastRender(renderFastChanging)
  .withInteractive(ProductsPageConstructor);
```

The above has a problem that it does not capture the relationship between the rendering phases accurately. 
We need to extend the above with

1. ability to define for nested properties (under objects and arrays) which is rendered at which phase.
2. ability to define when an array elements are set, and elements cannot be added / removed / moved in the array.
3. support for 3 rendering modes
   4. slow rendering
   5. fast rendering
   6. fast and interactive rendering

Note: 
- it does not make sense to combine (for the same attribute) slow and fast rendering, 
  as fast rendering will override the slow rendered value
- it does not make sense to render only interactive value, as what will be rendered for it on SSR?
- when an array is interactive (as we can add elements on the client), all the array child attributes have to be
  also interactive, as we can add a new item and we need all the data.
- when an array is rendered slowly or fast, it means that array items cannot be added or removed in the interactive phase.

## direction of the solution 

We suggest to add another builder phase at which we provide a schema, additional metadata for the product state type
as a constant (that can be used in runtime) and as a type (that can be used to define the Slowly, Fast and Interactive ViewState)

We want the schema to define, for each attribute of the view state, what rendering phase it is rendered at.

## Proposed Solution: Rendering Manifest Schema

### Overview

The ViewState type is defined by the contract (from `.jay-contract` files or `render` function in `.jay-html`). 
The rendering manifest schema provides **metadata** for properties in the ViewState, declaring:
1. Which rendering phase sets each property's value (slow, fast, or fast+interactive)
2. Whether arrays are frozen (cannot be modified in interactive phase) or mutable
3. Type-level narrowing of ViewState per rendering phase

**Key Principle**: The schema doesn't define ViewState - it annotates it. The schema should either:
- Be inferred from the ViewState type with explicit annotations
- Be validated against the ViewState type to ensure consistency

### Core Concepts

#### Rendering Phases

```typescript
/**
 * Defines the three rendering phases in Jay Stack components
 */
export enum RenderingPhase {
  /** 
   * Slow rendering phase - executed at build time or data change time
   * For semi-static data that doesn't change often
   */
  SLOW = 'slow',
  
  /** 
   * Fast rendering phase - executed at request time
   * For dynamic data that can be cached
   */
  FAST = 'fast',
  
  /** 
   * Interactive rendering phase - executed on the client
   * For reactive, user-interactive data
   */
  INTERACTIVE = 'interactive',
}
```

#### Rendering Mode

A rendering mode defines when a property's value is SET. The valid modes are:

```typescript
/**
 * Valid rendering modes for a property
 *
 * Note: These are MUTUALLY EXCLUSIVE for when the value is SET:
 * - 'slow' means the value is set at build time and remains static
 * - 'fast' means the value is set at request time (not set in slow)
 * - 'fast+interactive' means the value is set at request time and can be MODIFIED on client
 * 
 * Invalid combinations and why:
 * - 'slow+fast' - Fast would override slow, so this is redundant
 * - 'slow+interactive' - Interactive needs a request-time value to hydrate properly
 * - 'interactive' only - SSR needs an initial value, can't be client-only
 */
export type RenderingMode =
  | 'slow'                    // Set in slow phase (static, never changes)
  | 'fast'                    // Set in fast phase (dynamic, but not interactive)
  | 'fast+interactive';       // Set in fast phase, modifiable in interactive phase

/**
 * Type-level validation of rendering mode constraints
 */
type ValidateRenderingMode<Mode extends string> = 
  Mode extends 'slow' | 'fast' | 'fast+interactive'
    ? Mode
    : never;
```

#### Schema Node Types

```typescript
/**
 * Base interface for all schema nodes
 * The 'type' property acts as a discriminator for the union type
 */
interface BaseSchemaNode {
  /** Discriminator property for schema node types */
  type: 'primitive' | 'object' | 'array';
}

/**
 * Schema node for primitive values (string, number, boolean, enum)
 */
interface PrimitiveSchemaNode extends BaseSchemaNode {
  type: 'primitive';
  /** The rendering mode for this property */
  mode: RenderingMode;
}

/**
 * Schema node for array properties
 */
interface ArraySchemaNode<ItemViewState extends object = any> extends BaseSchemaNode {
  type: 'array';
  /** The rendering mode for the array itself, not including child objects */
  mode: RenderingMode;
  /** Schema for array item properties */
  itemSchema: RenderingManifestSchema<ItemViewState>;
}

/**
 * Schema node for object properties
 */
interface ObjectSchemaNode<NestedViewState extends object = any> extends BaseSchemaNode {
  type: 'object';
  /** Schema for nested properties */
  properties: RenderingManifestSchema<NestedViewState>;
}

/**
 * Union type for all schema node types
 */
export type SchemaNode<ViewState extends object = any> = 
  | PrimitiveSchemaNode 
  | ObjectSchemaNode<ViewState>
  | ArraySchemaNode<ViewState>;

/**
 * The rendering manifest schema maps ViewState property names to their schema nodes
 * Generic on ViewState to ensure schema keys match ViewState properties
 */
export type RenderingManifestSchema<ViewState extends object = any> = {
  [K in keyof ViewState]?: ViewState[K] extends Array<infer Item>
    ? Item extends object
      ? ArraySchemaNode<Item>
      : ArraySchemaNode<any>
    : ViewState[K] extends object
    ? ObjectSchemaNode<ViewState[K]> | PrimitiveSchemaNode
    : PrimitiveSchemaNode;
};
```

#### Schema Factory Functions

```typescript
/**
 * Factory functions for creating schema nodes with less boilerplate
 */

/**
 * Create a primitive schema node with mode='slow'
 * Use for static data set at build time
 */
export function slow(): PrimitiveSchemaNode {
  return {
    type: 'primitive',
    mode: 'slow',
  };
}

/**
 * Create a primitive schema node with mode='fast'
 * Use for dynamic data set at request time (not interactive)
 */
export function fast(): PrimitiveSchemaNode {
  return {
    type: 'primitive',
    mode: 'fast',
  };
}

/**
 * Create a primitive schema node with mode='fast+interactive'
 * Use for data set at request time that can be modified on client
 */
export function interactive(): PrimitiveSchemaNode {
  return {
    type: 'primitive',
    mode: 'fast+interactive',
  };
}

/**
 * Create an object schema node
 * Objects don't have their own mode - child properties define their own modes
 */
export function object<ViewState extends object>(
  properties: RenderingManifestSchema<ViewState>
): ObjectSchemaNode<ViewState> {
  return {
    type: 'object',
    properties,
  };
}

/**
 * Create an array schema node with mode='slow'
 * Array structure is frozen - cannot add/remove items on client
 */
export function slowArray<ItemViewState extends object>(
  itemSchema: RenderingManifestSchema<ItemViewState>
): ArraySchemaNode<ItemViewState> {
  return {
    type: 'array',
    mode: 'slow',
    itemSchema,
  };
}

/**
 * Create an array schema node with mode='fast'
 * Array structure is frozen - cannot add/remove items on client
 */
export function fastArray<ItemViewState extends object>(
  itemSchema: RenderingManifestSchema<ItemViewState>
): ArraySchemaNode<ItemViewState> {
  return {
    type: 'array',
    mode: 'fast',
    itemSchema,
  };
}

/**
 * Create an array schema node with mode='fast+interactive'
 * Array is mutable - can add/remove items on client
 * All child properties must be mode='fast+interactive'
 */
export function interactiveArray<ItemViewState extends object>(
  itemSchema: RenderingManifestSchema<ItemViewState>
): ArraySchemaNode<ItemViewState> {
  return {
    type: 'array',
    mode: 'fast+interactive',
    itemSchema,
  };
}

/**
 * Create a complete rendering manifest schema for a ViewState
 * Provides type checking that schema keys match ViewState properties
 * 
 * @example
 * const schema = createSchema<ProductPageViewState>({
 *   name: slow(),
 *   price: fast(),
 * });
 */
export function createSchema<ViewState extends object>(
  schema: RenderingManifestSchema<ViewState>
): RenderingManifestSchema<ViewState> {
  return schema;
}
```

### Schema Validation Rules

```typescript
/**
 * Validation rules that must be enforced at compile-time and runtime
 */
export interface SchemaValidationRules {
  /**
   * Rule 1: Mode must be one of the valid rendering modes
   * Valid: 'slow', 'fast', 'fast+interactive'
   * Invalid: 'slow+fast', 'slow+interactive', 'interactive'
   */
  validMode: (mode: RenderingMode) => boolean;
  
  /**
   * Rule 2: Arrays with mode='fast+interactive' require all children to be 'fast+interactive'
   * Rationale: If array is mutable (can add items on client), all child properties 
   * must be interactive to provide full data for new items
   * 
   * Arrays with mode='slow' or 'fast' are frozen (immutable structure):
   * - Cannot add/remove/move items in interactive phase
   * - Can only modify existing item properties if they're marked 'fast+interactive'
   */
  mutableArrayChildrenMustBeInteractive: (
    arrayMode: RenderingMode,
    childModes: RenderingMode[]
  ) => boolean;
  
  /**
   * Rule 3: Object and array children modes must be compatible with parent
   * - If parent is 'slow', children must be 'slow'
   * - If parent is 'fast', children can be 'fast' or 'fast+interactive'
   * - If parent is 'fast+interactive', children can be 'fast' or 'fast+interactive'
   * 
   * Note: For arrays, the parent mode is the array's mode, children are item properties
   * Note: For objects, if object has no explicit mode, no restriction on children
   */
  childModeCompatibleWithParent: (
    parentMode: RenderingMode | undefined,
    childMode: RenderingMode
  ) => boolean;
  
  /**
   * Rule 4: Schema keys must match ViewState keys
   * Note: This is enforced at compile-time via generic constraint
   * Runtime validation can check for completeness (optional vs required)
   */
  schemaMatchesViewState: (
    viewStateKeys: string[],
    schemaKeys: string[]
  ) => boolean;
}
```

### Example Schema Definitions

```typescript
/**
 * Example: Product page ViewState (defined by contract)
 */
interface ProductPageViewState {
  // Static product information
  name: string;
  sku: string;
  price: number;
  
  // Dynamic data
  inStock: boolean;
  quantity: number;
  
  // Collections
  images: Array<{ url: string; alt: string }>;
  reviews: Array<{
    id: string;
    author: string;
    rating: number;
    comment: string;
  }>;
  
  // Nested object
  discount: {
    type: string;
    amount: number;
    applied: boolean;
  };
}

/**
 * Schema using factory functions (recommended approach)
 * Much more concise and readable than raw schema objects
 */
const productPageSchema = createSchema<ProductPageViewState>({
  // Static product information - set once at build time
  name: slow(),
  sku: slow(),
  price: slow(),
  
  // Dynamic inventory status - set at request time
  inStock: fast(),
  
  // User-interactive quantity selection
  quantity: interactive(),
  
  // Static list of product images - frozen array (cannot add/remove items)
  images: slowArray({
    url: slow(),
    alt: slow(),
  }),
  
  // User reviews - mutable array (can add/remove items on client)
  reviews: interactiveArray({
    id: interactive(),
    author: interactive(),
    rating: interactive(),
    comment: interactive(),
  }),
  
  // Nested object with mixed rendering modes
  discount: object({
    type: slow(),           // Static discount type
    amount: fast(),         // Dynamic amount (may vary by user/time)
    applied: interactive(), // User can toggle on client
  }),
});

/**
 * Without factory functions (verbose but equivalent)
 */
const productPageSchemaVerbose = {
  name: { type: 'primitive' as const, mode: 'slow' as const },
  sku: { type: 'primitive' as const, mode: 'slow' as const },
  price: { type: 'primitive' as const, mode: 'slow' as const },
  inStock: { type: 'primitive' as const, mode: 'fast' as const },
  quantity: { type: 'primitive' as const, mode: 'fast+interactive' as const },
  
  images: {
    type: 'array' as const,
    mode: 'slow' as const,
    itemSchema: {
      url: { type: 'primitive' as const, mode: 'slow' as const },
      alt: { type: 'primitive' as const, mode: 'slow' as const },
    } satisfies RenderingManifestSchema<{ url: string; alt: string }>,
  },
  
  reviews: {
    type: 'array' as const,
    mode: 'fast+interactive' as const,
    itemSchema: {
      id: { type: 'primitive' as const, mode: 'fast+interactive' as const },
      author: { type: 'primitive' as const, mode: 'fast+interactive' as const },
      rating: { type: 'primitive' as const, mode: 'fast+interactive' as const },
      comment: { type: 'primitive' as const, mode: 'fast+interactive' as const },
    } satisfies RenderingManifestSchema<{
      id: string;
      author: string;
      rating: number;
      comment: string;
    }>,
  },
  
  discount: {
    type: 'object' as const,
    properties: {
      type: { type: 'primitive' as const, mode: 'slow' as const },
      amount: { type: 'primitive' as const, mode: 'fast' as const },
      applied: { type: 'primitive' as const, mode: 'fast+interactive' as const },
    } satisfies RenderingManifestSchema<{
      type: string;
      amount: number;
      applied: boolean;
    }>,
  },
} satisfies RenderingManifestSchema<ProductPageViewState>;

/**
 * Benefits of Factory Functions
 */

// ✅ Concise and readable with createSchema
const schema1 = createSchema<ProductPageViewState>({
  name: slow(),
  price: fast(),
  quantity: interactive(),
});

// ❌ Verbose and repetitive (without factories)
const schema2 = {
  name: { type: 'primitive' as const, mode: 'slow' as const },
  price: { type: 'primitive' as const, mode: 'fast' as const },
  quantity: { type: 'primitive' as const, mode: 'fast+interactive' as const },
} satisfies RenderingManifestSchema<ProductPageViewState>;

// ✅ Clear semantic meaning
const reviews = interactiveArray({
  id: interactive(),
  comment: interactive(),
});

// ✅ Type safety is preserved - TypeScript validates schema keys
const validSchema = createSchema<ProductPageViewState>({
  name: slow(),
  price: slow(),
});

// ✗ Invalid schema - 'nonExistentKey' doesn't exist in ViewState
// TypeScript error: Type does not match the constraint
/*
const invalidSchema = createSchema<ProductPageViewState>({
  nonExistentKey: slow(),
});
*/

// ✓ Partial schema - not all ViewState keys required
const partialSchema = createSchema<ProductPageViewState>({
  name: slow(),
  // other properties can be omitted
});

/**
 * Type-level narrowing: Extract ViewState subset for a specific rendering phase
 * 
 * This type takes the FULL ViewState (from contract) and the schema,
 * and returns only the properties that should be rendered in the given phase.
 * 
 * Key filtering logic:
 * - Primitives/Arrays with mode: Include if mode is set in this phase
 * - Objects without mode: Always include (will recurse into nested properties)
 */
type NarrowViewStateByPhase<
  ViewState extends object,
  Schema extends RenderingManifestSchema<ViewState>,
  Phase extends 'slow' | 'fast' | 'interactive'
> = {
  [K in keyof ViewState as K extends keyof Schema
    ? Schema[K] extends { mode: RenderingMode }
      ? IsSetInPhase<Schema[K]['mode'], Phase> extends true
        ? K  // Include if mode is set in this phase
        : never
      : Schema[K] extends ObjectSchemaNode<any>
      ? K  // Include objects (will filter nested properties in value mapping)
      : never
    : never]: ViewState[K] extends Array<infer Item>
    ? Item extends object
      ? Schema[K] extends ArraySchemaNode<Item>
        ? Array<NarrowViewStateByPhase<Item, Schema[K]['itemSchema'], Phase>>
        : ViewState[K]
      : ViewState[K]
    : ViewState[K] extends object
    ? Schema[K] extends ObjectSchemaNode<ViewState[K]>
      ? NarrowViewStateByPhase<ViewState[K], Schema[K]['properties'], Phase>
      : ViewState[K]
    : ViewState[K];
};

/**
 * Helper type to check if a property is SET in a specific phase
 * - slow properties are SET in slow phase only
 * - fast properties are SET in fast phase only
 * - fast+interactive properties are SET in fast phase (can be modified in interactive)
 */
type IsSetInPhase<
  Mode extends RenderingMode,
  Phase extends 'slow' | 'fast' | 'interactive'
> = Phase extends 'slow'
  ? Mode extends 'slow' ? true : false
  : Phase extends 'fast'
  ? Mode extends 'fast' | 'fast+interactive' ? true : false
  : Phase extends 'interactive'
  ? Mode extends 'fast+interactive' ? true : false
  : false;

// Usage example with the product page schema:
// ViewState comes from the contract
interface ProductPageViewState {
  name: string;
  sku: string;
  price: number;
  inStock: boolean;
  quantity: number;
  images: Array<{ url: string; alt: string }>;
  reviews: Array<{
    id: string;
    author: string;
    rating: number;
    comment: string;
  }>;
  discount: {
    type: string;
    amount: number;
    applied: boolean;
  };
}

// Narrow ViewState by phase - TypeScript validates schema keys match ViewState
type SlowViewState = NarrowViewStateByPhase<
  ProductPageViewState,
  typeof productPageSchema,
  'slow'
>;
// Result: {
//   name: string;
//   sku: string;
//   price: number;
//   images: Array<{ url: string; alt: string }>;
//   discount: { type: string };  // Only 'slow' properties of nested object
// }

type FastViewState = NarrowViewStateByPhase<
  ProductPageViewState,
  typeof productPageSchema,
  'fast'
>;
// Result: {
//   inStock: boolean;
//   quantity: number;
//   reviews: Array<{ id: string; author: string; rating: number; comment: string }>;
//   discount: { amount: number; applied: boolean };  // Only 'fast'/'fast+interactive' properties
// }

type InteractiveViewState = NarrowViewStateByPhase<
  ProductPageViewState,
  typeof productPageSchema,
  'interactive'
>;
// Result: {
//   quantity: number;
//   reviews: Array<{ id: string; author: string; rating: number; comment: string }>;
//   discount: { applied: boolean };  // Only 'fast+interactive' properties
// }
```

### Builder API Integration

```typescript
/**
 * New builder method to provide the rendering manifest schema
 * The schema annotates the ViewState (which comes from the contract)
 */
interface BuilderWithSchema<ViewState extends object> {
  /**
   * Define the rendering manifest schema for the ViewState
   * The schema must match the ViewState structure from the contract
   * TypeScript will error if schema keys don't match ViewState properties
   */
  withRenderingManifest<Schema extends RenderingManifestSchema<ViewState>>(
    schema: Schema
  ): BuilderWithSchemaSet<ViewState, Schema>;
}

/**
 * Updated builder interface with schema-aware rendering phases
 */
interface BuilderWithSchemaSet<
  ViewState extends object,
  Schema extends RenderingManifestSchema<ViewState>
> {
  // Services, contexts, and URL loading remain the same
  withServices<Services extends Array<any>>(...services: ServiceMarkers<Services>): this;
  withContexts<Contexts extends Array<any>>(...contexts: ContextMarkers<Contexts>): this;
  withLoadParams<Params extends UrlParams>(loader: LoadParams<any, Params>): this;
  
  /**
   * Slow render function - must return only properties that are SET in slow phase
   * Returns: properties marked as mode='slow' in the schema
   */
  withSlowlyRender<CarryForward extends object>(
    slowlyRender: RenderSlowly<
      any, // Services
      any, // Props
      NarrowViewStateByPhase<ViewState, Schema, 'slow'>,
      CarryForward
    >
  ): this;
  
  /**
   * Fast render function - must return only properties that are SET in fast phase
   * Returns: properties marked as mode='fast' or mode='fast+interactive' in the schema
   */
  withFastRender<CarryForward extends object>(
    fastRender: RenderFast<
      any, // Services
      any, // Props
      NarrowViewStateByPhase<ViewState, Schema, 'fast'>,
      CarryForward
    >
  ): this;
  
  /**
   * Interactive component - can only modify properties marked as 'fast+interactive'
   * Can access all props (from slow + fast phases), but can only modify interactive ones
   */
  withInteractive(
    comp: ComponentConstructor<
      any, // Props (includes carry-forward from slow + fast)
      any, // Refs
      NarrowViewStateByPhase<ViewState, Schema, 'interactive'>,
      any, // Contexts
      any  // Core
    >
  ): BuilderDone;
}

/**
 * Example usage with schema in builder
 */

// Define the schema using factory functions
const productPageSchema = createSchema<ProductPageViewState>({
  name: slow(),
  sku: slow(),
  price: slow(),
  inStock: fast(),
  quantity: interactive(),
  images: slowArray({ url: slow(), alt: slow() }),
  reviews: interactiveArray({
    id: interactive(),
    author: interactive(),
    rating: interactive(),
    comment: interactive(),
  }),
  discount: object({
    type: slow(),
    amount: fast(),
    applied: interactive(),
  }),
});

// Use the schema in the builder
const page = makeJayStackComponent<ProductPageContract>()
  .withProps<PageProps>()
  .withRenderingManifest(productPageSchema)
  .withServices(PRODUCTS_DATABASE_SERVICE, INVENTORY_SERVICE)
  .withLoadParams(urlLoader)
  .withSlowlyRender(async (props, productsDb) => {
    const product = await productsDb.getProductBySlug(props.slug);
    
    // TypeScript ensures we only return properties SET in 'slow' phase
    // Allowed: name, sku, price, images, discount.type
    return partialRender({
      name: product.name,        // ✓ Allowed - mode='slow'
      sku: product.sku,          // ✓ Allowed - mode='slow'
      price: product.price,      // ✓ Allowed - mode='slow'
      images: product.images,    // ✓ Allowed - mode='slow'
      discount: {
        type: product.discount?.type || 'none',  // ✓ Allowed - mode='slow'
      },
      // inStock: false,         // ✗ Error - mode='fast', not set in slow
      // quantity: 1,            // ✗ Error - mode='fast+interactive', not set in slow
    }, { productId: product.id });
  })
  .withFastRender(async (props, carryForward, inventory) => {
    const status = await inventory.getStatus(carryForward.productId);
    const reviews = await getReviews(carryForward.productId);
    
    // TypeScript ensures we only return properties SET in 'fast' phase
    // Allowed: inStock, quantity, reviews, discount.amount, discount.applied
    return partialRender({
      inStock: status.available > 0,  // ✓ Allowed - mode='fast'
      quantity: 1,                     // ✓ Allowed - mode='fast+interactive'
      reviews: reviews,                // ✓ Allowed - mode='fast+interactive'
      discount: {
        amount: calculateDiscount(),   // ✓ Allowed - mode='fast'
        applied: false,                // ✓ Allowed - mode='fast+interactive'
      },
      // name: 'Updated',              // ✗ Error - mode='slow', already set
    }, { productId: carryForward.productId });
  })
  .withInteractive((props, refs) => {
    // Props include all data from slow + fast phases
    // Can only MODIFY properties marked as 'fast+interactive'
    const [quantity, setQuantity] = createSignal(props.quantity());
    const [reviews, setReviews] = createSignal(props.reviews());
    const [discountApplied, setDiscountApplied] = createSignal(props.discount.applied());
    
    refs.addButton.onclick(() => {
      setQuantity(quantity() + 1);
    });
    
    refs.addReview.onclick(() => {
      // Can add to mutable arrays
      setReviews([...reviews(), newReview]);
    });
    
    return {
      render: () => ({
        quantity: quantity(),              // ✓ Allowed - mode='fast+interactive'
        reviews: reviews(),                // ✓ Allowed - mode='fast+interactive'
        discount: {
          applied: discountApplied(),      // ✓ Allowed - mode='fast+interactive'
        },
        // name: 'New Name',               // ✗ Error - mode='slow' (not interactive)
        // inStock: true,                  // ✗ Error - mode='fast' (not interactive)
      }),
    };
  });
```

### Runtime Validation

```typescript
/**
 * Runtime validation of schema constraints
 */
export class SchemaValidator {
  /**
   * Validate that a schema satisfies all rules
   */
  static validateSchema<ViewState extends object>(
    schema: RenderingManifestSchema<ViewState>
  ): ValidationResult {
    const errors: ValidationError[] = [];
    
    for (const [key, node] of Object.entries(schema)) {
      errors.push(...this.validateNode(key, node, undefined));
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  private static validateNode(
    key: string,
    node: SchemaNode,
    parentMode?: RenderingMode
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Rule 1: Validate mode is valid
    if (!this.isValidMode(node.mode)) {
      errors.push({
        path: key,
        rule: 'invalid-mode',
        message: `Invalid rendering mode: ${node.mode}. Valid modes: 'slow', 'fast', 'fast+interactive'`,
      });
    }
    
    // Rule 3: Child mode must be compatible with parent mode
    if (parentMode && !this.isChildModeCompatible(node.mode, parentMode)) {
      errors.push({
        path: key,
        rule: 'child-mode-incompatible',
        message: `Child mode '${node.mode}' is incompatible with parent mode '${parentMode}'`,
      });
    }
    
    // Validate based on node type
    if (node.type === 'array') {
      // Rule 2: Arrays with mode='fast+interactive' are mutable, require all children to be 'fast+interactive'
      if (node.mode === 'fast+interactive') {
        const childErrors = this.validateMutableArrayChildren(key, node);
        errors.push(...childErrors);
      }
      
      // Recurse into item schema, passing array's mode as parent
      for (const [childKey, childNode] of Object.entries(node.itemSchema)) {
        errors.push(...this.validateNode(`${key}[].${childKey}`, childNode, node.mode));
      }
    } else if (node.type === 'object') {
      // Recurse into properties, objects don't enforce a parent mode on children
      for (const [childKey, childNode] of Object.entries(node.properties)) {
        errors.push(...this.validateNode(`${key}.${childKey}`, childNode, undefined));
      }
    }
    
    return errors;
  }
  
  private static validateMutableArrayChildren(
    key: string,
    node: ArraySchemaNode
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // All children must be 'fast+interactive' for mutable arrays (mode='fast+interactive')
    for (const [childKey, childNode] of Object.entries(node.itemSchema)) {
      if (childNode.mode !== 'fast+interactive') {
        errors.push({
          path: `${key}[].${childKey}`,
          rule: 'mutable-array-children-must-be-interactive',
          message: `Array with mode='fast+interactive' (mutable) requires all children to have mode='fast+interactive'. Found: ${childNode.mode}`,
        });
      }
    }
    
    return errors;
  }
  
  private static isValidMode(mode: RenderingMode): boolean {
    const validModes: RenderingMode[] = ['slow', 'fast', 'fast+interactive'];
    return validModes.includes(mode);
  }
  
  private static isChildModeCompatible(
    childMode: RenderingMode,
    parentMode: RenderingMode
  ): boolean {
    // Parent 'slow' -> child can be 'slow'
    if (parentMode === 'slow') {
      return childMode === 'slow';
    }
    // Parent 'fast' -> child can be 'fast' or 'fast+interactive'
    if (parentMode === 'fast') {
      return childMode === 'fast' || childMode === 'fast+interactive';
    }
    // Parent 'fast+interactive' -> child can be 'fast' or 'fast+interactive'
    if (parentMode === 'fast+interactive') {
      return childMode === 'fast' || childMode === 'fast+interactive';
    }
    return false;
  }
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  path: string;
  rule: string;
  message: string;
}
```

### Factory Functions Quick Reference

```typescript
// Schema Builder
createSchema<ViewState>(schema)  // Create complete schema with type checking

// Primitives
slow()          // mode='slow' - static data, set at build time
fast()          // mode='fast' - dynamic data, set at request time (not interactive)
interactive()   // mode='fast+interactive' - set at request time, modifiable on client

// Arrays
slowArray(itemSchema)          // mode='slow' - frozen, cannot add/remove items
fastArray(itemSchema)          // mode='fast' - frozen, cannot add/remove items
interactiveArray(itemSchema)   // mode='fast+interactive' - mutable, can add/remove items

// Objects
object(properties)  // Nested object with mixed-mode properties
```

**Usage Examples:**

```typescript
const schema = createSchema<MyViewState>({
  // Simple primitives
  title: slow(),
  description: slow(),
  price: fast(),
  quantity: interactive(),
  
  // Frozen array (static images)
  images: slowArray({
    url: slow(),
    alt: slow(),
  }),
  
  // Mutable array (user-generated content)
  comments: interactiveArray({
    id: interactive(),
    text: interactive(),
    author: interactive(),
  }),
  
  // Nested object
  metadata: object({
    createdAt: slow(),
    updatedAt: fast(),
    viewCount: interactive(),
  }),
});
```

### Benefits of This Approach

1. **Type Safety**: 
   - Generic constraint ensures schema keys match ViewState properties at compile-time
   - TypeScript enforces that render functions only return properties valid for their phase
   - `NarrowViewStateByPhase` provides precise type narrowing per rendering phase

2. **Runtime Validation**: 
   - Schema can be validated at runtime to catch configuration errors early
   - Validates rendering mode rules (mutable arrays, child mode compatibility, etc.)

3. **Self-Documenting**: 
   - Schema serves as explicit documentation for what data is rendered when
   - Discriminated union (`type` property) makes schema nodes easy to understand
   - Factory functions (`slow()`, `fast()`, `interactive()`) clearly express intent

4. **Tooling Support**: 
   - IDEs provide autocomplete for schema keys (limited to ViewState properties)
   - TypeScript errors guide developers to correct schema definitions

5. **Performance Optimization**: 
   - Framework can optimize rendering based on declared phases
   - Frozen arrays allow aggressive caching and optimization

6. **Clear Contracts**: 
   - Makes explicit what data is static, dynamic, or interactive
   - ViewState from contract is the source of truth, schema annotates behavior

7. **Developer Experience**:
   - Factory functions eliminate boilerplate and reduce verbosity
   - Schema definitions are concise and easy to write
   - Semantic function names (`slow()`, `fast()`, `interactive()`) are intuitive

### Open Questions

1. **Schema Definition Approach**: Two options:
   - **Option A**: Explicit schema object (as shown above) - More verbose but clear
   - **Option B**: Schema inference with type annotations on ViewState properties
   ```typescript
   interface ProductPageViewState {
     name: string & { __renderMode: 'slow' };  // Type-level annotation
     quantity: number & { __renderMode: 'fast+interactive' };
   }
   ```
   Which approach provides better DX?

2. **Schema Location**: Should schema be:
   - Inline with component definition (co-located)
   - Separate `.schema.ts` file next to contract
   - Generated from ViewState type with decorators/comments

3. **Schema Reuse**: How to share common patterns?
   ```typescript
   // Common schema fragments
   const addressSchema = { /* ... */ } satisfies RenderingManifestSchema;
   
   // Reuse in multiple components
   const userSchema = {
     name: { type: 'primitive', mode: 'slow' },
     address: { type: 'object', properties: addressSchema },
   };
   ```

4. **Partial Schemas**: Should developers be required to define schema for ALL properties?
   - Or can they define schema for subset and let others default to a mode?
   - Default mode for unspecified properties?

5. **Schema Validation Timing**: When to validate schema?
   - Compile-time only (TypeScript errors)
   - Runtime on component registration (dev mode)
   - Build-time validation (during compilation)

6. **Migration Path**: For existing components without schemas:
   - Generate schema from usage patterns (which render functions return which props)
   - Require explicit schema (breaking change with migration tool)
   - Optional schema with gradual adoption

7. **Async Properties**: Contract files support `async: true` for Promise properties.
   How does this interact with rendering modes?
   ```typescript
   // ViewState from contract
   interface ViewState {
     user: Promise<User>;  // async property
   }
   
   // How to specify mode for async property?
   schema = {
     user: {
       type: 'primitive',
       mode: 'fast',  // Promise resolved in fast phase?
       async: true,
     }
   };
   ```

8. **Conditional Rendering**: What about properties that exist in ViewState but are conditionally set?
   ```typescript
   // Some users have discount, others don't
   interface ViewState {
     discount?: { type: string; amount: number };
   }
   ```


