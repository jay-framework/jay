import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createActionRouter, actionBodyParser, ACTION_ENDPOINT_BASE } from '../lib/action-router';
import {
    ActionRegistry,
    registerService,
    clearServiceRegistry,
} from '@jay-framework/stack-server-runtime';
import {
    makeJayAction,
    makeJayQuery,
    ActionError,
    createJayService,
    makeJayStream,
    type JayFile,
} from '@jay-framework/fullstack-component';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

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
            const stream = makeJayStream('test.stream').withHandler(async function* (input: {
                count: number;
            }) {
                for (let i = 0; i < input.count; i++) {
                    yield { index: i };
                }
            });

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
            const stream = makeJayStream('test.errorStream').withHandler(async function* () {
                yield 'ok';
                throw new Error('mid-stream failure');
            });

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

    // --- File Upload (DL#131) ---

    describe('file upload (DL#131)', () => {
        let server: http.Server;
        let buildFolder: string;
        let serverUrl: string;

        beforeEach(async () => {
            buildFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'jay-test-'));
        });

        afterEach(async () => {
            if (server) {
                await new Promise<void>((resolve) => server.close(() => resolve()));
            }
            fs.rmSync(buildFolder, { recursive: true, force: true });
        });

        /**
         * Start a minimal HTTP server with the action body parser + router.
         */
        function startServer(reg: ActionRegistry): Promise<string> {
            const bodyParser = actionBodyParser({ buildFolder, registry: reg });
            const router = createActionRouter({ registry: reg });

            server = http.createServer((req, res) => {
                // Simulate Express-like req/res
                const expressReq = req as any;
                expressReq.path = req.url!;
                expressReq.query = {};

                const expressRes = res as any;
                expressRes.status = (code: number) => {
                    res.statusCode = code;
                    return expressRes;
                };
                expressRes.json = (data: any) => {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                };
                expressRes.set = (k: string, v: string) => {
                    res.setHeader(k, v);
                    return expressRes;
                };

                // Run body parser, then router
                bodyParser(expressReq, expressRes, () => {
                    // Strip the base path for the router (it's mounted at ACTION_ENDPOINT_BASE)
                    expressReq.path = expressReq.path.slice(ACTION_ENDPOINT_BASE.length);
                    router(expressReq, expressRes, () => {});
                });
            });

            return new Promise((resolve) => {
                server.listen(0, () => {
                    const addr = server.address() as any;
                    serverUrl = `http://127.0.0.1:${addr.port}`;
                    resolve(serverUrl);
                });
            });
        }

        it('should receive JayFile objects for uploaded files', async () => {
            let receivedInput: any = null;

            const action = makeJayAction('test.upload')
                .withFiles()
                .withHandler(async (input: { notes: string; screenshot: JayFile }) => {
                    receivedInput = input;
                    // Verify the temp file exists and has content
                    const content = fs.readFileSync(input.screenshot.path!, 'utf-8');
                    return { content, notes: input.notes };
                });

            registry.register(action);
            const url = await startServer(registry);

            // Build multipart request
            const boundary = '----TestBoundary' + Date.now();
            const fileContent = 'fake PNG data for testing';

            const parts = [
                `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="_json"\r\n\r\n` +
                    `{"notes":"Fix the header"}\r\n`,
                `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="screenshot"; filename="capture.png"\r\n` +
                    `Content-Type: image/png\r\n\r\n` +
                    `${fileContent}\r\n`,
                `--${boundary}--\r\n`,
            ];

            const body = parts.join('');

            const response = await fetch(`${url}${ACTION_ENDPOINT_BASE}/test.upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                },
                body,
            });

            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.notes).toBe('Fix the header');
            expect(data.data.content).toBe(fileContent);

            // Verify handler received JayFile
            expect(receivedInput.screenshot.name).toBe('capture.png');
            expect(receivedInput.screenshot.type).toBe('image/png');
            expect(receivedInput.screenshot.size).toBe(fileContent.length);

            // Verify temp files are cleaned up
            expect(fs.existsSync(receivedInput.screenshot.path!)).toBe(false);
        });

        it('should merge dotted multipart keys into nested JayFile records (extraFiles)', async () => {
            let receivedInput: any = null;

            const action = makeJayAction('test.uploadNested')
                .withFiles()
                .withHandler(
                    async (input: { notes: string; extraFiles: Record<string, JayFile> }) => {
                        receivedInput = input;
                        const clip = input.extraFiles['attachment_1_0']!;
                        const content = fs.readFileSync(clip.path!, 'utf-8');
                        return { content, notes: input.notes };
                    },
                );

            registry.register(action);
            const url = await startServer(registry);

            const boundary = '----TestBoundaryNested' + Date.now();
            const clipContent = 'clipboard image bytes';

            const parts = [
                `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="_json"\r\n\r\n` +
                    `{"notes":"Use attached ref"}\r\n`,
                `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="extraFiles.attachment_1_0"; filename="image.png"\r\n` +
                    `Content-Type: image/png\r\n\r\n` +
                    `${clipContent}\r\n`,
                `--${boundary}--\r\n`,
            ];

            const body = parts.join('');

            const response = await fetch(`${url}${ACTION_ENDPOINT_BASE}/test.uploadNested`, {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                },
                body,
            });

            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.content).toBe(clipContent);
            expect(receivedInput.extraFiles['attachment_1_0']!.name).toBe('image.png');
            expect(fs.existsSync(receivedInput.extraFiles['attachment_1_0']!.path!)).toBe(false);
        });

        it('should reject multipart for actions without withFiles', async () => {
            const action = makeJayAction('test.nofiles').withHandler(
                async (input: { text: string }) => ({
                    ok: true,
                }),
            );

            registry.register(action);
            const url = await startServer(registry);

            const boundary = '----TestBoundary' + Date.now();
            const body =
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="_json"\r\n\r\n` +
                `{"text":"hello"}\r\n` +
                `--${boundary}--\r\n`;

            const response = await fetch(`${url}${ACTION_ENDPOINT_BASE}/test.nofiles`, {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                },
                body,
            });

            const data = await response.json();
            expect(response.status).toBe(400);
            expect(data.error.code).toBe('FILES_NOT_ACCEPTED');
        });

        it('should still handle JSON requests for withFiles actions', async () => {
            const action = makeJayAction('test.flexible')
                .withFiles()
                .withHandler(async (input: { notes: string }) => ({
                    notes: input.notes,
                }));

            registry.register(action);
            const url = await startServer(registry);

            const response = await fetch(`${url}${ACTION_ENDPOINT_BASE}/test.flexible`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: 'just text' }),
            });

            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.data.notes).toBe('just text');
        });

        it('should handle streaming action with file upload', async () => {
            const stream = makeJayStream('test.streamUpload')
                .withFiles()
                .withHandler(async function* (input: { label: string; file: JayFile }) {
                    const content = fs.readFileSync(input.file.path!, 'utf-8');
                    yield { step: 'received', filename: input.file.name };
                    yield { step: 'processed', content };
                });

            registry.registerStream(stream);
            const url = await startServer(registry);

            const boundary = '----TestBoundary' + Date.now();
            const fileContent = 'stream test data';
            const body = [
                `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="_json"\r\n\r\n` +
                    `{"label":"test"}\r\n`,
                `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="file"; filename="data.txt"\r\n` +
                    `Content-Type: text/plain\r\n\r\n` +
                    `${fileContent}\r\n`,
                `--${boundary}--\r\n`,
            ].join('');

            const response = await fetch(`${url}${ACTION_ENDPOINT_BASE}/test.streamUpload`, {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                },
                body,
            });

            const text = await response.text();
            const lines = text
                .trim()
                .split('\n')
                .map((l) => JSON.parse(l));

            expect(lines[0]).toEqual({ chunk: { step: 'received', filename: 'data.txt' } });
            expect(lines[1]).toEqual({ chunk: { step: 'processed', content: fileContent } });
            expect(lines[2]).toEqual({ done: true });
        });
    });
});
