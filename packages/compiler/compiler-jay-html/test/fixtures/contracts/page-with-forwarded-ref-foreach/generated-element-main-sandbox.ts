import {JayElement, element as e, dynamicText as dt, RenderElement, ReferencesManager, dynamicElement as de, forEach, ConstructContext, childComp, RenderElementOptions, MapEventEmitterViewState, OnlyEventEmitters, ComponentCollectionProxy, JayContract} from "@jay-framework/runtime";
import {secureChildComp} from "@jay-framework/secure";
import {makeHeadlessInstanceComponent} from "@jay-framework/stack-client-runtime";
// @ts-ignore
import {Counter} from "../../components/counter/counter?jay-mainSandbox";
// @ts-ignore
import {CardViewState, CardRefs, CardInteractiveViewState} from "./card/card.jay-contract?jay-mainSandbox";

export interface CardOfPageWithForwardedRefForeachViewState {
  heading: string
}

export interface PageWithForwardedRefForeachViewState {
  pageTitle: string,
  cards: Array<CardOfPageWithForwardedRefForeachViewState>
}


export interface PageWithForwardedRefForeachElementRefs {
  cards: {
    cards: _HeadlessCard0RepeatedRefs
  }
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export type CounterRefs<ParentVS> =
    ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> &
    OnlyEventEmitters<CounterRef<ParentVS>>

export interface _HeadlessCard0RepeatedRefs {
  cta: CounterRefs<CardViewState>
}

export interface _HeadlessCard0Refs {
  cta: CounterRef<CardViewState>
}

export type PageWithForwardedRefForeachSlowViewState = {};
export type PageWithForwardedRefForeachFastViewState = PageWithForwardedRefForeachViewState;
export type PageWithForwardedRefForeachInteractiveViewState = PageWithForwardedRefForeachViewState;

export type PageWithForwardedRefForeachElement = JayElement<PageWithForwardedRefForeachViewState, PageWithForwardedRefForeachElementRefs>
export type PageWithForwardedRefForeachElementRender = RenderElement<PageWithForwardedRefForeachViewState, PageWithForwardedRefForeachElementRefs, PageWithForwardedRefForeachElement>
export type PageWithForwardedRefForeachElementPreRender = [PageWithForwardedRefForeachElementRefs, PageWithForwardedRefForeachElementRender]
export type PageWithForwardedRefForeachContract = JayContract<
    PageWithForwardedRefForeachViewState,
    PageWithForwardedRefForeachElementRefs,
    PageWithForwardedRefForeachSlowViewState,
    PageWithForwardedRefForeachFastViewState,
    PageWithForwardedRefForeachInteractiveViewState
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
secureChildComp(Counter, (vs: CardViewState) => ({initialValue: 0}), refCta())
])
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as _HeadlessCard0Refs, render];
}

const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0Render,
    { comp: (_props, _refs) => ({ render: () => _props, ..._refs }) },
    (dataIds) => [...dataIds, 'card:cards'].toString(),
);

export function render(options?: RenderElementOptions): PageWithForwardedRefForeachElementPreRender {
    const [cardsRefManager, [refCards]] =
        ReferencesManager.for(options, [], [], [], ['cards']);
    const [refManager, []] =
        ReferencesManager.for(options, [], [], [], [], {
      cards: cardsRefManager
});    
    const render = (viewState: PageWithForwardedRefForeachViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () => de('div', {}, [
    e('h1', {}, [    dt(vs => vs.pageTitle)]),
    forEach((vs: PageWithForwardedRefForeachViewState) => vs.cards, (vs1: CardOfPageWithForwardedRefForeachViewState) => {
      return e('div', {class: 'cards'}, [
childComp(_HeadlessCard0, (vs1: CardOfPageWithForwardedRefForeachViewState) => ({heading: vs1.heading, jc: 'card'}), refCards())
      ])}, 'heading')
    ])
    ) as PageWithForwardedRefForeachElement;
    return [refManager.getPublicAPI() as PageWithForwardedRefForeachElementRefs, render];
}