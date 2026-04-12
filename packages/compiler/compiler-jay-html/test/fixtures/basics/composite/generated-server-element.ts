import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface CompositeViewState {
    text: string;
    text2: string;
}

export function renderToStream(vs: CompositeViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<div');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.text)));
    w('</div>');
    w('<div');
    w('>');
    w('static');
    w('</div>');
    w('<div');
    w(' jay-coordinate="S0/0/2">');
    w(escapeHtml(String(vs.text2)));
    w('</div>');
    w('</div>');
}
