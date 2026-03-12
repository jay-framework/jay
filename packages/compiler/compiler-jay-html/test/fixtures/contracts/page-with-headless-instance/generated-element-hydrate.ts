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

export interface PageWithHeadlessInstanceElementRefs {}

export type PageWithHeadlessInstanceSlowViewState = {};
export type PageWithHeadlessInstanceFastViewState = {};
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
    '0/product-card:0',
    productCard.contexts,
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithHeadlessInstanceElementPreRender {
    const [refManager, [refAR1]] = ReferencesManager.for(options, [], [], ['aR1'], []);
    const render = (viewState: PageWithHeadlessInstanceViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.pageTitle),
                childCompHydrate(
                    _HeadlessProductCard0,
                    (vs: PageWithHeadlessInstanceViewState) => ({ productId: 'prod-hero' }),
                    '0/product-card:0',
                    refAR1(),
                ),
            ]),
        ) as PageWithHeadlessInstanceElement;
    return [refManager.getPublicAPI() as PageWithHeadlessInstanceElementRefs, render];
}
