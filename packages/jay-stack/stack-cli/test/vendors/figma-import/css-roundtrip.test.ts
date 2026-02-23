import { describe, it, expect } from 'vitest';
import { resolveStyle } from '../../../lib/vendors/figma/style-resolver';
import { adaptIRToFigmaVendorDoc } from '../../../lib/vendors/figma/import-ir-to-figma-vendor-doc';
import {
    getBackgroundFillsStyle,
    getAutoLayoutStyles,
    getFrameSizeStyles,
} from '../../../lib/vendors/figma/utils';
import { convertTextNodeToHtml } from '../../../lib/vendors/figma/converters/text';
import type { ImportIRDocument, ImportIRNode } from '../../../lib/vendors/figma/import-ir';

function makeFrameIR(inlineStyle: string): ImportIRDocument {
    const { style } = resolveStyle(inlineStyle);
    const node: ImportIRNode = {
        id: 'test-frame',
        sourcePath: '/body/div',
        kind: 'FRAME',
        name: 'test',
        style,
        children: [],
    };
    return {
        version: 'import-ir/v0',
        pageName: 'test',
        route: '/test',
        source: { kind: 'jay-html', filePath: '/test/page.jay-html', contentHash: 'test' },
        parser: { baseElementName: 'div' },
        contracts: {},
        root: {
            id: 'section-root',
            sourcePath: '/body',
            kind: 'SECTION',
            name: 'test-section',
            children: [node],
        },
        warnings: [],
    };
}

function importAndGetFigmaFrame(inlineStyle: string) {
    const ir = makeFrameIR(inlineStyle);
    const figmaDoc = adaptIRToFigmaVendorDoc(ir);
    return figmaDoc.children![0];
}

function makeTextIR(inlineStyle: string, text: string): ImportIRDocument {
    const { style } = resolveStyle(inlineStyle);
    const node: ImportIRNode = {
        id: 'test-text',
        sourcePath: '/body/div',
        kind: 'TEXT',
        name: 'test-text',
        style,
        text: { characters: text },
        children: [],
    };
    return {
        version: 'import-ir/v0',
        pageName: 'test',
        route: '/test',
        source: { kind: 'jay-html', filePath: '/test/page.jay-html', contentHash: 'test' },
        parser: { baseElementName: 'div' },
        contracts: {},
        root: {
            id: 'section-root',
            sourcePath: '/body',
            kind: 'SECTION',
            name: 'test-section',
            children: [node],
        },
        warnings: [],
    };
}

function importAndGetFigmaText(inlineStyle: string, text = 'Test') {
    const ir = makeTextIR(inlineStyle, text);
    const figmaDoc = adaptIRToFigmaVendorDoc(ir);
    return figmaDoc.children![0];
}

function makeNestedIR(
    parentStyle: string,
    childStyle: string,
    childKind: 'FRAME' | 'TEXT' = 'FRAME',
): ImportIRDocument {
    const parent = resolveStyle(parentStyle);
    const child = resolveStyle(childStyle);
    const childNode: ImportIRNode = {
        id: 'test-child',
        sourcePath: '/body/div/div',
        kind: childKind,
        name: 'child',
        style: child.style,
        ...(childKind === 'TEXT' ? { text: { characters: 'Label' } } : {}),
        children: [],
    };
    const parentNode: ImportIRNode = {
        id: 'test-parent',
        sourcePath: '/body/div',
        kind: 'FRAME',
        name: 'parent',
        style: parent.style,
        children: [childNode],
    };
    return {
        version: 'import-ir/v0',
        pageName: 'test',
        route: '/test',
        source: { kind: 'jay-html', filePath: '/test/page.jay-html', contentHash: 'test' },
        parser: { baseElementName: 'div' },
        contracts: {},
        root: {
            id: 'section-root',
            sourcePath: '/body',
            kind: 'SECTION',
            name: 'test-section',
            children: [parentNode],
        },
        warnings: [],
    };
}

function importNestedAndGetChild(
    parentStyle: string,
    childStyle: string,
    childKind?: 'FRAME' | 'TEXT',
) {
    const ir = makeNestedIR(parentStyle, childStyle, childKind);
    const figmaDoc = adaptIRToFigmaVendorDoc(ir);
    const parentFrame = figmaDoc.children![0];
    return { parent: parentFrame, child: parentFrame.children![0] };
}

