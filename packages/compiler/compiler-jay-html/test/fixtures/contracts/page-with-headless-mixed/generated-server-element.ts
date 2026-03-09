import { escapeHtml, escapeAttr, type ServerRenderContext } from '@jay-framework/ssr-runtime';

import { ProductCardViewState } from '../product-card/product-card.jay-contract';

export interface ProductOfPageWithHeadlessMixedViewState {
    _id: string;
}

export interface PageWithHeadlessMixedViewState {
    pageTitle: string;
    showPromo: boolean;
    products: Array<ProductOfPageWithHeadlessMixedViewState>;
}

export function renderToStream(vs: PageWithHeadlessMixedViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="0">');
    w('<h1');
    w(' jay-coordinate="1">');
    w(escapeHtml(String(vs.pageTitle)));
    w('</h1>');
    const vs_product_card0 = (vs as any).__headlessInstances?.['product-card:hero'] as
        | ProductCardViewState
        | undefined;
    if (vs_product_card0) {
        w('<article');
        w(' class="hero-card"');
        w(' jay-coordinate="' + 'product-card:hero' + '/0">');
        w('<h2');
        w('>');
        w('Hero Product');
        w('</h2>');
        w('<span');
        w(' class="price"');
        w(' jay-coordinate="' + 'product-card:hero' + '/1">');
        w(escapeHtml(String(vs_product_card0.price)));
        w('</span>');
        w('<button');
        w(' jay-coordinate="' + 'product-card:hero' + '/addToCart">');
        w('Add to Cart');
        w('</button>');
        w('</article>');
    }
    if (vs.showPromo) {
        const vs_product_card1 = (vs as any).__headlessInstances?.['product-card:promo'] as
            | ProductCardViewState
            | undefined;
        if (vs_product_card1) {
            w('<div');
            w(' class="promo"');
            w(' jay-coordinate="' + 'product-card:promo' + '/0">');
            w('<h3');
            w('>');
            w('Promo Product');
            w('</h3>');
            w('<span');
            w(' class="price"');
            w(' jay-coordinate="' + 'product-card:promo' + '/1">');
            w(escapeHtml(String(vs_product_card1.price)));
            w('</span>');
            w('</div>');
        }
    }
    w('<div');
    w(' class="grid"');
    w('>');
    w('<div');
    w('>');
    const vs_product_card2 = (vs as any).__headlessInstances?.['p1/product-card:0'] as
        | ProductCardViewState
        | undefined;
    if (vs_product_card2) {
        w('<article');
        w(' class="card-a"');
        w(' jay-coordinate="' + 'p1/product-card:0' + '/0">');
        w('<h2');
        w('>');
        w('Product A');
        w('</h2>');
        w('<span');
        w(' class="price"');
        w(' jay-coordinate="' + 'p1/product-card:0' + '/1">');
        w(escapeHtml(String(vs_product_card2.price)));
        w('</span>');
        w('<button');
        w(' jay-coordinate="' + 'p1/product-card:0' + '/addToCart">');
        w('Add to Cart');
        w('</button>');
        w('</article>');
    }
    w('</div>');
    w('<div');
    w('>');
    const vs_product_card3 = (vs as any).__headlessInstances?.['p2/product-card:0'] as
        | ProductCardViewState
        | undefined;
    if (vs_product_card3) {
        w('<article');
        w(' class="card-b"');
        w(' jay-coordinate="' + 'p2/product-card:0' + '/0">');
        w('<h3');
        w('>');
        w('Product B');
        w('</h3>');
        w('<span');
        w(' class="price"');
        w(' jay-coordinate="' + 'p2/product-card:0' + '/1">');
        w(escapeHtml(String(vs_product_card3.price)));
        w('</span>');
        w('</article>');
    }
    w('</div>');
    w('</div>');
    w('</div>');
}
