import { describe, it, expect } from 'vitest';
import {
    normalizeColor,
    normalizeNumber,
    normalizePropertyValue,
    extractSafeProperties,
    buildClassStyleBaseline,
    parseClassStyleBaseline,
    diffClassStyleOverrides,
    parseCssDeclarations,
    overridesToStyleString,
    CLASS_STYLE_BASELINE_KEY,
} from '../../../lib/vendors/figma/class-style-baseline';
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
        const originalFills = [
            { type: 'SOLID', color: { r: 1, g: 1, b: 1 } },
        ];
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
        const baseline = buildClassStyleBaseline(
            makeFrame({ fills }),
            'computed-style',
        );

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
