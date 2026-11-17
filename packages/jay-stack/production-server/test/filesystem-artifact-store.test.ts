import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FilesystemArtifactStore, CacheNotFoundError } from '../lib/serve/artifact-store';
import { deriveCachePath } from '../lib/shared/instance-key';
import type { CacheEntry, RouteEntry } from '../lib/types';

// DL#227 — the filesystem store's instance index: stat / dir scan / atomic write / unlink.

const route: RouteEntry = {
    pattern: '/blog/[slug]',
    segments: [
        { type: 'static', value: 'blog' },
        { type: 'param', value: 'slug' },
    ],
    serverModule: 'm',
    serverElementPath: 'server/blog.js',
    routeClientBundlePath: 'client/blog.js',
};
const home: RouteEntry = { pattern: '/', segments: [], serverModule: 'm' };

const entry: CacheEntry = {
    slowViewState: { title: 'Hello' },
    carryForward: { a: 1 },
    renderedAt: 1_700_000_000_000,
    ttl: 60,
    grace: 600,
};

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const items: T[] = [];
    for await (const item of iterable) items.push(item);
    return items;
}

describe('FilesystemArtifactStore instances', () => {
    let dir: string;
    let store: FilesystemArtifactStore;

    beforeEach(async () => {
        dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jay-store-'));
        store = new FilesystemArtifactStore(dir);
    });
    afterEach(async () => {
        await fsp.rm(dir, { recursive: true, force: true });
    });

    it('has no instance before it is written', async () => {
        expect(await store.getInstance(route, { slug: 'a' })).toBeUndefined();
        expect(await collect(store.listInstances(route))).toEqual([]);
    });

    it('write creates the instance at its derived path with route + params stored', async () => {
        await store.writeCacheData(route, { slug: 'a' }, entry);

        const cachePath = deriveCachePath(route.pattern, { slug: 'a' });
        expect(await store.getInstance(route, { slug: 'a' })).toEqual({
            params: { slug: 'a' },
            cachePath,
            serverElementPath: 'server/blog.js',
            clientBundlePath: 'client/blog.js',
            clientCssPath: undefined,
        });
        expect(await store.readCacheData(cachePath)).toEqual({
            ...entry,
            route: '/blog/[slug]',
            params: { slug: 'a' },
        });
        // no temp files left behind
        expect(await fsp.readdir(path.dirname(path.join(dir, cachePath)))).toEqual([
            path.basename(cachePath),
        ]);
    });

    it('lists written instances, and a write invalidates the cached listing', async () => {
        await store.writeCacheData(route, { slug: 'a' }, entry);
        expect((await collect(store.listInstances(route))).map((r) => r.params)).toEqual([
            { slug: 'a' },
        ]);

        await store.writeCacheData(route, { slug: 'b' }, entry);
        expect(
            (await collect(store.listInstances(route))).map((r) => r.params.slug).sort(),
        ).toEqual(['a', 'b']);
    });

    it('a static route has a single page.cache.json instance', async () => {
        await store.writeCacheData(home, {}, entry);
        expect(await collect(store.listInstances(home))).toEqual([
            { params: {}, cachePath: 'pre-rendered/index/page.cache.json' },
        ]);
    });

    it('serves a TTL-cached listing and re-reads with fresh: true', async () => {
        await store.writeCacheData(route, { slug: 'a' }, entry);
        await collect(store.listInstances(route));

        // another process adds an instance behind the store's back
        const other = new FilesystemArtifactStore(dir);
        await other.writeCacheData(route, { slug: 'b' }, entry);

        expect((await collect(store.listInstances(route))).map((r) => r.params.slug)).toEqual([
            'a',
        ]);
        expect(
            (await collect(store.listInstances(route, { fresh: true })))
                .map((r) => r.params.slug)
                .sort(),
        ).toEqual(['a', 'b']);
    });

    it('removeInstance deletes the data and the index membership', async () => {
        await store.writeCacheData(route, { slug: 'a' }, entry);
        await store.removeInstance(route, { slug: 'a' });

        expect(await store.getInstance(route, { slug: 'a' })).toBeUndefined();
        expect(await collect(store.listInstances(route))).toEqual([]);
        // removing again is a no-op
        await store.removeInstance(route, { slug: 'a' });
    });

    it('readCacheData throws CacheNotFoundError for a missing instance', async () => {
        await expect(
            store.readCacheData('pre-rendered/blog/[slug]/page_00000000.cache.json'),
        ).rejects.toThrow(CacheNotFoundError);
    });

    it('ignores cache files of other routes and unreadable files when listing', async () => {
        await store.writeCacheData(route, { slug: 'a' }, entry);
        const routeDir = path.join(dir, 'pre-rendered', 'blog', '[slug]');
        await fsp.writeFile(path.join(routeDir, 'page_deadbeef.cache.json'), '{ not json');
        await fsp.writeFile(
            path.join(routeDir, 'page_cafebabe.cache.json'),
            JSON.stringify({ route: '/other', params: { slug: 'z' }, slowViewState: {} }),
        );

        expect(
            (await collect(store.listInstances(route, { fresh: true }))).map((r) => r.params),
        ).toEqual([{ slug: 'a' }]);
    });
});
