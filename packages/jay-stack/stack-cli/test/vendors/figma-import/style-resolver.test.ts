import { describe, it, expect } from 'vitest';
import { parseInlineStyle, resolveStyle } from '../../../lib/vendors/figma/style-resolver';

describe('style-resolver', () => {
    describe('resolveStyle', () => {
        it('basic dimensions: width and height', () => {
            const { style, warnings } = resolveStyle('width: 400px; height: 300px');
            expect(style).toEqual({ width: 400, height: 300 });
            expect(warnings).toEqual([]);
        });

        it('flex layout: row with gap', () => {
            const { style, warnings } = resolveStyle(
                'display: flex; flex-direction: row; gap: 16px',
            );
            expect(style).toEqual({ layoutMode: 'row', gap: 16 });
            expect(warnings).toEqual([]);
        });

        it('column layout', () => {
            const { style } = resolveStyle('display: flex; flex-direction: column');
            expect(style).toEqual({ layoutMode: 'column' });
        });

        it('flex default: display flex without direction', () => {
            const { style } = resolveStyle('display: flex');
            expect(style).toEqual({ layoutMode: 'row' });
        });

        it('no flex: width only has no layoutMode', () => {
            const { style } = resolveStyle('width: 100px');
            expect(style).toEqual({ width: 100 });
            expect(style.layoutMode).toBeUndefined();
        });

        it('padding shorthand 1 value', () => {
            const { style } = resolveStyle('padding: 10px');
            expect(style).toEqual({
                padding: { top: 10, right: 10, bottom: 10, left: 10 },
            });
        });

        it('padding shorthand 2 values', () => {
            const { style } = resolveStyle('padding: 10px 20px');
            expect(style).toEqual({
                padding: { top: 10, right: 20, bottom: 10, left: 20 },
            });
        });

        it('padding shorthand 3 values', () => {
            const { style } = resolveStyle('padding: 10px 20px 30px');
            expect(style).toEqual({
                padding: { top: 10, right: 20, bottom: 30, left: 20 },
            });
        });

        it('padding shorthand 4 values', () => {
            const { style } = resolveStyle('padding: 10px 20px 30px 40px');
            expect(style).toEqual({
                padding: { top: 10, right: 20, bottom: 30, left: 40 },
            });
        });

        it('individual padding sides', () => {
            const { style } = resolveStyle('padding-top: 5px; padding-left: 10px');
            expect(style).toEqual({
                padding: { top: 5, right: 0, bottom: 0, left: 10 },
            });
        });

        it('colors: background-color and color', () => {
            const { style } = resolveStyle('background-color: #ff0000; color: #333');
            expect(style).toEqual({
                backgroundColor: '#ff0000',
                textColor: '#333',
            });
        });

        it('typography: font-size, font-weight, font-family', () => {
            const { style } = resolveStyle(
                "font-size: 24px; font-weight: 700; font-family: 'Inter', sans-serif",
            );
            expect(style).toEqual({
                fontSize: 24,
                fontWeight: 700,
                fontFamily: 'Inter',
            });
        });

        it('font weight keywords: bold', () => {
            const { style } = resolveStyle('font-weight: bold');
            expect(style).toEqual({ fontWeight: 700 });
        });

        it('font weight keywords: normal', () => {
            const { style } = resolveStyle('font-weight: normal');
            expect(style).toEqual({ fontWeight: 400 });
        });

        it('border and border-radius', () => {
            const { style } = resolveStyle('border: 2px solid #000; border-radius: 8px');
            expect(style).toEqual({
                borderWidth: 2,
                borderColor: '#000',
                borderRadius: 8,
            });
        });

        it('opacity', () => {
            const { style } = resolveStyle('opacity: 0.5');
            expect(style).toEqual({ opacity: 0.5 });
        });

        it('position absolute with top and left', () => {
            const { style } = resolveStyle('position: absolute; top: 10px; left: 20px');
            expect(style).toEqual({ x: 20, y: 10 });
        });

        it('min/max dimensions', () => {
            const { style } = resolveStyle('min-width: 100px; max-height: 500px');
            expect(style).toEqual({ minWidth: 100, maxHeight: 500 });
        });

        it('dynamic value emits warning', () => {
            const { style, warnings } = resolveStyle('color: {textColor}; width: 100px');
            expect(style).toEqual({ width: 100 });
            expect(warnings.some((w) => w.includes('CSS_DYNAMIC_VALUE'))).toBe(true);
            expect(warnings.some((w) => w.includes('color'))).toBe(true);
        });

        it('percent value emits warning', () => {
            const { style, warnings } = resolveStyle('width: 50%');
            expect(style).toEqual({});
            expect(warnings.some((w) => w.includes('50%'))).toBe(true);
        });

        it('empty style returns empty object', () => {
            const { style, warnings } = resolveStyle('');
            expect(style).toEqual({});
            expect(warnings).toEqual([]);
        });

        it('malformed style handled gracefully', () => {
            const { style } = resolveStyle('invalid');
            expect(style).toEqual({});
        });

        it('justify-content and align-items', () => {
            const { style } = resolveStyle(
                'display: flex; justify-content: center; align-items: stretch',
            );
            expect(style).toEqual({
                layoutMode: 'row',
                justifyContent: 'CENTER',
                alignItems: 'STRETCH',
            });
        });

        it('unknown property emits warning', () => {
            const { style, warnings } = resolveStyle('cursor: pointer');
            expect(style).toEqual({});
            expect(warnings.some((w) => w.includes('CSS_UNSUPPORTED_PROPERTY'))).toBe(true);
            expect(warnings.some((w) => w.includes('cursor'))).toBe(true);
        });
    });

    describe('parseInlineStyle', () => {
        it('detects dynamic properties', () => {
            const { parsed, dynamicProperties } = parseInlineStyle(
                'color: {textColor}; width: 100px; background: {bg}',
            );
            expect(parsed).toEqual({
                color: '{textColor}',
                width: '100px',
                background: '{bg}',
            });
            expect(dynamicProperties).toContain('color');
            expect(dynamicProperties).toContain('background');
            expect(dynamicProperties).not.toContain('width');
        });

        it('returns empty for empty string', () => {
            const { parsed, dynamicProperties } = parseInlineStyle('');
            expect(parsed).toEqual({});
            expect(dynamicProperties).toEqual([]);
        });
    });
});
