import { tagToNamespace } from '../lib/jay-target/tag-to-namespace';
import { Import } from '@jay-framework/compiler-shared';

describe('TagToNamespace', () => {
    it('should map svg to svg namespace', () => {
        expect(tagToNamespace('svg', false, [])).toEqual({
            elementFunction: 'svg',
            import: Import.svgElement,
            tag: 'svg',
        });
    });

    it('should map svg to svg namespace', () => {
        expect(tagToNamespace('svg', true, [])).toEqual({
            elementFunction: 'dsvg',
            import: Import.svgDynamicElement,
            tag: 'svg',
        });
    });

    it('should map svg line to svg namespace', () => {
        expect(tagToNamespace('line', false, [])).toEqual({
            elementFunction: 'svg',
            import: Import.svgElement,
            tag: 'line',
        });
    });

    it('should map math to math namespace', () => {
        expect(tagToNamespace('math', false, [])).toEqual({
            elementFunction: 'ml',
            import: Import.mathMlElement,
            tag: 'math',
        });
    });

    it('should map math mphantom to math namespace', () => {
        expect(tagToNamespace('mphantom', false, [])).toEqual({
            elementFunction: 'ml',
            import: Import.mathMlElement,
            tag: 'mphantom',
        });
    });

    it('should map math mphantom to math namespace', () => {
        expect(tagToNamespace('mphantom', true, [])).toEqual({
            elementFunction: 'dml',
            import: Import.mathMLDynamicElement,
            tag: 'mphantom',
        });
    });

    it('should map div to html namespace', () => {
        expect(tagToNamespace('div', false, [])).toEqual({
            elementFunction: 'e',
            import: Import.element,
            tag: 'div',
        });
    });

    it('should map qualified namespace', () => {
        expect(
            tagToNamespace('svg:circle', false, [
                { prefix: 'svg', namespace: 'http://www.w3.org/2000/svg' },
            ]),
        ).toEqual({ elementFunction: 'svg', import: Import.svgElement, tag: 'circle' });
    });
});
