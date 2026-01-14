import { JayRouteParamType, ScanFilesOptions, scanRoutes, sortRoutesByPriority } from '../lib';
import path from 'path';

describe('RouteScanner', () => {
    const options: ScanFilesOptions = { jayHtmlFilename: 'page.jay-html', compFilename: 'page.ts' };
    it('should scan for static routes', async () => {
        const routes = await scanRoutes('./test/fixtures/segment1', options);
        // More specific routes (longer) come first due to priority sorting
        expect(routes).toEqual([
            {
                compPath: resolveFixture('segment1/static/page.ts'),
                jayHtmlPath: resolveFixture('segment1/static/page.jay-html'),
                rawRoute: '/static',
                segments: ['static'],
            },
            {
                compPath: resolveFixture('segment1/page.ts'),
                jayHtmlPath: resolveFixture('segment1/page.jay-html'),
                rawRoute: '',
                segments: [],
            },
        ]);
    });

    it('should scan for optional routes', async () => {
        const routes = await scanRoutes('./test/fixtures/segment2', options);
        // Optional param comes after root (dynamic after static/empty)
        expect(routes).toEqual([
            {
                compPath: resolveFixture('segment2/[[optional]]/page.ts'),
                jayHtmlPath: resolveFixture('segment2/[[optional]]/page.jay-html'),
                rawRoute: '/[[optional]]',
                segments: [{ name: 'optional', type: JayRouteParamType.optional }],
            },
            {
                compPath: resolveFixture('segment2/page.ts'),
                jayHtmlPath: resolveFixture('segment2/page.jay-html'),
                rawRoute: '',
                segments: [],
            },
        ]);
    });

    it('should scan for param routes', async () => {
        const routes = await scanRoutes('./test/fixtures/segment3', options);
        // Single param comes after root (dynamic after static/empty)
        expect(routes).toEqual([
            {
                compPath: resolveFixture('segment3/[param]/page.ts'),
                jayHtmlPath: resolveFixture('segment3/[param]/page.jay-html'),
                rawRoute: '/[param]',
                segments: [{ name: 'param', type: JayRouteParamType.single }],
            },
            {
                compPath: resolveFixture('segment3/page.ts'),
                jayHtmlPath: resolveFixture('segment3/page.jay-html'),
                rawRoute: '',
                segments: [],
            },
        ]);
    });

    it('should scan for catch all routes', async () => {
        const routes = await scanRoutes('./test/fixtures/segment4', options);
        // Catch-all comes after root (dynamic after static/empty)
        expect(routes).toEqual([
            {
                compPath: resolveFixture('segment4/[...catchall]/page.ts'),
                jayHtmlPath: resolveFixture('segment4/[...catchall]/page.jay-html'),
                rawRoute: '/[...catchall]',
                segments: [{ name: 'catchall', type: JayRouteParamType.catchAll }],
            },
            {
                compPath: resolveFixture('segment4/page.ts'),
                jayHtmlPath: resolveFixture('segment4/page.jay-html'),
                rawRoute: '',
                segments: [],
            },
        ]);
    });

    it('should sort routes by priority (static before dynamic)', async () => {
        const routes = await scanRoutes('./test/fixtures/priority', options);
        const rawRoutes = routes.map((r) => r.rawRoute);

        // Expected order:
        // 1. /products/ceramic-flower-vase (2 static segments - most specific)
        // 2. /products/[slug] (1 static + 1 param)
        // 3. /products (1 static segment)
        // 4. /[...path] (catch-all - least specific)
        expect(rawRoutes).toEqual([
            '/products/ceramic-flower-vase',
            '/products/[slug]',
            '/products',
            '/[...path]',
        ]);
    });

    it('should ensure static routes match before dynamic at same level', async () => {
        const routes = await scanRoutes('./test/fixtures/priority', options);

        // Verify ceramic-flower-vase comes before [slug]
        const vaseIndex = routes.findIndex((r) => r.rawRoute === '/products/ceramic-flower-vase');
        const slugIndex = routes.findIndex((r) => r.rawRoute === '/products/[slug]');

        expect(vaseIndex).toBeLessThan(slugIndex);
    });
});

describe('sortRoutesByPriority', () => {
    it('should sort static routes before dynamic routes', () => {
        const unsorted = [
            { segments: [{ name: 'slug', type: JayRouteParamType.single }], rawRoute: '/[slug]', jayHtmlPath: '', compPath: '' },
            { segments: ['products'], rawRoute: '/products', jayHtmlPath: '', compPath: '' },
        ];

        const sorted = sortRoutesByPriority(unsorted);

        expect(sorted.map((r) => r.rawRoute)).toEqual(['/products', '/[slug]']);
    });

    it('should sort catch-all after single params', () => {
        const unsorted = [
            { segments: [{ name: 'path', type: JayRouteParamType.catchAll }], rawRoute: '/[...path]', jayHtmlPath: '', compPath: '' },
            { segments: [{ name: 'id', type: JayRouteParamType.single }], rawRoute: '/[id]', jayHtmlPath: '', compPath: '' },
        ];

        const sorted = sortRoutesByPriority(unsorted);

        expect(sorted.map((r) => r.rawRoute)).toEqual(['/[id]', '/[...path]']);
    });

    it('should sort longer static routes before shorter ones', () => {
        const unsorted = [
            { segments: ['products'], rawRoute: '/products', jayHtmlPath: '', compPath: '' },
            { segments: ['products', 'featured'], rawRoute: '/products/featured', jayHtmlPath: '', compPath: '' },
        ];

        const sorted = sortRoutesByPriority(unsorted);

        expect(sorted.map((r) => r.rawRoute)).toEqual(['/products/featured', '/products']);
    });

    it('should use alphabetical order for determinism', () => {
        const unsorted = [
            { segments: ['zebra'], rawRoute: '/zebra', jayHtmlPath: '', compPath: '' },
            { segments: ['alpha'], rawRoute: '/alpha', jayHtmlPath: '', compPath: '' },
        ];

        const sorted = sortRoutesByPriority(unsorted);

        expect(sorted.map((r) => r.rawRoute)).toEqual(['/alpha', '/zebra']);
    });
});

function resolveFixture(relativePath: string): string {
    return path.resolve('test/fixtures/' + relativePath);
}
