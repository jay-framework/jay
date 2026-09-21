import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    childComp,
    RenderElementOptions,
    MapEventEmitterViewState,
    OnlyEventEmitters,
    ComponentCollectionProxy,
    JayContract,
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

export function render(
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
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                e('div', { class: 'card' }, [
                    e('h3', {}, [dt((vs) => 'Sign up')]),
                    e(
                        'div',
                        { class: 'slot' },
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
                forEach(
                    (vs: PageWithOverrideForwardedRefViewState) => vs.cards,
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
                    'id',
                ),
            ]),
        ) as PageWithOverrideForwardedRefElement;
    return [refManager.getPublicAPI() as PageWithOverrideForwardedRefElementRefs, render];
}
