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

export interface CardOfPageWithForwardedRefMultiViewState {
    heading: string;
}

export interface PageWithForwardedRefMultiViewState {
    pageTitle: string;
    cards: Array<CardOfPageWithForwardedRefMultiViewState>;
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export type CounterRefs<ParentVS> = ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> &
    OnlyEventEmitters<CounterRef<ParentVS>>;

export interface PageWithForwardedRefMultiElementRefs {
    signupCard: {
        cta: CounterRef<PageWithForwardedRefMultiViewState>;
    };
    cards: {
        cards: {
            cta: CounterRefs<CardOfPageWithForwardedRefMultiViewState>;
        };
    };
}

export type PageWithForwardedRefMultiSlowViewState = {};
export type PageWithForwardedRefMultiFastViewState = PageWithForwardedRefMultiViewState;
export type PageWithForwardedRefMultiInteractiveViewState = PageWithForwardedRefMultiViewState;

export type PageWithForwardedRefMultiElement = JayElement<
    PageWithForwardedRefMultiViewState,
    PageWithForwardedRefMultiElementRefs
>;
export type PageWithForwardedRefMultiElementRender = RenderElement<
    PageWithForwardedRefMultiViewState,
    PageWithForwardedRefMultiElementRefs,
    PageWithForwardedRefMultiElement
>;
export type PageWithForwardedRefMultiElementPreRender = [
    PageWithForwardedRefMultiElementRefs,
    PageWithForwardedRefMultiElementRender,
];
export type PageWithForwardedRefMultiContract = JayContract<
    PageWithForwardedRefMultiViewState,
    PageWithForwardedRefMultiElementRefs,
    PageWithForwardedRefMultiSlowViewState,
    PageWithForwardedRefMultiFastViewState,
    PageWithForwardedRefMultiInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithForwardedRefMultiElementPreRender {
    const [signupCardRefManager, [refCta]] = ReferencesManager.for(options, [], [], ['cta'], []);
    const [cardsRefManager2, [refCta2]] = ReferencesManager.for(options, [], [], [], ['cta']);
    const [cardsRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        cards: cardsRefManager2,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        signupCard: signupCardRefManager,
        cards: cardsRefManager,
    });
    const render = (viewState: PageWithForwardedRefMultiViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                adoptElement('S1/0', {}, [
                    adoptText('S1/0/0', (vs) => 'Sign up'),
                    childComp(
                        Counter,
                        (vs: PageWithForwardedRefMultiViewState) => ({ initialValue: 0 }),
                        refCta(),
                    ),
                ]),
                hydrateForEach(
                    (vs: PageWithForwardedRefMultiViewState) => vs.cards,
                    'heading',
                    'S0/0/1',
                    (vs1: CardOfPageWithForwardedRefMultiViewState) => [
                        adoptElement('S3/0', {}, [
                            adoptText('S3/0/0', (vs1) => vs1.heading),
                            childComp(
                                Counter,
                                (vs1: CardOfPageWithForwardedRefMultiViewState) => ({
                                    initialValue: 0,
                                }),
                                refCta2(),
                            ),
                        ]),
                    ],
                    (vs1: CardOfPageWithForwardedRefMultiViewState) => {
                        return e('div', { class: 'cards' }, [
                            e('div', { class: 'card' }, [
                                e('h3', {}, [dt((vs1) => vs1.heading)]),
                                childComp(
                                    Counter,
                                    (vs1: CardOfPageWithForwardedRefMultiViewState) => ({
                                        initialValue: 0,
                                    }),
                                    refCta2(),
                                ),
                            ]),
                        ]);
                    },
                ),
            ]),
        ) as PageWithForwardedRefMultiElement;
    return [refManager.getPublicAPI() as PageWithForwardedRefMultiElementRefs, render];
}
