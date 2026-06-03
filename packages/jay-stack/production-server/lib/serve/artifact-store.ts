import type { RouteManifest, CacheEntry, ServerElementModule } from '../types';
import type { PagePartsConfig } from '../builder/load-production-parts';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Interface for reading build artifacts at serve time (DL#143).
 * FilesystemArtifactStore is the default implementation.
 * BaaS deployments provide a custom implementation that fetches from cloud storage.
 */
export interface ArtifactStore {
    readManifest(): Promise<RouteManifest>;
    readCacheData(relativePath: string): Promise<CacheEntry>;
    readPagePartsConfig(relativePath: string): Promise<PagePartsConfig>;
    loadServerElement(relativePath: string): Promise<ServerElementModule>;
    loadModule(modulePath: string, local?: boolean): Promise<any>;
    getAssetPath(relativePath: string): string;
    getBuildDir(): string;
}

export class FilesystemArtifactStore implements ArtifactStore {
    private manifestCache?: { manifest: RouteManifest; mtime: number };
    private metadataMtime?: number;
    private moduleCache = new Map<string, { module: any; mtime: number }>();

    constructor(private basePath: string) {}

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
        const cacheData = JSON.parse(await fs.readFile(fullPath, 'utf-8'));
        return {
            slowViewState: cacheData.slowViewState || {},
            carryForward: cacheData.carryForward || {},
        };
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
}
