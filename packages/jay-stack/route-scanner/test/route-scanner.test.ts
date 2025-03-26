import { JayRouteParamType, ScanFilesOptions, scanRoutes } from '../lib';
import path from 'path';

describe('RouteScanner', () => {
    const options: ScanFilesOptions = { jayHtmlFilename: 'page.jay-html', compFilename: 'page.ts' };
    it('should scan for static routes', async () => {
        const routes = await scanRoutes('./test/fixtures/segment1', options);
        expect(routes).toEqual([
            {
                compPath: resolveFixture('segment1/page.ts'),
                jayHtmlPath: resolveFixture('segment1/page.jay-html'),
                rawRoute: '',
                segments: [],
            },
            {
                compPath: resolveFixture('segment1/static/page.ts'),
                jayHtmlPath: resolveFixture('segment1/static/page.jay-html'),
                rawRoute: '/static',
                segments: ['static'],
            },
        ]);
    });

    it('should scan for optional routes', async () => {
        const routes = await scanRoutes('./test/fixtures/segment2', options);
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

    it('complex structure', async () => {
        const routes = await scanRoutes('./test/fixtures/', options);
        expect(routes).toEqual([
            {
                compPath: resolveFixture('page.ts'),
                jayHtmlPath: resolveFixture('page.jay-html'),
                rawRoute: '',
                segments: [],
            },
            {
                compPath: resolveFixture('segment1/page.ts'),
                jayHtmlPath: resolveFixture('segment1/page.jay-html'),
                rawRoute: '/segment1',
                segments: ['segment1'],
            },
            {
                compPath: resolveFixture('segment1/static/page.ts'),
                jayHtmlPath: resolveFixture('segment1/static/page.jay-html'),
                rawRoute: '/segment1/static',
                segments: ['segment1', 'static'],
            },
            {
                compPath: resolveFixture('segment2/[[optional]]/page.ts'),
                jayHtmlPath: resolveFixture('segment2/[[optional]]/page.jay-html'),
                rawRoute: '/segment2/[[optional]]',
                segments: [
                    'segment2',
                    {
                        name: 'optional',
                        type: JayRouteParamType.optional,
                    },
                ],
            },
            {
                compPath: resolveFixture('segment2/page.ts'),
                jayHtmlPath: resolveFixture('segment2/page.jay-html'),
                rawRoute: '/segment2',
                segments: ['segment2'],
            },
            {
                compPath: resolveFixture('segment3/[param]/page.ts'),
                jayHtmlPath: resolveFixture('segment3/[param]/page.jay-html'),
                rawRoute: '/segment3/[param]',
                segments: [
                    'segment3',
                    {
                        name: 'param',
                        type: JayRouteParamType.single,
                    },
                ],
            },
            {
                compPath: resolveFixture('segment3/page.ts'),
                jayHtmlPath: resolveFixture('segment3/page.jay-html'),
                rawRoute: '/segment3',
                segments: ['segment3'],
            },
            {
                compPath: resolveFixture('segment4/[...catchall]/page.ts'),
                jayHtmlPath: resolveFixture('segment4/[...catchall]/page.jay-html'),
                rawRoute: '/segment4/[...catchall]',
                segments: [
                    'segment4',
                    {
                        name: 'catchall',
                        type: JayRouteParamType.catchAll,
                    },
                ],
            },
            {
                compPath: resolveFixture('segment4/page.ts'),
                jayHtmlPath: resolveFixture('segment4/page.jay-html'),
                rawRoute: '/segment4',
                segments: ['segment4'],
            },
        ]);
    });
});

function resolveFixture(relativePath: string): string {
    return path.resolve('test/fixtures/' + relativePath);
}
