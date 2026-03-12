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
            adoptElement('0', {}, [
                adoptText('0/1', (vs) => vs.price),
                adoptElement('0/2', {}, [], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0HydrateRender,
    productCard.comp,
    'p1/product-card:0',
    productCard.contexts,
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
            adoptElement('0', {}, [adoptText('0/1', (vs) => vs.price)]),
        ) as _HeadlessProductCard1Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard1 = makeHeadlessInstanceComponent(
    _headlessProductCard1HydrateRender,
    productCard.comp,
    'p2/product-card:0',
    productCard.contexts,
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithHeadlessInSlowForeachElementPreRender {
    const [productsRefManager, [refAR1, refAR2]] = ReferencesManager.for(
        options,
        [],
        [],
        [],
        ['aR1', 'aR2'],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        products: productsRefManager,
    });
    const render = (viewState: PageWithHeadlessInSlowForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.pageTitle),
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
                            'p1/product-card:0',
                            refAR1(),
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
                            'p2/product-card:0',
                            refAR2(),
                        ),
                ),
            ]),
        ) as PageWithHeadlessInSlowForeachElement;
    return [refManager.getPublicAPI() as PageWithHeadlessInSlowForeachElementRefs, render];
}
