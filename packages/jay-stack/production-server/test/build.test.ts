import { describe, it, expect, beforeAll } from 'vitest';
import { buildVersion } from '../lib';
import { resolveContractToRoutes } from '../lib';
import { matchRequest } from '../lib/serve/route-matcher';
import { setDevLogger, createDevLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { RouteManifest, RouteEntry } from '../lib';

const fixtureRoot = path.resolve(__dirname, 'fixtures/basic-project');
const buildRoot = path.join(fixtureRoot, 'build');
const buildDir = path.join(buildRoot, 'v1');
const backendDir = path.join(buildDir, 'backend');
const frontendDir = path.join(buildDir, 'frontend');

let manifest: RouteManifest;

function findRoute(pattern: string): RouteEntry {
    const route = manifest.routes.find((r) => r.pattern === pattern);
    if (!route) throw new Error(`Route not found: ${pattern}`);
    return route;
}

beforeAll(async () => {
    setDevLogger(createDevLogger('silent'));
    await fs.rm(buildRoot, { recursive: true, force: true });
    manifest = await buildVersion({
        version: '1',
        projectRoot: fixtureRoot,
        pagesRoot: path.join(fixtureRoot, 'src/pages'),
        buildRoot,
        concurrency: 4,
        tsConfigFilePath: path.join(fixtureRoot, 'tsconfig.json'),
    });
}, 120_000);

describe('build artifacts', () => {
    it('produces route manifest', async () => {
        const manifestFile = await fs.readFile(
            path.join(buildDir, 'backend/route-manifest.json'),
            'utf-8',
        );
        const parsed = JSON.parse(manifestFile);
        expect(parsed.version).toBe('1');
        expect(parsed.routes.length).toBeGreaterThanOrEqual(5);
    });

    it('produces build metadata', async () => {
        const metadata = JSON.parse(
            await fs.readFile(path.join(buildDir, 'backend/build-metadata.json'), 'utf-8'),
        );
        expect(metadata.version).toBe('1');
        expect(metadata.instanceCount).toBeGreaterThanOrEqual(6);
    });

    it('compiles server code', async () => {
        const initExists = await fs
            .access(path.join(buildDir, 'backend/server/init.js'))
            .then(() => true)
            .catch(() => false);
        expect(initExists).toBe(true);

        const pageExists = await fs
            .access(path.join(buildDir, 'backend/server/pages/page.js'))
            .then(() => true)
            .catch(() => false);
        expect(pageExists).toBe(true);

        const actionExists = await fs
            .access(path.join(buildDir, 'backend/server/actions/cart.actions.js'))
            .then(() => true)
            .catch(() => false);
        expect(actionExists).toBe(true);
    });

    it('builds shared client chunks', async () => {
        const sharedManifest = JSON.parse(
            await fs.readFile(path.join(buildDir, 'frontend/shared/shared-manifest.json'), 'utf-8'),
        );
        expect(sharedManifest['@jay-framework/runtime']).toBeDefined();
        expect(sharedManifest['@jay-framework/stack-client-runtime']).toBeDefined();
    });
});

describe('route manifest', () => {
    it('includes index page route', () => {
        const index = findRoute('');
        expect(index.instances.length).toBe(1);
        expect(index.instances[0].params).toEqual({});
    });

    it('includes home page route', () => {
        const home = findRoute('/home');
        expect(home.instances.length).toBe(1);
    });

    it('includes featured page route (headfull FS)', () => {
        const featured = findRoute('/featured');
        expect(featured.instances.length).toBe(1);
    });

    it('includes catalog page route (headless instance)', () => {
        const catalog = findRoute('/catalog');
        expect(catalog.instances.length).toBe(1);
    });

    it('includes dynamic items route with params', () => {
        const items = findRoute('/items/[slug]');
        expect(items.instances.length).toBe(2);
        const slugs = items.instances.map((i) => i.params.slug).sort();
        expect(slugs).toEqual(['widget-a', 'widget-b']);
    });

    it('includes actions', () => {
        const cartAction = manifest.actions.find((a) => a.actionNames.includes('cart.add'));
        expect(cartAction).toBeDefined();
        expect(cartAction!.isPlugin).toBe(false);
    });

    it('includes shared manifest', () => {
        expect(Object.keys(manifest.sharedManifest).length).toBeGreaterThanOrEqual(4);
    });
});

describe('per-instance artifacts', () => {
    it('produces artifacts for index page', async () => {
        const index = findRoute('');
        const inst = index.instances[0];
        expect(
            await fs.access(path.join(backendDir, inst.cachePath)).then(
                () => true,
                () => false,
            ),
        ).toBe(true);
        expect(
            await fs.access(path.join(frontendDir, inst.clientBundlePath)).then(
                () => true,
                () => false,
            ),
        ).toBe(true);
        const mod = await import(path.join(backendDir, inst.serverElementPath));
        expect(typeof mod.renderToStream).toBe('function');
    });

    it('produces artifacts for home page', async () => {
        const home = findRoute('/home');
        const inst = home.instances[0];
        expect(
            await fs.access(path.join(backendDir, inst.cachePath)).then(
                () => true,
                () => false,
            ),
        ).toBe(true);
        const cachePath = inst.cachePath;
        const cache = JSON.parse(await fs.readFile(path.join(backendDir, cachePath), 'utf-8'));
        expect(cache.slowViewState.siteName).toBe('Test Shop');
    });

    it('produces artifacts for featured page (headfull FS)', async () => {
        const featured = findRoute('/featured');
        const inst = featured.instances[0];
        expect(
            await fs.access(path.join(backendDir, inst.cachePath)).then(
                () => true,
                () => false,
            ),
        ).toBe(true);
        const cachePath = inst.cachePath;
        const cache = JSON.parse(await fs.readFile(path.join(backendDir, cachePath), 'utf-8'));
        expect(cache.slowViewState.pageTitle).toBe('Featured Items');
    });

    it('produces artifacts for catalog page (headless instance)', async () => {
        const catalog = findRoute('/catalog');
        const inst = catalog.instances[0];
        expect(
            await fs.access(path.join(backendDir, inst.cachePath)).then(
                () => true,
                () => false,
            ),
        ).toBe(true);
        const cachePath = inst.cachePath;
        const cache = JSON.parse(await fs.readFile(path.join(backendDir, cachePath), 'utf-8'));
        expect(cache.slowViewState.catalogTitle).toBe('Full Catalog');
    });

    it('stores different slow ViewState per slug', async () => {
        const items = findRoute('/items/[slug]');
        const widgetA = items.instances.find((i) => i.params.slug === 'widget-a')!;
        const widgetB = items.instances.find((i) => i.params.slug === 'widget-b')!;

        const cacheA = JSON.parse(
            await fs.readFile(path.join(backendDir, widgetA.cachePath), 'utf-8'),
        );
        const cacheB = JSON.parse(
            await fs.readFile(path.join(backendDir, widgetB.cachePath), 'utf-8'),
        );

        expect(cacheA.slowViewState.name).toBe('Widget A');
        expect(cacheB.slowViewState.name).toBe('Widget B');
        expect(cacheA.slowViewState.price).toBe(9.99);
        expect(cacheB.slowViewState.price).toBe(19.99);
    });

    it('server element renders index page HTML', async () => {
        const index = findRoute('');
        const mod = await import(path.join(backendDir, index.instances[0].serverElementPath));
        const chunks: string[] = [];
        mod.renderToStream(
            { welcomeMessage: 'Welcome to Test Shop' },
            { write: (c: string) => chunks.push(c), onAsync: () => {} },
        );
        const html = chunks.join('');
        expect(html).toMatch(/Welcome to Test Shop/);
    });

    it('server element renders home page HTML', async () => {
        const home = findRoute('/home');
        const mod = await import(path.join(backendDir, home.instances[0].serverElementPath));
        const chunks: string[] = [];
        mod.renderToStream(
            { siteName: 'Test Shop', itemCount: 5 },
            { write: (c: string) => chunks.push(c), onAsync: () => {} },
        );
        const html = chunks.join('');
        expect(html).toMatch(/Test Shop/);
        expect(html).toMatch(/5/);
    });
});

describe('page-parts.json (DL#137)', () => {
    it('generates page-parts.json for each route', async () => {
        for (const routeDir of ['index', 'home', 'featured', 'catalog', 'items/[slug]']) {
            const configPath = path.join(backendDir, 'pre-rendered', routeDir, 'page-parts.json');
            const exists = await fs.access(configPath).then(
                () => true,
                () => false,
            );
            expect(exists).toBe(true);
        }
    });

    it('featured page config includes headfull-nested headless component', async () => {
        const config = JSON.parse(
            await fs.readFile(
                path.join(backendDir, 'pre-rendered/featured/page-parts.json'),
                'utf-8',
            ),
        );
        expect(config.parts.length).toBe(1);
        expect(config.parts[0].exportName).toBe('page');
        expect(config.parts[0].source).toBe('local');

        const cartBadge = config.instanceComponents.find(
            (c: any) => c.contractName === 'cart-badge',
        );
        expect(cartBadge).toBeDefined();
        expect(cartBadge.exportName).toBe('cartBadge');
        expect(cartBadge.propNames).toEqual(['label']);
    });

    it('catalog page config includes direct headless component', async () => {
        const config = JSON.parse(
            await fs.readFile(
                path.join(backendDir, 'pre-rendered/catalog/page-parts.json'),
                'utf-8',
            ),
        );
        const cartBadge = config.instanceComponents.find(
            (c: any) => c.contractName === 'cart-badge',
        );
        expect(cartBadge).toBeDefined();
        expect(cartBadge.source).toBe('local');
    });

    it('simple page config has no instance components', async () => {
        const config = JSON.parse(
            await fs.readFile(path.join(backendDir, 'pre-rendered/index/page-parts.json'), 'utf-8'),
        );
        expect(config.instanceComponents.length).toBe(0);
        expect(config.forEachInstances.length).toBe(0);
    });
});

describe('contracts field (DL#134c)', () => {
    it('populates contracts for routes with headless components', () => {
        const catalog = findRoute('/catalog');
        expect(catalog.contracts).toBeDefined();
        expect(catalog.contracts).toEqual(['cart-badge']);
    });

    it('populates multiple contracts when route uses multiple headless components', () => {
        const featured = findRoute('/featured');
        expect(featured.contracts).toBeDefined();
        expect(featured.contracts!.length).toBeGreaterThanOrEqual(1);
        expect(featured.contracts).toEqual(expect.arrayContaining(['cart-badge']));
    });

    it('does not set contracts for routes without headless components', () => {
        const index = findRoute('');
        expect(index.contracts).toBeUndefined();
    });

    it('resolveContractToRoutes finds routes by contract name', () => {
        const routes = resolveContractToRoutes(manifest, 'cart-badge');
        expect(routes.length).toBeGreaterThanOrEqual(2);
        const patterns = routes.map((r) => r.pattern);
        expect(patterns).toEqual(expect.arrayContaining(['/catalog', '/featured']));
    });

    it('resolveContractToRoutes returns empty for unknown contract', () => {
        const routes = resolveContractToRoutes(manifest, 'nonexistent-contract');
        expect(routes.length).toBe(0);
    });
});

describe('rebuild target resolution (DL#134c)', () => {
    it('resolves route pattern to exact route', () => {
        const route = manifest.routes.find((r) => r.pattern === '/items/[slug]');
        expect(route).toBeDefined();
        expect(route!.instances.length).toBe(2);
    });

    it('resolves URL to route and params via matchRequest', () => {
        const match = matchRequest(manifest, '/items/widget-a');
        expect(match).toBeDefined();
        expect(match!.route.pattern).toBe('/items/[slug]');
        expect(match!.params).toEqual({ slug: 'widget-a' });
    });

    it('resolves URL to correct instance', () => {
        const match = matchRequest(manifest, '/items/widget-b');
        expect(match).toBeDefined();
        expect(match!.instance).toBeDefined();
        expect(match!.instance.params.slug).toBe('widget-b');
    });

    it('returns undefined for unknown URL', () => {
        const match = matchRequest(manifest, '/items/nonexistent');
        expect(match).toBeUndefined();
    });

    it('returns undefined for unknown route pattern', () => {
        const route = manifest.routes.find((r) => r.pattern === '/nonexistent');
        expect(route).toBeUndefined();
    });

    it('resolves static route URL', () => {
        const match = matchRequest(manifest, '/home');
        expect(match).toBeDefined();
        expect(match!.route.pattern).toBe('/home');
        expect(Object.keys(match!.params).length).toBe(0);
    });
});
