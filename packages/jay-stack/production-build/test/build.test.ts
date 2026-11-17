import { describe, it, expect, beforeAll } from 'vitest';
import { buildVersion } from '@jay-framework/production-build';
import { resolveContractToRoutes } from '@jay-framework/production-server';
import {
    matchRoutes,
    resolveRequest,
    FilesystemArtifactStore,
    synthesizeInstance,
} from '@jay-framework/production-server';
import { setDevLogger, createDevLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { RouteManifest, RouteEntry, InstanceEntry } from '@jay-framework/production-server';

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

/** Instances of a route, resolved through the store (the manifest holds routes only, DL#227). */
async function instancesOf(pattern: string): Promise<InstanceEntry[]> {
    const route = findRoute(pattern);
    const store = new FilesystemArtifactStore(backendDir);
    const instances: InstanceEntry[] = [];
    for await (const ref of store.listInstances(route, { fresh: true })) {
        instances.push(synthesizeInstance(route, ref.params));
    }
    return instances;
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
    it('includes index page route', async () => {
        const instances = await instancesOf('');
        expect(instances.length).toBe(1);
        expect(instances[0].params).toEqual({});
    });

    it('includes home page route', async () => {
        expect((await instancesOf('/home')).length).toBe(1);
    });

    it('includes featured page route (flattened headless region)', async () => {
        expect((await instancesOf('/featured')).length).toBe(1);
    });

    it('includes catalog page route (headless instance)', async () => {
        expect((await instancesOf('/catalog')).length).toBe(1);
    });

    it('includes dynamic items route with params', async () => {
        const instances = await instancesOf('/items/[slug]');
        expect(instances.length).toBe(2);
        const slugs = instances.map((i) => i.params.slug).sort();
        expect(slugs).toEqual(['widget-a', 'widget-b']);
    });

    it('keeps instances out of the manifest (DL#227)', () => {
        for (const route of manifest.routes) {
            expect('instances' in route).toBe(false);
        }
    });

    it('stores route, params and freshness fields in each cache file (DL#226/#227)', async () => {
        const [inst] = await instancesOf('/home');
        const cache = JSON.parse(await fs.readFile(path.join(backendDir, inst.cachePath), 'utf-8'));
        expect(cache.route).toBe('/home');
        expect(cache.params).toEqual({});
        expect(typeof cache.renderedAt).toBe('number');
    });

    it('persists jay-script="allow" passthrough scripts into the manifest (DL#149)', () => {
        const home = findRoute('/home');
        expect(home.scripts).toEqual([
            {
                src: 'https://cdn.example.com/analytics.js',
                attributes: { async: '', defer: '' },
                position: 'head',
            },
            {
                inline: 'window.__brand = "A & B <ok>";',
                attributes: {},
                position: 'body',
            },
        ]);
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
        const inst = (await instancesOf(''))[0];
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
        const inst = (await instancesOf('/home'))[0];
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

    it('produces artifacts for featured page (flattened headless region)', async () => {
        const inst = (await instancesOf('/featured'))[0];
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
        const inst = (await instancesOf('/catalog'))[0];
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
        const items = await instancesOf('/items/[slug]');
        const widgetA = items.find((i) => i.params.slug === 'widget-a')!;
        const widgetB = items.find((i) => i.params.slug === 'widget-b')!;

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

    it('populates props.url with the concrete route path at the slow phase (DL#163)', async () => {
        const items = await instancesOf('/items/[slug]');
        const widgetA = items.find((i) => i.params.slug === 'widget-a')!;
        const widgetB = items.find((i) => i.params.slug === 'widget-b')!;

        const cacheA = JSON.parse(
            await fs.readFile(path.join(backendDir, widgetA.cachePath), 'utf-8'),
        );
        const cacheB = JSON.parse(
            await fs.readFile(path.join(backendDir, widgetB.cachePath), 'utf-8'),
        );

        expect(cacheA.slowViewState.urlPath).toBe('/items/widget-a');
        expect(cacheB.slowViewState.urlPath).toBe('/items/widget-b');
    });

    it('server element renders index page HTML', async () => {
        const index = (await instancesOf(''))[0];
        const mod = await import(path.join(backendDir, index.serverElementPath));
        const chunks: string[] = [];
        mod.renderToStream(
            { welcomeMessage: 'Welcome to Test Shop' },
            { write: (c: string) => chunks.push(c), onAsync: () => {} },
        );
        const html = chunks.join('');
        expect(html).toMatch(/Welcome to Test Shop/);
    });

    it('server element renders home page HTML', async () => {
        const home = (await instancesOf('/home'))[0];
        const mod = await import(path.join(backendDir, home.serverElementPath));
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

    it('featured page config includes nested headless component', async () => {
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
    const store = () => new FilesystemArtifactStore(backendDir);

    it('resolves route pattern to exact route', async () => {
        const route = manifest.routes.find((r) => r.pattern === '/items/[slug]');
        expect(route).toBeDefined();
        expect((await instancesOf('/items/[slug]')).length).toBe(2);
    });

    it('resolves URL to route and params via matchRoutes', () => {
        const match = matchRoutes(manifest, '/items/widget-a').next().value;
        expect(match).toBeDefined();
        expect(match!.route.pattern).toBe('/items/[slug]');
        expect(match!.params).toEqual({ slug: 'widget-a' });
    });

    it('resolves URL to the stored instance', async () => {
        const result = await resolveRequest(manifest, '/items/widget-b', store());
        expect(result.kind).toBe('matched');
        expect(result.kind === 'matched' && result.match.instance.params.slug).toBe('widget-b');
    });

    it('does not resolve an unknown item without a renderer', async () => {
        expect(await resolveRequest(manifest, '/items/nonexistent', store())).toEqual({
            kind: 'notFound',
        });
    });

    it('returns undefined for unknown route pattern', () => {
        const route = manifest.routes.find((r) => r.pattern === '/nonexistent');
        expect(route).toBeUndefined();
    });

    it('resolves static route URL', async () => {
        const result = await resolveRequest(manifest, '/home', store());
        expect(result.kind).toBe('matched');
        expect(result.kind === 'matched' && result.match.route.pattern).toBe('/home');
        expect(result.kind === 'matched' && Object.keys(result.match.params).length).toBe(0);
    });
});

describe('error pages (DL#218)', () => {
    it('records compiled error pages on the manifest keyed by status token', () => {
        expect(Object.keys(manifest.errorPages ?? {}).sort()).toEqual(['404', '5xx']);
    });

    it('compiles each error page like a single-instance route (server + hydrate + client)', () => {
        for (const token of ['404', '5xx']) {
            const entry = manifest.errorPages![token];
            expect(entry.token).toBe(token);
            expect(entry.serverElementPath).toBeTruthy();
            expect(entry.routeHydratePath).toBeTruthy();
            expect(entry.routeClientBundlePath).toBeTruthy();
        }
    });

    it('emits error-page artifacts under the _errors/<token>/ subtree', async () => {
        for (const token of ['404', '5xx']) {
            const entry = manifest.errorPages![token];
            expect(
                entry.serverElementPath.startsWith(path.join('pre-rendered', '_errors', token)),
            ).toBe(true);
            const serverFileExists = await fs
                .access(path.join(backendDir, entry.serverElementPath))
                .then(() => true)
                .catch(() => false);
            expect(serverFileExists).toBe(true);

            const hydrateExists = await fs
                .access(path.join(frontendDir, entry.routeHydratePath!))
                .then(() => true)
                .catch(() => false);
            expect(hydrateExists).toBe(true);
        }
    });

    it('does not expose error pages as navigable routes', () => {
        expect(manifest.routes.some((r) => r.pattern === '/404')).toBe(false);
        expect(manifest.routes.some((r) => r.pattern === '/5xx')).toBe(false);
        expect([...matchRoutes(manifest, '/404')]).toEqual([]);
        expect([...matchRoutes(manifest, '/5xx')]).toEqual([]);
    });

    it('captures the error page head metadata from its template', () => {
        // The 404 template declares <title>{error.title}</title> + a description meta.
        const entry = manifest.errorPages!['404'];
        expect(entry.headMeta).toBeDefined();
    });
});
