import { describe, it, expect, beforeEach } from 'vitest';
import { createActionRouter, ACTION_ENDPOINT_BASE } from '../lib/action-router';
import {
    ActionRegistry,
    registerService,
    clearServiceRegistry,
} from '@jay-framework/stack-server-runtime';
import {
    makeJayAction,
    makeJayQuery,
    ActionError,
    createJayService, makeJayStream,
} from '@jay-framework/fullstack-component';

// Mock Express request/response
function createMockRequest(overrides: Partial<any> = {}) {
    return {
        method: 'POST',
        path: '/test.action',
        query: {},
        body: {},
        ...overrides,
    };
}

function createMockResponse() {
    const res: any = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: null,
        status: function (code: number) {
            this.statusCode = code;
            return this;
        },
        json: function (data: any) {
            this.body = data;
            return this;
        },
        set: function (header: string, value: string) {
            this.headers[header] = value;
            return this;
        },
    };
    return res;
}

// Test service
interface TestService {
    getData(): Promise<{ value: string }>;
}

const TEST_SERVICE = createJayService<TestService>('TestService');

const mockTestService: TestService = {
    getData: async () => ({ value: 'test-data' }),
};

describe('Action Router', () => {
    let registry: ActionRegistry;

    beforeEach(() => {
        registry = new ActionRegistry();
        clearServiceRegistry();
        registerService(TEST_SERVICE, mockTestService);
    });

    describe('createActionRouter', () => {
        it('should handle successful action execution', async () => {
            const action = makeJayAction('test.greet').withHandler(
                async (input: { name: string }) => ({
                    greeting: `Hello ${input.name}!`,
                }),
            );

            registry.register(action);

            const router = createActionRouter({ registry });
            const req = createMockRequest({
                method: 'POST',
                path: '/test.greet',
                body: { name: 'World' },
            });
            const res = createMockResponse();

            await router(req as any, res as any, () => {});

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({
                success: true,
                data: { greeting: 'Hello World!' },
            });
        });

        it('should return 404 for non-existent action', async () => {
            const router = createActionRouter({ registry });
            const req = createMockRequest({
                path: '/nonexistent.action',
            });
            const res = createMockResponse();

            await router(req as any, res as any, () => {});

            expect(res.statusCode).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('ACTION_NOT_FOUND');
        });

        it('should return 405 for wrong HTTP method', async () => {
            const action = makeJayAction('test.action').withHandler(async () => ({ ok: true }));

            registry.register(action);

            const router = createActionRouter({ registry });
            const req = createMockRequest({
                method: 'GET', // Action expects POST
                path: '/test.action',
            });
            const res = createMockResponse();

            await router(req as any, res as any, () => {});

            expect(res.statusCode).toBe(405);
            expect(res.body.error.code).toBe('METHOD_NOT_ALLOWED');
        });

        it('should handle GET query with query params', async () => {
            const query = makeJayQuery('products.search').withHandler(
                async (input: { query: string }) => ({
                    results: [`Result for: ${input.query}`],
                }),
            );

            registry.register(query);

            const router = createActionRouter({ registry });
            const req = createMockRequest({
                method: 'GET',
                path: '/products.search',
                query: { query: 'test-query' },
            });
            const res = createMockResponse();

            await router(req as any, res as any, () => {});

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({
                success: true,
                data: { results: ['Result for: test-query'] },
            });
        });

        it('should handle GET query with _input param for complex objects', async () => {
            const query = makeJayQuery('products.search').withHandler(
                async (input: { filters: { category: string } }) => ({
                    results: [input.filters.category],
                }),
            );

            registry.register(query);

            const router = createActionRouter({ registry });
            const req = createMockRequest({
                method: 'GET',
                path: '/products.search',
                query: { _input: JSON.stringify({ filters: { category: 'electronics' } }) },
            });
            const res = createMockResponse();

            await router(req as any, res as any, () => {});

            expect(res.statusCode).toBe(200);
            expect(res.body.data.results).toContain('electronics');
        });

        it('should return 422 for ActionError', async () => {
            const action = makeJayAction('cart.addToCart').withHandler(async () => {
                throw new ActionError('OUT_OF_STOCK', 'Product is out of stock');
            });

            registry.register(action);

            const router = createActionRouter({ registry });
            const req = createMockRequest({
                path: '/cart.addToCart',
                body: {},
            });
            const res = createMockResponse();

            await router(req as any, res as any, () => {});

            expect(res.statusCode).toBe(422);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('OUT_OF_STOCK');
            expect(res.body.error.message).toBe('Product is out of stock');
            expect(res.body.error.isActionError).toBe(true);
        });

        it('should set cache headers for GET with caching', async () => {
            const query = makeJayQuery('products.list')
                .withCaching({ maxAge: 60, staleWhileRevalidate: 120 })
                .withHandler(async () => ({ products: [] }));

            registry.register(query);

            const router = createActionRouter({ registry });
            const req = createMockRequest({
                method: 'GET',
                path: '/products.list',
            });
            const res = createMockResponse();

            await router(req as any, res as any, () => {});

            expect(res.statusCode).toBe(200);
            expect(res.headers['Cache-Control']).toBe('max-age=60, stale-while-revalidate=120');
        });

        it('should inject services into handler', async () => {
            const action = makeJayAction('test.withService')
                .withServices(TEST_SERVICE)
                .withHandler(async (_input: void, testService) => {
                    return testService.getData();
                });

            registry.register(action);

            const router = createActionRouter({ registry });
            const req = createMockRequest({
                path: '/test.withService',
            });
            const res = createMockResponse();

            await router(req as any, res as any, () => {});

            expect(res.statusCode).toBe(200);
            expect(res.body.data).toEqual({ value: 'test-data' });
        });

        it('should use default global registry when not specified', async () => {
            // This test verifies that createActionRouter works without options
            // It uses the global registry which may have actions from other tests
            const router = createActionRouter();
            expect(router).toBeDefined();
            expect(typeof router).toBe('function');
        });
    });

    describe('ACTION_ENDPOINT_BASE', () => {
        it('should have correct value', () => {
            expect(ACTION_ENDPOINT_BASE).toBe('/_jay/actions');
        });
    });

    // --- Streaming Actions (DL#129) ---

    describe('streaming actions', () => {
        function createStreamMockResponse() {
            const res: any = {
                statusCode: 200,
                headers: {} as Record<string, string>,
                chunks: [] as string[],
                ended: false,
                setHeader(key: string, value: string) {
                    this.headers[key] = value;
                    return this;
                },
                write(data: string) {
                    this.chunks.push(data);
                    return true;
                },
                end() {
                    this.ended = true;
                },
                status(code: number) {
                    this.statusCode = code;
                    return this;
                },
                json(data: any) {
                    this.body = data;
                    return this;
                },
                set(header: string, value: string) {
                    this.headers[header] = value;
                    return this;
                },
            };
            return res;
        }

        it('should respond with NDJSON for streaming actions', async () => {
            const stream = makeJayStream('test.stream').withHandler(
                async function* (input: { count: number }) {
                    for (let i = 0; i < input.count; i++) {
                        yield { index: i };
                    }
                },
            );

            registry.registerStream(stream);

            const router = createActionRouter({ registry });
            const req = createMockRequest({
                method: 'POST',
                path: '/test.stream',
                body: { count: 3 },
            });
            const res = createStreamMockResponse();

            await router(req as any, res as any, () => {});

            expect(res.headers['Content-Type']).toBe('application/x-ndjson');
            expect(res.ended).toBe(true);

            // Parse NDJSON chunks
            const lines = res.chunks.map((c: string) => JSON.parse(c.trim()));
            expect(lines).toHaveLength(4); // 3 chunks + done
            expect(lines[0]).toEqual({ chunk: { index: 0 } });
            expect(lines[1]).toEqual({ chunk: { index: 1 } });
            expect(lines[2]).toEqual({ chunk: { index: 2 } });
            expect(lines[3]).toEqual({ done: true });
        });

        it('should handle streaming errors mid-stream', async () => {
            const stream = makeJayStream('test.errorStream').withHandler(
                async function* () {
                    yield 'ok';
                    throw new Error('mid-stream failure');
                },
            );

            registry.registerStream(stream);

            const router = createActionRouter({ registry });
            const req = createMockRequest({
                method: 'POST',
                path: '/test.errorStream',
                body: {},
            });
            const res = createStreamMockResponse();

            await router(req as any, res as any, () => {});

            const lines = res.chunks.map((c: string) => JSON.parse(c.trim()));
            expect(lines[0]).toEqual({ chunk: 'ok' });
            expect(lines[1]).toEqual({ error: 'mid-stream failure' });
            expect(res.ended).toBe(true);
        });
    });
});
