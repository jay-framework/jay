import {JayElement, element as e, dynamicText as dt, RenderElement, ReferencesManager, ConstructContext, childComp, RenderElementOptions, JayContract} from "@jay-framework/runtime";
import {makeHeadlessInstanceComponent} from "@jay-framework/stack-client-runtime";
import {CardViewState, CardRefs, CardInteractiveViewState} from "./card/card.jay-contract";
import {card} from "./card/card";

export interface PageWithTier3SlotViewState {
  pageTitle: string
}


export interface PageWithTier3SlotElementRefs {
  plainCard: CardRefs,
  richCard: CardRefs
}

export type PageWithTier3SlotSlowViewState = {};
export type PageWithTier3SlotFastViewState = PageWithTier3SlotViewState;
export type PageWithTier3SlotInteractiveViewState = PageWithTier3SlotViewState;

export type PageWithTier3SlotElement = JayElement<PageWithTier3SlotViewState, PageWithTier3SlotElementRefs>
export type PageWithTier3SlotElementRender = RenderElement<PageWithTier3SlotViewState, PageWithTier3SlotElementRefs, PageWithTier3SlotElement>
export type PageWithTier3SlotElementPreRender = [PageWithTier3SlotElementRefs, PageWithTier3SlotElementRender]
export type PageWithTier3SlotContract = JayContract<
    PageWithTier3SlotViewState,
    PageWithTier3SlotElementRefs,
    PageWithTier3SlotSlowViewState,
    PageWithTier3SlotFastViewState,
    PageWithTier3SlotInteractiveViewState
>;



// Inline template for headless component: card #0
type _HeadlessCard0Element = JayElement<CardInteractiveViewState, CardRefs>;
type _HeadlessCard0ElementRender = RenderElement<CardInteractiveViewState, CardRefs, _HeadlessCard0Element>;
type _HeadlessCard0ElementPreRender = [CardRefs, _HeadlessCard0ElementRender];

function _headlessCard0Render(options?: RenderElementOptions): _HeadlessCard0ElementPreRender {
        const [refManager, [refCardAction]] =
        ReferencesManager.for(options, ['cardAction'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
e('div', {class: 'card'}, [
e('h2', {}, [dt(vs => vs.heading)]),
e('button', {}, ['Action'], refCardAction()),
e('div', {}, ['Default body'])
])
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}

const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0Render,
    card,
    'S0/0/card:plainCard',
);

// Inline template for headless component: card #1
type _HeadlessCard1Element = JayElement<CardInteractiveViewState, CardRefs>;
type _HeadlessCard1ElementRender = RenderElement<CardInteractiveViewState, CardRefs, _HeadlessCard1Element>;
type _HeadlessCard1ElementPreRender = [CardRefs, _HeadlessCard1ElementRender];

function _headlessCard1Render(options?: RenderElementOptions): _HeadlessCard1ElementPreRender {
        const [refManager, [refCardAction]] =
        ReferencesManager.for(options, ['cardAction'], [], [], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
e('div', {class: 'card'}, [
e('h2', {}, [dt(vs => vs.heading)]),
e('button', {}, ['Action'], refCardAction()),
e('div', {}, ['Default body'])
])
        ) as _HeadlessCard1Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}

const _HeadlessCard1 = makeHeadlessInstanceComponent(
    _headlessCard1Render,
    card,
    'S0/0/card:richCard',
);

export function render(options?: RenderElementOptions): PageWithTier3SlotElementPreRender {
    const [refManager, [refPlainCard, refRichCard]] =
        ReferencesManager.for(options, [], [], ['plainCard', 'richCard'], []);
    const render = (viewState: PageWithTier3SlotViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () => e('div', {}, [
    e('h1', {}, [    dt(vs => vs.pageTitle)]),
    childComp(_HeadlessCard0, (vs: PageWithTier3SlotViewState) => ({heading: 'Plain'}), refPlainCard()),
    childComp(_HeadlessCard1, (vs: PageWithTier3SlotViewState) => ({heading: 'Rich'}), refRichCard())
    ])
    ) as PageWithTier3SlotElement;
    return [refManager.getPublicAPI() as PageWithTier3SlotElementRefs, render];
}