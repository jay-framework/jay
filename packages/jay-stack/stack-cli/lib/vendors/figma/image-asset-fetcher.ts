import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { ImportIRDocument, ImportIRNode, ImportIRImageRef } from './import-ir';

export interface ImageFetchOptions {
    devServerUrl: string;
    publicFolder: string;
    maxImageBytesPerAsset?: number;
    maxImageBytesTotal?: number;
    maxImageAssets?: number;
    concurrency?: number;
}

export interface ImageManifestEntry {
    nodeId: string;
    imageId: string;
    scaleMode: string;
    sourceUrl: string;
}

export interface ImageFetchResult {
    imageManifest: ImageManifestEntry[];
    warnings: string[];
    totalBytesSaved: number;
    urlToImageId: Map<string, string>;
}

const SUPPORTED_MIMES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
]);

function collectImageRefs(
    node: ImportIRNode,
    refs: Array<{ nodeId: string; ref: ImportIRImageRef }>,
): void {
    if (node.image?.imageRef) {
        refs.push({ nodeId: node.id, ref: node.image.imageRef });
    }
    if (node.style?.backgroundImageRef) {
        refs.push({ nodeId: node.id, ref: node.style.backgroundImageRef });
    }
    for (const child of node.children || []) {
        collectImageRefs(child, refs);
    }
}

function collectDemoImageUrls(node: ImportIRNode, urls: Set<string>): void {
    if (node.demoItems) {
        for (const item of node.demoItems) {
            for (const url of Object.values(item.imageOverrides)) {
                if (url) urls.add(url);
            }
        }
    }
    for (const child of node.children || []) {
        collectDemoImageUrls(child, urls);
    }
}

function resolveUrl(sourceUrl: string, devServerUrl: string): string {
    if (sourceUrl.startsWith('data:')) return sourceUrl;
    if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) return sourceUrl;
    if (sourceUrl.startsWith('//')) return `https:${sourceUrl}`;
    // Relative URL — resolve against dev server
    const base = devServerUrl.endsWith('/') ? devServerUrl.slice(0, -1) : devServerUrl;
    const urlPath = sourceUrl.startsWith('/') ? sourceUrl : `/${sourceUrl}`;
    return `${base}${urlPath}`;
}

async function fetchImageBytes(
    url: string,
    maxBytes: number,
): Promise<{ bytes: Buffer; mimeType: string } | { error: string }> {
    try {
        if (url.startsWith('data:')) {
            const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
            if (!match) return { error: 'Invalid data URI format' };
            const [, mimeType, b64] = match;
            const bytes = Buffer.from(b64, 'base64');
            if (bytes.length > maxBytes)
                return { error: `Data URI exceeds ${maxBytes} byte limit (${bytes.length})` };
            return { bytes, mimeType };
        }

        const response = await fetch(url, {
            signal: AbortSignal.timeout(15000),
            headers: { Accept: 'image/*' },
        });

        if (!response.ok) return { error: `HTTP ${response.status} ${response.statusText}` };

        const contentType = response.headers.get('content-type') || '';
        const mimeType = contentType.split(';')[0].trim().toLowerCase();
        if (!SUPPORTED_MIMES.has(mimeType)) {
            return { error: `Unsupported MIME type: ${mimeType}` };
        }

        const arrayBuffer = await response.arrayBuffer();
        const bytes = Buffer.from(arrayBuffer);
        if (bytes.length > maxBytes)
            return { error: `Image exceeds ${maxBytes} byte limit (${bytes.length})` };

        return { bytes, mimeType };
    } catch (err) {
        return { error: err instanceof Error ? err.message : 'Unknown fetch error' };
    }
}

/**
 * Fetches images referenced in the IR, saves them to {publicFolder}/images/,
 * and updates IR nodes with importImageId references.
 */
