/**
 * Issue 001: binding-only / empty jay-html text should use snapshot textContent
 * for IR (and thus Figma characters), not literal `{scope.field}`.
 */
import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import { computeSourceId } from '@jay-framework/compiler-jay-html';
import { buildImportIR } from '../../../lib/vendors/figma/jay-html-to-import-ir';
import { adaptIRToFigmaVendorDoc } from '../../../lib/vendors/figma/import-ir-to-figma-vendor-doc';
import type { ComputedStyleMap } from '../../../lib/vendors/figma/computed-style-types';
import type { ImportIRNode } from '../../../lib/vendors/figma/import-ir';
import type { FigmaVendorDocument } from '@jay-framework/editor-protocol';

const RENDERED_HEADLINE = 'Sample headline for Figma import (binding-only repro)';

function findFirstText(node: ImportIRNode): ImportIRNode | undefined {
    if (node.kind === 'TEXT') return node;
    if (node.children) {
        for (const c of node.children) {
            const f = findFirstText(c);
            if (f) return f;
        }
    }
    return undefined;
}

function findVendorTextBySubstring(
    node: FigmaVendorDocument,
    substr: string,
): FigmaVendorDocument | undefined {
    if (node.type === 'TEXT' && node.characters?.includes(substr)) return node;
    if (node.children) {
        for (const c of node.children) {
            const f = findVendorTextBySubstring(c, substr);
            if (f) return f;
        }
    }
    return undefined;
}

describe('TEXT sampling from render snapshot (Issue 001)', () => {
    it('uses enriched textContent for binding-only h1 (no static copy)', () => {
        const inner = `<div class="page"><h1 class="sampled-headline">{lab.headline}</h1></div>`;
        const sourceHtml = `<body>${inner}</body>`;
        const body = parse(sourceHtml).querySelector('body')!;
        const h1El = body.querySelector('h1')!;
        expect(h1El.range[0]).toBeGreaterThanOrEqual(0);
        const sid = computeSourceId(h1El.range[0], sourceHtml);
        const computedStyleMap: ComputedStyleMap = new Map([
            [
                sid,
                {
                    styles: { color: 'rgb(26, 26, 26)' },
                    textContent: RENDERED_HEADLINE,
                },
            ],
        ]);
        const ir = buildImportIR(body, '/level-7-sampled-text', 'lab', {
            sourceHtml,
            computedStyleMap,
        });
        const text = findFirstText(ir.root.children![0]!);
        expect(text).toBeDefined();
        expect(text!.text!.characters).toBe(RENDERED_HEADLINE);
        expect(text!.name).toBe(RENDERED_HEADLINE.slice(0, 24));
    });

    it('maps IR TEXT characters through adaptIRToFigmaVendorDoc', () => {
        const inner = `<div class="page"><h1 class="sampled-headline">{lab.headline}</h1></div>`;
        const sourceHtml = `<body>${inner}</body>`;
        const body = parse(sourceHtml).querySelector('body')!;
        const h1El = body.querySelector('h1')!;
        const sid = computeSourceId(h1El.range[0], sourceHtml);
        const computedStyleMap: ComputedStyleMap = new Map([
            [sid, { styles: {}, textContent: RENDERED_HEADLINE }],
        ]);
        const ir = buildImportIR(body, '/test', 'test', { sourceHtml, computedStyleMap });
        const vendor = adaptIRToFigmaVendorDoc(ir);
        const textDoc = findVendorTextBySubstring(vendor, RENDERED_HEADLINE.slice(0, 8));
        expect(textDoc).toBeDefined();
        expect(textDoc!.characters).toBe(RENDERED_HEADLINE);
    });

    it('TEXT_MISMATCH_GUARD still rejects wrong enrichment for static literal copy', () => {
        const inner = `<div class="page"><h1 class="title">Real Title</h1></div>`;
        const sourceHtml = `<body>${inner}</body>`;
        const body = parse(sourceHtml).querySelector('body')!;
        const h1El = body.querySelector('h1')!;
        const sid = computeSourceId(h1El.range[0], sourceHtml);
        const computedStyleMap: ComputedStyleMap = new Map([
            [
                sid,
                {
                    styles: {},
                    textContent: 'Wrong Sibling Text',
                },
            ],
        ]);
        const ir = buildImportIR(body, '/test', 'test', { sourceHtml, computedStyleMap });
        const text = findFirstText(ir.root.children![0]!);
        expect(text!.text!.characters).toBe('Real Title');
        const guard = ir.warnings.some((w) => w.startsWith('TEXT_MISMATCH_GUARD:'));
        expect(guard).toBe(true);
    });

    it('keeps ref-based layer name when ref is set even if snapshot fills characters', () => {
        const inner = `<div class="page"><h1 ref="heroTitle" class="sampled-headline">{lab.headline}</h1></div>`;
        const sourceHtml = `<body>${inner}</body>`;
        const body = parse(sourceHtml).querySelector('body')!;
        const h1El = body.querySelector('h1')!;
        const sid = computeSourceId(h1El.range[0], sourceHtml);
        const computedStyleMap: ComputedStyleMap = new Map([
            [sid, { styles: {}, textContent: RENDERED_HEADLINE }],
        ]);
        const ir = buildImportIR(body, '/test', 'test', { sourceHtml, computedStyleMap });
        const text = findFirstText(ir.root.children![0]!);
        expect(text!.name).toBe('heroTitle');
        expect(text!.text!.characters).toBe(RENDERED_HEADLINE);
    });
});
