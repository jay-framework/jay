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
    ProductCardRepeatedRefs,
} from '../product-card/product-card.jay-contract';
import { productCard } from '../product-card/product-card';

export interface ProductOfPageWithMixedStaticSlowForeachViewState {
    _id: string;
}

export interface PageWithMixedStaticSlowForeachViewState {
    pageTitle: string;
    products: Array<ProductOfPageWithMixedStaticSlowForeachViewState>;
}

export interface PageWithMixedStaticSlowForeachElementRefs {
    products: {
        ar0: ProductCardRepeatedRefs;
    };
}

export type PageWithMixedStaticSlowForeachSlowViewState = {};
export type PageWithMixedStaticSlowForeachFastViewState = PageWithMixedStaticSlowForeachViewState;
export type PageWithMixedStaticSlowForeachInteractiveViewState =
    PageWithMixedStaticSlowForeachViewState;

export type PageWithMixedStaticSlowForeachElement = JayElement<
    PageWithMixedStaticSlowForeachViewState,
    PageWithMixedStaticSlowForeachElementRefs
>;
export type PageWithMixedStaticSlowForeachElementRender = RenderElement<
    PageWithMixedStaticSlowForeachViewState,
    PageWithMixedStaticSlowForeachElementRefs,
    PageWithMixedStaticSlowForeachElement
>;
export type PageWithMixedStaticSlowForeachElementPreRender = [
    PageWithMixedStaticSlowForeachElementRefs,
    PageWithMixedStaticSlowForeachElementRender,
];
export type PageWithMixedStaticSlowForeachContract = JayContract<
    PageWithMixedStaticSlowForeachViewState,
    PageWithMixedStaticSlowForeachElementRefs,
    PageWithMixedStaticSlowForeachSlowViewState,
    PageWithMixedStaticSlowForeachFastViewState,
    PageWithMixedStaticSlowForeachInteractiveViewState
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
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('article', { class: 'card' }, [
                e('h3', {}, ['Product C']),
                e('span', { class: 'price' }, [dt((vs) => vs.price)]),
                e('button', {}, ['Add to Cart'], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}

const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0Render,
    productCard,
    'S3/0/product-card:AR0',
);

export function render(
    options?: RenderElementOptions,
): PageWithMixedStaticSlowForeachElementPreRender {
    const [productsRefManager, [refAr0]] = ReferencesManager.for(options, [], [], [], ['ar0']);
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        products: productsRefManager,
    });
    const render = (viewState: PageWithMixedStaticSlowForeachViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                de('div', { class: 'grid' }, [
                    slowForEachItem<
                        PageWithMixedStaticSlowForeachViewState,
                        ProductOfPageWithMixedStaticSlowForeachViewState
                    >(
                        (vs: PageWithMixedStaticSlowForeachViewState) => vs.products,
                        0,
                        'p1',
                        () => e('div', {}, [e('span', {}, ['Static Item A'])]),
                    ),
                    slowForEachItem<
                        PageWithMixedStaticSlowForeachViewState,
                        ProductOfPageWithMixedStaticSlowForeachViewState
                    >(
                        (vs: PageWithMixedStaticSlowForeachViewState) => vs.products,
                        1,
                        'p2',
                        () => e('div', {}, [e('span', {}, ['Static Item B'])]),
                    ),
                    slowForEachItem<
                        PageWithMixedStaticSlowForeachViewState,
                        ProductOfPageWithMixedStaticSlowForeachViewState
                    >(
                        (vs: PageWithMixedStaticSlowForeachViewState) => vs.products,
                        2,
                        'p3',
                        () =>
                            e('div', {}, [
                                childComp(
                                    _HeadlessProductCard0,
                                    (vs1: ProductOfPageWithMixedStaticSlowForeachViewState) => ({
                                        productId: 'prod-c',
                                    }),
                                    refAr0(),
                                ),
                            ]),
                    ),
                ]),
            ]),
        ) as PageWithMixedStaticSlowForeachElement;
    return [refManager.getPublicAPI() as PageWithMixedStaticSlowForeachElementRefs, render];
}
