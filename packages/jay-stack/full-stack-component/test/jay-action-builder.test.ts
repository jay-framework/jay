import { describe, it, expect, expectTypeOf } from 'vitest';
import {
    makeJayAction,
    makeJayQuery,
    ActionError,
    isJayAction,
    ActionInput,
    ActionOutput,
    JayAction,
    JayActionDefinition,
} from '../lib';
import { createJayService } from '../lib';

// Test services
interface CartService {
    addItem(productId: string, quantity: number): Promise<{ items: { id: string }[] }>;
    getCart(): Promise<{ items: { id: string }[] }>;
}

interface InventoryService {
    getAvailableUnits(productId: string): Promise<number>;
}

interface ProductsDatabase {
    search(query: string, options?: { limit?: number }): Promise<{ items: any[]; total: number }>;
}

const CART_SERVICE = createJayService<CartService>('CartService');
const INVENTORY_SERVICE = createJayService<InventoryService>('InventoryService');
const PRODUCTS_DATABASE_SERVICE = createJayService<ProductsDatabase>('ProductsDatabase');

describe('makeJayAction', () => {
    it('should create an action with POST method by default', () => {
        const action = makeJayAction('test.action').withHandler(async (input: { name: string }) => {
            return { success: true };
        });

        expect(action.actionName).toBe('test.action');
        expect(action.method).toBe('POST');
        expect(action._brand).toBe('JayAction');
    });

    it('should infer input and output types from handler', () => {
        const action = makeJayAction('cart.addToCart')
            .withServices(CART_SERVICE)
            .withHandler(async (input: { productId: string; quantity: number }, cartService) => {
                const cart = await cartService.addItem(input.productId, input.quantity);
                return { cartItemCount: cart.items.length };
            });

        // Type checks (compile-time verification)
        type Input = ActionInput<typeof action>;
        type Output = ActionOutput<typeof action>;

        expectTypeOf<Input>().toEqualTypeOf<{ productId: string; quantity: number }>();
        expectTypeOf<Output>().toEqualTypeOf<{ cartItemCount: number }>();
    });

    it('should allow multiple services', () => {
        const action = makeJayAction('cart.addToCart')
            .withServices(CART_SERVICE, INVENTORY_SERVICE)
            .withHandler(
                async (input: { productId: string; quantity: number }, cartService, inventory) => {
                    const available = await inventory.getAvailableUnits(input.productId);
                    if (available < input.quantity) {
                        throw new ActionError('NOT_AVAILABLE', `Only ${available} available`);
                    }
                    const cart = await cartService.addItem(input.productId, input.quantity);
                    return { cartItemCount: cart.items.length };
                },
            );

        expect(action.services).toHaveLength(2);
    });

    it('should allow overriding method', () => {
        const action = makeJayAction('item.delete')
            .withMethod('DELETE')
            .withHandler(async (input: { id: string }) => {
                return { success: true };
            });

        expect(action.method).toBe('DELETE');
    });

    it('should store handler in definition', () => {
        const handler = async (input: { name: string }) => ({ greeting: `Hello ${input.name}` });

        const action = makeJayAction('test.greet').withHandler(handler);

        const definition = action as JayActionDefinition<any, any, any>;
        expect(definition.handler).toBe(handler);
    });
});

describe('makeJayQuery', () => {
    it('should create a query with GET method by default', () => {
        const query = makeJayQuery('products.search').withHandler(
            async (input: { query: string }) => {
                return { products: [], total: 0 };
            },
        );

        expect(query.actionName).toBe('products.search');
        expect(query.method).toBe('GET');
    });

    it('should support caching options', () => {
        const query = makeJayQuery('products.search')
            .withServices(PRODUCTS_DATABASE_SERVICE)
            .withCaching({ maxAge: 60, staleWhileRevalidate: 120 })
            .withHandler(async (input: { query: string }, productsDb) => {
                const results = await productsDb.search(input.query);
                return { products: results.items, total: results.total };
            });

        const definition = query as JayActionDefinition<any, any, any>;
        expect(definition.cacheOptions).toEqual({ maxAge: 60, staleWhileRevalidate: 120 });
    });

    it('should use default caching when called without options', () => {
        const query = makeJayQuery('products.list')
            .withCaching()
            .withHandler(async (_input: void) => {
                return { products: [] };
            });

        const definition = query as JayActionDefinition<any, any, any>;
        expect(definition.cacheOptions).toEqual({ maxAge: 60 });
    });
});

