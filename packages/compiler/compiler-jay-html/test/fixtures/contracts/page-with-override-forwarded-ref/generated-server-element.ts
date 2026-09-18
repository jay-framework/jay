import {escapeHtml, type ServerRenderContext} from "@jay-framework/ssr-runtime";

import {CardViewState} from "./card/card.jay-contract";

export interface CardOfPageWithOverrideForwardedRefViewState {
  id: string,
  label: string
}

export interface PageWithOverrideForwardedRefViewState {
  pageTitle: string,
  cards: Array<CardOfPageWithOverrideForwardedRefViewState>
}

export function renderToStream(vs: PageWithOverrideForwardedRefViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
          w('<h1');
          w(' jay-coordinate="S0/0/0">');
          w(escapeHtml(String(vs.pageTitle)));
          w('</h1>');
          const vs_card0 = (vs as any).__headlessInstances?.['S0/0/card:signupCard'] as CardViewState | undefined;
          if (vs_card0) {
                w('<div');
                w(' class="card"');
                w(' jay-coordinate="S1/0">');
                      w('<h3');
                      w(' jay-coordinate="S1/0/0">');
                      w(escapeHtml(String(vs_card0.heading)));
                      w('</h3>');
                      w('<div');
                      w(' class="slot"');
                      w(' jay-coordinate="S1/0/1">');
                            w('<jay:Counter');
                            w(' initialValue="0"');
                            w(' jay-from-override=""');
                            w(' jay-coordinate="S1/0/1/0">');
                            w('</jay:Counter>');
                      w('</div>');
                w('</div>');
          }
          for (const vs1 of vs.cards) {
                w('<ul');
                w(' jay-coordinate="S0/0/1">');
                w('<li');
                w(' jay-coordinate="S2/0">');
                      const vs_card1 = (vs as any).__headlessInstances?.[String(vs1.id) + ',card:cards'] as CardViewState | undefined;
                      if (vs_card1) {
                            w('<div');
                            w(' class="card"');
                            w(' jay-coordinate="S3/0">');
                                  w('<h3');
                                  w(' jay-coordinate="S3/0/0">');
                                  w(escapeHtml(String(vs_card1.heading)));
                                  w('</h3>');
                                  w('<div');
                                  w(' class="slot"');
                                  w(' jay-coordinate="S3/0/1">');
                                        w('<jay:Counter');
                                        w(' initialValue="0"');
                                        w(' jay-from-override=""');
                                        w(' jay-coordinate="S3/0/1/0">');
                                        w('</jay:Counter>');
                                  w('</div>');
                            w('</div>');
                      }
                w('</li>');
                w('</ul>');
          }
    w('</div>');
}