import { describe, it, expect } from 'vitest';
import path from 'path';
import { parse } from 'node-html-parser';
import type { RouteManifest } from '@jay-framework/production-server';
import type { JayHtmlHeadMeta } from '@jay-framework/stack-server-runtime';
import { validateJayFiles } from '../lib/validate';
import {
    discoverBuildBackendDir,
    loadBuildManifest,
    buildBuildOracle,
    loadSlowViewState,
    checkTemplateLinksAgainstBuild,
    resolveContentHref,
    checkContentLinks,
    checkInstanceMeta,
    isBuildStale,
} from '../lib/check-build-output';

// DL#211 — Tier 2 Build-Output Validation (`jay-stack validate --tier-2`). Tests assert on returned findings /
// ValidationResult fields, never on console output.

const fixture = path.resolve('./test/fixtures/validate/build-output');
const backendV2 = path.join(fixture, 'build', 'v0.2.0', 'backend');
const backendV1 = path.join(fixture, 'build', 'v0.1.0', 'backend');

describe('discoverBuildBackendDir', () => {
    it('picks the highest build version backend under the project', async () => {
        expect(await discoverBuildBackendDir(fixture)).toBe(backendV2);
    });

    it('accepts an explicit backend dir', async () => {
        expect(await discoverBuildBackendDir(fixture, 'build/v0.1.0/backend')).toBe(backendV1);
    });

    it('accepts an explicit build-version root and finds its backend', async () => {
        expect(await discoverBuildBackendDir(fixture, 'build/v0.1.0')).toBe(backendV1);
    });

    it('returns null when nothing is found', async () => {
        expect(await discoverBuildBackendDir(fixture, 'build/does-not-exist')).toBe(null);
    });
});

describe('loadBuildManifest', () => {
    it('reads the manifest and metadata', async () => {
        const loaded = await loadBuildManifest(backendV2);
        expect(loaded?.manifest.version).toBe('0.2.0');
        expect(loaded?.metadata?.version).toBe('0.2.0');
        expect(loaded?.metadata?.instanceCount).toBe(2);
    });

    it('returns null for a backend with no manifest', async () => {
        expect(await loadBuildManifest(path.join(fixture, 'nope'))).toBe(null);
    });
});

describe('buildBuildOracle', () => {
    it('collects concrete URLs and per-instance entries', async () => {
        const loaded = await loadBuildManifest(backendV2);
        const oracle = buildBuildOracle(loaded!.manifest, backendV2);

        expect([...oracle.urls].sort()).toEqual(['/', '/about', '/blog/hello', '/blog/world']);
        expect(oracle.instances.map((i) => i.url).sort()).toEqual(['/blog/hello', '/blog/world']);

        const hello = oracle.instances.find((i) => i.url === '/blog/hello')!;
        expect(hello.cacheAbsPath).toBe(
            path.join(backendV2, 'pre-rendered', 'blog-hello.cache.json'),
        );
        expect(hello.headMeta?.title?.[0]).toEqual({ kind: 'binding', value: 'post.title' });
    });
});

describe('loadSlowViewState', () => {
    it('reads slowViewState from a cache file', async () => {
        const vs = await loadSlowViewState(
            path.join(backendV2, 'pre-rendered', 'blog-hello.cache.json'),
        );
        expect(vs).toEqual({
            post: { title: 'Hello World' },
            body: '<p>Links: <a href="/blog/world">next</a> and <a href="/blog/ghost">missing</a></p>',
        });
    });

    it('returns {} for an unreadable cache file', async () => {
        expect(await loadSlowViewState(path.join(backendV2, 'no-such.cache.json'))).toEqual({});
    });
});

