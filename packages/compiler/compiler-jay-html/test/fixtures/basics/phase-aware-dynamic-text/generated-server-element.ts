import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface PhaseAwareDynamicTextViewState {
    title: string;
    fastCount: number;
    interactiveCount: number;
}

export function renderToStream(vs: PhaseAwareDynamicTextViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="0">');
    w('<h1');
    w('>');
    w(escapeHtml(String(vs.title)));
    w('</h1>');
    w('<p');
    w('>');
    w(escapeHtml(String(`Fast Count: ${vs.fastCount}`)));
    w('</p>');
    w('<p');
    w(' jay-coordinate="0/2">');
    w(escapeHtml(String(`Interactive Count: ${vs.interactiveCount}`)));
    w('</p>');
    w('<span');
    w('>');
    w('Static text stays');
    w('</span>');
    w('</div>');
}
