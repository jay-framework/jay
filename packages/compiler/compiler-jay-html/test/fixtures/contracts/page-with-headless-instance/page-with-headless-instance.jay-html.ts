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
} from '@jay-framework/runtime';
import { makeJayComponent } from '@jay-framework/component';
import {
    ProductCardViewState,
    ProductCardRefs,
    ProductCardInteractiveViewState
} from '../product-card/product-card.jay-contract';

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

// Inline template for headless component: product-card #0
type _HeadlessProductCard0Element = JayElement<
    ProductCardInteractiveViewState,
    ProductCardRefs
>;
type _HeadlessProductCard0ElementRender = RenderElement<
    ProductCardInteractiveViewState,
    ProductCardRefs,
    _HeadlessProductCard0Element
>;
type _HeadlessProductCard0ElementPreRender = [
    ProductCardRefs,
    _HeadlessProductCard0ElementRender,
];

function _headlessProductCard0Render(options?: RenderElementOptions): _HeadlessProductCard0ElementPreRender {
    const [refManager, [refAddToCart]] = ReferencesManager.for(options, ['add to cart'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, undefined, () =>
            e('article', { class: 'hero-card' }, [
                e('h2', {}, [dt((vs) => vs.name)]),
                e('span', { class: 'price' }, [dt((vs) => vs.price)]),
                e('button', {}, ['Add to Cart'], refAddToCart()),
            ]),
        ) as _HeadlessProductCard0Element;
    return [refManager.getPublicAPI() as ProductCardRefs, render];
}

const _HeadlessProductCard0 = makeJayComponent(
    _headlessProductCard0Render,
    productCard.interactiveConstructor,
);

export function render(options?: RenderElementOptions): PageWithHeadlessInstanceElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: PageWithHeadlessInstanceViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                childComp(_HeadlessProductCard0, (vs: PageWithHeadlessInstanceViewState) => ({
                    productId: 'prod-hero',
                })),
            ]),
        ) as PageWithHeadlessInstanceElement;
    return [refManager.getPublicAPI() as PageWithHeadlessInstanceElementRefs, render];
}
