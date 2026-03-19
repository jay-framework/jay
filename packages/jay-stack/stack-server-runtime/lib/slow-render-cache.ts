import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const CACHE_TAG_START = '<script type="application/jay-cache">';
const CACHE_TAG_END = '</script>';

/**
 * Cache entry for pre-rendered jay-html
 */
export interface SlowRenderCacheEntry {
    /** Path to the pre-rendered jay-html file on disk */
    preRenderedPath: string;
    /** Pre-rendered jay-html content with cache metadata tag stripped */
    preRenderedContent: string;
    /** Slow ViewState that was baked into the jay-html */
    slowViewState: object;
    /** CarryForward data from slow rendering (passed to fast phase) */
    carryForward: object;
    /** Source jay-html path (for debugging) */
    sourcePath: string;
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
 * Embeds cache metadata into jay-html content as a <script> tag.
 */
function embedCacheMetadata(
    jayHtmlContent: string,
    slowViewState: object,
    carryForward: object,
    sourcePath: string,
): string {
    const metadata = JSON.stringify({ slowViewState, carryForward, sourcePath });
    return `${CACHE_TAG_START}${metadata}${CACHE_TAG_END}\n${jayHtmlContent}`;
}

/**
 * Extracts cache metadata from a jay-html file's content.
 * Returns the metadata and the content with the tag stripped, or undefined if no tag found.
 */
function extractCacheMetadata(
    fileContent: string,
):
    | { content: string; slowViewState: object; carryForward: object; sourcePath: string }
    | undefined {
    const startIdx = fileContent.indexOf(CACHE_TAG_START);
    if (startIdx === -1) return undefined;

    const jsonStart = startIdx + CACHE_TAG_START.length;
    const endIdx = fileContent.indexOf(CACHE_TAG_END, jsonStart);
    if (endIdx === -1) return undefined;

    const jsonStr = fileContent.substring(jsonStart, endIdx);
    const metadata = JSON.parse(jsonStr);

    // Strip the entire tag line including the trailing newline
    const tagEnd = endIdx + CACHE_TAG_END.length;
    const afterTag = fileContent[tagEnd] === '\n' ? tagEnd + 1 : tagEnd;
    const content = fileContent.substring(0, startIdx) + fileContent.substring(afterTag);

    return {
        content,
        slowViewState: metadata.slowViewState,
        carryForward: metadata.carryForward,
        sourcePath: metadata.sourcePath,
    };
}

/**
 * Filesystem-based cache for pre-rendered jay-html files.
 *
 * Cache metadata (slowViewState, carryForward) is embedded in the pre-rendered
 * file as a `<script type="application/jay-cache">` tag. This means:
 * - Cache survives dev server restart
 * - The filesystem is the single source of truth
 * - No in-memory map needed for cache entries
 *
 * On read, the script tag is extracted and stripped before returning content.
 */
export class SlowRenderCache {
    /** Maps source jay-html path → set of pre-rendered file paths (for invalidation) */
    private pathToFiles = new Map<string, Set<string>>();
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
     * Get a cached pre-rendered jay-html entry by reading from disk.
     * Returns undefined if the cache file doesn't exist or has no metadata tag.
     */
    async get(
        jayHtmlPath: string,
        params: Record<string, string>,
    ): Promise<SlowRenderCacheEntry | undefined> {
        const preRenderedPath = this.computeCachePath(jayHtmlPath, params);

        let fileContent: string;
        try {
            fileContent = await fs.readFile(preRenderedPath, 'utf-8');
        } catch {
            return undefined;
        }

        const extracted = extractCacheMetadata(fileContent);
        if (!extracted) return undefined;

        // Register in pathToFiles for invalidation (lazy recovery on restart)
        this.trackFile(jayHtmlPath, preRenderedPath);

        return {
            preRenderedPath,
            preRenderedContent: extracted.content,
            slowViewState: extracted.slowViewState,
            carryForward: extracted.carryForward,
            sourcePath: extracted.sourcePath,
        };
    }

