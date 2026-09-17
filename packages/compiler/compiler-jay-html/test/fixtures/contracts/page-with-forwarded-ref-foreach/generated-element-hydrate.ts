import {JayElement, element as e, dynamicText as dt, RenderElement, ReferencesManager, ConstructContext, childComp, RenderElementOptions, MapEventEmitterViewState, OnlyEventEmitters, ComponentCollectionProxy, JayContract, adoptText, adoptElement, childCompHydrate, hydrateForEach, adoptDynamicElement} from "@jay-framework/runtime";
import {makeHeadlessInstanceComponent} from "@jay-framework/stack-client-runtime";
import {Counter} from "../../components/counter/counter";
import {CardViewState, CardRefs, CardInteractiveViewState} from "./card/card.jay-contract";

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


export interface _HeadlessCard1RepeatedRefs {
  cta: CounterRefs<CardViewState>
}

export interface _HeadlessCard1Refs {
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



// Hydrate inline template for headless component: card #0
type _HeadlessCard0Element = JayElement<CardInteractiveViewState, _HeadlessCard0Refs>;
type _HeadlessCard0ElementRender = RenderElement<CardInteractiveViewState, _HeadlessCard0Refs, _HeadlessCard0Element>;
type _HeadlessCard0ElementPreRender = [_HeadlessCard0Refs, _HeadlessCard0ElementRender];

function _headlessCard0HydrateRender(options?: RenderElementOptions): _HeadlessCard0ElementPreRender {
        const [refManager, [refCta]] =
        ReferencesManager.for(options, [], [], ['cta'], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement("S2/0", {}, [            adoptText("S2/0/0", vs => vs.heading),
            childComp(Counter, (vs: CardViewState) => ({initialValue: 0}), refCta())])
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as _HeadlessCard0Refs, render];
}
const _HeadlessCard0Adopt = makeHeadlessInstanceComponent(
    _headlessCard0HydrateRender,
    { comp: (_props, _refs) => ({ render: () => _props, ..._refs }) },
    (dataIds) => [...dataIds, 'card:cards'].toString(),
);

// Inline template for headless component: card #1
type _HeadlessCard1Element = JayElement<CardInteractiveViewState, _HeadlessCard1Refs>;
type _HeadlessCard1ElementRender = RenderElement<CardInteractiveViewState, _HeadlessCard1Refs, _HeadlessCard1Element>;
type _HeadlessCard1ElementPreRender = [_HeadlessCard1Refs, _HeadlessCard1ElementRender];

function _headlessCard1Render(options?: RenderElementOptions): _HeadlessCard1ElementPreRender {
        const [refManager, [refCta]] =
        ReferencesManager.for(options, [], [], ['cta'], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
e('div', {class: 'card'}, [
e('h3', {}, [dt(vs => vs.heading)]),
childComp(Counter, (vs: CardViewState) => ({initialValue: 0}), refCta())
])
        ) as _HeadlessCard1Element;
    return [refManager.getPublicAPI() as _HeadlessCard1Refs, render];
}

const _HeadlessCard1 = makeHeadlessInstanceComponent(
    _headlessCard1Render,
    { comp: (_props, _refs) => ({ render: () => _props, ..._refs }) },
    (dataIds) => [...dataIds, 'card:cards'].toString(),
);

export function hydrate(rootElement: Element, options?: RenderElementOptions): PageWithForwardedRefForeachElementPreRender {
    const [cardsRefManager, [refCards]] =
        ReferencesManager.for(options, [], [], [], ['cards']);
    const [refManager, []] =
        ReferencesManager.for(options, [], [], [], [], {
      cards: cardsRefManager
});
    const render = (viewState: PageWithForwardedRefForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
        adoptDynamicElement("S0/0", {}, [
        adoptText("S0/0/0", vs => vs.pageTitle),
        hydrateForEach((vs: PageWithForwardedRefForeachViewState) => vs.cards, 'heading', 'S0/0/1',
            (vs1: CardOfPageWithForwardedRefForeachViewState) => [
            childCompHydrate(_HeadlessCard0Adopt, (vs1: CardOfPageWithForwardedRefForeachViewState) => ({heading: vs1.heading, jc: 'card'}), 'S2/0', refCards()),
            ],
            (vs1: CardOfPageWithForwardedRefForeachViewState) => {
            return e('div', {class: 'cards'}, [        childComp(_HeadlessCard1, (vs1: CardOfPageWithForwardedRefForeachViewState) => ({heading: vs1.heading, jc: 'card'}), refCards())]);
            },
        )
        ])) as PageWithForwardedRefForeachElement;
    return [refManager.getPublicAPI() as PageWithForwardedRefForeachElementRefs, render];
}