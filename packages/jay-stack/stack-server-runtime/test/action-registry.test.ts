import { describe, it, expect, beforeEach } from 'vitest';
import { ActionRegistry, runAction } from '../lib/action-registry';
import { registerService, clearServiceRegistry } from '../lib/services';
import {
    makeJayAction,
    makeJayQuery,
    ActionError,
    createJayService,
} from '@jay-framework/fullstack-component';

// Test services
interface CartService {
    addItem(productId: string, quantity: number): Promise<{ items: { id: string }[] }>;
}

interface ProductsDatabase {
    search(query: string): Promise<{ items: any[]; total: number }>;
}

const CART_SERVICE = createJayService<CartService>('CartService');
const PRODUCTS_DATABASE_SERVICE = createJayService<ProductsDatabase>('ProductsDatabase');

// Mock service implementations
const mockCartService: CartService = {
    addItem: async (productId, quantity) => ({
        items: Array(quantity).fill({ id: productId }),
    }),
};

const mockProductsDb: ProductsDatabase = {
    search: async (query) => ({
        items: [{ name: `Result for ${query}` }],
        total: 1,
    }),
};

describe('ActionRegistry', () => {
    let registry: ActionRegistry;

    beforeEach(() => {
        registry = new ActionRegistry();
        clearServiceRegistry();
        // Register mock services
        registerService(CART_SERVICE, mockCartService);
        registerService(PRODUCTS_DATABASE_SERVICE, mockProductsDb);
    });

    describe('register', () => {
        it('should register an action', () => {
            const action = makeJayAction('test.action').withHandler(
                async (input: { name: string }) => ({ greeting: `Hello ${input.name}` }),
            );

            registry.register(action);

            expect(registry.has('test.action')).toBe(true);
        });

        it('should register action with services', () => {
            const action = makeJayAction('cart.addToCart')
                .withServices(CART_SERVICE)
                .withHandler(
                    async (input: { productId: string; quantity: number }, cartService) => {
                        const cart = await cartService.addItem(input.productId, input.quantity);
                        return { cartItemCount: cart.items.length };
                    },
                );

            registry.register(action);

            const registered = registry.get('cart.addToCart');
            expect(registered).toBeDefined();
            expect(registered!.method).toBe('POST');
            expect(registered!.services).toHaveLength(1);
        });

        it('should register query with GET method', () => {
            const query = makeJayQuery('products.search')
                .withServices(PRODUCTS_DATABASE_SERVICE)
                .withCaching({ maxAge: 60 })
                .withHandler(async (input: { query: string }, productsDb) => {
                    return productsDb.search(input.query);
                });

            registry.register(query);

            const registered = registry.get('products.search');
            expect(registered).toBeDefined();
            expect(registered!.method).toBe('GET');
            expect(registered!.cacheOptions).toEqual({ maxAge: 60 });
        });
    });

    describe('getNames', () => {
        it('should return all registered action names', () => {
            const action1 = makeJayAction('action.one').withHandler(async () => ({}));
            const action2 = makeJayAction('action.two').withHandler(async () => ({}));
            const query = makeJayQuery('query.one').withHandler(async () => ({}));

            registry.register(action1);
            registry.register(action2);
            registry.register(query);

            const names = registry.getNames();
            expect(names).toContain('action.one');
            expect(names).toContain('action.two');
            expect(names).toContain('query.one');
            expect(names).toHaveLength(3);
        });
    });

    describe('execute', () => {
        it('should execute action successfully', async () => {
            const action = makeJayAction('test.greet').withHandler(
                async (input: { name: string }) => ({
                    greeting: `Hello ${input.name}!`,
                }),
            );

            registry.register(action);

            const result = await registry.execute('test.greet', { name: 'World' });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ greeting: 'Hello World!' });
            }
        });

        it('should execute action with services', async () => {
            const action = makeJayAction('cart.addToCart')
                .withServices(CART_SERVICE)
                .withHandler(
                    async (input: { productId: string; quantity: number }, cartService) => {
                        const cart = await cartService.addItem(input.productId, input.quantity);
                        return { cartItemCount: cart.items.length };
                    },
                );

            registry.register(action);

            const result = await registry.execute('cart.addToCart', {
                productId: 'prod-1',
                quantity: 3,
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ cartItemCount: 3 });
            }
        });

        it('should return error for non-existent action', async () => {
            const result = await registry.execute('nonexistent.action', {});

            expect(result.success).toBe(false);
            expect(result).toMatchObject({
                success: false,
                error: {
                    code: 'ACTION_NOT_FOUND',
                    message: expect.stringContaining('nonexistent.action'),
                },
            });
        });

        it('should handle ActionError from handler', async () => {
            const action = makeJayAction('cart.addToCart').withHandler(
                async (input: { quantity: number }) => {
                    if (input.quantity > 10) {
                        throw new ActionError(
                            'MAX_QUANTITY_EXCEEDED',
                            'Cannot add more than 10 items',
                        );
                    }
                    return { success: true };
                },
            );

            registry.register(action);

            const result = await registry.execute('cart.addToCart', { quantity: 20 });

            expect(result.success).toBe(false);
            expect(result).toMatchObject({
                success: false,
                error: {
                    code: 'MAX_QUANTITY_EXCEEDED',
                    message: 'Cannot add more than 10 items',
                    isActionError: true,
                },
            });
        });

        it('should handle generic errors from handler', async () => {
            const action = makeJayAction('test.failing').withHandler(async () => {
                throw new Error('Something went wrong');
            });

            registry.register(action);

            const result = await registry.execute('test.failing', {});

            expect(result.success).toBe(false);
            expect(result).toMatchObject({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Something went wrong',
                    isActionError: false,
                },
            });
        });
    });

    describe('getCacheHeaders', () => {
        it('should return cache headers for GET action with caching', () => {
            const query = makeJayQuery('products.search')
                .withCaching({ maxAge: 60, staleWhileRevalidate: 120 })
                .withHandler(async () => ({ items: [] }));

            registry.register(query);

            const headers = registry.getCacheHeaders('products.search');
            expect(headers).toBe('max-age=60, stale-while-revalidate=120');
        });

        it('should return cache headers with only maxAge', () => {
            const query = makeJayQuery('products.list')
                .withCaching({ maxAge: 300 })
                .withHandler(async () => ({ items: [] }));

            registry.register(query);

            const headers = registry.getCacheHeaders('products.list');
            expect(headers).toBe('max-age=300');
        });

        it('should return undefined for POST actions', () => {
            const action = makeJayAction('cart.addToCart').withHandler(async () => ({
                success: true,
            }));

            registry.register(action);

            const headers = registry.getCacheHeaders('cart.addToCart');
            expect(headers).toBeUndefined();
        });

        it('should return undefined for GET without caching', () => {
            const query = makeJayQuery('products.search').withHandler(async () => ({ items: [] }));

            registry.register(query);

            const headers = registry.getCacheHeaders('products.search');
            expect(headers).toBeUndefined();
        });

        it('should return undefined for non-existent action', () => {
            const headers = registry.getCacheHeaders('nonexistent.action');
            expect(headers).toBeUndefined();
        });
    });

    describe('clear', () => {
        it('should clear all registered actions', () => {
            const action1 = makeJayAction('action.one').withHandler(async () => ({}));
            const action2 = makeJayAction('action.two').withHandler(async () => ({}));

            registry.register(action1);
            registry.register(action2);

            expect(registry.getNames()).toHaveLength(2);

            registry.clear();

            expect(registry.getNames()).toHaveLength(0);
            expect(registry.has('action.one')).toBe(false);
            expect(registry.has('action.two')).toBe(false);
        });
    });

    describe('isolation', () => {
        it('should have isolated registries for testing', () => {
            const registry1 = new ActionRegistry();
            const registry2 = new ActionRegistry();

            const action = makeJayAction('test.action').withHandler(async () => ({ value: 1 }));

            registry1.register(action);

            expect(registry1.has('test.action')).toBe(true);
            expect(registry2.has('test.action')).toBe(false);
        });
    });
});