describe('resolveContentHref', () => {
    it('skips fragments, bindings, and external/scheme URLs', () => {
        expect(resolveContentHref('#foo', '/blog/hello')).toEqual({ kind: 'skip' });
        expect(resolveContentHref('', '/blog/hello')).toEqual({ kind: 'skip' });
        expect(resolveContentHref('{post.url}', '/blog/hello')).toEqual({ kind: 'skip' });
        expect(resolveContentHref('https://ext.com/x', '/blog/hello')).toEqual({ kind: 'skip' });
        expect(resolveContentHref('mailto:a@b.com', '/blog/hello')).toEqual({ kind: 'skip' });
    });

    it('checks root-relative links directly', () => {
        expect(resolveContentHref('/about', '/blog/hello')).toEqual({
            kind: 'check',
            targetPath: '/about',
        });
    });

    it('resolves relative links against the instance URL directory', () => {
        expect(resolveContentHref('../about', '/blog/hello')).toEqual({
            kind: 'check',
            targetPath: '/about',
        });
        expect(resolveContentHref('./sibling', '/blog/hello')).toEqual({
            kind: 'check',
            targetPath: '/blog/sibling',
        });
        expect(resolveContentHref('bare', '/blog/hello')).toEqual({
            kind: 'check',
            targetPath: '/blog/bare',
        });
    });
});

describe('checkTemplateLinksAgainstBuild', () => {
    const buildUrls = new Set(['/about', '/blog/hello']);
    const assetUrls = new Set<string>();
    const dynamicMatchers = [/^\/blog\/[^/]+$/];

    function page(html: string, overrides?: Record<string, Record<string, boolean | string[]>>) {
        return {
            relativePath: 'pages/page.jay-html',
            parsed: { body: parse(`<body>${html}</body>`), validationOverrides: overrides },
        };
    }

    it('flags only deferred dynamic-slug links the build never produced', () => {
        const findings = checkTemplateLinksAgainstBuild({
            parsedFiles: [
                page(`
                    <a href="/about">static ok</a>
                    <a href="/blog/hello">produced slug ok</a>
                    <a href="/blog/ghost">unproduced slug — error</a>
                    <a href="/does-not-exist">static broken — Check 1's job, skip here</a>
                `),
            ],
            buildUrls,
            assetUrls,
            dynamicMatchers,
        });

        expect(findings.map((f) => ({ message: f.message, severity: f.severity }))).toEqual([
            {
                message:
                    'Broken link "/blog/ghost" — matches a dynamic route but "/blog/ghost" is not among the URLs this build produces.',
                severity: 'error',
            },
        ]);
    });

    it('respects the per-page allow-broken-links suppression', () => {
        const findings = checkTemplateLinksAgainstBuild({
            parsedFiles: [
                page(`<a href="/blog/ghost">x</a>`, {
                    'jay-stack': { 'allow-broken-links': true },
                }),
            ],
            buildUrls,
            assetUrls,
            dynamicMatchers,
        });
        expect(findings).toEqual([]);
    });
});

describe('checkContentLinks', () => {
    it('flags broken links found in slow content as warnings, deduped', () => {
        const findings = checkContentLinks({
            instanceUrl: '/blog/hello',
            slowViewState: {
                body: '<a href="/blog/ghost">x</a><a href="/blog/hello">ok</a><a href="/blog/ghost">dup</a>',
                nested: { more: '<a href="/missing">y</a>' },
            },
            buildUrls: new Set(['/blog/hello']),
            assetUrls: new Set<string>(),
        });

        expect(findings.map((f) => ({ message: f.message, severity: f.severity }))).toEqual([
            {
                message:
                    'Broken link "/blog/ghost" in rendered content of /blog/hello — resolves to "/blog/ghost", which this build does not produce.',
                severity: 'warning',
            },
            {
                message:
                    'Broken link "/missing" in rendered content of /blog/hello — resolves to "/missing", which this build does not produce.',
                severity: 'warning',
            },
        ]);
    });

    it('resolves relative content links against the instance URL', () => {
        const findings = checkContentLinks({
            instanceUrl: '/blog/world',
            slowViewState: { body: '<a href="../blog/hello">prev</a>' },
            buildUrls: new Set(['/blog/hello']),
            assetUrls: new Set<string>(),
        });
        expect(findings).toEqual([]);
    });
});

