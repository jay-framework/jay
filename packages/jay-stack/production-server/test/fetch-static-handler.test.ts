import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fetchStaticFile } from '../lib/serve/fetch-static-handler';

// DL#217 — static response headers: CORS + content-type for /.well-known/* agent-readiness files.

describe('fetchStaticFile headers (DL#217)', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jay-static-'));
    });
    afterEach(async () => {
        await fsp.rm(dir, { recursive: true, force: true });
    });

    async function write(relative: string, content: string | Buffer): Promise<void> {
        const full = path.join(dir, relative);
        await fsp.mkdir(path.dirname(full), { recursive: true });
        await fsp.writeFile(full, content);
    }

    it('serves /.well-known SKILL.md as markdown, CORS-open', async () => {
        await write('.well-known/agent-skills/jay/SKILL.md', '# skill');

        const res = await fetchStaticFile('/.well-known/agent-skills/jay/SKILL.md', dir);

        expect(res).not.toBeNull();
        expect(res!.headers.get('Content-Type')).toBe('text/markdown');
        expect(res!.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect(await res!.text()).toBe('# skill');
    });

    it('serves a .tar.gz skill archive as application/gzip, CORS-open', async () => {
        await write('.well-known/agent-skills/jay/jay.tar.gz', Buffer.from([0x1f, 0x8b, 0x08]));

        const res = await fetchStaticFile('/.well-known/agent-skills/jay/jay.tar.gz', dir);

        expect(res).not.toBeNull();
        expect(res!.headers.get('Content-Type')).toBe('application/gzip');
        expect(res!.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('serves the index as application/json, CORS-open', async () => {
        await write('.well-known/agent-skills/index.json', '{"skills":[]}');

        const res = await fetchStaticFile('/.well-known/agent-skills/index.json', dir);

        expect(res!.headers.get('Content-Type')).toBe('application/json');
        expect(res!.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('does NOT add CORS to a normal asset outside /.well-known', async () => {
        await write('index.html', '<!doctype html>');

        const res = await fetchStaticFile('/index.html', dir);

        expect(res!.headers.get('Content-Type')).toBe('text/html');
        expect(res!.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});
