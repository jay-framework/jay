import {JayElement, element as e, dynamicText as dt, RenderElement, ReferencesManager, dynamicElement as de, forEach, ConstructContext, childComp, RenderElementOptions, MapEventEmitterViewState, OnlyEventEmitters, ComponentCollectionProxy, JayContract} from "@jay-framework/runtime";
import {makeHeadlessInstanceComponent} from "@jay-framework/stack-client-runtime";
import {Counter} from "../../components/counter/counter";
import {CardViewState, CardRefs, CardInteractiveViewState} from "./card/card.jay-contract";

export interface CardOfPageWithOverrideForwardedRefViewState {
  id: string,
  label: string
}

export interface PageWithOverrideForwardedRefViewState {
  pageTitle: string,
  cards: Array<CardOfPageWithOverrideForwardedRefViewState>
}


export interface PageWithOverrideForwardedRefElementRefs {
  signupCard: _HeadlessCard0Refs,
  cards: {
    cards: _HeadlessCard1RepeatedRefs
  }
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export interface _HeadlessCard0Refs {
  cta: CounterRef<PageWithOverrideForwardedRefViewState>
}
export type CounterRefs<ParentVS> =
    ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> &
    OnlyEventEmitters<CounterRef<ParentVS>>

export interface _HeadlessCard1RepeatedRefs {
  cta: CounterRefs<CardOfPageWithOverrideForwardedRefViewState>
}

export interface _HeadlessCard1Refs {
  cta: CounterRef<CardOfPageWithOverrideForwardedRefViewState>
}

export type PageWithOverrideForwardedRefSlowViewState = {};
export type PageWithOverrideForwardedRefFastViewState = PageWithOverrideForwardedRefViewState;
export type PageWithOverrideForwardedRefInteractiveViewState = PageWithOverrideForwardedRefViewState;

export type PageWithOverrideForwardedRefElement = JayElement<PageWithOverrideForwardedRefViewState, PageWithOverrideForwardedRefElementRefs>
export type PageWithOverrideForwardedRefElementRender = RenderElement<PageWithOverrideForwardedRefViewState, PageWithOverrideForwardedRefElementRefs, PageWithOverrideForwardedRefElement>
export type PageWithOverrideForwardedRefElementPreRender = [PageWithOverrideForwardedRefElementRefs, PageWithOverrideForwardedRefElementRender]
export type PageWithOverrideForwardedRefContract = JayContract<
    PageWithOverrideForwardedRefViewState,
    PageWithOverrideForwardedRefElementRefs,
    PageWithOverrideForwardedRefSlowViewState,
    PageWithOverrideForwardedRefFastViewState,
    PageWithOverrideForwardedRefInteractiveViewState
>;



// Inline template for headless component: card #0
type _HeadlessCard0Element = JayElement<CardInteractiveViewState, _HeadlessCard0Refs>;
type _HeadlessCard0ElementRender = RenderElement<CardInteractiveViewState, _HeadlessCard0Refs, _HeadlessCard0Element>;
type _HeadlessCard0ElementPreRender = [_HeadlessCard0Refs, _HeadlessCard0ElementRender];

function _headlessCard0Render(options?: RenderElementOptions): _HeadlessCard0ElementPreRender {
        const [refManager, [refSlot, refCta]] =
        ReferencesManager.for(options, ['slot'], [], ['cta'], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
e('div', {class: 'card'}, [
e('h3', {}, [dt(vs => vs.heading)]),
e('div', {class: 'slot'}, [
childComp(Counter, (vs: CardViewState) => ({initialValue: 0}), refCta(), (vs, _p1) => _p1)
], refSlot())
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
        const [refManager, [refSlot2, refCta2]] =
        ReferencesManager.for(options, ['slot'], [], ['cta'], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
e('div', {class: 'card'}, [
e('h3', {}, [dt(vs => vs.heading)]),
e('div', {class: 'slot'}, [
childComp(Counter, (vs: CardViewState) => ({initialValue: 0}), refCta2(), (vs, _p1) => _p1)
], refSlot2())
])
        ) as _HeadlessCard1Element;
    return [refManager.getPublicAPI() as _HeadlessCard1Refs, render];
}

const _HeadlessCard1 = makeHeadlessInstanceComponent(
    _headlessCard1Render,
    { comp: (_props, _refs) => ({ render: () => _props, ..._refs }) },
    (dataIds) => [...dataIds, 'card:cards'].toString(),
);

export function render(options?: RenderElementOptions): PageWithOverrideForwardedRefElementPreRender {
    const [cardsRefManager, [refCards]] =
        ReferencesManager.for(options, [], [], [], ['cards']);
    const [refManager, [refSignupCard]] =
        ReferencesManager.for(options, [], [], ['signupCard'], [], {
      cards: cardsRefManager
});    
    const render = (viewState: PageWithOverrideForwardedRefViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () => de('div', {}, [
    e('h1', {}, [    dt(vs => vs.pageTitle)]),
    childComp(_HeadlessCard0, (vs: PageWithOverrideForwardedRefViewState) => ({ heading: 'Sign up', jc: 'card', __parentContext: vs }), refSignupCard()),
    forEach((vs: PageWithOverrideForwardedRefViewState) => vs.cards, (vs1: CardOfPageWithOverrideForwardedRefViewState) => {
      return e('ul', {}, [
e('li', {}, [
childComp(_HeadlessCard1, (vs1: CardOfPageWithOverrideForwardedRefViewState) => ({ heading: vs1.label, jc: 'card', __parentContext: vs1 }), refCards())
      ])
      ])}, 'id')
    ])
    ) as PageWithOverrideForwardedRefElement;
    return [refManager.getPublicAPI() as PageWithOverrideForwardedRefElementRefs, render];
}