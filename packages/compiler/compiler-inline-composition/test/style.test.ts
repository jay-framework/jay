import { parseInlineStyle } from '../lib';

describe('parseInlineStyle', () => {
    it('parses simple declarations to a lowercased-property map', () => {
        const map = parseInlineStyle('color: red; Margin: 0');
        expect([...map.entries()]).toEqual([
            ['color', 'red'],
            ['margin', '0'],
        ]);
    });

    it('returns an empty map for undefined / empty', () => {
        expect(parseInlineStyle(undefined).size).toBe(0);
        expect(parseInlineStyle('   ').size).toBe(0);
    });

    it('does not split on a semicolon inside url()', () => {
        const map = parseInlineStyle('background: url(a;b); color: red');
        expect(map.get('background')).toBe('url(a;b)');
        expect(map.get('color')).toBe('red');
    });

    it('does not split on a colon inside a binding', () => {
        const map = parseInlineStyle(`color: {cond ? 'a' : 'b'}`);
        expect(map.get('color')).toBe(`{cond ? 'a' : 'b'}`);
        expect(map.size).toBe(1);
    });

    it('tolerates a trailing semicolon', () => {
        const map = parseInlineStyle('color: red;');
        expect([...map.keys()]).toEqual(['color']);
    });
});
