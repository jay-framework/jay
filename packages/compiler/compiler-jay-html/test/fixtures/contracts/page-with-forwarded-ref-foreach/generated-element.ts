import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    childComp,
    RenderElementOptions,
    MapEventEmitterViewState,
    OnlyEventEmitters,
    ComponentCollectionProxy,
    JayContract,
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

export function render(
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
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                forEach(
                    (vs: PageWithForwardedRefForeachViewState) => vs.cards,
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
                    'heading',
                ),
            ]),
        ) as PageWithForwardedRefForeachElement;
    return [refManager.getPublicAPI() as PageWithForwardedRefForeachElementRefs, render];
}
