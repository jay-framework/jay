import { HTMLElement, parse } from 'node-html-parser';
import { diffBodies, diffMarkup, facetKey } from '../lib';
import type { DiffEntry } from '../lib';

/** Sorted facet keys, for order-independent assertions. */
function keys(entries: DiffEntry[]): string[] {
    return entries.map((e) => `${e.change}:${facetKey(e.facet)}`).sort();
}

describe('diffMarkup — no drift', () => {
    it('identical bodies produce no entries', () => {
        const body = `<div class="card"><h3>{heading}</h3><button ref="cta">{ctaLabel}</button></div>`;
        expect(diffMarkup(body, body)).toEqual([]);
    });

    it('formatting-only differences are not drift', () => {
        const source = `<div class="card"><h3>{heading}</h3></div>`;
        const region = `<div  class="card"  >\n  <h3>{ heading }</h3>\n</div>`;
        expect(diffMarkup(source, region)).toEqual([]);
    });

    it('a compiler-injected jc attribute is not drift', () => {
        const source = `<jay:counter ref="c"></jay:counter>`;
        const region = `<jay:counter ref="c" jc="counter"></jay:counter>`;
        // top-level nested region tag: not descended into, and jc is meta anyway
        expect(diffMarkup(source, region)).toEqual([]);
    });
});

describe('diffMarkup — attribute facets', () => {
    it('changed attribute', () => {
        const source = `<div class="card"><h3>{heading}</h3></div>`;
        const region = `<div class="card featured"><h3>{heading}</h3></div>`;
        const [entry, ...rest] = diffMarkup(source, region);
        expect(rest).toEqual([]);
        expect(entry.change).toBe('changed');
        expect(entry.facet).toEqual({
            kind: 'attribute',
            path: [0],
            element: 'DIV',
            name: 'class',
        });
        expect(entry.sourceValue).toBe('card');
        expect(entry.regionValue).toBe('card featured');
    });

    it('added attribute', () => {
        const source = `<a>link</a>`;
        const region = `<a href="{url}">link</a>`;
        expect(keys(diffMarkup(source, region))).toEqual(['added:attribute@0#href']);
    });

    it('removed attribute', () => {
        const source = `<a href="{url}" title="go">link</a>`;
        const region = `<a href="{url}">link</a>`;
        expect(keys(diffMarkup(source, region))).toEqual(['removed:attribute@0#title']);
    });

    it('binding expression change is drift, formatting is not', () => {
        const source = `<a href="{url}">x</a>`;
        const region = `<a href="{ pageUrl }">x</a>`;
        expect(keys(diffMarkup(source, region))).toEqual(['changed:attribute@0#href']);
    });
});

describe('diffMarkup — style-declaration facets', () => {
    it('changed one declaration, leaves siblings alone', () => {
        const source = `<h3 style="color:red; margin:0">x</h3>`;
        const region = `<h3 style="color:#b00; margin:0">x</h3>`;
        expect(keys(diffMarkup(source, region))).toEqual(['changed:style-declaration@0#color']);
    });

    it('added and removed declarations', () => {
        const source = `<h3 style="margin:0">x</h3>`;
        const region = `<h3 style="color:#b00">x</h3>`;
        expect(keys(diffMarkup(source, region))).toEqual([
            'added:style-declaration@0#color',
            'removed:style-declaration@0#margin',
        ]);
    });

    it('does not split on a colon inside a binding or url()', () => {
        const source = `<h3 style="background:url(a:b); color:{cond ? 'x' : 'y'}">t</h3>`;
        const region = `<h3 style="background:url(a:b); color:{cond ? 'x' : 'y'}">t</h3>`;
        expect(diffMarkup(source, region)).toEqual([]);
    });
});

describe('diffMarkup — children facets', () => {
    it('text change is a children facet on the containing element', () => {
        const source = `<div><h3>{heading}</h3></div>`;
        const region = `<div><h3>on sale</h3></div>`;
        const [entry, ...rest] = diffMarkup(source, region);
        expect(rest).toEqual([]);
        // div is [0]; the h3 whose text changed is [0,0]
        expect(entry.facet).toEqual({ kind: 'children', path: [0, 0], element: 'H3' });
    });

    it('an inserted child is a single children facet on the parent, no descent', () => {
        const source = `<div><h3>{heading}</h3></div>`;
        const region = `<div><h3>{heading}</h3><p>new</p></div>`;
        expect(keys(diffMarkup(source, region))).toEqual(['changed:children@0']);
    });

    it('a removed child is a single children facet on the parent', () => {
        const source = `<div><h3>{heading}</h3><p ref="disclaimer">fine print</p></div>`;
        const region = `<div><h3>{heading}</h3></div>`;
        expect(keys(diffMarkup(source, region))).toEqual(['changed:children@0']);
    });

    it('a deep attribute change reports the deep attribute, not the ancestor', () => {
        const source = `<div><section><h3 class="a">{t}</h3></section></div>`;
        const region = `<div><section><h3 class="b">{t}</h3></section></div>`;
        expect(keys(diffMarkup(source, region))).toEqual(['changed:attribute@0.0.0#class']);
    });
});

describe('diffMarkup — nested regions (Q2)', () => {
    it('does not descend into a nested <jay:X> region', () => {
        const source = `<div><jay:counter ref="c"><span>{count}</span></jay:counter></div>`;
        const region = `<div><jay:counter ref="c"><span>totally different</span></jay:counter></div>`;
        expect(diffMarkup(source, region)).toEqual([]);
    });

    it('still validates markup around a nested region', () => {
        const source = `<div class="a"><jay:counter ref="c"></jay:counter></div>`;
        const region = `<div class="b"><jay:counter ref="c"></jay:counter></div>`;
        expect(keys(diffMarkup(source, region))).toEqual(['changed:attribute@0#class']);
    });
});

describe('diffBodies — scope-anchor class (DL#196)', () => {
    it('ignores the ref-anchor class the materialiser stamps on the flattened root', () => {
        const source = parse(`<div class="card"><h3 class="card-heading">x</h3></div>`);
        const region = parse(
            `<jay:card ref="promo"><div class="card promo"><h3 class="card-heading">x</h3></div></jay:card>`,
        ).firstChild as HTMLElement;
        expect(diffBodies(source, region)).toEqual([]);
    });

    it('reports a genuine class change with the anchor token stripped from the values', () => {
        const source = parse(`<div class="card"></div>`);
        const region = parse(
            `<jay:card ref="promo"><div class="card-large promo"></div></jay:card>`,
        ).firstChild as HTMLElement;
        const [entry, ...rest] = diffBodies(source, region);
        expect(rest).toEqual([]);
        expect(`${entry.change}:${facetKey(entry.facet)}`).toBe('changed:attribute@0#class');
        expect(entry.sourceValue).toBe('card');
        expect(entry.regionValue).toBe('card-large');
    });

    it('a root whose only class is the anchor matches a template root with no class', () => {
        const source = parse(`<div></div>`);
        const region = parse(`<jay:card ref="promo"><div class="promo"></div></jay:card>`)
            .firstChild as HTMLElement;
        expect(diffBodies(source, region)).toEqual([]);
    });
});
