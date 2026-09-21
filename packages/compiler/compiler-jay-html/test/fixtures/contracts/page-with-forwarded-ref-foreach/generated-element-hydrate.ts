import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    childComp,
    RenderElementOptions,
    MapEventEmitterViewState,
    OnlyEventEmitters,
    ComponentCollectionProxy,
    JayContract,
    adoptText,
    adoptElement,
    hydrateForEach,
    adoptDynamicElement,
} from '@jay-framework/runtime';
import { Counter } from '../../components/counter/counter';

export interface CardOfPageWithForwardedRefForeachViewState {
    heading: string;
}

export interface PageWithForwardedRefForeachViewState {
    pageTitle: string;
    cards: Array<CardOfPageWithForwardedRefForeachViewState>;
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export type CounterRefs<ParentVS> = ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> &
    OnlyEventEmitters<CounterRef<ParentVS>>;

export interface PageWithForwardedRefForeachElementRefs {
    cards: {
        cards: {
            cta: CounterRefs<CardOfPageWithForwardedRefForeachViewState>;
        };
    };
}

export type PageWithForwardedRefForeachSlowViewState = {};
export type PageWithForwardedRefForeachFastViewState = PageWithForwardedRefForeachViewState;
export type PageWithForwardedRefForeachInteractiveViewState = PageWithForwardedRefForeachViewState;

export type PageWithForwardedRefForeachElement = JayElement<
    PageWithForwardedRefForeachViewState,
    PageWithForwardedRefForeachElementRefs
>;
export type PageWithForwardedRefForeachElementRender = RenderElement<
    PageWithForwardedRefForeachViewState,
    PageWithForwardedRefForeachElementRefs,
    PageWithForwardedRefForeachElement
>;
export type PageWithForwardedRefForeachElementPreRender = [
    PageWithForwardedRefForeachElementRefs,
    PageWithForwardedRefForeachElementRender,
];
export type PageWithForwardedRefForeachContract = JayContract<
    PageWithForwardedRefForeachViewState,
    PageWithForwardedRefForeachElementRefs,
    PageWithForwardedRefForeachSlowViewState,
    PageWithForwardedRefForeachFastViewState,
    PageWithForwardedRefForeachInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithForwardedRefForeachElementPreRender {
    const [cardsRefManager2, [refCta]] = ReferencesManager.for(options, [], [], [], ['cta']);
    const [cardsRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        cards: cardsRefManager2,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        cards: cardsRefManager,
    });
    const render = (viewState: PageWithForwardedRefForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                hydrateForEach(
                    (vs: PageWithForwardedRefForeachViewState) => vs.cards,
                    'heading',
                    'S0/0/1',
                    (vs1: CardOfPageWithForwardedRefForeachViewState) => [
                        adoptElement('S2/0', {}, [
                            adoptText('S2/0/0', (vs1) => vs1.heading),
                            childComp(
                                Counter,
                                (vs1: CardOfPageWithForwardedRefForeachViewState) => ({
                                    initialValue: 0,
                                }),
                                refCta(),
                            ),
                        ]),
                    ],
                    (vs1: CardOfPageWithForwardedRefForeachViewState) => {
                        return e('div', { class: 'cards' }, [
                            e('div', { class: 'card' }, [
                                e('h3', {}, [dt((vs1) => vs1.heading)]),
                                childComp(
                                    Counter,
                                    (vs1: CardOfPageWithForwardedRefForeachViewState) => ({
                                        initialValue: 0,
                                    }),
                                    refCta(),
                                ),
                            ]),
                        ]);
                    },
                ),
            ]),
        ) as PageWithForwardedRefForeachElement;
    return [refManager.getPublicAPI() as PageWithForwardedRefForeachElementRefs, render];
}
