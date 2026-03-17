import { describe, it, expect } from 'vitest';
import {
    parseInlineStyle,
    resolveStyle,
    parseCssToClassMap,
    resolveClassStyles,
} from '../../../lib/vendors/figma/style-resolver';

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
            expect(style).toEqual({ layoutMode: 'row', gap: 16, rowGap: 16 });
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
            expect(style).toEqual({ isAbsolute: true, x: 20, y: 10 });
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

        it('background-image: linear-gradient solid fill → backgroundColor', () => {
            const { style, warnings } = resolveStyle(
                'background-image: linear-gradient(rgba(255, 255, 255, 1), rgba(255, 255, 255, 1))',
            );
            expect(style.backgroundColor).toBe('#ffffff');
            expect(warnings).toEqual([]);
        });

        it('background-image: linear-gradient with alpha → rgba backgroundColor', () => {
            const { style } = resolveStyle(
                'background-image: linear-gradient(rgba(17, 17, 17, 0.8), rgba(17, 17, 17, 0.8))',
            );
            expect(style.backgroundColor).toBe('rgba(17, 17, 17, 0.8)');
        });

        it('background-size/position/repeat are recognized (no warning)', () => {
            const { warnings } = resolveStyle(
                'background-size: 100% 100%; background-position: center; background-repeat: no-repeat',
            );
            expect(warnings).toEqual([]);
        });

        it('border-width and border-color parsed individually', () => {
            const { style } = resolveStyle('border-width: 2px; border-color: rgb(200, 200, 200)');
            expect(style.borderWidth).toBe(2);
            expect(style.borderColor).toBe('rgb(200, 200, 200)');
        });

        it('export-emitted properties do not produce warnings', () => {
            const exportStyle =
                'overflow: visible; box-sizing: border-box; scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.3) transparent';
            const { warnings } = resolveStyle(exportStyle);
            expect(warnings).toEqual([]);
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

    describe('extended style mapping (Step 4.4)', () => {
        it('box-shadow → DROP_SHADOW effect', () => {
            const { style } = resolveStyle('box-shadow: 2px 4px 8px rgba(0,0,0,0.1)');
            expect(style.effects).toHaveLength(1);
            expect(style.effects![0]).toEqual({
                type: 'DROP_SHADOW',
                offset: { x: 2, y: 4 },
                radius: 8,
                spread: undefined,
                color: 'rgba(0,0,0,0.1)',
            });
        });

        it('box-shadow with spread → DROP_SHADOW effect', () => {
            const { style } = resolveStyle('box-shadow: 0px 2px 10px 1px #00000020');
            expect(style.effects).toHaveLength(1);
            const effect = style.effects![0];
            expect(effect.type).toBe('DROP_SHADOW');
            if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
                expect(effect.spread).toBe(1);
            }
        });

        it('text-decoration: underline', () => {
            const { style } = resolveStyle('text-decoration: underline');
            expect(style.textDecoration).toBe('UNDERLINE');
        });

        it('text-decoration: line-through', () => {
            const { style } = resolveStyle('text-decoration: line-through');
            expect(style.textDecoration).toBe('STRIKETHROUGH');
        });

        it('text-decoration-line: underline', () => {
            const { style } = resolveStyle('text-decoration-line: underline');
            expect(style.textDecoration).toBe('UNDERLINE');
        });

        it('text-transform: uppercase → UPPER', () => {
            const { style } = resolveStyle('text-transform: uppercase');
            expect(style.textCase).toBe('UPPER');
        });

        it('text-transform: capitalize → TITLE', () => {
            const { style } = resolveStyle('text-transform: capitalize');
            expect(style.textCase).toBe('TITLE');
        });

        it('text-overflow: ellipsis → ENDING', () => {
            const { style } = resolveStyle('text-overflow: ellipsis');
            expect(style.textTruncation).toBe('ENDING');
        });
    });

    describe('CSS Grid mapping', () => {
        it('display: grid with columns and gap', () => {
            const { style } = resolveStyle(
                'display: grid; grid-template-columns: 200px 200px 200px; gap: 16px',
            );
            expect(style.layoutMode).toBe('grid');
            expect(style.gridColumnWidths).toEqual([200, 200, 200]);
            expect(style.gap).toBe(16);
            expect(style.rowGap).toBe(16);
        });

        it('display: grid with separate column-gap and row-gap', () => {
            const { style } = resolveStyle(
                'display: grid; grid-template-columns: 100px 200px; column-gap: 10px; row-gap: 20px',
            );
            expect(style.layoutMode).toBe('grid');
            expect(style.gap).toBe(10);
            expect(style.rowGap).toBe(20);
        });

        it('display: grid with only gap shorthand sets both column and row spacing', () => {
            const { style } = resolveStyle('display: grid; gap: 24px');
            expect(style.gap).toBe(24);
            expect(style.rowGap).toBe(24);
        });

        it('display: grid with grid-template-rows', () => {
            const { style } = resolveStyle(
                'display: grid; grid-template-columns: 100px 100px; grid-template-rows: 50px 80px',
            );
            expect(style.gridColumnWidths).toEqual([100, 100]);
            expect(style.gridRowHeights).toEqual([50, 80]);
        });

        it('display: grid with column-gap overrides gap for column spacing', () => {
            const { style } = resolveStyle('display: grid; gap: 10px; column-gap: 20px');
            expect(style.gap).toBe(20);
            expect(style.rowGap).toBe(10);
        });
    });

    describe('absolute positioning', () => {
        it('position: absolute sets isAbsolute flag', () => {
            const { style } = resolveStyle('position: absolute');
            expect(style.isAbsolute).toBe(true);
        });

        it('position: relative does NOT set isAbsolute', () => {
            const { style } = resolveStyle('position: relative; top: 10px; left: 20px');
            expect(style.isAbsolute).toBeUndefined();
            expect(style.x).toBeUndefined();
            expect(style.y).toBeUndefined();
        });

        it('computed styles provide position: absolute (no static CSS)', () => {
            const { style } = resolveStyle('', undefined, undefined, {
                styles: { position: 'absolute', top: '30px', left: '40px' },
                boundingRect: { x: 40, y: 30, width: 150, height: 60 },
            });
            expect(style.isAbsolute).toBe(true);
            expect(style.x).toBe(40);
            expect(style.y).toBe(30);
            expect(style.width).toBe(150);
            expect(style.height).toBe(60);
        });

        it('bounding rect applies x/y only for absolute elements', () => {
            const { style: absStyle } = resolveStyle('position: absolute', undefined, undefined, {
                styles: {},
                boundingRect: { x: 50, y: 100, width: 200, height: 80 },
            });
            expect(absStyle.isAbsolute).toBe(true);
            expect(absStyle.x).toBe(50);
            expect(absStyle.y).toBe(100);
            expect(absStyle.width).toBe(200);
            expect(absStyle.height).toBe(80);

            const { style: relStyle } = resolveStyle('', undefined, undefined, {
                styles: {},
                boundingRect: { x: 50, y: 100, width: 200, height: 80 },
            });
            expect(relStyle.isAbsolute).toBeUndefined();
            expect(relStyle.x).toBeUndefined();
            expect(relStyle.y).toBeUndefined();
            expect(relStyle.width).toBe(200);
            expect(relStyle.height).toBe(80);
        });
    });

    describe('Phase 3: gradient fills', () => {
        it('linear-gradient(180deg, ...) → fills array', () => {
            const { style } = resolveStyle(
                'background-image: linear-gradient(180deg, rgba(245, 240, 233, 1) 0%, rgba(245, 240, 233, 0) 100%)',
            );
            expect(style.fills).toHaveLength(1);
            expect(style.fills![0]).toEqual({
                type: 'GRADIENT_LINEAR',
                angle: 180,
                stops: [
                    { color: 'rgba(245, 240, 233, 1)', position: 0 },
                    { color: 'rgba(245, 240, 233, 0)', position: 1 },
                ],
            });
        });

        it('linear-gradient with "to right" direction', () => {
            const { style } = resolveStyle(
                'background-image: linear-gradient(to right, #ff0000 0%, #0000ff 100%)',
            );
            expect(style.fills).toHaveLength(1);
            expect(style.fills![0]).toMatchObject({ type: 'GRADIENT_LINEAR', angle: 90 });
        });

        it('linear-gradient with "to top" direction', () => {
            const { style } = resolveStyle(
                'background-image: linear-gradient(to top, #000 0%, #fff 100%)',
            );
            expect(style.fills![0]).toMatchObject({ type: 'GRADIENT_LINEAR', angle: 0 });
        });

        it('linear-gradient with 3 color stops', () => {
            const { style } = resolveStyle(
                'background-image: linear-gradient(90deg, red 0%, green 50%, blue 100%)',
            );
            expect(style.fills![0]).toMatchObject({
                type: 'GRADIENT_LINEAR',
                angle: 90,
                stops: [
                    { color: 'red', position: 0 },
                    { color: 'green', position: 0.5 },
                    { color: 'blue', position: 1 },
                ],
            });
        });

        it('gradient + background-color → fills with solid + gradient', () => {
            const { style } = resolveStyle(
                'background-color: #f5f0e9; background-image: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 100%)',
            );
            expect(style.backgroundColor).toBe('#f5f0e9');
            expect(style.fills).toHaveLength(1);
            expect(style.fills![0].type).toBe('GRADIENT_LINEAR');
        });
    });

    describe('Phase 3: inset box-shadow', () => {
        it('inset box-shadow → INNER_SHADOW effect', () => {
            const { style } = resolveStyle('box-shadow: inset 0px 2px 4px rgba(0,0,0,0.15)');
            expect(style.effects).toHaveLength(1);
            expect(style.effects![0]).toMatchObject({
                type: 'INNER_SHADOW',
                offset: { x: 0, y: 2 },
                radius: 4,
                color: 'rgba(0,0,0,0.15)',
            });
        });

        it('multiple shadows: drop + inset', () => {
            const { style } = resolveStyle(
                'box-shadow: 2px 4px 8px rgba(0,0,0,0.1), inset 0px 1px 3px rgba(0,0,0,0.2)',
            );
            expect(style.effects).toHaveLength(2);
            expect(style.effects![0].type).toBe('DROP_SHADOW');
            expect(style.effects![1].type).toBe('INNER_SHADOW');
        });

        it('box-shadow: none → no effects', () => {
            const { style } = resolveStyle('box-shadow: none');
            expect(style.effects).toBeUndefined();
        });
    });

    describe('Phase 3: per-side borders', () => {
        it('per-side border widths are captured individually', () => {
            const { style } = resolveStyle(
                'border-top-width: 0px; border-right-width: 0px; border-bottom-width: 2px; border-left-width: 0px',
            );
            expect(style.borderTopWidth).toBe(0);
            expect(style.borderRightWidth).toBe(0);
            expect(style.borderBottomWidth).toBe(2);
            expect(style.borderLeftWidth).toBe(0);
        });

        it('per-side border colors set borderColor from first non-transparent', () => {
            const { style } = resolveStyle(
                'border-bottom-width: 1px; border-bottom-color: rgb(200, 200, 200)',
            );
            expect(style.borderBottomWidth).toBe(1);
            expect(style.borderColor).toBe('rgb(200, 200, 200)');
        });

        it('per-side border widths do not generate unsupported property warnings', () => {
            const { warnings } = resolveStyle(
                'border-right-width: 1px; border-bottom-width: 1px; border-left-width: 1px; border-right-color: #ccc; border-bottom-color: #ccc; border-left-color: #ccc',
            );
            expect(warnings.filter((w) => w.includes('CSS_UNSUPPORTED'))).toEqual([]);
        });
    });

    describe('Phase 3: blur effects', () => {
        it('filter: blur(10px) → LAYER_BLUR effect', () => {
            const { style } = resolveStyle('filter: blur(10px)');
            expect(style.effects).toHaveLength(1);
            expect(style.effects![0]).toEqual({ type: 'LAYER_BLUR', radius: 10 });
        });

        it('backdrop-filter: blur(20px) → BACKGROUND_BLUR effect', () => {
            const { style } = resolveStyle('backdrop-filter: blur(20px)');
            expect(style.effects).toHaveLength(1);
            expect(style.effects![0]).toEqual({ type: 'BACKGROUND_BLUR', radius: 20 });
        });

        it('filter: none → no effects', () => {
            const { style } = resolveStyle('filter: none');
            expect(style.effects).toBeUndefined();
        });
    });

    describe('Phase 3: font style', () => {
        it('font-style: italic', () => {
            const { style } = resolveStyle('font-style: italic');
            expect(style.fontStyle).toBe('italic');
        });

        it('font-style: oblique treated as italic', () => {
            const { style } = resolveStyle('font-style: oblique');
            expect(style.fontStyle).toBe('italic');
        });

        it('font-style: normal', () => {
            const { style } = resolveStyle('font-style: normal');
            expect(style.fontStyle).toBe('normal');
        });
    });

    describe('CSS class resolution (Step 4.3)', () => {
        it('parseCssToClassMap: simple class selector', () => {
            const css = '.card { width: 400px; padding: 24px; }';
            const { classMap } = parseCssToClassMap(css);
            expect(classMap.get('card')).toEqual({ width: '400px', padding: '24px' });
        });

        it('parseCssToClassMap: multiple classes', () => {
            const css = '.title { font-size: 24px; } .subtitle { font-size: 16px; }';
            const { classMap } = parseCssToClassMap(css);
            expect(classMap.get('title')).toEqual({ 'font-size': '24px' });
            expect(classMap.get('subtitle')).toEqual({ 'font-size': '16px' });
        });

        it('parseCssToClassMap: pseudo-class emits warning', () => {
            const css = '.card:hover { background-color: #f0f0f0; }';
            const { classMap, warnings } = parseCssToClassMap(css);
            expect(classMap.size).toBe(0);
            expect(warnings).toEqual(
                expect.arrayContaining([expect.stringContaining('CSS_PSEUDO_NOT_SUPPORTED')]),
            );
        });

        it('parseCssToClassMap: descendant selector emits warning', () => {
            const css = '.card .button { color: white; }';
            const { warnings } = parseCssToClassMap(css);
            expect(warnings).toEqual(
                expect.arrayContaining([expect.stringContaining('CSS_COMPLEX_SELECTOR_SKIPPED')]),
            );
        });

        it('resolveClassStyles: single class lookup', () => {
            const classMap = new Map([['card', { width: '400px', padding: '24px' }]]);
            const result = resolveClassStyles('card', classMap);
            expect(result).toEqual({ width: '400px', padding: '24px' });
        });

        it('resolveStyle merges class + inline (inline wins)', () => {
            const classMap = new Map([
                ['button', { 'background-color': '#000', 'font-size': '16px' }],
            ]);
            const { style } = resolveStyle('font-size: 14px', ['button'], classMap);
            expect(style.fontSize).toBe(14);
            expect(style.backgroundColor).toBe('#000');
        });

        it('parseCssToClassMap: removes CSS comments', () => {
            const css = '/* comment */ .foo { color: red; } /* another */';
            const { classMap } = parseCssToClassMap(css);
            expect(classMap.get('foo')).toEqual({ color: 'red' });
        });
    });

    describe('Issue #04 regression: CSS custom property resolution', () => {
        it('parseCssToClassMap resolves var(--X) from :root declarations', () => {
            const css = `
                :root { --primary: #336699; --spacing: 16px; }
                .card { background-color: var(--primary); padding: var(--spacing); }
            `;
            const { classMap } = parseCssToClassMap(css);
            expect(classMap.get('card')).toEqual({
                'background-color': '#336699',
                padding: '16px',
            });
        });

        it('parseCssToClassMap resolves var() with fallback when variable is missing', () => {
            const css = `
                :root { --known: blue; }
                .btn { color: var(--unknown, red); background-color: var(--known); }
            `;
            const { classMap } = parseCssToClassMap(css);
            expect(classMap.get('btn')!['color']).toBe('red');
            expect(classMap.get('btn')!['background-color']).toBe('blue');
        });

        it('parseCssToClassMap resolves var() from html and body selectors', () => {
            const css = `
                html { --font-color: #111; }
                body { --bg-color: #fafafa; }
                .text { color: var(--font-color); background-color: var(--bg-color); }
            `;
            const { classMap } = parseCssToClassMap(css);
            expect(classMap.get('text')!['color']).toBe('#111');
            expect(classMap.get('text')!['background-color']).toBe('#fafafa');
        });

        it('class with resolved var() feeds into resolveStyle correctly', () => {
            const css = `
                :root { --hero-bg: #f5f0e9; --hero-text: #1a1a1a; }
                .hero { background-color: var(--hero-bg); color: var(--hero-text); width: 400px; }
            `;
            const { classMap } = parseCssToClassMap(css);
            const { style } = resolveStyle('', ['hero'], classMap);
            expect(style.backgroundColor).toBe('#f5f0e9');
            expect(style.textColor).toBe('#1a1a1a');
            expect(style.width).toBe(400);
        });
    });

    describe('Issue #04 regression: background shorthand handling', () => {
        it('background: <hex color> sets backgroundColor', () => {
            const { style } = resolveStyle('background: #f5f0e9');
            expect(style.backgroundColor).toBe('#f5f0e9');
        });

        it('background: <named color> sets backgroundColor', () => {
            const { style } = resolveStyle('background: white');
            expect(style.backgroundColor).toBe('white');
        });

        it('background: rgb(...) sets backgroundColor', () => {
            const { style } = resolveStyle('background: rgb(245, 240, 233)');
            expect(style.backgroundColor).toBe('rgb(245, 240, 233)');
        });

        it('background: rgba(...) sets backgroundColor', () => {
            const { style } = resolveStyle('background: rgba(0, 0, 0, 0.5)');
            expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
        });

        it('background: linear-gradient(...) parses gradient fill', () => {
            const { style } = resolveStyle(
                'background: linear-gradient(180deg, rgba(245, 240, 233, 1) 0%, rgba(245, 240, 233, 0) 100%)',
            );
            expect(style.fills).toHaveLength(1);
            expect(style.fills![0].type).toBe('GRADIENT_LINEAR');
        });

        it('background shorthand does not produce CSS_UNSUPPORTED warning', () => {
            const { warnings } = resolveStyle('background: #ff0000');
            expect(warnings.filter((w) => w.includes('CSS_UNSUPPORTED'))).toEqual([]);
        });
    });
});
