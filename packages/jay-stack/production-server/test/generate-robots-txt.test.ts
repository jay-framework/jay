import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateRobotsTxtIfAbsent } from '../lib/builder/generate-robots-txt';

// DL#214 — robots.txt generate-if-absent.

describe('generateRobotsTxtIfAbsent (DL#214)', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jay-robots-'));
    });
    afterEach(async () => {
        await fsp.rm(dir, { recursive: true, force: true });
    });

    it('writes a default with a Sitemap line when baseUrl is set', async () => {
        const out = path.join(dir, 'robots.txt');
        const written = await generateRobotsTxtIfAbsent(out, 'https://example.com/');
        expect(written).toBe(true);
        expect(await fsp.readFile(out, 'utf8')).toBe(
            'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n',
        );
    });

    it('omits the Sitemap line when baseUrl is absent', async () => {
        const out = path.join(dir, 'robots.txt');
        await generateRobotsTxtIfAbsent(out, undefined);
        expect(await fsp.readFile(out, 'utf8')).toBe('User-agent: *\nAllow: /\n');
    });

    it('does not clobber an author-provided robots.txt', async () => {
        const out = path.join(dir, 'robots.txt');
        await fsp.writeFile(out, 'User-agent: *\nDisallow: /secret\n');
        const written = await generateRobotsTxtIfAbsent(out, 'https://example.com');
        expect(written).toBe(false);
        expect(await fsp.readFile(out, 'utf8')).toBe('User-agent: *\nDisallow: /secret\n');
    });
});
