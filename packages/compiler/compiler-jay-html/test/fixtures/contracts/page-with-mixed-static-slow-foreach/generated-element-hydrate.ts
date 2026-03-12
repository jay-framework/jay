import {
    JayElement,
    RenderElement,
    ReferencesManager,
    slowForEachItem,
    ConstructContext,
    childComp,
    RenderElementOptions,
    JayContract,
    useContext,
    adoptText,
    adoptElement,
    childCompHydrate,
} from '@jay-framework/runtime';
import {
    makeHeadlessInstanceComponent,
    HEADLESS_INSTANCES,
} from '@jay-framework/stack-client-runtime';
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

export interface PageWithMixedStaticSlowForeachElementRefs {}

export type PageWithMixedStaticSlowForeachSlowViewState = {};
export type PageWithMixedStaticSlowForeachFastViewState = {};
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
    const render = (viewState) => {
        const instanceData = useContext(HEADLESS_INSTANCES);
        const instanceKey = 'p3/product-card:0';
        const instanceVs = instanceData?.viewStates?.[instanceKey] ?? viewState;
        return ConstructContext.withHydrationChildContext(instanceVs, refManager, () =>
            adoptElement('0', {}, [
                adoptText('0/1', (vs) => vs.price),
                adoptElement('0/2', {}, [], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    };
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0HydrateRender,
    productCard.comp,
    'p3/product-card:0',
    productCard.contexts,
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithMixedStaticSlowForeachElementPreRender {
    const [productsRefManager, [refAR1]] = ReferencesManager.for(options, [], [], [], ['aR1']);
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        products: productsRefManager,
    });
    const render = (viewState: PageWithMixedStaticSlowForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.pageTitle),
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
                            'product-card:0',
                            refAR1(),
                        ),
                ),
            ]),
        ) as PageWithMixedStaticSlowForeachElement;
    return [refManager.getPublicAPI() as PageWithMixedStaticSlowForeachElementRefs, render];
}
