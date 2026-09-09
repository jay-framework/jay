import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

import { ProductCardViewState } from '../product-card/product-card.jay-contract';

export interface PageWithRootHeadlessInstanceViewState {}

export function renderToStream(
    vs: PageWithRootHeadlessInstanceViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    const vs_product_card0 = (vs as any).__headlessInstances?.['S0/0'] as
        ProductCardViewState | undefined;
    if (vs_product_card0) {
        w('<article');
        w(' class="hero-card"');
        w(' jay-coordinate="S0/0/0">');
        w('<h2');
        w(' jay-coordinate="S0/0/0/0">');
        w('Hero Product');
        w('</h2>');
        if (vs_product_card0.price) {
            w('<span');
            w(' class="price"');
            w(' jay-coordinate="S0/0/0/1">');
            w(escapeHtml(String(vs_product_card0.price)));
            w('</span>');
        }
        w('<button');
        w(' jay-coordinate="S0/0/0/2">');
        w('Add to Cart');
        w('</button>');
        w('</article>');
    }
}
