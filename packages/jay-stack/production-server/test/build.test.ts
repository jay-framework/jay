import { describe, it, expect, beforeAll } from 'vitest';
import { buildVersion } from '../lib/builder/build-pipeline';
import { setDevLogger, createDevLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { RouteManifest } from '../lib/types';

const fixtureRoot = path.resolve(__dirname, 'fixtures/basic-project');
const buildRoot = path.join(fixtureRoot, 'build');
const buildDir = path.join(buildRoot, 'v1');

let manifest: RouteManifest;

beforeAll(async () => {
    setDevLogger(createDevLogger('silent'));
    await fs.rm(buildRoot, { recursive: true, force: true });
    manifest = await buildVersion({
        version: 1,
        projectRoot: fixtureRoot,
        pagesRoot: path.join(fixtureRoot, 'src/pages'),
        buildRoot,
        publicBasePath: '/',
        concurrency: 4,
        tsConfigFilePath: path.join(fixtureRoot, 'tsconfig.json'),
    });
}, 60_000);

describe('build artifacts', () => {
    it('produces route manifest', async () => {
        const manifestFile = await fs.readFile(path.join(buildDir, 'route-manifest.json'), 'utf-8');
        const parsed = JSON.parse(manifestFile);
        expect(parsed.version).toBe(1);
        expect(parsed.routes.length).toBeGreaterThan(0);
    });

    it('produces build metadata', async () => {
        const metadata = JSON.parse(
            await fs.readFile(path.join(buildDir, 'build-metadata.json'), 'utf-8'),
        );
        expect(metadata.version).toBe(1);
        expect(metadata.instanceCount).toBeGreaterThan(0);
    });

    it('compiles server code', async () => {
        const initExists = await fs
            .access(path.join(buildDir, 'server/init.js'))
            .then(() => true)
            .catch(() => false);
        expect(initExists).toBe(true);

        const pageExists = await fs
            .access(path.join(buildDir, 'server/pages/page.js'))
            .then(() => true)
            .catch(() => false);
        expect(pageExists).toBe(true);

        const actionExists = await fs
            .access(path.join(buildDir, 'server/actions/cart.actions.js'))
            .then(() => true)
            .catch(() => false);
        expect(actionExists).toBe(true);
    });

    it('builds shared client chunks', async () => {
        const sharedManifest = JSON.parse(
            await fs.readFile(path.join(buildDir, 'shared/shared-manifest.json'), 'utf-8'),
        );
        expect(sharedManifest['@jay-framework/runtime']).toBeDefined();
        expect(sharedManifest['@jay-framework/stack-client-runtime']).toBeDefined();
    });
});

describe('route manifest', () => {
    it('includes home page route', () => {
        const home = manifest.routes.find((r) => r.pattern === '');
        expect(home).toBeDefined();
        expect(home!.instances.length).toBe(1);
        expect(home!.instances[0].params).toEqual({});
    });

    it('includes dynamic items route with params', () => {
        const items = manifest.routes.find((r) => r.pattern === '/items/[slug]');
        expect(items).toBeDefined();
        expect(items!.instances.length).toBe(2);
        const slugs = items!.instances.map((i) => i.params.slug).sort();
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
    it('produces pre-rendered jay-html for home page', async () => {
        const home = manifest.routes.find((r) => r.pattern === '')!;
        const exists = await fs
            .access(path.join(buildDir, home.instances[0].preRenderedPath))
            .then(() => true)
            .catch(() => false);
        expect(exists).toBe(true);
    });

    it('produces server element for home page', async () => {
        const home = manifest.routes.find((r) => r.pattern === '')!;
        const mod = await import(path.join(buildDir, home.instances[0].serverElementPath));
        expect(typeof mod.renderToStream).toBe('function');
    });

    it('produces client bundle for home page', async () => {
        const home = manifest.routes.find((r) => r.pattern === '')!;
        const bundlePath = path.join(buildDir, home.instances[0].clientBundlePath);
        const exists = await fs
            .access(bundlePath)
            .then(() => true)
            .catch(() => false);
        expect(exists).toBe(true);
    });

    it('produces CSS for home page', async () => {
        const home = manifest.routes.find((r) => r.pattern === '')!;
        expect(home.instances[0].clientCssPath).toBeDefined();
    });

    it('produces cache metadata for home page', async () => {
        const home = manifest.routes.find((r) => r.pattern === '')!;
        const cachePath = home.instances[0].preRenderedPath.replace('.jay-html', '.cache.json');
        const cache = JSON.parse(await fs.readFile(path.join(buildDir, cachePath), 'utf-8'));
        expect(cache.slowViewState).toBeDefined();
        expect(cache.slowViewState.siteName).toBe('Test Shop');
    });

    it('stores different slow ViewState per slug', async () => {
        const items = manifest.routes.find((r) => r.pattern === '/items/[slug]')!;
        const widgetA = items.instances.find((i) => i.params.slug === 'widget-a')!;
        const widgetB = items.instances.find((i) => i.params.slug === 'widget-b')!;

        const cacheA = JSON.parse(
            await fs.readFile(
                path.join(buildDir, widgetA.preRenderedPath.replace('.jay-html', '.cache.json')),
                'utf-8',
            ),
        );
        const cacheB = JSON.parse(
            await fs.readFile(
                path.join(buildDir, widgetB.preRenderedPath.replace('.jay-html', '.cache.json')),
                'utf-8',
            ),
        );

        expect(cacheA.slowViewState.name).toBe('Widget A');
        expect(cacheB.slowViewState.name).toBe('Widget B');
        expect(cacheA.slowViewState.price).toBe(9.99);
        expect(cacheB.slowViewState.price).toBe(19.99);
    });

    it('server element produces valid HTML', async () => {
        const home = manifest.routes.find((r) => r.pattern === '')!;
        const mod = await import(path.join(buildDir, home.instances[0].serverElementPath));

        const chunks: string[] = [];
        mod.renderToStream(
            { siteName: 'Test', itemCount: 5 },
            { write: (c: string) => chunks.push(c), onAsync: () => {} },
        );

        const html = chunks.join('');
        expect(html).toMatch(/Test/);
        expect(html).toMatch(/5/);
    });
});
