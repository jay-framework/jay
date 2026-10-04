import { describe, it, expect } from 'vitest';
import {
    tokenizeCss,
    splitScopeBlocks,
    scopeInnerBody,
    extractScopeBlock,
    normalizeCssBody,
} from '../lib/scope-css';

describe('scope-css — DL#203 `to (…)` donut parsing', () => {
    const donut = `@scope (.cardStarter) to (.cta) {
  .card-heading { color: black; }
}`;

    it('tokenizes a `to (…)` block, capturing both the selector list and the donut boundary', () => {
        const segments = tokenizeCss(donut);
        expect(segments).toHaveLength(1);
        const seg = segments[0];
        expect(seg.type).toBe('scope');
        if (seg.type !== 'scope') throw new Error('expected a scope segment');
        expect(seg.selectors).toEqual(['.cardStarter']);
        expect(seg.to).toEqual(['.cta']);
        expect(seg.block).toEqual(donut);
    });

    it('parses a multi-member donut boundary (`to (.a, .b)`)', () => {
        const css = `@scope (.grid) to (.cardStarter, .cardPro) {
  .wrap { gap: 8px; }
}`;
        const [block] = splitScopeBlocks(css);
        expect(block.selectors).toEqual(['.grid']);
        expect(block.to).toEqual(['.cardStarter', '.cardPro']);
    });

    it('still parses a plain block with no `to` limit (empty boundary list)', () => {
        const css = `@scope (.badge) {
  .label { font-weight: bold; }
}`;
        const [block] = splitScopeBlocks(css);
        expect(block.selectors).toEqual(['.badge']);
        expect(block.to).toEqual([]);
    });

    it('scopeInnerBody strips the `@scope (…) to (…) {` header and trailing brace', () => {
        expect(normalizeCssBody(scopeInnerBody(donut))).toBe('.card-heading{color:black}');
    });

    it('extractScopeBlock finds a donut block by one of its member selectors', () => {
        const sheet = `@scope (.a, .b) to (.cta) {\n  .x { color: red; }\n}`;
        expect(extractScopeBlock(sheet, '.b')).toEqual(sheet);
    });
});
