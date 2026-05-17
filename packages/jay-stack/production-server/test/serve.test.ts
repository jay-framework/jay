import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildVersion } from '../lib/builder/build-pipeline';
import { startMainServer } from '../lib/serve/main-server';
import { setDevLogger, createDevLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';

const fixtureRoot = path.resolve(__dirname, 'fixtures/basic-project');
const buildRoot = path.join(fixtureRoot, 'build-serve');
const PORT = 4099;

let server: http.Server | undefined;

function fetch(
    urlPath: string,
    options?: { method?: string; body?: string; headers?: Record<string, string> },
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
        const req = http.request(
            `http://localhost:${PORT}${urlPath}`,
            { method: options?.method || 'GET', headers: options?.headers },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () =>
                    resolve({
                        status: res.statusCode!,
                        body: Buffer.concat(chunks).toString('utf-8'),
                        headers: res.headers,
                    }),
                );
            },
        );
        req.on('error', reject);
        if (options?.body) req.write(options.body);
        req.end();
    });
}

beforeAll(async () => {
    setDevLogger(createDevLogger('silent'));
    await fs.rm(buildRoot, { recursive: true, force: true });
    await buildVersion({
        version: 1,
        projectRoot: fixtureRoot,
        pagesRoot: path.join(fixtureRoot, 'src/pages'),
        buildRoot,
        publicBasePath: '/',
        concurrency: 4,
        tsConfigFilePath: path.join(fixtureRoot, 'tsconfig.json'),
    });

    await startMainServer({
        buildRoot,
        version: 1,
        port: PORT,
        publicBasePath: '/',
    });

    await new Promise((r) => setTimeout(r, 500));
}, 120_000);

afterAll(async () => {
    server?.close();
    await fs.rm(buildRoot, { recursive: true, force: true });
});

describe('index page', () => {
    it('serves index page with SSR HTML', async () => {
        const res = await fetch('/');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.body).toMatch(/Welcome to Test Shop/);
    });

    it('includes import map in HTML', async () => {
        const res = await fetch('/');
        expect(res.body).toMatch(/importmap/);
        expect(res.body).toMatch(/@jay-framework\/runtime/);
    });

    it('includes hydration script', async () => {
        const res = await fetch('/');
        expect(res.body).toMatch(/import.*init.*from/);
    });
});

describe('home page', () => {
    it('serves home page with SSR HTML', async () => {
        const res = await fetch('/home');
        expect(res.status).toBe(200);
        expect(res.body).toMatch(/Test Shop/);
        expect(res.body).toMatch(/Items: 3/);
    });

    it('includes CSS link', async () => {
        const res = await fetch('/home');
        expect(res.body).toMatch(/\.css/);
    });
});

describe('head tags (SEO)', () => {
    it('injects title tag from fast render', async () => {
        const res = await fetch('/home');
        expect(res.body).toMatch(/<title>Test Shop - Home<\/title>/);
    });

    it('injects meta description', async () => {
        const res = await fetch('/home');
        expect(res.body).toMatch(
            /name="description" content="A test shop for production build testing"/,
        );
    });

    it('injects og:title meta', async () => {
        const res = await fetch('/home');
        expect(res.body).toMatch(/property="og:title" content="Test Shop"/);
    });

    it('injects canonical link', async () => {
        const res = await fetch('/home');
        expect(res.body).toMatch(/rel="canonical" href="https:\/\/test-shop\.example\.com\/"/);
    });

    it('injects per-page title from slow render', async () => {
        const res = await fetch('/items/widget-a');
        expect(res.body).toMatch(/<title>Widget A<\/title>/);
    });

    it('injects per-page meta description', async () => {
        const res = await fetch('/items/widget-a');
        expect(res.body).toMatch(/content="Buy Widget A for \$9\.99"/);
    });

    it('head tags appear in <head> not <body>', async () => {
        const res = await fetch('/home');
        const headEnd = res.body.indexOf('</head>');
        const titlePos = res.body.indexOf('<title>Test Shop');
        expect(titlePos).toBeGreaterThan(0);
        expect(titlePos).toBeLessThan(headEnd);
    });
});

