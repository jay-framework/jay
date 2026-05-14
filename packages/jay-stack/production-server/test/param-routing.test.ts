import { describe, it, expect } from 'vitest';
import {
    crossProductParams,
    materializeRouteParams,
    dedupeByUrl,
    type RouteInfo,
} from '../lib/builder/param-routing';

describe('crossProductParams', () => {
    it('should pass through single part', () => {
        const result = crossProductParams([
            { keys: new Set(['slug']), values: [{ slug: 'a' }, { slug: 'b' }] },
        ]);
        expect(result).toEqual([{ slug: 'a' }, { slug: 'b' }]);
    });

    it('should cross-product two parts with disjoint keys', () => {
        const result = crossProductParams([
            { keys: new Set(['lang']), values: [{ lang: 'en' }, { lang: 'fr' }] },
            { keys: new Set(['slug']), values: [{ slug: 'shirt' }, { slug: 'hat' }] },
        ]);
        expect(result).toEqual([
            { lang: 'en', slug: 'shirt' },
            { lang: 'en', slug: 'hat' },
            { lang: 'fr', slug: 'shirt' },
            { lang: 'fr', slug: 'hat' },
        ]);
    });

    it('should return empty for empty input', () => {
        expect(crossProductParams([])).toEqual([]);
    });

    it('should return empty when one part is empty', () => {
        const result = crossProductParams([
            { keys: new Set(['lang']), values: [{ lang: 'en' }] },
            { keys: new Set(['slug']), values: [] },
        ]);
        expect(result).toEqual([]);
    });

    it('should handle three parts', () => {
        const result = crossProductParams([
            { keys: new Set(['a']), values: [{ a: '1' }, { a: '2' }] },
            { keys: new Set(['b']), values: [{ b: 'x' }] },
            { keys: new Set(['c']), values: [{ c: 'p' }, { c: 'q' }] },
        ]);
        expect(result).toEqual([
            { a: '1', b: 'x', c: 'p' },
            { a: '1', b: 'x', c: 'q' },
            { a: '2', b: 'x', c: 'p' },
            { a: '2', b: 'x', c: 'q' },
        ]);
    });
});

