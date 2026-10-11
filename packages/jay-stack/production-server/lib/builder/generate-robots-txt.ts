import fs from 'node:fs/promises';

/**
 * Generate a default `robots.txt` (DL#214) — **only when the author has not provided one**
 * (mirrors the sitemap "don't clobber a static file" convention). Returns true if written,
 * false if an author file already exists at `outputPath`.
 *
 * The `Sitemap:` line is emitted only when `baseUrl` is set; without it, the sitemap URL is
 * unknown (and the existing `site.baseUrl` validation warning already fires).
 */
export async function generateRobotsTxtIfAbsent(
    outputPath: string,
    baseUrl: string | undefined,
): Promise<boolean> {
    try {
        await fs.access(outputPath);
        return false; // author-provided file wins
    } catch {
        // absent — generate the default
    }

    const base = baseUrl?.replace(/\/$/, '');
    const lines = ['User-agent: *', 'Allow: /'];
    if (base) lines.push(`Sitemap: ${base}/sitemap.xml`);

    const tmpPath = outputPath + '.tmp';
    await fs.writeFile(tmpPath, lines.join('\n') + '\n');
    await fs.rename(tmpPath, outputPath);
    return true;
}
