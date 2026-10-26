import { describe, it, expect } from 'vitest';
import { matchRoutes } from '../lib/serve/route-matcher';
import { buildImportMap } from '../lib/serve/import-map';
import type { RouteEntry, RouteManifest, RouteSegment } from '../lib/types';

function route(pattern: string, segments: RouteSegment[]): RouteEntry {
    return {
        pattern,
        segments,
        serverModule: 'route.js',
    };
}

function manifest(routes: RouteEntry[]): RouteManifest {
    return {
        version: '0.0.1',
        projectRoot: '/project',
        sharedManifest: {},
        routes,
        actions: [],
        plugins: [],
    };
}

function matches(m: RouteManifest, pathname: string) {
    return [...matchRoutes(m, pathname)].map(({ route, params }) => ({
        pattern: route.pattern,
        params,
    }));
}

describe('matchRoutes', () => {
    it('matches a static route', () => {
        const m = manifest([route('/about', [{ type: 'static', value: 'about' }])]);
        expect(matches(m, '/about')).toEqual([{ pattern: '/about', params: {} }]);
    });

    it('matches the index route', () => {
        const m = manifest([route('/', [])]);
        expect(matches(m, '/')).toEqual([{ pattern: '/', params: {} }]);
    });

    it('extracts params of a param route (no instance lookup)', () => {
        const m = manifest([
            route('/products/[slug]', [
                { type: 'static', value: 'products' },
                { type: 'param', value: 'slug' },
            ]),
        ]);
        expect(matches(m, '/products/b')).toEqual([
            { pattern: '/products/[slug]', params: { slug: 'b' } },
        ]);
    });

    it('matches a catch-all segment', () => {
        const m = manifest([
            route('/docs/[...path]', [
                { type: 'static', value: 'docs' },
                { type: 'catchAll', value: 'path' },
            ]),
        ]);
        expect(matches(m, '/docs/a/b/c')).toEqual([
            { pattern: '/docs/[...path]', params: { path: 'a/b/c' } },
        ]);
    });

    it('yields nothing for unmatched paths', () => {
        const m = manifest([route('/about', [{ type: 'static', value: 'about' }])]);
        expect(matches(m, '/missing')).toEqual([]);
    });

    it('yields every matching route in manifest order', () => {
        const m = manifest([
            route('/products/new', [
                { type: 'static', value: 'products' },
                { type: 'static', value: 'new' },
            ]),
            route('/products/[slug]', [
                { type: 'static', value: 'products' },
                { type: 'param', value: 'slug' },
            ]),
        ]);
        expect(matches(m, '/products/new')).toEqual([
            { pattern: '/products/new', params: {} },
            { pattern: '/products/[slug]', params: { slug: 'new' } },
        ]);
    });
});

describe('buildImportMap', () => {
    it('maps shared package names to hashed public URLs', () => {
        const map = buildImportMap({ '@jay-framework/runtime': 'runtime-abc123.js' }, '/static/');
        expect(map).toEqual({
            '@jay-framework/runtime': '/static/shared/runtime-abc123.js',
        });
    });

    it('honors a custom shared directory', () => {
        const map = buildImportMap({ pkg: 'pkg-x.js' }, '/base/', 'chunks');
        expect(map).toEqual({ pkg: '/base/chunks/pkg-x.js' });
    });

    it('returns an empty map for an empty manifest', () => {
        expect(buildImportMap({}, '/static/')).toEqual({});
    });
});
