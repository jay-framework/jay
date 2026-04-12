import {
    JayElement,
    RenderElement,
    ReferencesManager,
    slowForEachItem,
    ConstructContext,
    childComp,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    childCompHydrate,
} from '@jay-framework/runtime';
import { makeHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import {
    ProductCardViewState,
    ProductCardRefs,
    ProductCardInteractiveViewState,
    ProductCardRepeatedRefs,
} from '../product-card/product-card.jay-contract';
import { productCard } from '../product-card/product-card';

export interface ProductOfPageWithHeadlessInSlowForeachViewState {
    _id: string;
}

export interface PageWithHeadlessInSlowForeachViewState {
    pageTitle: string;
    products: Array<ProductOfPageWithHeadlessInSlowForeachViewState>;
}

export interface PageWithHeadlessInSlowForeachElementRefs {
    products: {
        ar0: ProductCardRepeatedRefs;
        ar1: ProductCardRepeatedRefs;
    };
}

export type PageWithHeadlessInSlowForeachSlowViewState = {};
export type PageWithHeadlessInSlowForeachFastViewState = PageWithHeadlessInSlowForeachViewState;
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

// Hydrate inline template for headless component: product-card #0
type _HeadlessProductCard0Element = JayElement<ProductCardInteractiveViewState, ProductCardRefs>;
type _HeadlessProductCard0ElementRender = RenderElement<
    ProductCardInteractiveViewState,
    ProductCardRefs,
    _HeadlessProductCard0Element
>;
type _HeadlessProductCard0ElementPreRender = [ProductCardRefs, _HeadlessProductCard0ElementRender];

function _headlessProductCard0HydrateRender(
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
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S2/0', {}, [
                adoptText('S2/0/1', (vs) => vs.price),
                adoptElement('S2/0/2', {}, [], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0HydrateRender,
    productCard,
    'S1/0/product-card:AR0',
);

// Hydrate inline template for headless component: product-card #1
type _HeadlessProductCard1Element = JayElement<ProductCardInteractiveViewState, ProductCardRefs>;
type _HeadlessProductCard1ElementRender = RenderElement<
    ProductCardInteractiveViewState,
    ProductCardRefs,
    _HeadlessProductCard1Element
>;
type _HeadlessProductCard1ElementPreRender = [ProductCardRefs, _HeadlessProductCard1ElementRender];

function _headlessProductCard1HydrateRender(
    options?: RenderElementOptions,
): _HeadlessProductCard1ElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S4/0', {}, [adoptText('S4/0/1', (vs) => vs.price)]),
        ) as _HeadlessProductCard1Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard1 = makeHeadlessInstanceComponent(
    _headlessProductCard1HydrateRender,
    productCard,
    'S3/0/product-card:AR1',
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithHeadlessInSlowForeachElementPreRender {
    const [productsRefManager, [refAr0, refAr1]] = ReferencesManager.for(
        options,
        [],
        [],
        [],
        ['ar0', 'ar1'],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        products: productsRefManager,
    });
    const render = (viewState: PageWithHeadlessInSlowForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                slowForEachItem<
                    PageWithHeadlessInSlowForeachViewState,
                    ProductOfPageWithHeadlessInSlowForeachViewState
                >(
                    (vs: PageWithHeadlessInSlowForeachViewState) => vs.products,
                    0,
                    'p1',
                    () =>
                        childCompHydrate(
                            _HeadlessProductCard0,
                            (vs1: ProductOfPageWithHeadlessInSlowForeachViewState) => ({
                                productId: 'prod-123',
                            }),
                            'S2/0',
                            refAr0(),
                        ),
                ),
                slowForEachItem<
                    PageWithHeadlessInSlowForeachViewState,
                    ProductOfPageWithHeadlessInSlowForeachViewState
                >(
                    (vs: PageWithHeadlessInSlowForeachViewState) => vs.products,
                    1,
                    'p2',
                    () =>
                        childCompHydrate(
                            _HeadlessProductCard1,
                            (vs1: ProductOfPageWithHeadlessInSlowForeachViewState) => ({
                                productId: 'prod-456',
                            }),
                            'S4/0',
                            refAr1(),
                        ),
                ),
            ]),
        ) as PageWithHeadlessInSlowForeachElement;
    return [refManager.getPublicAPI() as PageWithHeadlessInSlowForeachElementRefs, render];
}
