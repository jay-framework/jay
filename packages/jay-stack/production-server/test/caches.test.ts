import { describe, it, expect } from 'vitest';
import { NegativeCache } from '../lib/serve/negative-cache';
import { SwrCache } from '../lib';

describe('NegativeCache', () => {
    it('remembers a key until its ttl passes', () => {
        const cache = new NegativeCache(1000);
        cache.add('k', 0);
        expect(cache.has('k', 999)).toEqual(true);
        expect(cache.has('k', 1000)).toEqual(false);
        expect(cache.size).toEqual(0);
    });

    it('evicts the least recently used entry beyond maxEntries', () => {
        const cache = new NegativeCache(10_000, 2);
        cache.add('a', 0);
        cache.add('b', 0);
        cache.has('a', 1); // a becomes most recent
        cache.add('c', 2);
        expect([cache.has('a', 3), cache.has('b', 3), cache.has('c', 3)]).toEqual([
            true,
            false,
            true,
        ]);
    });

    it('forgets a deleted key', () => {
        const cache = new NegativeCache(1000);
        cache.add('k', 0);
        cache.delete('k');
        expect(cache.has('k', 1)).toEqual(false);
    });
});

describe('SwrCache', () => {
    function counter(values: string[]) {
        let calls = 0;
        return {
            load: async () => values[Math.min(calls++, values.length - 1)],
            calls: () => calls,
        };
    }

    it('serves the cached value within ttl', async () => {
        let now = 0;
        const cache = new SwrCache<string>(1000, () => now);
        const { load, calls } = counter(['v1', 'v2']);
        expect(await cache.get('k', load)).toEqual('v1');
        now = 999;
        expect(await cache.get('k', load)).toEqual('v1');
        expect(calls()).toEqual(1);
    });

    it('serves the stale value past ttl and reloads in the background', async () => {
        let now = 0;
        const cache = new SwrCache<string>(1000, () => now);
        const { load, calls } = counter(['v1', 'v2']);
        await cache.get('k', load);
        now = 1000;
        expect(await cache.get('k', load)).toEqual('v1');
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(calls()).toEqual(2);
        expect(await cache.get('k', load)).toEqual('v2');
    });

    it('awaits a reload with fresh: true and shares concurrent loads', async () => {
        const cache = new SwrCache<string>(1000, () => 0);
        const { load, calls } = counter(['v1', 'v2']);
        await cache.get('k', load);
        const [a, b] = await Promise.all([cache.get('k', load, true), cache.get('k', load, true)]);
        expect([a, b]).toEqual(['v2', 'v2']);
        expect(calls()).toEqual(2);
    });

    it('keeps the old value when a background reload fails', async () => {
        let now = 0;
        const cache = new SwrCache<string>(1000, () => now);
        await cache.get('k', async () => 'v1');
        now = 2000;
        expect(
            await cache.get('k', async () => {
                throw new Error('boom');
            }),
        ).toEqual('v1');
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(await cache.get('k', async () => 'unused')).toEqual('v1');
    });

    it('invalidate forces the next get to reload', async () => {
        const cache = new SwrCache<string>(1000, () => 0);
        const { load } = counter(['v1', 'v2']);
        await cache.get('k', load);
        cache.invalidate('k');
        expect(await cache.get('k', load)).toEqual('v2');
    });
});
