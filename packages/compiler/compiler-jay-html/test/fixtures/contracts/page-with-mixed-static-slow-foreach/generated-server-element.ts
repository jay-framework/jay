import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

import { ProductCardViewState } from '../product-card/product-card.jay-contract';

export interface ProductOfPageWithMixedStaticSlowForeachViewState {
    _id: string;
}

export interface PageWithMixedStaticSlowForeachViewState {
    pageTitle: string;
    products: Array<ProductOfPageWithMixedStaticSlowForeachViewState>;
}

export function renderToStream(
    vs: PageWithMixedStaticSlowForeachViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<h1');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.pageTitle)));
    w('</h1>');
    w('<div');
    w(' class="grid"');
    w('>');
    w('<div');
    w(' jay-coordinate="S1/0">');
    w('<span');
    w('>');
    w('Static Item A');
    w('</span>');
    w('</div>');
    w('<div');
    w(' jay-coordinate="S2/0">');
    w('<span');
    w('>');
    w('Static Item B');
    w('</span>');
    w('</div>');
    w('<div');
    w(' jay-coordinate="S3/0">');
    const vs_product_card0 = (vs as any).__headlessInstances?.['S3/0/product-card:AR0'] as
        | ProductCardViewState
        | undefined;
    if (vs_product_card0) {
        w('<article');
        w(' class="card"');
        w(' jay-coordinate="S4/0">');
        w('<h3');
        w('>');
        w('Product C');
        w('</h3>');
        w('<span');
        w(' class="price"');
        w(' jay-coordinate="S4/0/1">');
        w(escapeHtml(String(vs_product_card0.price)));
        w('</span>');
        w('<button');
        w(' jay-coordinate="S4/0/2">');
        w('Add to Cart');
        w('</button>');
        w('</article>');
    }
    w('</div>');
    w('</div>');
    w('</div>');
}
