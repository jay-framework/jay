import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validateViewportHeight } from '../../lib/tools';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';

function extractCss(root: ReturnType<typeof parse>): string | undefined {
    const parts: string[] = [];
    for (const style of root.querySelectorAll('style')) {
        const text = style.textContent;
        if (text) parts.push(text);
    }
    return parts.length > 0 ? parts.join('\n') : undefined;
}

function makeContext(
    html: string,
    overrides: Partial<JayHtmlValidationContext> = {},
): JayHtmlValidationContext {
    const root = parse(html);
    const body = root.querySelector('body') || root;
    return {
        body,
        css: extractCss(root),
        filePath: 'src/pages/test/page.jay-html',
        projectRoot: '/tmp/test-project',
        headlessImports: [],
        ...overrides,
    };
}

const SUGGESTION_HINT = 'swapping vh → dvh/svh/lvh is NOT a fix';

describe('validateViewportHeight (DL#188)', () => {
    it('warns on a top-level <main> with min-height: 100vh', async () => {
        const ctx = makeContext(
            `<html><head><style>main { min-height: 100vh; }</style></head><body><main></main></body></html>`,
        );
        expect(await validateViewportHeight(ctx)).toEqual([
            {
                severity: 'warning',
                message:
                    'Top-level container "main" sets min-height: 100vh. Googlebot renders into a very tall viewport (~12,000px), so viewport-height units expand this section and distort Search Console screenshots / mobile-usability reports.',
                suggestion: expect.stringContaining(SUGGESTION_HINT),
                element: '<main>',
            },
        ]);
    });

    it('warns on body { height: 100vh } via the root-container path', async () => {
        const ctx = makeContext(
            `<html><head><style>body { height: 100vh; }</style></head><body></body></html>`,
        );
        expect(await validateViewportHeight(ctx)).toEqual([
            {
                severity: 'warning',
                message:
                    'Top-level container "body" sets height: 100vh. Googlebot renders into a very tall viewport (~12,000px), so viewport-height units expand this section and distort Search Console screenshots / mobile-usability reports.',
                suggestion: expect.stringContaining(SUGGESTION_HINT),
                element: '<body>',
            },
        ]);
    });

    it('maps html/:root selectors onto the top-level container', async () => {
        const ctx = makeContext(
            `<html><head><style>html { min-height: 100vh; }</style></head><body></body></html>`,
        );
        expect(await validateViewportHeight(ctx)).toEqual([
            {
                severity: 'warning',
                message:
                    'Top-level container "html" sets min-height: 100vh. Googlebot renders into a very tall viewport (~12,000px), so viewport-height units expand this section and distort Search Console screenshots / mobile-usability reports.',
                suggestion: expect.stringContaining(SUGGESTION_HINT),
                element: '<body>',
            },
        ]);
    });

    it('warns on a direct child of <body> with a fractional vh height', async () => {
        const ctx = makeContext(
            `<html><head><style>.hero { height: 60vh; }</style></head><body><div class="hero"></div></body></html>`,
        );
        expect(await validateViewportHeight(ctx)).toEqual([
            {
                severity: 'warning',
                message:
                    'Top-level container ".hero" sets height: 60vh. Googlebot renders into a very tall viewport (~12,000px), so viewport-height units expand this section and distort Search Console screenshots / mobile-usability reports.',
                suggestion: expect.stringContaining(SUGGESTION_HINT),
                element: '<div>',
            },
        ]);
    });

    it('warns on dvh (unit swap is not a fix)', async () => {
        const ctx = makeContext(
            `<html><head><style>main { min-height: 100dvh; }</style></head><body><main></main></body></html>`,
        );
        expect(await validateViewportHeight(ctx)).toEqual([
            {
                severity: 'warning',
                message:
                    'Top-level container "main" sets min-height: 100dvh. Googlebot renders into a very tall viewport (~12,000px), so viewport-height units expand this section and distort Search Console screenshots / mobile-usability reports.',
                suggestion: expect.stringContaining(SUGGESTION_HINT),
                element: '<main>',
            },
        ]);
    });

    it('still warns when max-height also uses a viewport unit (no real cap)', async () => {
        const ctx = makeContext(
            `<html><head><style>main { min-height: 100vh; max-height: 100vh; }</style></head><body><main></main></body></html>`,
        );
        expect(await validateViewportHeight(ctx)).toEqual([
            {
                severity: 'warning',
                message:
                    'Top-level container "main" sets min-height: 100vh. Googlebot renders into a very tall viewport (~12,000px), so viewport-height units expand this section and distort Search Console screenshots / mobile-usability reports.',
                suggestion: expect.stringContaining(SUGGESTION_HINT),
                element: '<main>',
            },
        ]);
    });

    it('does not warn when bounded by a non-viewport max-height', async () => {
        const ctx = makeContext(
            `<html><head><style>main { min-height: 100vh; max-height: 900px; }</style></head><body><main></main></body></html>`,
        );
        expect(await validateViewportHeight(ctx)).toEqual([]);
    });

    it('does not warn on an out-of-flow overlay (position: fixed)', async () => {
        const ctx = makeContext(
            `<html><head><style>.modal { position: fixed; height: 100vh; }</style></head><body><div class="modal"></div></body></html>`,
        );
        expect(await validateViewportHeight(ctx)).toEqual([]);
    });

    it('does not warn on a deeply nested card (out of scope)', async () => {
        const ctx = makeContext(
            `<html><head><style>.grid .card { height: 100vh; }</style></head><body><div class="grid"><div class="card"></div></div></body></html>`,
        );
        expect(await validateViewportHeight(ctx)).toEqual([]);
    });

    it('does not warn when the vh rule is scoped to a @media query', async () => {
        const ctx = makeContext(
            `<html><head><style>@media (min-width: 769px) { main { min-height: 100vh; } }</style></head><body><main></main></body></html>`,
        );
        expect(await validateViewportHeight(ctx)).toEqual([]);
    });

    it('does not warn on height: 100% (bounded-inheritance, not a trigger)', async () => {
        const ctx = makeContext(
            `<html><head><style>html, body { height: 100%; }</style></head><body></body></html>`,
        );
        expect(await validateViewportHeight(ctx)).toEqual([]);
    });

    it('does not warn on vw / vmin (width-driven units)', async () => {
        const ctx = makeContext(
            `<html><head><style>main { min-height: 100vmin; width: 100vw; }</style></head><body><main></main></body></html>`,
        );
        expect(await validateViewportHeight(ctx)).toEqual([]);
    });

    it('is silenced by page-level suppression', async () => {
        const ctx = makeContext(
            `<html><head><style>main { min-height: 100vh; }</style></head><body><main></main></body></html>`,
            { validationOverrides: { 'design-system': { 'allow-viewport-height': true } } },
        );
        expect(await validateViewportHeight(ctx)).toEqual([]);
    });

    it('skips standalone component files', async () => {
        const ctx = makeContext(
            `<html><head><style>main { min-height: 100vh; }</style></head><body><main></main></body></html>`,
            { filePath: 'src/components/hero/comp.jay-html' },
        );
        expect(await validateViewportHeight(ctx)).toEqual([]);
    });
});
