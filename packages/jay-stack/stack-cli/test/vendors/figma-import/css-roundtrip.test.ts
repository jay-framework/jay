import { describe, it, expect } from 'vitest';
import { resolveStyle } from '../../../lib/vendors/figma/style-resolver';
import { adaptIRToFigmaVendorDoc } from '../../../lib/vendors/figma/import-ir-to-figma-vendor-doc';
import {
    getBackgroundFillsStyle,
    getAutoLayoutStyles,
    getFrameSizeStyles,
} from '../../../lib/vendors/figma/utils';
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
});
