import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface SimpleDynamicTextViewState {
    s1: string;
}

export function renderToStream(vs: SimpleDynamicTextViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="0">');
    w(escapeHtml(String(vs.s1)));
    w('</div>');
}