export async function fetchAndSaveImages(
    ir: ImportIRDocument,
    options: ImageFetchOptions,
): Promise<ImageFetchResult> {
    const maxPerAsset = options.maxImageBytesPerAsset ?? 8 * 1024 * 1024;
    const maxTotal = options.maxImageBytesTotal ?? 30 * 1024 * 1024;
    const maxAssets = options.maxImageAssets ?? 64;
    const concurrency = options.concurrency ?? 6;

    const allRefs: Array<{ nodeId: string; ref: ImportIRImageRef }> = [];
    collectImageRefs(ir.root, allRefs);

    // Also collect demo image URLs (repeater demo item overrides)
    const demoImageUrls = new Set<string>();
    collectDemoImageUrls(ir.root, demoImageUrls);

    if (allRefs.length === 0 && demoImageUrls.size === 0) {
        return { imageManifest: [], warnings: [], totalBytesSaved: 0, urlToImageId: new Map() };
    }

    // Deduplicate by resolved URL
    const urlToRefs = new Map<string, Array<{ nodeId: string; ref: ImportIRImageRef }>>();
    for (const entry of allRefs) {
        const resolved = resolveUrl(entry.ref.sourceUrl, options.devServerUrl);
        const existing = urlToRefs.get(resolved) || [];
        existing.push(entry);
        urlToRefs.set(resolved, existing);
    }

    // Include demo image URLs in the fetch pool (no IR ref to write back to)
    for (const demoUrl of demoImageUrls) {
        const resolved = resolveUrl(demoUrl, options.devServerUrl);
        if (!urlToRefs.has(resolved)) {
            urlToRefs.set(resolved, []);
        }
    }

    const imagesDir = path.join(path.resolve(options.publicFolder), 'images');
    await fs.promises.mkdir(imagesDir, { recursive: true });

    const warnings: string[] = [];
    const imageManifest: ImageManifestEntry[] = [];
    let totalBytes = 0;
    let assetCount = 0;

    // Content hash → imageId cache for dedup
    const hashToImageId = new Map<string, string>();
    // Resolved URL → imageId (for demo image lookups)
    const urlToImageIdMap = new Map<string, string>();

    const uniqueUrls = [...urlToRefs.keys()];
    console.log(
        `[ImageFetcher] Fetching ${uniqueUrls.length} unique images (${allRefs.length} total refs)...`,
    );

    // Process in batches for bounded concurrency
    for (let i = 0; i < uniqueUrls.length; i += concurrency) {
        if (assetCount >= maxAssets) {
            warnings.push(`IMAGE_BUDGET_EXCEEDED: Stopped after ${maxAssets} assets`);
            break;
        }

        const batch = uniqueUrls.slice(i, i + concurrency);
        const results = await Promise.all(
            batch.map(async (resolvedUrl) => {
                const result = await fetchImageBytes(resolvedUrl, maxPerAsset);
                return { resolvedUrl, result };
            }),
        );

        for (const { resolvedUrl, result } of results) {
            const refs = urlToRefs.get(resolvedUrl) || [];

            if ('error' in result) {
                warnings.push(`IMAGE_FETCH_FAILED: ${resolvedUrl} — ${result.error}`);
                continue;
            }

            if (totalBytes + result.bytes.length > maxTotal) {
                warnings.push(
                    `IMAGE_BUDGET_EXCEEDED: Total size would exceed ${maxTotal} bytes, skipping ${resolvedUrl}`,
                );
                continue;
            }

            // Compute content hash for dedup
            const hash = createHash('sha256').update(result.bytes).digest('hex').slice(0, 16);
            let imageId = hashToImageId.get(hash);

            if (!imageId) {
                imageId = `import-${hash}`;
                const ext = result.mimeType === 'image/jpeg' ? '.jpg' : '.png';
                const filename = `${imageId}${ext}`;
                const imagePath = path.join(imagesDir, filename);

                // Save if not already on disk
                if (!fs.existsSync(imagePath)) {
                    await fs.promises.writeFile(imagePath, result.bytes);
                    console.log(
                        `[ImageFetcher] Saved: ${imagePath} (${result.bytes.length} bytes)`,
                    );
                }

                hashToImageId.set(hash, imageId);
                totalBytes += result.bytes.length;
                assetCount++;
            }

            // Map resolved URL → imageId (for demo image lookups and general use)
            urlToImageIdMap.set(resolvedUrl, imageId);

            // Update all IR refs pointing to this URL
            for (const { nodeId, ref } of refs) {
                ref.importImageId = imageId;
                imageManifest.push({
                    nodeId,
                    imageId,
                    scaleMode: ref.scaleMode,
                    sourceUrl: ref.sourceUrl,
                });
            }
        }
    }

    console.log(
        `[ImageFetcher] Done: ${assetCount} assets saved, ${imageManifest.length} refs, ${totalBytes} bytes total, ${urlToImageIdMap.size} URL mappings`,
    );

    return { imageManifest, warnings, totalBytesSaved: totalBytes, urlToImageId: urlToImageIdMap };
}
