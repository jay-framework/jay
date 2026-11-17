import { describe, it, expect } from 'vitest';
import { resolveRequest } from '../lib/serve/resolve-request';
import { InstanceRenderer } from '../lib/serve/instance-renderer';
import type { ArtifactStore } from '../lib/serve/artifact-store';
import type { RenderInstanceFn } from '../lib/serve/render-instance';
import { deriveCachePath, synthesizeInstance } from '../lib/shared/instance-key';
import type { CacheEntry, RouteEntry, RouteManifest } from '../lib/types';

// DL#227 — resolving a request path to an instance, rendering on miss.

const productRoute: RouteEntry = {
    pattern: '/products/[slug]',
    segments: [
        { type: 'static', value: 'products' },
        { type: 'param', value: 'slug' },
    ],
    serverModule: 'm',
};
const catchAllRoute: RouteEntry = {
    pattern: '/[...rest]',
    segments: [{ type: 'catchAll', value: 'rest' }],
    serverModule: 'm',
};
const manifest: RouteManifest = {
    version: '1',
    projectRoot: '/x',
    sharedManifest: {},
    routes: [productRoute, catchAllRoute],
    actions: [],
    plugins: [],
};

/** Store with a set of existing instances; writes make an instance exist. */
function storeWith(existing: string[]) {
    const known = new Set(existing.map((s) => `${s}`));
    const store = {
        getInstance: async (route: RouteEntry, params: Record<string, string>) => {
            return known.has(deriveCachePath(route.pattern, params))
                ? synthesizeInstance(route, params)
                : undefined;
        },
        writeCacheData: async (route: RouteEntry, params: Record<string, string>) => {
            known.add(deriveCachePath(route.pattern, params));
        },
    } as unknown as ArtifactStore;
    return store;
}

const entry: CacheEntry = { slowViewState: {}, carryForward: {} };

function rendererFor(store: ArtifactStore, render: RenderInstanceFn) {
    return new InstanceRenderer(store, { render });
}

describe('resolveRequest', () => {
    it('matches an existing instance without rendering', async () => {
        const store = storeWith([deriveCachePath(productRoute.pattern, { slug: 'a' })]);
        const calls: string[] = [];
        const renderer = rendererFor(store, async (_r, params) => {
            calls.push(params.slug);
            return { kind: 'rendered', entry };
        });

        const result = await resolveRequest(manifest, '/products/a', store, renderer);

        expect(result).toEqual({
            kind: 'matched',
            match: {
                route: productRoute,
                instance: synthesizeInstance(productRoute, { slug: 'a' }),
                params: { slug: 'a' },
                pathname: '/products/a',
            },
        });
        expect(calls).toEqual([]);
    });

    it('renders an unknown instance on miss and matches it', async () => {
        const store = storeWith([]);
        const renderer = rendererFor(store, async () => ({ kind: 'rendered', entry }));

        const result = await resolveRequest(manifest, '/products/new', store, renderer);

        expect(result).toEqual({
            kind: 'matched',
            match: {
                route: productRoute,
                instance: synthesizeInstance(productRoute, { slug: 'new' }),
                params: { slug: 'new' },
                pathname: '/products/new',
            },
        });
        // the miss was persisted: the next lookup finds it
        expect(await store.getInstance(productRoute, { slug: 'new' })).toEqual(
            synthesizeInstance(productRoute, { slug: 'new' }),
        );
    });

    it('falls through to the next matching route on a real 404', async () => {
        const store = storeWith([
            deriveCachePath(catchAllRoute.pattern, { rest: 'products/ghost' }),
        ]);
        const renderer = rendererFor(store, async (route) =>
            route.pattern === productRoute.pattern
                ? { kind: 'notFound' }
                : { kind: 'rendered', entry },
        );

        const result = await resolveRequest(manifest, '/products/ghost', store, renderer);

        expect(result.kind).toEqual('matched');
        expect(result.kind === 'matched' && result.match.route.pattern).toEqual('/[...rest]');
    });

    it('is not found when every matching route answers 404', async () => {
        const store = storeWith([]);
        const renderer = rendererFor(store, async () => ({ kind: 'notFound' }));
        expect(await resolveRequest(manifest, '/products/ghost', store, renderer)).toEqual({
            kind: 'notFound',
        });
    });

    it('is unavailable with Retry-After when the miss cannot be rendered', async () => {
        const store = storeWith([]);
        const renderer = rendererFor(store, async () => ({ kind: 'error', reason: 'upstream' }));
        expect(await resolveRequest(manifest, '/products/x', store, renderer)).toEqual({
            kind: 'unavailable',
            retryAfterSeconds: 2,
        });
    });

    it('behaves like build-time-only instances without a renderer', async () => {
        const store = storeWith([]);
        expect(await resolveRequest(manifest, '/products/x', store)).toEqual({ kind: 'notFound' });
    });

    it('is not found when no route matches', async () => {
        const store = storeWith([]);
        const onlyProducts: RouteManifest = { ...manifest, routes: [productRoute] };
        expect(await resolveRequest(onlyProducts, '/nope', store)).toEqual({ kind: 'notFound' });
    });
});
