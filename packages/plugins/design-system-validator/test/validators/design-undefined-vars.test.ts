import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validateUndefinedVars } from '../../lib';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';

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
        filePath: 'src/pages/test/page.jay-html',
        projectRoot: '/tmp/test-project',
        headlessImports: [],
    };
}

describe('design-undefined-vars validator', () => {
    it('flags var(--x) when --x is not defined', async () => {
        const ctx = makeContext(`<html><head>
            <style>.card { color: var(--color-missing); }</style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: 'CSS variable "--color-missing" is used but never defined',
                suggestion: expect.stringContaining('Define --color-missing in a :root block'),
            },
        ]);
    });

    it('passes when --x is defined in :root', async () => {
        const ctx = makeContext(`<html><head>
            <style>
                :root { --color-primary: #2563eb; }
                .card { color: var(--color-primary); }
            </style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([]);
    });

    it('passes when --x is defined in html selector', async () => {
        const ctx = makeContext(`<html><head>
            <style>
                html { --color-text: #0f172a; }
                .card { color: var(--color-text); }
            </style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([]);
    });

    it('passes when --x is defined in a scoped selector', async () => {
        const ctx = makeContext(`<html><head>
            <style>
                .dark { --color-bg: #000; }
                .card { background-color: var(--color-bg); }
            </style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([]);
    });

    it('passes when --x is defined inside a @media query', async () => {
        const ctx = makeContext(`<html><head>
            <style>
                @media (prefers-color-scheme: dark) {
                    :root { --color-bg: #1a1a1a; }
                }
                .card { background-color: var(--color-bg); }
            </style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([]);
    });

    it('includes fallback in message when present', async () => {
        const ctx = makeContext(`<html><head>
            <style>.card { color: var(--color-missing, red); }</style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    'CSS variable "--color-missing" is used but never defined (falls back to "red")',
                suggestion: expect.stringContaining('Define --color-missing'),
            },
        ]);
    });

    it('flags multiple undefined vars', async () => {
        const ctx = makeContext(`<html><head>
            <style>
                .card { color: var(--text); background: var(--bg); }
            </style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings.length).toEqual(2);
        expect(findings[0].message).toEqual('CSS variable "--text" is used but never defined');
        expect(findings[1].message).toEqual('CSS variable "--bg" is used but never defined');
    });

    it('returns no findings when no var() is used', async () => {
        const ctx = makeContext(`<html><head>
            <style>.card { color: #ff0000; }</style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([]);
    });

    it('returns no findings when no CSS', async () => {
        const ctx = makeContext(`<html><body><div>Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([]);
    });

    it('suppresses with same-line /* design-system: allow */ comment', async () => {
        const ctx = makeContext(`<html><head>
            <style>.card { color: var(--color-missing); /* design-system: allow */ }</style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([]);
    });

    it('suppresses with next-line /* design-system: allow */ comment', async () => {
        const ctx = makeContext(`<html><head>
            <style>
                .card {
                    color: var(--color-missing);
                    /* design-system: allow */
                }
            </style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([]);
    });

    it('passes when var references another defined var', async () => {
        const ctx = makeContext(`<html><head>
            <style>
                :root {
                    --base: #2563eb;
                    --color-primary: var(--base);
                }
                .card { color: var(--color-primary); }
            </style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([]);
    });

    it('flags var inside a var definition when the referenced var is missing', async () => {
        const ctx = makeContext(`<html><head>
            <style>
                :root { --color-primary: var(--base); }
                .card { color: var(--color-primary); }
            </style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: 'CSS variable "--base" is used but never defined',
                suggestion: expect.stringContaining('Define --base'),
            },
        ]);
    });

    it('reports each undefined var only once even if used multiple times', async () => {
        const ctx = makeContext(`<html><head>
            <style>
                .a { color: var(--missing); }
                .b { background: var(--missing); }
            </style>
        </head><body><div class="a">A</div><div class="b">B</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings.length).toEqual(1);
        expect(findings[0].message).toEqual('CSS variable "--missing" is used but never defined');
    });

    it('skips standalone component files (not under pages/)', async () => {
        const root = parse(`<html><head>
            <style>.header { color: var(--color-missing); }</style>
        </head><body><div class="header">Text</div></body></html>`);
        const ctx: JayHtmlValidationContext = {
            body: root.querySelector('body') || root,
            css: extractCss(root),
            filePath: 'src/components/site-header/site-header.jay-html',
            projectRoot: '/tmp/test-project',
            headlessImports: [],
        };
        const findings = await validateUndefinedVars(ctx);
        expect(findings).toEqual([]);
    });

    it('includes component name in message when var comes from a component', async () => {
        const css =
            ':root { --color-text: #000; }\n' +
            '/* Component: site-header */\n' +
            '.header { color: var(--color-missing); }';
        const root = parse('<html><body><div>Text</div></body></html>');
        const ctx: JayHtmlValidationContext = {
            body: root.querySelector('body') || root,
            css,
            filePath: 'src/pages/home/page.jay-html',
            projectRoot: '/tmp/test-project',
            headlessImports: [],
        };
        const findings = await validateUndefinedVars(ctx);
        expect(findings.length).toEqual(1);
        expect(findings[0].message).toEqual(
            'CSS variable "--color-missing" used by component "site-header" is not defined — add it to the page\'s CSS or a linked stylesheet',
        );
    });

    it('suggestion mentions suppression and agent-kit guide', async () => {
        const ctx = makeContext(`<html><head>
            <style>.card { color: var(--x); }</style>
        </head><body><div class="card">Text</div></body></html>`);
        const findings = await validateUndefinedVars(ctx);
        expect(findings[0].suggestion).toEqual(
            'Define --x in a :root block, or replace with a DESIGN.md token value directly.\n' +
                'To suppress: add /* design-system: allow */ on the same line or the line after the declaration.\n' +
                'See agent-kit/designer/design-system.md for usage guide.',
        );
    });
});
