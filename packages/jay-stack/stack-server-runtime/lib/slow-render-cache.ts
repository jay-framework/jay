import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Cache entry for pre-rendered jay-html
 */
export interface SlowRenderCacheEntry {
    /** Path to the pre-rendered jay-html file on disk */
    preRenderedPath: string;
    /** Slow ViewState that was baked into the jay-html */
    slowViewState: object;
    /** CarryForward data from slow rendering (passed to fast phase) */
    carryForward: object;
    /** Timestamp when this entry was created */
    createdAt: number;
    /** Source jay-html path (for debugging) */
    sourcePath: string;
}

/**
 * Cache key type for pre-rendered jay-html
 * Format: `jayHtmlPath:JSON.stringify(params)`
 */
type CacheKey = string;

/**
 * Generates a cache key from jay-html path and URL params
 */
function makeCacheKey(jayHtmlPath: string, params: Record<string, string>): CacheKey {
    const sortedParams = Object.keys(params)
        .sort()
        .reduce(
            (acc, key) => {
                acc[key] = params[key];
                return acc;
            },
            {} as Record<string, string>,
        );
    return `${jayHtmlPath}:${JSON.stringify(sortedParams)}`;
}

/**
 * Generates a stable hash for URL params (used in file names)
 */
function hashParams(params: Record<string, string>): string {
    const sortedParams = Object.keys(params)
        .sort()
        .reduce(
            (acc, key) => {
                acc[key] = params[key];
                return acc;
            },
            {} as Record<string, string>,
        );
    const json = JSON.stringify(sortedParams);
    if (json === '{}') return '';
    return '_' + crypto.createHash('md5').update(json).digest('hex').substring(0, 8);
}

/**
 * Cache for pre-rendered jay-html files.
 *
 * This cache stores jay-html content that has been transformed with slow-phase
 * data baked in. The key insight is that since slow ViewState is embedded directly
 * into the jay-html, we don't need to pass it to the client - only fast and
 * interactive ViewState is sent.
 *
 * Pre-rendered files are written to disk so Vite can pick them up and compile them.
 */
export class SlowRenderCache {
    private cache = new Map<CacheKey, SlowRenderCacheEntry>();
    private pathToKeys = new Map<string, Set<CacheKey>>();
    private readonly cacheDir: string;
    private readonly pagesRoot: string;

    /**
     * @param cacheDir - Directory where pre-rendered jay-html files are stored
     * @param pagesRoot - Root directory of the pages (for relative path calculation)
     */
    constructor(cacheDir: string, pagesRoot: string) {
        this.cacheDir = cacheDir;
        this.pagesRoot = pagesRoot;
    }

    /**
     * Get a cached pre-rendered jay-html entry
     */
    get(jayHtmlPath: string, params: Record<string, string>): SlowRenderCacheEntry | undefined {
        const key = makeCacheKey(jayHtmlPath, params);
        return this.cache.get(key);
    }

    /**
     * Store a pre-rendered jay-html entry in the cache.
     * Writes the pre-rendered content to disk and stores metadata in memory.
     */
    async set(
        jayHtmlPath: string,
        params: Record<string, string>,
        preRenderedJayHtml: string,
        slowViewState: object,
        carryForward: object,
    ): Promise<string> {
        const key = makeCacheKey(jayHtmlPath, params);

        // Calculate the cache file path
        // e.g., /project/src/pages/products/page.jay-html -> products/page_abc123.jay-html
        const relativePath = path.relative(this.pagesRoot, jayHtmlPath);
        const dir = path.dirname(relativePath);
        const basename = path.basename(relativePath, '.jay-html');
        const paramsHash = hashParams(params);
        const cacheFileName = `${basename}${paramsHash}.jay-html`;
        const preRenderedPath = path.join(this.cacheDir, dir, cacheFileName);

        // Ensure the directory exists
        await fs.mkdir(path.dirname(preRenderedPath), { recursive: true });

        // Write the pre-rendered content to disk
        await fs.writeFile(preRenderedPath, preRenderedJayHtml, 'utf-8');

        // Track which keys belong to which source path (for invalidation)
        if (!this.pathToKeys.has(jayHtmlPath)) {
            this.pathToKeys.set(jayHtmlPath, new Set());
        }
        this.pathToKeys.get(jayHtmlPath)!.add(key);

        const entry: SlowRenderCacheEntry = {
            preRenderedPath,
            slowViewState,
            carryForward,
            createdAt: Date.now(),
            sourcePath: jayHtmlPath,
        };
        this.cache.set(key, entry);

        return preRenderedPath;
    }

    /**
     * Check if a pre-rendered entry exists for the given path and params
     */
    has(jayHtmlPath: string, params: Record<string, string>): boolean {
        const key = makeCacheKey(jayHtmlPath, params);
        return this.cache.has(key);
    }

    /**
     * Invalidate all cached entries for a given jay-html source path.
     * This is called when the source file changes.
     * Also deletes the cached files from disk.
     */
    async invalidate(jayHtmlPath: string): Promise<void> {
        const keys = this.pathToKeys.get(jayHtmlPath);
        if (keys) {
            for (const key of keys) {
                const entry = this.cache.get(key);
                if (entry) {
                    // Delete the cached file from disk
                    try {
                        await fs.unlink(entry.preRenderedPath);
                    } catch {
                        // File may not exist, ignore
                    }
                }
                this.cache.delete(key);
            }
            this.pathToKeys.delete(jayHtmlPath);
        }
    }

    /**
     * Invalidate all entries that depend on a changed file.
     * The changedPath could be:
     * - A jay-html file itself
     * - A component file (page.ts)
     * - Any other dependency
     *
     * @param changedPath - Absolute path to the changed file
     * @param resolveDependencies - Optional function to resolve which jay-html files depend on the changed file
     */
    async invalidateByDependency(
        changedPath: string,
        resolveDependencies?: (changedPath: string) => string[],
    ): Promise<void> {
        // If it's a jay-html file, invalidate it directly
        if (changedPath.endsWith('.jay-html')) {
            await this.invalidate(changedPath);
            return;
        }

        // For other files (like page.ts), use the resolver if provided
        if (resolveDependencies) {
            const dependentPaths = resolveDependencies(changedPath);
            for (const depPath of dependentPaths) {
                await this.invalidate(depPath);
            }
        }
    }

    /**
     * Clear all cached entries and delete cached files from disk
     */
    async clear(): Promise<void> {
        for (const entry of this.cache.values()) {
            try {
                await fs.unlink(entry.preRenderedPath);
            } catch {
                // File may not exist, ignore
            }
        }
        this.cache.clear();
        this.pathToKeys.clear();
    }

    /**
     * Get the number of cached entries
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * Get all cached jay-html paths (for debugging/monitoring)
     */
    getCachedPaths(): string[] {
        return Array.from(this.pathToKeys.keys());
    }
}
