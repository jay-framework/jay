import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
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
} from '../product-card/product-card.jay-contract';
// @ts-ignore
import { productCard } from '../product-card/product-card';

export interface PageWithHeadlessMultiChildViewState {
    pageTitle: string;
}

export interface PageWithHeadlessMultiChildElementRefs {}

export type PageWithHeadlessMultiChildSlowViewState = {};
export type PageWithHeadlessMultiChildFastViewState = PageWithHeadlessMultiChildViewState;
export type PageWithHeadlessMultiChildInteractiveViewState = PageWithHeadlessMultiChildViewState;

export type PageWithHeadlessMultiChildElement = JayElement<
    PageWithHeadlessMultiChildViewState,
    PageWithHeadlessMultiChildElementRefs
>;
export type PageWithHeadlessMultiChildElementRender = RenderElement<
    PageWithHeadlessMultiChildViewState,
    PageWithHeadlessMultiChildElementRefs,
    PageWithHeadlessMultiChildElement
>;
export type PageWithHeadlessMultiChildElementPreRender = [
    PageWithHeadlessMultiChildElementRefs,
    PageWithHeadlessMultiChildElementRender,
];
export type PageWithHeadlessMultiChildContract = JayContract<
    PageWithHeadlessMultiChildViewState,
    PageWithHeadlessMultiChildElementRefs,
    PageWithHeadlessMultiChildSlowViewState,
    PageWithHeadlessMultiChildFastViewState,
    PageWithHeadlessMultiChildInteractiveViewState
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
            de('div', {}, [
                e('h2', {}, [dt((vs) => vs.name)]),
                e('span', { class: 'price' }, [dt((vs) => vs.price)]),
                e('button', {}, ['Add to Cart'], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}

const _HeadlessProductCard0 = makeHeadlessInstanceComponent(
    _headlessProductCard0Render,
    productCard,
    'product-card:AR0',
);

export function render(options?: RenderElementOptions): PageWithHeadlessMultiChildElementPreRender {
    const [refManager, [refAR1]] = ReferencesManager.for(options, [], [], ['aR1'], []);
    const render = (viewState: PageWithHeadlessMultiChildViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                childComp(
                    _HeadlessProductCard0,
                    (vs: PageWithHeadlessMultiChildViewState) => ({ productId: 'prod-hero' }),
                    refAR1(),
                ),
            ]),
        ) as PageWithHeadlessMultiChildElement;
    return [refManager.getPublicAPI() as PageWithHeadlessMultiChildElementRefs, render];
}
