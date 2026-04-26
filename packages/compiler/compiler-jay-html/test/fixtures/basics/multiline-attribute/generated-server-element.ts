import { type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface MultilineAttributeViewState {
    url: string;
}

export function renderToStream(vs: MultilineAttributeViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<img');
    w(' src="/image.jpg"');
    w(' alt="MICHAEL KORS\nחולצה מכופתרת סלים."');
    w(' />');
    w('<div');
    w(' data-info="line one\nline two\nline three"');
    w('>');
    w('static');
    w('</div>');
    w('</div>');
}
