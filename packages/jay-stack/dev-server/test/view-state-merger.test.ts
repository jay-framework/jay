import { deepMergeViewStates } from '../lib/view-state-merger';
import { Contract, ContractTag, ContractTagType } from '@jay-framework/compiler-jay-html';
import { vi } from 'vitest';

describe('deepMergeViewStates', () => {
    describe('primitive values', () => {
        it('should merge simple objects with no nesting', () => {
            const slow = { name: 'Product A', sku: 'SKU-123' };
            const fast = { price: 29.99, inStock: true };
            const contract: Contract = {
                name: 'Test',
                tags: [
                    { tag: 'name', type: [ContractTagType.data] },
                    { tag: 'sku', type: [ContractTagType.data] },
                    { tag: 'price', type: [ContractTagType.data] },
                    { tag: 'inStock', type: [ContractTagType.data] },
                ],
            };

            const result = deepMergeViewStates(slow, fast, contract);

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
            const contract: Contract = {
                name: 'Test',
                tags: [{ tag: 'count', type: [ContractTagType.data] }],
            };

            const result = deepMergeViewStates(slow, fast, contract);

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
            const contract: Contract = {
                name: 'Test',
                tags: [
                    {
                        tag: 'discount',
                        type: [ContractTagType.subContract],
                        tags: [
                            { tag: 'type', type: [ContractTagType.data] },
                            { tag: 'code', type: [ContractTagType.data] },
                            { tag: 'amount', type: [ContractTagType.data] },
                            { tag: 'applied', type: [ContractTagType.variant] },
                        ],
                    },
                ],
            };

            const result = deepMergeViewStates(slow, fast, contract);

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
            const contract: Contract = {
                name: 'Test',
                tags: [
                    {
                        tag: 'user',
                        type: [ContractTagType.subContract],
                        tags: [
                            {
                                tag: 'profile',
                                type: [ContractTagType.subContract],
                                tags: [
                                    { tag: 'name', type: [ContractTagType.data] },
                                    { tag: 'age', type: [ContractTagType.data] },
                                    { tag: 'status', type: [ContractTagType.data] },
                                ],
                            },
                        ],
                    },
                ],
            };

            const result = deepMergeViewStates(slow, fast, contract);

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
            const contract: Contract = {
                name: 'Test',
                tags: [
                    {
                        tag: 'images',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'id',
                        tags: [
                            { tag: 'id', type: [ContractTagType.data] },
                            { tag: 'url', type: [ContractTagType.data] },
                            { tag: 'alt', type: [ContractTagType.data] },
                            { tag: 'loading', type: [ContractTagType.variant] },
                        ],
                    },
                ],
            };

            const result = deepMergeViewStates(slow, fast, contract);

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
            const contract: Contract = {
                name: 'Test',
                tags: [
                    {
                        tag: 'items',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'id',
                        tags: [
                            { tag: 'id', type: [ContractTagType.data] },
                            { tag: 'name', type: [ContractTagType.data] },
                            { tag: 'price', type: [ContractTagType.data] },
                        ],
                    },
                ],
            };

            const result = deepMergeViewStates(slow, fast, contract);

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
            const contract: Contract = {
                name: 'Test',
                tags: [
                    {
                        tag: 'items',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'id',
                        tags: [
                            { tag: 'id', type: [ContractTagType.data] },
                            { tag: 'name', type: [ContractTagType.data] },
                            { tag: 'price', type: [ContractTagType.data] },
                        ],
                    },
                ],
            };

            const result = deepMergeViewStates(slow, fast, contract);

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
            const contract: Contract = {
                name: 'Test',
                tags: [
                    {
                        tag: 'items',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'id',
                        tags: [
                            { tag: 'id', type: [ContractTagType.data] },
                            { tag: 'name', type: [ContractTagType.data] },
                            { tag: 'price', type: [ContractTagType.data] },
                        ],
                    },
                ],
            };

            const result = deepMergeViewStates(slow, fast, contract);

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
            const contract: Contract = {
                name: 'Test',
                tags: [
                    {
                        tag: 'products',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'id',
                        tags: [
                            { tag: 'id', type: [ContractTagType.data] },
                            {
                                tag: 'info',
                                type: [ContractTagType.subContract],
                                tags: [
                                    { tag: 'name', type: [ContractTagType.data] },
                                    { tag: 'sku', type: [ContractTagType.data] },
                                    { tag: 'price', type: [ContractTagType.data] },
                                ],
                            },
                        ],
                    },
                ],
            };

            const result = deepMergeViewStates(slow, fast, contract);

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
            const contract: Contract = {
                name: 'Test',
                tags: [{ tag: 'count', type: [ContractTagType.data] }],
            };

            const result = deepMergeViewStates(slow, fast, contract);

            expect(result).toEqual({ count: 10 });
        });

        it('should handle empty fast object', () => {
            const slow = { count: 5 };
            const fast = {};
            const contract: Contract = {
                name: 'Test',
                tags: [{ tag: 'count', type: [ContractTagType.data] }],
            };

            const result = deepMergeViewStates(slow, fast, contract);

            expect(result).toEqual({ count: 5 });
        });

        it('should handle undefined slow', () => {
            const slow = undefined;
            const fast = { count: 10 };
            const contract: Contract = {
                name: 'Test',
                tags: [{ tag: 'count', type: [ContractTagType.data] }],
            };

            const result = deepMergeViewStates(slow, fast, contract);

            expect(result).toEqual({ count: 10 });
        });

        it('should handle undefined fast', () => {
            const slow = { count: 5 };
            const fast = undefined;
            const contract: Contract = {
                name: 'Test',
                tags: [{ tag: 'count', type: [ContractTagType.data] }],
            };

            const result = deepMergeViewStates(slow, fast, contract);

            expect(result).toEqual({ count: 5 });
        });

        it('should handle both undefined', () => {
            const slow = undefined;
            const fast = undefined;
            const contract: Contract = {
                name: 'Test',
                tags: [],
            };

            const result = deepMergeViewStates(slow, fast, contract);

            expect(result).toEqual({});
        });

        it('should handle empty arrays', () => {
            const slow = { items: [] };
            const fast = { items: [] };
            const contract: Contract = {
                name: 'Test',
                tags: [
                    {
                        tag: 'items',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'id',
                        tags: [{ tag: 'id', type: [ContractTagType.data] }],
                    },
                ],
            };

            const result = deepMergeViewStates(slow, fast, contract);

            expect(result).toEqual({ items: [] });
        });

        it('should warn and use fast array when trackBy is missing', () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const slow = { items: [{ id: '1', name: 'Item 1' }] };
            const fast = { items: [{ id: '1', price: 10 }] };
            const contract: Contract = {
                name: 'Test',
                tags: [
                    {
                        tag: 'items',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        // trackBy is missing!
                        tags: [
                            { tag: 'id', type: [ContractTagType.data] },
                            { tag: 'name', type: [ContractTagType.data] },
                            { tag: 'price', type: [ContractTagType.data] },
                        ],
                    },
                ],
            };

            const result = deepMergeViewStates(slow, fast, contract);

            expect(result).toEqual({
                items: [{ id: '1', price: 10 }], // Fast array wins
            });
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('missing trackBy attribute'),
            );

            consoleWarnSpy.mockRestore();
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

            const contract: Contract = {
                name: 'ProductPage',
                tags: [
                    { tag: 'name', type: [ContractTagType.data] },
                    { tag: 'sku', type: [ContractTagType.data] },
                    { tag: 'description', type: [ContractTagType.data] },
                    { tag: 'price', type: [ContractTagType.data] },
                    { tag: 'inStock', type: [ContractTagType.data] },
                    {
                        tag: 'images',
                        type: [ContractTagType.subContract],
                        repeated: true,
                        trackBy: 'id',
                        tags: [
                            { tag: 'id', type: [ContractTagType.data] },
                            { tag: 'url', type: [ContractTagType.data] },
                            { tag: 'alt', type: [ContractTagType.data] },
                            { tag: 'loading', type: [ContractTagType.variant] },
                        ],
                    },
                    {
                        tag: 'discount',
                        type: [ContractTagType.subContract],
                        tags: [
                            { tag: 'type', type: [ContractTagType.data] },
                            { tag: 'code', type: [ContractTagType.data] },
                            { tag: 'amount', type: [ContractTagType.data] },
                            { tag: 'applied', type: [ContractTagType.variant] },
                        ],
                    },
                ],
            };

            const result = deepMergeViewStates(slow, fast, contract);

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
