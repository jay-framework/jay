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
            adoptElement('S4/0', {}, [
                adoptText('S4/0/1', (vs) => vs.price),
                adoptElement('S4/0/2', {}, [], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0HydrateRender,
    productCard,
    'S3/0/product-card:AR0',
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithMixedStaticSlowForeachElementPreRender {
    const [productsRefManager, [refAr0]] = ReferencesManager.for(options, [], [], [], ['ar0']);
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        products: productsRefManager,
    });
    const render = (viewState: PageWithMixedStaticSlowForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                slowForEachItem<
                    PageWithMixedStaticSlowForeachViewState,
                    ProductOfPageWithMixedStaticSlowForeachViewState
                >(
                    (vs: PageWithMixedStaticSlowForeachViewState) => vs.products,
                    2,
                    'p3',
                    () =>
                        childCompHydrate(
                            _HeadlessProductCard0,
                            (vs1: ProductOfPageWithMixedStaticSlowForeachViewState) => ({
                                productId: 'prod-c',
                            }),
                            'S4/0',
                            refAr0(),
                        ),
                ),
            ]),
        ) as PageWithMixedStaticSlowForeachElement;
    return [refManager.getPublicAPI() as PageWithMixedStaticSlowForeachElementRefs, render];
}
