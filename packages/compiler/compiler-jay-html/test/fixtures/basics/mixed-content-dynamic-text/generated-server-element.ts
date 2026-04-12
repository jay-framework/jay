import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface MixedContentDynamicTextViewState {
    count: number;
}

export function renderToStream(
    vs: MixedContentDynamicTextViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w(escapeHtml(String(`Count: ${vs.count} `)));
    w('<button');
    w('>');
    w('+');
    w('</button>');
    w('</div>');
}
