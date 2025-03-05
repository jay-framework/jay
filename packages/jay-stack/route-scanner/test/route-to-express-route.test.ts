import {routeToExpressRoute, scanRoutes} from "../lib";

describe('route-to-express-route', () => {
    it('should convert routes to express routes', async () => {
        const routes = await scanRoutes('./test/fixtures/', 'page.jay-html');
        const expressRoutes = new Set(routes.map((route) => routeToExpressRoute(route)))
        expect (expressRoutes).toEqual(new Set([
            "/",
            "/segment1",
            "/segment1/static",
            "/segment2/:optional?",
            "/segment2",
            "/segment3/:param",
            "/segment3",
            "/segment4/:catchall*",
            "/segment4",
        ]))
    })
})