describe('CSS Roundtrip Fidelity', () => {
    describe('W4-1: background-color survives roundtrip', () => {
        it('solid hex color exports as background-color', () => {
            const frame = importAndGetFigmaFrame('background-color: #ffffff');
            const css = getBackgroundFillsStyle(frame);
            expect(css).toBe('background-color: #ffffff;');
        });

        it('dark solid color exports as background-color', () => {
            const frame = importAndGetFigmaFrame('background-color: #111111');
            const css = getBackgroundFillsStyle(frame);
            expect(css).toBe('background-color: #111111;');
        });

        it('colored background exports as background-color', () => {
            const frame = importAndGetFigmaFrame('background-color: #f7f7f7');
            const css = getBackgroundFillsStyle(frame);
            expect(css).toBe('background-color: #f7f7f7;');
        });

        it('transparent node (no fills) exports as transparent', () => {
            const frame = importAndGetFigmaFrame('width: 100px');
            const css = getBackgroundFillsStyle(frame);
            expect(css).toBe('background: transparent;');
        });
    });

    describe('W4-2: justify-content survives roundtrip', () => {
        it('space-between preserved', () => {
            const frame = importAndGetFigmaFrame(
                'display: flex; flex-direction: row; justify-content: space-between',
            );
            const css = getAutoLayoutStyles(frame);
            expect(css).toContain('justify-content: space-between;');
        });

        it('center preserved', () => {
            const frame = importAndGetFigmaFrame(
                'display: flex; flex-direction: row; justify-content: center',
            );
            const css = getAutoLayoutStyles(frame);
            expect(css).toContain('justify-content: center;');
        });

        it('flex-end preserved', () => {
            const frame = importAndGetFigmaFrame(
                'display: flex; flex-direction: column; justify-content: flex-end',
            );
            const css = getAutoLayoutStyles(frame);
            expect(css).toContain('justify-content: flex-end;');
        });
    });

    describe('W4-3: explicit width survives roundtrip', () => {
        it('fixed width on flex container preserved', () => {
            const frame = importAndGetFigmaFrame(
                'display: flex; flex-direction: column; width: 480px',
            );
            const css = getFrameSizeStyles(frame);
            expect(css).toContain('width: 480px;');
        });

        it('fixed width and height preserved', () => {
            const frame = importAndGetFigmaFrame('width: 424px; height: 300px');
            const css = getFrameSizeStyles(frame);
            expect(css).toContain('width: 424px;');
            expect(css).toContain('height: 300px;');
        });
    });

    describe('W4-4: gap and padding survive roundtrip', () => {
        it('gap preserved', () => {
            const frame = importAndGetFigmaFrame(
                'display: flex; flex-direction: column; gap: 20px',
            );
            const css = getAutoLayoutStyles(frame);
            expect(css).toContain('gap: 20px;');
        });

        it('uniform padding preserved', () => {
            const frame = importAndGetFigmaFrame(
                'display: flex; flex-direction: column; padding: 28px',
            );
            const css = getAutoLayoutStyles(frame);
            expect(css).toContain('padding-left: 28px;');
            expect(css).toContain('padding-right: 28px;');
            expect(css).toContain('padding-top: 28px;');
            expect(css).toContain('padding-bottom: 28px;');
        });

        it('asymmetric padding preserved', () => {
            const frame = importAndGetFigmaFrame(
                'display: flex; flex-direction: row; padding: 10px 14px',
            );
            const css = getAutoLayoutStyles(frame);
            expect(css).toContain('padding-top: 10px;');
            expect(css).toContain('padding-right: 14px;');
            expect(css).toContain('padding-bottom: 10px;');
            expect(css).toContain('padding-left: 14px;');
        });
    });

    describe('combined properties (product card pattern)', () => {
        it('full card outer container', () => {
            const style =
                'display: flex; flex-direction: column; width: 480px; gap: 20px; padding: 28px; background-color: #ffffff; border-radius: 16px';
            const frame = importAndGetFigmaFrame(style);

            const bgCss = getBackgroundFillsStyle(frame);
            const flexCss = getAutoLayoutStyles(frame);
            const sizeCss = getFrameSizeStyles(frame);

            expect(bgCss).toBe('background-color: #ffffff;');
            expect(flexCss).toContain('display: flex;');
            expect(flexCss).toContain('flex-direction: column;');
            expect(flexCss).toContain('gap: 20px;');
            expect(flexCss).toContain('padding-left: 28px;');
            expect(sizeCss).toContain('width: 480px;');
        });

        it('spec row with space-between', () => {
            const style =
                'display: flex; flex-direction: row; justify-content: space-between; padding: 10px 14px; background-color: #f7f7f7; border-radius: 4px';
            const frame = importAndGetFigmaFrame(style);

            const bgCss = getBackgroundFillsStyle(frame);
            const flexCss = getAutoLayoutStyles(frame);

            expect(bgCss).toBe('background-color: #f7f7f7;');
            expect(flexCss).toContain('justify-content: space-between;');
            expect(flexCss).toContain('padding-top: 10px;');
            expect(flexCss).toContain('padding-right: 14px;');
        });
    });

    describe('Step 4.1a: font-weight survives roundtrip', () => {
        it('font-weight: 700 → Bold fontName.style + fontWeight 700', () => {
            const text = importAndGetFigmaText('font-size: 24px; font-weight: 700; color: #111111');
            expect(text.fontWeight).toBe(700);
            expect(text.fontName).toEqual({ family: 'Inter', style: 'Bold' });
        });

        it('font-weight: 600 → Semi Bold fontName.style + fontWeight 600', () => {
            const text = importAndGetFigmaText('font-size: 14px; font-weight: 600; color: #111111');
            expect(text.fontWeight).toBe(600);
            expect(text.fontName).toEqual({ family: 'Inter', style: 'Semi Bold' });
        });

        it('font-weight: 400 → Regular fontName.style', () => {
            const text = importAndGetFigmaText('font-size: 16px; font-weight: 400');
            expect(text.fontWeight).toBe(400);
            expect(text.fontName).toEqual({ family: 'Inter', style: 'Regular' });
        });

        it('no font-weight defaults to Regular', () => {
            const text = importAndGetFigmaText('font-size: 16px; color: #000000');
            expect(text.fontName).toEqual({ family: 'Inter', style: 'Regular' });
        });

        it('font-weight: bold → 700 / Bold', () => {
            const text = importAndGetFigmaText('font-weight: bold');
            expect(text.fontWeight).toBe(700);
            expect(text.fontName).toEqual({ family: 'Inter', style: 'Bold' });
        });

        it('font-weight: 500 → Medium', () => {
            const text = importAndGetFigmaText('font-weight: 500');
            expect(text.fontWeight).toBe(500);
            expect(text.fontName).toEqual({ family: 'Inter', style: 'Medium' });
        });

        it('custom font-family preserved with correct weight style', () => {
            const text = importAndGetFigmaText("font-family: 'Helvetica Neue'; font-weight: 700");
            expect(text.fontName).toEqual({ family: 'Helvetica Neue', style: 'Bold' });
            expect(text.fontWeight).toBe(700);
        });

        it('font-weight roundtrip through export', () => {
            const text = importAndGetFigmaText(
                'font-size: 24px; font-weight: 700; color: #111111',
                'Product Name',
            );
            const html = convertTextNodeToHtml(text, '');
            expect(html).toContain('font-weight: 700;');
        });

        it('font-weight: 600 roundtrip through export', () => {
            const text = importAndGetFigmaText(
                'font-size: 14px; font-weight: 600; color: #111111',
                'Matte Black',
            );
            const html = convertTextNodeToHtml(text, '');
            expect(html).toContain('font-weight: 600;');
        });
    });

    describe('Step 4.1b: cross-axis FILL for flex children', () => {
        it('flex-column child without width gets FILL horizontal', () => {
            const { child } = importNestedAndGetChild(
                'display: flex; flex-direction: column; width: 480px; gap: 20px',
                'display: flex; flex-direction: row; justify-content: space-between; padding: 10px',
            );
            expect(child.layoutSizingHorizontal).toBe('FILL');
        });

        it('flex-column child with explicit width stays FIXED', () => {
            const { child } = importNestedAndGetChild(
                'display: flex; flex-direction: column; width: 480px',
                'display: flex; flex-direction: row; width: 300px',
            );
            expect(child.layoutSizingHorizontal).toBe('FIXED');
        });

        it('flex-row child without height gets FILL vertical', () => {
            const { child } = importNestedAndGetChild(
                'display: flex; flex-direction: row; width: 480px',
                'display: flex; flex-direction: column; width: 200px; gap: 8px',
            );
            expect(child.layoutSizingVertical).toBe('FILL');
        });

        it('flex-row child with explicit height stays FIXED', () => {
            const { child } = importNestedAndGetChild(
                'display: flex; flex-direction: row; width: 480px',
                'display: flex; flex-direction: column; width: 200px; height: 100px',
            );
            expect(child.layoutSizingVertical).toBe('FIXED');
        });

        it('flex-column parent with align-items: center does not FILL', () => {
            const { child } = importNestedAndGetChild(
                'display: flex; flex-direction: column; width: 480px; align-items: center',
                'display: flex; flex-direction: row; padding: 10px',
            );
            expect(child.layoutSizingHorizontal).not.toBe('FILL');
        });

        it('spec row pattern: child fills card width for space-between', () => {
            const { child } = importNestedAndGetChild(
                'display: flex; flex-direction: column; width: 480px; gap: 12px; padding: 28px',
                'display: flex; flex-direction: row; justify-content: space-between; padding: 10px 14px; background-color: #f7f7f7',
            );
            expect(child.layoutSizingHorizontal).toBe('FILL');
            expect(child.primaryAxisAlignItems).toBe('SPACE_BETWEEN');
        });
    });
});
