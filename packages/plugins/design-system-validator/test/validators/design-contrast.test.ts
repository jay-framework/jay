import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validateContrast } from '../../lib';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';
import path from 'node:path';

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'basic');
const DESIGN_MD = 'DESIGN.md';
const GUIDE = 'agent-kit/designer/design-system.md';
const REFS = `\nSee ${DESIGN_MD} for color tokens, ${GUIDE} for usage guide.`;

function makeContext(html: string): JayHtmlValidationContext {
    return {
        body: parse(html),
        filePath: path.join(fixturesDir, 'page.jay-html'),
        projectRoot: fixturesDir,
        headlessImports: [],
    };
}

describe('design-contrast validator', () => {
    it('flags low contrast text', async () => {
        const ctx = makeContext(`<html><body>
            <style>.low { color: #94a3b8; background-color: #f8fafc; }</style>
            <p class="low">Hard to read</p>
        </body></html>`);
        const findings = await validateContrast(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message: expect.stringMatching(
                    /^Contrast ratio \d+\.\d+:1 below WCAG AA \(4\.5:1\) for color "#94a3b8" on background "#f8fafc"$/,
                ),
                suggestion: `Darken text color or lighten background to meet minimum contrast.${REFS}`,
                element: '<p>',
            },
        ]);
    });

    it('passes high contrast text', async () => {
        const ctx = makeContext(`<html><body>
            <style>.high { color: #0f172a; background-color: #ffffff; }</style>
            <p class="high">Easy to read</p>
        </body></html>`);
        const findings = await validateContrast(ctx);
        expect(findings).toEqual([]);
    });

    it('skips elements without both color and background', async () => {
        const ctx = makeContext(`<html><body>
            <style>.partial { color: #94a3b8; }</style>
            <p class="partial">No bg</p>
        </body></html>`);
        const findings = await validateContrast(ctx);
        expect(findings).toEqual([]);
    });

    it('uses lower threshold for large text', async () => {
        const ctx = makeContext(`<html><body>
            <style>.large { color: #64748b; background-color: #ffffff; font-size: 24px; }</style>
            <h1 class="large">Big heading</h1>
        </body></html>`);
        const findings = await validateContrast(ctx);
        expect(findings).toEqual([]);
    });
});
