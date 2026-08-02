import fs from 'node:fs/promises';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.webp': 'image/webp',
};

export async function fetchStaticFile(
    pathname: string,
    frontendDir: string,
): Promise<Response | null> {
    const normalizedBase = path.resolve(frontendDir);

    for (const candidate of [path.join(frontendDir, pathname)]) {
        const normalizedFile = path.resolve(candidate);
        if (!normalizedFile.startsWith(normalizedBase)) continue;

        try {
            const content = await fs.readFile(candidate);
            const ext = path.extname(candidate);
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            const isHashed = /[-][a-zA-Z0-9_-]{6,}\./.test(path.basename(candidate));
            const cacheControl = isHashed
                ? 'public, max-age=31536000, immutable'
                : 'public, max-age=3600';

            return new Response(content, {
                headers: {
                    'Content-Type': contentType,
                    'Content-Length': String(content.length),
                    'Cache-Control': cacheControl,
                },
            });
        } catch {
            // Not found at this path, try next
        }
    }

    return null;
}
