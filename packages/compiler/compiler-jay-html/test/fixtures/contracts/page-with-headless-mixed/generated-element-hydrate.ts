import {
    JayElement,
    element as e,
    dynamicText as dt,
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
    hydrateConditional,
} from '@jay-framework/runtime';
import { makeHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import {
    ProductCardViewState,
    ProductCardRefs,
    ProductCardInteractiveViewState,
    ProductCardRepeatedRefs,
} from '../product-card/product-card.jay-contract';
import { productCard } from '../product-card/product-card';

export interface ProductOfPageWithHeadlessMixedViewState {
    _id: string;
}

export interface PageWithHeadlessMixedViewState {
    pageTitle: string;
    showPromo: boolean;
    products: Array<ProductOfPageWithHeadlessMixedViewState>;
}

export interface PageWithHeadlessMixedElementRefs {
    hero: ProductCardRefs;
    promo: ProductCardRefs;
    products: {
        0: ProductCardRepeatedRefs;
    };
}

export type PageWithHeadlessMixedSlowViewState = {};
export type PageWithHeadlessMixedFastViewState = {};
export type PageWithHeadlessMixedInteractiveViewState = PageWithHeadlessMixedViewState;

export type PageWithHeadlessMixedElement = JayElement<
    PageWithHeadlessMixedViewState,
    PageWithHeadlessMixedElementRefs
>;
export type PageWithHeadlessMixedElementRender = RenderElement<
    PageWithHeadlessMixedViewState,
    PageWithHeadlessMixedElementRefs,
    PageWithHeadlessMixedElement
>;
export type PageWithHeadlessMixedElementPreRender = [
    PageWithHeadlessMixedElementRefs,
    PageWithHeadlessMixedElementRender,
];
export type PageWithHeadlessMixedContract = JayContract<
    PageWithHeadlessMixedViewState,
    PageWithHeadlessMixedElementRefs,
    PageWithHeadlessMixedSlowViewState,
    PageWithHeadlessMixedFastViewState,
    PageWithHeadlessMixedInteractiveViewState
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
                adoptText('1', (vs) => vs.price),
                adoptElement('addToCart', {}, [], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0HydrateRender,
    productCard.comp,
    'product-card:hero',
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
            adoptElement('0', {}, [adoptText('1', (vs) => vs.price)]),
        ) as _HeadlessProductCard1Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard1 = makeHeadlessInstanceComponent(
    _headlessProductCard1HydrateRender,
    productCard.comp,
    'product-card:promo',
    productCard.contexts,
);

function _headlessProductCard1Render(
    options?: RenderElementOptions,
): _HeadlessProductCard1ElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'promo' }, [
                e('h3', {}, ['Promo Product']),
                e('span', { class: 'price' }, [dt((vs) => vs.price)]),
            ]),
        ) as _HeadlessProductCard1Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}

const _HeadlessProductCard1Create = makeHeadlessInstanceComponent(
    _headlessProductCard1Render,
    productCard.comp,
    'product-card:promo',
    productCard.contexts,
);

// Hydrate inline template for headless component: product-card #2
type _HeadlessProductCard2Element = JayElement<ProductCardInteractiveViewState, ProductCardRefs>;
type _HeadlessProductCard2ElementRender = RenderElement<
    ProductCardInteractiveViewState,
    ProductCardRefs,
    _HeadlessProductCard2Element
>;
type _HeadlessProductCard2ElementPreRender = [ProductCardRefs, _HeadlessProductCard2ElementRender];

function _headlessProductCard2HydrateRender(
    options?: RenderElementOptions,
): _HeadlessProductCard2ElementPreRender {
    const [refManager, [refAddToCart2]] = ReferencesManager.for(
        options,
        ['add to cart'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('0', {}, [
                adoptText('1', (vs) => vs.price),
                adoptElement('addToCart', {}, [], refAddToCart2()),
            ]),
        ) as _HeadlessProductCard2Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard2 = makeHeadlessInstanceComponent(
    _headlessProductCard2HydrateRender,
    productCard.comp,
    'p1/product-card:0',
    productCard.contexts,
);

// Hydrate inline template for headless component: product-card #3
type _HeadlessProductCard3Element = JayElement<ProductCardInteractiveViewState, ProductCardRefs>;
type _HeadlessProductCard3ElementRender = RenderElement<
    ProductCardInteractiveViewState,
    ProductCardRefs,
    _HeadlessProductCard3Element
>;
type _HeadlessProductCard3ElementPreRender = [ProductCardRefs, _HeadlessProductCard3ElementRender];

function _headlessProductCard3HydrateRender(
    options?: RenderElementOptions,
): _HeadlessProductCard3ElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('0', {}, [adoptText('1', (vs) => vs.price)]),
        ) as _HeadlessProductCard3Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard3 = makeHeadlessInstanceComponent(
    _headlessProductCard3HydrateRender,
    productCard.comp,
    'p2/product-card:0',
    productCard.contexts,
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithHeadlessMixedElementPreRender {
    const [productsRefManager, [ref_0]] = ReferencesManager.for(options, [], [], [], ['0']);
    const [refManager, [refHero, refPromo]] = ReferencesManager.for(
        options,
        [],
        [],
        ['hero', 'promo'],
        [],
        {
            products: productsRefManager,
        },
    );
    const render = (viewState: PageWithHeadlessMixedViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('1', (vs) => vs.pageTitle),
                childCompHydrate(
                    _HeadlessProductCard0,
                    (vs: PageWithHeadlessMixedViewState) => ({ productId: '123' }),
                    'product-card:hero',
                    refHero(),
                ),
                hydrateConditional(
                    (vs) => vs.showPromo,
                    () =>
                        childCompHydrate(
                            _HeadlessProductCard1,
                            (vs: PageWithHeadlessMixedViewState) => ({ productId: 'prod-promo' }),
                            'product-card:promo',
                            refPromo(),
                        ),
                    () =>
                        childComp(
                            _HeadlessProductCard1Create,
                            (vs: PageWithHeadlessMixedViewState) => ({ productId: 'prod-promo' }),
                            refPromo(),
                        ),
                ),
                slowForEachItem<
                    PageWithHeadlessMixedViewState,
                    ProductOfPageWithHeadlessMixedViewState
                >(
                    (vs: PageWithHeadlessMixedViewState) => vs.products,
                    0,
                    'p1',
                    () =>
                        childCompHydrate(
                            _HeadlessProductCard2,
                            (vs1: ProductOfPageWithHeadlessMixedViewState) => ({
                                productId: 'prod-a',
                            }),
                            'p1/product-card:0',
                            ref_0(),
                        ),
                ),
                slowForEachItem<
                    PageWithHeadlessMixedViewState,
                    ProductOfPageWithHeadlessMixedViewState
                >(
                    (vs: PageWithHeadlessMixedViewState) => vs.products,
                    1,
                    'p2',
                    () =>
                        childCompHydrate(
                            _HeadlessProductCard3,
                            (vs1: ProductOfPageWithHeadlessMixedViewState) => ({
                                productId: 'prod-b',
                            }),
                            'p2/product-card:0',
                            ref_0(),
                        ),
                ),
            ]),
        ) as PageWithHeadlessMixedElement;
    return [refManager.getPublicAPI() as PageWithHeadlessMixedElementRefs, render];
}
