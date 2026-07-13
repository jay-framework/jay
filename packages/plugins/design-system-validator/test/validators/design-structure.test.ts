import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validateStructure } from '../../lib';
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

describe('design-structure validator', () => {
    it('flags too many font weights', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .a { font-weight: 300; }
                .b { font-weight: 400; }
                .c { font-weight: 600; }
                .d { font-weight: 700; }
            </style>
            <span class="a">A</span>
            <span class="b">B</span>
            <span class="c">C</span>
            <span class="d">D</span>
        </body></html>`);
        const findings = await validateStructure(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: '4 unique font-weight values found (max: 3): 300, 400, 600, 700',
                suggestion: 'Reduce to 3 font-weight values from the DESIGN.md typography tokens',
            },
        ]);
    });

    it('passes within font weight limit', async () => {
        const ctx = makeContext(`<html><body>
            <style>
                .a { font-weight: 400; }
                .b { font-weight: 600; }
                .c { font-weight: 700; }
            </style>
            <span class="a">A</span>
            <span class="b">B</span>
            <span class="c">C</span>
        </body></html>`);
        const findings = await validateStructure(ctx);
        expect(findings).toEqual([]);
    });

    it('flags multiple distinct primary buttons', async () => {
        const ctx = makeContext(`<html><body>
            <button class="btn-primary" ref="save">Save</button>
            <button class="btn-primary" ref="submit">Submit</button>
        </body></html>`);
        const findings = await validateStructure(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: '2 distinct primary buttons found (max: 1)',
                suggestion: 'Reduce to 1 primary action button per page',
            },
        ]);
    });

    it('same button ref+text counts as one', async () => {
        const ctx = makeContext(`<html><body>
            <button class="btn-primary" ref="save">Save</button>
            <button class="btn-primary" ref="save">Save</button>
        </body></html>`);
        const findings = await validateStructure(ctx);
        expect(findings).toEqual([]);
    });
});
