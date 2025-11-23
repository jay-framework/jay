/**
 * Example: Using Rendering Manifest with Jay Stack Components
 * 
 * This example demonstrates the rendering manifest API for controlling
 * which properties are rendered in which phase (slow/fast/interactive).
 */

import {
  createRenderingManifest,
  slow,
  fast,
  interactive,
  slowArray,
  interactiveArray,
  object,
  NarrowViewStateByPhase,
  ManifestValidator,
} from '../lib';

// ============================================================================
// Example ViewState (from contract)
// ============================================================================

interface ProductPageViewState {
  // Static product information
  name: string;
  sku: string;
  price: number;

  // Dynamic data
  inStock: boolean;
  quantity: number;

  // Collections
  images: Array<{
    url: string;
    alt: string;
  }>;
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

// ============================================================================
// Define Rendering Manifest
// ============================================================================

const productPageManifest = createRenderingManifest<ProductPageViewState>({
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
    type: slow(), // Static discount type
    amount: fast(), // Dynamic amount (may vary by user/time)
    applied: interactive(), // User can toggle on client
  }),
});

// ============================================================================
// Type Narrowing by Phase
// ============================================================================

// Narrow ViewState by phase - TypeScript validates schema keys match ViewState
type SlowViewState = NarrowViewStateByPhase<
  ProductPageViewState,
  typeof productPageManifest,
  'slow'
>;
// Result: { name: string; sku: string; price: number; images: Array<{url: string; alt: string}>; discount: { type: string } }

type FastViewState = NarrowViewStateByPhase<
  ProductPageViewState,
  typeof productPageManifest,
  'fast'
>;
// Result: { inStock: boolean; quantity: number; reviews: Array<{...}>; discount: { amount: number; applied: boolean } }

type InteractiveViewState = NarrowViewStateByPhase<
  ProductPageViewState,
  typeof productPageManifest,
  'interactive'
>;
// Result: { quantity: number; reviews: Array<{...}>; discount: { applied: boolean } }

// ============================================================================
// Runtime Validation
// ============================================================================

// Validate the manifest
const validationResult = ManifestValidator.validateManifest(productPageManifest);

if (!validationResult.valid) {
  console.error('Manifest validation errors:');
  validationResult.errors.forEach((error) => {
    console.error(`  ${error.path}: ${error.message}`);
  });
} else {
  console.log('✓ Manifest is valid!');
}

// ============================================================================
// Invalid Manifest Example
// ============================================================================

// This would fail validation - mutable array with non-interactive children
const invalidManifest = createRenderingManifest<ProductPageViewState>({
  name: slow(),
  sku: slow(),
  price: slow(),
  inStock: fast(),
  quantity: interactive(),
  images: slowArray({
    url: slow(),
    alt: slow(),
  }),
  // ✗ ERROR: Mutable array with mode='slow' children
  reviews: interactiveArray({
    id: slow(), // Should be interactive()!
    author: slow(), // Should be interactive()!
    rating: slow(), // Should be interactive()!
    comment: slow(), // Should be interactive()!
  }),
  discount: object({
    type: slow(),
    amount: fast(),
    applied: interactive(),
  }),
});

// Validate will catch the error
const invalidResult = ManifestValidator.validateManifest(invalidManifest);
console.log('\nInvalid manifest validation:');
console.log(`Valid: ${invalidResult.valid}`);
invalidResult.errors.forEach((error) => {
  console.log(`  ${error.path}: ${error.message}`);
});

// ============================================================================
// Partial Manifest Example (defaults to slow)
// ============================================================================

// Only specify what's NOT slow
const partialManifest = createRenderingManifest<ProductPageViewState>({
  quantity: interactive(),
  inStock: fast(),
  // name, sku, price, images, etc. all default to slow()
});

console.log('\n✓ Partial manifest is valid!');

export {
  productPageManifest,
  invalidManifest,
  partialManifest,
  SlowViewState,
  FastViewState,
  InteractiveViewState,
};

