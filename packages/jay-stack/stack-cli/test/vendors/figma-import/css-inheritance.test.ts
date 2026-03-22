import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { buildImportIR } from '../../../lib/vendors/figma/jay-html-to-import-ir';
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
});
