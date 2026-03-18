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

        it('structured gridColumns with FLEX type map directly', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            layoutMode: 'grid',
                            gridColumns: [
                                { type: 'FLEX', value: 1 },
                                { type: 'FLEX', value: 1 },
                                { type: 'FLEX', value: 1 },
                                { type: 'FLEX', value: 1 },
                            ],
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

        it('structured gridColumns with mixed FIXED/FLEX map directly', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            layoutMode: 'grid',
                            gridColumns: [
                                { type: 'FIXED', value: 100 },
                                { type: 'FLEX', value: 1 },
                            ],
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const gridFrame = result.children![0];
            expect(gridFrame.gridColumnsSizes).toEqual([
                { type: 'FIXED', value: 100 },
                { type: 'FLEX', value: 1 },
            ]);
        });

        it('gridColumns preferred over gridColumnWidths when both present', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            layoutMode: 'grid',
                            gridColumnWidths: [200, 200],
                            gridColumns: [
                                { type: 'FLEX', value: 1 },
                                { type: 'FLEX', value: 1 },
                            ],
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const gridFrame = result.children![0];
            expect(gridFrame.gridColumnsSizes).toEqual([
                { type: 'FLEX', value: 1 },
                { type: 'FLEX', value: 1 },
            ]);
        });

        it('grid children get FILL sizing for all-FLEX columns', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            layoutMode: 'grid',
                            gridColumns: [
                                { type: 'FLEX', value: 1 },
                                { type: 'FLEX', value: 1 },
                            ],
                        },
                        children: [makeFrame({ id: 'child-1' }), makeFrame({ id: 'child-2' })],
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const gridFrame = result.children![0];
            for (const child of gridFrame.children!) {
                expect(child.layoutSizingHorizontal).toBe('FILL');
            }
        });
    });

    describe('Phase 3: visual property mappings', () => {
        it('gradient fill maps to GRADIENT_LINEAR paint', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            fills: [
                                {
                                    type: 'GRADIENT_LINEAR',
                                    angle: 180,
                                    stops: [
                                        { position: 0, color: 'rgba(245, 240, 233, 1)' },
                                        { position: 1, color: 'rgba(245, 240, 233, 0)' },
                                    ],
                                },
                            ],
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const frame = result.children![0];
            expect(frame.fills).toHaveLength(1);
            expect(frame.fills![0].type).toBe('GRADIENT_LINEAR');
            expect(frame.fills![0].gradientStops).toHaveLength(2);
            expect(frame.fills![0].gradientTransform).toBeDefined();
        });

        it('gradient fill preserves color stops with alpha', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            fills: [
                                {
                                    type: 'GRADIENT_LINEAR',
                                    angle: 90,
                                    stops: [
                                        { position: 0, color: 'rgba(0, 0, 0, 0.5)' },
                                        { position: 1, color: 'rgba(255, 255, 255, 1)' },
                                    ],
                                },
                            ],
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const stops = result.children![0].fills![0].gradientStops;
            expect(stops[0].color.a).toBe(0.5);
            expect(stops[1].color.a).toBe(1);
        });

        it('backgroundColor + gradient → solid fill + gradient fill', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            backgroundColor: '#f5f0e9',
                            fills: [
                                {
                                    type: 'GRADIENT_LINEAR',
                                    angle: 180,
                                    stops: [
                                        { position: 0, color: 'rgba(0,0,0,0.1)' },
                                        { position: 1, color: 'rgba(0,0,0,0)' },
                                    ],
                                },
                            ],
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const fills = result.children![0].fills!;
            expect(fills).toHaveLength(2);
            expect(fills[0].type).toBe('SOLID');
            expect(fills[1].type).toBe('GRADIENT_LINEAR');
        });

        it('per-side border widths → individual strokeWeights', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            borderTopWidth: 0,
                            borderRightWidth: 0,
                            borderBottomWidth: 2,
                            borderLeftWidth: 0,
                            borderColor: '#cccccc',
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const frame = result.children![0];
            expect(frame.strokeTopWeight).toBe(0);
            expect(frame.strokeBottomWeight).toBe(2);
            expect(frame.strokes).toHaveLength(1);
        });

        it('uniform per-side borders use single strokeWeight', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            borderTopWidth: 1,
                            borderRightWidth: 1,
                            borderBottomWidth: 1,
                            borderLeftWidth: 1,
                            borderColor: '#000000',
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const frame = result.children![0];
            expect(frame.strokeWeight).toBe(1);
            expect(frame.strokeTopWeight).toBeUndefined();
        });

        it('INNER_SHADOW effect mapped correctly', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            effects: [
                                {
                                    type: 'INNER_SHADOW',
                                    color: 'rgba(0,0,0,0.2)',
                                    offset: { x: 0, y: 2 },
                                    radius: 4,
                                },
                            ],
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const effects = result.children![0].effects!;
            expect(effects).toHaveLength(1);
            expect(effects[0].type).toBe('INNER_SHADOW');
            expect(effects[0].offset).toEqual({ x: 0, y: 2 });
        });

        it('LAYER_BLUR effect mapped correctly', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            effects: [{ type: 'LAYER_BLUR', radius: 10 }],
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const effects = result.children![0].effects!;
            expect(effects).toHaveLength(1);
            expect(effects[0]).toEqual({ type: 'LAYER_BLUR', radius: 10, visible: true });
        });

        it('BACKGROUND_BLUR effect mapped correctly', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        style: {
                            effects: [{ type: 'BACKGROUND_BLUR', radius: 20 }],
                        },
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const effects = result.children![0].effects!;
            expect(effects).toHaveLength(1);
            expect(effects[0]).toEqual({ type: 'BACKGROUND_BLUR', radius: 20, visible: true });
        });

        it('italic fontStyle → fontName with Italic suffix', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    {
                        id: 'text-1',
                        sourcePath: '/p',
                        kind: 'TEXT' as const,
                        text: { characters: 'Hello' },
                        style: {
                            fontFamily: 'Inter',
                            fontWeight: 400,
                            fontStyle: 'italic' as const,
                        },
                    },
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const textNode = result.children![0];
            expect(textNode.fontName).toEqual({ family: 'Inter', style: 'Regular Italic' });
        });

        it('non-italic fontStyle → fontName without Italic suffix', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    {
                        id: 'text-1',
                        sourcePath: '/p',
                        kind: 'TEXT' as const,
                        text: { characters: 'Hello' },
                        style: {
                            fontFamily: 'Inter',
                            fontWeight: 700,
                        },
                    },
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const textNode = result.children![0];
            expect(textNode.fontName).toEqual({ family: 'Inter', style: 'Bold' });
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

    describe('Hidden variant injection', () => {
        it('skips _hidden_ when boolean dimension has both true and false variants', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        id: 'cs-1',
                        kind: 'COMPONENT_SET',
                        componentPropertyDefinitions: {
                            hasItems: { type: 'VARIANT', variantOptions: ['true', 'false'] },
                        },
                        children: [
                            makeFrame({ id: 'c-true', kind: 'COMPONENT' }),
                            makeFrame({ id: 'c-false', kind: 'COMPONENT' }),
                        ],
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const compSet = result.children![0];
            expect(compSet.type).toBe('COMPONENT_SET');
            expect(compSet.children).toHaveLength(2);
            const names = compSet.children!.map((c) => c.name);
            expect(names).not.toContainEqual(expect.stringContaining('_hidden_'));
        });

        it('injects _hidden_ when boolean dimension only has true variant', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        id: 'cs-1',
                        kind: 'COMPONENT_SET',
                        componentPropertyDefinitions: {
                            hasDiscount: { type: 'VARIANT', variantOptions: ['true'] },
                        },
                        children: [makeFrame({ id: 'c-true', kind: 'COMPONENT' })],
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const compSet = result.children![0];
            expect(compSet.type).toBe('COMPONENT_SET');
            expect(compSet.children).toHaveLength(2);
            const hiddenChild = compSet.children!.find((c) =>
                c.pluginData?.['jay-hidden-variant'],
            );
            expect(hiddenChild).toBeDefined();
        });

        it('skips _hidden_ for multi-dimension when all are fully covered', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        id: 'cs-1',
                        kind: 'COMPONENT_SET',
                        componentPropertyDefinitions: {
                            hasItems: { type: 'VARIANT', variantOptions: ['true', 'false'] },
                            isExpanded: { type: 'VARIANT', variantOptions: ['true', 'false'] },
                        },
                        children: [
                            makeFrame({ id: 'c1', kind: 'COMPONENT' }),
                            makeFrame({ id: 'c2', kind: 'COMPONENT' }),
                            makeFrame({ id: 'c3', kind: 'COMPONENT' }),
                            makeFrame({ id: 'c4', kind: 'COMPONENT' }),
                        ],
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const compSet = result.children![0];
            expect(compSet.children).toHaveLength(4);
            const names = compSet.children!.map((c) => c.name);
            expect(names).not.toContainEqual(expect.stringContaining('_hidden_'));
        });

        it('injects _hidden_ when multi-dimension has at least one incomplete dimension', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        id: 'cs-1',
                        kind: 'COMPONENT_SET',
                        componentPropertyDefinitions: {
                            hasItems: { type: 'VARIANT', variantOptions: ['true', 'false'] },
                            isExpanded: { type: 'VARIANT', variantOptions: ['true'] },
                        },
                        children: [
                            makeFrame({ id: 'c1', kind: 'COMPONENT' }),
                            makeFrame({ id: 'c2', kind: 'COMPONENT' }),
                            makeFrame({ id: 'c3', kind: 'COMPONENT' }),
                        ],
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const compSet = result.children![0];
            expect(compSet.children!.length).toBeGreaterThan(3);
            const hiddenChild = compSet.children!.find((c) =>
                c.pluginData?.['jay-hidden-variant'],
            );
            expect(hiddenChild).toBeDefined();
        });
    });

    describe('Repeater demo item hoisting', () => {
        it('hoists demo items as siblings of forEach FRAME in parent', () => {
            const root = makeFrame({
                kind: 'SECTION',
                style: { layoutMode: 'column', gap: 8 },
                children: [
                    makeFrame({
                        id: 'repeater-1',
                        style: { width: 200, height: 50 },
                        children: [
                            makeFrame({ id: 'inner-child', style: { width: 100 } }),
                        ],
                        demoItems: [
                            { textOverrides: {}, imageOverrides: {} },
                            { textOverrides: {}, imageOverrides: {} },
                        ],
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            expect(result.children).toHaveLength(3);
            expect(result.children![0].id).toBe('repeater-1');
            expect(result.children![1].id).toBe('repeater-1-demo-0');
            expect(result.children![2].id).toBe('repeater-1-demo-1');
        });

        it('demo clones are full copies of the forEach FRAME, not just first child', () => {
            const root = makeFrame({
                kind: 'SECTION',
                style: { layoutMode: 'column' },
                children: [
                    makeFrame({
                        id: 'card',
                        style: { width: 240, height: 300 },
                        children: [
                            makeFrame({ id: 'title', style: { height: 20 } }),
                            makeFrame({ id: 'body', style: { height: 100 } }),
                        ],
                        demoItems: [{ textOverrides: {}, imageOverrides: {} }],
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            expect(result.children).toHaveLength(2);
            const template = result.children![0];
            const demo = result.children![1];
            expect(template.children).toHaveLength(2);
            expect(demo.children).toHaveLength(2);
            expect(demo.width).toBe(template.width);
        });

        it('grid item span properties are mapped to vendor doc', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        id: 'grid-parent',
                        style: {
                            layoutMode: 'grid',
                            gridColumns: [
                                { type: 'FLEX', value: 1 },
                                { type: 'FLEX', value: 1 },
                            ],
                        },
                        children: [
                            makeFrame({
                                id: 'spanning-child',
                                style: { gridColumnSpan: 2, gridRowSpan: 2 },
                            }),
                        ],
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const child = result.children![0].children![0];
            expect(child.gridColumnSpan).toBe(2);
            expect(child.gridRowSpan).toBe(2);
        });

        it('repeater items are direct children of grid parent', () => {
            const root = makeFrame({
                kind: 'SECTION',
                children: [
                    makeFrame({
                        id: 'grid-parent',
                        style: {
                            layoutMode: 'grid',
                            gridColumns: [
                                { type: 'FLEX', value: 1 },
                                { type: 'FLEX', value: 1 },
                                { type: 'FLEX', value: 1 },
                            ],
                            gap: 20,
                        },
                        children: [
                            makeFrame({
                                id: 'product-card',
                                style: { width: 200, height: 250 },
                                children: [makeFrame({ id: 'card-content' })],
                                demoItems: [
                                    { textOverrides: {}, imageOverrides: {} },
                                    { textOverrides: {}, imageOverrides: {} },
                                ],
                            }),
                        ],
                    }),
                ],
            });
            const result = adaptIRToFigmaVendorDoc(makeDoc(root));
            const gridParent = result.children![0];
            expect(gridParent.layoutMode).toBe('GRID');
            expect(gridParent.children).toHaveLength(3);
            for (const child of gridParent.children!) {
                expect(child.layoutSizingHorizontal).toBe('FILL');
            }
        });
    });
});
