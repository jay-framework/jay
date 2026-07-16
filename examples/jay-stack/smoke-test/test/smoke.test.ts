import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import * as fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_STARTUP_TIMEOUT = 60000;
const BUILD_TIMEOUT = 120000;
const REQUEST_TIMEOUT = 10000;
const HEALTH_POLL_INTERVAL = 500;

interface SmokeTestServer {
    url: string;
    process: ChildProcess;
    stop(): Promise<void>;
}

async function startDevServer(): Promise<SmokeTestServer> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Dev server did not start within ${SERVER_STARTUP_TIMEOUT}ms`));
        }, SERVER_STARTUP_TIMEOUT);

        let output = '';
        let detectedUrl = '';
        let pollingStarted = false;

        const proc = spawn('yarn', ['dev', '--test-mode'], {
            cwd: PROJECT_ROOT,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, FORCE_COLOR: '0' },
        });

        const stop = async () => {
            if (detectedUrl) {
                try {
                    await fetch(`${detectedUrl}/_jay/shutdown`, { method: 'POST' });
                    await new Promise((r) => setTimeout(r, 500));
                } catch {}
            }
            proc.kill('SIGTERM');
            await new Promise((r) => setTimeout(r, 500));
        };

        proc.stdout?.on('data', (data) => {
            const text = data.toString();
            output += text;

            const urlMatch = output.match(/Dev Server: (http:\/\/localhost:\d+)/);
            if (urlMatch) detectedUrl = urlMatch[1];

            if (
                !pollingStarted &&
                output.includes('Jay Stack dev server started successfully') &&
                detectedUrl
            ) {
                pollingStarted = true;
                pollHealth(
                    detectedUrl,
                    timeout,
                    (url) => resolve({ url, process: proc, stop }),
                    reject,
                );
            }
        });

        proc.stderr?.on('data', (data) => {
            output += data.toString();
        });

        proc.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Failed to start dev server: ${err.message}`));
        });

        proc.on('exit', (code) => {
            if (!detectedUrl && code !== 0) {
                clearTimeout(timeout);
                reject(new Error(`Dev server exited with code ${code}\n${output}`));
            }
        });
    });
}

async function runBuild(): Promise<void> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Build did not complete within ${BUILD_TIMEOUT}ms`));
        }, BUILD_TIMEOUT);

        let output = '';

        const proc = spawn('yarn', ['build'], {
            cwd: PROJECT_ROOT,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, FORCE_COLOR: '0' },
        });

        proc.stdout?.on('data', (data) => {
            output += data.toString();
        });

        proc.stderr?.on('data', (data) => {
            output += data.toString();
        });

        proc.on('exit', (code) => {
            clearTimeout(timeout);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Build failed with code ${code}\n${output}`));
            }
        });

        proc.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Build process error: ${err.message}`));
        });
    });
}

async function startStaticFileServer(dir: string, port: number): Promise<SmokeTestServer> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Static server did not start within 10000ms`));
        }, 10000);

        const url = `http://localhost:${port}`;
        const { createServer } = require('http') as typeof import('http');
        const fsSync = require('fs') as typeof import('fs');
        const pathMod = require('path') as typeof import('path');

        const MIME: Record<string, string> = {
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.woff2': 'font/woff2',
        };

        const srv = createServer((req, res) => {
            const reqUrl = new URL(req.url || '/', `http://localhost:${port}`);
            const filePath = pathMod.join(dir, reqUrl.pathname);
            const normalized = pathMod.resolve(filePath);
            if (!normalized.startsWith(pathMod.resolve(dir))) {
                res.writeHead(403);
                res.end();
                return;
            }
            try {
                const content = fsSync.readFileSync(normalized);
                const ext = pathMod.extname(normalized);
                res.writeHead(200, {
                    'Content-Type': MIME[ext] || 'application/octet-stream',
                    'Access-Control-Allow-Origin': '*',
                });
                res.end(content);
            } catch {
                res.writeHead(404);
                res.end('Not Found');
            }
        });

        srv.listen(port, () => {
            clearTimeout(timeout);
            resolve({
                url,
                process: null as any,
                stop: async () => {
                    srv.close();
                    await new Promise((r) => setTimeout(r, 200));
                },
            });
        });

        srv.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

