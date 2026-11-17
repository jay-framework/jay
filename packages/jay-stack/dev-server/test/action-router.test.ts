import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    createActionRouter,
    actionBodyParser,
    getStatusCodeForError,
    ACTION_ENDPOINT_BASE,
    type ActionBodyParserOptions,
} from '../lib/action-router';
import { EventEmitter } from 'events';
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

        it('should accept uploads larger than 10MB', async () => {
            let receivedInput: any = null;

            const action = makeJayAction('test.largeUpload')
                .withFiles()
                .withHandler(async (input: { file: JayFile }) => {
                    receivedInput = input;
                    return { size: input.file.size };
                });

            registry.register(action);
            const url = await startServer(registry);

            const boundary = '----TestBoundary' + Date.now();
            const fileContent = 'x'.repeat(11 * 1024 * 1024);

            const body = [
                `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="_json"\r\n\r\n` +
                    `{}\r\n`,
                `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="file"; filename="large.bin"\r\n` +
                    `Content-Type: application/octet-stream\r\n\r\n` +
                    `${fileContent}\r\n`,
                `--${boundary}--\r\n`,
            ].join('');

            const response = await fetch(`${url}${ACTION_ENDPOINT_BASE}/test.largeUpload`, {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                },
                body,
            });

            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.size).toBe(fileContent.length);
            expect(receivedInput.file.name).toBe('large.bin');
        });

        it('should accept more than 10 files', async () => {
            let receivedInput: any = null;

            const action = makeJayAction('test.manyFiles')
                .withFiles()
                .withHandler(async (input: { files: JayFile[] }) => {
                    receivedInput = input;
                    return { count: input.files.length };
                });

            registry.register(action);
            const url = await startServer(registry);

            const boundary = '----TestBoundary' + Date.now();
            const fileCount = 11;
            const parts = [
                `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="_json"\r\n\r\n` +
                    `{}\r\n`,
            ];

            for (let i = 0; i < fileCount; i++) {
                parts.push(
                    `--${boundary}\r\n` +
                        `Content-Disposition: form-data; name="files"; filename="file-${i}.txt"\r\n` +
                        `Content-Type: text/plain\r\n\r\n` +
                        `content-${i}\r\n`,
                );
            }
            parts.push(`--${boundary}--\r\n`);

            const response = await fetch(`${url}${ACTION_ENDPOINT_BASE}/test.manyFiles`, {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                },
                body: parts.join(''),
            });

            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.count).toBe(fileCount);
            expect(receivedInput.files).toHaveLength(fileCount);
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

// ============================================================================
// Request cookies for server actions (DL#230)
// ============================================================================

/** A real http server running actionBodyParser + createActionRouter, as the dev server mounts them. */
function startActionServer(
    parserOptions: ActionBodyParserOptions,
): Promise<{ server: http.Server; base: string }> {
    const bodyParser = actionBodyParser(parserOptions);
    const router = createActionRouter({ registry: parserOptions.registry });
    const server = http.createServer((req, res) => {
        const expressReq = req as any;
        expressReq.path = req.url!;
        expressReq.query = {};
        expressReq.protocol = 'http';
        const expressRes = res as any;
        expressRes.status = (code: number) => {
            res.statusCode = code;
            return expressRes;
        };
        expressRes.json = (data: any) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
        };
        expressRes.set = (key: string, value: string) => {
            res.setHeader(key, value);
            return expressRes;
        };
        expressRes.append = (key: string, value: string) => {
            res.appendHeader(key, value);
            return expressRes;
        };
        bodyParser(expressReq, expressRes, () => {
            expressReq.path = expressReq.path.slice(ACTION_ENDPOINT_BASE.length);
            router(expressReq, expressRes, () => {});
        });
    });
    return new Promise((resolve) => {
        server.listen(0, () => {
            const address = server.address() as any;
            resolve({ server, base: `http://127.0.0.1:${address.port}${ACTION_ENDPOINT_BASE}` });
        });
    });
}

