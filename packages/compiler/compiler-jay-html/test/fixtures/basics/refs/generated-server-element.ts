import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface RefsViewState {
    text: string;
}

export function renderToStream(vs: RefsViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="0">');
    w('<div');
    w(' jay-coordinate="ref1">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('<div');
    w(' jay-coordinate="ref">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('<div');
    w('>');
    w('<div');
    w(' jay-coordinate="ref3">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('</div>');
    w('</div>');
}
