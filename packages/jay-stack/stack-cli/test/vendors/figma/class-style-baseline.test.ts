import { describe, it, expect } from 'vitest';
import {
    normalizeColor,
    normalizeNumber,
    normalizePropertyValue,
    extractSafeProperties,
    extractLayoutProperties,
    buildClassStyleBaseline,
    parseClassStyleBaseline,
    diffClassStyleOverrides,
    parseCssDeclarations,
    overridesToStyleString,
    CLASS_STYLE_BASELINE_KEY,
} from '../../../lib/vendors/figma/class-style-baseline';
import { getBackgroundFillsStyle } from '../../../lib/vendors/figma/utils';
import { figmaVendor } from '../../../lib/vendors/figma/index';
import type { FigmaVendorDocument, ProjectPage } from '@jay-framework/editor-protocol';

// ── Normalization helpers ───────────────────────────────────────────

describe('normalizeColor', () => {
    it('normalizes hex to rgb', () => {
        expect(normalizeColor('#ff0000')).toBe('rgb(255, 0, 0)');
        expect(normalizeColor('#808080')).toBe('rgb(128, 128, 128)');
    });

    it('normalizes hex with alpha', () => {
        expect(normalizeColor('#ff000080')).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('normalizes rgb()', () => {
        expect(normalizeColor('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)');
    });

    it('normalizes rgba() with full alpha to rgb()', () => {
        expect(normalizeColor('rgba(255, 0, 0, 1)')).toBe('rgb(255, 0, 0)');
    });

    it('keeps rgba() with partial alpha', () => {
        expect(normalizeColor('rgba(255, 0, 0, 0.5)')).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('normalizes transparent', () => {
        expect(normalizeColor('transparent')).toBe('rgba(0, 0, 0, 0)');
    });
});

describe('normalizeNumber', () => {
    it('normalizes to 2 decimal precision', () => {
        expect(normalizeNumber('0.123456')).toBe('0.12');
        expect(normalizeNumber('1.0')).toBe('1');
        expect(normalizeNumber('0.5')).toBe('0.5');
    });

    it('returns value for non-numbers', () => {
        expect(normalizeNumber('auto')).toBe('auto');
    });
});

describe('normalizePropertyValue', () => {
    it('normalizes color properties', () => {
        expect(normalizePropertyValue('background-color', '#ff0000')).toBe('rgb(255, 0, 0)');
        expect(normalizePropertyValue('border-top-color', '#00ff00')).toBe('rgb(0, 255, 0)');
        expect(normalizePropertyValue('color', 'rgb(0,0,0)')).toBe('rgb(0, 0, 0)');
    });

    it('normalizes opacity', () => {
        expect(normalizePropertyValue('opacity', '0.5000')).toBe('0.5');
        expect(normalizePropertyValue('opacity', '1')).toBe('1');
    });

    it('normalizes width values', () => {
        expect(normalizePropertyValue('border-top-width', '1.0px')).toBe('1px');
    });
});

// ── CSS declaration parsing ─────────────────────────────────────────

describe('parseCssDeclarations', () => {
    it('parses simple declarations', () => {
        expect(parseCssDeclarations('background-color: #fff; opacity: 1;')).toEqual({
            'background-color': '#fff',
            opacity: '1',
        });
    });

    it('handles empty string', () => {
        expect(parseCssDeclarations('')).toEqual({});
    });

    it('handles values with colons (like rgba)', () => {
        expect(parseCssDeclarations('color: rgb(0, 0, 0);')).toEqual({
            color: 'rgb(0, 0, 0)',
        });
    });
});

describe('overridesToStyleString', () => {
    it('builds CSS string from overrides', () => {
        const result = overridesToStyleString({
            'background-color': '#ff0000',
            opacity: '0.8',
        });
        expect(result).toBe('background-color: #ff0000; opacity: 0.8');
    });

    it('returns empty for no overrides', () => {
        expect(overridesToStyleString({})).toBe('');
    });
});

// ── Property extraction ─────────────────────────────────────────────

describe('extractSafeProperties', () => {
    it('extracts background-color from solid fill', () => {
        const node = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
        });
        const props = extractSafeProperties(node);
        expect(props['background-color']).toBe('#ff0000');
    });

    it('extracts border properties from strokes', () => {
        const node = makeFrame({
            strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
            strokeWeight: 2,
        });
        const props = extractSafeProperties(node);
        expect(props['border-top-width']).toBe('2px');
        expect(props['border-top-color']).toBeDefined();
    });

    it('extracts opacity', () => {
        const node = makeFrame({ opacity: 0.5 });
        const props = extractSafeProperties(node);
        expect(props['opacity']).toBe('0.5');
    });

    it('defaults opacity to 1', () => {
        const node = makeFrame({});
        const props = extractSafeProperties(node);
        expect(props['opacity']).toBe('1');
    });

    it('extracts border-radius', () => {
        const node = makeFrame({ cornerRadius: 8 });
        const props = extractSafeProperties(node);
        expect(props['border-radius']).toBe('8px');
    });
});

// ── Baseline capture and diff ───────────────────────────────────────

describe('buildClassStyleBaseline + parseClassStyleBaseline', () => {
    it('roundtrips through JSON', () => {
        const node = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
            opacity: 0.9,
        });
        const json = buildClassStyleBaseline(node, 'computed-style');
        const parsed = parseClassStyleBaseline(json);
        expect(parsed).not.toBeNull();
        expect(parsed!.meta.version).toBe(1);
        expect(parsed!.meta.source).toBe('computed-style');
        expect(parsed!.safe['opacity']).toBe('0.9');
    });

    it('returns null for invalid JSON', () => {
        expect(parseClassStyleBaseline('not json')).toBeNull();
    });

    it('returns null for wrong version', () => {
        expect(parseClassStyleBaseline('{"safe":{},"meta":{"version":99}}')).toBeNull();
    });
});

describe('diffClassStyleOverrides', () => {
    it('returns empty overrides when nothing changed', () => {
        const node = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
        });
        const baseline = buildClassStyleBaseline(node, 'computed-style');
        const { overrides } = diffClassStyleOverrides(baseline, node);
        expect(Object.keys(overrides)).toHaveLength(0);
    });

    it('detects background-color change', () => {
        const originalNode = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
        });
        const baseline = buildClassStyleBaseline(originalNode, 'computed-style');

        const editedNode = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 0.7, g: 0.85, b: 1 } }],
        });
        const { overrides } = diffClassStyleOverrides(baseline, editedNode);
        expect(overrides['background-color']).toBeDefined();
    });

    it('detects opacity change', () => {
        const originalNode = makeFrame({ opacity: 1 });
        const baseline = buildClassStyleBaseline(originalNode, 'computed-style');

        const editedNode = makeFrame({ opacity: 0.5 });
        const { overrides } = diffClassStyleOverrides(baseline, editedNode);
        expect(overrides['opacity']).toBeDefined();
    });

    it('returns empty for invalid baseline', () => {
        const node = makeFrame({});
        const { overrides } = diffClassStyleOverrides('bad json', node);
        expect(Object.keys(overrides)).toHaveLength(0);
    });
});

