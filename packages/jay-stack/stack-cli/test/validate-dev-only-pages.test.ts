import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fsp } from 'fs';
import { parse } from 'node-html-parser';
import { validateJayFiles } from '../lib/validate';
import {
    buildRouteOracle,
    checkInternalLinks,
    type RouteOracle,
} from '../lib/check-internal-links';

// DL#240 — dev-only project pages (`<meta name="jay-dev-only">` in a page's <head>). Five validate
// rules; every message starts with its rule code. Tests assert on returned findings only.

const fixture = path.resolve('./test/fixtures/validate/dev-only-pages');
const SUPPRESS_HINT =
    'suppress with jay-stack:\n  allow-broken-links: true\nin a <script type="application/jay-validations"> block';

type Finding = { file: string; message: string };
const byKey = (a: Finding, b: Finding) => (a.file + a.message).localeCompare(b.file + b.message);
const devOnlyFindings = (list: Array<Finding & { suggestion?: string }>) =>
    list
        .filter((f) => f.message.startsWith('DEV-ONLY-'))
        .map((f) => ({ file: f.file, message: f.message }))
        .sort(byKey);

function linkedFromProdMessage(target: string): string {
    return (
        `DEV-ONLY-LINKED-FROM-PROD: anchor <a href="${target}"> links to "${target}", which only a ` +
        `dev-only page produces — it is a dead link in production.`
    );
}

describe('buildRouteOracle — dev-only partition (DL#240)', () => {
    it('keeps dev-only routes out of the production URL set and matchers', async () => {
        const oracle = await buildRouteOracle(path.join(fixture, 'pages'));

        expect([...oracle.staticUrls].sort()).toEqual(['/', '/about', '/body-marker']);
        expect([...oracle.devOnlyStaticUrls].sort()).toEqual([
            '/_preview/button',
            '/bad-content',
            '/blog/preview',
        ]);
        expect(oracle.dynamicMatchers.some((re) => re.test('/blog/any-post'))).toBe(true);
        expect(oracle.dynamicMatchers.some((re) => re.test('/_tools/inspector'))).toBe(false);
        expect(oracle.devOnlyDynamicMatchers.some((re) => re.test('/_tools/inspector'))).toBe(true);
        expect([...oracle.devOnlyJayHtmlPaths].sort()).toEqual(
            [
                'pages/_preview/button/page.jay-html',
                'pages/_tools/[name]/page.jay-html',
                'pages/bad-content/page.jay-html',
                'pages/blog/preview/page.jay-html',
            ].map((p) => path.join(fixture, p)),
        );
    });
});

describe('checkInternalLinks — DEV-ONLY-LINKED-FROM-PROD (DL#240)', () => {
    const projectRoot = '/project';
    const oracle: RouteOracle = {
        staticUrls: new Set(['/', '/about']),
        dynamicMatchers: [/^\/blog\/[^/]+$/],
        devOnlyStaticUrls: new Set(['/_preview/button', '/blog/preview']),
        devOnlyDynamicMatchers: [/^\/_tools\/[^/]+$/],
        selfUrlByPath: new Map(),
        devOnlyJayHtmlPaths: new Set([
            path.resolve(projectRoot, 'pages/_preview/button/page.jay-html'),
        ]),
    };

    function page(relativePath: string, html: string, allowBrokenLinks = false) {
        return {
            relativePath,
            parsed: {
                body: parse(`<body>${html}</body>`),
                validationOverrides: allowBrokenLinks
                    ? { 'jay-stack': { 'allow-broken-links': true } }
                    : undefined,
            },
        };
    }

    function check(...parsedFiles: ReturnType<typeof page>[]) {
        return checkInternalLinks({ parsedFiles, oracle, assetUrls: new Set(), projectRoot });
    }

    it('does not flag a production page linking to a production page', () => {
        expect(check(page('pages/page.jay-html', '<a href="/about">a</a>'))).toEqual([]);
    });

    it('does not flag a URL that a dev-only static page and a production dynamic route both match', () => {
        expect(check(page('pages/page.jay-html', '<a href="/blog/preview">a</a>'))).toEqual([]);
    });

    it('does not flag a dev-only page linking to dev-only pages', () => {
        const findings = check(
            page(
                'pages/_preview/button/page.jay-html',
                '<a href="/blog/preview">a</a><a href="/_tools/inspector">b</a>',
            ),
        );
        expect(findings).toEqual([]);
    });

    it('flags a production page linking to a dev-only static or dynamic page as an error', () => {
        const findings = check(
            page(
                'pages/page.jay-html',
                '<a href="/_preview/button">a</a><a href="/_tools/inspector">b</a>',
            ),
        );
        const suggestion =
            'Remove the link, or mark the linking page dev-only with <meta name="jay-dev-only">. ' +
            `Otherwise ${SUPPRESS_HINT}.`;
        expect(findings).toEqual([
            {
                file: 'pages/page.jay-html',
                severity: 'error',
                message: linkedFromProdMessage('/_preview/button'),
                suggestion,
            },
            {
                file: 'pages/page.jay-html',
                severity: 'error',
                message: linkedFromProdMessage('/_tools/inspector'),
                suggestion,
            },
        ]);
    });

    it('keeps the generic broken-link error for a URL no page produces', () => {
        const findings = check(page('pages/page.jay-html', '<a href="/nowhere">a</a>'));
        expect(findings.map((f) => f.message)).toEqual([
            'Broken internal link in anchor <a href="/nowhere"> — no page or public asset produces the URL "/nowhere".',
        ]);
    });

    it('honours the allow-broken-links suppression', () => {
        expect(
            check(page('pages/page.jay-html', '<a href="/_preview/button">a</a>', true)),
        ).toEqual([]);
    });
});

