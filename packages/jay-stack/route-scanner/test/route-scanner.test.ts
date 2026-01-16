import { JayRouteParamType, ScanFilesOptions, scanRoutes, sortRoutesByPriority, inferParamsForStaticRoutes } from '../lib';
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

    it('should infer params for static override routes', async () => {
        const routes = await scanRoutes('./test/fixtures/priority', options);

        // Find the static override route
        const vaseRoute = routes.find((r) => r.rawRoute === '/products/ceramic-flower-vase');

        // Should have inferred slug param from sibling /products/[slug]
        expect(vaseRoute?.inferredParams).toEqual({ slug: 'ceramic-flower-vase' });
    });

    it('should not infer params for dynamic routes', async () => {
        const routes = await scanRoutes('./test/fixtures/priority', options);

        // Dynamic routes should not have inferredParams
        const slugRoute = routes.find((r) => r.rawRoute === '/products/[slug]');
        expect(slugRoute?.inferredParams).toBeUndefined();
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

describe('inferParamsForStaticRoutes', () => {
    it('should infer params from sibling dynamic route', () => {
        const routes = [
            { segments: ['products', 'my-product'], rawRoute: '/products/my-product', jayHtmlPath: '', compPath: '' },
            { segments: ['products', { name: 'slug', type: JayRouteParamType.single }], rawRoute: '/products/[slug]', jayHtmlPath: '', compPath: '' },
        ];

        const { routes: result, inferenceLog } = inferParamsForStaticRoutes(routes);

        expect(result[0].inferredParams).toEqual({ slug: 'my-product' });
        expect(result[1].inferredParams).toBeUndefined();
        expect(inferenceLog).toHaveLength(1);
        expect(inferenceLog[0]).toEqual({
            staticRoute: '/products/my-product',
            dynamicRoute: '/products/[slug]',
            inferredParams: { slug: 'my-product' },
        });
    });

    it('should not infer params when no sibling dynamic route exists', () => {
        const routes = [
            { segments: ['products', 'my-product'], rawRoute: '/products/my-product', jayHtmlPath: '', compPath: '' },
            { segments: ['products'], rawRoute: '/products', jayHtmlPath: '', compPath: '' },
        ];

        const { routes: result, inferenceLog } = inferParamsForStaticRoutes(routes);

        expect(result[0].inferredParams).toBeUndefined();
        expect(inferenceLog).toHaveLength(0);
    });

    it('should infer multiple params from deeply nested routes', () => {
        const routes = [
            { 
                segments: ['shop', 'electronics', 'phones'], 
                rawRoute: '/shop/electronics/phones', 
                jayHtmlPath: '', 
                compPath: '' 
            },
            { 
                segments: ['shop', { name: 'category', type: JayRouteParamType.single }, { name: 'subcategory', type: JayRouteParamType.single }], 
                rawRoute: '/shop/[category]/[subcategory]', 
                jayHtmlPath: '', 
                compPath: '' 
            },
        ];

        const { routes: result } = inferParamsForStaticRoutes(routes);

        expect(result[0].inferredParams).toEqual({ 
            category: 'electronics', 
            subcategory: 'phones' 
        });
    });

    it('should handle mixed static and dynamic segments', () => {
        const routes = [
            { 
                segments: ['users', 'admin', 'settings'], 
                rawRoute: '/users/admin/settings', 
                jayHtmlPath: '', 
                compPath: '' 
            },
            { 
                segments: ['users', { name: 'id', type: JayRouteParamType.single }, 'settings'], 
                rawRoute: '/users/[id]/settings', 
                jayHtmlPath: '', 
                compPath: '' 
            },
        ];

        const { routes: result } = inferParamsForStaticRoutes(routes);

        // Static segments that match should not become params
        // Only the segment at position 1 differs: 'admin' vs [id]
        expect(result[0].inferredParams).toEqual({ id: 'admin' });
    });

    it('should not infer for routes with different segment counts', () => {
        const routes = [
            { segments: ['products', 'featured', 'new'], rawRoute: '/products/featured/new', jayHtmlPath: '', compPath: '' },
            { segments: ['products', { name: 'slug', type: JayRouteParamType.single }], rawRoute: '/products/[slug]', jayHtmlPath: '', compPath: '' },
        ];

        const { routes: result, inferenceLog } = inferParamsForStaticRoutes(routes);

        // Different segment counts - not siblings
        expect(result[0].inferredParams).toBeUndefined();
        expect(inferenceLog).toHaveLength(0);
    });
});

function resolveFixture(relativePath: string): string {
    return path.resolve('test/fixtures/' + relativePath);
}
