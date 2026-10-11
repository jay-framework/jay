import { routeToExpressRoute, ScanFilesOptions, scanRoutes } from '../lib';

describe('route-to-express-route', () => {
    const options: ScanFilesOptions = { jayHtmlFilename: 'page.jay-html', compFilename: 'page.ts' };
    it('should convert routes to express routes', async () => {
        const { routes } = await scanRoutes('./test/fixtures/', options);
        const expressRoutes = new Set(routes.map((route) => routeToExpressRoute(route)));
        expect(expressRoutes).toEqual(
            new Set([
                '/',
                '/segment1',
                '/segment1/static',
                '/segment2{/:optional}',
                '/segment2',
                '/segment3/:param',
                '/segment3',
                '/segment4/*catchall',
                '/segment4',
                // Priority test fixtures
                '/priority/*path',
                '/priority/products',
                '/priority/products/:slug',
                '/priority/products/ceramic-flower-vase',
                // Jay-params test fixtures
                '/jay-params/with-params',
                '/jay-params/no-params',
                '/jay-params/no-head',
                // Error-pages fixtures (DL#218): "error-pages" is not a top-level status token here,
                // so its children are ordinary nested routes — including the nested /blog/404.
                '/error-pages',
                '/error-pages/404',
                '/error-pages/5xx',
                '/error-pages/502',
                '/error-pages/blog/404',
            ]),
        );
    });
});
