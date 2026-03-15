import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    childComp,
    RenderElementOptions,
    JayContract,
    useContext,
    currentConstructionContext,
    adoptText,
    adoptElement,
    childCompHydrate,
    hydrateForEach,
    adoptDynamicElement,
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
        const instanceKey =
            (currentConstructionContext()?.dataIds ?? []).join(',') + ',product-card:0';
        const instanceVs = instanceData?.viewStates?.[instanceKey] ?? viewState;
        return ConstructContext.withHydrationChildContext(instanceVs, refManager, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.name),
                adoptText('0/1', (vs) => vs.price),
                adoptElement('0/2', {}, [], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    };
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard0Adopt = makeHeadlessInstanceComponent(
    _headlessProductCard0HydrateRender,
    productCard,
    (dataIds) => dataIds.join(','),
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
    const [refManager, [refAddToCart]] = ReferencesManager.for(
        options,
        ['add to cart'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('article', { class: 'product-tile' }, [
                e('h2', {}, [dt((vs) => vs.name)]),
                e('span', { class: 'price' }, [dt((vs) => vs.price)]),
                e('button', {}, ['Add to Cart'], refAddToCart()),
            ]),
        ) as _HeadlessProductCard1Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}

const _HeadlessProductCard1 = makeHeadlessInstanceComponent(
    _headlessProductCard1Render,
    productCard,
    (dataIds) => [...dataIds, 'product-card:0'].toString(),
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithHeadlessInForeachElementPreRender {
    const [productsRefManager, [refAR1]] = ReferencesManager.for(options, [], [], [], ['aR1']);
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        products: productsRefManager,
    });
    const render = (viewState: PageWithHeadlessInForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('0', {}, [
                adoptText('0/0', (vs) => vs.pageTitle),
                hydrateForEach(
                    (vs: PageWithHeadlessInForeachViewState) => vs.products,
                    '_id',
                    () => [
                        childCompHydrate(
                            _HeadlessProductCard0Adopt,
                            (vs1: ProductOfPageWithHeadlessInForeachViewState) => ({
                                productId: vs1._id,
                            }),
                            'product-card:0',
                            refAR1(),
                        ),
                    ],
                    (vs1: ProductOfPageWithHeadlessInForeachViewState) => {
                        return e('div', { class: 'grid' }, [
                            childComp(
                                _HeadlessProductCard1,
                                (vs1: ProductOfPageWithHeadlessInForeachViewState) => ({
                                    productId: vs1._id,
                                }),
                                refAR1(),
                            ),
                        ]);
                    },
                ),
            ]),
        ) as PageWithHeadlessInForeachElement;
    return [refManager.getPublicAPI() as PageWithHeadlessInForeachElementRefs, render];
}