// ── Integration: export with class-based nodes ──────────────────────

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

function makeFrame(overrides: Partial<FigmaVendorDocument>): FigmaVendorDocument {
    return {
        id: 'test-frame',
        name: 'TestFrame',
        type: 'FRAME',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        layoutMode: 'VERTICAL',
        fills: [],
        ...overrides,
    } as unknown as FigmaVendorDocument;
}

const emptyPage: ProjectPage = { name: 'test', url: '/', filePath: '/test', usedComponents: [] };

/** Find the HTML line containing a specific class attribute */
function findClassLine(html: string, className: string): string | undefined {
    return html.split('\n').find((line) => line.includes(`class="${className}"`));
}

describe('Export integration: class-based override diffing', () => {
    it('emits background override when background changed from baseline', async () => {
        const originalFills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        const baseline = buildClassStyleBaseline(
            makeFrame({ fills: originalFills }),
            'computed-style',
        );

        const doc = makeSection([
            {
                id: 'hero',
                name: 'Hero',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 600,
                height: 300,
                layoutMode: 'VERTICAL',
                fills: [{ type: 'SOLID', color: { r: 0.7, g: 0.85, b: 1.0 } }],
                pluginData: {
                    className: 'collection-hero',
                    [CLASS_STYLE_BASELINE_KEY]: baseline,
                },
                children: [makeTextNode('t1', 'Title')],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        expect(result.bodyHtml).toContain('class="collection-hero"');
        expect(result.bodyHtml).toContain('background-color:');
    });

    it('emits nothing when class-based node is unchanged from baseline', async () => {
        const fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
        const baseline = buildClassStyleBaseline(makeFrame({ fills }), 'computed-style');

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
                fills,
                pluginData: {
                    className: 'product-card',
                    [CLASS_STYLE_BASELINE_KEY]: baseline,
                },
                children: [makeTextNode('t1', 'Content')],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const classLine = findClassLine(result.bodyHtml, 'product-card');
        expect(classLine).toBeDefined();
        expect(classLine).not.toContain('style=');
    });

    it('emits nothing and warns when baseline is missing', async () => {
        const doc = makeSection([
            {
                id: 'no-baseline',
                name: 'NoBaseline',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 300,
                height: 200,
                layoutMode: 'VERTICAL',
                fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
                pluginData: {
                    className: 'old-node',
                },
                children: [makeTextNode('t1', 'Content')],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const classLine = findClassLine(result.bodyHtml, 'old-node');
        expect(classLine).toBeDefined();
        expect(classLine).not.toContain('style=');
    });

    it('never emits layout properties on class-based nodes', async () => {
        const baseline = buildClassStyleBaseline(
            makeFrame({
                fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
            }),
            'computed-style',
        );

        const doc = makeSection([
            {
                id: 'layout-change',
                name: 'LayoutChange',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 999,
                height: 999,
                layoutMode: 'HORIZONTAL',
                fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
                pluginData: {
                    className: 'responsive-grid',
                    [CLASS_STYLE_BASELINE_KEY]: baseline,
                },
                children: [makeTextNode('t1', 'Item')],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const classLine = findClassLine(result.bodyHtml, 'responsive-grid');
        expect(classLine).toBeDefined();
        expect(classLine).not.toContain('style=');
    });
});

// ── Gradient serialization ──────────────────────────────────────────

function makeGradientFill(
    angle: number,
    stops: Array<{ pos: number; r: number; g: number; b: number; a?: number }>,
) {
    const rad = ((angle - 90) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const tx = 0.5 - 0.5 * cos + 0.5 * sin;
    const ty = 0.5 - 0.5 * sin - 0.5 * cos;
    return {
        type: 'GRADIENT_LINEAR',
        visible: true,
        gradientTransform: [
            [cos, -sin, tx],
            [sin, cos, ty],
        ],
        gradientStops: stops.map((s) => ({
            position: s.pos,
            color: { r: s.r, g: s.g, b: s.b, a: s.a ?? 1 },
        })),
    };
}

describe('getBackgroundFillsStyle — gradient serialization', () => {
    it('serializes single GRADIENT_LINEAR to background-image', () => {
        const node = makeFrame({
            fills: [
                makeGradientFill(135, [
                    { pos: 0, r: 0.96, g: 0.93, b: 0.87 },
                    { pos: 1, r: 0.98, g: 0.97, b: 0.96 },
                ]),
            ],
        });
        const css = getBackgroundFillsStyle(node);
        expect(css).toContain('background-image:');
        expect(css).toContain('linear-gradient(135deg');
        expect(css).toContain('0%');
        expect(css).toContain('100%');
    });

    it('serializes gradient in multi-fill scenario', () => {
        const node = makeFrame({
            fills: [
                { type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.5 },
                makeGradientFill(180, [
                    { pos: 0, r: 0, g: 0, b: 0 },
                    { pos: 1, r: 1, g: 1, b: 1 },
                ]),
            ],
        });
        const css = getBackgroundFillsStyle(node);
        expect(css).toContain('background-image:');
        expect(css).toContain('linear-gradient(180deg');
    });

    it('produces correct angle from gradient transform', () => {
        for (const angle of [0, 45, 90, 135, 180, 270]) {
            const node = makeFrame({
                fills: [
                    makeGradientFill(angle, [
                        { pos: 0, r: 0, g: 0, b: 0 },
                        { pos: 1, r: 1, g: 1, b: 1 },
                    ]),
                ],
            });
            const css = getBackgroundFillsStyle(node);
            expect(css).toContain(`${angle}deg`);
        }
    });
});

// ── Gradient baseline → solid diff ──────────────────────────────────

describe('diffClassStyleOverrides — gradient→solid transitions', () => {
    it('detects gradient-to-solid change with both background-color and background-image: none', () => {
        const gradientNode = makeFrame({
            fills: [
                makeGradientFill(135, [
                    { pos: 0, r: 0.96, g: 0.93, b: 0.87 },
                    { pos: 1, r: 0.98, g: 0.97, b: 0.96 },
                ]),
            ],
        });
        const baseline = buildClassStyleBaseline(gradientNode, 'computed-style');

        const solidNode = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 0.42, g: 0.84, b: 0.98 } }],
        });
        const { overrides } = diffClassStyleOverrides(baseline, solidNode);

        expect(overrides['background-color']).toBeDefined();
        expect(overrides['background-image']).toBe('none');
    });

    it('detects solid-to-gradient change with background-image override', () => {
        const solidNode = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
        });
        const baseline = buildClassStyleBaseline(solidNode, 'computed-style');

        const gradientNode = makeFrame({
            fills: [
                makeGradientFill(180, [
                    { pos: 0, r: 0, g: 0, b: 0 },
                    { pos: 1, r: 1, g: 1, b: 1 },
                ]),
            ],
        });
        const { overrides } = diffClassStyleOverrides(baseline, gradientNode);

        expect(overrides['background-image']).toContain('linear-gradient');
        expect(overrides['background-color']).toBe('transparent');
    });

    it('returns no overrides when gradient is unchanged', () => {
        const gradientNode = makeFrame({
            fills: [
                makeGradientFill(135, [
                    { pos: 0, r: 0, g: 0, b: 0 },
                    { pos: 1, r: 1, g: 1, b: 1 },
                ]),
            ],
        });
        const baseline = buildClassStyleBaseline(gradientNode, 'computed-style');
        const { overrides } = diffClassStyleOverrides(baseline, gradientNode);
        expect(Object.keys(overrides)).toHaveLength(0);
    });
});

// ── Blocked override detection ──────────────────────────────────────

describe('diffClassStyleOverrides — blocked layout detection', () => {
    it('reports padding change as blocked', () => {
        const originalNode = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
            paddingTop: 80,
            paddingRight: 48,
            paddingBottom: 60,
            paddingLeft: 48,
        });
        const baseline = buildClassStyleBaseline(originalNode, 'computed-style');

        const editedNode = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
            paddingTop: 120,
            paddingRight: 48,
            paddingBottom: 60,
            paddingLeft: 48,
        });
        const { overrides, blocked } = diffClassStyleOverrides(baseline, editedNode);

        expect(Object.keys(overrides)).toHaveLength(0);
        expect(blocked.length).toBeGreaterThan(0);
        expect(blocked.some((b) => b.property === 'padding-top')).toBe(true);
    });

    it('emits background override and blocks padding change simultaneously', () => {
        const originalNode = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
            paddingTop: 80,
            paddingRight: 48,
            paddingBottom: 60,
            paddingLeft: 48,
        });
        const baseline = buildClassStyleBaseline(originalNode, 'computed-style');

        const editedNode = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 0.42, g: 0.84, b: 0.98 } }],
            paddingTop: 120,
            paddingRight: 48,
            paddingBottom: 60,
            paddingLeft: 48,
        });
        const { overrides, blocked } = diffClassStyleOverrides(baseline, editedNode);

        expect(overrides['background-color']).toBeDefined();
        expect(blocked.some((b) => b.property === 'padding-top')).toBe(true);
    });

    it('reports no blocked items when layout is unchanged', () => {
        const node = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
            paddingTop: 10,
            width: 300,
            height: 200,
        });
        const baseline = buildClassStyleBaseline(node, 'computed-style');
        const { blocked } = diffClassStyleOverrides(baseline, node);
        expect(blocked).toHaveLength(0);
    });
});

