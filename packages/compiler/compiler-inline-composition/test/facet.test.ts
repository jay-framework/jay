import { overrideSpecFor, facetKey, facetLabel } from '../lib';
import type { Facet } from '../lib';

describe('overrideSpecFor — round-trips each facet to its marker', () => {
    it('attribute → override="<name>" on the node', () => {
        const f: Facet = { kind: 'attribute', path: [0, 1], element: 'DIV', name: 'class' };
        expect(overrideSpecFor(f)).toEqual({
            target: 'markup-attribute',
            path: [0, 1],
            value: 'class',
        });
    });

    it('style-declaration → override="style.<prop>"', () => {
        const f: Facet = { kind: 'style-declaration', path: [0], element: 'H3', property: 'color' };
        expect(overrideSpecFor(f)).toEqual({
            target: 'markup-attribute',
            path: [0],
            value: 'style.color',
        });
    });

    it('children → override="children"', () => {
        const f: Facet = { kind: 'children', path: [2], element: 'UL' };
        expect(overrideSpecFor(f)).toEqual({
            target: 'markup-attribute',
            path: [2],
            value: 'children',
        });
    });

    it('css-rule → /* jay:override */ (empty value)', () => {
        const f: Facet = { kind: 'css-rule', selector: '.card' };
        expect(overrideSpecFor(f)).toEqual({ target: 'css-comment', value: '' });
    });

    it('css-declaration → /* jay:override: <prop> */', () => {
        const f: Facet = { kind: 'css-declaration', selector: '.card h3', property: 'color' };
        expect(overrideSpecFor(f)).toEqual({ target: 'css-comment', value: 'color' });
    });
});

describe('facetKey / facetLabel', () => {
    it('facetKey is stable and distinguishes facets', () => {
        const a: Facet = { kind: 'attribute', path: [0], element: 'DIV', name: 'class' };
        const b: Facet = { kind: 'attribute', path: [0], element: 'DIV', name: 'title' };
        const c: Facet = { kind: 'children', path: [0], element: 'DIV' };
        expect(facetKey(a)).toBe('attribute@0#class');
        expect(new Set([facetKey(a), facetKey(b), facetKey(c)]).size).toBe(3);
    });

    it('facetLabel is human-readable', () => {
        expect(facetLabel({ kind: 'attribute', path: [0], element: 'DIV', name: 'class' })).toBe(
            '<div> attribute "class"',
        );
        expect(facetLabel({ kind: 'children', path: [0], element: 'H3' })).toBe('<h3> children');
    });
});
