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
    booleanAttribute as ba,
    JayContract,
} from '@jay-framework/runtime';
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
export type PageContract = JayContract<PageViewState, PageElementRefs>;

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
                e('div', {}, ['Smartphone Pro']),
                e('div', {}, ['TechBrand']),
                e('div', {}, ['Premium smartphone with advanced features']),
                de('div', {}, [
                    e('span', {}, ['$799.50']),
                    c(
                        (vs: PageViewState) => vs.product.hasDiscount,
                        () => e('span', {}, ['Discount: $799.50']),
                    ),
                ]),
                e('div', {}, ['New']),
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