describe('validateJayFiles — dev-only page rules (DL#240)', () => {
    let result: Awaited<ReturnType<typeof validateJayFiles>>;

    beforeAll(async () => {
        result = await validateJayFiles({
            path: path.join(fixture, 'pages'),
            projectRoot: fixture,
        });
    });

    it('reports exactly the expected dev-only errors (error-page rule runs despite allow-no-error-pages)', () => {
        expect(devOnlyFindings(result.errors)).toEqual(
            [
                {
                    file: path.join('pages', 'page.jay-html'),
                    message: linkedFromProdMessage('/_preview/button'),
                },
                {
                    file: path.join('pages', 'page.jay-html'),
                    message: linkedFromProdMessage('/_tools/inspector'),
                },
                {
                    file: path.join('pages', '404', 'page.jay-html'),
                    message:
                        'DEV-ONLY-ERROR-PAGE: error page "404" has <meta name="jay-dev-only">, but error ' +
                        'pages are not routes — the marker is ignored and the page ships to production.',
                },
                {
                    file: path.join('pages', 'bad-content', 'page.jay-html'),
                    message:
                        'DEV-ONLY-INVALID-CONTENT: <meta name="jay-dev-only"> has content="false" — only ' +
                        'content="true" (or no content) is allowed, and the page is treated as dev-only ' +
                        'whatever the value says.',
                },
                {
                    file: path.join('pages', 'body-marker', 'page.jay-html'),
                    message:
                        'DEV-ONLY-MARKER-NOT-IN-HEAD: <meta name="jay-dev-only"> is outside <head> — it ' +
                        'is ignored and the page ships to production.',
                },
            ].sort(byKey),
        );
    });

    it('keeps the generic broken-link error for the unrelated broken link', () => {
        const broken = result.errors.filter(
            (e) => e.source === 'internal-links' && !e.message.startsWith('DEV-ONLY-'),
        );
        expect(broken.map((e) => e.message)).toEqual([
            'Broken internal link in anchor <a href="/nowhere"> — no page or public asset produces the URL "/nowhere".',
        ]);
    });

    it('adds no dev-only findings to a project without the marker', async () => {
        const plain = path.resolve('./test/fixtures/validate/internal-links');
        const plainResult = await validateJayFiles({
            path: path.join(plain, 'pages'),
            projectRoot: plain,
        });
        expect(devOnlyFindings([...plainResult.errors, ...plainResult.warnings])).toEqual([]);
    });
});

describe('validateJayFiles — DEV-ONLY-SHADOWS-PLUGIN-ROUTE (DL#240)', () => {
    let projectRoot: string;

    async function writeFile(relativePath: string, content: string) {
        const full = path.join(projectRoot, relativePath);
        await fsp.mkdir(path.dirname(full), { recursive: true });
        await fsp.writeFile(full, content);
    }

    beforeAll(async () => {
        projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'jay-dev-only-shadow-'));
        await writeFile('.jay', 'validations:\n  allow-no-error-pages: true\n');
        await writeFile(
            'package.json',
            JSON.stringify({ name: 'app', dependencies: { 'settings-plugin': '1.0.0' } }),
        );
        const pluginDir = 'node_modules/settings-plugin';
        await writeFile(
            `${pluginDir}/package.json`,
            JSON.stringify({ name: 'settings-plugin', version: '1.0.0', main: 'index.js' }),
        );
        await writeFile(`${pluginDir}/index.js`, 'export const settings = {};\n');
        await writeFile(
            `${pluginDir}/settings.jay-html`,
            '<html><head></head><body></body></html>\n',
        );
        await writeFile(
            `${pluginDir}/plugin.yaml`,
            [
                'name: settings-plugin',
                'routes:',
                '  - path: /settings',
                '    jayHtml: settings.jay-html',
                '    component: settings',
                '  - path: /account',
                '    jayHtml: settings.jay-html',
                '    component: settings',
                '',
            ].join('\n'),
        );
        await writeFile(
            'src/pages/settings/page.jay-html',
            '<html>\n<head>\n    <meta name="jay-dev-only" />\n<script type="application/jay-data">\ndata:\n    title: string\n</script>\n</head>\n<body>dev settings</body>\n</html>\n',
        );
        await writeFile(
            'src/pages/account/page.jay-html',
            '<html>\n<head>\n<script type="application/jay-data">\ndata:\n    title: string\n</script>\n</head>\n<body>account</body>\n</html>\n',
        );
    });

    afterAll(async () => {
        await fsp.rm(projectRoot, { recursive: true, force: true });
    });

    it('errors only for the dev-only page whose route a plugin also provides', async () => {
        const result = await validateJayFiles({
            path: path.join(projectRoot, 'src/pages'),
            projectRoot,
        });

        expect(devOnlyFindings(result.errors)).toEqual([
            {
                file: path.join('src', 'pages', 'settings', 'page.jay-html'),
                message:
                    'DEV-ONLY-SHADOWS-PLUGIN-ROUTE: dev-only page "/settings" has the same route as a ' +
                    'route of plugin "settings-plugin" — the dev server serves this page, production ' +
                    "serves the plugin's.",
            },
        ]);
    });
});
