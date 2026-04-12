import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface RefsViewState {
    text: string;
}

export function renderToStream(vs: RefsViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<div');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('<div');
    w(' jay-coordinate="S0/0/1">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('<div');
    w('>');
    w('<div');
    w(' jay-coordinate="S0/0/2/0">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('</div>');
    w('</div>');
}
