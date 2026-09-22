import { diffCss, facetKey } from '../lib';
import type { DiffEntry } from '../lib';

/** Sorted facet keys, for order-independent assertions. */
function keys(entries: DiffEntry[]): string[] {
    return entries.map((e) => `${e.change}:${facetKey(e.facet)}`).sort();
}

describe('diffCss — no drift', () => {
    it('identical CSS produces no entries', () => {
        const css = `.card { color: red; margin: 0 }`;
        expect(diffCss(css, css)).toEqual([]);
    });

    it('formatting-only differences are not drift', () => {
        const source = `.card{color:red;margin:0}`;
        const region = `.card {\n  color:   red;\n  margin: 0;\n}`;
        expect(diffCss(source, region)).toEqual([]);
    });

    it('an @scope wrapper on the region is transparent', () => {
        const source = `.card { color: red }`;
        const region = `@scope (.region) { .card { color: red } }`;
        expect(diffCss(source, region)).toEqual([]);
    });
});

describe('diffCss — declaration facets', () => {
    it('a changed declaration reports only that declaration', () => {
        const source = `.card { color: red; margin: 0 }`;
        const region = `.card { color: #b00; margin: 0 }`;
        const [entry, ...rest] = diffCss(source, region);
        expect(rest).toEqual([]);
        expect(entry.change).toBe('changed');
        expect(entry.facet).toEqual({
            kind: 'css-declaration',
            selector: '.card',
            property: 'color',
        });
        expect(entry.sourceValue).toBe('red');
        expect(entry.regionValue).toBe('#b00');
    });

    it('added and removed declarations', () => {
        const source = `.card { margin: 0 }`;
        const region = `.card { color: #b00 }`;
        expect(keys(diffCss(source, region))).toEqual([
            'added:css-declaration#.card#color',
            'removed:css-declaration#.card#margin',
        ]);
    });
});

describe('diffCss — rule facets', () => {
    it('a rule added in the region', () => {
        const source = `.card { color: red }`;
        const region = `.card { color: red } .card .badge { color: gold }`;
        expect(keys(diffCss(source, region))).toEqual(['added:css-rule#.card .badge']);
    });

    it('a rule removed from the region', () => {
        const source = `.card { color: red } .card .badge { color: gold }`;
        const region = `.card { color: red }`;
        expect(keys(diffCss(source, region))).toEqual(['removed:css-rule#.card .badge']);
    });

    it('a multi-selector rule expands to one unit per selector', () => {
        const source = `h1, h2 { margin: 0 }`;
        const region = `h1, h2 { margin: 4px }`;
        expect(keys(diffCss(source, region))).toEqual([
            'changed:css-declaration#h1#margin',
            'changed:css-declaration#h2#margin',
        ]);
    });
});

describe('diffCss — @media context', () => {
    it('keeps a media-scoped rule distinct from its base rule', () => {
        const source = `.card { color: red } @media (max-width: 600px) { .card { color: red } }`;
        const region = `.card { color: red } @media (max-width: 600px) { .card { color: blue } }`;
        expect(keys(diffCss(source, region))).toEqual([
            'changed:css-declaration#@media (max-width: 600px) .card#color',
        ]);
    });
});

describe('diffCss — jay:override pragma', () => {
    it('/* jay:override */ before a rule owns the whole rule', () => {
        const source = `.card { color: red; margin: 0 }`;
        const region = `/* jay:override */ .card { color: blue; margin: 8px; padding: 4px }`;
        expect(diffCss(source, region)).toEqual([]);
    });

    it('/* jay:override */ owns an entirely added rule', () => {
        const source = `.card { color: red }`;
        const region = `.card { color: red } /* jay:override */ .card .badge { color: gold }`;
        expect(diffCss(source, region)).toEqual([]);
    });

    it('/* jay:override: color */ owns only that declaration', () => {
        const source = `.card { color: red; margin: 0 }`;
        const region = `.card { /* jay:override: color */ color: blue; margin: 8px }`;
        expect(keys(diffCss(source, region))).toEqual(['changed:css-declaration#.card#margin']);
    });

    it('a declaration pragma still owns a removed declaration', () => {
        const source = `.card { color: red; margin: 0 }`;
        const region = `.card { /* jay:override: margin */ color: red }`;
        expect(diffCss(source, region)).toEqual([]);
    });

    it('an unrelated comment is not an override pragma', () => {
        const source = `.card { color: red }`;
        const region = `/* just a note */ .card { color: blue }`;
        expect(keys(diffCss(source, region))).toEqual(['changed:css-declaration#.card#color']);
    });
});
