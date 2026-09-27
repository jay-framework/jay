import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    childComp,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    childCompHydrate,
    hydrateForEach,
    adoptDynamicElement,
} from '@jay-framework/runtime';
import { makeHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import {
    CardViewState,
    CardRefs,
    CardInteractiveViewState,
    CardRepeatedRefs,
} from './card/card.jay-contract';
import { card } from './card/card';

export interface CardOfPageWithTier3SlotForeachViewState {
    id: string;
    title: string;
}

export interface PageWithTier3SlotForeachViewState {
    pageTitle: string;
    cards: Array<CardOfPageWithTier3SlotForeachViewState>;
}

export interface PageWithTier3SlotForeachElementRefs {
    cards: {
        richCards: CardRepeatedRefs;
    };
}

export type PageWithTier3SlotForeachSlowViewState = {};
export type PageWithTier3SlotForeachFastViewState = PageWithTier3SlotForeachViewState;
export type PageWithTier3SlotForeachInteractiveViewState = PageWithTier3SlotForeachViewState;

export type PageWithTier3SlotForeachElement = JayElement<
    PageWithTier3SlotForeachViewState,
    PageWithTier3SlotForeachElementRefs
>;
export type PageWithTier3SlotForeachElementRender = RenderElement<
    PageWithTier3SlotForeachViewState,
    PageWithTier3SlotForeachElementRefs,
    PageWithTier3SlotForeachElement
>;
export type PageWithTier3SlotForeachElementPreRender = [
    PageWithTier3SlotForeachElementRefs,
    PageWithTier3SlotForeachElementRender,
];
export type PageWithTier3SlotForeachContract = JayContract<
    PageWithTier3SlotForeachViewState,
    PageWithTier3SlotForeachElementRefs,
    PageWithTier3SlotForeachSlowViewState,
    PageWithTier3SlotForeachFastViewState,
    PageWithTier3SlotForeachInteractiveViewState
>;

// Hydrate inline template for headless component: card #0
type _HeadlessCard0Element = JayElement<CardInteractiveViewState, CardRefs>;
type _HeadlessCard0ElementRender = RenderElement<
    CardInteractiveViewState,
    CardRefs,
    _HeadlessCard0Element
>;
type _HeadlessCard0ElementPreRender = [CardRefs, _HeadlessCard0ElementRender];

function _headlessCard0HydrateRender(
    options?: RenderElementOptions,
): _HeadlessCard0ElementPreRender {
    const [refManager, [refCardAction]] = ReferencesManager.for(
        options,
        ['cardAction'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S2/0', {}, [
                adoptText('S2/0/0', (vs) => vs.heading),
                adoptElement('S2/0/1', {}, [], refCardAction()),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}
const _HeadlessCard0Adopt = makeHeadlessInstanceComponent(
    _headlessCard0HydrateRender,
    card,
    (dataIds) => [...dataIds, 'card:richCards'].toString(),
);

// Inline template for headless component: card #1
type _HeadlessCard1Element = JayElement<CardInteractiveViewState, CardRefs>;
type _HeadlessCard1ElementRender = RenderElement<
    CardInteractiveViewState,
    CardRefs,
    _HeadlessCard1Element
>;
type _HeadlessCard1ElementPreRender = [CardRefs, _HeadlessCard1ElementRender];

function _headlessCard1Render(options?: RenderElementOptions): _HeadlessCard1ElementPreRender {
    const [refManager, [refCardAction]] = ReferencesManager.for(
        options,
        ['cardAction'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'card' }, [
                e('h2', {}, [dt((vs) => vs.heading)]),
                e('button', {}, ['Action'], refCardAction()),
                e('div', {}, ['Default body']),
            ]),
        ) as _HeadlessCard1Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}

const _HeadlessCard1 = makeHeadlessInstanceComponent(_headlessCard1Render, card, (dataIds) =>
    [...dataIds, 'card:richCards'].toString(),
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithTier3SlotForeachElementPreRender {
    const [cardsRefManager, [refRichCards]] = ReferencesManager.for(
        options,
        [],
        [],
        [],
        ['richCards'],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        cards: cardsRefManager,
    });
    const render = (viewState: PageWithTier3SlotForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                hydrateForEach(
                    (vs: PageWithTier3SlotForeachViewState) => vs.cards,
                    'id',
                    'S0/0/1',
                    (vs1: CardOfPageWithTier3SlotForeachViewState) => [
                        childCompHydrate(
                            _HeadlessCard0Adopt,
                            (vs1: CardOfPageWithTier3SlotForeachViewState) => ({
                                heading: vs1.title,
                            }),
                            'S2/0',
                            refRichCards(),
                        ),
                    ],
                    (vs1: CardOfPageWithTier3SlotForeachViewState) => {
                        return e('div', { class: 'cards' }, [
                            childComp(
                                _HeadlessCard1,
                                (vs1: CardOfPageWithTier3SlotForeachViewState) => ({
                                    heading: vs1.title,
                                }),
                                refRichCards(),
                            ),
                        ]);
                    },
                ),
            ]),
        ) as PageWithTier3SlotForeachElement;
    return [refManager.getPublicAPI() as PageWithTier3SlotForeachElementRefs, render];
}
