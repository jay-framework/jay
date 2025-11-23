/**
 * Tests for Type Narrowing Utility: NarrowViewStateByPhase
 * 
 * These tests verify that the type narrowing correctly extracts properties
 * based on their rendering mode (slow/fast/interactive).
 */

import { describe, it, expectTypeOf } from 'vitest';
import {
  createRenderingManifest,
  slow,
  fast,
  interactive,
  slowArray,
  fastArray,
  interactiveArray,
  object,
  NarrowViewStateByPhase,
} from '../lib';

describe('NarrowViewStateByPhase', () => {
  describe('Primitive properties', () => {
    it('should narrow to slow properties in slow phase', () => {
      interface ViewState {
        name: string;
        sku: string;
        price: number;
        inStock: boolean;
        quantity: number;
      }

      const manifest = createRenderingManifest<ViewState>({
        name: slow(),
        sku: slow(),
        price: slow(),
        inStock: fast(),
        quantity: interactive(),
      });

      type SlowPhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'slow'>;

      // Should only include slow properties
      expectTypeOf<SlowPhase>().toHaveProperty('name');
      expectTypeOf<SlowPhase>().toHaveProperty('sku');
      expectTypeOf<SlowPhase>().toHaveProperty('price');
      expectTypeOf<SlowPhase>().not.toHaveProperty('inStock');
      expectTypeOf<SlowPhase>().not.toHaveProperty('quantity');
    });

    it('should narrow to fast properties in fast phase', () => {
      interface ViewState {
        name: string;
        sku: string;
        inStock: boolean;
        quantity: number;
      }

      const manifest = createRenderingManifest<ViewState>({
        name: slow(),
        sku: slow(),
        inStock: fast(),
        quantity: interactive(),
      });

      type FastPhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'fast'>;

      // Should include fast and fast+interactive properties
      expectTypeOf<FastPhase>().toHaveProperty('inStock');
      expectTypeOf<FastPhase>().toHaveProperty('quantity');
      expectTypeOf<FastPhase>().not.toHaveProperty('name');
      expectTypeOf<FastPhase>().not.toHaveProperty('sku');
    });

    it('should narrow to interactive properties in interactive phase', () => {
      interface ViewState {
        name: string;
        inStock: boolean;
        quantity: number;
      }

      const manifest = createRenderingManifest<ViewState>({
        name: slow(),
        inStock: fast(),
        quantity: interactive(),
      });

      type InteractivePhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'interactive'>;

      // Should only include fast+interactive properties
      expectTypeOf<InteractivePhase>().toHaveProperty('quantity');
      expectTypeOf<InteractivePhase>().not.toHaveProperty('name');
      expectTypeOf<InteractivePhase>().not.toHaveProperty('inStock');
    });
  });

  describe('Array properties', () => {
    it('should narrow frozen slow arrays in slow phase', () => {
      interface ViewState {
        images: Array<{ url: string; alt: string }>;
        reviews: Array<{ id: string; text: string }>;
      }

      const manifest = createRenderingManifest<ViewState>({
        images: slowArray({
          url: slow(),
          alt: slow(),
        }),
        reviews: interactiveArray({
          id: interactive(),
          text: interactive(),
        }),
      });

      type SlowPhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'slow'>;

      expectTypeOf<SlowPhase>().toHaveProperty('images');
      expectTypeOf<SlowPhase>().not.toHaveProperty('reviews');

      // Verify the array item type
      type Images = SlowPhase['images'];
      expectTypeOf<Images>().toEqualTypeOf<Array<{ url: string; alt: string }>>();
    });

    it('should narrow frozen fast arrays in fast phase', () => {
      interface ViewState {
        items: Array<{ id: string; name: string }>;
        tags: Array<string>;
      }

      const manifest = createRenderingManifest<ViewState>({
        items: fastArray({
          id: fast(),
          name: fast(),
        }),
      });

      type FastPhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'fast'>;

      expectTypeOf<FastPhase>().toHaveProperty('items');
      expectTypeOf<FastPhase>().not.toHaveProperty('tags'); // Not in manifest, defaults to slow
    });

    it('should narrow mutable arrays in fast and interactive phases', () => {
      interface ViewState {
        comments: Array<{ id: string; text: string; author: string }>;
      }

      const manifest = createRenderingManifest<ViewState>({
        comments: interactiveArray({
          id: interactive(),
          text: interactive(),
          author: interactive(),
        }),
      });

      type FastPhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'fast'>;
      type InteractivePhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'interactive'>;

      // Mutable arrays appear in both fast and interactive phases
      expectTypeOf<FastPhase>().toHaveProperty('comments');
      expectTypeOf<InteractivePhase>().toHaveProperty('comments');

      // Item types should match
      type FastComments = FastPhase['comments'];
      type InteractiveComments = InteractivePhase['comments'];
      expectTypeOf<FastComments>().toEqualTypeOf<
        Array<{ id: string; text: string; author: string }>
      >();
      expectTypeOf<InteractiveComments>().toEqualTypeOf<
        Array<{ id: string; text: string; author: string }>
      >();
    });

    it('should narrow array item properties by phase', () => {
      interface ViewState {
        items: Array<{
          id: string;
          name: string;
          price: number;
          quantity: number;
        }>;
      }

      const manifest = createRenderingManifest<ViewState>({
        items: fastArray({
          id: fast(),
          name: fast(),
          price: fast(),
          quantity: interactive(),
        }),
      });

      type FastPhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'fast'>;
      type InteractivePhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'interactive'>;

      // In fast phase, should include all fast and fast+interactive properties
      type FastItems = FastPhase['items'][number];
      expectTypeOf<FastItems>().toHaveProperty('id');
      expectTypeOf<FastItems>().toHaveProperty('name');
      expectTypeOf<FastItems>().toHaveProperty('price');
      expectTypeOf<FastItems>().toHaveProperty('quantity');

      // In interactive phase, should only include fast+interactive properties
      type InteractiveItems = InteractivePhase['items'][number];
      expectTypeOf<InteractiveItems>().toHaveProperty('quantity');
      expectTypeOf<InteractiveItems>().not.toHaveProperty('id');
      expectTypeOf<InteractiveItems>().not.toHaveProperty('name');
      expectTypeOf<InteractiveItems>().not.toHaveProperty('price');
    });
  });

  describe('Nested object properties', () => {
    it('should narrow nested object properties by phase', () => {
      interface ViewState {
        discount: {
          type: string;
          amount: number;
          applied: boolean;
        };
      }

      const manifest = createRenderingManifest<ViewState>({
        discount: object({
          type: slow(),
          amount: fast(),
          applied: interactive(),
        }),
      });

      type SlowPhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'slow'>;
      type FastPhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'fast'>;
      type InteractivePhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'interactive'>;

      // Slow phase - only slow properties
      expectTypeOf<SlowPhase>().toHaveProperty('discount');
      type SlowDiscount = SlowPhase['discount'];
      expectTypeOf<SlowDiscount>().toHaveProperty('type');
      expectTypeOf<SlowDiscount>().not.toHaveProperty('amount');
      expectTypeOf<SlowDiscount>().not.toHaveProperty('applied');

      // Fast phase - fast and fast+interactive properties
      expectTypeOf<FastPhase>().toHaveProperty('discount');
      type FastDiscount = FastPhase['discount'];
      expectTypeOf<FastDiscount>().toHaveProperty('amount');
      expectTypeOf<FastDiscount>().toHaveProperty('applied');
      expectTypeOf<FastDiscount>().not.toHaveProperty('type');

      // Interactive phase - only fast+interactive properties
      expectTypeOf<InteractivePhase>().toHaveProperty('discount');
      type InteractiveDiscount = InteractivePhase['discount'];
      expectTypeOf<InteractiveDiscount>().toHaveProperty('applied');
      expectTypeOf<InteractiveDiscount>().not.toHaveProperty('type');
      expectTypeOf<InteractiveDiscount>().not.toHaveProperty('amount');
    });

    it('should handle deeply nested objects', () => {
      interface ViewState {
        product: {
          info: {
            name: string;
            description: string;
          };
          pricing: {
            base: number;
            discount: number;
          };
        };
      }

      const manifest = createRenderingManifest<ViewState>({
        product: object({
          info: object({
            name: slow(),
            description: slow(),
          }),
          pricing: object({
            base: slow(),
            discount: fast(),
          }),
        }),
      });

      type SlowPhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'slow'>;
      type FastPhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'fast'>;

      // Slow phase
      expectTypeOf<SlowPhase>().toHaveProperty('product');
      type SlowProduct = SlowPhase['product'];
      expectTypeOf<SlowProduct>().toHaveProperty('info');
      expectTypeOf<SlowProduct>().toHaveProperty('pricing');

      type SlowInfo = SlowProduct['info'];
      expectTypeOf<SlowInfo>().toHaveProperty('name');
      expectTypeOf<SlowInfo>().toHaveProperty('description');

      type SlowPricing = SlowProduct['pricing'];
      expectTypeOf<SlowPricing>().toHaveProperty('base');
      expectTypeOf<SlowPricing>().not.toHaveProperty('discount');

      // Fast phase
      expectTypeOf<FastPhase>().toHaveProperty('product');
      type FastProduct = FastPhase['product'];
      expectTypeOf<FastProduct>().toHaveProperty('pricing');

      type FastPricing = FastProduct['pricing'];
      expectTypeOf<FastPricing>().toHaveProperty('discount');
      expectTypeOf<FastPricing>().not.toHaveProperty('base');
    });
  });

  describe('Default behavior (unspecified properties)', () => {
    it('should default unspecified properties to slow', () => {
      interface ViewState {
        name: string;
        sku: string;
        price: number;
        quantity: number;
      }

      // Only specify quantity as interactive
      const manifest = createRenderingManifest<ViewState>({
        quantity: interactive(),
      });

      type SlowPhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'slow'>;
      type FastPhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'fast'>;
      type InteractivePhase = NarrowViewStateByPhase<ViewState, typeof manifest, 'interactive'>;

      // Unspecified properties (name, sku, price) default to slow
      expectTypeOf<SlowPhase>().toHaveProperty('name');
      expectTypeOf<SlowPhase>().toHaveProperty('sku');
      expectTypeOf<SlowPhase>().toHaveProperty('price');
      expectTypeOf<SlowPhase>().not.toHaveProperty('quantity');

      // Fast phase should only have quantity
      expectTypeOf<FastPhase>().toHaveProperty('quantity');
      expectTypeOf<FastPhase>().not.toHaveProperty('name');
      expectTypeOf<FastPhase>().not.toHaveProperty('sku');
      expectTypeOf<FastPhase>().not.toHaveProperty('price');

      // Interactive phase should only have quantity
      expectTypeOf<InteractivePhase>().toHaveProperty('quantity');
      expectTypeOf<InteractivePhase>().not.toHaveProperty('name');
    });
  });

  describe('Complex real-world example', () => {
    it('should correctly narrow complex product page ViewState', () => {
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

      const manifest = createRenderingManifest<ProductPageViewState>({
        name: slow(),
        sku: slow(),
        price: slow(),
        inStock: fast(),
        quantity: interactive(),
        images: slowArray({
          url: slow(),
          alt: slow(),
        }),
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

      type SlowPhase = NarrowViewStateByPhase<ProductPageViewState, typeof manifest, 'slow'>;
      type FastPhase = NarrowViewStateByPhase<ProductPageViewState, typeof manifest, 'fast'>;
      type InteractivePhase = NarrowViewStateByPhase<
        ProductPageViewState,
        typeof manifest,
        'interactive'
      >;

      // Slow phase - static data
      expectTypeOf<SlowPhase>().toMatchTypeOf<{
        name: string;
        sku: string;
        price: number;
        images: Array<{ url: string; alt: string }>;
        discount: { type: string };
      }>();

      // Fast phase - dynamic data
      expectTypeOf<FastPhase>().toMatchTypeOf<{
        inStock: boolean;
        quantity: number;
        reviews: Array<{ id: string; author: string; rating: number; comment: string }>;
        discount: { amount: number; applied: boolean };
      }>();

      // Interactive phase - user-modifiable data
      expectTypeOf<InteractivePhase>().toMatchTypeOf<{
        quantity: number;
        reviews: Array<{ id: string; author: string; rating: number; comment: string }>;
        discount: { applied: boolean };
      }>();
    });
  });
});

