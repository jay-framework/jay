import type { RouteManifest, PreRenderedEntry, ServerElementModule, PageModule } from '../types';
import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE_TAG_START = '<script type="application/jay-cache">';
const CACHE_TAG_END = '</script>';

export class FilesystemArtifactStore {
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

    async readPreRenderedHtml(relativePath: string): Promise<PreRenderedEntry> {
        const fullPath = path.join(this.basePath, relativePath);
        const content = await fs.readFile(fullPath, 'utf-8');

        const cachePath = fullPath.replace(/\.jay-html$/, '.cache.json');
        try {
            const cacheData = JSON.parse(await fs.readFile(cachePath, 'utf-8'));
            return {
                content,
                slowViewState: cacheData.slowViewState || {},
                carryForward: cacheData.carryForward || {},
            };
        } catch {
            return extractCacheMetadata(content);
        }
    }

    async loadServerElement(relativePath: string): Promise<ServerElementModule> {
        return this.loadModule(relativePath);
    }

    async loadPageModule(relativePath: string): Promise<PageModule> {
        return this.loadModule(relativePath);
    }

    async readRawFile(relativePath: string): Promise<string> {
        const fullPath = path.join(this.basePath, relativePath);
        return await fs.readFile(fullPath, 'utf-8');
    }

    getAssetPath(relativePath: string): string {
        return path.join(this.basePath, relativePath);
    }

    getBuildDir(): string {
        return this.basePath;
    }

    private async loadModule(relativePath: string): Promise<any> {
        const fullPath = path.join(this.basePath, relativePath);
        const stat = await fs.stat(fullPath);
        const cached = this.moduleCache.get(relativePath);
        if (cached && stat.mtimeMs === cached.mtime) {
            return cached.module;
        }
        const mod = await import(fullPath + '?t=' + stat.mtimeMs);
        this.moduleCache.set(relativePath, { module: mod, mtime: stat.mtimeMs });
        return mod;
    }
}

function extractCacheMetadata(fileContent: string): PreRenderedEntry {
    const startIdx = fileContent.indexOf(CACHE_TAG_START);
    if (startIdx === -1) {
        return { content: fileContent, slowViewState: {}, carryForward: {} };
    }

    const jsonStart = startIdx + CACHE_TAG_START.length;
    const endIdx = fileContent.indexOf(CACHE_TAG_END, jsonStart);
    if (endIdx === -1) {
        return { content: fileContent, slowViewState: {}, carryForward: {} };
    }

    const jsonStr = fileContent.substring(jsonStart, endIdx);
    const metadata = JSON.parse(jsonStr);

    const tagEnd = endIdx + CACHE_TAG_END.length;
    const afterTag = fileContent[tagEnd] === '\n' ? tagEnd + 1 : tagEnd;
    const content = fileContent.substring(0, startIdx) + fileContent.substring(afterTag);

    return {
        content,
        slowViewState: metadata.slowViewState || {},
        carryForward: metadata.carryForward || {},
    };
}
