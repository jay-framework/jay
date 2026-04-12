import {
    JayElement,
    RenderElement,
    ReferencesManager,
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
} from '../product-card/product-card.jay-contract';
import { productCard } from '../product-card/product-card';

export interface PageWithHeadlessInstanceViewState {
    pageTitle: string;
}

export interface PageWithHeadlessInstanceElementRefs {
    ar0: ProductCardRefs;
}

export type PageWithHeadlessInstanceSlowViewState = {};
export type PageWithHeadlessInstanceFastViewState = PageWithHeadlessInstanceViewState;
export type PageWithHeadlessInstanceInteractiveViewState = PageWithHeadlessInstanceViewState;

export type PageWithHeadlessInstanceElement = JayElement<
    PageWithHeadlessInstanceViewState,
    PageWithHeadlessInstanceElementRefs
>;
export type PageWithHeadlessInstanceElementRender = RenderElement<
    PageWithHeadlessInstanceViewState,
    PageWithHeadlessInstanceElementRefs,
    PageWithHeadlessInstanceElement
>;
export type PageWithHeadlessInstanceElementPreRender = [
    PageWithHeadlessInstanceElementRefs,
    PageWithHeadlessInstanceElementRender,
];
export type PageWithHeadlessInstanceContract = JayContract<
    PageWithHeadlessInstanceViewState,
    PageWithHeadlessInstanceElementRefs,
    PageWithHeadlessInstanceSlowViewState,
    PageWithHeadlessInstanceFastViewState,
    PageWithHeadlessInstanceInteractiveViewState
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
            adoptElement('S1/0', {}, [
                adoptText('S1/0/1', (vs) => vs.price),
                adoptElement('S1/0/2', {}, [], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0HydrateRender,
    productCard,
    'S0/0/product-card:AR0',
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithHeadlessInstanceElementPreRender {
    const [refManager, [refAr0]] = ReferencesManager.for(options, [], [], ['ar0'], []);
    const render = (viewState: PageWithHeadlessInstanceViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                childCompHydrate(
                    _HeadlessProductCard0,
                    (vs: PageWithHeadlessInstanceViewState) => ({ productId: 'prod-hero' }),
                    'S1/0',
                    refAr0(),
                ),
            ]),
        ) as PageWithHeadlessInstanceElement;
    return [refManager.getPublicAPI() as PageWithHeadlessInstanceElementRefs, render];
}
