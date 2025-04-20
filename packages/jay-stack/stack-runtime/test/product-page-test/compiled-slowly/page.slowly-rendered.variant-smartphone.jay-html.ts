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
} from "jay-runtime";
import {ProductPageViewState, ProductPageRefs} from "../../stores-plugin/compiled/product-page.jay-contract";

export interface PageViewState {
    product: ProductPageViewState
}


export interface PageElementRefs {
    product: ProductPageRefs
}

export type PageElement = JayElement<PageViewState, PageElementRefs>
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>
export type PageElementPreRender = [PageElementRefs, PageElementRender]


export function render(options?: RenderElementOptions): PageElementPreRender {
    const [pluginRefManager, [addToCart]] =
        ReferencesManager.for(options, ['addToCart'], [], [], []);
    const [refManager, []] =
        ReferencesManager.for(options, [], [], [], [], {plugin: pluginRefManager});
    const render = (viewState: PageViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () => e('div', {}, [
            e('div', {}, [dt(vs => vs.product.name)]),
            e('div', {}, [dt(vs => vs.product.brand)]),
            e('div', {}, [dt(vs => vs.product.description)]),
            de('div', {}, [
                e('div', {}, [dt(vs => vs.product.priceData.formatted.price)]),
                c((vs: PageViewState) => vs.product.hasDiscount, () =>
                    e('span', {}, [dt(vs => `Discount: ${vs.product.priceData.formatted.discountedPrice}`)]))
            ]),
            e('div', {}, [dt(vs => vs.product.ribbon)]),
            de('button', {"data-id": 'addToCart', disabled: ba(vs => !vs.product.inStock)}, [
                c((vs: PageViewState) => vs.product.inStock, () => "Add to Cart"),
                c((vs: PageViewState) => !vs.product.inStock, () => "Out of Stock")
            ], addToCart())
        ])
    ) as PageElement;
    return [refManager.getPublicAPI() as PageElementRefs, render];
}