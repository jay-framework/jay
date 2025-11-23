/**
 * Rendering Manifest for Jay Stack Components
 * 
 * Defines which properties of the ViewState are rendered in which phase:
 * - slow: Static data rendered at build time
 * - fast: Dynamic data rendered at request time (not interactive)
 * - fast+interactive: Data rendered at request time and modifiable on client
 */

/**
 * The three rendering modes for ViewState properties
 */
export type RenderingMode = 'slow' | 'fast' | 'fast+interactive';

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
export interface PrimitiveSchemaNode extends BaseSchemaNode {
  type: 'primitive';
  /** The rendering mode for this property */
  mode: RenderingMode;
}

/**
 * Schema node for array properties
 * Array mutability is determined by the mode:
 * - mode='slow' or 'fast': Frozen (cannot add/remove items in interactive phase)
 * - mode='fast+interactive': Mutable (can add/remove items on client)
 */
export interface ArraySchemaNode<ItemViewState extends object = any> extends BaseSchemaNode {
  type: 'array';
  /** The rendering mode for the array itself */
  mode: RenderingMode;
  /** Schema for array item properties */
  itemSchema: RenderingManifestSchema<ItemViewState>;
}

/**
 * Schema node for object properties
 * Objects don't have their own mode - each child property defines its own mode
 */
export interface ObjectSchemaNode<NestedViewState extends object = any> extends BaseSchemaNode {
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
 * 
 * Properties not specified in the manifest default to mode='slow'
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

// ============================================================================
// Factory Functions
// ============================================================================

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
 * Create a complete rendering manifest for a ViewState
 * Provides type checking that schema keys match ViewState properties
 * 
 * Default behavior: Properties not specified in the manifest default to mode='slow'
 * 
 * @example
 * const manifest = createRenderingManifest<ProductPageViewState>({
 *   name: slow(),
 *   price: fast(),
 *   quantity: interactive(),
 *   // unspecified properties default to slow()
 * });
 */
export function createRenderingManifest<ViewState extends object>(
  schema: RenderingManifestSchema<ViewState>
): RenderingManifestSchema<ViewState> {
  return schema;
}

// ============================================================================
// Type Narrowing Utilities
// ============================================================================

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
  ? Mode extends 'slow'
    ? true
    : false
  : Phase extends 'fast'
  ? Mode extends 'fast' | 'fast+interactive'
    ? true
    : false
  : Phase extends 'interactive'
  ? Mode extends 'fast+interactive'
    ? true
    : false
  : false;

/**
 * Type-level narrowing: Extract ViewState subset for a specific rendering phase
 * 
 * This type takes the FULL ViewState (from contract) and the schema,
 * and returns only the properties that should be rendered in the given phase.
 * 
 * Key filtering logic:
 * - Primitives/Arrays with mode: Include if mode is set in this phase
 * - Objects without mode: Always include (will filter nested properties in value mapping)
 * 
 * Default behavior: If a property is not in the schema, it defaults to slow rendering
 */
export type NarrowViewStateByPhase<
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
    : Phase extends 'slow'
    ? K  // Properties not in schema default to slow
    : never]: ViewState[K] extends Array<infer Item>
    ? Item extends object
      ? Schema[K] extends ArraySchemaNode<Item>
        ? Array<NarrowViewStateByPhase<Item, Schema[K]['itemSchema'], Phase>>
        : ViewState[K]
      : ViewState[K]
    : ViewState[K] extends object
    ? K extends keyof Schema
      ? Schema[K] extends ObjectSchemaNode<ViewState[K]>
        ? NarrowViewStateByPhase<ViewState[K], Schema[K]['properties'], Phase>
        : ViewState[K]
      : ViewState[K]  // Property not in schema, return as-is (defaults to slow)
    : ViewState[K];
};

