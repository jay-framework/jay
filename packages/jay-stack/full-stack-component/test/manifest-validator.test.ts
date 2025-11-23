/**
 * Tests for Rendering Manifest Validator
 */

import { describe, it, expect } from 'vitest';
import {
  createRenderingManifest,
  slow,
  fast,
  interactive,
  slowArray,
  fastArray,
  interactiveArray,
  object,
  ManifestValidator,
} from '../lib';

describe('ManifestValidator', () => {
  describe('Valid manifests', () => {
    it('should validate a simple manifest with primitives', () => {
      interface ViewState {
        name: string;
        price: number;
        quantity: number;
      }

      const manifest = createRenderingManifest<ViewState>({
        name: slow(),
        price: fast(),
        quantity: interactive(),
      });

      const result = ManifestValidator.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate frozen arrays (slow mode)', () => {
      interface ViewState {
        images: Array<{ url: string; alt: string }>;
      }

      const manifest = createRenderingManifest<ViewState>({
        images: slowArray({
          url: slow(),
          alt: slow(),
        }),
      });

      const result = ManifestValidator.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate frozen arrays (fast mode)', () => {
      interface ViewState {
        items: Array<{ id: string; name: string }>;
      }

      const manifest = createRenderingManifest<ViewState>({
        items: fastArray({
          id: fast(),
          name: fast(),
        }),
      });

      const result = ManifestValidator.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate mutable arrays with all interactive children', () => {
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

      const result = ManifestValidator.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate nested objects with mixed modes', () => {
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

      const result = ManifestValidator.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Invalid manifests - mutable array violations', () => {
    it('should reject mutable arrays with slow children', () => {
      interface ViewState {
        items: Array<{ id: string; name: string }>;
      }

      const manifest = createRenderingManifest<ViewState>({
        items: interactiveArray({
          id: slow(), // ✗ Should be interactive()
          name: slow(), // ✗ Should be interactive()
        }),
      });

      const result = ManifestValidator.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].rule).toBe('mutable-array-children-must-be-interactive');
      expect(result.errors[0].path).toBe('items[].id');
      expect(result.errors[1].path).toBe('items[].name');
    });

    it('should reject mutable arrays with fast children', () => {
      interface ViewState {
        reviews: Array<{ id: string; comment: string; rating: number }>;
      }

      const manifest = createRenderingManifest<ViewState>({
        reviews: interactiveArray({
          id: interactive(), // ✓ Correct
          comment: fast(), // ✗ Should be interactive()
          rating: fast(), // ✗ Should be interactive()
        }),
      });

      const result = ManifestValidator.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.every((e) => e.rule === 'mutable-array-children-must-be-interactive')).toBe(true);
    });
  });

  describe('Invalid manifests - child mode compatibility', () => {
    it('should reject fast children in slow arrays', () => {
      interface ViewState {
        items: Array<{ id: string; name: string }>;
      }

      const manifest = createRenderingManifest<ViewState>({
        items: slowArray({
          id: fast(), // ✗ Parent is slow, child must be slow
          name: slow(), // ✓ Correct
        }),
      });

      const result = ManifestValidator.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rule).toBe('child-mode-incompatible');
      expect(result.errors[0].path).toBe('items[].id');
      expect(result.errors[0].message).toContain("incompatible with parent mode 'slow'");
    });

    it('should allow fast and interactive children in fast arrays', () => {
      interface ViewState {
        items: Array<{ id: string; name: string; count: number }>;
      }

      const manifest = createRenderingManifest<ViewState>({
        items: fastArray({
          id: fast(), // ✓ Correct
          name: fast(), // ✓ Correct
          count: interactive(), // ✓ Correct - fast+interactive is compatible with fast
        }),
      });

      const result = ManifestValidator.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Partial manifests', () => {
    it('should validate partial manifests (unspecified properties default to slow)', () => {
      interface ViewState {
        name: string;
        sku: string;
        price: number;
        quantity: number;
      }

      // Only specify what's NOT slow
      const manifest = createRenderingManifest<ViewState>({
        quantity: interactive(),
        // name, sku, price default to slow()
      });

      const result = ManifestValidator.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Complex nested structures', () => {
    it('should validate complex nested structure', () => {
      interface ViewState {
        product: {
          name: string;
          specs: {
            weight: number;
            dimensions: string;
          };
        };
        reviews: Array<{
          id: string;
          author: {
            name: string;
            verified: boolean;
          };
        }>;
      }

      const manifest = createRenderingManifest<ViewState>({
        product: object({
          name: slow(),
          specs: object({
            weight: slow(),
            dimensions: slow(),
          }),
        }),
        reviews: interactiveArray({
          id: interactive(),
          author: object({
            name: interactive(),
            verified: interactive(),
          }),
        }),
      });

      const result = ManifestValidator.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});

