import { describe, it, expect } from 'vitest';
import { InstanceRenderer } from '../lib/serve/instance-renderer';
import type { RenderInstanceFn, RenderInstanceOutcome } from '../lib/serve/render-instance';
import type { ArtifactStore } from '../lib/serve/artifact-store';
import type { CacheEntry, RouteEntry } from '../lib/types';

// DL#226/#227 — single-flight, fixed slots without a queue, backoff, negative cache.

const route: RouteEntry = {
    pattern: '/products/[slug]',
    segments: [
        { type: 'static', value: 'products' },
        { type: 'param', value: 'slug' },
    ],
    serverModule: 'm',
};

function entryFor(slug: string): CacheEntry {
    return { slowViewState: { slug }, carryForward: {}, renderedAt: 1, ttl: 60, grace: 600 };
}

interface Gate {
    promise: Promise<void>;
    open: () => void;
}
function gate(): Gate {
    let open!: () => void;
    const promise = new Promise<void>((resolve) => (open = resolve));
    return { promise, open };
}

function fakeStore() {
    const writes: Array<{ slug: string; entry: CacheEntry }> = [];
    const removed: string[] = [];
    const store = {
        writeCacheData: async (
            _r: RouteEntry,
            params: Record<string, string>,
            entry: CacheEntry,
        ) => {
            writes.push({ slug: params.slug, entry });
        },
        removeInstance: async (_r: RouteEntry, params: Record<string, string>) => {
            removed.push(params.slug);
        },
    } as unknown as ArtifactStore;
    return { store, writes, removed };
}

function countingRender(
    behavior: (slug: string) => Promise<RenderInstanceOutcome> | RenderInstanceOutcome,
) {
    const calls: string[] = [];
    const render: RenderInstanceFn = async (_route, params) => {
        calls.push(params.slug);
        return behavior(params.slug);
    };
    return { render, calls };
}

describe('InstanceRenderer.refresh', () => {
    it('shares one render between concurrent refreshes of the same instance', async () => {
        const { store, writes } = fakeStore();
        const g = gate();
        const { render, calls } = countingRender(async (slug) => {
            await g.promise;
            return { kind: 'rendered', entry: entryFor(slug) };
        });
        const renderer = new InstanceRenderer(store, { render, concurrency: 1 });

        const first = renderer.refresh(route, { slug: 'a' });
        const second = renderer.refresh(route, { slug: 'a' });
        const third = renderer.refresh(route, { slug: 'a' });
        expect([first.kind, second.kind, third.kind]).toEqual(['started', 'joined', 'joined']);

        g.open();
        const results = await Promise.all(
            [first, second, third].map((r) =>
                r.kind === 'busy' || r.kind === 'skipped' ? undefined : r.done,
            ),
        );
        expect(calls).toEqual(['a']);
        expect(writes.map((w) => w.slug)).toEqual(['a']);
        expect(results).toEqual([entryFor('a'), entryFor('a'), entryFor('a')]);
    });

    it('answers busy — never queues — when all slots hold other instances', async () => {
        const { store } = fakeStore();
        const g = gate();
        const { render, calls } = countingRender(async (slug) => {
            await g.promise;
            return { kind: 'rendered', entry: entryFor(slug) };
        });
        const renderer = new InstanceRenderer(store, { render, concurrency: 2 });

        expect(renderer.refresh(route, { slug: 'a' }).kind).toEqual('started');
        expect(renderer.refresh(route, { slug: 'b' }).kind).toEqual('started');
        expect(renderer.refresh(route, { slug: 'c' }).kind).toEqual('busy');
        // a follower of a running instance still joins without a slot
        expect(renderer.refresh(route, { slug: 'a' }).kind).toEqual('joined');
        expect(calls).toEqual(['a', 'b']);
        expect(renderer.stats()).toEqual({
            slotsInUse: 2,
            inFlight: 2,
            busy: 1,
            negativeEntries: 0,
        });

        g.open();
    });

    it('releases the slot when the render finishes', async () => {
        const { store } = fakeStore();
        const { render } = countingRender((slug) => ({ kind: 'rendered', entry: entryFor(slug) }));
        const renderer = new InstanceRenderer(store, { render, concurrency: 1 });

        const first = renderer.refresh(route, { slug: 'a' });
        if (first.kind !== 'started') throw new Error('expected started');
        await first.done;
        expect(renderer.refresh(route, { slug: 'b' }).kind).toEqual('started');
    });

    it('backs off after a failure, then retries', async () => {
        const { store } = fakeStore();
        let now = 1_000_000;
        const { render, calls } = countingRender(() => ({ kind: 'error', reason: 'boom' }));
        const renderer = new InstanceRenderer(store, { render, now: () => now });

        const failed = renderer.refresh(route, { slug: 'a' });
        if (failed.kind !== 'started') throw new Error('expected started');
        expect(await failed.done).toBeUndefined();

        expect(renderer.refresh(route, { slug: 'a' }).kind).toEqual('skipped');
        now += 60_000;
        expect(renderer.refresh(route, { slug: 'a' }).kind).toEqual('started');
        expect(calls).toEqual(['a', 'a']);
    });

    it('is skipped when the store is read-only', () => {
        const renderer = new InstanceRenderer({} as ArtifactStore, {
            render: countingRender(() => ({ kind: 'notFound' })).render,
        });
        expect(renderer.refresh(route, { slug: 'a' }).kind).toEqual('skipped');
    });

    it('removes a known instance whose item is gone', async () => {
        const { store, removed } = fakeStore();
        const { render } = countingRender(() => ({ kind: 'notFound' }));
        const renderer = new InstanceRenderer(store, { render });

        const started = renderer.refresh(route, { slug: 'gone' });
        if (started.kind !== 'started') throw new Error('expected started');
        expect(await started.done).toBeUndefined();
        expect(removed).toEqual(['gone']);
    });
});

