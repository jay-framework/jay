import { describe, it, expect } from 'vitest';
import { adaptIRToFigmaVendorDoc } from '../../../lib/vendors/figma/import-ir-to-figma-vendor-doc';
import type { ImportIRDocument, ImportIRNode } from '../../../lib/vendors/figma/import-ir';

function makeDoc(root: ImportIRNode): ImportIRDocument {
    return {
        version: 'import-ir/v0',
        pageName: 'test',
        route: '/test',
        source: { kind: 'jay-html', filePath: '/test', contentHash: 'abc' },
        parser: { baseElementName: 'test' },
        contracts: {},
        root,
        warnings: [],
    };
}

function makeFrame(overrides: Partial<ImportIRNode> = {}): ImportIRNode {
    return {
        id: 'frame-1',
        sourcePath: '/div',
        kind: 'FRAME',
        ...overrides,
    };
}

describe('adaptIRToFigmaVendorDoc', () => {
    describe('Grid mapping', () => {
        it('grid layoutMode maps to GRID', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: { layoutMode: 'grid', gap: 16 },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const gridFrame = result.children![0];
            expect(gridFrame.layoutMode).toBe('GRID');
            expect(gridFrame.itemSpacing).toBe(16);
        });

        it('equal-width columns map to FLEX tracks', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            layoutMode: 'grid',
                            gridColumnWidths: [200, 200, 200, 200],
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const gridFrame = result.children![0];
            expect(gridFrame.gridColumnsSizes).toEqual([
                { type: 'FLEX', value: 1 },
                { type: 'FLEX', value: 1 },
                { type: 'FLEX', value: 1 },
                { type: 'FLEX', value: 1 },
            ]);
        });

        it('mixed-width columns map to FIXED tracks', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            layoutMode: 'grid',
                            gridColumnWidths: [100, 200, 150],
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const gridFrame = result.children![0];
            expect(gridFrame.gridColumnsSizes).toEqual([
                { type: 'FIXED', value: 100 },
                { type: 'FIXED', value: 200 },
                { type: 'FIXED', value: 150 },
            ]);
        });

        it('single column maps to FLEX track', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            layoutMode: 'grid',
                            gridColumnWidths: [300],
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const gridFrame = result.children![0];
            expect(gridFrame.gridColumnsSizes).toEqual([{ type: 'FLEX', value: 1 }]);
        });

        it('rowGap maps to counterAxisSpacing', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: { layoutMode: 'grid', rowGap: 24 },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const gridFrame = result.children![0];
            expect(gridFrame.counterAxisSpacing).toBe(24);
        });

        it('gridRowHeights maps to gridRowsSizes', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            layoutMode: 'grid',
                            gridRowHeights: [50, 80],
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const gridFrame = result.children![0];
            expect(gridFrame.gridRowsSizes).toEqual([
                { type: 'FIXED', value: 50 },
                { type: 'FIXED', value: 80 },
            ]);
        });

        it('grid children get fixed column widths', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            layoutMode: 'grid',
                            gridColumnWidths: [200, 200, 200],
                        },
                        children: [makeFrame({ id: 'child-1' }), makeFrame({ id: 'child-2' })],
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const gridFrame = result.children![0];
            for (const child of gridFrame.children!) {
                expect(child.width).toBe(200);
                expect(child.layoutSizingHorizontal).toBe('FIXED');
            }
        });
    });

    describe('absolute positioning', () => {
        it('isAbsolute maps to layoutPositioning ABSOLUTE', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: { isAbsolute: true, x: 50, y: 100 },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const absFrame = result.children![0];
            expect(absFrame.layoutPositioning).toBe('ABSOLUTE');
            expect(absFrame.x).toBe(50);
            expect(absFrame.y).toBe(100);
        });

        it('non-absolute with x/y does NOT set layoutPositioning', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: { width: 200, height: 100 },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const frame = result.children![0];
            expect(frame.layoutPositioning).toBeUndefined();
        });
    });
});
