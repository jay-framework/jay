import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

import { ProductCardViewState } from '../product-card/product-card.jay-contract';

export interface PageWithHeadlessInstanceViewState {
    pageTitle: string;
}

export function renderToStream(
    vs: PageWithHeadlessInstanceViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="0">');
    w('<h1');
    w(' jay-coordinate="0/0">');
    w(escapeHtml(String(vs.pageTitle)));
    w('</h1>');
    const vs_product_card0 = (vs as any).__headlessInstances?.['product-card:0'] as
        | ProductCardViewState
        | undefined;
    if (vs_product_card0) {
        w('<article');
        w(' class="hero-card"');
        w(' jay-coordinate="0/product-card:0/0">');
        w('<h2');
        w(' jay-coordinate="0/product-card:0/0/0">');
        w('Hero Product');
        w('</h2>');
        w('<span');
        w(' class="price"');
        w(' jay-coordinate="0/product-card:0/0/1">');
        w(escapeHtml(String(vs_product_card0.price)));
        w('</span>');
        w('<button');
        w(' jay-coordinate="0/product-card:0/0/2">');
        w('Add to Cart');
        w('</button>');
        w('</article>');
    }
    w('</div>');
}