    /**
     * Store a pre-rendered jay-html entry.
     * Embeds metadata as a <script> tag and writes to disk.
     * Returns the full cache entry with stripped content.
     */
    async set(
        jayHtmlPath: string,
        params: Record<string, string>,
        preRenderedJayHtml: string,
        slowViewState: object,
        carryForward: object,
    ): Promise<SlowRenderCacheEntry> {
        const preRenderedPath = this.computeCachePath(jayHtmlPath, params);

        // Embed metadata in the file
        const fileContent = embedCacheMetadata(
            preRenderedJayHtml,
            slowViewState,
            carryForward,
            jayHtmlPath,
        );

        // Ensure directory exists and write to disk
        await fs.mkdir(path.dirname(preRenderedPath), { recursive: true });
        await fs.writeFile(preRenderedPath, fileContent, 'utf-8');

        // Track for invalidation
        this.trackFile(jayHtmlPath, preRenderedPath);

        return {
            preRenderedPath,
            preRenderedContent: preRenderedJayHtml,
            slowViewState,
            carryForward,
            sourcePath: jayHtmlPath,
        };
    }

    /**
     * Check if a pre-rendered entry exists for the given path and params
     */
    async has(jayHtmlPath: string, params: Record<string, string>): Promise<boolean> {
        const preRenderedPath = this.computeCachePath(jayHtmlPath, params);
        try {
            await fs.access(preRenderedPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Invalidate all cached entries for a given jay-html source path.
     * Deletes cached files from disk.
     */
    async invalidate(jayHtmlPath: string): Promise<void> {
        // Delete tracked files
        const files = this.pathToFiles.get(jayHtmlPath);
        if (files) {
            for (const filePath of files) {
                try {
                    await fs.unlink(filePath);
                } catch {
                    // File may not exist
                }
            }
            this.pathToFiles.delete(jayHtmlPath);
        }

        // Also scan the cache directory for matching files (handles startup case
        // where pathToFiles is not yet populated from a previous server session)
        await this.scanAndDeleteCacheFiles(jayHtmlPath);
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
        for (const files of this.pathToFiles.values()) {
            for (const filePath of files) {
                try {
                    await fs.unlink(filePath);
                } catch {
                    // File may not exist
                }
            }
        }
        this.pathToFiles.clear();

        // Also clean the entire cache directory
        try {
            await fs.rm(this.cacheDir, { recursive: true, force: true });
        } catch {
            // Directory may not exist
        }
    }

    /**
     * Get all cached jay-html paths (for debugging/monitoring)
     */
    getCachedPaths(): string[] {
        return Array.from(this.pathToFiles.keys());
    }

    /**
     * Compute the cache file path for a given jay-html path and params.
     */
    private computeCachePath(jayHtmlPath: string, params: Record<string, string>): string {
        const relativePath = path.relative(this.pagesRoot, jayHtmlPath);
        const dir = path.dirname(relativePath);
        const basename = path.basename(relativePath, '.jay-html');
        const paramsHash = hashParams(params);
        const cacheFileName = `${basename}${paramsHash}.jay-html`;
        return path.join(this.cacheDir, dir, cacheFileName);
    }

    /**
     * Track a pre-rendered file path for invalidation.
     */
    private trackFile(jayHtmlPath: string, preRenderedPath: string): void {
        if (!this.pathToFiles.has(jayHtmlPath)) {
            this.pathToFiles.set(jayHtmlPath, new Set());
        }
        this.pathToFiles.get(jayHtmlPath)!.add(preRenderedPath);
    }

    /**
     * Scan the cache directory for files matching a route and delete them.
     * Handles the startup case where pathToFiles is not populated from a previous session.
     */
    private async scanAndDeleteCacheFiles(jayHtmlPath: string): Promise<void> {
        const relativePath = path.relative(this.pagesRoot, jayHtmlPath);
        const dir = path.dirname(relativePath);
        const basename = path.basename(relativePath, '.jay-html');
        const cacheSubDir = path.join(this.cacheDir, dir);

        try {
            const files = await fs.readdir(cacheSubDir);
            for (const file of files) {
                // Match files like "page.jay-html" or "page_abc123.jay-html"
                if (file.startsWith(basename) && file.endsWith('.jay-html')) {
                    try {
                        await fs.unlink(path.join(cacheSubDir, file));
                    } catch {
                        // Ignore
                    }
                }
            }
        } catch {
            // Directory may not exist
        }
    }
}
