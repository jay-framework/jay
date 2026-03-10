import { describe, it, expect } from 'vitest';
import { computeSourceId } from '@jay-framework/compiler-jay-html';

describe('computeSourceId', () => {
    it('offset 0 → "1:1"', () => {
        expect(computeSourceId(0, '<div></div>')).toBe('1:1');
    });

    it('single line: offset 5 → "1:6"', () => {
        expect(computeSourceId(5, '<div><span></span></div>')).toBe('1:6');
    });

    it('multi-line: offset after first newline', () => {
        const html = '<div>\n  <span></span>\n</div>';
        const spanOffset = html.indexOf('<span>');
        expect(computeSourceId(spanOffset, html)).toBe('2:3');
    });

    it('multi-line: third line', () => {
        const html = 'line1\nline2\nline3';
        const offset = html.indexOf('line3');
        expect(computeSourceId(offset, html)).toBe('3:1');
    });

    it('offset beyond source length clamps safely', () => {
        const html = 'ab';
        expect(computeSourceId(100, html)).toBe('1:3');
    });

    it('handles \\r\\n as \\n for column counting', () => {
        const html = '<div>\r\n  <span></span>\r\n</div>';
        const spanOffset = html.indexOf('<span>');
        expect(computeSourceId(spanOffset, html)).toBe('2:3');
    });

    it('consecutive newlines increment line correctly', () => {
        const html = '\n\n\n<div>';
        const divOffset = html.indexOf('<div>');
        expect(computeSourceId(divOffset, html)).toBe('4:1');
    });
});