describe('InstanceRenderer.renderMissing', () => {
    it('renders once for concurrent requests of the same unknown instance', async () => {
        const { store, writes } = fakeStore();
        const g = gate();
        const { render, calls } = countingRender(async (slug) => {
            await g.promise;
            return { kind: 'rendered', entry: entryFor(slug) };
        });
        const renderer = new InstanceRenderer(store, { render, concurrency: 1 });

        const pending = [1, 2, 3, 4, 5].map(() => renderer.renderMissing(route, { slug: 'new' }));
        g.open();
        const outcomes = await Promise.all(pending);

        expect(calls).toEqual(['new']);
        expect(writes.map((w) => w.slug)).toEqual(['new']);
        expect(outcomes.map((o) => o.kind)).toEqual([
            'rendered',
            'rendered',
            'rendered',
            'rendered',
            'rendered',
        ]);
        expect(outcomes[0]).toEqual({
            kind: 'rendered',
            instance: {
                params: { slug: 'new' },
                cachePath: 'pre-rendered/products/[slug]/page_' + hashOf('new') + '.cache.json',
                serverElementPath: '',
                clientBundlePath: '',
                clientCssPath: undefined,
            },
        });
    });

    it('is unavailable (503) without queueing when no slot is free', async () => {
        const { store } = fakeStore();
        const g = gate();
        const { render, calls } = countingRender(async (slug) => {
            await g.promise;
            return { kind: 'rendered', entry: entryFor(slug) };
        });
        const renderer = new InstanceRenderer(store, { render, concurrency: 1 });

        const running = renderer.renderMissing(route, { slug: 'a' });
        expect(await renderer.renderMissing(route, { slug: 'b' })).toEqual({
            kind: 'unavailable',
            retryAfterSeconds: 2,
        });
        expect(calls).toEqual(['a']);
        g.open();
        await running;
    });

    it('negative-caches a real 404 and answers from memory afterwards', async () => {
        const { store } = fakeStore();
        const { render, calls } = countingRender(() => ({ kind: 'notFound' }));
        let now = 5_000;
        const renderer = new InstanceRenderer(store, { render, now: () => now });

        expect(await renderer.renderMissing(route, { slug: 'ghost' })).toEqual({
            kind: 'notFound',
        });
        expect(await renderer.renderMissing(route, { slug: 'ghost' })).toEqual({
            kind: 'notFound',
        });
        expect(calls).toEqual(['ghost']);
        expect(renderer.isKnownMissing(route, { slug: 'ghost' })).toEqual(true);

        now += 10 * 60_000 + 1;
        expect(await renderer.renderMissing(route, { slug: 'ghost' })).toEqual({
            kind: 'notFound',
        });
        expect(calls).toEqual(['ghost', 'ghost']);
    });

    it('never negative-caches transient errors', async () => {
        const { store } = fakeStore();
        let now = 1_000;
        const { render, calls } = countingRender(() => ({ kind: 'error', reason: 'upstream 500' }));
        const renderer = new InstanceRenderer(store, { render, now: () => now });

        expect((await renderer.renderMissing(route, { slug: 'x' })).kind).toEqual('unavailable');
        expect(renderer.isKnownMissing(route, { slug: 'x' })).toEqual(false);
        // inside the failure backoff no new render is started
        expect((await renderer.renderMissing(route, { slug: 'x' })).kind).toEqual('unavailable');
        expect(calls).toEqual(['x']);
        now += 60_000;
        await renderer.renderMissing(route, { slug: 'x' });
        expect(calls).toEqual(['x', 'x']);
    });

    it('times out to unavailable while the render keeps going', async () => {
        const { store, writes } = fakeStore();
        const g = gate();
        const { render } = countingRender(async (slug) => {
            await g.promise;
            return { kind: 'rendered', entry: entryFor(slug) };
        });
        const renderer = new InstanceRenderer(store, { render, missTimeoutMs: 10 });

        expect((await renderer.renderMissing(route, { slug: 'slow' })).kind).toEqual('unavailable');
        g.open();
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(writes.map((w) => w.slug)).toEqual(['slow']);
    });

    it('behaves as not found when the store is read-only', async () => {
        const renderer = new InstanceRenderer({} as ArtifactStore, {
            render: countingRender(() => ({ kind: 'notFound' })).render,
        });
        expect(await renderer.renderMissing(route, { slug: 'a' })).toEqual({ kind: 'notFound' });
    });
});

import { createHash } from 'node:crypto';
function hashOf(slug: string): string {
    return createHash('md5').update(JSON.stringify({ slug })).digest('hex').substring(0, 8);
}
