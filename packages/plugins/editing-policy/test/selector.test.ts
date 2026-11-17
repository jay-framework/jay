import { describe, it, expect } from 'vitest';
import {
    parseSelector,
    selectorMatches,
    selectorSpecificity,
    compareSpecificity,
    SelectorParseError,
} from '../lib/policy/selector.js';

describe('parseSelector', () => {
    it('parses a bare path glob', () => {
        expect(parseSelector('**')).toEqual({ raw: '**', pathGlob: '**' });
    });

    it('parses a file path with a #name section', () => {
        expect(parseSelector('src/pages/page.jay-html#hero')).toEqual({
            raw: 'src/pages/page.jay-html#hero',
            pathGlob: 'src/pages/page.jay-html',
            section: 'hero',
        });
    });

    it('expands folder shorthand to that folder page.jay-html', () => {
        expect(parseSelector('src/pages/products#hero')).toEqual({
            raw: 'src/pages/products#hero',
            pathGlob: 'src/pages/products/page.jay-html',
            section: 'hero',
        });
    });

    it('keeps a non-.jay-html file path as-is (so #name on it can be flagged)', () => {
        expect(parseSelector('src/styles/app.css#brand')).toEqual({
            raw: 'src/styles/app.css#brand',
            pathGlob: 'src/styles/app.css',
            section: 'brand',
        });
    });

    it('throws on more than one #', () => {
        expect(() => parseSelector('a.jay-html#b#c')).toThrow(SelectorParseError);
    });
});

describe('selectorMatches', () => {
    it('path selector matches a sectioned change on the same path', () => {
        const sel = parseSelector('src/pages/**');
        expect(selectorMatches(sel, { path: 'src/pages/page.jay-html', section: 'hero' })).toBe(
            true,
        );
    });

    it('a #name selector matches only the same section', () => {
        const sel = parseSelector('src/pages/page.jay-html#hero');
        expect(selectorMatches(sel, { path: 'src/pages/page.jay-html', section: 'hero' })).toBe(
            true,
        );
        expect(selectorMatches(sel, { path: 'src/pages/page.jay-html', section: 'promo' })).toBe(
            false,
        );
        expect(selectorMatches(sel, { path: 'src/pages/page.jay-html' })).toBe(false);
    });

    it('does not match a different path', () => {
        const sel = parseSelector('src/pages/legal/**');
        expect(selectorMatches(sel, { path: 'src/pages/page.jay-html' })).toBe(false);
    });
});

describe('selectorSpecificity / compareSpecificity', () => {
    it('ranks #name > literal path > globs', () => {
        const section = selectorSpecificity(parseSelector('src/pages/page.jay-html#hero'));
        const literal = selectorSpecificity(parseSelector('src/pages/page.jay-html'));
        const glob = selectorSpecificity(parseSelector('src/pages/**'));
        const all = selectorSpecificity(parseSelector('**'));

        expect(compareSpecificity(section, literal)).toBeGreaterThan(0);
        expect(compareSpecificity(literal, glob)).toBeGreaterThan(0);
        expect(compareSpecificity(glob, all)).toBeGreaterThan(0);
    });
});
