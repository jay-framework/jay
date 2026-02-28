import { escapeHtml, escapeAttr } from '../lib';

describe('escapeHtml', () => {
    // P1: escapes ampersand
    it('escapes ampersand', () => {
        expect(escapeHtml('a&b')).toBe('a&amp;b');
    });

    // P2: escapes less-than
    it('escapes less-than', () => {
        expect(escapeHtml('a<b')).toBe('a&lt;b');
    });

    // P3: escapes greater-than
    it('escapes greater-than', () => {
        expect(escapeHtml('a>b')).toBe('a&gt;b');
    });

    // P4: escapes double quote
    it('escapes double quote', () => {
        expect(escapeHtml('a"b')).toBe('a&quot;b');
    });

    // P5: escapes single quote
    it('escapes single quote', () => {
        expect(escapeHtml("a'b")).toBe('a&#39;b');
    });

    // P6: handles multiple entities
    it('handles multiple entities', () => {
        expect(escapeHtml('<div>&</div>')).toBe('&lt;div&gt;&amp;&lt;/div&gt;');
    });

    // P7: safe string passthrough
    it('safe string passthrough', () => {
        expect(escapeHtml('hello world')).toBe('hello world');
    });

    // P8: empty string
    it('handles empty string', () => {
        expect(escapeHtml('')).toBe('');
    });

    // P9: coerces non-string values via String()
    it('coerces non-string values via String()', () => {
        expect(escapeHtml(null as any)).toBe('null');
        expect(escapeHtml(undefined as any)).toBe('undefined');
        expect(escapeHtml(42 as any)).toBe('42');
    });

    // P10: XSS prevention
    it('prevents XSS via script injection', () => {
        const xss = "<script>alert('xss')</script>";
        const escaped = escapeHtml(xss);
        expect(escaped).not.toContain('<script>');
        expect(escaped).toBe('&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;');
    });
});

describe('escapeAttr', () => {
    // P11: escapes all HTML entity chars
    it('escapes all HTML entity chars', () => {
        expect(escapeAttr('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
    });

    // P12: handles attribute values
    it('handles attribute values with special chars', () => {
        expect(escapeAttr('<tag>')).toBe('&lt;tag&gt;');
    });

    // P13: preserves spaces
    it('preserves spaces', () => {
        expect(escapeAttr('hello world')).toBe('hello world');
    });

    // P14: handles numeric values
    it('handles numeric values', () => {
        expect(escapeAttr(123 as any)).toBe('123');
    });

    // P15: XSS in attributes
    it('prevents XSS in attributes', () => {
        const xss = '" onmouseover="alert(1)';
        const escaped = escapeAttr(xss);
        expect(escaped).not.toContain('"');
        expect(escaped).toBe('&quot; onmouseover=&quot;alert(1)');
    });
});
