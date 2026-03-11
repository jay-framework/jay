import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

import { ProductCardViewState } from '../product-card/product-card.jay-contract';

export interface ProductOfPageWithHeadlessInSlowForeachViewState {
    _id: string;
}

export interface PageWithHeadlessInSlowForeachViewState {
    pageTitle: string;
    products: Array<ProductOfPageWithHeadlessInSlowForeachViewState>;
}

export function renderToStream(
    vs: PageWithHeadlessInSlowForeachViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="0">');
    w('<h1');
    w(' jay-coordinate="0/0">');
    w(escapeHtml(String(vs.pageTitle)));
    w('</h1>');
    w('<div');
    w(' class="grid"');
    w(' jay-coordinate="0/1">');
    w('<div');
    w(' jay-coordinate="p1">');
    const vs_product_card0 = (vs as any).__headlessInstances?.['p1/product-card:0'] as
        | ProductCardViewState
        | undefined;
    if (vs_product_card0) {
        w('<article');
        w(' class="hero-card"');
        w(' jay-coordinate="p1/product-card:0/0">');
        w('<h2');
        w(' jay-coordinate="p1/product-card:0/0/0">');
        w('Product A');
        w('</h2>');
        w('<span');
        w(' class="price"');
        w(' jay-coordinate="p1/product-card:0/0/1">');
        w(escapeHtml(String(vs_product_card0.price)));
        w('</span>');
        w('<button');
        w(' jay-coordinate="p1/product-card:0/0/2">');
        w('Add to Cart');
        w('</button>');
        w('</article>');
    }
    w('</div>');
    w('<div');
    w(' jay-coordinate="p2">');
    const vs_product_card1 = (vs as any).__headlessInstances?.['p2/product-card:0'] as
        | ProductCardViewState
        | undefined;
    if (vs_product_card1) {
        w('<article');
        w(' class="compact-card"');
        w(' jay-coordinate="p2/product-card:0/0">');
        w('<h3');
        w(' jay-coordinate="p2/product-card:0/0/0">');
        w('Product B');
        w('</h3>');
        w('<span');
        w(' class="price"');
        w(' jay-coordinate="p2/product-card:0/0/1">');
        w(escapeHtml(String(vs_product_card1.price)));
        w('</span>');
        w('</article>');
    }
    w('</div>');
    w('</div>');
    w('</div>');
}
