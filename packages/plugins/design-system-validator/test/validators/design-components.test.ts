import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validateComponents } from '../../lib';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';
import path from 'node:path';

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'components');
const REFS = 'See DESIGN.md components section'; // path is relative to fixtures dir

function withoutGuide(findings: any[]) {
    return findings.filter((f: any) => f.message !== '');
}

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

describe('design-components validator', () => {
    it('flags jay: component with wrong background', async () => {
        const ctx = makeContext(`<html><body>
            <style>.card { background-color: #ffffff; border-radius: 0.5rem; }</style>
            <jay:product-card>
                <div class="card">Product</div>
            </jay:product-card>
        </body></html>`);
        const findings = withoutGuide(await validateComponents(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    'DESIGN.md components.jay:product-card on <div class="card" > "Product":\n  1. background-color should be {colors.surface} (#f8fafc), found "#ffffff"',
                suggestion: REFS,
                element: '<div class="card" > "Product"',
            },
        ]);
    });

    it('passes jay: component with correct styles', async () => {
        const ctx = makeContext(`<html><body>
            <style>.card { background-color: #f8fafc; border-radius: 0.5rem; }</style>
            <jay:product-card>
                <div class="card">Product</div>
            </jay:product-card>
        </body></html>`);
        const findings = await validateComponents(ctx);
        expect(findings).toEqual([]);
    });

    it('validates HTML component by class', async () => {
        const ctx = makeContext(`<html><body>
            <style>.button-primary { background-color: #ff0000; color: #ffffff; }</style>
            <button class="button-primary">Click</button>
        </body></html>`);
        const findings = withoutGuide(await validateComponents(ctx));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    'DESIGN.md components.button-primary on <button class="button-primary" > "Click":\n  1. background-color should be {colors.primary} (#2563eb), found "#ff0000"',
                suggestion: REFS,
                element: '<button class="button-primary" > "Click"',
            },
        ]);
    });

    it('returns no findings when no components defined', async () => {
        const root = parse(
            '<html><body><style>.x{color:red}</style><div class="x">X</div></body></html>',
        );
        const ctx = {
            body: root.querySelector('body') || root,
            css: extractCss(root),
            filePath: path.join(fixturesDir, 'page.jay-html'),
            projectRoot: path.join(__dirname, '..', 'fixtures', 'basic'),
            headlessImports: [],
        };
        const findings = await validateComponents(ctx);
        expect(findings).toEqual([]);
    });
});
