import {JayElement, element as e, dynamicText as dt, RenderElement, ReferencesManager, dynamicElement as de, forEach, ConstructContext, childComp, RenderElementOptions, MapEventEmitterViewState, OnlyEventEmitters, ComponentCollectionProxy, JayContract} from "@jay-framework/runtime";
import {makeHeadlessInstanceComponent} from "@jay-framework/stack-client-runtime";
import {Counter} from "../../components/counter/counter";
import {CardViewState, CardRefs, CardInteractiveViewState} from "./card/card.jay-contract";

export interface CardOfPageWithForwardedRefMultiViewState {
  heading: string
}

export interface PageWithForwardedRefMultiViewState {
  pageTitle: string,
  cards: Array<CardOfPageWithForwardedRefMultiViewState>
}


export interface PageWithForwardedRefMultiElementRefs {
  signupCard: _HeadlessCard0Refs,
  cards: {
    cards: _HeadlessCard1RepeatedRefs
  }
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export interface _HeadlessCard0Refs {
  cta: CounterRef<CardViewState>
}
export type CounterRefs<ParentVS> =
    ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> &
    OnlyEventEmitters<CounterRef<ParentVS>>

export interface _HeadlessCard1RepeatedRefs {
  cta: CounterRefs<CardViewState>
}

export interface _HeadlessCard1Refs {
  cta: CounterRef<CardViewState>
}

export type PageWithForwardedRefMultiSlowViewState = {};
export type PageWithForwardedRefMultiFastViewState = PageWithForwardedRefMultiViewState;
export type PageWithForwardedRefMultiInteractiveViewState = PageWithForwardedRefMultiViewState;

export type PageWithForwardedRefMultiElement = JayElement<PageWithForwardedRefMultiViewState, PageWithForwardedRefMultiElementRefs>
export type PageWithForwardedRefMultiElementRender = RenderElement<PageWithForwardedRefMultiViewState, PageWithForwardedRefMultiElementRefs, PageWithForwardedRefMultiElement>
export type PageWithForwardedRefMultiElementPreRender = [PageWithForwardedRefMultiElementRefs, PageWithForwardedRefMultiElementRender]
export type PageWithForwardedRefMultiContract = JayContract<
    PageWithForwardedRefMultiViewState,
    PageWithForwardedRefMultiElementRefs,
    PageWithForwardedRefMultiSlowViewState,
    PageWithForwardedRefMultiFastViewState,
    PageWithForwardedRefMultiInteractiveViewState
>;



// Inline template for headless component: card #0
type _HeadlessCard0Element = JayElement<CardInteractiveViewState, _HeadlessCard0Refs>;
type _HeadlessCard0ElementRender = RenderElement<CardInteractiveViewState, _HeadlessCard0Refs, _HeadlessCard0Element>;
type _HeadlessCard0ElementPreRender = [_HeadlessCard0Refs, _HeadlessCard0ElementRender];

function _headlessCard0Render(options?: RenderElementOptions): _HeadlessCard0ElementPreRender {
        const [refManager, [refCta]] =
        ReferencesManager.for(options, [], [], ['cta'], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
e('div', {class: 'card'}, [
e('h3', {}, [dt(vs => vs.heading)]),
childComp(Counter, (vs: CardViewState) => ({initialValue: 0}), refCta())
])
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as _HeadlessCard0Refs, render];
}

const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0Render,
    { comp: (_props, _refs) => ({ render: () => _props, ..._refs }) },
    'S0/0/card:signupCard',
);

// Inline template for headless component: card #1
type _HeadlessCard1Element = JayElement<CardInteractiveViewState, _HeadlessCard1Refs>;
type _HeadlessCard1ElementRender = RenderElement<CardInteractiveViewState, _HeadlessCard1Refs, _HeadlessCard1Element>;
type _HeadlessCard1ElementPreRender = [_HeadlessCard1Refs, _HeadlessCard1ElementRender];

function _headlessCard1Render(options?: RenderElementOptions): _HeadlessCard1ElementPreRender {
        const [refManager, [refCta2]] =
        ReferencesManager.for(options, [], [], ['cta'], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
e('div', {class: 'card'}, [
e('h3', {}, [dt(vs => vs.heading)]),
childComp(Counter, (vs: CardViewState) => ({initialValue: 0}), refCta2())
])
        ) as _HeadlessCard1Element;
    return [refManager.getPublicAPI() as _HeadlessCard1Refs, render];
}

const _HeadlessCard1 = makeHeadlessInstanceComponent(
    _headlessCard1Render,
    { comp: (_props, _refs) => ({ render: () => _props, ..._refs }) },
    (dataIds) => [...dataIds, 'card:cards'].toString(),
);

export function render(options?: RenderElementOptions): PageWithForwardedRefMultiElementPreRender {
    const [cardsRefManager, [refCards]] =
        ReferencesManager.for(options, [], [], [], ['cards']);
    const [refManager, [refSignupCard]] =
        ReferencesManager.for(options, [], [], ['signupCard'], [], {
      cards: cardsRefManager
});    
    const render = (viewState: PageWithForwardedRefMultiViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () => de('div', {}, [
    e('h1', {}, [    dt(vs => vs.pageTitle)]),
    childComp(_HeadlessCard0, (vs: PageWithForwardedRefMultiViewState) => ({heading: 'Sign up', jc: 'card'}), refSignupCard()),
    forEach((vs: PageWithForwardedRefMultiViewState) => vs.cards, (vs1: CardOfPageWithForwardedRefMultiViewState) => {
      return e('div', {class: 'cards'}, [
childComp(_HeadlessCard1, (vs1: CardOfPageWithForwardedRefMultiViewState) => ({heading: vs1.heading, jc: 'card'}), refCards())
      ])}, 'heading')
    ])
    ) as PageWithForwardedRefMultiElement;
    return [refManager.getPublicAPI() as PageWithForwardedRefMultiElementRefs, render];
}