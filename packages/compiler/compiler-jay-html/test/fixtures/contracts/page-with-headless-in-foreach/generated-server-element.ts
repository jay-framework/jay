import { escapeHtml, escapeAttr, type ServerRenderContext } from '@jay-framework/ssr-runtime';

import { ProductCardViewState } from '../product-card/product-card.jay-contract';

export interface ProductOfPageWithHeadlessInForeachViewState {
    _id: string;
}

export interface PageWithHeadlessInForeachViewState {
    pageTitle: string;
    products: Array<ProductOfPageWithHeadlessInForeachViewState>;
}

export function renderToStream(
    vs: PageWithHeadlessInForeachViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="0">');
    w('<h1');
    w(' jay-coordinate="1">');
    w(escapeHtml(String(vs.pageTitle)));
    w('</h1>');
    for (const vs1 of vs.products) {
        w('<div');
        w(' class="grid"');
        w(' jay-coordinate="' + escapeAttr(String(vs1._id)) + '">');
        const vs_product_card0 = (vs as any).__headlessInstances?.[
            escapeAttr(String(vs1._id)) + ',product-card:0'
        ] as ProductCardViewState | undefined;
        if (vs_product_card0) {
            w('<article');
            w(' class="product-tile"');
            w('>');
            w('<h2');
            w(' jay-coordinate="' + escapeAttr(String(vs1._id)) + '/product-card:0' + '/0">');
            w(escapeHtml(String(vs_product_card0.name)));
            w('</h2>');
            w('<span');
            w(' class="price"');
            w(' jay-coordinate="' + escapeAttr(String(vs1._id)) + '/product-card:0' + '/1">');
            w(escapeHtml(String(vs_product_card0.price)));
            w('</span>');
            w('<button');
            w(
                ' jay-coordinate="' +
                    escapeAttr(String(vs1._id)) +
                    '/product-card:0' +
                    '/addToCart">',
            );
            w('Add to Cart');
            w('</button>');
            w('</article>');
        }
        w('</div>');
    }
    w('</div>');
}