describe('materializeRouteParams', () => {
    it('should materialize static route with inferredParams', () => {
        const route: RouteInfo = {
            rawRoute: '/products/ceramic-vase',
            inferredParams: { slug: 'ceramic-vase' },
            hasDynamicParams: false,
        };
        const result = materializeRouteParams([route], new Map());
        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('/products/ceramic-vase');
        expect(result[0].params).toEqual({ slug: 'ceramic-vase' });
    });

    it('should materialize dynamic route from loadParams', () => {
        const route: RouteInfo = {
            rawRoute: '/products/[slug]',
            hasDynamicParams: true,
        };
        const loadParams = new Map<RouteInfo, Record<string, string>[]>([
            [route, [{ slug: 'shirt' }, { slug: 'hat' }]],
        ]);
        const result = materializeRouteParams([route], loadParams);
        expect(result).toHaveLength(2);
        expect(result[0].url).toBe('/products/shirt');
        expect(result[1].url).toBe('/products/hat');
    });

    it('should filter by inferredParams compatibility', () => {
        const kitan: RouteInfo = {
            rawRoute: '/kitan/products/[slug]',
            inferredParams: { prefix: 'kitan' },
            hasDynamicParams: true,
        };
        const polgat: RouteInfo = {
            rawRoute: '/polgat/products/[slug]',
            inferredParams: { prefix: 'polgat' },
            hasDynamicParams: true,
        };
        const allProducts = [
            { slug: 'shirt', prefix: 'kitan' },
            { slug: 'hat', prefix: 'polgat' },
            { slug: 'pants', prefix: 'kitan' },
        ];
        const loadParams = new Map<RouteInfo, Record<string, string>[]>([
            [kitan, allProducts],
            [polgat, allProducts],
        ]);
        const result = materializeRouteParams([kitan, polgat], loadParams);

        const kitanEntries = result.filter((e) => e.route === kitan);
        const polgatEntries = result.filter((e) => e.route === polgat);

        expect(kitanEntries).toHaveLength(2);
        expect(kitanEntries.map((e) => e.params.slug)).toEqual(['shirt', 'pants']);

        expect(polgatEntries).toHaveLength(1);
        expect(polgatEntries[0].params.slug).toBe('hat');
    });

    it('should merge inferredParams into result params', () => {
        const route: RouteInfo = {
            rawRoute: '/kitan/products/[slug]',
            inferredParams: { prefix: 'kitan' },
            hasDynamicParams: true,
        };
        const loadParams = new Map<RouteInfo, Record<string, string>[]>([
            [route, [{ slug: 'shirt', prefix: 'kitan' }]],
        ]);
        const result = materializeRouteParams([route], loadParams);
        expect(result[0].params).toEqual({ slug: 'shirt', prefix: 'kitan' });
    });

    it('should pass through dynamic route without inferredParams', () => {
        const route: RouteInfo = {
            rawRoute: '/products/[slug]',
            hasDynamicParams: true,
        };
        const loadParams = new Map<RouteInfo, Record<string, string>[]>([
            [route, [{ slug: 'a', prefix: 'any' }]],
        ]);
        const result = materializeRouteParams([route], loadParams);
        expect(result).toHaveLength(1);
        expect(result[0].params).toEqual({ slug: 'a', prefix: 'any' });
    });

    it('should assign higher specificity to static routes', () => {
        const staticRoute: RouteInfo = {
            rawRoute: '/products/shirt',
            inferredParams: { slug: 'shirt' },
            hasDynamicParams: false,
        };
        const dynamicRoute: RouteInfo = {
            rawRoute: '/products/[slug]',
            hasDynamicParams: true,
        };
        const loadParams = new Map<RouteInfo, Record<string, string>[]>([
            [dynamicRoute, [{ slug: 'shirt' }]],
        ]);
        const result = materializeRouteParams([staticRoute, dynamicRoute], loadParams);
        const staticEntry = result.find((e) => e.route === staticRoute)!;
        const dynamicEntry = result.find(
            (e) => e.route === dynamicRoute && e.params.slug === 'shirt',
        )!;
        expect(staticEntry.specificity).toBeGreaterThan(dynamicEntry.specificity);
    });

    it('should handle route with no loadParams and no inferredParams', () => {
        const route: RouteInfo = {
            rawRoute: '/about',
            hasDynamicParams: false,
        };
        const result = materializeRouteParams([route], new Map());
        expect(result).toHaveLength(1);
        expect(result[0].params).toEqual({});
        expect(result[0].url).toBe('/about');
    });
});

describe('dedupeByUrl', () => {
    it('should pass through unique URLs', () => {
        const entries = [
            { route: {} as RouteInfo, params: { slug: 'a' }, url: '/products/a', specificity: 0 },
            { route: {} as RouteInfo, params: { slug: 'b' }, url: '/products/b', specificity: 0 },
        ];
        const result = dedupeByUrl(entries);
        expect(result).toHaveLength(2);
    });

    it('should keep more specific route when URLs collide', () => {
        const staticRoute: RouteInfo = {
            rawRoute: '/products/shirt',
            inferredParams: { slug: 'shirt' },
            hasDynamicParams: false,
        };
        const dynamicRoute: RouteInfo = {
            rawRoute: '/products/[slug]',
            hasDynamicParams: true,
        };
        const entries = [
            { route: dynamicRoute, params: { slug: 'shirt' }, url: '/products/shirt', specificity: 0 },
            { route: staticRoute, params: { slug: 'shirt' }, url: '/products/shirt', specificity: 1000 },
        ];
        const result = dedupeByUrl(entries);
        expect(result).toHaveLength(1);
        expect(result[0].route).toBe(staticRoute);
    });

    it('should prefer route with more inferredParams', () => {
        const specific: RouteInfo = {
            rawRoute: '/kitan/products/[slug]',
            inferredParams: { prefix: 'kitan' },
            hasDynamicParams: true,
        };
        const catchAll: RouteInfo = {
            rawRoute: '/products/[slug]',
            hasDynamicParams: true,
        };
        const entries = [
            { route: catchAll, params: { slug: 'shirt', prefix: 'kitan' }, url: '/products/shirt', specificity: 0 },
            { route: specific, params: { slug: 'shirt', prefix: 'kitan' }, url: '/products/shirt', specificity: 1 },
        ];
        const result = dedupeByUrl(entries);
        expect(result).toHaveLength(1);
        expect(result[0].route).toBe(specific);
    });

    it('should handle no duplicates', () => {
        const result = dedupeByUrl([]);
        expect(result).toEqual([]);
    });
});
