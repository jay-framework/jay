import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validateColorScheme } from '../../lib/tools';
import type {
    JayHtmlHeadMeta,
    JayHtmlValidationContext,
    JayHtmlValidationFinding,
    TemplatePart,
} from '@jay-framework/compiler-shared';

const FIXTURES = resolve(__dirname, '../fixtures/color-scheme');
const GUIDE = ' See agent-kit/designer/dark-mode-patterns.md';
const BODY = `<body><input><input type="submit"><textarea></textarea><select></select><button>b</button><h1>t</h1><div class="x"></div></body>`;

type Meta = string | TemplatePart[] | undefined;

function head(meta: Meta): JayHtmlHeadMeta {
    if (meta === undefined) return { meta: [], links: [] };
    const content = typeof meta === 'string' ? [{ kind: 'static' as const, value: meta }] : meta;
    return { meta: [{ name: 'color-scheme', content }], links: [] };
}

function makeContext(
    fixture: string,
    meta: Meta,
    overrides: Partial<JayHtmlValidationContext> = {},
): JayHtmlValidationContext {
    return {
        body: parse(BODY).querySelector('body'),
        css: readFileSync(resolve(FIXTURES, `${fixture}.css`), 'utf-8'),
        head: head(meta),
        filePath: 'src/pages/x/page.jay-html',
        projectRoot: '/tmp/no-design-md-project',
        headlessImports: [],
        ...overrides,
    };
}

const run = async (fixture: string, meta: Meta, overrides?: Partial<JayHtmlValidationContext>) =>
    validateColorScheme(makeContext(fixture, meta, overrides));

const DARK_MEDIA = '@media (prefers-color-scheme: dark)';

function noMeta(signal: string): JayHtmlValidationFinding {
    return {
        severity: 'warning',
        message: `Page has a dark theme (${signal}) but no <meta name="color-scheme"> in <head>. The meta is read before any CSS loads, so without it dark-mode users can see a white flash.`,
        suggestion:
            'Add <meta name="color-scheme" content="light dark"> to <head>. Suppress: design-system: { allow-no-color-scheme-meta: true }.' +
            GUIDE,
    };
}

function metaLightOnly(value: string, signal: string): JayHtmlValidationFinding {
    return {
        severity: 'warning',
        message: `<meta name="color-scheme" content="${value}"> does not enable dark, but the page has a dark theme (${signal}).`,
        suggestion:
            'Use content="light dark". Suppress: design-system: { allow-color-scheme-meta-light-only: true }.' +
            GUIDE,
    };
}

function toggle(token: string, selector: string): JayHtmlValidationFinding {
    return {
        severity: 'warning',
        message: `Dark theme "${token}" (first used in "${selector}") never sets color-scheme: dark. Native inputs, selects and scrollbars stay light.`,
        suggestion: `Add a rule "${token} { color-scheme: dark; }". Suppress: design-system: { allow-dark-toggle-without-color-scheme: true }.${GUIDE}`,
    };
}

function lightDark(selector: string, prop: string): JayHtmlValidationFinding {
    return {
        severity: 'warning',
        message: `light-dark() is used (${selector} { ${prop} }) but nothing enables a dark color-scheme, so it always resolves to the light value.`,
        suggestion:
            'Add <meta name="color-scheme" content="light dark"> or color-scheme: light dark on :root. Suppress: design-system: { allow-light-dark-without-color-scheme: true }.' +
            GUIDE,
    };
}

function fixedControl(
    tag: string,
    prop: string,
    value: string,
    selector: string,
): JayHtmlValidationFinding {
    return {
        severity: 'warning',
        message: `${tag} gets ${prop}: ${value} from "${selector}" on a page with a dark theme, and no dark rule overrides it.`,
        suggestion:
            'Use a theme token (var(--…)), light-dark(), or Field/FieldText, or add a dark override. Suppress one line with /* design-system: allow */, or the page with design-system: { allow-fixed-control-colors: true }.' +
            GUIDE,
    };
}

