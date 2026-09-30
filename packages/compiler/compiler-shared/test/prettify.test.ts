import { prettifyHtml } from '../lib';

describe('prettifyHtml', () => {
    it('keeps a space between two words wrapped across source lines', () => {
        // Regression (DL#196 Issue 2): a text node split over two lines used to weld its words together
        // ("validate\nreports" → "validatereports") because the pre-normalizer joined lines with ''.
        const input = `<p>jay-stack validate\nreports them as drift</p>`;
        expect(prettifyHtml(input)).toEqual(`<p>jay-stack validate reports them as drift</p>`);
    });

    it('collapses a blank line between two words to a single space', () => {
        expect(prettifyHtml(`<p>foo\n\nbar</p>`)).toEqual(`<p>foo bar</p>`);
    });

    it('does not insert a space between adjacent elements wrapped across source lines', () => {
        // A boundary touching a tag stays joined — a space there would add significant inline whitespace.
        const input = `<div>\n<h2>Widget A</h2>\n<span class="price">$29.99</span>\n</div>`;
        expect(prettifyHtml(input)).toEqual(
            `<div>\n  <h2>Widget A</h2><span class="price">$29.99</span>\n</div>`,
        );
    });

    it('leaves single-line markup unchanged in word spacing', () => {
        expect(prettifyHtml(`<p>already one line here</p>`)).toEqual(`<p>already one line here</p>`);
    });
});
