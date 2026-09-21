import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
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

export interface CardOfPageWithOverrideForwardedRefViewState {
    id: string;
    label: string;
}

export interface PageWithOverrideForwardedRefViewState {
    pageTitle: string;
    cards: Array<CardOfPageWithOverrideForwardedRefViewState>;
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export type CounterRefs<ParentVS> = ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> &
    OnlyEventEmitters<CounterRef<ParentVS>>;

export interface PageWithOverrideForwardedRefElementRefs {
    signupCard: {
        cta: CounterRef<PageWithOverrideForwardedRefViewState>;
        slot: HTMLElementProxy<PageWithOverrideForwardedRefViewState, HTMLDivElement>;
    };
    cards: {
        cards: {
            cta: CounterRefs<CardOfPageWithOverrideForwardedRefViewState>;
            slot: HTMLElementCollectionProxy<
                CardOfPageWithOverrideForwardedRefViewState,
                HTMLDivElement
            >;
        };
    };
}

export type PageWithOverrideForwardedRefSlowViewState = {};
export type PageWithOverrideForwardedRefFastViewState = PageWithOverrideForwardedRefViewState;
export type PageWithOverrideForwardedRefInteractiveViewState =
    PageWithOverrideForwardedRefViewState;

export type PageWithOverrideForwardedRefElement = JayElement<
    PageWithOverrideForwardedRefViewState,
    PageWithOverrideForwardedRefElementRefs
>;
export type PageWithOverrideForwardedRefElementRender = RenderElement<
    PageWithOverrideForwardedRefViewState,
    PageWithOverrideForwardedRefElementRefs,
    PageWithOverrideForwardedRefElement
>;
export type PageWithOverrideForwardedRefElementPreRender = [
    PageWithOverrideForwardedRefElementRefs,
    PageWithOverrideForwardedRefElementRender,
];
export type PageWithOverrideForwardedRefContract = JayContract<
    PageWithOverrideForwardedRefViewState,
    PageWithOverrideForwardedRefElementRefs,
    PageWithOverrideForwardedRefSlowViewState,
    PageWithOverrideForwardedRefFastViewState,
    PageWithOverrideForwardedRefInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithOverrideForwardedRefElementPreRender {
    const [signupCardRefManager, [refSlot, refCta]] = ReferencesManager.for(
        options,
        ['slot'],
        [],
        ['cta'],
        [],
    );
    const [cardsRefManager2, [refSlot2, refCta2]] = ReferencesManager.for(
        options,
        [],
        ['slot'],
        [],
        ['cta'],
    );
    const [cardsRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        cards: cardsRefManager2,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        signupCard: signupCardRefManager,
        cards: cardsRefManager,
    });
    const render = (viewState: PageWithOverrideForwardedRefViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                adoptElement('S1/0', {}, [
                    adoptText('S1/0/0', (vs) => 'Sign up'),
                    adoptElement(
                        'S1/0/1',
                        {},
                        [
                            childComp(
                                Counter,
                                (vs: PageWithOverrideForwardedRefViewState) => ({
                                    initialValue: 0,
                                }),
                                refCta(),
                            ),
                        ],
                        refSlot(),
                    ),
                ]),
                hydrateForEach(
                    (vs: PageWithOverrideForwardedRefViewState) => vs.cards,
                    'id',
                    'S0/0/1',
                    (vs1: CardOfPageWithOverrideForwardedRefViewState) => [
                        adoptElement('S3/0', {}, [
                            adoptText('S3/0/0', (vs1) => vs1.label),
                            adoptElement(
                                'S3/0/1',
                                {},
                                [
                                    childComp(
                                        Counter,
                                        (vs1: CardOfPageWithOverrideForwardedRefViewState) => ({
                                            initialValue: 0,
                                        }),
                                        refCta2(),
                                    ),
                                ],
                                refSlot2(),
                            ),
                        ]),
                    ],
                    (vs1: CardOfPageWithOverrideForwardedRefViewState) => {
                        return e('ul', {}, [
                            e('li', {}, [
                                e('div', { class: 'card' }, [
                                    e('h3', {}, [dt((vs1) => vs1.label)]),
                                    e(
                                        'div',
                                        { class: 'slot' },
                                        [
                                            childComp(
                                                Counter,
                                                (
                                                    vs1: CardOfPageWithOverrideForwardedRefViewState,
                                                ) => ({ initialValue: 0 }),
                                                refCta2(),
                                            ),
                                        ],
                                        refSlot2(),
                                    ),
                                ]),
                            ]),
                        ]);
                    },
                ),
            ]),
        ) as PageWithOverrideForwardedRefElement;
    return [refManager.getPublicAPI() as PageWithOverrideForwardedRefElementRefs, render];
}
