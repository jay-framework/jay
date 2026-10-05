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
        expect(prettifyHtml(`<p>already one line here</p>`)).toEqual(
            `<p>already one line here</p>`,
        );
    });

    // DL#208: whitespace-significant YAML script bodies must round-trip verbatim through prettify.
    // Extract the inner text of a <script type="application/<type>"> block from prettified output.
    const extractScriptBody = (html: string, type: string): string => {
        const re = new RegExp(
            `<script\\b[^>]*\\btype\\s*=\\s*["']application/${type}["'][^>]*>([\\s\\S]*?)<\\/script\\s*>`,
            'i',
        );
        const match = re.exec(html);
        if (!match) throw new Error(`no application/${type} script found`);
        return match[1];
    };

    it('preserves a multi-key application/jay-headless body byte-for-byte', () => {
        const body = `\ncontentDir: content/templates\nfile: data.yaml\n`;
        const input = `<html><head><script type="application/jay-headless" key="templates">${body}</script></head><body><div>hi</div></body></html>`;
        expect(extractScriptBody(prettifyHtml(input), 'jay-headless')).toEqual(body);
    });

    it('preserves a multi-key application/jay-params body byte-for-byte', () => {
        const body = `\nparam1: value1\nparam2: value2\n`;
        const input = `<html><head><script type="application/jay-params">${body}</script></head><body><div>hi</div></body></html>`;
        expect(extractScriptBody(prettifyHtml(input), 'jay-params')).toEqual(body);
    });

    it('preserves a nested application/jay-validations suppression byte-for-byte', () => {
        const body = `\nsome-rule:\n  no-lcp-image: false\n`;
        const input = `<html><head><script type="application/jay-validations">${body}</script></head><body><div>hi</div></body></html>`;
        expect(extractScriptBody(prettifyHtml(input), 'jay-validations')).toEqual(body);
    });

    it('preserves multiple distinct protected blocks in one document', () => {
        const headless = `\ncontentDir: content/templates\nfile: data.yaml\n`;
        const params = `\nparam1: value1\nparam2: value2\n`;
        const validations = `\nsome-rule:\n  no-lcp-image: false\n`;
        const yaml = `\nkey1: a\nkey2:\n  nested: b\n`;
        const input =
            `<html><head>` +
            `<script type="application/jay-headless" key="templates">${headless}</script>` +
            `<script type="application/jay-params">${params}</script>` +
            `<script type="application/jay-validations">${validations}</script>` +
            `<script type="application/yaml">${yaml}</script>` +
            `</head><body><p>page content wraps here</p></body></html>`;
        const out = prettifyHtml(input);
        expect(extractScriptBody(out, 'jay-headless')).toEqual(headless);
        expect(extractScriptBody(out, 'jay-params')).toEqual(params);
        expect(extractScriptBody(out, 'jay-validations')).toEqual(validations);
        expect(extractScriptBody(out, 'yaml')).toEqual(yaml);
    });

    it('fully prettifies HTML around protected blocks while preserving their bodies', () => {
        const input = `<html>
<head>
<script type="application/jay-headless" key="templates">
contentDir: content/templates
file: data.yaml
</script>
<script type="application/jay-params">
param1: value1
param2: value2
</script>
<script type="application/jay-validations">
some-rule:
  no-lcp-image: false
</script>
</head>
<body><p>page content wraps here</p></body>
</html>`;
        const expected = `<html>

<head>
  <script type="application/jay-headless" key="templates">
contentDir: content/templates
file: data.yaml
</script>
  <script type="application/jay-params">
param1: value1
param2: value2
</script>
  <script type="application/jay-validations">
some-rule:
  no-lcp-image: false
</script>
</head>

<body>
  <p>page content wraps here</p>
</body>

</html>`;
        expect(prettifyHtml(input)).toEqual(expected);
    });

    it('leaves a single-key YAML body intact', () => {
        const body = `\ncontentDir: content/docs/developer\n`;
        const input = `<html><head><script type="application/jay-headless">${body}</script></head><body><div>ok</div></body></html>`;
        expect(extractScriptBody(prettifyHtml(input), 'jay-headless')).toEqual(body);
    });
});
