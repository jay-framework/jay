import { diffMarkup, facetKey } from '../lib';
import type { DiffEntry } from '../lib';

function keys(entries: DiffEntry[]): string[] {
    return entries.map((e) => `${e.change}:${facetKey(e.facet)}`).sort();
}

describe('override suppression — per facet', () => {
    it('override="class" suppresses only that attribute', () => {
        const source = `<div class="card" title="a"><h3>{t}</h3></div>`;
        const region = `<div class="card featured" title="b" override="class"><h3>{t}</h3></div>`;
        // class is owned; title still reports
        expect(keys(diffMarkup(source, region))).toEqual(['changed:attribute@0#title']);
    });

    it('override="style.color" suppresses only that declaration', () => {
        const source = `<h3 style="color:red; margin:0">x</h3>`;
        const region = `<h3 style="color:#b00; margin:4px" override="style.color">x</h3>`;
        expect(keys(diffMarkup(source, region))).toEqual(['changed:style-declaration@0#margin']);
    });

    it('override="children" suppresses the subtree', () => {
        const source = `<div><h3>{heading}</h3></div>`;
        const region = `<div override="children"><h3>on sale</h3><p>extra</p></div>`;
        expect(diffMarkup(source, region)).toEqual([]);
    });

    it('override="children" does not suppress a sibling attribute change on the same node', () => {
        const source = `<div class="a"><h3>{heading}</h3></div>`;
        const region = `<div class="b" override="children"><h3>rewritten</h3></div>`;
        expect(keys(diffMarkup(source, region))).toEqual(['changed:attribute@0#class']);
    });

    it('a space-separated list owns several facets', () => {
        const source = `<div class="a" style="color:red"><h3>{t}</h3></div>`;
        const region = `<div class="b" style="color:blue" override="class style.color children"><h3>x</h3><p>y</p></div>`;
        expect(diffMarkup(source, region)).toEqual([]);
    });

    it('bare override owns the whole node', () => {
        const source = `<div class="a" style="color:red"><h3>{t}</h3></div>`;
        const region = `<div class="b" style="color:blue" override><h3>rewritten</h3><p>extra</p></div>`;
        expect(diffMarkup(source, region)).toEqual([]);
    });

    it('override="*" owns the whole node', () => {
        const source = `<div class="a"><h3>{t}</h3></div>`;
        const region = `<div class="b" override="*"><h3>rewritten</h3></div>`;
        expect(diffMarkup(source, region)).toEqual([]);
    });
});

describe('content slot (jay-content) — facet list, read from the source side (DL#202)', () => {
    it('bare jay-content owns the children subtree', () => {
        const source = `<div jay-content><h3>{t}</h3></div>`;
        const region = `<div><h3>rewritten</h3><p>extra</p></div>`;
        expect(diffMarkup(source, region)).toEqual([]);
    });

    it('jay-content="*" owns the whole node', () => {
        const source = `<div class="a" jay-content="*"><h3>{t}</h3></div>`;
        const region = `<div class="b"><h3>rewritten</h3></div>`;
        expect(diffMarkup(source, region)).toEqual([]);
    });

    it('a named-attribute slot owns only those attributes, not children', () => {
        const source = `<a jay-content="href" class="link" href="#">{t}</a>`;
        const region = `<a class="link" href="/pricing">buy</a>`;
        // href is content (skipped); the text-children change is still drift.
        expect(keys(diffMarkup(source, region))).toEqual(['changed:children@0']);
    });

    it('combines children and attributes in one slot', () => {
        const source = `<figure jay-content="children src"><img src="p.png"></figure>`;
        const region = `<figure src="hero.png"><img src="x"><figcaption>c</figcaption></figure>`;
        expect(diffMarkup(source, region)).toEqual([]);
    });
});

describe('page-scope subtree (§7)', () => {
    it('a page-scope subtree is excluded from comparison and does not cause children drift', () => {
        const source = `<div class="card"><h3>{heading}</h3></div>`;
        const region = `<div class="card"><h3>{heading}</h3><div page-scope><button ref="claim">Claim</button></div></div>`;
        expect(diffMarkup(source, region)).toEqual([]);
    });
});
