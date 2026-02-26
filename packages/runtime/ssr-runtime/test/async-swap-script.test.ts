import { asyncSwapScript } from '../lib';

describe('asyncSwapScript', () => {
    // P16: generates valid script tag
    it('generates a valid script tag', () => {
        const result = asyncSwapScript('p1', '<span>content</span>');
        expect(result).toMatch(/^<script>.*<\/script>$/);
    });

    // P17: escapes single quotes in HTML
    it('escapes single quotes in HTML template', () => {
        const result = asyncSwapScript('p1', "<span class='test'>content</span>");
        // The HTML is embedded in a JS single-quoted string, so quotes must be escaped
        expect(result).toContain("\\'test\\'");
        // Raw unescaped single quotes should not appear in the HTML portion
        expect(result).not.toContain("class='test'");
    });

    // P18: targets correct placeholder
    it('targets the correct placeholder element', () => {
        const result = asyncSwapScript('myPromise', '<div>resolved</div>');
        expect(result).toContain('[jay-async="myPromise:pending"]');
    });

    // P19: uses replaceWith for DOM swap
    it('uses replaceWith for DOM swap', () => {
        const result = asyncSwapScript('p1', '<span>new</span>');
        expect(result).toContain('replaceWith');
    });

    // P20: handles complex multi-element HTML
    it('handles complex HTML content', () => {
        const html = '<div><h1>Title</h1><p>Content with &amp; entities</p></div>';
        const result = asyncSwapScript('complex', html);
        expect(result).toContain(html.replace(/'/g, "\\'"));
    });

    it('escapes backslashes in HTML', () => {
        const result = asyncSwapScript('p1', '<span>path\\to\\file</span>');
        expect(result).toContain('path\\\\to\\\\file');
    });

    it('triggers hydration callback', () => {
        const result = asyncSwapScript('p1', '<span>x</span>');
        expect(result).toContain('window.__jay.hydrateAsync');
        expect(result).toContain("'p1'");
    });
});
