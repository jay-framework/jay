import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

// @ts-ignore
import { CardViewState } from './card/card.jay-contract';

export interface PageWithOverrideParentBindingViewState {
    itemName: string;
}

export function renderToStream(
    vs: PageWithOverrideParentBindingViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<h1');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.itemName)));
    w('</h1>');
    const vs_card0 = (vs as any).__headlessInstances?.['S0/0/card:AR0'] as
        CardViewState | undefined;
    if (vs_card0) {
        w('<div');
        w(' class="card"');
        w(' jay-coordinate="S1/0">');
        w('<h2');
        w(' jay-coordinate="S1/0/0">');
        w(escapeHtml(String(vs_card0.heading)));
        w('</h2>');
        w('<button');
        w(' jay-coordinate="S1/0/1">');
        w(escapeHtml(String(`Start ${vs.itemName} trial`)));
        w('</button>');
        w('<p');
        w(' jay-coordinate="S1/0/2">');
        w('Default disclaimer text');
        w('</p>');
        w('</div>');
    }
    w('</div>');
}
