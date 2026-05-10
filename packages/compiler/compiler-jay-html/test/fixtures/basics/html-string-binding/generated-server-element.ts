import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface HtmlStringBindingViewState {
    title: string;
    richContent: string;
}

export function renderToStream(vs: HtmlStringBindingViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<h1');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.title)));
    w('</h1>');
    w('<div');
    w(' class="content"');
    w(' jay-coordinate="S0/0/1">');
    w(String(vs.richContent));
    w('</div>');
    w('</div>');
}
