import { describe, it, expect } from 'vitest';
import path from 'path';
import { parse } from 'node-html-parser';
import { validateJayFiles } from '../lib/validate';
import {
    buildRouteOracle,
    collectPublicAssets,
    checkInternalLinks,
    classifyHref,
    normalizePath,
    type RouteOracle,
} from '../lib/check-internal-links';

// DL#210 — Check 1: broken internal link validation. Tests assert on returned findings / ValidationResult
// fields, never on console output.

const fixture = path.resolve('./test/fixtures/validate/internal-links');

describe('normalizePath', () => {
    it('drops query + hash, collapses slashes, strips trailing slash', () => {
        expect(normalizePath('/a/b/')).toBe('/a/b');
        expect(normalizePath('/a//b')).toBe('/a/b');
        expect(normalizePath('/a?x=1#y')).toBe('/a');
        expect(normalizePath('/')).toBe('/');
        expect(normalizePath('')).toBe('/');
    });
});

describe('classifyHref', () => {
    it('flags degenerate placeholders', () => {
        expect(classifyHref('#')).toEqual({ kind: 'degenerate' });
        expect(classifyHref('')).toEqual({ kind: 'degenerate' });
        expect(classifyHref('   ')).toEqual({ kind: 'degenerate' });
    });

    it('skips fragments, bindings, and non-route schemes', () => {
        expect(classifyHref('#section')).toEqual({ kind: 'skip' });
        expect(classifyHref('/blog/{slug}')).toEqual({ kind: 'skip' });
        expect(classifyHref('mailto:x@y.com')).toEqual({ kind: 'skip' });
        expect(classifyHref('tel:+123')).toEqual({ kind: 'skip' });
        expect(classifyHref('javascript:void(0)')).toEqual({ kind: 'skip' });
    });

    it('skips external and relative URLs, checks root-relative', () => {
        expect(classifyHref('https://other.com/x')).toEqual({ kind: 'skip' });
        expect(classifyHref('//cdn.com/x')).toEqual({ kind: 'skip' });
        expect(classifyHref('./relative')).toEqual({ kind: 'skip' });
        expect(classifyHref('../up')).toEqual({ kind: 'skip' });
        expect(classifyHref('/about')).toEqual({ kind: 'check', targetPath: '/about' });
        expect(classifyHref('/about/?ref=1#top')).toEqual({ kind: 'check', targetPath: '/about' });
    });

    it('resolves same-origin absolute URLs against site.baseUrl', () => {
        const base = 'https://jay-framework.dev';
        expect(classifyHref('https://jay-framework.dev/docs/', base)).toEqual({
            kind: 'check',
            targetPath: '/docs',
        });
        expect(classifyHref('https://other.com/docs', base)).toEqual({ kind: 'skip' });
    });
});

describe('buildRouteOracle', () => {
    it('partitions static routes vs dynamic matchers from the pages tree', async () => {
        const oracle = await buildRouteOracle(path.join(fixture, 'pages'));
        expect([...oracle.staticUrls].sort()).toEqual(['/', '/about']);
        expect(oracle.dynamicMatchers.some((re) => re.test('/blog/first-post'))).toBe(true);
        expect(oracle.dynamicMatchers.some((re) => re.test('/about'))).toBe(false);
        // /blog/[slug] is a single param — must not match a two-segment path.
        expect(oracle.dynamicMatchers.some((re) => re.test('/blog/a/b'))).toBe(false);
    });
});

describe('collectPublicAssets', () => {
    it('collects public-folder files as root-relative URLs', async () => {
        const assets = await collectPublicAssets(path.join(fixture, 'public'));
        expect([...assets].sort()).toEqual(['/images/logo.svg']);
    });

    it('returns an empty set for a missing public folder', async () => {
        const assets = await collectPublicAssets(path.join(fixture, 'no-such-folder'));
        expect([...assets]).toEqual([]);
    });
});

describe('checkInternalLinks', () => {
    const oracle: RouteOracle = {
        staticUrls: new Set(['/', '/about']),
        dynamicMatchers: [/^\/blog\/[^/]+$/],
        selfUrlByPath: new Map(),
    };
    const assetUrls = new Set(['/images/logo.svg']);

    function page(html: string, overrides?: Record<string, Record<string, boolean | string[]>>) {
        return {
            relativePath: 'pages/page.jay-html',
            parsed: { body: parse(`<body>${html}</body>`), validationOverrides: overrides },
        };
    }

    it('flags exactly the degenerate and broken links, nothing else', () => {
        const findings = checkInternalLinks({
            parsedFiles: [
                page(`
                    <a href="/about">ok</a>
                    <a href="/images/logo.svg">ok asset</a>
                    <a href="/blog/first-post">ok dynamic</a>
                    <a href="https://other.com">skip</a>
                    <a href="#section">skip</a>
                    <a href="#">degenerate</a>
                    <a href="/does-not-exist">broken</a>
                `),
            ],
            oracle,
            assetUrls,
        });

        expect(findings.map((f) => f.message)).toEqual([
            'Anchor has a placeholder href "#" — it links nowhere and ships as a dead link.',
            'Broken internal link "/does-not-exist" — no page or public asset produces the URL "/does-not-exist".',
        ]);
    });

    it('flags a link from a page to its own route', () => {
        const projectRoot = '/project';
        const selfUrlByPath = new Map([
            [path.resolve(projectRoot, 'pages/about/page.jay-html'), '/about'],
        ]);
        const findings = checkInternalLinks({
            parsedFiles: [
                {
                    relativePath: 'pages/about/page.jay-html',
                    parsed: {
                        body: parse(`<body><a href="/about">self</a><a href="/">home</a></body>`),
                    },
                },
            ],
            oracle: { ...oracle, selfUrlByPath },
            assetUrls,
            projectRoot,
        });
        expect(findings.map((f) => f.message)).toEqual([
            `Link points to the page's own route "/about" — a self-link goes nowhere.`,
        ]);
    });

    it('respects the per-page allow-broken-links suppression', () => {
        const findings = checkInternalLinks({
            parsedFiles: [
                page(`<a href="#">x</a><a href="/nope">y</a>`, {
                    'jay-stack': { 'allow-broken-links': true },
                }),
            ],
            oracle,
            assetUrls,
        });
        expect(findings).toEqual([]);
    });
});

describe('validateJayFiles — DL#210 integration', () => {
    it('reports the degenerate and broken links as errors and marks the project invalid', async () => {
        const result = await validateJayFiles({
            path: path.join(fixture, 'pages'),
            projectRoot: fixture,
        });

        const linkErrors = result.errors.filter((e) => e.source === 'internal-links');
        expect(
            linkErrors.map((e) => ({ file: e.file, message: e.message })).sort((a, b) =>
                (a.file + a.message).localeCompare(b.file + b.message),
            ),
        ).toEqual(
            [
                {
                    file: path.join('pages', 'about', 'page.jay-html'),
                    message: `Link points to the page's own route "/about" — a self-link goes nowhere.`,
                },
                {
                    file: path.join('pages', 'page.jay-html'),
                    message:
                        'Anchor has a placeholder href "#" — it links nowhere and ships as a dead link.',
                },
                {
                    file: path.join('pages', 'page.jay-html'),
                    message:
                        'Broken internal link "/does-not-exist" — no page or public asset produces the URL "/does-not-exist".',
                },
            ].sort((a, b) => (a.file + a.message).localeCompare(b.file + b.message)),
        );
        expect(result.valid).toBe(false);
    });
});
