import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    childComp,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import { makeHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import {
    ProductCardViewState,
    ProductCardRefs,
    ProductCardInteractiveViewState,
} from '../product-card/product-card.jay-contract';

export interface ProductOfPageWithHeadlessInForeachViewState {
    _id: string;
}

export interface PageWithHeadlessInForeachViewState {
    pageTitle: string;
    products: Array<ProductOfPageWithHeadlessInForeachViewState>;
}

export interface PageWithHeadlessInForeachElementRefs {}

export type PageWithHeadlessInForeachSlowViewState = {};
export type PageWithHeadlessInForeachFastViewState = {};
export type PageWithHeadlessInForeachInteractiveViewState = PageWithHeadlessInForeachViewState;

export type PageWithHeadlessInForeachElement = JayElement<
    PageWithHeadlessInForeachViewState,
    PageWithHeadlessInForeachElementRefs
>;
export type PageWithHeadlessInForeachElementRender = RenderElement<
    PageWithHeadlessInForeachViewState,
    PageWithHeadlessInForeachElementRefs,
    PageWithHeadlessInForeachElement
>;
export type PageWithHeadlessInForeachElementPreRender = [
    PageWithHeadlessInForeachElementRefs,
    PageWithHeadlessInForeachElementRender,
];
export type PageWithHeadlessInForeachContract = JayContract<
    PageWithHeadlessInForeachViewState,
    PageWithHeadlessInForeachElementRefs,
    PageWithHeadlessInForeachSlowViewState,
    PageWithHeadlessInForeachFastViewState,
    PageWithHeadlessInForeachInteractiveViewState
>;

// Inline template for headless component: product-card #0
type _HeadlessProductCard0Element = JayElement<ProductCardInteractiveViewState, ProductCardRefs>;
type _HeadlessProductCard0ElementRender = RenderElement<
    ProductCardInteractiveViewState,
    ProductCardRefs,
    _HeadlessProductCard0Element
>;
type _HeadlessProductCard0ElementPreRender = [ProductCardRefs, _HeadlessProductCard0ElementRender];

function _headlessProductCard0Render(
    options?: RenderElementOptions,
): _HeadlessProductCard0ElementPreRender {
    const [refManager, [refAddToCart]] = ReferencesManager.for(
        options,
        ['add to cart'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, undefined, () =>
            e('article', { class: 'product-tile' }, [
                e('h2', {}, [dt((vs) => vs.name)]),
                e('span', { class: 'price' }, [dt((vs) => vs.price)]),
                e('button', {}, ['Add to Cart'], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}

const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0Render,
    productCard.comp,
    'product-card:0',
    productCard.contexts,
);

export function render(options?: RenderElementOptions): PageWithHeadlessInForeachElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: PageWithHeadlessInForeachViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                forEach(
                    (vs: PageWithHeadlessInForeachViewState) => vs.products,
                    (vs1: ProductOfPageWithHeadlessInForeachViewState) => {
                        return e('div', { class: 'grid' }, [
                            childComp(
                                _HeadlessProductCard0,
                                (vs1: ProductOfPageWithHeadlessInForeachViewState) => ({
                                    productId: vs1._id,
                                }),
                            ),
                        ]);
                    },
                    '_id',
                ),
            ]),
        ) as PageWithHeadlessInForeachElement;
    return [refManager.getPublicAPI() as PageWithHeadlessInForeachElementRefs, render];
}
