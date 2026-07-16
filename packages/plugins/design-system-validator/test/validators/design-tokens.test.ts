import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validateTokens } from '../../lib';
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

const H = {
    cardText: '<div class="card" > "Text"',
    boxText: '<div class="box" > "Text"',
    fadeText: '<div class="fade" > "Text"',
    heroText: '<div class="hero" > "Text"',
};

describe('design-tokens validator', () => {
    it('flags hardcoded color not in tokens', async () => {
        const ctx = makeContext(`<html><body>
            <style>.card { color: #ff0000; }</style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = withoutGuide(await validateTokens(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: `${H.cardText} — Hardcoded color "#ff0000" for color not in design system`,
                suggestion: 'Use token {colors.error} ("#dc2626")',
                element: H.cardText,
            },
        ]);
    });

    it('passes token colors', async () => {
        const ctx = makeContext(`<html><body>
            <style>.card { color: #2563eb; }</style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('flags spacing not in scale', async () => {
        const ctx = makeContext(`<html><body>
            <style>.box { padding: 13px; }</style>
            <div class="box">Text</div>
        </body></html>`);
        const findings = withoutGuide(await validateTokens(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: `${H.boxText} — padding value "13px" not in spacing scale`,
                suggestion: 'Use a DESIGN.md spacing token',
                element: H.boxText,
            },
        ]);
    });

    it('passes spacing in scale', async () => {
        const ctx = makeContext(`<html><body>
            <style>.box { padding: 1rem; }</style>
            <div class="box">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('flags border-radius not in rounded scale', async () => {
        const ctx = makeContext(`<html><body>
            <style>.card { border-radius: 10px; }</style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = withoutGuide(await validateTokens(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: `${H.cardText} — border-radius "10px" not in rounded scale`,
                suggestion: 'Use a DESIGN.md rounded token',
                element: H.cardText,
            },
        ]);
    });

    it('skips declarations with design-system: allow comment', async () => {
        const ctx = makeContext(`<html><body>
            <style>.card { padding: 13px; /* design-system: allow */ }</style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('skips elements with jay-design="allow"', async () => {
        const ctx = makeContext(`<html><body>
            <div style="padding: 13px" jay-design="allow">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('allows var() references', async () => {
        const ctx = makeContext(`<html><body>
            <style>.card { color: var(--color-primary); }</style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('labels media queries with breakpoint name from DESIGN.md', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .card { color: #2563eb; }
                @media (max-width: 768px) {
                    .card { padding: 13px; }
                }
            </style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = withoutGuide(await validateTokens(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: `[tablet] ${H.cardText} — padding value "13px" not in spacing scale`,
                suggestion: 'Use a DESIGN.md spacing token',
                element: H.cardText,
            },
        ]);
    });

    it('flags non-standard breakpoint', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                @media (max-width: 750px) {
                    .card { padding: 13px; }
                }
            </style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = withoutGuide(await validateTokens(ctx));
        const bpFinding = findings.find((f) => f.message.includes('not in DESIGN.md breakpoints'));
        expect(bpFinding).toBeDefined();
        expect(bpFinding!.message).toEqual(
            'Media query @media (max-width: 750px) not in DESIGN.md breakpoints',
        );
    });

    it('validates base and media query rules independently', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .card { padding: 1rem; }
                @media (max-width: 768px) {
                    .card { padding: 0.5rem; }
                }
            </style>
            <div class="card">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('flags animation duration not in presets', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .fade { transition-duration: 200ms; }
                @media (prefers-reduced-motion: reduce) { .fade { transition-duration: 0s; } }
            </style>
            <div class="fade">Text</div>
        </body></html>`);
        const findings = withoutGuide(await validateTokens(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: `${H.fadeText} — transition-duration "200ms" not in animation presets`,
                suggestion: 'Use a DESIGN.md animation preset duration',
                element: H.fadeText,
            },
        ]);
    });

    it('passes animation duration in presets', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .fade { transition-duration: 300ms; }
                @media (prefers-reduced-motion: reduce) { .fade { transition-duration: 0s; } }
            </style>
            <div class="fade">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('flags animation easing not in presets', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .fade { transition-timing-function: ease; }
                @media (prefers-reduced-motion: reduce) { .fade { transition-duration: 0s; transition-timing-function: ease; } }
            </style>
            <div class="fade">Text</div>
        </body></html>`);
        const findings = withoutGuide(await validateTokens(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: `${H.fadeText} — transition-timing-function "ease" not in animation presets`,
                suggestion: 'Use a DESIGN.md animation preset easing',
                element: H.fadeText,
            },
            {
                severity: 'warning',
                message: `[(prefers-reduced-motion: reduce)] ${H.fadeText} — transition-timing-function "ease" not in animation presets`,
                suggestion: 'Use a DESIGN.md animation preset easing',
                element: H.fadeText,
            },
        ]);
    });

    it('passes animation easing in presets', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .fade { transition-timing-function: ease-in-out; }
                @media (prefers-reduced-motion: reduce) { .fade { transition-duration: 0s; } }
            </style>
            <div class="fade">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('warns when animations exist but no prefers-reduced-motion', async () => {
        const ctx = makeContext(`<html><body>
            <style>.fade { transition: opacity 300ms; }</style>
            <div class="fade">Text</div>
        </body></html>`);
        const findings = withoutGuide(await validateTokens(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    'Page uses transitions/animations but has no @media (prefers-reduced-motion) override',
                suggestion:
                    'Add @media (prefers-reduced-motion: reduce) { * { transition-duration: 0s !important; animation-duration: 0s !important; } }',
            },
        ]);
    });

    it('passes when prefers-reduced-motion is present', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .fade { transition: opacity 300ms; }
                @media (prefers-reduced-motion: reduce) {
                    .fade { transition-duration: 0s; }
                }
            </style>
            <div class="fade">Text</div>
        </body></html>`);
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });

    it('finds styles in <head> (not just <body>)', async () => {
        const ctx = makeContext(`<html>
            <head><style>.card { color: #ff0000; }</style></head>
            <body><div class="card">Text</div></body>
        </html>`);
        const findings = await validateTokens(ctx);
        expect(findings.length).toBeGreaterThan(0);
        expect(findings[0].message).toMatch(
            /Hardcoded color "#ff0000" for color not in design system/,
        );
    });

    it('validates background shorthand with color value', async () => {
        const ctx = makeContext(`<html>
            <head><style>.card { background: #ff0000; }</style></head>
            <body><div class="card">Text</div></body>
        </html>`);
        const findings = await validateTokens(ctx);
        expect(findings.length).toBeGreaterThan(0);
        expect(findings[0].message).toMatch(
            /Hardcoded color "#ff0000" in background not in design system/,
        );
    });

    it('passes background shorthand with gradient (not a simple color)', async () => {
        const ctx = makeContext(`<html>
            <head><style>.card { background: linear-gradient(to right, #ff0000, #00ff00); }</style></head>
            <body><div class="card">Text</div></body>
        </html>`);
        const findings = await validateTokens(ctx);
        const bgFindings = findings.filter((f) => f.message.includes('background'));
        expect(bgFindings).toEqual([]);
    });

    it('passes background shorthand with token color', async () => {
        const ctx = makeContext(`<html>
            <head><style>.card { background: #2563eb; }</style></head>
            <body><div class="card">Text</div></body>
        </html>`);
        const findings = await validateTokens(ctx);
        const bgFindings = findings.filter((f) => f.message.includes('background'));
        expect(bgFindings).toEqual([]);
    });

    it('flags fallback color in multi-layer background', async () => {
        const ctx = makeContext(`<html>
            <head><style>.hero { background: radial-gradient(circle, #4f46e5 0%, transparent 40%), #ff0000; }</style></head>
            <body><div class="hero">Text</div></body>
        </html>`);
        const findings = await validateTokens(ctx);
        const bgFindings = findings.filter((f) => f.message.includes('background'));
        expect(bgFindings.length).toEqual(1);
        expect(bgFindings[0].message).toMatch(
            /Hardcoded color "#ff0000" in background not in design system/,
        );
    });

    it('passes multi-layer background with only gradients', async () => {
        const ctx = makeContext(`<html>
            <head><style>.hero { background: linear-gradient(135deg, #111 0%, #222 100%); }</style></head>
            <body><div class="hero">Text</div></body>
        </html>`);
        const findings = await validateTokens(ctx);
        const bgFindings = findings.filter((f) => f.message.includes('background'));
        expect(bgFindings).toEqual([]);
    });

    it('returns no findings when no DESIGN.md', async () => {
        const root = parse(
            '<html><body><style>.x{color:red}</style><div class="x">X</div></body></html>',
        );
        const ctx = {
            body: root.querySelector('body') || root,
            css: extractCss(root),
            filePath: '/nonexistent/page.jay-html',
            projectRoot: '/nonexistent',
            headlessImports: [],
        };
        const findings = await validateTokens(ctx);
        expect(findings).toEqual([]);
    });
});
