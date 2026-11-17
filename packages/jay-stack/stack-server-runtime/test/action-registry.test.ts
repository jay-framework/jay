import { describe, it, expect, beforeEach } from 'vitest';
import {
    ActionRegistry,
    DEFAULT_ACTION_BODY_LIMIT_BYTES,
    payloadTooLargeResponse,
    isCrossOriginRequest,
    needsSameOriginCheck,
    type RegisteredAction,
} from '../lib/action-registry';
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
            expect((registered as RegisteredAction).cacheOptions).toEqual({ maxAge: 60 });
        });

        it('should preserve acceptsFiles from withFiles()', () => {
            const upload = makeJayAction('test.upload')
                .withFiles()
                .withHandler(async () => ({ ok: true }));

            registry.register(upload);

            const registered = registry.get('test.upload');
            expect(registered?.acceptsFiles).toBe(true);
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

    describe('metadata', () => {
        it('should set and retrieve action metadata', () => {
            const action = makeJayAction('test.action').withHandler(
                async (input: { name: string }) => ({ greeting: `Hello ${input.name}` }),
            );

            registry.register(action);

            const metadata = {
                name: 'testAction',
                description: 'A test action',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        name: { type: 'string', description: 'The name' },
                    },
                    required: ['name'],
                },
            };

            registry.setMetadata('test.action', metadata);

            const registered = registry.get('test.action');
            expect(registered).toBeDefined();
            expect(registered!.metadata).toBeDefined();
            expect(registered!.metadata!.name).toBe('testAction');
            expect(registered!.metadata!.description).toBe('A test action');
        });

        it('should return actions with metadata via getActionsWithMetadata', () => {
            const action1 = makeJayAction('action.with-meta').withHandler(async () => ({}));
            const action2 = makeJayAction('action.without-meta').withHandler(async () => ({}));
            const action3 = makeJayAction('action.also-with-meta').withHandler(async () => ({}));

            registry.register(action1);
            registry.register(action2);
            registry.register(action3);

            registry.setMetadata('action.with-meta', {
                name: 'withMeta',
                description: 'Has metadata',
                inputSchema: { type: 'object', properties: {}, required: [] },
            });

            registry.setMetadata('action.also-with-meta', {
                name: 'alsoWithMeta',
                description: 'Also has metadata',
                inputSchema: { type: 'object', properties: {}, required: [] },
            });

            const actionsWithMeta = registry.getActionsWithMetadata();
            expect(actionsWithMeta).toHaveLength(2);
            expect(actionsWithMeta.map((a) => a.actionName)).toContain('action.with-meta');
            expect(actionsWithMeta.map((a) => a.actionName)).toContain('action.also-with-meta');
            expect(actionsWithMeta.map((a) => a.actionName)).not.toContain('action.without-meta');
        });

        it('should not set metadata on non-existent action', () => {
            registry.setMetadata('nonexistent.action', {
                name: 'nonexistent',
                description: 'Does not exist',
                inputSchema: { type: 'object', properties: {}, required: [] },
            });

            expect(registry.getActionsWithMetadata()).toHaveLength(0);
        });

        it('should register action without metadata by default', () => {
            const action = makeJayAction('test.no-meta').withHandler(async () => ({}));
            registry.register(action);

            const registered = registry.get('test.no-meta');
            expect(registered).toBeDefined();
            expect(registered!.metadata).toBeUndefined();
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

describe('direct action call with automatic service injection', () => {
    beforeEach(() => {
        clearServiceRegistry();
        // Register mock services
        registerService(CART_SERVICE, mockCartService);
        registerService(PRODUCTS_DATABASE_SERVICE, mockProductsDb);
    });

    it('should execute action with service injection via global resolver', async () => {
        const action = makeJayAction('cart.addToCart')
            .withServices(CART_SERVICE)
            .withHandler(async (input: { productId: string; quantity: number }, cartService) => {
                const cart = await cartService.addItem(input.productId, input.quantity);
                return { cartItemCount: cart.items.length };
            });

        // Direct call now works - global resolver injects services automatically
        const result = await action({ productId: 'prod-1', quantity: 3 });

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

        const result = await action({ query: 'test', addFirst: true });

        expect(result).toEqual({ found: 1 });
    });

    it('should execute action without services', async () => {
        const action = makeJayAction('test.simple').withHandler(
            async (input: { value: number }) => ({ doubled: input.value * 2 }),
        );

        const result = await action({ value: 5 });

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

        await expect(action({ quantity: 20 })).rejects.toThrow('Cannot exceed 10');
    });
});

// ============================================================================
// Streaming Actions (DL#129)
// ============================================================================

import { makeJayStream } from '@jay-framework/fullstack-component';

describe('Streaming Action Registry (DL#129)', () => {
    let registry: ActionRegistry;

    beforeEach(() => {
        registry = new ActionRegistry();
    });

    it('should register and detect a streaming action', () => {
        const stream = makeJayStream('test.stream').withHandler(async function* () {
            yield 1;
        });

        registry.registerStream(stream);

        expect(registry.has('test.stream')).toBe(true);
        expect(registry.isStreaming('test.stream')).toBe(true);
    });

    it('isStreaming returns false for regular actions', () => {
        const action = makeJayAction('test.regular').withHandler(async () => 'ok');
        registry.register(action);

        expect(registry.isStreaming('test.regular')).toBe(false);
    });

    it('executeStream yields all chunks from the handler', async () => {
        const stream = makeJayStream('test.multi').withHandler(async function* (input: {
            count: number;
        }) {
            for (let i = 0; i < input.count; i++) {
                yield { index: i };
            }
        });

        registry.registerStream(stream);

        const chunks: any[] = [];
        for await (const chunk of registry.executeStream('test.multi', { count: 3 })) {
            chunks.push(chunk);
        }

        expect(chunks).toHaveLength(3);
        expect(chunks[0]).toEqual({ index: 0 });
        expect(chunks[1]).toEqual({ index: 1 });
        expect(chunks[2]).toEqual({ index: 2 });
    });

    it('executeStream throws for non-existent action', async () => {
        await expect(async () => {
            for await (const _ of registry.executeStream('nonexistent', {})) {
                // should not reach here
            }
        }).rejects.toThrow("Streaming action 'nonexistent' not found");
    });

    it('executeStream propagates handler errors', async () => {
        const stream = makeJayStream('test.error').withHandler(async function* () {
            yield 'before';
            throw new Error('stream failed');
        });

        registry.registerStream(stream);

        const chunks: any[] = [];
        await expect(async () => {
            for await (const chunk of registry.executeStream('test.error', {})) {
                chunks.push(chunk);
            }
        }).rejects.toThrow('stream failed');

        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toBe('before');
    });
});

// ============================================================================
// Request cookies for server actions (DL#230)
// ============================================================================

describe('ActionRegistry withRequest (DL#230)', () => {
    let registry: ActionRegistry;

    beforeEach(() => {
        registry = new ActionRegistry();
        clearServiceRegistry();
        registerService(CART_SERVICE, mockCartService);
    });

    function recordingAction(name: string) {
        const calls: any[][] = [];
        const action = makeJayAction(name)
            .withServices(CART_SERVICE)
            .withRequest()
            .withHandler(async (input: { id: string }, request, cart) => {
                calls.push([input, request.cookies, cart]);
                return 'ok';
            });
        return { action, calls };
    }

    it('passes the incoming cookies as argument 2 for a needsRequest action', async () => {
        const { action, calls } = recordingAction('dl230.read');
        registry.register(action);

        const result = await registry.execute(
            'dl230.read',
            { id: 'a' },
            {
                cookies: { s: '1' },
                secure: false,
            },
        );

        expect(result).toEqual({ success: true, data: 'ok' });
        expect(calls).toEqual([[{ id: 'a' }, { s: '1' }, mockCartService]]);
    });

    it('does not pass cookies to an action without withRequest', async () => {
        const calls: any[][] = [];
        registry.register(
            makeJayAction('dl230.plain')
                .withServices(CART_SERVICE)
                .withHandler(async (...args: [{ id: string }, CartService]) => {
                    calls.push(args);
                    return 'ok';
                }),
        );

        await registry.execute('dl230.plain', { id: 'a' }, { cookies: { s: '1' }, secure: false });

        expect(calls).toEqual([[{ id: 'a' }, mockCartService]]);
    });

    it('passes empty cookies when execute is called with two arguments', async () => {
        const { action, calls } = recordingAction('dl230.empty');
        registry.register(action);

        await registry.execute('dl230.empty', { id: 'a' });

        expect(calls).toEqual([[{ id: 'a' }, {}, mockCartService]]);
    });

    it('passes cookies to a streaming withRequest action, and empty cookies by default', async () => {
        const seen: any[] = [];
        registry.registerStream(
            makeJayStream('dl230.stream')
                .withServices(CART_SERVICE)
                .withRequest()
                .withHandler(async function* (input: {}, request, cart) {
                    seen.push([request.cookies, cart]);
                    yield 1;
                }),
        );

        for await (const _ of registry.executeStream(
            'dl230.stream',
            {},
            {
                cookies: { s: '1' },
                secure: false,
            },
        )) {
        }
        for await (const _ of registry.executeStream('dl230.stream', {})) {
        }

        expect(seen).toEqual([
            [{ s: '1' }, mockCartService],
            [{}, mockCartService],
        ]);
    });

    it('returns private, no-store cache headers for needsRequest GET and POST', () => {
        registry.register(
            makeJayQuery('dl230.get')
                .withRequest()
                .withHandler(async (input: {}) => 1),
        );
        registry.register(
            makeJayAction('dl230.post')
                .withRequest()
                .withHandler(async (input: {}) => 1),
        );
        registry.register(
            makeJayQuery('dl230.cached')
                .withCaching({ maxAge: 60 })
                .withHandler(async (input: {}) => 1),
        );

        expect([
            registry.getCacheHeaders('dl230.get'),
            registry.getCacheHeaders('dl230.post'),
            registry.getCacheHeaders('dl230.cached'),
        ]).toEqual(['private, no-store', 'private, no-store', 'max-age=60']);
    });

    it('keeps one Set-Cookie per name, last write wins', async () => {
        registry.register(
            makeJayAction('dl230.set')
                .withRequest()
                .withHandler(async (input: {}, request) => {
                    request.setCookie('a', '1');
                    request.setCookie('b', '2');
                    request.setCookie('a', '3');
                    return 'ok';
                }),
        );

        const result = await registry.execute('dl230.set', {}, { cookies: {}, secure: false });

        expect(result).toEqual({
            success: true,
            data: 'ok',
            setCookies: [
                'a=3; Path=/; HttpOnly; SameSite=Lax',
                'b=2; Path=/; HttpOnly; SameSite=Lax',
            ],
        });
    });

    it('drops cookies set before an ActionError', async () => {
        registry.register(
            makeJayAction('dl230.fail')
                .withRequest()
                .withHandler(async (input: {}, request) => {
                    request.setCookie('sid', 'x');
                    throw new ActionError('NOPE', 'failed');
                }),
        );

        const result = await registry.execute('dl230.fail', {}, { cookies: {}, secure: true });

        expect(result).toEqual({
            success: false,
            error: { code: 'NOPE', message: 'failed', isActionError: true },
        });
    });

    it('requires the same-origin check for every withRequest action, GET included (DL#234)', () => {
        registry.register(
            makeJayQuery('dl230.q')
                .withRequest()
                .withHandler(async (i: {}) => 1),
        );
        registry.register(
            makeJayAction('dl230.a')
                .withRequest()
                .withHandler(async (i: {}) => 1),
        );
        registry.register(makeJayAction('dl230.p').withHandler(async (i: {}) => 1));

        expect(
            ['dl230.q', 'dl230.a', 'dl230.p'].map((name) =>
                needsSameOriginCheck(registry.get(name)!),
            ),
        ).toEqual([true, true, false]);
    });
});

describe('isCrossOriginRequest (DL#230)', () => {
    const requestOrigin = 'https://site.example';
    it.each([
        ['cross-site', undefined, true],
        ['same-site', undefined, true],
        ['same-origin', undefined, false],
        ['none', undefined, false],
        [undefined, 'https://evil.example', true],
        [undefined, 'https://site.example', false],
        [undefined, undefined, false],
    ])('Sec-Fetch-Site=%s Origin=%s -> %s', (secFetchSite, origin, expected) => {
        expect(isCrossOriginRequest({ secFetchSite, origin, requestOrigin })).toEqual(expected);
    });
});

describe('action runtime hardening (DL#234)', () => {
    it('needsSameOriginCheck should be true for a GET withRequest action', () => {
        const registry = new ActionRegistry();
        registry.register(
            makeJayQuery('dl234.q')
                .withRequest()
                .withHandler(async (i: {}) => 1),
        );
        expect(needsSameOriginCheck(registry.get('dl234.q')!)).toEqual(true);
    });

    it('should hand the original error to the dispatcher as cause on an internal error', async () => {
        const registry = new ActionRegistry();
        const thrown = new Error('secret');
        registry.register(
            makeJayAction('dl234.fail').withHandler(async () => {
                throw thrown;
            }),
        );

        const result = await registry.execute('dl234.fail', {});

        expect(result).toEqual({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'secret', isActionError: false },
            cause: thrown,
        });
    });

    it('should default the action body limit to 1 MiB', () => {
        expect(DEFAULT_ACTION_BODY_LIMIT_BYTES).toEqual(1_048_576);
    });

    it('should describe the limit in the 413 body', () => {
        expect(payloadTooLargeResponse(10)).toEqual({
            success: false,
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: 'Action request body exceeds 10 bytes',
                isActionError: false,
            },
        });
    });
});
