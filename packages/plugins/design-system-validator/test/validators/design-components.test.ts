import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validateComponents } from '../../lib';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';
import path from 'node:path';

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'components');
const DESIGN_MD = 'DESIGN.md';
const GUIDE = 'agent-kit/designer/design-system.md';
const REFS = `See ${DESIGN_MD} for component specs, ${GUIDE} for usage guide.`;

function makeContext(html: string): JayHtmlValidationContext {
    return {
        body: parse(html),
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
        const findings = await validateComponents(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    '<jay:product-card> inline template: background-color should be "#f8fafc" per jay:product-card component spec, found "#ffffff"',
                suggestion: REFS,
                element: '<div>',
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
        const findings = await validateComponents(ctx);
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    'Component "button-primary": background-color should be "#2563eb" per button-primary component spec, found "#ff0000"',
                suggestion: REFS,
                element: '<button>',
            },
        ]);
    });

    it('returns no findings when no components defined', async () => {
        const ctx = {
            body: parse(
                '<html><body><style>.x{color:red}</style><div class="x">X</div></body></html>',
            ),
            filePath: path.join(fixturesDir, 'page.jay-html'),
            projectRoot: path.join(__dirname, '..', 'fixtures', 'basic'),
            headlessImports: [],
        };
        const findings = await validateComponents(ctx);
        expect(findings).toEqual([]);
    });
});
