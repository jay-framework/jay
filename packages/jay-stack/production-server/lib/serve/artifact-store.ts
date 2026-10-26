import type {
    RouteManifest,
    RouteEntry,
    CacheEntry,
    ServerElementModule,
    InstanceEntry,
    InstanceRef,
} from '../types';
import type { PagePartsConfig } from '../builder/load-production-parts';
import { deriveCachePath, routeInstanceDir, synthesizeInstance } from '../shared/instance-key';
import { SwrCache, DEFAULT_LIST_TTL_MS } from './swr-cache';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Thrown by `readCacheData` when an instance has no stored data (Design Log #227). */
export class CacheNotFoundError extends Error {
    constructor(public readonly cachePath: string) {
        super(`Cache data not found: ${cachePath}`);
        this.name = 'CacheNotFoundError';
    }
}

export interface ListInstancesOptions {
    /** Bypass the listing cache and re-read from the backing store. */
    fresh?: boolean;
}

/**
 * Interface for reading (and, optionally, updating) build artifacts at serve time (DL#143).
 * FilesystemArtifactStore is the default implementation.
 * BaaS deployments provide a custom implementation that fetches from cloud storage.
 *
 * Instances (Design Log #227): the manifest holds route structure only. A store resolves and
 * enumerates the instances of a route itself; an instance's cache item is its own index entry, so
 * writing one creates the instance and removing one deletes it — callers never touch a list.
 */
export interface ArtifactStore {
    readManifest(): Promise<RouteManifest>;
    /** Throws {@link CacheNotFoundError} when the instance has no stored data. */
    readCacheData(relativePath: string): Promise<CacheEntry>;
    readPagePartsConfig(relativePath: string): Promise<PagePartsConfig>;
    loadServerElement(relativePath: string): Promise<ServerElementModule>;
    loadModule(modulePath: string, local?: boolean): Promise<any>;
    getAssetPath(relativePath: string): string;
    getBuildDir(): string;

    /** Resolve the instance of `route` for `params`; `undefined` when it does not exist. */
    getInstance(
        route: RouteEntry,
        params: Record<string, string>,
    ): Promise<InstanceEntry | undefined>;

    /**
     * Enumerate the instances of a route (sitemap, llms.txt, rebuild-all). Stores page through
     * their backend and may serve a TTL-cached listing; `{ fresh: true }` re-reads.
     */
    listInstances(route: RouteEntry, options?: ListInstancesOptions): AsyncIterable<InstanceRef>;

    /**
     * Upsert an instance's data at its derived path and keep the store's instance index consistent
     * (Design Log #226/#227). Absent → the store is read-only: refresh / render-on-miss are disabled.
     */
    writeCacheData?(
        route: RouteEntry,
        params: Record<string, string>,
        entry: CacheEntry,
    ): Promise<void>;

    /** Remove an instance's data and index membership. */
    removeInstance?(route: RouteEntry, params: Record<string, string>): Promise<void>;

    /** Re-read an entry bypassing any local copy (shared stores: another server may have refreshed it). */
    readCacheDataFresh?(relativePath: string): Promise<CacheEntry>;
}

/** The JSON stored for an instance: data + freshness + its own index fields. */
export function serializeCacheEntry(
    route: Pick<RouteEntry, 'pattern'>,
    params: Record<string, string>,
    entry: CacheEntry,
): string {
    return JSON.stringify({
        slowViewState: entry.slowViewState,
        carryForward: entry.carryForward,
        ...(entry.renderedAt !== undefined && { renderedAt: entry.renderedAt }),
        ...(entry.ttl !== undefined && { ttl: entry.ttl }),
        ...(entry.grace !== undefined && { grace: entry.grace }),
        route: route.pattern,
        params,
    });
}

/** Parse stored cache JSON into a CacheEntry. */
export function parseCacheEntry(json: string): CacheEntry {
    const cacheData = JSON.parse(json);
    return {
        slowViewState: cacheData.slowViewState || {},
        carryForward: cacheData.carryForward || {},
        ...(cacheData.renderedAt !== undefined && { renderedAt: cacheData.renderedAt }),
        ...(cacheData.ttl !== undefined && { ttl: cacheData.ttl }),
        ...(cacheData.grace !== undefined && { grace: cacheData.grace }),
        ...(cacheData.route !== undefined && { route: cacheData.route }),
        ...(cacheData.params !== undefined && { params: cacheData.params }),
    };
}

export interface FilesystemArtifactStoreOptions {
    /** Lifetime of cached instance listings (default 10 min). */
    listTtlMs?: number;
    /** Clock, for tests. */
    now?: () => number;
}

export class FilesystemArtifactStore implements ArtifactStore {
    private manifestCache?: { manifest: RouteManifest; mtime: number };
    private metadataMtime?: number;
    private moduleCache = new Map<string, { module: any; mtime: number }>();
    private readonly listCache: SwrCache<InstanceRef[]>;

    constructor(
        private basePath: string,
        options: FilesystemArtifactStoreOptions = {},
    ) {
        this.listCache = new SwrCache<InstanceRef[]>(
            options.listTtlMs ?? DEFAULT_LIST_TTL_MS,
            options.now ?? Date.now,
        );
    }

    async readManifest(): Promise<RouteManifest> {
        const metadataPath = path.join(this.basePath, 'build-metadata.json');
        const manifestPath = path.join(this.basePath, 'route-manifest.json');

        try {
            const metaStat = await fs.stat(metadataPath);
            if (this.manifestCache && this.metadataMtime === metaStat.mtimeMs) {
                return this.manifestCache.manifest;
            }
            this.metadataMtime = metaStat.mtimeMs;
        } catch {
            // No metadata file — fall through to read manifest directly
        }

        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
        const manifestStat = await fs.stat(manifestPath);
        this.manifestCache = { manifest, mtime: manifestStat.mtimeMs };
        return manifest;
    }

    async readCacheData(relativePath: string): Promise<CacheEntry> {
        const fullPath = path.join(this.basePath, relativePath);
        let content: string;
        try {
            content = await fs.readFile(fullPath, 'utf-8');
        } catch (err: any) {
            if (err?.code === 'ENOENT') throw new CacheNotFoundError(relativePath);
            throw err;
        }
        return parseCacheEntry(content);
    }

    async readPagePartsConfig(relativePath: string): Promise<PagePartsConfig> {
        return JSON.parse(await fs.readFile(path.join(this.basePath, relativePath), 'utf-8'));
    }

    async loadServerElement(relativePath: string): Promise<ServerElementModule> {
        return this.loadModule(relativePath);
    }

    getAssetPath(relativePath: string): string {
        return path.join(this.basePath, relativePath);
    }

    getBuildDir(): string {
        return this.basePath;
    }

    async getInstance(
        route: RouteEntry,
        params: Record<string, string>,
    ): Promise<InstanceEntry | undefined> {
        const cachePath = deriveCachePath(route.pattern, params);
        try {
            await fs.stat(path.join(this.basePath, cachePath));
        } catch (err: any) {
            if (err?.code === 'ENOENT') return undefined;
            throw err;
        }
        return synthesizeInstance(route, params);
    }

    async *listInstances(
        route: RouteEntry,
        options?: ListInstancesOptions,
    ): AsyncIterable<InstanceRef> {
        const refs = await this.listCache.get(
            route.pattern,
            () => this.scanInstances(route),
            options?.fresh === true,
        );
        for (const ref of refs) yield ref;
    }

    async writeCacheData(
        route: RouteEntry,
        params: Record<string, string>,
        entry: CacheEntry,
    ): Promise<void> {
        const cachePath = deriveCachePath(route.pattern, params);
        const fullPath = path.join(this.basePath, cachePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        // tmp + rename: readers see the old or the new file, never a partial one.
        const tmpPath = `${fullPath}.${process.pid}.${Date.now().toString(36)}.tmp`;
        await fs.writeFile(tmpPath, serializeCacheEntry(route, params, entry), 'utf-8');
        await fs.rename(tmpPath, fullPath);
        this.listCache.invalidate(route.pattern);
    }

    async removeInstance(route: RouteEntry, params: Record<string, string>): Promise<void> {
        const fullPath = path.join(this.basePath, deriveCachePath(route.pattern, params));
        try {
            await fs.unlink(fullPath);
        } catch (err: any) {
            if (err?.code !== 'ENOENT') throw err;
        }
        this.listCache.invalidate(route.pattern);
    }

    async loadModule(modulePath: string, local?: boolean): Promise<any> {
        if (local !== false) {
            const fullPath = path.isAbsolute(modulePath)
                ? modulePath
                : path.join(this.basePath, modulePath);
            try {
                const stat = await fs.stat(fullPath);
                const cached = this.moduleCache.get(modulePath);
                if (cached && stat.mtimeMs === cached.mtime) {
                    return cached.module;
                }
                const mod = await import(fullPath + '?t=' + stat.mtimeMs);
                this.moduleCache.set(modulePath, { module: mod, mtime: stat.mtimeMs });
                return mod;
            } catch {
                if (local) throw new Error(`Local module not found: ${fullPath}`);
            }
        }
        return import(modulePath);
    }

    /** Scan a route's directory for `*.cache.json` and read each instance's params. */
    private async scanInstances(route: RouteEntry): Promise<InstanceRef[]> {
        const dir = routeInstanceDir(route.pattern);
        let files: string[];
        try {
            files = await fs.readdir(path.join(this.basePath, dir));
        } catch (err: any) {
            if (err?.code === 'ENOENT') return [];
            throw err;
        }
        const refs: InstanceRef[] = [];
        for (const file of files.filter((f) => f.endsWith('.cache.json')).sort()) {
            try {
                const content = await fs.readFile(path.join(this.basePath, dir, file), 'utf-8');
                const { params, route: storedRoute } = JSON.parse(content);
                if (!params || (storedRoute !== undefined && storedRoute !== route.pattern))
                    continue;
                refs.push({ params, cachePath: `${dir}/${file}` });
            } catch {
                // unreadable / partially written file — skip
            }
        }
        return refs;
    }
}