describe('ActionError', () => {
    it('should create an error with code and message', () => {
        const error = new ActionError('NOT_FOUND', 'Product not found');

        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toBe('Product not found');
        expect(error.name).toBe('ActionError');
        expect(error instanceof Error).toBe(true);
    });
});

describe('isJayAction', () => {
    it('should return true for JayAction', () => {
        const action = makeJayAction('test.action').withHandler(async () => ({ ok: true }));

        expect(isJayAction(action)).toBe(true);
    });

    it('should return false for regular functions', () => {
        const fn = async () => ({ ok: true });

        expect(isJayAction(fn)).toBe(false);
    });

    it('should return false for non-functions', () => {
        expect(isJayAction(null)).toBe(false);
        expect(isJayAction(undefined)).toBe(false);
        expect(isJayAction({})).toBe(false);
        expect(isJayAction('string')).toBe(false);
    });
});

describe('Type inference', () => {
    it('should correctly type action with void input', () => {
        const action = makeJayAction('cart.clear')
            .withServices(CART_SERVICE)
            .withHandler(async (_input: void, cartService) => {
                return { success: true };
            });

        type Input = ActionInput<typeof action>;
        type Output = ActionOutput<typeof action>;

        expectTypeOf<Input>().toEqualTypeOf<void>();
        expectTypeOf<Output>().toEqualTypeOf<{ success: boolean }>();
    });

    it('should correctly type complex output', () => {
        interface SearchResult {
            products: Array<{ id: string; name: string; price: number }>;
            totalCount: number;
            hasMore: boolean;
        }

        const query = makeJayQuery('products.search').withHandler(
            async (input: { query: string; page?: number }): Promise<SearchResult> => {
                return {
                    products: [],
                    totalCount: 0,
                    hasMore: false,
                };
            },
        );

        type Output = ActionOutput<typeof query>;
        expectTypeOf<Output>().toEqualTypeOf<SearchResult>();
    });
});

// ============================================================================
// Streaming Actions (DL#129)
// ============================================================================

import { makeJayStream, isJayStreamAction, StreamChunk } from '../lib';

describe('makeJayStream', () => {
    it('should create a streaming action with correct metadata', () => {
        const stream = makeJayStream('test.stream').withHandler(async function* (
            input: { page: number },
        ) {
            yield [{ id: '1' }, { id: '2' }];
            yield [{ id: '3' }];
        });

        expect(stream.actionName).toBe('test.stream');
        expect(stream.method).toBe('POST');
        expect(stream.isStreaming).toBe(true);
        expect(stream._brand).toBe('JayStreamAction');
    });

    it('should be callable and return async iterable', async () => {
        const stream = makeJayStream('test.stream').withHandler(async function* (
            input: { query: string },
        ) {
            yield { result: input.query + '-1' };
            yield { result: input.query + '-2' };
        });

        const chunks: any[] = [];
        for await (const chunk of stream({ query: 'test' })) {
            chunks.push(chunk);
        }

        expect(chunks).toHaveLength(2);
        expect(chunks[0].result).toBe('test-1');
        expect(chunks[1].result).toBe('test-2');
    });

    it('should support service injection', () => {
        const SERVICE = createJayService<CartService>('CartService');

        const stream = makeJayStream('test.withServices')
            .withServices(SERVICE)
            .withHandler(async function* (input: { id: string }, cartService: CartService) {
                const cart = await cartService.getCart();
                yield cart;
            });

        expect(stream.actionName).toBe('test.withServices');
        expect(stream.isStreaming).toBe(true);
    });

    it('isJayStreamAction identifies streaming actions', () => {
        const stream = makeJayStream('test.check').withHandler(async function* () {
            yield 1;
        });
        const action = makeJayAction('test.regular').withHandler(async () => 'ok');

        expect(isJayStreamAction(stream)).toBe(true);
        expect(isJayStreamAction(action)).toBe(false);
        expect(isJayStreamAction(null)).toBe(false);
    });

    it('StreamChunk extracts the chunk type', () => {
        const stream = makeJayStream('test.typed').withHandler(async function* (
            _input: { x: number },
        ) {
            yield { name: 'a', value: 1 };
        });

        type Chunk = StreamChunk<typeof stream>;
        expectTypeOf<Chunk>().toEqualTypeOf<{ name: string; value: number }>();
    });
});
