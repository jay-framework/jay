import type { IncomingMessage, ServerResponse } from 'node:http';
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
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
};

export async function handleStaticRequest(
    req: IncomingMessage,
    res: ServerResponse,
    basePath: string,
    urlPrefix: string,
): Promise<boolean> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    if (!url.pathname.startsWith(urlPrefix)) return false;

    const relativePath = url.pathname.slice(urlPrefix.length);
    const filePath = path.join(basePath, relativePath);

    const normalizedBase = path.resolve(basePath);
    const normalizedFile = path.resolve(filePath);
    if (!normalizedFile.startsWith(normalizedBase)) {
        res.writeHead(403);
        res.end('Forbidden');
        return true;
    }

    try {
        const content = await fs.readFile(filePath);
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        const isHashed = /[-][a-zA-Z0-9_-]{6,}\./.test(path.basename(filePath));
        const cacheControl = isHashed
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': content.length,
            'Cache-Control': cacheControl,
        });
        res.end(content);
        return true;
    } catch {
        return false;
    }
}