describe('featured page (headfull FS with nested headless)', () => {
    it('serves featured page', async () => {
        const res = await fetch('/featured');
        expect(res.status).toBe(200);
        expect(res.body).toMatch(/Featured Items/);
    });

    it('renders headfull FS component content', async () => {
        const res = await fetch('/featured');
        expect(res.body).toMatch(/logo\.png/);
        expect(res.body).toMatch(/Test Shop/);
    });

    it('renders nested headless component data', async () => {
        const res = await fetch('/featured');
        expect(res.body).toMatch(/Cart/);
        expect(res.body).toMatch(/3/);
    });
});

describe('catalog page (direct headless instance)', () => {
    it('serves catalog page', async () => {
        const res = await fetch('/catalog');
        expect(res.status).toBe(200);
        expect(res.body).toMatch(/Full Catalog/);
    });

    it('renders headless instance data', async () => {
        const res = await fetch('/catalog');
        expect(res.body).toMatch(/Items/);
        expect(res.body).toMatch(/3/);
    });
});

describe('client init', () => {
    it('passes clientInitData in the init call', async () => {
        const res = await fetch('/');
        expect(res.body).toMatch(/shopName/);
        expect(res.body).toMatch(/Test Shop/);
    });
});

describe('dynamic param pages', () => {
    it('serves dynamic param page', async () => {
        const res = await fetch('/items/widget-a');
        expect(res.status).toBe(200);
        expect(res.body).toMatch(/Widget A/);
        expect(res.body).toMatch(/9\.99/);
    });

    it('serves different content per slug', async () => {
        const resA = await fetch('/items/widget-a');
        const resB = await fetch('/items/widget-b');
        expect(resA.body).toMatch(/Widget A/);
        expect(resB.body).toMatch(/Widget B/);
        expect(resA.body).not.toMatch(/Widget B/);
    });

    it('returns 404 for unknown route', async () => {
        const res = await fetch('/nonexistent');
        expect(res.status).toBe(404);
    });

    it('returns 404 for unknown params', async () => {
        const res = await fetch('/items/widget-c');
        expect(res.status).toBe(404);
    });
});

describe('static assets', () => {
    it('serves shared chunks', async () => {
        const manifest = JSON.parse(
            await fs.readFile(path.join(buildRoot, 'v1/shared/shared-manifest.json'), 'utf-8'),
        );
        const runtimeFile = manifest['@jay-framework/runtime'];
        const res = await fetch(`/shared/${runtimeFile}`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/javascript/);
    });

    it('serves instance bundles', async () => {
        const routeManifest = JSON.parse(
            await fs.readFile(path.join(buildRoot, 'v1/route-manifest.json'), 'utf-8'),
        );
        const index = routeManifest.routes.find((r: any) => r.pattern === '');
        const res = await fetch(`/${index.instances[0].clientBundlePath}`);
        expect(res.status).toBe(200);
    });

    it('sets cache headers on hashed assets', async () => {
        const manifest = JSON.parse(
            await fs.readFile(path.join(buildRoot, 'v1/shared/shared-manifest.json'), 'utf-8'),
        );
        const runtimeFile = manifest['@jay-framework/runtime'];
        const res = await fetch(`/shared/${runtimeFile}`);
        expect(res.headers['cache-control']).toMatch(/immutable/);
    });
});

describe('actions', () => {
    it('executes action and returns JSON', async () => {
        const res = await fetch('/_jay/actions/cart.add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: '1', quantity: 2 }),
        });
        expect(res.status).toBe(200);
        const data = JSON.parse(res.body);
        expect(data.success).toBe(true);
        expect(data.data.itemId).toBe('1');
        expect(data.data.quantity).toBe(2);
    });

    it('returns 404 for unknown action', async () => {
        const res = await fetch('/_jay/actions/nonexistent', { method: 'POST' });
        expect(res.status).toBe(404);
    });
});
