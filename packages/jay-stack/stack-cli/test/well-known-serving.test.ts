import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setWellKnownHeaders } from '../lib/server';

/**
 * DL#214 — regression guard for the dev `.well-known` serving fix.
 *
 * `stack-cli/lib/server.ts` serves `public/` via `express.static(publicPath, { dotfiles: 'allow' })`.
 * Express defaults to `dotfiles: 'ignore'`, which 404s `/.well-known/*` (a dotdir). This test locks
 * in the contract that the `allow` option serves it while the default does not — if someone drops
 * the option thinking it redundant, this fails.
 */

async function serve(
    dir: string,
    opts?: Parameters<typeof express.static>[1],
): Promise<{
    port: number;
    close: () => Promise<void>;
}> {
    const app = express();
    app.use(express.static(dir, opts));
    const server: Server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    return {
        port,
        close: () => new Promise((resolve) => server.close(() => resolve())),
    };
}

describe('.well-known static serving (DL#214)', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jay-wk-'));
        await fsp.mkdir(path.join(dir, '.well-known', 'agent-skills', 'jay'), { recursive: true });
        await fsp.writeFile(path.join(dir, '.well-known', 'ard.json'), '{"entries":[]}');
        await fsp.writeFile(
            path.join(dir, '.well-known', 'agent-skills', 'jay', 'SKILL.md'),
            '# skill',
        );
        await fsp.writeFile(path.join(dir, 'index.html'), '<!doctype html>');
    });
    afterEach(async () => {
        await fsp.rm(dir, { recursive: true, force: true });
    });

    it('serves /.well-known/* with dotfiles: "allow" (the dev fix)', async () => {
        const { port, close } = await serve(dir, { dotfiles: 'allow' });
        try {
            const res = await fetch(`http://127.0.0.1:${port}/.well-known/ard.json`);
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ entries: [] });
        } finally {
            await close();
        }
    });

    it('404s /.well-known/* with the Express default (documents the gap)', async () => {
        const { port, close } = await serve(dir);
        try {
            const res = await fetch(`http://127.0.0.1:${port}/.well-known/ard.json`);
            expect(res.status).toBe(404);
        } finally {
            await close();
        }
    });

    // DL#217 — the real dev serving uses setWellKnownHeaders for CORS + content-type.
    it('serves /.well-known SKILL.md CORS-open as markdown (DL#217)', async () => {
        const { port, close } = await serve(dir, {
            dotfiles: 'allow',
            setHeaders: setWellKnownHeaders,
        });
        try {
            const res = await fetch(
                `http://127.0.0.1:${port}/.well-known/agent-skills/jay/SKILL.md`,
            );
            expect(res.status).toBe(200);
            expect(res.headers.get('access-control-allow-origin')).toBe('*');
            expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
        } finally {
            await close();
        }
    });

    it('does NOT add CORS to assets outside /.well-known (DL#217)', async () => {
        const { port, close } = await serve(dir, {
            dotfiles: 'allow',
            setHeaders: setWellKnownHeaders,
        });
        try {
            const res = await fetch(`http://127.0.0.1:${port}/index.html`);
            expect(res.status).toBe(200);
            expect(res.headers.get('access-control-allow-origin')).toBeNull();
        } finally {
            await close();
        }
    });
});
