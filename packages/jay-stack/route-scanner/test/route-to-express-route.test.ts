import { routeToExpressRoute, ScanFilesOptions, scanRoutes } from '../lib';

describe('route-to-express-route', () => {
    const options: ScanFilesOptions = { jayHtmlFilename: 'page.jay-html', compFilename: 'page.ts' };
    it('should convert routes to express routes', async () => {
        const routes = await scanRoutes('./test/fixtures/', options);
        const expressRoutes = new Set(routes.map((route) => routeToExpressRoute(route)));
        expect(expressRoutes).toEqual(
            new Set([
                '/',
                '/segment1',
                '/segment1/static',
                '/segment2/:optional?',
                '/segment2',
                '/segment3/:param',
                '/segment3',
                '/segment4/:catchall*',
                '/segment4',
                // Priority test fixtures
                '/priority/:path*',
                '/priority/products',
                '/priority/products/:slug',
                '/priority/products/ceramic-flower-vase',
            ]),
        );
    });
});
