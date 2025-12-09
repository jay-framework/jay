import { deepMergeViewStates } from '../lib/view-state-merger';
import { vi } from 'vitest';

describe('deepMergeViewStates', () => {
    describe('primitive values', () => {
        it('should merge simple objects with no nesting', () => {
            const slow = { name: 'Product A', sku: 'SKU-123' };
            const fast = { price: 29.99, inStock: true };
            const trackByMap = {}; // No arrays to track

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({
                name: 'Product A',
                sku: 'SKU-123',
                price: 29.99,
                inStock: true,
            });
        });

        it('should prefer fast value when both phases have the same property', () => {
            const slow = { count: 5 };
            const fast = { count: 10 };
            const trackByMap = {};

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({ count: 10 });
        });
    });

    describe('nested objects', () => {
        it('should deep merge nested objects', () => {
            const slow = {
                discount: {
                    type: 'percentage',
                    code: 'SAVE10',
                },
            };
            const fast = {
                discount: {
                    amount: 5,
                    applied: false,
                },
            };
            const trackByMap = {}; // No arrays to track

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({
                discount: {
                    type: 'percentage',
                    code: 'SAVE10',
                    amount: 5,
                    applied: false,
                },
            });
        });

        it('should handle deeply nested objects (3 levels)', () => {
            const slow = {
                user: {
                    profile: {
                        name: 'John',
                        age: 30,
                    },
                },
            };
            const fast = {
                user: {
                    profile: {
                        status: 'online',
                    },
                },
            };
            const trackByMap = {};

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({
                user: {
                    profile: {
                        name: 'John',
                        age: 30,
                        status: 'online',
                    },
                },
            });
        });
    });

    describe('arrays with trackBy', () => {
        it('should merge arrays by trackBy identity', () => {
            const slow = {
                images: [
                    { id: '1', url: '/img1.jpg', alt: 'Image 1' },
                    { id: '2', url: '/img2.jpg', alt: 'Image 2' },
                ],
            };
            const fast = {
                images: [
                    { id: '1', loading: false },
                    { id: '2', loading: true },
                ],
            };
            const trackByMap = {
                images: 'id', // images array tracked by 'id' field
            };

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({
                images: [
                    { id: '1', url: '/img1.jpg', alt: 'Image 1', loading: false },
                    { id: '2', url: '/img2.jpg', alt: 'Image 2', loading: true },
                ],
            });
        });

        it('should preserve slow array order when merging', () => {
            const slow = {
                items: [
                    { id: '2', name: 'Item 2' },
                    { id: '1', name: 'Item 1' },
                    { id: '3', name: 'Item 3' },
                ],
            };
            const fast = {
                items: [
                    { id: '1', price: 10 },
                    { id: '2', price: 20 },
                    { id: '3', price: 30 },
                ],
            };
            const trackByMap = {
                items: 'id',
            };

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({
                items: [
                    { id: '2', name: 'Item 2', price: 20 },
                    { id: '1', name: 'Item 1', price: 10 },
                    { id: '3', name: 'Item 3', price: 30 },
                ],
            });
        });

        it('should handle items only in slow array', () => {
            const slow = {
                items: [
                    { id: '1', name: 'Item 1' },
                    { id: '2', name: 'Item 2' },
                    { id: '3', name: 'Item 3' },
                ],
            };
            const fast = {
                items: [
                    { id: '1', price: 10 },
                    { id: '3', price: 30 },
                ],
            };
            const trackByMap = {
                items: 'id',
            };

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({
                items: [
                    { id: '1', name: 'Item 1', price: 10 },
                    { id: '2', name: 'Item 2' }, // No price (only in slow)
                    { id: '3', name: 'Item 3', price: 30 },
                ],
            });
        });

        it('should handle items only in fast array', () => {
            const slow = {
                items: [
                    { id: '1', name: 'Item 1' },
                    { id: '2', name: 'Item 2' },
                ],
            };
            const fast = {
                items: [
                    { id: '1', price: 10 },
                    { id: '2', price: 20 },
                    { id: '3', price: 30 }, // New item in fast
                ],
            };
            const trackByMap = {
                items: 'id',
            };

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({
                items: [
                    { id: '1', name: 'Item 1', price: 10 },
                    { id: '2', name: 'Item 2', price: 20 },
                    { id: '3', price: 30 }, // No name (only in fast)
                ],
            });
        });

        it('should handle nested objects within array items', () => {
            const slow = {
                products: [
                    {
                        id: '1',
                        info: { name: 'Product 1', sku: 'SKU-1' },
                    },
                ],
            };
            const fast = {
                products: [
                    {
                        id: '1',
                        info: { price: 29.99 },
                    },
                ],
            };
            const trackByMap = {
                products: 'id',
            };

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({
                products: [
                    {
                        id: '1',
                        info: {
                            name: 'Product 1',
                            sku: 'SKU-1',
                            price: 29.99,
                        },
                    },
                ],
            });
        });
    });

    describe('edge cases', () => {
        it('should handle empty slow object', () => {
            const slow = {};
            const fast = { count: 10 };
            const trackByMap = {};

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({ count: 10 });
        });

        it('should handle empty fast object', () => {
            const slow = { count: 5 };
            const fast = {};
            const trackByMap = {};

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({ count: 5 });
        });

        it('should handle undefined slow', () => {
            const slow = undefined;
            const fast = { count: 10 };
            const trackByMap = {};

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({ count: 10 });
        });

        it('should handle undefined fast', () => {
            const slow = { count: 5 };
            const fast = undefined;
            const trackByMap = {};

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({ count: 5 });
        });

        it('should handle both undefined', () => {
            const slow = undefined;
            const fast = undefined;
            const trackByMap = {};

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({});
        });

        it('should handle empty arrays', () => {
            const slow = { items: [] };
            const fast = { items: [] };
            const trackByMap = {
                items: 'id',
            };

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({ items: [] });
        });

        it('should use fast array when trackBy info is missing from map', () => {
            const slow = { items: [{ id: '1', name: 'Item 1' }] };
            const fast = { items: [{ id: '1', price: 10 }] };
            const trackByMap = {}; // No trackBy info for items array

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({
                items: [{ id: '1', price: 10 }], // Fast array wins
            });
        });
    });

    describe('complex real-world example', () => {
        it('should merge a product page view state', () => {
            const slow = {
                name: 'Awesome Widget',
                sku: 'AWW-001',
                description: 'A very cool widget',
                images: [
                    { id: 'img1', url: '/images/front.jpg', alt: 'Front view' },
                    { id: 'img2', url: '/images/side.jpg', alt: 'Side view' },
                ],
                discount: {
                    type: 'percentage',
                    code: 'SAVE10',
                },
            };

            const fast = {
                price: 49.99,
                inStock: true,
                images: [
                    { id: 'img1', loading: false },
                    { id: 'img2', loading: false },
                ],
                discount: {
                    amount: 5,
                    applied: false,
                },
            };

            const trackByMap = {
                images: 'id',
            };

            const result = deepMergeViewStates(slow, fast, trackByMap);

            expect(result).toEqual({
                name: 'Awesome Widget',
                sku: 'AWW-001',
                description: 'A very cool widget',
                price: 49.99,
                inStock: true,
                images: [
                    { id: 'img1', url: '/images/front.jpg', alt: 'Front view', loading: false },
                    { id: 'img2', url: '/images/side.jpg', alt: 'Side view', loading: false },
                ],
                discount: {
                    type: 'percentage',
                    code: 'SAVE10',
                    amount: 5,
                    applied: false,
                },
            });
        });
    });
});
