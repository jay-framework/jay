import { escapeHtml, escapeAttr, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface AttributesViewState {
    text: string;
    text2: string;
    text3: string;
    bool1: boolean;
    color: string;
}

export function renderToStream(vs: AttributesViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="0">');
    w('<div');
    w(' style="background: red;"');
    w(' jay-coordinate="1">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('<div');
    w(' data-attribute="a value"');
    w('>');
    w('static');
    w('</div>');
    w('<input');
    w(' value="some value"');
    w('>');
    w('<input');
    w(' id="abc"');
    w(' value="' + escapeAttr(String(vs.text2)) + '"');
    w(' jay-coordinate="2">');
    w('<input');
    w(' type="checkbox"');
    w(' checked="' + escapeAttr(String(vs.bool1)) + '"');
    w(' value="' + escapeAttr(String(vs.text2)) + '"');
    w(' jay-coordinate="3">');
    w('<label');
    w(' for="abc"');
    w('>');
    w('</label>');
    w('<div');
    w(' class="main second"');
    w(' jay-coordinate="4">');
    w(escapeHtml(String(vs.text3)));
    w('</div>');
    w('<div');
    w(' class="' + escapeAttr(String(`${vs.bool1 ? 'main' : ''}`)) + '"');
    w(' jay-coordinate="5">');
    w(escapeHtml(String(vs.text3)));
    w('</div>');
    w('<div');
    w(' class="' + escapeAttr(String(`${vs.bool1 ? 'main' : 'second'}`)) + '"');
    w(' jay-coordinate="6">');
    w(escapeHtml(String(vs.text3)));
    w('</div>');
    w('<div');
    w(
        ' class="' +
            escapeAttr(
                String(
                    `first-class ${vs.bool1 ? 'main' : 'second'} ${!vs.bool1 ? 'third' : 'forth'}`,
                ),
            ) +
            '"',
    );
    w(' jay-coordinate="7">');
    w(escapeHtml(String(vs.text3)));
    w('</div>');
    w('<div');
    w(' data-attribute="' + escapeAttr(String(vs.text)) + '"');
    w(' jay-coordinate="8">');
    w('</div>');
    w('<div');
    w(' data-attribute="' + escapeAttr(String(`${vs.text}-abcd`)) + '"');
    w(' jay-coordinate="9">');
    w('</div>');
    w('<div');
    w(' data-attribute="' + escapeAttr(String(`abcd-${vs.text}`)) + '"');
    w(' jay-coordinate="10">');
    w('</div>');
    w('<div');
    w(' data-attribute="' + escapeAttr(String(`abcd-${vs.text}-abcd`)) + '"');
    w(' jay-coordinate="11">');
    w('</div>');
    w('<button');
    if (vs.bool1) {
        w(' disabled');
    }
    w(' jay-coordinate="12">');
    w('</button>');
    w('<button');
    if (!vs.bool1) {
        w(' disabled');
    }
    w(' jay-coordinate="13">');
    w('</button>');
    w('<button');
    w(' disabled');
    w('>');
    w('</button>');
    w('<img');
    w(' src="/image.jpg"');
    w(' alt="Peat\'s Beast- PX finish- 54.1%"');
    w('>');
    w('</div>');
}