describe('validateColorScheme (DL#241)', () => {
    describe('meta rules', () => {
        it('1: light-only page gets nothing', async () => {
            expect(await run('01-light-only', undefined)).toEqual([]);
        });
        it('2: dark media without meta', async () => {
            expect(await run('02-dark-media', undefined)).toEqual([noMeta(DARK_MEDIA)]);
        });
        it('3: dark media with light dark meta', async () => {
            expect(await run('02-dark-media', 'light dark')).toEqual([]);
        });
        it('4: light meta', async () => {
            expect(await run('02-dark-media', 'light')).toEqual([
                metaLightOnly('light', DARK_MEDIA),
            ]);
        });
        it('5: only light meta', async () => {
            expect(await run('02-dark-media', 'only light')).toEqual([
                metaLightOnly('only light', DARK_MEDIA),
            ]);
        });
        it('6: color-scheme: normal is no signal', async () => {
            expect(await run('06-color-scheme-normal', undefined)).toEqual([]);
        });
        it('23: component file is skipped', async () => {
            expect(
                await run('02-dark-media', undefined, { filePath: 'src/components/x.jay-html' }),
            ).toEqual([]);
        });
        it('25: dynamic meta content gives no meta findings', async () => {
            expect(await run('02-dark-media', [{ kind: 'binding', value: 'theme' }])).toEqual([]);
        });
        it('26: a plugin head tag provides the meta', async () => {
            const headlessImports = [
                {
                    contractName: 'theme',
                    providedHeadTags: ['<meta name="color-scheme" content="light dark">'],
                },
            ];
            expect(await run('02-dark-media', undefined, { headlessImports })).toEqual([]);
        });
        it('27: another plugin meta does not count', async () => {
            const headlessImports = [
                {
                    contractName: 'seo',
                    providedHeadTags: ['<meta name="description" content="x">'],
                },
            ];
            expect(await run('02-dark-media', undefined, { headlessImports })).toEqual([
                noMeta(DARK_MEDIA),
            ]);
        });
        it('32: combined dark media is a signal', async () => {
            expect(await run('32-dark-media-and-width', undefined)).toEqual([
                noMeta('@media (prefers-color-scheme: dark) and (min-width: 600px)'),
            ]);
        });
    });

    describe('dark-toggle-without-color-scheme', () => {
        it('7: toggle without color-scheme', async () => {
            expect(await run('07-toggle-no-color-scheme', 'light dark')).toEqual([
                // The selector is quoted as written in the fixture; the token is normalised.
                toggle('[data-theme="dark"]', "[data-theme='dark']"),
            ]);
        });
        it('8: toggle with color-scheme: dark', async () => {
            expect(await run('08-toggle-with-color-scheme', 'light dark')).toEqual([]);
        });
        it('9: reported once per token', async () => {
            expect(await run('09-dark-class-many', 'light dark')).toEqual([
                toggle('.dark', '.dark .x1'),
            ]);
        });
        it('10: html.dark satisfies .dark', async () => {
            expect(await run('10-html-dark-satisfied', 'light dark')).toEqual([]);
        });
        it('11: .darker and dark-blue are not tokens', async () => {
            expect(await run('11-not-tokens', undefined)).toEqual([]);
        });
        it('30: :not(.dark) is not a signal', async () => {
            expect(await run('30-not-dark', undefined)).toEqual([]);
        });
        it('31: :is(.dark) counts', async () => {
            expect(await run('31-is-dark', 'light dark')).toEqual([
                toggle('.dark', ':is(.dark) .x'),
            ]);
        });
        it('34: component variants (incl. .btn:is(.dark)) are not signals', async () => {
            expect(await run('34-component-variants', undefined)).toEqual([]);
        });
        it('36: a flagged attribute is not a token', async () => {
            expect(await run('36-flagged-attribute', undefined)).toEqual([]);
        });
        it('37: selector list is split per selector', async () => {
            expect(await run('37-selector-list-satisfies', 'light dark')).toEqual([]);
        });
    });

    describe('light-dark-without-color-scheme', () => {
        it('12: light-dark() with nothing enabling dark', async () => {
            expect(await run('12-light-dark-only', undefined)).toEqual([
                noMeta('light-dark()'),
                lightDark(':root', '--bg'),
            ]);
        });
        it('13: color-scheme on :root enables it (meta still required)', async () => {
            expect(await run('13-light-dark-with-color-scheme', undefined)).toEqual([
                noMeta('light-dark()'),
            ]);
        });
    });

    describe('fixed-control-colors', () => {
        it('14: literal input background', async () => {
            expect(await run('14-fixed-input', 'light dark')).toEqual([
                fixedControl('input', 'background', '#fff', 'input'),
            ]);
        });
        it('15: overridden in dark media', async () => {
            expect(await run('15-input-dark-media-override', 'light dark')).toEqual([]);
        });
        it('16: combined media and same bucket', async () => {
            expect(await run('16-input-combined-media-bucket', 'light dark')).toEqual([]);
        });
        it('17: overridden by a toggle rule', async () => {
            expect(await run('17-input-toggle-override', 'light dark')).toEqual([]);
        });
        it('18: allow comment', async () => {
            expect(await run('18-input-allow-comment', 'light dark')).toEqual([]);
        });
        it('19: raw var() and non-literal values', async () => {
            expect(await run('19-non-literals', 'light dark')).toEqual([]);
        });
        it('20: background url', async () => {
            expect(await run('20-background-url', 'light dark')).toEqual([]);
        });
        it('21: borders are not checked', async () => {
            expect(await run('21-border-only', 'light dark')).toEqual([]);
        });
        it('22: buttons are excluded', async () => {
            expect(await run('22-buttons-excluded', 'light dark')).toEqual([]);
        });
        it('28: html.dark override', async () => {
            expect(await run('28-html-dark-override', 'light dark')).toEqual([]);
        });
        it('29: :root[data-theme] override', async () => {
            expect(await run('29-root-attr-override', 'light dark')).toEqual([]);
        });
        it('33: unknown pseudo does not throw', async () => {
            expect(await run('33-unknown-pseudo', 'light dark')).toEqual([]);
        });
        it('35: :root input in dark media', async () => {
            expect(await run('35-root-input-dark-media', 'light dark')).toEqual([]);
        });
        it('38: selector list gives one finding per selector', async () => {
            expect(await run('38-selector-list-controls', 'light dark')).toEqual([
                fixedControl('input', 'background', '#fff', 'input'),
                fixedControl('textarea', 'background', '#fff', 'textarea'),
            ]);
        });
        it('39: keywords are case-insensitive', async () => {
            expect(await run('39-case-insensitive-keywords', 'light dark')).toEqual([
                fixedControl('input', 'color', 'WHITE', 'input'),
            ]);
        });
    });

    describe('24: suppression, one key at a time', () => {
        const suppressed = (key: string) => ({
            validationOverrides: { 'design-system': { [key]: true } },
        });
        const cases: Array<[string, string, Meta, JayHtmlValidationFinding[]]> = [
            [
                'allow-no-color-scheme-meta',
                '12-light-dark-only',
                undefined,
                [lightDark(':root', '--bg')],
            ],
            [
                'allow-light-dark-without-color-scheme',
                '12-light-dark-only',
                undefined,
                [noMeta('light-dark()')],
            ],
            ['allow-color-scheme-meta-light-only', '02-dark-media', 'light', []],
            [
                'allow-dark-toggle-without-color-scheme',
                '07-toggle-no-color-scheme',
                'light dark',
                [],
            ],
            ['allow-fixed-control-colors', '14-fixed-input', 'light dark', []],
        ];
        it.each(cases)('%s', async (key, fixture, meta, expected) => {
            expect(await run(fixture, meta, suppressed(key))).toEqual(expected);
        });
    });
});
