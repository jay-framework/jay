import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

import { CardViewState } from './card/card.jay-contract';

export interface PageWithTier3SlotViewState {
    pageTitle: string;
}

export function renderToStream(vs: PageWithTier3SlotViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<h1');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.pageTitle)));
    w('</h1>');
    const vs_card0 = (vs as any).__headlessInstances?.['S0/0/card:plainCard'] as
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
        w('Action');
        w('</button>');
        w('<div');
        w('>');
        w('Default body');
        w('</div>');
        w('</div>');
    }
    const vs_card1 = (vs as any).__headlessInstances?.['S0/0/card:richCard'] as
        CardViewState | undefined;
    if (vs_card1) {
        w('<div');
        w(' class="card"');
        w(' jay-coordinate="S2/0">');
        w('<h2');
        w(' jay-coordinate="S2/0/0">');
        w(escapeHtml(String(vs_card1.heading)));
        w('</h2>');
        w('<button');
        w(' jay-coordinate="S2/0/1">');
        w('Action');
        w('</button>');
        w('<button');
        w(' jay-coordinate="S0/0/card:richCard/body/0">');
        w(escapeHtml(String(vs.pageTitle)));
        w('</button>');
        w('</div>');
    }
    w('</div>');
}
