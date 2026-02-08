import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    slowForEachItem,
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

export interface ProductOfPageWithHeadlessInSlowForeachViewState {
    _id: string;
}

export interface PageWithHeadlessInSlowForeachViewState {
    pageTitle: string;
    products: Array<ProductOfPageWithHeadlessInSlowForeachViewState>;
}

export interface PageWithHeadlessInSlowForeachElementRefs {}

export type PageWithHeadlessInSlowForeachSlowViewState = {};
export type PageWithHeadlessInSlowForeachFastViewState = {};
export type PageWithHeadlessInSlowForeachInteractiveViewState =
    PageWithHeadlessInSlowForeachViewState;

export type PageWithHeadlessInSlowForeachElement = JayElement<
    PageWithHeadlessInSlowForeachViewState,
    PageWithHeadlessInSlowForeachElementRefs
>;
export type PageWithHeadlessInSlowForeachElementRender = RenderElement<
    PageWithHeadlessInSlowForeachViewState,
    PageWithHeadlessInSlowForeachElementRefs,
    PageWithHeadlessInSlowForeachElement
>;
export type PageWithHeadlessInSlowForeachElementPreRender = [
    PageWithHeadlessInSlowForeachElementRefs,
    PageWithHeadlessInSlowForeachElementRender,
];
export type PageWithHeadlessInSlowForeachContract = JayContract<
    PageWithHeadlessInSlowForeachViewState,
    PageWithHeadlessInSlowForeachElementRefs,
    PageWithHeadlessInSlowForeachSlowViewState,
    PageWithHeadlessInSlowForeachFastViewState,
    PageWithHeadlessInSlowForeachInteractiveViewState
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
            e('article', { class: 'hero-card' }, [
                e('h2', {}, ['Product A']),
                e('span', { class: 'price' }, [dt((vs) => vs.price)]),
                e('button', {}, ['Add to Cart'], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}

const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0Render,
    productCard.comp,
    'p1/product-card:0',
    productCard.contexts,
);

// Inline template for headless component: product-card #1
type _HeadlessProductCard1Element = JayElement<ProductCardInteractiveViewState, ProductCardRefs>;
type _HeadlessProductCard1ElementRender = RenderElement<
    ProductCardInteractiveViewState,
    ProductCardRefs,
    _HeadlessProductCard1Element
>;
type _HeadlessProductCard1ElementPreRender = [ProductCardRefs, _HeadlessProductCard1ElementRender];

function _headlessProductCard1Render(
    options?: RenderElementOptions,
): _HeadlessProductCard1ElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, undefined, () =>
            e('article', { class: 'compact-card' }, [
                e('h3', {}, ['Product B']),
                e('span', { class: 'price' }, [dt((vs) => vs.price)]),
            ]),
        ) as _HeadlessProductCard1Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}

const _HeadlessProductCard1 = makeHeadlessInstanceComponent(
    _headlessProductCard1Render,
    productCard.comp,
    'p2/product-card:0',
    productCard.contexts,
);

export function render(
    options?: RenderElementOptions,
): PageWithHeadlessInSlowForeachElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: PageWithHeadlessInSlowForeachViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                de('div', { class: 'grid' }, [
                    slowForEachItem<
                        PageWithHeadlessInSlowForeachViewState,
                        ProductOfPageWithHeadlessInSlowForeachViewState
                    >(
                        (vs: PageWithHeadlessInSlowForeachViewState) => vs.products,
                        0,
                        'p1',
                        () =>
                            e('div', {}, [
                                childComp(
                                    _HeadlessProductCard0,
                                    (vs1: ProductOfPageWithHeadlessInSlowForeachViewState) => ({
                                        productId: 'prod-123',
                                    }),
                                ),
                            ]),
                    ),
                    slowForEachItem<
                        PageWithHeadlessInSlowForeachViewState,
                        ProductOfPageWithHeadlessInSlowForeachViewState
                    >(
                        (vs: PageWithHeadlessInSlowForeachViewState) => vs.products,
                        1,
                        'p2',
                        () =>
                            e('div', {}, [
                                childComp(
                                    _HeadlessProductCard1,
                                    (vs1: ProductOfPageWithHeadlessInSlowForeachViewState) => ({
                                        productId: 'prod-456',
                                    }),
                                ),
                            ]),
                    ),
                ]),
            ]),
        ) as PageWithHeadlessInSlowForeachElement;
    return [refManager.getPublicAPI() as PageWithHeadlessInSlowForeachElementRefs, render];
}
