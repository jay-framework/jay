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
    adoptText,
    adoptElement,
    childCompHydrate,
    hydrateConditional,
    adoptDynamicElement,
} from '@jay-framework/runtime';
import { makeHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import {
    ProductCardViewState,
    ProductCardRefs,
    ProductCardInteractiveViewState,
} from '../product-card/product-card.jay-contract';
import { productCard } from '../product-card/product-card';

export interface PageWithRootHeadlessInstanceViewState {}

export interface PageWithRootHeadlessInstanceElementRefs {}

export type PageWithRootHeadlessInstanceSlowViewState = {};
export type PageWithRootHeadlessInstanceFastViewState = PageWithRootHeadlessInstanceViewState;
export type PageWithRootHeadlessInstanceInteractiveViewState =
    PageWithRootHeadlessInstanceViewState;

export type PageWithRootHeadlessInstanceElement = JayElement<
    PageWithRootHeadlessInstanceViewState,
    PageWithRootHeadlessInstanceElementRefs
>;
export type PageWithRootHeadlessInstanceElementRender = RenderElement<
    PageWithRootHeadlessInstanceViewState,
    PageWithRootHeadlessInstanceElementRefs,
    PageWithRootHeadlessInstanceElement
>;
export type PageWithRootHeadlessInstanceElementPreRender = [
    PageWithRootHeadlessInstanceElementRefs,
    PageWithRootHeadlessInstanceElementRender,
];
export type PageWithRootHeadlessInstanceContract = JayContract<
    PageWithRootHeadlessInstanceViewState,
    PageWithRootHeadlessInstanceElementRefs,
    PageWithRootHeadlessInstanceSlowViewState,
    PageWithRootHeadlessInstanceFastViewState,
    PageWithRootHeadlessInstanceInteractiveViewState
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
            adoptDynamicElement('S0/0/0', {}, [
                adoptElement('S0/0/0/0', {}, []),
                hydrateConditional(
                    (vs) => vs.price,
                    () => adoptText('S0/0/0/1', (vs) => vs.price),
                    () => e('span', { class: 'price' }, [dt((vs) => vs.price)]),
                ),
                adoptElement('S0/0/0/2', {}, [], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}
const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0HydrateRender,
    productCard,
    'S0/0',
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithRootHeadlessInstanceElementPreRender {
    const [refManager, [refAR1]] = ReferencesManager.for(options, [], [], ['aR1'], []);
    const render = (viewState: PageWithRootHeadlessInstanceViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            childCompHydrate(
                _HeadlessProductCard0,
                (vs: PageWithRootHeadlessInstanceViewState) => ({ productId: 'prod-hero' }),
                undefined,
                refAR1(),
            ),
        ) as PageWithRootHeadlessInstanceElement;
    return [refManager.getPublicAPI() as PageWithRootHeadlessInstanceElementRefs, render];
}
