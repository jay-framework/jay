import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface PageWithOverrideUnwrapParentBindingViewState {
    itemName: string;
}

export function renderToStream(
    vs: PageWithOverrideUnwrapParentBindingViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<h1');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.itemName)));
    w('</h1>');
    w('<div');
    w(' class="card"');
    w('>');
    w('<h2');
    w('>');
    w('Premium');
    w('</h2>');
    w('<button');
    w(' jay-coordinate="S0/0/1/1">');
    w(escapeHtml(String(`Start ${vs.itemName} trial`)));
    w('</button>');
    w('</div>');
    w('</div>');
}