// ── Multi-fill deterministic canonicalization ────────────────────────

describe('baseline — multi-fill deterministic canonicalization', () => {
    it('produces identical baseline for same multi-fill input', () => {
        const fills = [
            { type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.5 },
            makeGradientFill(180, [
                { pos: 0, r: 0, g: 0, b: 0 },
                { pos: 1, r: 1, g: 1, b: 1 },
            ]),
        ];
        const node1 = makeFrame({ fills });
        const node2 = makeFrame({ fills });

        const baseline1 = buildClassStyleBaseline(node1, 'computed-style');
        const baseline2 = buildClassStyleBaseline(node2, 'computed-style');
        expect(baseline1).toBe(baseline2);
    });
});

// ── Roundtrip stability ─────────────────────────────────────────────

describe('baseline — roundtrip stability', () => {
    it('build → diff produces no overrides (idempotent)', () => {
        const node = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 0.5, g: 0.3, b: 0.1 } }],
            cornerRadius: 12,
            opacity: 0.8,
            paddingTop: 20,
            paddingBottom: 40,
        });
        const baseline = buildClassStyleBaseline(node, 'computed-style');
        const { overrides, blocked } = diffClassStyleOverrides(baseline, node);
        expect(Object.keys(overrides)).toHaveLength(0);
        expect(blocked).toHaveLength(0);
    });

    it('gradient fill roundtrips without false positives', () => {
        const node = makeFrame({
            fills: [
                makeGradientFill(135, [
                    { pos: 0, r: 0.96, g: 0.93, b: 0.87 },
                    { pos: 1, r: 0.98, g: 0.97, b: 0.96 },
                ]),
            ],
        });
        const baseline = buildClassStyleBaseline(node, 'computed-style');
        const { overrides } = diffClassStyleOverrides(baseline, node);
        expect(Object.keys(overrides)).toHaveLength(0);
    });

    it('baseline captures layout properties for blocked detection', () => {
        const node = makeFrame({
            fills: [],
            paddingTop: 20,
            paddingRight: 40,
            paddingBottom: 20,
            paddingLeft: 40,
            width: 800,
            height: 400,
        });
        const json = buildClassStyleBaseline(node, 'computed-style');
        const parsed = parseClassStyleBaseline(json);
        expect(parsed!.layout).toBeDefined();
        expect(parsed!.layout!['padding-top']).toBe('20px');
        expect(parsed!.layout!['width']).toBe('800px');
    });
});

// ── extractLayoutProperties ─────────────────────────────────────────

describe('extractLayoutProperties', () => {
    it('extracts padding, gap, width, height', () => {
        const node = makeFrame({
            paddingTop: 10,
            paddingRight: 20,
            paddingBottom: 30,
            paddingLeft: 40,
            itemSpacing: 8,
            width: 500,
            height: 300,
        });
        const layout = extractLayoutProperties(node);
        expect(layout['padding-top']).toBe('10px');
        expect(layout['padding-right']).toBe('20px');
        expect(layout['padding-bottom']).toBe('30px');
        expect(layout['padding-left']).toBe('40px');
        expect(layout['gap']).toBe('8px');
        expect(layout['width']).toBe('500px');
        expect(layout['height']).toBe('300px');
    });
});
