import {escapeHtml, type ServerRenderContext} from "@jay-framework/ssr-runtime";

import {CardViewState} from "./card/card.jay-contract";

export interface CardOfPageWithForwardedRefForeachViewState {
  heading: string
}

export interface PageWithForwardedRefForeachViewState {
  pageTitle: string,
  cards: Array<CardOfPageWithForwardedRefForeachViewState>
}

export function renderToStream(vs: PageWithForwardedRefForeachViewState, ctx: ServerRenderContext): void {
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
                const vs_card0 = (vs as any).__headlessInstances?.[String(vs1.heading) + ',card:cards'] as CardViewState | undefined;
                if (vs_card0) {
                      w('<div');
                      w(' class="card"');
                      w(' jay-coordinate="S2/0">');
                            w('<h3');
                            w(' jay-coordinate="S2/0/0">');
                            w(escapeHtml(String(vs_card0.heading)));
                            w('</h3>');
                            w('<jay:Counter');
                            w(' initialValue="0"');
                            w(' jay-coordinate="S2/0/1">');
                            w('</jay:Counter>');
                      w('</div>');
                }
                w('</div>');
          }
    w('</div>');
}