import { describe, it, expect } from 'vitest';
import {
    normalizeColor,
    normalizeNumber,
    normalizePropertyValue,
    extractSafeProperties,
    extractLayoutProperties,
    buildClassStyleBaseline,
    buildClassStyleBaselineFromClassOnlyInput,
    extractStaticClassOnlySafeProps,
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

// ── Issue #12: Export drops intentional inline style overrides ────────

describe('Issue #12: inline background-color override survives roundtrip', () => {
    /**
     * Bug: Inline background-color override lost after roundtrip
     * Found in: T7 Scenario 6, Step 9 (docs/single-writer/open issues/12)
     * Expected: Export emits background-color: #ff4444 (differs from class green)
     * Actual: Export emits color: inherit (drops background override entirely)
     */

    it('should emit inline background-color that overrides class background', () => {
        // Simulate: CSS class has background: #22c55e (green)
        // Developer set inline style="background-color: #ff4444" (red)
        // After import, Figma node has fills=[red]
        // The class-only baseline should have green, so diff emits red override.
        const classStyles = {
            background: '#22c55e',
            color: 'white',
            padding: '4px 10px',
            'border-radius': '4px',
            'font-size': '12px',
            'font-weight': '700',
        };
        const classOnlySafeProps = extractStaticClassOnlySafeProps(classStyles);

        // Build baseline from class-only props (green background)
        const redNode = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 1, g: 0.267, b: 0.267 } }], // #ff4444
            cornerRadius: 4,
        });
        const baselineJson = buildClassStyleBaselineFromClassOnlyInput(classOnlySafeProps, redNode);

        // Diff against the same red node — background-color must appear as override
        const { overrides } = diffClassStyleOverrides(baselineJson, redNode);
        expect(overrides['background-color']).toBeDefined();
        expect(normalizeColor(overrides['background-color'])).toBe('rgb(255, 68, 68)');
    });

    it('should NOT emit inline styles that match the class baseline', () => {
        // Class has border-radius: 4px, node also has cornerRadius=4
        // No override should be emitted for border-radius
        const classStyles = {
            background: '#22c55e',
            'border-radius': '4px',
        };
        const classOnlySafeProps = extractStaticClassOnlySafeProps(classStyles);

        const node = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 0.133, g: 0.773, b: 0.369 } }], // #22c55e
            cornerRadius: 4,
        });
        const baselineJson = buildClassStyleBaselineFromClassOnlyInput(classOnlySafeProps, node);

        const { overrides } = diffClassStyleOverrides(baselineJson, node);
        expect(overrides['border-radius']).toBeUndefined();
    });

    it('should handle shorthand background vs longhand background-color matching', () => {
        // CSS class uses shorthand "background: #22c55e"
        // extractStaticClassOnlySafeProps must decompose to "background-color"
        // so the diff can compare against extractSafeProperties() which uses longhand
        const classStyles = { background: '#22c55e' };
        const safeProps = extractStaticClassOnlySafeProps(classStyles);
        expect(safeProps['background-color']).toBe('#22c55e');
        expect(safeProps['background-image']).toBe('none');
    });

    it('should not emit spurious color reset when color is only on CSS class', () => {
        // CSS class has "color: white" but extractSafeProperties() cannot extract
        // text color from a FRAME node — so the diff should NOT emit color: inherit
        const classStyles = {
            background: '#22c55e',
            color: 'white',
        };
        const classOnlySafeProps = extractStaticClassOnlySafeProps(classStyles);

        const node = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 1, g: 0.267, b: 0.267 } }], // red
        });
        const baselineJson = buildClassStyleBaselineFromClassOnlyInput(classOnlySafeProps, node);
        const { overrides } = diffClassStyleOverrides(baselineJson, node);

        // background-color should be overridden (red vs green)
        expect(overrides['background-color']).toBeDefined();
        // color should NOT be emitted as inherit — it's a text property the frame can't represent
        expect(overrides['color']).toBeUndefined();
    });

    it('export integration: class-only baseline preserves inline background override', async () => {
        // Build a class-only baseline with green background
        const classStyles = { background: '#22c55e' };
        const classOnlySafeProps = extractStaticClassOnlySafeProps(classStyles);
        const redNode = makeFrame({
            fills: [{ type: 'SOLID', color: { r: 1, g: 0.267, b: 0.267 } }],
        });
        const baseline = buildClassStyleBaselineFromClassOnlyInput(classOnlySafeProps, redNode);

        // Build a section with the class-based node
        const doc = makeSection([
            {
                id: 'badge',
                name: 'discount-badge',
                type: 'FRAME',
                x: 0,
                y: 0,
                width: 100,
                height: 30,
                layoutMode: 'HORIZONTAL',
                fills: [{ type: 'SOLID', color: { r: 1, g: 0.267, b: 0.267 } }],
                pluginData: {
                    className: 'discount-badge',
                    [CLASS_STYLE_BASELINE_KEY]: baseline,
                },
                children: [makeTextNode('t1', '{discountLabel}')],
            } as unknown as FigmaVendorDocument,
        ]);

        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const classLine = findClassLine(result.bodyHtml, 'discount-badge');
        expect(classLine).toBeDefined();
        expect(classLine).toContain('background-color:');
        // Should NOT contain spurious resets for properties the frame can't represent
        expect(classLine).not.toContain('color: inherit');
    });

    it('full pipeline: jay-html with CSS → import → export preserves inline override', async () => {
        // This test exercises the real import pipeline to verify classOnlyBaselineInput
        // is populated from CSS and survives through to the export baseline diff.
        const { buildImportIR } = await import('../../../lib/vendors/figma/jay-html-to-import-ir');
        const { adaptIRToFigmaVendorDoc } = await import(
            '../../../lib/vendors/figma/import-ir-to-figma-vendor-doc'
        );
        const { parse } = await import('node-html-parser');

        const html = `<div style="display: flex; flex-direction: column; padding: 20px;">
  <div class="discount-badge" style="background-color: #ff4444; padding: 4px 10px; border-radius: 4px;">
    <span>SALE</span>
  </div>
</div>`;
        const css = `.discount-badge {
  background: #22c55e;
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
}`;

        // Step 1: Import — build IR from HTML+CSS
        const body = parse(html);
        const ir = buildImportIR(body, '/test', 'test', { css });

        // Step 2: Adapt IR to Figma vendor doc
        const figmaDoc = adaptIRToFigmaVendorDoc(ir);

        // Find the discount-badge node — it should have CLASS_STYLE_BASELINE_KEY
        function findNodeByClassName(
            node: FigmaVendorDocument,
            className: string,
        ): FigmaVendorDocument | undefined {
            if (node.pluginData?.['className'] === className) return node;
            if (node.children) {
                for (const child of node.children) {
                    const found = findNodeByClassName(child, className);
                    if (found) return found;
                }
            }
            return undefined;
        }

        const badgeNode = findNodeByClassName(figmaDoc, 'discount-badge');
        expect(badgeNode).toBeDefined();

        // Verify baseline was stored
        const baselineJson = badgeNode!.pluginData?.[CLASS_STYLE_BASELINE_KEY];
        expect(baselineJson).toBeDefined();

        // Verify the baseline reflects CLASS-ONLY state (green), not rendered state (red)
        const baseline = parseClassStyleBaseline(baselineJson!);
        expect(baseline).not.toBeNull();
        const baselineBg = normalizeColor(baseline!.safe['background-color'] || '');
        expect(baselineBg).toBe(normalizeColor('#22c55e'));

        // Step 3: Export via figmaVendor.
        // adaptIRToFigmaVendorDoc returns a SECTION. findContentFrame expects
        // SECTION > FRAME, so we pass the SECTION directly.
        const result = await figmaVendor.convertToBodyHtml(figmaDoc, '/', emptyPage, []);
        const classLine = findClassLine(result.bodyHtml, 'discount-badge');
        expect(classLine).toBeDefined();
        expect(classLine).toContain('background-color:');
    });

    it('full pipeline with variant: baseline on if-wrapped class element uses class-only state', async () => {
        // This is the EXACT bug scenario: a class-based element with an if condition
        // gets wrapped in COMPONENT_SET > COMPONENT > FRAME during variant synthesis.
        // The class-only baseline must survive through variant wrapping and reflect
        // the class-only state (green), NOT the rendered state (red with inline override).
        const { buildImportIR } = await import('../../../lib/vendors/figma/jay-html-to-import-ir');
        const { adaptIRToFigmaVendorDoc } = await import(
            '../../../lib/vendors/figma/import-ir-to-figma-vendor-doc'
        );
        const { parse } = await import('node-html-parser');

        const html = `<div style="display: flex; flex-direction: column; padding: 20px;">
  <div class="discount-badge" if="hasDiscount" style="background-color: #ff4444; padding: 4px 10px; border-radius: 4px;">
    <span>{discountLabel}</span>
  </div>
</div>`;
        const css = `.discount-badge {
  background: #22c55e;
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
}`;
        const contractYaml = `name: test
tags:
  - tag: hasDiscount
    type: ViewState
    dataType: boolean
  - tag: discountLabel
    type: ViewState
    dataType: string`;

        const { parseContract } = await import('@jay-framework/compiler-jay-html');
        const contractResult = parseContract(contractYaml, 'page.jay-contract');
        const compilerContract = contractResult.val!;
        const contract = {
            name: compilerContract.name,
            tags: compilerContract.tags.map((tag: any) => ({
                tag: tag.tag,
                type: ['ViewState'],
                dataType: tag.dataType ? String(tag.dataType) : undefined,
                required: tag.required,
            })),
        };

        const body = parse(html);
        const ir = buildImportIR(body, '/test', 'test', { css, contract });
        const figmaDoc = adaptIRToFigmaVendorDoc(ir);

        // Find the discount-badge FRAME inside the variant structure:
        // SECTION > FRAME > INSTANCE + COMPONENT_SET > COMPONENT > FRAME[class=discount-badge]
        function findNodeByClassName(
            node: FigmaVendorDocument,
            className: string,
        ): FigmaVendorDocument | undefined {
            if (node.pluginData?.['className'] === className) return node;
            if (node.children) {
                for (const child of node.children) {
                    const found = findNodeByClassName(child, className);
                    if (found) return found;
                }
            }
            return undefined;
        }

        const badgeNode = findNodeByClassName(figmaDoc, 'discount-badge');
        expect(badgeNode).toBeDefined();
        expect(badgeNode!.type).toBe('FRAME');

        // Verify baseline exists on the node
        const baselineJson = badgeNode!.pluginData?.[CLASS_STYLE_BASELINE_KEY];
        expect(baselineJson).toBeDefined();

        // CRITICAL: Verify the baseline reflects CLASS-ONLY state (green),
        // not the rendered state (red from inline override)
        const baseline = parseClassStyleBaseline(baselineJson!);
        expect(baseline).not.toBeNull();
        const baselineBg = normalizeColor(baseline!.safe['background-color'] || '');
        expect(baselineBg).toBe(normalizeColor('#22c55e'));

        // Verify the diff produces background-color as an override
        const { overrides } = diffClassStyleOverrides(baselineJson!, badgeNode!);
        expect(overrides['background-color']).toBeDefined();

        // Verify the diff does NOT produce spurious color reset
        expect(overrides['color']).toBeUndefined();

        // Export integration: extract the badge node and export it directly
        // (bypasses variant machinery which needs complex binding setup)
        const doc = makeSection([
            {
                ...badgeNode!,
                children: [makeTextNode('t1', '{discountLabel}')],
            } as unknown as FigmaVendorDocument,
        ]);
        const result = await figmaVendor.convertToBodyHtml(doc, '/', emptyPage, []);
        const classLine = findClassLine(result.bodyHtml, 'discount-badge');
        expect(classLine).toBeDefined();
        expect(classLine).toContain('background-color:');
        expect(classLine).not.toContain('color: inherit');
    });

    /**
     * Bug: Issue #12 — export drops intentional inline style overrides
     * Reproduction: discount-badge inside forEach repeater with if condition
     * Expected: classOnlyBaselineInput populated from CSS (green #22c55e)
     * Actual: classOnlyBaselineInput empty → computed-style fallback bakes in red #ff4444
     *
     * This test mirrors the EXACT real HTML structure from level-5-class-overrides:
     * forEach repeater > item-card > if-wrapped discount-badge with class + inline override.
     * The existing test uses a simple (non-forEach) structure and passes — this one
     * isolates whether forEach nesting breaks classOnlyBaselineInput propagation.
     */
    it('full pipeline with forEach nesting: baseline on class+inline element inside repeater uses class-only state', async () => {
        const { buildImportIR } = await import('../../../lib/vendors/figma/jay-html-to-import-ir');
        const { adaptIRToFigmaVendorDoc } = await import(
            '../../../lib/vendors/figma/import-ir-to-figma-vendor-doc'
        );
        const { parse } = await import('node-html-parser');

        // Real structure: forEach > item-card > if-wrapped discount-badge
        const html = `<div style="display: flex; flex-direction: column;">
  <div class="items-grid" forEach="catalog.items" trackBy="id">
    <div class="item-card">
      <div class="discount-badge" if="hasDiscount" style="background-color: #ff4444; padding: 4px 10px;">
        <span>{discountLabel}</span>
      </div>
      <h3 class="item-name">{name}</h3>
      <span class="item-price">{price}</span>
    </div>
  </div>
</div>`;
        const css = `.items-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding: 20px;
}
.item-card {
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 8px;
  background: white;
}
.discount-badge {
  background: #22c55e;
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  align-self: flex-start;
}
.item-name {
  font-size: 16px;
  font-weight: 600;
}
.item-price {
  font-size: 14px;
  color: #666;
}`;
        const contractYaml = `name: test
tags:
  - tag: catalog
    type: ViewState
    dataType: object
    objectFields:
      - name: items
        type: array
        itemFields:
          - name: id
            type: string
          - name: hasDiscount
            type: boolean
          - name: discountLabel
            type: string
          - name: name
            type: string
          - name: price
            type: string`;

        const { parseContract } = await import('@jay-framework/compiler-jay-html');
        const contractResult = parseContract(contractYaml, 'page.jay-contract');
        const compilerContract = contractResult.val!;
        const contract = {
            name: compilerContract.name,
            tags: compilerContract.tags.map((tag: any) => ({
                tag: tag.tag,
                type: ['ViewState'],
                dataType: tag.dataType ? String(tag.dataType) : undefined,
                required: tag.required,
                objectFields: tag.objectFields,
            })),
        };

        const body = parse(html);
        const ir = buildImportIR(body, '/test', 'test', { css, contract });
        const figmaDoc = adaptIRToFigmaVendorDoc(ir);

        // Find the discount-badge node deep in the variant/repeater structure
        function findNodeByClassName(
            node: FigmaVendorDocument,
            className: string,
        ): FigmaVendorDocument | undefined {
            if (node.pluginData?.['className'] === className) return node;
            if (node.children) {
                for (const child of node.children) {
                    const found = findNodeByClassName(child, className);
                    if (found) return found;
                }
            }
            return undefined;
        }

        const badgeNode = findNodeByClassName(figmaDoc, 'discount-badge');
        expect(badgeNode).toBeDefined();
        expect(badgeNode!.type).toBe('FRAME');

        // Verify baseline exists
        const baselineJson = badgeNode!.pluginData?.[CLASS_STYLE_BASELINE_KEY];
        expect(baselineJson).toBeDefined();

        // CRITICAL: baseline must reflect CLASS-ONLY state (green #22c55e),
        // NOT the rendered state (red #ff4444 from inline override)
        const baseline = parseClassStyleBaseline(baselineJson!);
        expect(baseline).not.toBeNull();
        const baselineBg = normalizeColor(baseline!.safe['background-color'] || '');
        expect(baselineBg).toBe(normalizeColor('#22c55e'));

        // The diff must detect background-color as an override (red != green)
        const { overrides } = diffClassStyleOverrides(baselineJson!, badgeNode!);
        expect(overrides['background-color']).toBeDefined();
    });
});
