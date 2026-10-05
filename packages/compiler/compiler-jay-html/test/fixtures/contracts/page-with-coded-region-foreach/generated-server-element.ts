import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

import { CardViewState } from './card/card.jay-contract';

export interface CardOfPageWithCodedRegionForeachViewState {
    id: string;
    title: string;
}

export interface PageWithCodedRegionForeachViewState {
    pageTitle: string;
    cards: Array<CardOfPageWithCodedRegionForeachViewState>;
}

export function renderToStream(
    vs: PageWithCodedRegionForeachViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<h1');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.pageTitle)));
    w('</h1>');
    for (const vs1 of vs.cards) {
        w('<div');
        w(' class="cards"');
        w(' jay-coordinate="S0/0/1">');
        const vs_card0 = (vs as any).__headlessInstances?.[String(vs1.id) + ',card:richCards'] as
            CardViewState | undefined;
        if (vs_card0) {
            w('<div');
            w(' class="richCards"');
            w(' style="display: contents"');
            w(' jay-coordinate="S2/0">');
            w('<div');
            w(' class="card"');
            w('>');
            w('<h2');
            w(' jay-coordinate="S2/0/0/0">');
            w(escapeHtml(String(vs_card0.heading)));
            w('</h2>');
            w('<button');
            w(' jay-coordinate="S2/0/0/1">');
            w('Action');
            w('</button>');
            w('<div');
            w('>');
            w('Default body');
            w('</div>');
            w('</div>');
            w('</div>');
        }
        w('</div>');
    }
    w('</div>');
}