describe('runAction', () => {
    beforeEach(() => {
        clearServiceRegistry();
        // Register mock services
        registerService(CART_SERVICE, mockCartService);
        registerService(PRODUCTS_DATABASE_SERVICE, mockProductsDb);
    });

    it('should execute action with service injection', async () => {
        const action = makeJayAction('cart.addToCart')
            .withServices(CART_SERVICE)
            .withHandler(async (input: { productId: string; quantity: number }, cartService) => {
                const cart = await cartService.addItem(input.productId, input.quantity);
                return { cartItemCount: cart.items.length };
            });

        // Direct call bypasses service injection
        // const result = await action({ productId: 'prod-1', quantity: 3 }); // ❌ Would fail

        // runAction properly injects services
        const result = await runAction(action, { productId: 'prod-1', quantity: 3 });

        expect(result).toEqual({ cartItemCount: 3 });
    });

    it('should execute action with multiple services', async () => {
        const action = makeJayQuery('products.searchAndCart')
            .withServices(PRODUCTS_DATABASE_SERVICE, CART_SERVICE)
            .withHandler(
                async (input: { query: string; addFirst: boolean }, productsDb, cartService) => {
                    const results = await productsDb.search(input.query);
                    if (input.addFirst && results.items.length > 0) {
                        await cartService.addItem('first-item', 1);
                    }
                    return { found: results.total };
                },
            );

        const result = await runAction(action, { query: 'test', addFirst: true });

        expect(result).toEqual({ found: 1 });
    });

    it('should execute action without services', async () => {
        const action = makeJayAction('test.simple').withHandler(
            async (input: { value: number }) => ({ doubled: input.value * 2 }),
        );

        const result = await runAction(action, { value: 5 });

        expect(result).toEqual({ doubled: 10 });
    });

    it('should propagate ActionError from handler', async () => {
        const action = makeJayAction('cart.validate')
            .withServices(CART_SERVICE)
            .withHandler(async (input: { quantity: number }) => {
                if (input.quantity > 10) {
                    throw new ActionError('MAX_EXCEEDED', 'Cannot exceed 10');
                }
                return { ok: true };
            });

        await expect(runAction(action, { quantity: 20 })).rejects.toThrow('Cannot exceed 10');
    });
});
