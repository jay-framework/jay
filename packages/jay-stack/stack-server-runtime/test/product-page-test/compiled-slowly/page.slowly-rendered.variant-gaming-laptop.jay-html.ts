import {
    JayElement,
    element as e,
    conditional as c,
    dynamicElement as de,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    dynamicAttribute as da,
    booleanAttribute as ba, JayContract,
} from 'jay-runtime';
import {
    ProductPageViewState,
    ProductPageRefs,
} from '../../stores-plugin/compiled/product-page.jay-contract';

export interface PageViewState {
    product: ProductPageViewState;
}

export interface PageElementRefs {
    product: ProductPageRefs;
}

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];
export type PageContract = JayContract<PageViewState, PageElementRefs>

export function render(options?: RenderElementOptions): PageElementPreRender {
    const [pluginRefManager, [addToCart]] = ReferencesManager.for(
        options,
        ['addToCart'],
        [],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        product: pluginRefManager,
    });
    const render = (viewState: PageViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, ['Gaming Laptop']),
                e('div', {}, ['TechBrand']),
                e('div', {}, ['High-performance gaming laptop with latest graphics']),
                de('div', {}, [
                    e('span', {}, ['$1,299.99']),
                    e('span', {}, ['Discount: $1,169.99']),
                ]),
                e('div', {}, ['Best Seller']),
                de(
                    'button',
                    { 'data-id': 'addToCart', disabled: ba((vs) => !vs.product.inStock) },
                    [
                        c(
                            (vs: PageViewState) => vs.product.inStock,
                            () => 'Add to Cart',
                        ),
                        c(
                            (vs: PageViewState) => !vs.product.inStock,
                            () => 'Out of Stock',
                        ),
                    ],
                    addToCart(),
                ),
            ]),
        ) as PageElement;
    return [refManager.getPublicAPI() as PageElementRefs, render];
}