describe('Action Router withRequest (DL#230)', () => {
    let server: http.Server | undefined;
    let buildFolder: string;

    beforeEach(() => {
        buildFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'jay-dl230-'));
    });

    afterEach(async () => {
        if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = undefined;
        fs.rmSync(buildFolder, { recursive: true, force: true });
    });

    async function startServer(registry: ActionRegistry): Promise<string> {
        const started = await startActionServer({ buildFolder, registry });
        server = started.server;
        return started.base;
    }

    function registerCookieActions(registry: ActionRegistry) {
        const calls: string[] = [];
        registry.register(
            makeJayAction('dl230.echo')
                .withRequest()
                .withHandler(async (input: {}, request) => {
                    calls.push('echo');
                    return request.cookies.s;
                }),
        );
        registry.register(
            makeJayAction('dl230.login')
                .withRequest()
                .withHandler(async (input: {}, request) => {
                    calls.push('login');
                    request.setCookie('sid', 'abc');
                    request.setCookie('csrf', 'xyz', { httpOnly: false });
                    return 'ok';
                }),
        );
        registry.registerStream(
            makeJayStream('dl230.stream')
                .withRequest()
                .withFiles()
                .withHandler(async function* (input: {}, request) {
                    calls.push('stream');
                    yield request.cookies.s;
                }),
        );
        return calls;
    }

    const crossSite = { 'sec-fetch-site': 'cross-site' };
    const crossOriginBody = {
        success: false,
        error: {
            code: 'CROSS_ORIGIN_REQUEST',
            message: "Action 'dl230.login' rejected a cross-origin request",
            isActionError: false,
        },
    };

    it('passes request cookies and sends private, no-store', async () => {
        const registry = new ActionRegistry();
        registerCookieActions(registry);
        const base = await startServer(registry);

        const response = await fetch(`${base}/dl230.echo`, {
            method: 'POST',
            headers: { cookie: 's=abc' },
            body: '{}',
        });

        expect(await response.json()).toEqual({ success: true, data: 'abc' });
        expect(response.headers.get('cache-control')).toEqual('private, no-store');
    });

    it('rejects a cross-site POST with 403 and never runs the cookie-setting handler', async () => {
        const registry = new ActionRegistry();
        const calls = registerCookieActions(registry);
        const base = await startServer(registry);

        const response = await fetch(`${base}/dl230.login`, {
            method: 'POST',
            headers: crossSite,
            body: '{}',
        });

        expect(response.status).toEqual(403);
        expect(await response.json()).toEqual(crossOriginBody);
        expect(response.headers.getSetCookie()).toEqual([]);
        expect(calls).toEqual([]);
    });

    it('passes cookies to a streaming action and sends private, no-store', async () => {
        const registry = new ActionRegistry();
        registerCookieActions(registry);
        const base = await startServer(registry);

        const response = await fetch(`${base}/dl230.stream`, {
            method: 'POST',
            headers: { cookie: 's=abc' },
            body: '{}',
        });

        expect(await response.text()).toEqual('{"chunk":"abc"}\n{"done":true}\n');
        expect(response.headers.get('cache-control')).toEqual('private, no-store');
    });

    it('emits one Set-Cookie header per cookie', async () => {
        const registry = new ActionRegistry();
        registerCookieActions(registry);
        const base = await startServer(registry);

        const response = await fetch(`${base}/dl230.login`, { method: 'POST', body: '{}' });

        expect(response.headers.getSetCookie()).toEqual([
            'sid=abc; Path=/; HttpOnly; SameSite=Lax',
            'csrf=xyz; Path=/; SameSite=Lax',
        ]);
        expect(response.headers.get('cache-control')).toEqual('private, no-store');
    });

    it('does not parse a cross-origin multipart body for a withRequest action', async () => {
        const registry = new ActionRegistry();
        const calls = registerCookieActions(registry);
        const base = await startServer(registry);
        const boundary = '----DL230Boundary';
        const body =
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="a.txt"\r\n` +
            `Content-Type: text/plain\r\n\r\nhello\r\n` +
            `--${boundary}--\r\n`;

        const response = await fetch(`${base}/dl230.stream`, {
            method: 'POST',
            headers: {
                ...crossSite,
                'content-type': `multipart/form-data; boundary=${boundary}`,
            },
            body,
        });

        expect(response.status).toEqual(403);
        expect((await response.json()).error.code).toEqual('CROSS_ORIGIN_REQUEST');
        expect(fs.existsSync(path.join(buildFolder, '.tmp'))).toEqual(false);
        expect(calls).toEqual([]);
    });
});

/** A JSON body of exactly `byteLength` UTF-8 bytes, padded with `pad` (1 or 2 bytes per char). */
function jsonBodyOfBytes(byteLength: number, pad = 'a'): string {
    const envelopeBytes = '{"v":""}'.length;
    const padBytes = Buffer.byteLength(pad);
    const count = (byteLength - envelopeBytes) / padBytes;
    if (!Number.isInteger(count))
        throw new Error(`cannot pad to ${byteLength} bytes with '${pad}'`);
    return JSON.stringify({ v: pad.repeat(count) });
}

/** A request body with no Content-Length — sent with Transfer-Encoding: chunked. */
function chunkedBody(body: string): RequestInit {
    const bytes = Buffer.from(body);
    const chunkSize = Math.max(7, Math.ceil(bytes.length / 16));
    const stream = new ReadableStream({
        start(controller) {
            for (let i = 0; i < bytes.length; i += chunkSize)
                controller.enqueue(new Uint8Array(bytes.subarray(i, i + chunkSize)));
            controller.close();
        },
    });
    return { method: 'POST', body: stream, duplex: 'half' } as RequestInit;
}

describe('Action Router hardening (DL#234)', () => {
    let server: http.Server | undefined;
    let buildFolder: string;

    beforeEach(() => {
        buildFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'jay-dl234-'));
    });

    afterEach(async () => {
        if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = undefined;
        fs.rmSync(buildFolder, { recursive: true, force: true });
    });

    async function start(registry: ActionRegistry, actionBodyLimitBytes?: number) {
        const started = await startActionServer({ buildFolder, registry, actionBodyLimitBytes });
        server = started.server;
        return started.base;
    }

    function echoAction(registry: ActionRegistry) {
        const calls: unknown[] = [];
        registry.register(
            makeJayAction('dl234.echo').withHandler(async (input: { v?: string }) => {
                calls.push(input);
                return input.v?.length ?? 0;
            }),
        );
        return calls;
    }

    const tooLarge = (limitBytes: number) => ({
        success: false,
        error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `Action request body exceeds ${limitBytes} bytes`,
            isActionError: false,
        },
    });

    describe('body size cap', () => {
        it('should return 413 when Content-Length exceeds the limit', async () => {
            const registry = new ActionRegistry();
            const calls = echoAction(registry);
            const base = await start(registry, 32);

            const response = await fetch(`${base}/dl234.echo`, {
                method: 'POST',
                body: jsonBodyOfBytes(40),
            });

            expect(response.status).toEqual(413);
            expect(await response.json()).toEqual(tooLarge(32));
            expect(calls).toEqual([]);
        });

        it('should return 413 when a chunked body exceeds the limit without Content-Length', async () => {
            const registry = new ActionRegistry();
            const calls = echoAction(registry);
            const base = await start(registry, 32);

            const response = await fetch(`${base}/dl234.echo`, chunkedBody(jsonBodyOfBytes(40)));

            expect(response.status).toEqual(413);
            expect(await response.json()).toEqual(tooLarge(32));
            expect(calls).toEqual([]);
        });

        it('should accept a body exactly at the limit', async () => {
            const registry = new ActionRegistry();
            echoAction(registry);
            const base = await start(registry, 32);

            const response = await fetch(`${base}/dl234.echo`, chunkedBody(jsonBodyOfBytes(32)));

            expect(await response.json()).toEqual({ success: true, data: 24 });
        });

        it('should accept a multi-byte body exactly at the limit in bytes and reject it one byte over', async () => {
            const registry = new ActionRegistry();
            echoAction(registry);
            const base = await start(registry, 32);
            const atLimit = jsonBodyOfBytes(32, 'é');
            const overLimit = atLimit.replace('{"v"', '{"vv"');

            const accepted = await fetch(`${base}/dl234.echo`, chunkedBody(atLimit));
            const rejected = await fetch(`${base}/dl234.echo`, chunkedBody(overLimit));

            expect(await accepted.json()).toEqual({ success: true, data: 12 });
            expect(rejected.status).toEqual(413);
        });

        it('should enforce the 1 MiB default limit', async () => {
            const registry = new ActionRegistry();
            echoAction(registry);
            const base = await start(registry);

            const atDefault = await fetch(
                `${base}/dl234.echo`,
                chunkedBody(jsonBodyOfBytes(1_048_576)),
            );
            const overDefault = await fetch(
                `${base}/dl234.echo`,
                chunkedBody(jsonBodyOfBytes(1_048_578)),
            );

            expect(atDefault.status).toEqual(200);
            expect(overDefault.status).toEqual(413);
            expect(await overDefault.json()).toEqual(tooLarge(1_048_576));
        });

        it('should honour a configured actionBodyLimitBytes', async () => {
            const registry = new ActionRegistry();
            echoAction(registry);
            const base = await start(registry, 5 * 1_048_576);

            const response = await fetch(
                `${base}/dl234.echo`,
                chunkedBody(jsonBodyOfBytes(2 * 1_048_576)),
            );

            expect(response.status).toEqual(200);
        });

        it('should not parse or call next after a 413, and should close the request', () => {
            const registry = new ActionRegistry();
            echoAction(registry);
            const parser = actionBodyParser({ buildFolder, registry, actionBodyLimitBytes: 8 });
            const req: any = Object.assign(new EventEmitter(), {
                method: 'POST',
                path: `${ACTION_ENDPOINT_BASE}/dl234.echo`,
                headers: {},
                destroyed: false,
                destroy() {
                    this.destroyed = true;
                },
                resume() {
                    throw new Error('must not drain the rest of an oversized body');
                },
            });
            const sent: unknown[] = [];
            const res: any = Object.assign(new EventEmitter(), {
                statusCode: 200,
                headers: {} as Record<string, string>,
                status(code: number) {
                    this.statusCode = code;
                    return this;
                },
                set(key: string, value: string) {
                    this.headers[key] = value;
                    return this;
                },
                json(data: unknown) {
                    sent.push(data);
                    this.emit('finish');
                    return this;
                },
            });
            let nextCalls = 0;

            parser(req, res, () => nextCalls++);
            req.emit('data', Buffer.from('{"v":"aaaaa'));
            req.emit('data', Buffer.from('aaaa"}'));
            req.emit('end');

            expect(res.statusCode).toEqual(413);
            expect(sent).toEqual([tooLarge(8)]);
            expect(nextCalls).toEqual(0);
            expect(req.destroyed).toEqual(true);
            expect(req.body).toBeUndefined();
        });
    });

    describe('errors', () => {
        it('should keep the original message in dev', async () => {
            const registry = new ActionRegistry();
            registry.register(
                makeJayAction('dl234.fail').withHandler(async () => {
                    throw new Error('secret https://internal.example/x');
                }),
            );
            const base = await start(registry);

            const response = await fetch(`${base}/dl234.fail`, { method: 'POST', body: '{}' });
            const body = await response.json();

            expect(response.status).toEqual(500);
            expect(Object.keys(body)).toEqual(['success', 'error']);
            expect(body).toEqual({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'secret https://internal.example/x',
                    isActionError: false,
                },
            });
        });

        it('should map PAYLOAD_TOO_LARGE to 413', () => {
            expect(getStatusCodeForError('PAYLOAD_TOO_LARGE', false)).toEqual(413);
        });
    });

    describe('GET withRequest', () => {
        function cookieQuery(registry: ActionRegistry) {
            const calls: string[] = [];
            registry.register(
                makeJayQuery('dl234.cart')
                    .withRequest()
                    .withHandler(async (input: {}, request) => {
                        calls.push('cart');
                        return request.cookies.s ?? null;
                    }),
            );
            return calls;
        }

        it('should reject a GET withRequest action on a cross-site navigation', async () => {
            const registry = new ActionRegistry();
            const calls = cookieQuery(registry);
            const base = await start(registry);

            const response = await fetch(`${base}/dl234.cart`, {
                headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' },
            });

            expect(response.status).toEqual(403);
            expect((await response.json()).error.code).toEqual('CROSS_ORIGIN_REQUEST');
            expect(calls).toEqual([]);
        });

        it('should allow a GET withRequest action from same-origin', async () => {
            const registry = new ActionRegistry();
            cookieQuery(registry);
            const base = await start(registry);

            const response = await fetch(`${base}/dl234.cart`, {
                headers: { 'sec-fetch-site': 'same-origin', cookie: 's=abc' },
            });

            expect(await response.json()).toEqual({ success: true, data: 'abc' });
        });

        it('should allow a GET withRequest action from a client without Sec-Fetch-Site/Origin', async () => {
            const registry = new ActionRegistry();
            cookieQuery(registry);
            const base = await start(registry);

            const response = await fetch(`${base}/dl234.cart`);

            expect(response.status).toEqual(200);
        });

        it('should still allow a GET action without withRequest cross-origin', async () => {
            const registry = new ActionRegistry();
            registry.register(makeJayQuery('dl234.plain').withHandler(async (input: {}) => 'ok'));
            const base = await start(registry);

            const response = await fetch(`${base}/dl234.plain`, {
                headers: { 'sec-fetch-site': 'cross-site' },
            });

            expect(response.status).toEqual(200);
        });

        /** Bug: a malformed Cookie header throws URIError (DL#234 Problem #3). */
        it('should not throw on a malformed cookie', async () => {
            const registry = new ActionRegistry();
            cookieQuery(registry);
            const base = await start(registry);

            const response = await fetch(`${base}/dl234.cart`, {
                headers: { cookie: 's=%E0%A4%A' },
            });

            expect(await response.json()).toEqual({ success: true, data: '%E0%A4%A' });
        });
    });
});
