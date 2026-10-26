import { describe, it, expect, vi } from 'vitest';
import type { CacheEntry, MatchResult } from '../lib';
import type { ArtifactStore } from '../lib';
import type { InstanceRenderer, RefreshStart } from '../lib';
import type { RouteEntry, RouteManifest } from '../lib';

vi.mock('../lib/serve/page-parts', () => ({
    getPageParts: async () => ({
        parts: [],
        forEachInstances: [],
        headlessInstanceComponents: [],
    }),
}));

vi.mock('@jay-framework/stack-server-runtime', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@jay-framework/stack-server-runtime')>()),
    renderFastChangingData: async () => ({
        kind: 'PhaseOutput',
        rendered: {},
        carryForward: {},
        responseHeaders: { 'Cache-Control': 'public, max-age=3600', ETag: '"abc"' },
    }),
    getClientInitData: () => ({}),
}));

import { fetchPageRequest } from '../lib';

// DL#226 — fetchPageRequest serves fresh / stale / expired data and refreshes through the renderer.

const route: RouteEntry = {
    pattern: '/products/[slug]',
    segments: [
        { type: 'static', value: 'products' },
        { type: 'param', value: 'slug' },
    ],
    serverModule: 'm',
};
const manifest: RouteManifest = {
    version: '1',
    projectRoot: '/x',
    sharedManifest: {},
    routes: [route],
    actions: [],
    plugins: [],
};
const match: MatchResult = {
    route,
    params: { slug: 'a' },
    pathname: '/products/a',
    instance: {
        params: { slug: 'a' },
        cachePath: 'pre-rendered/products/[slug]/page_x.cache.json',
        serverElementPath: 'server-element.js',
        clientBundlePath: 'client.js',
    },
};

function entry(name: string, ageSeconds: number, ttl?: number, grace?: number): CacheEntry {
    return {
        slowViewState: { name },
        carryForward: {},
        renderedAt: Date.now() - ageSeconds * 1000,
        ...(ttl !== undefined && { ttl }),
        ...(grace !== undefined && { grace }),
    };
}

function storeWith(stored: CacheEntry): ArtifactStore {
    return {
        readCacheData: async () => stored,
        loadServerElement: async () => ({
            renderToStream: (viewState: any, ctx: { write: (s: string) => void }) =>
                ctx.write(`<p>${viewState.name}</p>`),
        }),
    } as unknown as ArtifactStore;
}

function rendererReturning(start: RefreshStart) {
    const calls: Array<Record<string, string>> = [];
    const renderer = {
        refresh: (_route: RouteEntry, params: Record<string, string>) => {
            calls.push(params);
            return start;
        },
    } as unknown as InstanceRenderer;
    return { renderer, calls };
}

async function serve(stored: CacheEntry, renderer?: InstanceRenderer) {
    const response = await fetchPageRequest(
        match,
        manifest,
        new URL('http://localhost/products/a'),
        storeWith(stored),
        '/',
        {},
        renderer,
    );
    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => (headers[key] = value));
    return { status: response.status, body, headers };
}

function renderedName(body: string): string | undefined {
    return /<p>(.*?)<\/p>/.exec(body)?.[1];
}

describe('fetchPageRequest freshness (DL#226)', () => {
    it('serves fresh data without refreshing, clamping cache headers to the remaining ttl', async () => {
        const { renderer, calls } = rendererReturning({ kind: 'busy' });
        const res = await serve(entry('fresh-data', 20, 60, 600), renderer);

        expect(renderedName(res.body)).toEqual('fresh-data');
        expect(calls).toEqual([]);
        expect(res.headers['cache-control']).toMatch(/^public, max-age=(39|40)$/);
        expect(res.headers['jay-freshness']).toMatch(/^fresh, 2\d{4}ms$/);
    });

    it('serves stale data immediately as no-store and starts a background refresh', async () => {
        const { renderer, calls } = rendererReturning({
            kind: 'started',
            done: new Promise(() => undefined), // never finishes: stale must not wait for it
        });
        const res = await serve(entry('old-data', 120, 60, 600), renderer);

        expect(renderedName(res.body)).toEqual('old-data');
        expect(calls).toEqual([{ slug: 'a' }]);
        expect(res.headers['cache-control']).toEqual('no-store');
        expect(res.headers['jay-freshness']).toMatch(/^stale, 12\d{4}ms$/);
    });

    it('keeps validators on old data, folding renderedAt into the ETag', async () => {
        const { renderer } = rendererReturning({ kind: 'busy' });
        const stored = entry('old-data', 120, 60, 600);
        const res = await serve(stored, renderer);

        expect(res.headers['etag']).toEqual(`"abc-${stored.renderedAt}"`);
    });

    it('awaits the refresh of an expired instance and renders the new data as fresh', async () => {
        const renewed = entry('new-data', 0, 60, 600);
        const { renderer, calls } = rendererReturning({
            kind: 'started',
            done: Promise.resolve(renewed),
        });
        const res = await serve(entry('old-data', 900, 60, 600), renderer);

        expect(renderedName(res.body)).toEqual('new-data');
        expect(calls).toEqual([{ slug: 'a' }]);
        expect(res.headers['jay-freshness']).toMatch(/^fresh, \d+ms$/);
        expect(res.headers['cache-control']).toMatch(/^public, max-age=(59|60)$/);
    });

    it('serves old data as expired when the renderer is busy', async () => {
        const { renderer } = rendererReturning({ kind: 'busy' });
        const res = await serve(entry('old-data', 900, 60, 600), renderer);

        expect(renderedName(res.body)).toEqual('old-data');
        expect(res.headers['cache-control']).toEqual('no-store');
        expect(res.headers['jay-freshness']).toMatch(/^expired, 9\d{5}ms$/);
    });

    it('serves old data as expired when the awaited refresh fails', async () => {
        const { renderer } = rendererReturning({
            kind: 'started',
            done: Promise.resolve(undefined),
        });
        const res = await serve(entry('old-data', 900, 60, 600), renderer);

        expect(renderedName(res.body)).toEqual('old-data');
        expect(res.headers['jay-freshness']).toMatch(/^expired, /);
    });

    it('serves old data without a refresh attempt when there is no renderer', async () => {
        const res = await serve(entry('old-data', 900, 60, 600));

        expect(renderedName(res.body)).toEqual('old-data');
        expect(res.headers['cache-control']).toEqual('no-store');
    });

    it('leaves headers untouched for an instance without a ttl', async () => {
        const { renderer, calls } = rendererReturning({ kind: 'busy' });
        const res = await serve(entry('forever', 100000), renderer);

        expect(renderedName(res.body)).toEqual('forever');
        expect(calls).toEqual([]);
        expect(res.headers['cache-control']).toEqual('public, max-age=3600');
        expect(res.headers['etag']).toEqual('"abc"');
        expect(res.headers['jay-freshness']).toBeUndefined();
    });
});
