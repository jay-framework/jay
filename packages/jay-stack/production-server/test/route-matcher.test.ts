import { describe, it, expect } from 'vitest';
import { matchRequest } from '../lib/serve/route-matcher';
import { buildImportMap } from '../lib/serve/import-map';
import type { RouteEntry, RouteManifest, InstanceEntry, RouteSegment } from '../lib/types';

function instance(params: Record<string, string>): InstanceEntry {
    return {
        params,
        cachePath: `cache/${Object.values(params).join('-') || 'index'}.json`,
        serverElementPath: 'server/element.js',
        clientBundlePath: 'client/bundle.js',
    };
}

function route(pattern: string, segments: RouteSegment[], instances: InstanceEntry[]): RouteEntry {
    return {
        pattern,
        segments,
        serverModule: 'route.js',
        instances,
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

describe('matchRequest', () => {
    it('matches a static route', () => {
        const m = manifest([route('/about', [{ type: 'static', value: 'about' }], [instance({})])]);
        const result = matchRequest(m, '/about');
        expect(result?.params).toEqual({});
        expect(result?.route.pattern).toEqual('/about');
    });

    it('matches the index route', () => {
        const m = manifest([route('/', [], [instance({})])]);
        const result = matchRequest(m, '/');
        expect(result?.route.pattern).toEqual('/');
    });

    it('matches a param route and selects the matching instance', () => {
        const m = manifest([
            route(
                '/products/[slug]',
                [
                    { type: 'static', value: 'products' },
                    { type: 'param', value: 'slug' },
                ],
                [instance({ slug: 'a' }), instance({ slug: 'b' })],
            ),
        ]);
        const result = matchRequest(m, '/products/b');
        expect(result?.params).toEqual({ slug: 'b' });
        expect(result?.instance.params).toEqual({ slug: 'b' });
    });

    it('matches a catch-all segment', () => {
        const m = manifest([
            route(
                '/docs/[...path]',
                [
                    { type: 'static', value: 'docs' },
                    { type: 'catchAll', value: 'path' },
                ],
                [instance({ path: 'a/b/c' })],
            ),
        ]);
        const result = matchRequest(m, '/docs/a/b/c');
        expect(result?.params).toEqual({ path: 'a/b/c' });
    });

    it('returns undefined for unmatched paths', () => {
        const m = manifest([route('/about', [{ type: 'static', value: 'about' }], [instance({})])]);
        expect(matchRequest(m, '/missing')).toBeUndefined();
    });

    it('returns undefined when no instance matches the params', () => {
        const m = manifest([
            route(
                '/products/[slug]',
                [
                    { type: 'static', value: 'products' },
                    { type: 'param', value: 'slug' },
                ],
                [instance({ slug: 'a' })],
            ),
        ]);
        expect(matchRequest(m, '/products/z')).toBeUndefined();
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
