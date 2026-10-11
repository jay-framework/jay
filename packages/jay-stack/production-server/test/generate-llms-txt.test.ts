import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateLlmsTxt } from '../lib/builder/generate-llms-txt';
import type { RouteManifest } from '../lib/types';

// DL#214 — llms.txt generation from the build manifest + per-instance slow ViewState.

function staticPart(value: string) {
    return { kind: 'static' as const, value };
}
function bindingPart(value: string) {
    return { kind: 'binding' as const, value };
}

describe('generateLlmsTxt (DL#214)', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jay-llms-'));
        await fsp.mkdir(path.join(dir, 'pre-rendered'), { recursive: true });
        await fsp.writeFile(
            path.join(dir, 'pre-rendered', 'blog-hello.cache.json'),
            JSON.stringify({
                slowViewState: { post: { title: 'Hello World', excerpt: 'A first post' } },
                carryForward: {},
            }),
        );
    });
    afterEach(async () => {
        await fsp.rm(dir, { recursive: true, force: true });
    });

    const manifest: RouteManifest = {
        version: '1',
        projectRoot: '/x',
        sharedManifest: {},
        actions: [],
        plugins: [],
        routes: [
            {
                pattern: '/',
                segments: [{ type: 'static', value: '' }],
                serverModule: 'm',
                headMeta: {
                    title: [staticPart('Home')],
                    meta: [{ name: 'description', content: [staticPart('Welcome to Acme')] }],
                    links: [],
                },
                instances: [],
            },
            {
                pattern: '/blog/[slug]',
                segments: [
                    { type: 'static', value: 'blog' },
                    { type: 'param', value: 'slug' },
                ],
                serverModule: 'm',
                headMeta: {
                    title: [bindingPart('post.title')],
                    meta: [{ name: 'description', content: [bindingPart('post.excerpt')] }],
                    links: [],
                },
                instances: [
                    {
                        params: { slug: 'hello' },
                        cachePath: 'pre-rendered/blog-hello.cache.json',
                        serverElementPath: 's',
                        clientBundlePath: 'c',
                    },
                ],
            },
            {
                pattern: '/admin',
                segments: [{ type: 'static', value: 'admin' }],
                serverModule: 'm',
                devOnly: true,
                instances: [],
            },
            {
                pattern: '/secret',
                segments: [{ type: 'static', value: 'secret' }],
                serverModule: 'm',
                noIndex: true,
                instances: [],
            },
        ],
    } as RouteManifest;

    it('generates a grouped index with titles + descriptions, skipping devOnly/noIndex', async () => {
        const out = path.join(dir, 'llms.txt');
        const count = await generateLlmsTxt(
            manifest,
            { name: 'Acme', description: 'We build things', baseUrl: 'https://acme.com/' },
            dir,
            out,
        );
        expect(count).toBe(2);
        expect(await fsp.readFile(out, 'utf8')).toBe(
            [
                '# Acme',
                '',
                '> We build things',
                '',
                '## Home',
                '',
                '- [Home](https://acme.com/): Welcome to Acme',
                '',
                '## blog',
                '',
                '- [Hello World](https://acme.com/blog/hello): A first post',
                '',
            ].join('\n'),
        );
    });

    it('resolves bound titles against the instance slow ViewState', async () => {
        const out = path.join(dir, 'llms.txt');
        await generateLlmsTxt(manifest, { name: 'Acme', baseUrl: 'https://acme.com' }, dir, out);
        const content = await fsp.readFile(out, 'utf8');
        expect(content.includes('[Hello World](https://acme.com/blog/hello)')).toBe(true);
        expect(content.includes('{post.title}')).toBe(false);
    });
});
