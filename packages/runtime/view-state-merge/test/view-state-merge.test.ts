import { deepMergeViewStates } from '../lib/index';

describe('deepMergeViewStates', () => {
    describe('primitive values', () => {
        it('should merge simple objects with no nesting', () => {
            const base = { name: 'Product A', sku: 'SKU-123' };
            const overlay = { price: 29.99, inStock: true };
            const trackByMap = {}; // No arrays to track

            const result = deepMergeViewStates(base, overlay, trackByMap);

            expect(result).toEqual({
                name: 'Product A',
                sku: 'SKU-123',
                price: 29.99,
                inStock: true,
            });
        });

        it('should prefer overlay value when both have the same property', () => {
            const base = { count: 5 };
            const overlay = { count: 10 };
            const trackByMap = {};

            const result = deepMergeViewStates(base, overlay, trackByMap);

            expect(result).toEqual({ count: 10 });
        });
    });

    describe('nested objects', () => {
        it('should deep merge nested objects', () => {
            const base = {
                discount: {
                    type: 'percentage',
                    code: 'SAVE10',
                },
            };
            const overlay = {
                discount: {
                    amount: 5,
                    applied: false,
                },
            };
            const trackByMap = {}; // No arrays to track

            const result = deepMergeViewStates(base, overlay, trackByMap);

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
            const base = {
                user: {
                    profile: {
                        name: 'John',
                        age: 30,
                    },
                },
            };
            const overlay = {
                user: {
                    profile: {
                        status: 'online',
                    },
                },
            };
            const trackByMap = {};

            const result = deepMergeViewStates(base, overlay, trackByMap);

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
            const base = {
                images: [
                    { id: '1', url: '/img1.jpg', alt: 'Image 1' },
                    { id: '2', url: '/img2.jpg', alt: 'Image 2' },
                ],
            };
            const overlay = {
                images: [
                    { id: '1', loading: false },
                    { id: '2', loading: true },
                ],
            };
            const trackByMap = {
                images: 'id', // images array tracked by 'id' field
            };

            const result = deepMergeViewStates(base, overlay, trackByMap);

            expect(result).toEqual({
                images: [
                    { id: '1', url: '/img1.jpg', alt: 'Image 1', loading: false },
                    { id: '2', url: '/img2.jpg', alt: 'Image 2', loading: true },
                ],
            });
        });

        it('should preserve base array order when merging', () => {
            const base = {
                items: [
                    { id: '2', name: 'Item 2' },
                    { id: '1', name: 'Item 1' },
                    { id: '3', name: 'Item 3' },
                ],
            };
            const overlay = {
                items: [
                    { id: '1', price: 10 },
                    { id: '2', price: 20 },
                    { id: '3', price: 30 },
                ],
            };
            const trackByMap = {
                items: 'id',
            };

            const result = deepMergeViewStates(base, overlay, trackByMap);

            expect(result).toEqual({
                items: [
                    { id: '2', name: 'Item 2', price: 20 },
                    { id: '1', name: 'Item 1', price: 10 },
                    { id: '3', name: 'Item 3', price: 30 },
                ],
            });
        });

        it('should handle items only in base array', () => {
            const base = {
                items: [
                    { id: '1', name: 'Item 1' },
                    { id: '2', name: 'Item 2' },
                    { id: '3', name: 'Item 3' },
                ],
            };
            const overlay = {
                items: [
                    { id: '1', price: 10 },
                    { id: '3', price: 30 },
                ],
            };
            const trackByMap = {
                items: 'id',
            };

            const result = deepMergeViewStates(base, overlay, trackByMap);

            expect(result).toEqual({
                items: [
                    { id: '1', name: 'Item 1', price: 10 },
                    { id: '2', name: 'Item 2' }, // No price (only in base)
                    { id: '3', name: 'Item 3', price: 30 },
                ],
            });
        });

        it('should NOT add items that only exist in overlay array', () => {
            const base = {
                items: [
                    { id: '1', name: 'Item 1' },
                    { id: '2', name: 'Item 2' },
                ],
            };
            const overlay = {
                items: [
                    { id: '1', price: 10 },
                    { id: '2', price: 20 },
                    { id: '3', price: 30 }, // New item in overlay - should be ignored
                ],
            };
            const trackByMap = {
                items: 'id',
            };

            const result = deepMergeViewStates(base, overlay, trackByMap);

            // id: '3' is NOT added - base defines the structure
            expect(result).toEqual({
                items: [
                    { id: '1', name: 'Item 1', price: 10 },
                    { id: '2', name: 'Item 2', price: 20 },
                ],
            });
        });

        it('should handle nested objects within array items', () => {
            const base = {
                products: [
                    {
                        id: '1',
                        info: { name: 'Product 1', sku: 'SKU-1' },
                    },
                ],
            };
            const overlay = {
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

            const result = deepMergeViewStates(base, overlay, trackByMap);

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

    describe('arrays without trackBy (overlay replacement)', () => {
        it('should replace array with overlay when trackBy info is missing', () => {
            const base = { items: [{ id: '1', name: 'Item 1' }] };
            const overlay = { items: [{ id: '1', price: 10 }] };
            const trackByMap = {}; // No trackBy info for items array

            const result = deepMergeViewStates(base, overlay, trackByMap);

            // Without trackBy, overlay array completely replaces base array
            expect(result).toEqual({
                items: [{ id: '1', price: 10 }],
            });
        });

        it('should allow full array replacement for dynamic lists', () => {
            const base = {
                searchResults: [
                    { id: '1', title: 'Old Result 1' },
                    { id: '2', title: 'Old Result 2' },
                ],
            };
            const overlay = {
                searchResults: [
                    { id: '3', title: 'New Result 1' },
                    { id: '4', title: 'New Result 2' },
                    { id: '5', title: 'New Result 3' },
                ],
            };
            const trackByMap = {}; // Intentionally no trackBy - we want full replacement

            const result = deepMergeViewStates(base, overlay, trackByMap);

            // Overlay completely replaces base - useful for search results, filters, etc.
            expect(result).toEqual({
                searchResults: [
                    { id: '3', title: 'New Result 1' },
                    { id: '4', title: 'New Result 2' },
                    { id: '5', title: 'New Result 3' },
                ],
            });
        });
    });

    describe('edge cases', () => {
        it('should handle empty base object', () => {
            const base = {};
            const overlay = { count: 10 };
            const trackByMap = {};

            const result = deepMergeViewStates(base, overlay, trackByMap);

            expect(result).toEqual({ count: 10 });
        });

        it('should handle empty overlay object', () => {
            const base = { count: 5 };
            const overlay = {};
            const trackByMap = {};

            const result = deepMergeViewStates(base, overlay, trackByMap);

            expect(result).toEqual({ count: 5 });
        });

        it('should handle undefined base', () => {
            const base = undefined;
            const overlay = { count: 10 };
            const trackByMap = {};

            const result = deepMergeViewStates(base, overlay, trackByMap);

            expect(result).toEqual({ count: 10 });
        });

        it('should handle undefined overlay', () => {
            const base = { count: 5 };
            const overlay = undefined;
            const trackByMap = {};

            const result = deepMergeViewStates(base, overlay, trackByMap);

            expect(result).toEqual({ count: 5 });
        });

        it('should handle both undefined', () => {
            const base = undefined;
            const overlay = undefined;
            const trackByMap = {};

            const result = deepMergeViewStates(base, overlay, trackByMap);

            expect(result).toEqual({});
        });

        it('should handle empty arrays', () => {
            const base = { items: [] };
            const overlay = { items: [] };
            const trackByMap = {
                items: 'id',
            };

            const result = deepMergeViewStates(base, overlay, trackByMap);

            expect(result).toEqual({ items: [] });
        });
    });

    describe('complex real-world example', () => {
        it('should merge a product page view state', () => {
            const base = {
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

            const overlay = {
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

            const result = deepMergeViewStates(base, overlay, trackByMap);

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
