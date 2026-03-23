import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { computeSourceId } from '@jay-framework/compiler-jay-html';
import { buildImportIR } from '../../../lib/vendors/figma/jay-html-to-import-ir';
import type { ComputedStyleMap } from '../../../lib/vendors/figma/computed-style-types';
import type { ImportIRNode } from '../../../lib/vendors/figma/import-ir';

function findFirstKind(node: ImportIRNode, kind: ImportIRNode['kind']): ImportIRNode | undefined {
    if (node.kind === kind) return node;
    if (node.children) {
        for (const c of node.children) {
            const f = findFirstKind(c, kind);
            if (f) return f;
        }
    }
    return undefined;
}

/**
 * Parent class sets color + text-align; child class only sets typography.
 * Without inheritance, static import produced black, left-aligned text in Figma (#11).
 */
describe('CSS inheritance (static import)', () => {
    it('heading inherits color and text-align from parent header class', () => {
        const html = `<div class="page"><header class="hero-banner"><h1 class="hero-title">Title</h1></header></div>`;
        const css = `
.hero-banner { color: white; text-align: center; }
.hero-title { font-size: 36px; font-weight: 700; }
`;
        const body = parse(`<body>${html}</body>`).querySelector('body')!;
        const ir = buildImportIR(body, '/test', 'test', { css });
        const h1 = findFirstKind(ir.root.children![0], 'TEXT');
        expect(h1).toBeDefined();
        expect(h1!.style.textColor).toBe('white');
        expect(h1!.style.textAlignHorizontal).toBe('CENTER');
        expect(h1!.style.fontSize).toBe(36);
    });

    /**
     * Bug: Issue #14 — computed/enricher styles are merged after static CSS; getComputedStyle()
     * often reports body `color` and `text-align: start` on headings that only inherit from
     * an ancestor (.hero-banner). IR must prefer ancestor inheritance for inherit-only elements.
     */
    it('should keep hero title color and center alignment when enricher reports body defaults (issue #14)', () => {
        const inner = `<div class="page"><header class="hero-banner"><h1 class="hero-title">Title</h1></header></div>`;
        const sourceHtml = `<body>${inner}</body>`;
        const css = `
.hero-banner { color: white; text-align: center; }
.hero-title { font-size: 36px; font-weight: 700; }
`;
        const body = parse(sourceHtml).querySelector('body')!;
        const h1El = body.querySelector('h1')!;
        expect(h1El.range[0]).toBeGreaterThanOrEqual(0);
        const h1Sid = computeSourceId(h1El.range[0], sourceHtml);
        const computedStyleMap: ComputedStyleMap = new Map([
            [
                h1Sid,
                {
                    styles: {
                        color: 'rgb(33, 33, 33)',
                        'text-align': 'left',
                    },
                },
            ],
        ]);
        const ir = buildImportIR(body, '/test', 'test', { css, sourceHtml, computedStyleMap });
        const h1 = findFirstKind(ir.root.children![0], 'TEXT');
        expect(h1).toBeDefined();
        expect(h1!.style.textColor).toBe('white');
        expect(h1!.style.textAlignHorizontal).toBe('CENTER');
        expect(h1!.style.fontSize).toBe(36);
    });
});
