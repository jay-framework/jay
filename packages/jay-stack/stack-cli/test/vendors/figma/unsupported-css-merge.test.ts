import { describe, it, expect } from 'vitest';
import { figmaVendor } from '../../../lib/vendors/figma/index';
import type { FigmaVendorDocument, ProjectPage } from '@jay-framework/editor-protocol';

function makeTextNode(id: string, text: string): FigmaVendorDocument {
    return {
        id,
        name: text,
        type: 'TEXT',
        characters: text,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        fontName: { family: 'Inter', style: 'Regular' },
        fontSize: 14,
        fontWeight: 400,
        textAlignHorizontal: 'LEFT',
        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
    } as unknown as FigmaVendorDocument;
}

function makeSection(children: FigmaVendorDocument[]): FigmaVendorDocument {
    return {
        id: 'section-1',
        name: 'Test',
        type: 'SECTION',
        x: 0,
        y: 0,
        width: 1440,
        height: 900,
        pluginData: { jpage: 'true', urlRoute: '/' },
        children: [
            {
                id: 'frame-1',
                name: 'Content',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 800,
                height: 400,
                layoutMode: 'VERTICAL',
                fills: [],
                children,
            },
        ],
    } as FigmaVendorDocument;
}

const emptyPage: ProjectPage = { name: 'test', url: '/', filePath: '/test', usedComponents: [] };

describe('Unsupported CSS Merge on Export', () => {
    it('appends unsupported CSS to inline-styled nodes', async () => {
        const doc = makeSection([
            {
                id: 'card',
                name: 'Card',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 300,
                height: 200,
                layoutMode: 'VERTICAL',
                fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
                pluginData: {
                    'jay-unsupported-css': JSON.stringify({
                        transition: 'all 0.3s ease',
                        'box-shadow': '0 4px 6px rgba(0,0,0,0.1)',
                    }),
                },
                children: [makeTextNode('t1', 'Hello')],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const body = result.bodyHtml;

        expect(body).toContain('transition: all 0.3s ease;');
        expect(body).toContain('box-shadow: 0 4px 6px rgba(0,0,0,0.1);');
    });

    it('does NOT emit unsupported CSS for class-based nodes', async () => {
        const doc = makeSection([
            {
                id: 'grid',
                name: 'Grid',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 600,
                height: 400,
                layoutMode: 'VERTICAL',
                fills: [],
                pluginData: {
                    className: 'product-grid',
                    'jay-unsupported-css': JSON.stringify({
                        'grid-template-columns': 'repeat(3, 1fr)',
                        gap: '20px',
                    }),
                },
                children: [makeTextNode('t2', 'Item')],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const body = result.bodyHtml;

        expect(body).toContain('class="product-grid"');
        expect(body).not.toContain('grid-template-columns');
        expect(body).not.toContain('gap: 20px');
    });

    it('Figma-derived properties win over unsupported CSS for overlapping properties', async () => {
        const doc = makeSection([
            {
                id: 'overlap',
                name: 'Overlap',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 400,
                height: 200,
                layoutMode: 'VERTICAL',
                fills: [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }],
                pluginData: {
                    'jay-unsupported-css': JSON.stringify({
                        // background-color overlaps with Figma's solid fill output
                        'background-color': 'red',
                        // display overlaps with Figma's flex layout
                        display: 'grid',
                        cursor: 'pointer',
                    }),
                },
                children: [makeTextNode('t3', 'Content')],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const body = result.bodyHtml;

        // Figma background-color wins (solid fill → hex)
        expect(body).toContain('background-color: #808080;');
        expect(body).not.toMatch(/background-color:\s*red/);
        // Figma display:flex wins over unsupported display:grid
        expect(body).toContain('display: flex;');
        expect(body).not.toContain('display: grid');
        // Non-overlapping unsupported CSS is appended
        expect(body).toContain('cursor: pointer;');
    });
});
