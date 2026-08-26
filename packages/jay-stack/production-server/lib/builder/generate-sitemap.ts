import fs from 'node:fs/promises';
import type { RouteManifest } from '../types';

export async function generateSitemap(
    manifest: RouteManifest,
    baseUrl: string,
    outputPath: string,
): Promise<number> {
    // Normalize baseUrl — remove trailing slash
    const base = baseUrl.replace(/\/$/, '');

    // Collect all URLs from routes x instances
    // Skip devOnly routes, skip noIndex routes
    const urls: string[] = [];

    for (const route of manifest.routes) {
        if (route.devOnly) continue;
        if (route.noIndex) continue;

        if (route.instances.length === 0) {
            // Static route with no instances — use the pattern directly
            // Only if it has no dynamic segments
            const hasDynamic = route.segments.some((s) => s.type !== 'static');
            if (!hasDynamic) {
                const urlPath = route.pattern === '/' ? '/' : route.pattern;
                urls.push(`${base}${urlPath}`);
            }
            continue;
        }

        for (const instance of route.instances) {
            const urlPath = buildUrlFromManifest(route.pattern, instance.params);
            urls.push(`${base}${urlPath}`);
        }
    }

    // Stream-write the XML to a temp file, then atomic rename
    const tmpPath = outputPath + '.tmp';
    const handle = await fs.open(tmpPath, 'w');
    try {
        await handle.write('<?xml version="1.0" encoding="UTF-8"?>\n');
        await handle.write('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n');
        for (const url of urls) {
            await handle.write(`  <url><loc>${escapeXml(url)}</loc></url>\n`);
        }
        await handle.write('</urlset>\n');
    } finally {
        await handle.close();
    }
    await fs.rename(tmpPath, outputPath);

    return urls.length;
}

function buildUrlFromManifest(pattern: string, params: Record<string, string>): string {
    return (
        pattern
            .replace(/\[\[(\w+)\]\]/g, (_, name) => params[name] || '')
            .replace(/\[\.\.\.(\w+)\]/g, (_, name) => params[name] || '')
            .replace(/\[(\w+)\]/g, (_, name) => params[name] || '')
            .replace(/\/\/+/g, '/')
            .replace(/\/$/, '') || '/'
    );
}

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
