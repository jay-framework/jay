import {JayRouteParamType, scanRoutes} from "../lib";
import path from 'path';

describe('RouteScanner', () => {
    it('should scan for static routes', async () => {
        const routes = await scanRoutes('./test/fixtures/segment1', 'page.jay-html');
        expect(routes).toEqual([
            {
                filePath: resolveFixture("segment1/page.jay-html"),
                segments: [],
            },
            {
                filePath: resolveFixture("segment1/static/page.jay-html"),
                segments: ["static"],
            },
        ])
    })

    it('should scan for optional routes', async () => {
        const routes = await scanRoutes('./test/fixtures/segment2', 'page.jay-html');
        expect(routes).toEqual([
            {
                filePath: resolveFixture("segment2/[[optional]]/page.jay-html"),
                segments: [{name: "optional", type: JayRouteParamType.optional}],
            },
            {
                filePath: resolveFixture("segment2/page.jay-html"),
                segments: [],
            },
        ])
    })

    it('should scan for param routes', async () => {
        const routes = await scanRoutes('./test/fixtures/segment3', 'page.jay-html');
        expect(routes).toEqual([
            {
                filePath: resolveFixture("segment3/[param]/page.jay-html"),
                segments: [{name: "param", type: JayRouteParamType.single}],
            },
            {
                filePath: resolveFixture("segment3/page.jay-html"),
                segments: [],
            },
        ])
    })

    it('should scan for catch all routes', async () => {
        const routes = await scanRoutes('./test/fixtures/segment4', 'page.jay-html');
        expect(routes).toEqual([
            {
                filePath: resolveFixture("segment4/[...catchall]/page.jay-html"),
                segments: [{name: "catchall", type: JayRouteParamType.catchAll}],
            },
            {
                filePath: resolveFixture("segment4/page.jay-html"),
                segments: [],
            },
        ])
    })

    it('complex structure', async () => {
        const routes = await scanRoutes('./test/fixtures/', 'page.jay-html');
        expect(routes).toEqual([
            {
                filePath: resolveFixture("page.jay-html"),
                segments:  [],
            },
            {
                filePath: resolveFixture("segment1/page.jay-html"),
                segments:  [
                    "segment1",
                ],
            },
            {
                filePath: resolveFixture("segment1/static/page.jay-html"),
                segments:  [
                    "segment1",
                    "static",
                ],
            },
            {
                filePath: resolveFixture("segment2/[[optional]]/page.jay-html"),
                segments:  [
                    "segment2",
                    {
                        "name": "optional",
                        "type": JayRouteParamType.optional,
                    },
                ],
            },
            {
                filePath: resolveFixture("segment2/page.jay-html"),
                segments:  [
                    "segment2",
                ],
            },
            {
                filePath: resolveFixture("segment3/[param]/page.jay-html"),
                segments:  [
                    "segment3",
                    {
                        "name": "param",
                        "type": JayRouteParamType.single,
                    },
                ],
            },
            {
                filePath: resolveFixture("segment3/page.jay-html"),
                segments:  [
                    "segment3",
                ],
            },
            {
                filePath: resolveFixture("segment4/[...catchall]/page.jay-html"),
                segments:  [
                    "segment4",
                    {
                        "name": "catchall",
                        "type": JayRouteParamType.catchAll,
                    },
                ],
            },
            {
                filePath: resolveFixture("segment4/page.jay-html"),
                segments:  [
                    "segment4",
                ],
            },
        ])
    })
})

function resolveFixture(relativePath: string): string {
    return path.resolve("test/fixtures/" + relativePath);
}
