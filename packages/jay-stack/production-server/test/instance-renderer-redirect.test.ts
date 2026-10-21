import { describe, it, expect } from 'vitest';
import { InstanceRenderer } from '../lib/serve/instance-renderer';
import { resolveRequest } from '../lib/serve/resolve-request';
import type { RenderInstanceFn } from '../lib/serve/render-instance';
import type { ArtifactStore } from '../lib/serve/artifact-store';
import type { RouteEntry, RouteManifest } from '../lib/types';

// DL#227 — a slow-render redirect on a miss is served as that redirect and remembered.

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

function setup() {
    const calls: string[] = [];
    const render: RenderInstanceFn = async (_r, params) => {
        calls.push(params.slug);
        return { kind: 'redirect', status: 301, location: '/products/new-slug' };
    };
    const store = {
        getInstance: async () => undefined,
        writeCacheData: async () => undefined,
    } as unknown as ArtifactStore;
    let now = 1_000;
    const renderer = new InstanceRenderer(store, { render, now: () => now });
    return { store, renderer, calls, advance: (ms: number) => (now += ms) };
}

describe('render-on-miss redirects', () => {
    it('serves the redirect and does not store an instance', async () => {
        const { store, renderer } = setup();
        expect(await resolveRequest(manifest, '/products/old-slug', store, renderer)).toEqual({
            kind: 'redirect',
            status: 301,
            location: '/products/new-slug',
        });
    });

    it('remembers the redirect for 10 minutes instead of rendering again', async () => {
        const { renderer, calls, advance } = setup();

        await renderer.renderMissing(route, { slug: 'old-slug' });
        await renderer.renderMissing(route, { slug: 'old-slug' });
        expect(calls).toEqual(['old-slug']);

        advance(10 * 60_000 + 1);
        await renderer.renderMissing(route, { slug: 'old-slug' });
        expect(calls).toEqual(['old-slug', 'old-slug']);
    });

    it('keeps serving the stored data when a known instance now redirects on refresh', async () => {
        const { renderer } = setup();
        const started = renderer.refresh(route, { slug: 'known' });
        if (started.kind !== 'started') throw new Error('expected started');
        expect(await started.done).toBeUndefined();
        // backoff, not a remembered redirect
        expect(renderer.refresh(route, { slug: 'known' }).kind).toEqual('skipped');
    });
});
