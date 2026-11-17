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

    it('skips bindings and non-route schemes', () => {
        expect(classifyHref('/blog/{slug}')).toEqual({ kind: 'skip' });
        expect(classifyHref('mailto:x@y.com')).toEqual({ kind: 'skip' });
        expect(classifyHref('tel:+123')).toEqual({ kind: 'skip' });
        expect(classifyHref('javascript:void(0)')).toEqual({ kind: 'skip' });
    });

    it('classifies same-page fragments (DL#210 v2)', () => {
        expect(classifyHref('#section')).toEqual({ kind: 'localFragment', fragment: 'section' });
        expect(classifyHref('#top')).toEqual({ kind: 'localFragment', fragment: 'top' });
    });

    it('classifies todo: markers, capturing the note (DL#210 v2)', () => {
        expect(classifyHref('todo:/pricing')).toEqual({ kind: 'todo', note: '/pricing' });
        expect(classifyHref('todo: build the pricing page')).toEqual({
            kind: 'todo',
            note: 'build the pricing page',
        });
        expect(classifyHref('todo:')).toEqual({ kind: 'todo', note: '' });
    });

    it('skips external and relative URLs, checks root-relative (carrying the fragment)', () => {
        expect(classifyHref('https://other.com/x')).toEqual({ kind: 'skip' });
        expect(classifyHref('//cdn.com/x')).toEqual({ kind: 'skip' });
        expect(classifyHref('./relative')).toEqual({ kind: 'skip' });
        expect(classifyHref('../up')).toEqual({ kind: 'skip' });
        expect(classifyHref('/about')).toEqual({ kind: 'check', targetPath: '/about' });
        expect(classifyHref('/about/?ref=1#top')).toEqual({
            kind: 'check',
            targetPath: '/about',
            fragment: 'top',
        });
        expect(classifyHref('/about#team')).toEqual({
            kind: 'check',
            targetPath: '/about',
            fragment: 'team',
        });
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
            'Anchor <a href="#"> has a placeholder href "#" — it links nowhere and ships as a dead link.',
            'Broken internal link in anchor <a href="/does-not-exist"> — no page or public asset produces the URL "/does-not-exist".',
        ]);
    });

    it('flags a self-link as a WARNING, suppressible per-anchor with jay-allow-self-link (DL#210 v2)', () => {
        const projectRoot = '/project';
        const selfUrlByPath = new Map([
            [path.resolve(projectRoot, 'pages/about/page.jay-html'), '/about'],
        ]);
        const findings = checkInternalLinks({
            parsedFiles: [
                {
                    relativePath: 'pages/about/page.jay-html',
                    parsed: {
                        body: parse(
                            `<body>
                                <a href="/about">self</a>
                                <a href="/about" jay-allow-self-link>intentional self</a>
                                <a href="/">home</a>
                            </body>`,
                        ),
                    },
                },
            ],
            oracle: { ...oracle, selfUrlByPath },
            assetUrls,
            projectRoot,
        });
        expect(findings).toEqual([
            {
                file: 'pages/about/page.jay-html',
                severity: 'warning',
                message: `Anchor <a href="/about"> points to the page's own route "/about" — a self-link goes nowhere.`,
                suggestion: `Remove the link, use an in-page "#" fragment, or add jay-allow-self-link to the anchor if intentional.`,
            },
        ]);
    });

    it('flags a todo: link as a non-suppressible WARNING, echoing the note (DL#210 v2)', () => {
        const findings = checkInternalLinks({
            parsedFiles: [
                page(
                    `<a href="todo:/pricing">Pricing</a><a href="todo: write about page">About</a>`,
                    {
                        'jay-stack': { 'allow-broken-links': true }, // must NOT suppress todo links
                    },
                ),
            ],
            oracle,
            assetUrls,
        });
        expect(findings.map((f) => ({ severity: f.severity, message: f.message }))).toEqual([
            {
                severity: 'warning',
                message:
                    'TODO link <a href="todo:/pricing"> — intended target "/pricing" is not wired up yet. This reminder cannot be suppressed — resolve it before release.',
            },
            {
                severity: 'warning',
                message:
                    'TODO link <a href="todo: write about page"> — intended target "write about page" is not wired up yet. This reminder cannot be suppressed — resolve it before release.',
            },
        ]);
    });

    it('validates same-page #fragment anchors (DL#210 v2)', () => {
        const projectRoot = '/project';
        const selfUrlByPath = new Map([
            [path.resolve(projectRoot, 'pages/about/page.jay-html'), '/about'],
        ]);
        const findings = checkInternalLinks({
            parsedFiles: [
                {
                    relativePath: 'pages/about/page.jay-html',
                    parsed: {
                        body: parse(
                            `<body>
                                <a href="#team">Team</a>
                                <a href="#missing">Missing</a>
                                <a href="#top">Top</a>
                                <h2 id="team">Team</h2>
                            </body>`,
                        ),
                    },
                },
            ],
            oracle: { ...oracle, selfUrlByPath },
            assetUrls,
            projectRoot,
        });
        expect(findings).toEqual([
            {
                file: 'pages/about/page.jay-html',
                severity: 'error',
                message: `Broken fragment link <a href="#missing"> — this page has no element with id "missing".`,
                suggestion: `Add id="missing" to the target element, or fix the fragment.`,
            },
        ]);
    });

    it('validates cross-page /path#fragment anchors against the target page (DL#210 v2)', () => {
        const projectRoot = '/project';
        const selfUrlByPath = new Map([
            [path.resolve(projectRoot, 'pages/page.jay-html'), '/'],
            [path.resolve(projectRoot, 'pages/about/page.jay-html'), '/about'],
        ]);
        const findings = checkInternalLinks({
            parsedFiles: [
                {
                    relativePath: 'pages/page.jay-html',
                    parsed: {
                        body: parse(
                            `<body>
                                <a href="/about#team">ok</a>
                                <a href="/about#ghost">broken frag</a>
                            </body>`,
                        ),
                    },
                },
                {
                    relativePath: 'pages/about/page.jay-html',
                    parsed: { body: parse(`<body><h2 id="team">Team</h2></body>`) },
                },
            ],
            oracle: { ...oracle, selfUrlByPath },
            assetUrls,
            projectRoot,
        });
        expect(findings).toEqual([
            {
                file: 'pages/page.jay-html',
                severity: 'error',
                message: `Broken fragment link <a href="/about#ghost"> — page "/about" has no element with id "ghost".`,
                suggestion: `Add id="ghost" to the target element on "/about", or fix the fragment.`,
            },
        ]);
    });

    it('respects the per-page allow-broken-links suppression (broken + degenerate only)', () => {
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
    const byKey = (a: { file: string; message: string }, b: { file: string; message: string }) =>
        (a.file + a.message).localeCompare(b.file + b.message);

    it('routes broken/degenerate/fragment links to errors and self-link/todo to warnings (DL#210 v2)', async () => {
        const result = await validateJayFiles({
            path: path.join(fixture, 'pages'),
            projectRoot: fixture,
        });

        const linkErrors = result.errors
            .filter((e) => e.source === 'internal-links')
            .map((e) => ({ file: e.file, message: e.message }))
            .sort(byKey);
        expect(linkErrors).toEqual(
            [
                {
                    file: path.join('pages', 'page.jay-html'),
                    message:
                        'Anchor <a href="#"> has a placeholder href "#" — it links nowhere and ships as a dead link.',
                },
                {
                    file: path.join('pages', 'page.jay-html'),
                    message:
                        'Broken internal link in anchor <a href="/does-not-exist"> — no page or public asset produces the URL "/does-not-exist".',
                },
                {
                    file: path.join('pages', 'page.jay-html'),
                    message:
                        'Broken fragment link <a href="#missing-anchor"> — this page has no element with id "missing-anchor".',
                },
                {
                    file: path.join('pages', 'page.jay-html'),
                    message:
                        'Broken fragment link <a href="/about#ghost"> — page "/about" has no element with id "ghost".',
                },
            ].sort(byKey),
        );

        const linkWarnings = result.warnings
            .filter((w) => w.source === 'internal-links')
            .map((w) => ({ file: w.file, message: w.message }))
            .sort(byKey);
        expect(linkWarnings).toEqual(
            [
                {
                    file: path.join('pages', 'about', 'page.jay-html'),
                    message: `Anchor <a href="/about"> points to the page's own route "/about" — a self-link goes nowhere.`,
                },
                {
                    file: path.join('pages', 'page.jay-html'),
                    message:
                        'TODO link <a href="todo:/pricing"> — intended target "/pricing" is not wired up yet. This reminder cannot be suppressed — resolve it before release.',
                },
            ].sort(byKey),
        );

        expect(result.valid).toBe(false);
    });
});
