import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validateFontFallbacks } from '../../lib';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';
import path from 'node:path';

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'basic');

function extractCss(root: ReturnType<typeof parse>): string | undefined {
    const parts: string[] = [];
    for (const style of root.querySelectorAll('style')) {
        const text = style.textContent;
        if (text) parts.push(text);
    }
    return parts.length > 0 ? parts.join('\n') : undefined;
}

function makeContext(html: string): JayHtmlValidationContext {
    const root = parse(html);
    const body = root.querySelector('body') || root;
    return {
        body,
        css: extractCss(root),
        filePath: path.join(fixturesDir, 'page.jay-html'),
        projectRoot: fixturesDir,
        headlessImports: [],
    };
}

function withoutGuide(findings: any[]) {
    return findings.filter((f: any) => f.message !== '');
}

describe('design-font-fallbacks validator', () => {
    it('flags web font without metric-matched fallback', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                @font-face {
                    font-family: 'Inter';
                    src: url('https://fonts.example.com/inter.woff2') format('woff2');
                    font-weight: 400;
                }
                body { font-family: 'Inter', sans-serif; }
            </style>
            <p>Hello</p>
        </body></html>`);
        const findings = withoutGuide(await validateFontFallbacks(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    'font-family "Inter" loads from a URL but has no metric-matched fallback. This causes layout shift (CLS) when the font loads.',
                suggestion:
                    'Run `jay-stack run design-system/font-fallback --primary "Inter" --fallback "Arial"` to generate a fallback @font-face.',
            },
        ]);
    });

    it('passes when metric-matched fallback exists', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                @font-face {
                    font-family: 'Inter';
                    src: url('https://fonts.example.com/inter.woff2') format('woff2');
                }
                @font-face {
                    font-family: 'Inter Fallback';
                    src: local('Arial');
                    size-adjust: 107.12%;
                    ascent-override: 90.44%;
                    descent-override: 22.52%;
                    line-gap-override: 0%;
                }
                body { font-family: 'Inter', 'Inter Fallback', sans-serif; }
            </style>
            <p>Hello</p>
        </body></html>`);
        const findings = await validateFontFallbacks(ctx);
        expect(findings).toEqual([]);
    });

    it('passes when no @font-face rules exist', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                body { font-family: Arial, sans-serif; }
            </style>
            <p>Hello</p>
        </body></html>`);
        const findings = await validateFontFallbacks(ctx);
        expect(findings).toEqual([]);
    });

    it('passes when @font-face uses only local src', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                @font-face {
                    font-family: 'MyFont';
                    src: local('MyFont Regular');
                }
                body { font-family: 'MyFont', sans-serif; }
            </style>
            <p>Hello</p>
        </body></html>`);
        const findings = await validateFontFallbacks(ctx);
        expect(findings).toEqual([]);
    });

    it('flags only web fonts missing fallbacks, not ones that have them', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                @font-face {
                    font-family: 'Inter';
                    src: url('inter.woff2');
                }
                @font-face {
                    font-family: 'Inter Fallback';
                    src: local('Arial');
                    size-adjust: 107%;
                    ascent-override: 90%;
                }
                @font-face {
                    font-family: 'Playfair Display';
                    src: url('playfair.woff2');
                }
                body { font-family: 'Inter', 'Inter Fallback', sans-serif; }
                h1 { font-family: 'Playfair Display', serif; }
            </style>
            <h1>Title</h1>
            <p>Body</p>
        </body></html>`);
        const findings = withoutGuide(await validateFontFallbacks(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    'font-family "Playfair Display" loads from a URL but has no metric-matched fallback. This causes layout shift (CLS) when the font loads.',
                suggestion:
                    'Run `jay-stack run design-system/font-fallback --primary "Playfair Display" --fallback "Arial"` to generate a fallback @font-face.',
            },
        ]);
    });

    it('returns empty when no CSS is present', async () => {
        const ctx = makeContext(`<html><body><p>Hello</p></body></html>`);
        const findings = await validateFontFallbacks(ctx);
        expect(findings).toEqual([]);
    });

    it('appends guide suggestion when findings exist', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                @font-face {
                    font-family: 'Inter';
                    src: url('inter.woff2');
                }
                body { font-family: 'Inter', sans-serif; }
            </style>
            <p>Hello</p>
        </body></html>`);
        const findings = await validateFontFallbacks(ctx);
        const last = findings[findings.length - 1];
        expect(last.message).toBe('');
        expect(last.suggestion).toBe(
            'See design-system-validator agent-kit/designer/font-fallback-patterns.md for usage guide',
        );
    });

    it('flags fonts imported via @import from Google Fonts', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                @import"https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
                body { font-family: 'Sora', sans-serif; }
                code { font-family: 'JetBrains Mono', monospace; }
            </style>
            <p>Hello</p>
            <code>code</code>
        </body></html>`);
        const findings = withoutGuide(await validateFontFallbacks(ctx));
        expect(findings.length).toBe(3);
        expect(findings.map((f: any) => f.message)).toEqual([
            'font-family "Sora" loads from a URL but has no metric-matched fallback. This causes layout shift (CLS) when the font loads.',
            'font-family "JetBrains Mono" loads from a URL but has no metric-matched fallback. This causes layout shift (CLS) when the font loads.',
            'font-family "Inter" loads from a URL but has no metric-matched fallback. This causes layout shift (CLS) when the font loads.',
        ]);
    });

    it('passes @import fonts that have metric-matched fallbacks', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                @import"https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap";
                @font-face {
                    font-family: 'Inter Fallback';
                    src: local('Arial');
                    size-adjust: 107%;
                    ascent-override: 90%;
                }
                body { font-family: 'Inter', 'Inter Fallback', sans-serif; }
            </style>
            <p>Hello</p>
        </body></html>`);
        const findings = await validateFontFallbacks(ctx);
        expect(findings).toEqual([]);
    });

    it('handles @import with url() syntax', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400&display=swap');
                body { font-family: 'Roboto', sans-serif; }
            </style>
            <p>Hello</p>
        </body></html>`);
        const findings = withoutGuide(await validateFontFallbacks(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    'font-family "Roboto" loads from a URL but has no metric-matched fallback. This causes layout shift (CLS) when the font loads.',
                suggestion:
                    'Run `jay-stack run design-system/font-fallback --primary "Roboto" --fallback "Arial"` to generate a fallback @font-face.',
            },
        ]);
    });

    it('handles Google Fonts v1 API with pipe-separated families', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                @import url('https://fonts.googleapis.com/css?family=Open+Sans:400,700|Lora:400');
                body { font-family: 'Open Sans', sans-serif; }
                blockquote { font-family: 'Lora', serif; }
            </style>
            <p>Hello</p>
            <blockquote>Quote</blockquote>
        </body></html>`);
        const findings = withoutGuide(await validateFontFallbacks(ctx));
        expect(findings.length).toBe(2);
        expect(findings.map((f: any) => f.message)).toEqual([
            'font-family "Open Sans" loads from a URL but has no metric-matched fallback. This causes layout shift (CLS) when the font loads.',
            'font-family "Lora" loads from a URL but has no metric-matched fallback. This causes layout shift (CLS) when the font loads.',
        ]);
    });

    it('detects fonts from <link> tags in head', async () => {
        const root = parse('<html><body><p>Hello</p></body></html>');
        const body = root.querySelector('body') || root;
        const ctx: JayHtmlValidationContext = {
            body,
            css: `body { font-family: 'Inter', sans-serif; }`,
            filePath: path.join(fixturesDir, 'page.jay-html'),
            projectRoot: fixturesDir,
            headlessImports: [],
            head: {
                meta: [],
                links: [
                    {
                        rel: 'stylesheet',
                        href: [
                            {
                                kind: 'static' as const,
                                value: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap',
                            },
                        ],
                    },
                ],
            },
        };
        const findings = withoutGuide(await validateFontFallbacks(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    'font-family "Inter" loads from a URL but has no metric-matched fallback. This causes layout shift (CLS) when the font loads.',
                suggestion:
                    'Run `jay-stack run design-system/font-fallback --primary "Inter" --fallback "Arial"` to generate a fallback @font-face.',
            },
        ]);
    });

    it('skips <link> tags with dynamic href bindings', async () => {
        const root = parse('<html><body><p>Hello</p></body></html>');
        const body = root.querySelector('body') || root;
        const ctx: JayHtmlValidationContext = {
            body,
            css: `body { font-family: Arial, sans-serif; }`,
            filePath: path.join(fixturesDir, 'page.jay-html'),
            projectRoot: fixturesDir,
            headlessImports: [],
            head: {
                meta: [],
                links: [
                    {
                        rel: 'stylesheet',
                        href: [
                            {
                                kind: 'static' as const,
                                value: 'https://fonts.googleapis.com/css2?family=',
                            },
                            { kind: 'binding' as const, value: 'fontName' },
                        ],
                    },
                ],
            },
        };
        const findings = await validateFontFallbacks(ctx);
        expect(findings).toEqual([]);
    });

    it('ignores @import from non-font-service URLs', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                @import url('https://example.com/styles.css');
                body { font-family: Arial, sans-serif; }
            </style>
            <p>Hello</p>
        </body></html>`);
        const findings = await validateFontFallbacks(ctx);
        expect(findings).toEqual([]);
    });

    it('detects web font from DESIGN.md typography tokens', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                @font-face {
                    font-family: 'Inter';
                    src: url('inter.woff2');
                }
            </style>
            <p>Hello</p>
        </body></html>`);
        const findings = withoutGuide(await validateFontFallbacks(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    'font-family "Inter" loads from a URL but has no metric-matched fallback. This causes layout shift (CLS) when the font loads.',
                suggestion:
                    'Run `jay-stack run design-system/font-fallback --primary "Inter" --fallback "Arial"` to generate a fallback @font-face.',
            },
        ]);
    });
});