async function startProductionServer(
    port: number,
    extraArgs: string[] = [],
): Promise<SmokeTestServer> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Production server did not start within ${SERVER_STARTUP_TIMEOUT}ms`));
        }, SERVER_STARTUP_TIMEOUT);

        let output = '';
        const url = `http://localhost:${port}`;
        let pollingStarted = false;

        const proc = spawn('yarn', ['serve', '--port', String(port), '--test-mode', ...extraArgs], {
            cwd: PROJECT_ROOT,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, FORCE_COLOR: '0' },
        });

        const stop = async () => {
            try {
                await fetch(`${url}/_jay/shutdown`, { method: 'POST' });
                await new Promise((r) => setTimeout(r, 500));
            } catch {}
            proc.kill('SIGTERM');
            await new Promise((r) => setTimeout(r, 500));
        };

        proc.stdout?.on('data', (data) => {
            const text = data.toString();
            output += text;

            if (!pollingStarted && output.includes('Production server listening on')) {
                pollingStarted = true;
                pollHealth(url, timeout, (u) => resolve({ url: u, process: proc, stop }), reject);
            }
        });

        proc.stderr?.on('data', (data) => {
            output += data.toString();
        });

        proc.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Failed to start production server: ${err.message}`));
        });

        proc.on('exit', (code) => {
            if (!output.includes('Production server listening on') && code !== 0) {
                clearTimeout(timeout);
                reject(new Error(`Production server exited with code ${code}\n${output}`));
            }
        });
    });
}

async function pollHealth(
    url: string,
    timeout: NodeJS.Timeout,
    resolve: (url: string) => void,
    reject: (err: Error) => void,
): Promise<void> {
    const startTime = Date.now();

    const poll = async () => {
        try {
            const response = await fetch(`${url}/_jay/health`);
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'ready') {
                    clearTimeout(timeout);
                    resolve(url);
                    return;
                }
            }
        } catch {}

        if (Date.now() - startTime > SERVER_STARTUP_TIMEOUT - 1000) {
            clearTimeout(timeout);
            reject(new Error('Health endpoint never became ready'));
            return;
        }

        setTimeout(poll, HEALTH_POLL_INTERVAL);
    };

    poll();
}

async function fetchPage(
    baseUrl: string,
    pagePath: string,
): Promise<{ status: number; body: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
        const response = await fetch(`${baseUrl}${pagePath}`, {
            signal: controller.signal,
        });
        const body = await response.text();
        return { status: response.status, body };
    } finally {
        clearTimeout(timeout);
    }
}

function expectPage(body: string) {
    expect(body).toMatch(/<!doctype html>/i);
    expect(body).not.toMatch(/client error/i);
    expect(body).not.toMatch(/server error/i);
}

// =========================================================================
// Tests
// =========================================================================

describe('Smoke Test', () => {
    describe('dev mode', () => {
        let server: SmokeTestServer;

        beforeAll(async () => {
            server = await startDevServer();
        }, SERVER_STARTUP_TIMEOUT + 5000);

        afterAll(async () => {
            await server?.stop();
        });

        it('health check responds', async () => {
            const response = await fetch(`${server.url}/_jay/health`);
            expect(response.ok).toBe(true);
            const data = await response.json();
            expect(data.status).toBe('ready');
        });

        it('/ — static page', async () => {
            const { status, body } = await fetchPage(server.url, '/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/Smoke Test Home/);
        });

        it('/ — head metadata from jay-html', async () => {
            const { body } = await fetchPage(server.url, '/');
            expect(body).toMatch(/<title>Smoke Test Home<\/title>/);
            expect(body).toMatch(
                /<meta name="description" content="Home page for the smoke test example"/,
            );
            expect(body).toMatch(/<link rel="canonical" href="\/"/);
        });

        it('/phases — three rendering phases', async () => {
            const { status, body } = await fetchPage(server.url, '/phases/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/Phases Test/);
            expect(body).toMatch(/rendered at request time/);
        });

        it('/phases — template title with binding wins over component title', async () => {
            const { body } = await fetchPage(server.url, '/phases/');
            expect(body).toMatch(/<title>Phases Test \| Smoke Test<\/title>/);
            expect(body).not.toMatch(/Phases Dynamic Title/);
            expect(body).toMatch(
                /<meta name="description" content="Static description for phases page"/,
            );
        });

        it('/headless — headless component', async () => {
            const { status, body } = await fetchPage(server.url, '/headless/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/Headless Test/);
            expect(body).toMatch(/Widget alpha/);
        });

        it('/headfull — headfull component with banner', async () => {
            const { status, body } = await fetchPage(server.url, '/headfull/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/Headfull Test/);
            expect(body).toMatch(/Hello from banner/);
        });

        it('/actions — page with server actions', async () => {
            const { status, body } = await fetchPage(server.url, '/actions/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/Actions Test/);
        });

        it('/actions — query endpoint responds', async () => {
            const response = await fetch(`${server.url}/_jay/actions/counter.getCount`);
            expect(response.ok).toBe(true);
            const json = await response.json();
            expect(json.success).toBe(true);
            expect(json.data).toHaveProperty('count');
        });

        it('/actions — mutation endpoint responds', async () => {
            const response = await fetch(`${server.url}/_jay/actions/counter.increment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            expect(response.ok).toBe(true);
            const json = await response.json();
            expect(json.success).toBe(true);
            expect(typeof json.data.count).toBe('number');
        });

        it('/dynamic/item-a — dynamic route instance A', async () => {
            const { status, body } = await fetchPage(server.url, '/dynamic/item-a/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/First Item/);
            expect(body).toMatch(/item-a/);
        });

        it('/dynamic/item-b — dynamic route instance B', async () => {
            const { status, body } = await fetchPage(server.url, '/dynamic/item-b/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/Second Item/);
            expect(body).toMatch(/item-b/);
        });

        it('/async-data — async data resolution', async () => {
            const { status, body } = await fetchPage(server.url, '/async-data/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/Async Data Test/);
        });

        it('/public-assets — references public folder', async () => {
            const { status, body } = await fetchPage(server.url, '/public-assets/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/\/images\/test-image\.png/);
        });

        it('/public-assets — image file served', async () => {
            const response = await fetch(`${server.url}/images/test-image.png`);
            expect(response.ok).toBe(true);
        });

        it('/public-assets — json file served', async () => {
            const response = await fetch(`${server.url}/data/test.json`);
            expect(response.ok).toBe(true);
            const data = await response.json();
            expect(data.message).toBe('smoke test data');
        });

        it('/foreach — forEach rendering', async () => {
            const { status, body } = await fetchPage(server.url, '/foreach/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/Slow Item 1/);
            expect(body).toMatch(/Slow Item 2/);
            expect(body).toMatch(/Fast Item 1/);
            expect(body).toMatch(/Fast Item 2/);
            expect(body).toMatch(/Fast Item 3/);
        });

        it('/nested — nested headfull component', async () => {
            const { status, body } = await fetchPage(server.url, '/nested/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/Nested Test/);
            expect(body).toMatch(/Block A/);
            expect(body).toMatch(/Block B/);
        });

        it('/html-string — string is escaped, html-string is not', async () => {
            const { status, body } = await fetchPage(server.url, '/html-string/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/&lt;b&gt;This should be escaped&lt;\/b&gt;/);
            expect(body).toMatch(/<b>This should be bold<\/b> and <em>italic<\/em>/);
        });

        it('/headless-props — keyed headless component with YAML body props', async () => {
            const { status, body } = await fetchPage(server.url, '/headless-props/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/Headless Props Test/);
            expect(body).toMatch(/Widget from-props/);
        });

        it('/markdown/hello — markdown-pages component renders .md file', async () => {
            const { status, body } = await fetchPage(server.url, '/markdown/hello/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/Hello from Markdown/);
            expect(body).toMatch(/test post/);
            expect(body).toMatch(/md-code/);
        });

        it('/markdown-live — markdown-live component renders markdown at request time', async () => {
            const { status, body } = await fetchPage(server.url, '/markdown-live/');
            expect(status).toBe(200);
            expectPage(body);
            expect(body).toMatch(/Markdown Live Test/);
            expect(body).toMatch(/dynamically rendered/);
        });
    });

    describe('production self-hosted', () => {
        let server: SmokeTestServer;

        beforeAll(
            async () => {
                await runBuild();
                server = await startProductionServer(4000);
            },
            BUILD_TIMEOUT + SERVER_STARTUP_TIMEOUT + 5000,
        );

        afterAll(async () => {
            await server?.stop();
        });

        it('/ — static page', async () => {
            const { status, body } = await fetchPage(server.url, '/');
            expect(status).toBe(200);
            expect(body).toMatch(/Smoke Test Home/);
        });

        it('/ — head metadata from jay-html', async () => {
            const { body } = await fetchPage(server.url, '/');
            expect(body).toMatch(/<title>Smoke Test Home<\/title>/);
            expect(body).toMatch(
                /<meta name="description" content="Home page for the smoke test example"/,
            );
            expect(body).toMatch(/<link rel="canonical" href="\/"/);
        });

        it('/phases — three rendering phases', async () => {
            const { status, body } = await fetchPage(server.url, '/phases/');
            expect(status).toBe(200);
            expect(body).toMatch(/Phases Test/);
            expect(body).toMatch(/rendered at request time/);
        });

        it('/phases — template title with binding wins over component title', async () => {
            const { body } = await fetchPage(server.url, '/phases/');
            expect(body).toMatch(/<title>Phases Test \| Smoke Test<\/title>/);
            expect(body).not.toMatch(/Phases Dynamic Title/);
            expect(body).toMatch(
                /<meta name="description" content="Static description for phases page"/,
            );
        });

        it('/headless — headless component', async () => {
            const { status, body } = await fetchPage(server.url, '/headless/');
            expect(status).toBe(200);
            expect(body).toMatch(/Widget alpha/);
        });

        it('/headfull — headfull component with banner', async () => {
            const { status, body } = await fetchPage(server.url, '/headfull/');
            expect(status).toBe(200);
            expect(body).toMatch(/Headfull Test/);
            expect(body).toMatch(/Hello from banner/);
        });

        it('/actions — page renders', async () => {
            const { status, body } = await fetchPage(server.url, '/actions/');
            expect(status).toBe(200);
            expect(body).toMatch(/Actions Test/);
        });

        it('/actions — query endpoint responds', async () => {
            const response = await fetch(`${server.url}/_jay/actions/counter.getCount`);
            expect(response.ok).toBe(true);
            const json = await response.json();
            expect(json.success).toBe(true);
            expect(json.data).toHaveProperty('count');
        });

        it('/actions — mutation endpoint responds', async () => {
            const response = await fetch(`${server.url}/_jay/actions/counter.increment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            expect(response.ok).toBe(true);
            const json = await response.json();
            expect(typeof json.data.count).toBe('number');
        });

        it('/dynamic/item-a — dynamic route instance A', async () => {
            const { status, body } = await fetchPage(server.url, '/dynamic/item-a/');
            expect(status).toBe(200);
            expect(body).toMatch(/First Item/);
        });

        it('/dynamic/item-b — dynamic route instance B', async () => {
            const { status, body } = await fetchPage(server.url, '/dynamic/item-b/');
            expect(status).toBe(200);
            expect(body).toMatch(/Second Item/);
        });

        it('/async-data — async data', async () => {
            const { status, body } = await fetchPage(server.url, '/async-data/');
            expect(status).toBe(200);
            expect(body).toMatch(/Async Data Test/);
        });

        it('/foreach — forEach rendering', async () => {
            const { status, body } = await fetchPage(server.url, '/foreach/');
            expect(status).toBe(200);
            expect(body).toMatch(/Slow Item 1/);
            expect(body).toMatch(/Slow Item 2/);
            expect(body).toMatch(/Fast Item 1/);
        });

        it('/nested — nested headfull component', async () => {
            const { status, body } = await fetchPage(server.url, '/nested/');
            expect(status).toBe(200);
            expect(body).toMatch(/Nested Test/);
            expect(body).toMatch(/Block A/);
            expect(body).toMatch(/Block B/);
        });

        it('/html-string — string is escaped, html-string is not', async () => {
            const { status, body } = await fetchPage(server.url, '/html-string/');
            expect(status).toBe(200);
            expect(body).toMatch(/&lt;b&gt;This should be escaped&lt;\/b&gt;/);
            expect(body).toMatch(/<b>This should be bold<\/b> and <em>italic<\/em>/);
        });

        it('/headless-props — keyed headless component with YAML body props', async () => {
            const { status, body } = await fetchPage(server.url, '/headless-props/');
            expect(status).toBe(200);
            expect(body).toMatch(/Widget from-props/);
        });

        it('/markdown-live — markdown-live component', async () => {
            const { status, body } = await fetchPage(server.url, '/markdown-live/');
            expect(status).toBe(200);
            expect(body).toMatch(/Live Markdown/);
            expect(body).toMatch(/dynamically rendered/);
        });

        it('/markdown/hello — markdown-pages component in production', async () => {
            const { status, body } = await fetchPage(server.url, '/markdown/hello/');
            expect(status).toBe(200);
            expect(body).toMatch(/Hello from Markdown/);
        });
    });

    describe('production CDN mode', () => {
        let server: SmokeTestServer;
        let cdnServer: SmokeTestServer;
        const CDN_PORT = 4001;
        const CDN_BASE = `http://localhost:${CDN_PORT}/`;

        beforeAll(async () => {
            const pkg = JSON.parse(
                fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'),
            );
            const buildDir = path.join(PROJECT_ROOT, `build/v${pkg.version}/frontend`);
            cdnServer = await startStaticFileServer(buildDir, CDN_PORT);
            server = await startProductionServer(4002, [
                '--static-base-url',
                CDN_BASE,
                '--no-serve-static',
            ]);
        }, SERVER_STARTUP_TIMEOUT + 5000);

        afterAll(async () => {
            await server?.stop();
            await cdnServer?.stop();
        });

        it('/ — static page renders', async () => {
            const { status, body } = await fetchPage(server.url, '/');
            expect(status).toBe(200);
            expect(body).toMatch(/Smoke Test Home/);
        });

        it('import map URLs point to CDN', async () => {
            const { body } = await fetchPage(server.url, '/');
            expect(body).toMatch(new RegExp(`${CDN_BASE}shared/`));
        });

        it('/phases — CSS link points to CDN', async () => {
            const { body } = await fetchPage(server.url, '/phases/');
            expect(body).toMatch(/Phases Test/);
            const cssMatch = body.match(/href="([^"]*\.css)"/);
            if (cssMatch) {
                expect(cssMatch[1]).toMatch(new RegExp(`^${CDN_BASE}`));
            }
        });

        it('/phases — client bundle points to CDN', async () => {
            const { body } = await fetchPage(server.url, '/phases/');
            const scriptMatch = body.match(/from '([^']*pages\/[^']*)'/);
            expect(scriptMatch).toBeTruthy();
            expect(scriptMatch![1]).toMatch(new RegExp(`^${CDN_BASE}`));
        });

        it('CDN serves shared chunks', async () => {
            const { body } = await fetchPage(server.url, '/');
            const importMapMatch = body.match(/"importmap">(.*?)<\/script>/s);
            expect(importMapMatch).toBeTruthy();
            const importMap = JSON.parse(importMapMatch![1]);
            const runtimeUrl = importMap.imports['@jay-framework/runtime'];
            expect(runtimeUrl).toMatch(new RegExp(`^${CDN_BASE}`));
            const cdnResponse = await fetch(runtimeUrl);
            expect(cdnResponse.ok).toBe(true);
        });

        it('CDN serves client bundles', async () => {
            const { body } = await fetchPage(server.url, '/phases/');
            const scriptMatch = body.match(/from '([^']*pages\/[^']*)'/);
            if (scriptMatch) {
                const cdnResponse = await fetch(scriptMatch[1]);
                expect(cdnResponse.ok).toBe(true);
            }
        });

        it('/headless — renders correctly', async () => {
            const { status, body } = await fetchPage(server.url, '/headless/');
            expect(status).toBe(200);
            expect(body).toMatch(/Widget alpha/);
        });

        it('/headfull — renders correctly', async () => {
            const { status, body } = await fetchPage(server.url, '/headfull/');
            expect(status).toBe(200);
            expect(body).toMatch(/Hello from banner/);
        });

        it('/actions — endpoints work', async () => {
            const response = await fetch(`${server.url}/_jay/actions/counter.getCount`);
            expect(response.ok).toBe(true);
        });

        it('/dynamic/item-a — renders correctly', async () => {
            const { status, body } = await fetchPage(server.url, '/dynamic/item-a/');
            expect(status).toBe(200);
            expect(body).toMatch(/First Item/);
        });

        it('server returns 404 for static files (not serving)', async () => {
            const response = await fetch(`${server.url}/shared/nonexistent.js`);
            expect(response.status).toBe(404);
        });
    });
});