describe('checkInstanceMeta', () => {
    const headMeta = (title: JayHtmlHeadMeta['title']): JayHtmlHeadMeta => ({
        title,
        meta: [{ name: 'description', content: [{ kind: 'static', value: 'A fine description' }] }],
        links: [],
    });

    it('returns nothing for well-formed static meta', () => {
        const findings = checkInstanceMeta({
            instanceUrl: '/blog/hello',
            headMeta: headMeta([{ kind: 'static', value: 'A Good Title' }]),
            slowViewState: {},
        });
        expect(findings).toEqual([]);
    });

    it('warns on an empty resolved title (DL#189 — fast-bound fields are empty at slow)', () => {
        const findings = checkInstanceMeta({
            instanceUrl: '/blog/world',
            headMeta: headMeta([{ kind: 'binding', value: 'post.title' }]),
            slowViewState: { post: { title: '' } },
        });
        expect(findings.map((f) => ({ message: f.message, severity: f.severity }))).toEqual([
            { message: '<title> for /blog/world is empty.', severity: 'warning' },
        ]);
    });

    it('errors on an unresolved binding leftover', () => {
        const findings = checkInstanceMeta({
            instanceUrl: '/blog/x',
            headMeta: headMeta([{ kind: 'binding', value: 'missing.field' }]),
            slowViewState: {},
        });
        expect(findings.map((f) => ({ message: f.message, severity: f.severity }))).toEqual([
            {
                message:
                    '<title> for /blog/x resolves to "{missing.field}" — an unresolved binding was not produced by slow render.',
                severity: 'error',
            },
        ]);
    });

    it('warns on an over-long title', () => {
        const longTitle = 'x'.repeat(70);
        const findings = checkInstanceMeta({
            instanceUrl: '/blog/x',
            headMeta: headMeta([{ kind: 'static', value: longTitle }]),
            slowViewState: {},
        });
        expect(findings.map((f) => ({ message: f.message, severity: f.severity }))).toEqual([
            { message: '<title> for /blog/x is 70 chars (recommend ≤ 60).', severity: 'warning' },
        ]);
    });

    it('returns nothing when the route has no headMeta', () => {
        expect(checkInstanceMeta({ instanceUrl: '/x', slowViewState: {} })).toEqual([]);
    });
});

describe('isBuildStale', () => {
    it('is true when source is newer than the build', () => {
        const metadata = {
            version: '1',
            sourceHash: 'h',
            buildTimestamp: '2020-01-01T00:00:00.000Z',
            nodeVersion: 'v20',
            instanceCount: 0,
        };
        expect(isBuildStale(metadata, Date.parse('2021-01-01T00:00:00.000Z'))).toBe(true);
        expect(isBuildStale(metadata, Date.parse('2019-01-01T00:00:00.000Z'))).toBe(false);
    });

    it('is false when metadata is missing', () => {
        expect(isBuildStale(null, Date.now())).toBe(false);
    });
});

describe('validateJayFiles — DL#211 Tier 2 (--tier-2) integration', () => {
    it('reports deferred-link errors, content-link warnings, and meta warnings', async () => {
        const result = await validateJayFiles({
            path: path.join(fixture, 'pages'),
            projectRoot: fixture,
            tier2: true,
        });

        const buildErrors = result.errors
            .filter((e) => e.source === 'build-output')
            .map((e) => ({ file: e.file, message: e.message }));
        expect(buildErrors).toEqual([
            {
                file: path.join('pages', 'page.jay-html'),
                message:
                    'Broken link "/blog/ghost" — matches a dynamic route but "/blog/ghost" is not among the URLs this build produces.',
            },
        ]);

        const buildWarnings = result.warnings
            .filter((w) => w.source === 'build-output')
            .map((w) => ({ file: w.file, message: w.message }))
            .sort((a, b) => (a.file + a.message).localeCompare(b.file + b.message));
        expect(buildWarnings).toEqual(
            [
                {
                    file: '/blog/hello',
                    message:
                        'Broken link "/blog/ghost" in rendered content of /blog/hello — resolves to "/blog/ghost", which this build does not produce.',
                },
                {
                    file: '/blog/world',
                    message: '<title> for /blog/world is empty.',
                },
            ].sort((a, b) => (a.file + a.message).localeCompare(b.file + b.message)),
        );
    });
});
